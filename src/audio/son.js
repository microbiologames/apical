/* ---------------------------------------------------------------------------
   Le moteur sonore. Ambient / liquid drum and bass, sans echantillon.

   Tout est synthetise a l'execution — pas un octet de son dans le depot, pour
   la meme raison qu'il n'y a pas de build : on doit pouvoir changer une
   sonorite en changeant un chiffre, pas en regravant un fichier.

   TROIS IDEES PORTENT LE RESTE.

   1. SIX VOIX, TOUJOURS LES MEMES. Drone, nappe, cloche, basse, break,
      texture. Le moteur ne connait aucune ambiance : il pose ces six roles et
      c'est `src/data/son-presets.js` qui dit ce qu'on entend. Symetrique de
      la palette, et pour le meme motif — deux tables qui divergent finissent
      par ne plus decrire le meme objet.

   2. LE CONTEXTE EST LE JEU, PAS UN CURSEUR. Quatre grandeurs seulement, et
      ce sont celles que la simulation sait deja produire :
        echelle      0 = l'apex sous l'objectif, 1 = la colonie entiere ;
        croissance   ce que fait la pointe — exocytoses, vitesse d'extension ;
        densite      l'occupation du substrat, donc ce qui s'epuise ;
        miseAuPoint  le flou, exactement celui du pont entre les echelles.
      Aucune autre entree. Un moteur qui accepte douze signaux finit par etre
      pilote au hasard.

   3. LE BREAK N'EXISTE PAS EN BAS. A l'echelle ou une exocytose dure 0,85 s
      et ou l'apex avance de 194 nm par fusion, une mesure ne veut rien dire ;
      la batterie monte donc avec `echelle` et il ne reste, en bas, que le
      drone, les gouttes et le souffle. C'est le seul endroit ou le son dit la
      meme chose que le rendu : on change d'objectif, pas de sujet.

   Le graphe, une fois pour toutes :

     voix --> filtre --> gain --> [duck] --> pan --+--> sec ------------+
                                                   +--> envoi reverbe --|--> convolveur --+
                                                   +--> envoi echo -----|--> ping-pong ---+
                                                                        v                 |
                                       souffle ----------------------> mix <--------------+
                                                                        |
                                            chorus (largeur) ---------> mix
                                                                        v
                                        compresseur -> saturation -> couleur -> master
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, mulberry32 } from '../core/util.js';
import {
  PRESETS, RACKS, VOIX, GAMMES, BREAKS, PAS_PAR_MESURE, MESURES,
  CHAMPS, CHAMPS_PAR_GENRE, decoderCode,
} from '../data/son-presets.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const cents = (c) => Math.pow(2, c / 1200);

/* Les voix TENUES passent par le ducking ; les autres non. Une caisse claire
   qui se duckerait elle-meme n'aurait plus d'attaque. */
const TENUES = new Set(['drone', 'nappe', 'basse']);

/**
 * La reponse de chaque voix au contexte. C'est ecrit ici et pas dans les
 * donnees : ce n'est pas un gout, c'est la regle du jeu. Le rack ne regle
 * que la PART de cette reponse qu'une voix suit (`suivi`).
 */
const COUCHES = {
  drone: () => 1,
  nappe: (c) => 0.35 + 0.65 * c.croissance,
  cloche: (c) => 0.2 + 0.8 * c.croissance,
  basse: (c) => 0.15 + 0.85 * c.echelle,
  /* Le break entre entre 0,25 et 0,7 d'echelle — la ou le fondu du pont fait
     son travail — et suit ensuite la croissance. */
  break: (c) => smoothstep(0.25, 0.7, c.echelle) * (0.35 + 0.65 * c.croissance),
  texture: (c) => 1 - 0.6 * c.echelle,
};

/* ---------------------------------------------------------------- outils --- */

/**
 * Une reponse impulsionnelle fabriquee, jamais chargee.
 *
 * NORMALISEE EN ENERGIE, et c'est indispensable : sans cela une queue de 15 s
 * porte vingt fois plus de matiere qu'une de 1,8 s, et tourner le bouton
 * « taille de la salle » revient a tourner le volume general.
 */
function fabriquerIR(ctx, duree, couleur, graine = 7) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * duree));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  /* L'attaque de la queue : 12 ms de montee. A zero, la premiere image de
     bruit claque et on entend un « tss » a chaque note. */
  const montee = Math.max(1, ctx.sampleRate * 0.012);
  const a = 0.05 + couleur * 0.85;          // passe-bas a un pole : la couleur
  let energie = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(graine + c * 7919);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += a * ((rnd() * 2 - 1) - lp);
      const t = i / n;
      d[i] = lp * Math.pow(1 - t, 2.4) * Math.min(1, i / montee);
      energie += d[i] * d[i];
    }
  }
  const g = 0.6 / Math.sqrt(energie / (n * 2) * n) || 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

/** Bruit blanc en boucle. Un seul buffer pour tout le moteur. */
function fabriquerBruit(ctx, secondes = 2.5) {
  const n = Math.floor(ctx.sampleRate * secondes);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const rnd = mulberry32(20259);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  }
  return buf;
}

/**
 * Saturation douce, A PENTE UNITAIRE EN ZERO.
 *
 * La courbe evidente — `tanh(k.x) / tanh(k)` — a une pente de k a l'origine :
 * elle ne colle pas les cretes, elle AMPLIFIE tout ce qui est faible. Mesure
 * au banc : les six voix coupees, il restait le souffle de l'optique a
 * -27,7 dB au lieu des -50 attendus, parce que la chaleur a 0,5 le
 * multipliait par 5,5. On plie donc au-dessus d'un seuil et on ne touche a
 * rien en dessous.
 */
function courbeChaleur(force) {
  const n = 2048;
  const c = new Float32Array(n);
  const s = 1 - force * 0.78;      // a force nulle, la courbe est l'identite
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = a <= s ? x : Math.sign(x) * (s + (1 - s) * Math.tanh((a - s) / (1 - s)));
  }
  return c;
}

