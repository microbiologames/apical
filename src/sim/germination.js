/* ---------------------------------------------------------------------------
   LA GERMINATION : comment une spore redevient une hyphe.

   C'est le seul moment du cycle ou la croissance n'est PAS apicale. Une
   spore qui germe commence par gonfler dans TOUTES les directions a la
   fois — croissance isodiametrique —, et ce n'est qu'apres, quand un site
   de polarite s'est etabli, que la machine apicale demarre et qu'un tube
   part dans une direction. Sauter le gonflement, c'est faire sortir un tube
   d'une bille inerte ; c'est justement ce qui se voit.

   Les quatre temps, et chacun a son signe a l'ecran :

     1. DORMANCE. Paroi epaisse et ornementee, cytoplasme dense, quelques
        gros globules lipidiques refringents. Rien ne bouge : une spore
        dormante a un metabolisme quasi nul.
     2. IMBIBITION. Elle boit. Le volume ne change presque pas (+8 %) mais
        le contenu se remet en mouvement, des vacuoles apparaissent et la
        paroi se detend.
     3. GONFLEMENT. Le rayon passe de 4,0 a 6,6 um, soit x1,65 en rayon et
        x4,5 en volume — c'est la fourchette relevee sur les Mucorales
        (gonflement x1,5 a x3 en diametre). Les reserves lipidiques se
        consomment, la granulation monte : le ribosome se remet en route.
        La paroi s'AMINCIT, parce qu'elle s'etire sur une surface 2,7 fois
        plus grande sans qu'on en ait encore fabrique.
     4. POLARISATION. Un a trois sites se choisissent, et les vesicules s'y
        rassemblent. C'est un Spitzenkorper qui se forme AVANT qu'il y ait
        un tube pour le contenir — exactement le mecanisme A de la
        ramification (regle 7), a ceci pres qu'ici la mere est une spore.

   LE TUBE GERMINATIF EST UNE BRANCHE. Pas une analogie : c'est la meme
   classe, la meme option `branche`, le meme fond de bourgeon arrondi, le
   meme elargissement indexe sur le materiau, et la silhouette reste
   l'union (regle 7). La spore est simplement un corps de plus dans cette
   union — le conge circulaire donne tout seul le col concave qu'on voit
   au pied d'un tube germinatif.

   Et c'est pour ca que la spore n'est PAS dessinee a part : c'est un
   contour de plus dans le champ de distance, lu par le meme remplissage,
   la meme paroi et le meme halo que le tube. Une spore peinte par-dessus
   un tube, ce serait la regle 1 une quatrieme fois.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, mulberry32, noise1, TAU } from '../core/util.js';
import { Hyphe, brancherSur } from './hyphe.js';
import { Contenu } from './contenu.js';
import { pasMicro } from '../main.js';

/* Rayons, en um. 4,0 dormante : c'est R_SPORE de `sporange.js`, celles que
   le sporocyste vient de lacher. 6,6 gonflee, soit x1,65 en rayon. */
export const R_DORM = 4.0;
export const R_GONFLE = 6.6;

/* Rayon final du tube germinatif : celui d'une hyphe ordinaire. Il ne nait
   PAS a cette taille — `rBase` le fait demarrer a 0,36 R, soit 4 um de
   diametre, et il met 34 um a prendre son calibre. Un tube germinatif qui
   sort a onze micrometres de diametre sort d'une spore qui en fait treize :
   on ne lit plus une germination, on lit une haltere. */
const R_TUBE = 5.5;
const R_BASE = 0.36;
/* 60 um pour prendre son calibre, et non les 25 d'une branche ordinaire. Un
   tube germinatif est LONGTEMPS etroit : a 34 um il passait de 4 a 8,6 um de
   diametre en treize micrometres de pousse et sortait en cone, alors qu'un
   tube germinatif est a peu pres parallele sur ses premieres dizaines de
   micrometres. */
const R_MONTE = 60;

/* Profondeur d'enfoncement de l'apex sous la paroi de la spore, en um. Meme
   chiffre qu'a la ramification et pour la meme raison mesuree : le conge de
   l'union a 2,5 um de rayon, un apex pose plus pres ferait bomber la spore
   avant que le tube n'existe. A la naissance il ne doit RIEN se passer. */
