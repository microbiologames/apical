/* ---------------------------------------------------------------------------
   Le THALLE : l'echelle macro. Tout le mycelium, en permanence.

   Par pointe : un axe grossier, un cap avec inertie, une vitesse, une regle
   de ramification. Rien d'autre. Pas de vesicules, pas de membrane, pas de
   contenu — ces pieces-la sont attachees a UNE hyphe, celle qu'on regarde.

   LA CONTRAINTE QUI TIENT TOUT. La vitesse macro est CALIBREE sur la micro,
   jamais choisie. L'apex micro pousse a ~19 um/min parce que ses vesicules
   fusionnent ; c'est un resultat, pas un reglage. Si on ecrivait ici une
   vitesse de notre cru, la forme de la colonie dependrait de l'endroit qu'on
   regarde, et zoomer changerait le jeu. Meme chose pour le virage : OM_MAX
   n'est pas un chiffre d'auteur, c'est v/R avec le rayon de virage mesure au
   banc. Verdict 13 le verifie.

   Deux niveaux de detail sur la geometrie aussi. Un point d'axe tous les
   0,22 um — le pas micro — ferait 45 millions de points pour dix metres de
   mycelium. Ici c'est un point tous les 6 um ; seule l'hyphe visitee sera
   re-echantillonnee fin. On ne voit jamais le detail fin et le lointain en
   meme temps, donc personne ne le remarque.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, mulberry32, fbm2, noise1, TAU } from '../core/util.js';

/* Unite de croissance hyphale, Trinci : longueur totale / nombre de pointes.
   Quand le quota est depasse, la colonie ramifie. C'est LA regle — une
   ramification tiree au hasard donne une eponge, pas une colonie. */
export const UCH = 110;

/* Rayon de virage mesure au banc sur la micro, a consigne pleine. */
export const R_VIRAGE = 58;

/**
 * Vitesse de la micro, um/min. ELLE N'EST PAS CHOISIE ICI : c'est ce que le
 * banc mesure sur la simulation apicale, ou l'apex avance parce que ses
 * vesicules fusionnent. Le verdict 13 fait tourner les deux cote a cote et
 * refuse l'ecart — sans lui, la forme de la colonie dependrait de l'endroit
 * qu'on regarde, et zoomer changerait le jeu.
 */
export const V_MICRO = 19.4;
/* Inertie du cap, en secondes. Meme passe-bas que la micro. */
const TAU_OM = 3.5;

/* Pas de temps macro : 0,25 s simulee. La publi ne demande rien de plus fin —
   a 19 um/min une pointe avance de 80 nm par pas, soit un centieme de son
   diametre. */
const PAS_T = 0.25;
/* um entre deux points d'axe memorises. A 6 um une hyphe de 1 mm tient en
   167 points ; a 0,22 (le pas micro) elle en ferait 4 500. */
const PAS_GEO = 6;

/* Force de l'autotropisme negatif, sans dimension. */
const K_REPULSE = 0.85;

/* Distance de fusion, um. L'anastomose est ce qui fait un RESEAU et non un
   arbre : derriere le front, les hyphes se rejoignent. Une pointe qui touche
   une hyphe deja construite s'arrete la. */
const D_ANASTOMOSE = 4;
/* On ne fusionne pas avec son propre passe recent, sinon une pointe qui
   serpente s'auto-anastomose au bout de deux virages. */
const AGE_MIN_ANASTOMOSE = 90;

/* DEUX grilles, et c'est une mesure qui l'impose.

   La repulsion a besoin d'une tendance, pas de points : une grille de
   DENSITE, une maille de 60 um, et l'autotropisme lit le gradient — quatre
   consultations par pointe et par pas. En parcourant les points un par un,
   deux heures de colonie coutaient 39 s de calcul, l'essentiel passe a
   scanner des cellules qui contiennent des centaines de points.

   L'anastomose, elle, a besoin de precision : une maille fine de 8 um, ou
   une requete a 4 um ne touche que quatre cellules quasi vides. */
export const MAILLE_DENS = 60;
const MAILLE_FINE = 8;
/* um de mycelium dans une cellule de 60 um au-dela desquels la repulsion est
   a fond. */
const DENS_PLEINE = 250;
/* Densite a laquelle le substrat d'une cellule est EPUISE. 150 um d'hyphe de
   11 um de large dans 3 600 um^2, soit 46 % de couverture.

   C'est ce qui manquait, et sans quoi le modele s'emballe : la regle de
   Trinci fait doubler le nombre de pointes tous les 5,7 min, la colonie ne
   s'etend que lineairement, et au bout d'une heure on avait 614 mm d'hyphe
   dans un disque de 2,4 mm — 140 mm par mm^2, soit plus de 100 % de
   couverture. Une vraie colonie est limitee par ce qu'elle mange. Le
   substrat consomme est aussi, mot pour mot, le plateau de jeu. */