/**
 * Formes d'onde construites a la demande : un seul oscillateur au lieu de six.
 * Une nappe a trois voix desaccordees et quatre notes coute alors douze
 * oscillateurs et non soixante-douze — et ce sont bien ces soixante-douze qui
 * auraient fini par craquer sur une machine modeste.
 */
function ondeHarmonique(ctx, amplitudes) {
  const n = amplitudes.length + 1;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < amplitudes.length; i++) im[i + 1] = amplitudes[i];
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

/* ------------------------------------------------------------- le moteur --- */

class Son {
  constructor() {
    this.pret = false;
    this.muet = false;
    this.volume = 0.7;
    this.ambiance = 'apex';

    /* Le contexte. Ce sont les quatre seules entrees du moteur. */
    this.echelle = 0;
    this.croissance = 0.5;
    this.densite = 0;
    this.miseAuPoint = 0;

    this.derniereGraine = 24301;
    this.melodie = null;
    this.p = { ...PRESETS[this.ambiance] };
    this.rack = JSON.parse(JSON.stringify(RACKS[this.ambiance]));
    this._irTaille = -1;
    this._irCouleur = -1;
    this._chaleur = -1;
    this.pas = 0;
    this.charge = 0;          // nombre de noeuds vivants, pour le banc
  }

  /* ---------------------------------------------------------------- init --- */

  init() {
    if (this.pret) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.bruit = fabriquerBruit(ctx);

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    /* La vitre du microscope. Tout passe derriere, y compris la reverbe :
       c'est ce qui fait que defocaliser ouate le son au lieu de le couper. */
    this.couleur = ctx.createBiquadFilter();
    this.couleur.type = 'lowpass';
    this.couleur.frequency.value = 8000;
    this.couleur.Q.value = 0.4;
    this.couleur.connect(this.master);

    this.saturation = ctx.createWaveShaper();
    this.saturation.oversample = '2x';
    this.saturation.connect(this.couleur);

    this.compresseur = ctx.createDynamicsCompressor();
    this.compresseur.threshold.value = -20;
    this.compresseur.knee.value = 24;
    this.compresseur.ratio.value = 3;
    this.compresseur.attack.value = 0.012;
    this.compresseur.release.value = 0.28;
    this.compresseur.connect(this.saturation);

    this.mix = ctx.createGain();
    this.mix.connect(this.compresseur);

    this.sec = ctx.createGain();
    this.sec.connect(this.mix);

    /* --- la salle ------------------------------------------------------- */
    this.busReverbe = ctx.createGain();
    this.preDelai = ctx.createDelay(0.5);
    this.convolveur = ctx.createConvolver();
    this.retourReverbe = ctx.createGain();
    this.busReverbe.connect(this.preDelai);
    this.preDelai.connect(this.convolveur);
    this.convolveur.connect(this.retourReverbe);
    this.retourReverbe.connect(this.mix);

    /* --- le ping-pong ---------------------------------------------------- */
    this.busEcho = ctx.createGain();
    this.dG = ctx.createDelay(4);
    this.dD = ctx.createDelay(4);
    this.panG = ctx.createStereoPanner(); this.panG.pan.value = -0.85;
    this.panD = ctx.createStereoPanner(); this.panD.pan.value = 0.85;
    this.fbG = ctx.createGain();
    this.fbD = ctx.createGain();
    /* Un passe-bas dans la boucle : sans lui les repetitions gardent tous
       leurs aigus et ce qui devait s'eloigner reste au premier plan. */
    this.filtreFB = ctx.createBiquadFilter();
    this.filtreFB.type = 'lowpass';
    this.filtreFB.frequency.value = 2600;
    this.retourEcho = ctx.createGain();
    this.busEcho.connect(this.dG);
    this.dG.connect(this.panG); this.panG.connect(this.retourEcho);
    this.dD.connect(this.panD); this.panD.connect(this.retourEcho);
    this.dG.connect(this.filtreFB);
    this.filtreFB.connect(this.fbD); this.fbD.connect(this.dD);
    this.dD.connect(this.fbG); this.fbG.connect(this.dG);
    this.retourEcho.connect(this.mix);
    /* Les repetitions partent AUSSI dans la salle : un echo sec dans une
       grande reverbe s'entend comme un effet colle apres coup. */
    this.retourEcho.connect(this.busReverbe);

    /* --- la largeur ------------------------------------------------------ */
    this.chorusEntree = ctx.createGain();
    this.chorusSortie = ctx.createGain();
    this.sec.connect(this.chorusEntree);
    this.chorusSortie.connect(this.mix);
    this._lfos = [];
    for (const [cote, base] of [[-1, 0.011], [1, 0.017]]) {
      const d = ctx.createDelay(0.2);
      d.delayTime.value = base;
      const pan = ctx.createStereoPanner();
      pan.pan.value = cote * 0.9;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.abs(cote) * 0.05;
      const prof = ctx.createGain();
      prof.gain.value = 0.004;
      lfo.connect(prof); prof.connect(d.delayTime);
      lfo.start();
      this.chorusEntree.connect(d); d.connect(pan); pan.connect(this.chorusSortie);
      this._lfos.push(lfo);
    }

    /* --- le souffle de l'optique ----------------------------------------- */
    this.souffleSrc = ctx.createBufferSource();
    this.souffleSrc.buffer = this.bruit;
    this.souffleSrc.loop = true;
    this.souffleFiltre = ctx.createBiquadFilter();
    this.souffleFiltre.type = 'bandpass';
    this.souffleFiltre.frequency.value = 1400;
    this.souffleFiltre.Q.value = 0.5;
    this.souffleGain = ctx.createGain();
    this.souffleGain.gain.value = 0;
    this.souffleSrc.connect(this.souffleFiltre);
    this.souffleFiltre.connect(this.souffleGain);
    this.souffleGain.connect(this.mix);
    this.souffleSrc.start();

    /* --- le ducking ------------------------------------------------------- */
    this.ducks = [];

    /* --- les six voix ------------------------------------------------------ */
    this.v = {};
    for (const voix of VOIX) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.frequency.value = 6000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const secG = ctx.createGain();
      const revG = ctx.createGain();
      const echoG = ctx.createGain();
      filtre.connect(gain);
      if (TENUES.has(voix.cle)) {
        /* Un gain de ducking PAR voix tenue. Un seul noeud partage renverrait
           le drone dans le panoramique de la nappe et de la basse : trois
           voix superposees sur un seul chemin, et un mix faux de 9,5 dB. */
        const dk = ctx.createGain();
        gain.connect(dk); dk.connect(pan);
        this.ducks.push(dk);
      } else gain.connect(pan);
      pan.connect(secG); secG.connect(this.sec);
      pan.connect(revG); revG.connect(this.busReverbe);
      pan.connect(echoG); echoG.connect(this.busEcho);
      /* Le mouvement du filtre : une derive tres lente, jamais la meme sur
         deux voix. Sans elle une nappe tenue est une photographie. */
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.02 + Math.random() * 0.03;
      const prof = ctx.createGain();
      prof.gain.value = 0;
      lfo.connect(prof); prof.connect(filtre.frequency);
      lfo.start();
      this.v[voix.cle] = { filtre, gain, pan, secG, revG, echoG, lfo, prof, genre: voix.genre };
    }
    this.pret = true;
    this.graine(this.derniereGraine);
    this.appliquerAmbiance(this.ambiance, true);
    this.appliquerRack(this.ambiance, true);
    this.maj();
    this._demarrerHorloge();
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  /* ------------------------------------------------------------ harmonie --- */