const ENFONCE = 3.2;

export const PHASES = ['dormance', 'imbibition', 'gonflement', 'polarisation', 'emergence', 'tube'];

/* Durees en secondes simulees. Une germination reelle demande deux a six
   heures ; elle est jouee en une minute et demie, et c'est assume au meme
   titre que la sporulation. Les PROPORTIONS, elles, sont celles de la
   litterature : le gonflement occupe la moitie du chemin, et l'emergence
   est brusque a cote. */
const DUREES = { dormance: 5, imbibition: 12, gonflement: 26, polarisation: 13, emergence: 7, tube: 1e9 };

/* --------------------------------------------------------------------------
   LE CORPS DE LA SPORE.

   Il expose exactement ce que la `Scene` demande a une tige : un contour
   ferme en coordonnees monde, un centre, un cap, une maturite de paroi et
   une abscisse totale. Rien de plus. C'est ce qui permet de le poser dans
   la liste des tiges a cote des hyphes sans que le rendu ait a savoir ce
   que c'est.
-------------------------------------------------------------------------- */
export class Spore {
  constructor(opts = {}) {
    const rng = this.rng = mulberry32(opts.graine ?? 11);
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    /* Le grand axe du corps. Il sert aussi de repere a la texture du
       cytoplasme : sans lui elle serait indexee sur le cap d'une hyphe qui
       n'existe pas encore. */
    this.th = opts.th ?? rng() * TAU;
    this.r = R_DORM;
    /* Une spore de Mucorales n'est pas une bille : elle est ovoide, un peu
       anguleuse, et souvent striee. 0,84 d'aplatissement, releve sur les
       planches. */
    this.ov = 0.82 + rng() * 0.10;
    this.turg = 0;               // 0 dormante, 1 turgescente

    /* ORNEMENTATION DE PAROI. Quatre harmoniques, donc periodique par
       construction : un bruit echantillonne sur l'angle ne se referme pas
       et laisse une marche a 2.PI, parfaitement visible sur un contour
       ferme. Elle s'EFFACE quand la spore gonfle — une paroi tendue par la
       turgescence se lisse, c'est ce qui fait lire le gonflement meme
       quand le rayon n'a bouge que d'un pixel. */
    this.harm = [];
    for (let k = 3; k <= 6; k++) {
      this.harm.push({ k, a: (0.010 + rng() * 0.015), ph: rng() * TAU });
    }

    this.grains = [];
    this.organites = [];
    this.ves = [];
    this.peupler();
  }

  /* --- ce que la Scene demande ------------------------------------------- */

  get total() { return 2 * this.r; }

  /**
   * Maturite de la paroi, au sens de `Scene.paroi` : 1 = epaisse et
   * contrastee, 0 = mince et pale. Une spore dormante a la paroi la plus
   * epaisse du cycle — c'est elle qui la fait survivre. Gonflee, la meme
   * quantite de paroi s'etale sur 2,7 fois plus de surface : elle
   * s'amincit, et ca doit se voir.
   */
  maturite() { return lerp(1, 0.46, this.turg); }

  /** Demi-largeur vue du centre, dans la direction monde `a`. */
  rayon(a) {
    const ph = a - this.th;
    const c = Math.cos(ph), s = Math.sin(ph);
    /* ELLE S'ARRONDIT EN GONFLANT. Une spore dormante est ovoide et un peu
       anguleuse ; une spore turgescente est une sphere, parce que c'est la
       pression interne qui la met en forme et qu'une pression est isotrope.
       Ce n'est pas qu'une lecture : le petit axe passe de 5,4 a 6,3 um, et
       c'est ce qui donne a l'amorce du tube germinatif les 2,3 um de jeu
       dont elle a besoin. A 0,85 d'aplatissement constant il n'en restait
       que 1,5 — moins que les 1,8 qu'il faut pour que le conge de l'union
       ne ponte pas le bourgeon a la paroi. */
    const A = this.r, B = this.r * lerp(this.ov, 0.97, this.turg);
    let w = (A * B) / Math.sqrt(B * B * c * c + A * A * s * s);
    let o = 0;
    for (const h of this.harm) o += h.a * Math.cos(h.k * ph + h.ph);
    return w * (1 + o * (1 - this.turg * 0.82));
  }

