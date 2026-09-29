/* ---------------------------------------------------------------------------
   LE CYCLE, SANS FIN.

   Germination, croissance apicale, ramification, recul sur la colonie,
   redescente, sporangiophore, sporocyste, eclatement, vol, retombee — puis
   germination. C'est le meme organisme d'un bout a l'autre, et c'est
   litteralement vrai dans le code : la colonie qu'on regarde de loin est le
   germe qu'on regardait de pres (`Thalle.greffer`), et la spore que le
   sporocyste lache est celle qui vole, gonfle et germe. Aucun objet n'est
   recree entre le vol et la germination ; on arrete simplement de le tenir
   dormant.

   RIEN DE NOUVEAU N'EST SIMULE ICI. Cette page n'est qu'un enchainement :
   `Germination` pour la germination et la croissance, `Thalle` pour la
   colonie, `Sporange` pour le sporocyste, `Germination` encore — dormante —
   pour le vol. Le pilotage de l'apex vient de `pasMicro`, le cadrage du
   sporocyste de `cadrerSporange`, le flou de fondu de `flouEcran`. Si cette
   page reecrivait l'une de ces lois de son cote, la meme etape ne se
   regarderait pas de la meme facon selon la page qui la montre.

   ON FOND QUAND ON CHANGE D'OBJECTIF, ET SEULEMENT LA. Germination et
   croissance sont la meme scene — seul le cadrage change, et il change en
   glissant ; vol et germination aussi. Restent les quatre endroits ou l'on
   change vraiment d'echelle ou de projection : la montee sur la colonie, la
   redescente sur une pointe, le passage de la branche au sporocyste, et le
   depart avec une spore. C'est le geste de `monde.js` : on defocalise, on
   change d'objectif, on refocalise — et pendant ce temps les simulations
   vivent, rien n'est saute. Entre micro et macro la rampe de grossissement
   est LOGARITHMIQUE : il y a un facteur trois cents, et une rampe lineaire
   passerait quatre-vingt-dix pour cent du fondu a l'echelle de la colonie.

   UN FONDU NE RATTRAPE PAS UNE DIRECTION. C'est la contrainte qui structure
   le passage au sporocyste : le sporangiophore n'apparait pas, il EST une
   branche qu'on a vue naitre, et il faut que la tige reparte exactement ou
   elle en etait. Trois choses le rendent exact — un cap demande a l'ecran
   (`Sporange.capImage`), une pointe choisie EN HAUT parmi trois cents
   (`viserSporangiophore`), et une origine de stolon reculee le long du cap
   pour que la pointe tombe juste.

   LE VOL est la seule chose inventee, et elle est assumee : une spore
   emportee ne voit plus un substrat, elle voit passer des masses. Trois
   plans de disques flous qui defilent a des vitesses differentes, la
   parallaxe fait le reste. La spore, elle, est dessinee exactement comme
   elle le sera au sol — c'est la meme, elle est seulement dormante.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep, noise1 } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Germination, R_GONFLE } from './sim/germination.js';
import { VueGermination } from './render/vueGermination.js';
import { Sporange, viserSporangiophore, PENTE, CAP_MAX } from './sim/sporange.js';
import { brancherSur, depuisMacro } from './sim/hyphe.js';
import { Contenu } from './sim/contenu.js';
import { Thalle, V_MICRO } from './sim/thalle.js';
import { VueThalle } from './render/vueThalle.js';
import { VueSporange } from './render/vueSporange.js';
import { cadrerSporange } from './sporange.js';
import { flouEcran } from './monde.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* Images d'un fondu, et flou maximal. Memes valeurs que sur le pont entre
   les deux echelles : un fondu plus court ne laisse pas le temps de lire
   qu'on a change d'objectif, un plus long se fait attendre. */
const IMAGES_FONDU = 84;
const FLOU_MAX = 5;

/* Secondes SIMULEES passees dans l'air avant la retombee. Au-dela de vingt,
   le defilement devient une attente ; en dessous de dix, on ne comprend pas
   qu'elle a voyage. */
const DUREE_VOL = 16;