  /**
   * La graine ne choisit pas le son, elle choisit l'INTERPRETATION : la
   * progression, l'ostinato, la phrase. Deux graines sur le meme preset
   * donnent deux morceaux du meme groupe.
   */
  graine(n) {
    this.derniereGraine = (n | 0) & 0xffff;
    const rnd = mulberry32(this.derniereGraine || 1);
    /* Enchainements plausibles en mineur modal. Tirer quatre degres au hasard
       donne une suite qui ne va nulle part : c'est la table qui fait qu'on
       entend une progression et pas quatre accords. */
    const suite = [[5, 3, 4, 6, 2], [4, 3, 0], [5, 3, 0], [4, 6, 0, 1], [0, 5, 3], [4, 3, 1, 0], [0, 4, 2]];
    const progression = [0];
    for (let i = 1; i < 4; i++) {
      const s = suite[progression[i - 1]];
      progression.push(s[Math.floor(rnd() * s.length)]);
    }
    /* L'ostinato : huit positions dans l'accord, le silence compris. Sans
       silences, la cloche joue en continu et cesse d'etre une ponctuation. */
    const motif = [];
    for (let i = 0; i < 8; i++) motif.push(rnd() < 0.3 ? -1 : Math.floor(rnd() * 5));
    const phrase = [];
    for (let i = 0; i < 16; i++) phrase.push(rnd() < 0.45 ? -1 : Math.floor(rnd() * 7));
    this.melodie = { progression, motif, phrase };
  }

  _midi(d, base = 48) {
    const g = GAMMES[this.p.gamme] || GAMMES.eolien;
    const L = g.length;
    const o = Math.floor(d / L);
    return base + (this.p.tonique | 0) + g[((d % L) + L) % L] + 12 * o;
  }

  /** Les notes de l'accord courant. `accords` decide ou on s'arrete. */
  _accord(mesure) {
    const r = this.melodie.progression[mesure % this.melodie.progression.length];
    const n = 3 + (this.p.accords | 0);
    const notes = [];
    for (let k = 0; k < n; k++) notes.push(this._midi(r + 2 * k));
    return notes;
  }

  /* ---------------------------------------------------------- reglages --- */

  appliquerAmbiance(cle = this.ambiance, immediat = false, preset = null) {
    if (!this.pret) return;
    this.p = { ...(preset || PRESETS[cle]) };
    const ctx = this.ctx;
    const p = this.p;
    const t = ctx.currentTime;
    const g = (param, v) => (immediat ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.08));

    /* La reponse impulsionnelle coute 30 a 90 ms a fabriquer : on ne la
       refait que si la taille ou la couleur ont VRAIMENT bouge, sinon
       chaque image de curseur reconstruirait 1,4 million d'echantillons. */
    if (p.reverbe !== this._irTaille || p.reverbeCouleur !== this._irCouleur) {
      this.convolveur.buffer = fabriquerIR(ctx, p.reverbe, p.reverbeCouleur);
      this._irTaille = p.reverbe;
      this._irCouleur = p.reverbeCouleur;
    }
    this.preDelai.delayTime.setValueAtTime(p.preDelai / 1000, t);

    const ronde = 4 * 60 / p.bpm;
    const frac = { '3/16': 3 / 16, '1/8': 1 / 8, '1/4': 1 / 4, '3/8': 3 / 8, '1/2': 1 / 2 }[p.echoTemps] || 0.1875;
    g(this.dG.delayTime, ronde * frac);
    g(this.dD.delayTime, ronde * frac);
    g(this.fbG.gain, p.echoRetour);
    g(this.fbD.gain, p.echoRetour);
    g(this.retourEcho.gain, p.echo);
    g(this.retourReverbe.gain, 0.9);
    g(this.chorusSortie.gain, p.largeur * 0.55);
    /* Le souffle est volontairement faible : au-dela de 0,02 il ne raconte
       plus une optique, il s'entend comme du bruit de fond mal enleve. */
    g(this.souffleGain.gain, p.grain * 0.02);