  /**
   * Le contour : un polygone ferme, comme celui d'une hyphe, et lu par le
   * meme champ de distance. 128 sommets : a 13 um de diametre et au
   * grossissement du tube, le corps fait 180 px de large et 96 sommets y
   * laissaient des facettes de six pixels sur les flancs.
   */
  contour(xs, ys, sMax, K = 32) {
    const N = 128;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const r = this.rayon(a);
      xs[i] = this.x + Math.cos(a) * r;
      ys[i] = this.y + Math.sin(a) * r;
    }
    return N;
  }

  /* --- le contenu --------------------------------------------------------- */

  /**
   * Position monde d'un element, depuis ses coordonnees polaires
   * NORMALISEES. C'est la seule facon d'obtenir un gonflement
   * isodiametrique sans rien deplacer : le contenu garde ses coordonnees,
   * c'est le corps qui s'etire sous lui. Meme geste que la membrane
   * plasmique, ou l'on n'ecarte pas les noeuds, on fait deriver le repere.
   */
  pos(e, out) {
    const r = this.rayon(e.a) * e.d;
    out.x = this.x + Math.cos(e.a) * r;
    out.y = this.y + Math.sin(e.a) * r;
    return out;
  }

  peupler() {
    const rng = this.rng;
    /* Les GLOBULES LIPIDIQUES. Ce sont eux la reserve, et ce sont eux qu'on
       voit : une spore dormante en contraste de phase est une bille sombre
       avec trois ou quatre taches claires dedans. Ils seront consommes
       pendant le gonflement, et c'est ce qui rend la germination lisible
       autrement que par un changement de taille. */
    for (let i = 0; i < 4 + ((rng() * 3) | 0); i++) {
      this.organites.push({
        t: 'lipide', a: rng() * TAU, d: 0.18 + rng() * 0.46,
        rr: 0.13 + rng() * 0.08, z: (rng() - 0.5) * 1.5,
      });
    }
    for (let i = 0; i < 1 + ((rng() * 2) | 0); i++) {
      this.organites.push({
        t: 'noyau', a: rng() * TAU, d: 0.10 + rng() * 0.34,
        rr: 0.20 + rng() * 0.05, ang: rng() * TAU, z: (rng() - 0.5) * 1.2,
      });
    }
    for (let i = 0; i < 5 + ((rng() * 4) | 0); i++) {
      this.organites.push({
        t: 'mito', a: rng() * TAU, d: 0.22 + rng() * 0.52,
        rr: 0.13 + rng() * 0.06, ang: rng() * TAU, z: (rng() - 0.5) * 1.7,
      });
    }
    /* Vacuoles : elles n'existent pas dans la spore dormante, elles
       APPARAISSENT a l'imbibition. `rr` part de zero. */
    for (let i = 0; i < 3 + ((rng() * 2) | 0); i++) {
      this.organites.push({
        t: 'vacuole', a: rng() * TAU, d: 0.20 + rng() * 0.50,
        rr: 0, rMax: 0.085 + rng() * 0.075, z: (rng() - 0.5) * 1.6,
      });
    }
    /* Granulation. 190 grains dans un disque de 4 um, soit la densite
       surfacique du cytoplasme d'une hyphe, qui en porte 18,8 par
       micrometre de tube. Moins, on lit un semis ; c'est la lecon de la
       spore de sporocyste.

       Le RAYON est en fraction du corps, donc de 0,016 a 0,032 : a plein
       gonflement ca fait 0,11 a 0,21 um, ce qui est le calibre des grains
       du tube. A 0,030-0,058, valeur du premier jet, ils atteignaient
       0,38 um une fois la spore gonflee — six pixels de rayon — et le
       cytoplasme se lisait comme un tas de galets. */
    for (let i = 0; i < 190; i++) {
      this.grains.push({
        a: rng() * TAU, d: Math.sqrt(rng()) * 0.90,
        rr: 0.016 + rng() * 0.016, clair: rng() < 0.42,
        z: (rng() - 0.5) * 2, ph: rng() * TAU,
      });
    }
  }

  /**
   * Le contenu vit. `mob` est la mobilite : 0 dans la spore dormante — un
   * cytoplasme dormant ne brasse rien, et le faire bouger quand meme est le
   * moyen le plus sur de ne pas faire lire la dormance.
   */
  majContenu(dt, t, mob) {
    for (const g of this.grains) {
      g.ph += dt * (0.30 + g.rr * 6) * mob;
      g.a += Math.sin(g.ph) * dt * 0.09 * mob;
      g.d = clamp(g.d + Math.cos(g.ph * 0.73) * dt * 0.035 * mob, 0.02, 0.92);
    }
    for (const o of this.organites) {
      o.a += (noise1(t * 0.10 + o.d * 7, 21) - 0.5) * dt * 0.10 * mob;
      if (o.t === 'mito') o.ang += dt * 0.12 * mob;
    }
  }
}