/* Longueur d'image que la branche doit atteindre, depuis l'axe de la mere,
   avant qu'on passe la main au sporocyste. 17 um : le bourgeon a emerge
   (il perce la paroi vers 4 um) et on a vu son col concave, sans que
   l'attente devienne une attente. */
const AMORCE_L = 17;

/* Vitesse du macro. Une colonie se compte en heures, un apex en secondes :
   c'est la meme borne que sur le pont entre les deux echelles, et pour la
   meme raison — a x1 la colonie n'avancerait pas, a x300 une exocytose
   durerait une heure de colonie. */
const VITESSE_MACRO = 300;
/* Heures de colonie a passer en haut. 1 h 48, et pas quatre : a quatre
   heures la colonie fait 590 mm et neuf millimetres de diametre, chaque
   hyphe tombe sous le dixieme de pixel et on ne lit plus qu'un disque
   floconneux. Vers deux heures elle fait 65 mm pour 3,6 mm — on VOIT les
   hyphes, les ramifications et le front, et c'est pour ca qu'on monte. */
const HEURES_THALLE = 1.8 * 3600;

export const ETAPES = ['germination', 'croissance', 'thalle', 'amorce', 'sporulation', 'vol'];

const LEGENDES = {
  germination: 'La spore gonfle dans toutes les directions, les vésicules se rassemblent, un tube part.',
  croissance: 'Croissance apicale. Les vésicules fusionnent avec la membrane et déversent la paroi ; le thalle ramifie.',
  thalle: 'On recule. Le même organisme, quatre heures plus tard : la colonie. Le curseur de zoom fonctionne ici.',
  amorce: 'On est redescendu sur une pointe. Une branche naît sur son flanc — mais celle-ci ne rampera pas : elle monte.',
  sporulation: 'Le sporangiophore monte vers l’observateur. Sa pointe gonfle et devient le sporocyste.',
  vol: 'Une spore est partie. Elle ne voit plus un substrat — elle voit passer des masses.',
};

export class AppCycle {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vueG = new VueGermination(this.screen);
    this.vueS = new VueSporange(this.screen);
    this.vueT = new VueThalle(this.screen);

    this.palette = 'phase';
    this.vitesse = 2;
    this.zoom = 1;
    this.pause = false;
    this.opts = {
      vesicules: true, granulation: true, organites: true,
      membrane: true, depots: true, milieu: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };
    this.t = 0; this.last = 0; this.fps = 60;
    this.tours = 0;
    this.reset();
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  reset(graine = 11) {
    this.graine = graine;
    this.etape = 'germination';
    this.fondu = null;
    this.tEtape = 0;
    this.g = new Germination({ graine, x: 0, y: 0 });
    this.sp = null;
    this.th = null;
    this.visee = null;
    this.pxMacro = 0;
    this.vol = null;
    this.amorce = null;
    this.jonction = null;
    this.cap = -Math.PI / 2;
    this.residu = 0;
    this.px = 0;
    this.etatS = { px: 0, dof: 22, zF: 0, zoom: 1 };
    this.vueG.cam.x = 0; this.vueG.cam.y = 0;
    this.tours = 0;
  }

  layout() {
    const cw = this.hote.clientWidth || 640, ch = this.hote.clientHeight || 640;
    const S = clamp(Math.round(Math.min(cw, ch) / 300), 2, 6);
    let W = clamp(Math.round(cw / S), 180, 460);
    let H = clamp(Math.round(ch / S), 180, 460);
    while (W * H > 132000) { W = Math.round(W * 0.95); H = Math.round(H * 0.95); }
    this.screen.resize(W, H);
    this.vueG.alloc(W, H); this.vueS.alloc(W, H); this.vueT.alloc(W, H);
    this.canvas.style.width = `${W * S}px`;
    this.canvas.style.height = `${H * S}px`;
  }

  /* --- enchainement ------------------------------------------------------- */

  /** Longueur totale construite par le thalle, en um. */
  get construit() {
    let l = 0;
    for (const tg of this.g.tubes) l += tg.hy.longueur;
    return l;
  }