    if (p.chaleur !== this._chaleur) {
      this.saturation.curve = courbeChaleur(p.chaleur);
      this._chaleur = p.chaleur;
    }
    for (const voix of VOIX) {
      const n = this.v[voix.cle];
      n.lfo.frequency.setValueAtTime(0.012 + p.derive * 0.06 * (0.6 + Math.random() * 0.8), t);
    }
  }

  appliquerRack(cle = this.ambiance, immediat = false, rack = null) {
    if (!this.pret) return;
    this.rack = rack ? JSON.parse(JSON.stringify(rack)) : JSON.parse(JSON.stringify(RACKS[cle]));
    const t = this.ctx.currentTime;
    const g = (param, v) => (immediat ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.06));
    for (const voix of VOIX) {
      const r = this.rack[voix.cle];
      const n = this.v[voix.cle];
      g(n.filtre.frequency, clamp(r.coupure, 40, 20000));
      /* La resonance est bornee a 8 : au-dela le filtre chante sur sa propre
         frequence de coupure et c'est ce sifflement-la qu'on entend, pas la
         nappe. Mesure a l'analyseur : une raie a plus de x20 des le Q = 12. */
      n.filtre.Q.setValueAtTime(0.4 + (r.resonance || 0) * 7.6, t);
      n.prof.gain.setValueAtTime((r.mouvement || 0) * r.coupure * 0.45, t);
      g(n.revG.gain, r.reverbe ?? 0.3);
      g(n.echoG.gain, r.echo ?? 0);
      g(n.secG.gain, 1);
    }
  }

  appliquerCode(code) {
    const d = decoderCode(code);
    if (!d) return false;
    this.ambiance = d.ambiance;
    this.graine(d.graine);
    this.appliquerAmbiance(d.ambiance, true, d.preset);
    this.appliquerRack(d.ambiance, true, d.rack);
    this.maj();
    return true;
  }

  /* ------------------------------------------------------------ couches --- */

  /**
   * Ce qui bouge en continu. Appelable a chaque image : il n'y a que des
   * `setTargetAtTime`, aucun noeud n'est cree ici.
   */
  majCouches() {
    if (!this.pret) return;
    const t = this.ctx.currentTime;
    const c = this;
    const flou = this.miseAuPoint;
    for (const voix of VOIX) {
      const r = this.rack[voix.cle];
      const couche = clamp(COUCHES[voix.cle](c), 0, 1);
      /* `suivi` decide de la PART du contexte qu'une voix accepte. A 0 elle
         reste ou on l'a mise — c'est ce qu'il faut pour regler un timbre
         sans que le mix bouge sous les doigts. */
      const n = r.niveau * lerp(1, couche, r.suivi ?? 1);
      this.v[voix.cle].gain.gain.setTargetAtTime(clamp(n, 0, 1) * 0.9, t, 0.25);
    }
    /* La mise au point ouate : c'est la meme grandeur que le flou du rendu,
       et c'est elle qui couvre honnetement la bascule d'echelle. La densite
       assombrit — un substrat epuise n'a plus d'aigus. */
    const base = this.p.couleur * (1 - 0.4 * this.densite);
    this.couleur.frequency.setTargetAtTime(clamp(base * (1 - 0.88 * flou), 180, 20000), t, 0.3);
    this.retourReverbe.gain.setTargetAtTime(0.9 + flou * 0.9, t, 0.3);
    this.souffleGain.gain.setTargetAtTime(this.p.grain * 0.02 * (1 + flou * 2.5), t, 0.3);
  }

  maj() { this.majCouches(); }

  /* -------------------------------------------------------- ordonnanceur --- */

  /**
   * Un ordonnanceur a horizon, pas un `setTimeout` par note.
   *
   * Le rendez-vous est pris 250 ms a l'avance sur l'horloge du contexte
   * audio, qui est la seule horloge juste : `requestAnimationFrame` saute
   * des images des que l'onglet passe derriere, et une batterie programmee
   * image par image tremble a chaque hoquet du rendu.
   */
  _demarrerHorloge() {
    this._prochain = this.ctx.currentTime + 0.12;
    this.pas = 0;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._pulser(), 25);
  }

  _pulser() {
    if (!this.pret || this.ctx.state !== 'running') return;
    const dureePas = 60 / this.p.bpm / (PAS_PAR_MESURE / 4);
    const horizon = this.ctx.currentTime + 0.25;
    let garde = 0;
    while (this._prochain < horizon && garde++ < 128) {
      this._jouerPas(this.pas, this._prochain, dureePas);
      this.pas++;
      this._prochain += dureePas;
    }
    /* Onglet revenu au premier plan apres une minute : on ne rattrape pas
       trois mille pas, on se recale. Rattraper produirait une rafale. */
    if (this._prochain < this.ctx.currentTime) this._prochain = this.ctx.currentTime + 0.05;
  }

  /** Tirage reproductible attache a un pas : meme graine, meme morceau. */
  _de(i, sel) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(sel | 0, 668265263) ^ Math.imul(this.derniereGraine, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  _jouerPas(i, t, dureePas) {
    const P = PAS_PAR_MESURE;
    const cycle = P * MESURES;
    const mesure = Math.floor(i / P);
    const dans = i % P;
    const R = this.rack;
    const mesureLong = dureePas * P;

    /* Le swing retarde la seconde double croche de chaque paire. Au-dela de
       0,25 on n'est plus dans le drum and bass mais dans le shuffle. */
    const tt = t + (dans % 4 === 2 ? R.break.swing * 2 * dureePas : 0);

    /* --- l'accord, une fois par mesure -------------------------------- */
    if (dans === 0) {
      const notes = this._accord(mesure);
      if (this._niveau('nappe') > 0.002) {
        for (const m of notes) this._notePad(t, m, mesureLong, R.nappe, this.v.nappe.filtre);
      }
      /* Le drone tient la TONIQUE, pas la fondamentale de l'accord. C'est la
         definition d'un drone, et c'est ce frottement-la — la tonique contre
         le quatrieme degre — qui donne la couleur modale. Il se redeclenche
         toutes les quatre mesures pour ne pas s'empiler indefiniment. */
      if (mesure % 4 === 0 && this._niveau('drone') > 0.002) {
        this._notePad(t, this._midi(0, 36), mesureLong * 4, R.drone, this.v.drone.filtre);
        this._notePad(t, this._midi(4, 36), mesureLong * 4, R.drone, this.v.drone.filtre);
      }
    }

    /* --- le break ------------------------------------------------------ */
    const grille = BREAKS[R.break.modele] || BREAKS.rouleau;
    const nb = this._niveau('break');
    if (nb > 0.002) {
      const k = grille.kick[i % cycle];
      const s = grille.snare[i % cycle];
      const h = grille.hat[i % cycle];
      if (k === 'K' || k === 'k') {
        this._frappe(tt, 'grosse', (k === 'K' ? 1 : 0.6) * R.break.grosse, R.break);
        this._ducker(tt, R.break.ducking * nb);
      }
      if (s === 'S') this._frappe(tt, 'caisse', R.break.caisse, R.break);
      if (s === 's') this._frappe(tt, 'fantome', R.break.fantome * 0.5, R.break);
      if (h === 'h') this._frappe(tt, 'charley', R.break.charley * 0.55, R.break);
      if (h === 'H') this._frappe(tt, 'ouvert', R.break.charley * 0.7, R.break);
    }

    /* --- la basse ------------------------------------------------------ */
    if (this._niveau('basse') > 0.002 && R.basse.motif !== 'rien') {
      const fond = this._midi(this.melodie.progression[mesure % 4], 24);
      const m = R.basse.motif;
      let joue = false;
      let duree = dureePas * 8;
      if (m === 'tenue') { joue = dans === 0; duree = mesureLong; }
      else if (m === 'pulse') joue = dans % 8 === 0;
      else if (m === 'contretemps') joue = dans === 0 || dans === 12 || dans === 20;
      else if (m === 'double') { joue = dans % 4 === 0; duree = dureePas * 4; }
      else if (m === 'suit le break') joue = grille.kick[i % cycle] !== '-';
      if (joue) this._noteBasse(tt, fond, duree, R.basse);
    }

    /* --- la cloche ----------------------------------------------------- */
    /* Une note tous les deux pas au maximum : sur la grille des doubles
       croches. Une cloche placee sur les quadruples croches ne s'entend plus
       comme une ponctuation mais comme une erreur de quantification. */
    if (dans % 2 === 0 && this._niveau('cloche') > 0.002) {
      const r = R.cloche;
      const pos = dans % 8 === 0 ? 1 - r.contretemps : r.contretemps;
      const proba = (r.densite / 16) * this.p.melodie * 2 * pos;
      if (this._de(i, 11) < proba) {
        const notes = this._accord(mesure);
        const deg = this.melodie.motif[(i >> 1) % 8];
        if (deg >= 0) {
          const m = notes[deg % notes.length] + (this._de(i, 12) < 0.25 ? 12 : 0);
          this._notePince(tt, m, r, (this._de(i, 13) * 2 - 1) * r.dispersion);
        }
      }
    }

    /* --- la texture ---------------------------------------------------- */
    if (this._niveau('texture') > 0.002) {
      const r = R.texture;
      if (this._de(i, 21) < r.densite / P) this._texture(t, r);
    }
  }

  /** Le niveau effectif d'une voix, couches comprises. */
  _niveau(cle) {
    const r = this.rack[cle];
    return r.niveau * lerp(1, clamp(COUCHES[cle](this), 0, 1), r.suivi ?? 1);
  }

  /**
   * Le ducking. C'est lui, et pas le compresseur, qui fait respirer le bas :
   * un compresseur reagit a TOUT le mix, le ducking ne reagit qu'a la grosse
   * caisse, ce qui est precisement ce qu'on veut entendre.
   */
  _ducker(t, force) {
    const creux = 1 - clamp(force, 0, 0.85);
    for (const dk of this.ducks) {
      dk.gain.cancelScheduledValues(t);
      dk.gain.setValueAtTime(creux, t);
      dk.gain.setTargetAtTime(1, t + 0.02, 0.09);
    }
  }

  /* ------------------------------------------------------------ synthese --- */

  /** Les formes d'onde sont chères à construire : une par timbre, pas une par note. */
  _onde(cle, amplitudes) {
    if (!this._cacheOndes) this._cacheOndes = new Map();
    let o = this._cacheOndes.get(cle);
    if (!o) { o = ondeHarmonique(this.ctx, amplitudes); this._cacheOndes.set(cle, o); }
    return o;
  }

  _source(t, arret) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.bruit;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    s.start(t, Math.random() * 2);
    s.stop(arret);
    this.charge++;
    s.onended = () => { s.disconnect(); this.charge--; };
    return s;
  }

  _osc(type, freq, t, arret) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = freq;
    o.start(t);
    o.stop(arret);
    this.charge++;
    o.onended = () => { o.disconnect(); this.charge--; };
    return o;
  }

  /**
   * Une note tenue : drone et nappe. Six moteurs sous un seul enrobage
   * d'enveloppe, parce que c'est l'enveloppe — pas le timbre — qui decide si
   * on entend une nappe ou un instrument.
   */
  _notePad(t, midi, duree, r, dest) {
    const ctx = this.ctx;
    const f0 = mtof(midi + 12 * (r.octave || 0));
    if (!(f0 > 14) || f0 > 9000) return;
    const t1 = r.timbre1, t2 = r.timbre2;
    const att = Math.min(r.attaque, duree * 0.8);
    const fin = t + duree;
    const arret = fin + r.relache * 2.2 + 0.15;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + att + 0.004);
    g.gain.setValueAtTime(1, fin);
    g.gain.setTargetAtTime(0.0001, fin, Math.max(0.03, r.relache / 3));

    let sortie = g;
    /* Les dents ont leur propre filtre : c'est le creux a l'attaque qui les
       rend jouables, et il doit etre par note, pas par voix. */
    if (r.modele === 'dents') {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      const haut = clamp(f0 * (4 + t2 * 26), 120, 14000);
      fl.frequency.setValueAtTime(clamp(f0 * 1.6, 90, 8000), t);
      fl.frequency.linearRampToValueAtTime(haut, t + att + 0.2);
      fl.Q.value = 0.7;
      g.connect(fl); fl.connect(dest);
    } else g.connect(dest);

    const det = r.desaccord * (0.5 + t2 * 1.2);
    const voix = r.modele === 'fm' || r.modele === 'metal' || r.modele === 'formant' ? 2 : 3;
    const amp = 0.26 / voix;

    for (let k = 0; k < voix; k++) {
      const dec = voix === 1 ? 0 : (k / (voix - 1) - 0.5) * 2 * det;
      const f = f0 * cents(dec);
      const gv = ctx.createGain();
      gv.gain.value = amp;
      gv.connect(g);

      if (r.modele === 'sines') {
        /* Pente des harmoniques : 2,6 (presque une sinusoide) a 1,0 (une
           dent). Huit partiels suffisent — au-dela, sous le passe-bas de la
           voix, plus personne n'entend la difference. */
        const pente = 2.6 - t1 * 1.6;
        const amps = [];
        for (let n = 1; n <= 8; n++) amps.push(Math.pow(n, -pente));
        this._osc(this._onde(`s${pente.toFixed(2)}`, amps), f, t, arret).connect(gv);
      } else if (r.modele === 'dents') {
        const amps = [];
        for (let n = 1; n <= 14; n++) amps.push((n % 2 ? 1 : 1 - t1) / n);
        this._osc(this._onde(`d${t1.toFixed(2)}`, amps), f, t, arret).connect(gv);
      } else if (r.modele === 'fm' || r.modele === 'metal') {
        const ratios = r.modele === 'fm' ? [0.5, 1, 1.5, 2, 3, 4] : [1.41, 2.13, 2.76, 3.47, 4.19, 5.42];
        const ratio = ratios[Math.min(ratios.length - 1, Math.floor(t1 * ratios.length))];
        const por = this._osc('sine', f, t, arret);
        const mod = this._osc('sine', f * ratio, t, arret);
        const prof = ctx.createGain();
        /* L'indice doit etre proportionnel a la frequence, sinon une basse
           est saturee de bandes laterales quand l'aigu est encore pur. */
        prof.gain.setValueAtTime(f * t2 * 3.2, t);
        prof.gain.setTargetAtTime(f * t2 * 0.9, t, Math.max(0.2, duree * 0.3));
        mod.connect(prof); prof.connect(por.frequency);
        por.connect(gv);
      } else if (r.modele === 'formant') {
        const amps = [];
        for (let n = 1; n <= 20; n++) amps.push(1 / n);
        const src = this._osc(this._onde('saw20', amps), f, t, arret);
        const V = [[300, 870, 2240], [400, 800, 2600], [730, 1090, 2440], [530, 1840, 2480]];
        const u = clamp(t1, 0, 0.999) * (V.length - 1);
        const a = V[Math.floor(u)], b = V[Math.ceil(u)];
        const mel = u - Math.floor(u);
        for (let n = 0; n < 3; n++) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = lerp(a[n], b[n], mel);
          bp.Q.value = 2 + t2 * 10;
          const gg = ctx.createGain();
          gg.gain.value = [1, 0.6, 0.3][n];
          src.connect(bp); bp.connect(gg); gg.connect(gv);
        }
      } else if (r.modele === 'bruit') {
        const src = this._source(t, arret);
        for (const [mult, niv] of [[1, 1], [2.01, 0.45], [3.02, 0.22]]) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = clamp(f * mult, 20, 18000);
          bp.Q.value = 3 + t1 * 55;
          const gg = ctx.createGain();
          gg.gain.value = niv * 6;
          src.connect(bp); bp.connect(gg); gg.connect(gv);
        }
        /* La part non accordee : c'est elle qui fait la matiere plutot que
           la note. A zero, le modele « bruit » sonne comme une flute. */
        if (t2 > 0.01) {
          const lp = ctx.createBiquadFilter();
          lp.type = 'bandpass';
          lp.frequency.value = clamp(f * 2, 60, 16000);
          lp.Q.value = 0.7;
          const gg = ctx.createGain();
          gg.gain.value = t2 * 0.5;
          src.connect(lp); lp.connect(gg); gg.connect(gv);
        }
      }
    }
  }

  /** Karplus-Strong calcule hors ligne : la boucle de retard de Web Audio ne
      descend pas sous 128 echantillons, ce qui plafonnerait la corde a
      375 Hz et rendrait faux tout ce qui est au-dessus du fa dièse 4. */
  _bufferCorde(f, duree, amort, matiere) {
    if (!this._cacheCorde) this._cacheCorde = new Map();
    const cle = `${Math.round(f)}|${amort.toFixed(2)}|${matiere.toFixed(2)}|${duree.toFixed(1)}`;
    const vu = this._cacheCorde.get(cle);
    if (vu) return vu;
    const sr = this.ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / f));
    const n = Math.max(1, Math.floor(sr * duree));
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const ligne = new Float32Array(N);
    const rnd = mulberry32(1234 + Math.round(f * 7));
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += (0.08 + matiere * 0.85) * ((rnd() * 2 - 1) - lp); ligne[i] = lp; }
    const a = 0.5 + amort * 0.35;
    const perte = 1 - amort * 0.004 - 0.0004;
    let p = 0, prec = 0;
    for (let i = 0; i < n; i++) {
      const x = ligne[p];
      ligne[p] = (x * a + prec * (1 - a)) * perte;
      prec = x;
      d[i] = x;
      p = (p + 1) % N;
    }
    if (this._cacheCorde.size > 40) this._cacheCorde.clear();
    this._cacheCorde.set(cle, buf);
    return buf;
  }

  /** Une note pincee : la cloche. C'est la voix qu'on retient d'un morceau. */
  _notePince(t, midi, r, pan = 0) {
    const ctx = this.ctx;
    const f = mtof(midi + 12 * (r.octave || 0));
    if (!(f > 20) || f > 12000) return;
    const dec = r.declin;
    const arret = t + dec * 1.8 + 0.1;
    const t1 = r.timbre1, t2 = r.timbre2;

    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(pan, -1, 1);
    pn.connect(this.v.cloche.filtre);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    g.connect(pn);

    if (r.modele === 'fm') {
      const ratios = [1, 2, 3, 3.5, 7, 14];
      const ratio = ratios[Math.min(5, Math.floor(t1 * 6))];
      const por = this._osc('sine', f, t, arret);
      const mod = this._osc('sine', f * ratio, t, arret);
      const prof = ctx.createGain();
      prof.gain.setValueAtTime(f * (0.6 + t2 * 6), t);
      /* L'indice doit TOMBER : c'est la chute de brillance apres l'attaque
         qui fait entendre une lame frappee plutot qu'un synthetiseur. */
      prof.gain.exponentialRampToValueAtTime(f * 0.05 + 1, t + dec * 0.6);
      mod.connect(prof); prof.connect(por.frequency);
      por.connect(g);
    } else if (r.modele === 'additif') {
      const inh = 2.7 + t1 * 3.8;
      const partiels = [[1, 1], [inh, 0.5 - t2 * 0.35], [inh * 1.87, 0.22 - t2 * 0.18]];
      for (const [mult, niv] of partiels) {
        if (niv <= 0.01 || f * mult > 17000) continue;
        const o = this._osc('sine', f * mult, t, arret);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(niv, t);
        /* Les partiels hauts s'eteignent plus vite que le fondamental, comme
           dans tout corps reel. Sans cela on entend une addition, pas un son. */
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dec / (1 + mult * 0.35 * (0.4 + t2)));
        o.connect(gg); gg.connect(g);
      }
    } else if (r.modele === 'corde') {
      const s = ctx.createBufferSource();
      s.buffer = this._bufferCorde(f, Math.min(4, dec * 1.4), 0.1 + t1 * 0.85, t2);
      s.start(t);
      s.stop(arret);
      this.charge++;
      s.onended = () => { s.disconnect(); this.charge--; };
      s.connect(g);
    } else {
      /* La goutte. Pas une note : un evenement. C'est le seul patch de la
         liste qui dise le sujet du projet plutot que le genre. */
      const o = this._osc('sine', f * (1.4 + t1 * 1.6), t, arret);
      o.frequency.exponentialRampToValueAtTime(f * (0.5 - t1 * 0.3), t + dec * (0.25 + t2 * 0.6));
      o.connect(g);
    }
  }

  _noteBasse(t, midi, duree, r) {
    const ctx = this.ctx;
    const f = mtof(midi + 12 * (r.octave || 0));
    if (!(f > 18) || f > 900) return;
    const dec = r.declin;
    const arret = t + Math.max(duree, dec) + 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.42, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + Math.min(duree, dec), Math.max(0.03, dec / 3));
    g.connect(this.v.basse.filtre);
    const t1 = r.timbre1, t2 = r.timbre2;

    if (r.modele === 'sub') {
      this._osc('sine', f, t, arret).connect(g);
      if (t1 > 0.02) {
        const h = this._osc('sine', f * 2, t, arret);
        const gh = ctx.createGain();
        gh.gain.value = t1 * 0.5;
        h.connect(gh); gh.connect(g);
      }
      if (t2 > 0.02) {
        const cl = this._source(t, t + 0.03);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1200;
        const gc = ctx.createGain();
        gc.gain.setValueAtTime(t2 * 0.25, t);
        gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
        cl.connect(hp); hp.connect(gc); gc.connect(g);
      }
    } else if (r.modele === 'reese') {
      /* Deux dents qui battent. Le battement est la basse : c'est lui qu'on
         entend, pas la note. */
      for (const s of [-1, 1]) {
        const o = this._osc('sawtooth', f * cents(s * (4 + t1 * 26)), t, arret);
        const gg = ctx.createGain();
        gg.gain.value = 0.42;
        o.connect(gg); gg.connect(g);
        if (t2 > 0.02) {
          const lfo = this._osc('sine', 0.15 + t2 * 1.6, t, arret);
          const prof = ctx.createGain();
          prof.gain.value = f * 0.004 * t2;
          lfo.connect(prof); prof.connect(o.frequency);
        }
      }
    } else {
      const amps = [];
      for (let n = 1; n <= 16; n++) amps.push((r.modele === 'carre' && n % 2 === 0 ? (1 - t1) : 1) / n);
      const o = this._osc(this._onde(`b${r.modele}${t1.toFixed(2)}`, amps), f, t, arret);
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(clamp(f * (3 + t1 * 24), 60, 6000), t);
      fl.frequency.exponentialRampToValueAtTime(clamp(f * 2, 50, 4000), t + dec * 0.8);
      fl.Q.value = 0.6 + t2 * 7;
      o.connect(fl); fl.connect(g);
    }
  }

  /** La batterie, entierement synthetisee. Aucun echantillon dans le depot. */
  _frappe(t, quoi, force, r) {
    if (force <= 0.004) return;
    const ctx = this.ctx;
    const dest = this.v.break.filtre;
    const g = ctx.createGain();
    g.connect(dest);

    if (quoi === 'grosse') {
      const o = this._osc('sine', 150, t, t + 0.4);
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.075);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(force * 0.95, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g);
      const cl = this._source(t, t + 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      const gc = ctx.createGain();
      gc.gain.setValueAtTime(force * 0.22, t);
      gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
      cl.connect(hp); hp.connect(gc); gc.connect(dest);
      return;
    }

    if (quoi === 'caisse' || quoi === 'fantome') {
      const fort = quoi === 'caisse';
      const dec = fort ? 0.13 + r.corps * 0.06 : 0.045;
      const corps = r.corps;
      const bruit = this._source(t, t + dec + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750 - corps * 700;
      bp.Q.value = 0.8;
      const gb = ctx.createGain();
      gb.gain.setValueAtTime(force * (1 - corps * 0.5) * 0.55, t);
      gb.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      bruit.connect(bp); bp.connect(gb); gb.connect(g);
      /* Les deux peaux. Sans elles la caisse claire est un « pshh » ; sans le
         bruit, un tom. Le curseur « corps » est exactement ce dosage. */
      for (const [hz, niv] of [[186, 1], [331, 0.65]]) {
        const o = this._osc('triangle', hz, t, t + dec);
        const go = ctx.createGain();
        go.gain.setValueAtTime(force * corps * niv * 0.45, t);
        go.gain.exponentialRampToValueAtTime(0.0001, t + dec * 0.75);
        o.connect(go); go.connect(g);
      }
      g.gain.value = 1;
      return;
    }

    const dec = quoi === 'ouvert' ? 0.2 : 0.032;
    const s = this._source(t, t + dec + 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = quoi === 'ouvert' ? 6500 : 7800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 9800;
    bp.Q.value = 0.9;
    g.gain.setValueAtTime(force * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(hp); hp.connect(bp); bp.connect(g);
  }

  /** La texture : ce qu'on entend quand on ecoute une preparation. */
  _texture(t, r) {
    const ctx = this.ctx;
    const dest = this.v.texture.filtre;
    const ecart = (Math.random() * 2 - 1) * r.etendue;
    const f = clamp(70 * Math.pow(2, r.hauteur * 5.6 + ecart * 1.6), 40, 15000);
    const pn = ctx.createStereoPanner();
    pn.pan.value = (Math.random() * 2 - 1) * r.dispersion;
    pn.connect(dest);
    const g = ctx.createGain();
    g.connect(pn);
    const m = r.modele;

    if (m === 'gouttes' || m === 'bulles') {
      const dur = 0.05 + Math.random() * 0.14;
      const o = this._osc('sine', f, t, t + dur + 0.05);
      const cible = m === 'gouttes' ? f * 0.35 : f * 2.6;
      o.frequency.exponentialRampToValueAtTime(clamp(cible, 30, 17000), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      o.connect(g);
      return;
    }
    if (m === 'grains') {
      /* Une rafale de micro-grains. Chacun est trop court pour avoir une
         hauteur ; c'est la rafale qui en a une. */
      const n = 4 + Math.floor(Math.random() * 7);
      for (let k = 0; k < n; k++) {
        const tk = t + k * (0.012 + Math.random() * 0.03);
        const o = this._osc('sine', f * (0.8 + Math.random() * 0.5), tk, tk + 0.05);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.0001, tk);
        gg.gain.linearRampToValueAtTime(0.16, tk + 0.004);
        gg.gain.exponentialRampToValueAtTime(0.0001, tk + 0.03);
        o.connect(gg); gg.connect(g);
      }
      g.gain.value = 1;
      return;
    }
    if (m === 'souffle') {
      const dur = 1.2 + Math.random() * 2.5;
      const s = this._source(t, t + dur + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(f * (0.6 + Math.random()), t + dur);
      bp.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g);
      return;
    }
    if (m === 'cristaux') {
      const dur = 0.8 + Math.random() * 2.2;
      const s = this._source(t, t + dur + 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 40;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1.4, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g);
      return;
    }
    /* craquements et poussiere : des transitoires, rien d'autre. */
    const dur = m === 'poussière' ? 0.006 : 0.02 + Math.random() * 0.05;
    const s = this._source(t, t + dur + 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = m === 'poussière' ? 'highpass' : 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = m === 'poussière' ? 0.7 : 3.5;
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g);
  }

  /**
   * Faire sonner une voix tout de suite, hors grille. Attendre la mesure
   * suivante pour entendre le timbre qu'on vient de choisir casse l'essai en
   * serie, et c'est exactement ce qu'on fait devant quarante-cinq machines.
   */
  essayer(cle) {
    if (!this.pret) return;
    const t = this.ctx.currentTime + 0.02;
    const r = this.rack[cle];
    const mesure = 60 / this.p.bpm * 4;
    if (cle === 'drone' || cle === 'nappe') {
      for (const m of this._accord(0)) this._notePad(t, m, mesure, r, this.v[cle].filtre);
    } else if (cle === 'cloche') {
      const notes = this._accord(0);
      for (let k = 0; k < 3; k++) {
        this._notePince(t + k * mesure * 0.18, notes[k % notes.length] + (k === 2 ? 12 : 0), r,
          (Math.random() * 2 - 1) * r.dispersion);
      }
    } else if (cle === 'basse') {
      this._noteBasse(t, this._midi(0, 24), mesure * 0.5, r);
    } else if (cle === 'break') {
      /* Une mesure entiere du break choisi : une frappe seule ne dit rien
         d'une grille, et c'est la grille qu'on essaie ici. */
      const grille = BREAKS[r.modele] || BREAKS.rouleau;
      const pas = mesure / PAS_PAR_MESURE;
      for (let i = 0; i < PAS_PAR_MESURE * MESURES; i++) {
        const tt = t + i * pas + (i % 4 === 2 ? r.swing * 2 * pas : 0);
        const k = grille.kick[i], s = grille.snare[i], h = grille.hat[i];
        if (k !== '-') this._frappe(tt, 'grosse', (k === 'K' ? 1 : 0.6) * r.grosse, r);
        if (s === 'S') this._frappe(tt, 'caisse', r.caisse, r);
        if (s === 's') this._frappe(tt, 'fantome', r.fantome * 0.5, r);
        if (h === 'h') this._frappe(tt, 'charley', r.charley * 0.55, r);
        if (h === 'H') this._frappe(tt, 'ouvert', r.charley * 0.7, r);
      }
    } else {
      for (let k = 0; k < 4; k++) this._texture(t + k * 0.22 + Math.random() * 0.1, r);
    }
  }
}

export const son = new Son();