export const DENS_SAT = 150;
/* En dessous de ce facteur local, la pointe est a la famine et s'arrete. Ca
   elague l'interieur sature et borne le nombre de pointes par la
   circonference du front, pas par un plafond arbitraire. */
const FAMINE = 0.05;

export class Thalle {
  /**
   * @param {object} opts
   *   graine   entier, pour que la colonie soit reproductible. Sans ca elle
   *            se re-tirerait dans le dos du joueur pendant qu'il est
   *            ailleurs, et ca se verrait.
   *   vMicro   um/min mesures sur la simulation micro. OBLIGATOIRE de venir
   *            de la, pas d'ici.
   */
  constructor(opts = {}) {
    this.graine = opts.graine ?? 20260928;
    this.rng = mulberry32(this.graine);
    this.vMicro = opts.vMicro ?? 19.4;     // um/min
    this.v0 = this.vMicro / 60;            // um/s
    this.omMax = this.v0 / R_VIRAGE;       // rad/s a consigne pleine
    this.maxPointes = opts.maxPointes ?? 1400;

    this.t = 0;
    this.total = 0;            // um de mycelium construits
    this.branchements = 0;
    this.anastomoses = 0;
    this.famines = 0;

    this.axes = [];            // polylignes figees : {xs, ys, n, x0,y0,x1,y1, gen}
    this.pointes = [];
    this.dens = new Map();     // cellule 60 um -> um de mycelium
    this.fin = new Map();      // cellule 8 um  -> [idxAxe, i, ...]

    /* Une spore germe par trois tubes germinatifs, repartis. Un seul donnerait
       une colonie qui pousse d'un cote pendant dix minutes. */
    const th0 = this.rng() * TAU;
    for (let i = 0; i < 3; i++) this.semer(0, 0, th0 + (i / 3) * TAU, 0);
  }

  semer(x, y, th, gen) {
    /* L'indice est porte par l'axe : le chercher avec indexOf coutait O(n)
       a chaque point memorise, soit la moitie du temps de calcul une fois
       passe le millier d'axes. */
    const axe = { idx: this.axes.length, xs: [x], ys: [y], n: 1, x0: x, y0: y, x1: x, y1: y, gen };
    this.axes.push(axe);
    const p = {
      x, y, th, om: 0, gen, axe,
      l: 0,              // um construits par cette pointe
      depuisGeo: 0,      // um depuis le dernier point memorise
      vive: true,
      phase: this.rng() * 1000,   // decalage du bruit de derive
    };
    this.pointes.push(p);
    return p;
  }

  /* --- la matrice : le plateau de jeu ------------------------------------ */

  /**
   * Facteur de croissance local, sans dimension. 1 = les conditions dans
   * lesquelles la micro a ete mesuree ; c'est ce qui rend la calibration
   * verifiable (verdict 13 fait tourner le macro a matrice = 1).
   *
   * Deux octaves de bruit : des plages favorables de ~900 um et une trame
   * plus fine de ~250 um. Les valeurs vont de 0,35 a 1,25 — au-dela de 1,3
   * la colonie file en etoile vers les zones riches et on ne lit plus un
   * front, on lit un oursin.
   */
  matrice(x, y) {
    const a = fbm2(x / 900, y / 900, 71);
    const b = fbm2(x / 250, y / 250, 113);
    return clamp(0.35 + 1.15 * (0.68 * a + 0.32 * b), 0.35, 1.25);
  }

  /**
   * Facteur de croissance REELLEMENT vu par une pointe : la matrice, moins
   * ce que le mycelium y a deja consomme. Un tube qui revient sur une zone
   * deja colonisee n'y trouve plus rien.
   */
  facteur(x, y) {
    return this.matrice(x, y) * Math.max(0, 1 - this.densite(x, y) / DENS_SAT);
  }

  /* --- grilles ------------------------------------------------------------ */

  /** Densite de la cellule qui contient (x, y), en um de mycelium. */
  densite(x, y) {
    return this.dens.get((Math.floor(x / MAILLE_DENS) * 73856093)
                       ^ (Math.floor(y / MAILLE_DENS) * 19349663)) || 0;
  }

  /** Enregistre un troncon de `long` um termine en (x, y). */
  poser(x, y, ax, i, long) {
    const kd = (Math.floor(x / MAILLE_DENS) * 73856093) ^ (Math.floor(y / MAILLE_DENS) * 19349663);
    this.dens.set(kd, (this.dens.get(kd) || 0) + long);
    const kf = (Math.floor(x / MAILLE_FINE) * 73856093) ^ (Math.floor(y / MAILLE_FINE) * 19349663);
    let c = this.fin.get(kf);
    if (!c) { c = []; this.fin.set(kf, c); }
    c.push(ax, i);
  }

