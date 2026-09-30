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
import { MATRICE_NEUTRE } from './matrices.js';

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

/* CE QU'UNE STRUCTURE COUTE, ET CE N'EST PAS LA MORT. Une hyphe qui rencontre
   un globule gras le contourne ou le traverse lentement ; elle n'en meurt
   pas. A 1 — structure retranchee en plein — le facteur tombait sous le seuil
   de famine des qu'on touchait une cloison, et les sept plateaux mouraient au
   demarrage : 0,1 a 4,2 mm de mycelium contre 69 sur la gelose, zero pointe
   vivante partout. A 0,75, une pointe prise dans une structure pleine pousse
   au quart de sa vitesse — elle peine, elle cherche, elle sort. Ce qui
   l'oriente, c'est le tropisme de matrice, qui lit deja `facteur` a gauche et
   a droite du cap : il n'y a pas de second mecanisme. */
const K_STRUCT = 0.75;

/* En dessous, on considere qu'une spore peut germer la. */
const SEUIL_PASSAGE = 0.12;

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
    /* LE PLATEAU. Par defaut la gelose sur laquelle le macro a ete calibre :
       une matrice de jeu ne doit pas pouvoir changer ce qui a ete mesure
       ailleurs. Voir `sim/matrices.js`. */
    this.mat = opts.matrice || MATRICE_NEUTRE;
    /* L'UNITE DE CROISSANCE HYPHALE EST UN TRAIT DU GENOME : ramifier dense
       ou filer loin. 110 um est la valeur de Trinci, et c'est la valeur par
       defaut ; le jeu la module, personne d'autre. */
    this.uch = UCH * (opts.uch ?? 1);
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
    /* Les anastomoses reellement faites : {a, i, b, j}. Voir `pas`. */
    this.jonctions = [];
    /* Modulation facultative de la vitesse d'une pointe, et consigne de cap
       facultative. Les deux servent au jeu et a lui seul. Voir `pas`. */
    this.modul = null;
    this.consigne = null;

    /* UNE COLONIE GREFFEE SUR UN GERME DEJA CONSTRUIT. C'est ce dont le
       cycle a besoin : le thalle qu'on regarde de loin doit etre le germe
       qu'on regardait de pres, pas une autre colonie de la meme espece.
       Chaque tube germinatif devient une pointe macro, avec son axe. */
    if (opts.germes && opts.germes.length) {
      for (const g of opts.germes) this.greffer(g.pts, g.th);
      return;
    }
    /* Une spore germe par trois tubes germinatifs, repartis. Un seul donnerait
       une colonie qui pousse d'un cote pendant dix minutes. */
    const th0 = this.rng() * TAU;
    /* OU LA SPORE EST TOMBEE. Sur la gelose, a l'origine. Sur un aliment, la
       ou il y a de quoi : une spore tombee au fond d'une alveole de mie ne
       germe pas, et faire demarrer toutes les parties sur un point mort
       n'apprend rien au joueur. On cherche donc un depart praticable, en
       spirale autour de l'origine — c'est aussi ce que fait une spore, qui
       tombe par milliers et dont une seule s'en sort. */
    const [dx, dy] = this.depart();
    for (let i = 0; i < 3; i++) this.semer(dx, dy, th0 + (i / 3) * TAU, 0);
  }

  /**
   * Greffe un axe deja construit — par la micro — et rend sa pointe.
   *
   * On repasse par `inscrire`, qui ne memorise un point que tous les 6 um et
   * qui pose la densite au passage : l'axe greffe est donc indiscernable
   * d'un axe que le macro aurait construit lui-meme, et la pointe reprend
   * exactement ou la micro s'etait arretee.
   */
  greffer(pts, th) {
    const p = this.semer(pts[0][0], pts[0][1], th, 0);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.inscrire(p, pts[i][0], pts[i][1], th, d);
    }
    return p;
  }

  /**
   * @param {{ax:number, i:number}} [lien]  le point d'axe dont celui-ci sort.
   *   Il ne sert pas a la colonie — une branche pousse aussi bien sans savoir
   *   d'ou elle vient — mais le JEU en a besoin : sans lui, le reseau n'est
   *   pas connexe et la reserve ne peut pas remonter du parent vers la
   *   branche. Un thalle est un reseau, pas une collection de courbes.
   */
  semer(x, y, th, gen, lien = null) {
    /* L'indice est porte par l'axe : le chercher avec indexOf coutait O(n)
       a chaque point memorise, soit la moitie du temps de calcul une fois
       passe le millier d'axes. */
    const axe = { idx: this.axes.length, xs: [x], ys: [y], n: 1, x0: x, y0: y, x1: x, y1: y, gen, lien };
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

  /**
   * Un point de depart praticable : peu de structure et de quoi manger.
   * Sur la matrice neutre, `struct` vaut 0 partout et on rend (0, 0) du
   * premier coup — rien ne change pour les pages qui existaient.
   */
  depart() {
    /* ON NE CHERCHE QUE CE QUI BLOQUE, PAS CE QUI NOURRIT, et la nuance
       n'est pas mineure : en cherchant le point le plus RICHE, la gelose
       elle-meme demarrait 107 um a cote de l'origine, sur un maximum du
       bruit — et toute la calibration bougeait avec. Mesure : 447 pointes a
       quatre heures au lieu de 386, et les verdicts 14, 19 et 20 tombaient.
       Une spore ne choisit pas ou elle tombe ; elle tombe, et ou il y a un
       mur elle ne germe pas. On ne cherche donc qu'un point PRATICABLE, et
       sur une matrice sans structure c'est l'origine, du premier coup. */
    if (this.struct(0, 0) < SEUIL_PASSAGE) return [0, 0];
    for (let k = 1; k < 200; k++) {
      const a = k * 2.399963, r = 26 * Math.sqrt(k);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (this.struct(x, y) < SEUIL_PASSAGE) return [x, y];
    }
    return [0, 0];
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
  matrice(x, y) { return this.mat.nut(x, y); }

  /**
   * CE QUI BLOQUE : 0 libre, 1 infranchissable. Alveoles d'une mie, globules
   * gras d'un fromage, cloisons d'un parenchyme, fibres d'une charcuterie.
   *
   * Elle entre dans `facteur`, donc une pointe qui s'y enfonce meurt de
   * faim — et comme le tropisme de matrice echantillonne `facteur` a gauche
   * et a droite du cap, UNE HYPHE SUIT LES INTERSTICES SANS QU'ON AIT RIEN
   * AJOUTE. C'est le meme terme qui orientait deja le front vers le riche :
   * il n'y a pas de second mecanisme, et c'est tout l'interet.
   *
   * La matrice neutre rend 0 partout : `thalle.html`, `monde.html` et
   * `cycle.html` ne voient aucune difference, et le verdict 13 non plus.
   */
  struct(x, y) { return this.mat.struct(x, y); }

  /**
   * Facteur de croissance REELLEMENT vu par une pointe : la matrice, moins
   * ce que le mycelium y a deja consomme. Un tube qui revient sur une zone
   * deja colonisee n'y trouve plus rien.
   */
  facteur(x, y) {
    return this.matrice(x, y) * Math.max(0, 1 - this.densite(x, y) / DENS_SAT)
         * (1 - K_STRUCT * this.struct(x, y));
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
      /* Une pointe VISITEE n'est plus integree ici : c'est la simulation
         micro qui la pilote, et elle rend son materiau par `inscrire`. Elle
         continue de compter pour la regle de ramification — c'est la meme
         colonie. */
      if (p.micro) continue;

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
      /* MODULATION EXTERIEURE, et elle est facultative. La colonie
         contemplative n'en a pas : une pointe pousse a `v0 . f(matrice)`,
         c'est la loi calibree sur la micro (verdict 13) et elle ne se
         negocie pas. Le JEU, lui, ajoute une seconde contrainte — la
         reserve qui arrive jusqu'a cette pointe-la — et c'est par ici
         qu'elle entre. A `modul` absent, rien ne change. */
      const v = this.v0 * f * (this.modul ? this.modul(p) : 1);
      const da = v * dt;

      /* 1. Consigne de cap. Trois termes, et un seul est esthetique. */
      /*    a) derive lente : une hyphe libre n'est pas droite, elle serpente.
             Meme bruit et meme amplitude que la micro. */
      let cible = (noise1((this.t + p.phase) * 0.055, 31) - 0.5) * 1.5;

      /* CONSIGNE EXTERIEURE, facultative elle aussi. Une pointe TENUE par le
         joueur est conduite : on lui donne un cap, et les trois termes
         ci-dessous ne s'appliquent plus. Elle garde en revanche l'inertie
         (8,5 s mesurees) et le rayon de virage — on conduit une pointe, on
         ne la telecommande pas. */
      const forcee = this.consigne ? this.consigne(p) : null;

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
      const omCible = clamp(forcee !== null && forcee !== undefined ? forcee : cible, -1, 1) * this.omMax;
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
          let fusion = null;
          const px = p.x, py = p.y, pl = p.l;
          this.pres(px, py, (a2, i) => {
            if (a2 === ax && pl - i * PAS_GEO < AGE_MIN_ANASTOMOSE) return false;
            const dx = px - a2.xs[i], dy = py - a2.ys[i];
            if (dx * dx + dy * dy < D_ANASTOMOSE * D_ANASTOMOSE) { fusion = { ax: a2.idx, i }; return true; }
            return false;
          });
          if (fusion) {
            p.vive = false; this.anastomoses++;
            /* ON RETIENT LA JONCTION. Pour la colonie, une anastomose n'est
               qu'une pointe qui s'arrete ; pour le jeu c'est un RACCOURCI,
               la seule facon qu'a la reserve d'aller d'une branche a l'autre
               sans repasser par l'origine. Sans cette liste, l'anastomose
               reste l'ornement qu'elle etait. */
            this.jonctions.push({ a: ax.idx, i: ax.n - 1, b: fusion.ax, j: fusion.i });
          }
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
    if (vives.length && vives.length < this.maxPointes && quota / vives.length > this.uch) {
      this.ramifier(vives);
    }
  }

  /**
   * Enregistre le materiau construit par une pointe que la MICRO pilote.
   *
   * L'axe ne s'interrompt jamais : la meme pointe, le meme axe, decrit
   * finement tant qu'on la regarde et grossierement sinon. Le macro ne
   * garde que son point tous les 6 um — quand on remontera, il n'y aura
   * rien a raccorder.
   */
  inscrire(p, x, y, th, da) {
    p.x = x; p.y = y; p.th = th;
    p.l += da; this.total += da; p.depuisGeo += da;
    if (p.depuisGeo >= PAS_GEO) {
      p.depuisGeo = 0;
      const ax = p.axe;
      ax.xs.push(x); ax.ys.push(y); ax.n++;
      if (x < ax.x0) ax.x0 = x; if (x > ax.x1) ax.x1 = x;
      if (y < ax.y0) ax.y0 = y; if (y > ax.y1) ax.y1 = y;
      this.poser(x, y, ax.idx, ax.n - 1, PAS_GEO);
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

    this.semer(bx, by, best.th + cote * ang, best.gen + 1, { ax: ax.idx, i });
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
  get uchMesuree() { const n = this.vives; return n ? this.total / n : 0; }
}
