/* ---------------------------------------------------------------------------
   LA SPORULATION, forme SPOROCYSTE (Mucorales).

   Sur une hyphe non septee, la reproduction asexuee ne se fait pas par
   conidies en chaines : elle se fait par un SAC. Au niveau d'un noeud du
   stolon, des rhizoides plongent dans le substrat et un sporangiophore
   monte. Sa pointe gonfle en apophyse puis en COLUMELLE — un dome qui reste
   a l'interieur —, la paroi du sporocyste ballonne par-dessus, le cytoplasme
   multinucleole s'y CLIVE en spores, et la pression finit par dechirer le
   sac.

   Une precision sur le mecanisme, parce qu'elle change l'animation : les
   spores ne bourgeonnent pas sur la columelle. Le sporocyste est un
   cenocyte — un sac de cytoplasme a plusieurs milliers de noyaux — et les
   spores y naissent par CLIVAGE : des membranes se referment autour de
   paquets de cytoplasme, tous a peu pres en meme temps, dans tout le volume.
   D'ou le grain qui se prend partout a la fois au lieu de croitre depuis le
   centre.

   LE SAC EST UNE CORDE, comme la membrane plasmique (regle 4) : un anneau
   ferme de noeuds portant un ecart radial, meme equation,
   `acc = c2.d2(off)/dth2 - k.(off - cible) - b.vitesse`, plus un terme de
   PRESSION vers l'exterieur. Il fallait qu'il soit mou : une sphere rigide
   qui disparait d'un coup ne se lit pas comme une dechirure.

   Echelles. Sporocyste de 90 um, columelle de 40, spores de 8 : ce sont les
   valeurs basses de Rhizopus (sporocyste 100-350 um, spores 4-11). Le
   sporangiophore fait 380 um au lieu du millimetre reel — au-dela, la
   montee dure une eternite pour un tube qui est de toute facon hors du plan
   de mise au point apres vingt micrometres.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, mulberry32, TAU } from '../core/util.js';

/* Geometrie, en um. */
export const Z_TOTAL = 380;       // hauteur finale du sporangiophore
export const R_SAC = 40;          // rayon du sporocyste
export const R_COL = 18;          // rayon de la columelle
export const R_TIGE = 4.2;        // demi-largeur du sporangiophore
const R_SPORE = [3.4, 4.6];       // rayon des spores
/* 520, et ce n'est pas un chiffre d'auteur : c'est ce qu'il faut pour que le
   sac SOIT PLEIN. Le volume de la coque entre columelle et paroi fait
   2,3.10^5 um3, une spore de 4 um en occupe 268 — a 380 spores le
   remplissage plafonnait a 0,29 et la pression ne montait jamais au seuil de
   rupture : le sac restait a moitie vide et ne crevait pas. */
const N_SPORES = 520;

/* Corde du sac. Memes roles que dans `membrane.js`, et les memes raisons :
   la tension fait COURIR la deformation au lieu de la faire apparaitre
   partout a la fois. */
const N_SAC = 108;                // noeuds sur l'anneau
/* c^2 en (um/s)^2. Longueur de cicatrisation sqrt(TENSION/RAPPEL) = 13 um,
   soit un tiers du sac : la deformation COURT le long de la paroi au lieu
   d'apparaitre partout, et la dechirure met ~4 s a faire le tour. */
const TENSION = 4400;
const AMORT = 3.4;
const RAPPEL = 26;                // /s^2, vers la forme au repos
/* Pression a laquelle la paroi cede, en unites de tension de Laplace. Le
   sac doit avoir le temps de se BOMBER avant de rompre : a 0,35 il crevait
   au tiers du remplissage et on ne voyait jamais le sac plein. */
const SEUIL_RUPTURE = 1.0;

export const PHASES = ['rhizoides', 'montee', 'apophyse', 'sporocyste', 'clivage', 'pression', 'eclatement', 'envol'];

/* Duree de chaque phase en secondes simulees. Une sporulation reelle prend
   des heures ; on la joue en deux minutes, et c'est assume — le but est de
   voir le mecanisme, pas d'attendre. */
const DUREES = { rhizoides: 7, montee: 26, apophyse: 9, sporocyste: 11, clivage: 26, pression: 999, eclatement: 1.6, envol: 999 };

