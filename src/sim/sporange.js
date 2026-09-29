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

/* L'ORDRE, et il n'est pas celui qu'on croit. J'avais fait grossir la
   columelle d'abord, puis ballonner le sac par-dessus. C'est l'inverse :

     1. la pointe du sporangiophore GONFLE et devient le sporocyste entier,
        noyaux et cytoplasme poussant vers l'apex ;
     2. le cytoplasme s'organise : riche en peripherie sous la paroi, tres
        vacuolise au centre ;
     3. une serie de petites VACUOLES apparait juste au-dessus du centre,
        s'aplatissent et coalescent en une cavite de clivage ;
     4. une paroi se forme du cote interne de cette cavite et separe le
        centre — la columelle — de la peripherie. Elle se BOMBE et pousse
        dans le sporocyste ;
     5. la peripherie se clive en spores.

   La columelle est donc un SEPTUM qui bombe, pas un bourgeon qui pousse. Et
   le sac n'arrive pas par-dessus elle : il est la depuis le debut, c'est la
   pointe elle-meme. Sources : biologylearner (Rhizopus), Wikipedia Mucor. */
export const PHASES = ['rhizoides', 'montee', 'renflement', 'cavite', 'columelle', 'clivage', 'pression', 'eclatement', 'envol'];

/* Duree de chaque phase en secondes simulees. Une sporulation reelle prend
   des heures ; on la joue en deux minutes, et c'est assume — le but est de
   voir le mecanisme, pas d'attendre. */