/* --------------------------------------------------------------------------
   L'EVENEMENT.
-------------------------------------------------------------------------- */
export class Germination {
  constructor(opts = {}) {
    const graine = opts.graine ?? 11;
    this.rng = mulberry32(graine ^ 0x5eed);
    this.graine = graine;
    /* UN THALLE MICRO SANS SPORE. En redescendant du macro, le cycle
       rattache un interieur a un axe qui a deja une histoire : il n'y a
       plus de spore a dessiner, mais tout le reste — les tiges, leur
       contenu, la loi de `pasMicro`, la regle de Trinci — est le meme.
       Une seconde classe pour ce cas-la finirait par diverger de
       celle-ci. */
    this.spore = opts.tubes ? null : new Spore({ ...opts, graine });
    this.t = 0; this.tPhase = 0;
    this.phase = opts.tubes ? 'tube' : 'dormance';
    this.tubes = opts.tubes ?? [];

    /* UN, DEUX OU TROIS TUBES. C'est ce qu'on voit sur une plaque : la
       plupart des spores en sortent un, une bonne part deux, quelques-unes
       trois. Les sites sont separes d'au moins 75 degres — deux tubes qui
       sortent cote a cote se rejoignent par le conge et ne font qu'un col
       de plus, ce qui ne se lit pas comme deux tubes. */
    const rng = this.rng;
    const n = rng() < 0.42 ? 1 : rng() < 0.72 ? 2 : 3;
    this.sites = [];
    let garde = 0;
    while (this.sites.length < n && garde++ < 200) {
      const a = rng() * TAU;
      if (this.sites.every((s) => Math.abs(((a - s.a + Math.PI * 3) % TAU) - Math.PI) > 1.31)) {
        /* Le premier part tout de suite, les suivants avec du retard : une
           spore n'emet pas ses tubes en meme temps, et les voir sortir
           ensemble donne une etoile, pas un organisme. */
        this.sites.push({ a, retard: this.sites.length === 0 ? 0 : 4 + rng() * 9, sorti: false });
      }
    }
  }

  /** La liste que la `Scene` attend : la spore, puis les tubes. */
  get tiges() {
    const l = this.spore ? [{ hy: this.spore, co: null }] : [];
    for (const t of this.tubes) l.push(t);
    return l;
  }

  /** Le tube qu'on regarde : le premier sorti, celui qui a le plus pousse. */
  get principal() {
    let best = null;
    for (const t of this.tubes) if (!best || t.hy.longueur > best.hy.longueur) best = t;
    return best;
  }

  passer(p) { this.phase = p; this.tPhase = 0; }