export class Sporange {
  /** `base` : le point du stolon d'ou tout part, en um monde. */
  constructor(opts = {}) {
    this.rng = mulberry32(opts.graine ?? 7);
    this.x0 = opts.x ?? 0;
    this.y0 = opts.y ?? 0;
    this.thStolon = opts.th ?? 0;

    this.t = 0;
    this.tPhase = 0;
    this.phase = 'rhizoides';
    this.z = 0;                 // hauteur de la pointe
    this.rCol = 0;              // rayon de la columelle
    this.rSac = 0;              // rayon au repos du sac
    this.pression = 0;
    this.rupture = -1;          // indice du noeud rompu
    this.ouverture = 0;         // demi-largeur de la dechirure, en noeuds
    this.suivie = null;         // la spore que la camera suit

    /* Le sporangiophore : une polyligne 3D. Il monte surtout en z — vers
       l'observateur — et un peu dans l'image. C'est ce qui le fait sortir
       du plan de mise au point en quelques micrometres. */
    this.tige = [{ x: this.x0, y: this.y0, z: 0 }];
    this.incl = (this.rng() * 0.5 - 0.25);   // derive laterale, rad

    /* Les rhizoides : trois a cinq racines qui plongent. On ne les verra
       presque pas — ils sont sous le plan de mise au point des la deuxieme
       seconde. Ils existent quand meme : c'est le meme evenement qui les
       declenche, et un sporangiophore sans ancrage est un dessin. */
    this.rhizoides = [];
    const n = 3 + ((this.rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.rng() * 0.6;
      this.rhizoides.push({
        a, long: 0, max: 26 + this.rng() * 34,
        plonge: 0.55 + this.rng() * 0.35,     // part de z dans la descente
        courbe: (this.rng() * 2 - 1) * 0.5,
        branche: this.rng() < 0.6,
      });
    }

    /* La corde du sac, au repos tant qu'il n'existe pas. */
    this.sac = {
      n: N_SAC,
      off: new Float32Array(N_SAC),
      vel: new Float32Array(N_SAC),
      cible: new Float32Array(N_SAC),
      dechire: new Uint8Array(N_SAC),
    };
    this.spores = [];
  }

  /** Position 3D de la pointe du sporangiophore. */
  get pointe() { return this.tige[this.tige.length - 1]; }

  /** Centre du sporocyste : au-dessus de la pointe, la columelle dedans. */
  get centre() {
    const p = this.pointe;
    return { x: p.x, y: p.y, z: p.z + this.rSac * 0.42 };
  }

  passer(suivante) { this.phase = suivante; this.tPhase = 0; }

  maj(dt) {
    this.t += dt; this.tPhase += dt;
    const P = this.phase;
    const u = clamp(this.tPhase / DUREES[P], 0, 1);

    if (P === 'rhizoides') {
      for (const r of this.rhizoides) r.long = r.max * smoothstep(0, 1, u);
      /* La tige demarre en meme temps : c'est un seul evenement. */
      this.monter(Z_TOTAL * 0.06 * smoothstep(0, 1, u));
      if (u >= 1) this.passer('montee');

    } else if (P === 'montee') {
      /* Vitesse en cloche : lente au depart, elle file, puis ralentit en
         arrivant. Une montee lineaire se lit comme un ascenseur. */
      this.monter(Z_TOTAL * (0.06 + 0.94 * smoothstep(0, 1, u)));
      if (u >= 1) this.passer('apophyse');

    } else if (P === 'apophyse') {
      /* La pointe gonfle : apophyse puis columelle. */
      this.rCol = R_COL * smoothstep(0, 1, u);
      this.monter(Z_TOTAL + this.rCol * 0.5);
      if (u >= 1) this.passer('sporocyste');

    } else if (P === 'sporocyste') {
      /* La paroi du sac ballonne PAR-DESSUS la columelle. */
      this.rSac = lerp(this.rCol * 1.04, R_SAC, smoothstep(0, 1, u));
      this.majSac(dt);
      if (u >= 1) this.passer('clivage');

    } else if (P === 'clivage') {
      /* Le cytoplasme se clive. Les spores naissent PARTOUT a la fois, pas
         depuis un centre : c'est un cenocyte qui se cloisonne. */
      /* 78 % pendant le clivage, le reste pendant la mise sous pression :
         sans ca le sac arrivait plein a la seconde ou la phase changeait et
         crevait dans la foulee, sans qu'on ait vu la paroi se tendre. */
      const vise = Math.round(N_SPORES * 0.78 * smoothstep(0, 1, u));
      while (this.spores.length < vise) this.naitreSpore();
      for (const s of this.spores) s.r = Math.min(s.rMax, s.r + s.rMax * dt * 0.55);
      this.majSac(dt);
      if (u >= 1) this.passer('pression');

    } else if (P === 'pression') {
      const vise = Math.min(N_SPORES, Math.round(N_SPORES * (0.78 + 0.03 * this.tPhase)));
      while (this.spores.length < vise) this.naitreSpore();
      for (const s of this.spores) s.r = Math.min(s.rMax, s.r + s.rMax * dt * 0.55);
      this.majSac(dt);
      /* Laplace : la tension de paroi vaut p.R/2. On rompt au noeud le plus
         tendu, celui qui s'est le plus ecarte. */
      if (this.pression > SEUIL_RUPTURE) {
        let bi = 0, bo = -1e9;
        for (let i = 0; i < N_SAC; i++) if (this.sac.off[i] > bo) { bo = this.sac.off[i]; bi = i; }
        this.rupture = bi;
        this.passer('eclatement');
      }

    } else if (P === 'eclatement') {
      /* La dechirure court le long de la paroi, et le sac se retrousse en
         collerette autour de la columelle. */
      this.ouverture = (N_SAC * 0.42) * smoothstep(0, 1, u);
      this.majSac(dt);
      this.liberer(dt);
      if (u >= 1) {
        /* La camera choisit une spore au hasard et la suit. */
        /* La camera choisit une spore au hasard — mais parmi celles qui sont
           parties LOIN : une spore restee contre la paroi ne se detacherait
           jamais du tas, et on suivrait un mur de spores au lieu d'une. */
        const libres = this.spores.filter((s) => s.libre
          && Math.hypot(s.x, s.y, s.z) > this.rSac * 1.5);
        const tout = libres.length ? libres : this.spores.filter((s) => s.libre);
        this.suivie = tout.length ? tout[(this.rng() * tout.length) | 0] : null;
        if (this.suivie) {
          const s = this.suivie;
          const l = Math.hypot(s.vx, s.vy, s.vz) || 1;
          s.vx += s.vx / l * 26; s.vy += s.vy / l * 26; s.vz += s.vz / l * 26;
        }
        this.passer('envol');
      }

    } else if (P === 'envol') {
      this.liberer(dt);
    }

    this.voler(dt);
  }

  /* --- le sporangiophore --------------------------------------------------- */

  /** Prolonge la tige jusqu'a la hauteur z. */
  monter(z) {
    if (z <= this.z) return;
    const PAS = 3;
    while (this.z < z - 1e-6) {
      const dz = Math.min(PAS, z - this.z);
      this.z += dz;
      const p = this.pointe;
      /* Un peu dans l'image, beaucoup vers l'observateur : c'est ce qui le
         fait sortir du plan de mise au point en quelques micrometres. */
      this.tige.push({
        x: p.x + Math.sin(this.incl) * dz * 0.22,
        y: p.y - Math.cos(this.incl) * dz * 0.16,
        z: p.z + dz,
      });
    }
  }

  /** Demi-largeur du sporangiophore a la hauteur z. */
  largeur(z) {
    /* Evasee a la base — elle sort d'un stolon deux fois plus large — et
       legerement renflee sous l'apophyse. */
    const b = 1 + 1.5 * Math.exp(-z / 22);
    const a = 1 + 0.55 * smoothstep(Z_TOTAL - 40, Z_TOTAL, z);
    return R_TIGE * b * a;
  }

  /* --- le sac -------------------------------------------------------------- */

  majSac(dt) {
    const S = this.sac, n = S.n;
    /* Forme au repos : une sphere posee sur la columelle, donc legerement
       aplatie en bas, la ou elle l'epouse. */
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      S.cible[i] = this.rSac * (1 - 0.10 * Math.max(0, -Math.cos(th)));
    }

    /* Pression : ce que les spores occupent, rapporte au volume disponible
       entre la columelle et la paroi. Au-dela du remplissage compact elle
       monte vite — un sac plein ne se comprime plus, il se tend. */
    const vSac = (4 / 3) * Math.PI * (Math.pow(this.rSac, 3) - Math.pow(this.rCol, 3));
    let vSp = 0;
    for (const s of this.spores) if (!s.libre) vSp += (4 / 3) * Math.PI * s.r * s.r * s.r;
    const f = vSac > 1 ? vSp / vSac : 0;
    this.remplissage = f;
    /* Au-dela de 0,42 le sac ne se comprime plus, il se TEND. Le
       coefficient est regle pour que la paroi se bombe de 3 a 4 um avant de
       ceder : en dessous elle crevait sans qu'on l'ait vue gonfler. */
    this.pression = Math.max(0, f - 0.42) * 9;

    /* La corde est parametree en ANGLE, mais la tension agit sur la LONGUEUR
       D'ARC : ds = R.dth. Sans le R^2, la raideur du sac dependrait du
       nombre de noeuds et pas de sa taille. */
    const dth = TAU / n;
    const ds2 = (this.rSac * dth) * (this.rSac * dth) || 1;
    for (let i = 0; i < n; i++) {
      const a = S.off[(i - 1 + n) % n], b = S.off[(i + 1) % n];
      const lap = (a + b - 2 * S.off[i]) / ds2;
      /* Une paroi dechiree ne tire plus vers sa forme de sac : elle se
         retrousse en collerette autour de la columelle, ce qui est ce qu'on
         voit sur un sporocyste vide. */
      const vise = S.dechire[i] ? (this.rCol * 1.05 - S.cible[i]) : 0;
      const k = S.dechire[i] ? RAPPEL * 0.6 : RAPPEL;
      const p = S.dechire[i] ? 0 : this.pression * 60;
      S.vel[i] += (TENSION * lap - k * (S.off[i] - vise) + p - AMORT * S.vel[i]) * dt;
    }
    for (let i = 0; i < n; i++) S.off[i] = clamp(S.off[i] + S.vel[i] * dt, -this.rSac * 0.4, this.rSac * 0.9);

    /* La dechirure court depuis le point de rupture. */
    if (this.rupture >= 0) {
      const demi = Math.round(this.ouverture);
      for (let d = -demi; d <= demi; d++) S.dechire[(this.rupture + d + n * 2) % n] = 1;
    }
  }