  /**
   * Les passages d'une etape a l'autre. Deux seulement demandent un fondu :
   * les deux ou l'on change d'objectif. Les autres sont des glissements de
   * cadrage sur la meme scene, et c'est ce qui fait qu'il n'y a pas de
   * coupure dans le cycle.
   */
  avancer(dt) {
    this.tEtape += dt;
    const e = this.etape;

    if (e === 'germination') {
      const pr = this.g.principal;
      /* On passe a la croissance quand le premier tube a de quoi se faire
         regarder de pres : en dessous de vingt-six micrometres, le cadrage
         serre ne montre qu'un bout de spore. */
      if (pr && this.g.phase === 'tube' && pr.hy.longueur > 18) this.passer('croissance');

    } else if (e === 'croissance') {
      this.g.ramifier();
      /* Le thalle a fait son travail quand il a construit de quoi porter un
         sporangiophore. 190 um tous axes confondus, soit trois unites de
         croissance germinative et une ou deux branches : moins, on n'a pas
         vu ramifier. Le plafond de 150 s est la pour que le tour ait une
         duree, meme si le substrat est pauvre. */
      if (this.construit > 190 || this.tEtape > 150) this.fondreVers('thalle');

    } else if (e === 'thalle') {
      /* En haut, le temps est celui de la colonie — `majSim` l'avance, ici
         on ne fait que decider quand redescendre. On ne saute rien : la
         micro est rangee, son axe est devenu celui du macro. */
      if (this.th.t > HEURES_THALLE) this.fondreVers('amorce');

    } else if (e === 'amorce') {
      /* La branche pousse comme n'importe quelle branche — meme bourgeon,
         meme col concave, meme `pasMicro`. On la laisse sortir, puis on
         passe la main au sporocyste a la hauteur equivalente. */
      const hy = this.amorce.hy;
      const d = Math.hypot(hy.x - this.jonction.x, hy.y - this.jonction.y);
      if (d > AMORCE_L) this.fondreVers('sporulation');

    } else if (e === 'sporulation') {
      /* On part avec la spore que la camera suit. Six secondes apres le
         debut de l'envol : le temps de la voir se detacher du nuage. */
      if (this.sp.phase === 'envol' && this.sp.tPhase > 6) this.fondreVers('vol');

    } else if (e === 'vol') {
      /* Le defilement retombe a zero sur les cinq dernieres secondes, et le
         substrat redevient net avec lui : c'est la retombee. On ne coupe
         pas — la spore est deja celle qui va germer. */
      const u = clamp(this.tEtape / DUREE_VOL, 0, 1);
      this.vol.v = 1 - smoothstep(0.68, 1, u);
      this.vol.parcours += dt * this.vol.v * 0.16;
      this.g.spore.th += dt * this.vol.rot * this.vol.v;
      if (u >= 1) { this.tours++; this.passer('germination'); }
    }
  }

  passer(e) { this.etape = e; this.tEtape = 0; }

  /**
   * LE SPORANGIOPHORE COMMENCE PAR ETRE UNE BRANCHE.
   *
   * On ne fond pas vers un sporangiophore qui aurait pousse tout seul
   * ailleurs : on branche vraiment, sur la mere qu'on regarde, avec le
   * mecanisme de la regle 7 — bourgeon qui emerge du cytoplasme maternel,
   * col concave donne par le conge de l'union, tube qui s'elargit avec son
   * materiau. Ce qui change, c'est qu'elle ne rampera pas : son cap est
   * celui que le sporocyste reprendra, et elle ne serpente pas.
   */
  /**
   * ON MONTE : le germe devient la colonie.
   *
   * Pas une autre colonie de la meme espece — la sienne. Chaque tube
   * germinatif est GREFFE sur le macro avec son axe (`Thalle.greffer`), qui
   * le ré-echantillonne au pas de 6 um et pose sa densite : la pointe macro
   * reprend exactement ou la micro s'etait arretee. C'est la regle 8 dans
   * l'autre sens — en descendant, `depuisMacro` rend l'axe fin ; en
   * montant, `greffer` rend l'axe grossier.
   */
  monterAuThalle() {
    const germes = [];
    for (const tg of this.g.tubes) {
      const hy = tg.hy, pts = [];
      for (let i = 0; i < hy.ax.length; i++) pts.push([hy.ax[i], hy.ay[i]]);
      pts.push([hy.x, hy.y]);
      germes.push({ pts, th: hy.th });
    }
    this.th = new Thalle({ graine: (this.graine * 53 + this.tours * 191) | 0, vMicro: V_MICRO, germes });
    /* Le grossissement macro est POSE tout de suite : la rampe
       logarithmique du fondu en a besoin des sa premiere image, et calcule
       a la premiere image MACRO — donc au sommet du flou — il faisait un
       saut au milieu du fondu. */
    const etendue = Math.max(this.th.diametre * 1.45, 600);
    this.pxMacro = (0.80 * Math.min(this.vueT.w, this.vueT.h)) / etendue * this.zoom;
    this.vueT.cam.x = 0; this.vueT.cam.y = 0;
  }