  maj(dt, opts = {}) {
    this.t += dt; this.tPhase += dt;
    const sp = this.spore;
    /* Sans spore, il ne reste que des tiges : c'est un thalle micro, et il
       n'a plus de phases a traverser. */
    if (!sp) { this.majTiges(dt, opts); return; }
    const P = this.phase;
    const u = clamp(this.tPhase / DUREES[P], 0, 1);

    let mob = 0;
    if (P === 'dormance') {
      if (u >= 1) this.passer('imbibition');

    } else if (P === 'imbibition') {
      /* Elle boit. Le volume ne bouge presque pas — 8 % en rayon — mais la
         turgescence monte : la paroi se detend, l'ornementation s'efface,
         le contenu se remet en mouvement. C'est la reprise du metabolisme,
         et elle se voit AVANT que la taille ne change. */
      sp.turg = smoothstep(0, 1, u) * 0.45;
      sp.r = lerp(R_DORM, R_DORM * 1.08, smoothstep(0, 1, u));
      mob = u * 0.55;
      this.vacuoler(dt, u * 0.35);
      if (u >= 1) this.passer('gonflement');

    } else if (P === 'gonflement') {
      /* LE GONFLEMENT EST ISODIAMETRIQUE : aucune direction n'est
         privilegiee, rien ne pointe. C'est le seul moment du cycle ou la
         croissance n'est pas apicale, et c'est pour ca qu'il faut le
         montrer — sinon le tube sort d'une bille inerte. */
      const k = smoothstep(0, 1, u);
      sp.turg = lerp(0.45, 1, k);
      sp.r = lerp(R_DORM * 1.08, R_GONFLE, k);
      mob = 0.55 + 0.45 * k;
      this.vacuoler(dt, 0.35 + 0.65 * k);
      /* Les reserves se consomment : les globules fondent, la granulation
         monte. Une spore qui gonfle sans que son contenu change n'a l'air
         que d'un ballon. */
      for (const o of sp.organites) {
        if (o.t === 'lipide') o.rr = Math.max(0.045, o.rr - dt * 0.013);
      }
      if (u >= 1) this.passer('polarisation');

    } else if (P === 'polarisation') {
      /* LES VESICULES SE RASSEMBLENT AVANT QU'IL Y AIT UN TUBE. C'est le
         Spitzenkorper qui se forme dans le cytoplasme de la spore, comme
         celui d'une branche se forme dans le cytoplasme de sa mere. Rien
         ne bombe encore a la surface. */
      sp.turg = 1;
      mob = 1;
      this.polariser(dt, smoothstep(0, 1, u));
      if (u >= 1) this.passer('emergence');

    } else {
      sp.turg = 1;
      mob = 1;
      this.polariser(dt, 1);
      if (P === 'emergence' && u >= 1) this.passer('tube');
    }

    sp.majContenu(dt, this.t, mob);

    /* Sortie des tubes. Le compte a rebours de chaque site ne demarre qu'a
       l'emergence : avant, la polarite n'est pas etablie. */
    if (P === 'emergence' || P === 'tube') {
      for (const s of this.sites) {
        if (!s.sorti && this.tSortie() >= s.retard) { s.sorti = true; this.germer(s); }
      }
    }

    this.majTiges(dt, opts);
  }

  /**
   * Les tiges poussent par leur apex, avec la loi de `main.js` et pas une
   * autre : si la germination reecrivait le bilan des fusions de son cote,
   * un tube germinatif ne pousserait plus comme une hyphe.
   */
  majTiges(dt, opts) {
    for (const tg of this.tubes) {
      const hy = tg.hy;
      /* UN SPORANGIOPHORE NE SERPENTE PAS. C'est la seule hyphe du cycle
         qui va quelque part : elle monte, et elle est negativement
         gravitrope. Laissee a la derive du bruit, elle tournait de
         plusieurs degres pendant les quarante secondes d'amorce et le cap
         ne tombait plus sur celui du sporocyste qui la reprend. */
      const cible = tg.droit ? 0 : (noise1(this.t * 0.055, tg.sem) - 0.5) * 1.5;
      tg.phiCible += (cible - tg.phiCible) * clamp(dt * 0.9, 0, 1);
      pasMicro(hy, tg.co, dt, tg.phiCible, opts);
      tg.co.etendre(hy.total - hy.Lb - 0.4);
    }
  }

  /** Secondes ecoulees depuis le debut de l'emergence. */
  tSortie() {
    return this.phase === 'emergence' ? this.tPhase : this.tPhase + DUREES.emergence;
  }

  vacuoler(dt, k) {
    for (const o of this.spore.organites) {
      if (o.t === 'vacuole') o.rr = Math.min(o.rMax * k, o.rr + dt * 0.035);
    }
  }