  rayonSac(i) {
    const S = this.sac, n = S.n;
    const j = ((i % n) + n) % n;
    return S.cible[j] + S.off[j];
  }

  /* --- les spores ---------------------------------------------------------- */

  naitreSpore() {
    /* Tirage dans la COQUE entre columelle et paroi, en 3D : la sphere se
       cloisonne dans tout son volume. Rejet contre les voisines, sinon le
       sac se lit comme un nuage et non comme un empilement. */
    const rng = this.rng;
    for (let essai = 0; essai < 24; essai++) {
      const u = rng() * 2 - 1, ph = rng() * TAU;
      const sr = Math.sqrt(1 - u * u);
      /* Le RAYON DU CENTRE, pas celui du bord : une spore de 4,6 um tiree a
         0,94 R deborde de 10 % hors du sac, et on voyait une couronne de
         spores accrochee a l'exterieur de la paroi. */
      const rMax = lerp(R_SPORE[0], R_SPORE[1], rng());
      const dispo = this.rSac - rMax * 1.05;
      const rr = Math.cbrt(lerp(Math.pow(this.rCol / dispo, 3), 1, rng())) * dispo;
      const p = {
        x: sr * Math.cos(ph) * rr, y: u * rr, z: sr * Math.sin(ph) * rr,
        r: 0.2, rMax,
        ang: rng() * TAU, ov: 0.74 + rng() * 0.2,
        libre: false, vx: 0, vy: 0, vz: 0, clair: rng() < 0.45,
      };
      let ok = true;
      for (const q of this.spores) {
        const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        if (d < (p.rMax + q.rMax) * 0.70) { ok = false; break; }
      }
      if (ok || essai === 23) { this.spores.push(p); return; }
    }
  }