  /**
   * ON REDESCEND, et on choisit la pointe sur laquelle descendre.
   *
   * Pas n'importe laquelle : celle qui offre un flanc vers le haut, donc
   * celle sur laquelle un sporangiophore pourra partir sans se coucher
   * (`viserSporangiophore`). Le choix de la pointe et le raccord de
   * direction sont le meme probleme, et il vaut mieux le resoudre EN HAUT,
   * ou l'on a trois cents pointes au choix, qu'en bas ou l'on n'en a
   * qu'une et ou il faut attendre qu'elle tourne.
   */
  descendreDuThalle() {
    let best = null, bd = 1e9;
    for (const p of this.th.pointes) {
      if (!p.vive || p.axe.n < 6) continue;
      const v = viserSporangiophore(p.th);
      /* A residu egal, la pointe la plus AVANCEE : le front de la colonie
         est la ou il se passe quelque chose, et c'est la que sporule un
         Rhizopus. */
      const score = v.residu * 1000 - Math.hypot(p.x, p.y) * 0.001;
      if (score < bd) { bd = score; best = p; this.visee = v; }
    }
    const p = best ?? this.th.pointes[0];
    this.visee = this.visee ?? viserSporangiophore(p.th);
    const graine = (this.graine * 71 + this.tours * 457) | 0;
    const hy = depuisMacro(p.axe.xs, p.axe.ys, p.axe.n, p.th, 210,
                           { graine, bout: [p.x, p.y] });
    const co = new Contenu(hy, { graine });
    this.g = new Germination({ graine, tubes: [{ hy, co, phiCible: 0, sem: 61, marqueBranche: 0 }] });
    /* Meme raison qu'a la montee : la rampe a besoin du grossissement
       d'arrivee des la premiere image du fondu. 11 px/um, c'est la ou
       commence le cadrage de l'amorce. */
    this.px = 11.0 * this.zoom;
    this.vueG.cam.x = hy.x; this.vueG.cam.y = hy.y;
  }

  amorcer(v) {
    const mere = this.g.principal.hy;
    const s = 11 + this.tEtape % 4;
    const p = mere.atS(s, {});
    /* L'ORIGINE EST SUR L'AXE DE LA MERE, pas sur sa paroi : c'est de la
       que part la tige du sporange, et c'est la que plongent les
       rhizoides. Un sporangiophore de Mucorales nait a un noeud du stolon,
       et le stolon, ici, c'est la mere. */
    this.jonction = { x: p.x, y: p.y, th: Math.atan2(p.ty, p.tx) };
    this.cap = v.cap;
    this.residu = v.residu;

    const graine = (this.graine * 17 + this.tours * 313) | 0;
    const hy = brancherSur(mere, { graine, s, cote: v.cote, angle: v.angle });
    const co = new Contenu(hy, { graine, sMax: Math.max(1, hy.total - hy.Lb - 0.4) });
    this.amorce = { hy, co, phiCible: 0, sem: 91, marqueBranche: 0, droit: true };
    this.g.tubes.push(this.amorce);
  }