  /**
   * Les vesicules de polarisation. Elles naissent au hasard dans le
   * cytoplasme et derivent vers leur site : c'est un transport dirige, pas
   * une apparition. `k` est l'avancement, 0 a 1.
   */
  polariser(dt, k) {
    const sp = this.spore, rng = this.rng;
    /* 38 par site : en dessous de trente on compte les vesicules au lieu
       de lire un nuage, et c'est un nuage qu'il faut — le Spitzenkorper
       n'est jamais dessine, c'est sa densite qui le fait apparaitre
       (regle 10). */
    const vise = Math.round(44 * k * this.sites.filter((s) => !s.sorti).length);
    while (sp.ves.length < vise) {
      const a = rng() * TAU;
      /* CHACUNE A SA PLACE DANS LE NUAGE, et c'est ce qui fait qu'il y a un
         nuage. Avec une cible unique — le site — les quarante-quatre
         vesicules d'un site s'empilaient sur le meme pixel : a l'ecran on
         lisait trois vesicules et pas un Spitzenkorper. L'ecart angulaire
         est tire une fois pour toutes ; 0,30 rad d'ecart type sur une spore
         de 6,6 um, ca fait un nuage de deux micrometres, ce qui est la
         taille d'un Spitzenkorper. */
      const off = ((rng() + rng() + rng()) / 1.5 - 1) * 0.46;
      sp.ves.push({ a, d: 0.10 + rng() * 0.34, rr: 0.030 + rng() * 0.016,
                    z: (rng() - 0.5) * 1.4, off, dc: 0.60 + rng() * 0.28,
                    site: (rng() * this.sites.length) | 0 });
    }
    for (const v of sp.ves) {
      const s = this.sites[v.site];
      /* Un site deja sorti n'attire plus rien : son Spitzenkorper est
         maintenant celui du tube, et il est simule par `Contenu`. */
      if (!s || s.sorti) { v.d = Math.max(0, v.d - dt * 0.5); continue; }
      const da = ((s.a + v.off - v.a + Math.PI * 3) % TAU) - Math.PI;
      /* 2,6 rad/s : a 0,75 il fallait quatre secondes pour traverser le
         corps, et comme il en nait sans arret, la moitie du troupeau etait
         toujours en route — on lisait des vesicules eparpillees et non un
         nuage. Mesure : ecart angulaire maximal de 116 degres au site,
         douze secondes apres le debut de la polarisation. Arrivees, elles
         ne se rangent PAS sur un rayon : un quart de radian de dispersion,
         sinon le nuage est un trait. */
      v.a += clamp(da, -1, 1) * dt * 2.6 + (rng() - 0.5) * dt * 0.16;
      v.d = clamp(v.d + (v.dc - v.d) * dt * 1.4 + (rng() - 0.5) * dt * 0.20, 0.05, 0.90);
    }
    /* On retire celles qui ont fini par retomber au centre : sans ca, la
       liste enfle et le nuage d'un site sorti reste visible. */
    for (let i = sp.ves.length - 1; i >= 0; i--) if (sp.ves[i].d <= 0.001) sp.ves.splice(i, 1);
  }