const DUREES = { rhizoides: 7, montee: 26, renflement: 13, cavite: 7, columelle: 8, clivage: 24, pression: 999, eclatement: 1.6, envol: 999 };

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
    this.cav = 0;              // avancement de la cavite de clivage
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
      /* Vers le BAS de l'image, entre 30 et 150 degres : ce sont des
         racines. Reparties sur tout le tour, la moitie remontait au-dessus
         du stolon et on lisait des branches, pas un ancrage. */
      const a = (0.17 + (i + this.rng() * 0.7) / n * 0.66) * Math.PI;
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
      if (u >= 1) this.passer('renflement');

    } else if (P === 'renflement') {
      /* LA POINTE DEVIENT LE SPOROCYSTE. Ce n'est pas un sac qui arrive
         par-dessus quelque chose : c'est l'apex lui-meme qui gonfle, les
         noyaux et le cytoplasme poussant vers lui. La columelle n'existe
         pas encore. */
      this.rSac = lerp(R_TIGE * 1.15, R_SAC, smoothstep(0, 1, u));
      this.monter(Z_TOTAL);
      this.majSac(dt);
      if (u >= 1) this.passer('cavite');

    } else if (P === 'cavite') {
      /* Une serie de petites vacuoles apparait juste au-dessus du centre,
         s'aplatissent et coalescent en une CAVITE DE CLIVAGE. C'est elle
         qui dessine ou le septum va se former. */
      this.cav = smoothstep(0, 1, u);
      this.majSac(dt);
      if (u >= 1) this.passer('columelle');

    } else if (P === 'columelle') {
      /* Une paroi se forme du cote interne de la cavite, separe le centre
         de la peripherie, et se BOMBE en poussant dans le sporocyste. */
      this.rCol = R_COL * smoothstep(0, 1, u);
      this.cav = 1 - smoothstep(0.35, 1, u);
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
      this.majSac(dt);
      if (u >= 1) this.passer('pression');

    } else if (P === 'pression') {
      const vise = Math.min(N_SPORES, Math.round(N_SPORES * (0.78 + 0.03 * this.tPhase)));
      while (this.spores.length < vise) this.naitreSpore();
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

    /* LA MATURATION NE S'ARRETE PAS A LA RUPTURE. Rangee dans les phases
       de clivage et de mise sous pression, elle laissait les dernieres nees
       a 2,6 um — et la camera suit justement une spore partie loin, donc
       tardive : on la regardait a soixante pour cent de sa taille, et le
       detail qu'elle porte ne tenait pas dans les pixels qui restaient. */
    for (const s of this.spores) {
      if (s.r < s.rMax) s.r = Math.min(s.rMax, s.r + s.rMax * dt * 0.55);
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
      /* L'INCLINAISON. A 0,16 dans l'image pour 1 en z, la tige pointait
         quasiment sur l'observateur : on la voyait EN BOUT, et la columelle
         — un corps de revolution autour de cet axe — sortait en lentille
         plate de 80 px de large pour 15 de haut au lieu d'un dome. A 0,55,
         l'axe fait environ 55 degres avec la ligne de visee : le dome est
         un dome, et la montee en z reste entiere, donc le flou raconte la
         meme chose. C'est lui qui dit qu'on s'eleve, pas la pente. */
      this.tige.push({
        x: p.x + Math.sin(this.incl) * dz * 0.16,
        y: p.y - Math.cos(this.incl) * dz * 0.55,
        z: p.z + dz,
      });
    }
  }

  /**
   * Demi-largeur du sporangiophore, a la distance `q` de sa POINTE.
   *
   * C'est un profil d'apex, pas un tube coupe : la meme ogive que
   * `Hyphe.W`, calotte de 1,40 R et exposant 2,1 — les valeurs arretees pour
   * l'hyphe. Un sporangiophore EST une hyphe, il pousse par son apex, et
   * rien ne justifie qu'il se termine autrement.
   *
   * LA COLUMELLE SORT DE CE PROFIL. Elle etait dessinee a part, en cercle
   * plein pose au bout de la tige : on lisait une bille accrochee a un
   * baton, et elle apparaissait des la premiere seconde parce que la pointe
   * arrondie, elle aussi dessinee a part, en avait deja l'air. C'est la
   * regle 1, celle qui a coule le projet precedent, refaite a l'identique.
   * Ici la columelle est une SECONDE OGIVE, plus large, qui prend le dessus
   * a mesure qu'elle gonfle, et qui se raccorde a la tige par une
   * decroissance exponentielle — l'apophyse.
   */
  profil(q, rc = this.rCol) {
    const n = 2.1;
    const ogive = (R, Lc) => (q >= Lc ? R
      : R * Math.pow(Math.max(1 - Math.pow((Lc - q) / Lc, n), 0), 1 / n));

    let w = ogive(R_TIGE, 1.40 * R_TIGE);
    /* Evasement a la base : elle sort d'un stolon deux fois plus large. */
    const z = Math.max(0, this.z - q);
    w *= 1 + 1.5 * Math.exp(-z / 22);

    /* L'APOPHYSE : le col evase sous le sporocyste. Elle se forme avec le
       renflement — c'est le raccord entre une tige de 4 um et une sphere de
       40 — et non avec la columelle, qui vient bien plus tard. Sans elle le
       tube rencontrait la sphere a angle droit.

       ELLE EST OGIVEE, COMME TOUT LE RESTE. Ecrite en tronc de cone — une
       interpolation de la largeur qui s'arretait a q = 0 —, elle se
       terminait par une COUPE FRANCHE de vingt micrometres de large, avec
       le lisere de paroi en travers. Tant que la columelle etait la pour
       la coiffer, on ne la voyait pas ; des que l'ordre a ete corrige et
       que le renflement s'est retrouve seul, on a lu un gobelet pose dans
       le ballon. C'est la regle 1 une troisieme fois : une extremite se
       ferme, sinon elle est coupee.

       0,34 R et non 0,52 : a 0,52 le dome de l'apophyse faisait deja la
       taille de la columelle, et celle-ci n'avait plus rien a ajouter en
       se formant. Le geste de la phase suivante — le septum qui bombe — ne
       se voyait plus. */
    if (this.rSac > R_TIGE * 1.2) {
      const a = this.rSac * 0.34;
      const La = 1.30 * a;
      const wa = q >= La ? a * Math.exp(-(q - La) / (a * 1.30)) : ogive(a, La);
      w = Math.max(w, wa);
    }

    if (rc > 0.3) {
      const Lc = 1.30 * rc;
      const wc = q >= Lc ? rc * Math.exp(-(q - Lc) / (rc * 0.62)) : ogive(rc, Lc);
      w = Math.max(w, wc);
    }
    return w;
  }

  /**
   * Part de columelle a l'abscisse `q`, mesuree depuis la pointe. Sert a
   * l'assombrir : c'est du cytoplasme dense, la piece la plus sombre d'un
   * sporocyste.
   *
   * Le rayon est un PARAMETRE, comme dans `profil` : la cavite de clivage
   * dessine le contour de la columelle a venir alors que `rCol` vaut encore
   * zero. Deux definitions de « ou est la columelle » finiraient par ne
   * plus coincider, et le septum se formerait a cote de la cavite qui
   * l'annonce.
   *
   * Definie sur le MATERIAU et non sur la largeur. Comparee a la largeur du
   * tube nu, elle tombait a zero sur toute l'ogive apicale de la columelle
   * — la ou le profil est plus ETROIT que la tige — et le sommet du dome se
   * dessinait en couleur de cytoplasme, donc invisible sur le sac. Le dome
   * paraissait coupe net aux deux tiers de sa hauteur.
   */
  partCol(q, rc = this.rCol) {
    if (rc < 0.3) return 0;
    return 1 - smoothstep(1.5 * rc, 2.9 * rc, q);
  }

  /**
   * Longueur du CORPS COMPACT a la pointe, en um depuis la pointe.
   *
   * C'est la columelle quand elle existe, sinon le renflement apical lui-
   * meme — l'apophyse. Le rendu s'en sert pour dessiner ce corps d'un seul
   * tenant : decoupe en bandes de profondeur, une piece compacte sort
   * coupee net a la hauteur d'un changement de calque.
   */
  get qCompact() {
    const r = Math.max(this.rCol, this.rSac > R_TIGE * 1.2 ? this.rSac * 0.34 : 0);
    return r > 0.3 ? r * 2.9 : 0;
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

  /**
   * Le contenu d'une spore, tire une fois pour toutes.
   *
   * Une spore est une CELLULE : paroi epaisse, membrane, cytoplasme
   * granuleux, un noyau, des globules lipidiques, des mitochondries. On ne
   * le construit que pour celle qu'on regarde de pres — a dix-huit pixels
   * rien de tout ca n'est lisible, et il y en a cinq cents.
   */
  detailler(s) {
    if (s.org) return s.org;
    const rng = mulberry32(((s.ang * 1e6) | 0) ^ 0x9e37);
    const org = [];
    /* Le noyau, un peu excentre : centre, il a l'air dessine. */
    org.push({ t: 'noyau', x: (rng() - 0.5) * 0.4, y: (rng() - 0.5) * 0.4,
               a: 0.30 + rng() * 0.07, ang: rng() * TAU });
    /* Globules lipidiques : ce sont eux qui rendent une spore refringente. */
    for (let i = 0; i < 2 + ((rng() * 2) | 0); i++) {
      const a = rng() * TAU, d = 0.30 + rng() * 0.30;
      org.push({ t: 'lipide', x: Math.cos(a) * d, y: Math.sin(a) * d,
                 a: 0.11 + rng() * 0.09, ang: rng() * TAU });
    }
    for (let i = 0; i < 4 + ((rng() * 4) | 0); i++) {
      const a = rng() * TAU, d = 0.25 + rng() * 0.38;
      org.push({ t: 'mito', x: Math.cos(a) * d, y: Math.sin(a) * d,
                 a: 0.17 + rng() * 0.08, b: 0.05 + rng() * 0.02, ang: rng() * TAU });
    }
    /* 46 grains et non 26 : a vingt-sept pixels de rayon, vingt-six points
       se comptent, et un cytoplasme dont on compte les grains n'est pas
       granuleux — c'est un semis. Le cytoplasme de l'apex en porte le
       meme ordre par unite de surface. */
    for (let i = 0; i < 46; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 0.66;
      org.push({ t: 'grain', x: Math.cos(a) * d, y: Math.sin(a) * d,
                 a: 0.026 + rng() * 0.026, clair: rng() < 0.4 });
    }
    s.org = org;
    return org;
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