  /** Demarre un fondu : on defocalise, on change d'objectif, on refocalise. */
  fondreVers(e) {
    if (this.fondu) return;
    this.fondu = { u: 0, vers: e, de: this.etape, bascule: false };
    if (e === 'thalle') {
      this.monterAuThalle();
    } else if (e === 'amorce') {
      /* On descend AVANT le sommet du flou, pour que la micro ait le temps
         de se peupler pendant qu'on ne la voit pas : le reservoir apical
         met une vingtaine de secondes a se remplir, et sans ce prechauffage
         on sortirait du fondu sur un apex inerte. C'est exactement ce que
         fait le pont entre les echelles, a ceci pres qu'ici le fondu est
         plus court et qu'on prechauffe d'un coup. */
      this.descendreDuThalle();
      const dt = 1 / 60;
      for (let i = 0; i < 20 * 60; i++) this.g.maj(dt, this.opts);
      this.amorcer(this.visee);
      this.fondu.vers = 'amorce';
    } else if (e === 'sporulation') {
      /* LE SPOROCYSTE REPREND LA BRANCHE LA OU ELLE EN EST : meme point de
         depart, meme cap a l'ecran, meme longueur. `z0` est la longueur
         d'image deja construite divisee par la pente — le sporangiophore
         rejoint donc la tige au micrometre pres, et le fondu n'a plus qu'a
         changer d'objectif. Sans ce report, on voyait la branche
         disparaitre et une tige neuve repartir du stolon. */
      const hy = this.amorce.hy;
      const L = Math.hypot(hy.x - this.jonction.x, hy.y - this.jonction.y);
      /* L'ORIGINE EST POSEE POUR QUE L'APEX TOMBE JUSTE, pas sur l'axe de
         la mere. Un bourgeon nait 3,6 um SOUS la paroi, donc decale sur le
         cote : la corde qui va de l'axe maternel a sa pointe n'est pas son
         cap, elle s'en ecarte de 4,6 degres a dix-sept micrometres. En
         partant de l'axe, la tige repartait dans la bonne direction mais sa
         pointe sautait d'un micrometre et demi — et c'est la pointe qu'on
         regarde. On recule donc l'origine le long du cap : l'ecart a l'axe
         maternel, 1,4 um, reste tres sous le rayon du tube, et le stolon
         recouvre toujours la mere. */
      const ox = hy.x - Math.cos(this.cap) * L;
      const oy = hy.y - Math.sin(this.cap) * L;
      this.sp = new Sporange({
        graine: (this.graine * 7 + this.tours * 131) | 0,
        x: ox, y: oy, th: this.jonction.th,
        capImage: this.cap, z0: L / PENTE,
      });
      /* La camera ne bouge pas non plus : meme grossissement, meme point
         vise, et la mise au point deja posee sur la pointe. Elle est en
         coordonnees d'IMAGE des deux cotes — `py3` applique le
         cisaillement avant `sy` —, donc on peut la recopier telle quelle. */
      this.etatS = { px: this.px, dof: 22, zF: this.sp.z, zoom: this.zoom };
      this.vueS.cam.x = this.vueG.cam.x;
      this.vueS.cam.y = this.vueG.cam.y;
    } else if (e === 'vol') {
      /* LA SPORE QUI VOLE EST CELLE QUI VA GERMER. On instancie la
         germination maintenant, dormante, et on la tient telle quelle
         pendant tout le vol : il n'y a rien a raccorder a l'atterrissage,
         c'est le meme objet. */
      const gr = (this.graine * 31 + this.tours * 977) | 0;
      this.g = new Germination({ graine: gr, x: 0, y: 0 });
      this.vol = { v: 1, parcours: 0, dir: Math.atan2(0.42, 1), rot: 0.22 };
      /* La camera est POSEE sur la spore, pas amenee : elle rejoint sa
         cible en 0,45 s et le fondu, lui, ne dure qu'une seconde et demie.
         On sortait donc du flou avec la spore a moitie hors cadre. */
      this.px = 0;
      this.vueG.cam.x = 0; this.vueG.cam.y = 0;
    }
  }

  /* --- simulation --------------------------------------------------------- */