  /** Points memorises dans les cellules fines autour de (x, y). */
  pres(x, y, f) {
    const c0 = Math.floor((x - MAILLE_FINE) / MAILLE_FINE), c1 = Math.floor((x + MAILLE_FINE) / MAILLE_FINE);
    const d0 = Math.floor((y - MAILLE_FINE) / MAILLE_FINE), d1 = Math.floor((y + MAILLE_FINE) / MAILLE_FINE);
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = d0; cy <= d1; cy++) {
        const c = this.fin.get((cx * 73856093) ^ (cy * 19349663));
        if (!c) continue;
        for (let j = 0; j < c.length; j += 2) if (f(this.axes[c[j]], c[j + 1])) return;
      }
    }
  }

  /* --- avance ------------------------------------------------------------- */

  /** `dt` en secondes simulees. Decoupe en pas macro de 0,25 s. */
  maj(dt) {
    let reste = dt;
    while (reste > 1e-6) {
      const h = Math.min(PAS_T, reste);
      this.pas(h);
      reste -= h;
    }
  }

  pas(dt) {
    this.t += dt;
    const vives = [];
    for (const p of this.pointes) {
      if (!p.vive) continue;
      vives.push(p);

      /* On lit le substrat une MAILLE DEVANT : la cellule ou la pointe va
         entrer, et ou elle n'a rien pose. Lu sous elle, elle se freinait sur
         sa propre trace — un troncon de 60 um dans une cellule qui sature a
         150 en consomme 40 %, si bien qu'une pointe isolee en milieu neutre
         poussait a 18,6 um/min au lieu des 19,4 de la micro. Ce n'etait pas
         un artefact de banc : toute la colonie s'etendait 25 % trop
         lentement, et le front n'atteignait jamais la vitesse de sa propre
         pointe. Une hyphe consomme derriere elle, pas devant. */
      const f = this.facteur(p.x + Math.cos(p.th) * MAILLE_DENS,
                             p.y + Math.sin(p.th) * MAILLE_DENS);
      if (f < FAMINE) { p.vive = false; p.famine = true; this.famines++; continue; }
      const v = this.v0 * f;
      const da = v * dt;

      /* 1. Consigne de cap. Trois termes, et un seul est esthetique. */
      /*    a) derive lente : une hyphe libre n'est pas droite, elle serpente.
             Meme bruit et meme amplitude que la micro. */
      let cible = (noise1((this.t + p.phase) * 0.055, 31) - 0.5) * 1.5;

      /*    b) autotropisme NEGATIF : on descend le gradient de densite. C'est
             ce qui fait une colonie plutot qu'une fougere — sans lui les
             branches repartent dans l'axe du parent et le thalle se referme
             sur lui-meme. Quatre consultations de grille, pas un parcours de
             points : voir MAILLE_DENS. */
      const m = MAILLE_DENS;
      const gx = this.densite(p.x + m, p.y) - this.densite(p.x - m, p.y);
      const gy = this.densite(p.x, p.y + m) - this.densite(p.x, p.y - m);
      const g = Math.hypot(gx, gy);
      if (g > 1e-6) {
        let d = Math.atan2(-gy, -gx) - p.th;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        cible += clamp(d, -1, 1) * K_REPULSE * clamp(g / DENS_PLEINE, 0, 1);
      }

      /*    c) la matrice oriente le front : on echantillonne a gauche et a
             droite du cap et on tourne vers le meilleur. C'est le tropisme
             qui fera le plateau de jeu. */
      const e = 28;
      const gl = this.facteur(p.x + Math.cos(p.th - 0.7) * e, p.y + Math.sin(p.th - 0.7) * e);
      const gr = this.facteur(p.x + Math.cos(p.th + 0.7) * e, p.y + Math.sin(p.th + 0.7) * e);
      cible += clamp((gr - gl) * 2.2, -0.8, 0.8);

      /* 2. Le cap suit avec la MEME inertie que la micro, et la vitesse
            angulaire maximale est v/R avec le rayon mesure au banc. */
      const omCible = clamp(cible, -1, 1) * this.omMax;
      p.om += (omCible - p.om) * clamp(dt / TAU_OM, 0, 1);
      p.th += p.om * dt;

      /* 3. Avance. */
      p.x += Math.cos(p.th) * da;
      p.y += Math.sin(p.th) * da;
      p.l += da;
      this.total += da;
      p.depuisGeo += da;

      /* 4. Un point d'axe tous les 6 um. */
      if (p.depuisGeo >= PAS_GEO) {
        p.depuisGeo = 0;
        const ax = p.axe;
        ax.xs.push(p.x); ax.ys.push(p.y); ax.n++;
        if (p.x < ax.x0) ax.x0 = p.x; if (p.x > ax.x1) ax.x1 = p.x;
        if (p.y < ax.y0) ax.y0 = p.y; if (p.y > ax.y1) ax.y1 = p.y;
        this.poser(p.x, p.y, ax.idx, ax.n - 1, PAS_GEO);

        /* 5. Anastomose : une pointe qui touche une hyphe deja construite
              s'arrete la. C'est ce qui fait un reseau et non un arbre.

              Mais PAS avant 90 um. Une branche nait SUR sa mere, a 4 um de
              son axe : sans ce delai elle s'anastomosait a la naissance, et
              16 552 branches sur 17 435 mouraient dans la seconde. L'unite
              de croissance hyphale grimpait alors a 1 142 um au lieu des 110
              de Trinci, ce qui est le symptome : la regle de ramification
              tournait a vide. */
        if (p.l > AGE_MIN_ANASTOMOSE) {
          let fusion = false;
          const px = p.x, py = p.y, pl = p.l;
          this.pres(px, py, (a2, i) => {
            if (a2 === ax && pl - i * PAS_GEO < AGE_MIN_ANASTOMOSE) return false;
            const dx = px - a2.xs[i], dy = py - a2.ys[i];
            if (dx * dx + dy * dy < D_ANASTOMOSE * D_ANASTOMOSE) { fusion = true; return true; }
            return false;
          });
          if (fusion) { p.vive = false; this.anastomoses++; }
        }
      }
    }

    /* 6. Ramification. UNE regle, celle de Trinci : on ramifie quand la
          longueur moyenne construite par pointe DEPUIS SA DERNIERE BRANCHE
          depasse l'unite de croissance hyphale. On ne tire pas au sort
          « est-ce qu'on branche » — on tire au sort OU.

          « Depuis sa derniere branche », et non « longueur totale / nombre
          de pointes » : avec le total, les hyphes mortes par anastomose ou
          par famine continuaient de pousser au branchement alors qu'elles ne
          poussent plus. Le rapport s'emballait — 3 564 um par pointe au lieu
          de 110 — et la colonie branchait a chaque pas. Ici le compteur de
          la pointe choisie est remis a zero, donc la moyenne redescend : la
          regle est stable par construction. */
    let quota = 0;
    for (const p of vives) quota += p.l - (p.lBranche ?? 0);
    if (vives.length && vives.length < this.maxPointes && quota / vives.length > UCH) {
      this.ramifier(vives);
    }
  }

  /**
   * Fait partir une branche d'une pointe. Choisie parmi les plus longues
   * depuis leur derniere ramification : c'est le sub-apical qui branche, et
   * une pointe qui vient de brancher a epuise son quota.
   */
  ramifier(vives) {
    let best = null, bl = -1;
    for (let k = 0; k < 6; k++) {
      const p = vives[(this.rng() * vives.length) | 0];
      const d = p.l - (p.lBranche ?? 0);
      if (d > bl) { bl = d; best = p; }
    }
    if (!best || bl < 25) return;
    best.lBranche = best.l;

    /* 9 a 20 um derriere la pointe, comme la micro. */
    const recul = 9 + this.rng() * 11;
    const ax = best.axe;
    const i = Math.max(0, ax.n - 1 - Math.round(recul / PAS_GEO));
    const bx = ax.xs[i], by = ax.ys[i];

    /* 60 a 80 degres, du cote le plus libre : l'autotropisme negatif joue
       des la naissance, sinon une branche sur deux repart dans la colonie. */
    const m = MAILLE_DENS;
    const nx = -Math.sin(best.th), ny = Math.cos(best.th);
    const dPlus = this.densite(bx + nx * m, by + ny * m);
    const dMoins = this.densite(bx - nx * m, by - ny * m);
    const cote = dPlus < dMoins ? 1 : -1;
    const ang = (60 + this.rng() * 20) * Math.PI / 180;

    this.semer(bx, by, best.th + cote * ang, best.gen + 1);
    this.branchements++;
  }

  /* --- mesures ------------------------------------------------------------ */

  get vives() { let n = 0; for (const p of this.pointes) if (p.vive) n++; return n; }

  /** Diametre de la colonie, um. */
  get diametre() {
    let r = 0;
    for (const p of this.pointes) if (p.vive) r = Math.max(r, Math.hypot(p.x, p.y));
    return 2 * r;
  }

  /** Unite de croissance hyphale effective : longueur totale / pointes. */
  get uch() { const n = this.vives; return n ? this.total / n : 0; }
}