  /** Les spores proches de la dechirure sont emportees. */
  liberer(dt) {
    if (this.rupture < 0) return;
    const n = this.sac.n;
    const thR = (this.rupture / n) * TAU;
    const dx = Math.cos(thR), dy = Math.sin(thR);
    const rng = this.rng;
    for (const s of this.spores) {
      if (s.libre) continue;
      /* Dans le cone de la dechirure, et assez loin du centre. */
      const l = Math.hypot(s.x, s.y) || 1e-6;
      const cos = (s.x * dx + s.y * dy) / l;
      const demi = Math.max(0.1, (this.ouverture / n) * TAU);
      if (cos < Math.cos(demi) || l < this.rCol * 0.9) continue;
      if (rng() > dt * 2.6) continue;
      s.libre = true;
      const v = 14 + rng() * 26;
      s.vx = dx * v + (rng() - 0.5) * 9;
      s.vy = dy * v + (rng() - 0.5) * 9;
      s.vz = (rng() - 0.5) * 16;
    }
  }

  voler(dt) {
    for (const s of this.spores) {
      if (!s.libre) continue;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      /* Trainee. Rien ne propulse une spore : elle a ete EJECTEE, puis elle
         derive. A 1,35 /s elle s'arretait en 0,7 s apres vingt micrometres,
         et le nuage restait colle au sac comme une couronne — on ne voyait
         pas de dispersion. A 0,55 elle parcourt une cinquantaine de
         micrometres, ce qui suffit a separer celle qu'on suit des autres. */
      const f = Math.exp(-dt * 0.55);
      s.vx *= f; s.vy *= f; s.vz *= f;
      /* Agitation residuelle : une spore de 8 um ne se pose pas, elle
         flotte. Sans ce terme, l'envol se fige et la scene meurt. */
      s.vx += (this.rng() - 0.5) * 9 * dt;
      s.vy += (this.rng() - 0.5) * 9 * dt;
      s.vz += (this.rng() - 0.5) * 9 * dt;
      s.ang += dt * 0.6;
    }
  }
}