  majSim(dt) {
    const e = this.etape, f = this.fondu;
    /* Pendant un fondu les DEUX scenes vivent : le flou couvre le
       changement d'objectif, il n'escamote pas le temps. Le thalle
       continue donc de pousser pendant qu'on bascule sur le sporocyste,
       et le sporocyste monte deja pendant qu'on regarde encore le thalle. */
    const micro = e === 'germination' || e === 'croissance' || e === 'amorce'
               || f?.de === 'amorce' || f?.vers === 'vol';
    if (micro && e !== 'vol' && e !== 'thalle') {
      const n = Math.max(1, Math.ceil(dt / 0.025));
      for (let i = 0; i < n; i++) this.g.maj(dt / n, this.opts);
    }
    if (this.sp && (e === 'sporulation' || f?.vers === 'sporulation')) {
      const n = Math.max(1, Math.ceil(dt / 0.033));
      for (let i = 0; i < n; i++) this.sp.maj(dt / n);
    }
    /* La colonie continue de pousser pendant les deux fondus qui
       l'encadrent : c'est le meme organisme et la meme horloge. */
    if (this.th && (e === 'thalle' || f?.de === 'thalle' || f?.vers === 'thalle')) {
      this.th.maj(dt * VITESSE_MACRO);
    }
    this.avancer(dt);
  }

  /* --- cadrage ------------------------------------------------------------ */

  /**
   * `e` est passee et non lue dans `this.etape` : pendant un fondu, l'etape
   * courante a deja bascule alors qu'on dessine encore la precedente. Lue
   * sur l'objet, la camera cadrait la scene d'apres sur l'image d'avant.
   */
  cadrerGerme(e, dt0, pxForce) {
    const g = this.g, sp = g.spore, vue = this.vueG;
    let cx, cy, pxCible;
    if (e === 'croissance' && g.principal) {
      /* Au grossissement de l'hyphe, apex a 22 % du bord d'attaque : le
         meme cadrage que sur la page de l'apex seul. */
      const hy = g.principal.hy;
      const ext = Math.abs(Math.cos(hy.th)) * vue.w + Math.abs(Math.sin(hy.th)) * vue.h;
      pxCible = (0.46 * Math.min(vue.w, vue.h)) / (2 * hy.R);
      const recul = (0.22 * ext) / pxCible;
      cx = hy.x - Math.cos(hy.th) * recul;
      cy = hy.y - Math.sin(hy.th) * recul;
    } else if (e === 'amorce') {
      /* On recule PENDANT que la branche sort, pour arriver au fondu au
         grossissement exact ou `cadrerSporange` reprend — 5 px/um sur une
         tige qui n'a pas encore monte. Un saut de grossissement au fondu se
         lit comme un changement d'objet, pas d'objectif. */
      const hy = this.amorce.hy, J = this.jonction;
      const prog = clamp(Math.hypot(hy.x - J.x, hy.y - J.y) / AMORCE_L, 0, 1);
      cx = lerp(J.x, hy.x, 0.5); cy = lerp(J.y, hy.y, 0.5);
      pxCible = lerp(11.0, 5.0, smoothstep(0, 1, prog));
    } else if (e === 'vol') {
      cx = sp.x; cy = sp.y;
      pxCible = (0.34 * Math.min(vue.w, vue.h)) / (2 * sp.r);
    } else {
      /* Le germe entier. Le grossissement est PLAFONNE a ce qu'il vaut sur
         une spore gonflee : cadre sur le rayon courant, le gonflement
         s'annulerait tout seul — la spore garderait la meme taille a
         l'ecran pendant qu'elle double. */
      let rad = R_GONFLE * 1.45;
      let sx = sp.x, sy = sp.y, n = 1;
      for (const tg of g.tubes) {
        rad = Math.max(rad, Math.hypot(tg.hy.x - sp.x, tg.hy.y - sp.y) + tg.hy.R * 2.4);
        sx += tg.hy.x; sy += tg.hy.y; n++;
      }
      const k = smoothstep(R_GONFLE * 1.6, R_GONFLE * 6, rad);
      cx = lerp(sp.x, sx / n, k * 0.62);
      cy = lerp(sp.y, sy / n, k * 0.62);
      pxCible = (0.44 * Math.min(vue.w, vue.h)) / rad;
    }
    pxCible *= this.zoom;
    this.px = this.px ? this.px + (pxCible - this.px) * 0.045 : pxCible;
    /* Pendant un fondu micro <-> macro, le grossissement est IMPOSE par la
       rampe logarithmique : d'un bout a l'autre il y a un facteur de
       plusieurs centaines, et une rampe lineaire passerait l'essentiel du
       fondu a l'echelle de la colonie. */
    vue.pxUm = pxForce ?? this.px;
    const kc = clamp(dt0 * 2.2, 0, 1);
    vue.cam.x += (cx - vue.cam.x) * kc;
    vue.cam.y += (cy - vue.cam.y) * kc;
    vue.zFocus = 0.26 * Math.sin(this.t * 0.105)
      + (e === 'vol' ? 0.9 * noise1(this.t * 0.5, 9) * this.vol.v : 0);
  }