  /**
   * LE TUBE GERMINATIF NAIT DANS LE CYTOPLASME DE LA SPORE.
   *
   * Meme amorce que `brancherSur`, et pour les memes raisons mesurees : un
   * apex pose 3,2 um sous la paroi (plus pres, le conge ferait bomber la
   * spore avant que le tube n'existe), et une amorce assez LONGUE pour
   * qu'il y ait la place d'un Spitzenkorper — il se tient a 2 um de la
   * pointe, et une branche qui n'a que 0,6 um de domaine simule ne fusionne
   * pas, donc ne pousse pas.
   *
   * Mais une amorce DROITE de sept micrometres plantee dans une spore de
   * treize de diametre ressort par le flanc oppose. Elle est donc
   * incurvee : elle part de travers, au coeur du corps, et s'oriente. Le
   * dernier point de controle est aligne sur la direction de sortie, sinon
   * l'amorce arrive a l'apex par une autre tangente et il y a un coude a
   * la jonction.
   */
  germer(site) {
    const sp = this.spore;
    const a = site.a;
    const dx = Math.cos(a), dy = Math.sin(a);
    const px = -dy, py = dx;
    const r = sp.rayon(a);
    const cote = this.rng() < 0.5 ? -1 : 1;
    /* UN CROCHET CUBIQUE, ET PAS UNE ARCHE. La quadratique de la
       ramification bombe VERS L'EXTERIEUR : son point de depart se
       retrouvait a 5,1 um du centre d'une spore qui en fait 6,6, et le fond
       du bourgeon — rond, donc large — ressortait par le flanc. On lisait
       deux pointes laterales sur la spore et deux traits de membrane en
       travers, a 90 degres du tube. Sur une mere TUBULAIRE le probleme
       n'existe pas : l'amorce s'enfonce dans un cylindre qui continue
       derriere. Une spore, elle, se referme.

       La cubique tourne DANS le corps : 6,4 um d'arc — assez pour un
       Spitzenkorper, qui se tient a 2 um de la pointe — sans jamais
       depasser 3,4 um du centre, soit 52 % du rayon. Le point le plus
       eloigne est l'apex lui-meme, ce qui est la definition de « dedans ».
       P2 aligne sur la direction de sortie donne la tangente exacte a
       l'apex : sans lui l'amorce y arrive de biais et il y a un coude a la
       jonction.

       Les trois longueurs sont celles qui MAXIMISENT LE JEU A LA PAROI a
       arc constant : 6,5 um d'amorce et 2,26 um entre la surface du
       bourgeon et celle de la spore, mesures sur le profil complet
       (`rayonA` plus les deux calottes). Le jeu compte autant que l'arc :
       le conge de l'union ponte tout ecart inferieur a DEUX FOIS son
       rayon, et a 3,2 um de crochet il n'en restait que 2,1 — le conge
       tirait alors la paroi de la spore vers le bourgeon, a quatre-vingt-
       dix degres du tube, et le corps sortait en citron avec un angle net
       a neuf heures. */
    const P3 = [sp.x + dx * (r - ENFONCE), sp.y + dy * (r - ENFONCE)];
    const P2 = [P3[0] - dx * 2.4, P3[1] - dy * 2.4];
    const P1 = [sp.x - px * cote * 2.0, sp.y - py * cote * 2.0];
    const P0 = [sp.x - dx * 2.8 - px * cote * 1.2, sp.y - dy * 2.8 - py * cote * 1.2];
    const axe = [];
    const N = 34;
    for (let i = 0; i <= N; i++) {
      const t = i / N, v = 1 - t;
      axe.push([v * v * v * P0[0] + 3 * v * v * t * P1[0] + 3 * v * t * t * P2[0] + t * t * t * P3[0],
                v * v * v * P0[1] + 3 * v * v * t * P1[1] + 3 * v * t * t * P2[1] + t * t * t * P3[1]]);
    }

    const graine = (this.rng() * 1e9) | 0;
    const hy = new Hyphe({
      graine, branche: true,
      R: R_TUBE, rBase: R_BASE, rMonte: R_MONTE,
      axe, th: a,
    });
    const co = new Contenu(hy, { graine, sMax: Math.max(1, hy.total - hy.Lb - 0.4) });
    this.tubes.push({ hy, co, phiCible: 0, sem: 31 + this.tubes.length * 17, depuisBranche: 0 });
  }

  /**
   * LA RAMIFICATION COMMENCE TOT, et c'est vrai : chez les Mucorales le
   * premier branchement tombe souvent avant que le tube germinatif n'ait
   * cent micrometres. On applique donc la regle de Trinci (regle 8) avec
   * une unite de croissance RACCOURCIE — 62 um et non 110 — parce qu'un
   * jeune thalle ramifie plus dense qu'une colonie etablie, le temps
   * d'occuper le substrat.
   *
   * Une branche n'est pas un objet de plus : c'est un axe de plus dans la
   * meme liste, et la silhouette reste l'union.
   */
  ramifier(uch = 62) {
    if (this.tubes.length >= 7) return null;     // au-dela, le cadre est plein
    for (const tg of this.tubes) {
      tg.depuisBranche = tg.hy.longueur - (tg.marqueBranche ?? 0);
      if (tg.depuisBranche < uch) continue;
      tg.marqueBranche = tg.hy.longueur;
      const rng = this.rng;
      const graine = (rng() * 1e9) | 0;
      const hy = brancherSur(tg.hy, {
        graine,
        s: 9 + rng() * 7,
        cote: rng() < 0.5 ? -1 : 1,
        angle: (58 + rng() * 24) * Math.PI / 180,
      });
      const co = new Contenu(hy, { graine, sMax: Math.max(1, hy.total - hy.Lb - 0.4) });
      const t = { hy, co, phiCible: 0, sem: 31 + this.tubes.length * 17, marqueBranche: 0 };
      this.tubes.push(t);
      return t;
    }
    return null;
  }
}