  /** Grossissement de la vue macro : la colonie tient dans 80 % du cadre. */
  cadrerThalle(dt0, pxForce) {
    const vue = this.vueT;
    /* 1,45 et non 1,12 : la colonie doit avoir du substrat autour d'elle.
       Cadree au plus juste, elle touche les bords et on ne lit plus un
       front qui avance, on lit une texture qui remplit le cadre. */
    const etendue = Math.max(this.th.diametre * 1.45, 600);
    const c = (0.80 * Math.min(vue.w, vue.h)) / etendue * this.zoom;
    /* 0,10 : le macro tourne a 300 fois le temps reel, et a 0,06 le cadre
       courait derriere une colonie qui double de diametre en douze
       secondes. */
    this.pxMacro = this.pxMacro ? this.pxMacro + (c - this.pxMacro) * 0.10 : c;
    vue.pxUm = pxForce ?? this.pxMacro;
    const kc = clamp(dt0 * 2.0, 0, 1);
    vue.cam.x += (0 - vue.cam.x) * kc;
    vue.cam.y += (0 - vue.cam.y) * kc;
  }

  /** Les options de la scene germination, vol compris. */
  optsG(e) {
    if (e !== 'vol' && !(this.fondu && this.fondu.vers === 'vol')) return this.opts;
    /* EN L'AIR, IL N'Y A PAS DE SUBSTRAT. Le fond s'aplatit — une texture
       hors du plan de mise au point ne se brouille pas, elle perd son
       amplitude — et les debris de gelose, qui passent par `dotDirect` et
       ne peuvent donc pas etre floutes, disparaissent. */
    const v = this.vol ? this.vol.v : 1;
    return { ...this.opts, vol: this.vol, netFond: lerp(1, 0.10, v), milieu: v < 0.35 };
  }

  /* --- rendu -------------------------------------------------------------- */

  dessinerEtape(e, dt0, opts, pxForce) {
    const P = PALETTES[this.palette];
    if (e === 'sporulation') {
      this.etatS.zoom = this.zoom;
      cadrerSporange(this.sp, this.vueS, this.etatS, dt0);
      if (pxForce) this.vueS.pxUm = pxForce;
      this.vueS.dessiner(this.sp, P, this.t, this.etatS.zF, opts);
    } else if (e === 'thalle') {
      this.cadrerThalle(dt0, pxForce);
      this.vueT.dessiner(this.th, P, this.t, opts);
    } else {
      this.cadrerGerme(e, dt0, pxForce);
      this.vueG.dessiner(this.g, P, this.t, { ...this.optsG(e), ...opts });
    }
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;
    if (!this.pause) {
      const dt = dt0 * this.vitesse;
      this.majSim(dt);
      this.t += dt;
    }

    const sc = this.screen;
    if (!this.fondu) {
      this.dessinerEtape(this.etape, dt0, {});
    } else {
      const f = this.fondu;
      if (!this.pause) f.u += 1 / IMAGES_FONDU;
      const u = clamp(f.u, 0, 1);
      /* On bascule d'image au SOMMET du flou, la ou il n'y a rien a lire.
         C'est le geste reel quand on change d'objectif. */
      const e = u < 0.5 ? f.de : f.vers;
      if (u >= 0.5 && !f.bascule) { f.bascule = true; this.passer(f.vers); }
      /* MICRO <-> MACRO : la rampe est LOGARITHMIQUE. Entre 13 px/um sur un
         apex et 0,04 sur une colonie de quatre heures il y a un facteur
         trois cents ; une rampe lineaire passerait quatre-vingt-dix pour
         cent du fondu a l'echelle de la colonie, et on ne verrait pas
         qu'on a voyage. C'est le geste du pont entre les echelles. */
      let pxForce;
      if (f.de === 'thalle' || f.vers === 'thalle') {
        const a = f.de === 'thalle' ? this.pxMacro : this.px;
        const b = f.vers === 'thalle' ? this.pxMacro : this.px;
        if (a > 0 && b > 0) pxForce = Math.exp(lerp(Math.log(a), Math.log(b), smoothstep(0, 1, u)));
      }
      this.dessinerEtape(e, dt0, { echelle: false, grain: false }, pxForce);
      const r = Math.round(FLOU_MAX * Math.sin(Math.PI * u));
      if (r > 0) flouEcran(sc.px, sc.w, sc.h, r);
      (e === 'sporulation' ? this.vueS : e === 'thalle' ? this.vueT : this.vueG)
        .grainCapteur(PALETTES[this.palette], this.t);
      if (u >= 1) this.fondu = null;
    }
    sc.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

export function brancherCycle(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const maj = () => {
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#etat').textContent = `tour ${app.tours + 1} · ${n(app.t, 0)} s · ${Math.round(app.fps)} i/s`;
    $('#legende').textContent = LEGENDES[app.etape] || '';
    const e = app.etape;
    let d = '';
    if (e === 'germination') {
      d = `spore <b>${n(app.g.spore.r * 2)}</b> µm · <b>${app.g.phase}</b> · `
        + `<b>${app.g.tubes.length}</b> tube${app.g.tubes.length > 1 ? 's' : ''}`;
    } else if (e === 'croissance') {
      d = `<b>${app.g.tubes.length}</b> axes · <b>${n(app.construit, 0)}</b> µm construits`;
    } else if (e === 'thalle') {
      const T = app.th;
      d = `<b>${n(T.t / 3600, 1)} h</b> · <b>${n(T.total / 1000, 0)}</b> mm de mycélium · `
        + `<b>${T.pointes.filter((p) => p.vive).length}</b> pointes · `
        + `<b>${n(T.branchements, 0)}</b> ramifications`;
    } else if (e === 'amorce') {
      const hy = app.amorce.hy, J = app.jonction;
      d = `la branche sort : <b>${n(Math.hypot(hy.x - J.x, hy.y - J.y))}</b> µm depuis l’axe `
        + `· cap <b>${n(app.cap * 180 / Math.PI, 0)}°</b>`
        + (app.residu > 0.01 ? ` (résidu ${n(app.residu * 180 / Math.PI, 0)}°)` : ' — exact');
    } else if (e === 'sporulation') {
      const s = app.sp;
      d = `<b>${s.phase}</b> · tige <b>${n(s.z, 0)}</b> µm`
        + (s.rSac > 1 ? ` · sporocyste <b>${n(s.rSac * 2, 0)}</b> µm` : '')
        + (s.spores.length ? ` · <b>${s.spores.length}</b> spores` : '');
    } else {
      d = `en vol · <b>${n(app.vol ? app.vol.v * 100 : 0, 0)} %</b> de vitesse`;
    }
    $('#chiffres').innerHTML = `<b>${e}</b> — ${d}`;
  };

  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $('#bNeuf').onclick = () => { app.reset((Math.random() * 1e9) | 0); maj(); };
  const z = $('#cZoom'), oz = $('#oZoom');
  const majZoom = () => { app.zoom = +z.value; oz.textContent = `×${n(app.zoom, 2)}`; };
  z.oninput = majZoom; majZoom();

  globalThis.apical = app;
  maj();
  setInterval(maj, 250);
  app.demarrer();
}
