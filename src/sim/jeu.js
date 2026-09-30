/* ---------------------------------------------------------------------------
   LE JEU, SANS RENDU.

   C'est le modele que le banc mesure, et il n'existe que pour ca : tant qu'on
   n'a pas mesure que JOUER vaut mieux que REGARDER, dessiner un panneau est
   premature. Le prototype precedent est mort de ne pas l'avoir fait —
   243 secondes en jouant passivement contre 223 en jouant activement,
   l'optimum etait de ne rien faire.

   Il ajoute trois choses a la colonie de `thalle.js`, et rien d'autre :

     1. UN NUTRIMENT QUI S'EPUISE. La grille de densite existante dit ou il y
        a du mycelium ; elle ne dit pas ce qui reste a manger. Le jeu tient
        donc un stock par cellule, qui part de la matrice et se vide.

     2. UNE RESERVE QUI CIRCULE. Un graphe de transport pose sur les axes,
        un noeud tous les 60 um, des aretes le long des axes, aux
        branchements ET AUX ANASTOMOSES. La reserve s'y relaxe vers les
        puits. C'est ce qui donne un sens a la FORME du reseau : une pointe
        loin de toute source s'affame, et une anastomose est un raccourci.

     3. UNE ATTENTION. Le joueur ne tient qu'une pointe a la fois, et la
        tenir, c'est la REGARDER — donc ne plus voir le reste. `vue()` rend
        ce que le joueur voit VRAIMENT : la carte quand il est en haut, une
        seule pointe quand il est descendu. C'est cette asymetrie que le
        verdict 20 mesure.

   TOUTES LES CONSTANTES SONT EN HAUT ET AUCUNE N'EST UN CHOIX D'AUTEUR : ce
   sont des points de depart a mesurer. Un chiffre qui n'a pas ete mesure est
   un chiffre qu'on croit seulement avoir.
--------------------------------------------------------------------------- */

import { clamp, mulberry32, noise1 } from '../core/util.js';
import { Thalle, V_MICRO, MAILLE_DENS } from './thalle.js';
import { MATRICE_NEUTRE } from './matrices.js';

/* --- le graphe de transport ------------------------------------------------ */

/* Un noeud tous les 60 um, soit un point d'axe sur dix. Au pas de l'axe
   (6 um) un thalle de 90 mm ferait 15 000 noeuds et autant d'aretes a
   relaxer quatorze fois par pas ; a 60 um il en fait 1 500, et la longueur
   de diffusion par pas grandit d'un facteur cent. On ne perd rien : la
   reserve n'a pas de structure a l'echelle du micrometre. */
export const PAS_NOEUD = 60;
/* Relaxation : un echange proportionnel a l'ecart, sur chaque arete.
   Conservatif par construction — ce qu'un noeud perd, son voisin le gagne.

   LE TRANSPORT EST UNE DIFFUSIVITE, en um2/s, et non un nombre de passes.
   Ecrit en passes il dependait du pas d'integration ; ecrit en passes par
   seconde il n'en dependait plus, mais restait un nombre qu'on ne savait pas
   lire. Une diffusivite se lit : une perturbation parcourt sqrt(D.t).

   800 um2/s, ET C'EST LE REGLAGE QUI DECIDE SI LE JEU EXISTE. On l'a balaye
   sur cinq valeurs, huit graines chacune, en regardant trois choses : le
   contraste de reserve entre l'interieur et le front, ce que la politique
   active gagne sur la passive, et ce que coute de debrancher les
   anastomoses.

     D      contraste  remplissage  passive  active  avec-ana  sans-ana
      400      2,4        33 min      0,75    0,88     0,50      0,38
      800      2,2        20 min      1,00    1,88     1,50      0,88
     1600      1,5        12 min      2,13    2,00     3,25      2,13
     3200      1,2        12 min      2,63    2,63     3,25      2,38
     9500      1,1        12 min      3,25    2,88     3,63      3,13

   Au-dela de 1 600 LE RESEAU EST UN BAC COMMUN — contraste 1,1 — et l'active
   se met a PERDRE contre la passive : quand la colonie nourrit un
   sporangiophore ou qu'il soit, choisir ou le poser ne sert plus a rien, et
   le joueur ne fait plus que gaspiller son attention. C'est exactement le
   243 contre 223 du prototype mort, et on en tient enfin la cause. En
   dessous de 400 rien n'arrive plus nulle part et la mesure n'est que du
   bruit. A 800 l'active gagne 88 %, et debrancher les raccourcis coute 41 %.

   Le chiffre se lit aussi tout seul : une perturbation parcourt sqrt(D.t),
   soit 980 um pendant les vingt minutes d'un remplissage — le rayon de la
   colonie a la mi-partie. UN SPOROCYSTE EST NOURRI PAR SON VOISINAGE, PAS
   PAR LA COLONIE ENTIERE. */
const D_TRANS = 800;
/* Stabilite de la relaxation explicite : un noeud a jusqu'a quatre voisins,
   il faut donc alpha < 0,25. On sous-echantillonne le pas quand il le
   demande, ce qui rend le transport independant de dt PAR CONSTRUCTION et
   non plus par convention. */
const ALPHA_MAX = 0.22;

/* --- le nutriment ---------------------------------------------------------- */

/* Stock par cellule de 60 um, a matrice = 1. La matrice module : une cellule
   pauvre part a 0,35 de ca, une riche a 1,25. */
const STOCK_PLEIN = 1400;
/* Unites absorbees par seconde et par noeud, a stock plein. Une hyphe absorbe
   sur TOUTE SA LONGUEUR et pas seulement a la pointe : c'est vrai, et c'est
   ce qui rend une vieille hyphe utile — elle ne pousse plus mais elle
   nourrit. */
const ABS = 0.85;
/* Ce qu'une cellule epuisee rend encore : six pour cent. A quinze, le vieux
   mycelium restait rentable et rien ne poussait la colonie a bouger. */
const ABS_PLANCHER = 0.06;
/* Unites par micrometre construit. A 19,4 um/min une pointe depense donc
   0,52 unite par seconde. */
const COUT_EXT = 1.6;
/* ENTRETIEN : ce que coute, par seconde, un micrometre de mycelium vivant.
   C'est le terme qui manquait, et son absence se mesurait : a 165 minutes la
   colonie absorbait 318 unites par seconde et n'en depensait que 37, avec
   600 de reserve par pointe pour un confort de 26. Elle nageait dans la
   nourriture, aucune pointe n'etait jamais ralentie, et un sporocyste
   coutait un centieme du reseau.

   Il est biologiquement juste — un mycelium respire —, et c'est lui qui rend
   le jeu un jeu : l'absorption croit avec le nombre de noeuds POSES SUR DU
   SUBSTRAT FRAIS, l'entretien croit avec le nombre de noeuds tout court. Une
   colonie qui s'etale trop finit par s'entretenir au lieu de fructifier.

   Un noeud qui ne paie plus meurt au bout de `AUTOLYSE` secondes : c'est
   l'autolyse du vieux mycelium, et c'est ce qui fait que le reseau a une
   forme plutot qu'une taille. */
/* 0,24, et le chiffre vient d'une inegalite, pas d'un gout : il faut qu'un
   noeud pose sur du substrat EPUISE soit une perte. Il absorbe alors
   ABS x 0,06 = 0,051 par seconde ; a 0,105 d'entretien il etait encore
   rentable, la colonie s'etalait gratuitement et gardait 429 de reserve par
   pointe pour un confort de 26. A 0,24 il perd 0,19 par seconde, tandis
   qu'un noeud sur substrat frais en gagne 0,61.

   C'est toute la forme d'une colonie : L'INTERIEUR EST UNE DETTE, LE FRONT
   EST LE REVENU. L'equilibre tombe vers trois noeuds d'interieur pour un de
   front — et c'est pour ca qu'un mycelium fait un anneau et que son centre
   s'autolyse. */
const ENTRETIEN = 0.24;
const AUTOLYSE = 260;

/* Reserve de noeud au-dela de laquelle une pointe pousse a plein regime. En
   dessous elle ralentit proportionnellement, et a zero elle s'arrete — elle
   ne meurt pas, elle attend. */
const CONFORT = 110;

/* --- le sporocyste --------------------------------------------------------- */

/* Masse a rassembler pour un sporocyste complet. Elle est GROSSE devant ce
   qu'un noeud absorbe tout seul : c'est voulu, c'est ce qui force le reseau
   a la livrer, et donc ce qui fait compter la topologie.

   10 000, ET LE CHIFFRE EST MESURE, PAS CHOISI. On pose un puits sur la
   meilleure pointe et on regarde ce qui arrive : 14 u/s la premiere minute
   — le plafond de DEBIT_SPORE, le noeud vide sa propre reserve — puis un
   cone de deplection se creuse et le debit tombe a ce que le voisinage
   produit vraiment. Palier mesure : 2,1 u/s sur une colonie de onze pointes,
   8,8 a vingt-sept, 9,4 a quarante-neuf, 5,8 a soixante-trois quand le front
   a commence a manger l'arriere. Disons six.

   A 26 000 il fallait 72 min et personne n'y arrivait jamais ; a 10 000 il
   en faut 28 sur une colonie mure, une heure sur une jeune, et jamais sur
   une colonie de onze pointes. C'est exactement l'arbitrage qu'on veut :
   fructifier trop tot ne rate pas de peu, ca ne marche pas. */
const MASSE_SPORE = 10000;
/* Debit maximal que le sporangiophore tire de son noeud. Le reste du temps
   il attend que la relaxation le realimente : un noeud bien connecte a
   l'amont finit son sporocyste, un noeud en cul-de-sac non. */
const DEBIT_SPORE = 14;
/* IL N'Y A PAS DE SEUIL DE DEPART, et c'est une decision, pas un oubli.

   Il y en a eu un, et il n'a jamais rien gate d'utile. A 400 personne ne
   sporulait ; a 140 il tombait pile sur la moyenne du reseau (137 par noeud
   mesures) et refusait une fois sur deux, au hasard de la relaxation — 178
   refus sur 178 essais dans une partie, zero sporocyste, score nul. Un seuil
   qui trie au hasard n'est pas une contrainte, c'est du bruit.

   Et il disait le contraire de ce qu'on avait compris : LA FAISABILITE D'UN
   SPOROCYSTE N'EST PAS UNE AFFAIRE DE STOCK, C'EST UNE AFFAIRE DE DEBIT. Il
   se remplit de ce que son voisinage lui livre, et ce que le voisinage livre
   est le surplus — absorption moins entretien moins extension. On peut donc
   en monter un n'importe quand sur n'importe quel noeud vivant : ce qui se
   decide, c'est OU et QUAND, et la sanction d'un mauvais choix est qu'il ne
   finit pas. */

/* Maille du CALQUE RESERVE, en um. C'est la portee de captation d'un
   sporangiophore — sqrt(D.t) sur les vingt minutes d'un remplissage — donc
   la bonne echelle pour dire « il y a de quoi ici ». Le doc de conception
   l'avait deja prevu comme un calque qu'on allume ; il existe d'abord ici,
   parce que sans lui le joueur choisit son emplacement a l'aveugle.

   Mesure qui l'a impose : sur 44 sporocystes lances par une politique qui
   choisissait la pointe la plus eloignee du front, 11 aboutissaient. La
   meme politique, mais collee a une seule pointe pendant toute la partie,
   en menait 25 sur 56 — et la difference ne tenait ni au moment ni au
   sursis, elle tenait au VOISINAGE : 8 100 unites de reserve autour du
   noeud porteur contre 18 500, sur un axe de deux a six noeuds contre onze.
   La pointe la plus avancee est une jeune branche : son porteur est pose
   sur du mycelium mince. */
const MAILLE_RES = 600;

/* Le sporangiophore ne part pas de la pointe : il part du mycelium etabli,
   six noeuds en arriere. C'est vrai — un sporangiophore de Mucorales nait a
   un noeud du stolon, pas a l'apex — et c'est aussi la ou il y a de la
   reserve et ou le front arrive en dernier. */
const RECUL_SPORE = 6;

/* --- les stress ------------------------------------------------------------

   LES VALEURS SONT CELLES DU PLATEAU, PAS DE CE FICHIER. Front, taches
   hostiles et stock viennent de `sim/matrices.js` ; ce qui reste ici est ce
   qui ne depend pas de l'aliment. Les chiffres mesures aux verdicts 19 a 21
   sont ceux de la gelose neutre et sont justifies la-bas, avec elle. */

/* Rayon d'une tache a l'instant ou elle apparait. */
const R_MENACE0 = 120;
/* Derriere le front : le stock est mort, les pointes meurent, et la reserve
   deja stockee fuit. C'est elle qu'il faut avoir rapatriee. */
const FUITE = 0.030;

/* Duree maximale d'un plateau, en secondes de colonie. */
export const T_MAX = 3 * 3600;

/* --- le genome ------------------------------------------------------------- */

/* Les traits SONT des constantes du moteur. C'est ce qui rend l'heritage
   presque gratuit, et ce qui garantit qu'un trait herite se VOIT. */
export const GENOME_BASE = {
  vitesse: 1,        // x V_MICRO : etendue rapide contre cout par um
  uch: 1,            // x UCH : ramifier dense ou filer loin
  calibre: 1,        // x R : debit de transport contre cout de construction
  tolerance: 1,      // resistance au front
  sac: 1,            // x MASSE_SPORE : un gros sporocyste emporte plus, et
                     //   met plus longtemps a se remplir
  reserve: 1,        // x RESERVE_SPORE : germer vite contre germer riche
};

/* CE QUE LA SPORE APPORTE EN ARRIVANT, reparti sur ses premieres pointes.
   Une spore ne demarre pas a zero : elle a des globules lipidiques, et c'est
   precisement ce qui lui permet de germer avant d'avoir mange.

   220 — deux fois le confort d'un noeud, reparti sur les trois premieres
   pointes —, et c'est un chiffre balaye, pas suppose. Sur huit graines, la
   reserve change l'OUVERTURE, donc tout le reste :

     reserve    passive  active  devant  collee  frontale
        0         1,13    2,13    3/8     2,63     0,50
      120         1,75    2,13    3/8     3,00     1,00
      220         0,88    2,38    6/8     1,88     0,25
      330         1,50    1,63    4/8     2,00     0,38

   A zero et a 120, la colonie livree a elle-meme s'en sort aussi bien qu'une
   colonie jouee : l'ouverture est si contrainte qu'aucune decision precoce
   ne porte. A 330 elle est si confortable que le debut ne se joue plus non
   plus. A 220 l'active gagne sur six graines sur huit, elle passe devant la
   politique collee, et poser son sporocyste du mauvais cote coute un facteur
   neuf. C'est la que l'ouverture est une decision.

   C'est aussi le trait `reserve` du genome, et l'arbitrage est reel : une
   grosse reserve part mieux, une petite laisse de la masse au sporocyste. */
const RESERVE_SPORE = 220;

/* --- l'heritage ------------------------------------------------------------

   LES TRAITS SONT DEJA DES CONSTANTES DU MOTEUR, et c'est ce qui rend cette
   partie presque gratuite — et ce qui garantit qu'un trait herite SE VOIT :

     vitesse    V_MICRO            etendue rapide contre cout par um
     uch        UCH                ramifier dense ou filer loin
     calibre    D_TRANS, COUT_EXT  debit de transport contre cout de construction
     tolerance  marge sur le front survivre au sec contre rendement
     sac        MASSE_SPORE        combien on emporte contre le temps de remplir
     reserve    RESERVE_SPORE      germer vite contre germer riche

   Il n'y a rien a inventer : on propose trois candidates mutees, le joueur en
   choisit une, et il la regarde partir. Le plus beau moment du moteur devient
   le moment de decision du roguelite.

   Chaque candidate porte UNE mutation dominante en plus de la derive de fond.
   Sans elle, trois tirages gaussiens sur six traits se ressemblent tous, et
   le choix n'en est pas un : on veut pouvoir dire « celle-la est la rapide ».
*/
export const TRAITS = {
  vitesse:   { nom: 'Vitesse de pointe',   pour: 'pousse plus vite',        contre: 'coûte plus cher au micromètre' },
  uch:       { nom: 'Unité de croissance', pour: 'file plus loin',          contre: 'ramifie moins' },
  calibre:   { nom: 'Calibre du tube',     pour: 'transporte mieux',        contre: 'coûte plus cher à construire' },
  tolerance: { nom: 'Tolérance au sec',    pour: 'résiste au front',        contre: '—' },
  sac:       { nom: 'Taille du sporocyste', pour: 'emporte plus de spores', contre: 'met plus longtemps à se remplir' },
  reserve:   { nom: 'Réserve de la spore', pour: 'germe mieux',             contre: 'autant de moins pour le sporocyste' },
};

const CLES_TRAITS = Object.keys(GENOME_BASE);
/* Derive de fond, ecart type. */
const DERIVE = 0.07;
/* Ce que la mutation dominante ajoute, en plus. */
const DOMINANTE = 0.22;
/* Bornes : au-dela, un trait cesse d'etre un arbitrage et devient un
   interrupteur. */
const TRAIT_MIN = 0.55, TRAIT_MAX = 1.70;

/** Une spore mutee, et le trait qui la caracterise. */
export function muter(genome, rng, cle = null) {
  const g = { ...GENOME_BASE, ...genome };
  const dom = cle || CLES_TRAITS[(rng() * CLES_TRAITS.length) | 0];
  for (const k of CLES_TRAITS) {
    /* Box-Muller : une derive gaussienne, pas uniforme — une mutation est
       le plus souvent petite. */
    const u = Math.max(1e-9, rng()), v = rng();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let x = g[k] * (1 + n * DERIVE);
    if (k === dom) x *= 1 + (rng() < 0.5 ? -DOMINANTE : DOMINANTE);
    g[k] = clamp(x, TRAIT_MIN, TRAIT_MAX);
  }
  return { genome: g, dominante: dom, sens: g[dom] >= (genome[dom] ?? 1) ? 1 : -1 };
}

/** Trois candidates, chacune avec une dominante DIFFERENTE : sans ca, deux
    des trois portaient reguliairement le meme trait et le choix se reduisait
    a deux. */
export function troisSpores(genome, rng) {
  const cles = [...CLES_TRAITS];
  for (let i = cles.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [cles[i], cles[j]] = [cles[j], cles[i]];
  }
  return [0, 1, 2].map((i) => muter(genome, rng, cles[i]));
}

export class Jeu {
  constructor(opts = {}) {
    const graine = opts.graine ?? 1;
    this.rng = mulberry32(graine ^ 0x9e3779b9);
    this.genome = { ...GENOME_BASE, ...(opts.genome || {}) };

    /* LE PLATEAU. Tout ce qui suit — stock, front, taches hostiles — en
       vient : voir `sim/matrices.js`. Les constantes gardees ici sont celles
       de la gelose neutre, c'est-a-dire les valeurs calibrees aux verdicts
       19 a 21 ; une matrice les module, elle ne les remplace pas. */
    this.mat = opts.matrice || MATRICE_NEUTRE;
    this.th = new Thalle({
      graine, vMicro: V_MICRO * this.genome.vitesse, matrice: this.mat,
      uch: this.genome.uch,
    });
    this.th.modul = (p) => this.modulation(p);
    this.th.consigne = (p) => (p === this.tenue ? this.capForce : null);

    this.t = 0;
    this.stock = new Map();       // cellule 60 um -> nutriment restant
    this.noeuds = [];             // {ax, i, x, y, res, mort}
    this.aretes = [];             // [a, b] indices de noeuds
    this.parAxe = [];             // axe -> [indices de noeuds]
    this.dernier = [];            // axe -> dernier point d'axe promu en noeud
    this.jVues = 0;               // anastomoses deja cablees
    this.champRes = new Map();    // calque reserve, maille MAILLE_RES

    this.tenue = null;            // la pointe tenue, ou null
    this.capForce = null;         // consigne de cap pour la pointe tenue
    this.sporocyste = null;       // {noeud, masse, t0} : un seul a la fois
    this.spores = 0;              // sporocystes MENES A TERME. C'est le score.
    this.tSpores = [];            // l'instant de chacun
    this.avortes = 0;             // ceux dont le noeud est mort en route
    /* La colonie fructifie toute seule si on ne fait rien. Voir `pas`. */
    this.autoSpore = opts.autoSpore !== false;
    /* Pour le verdict 21 seulement : la meme colonie, sans ses raccourcis. */
    this.sansAnastomose = !!opts.sansAnastomose;
    this.fin = null;              // 'eteint' | 'temps'

    /* Comptes, pour le banc. */
    this.absorbe = 0; this.depense = 0; this.perdu = 0;
    this.entretien = 0; this.autolyses = 0;
    this.tRef = 0; this.totRef = 0; this.resRef = 0;
    this.tuesParMenace = 0; this.lysees = 0;
    this.branchesForcees = 0; this.tempsTenu = 0; this.tempsHaut = 0;

    /* Les menaces sont tirees a la construction : le plateau est le meme a
       chaque partie de la meme graine, sinon il se re-tirerait dans le dos
       du joueur pendant qu'il est ailleurs, et ca se verrait. */
    this.menaces = [];
    const M = this.mat.menaces;
    for (let i = 0; i < M.n; i++) {
      const a = this.rng() * Math.PI * 2, d = 400 + this.rng() * 1800;
      const rMax = M.r0 + this.rng() * (M.r1 - M.r0);
      /* UNE TACHE `fixe` EST LA DEPUIS LE DEBUT ET NE GRANDIT PAS. Les
         vesicules a huile d'un zeste sont des mines : elles n'arrivent pas,
         elles sont la, et c'est le seul plateau qu'on puisse lire en entier
         avant d'y aller — le seul ou lire sert vraiment. La concurrence d'un
         compost, elle, gagne du terrain aussi vite qu'on en gagne. */
      this.menaces.push({
        x: Math.cos(a) * d, y: Math.sin(a) * d,
        t0: M.fixe ? 0 : 1200 + this.rng() * 7800,
        r: M.fixe ? rMax : 0, rMax,
      });
    }

    this.majGraphe();
    /* La reserve de la spore, versee aux premiers noeuds. */
    const r0 = RESERVE_SPORE * this.genome.reserve / Math.max(1, this.noeuds.length);
    for (const nd of this.noeuds) nd.res = r0;
  }

  /* --- le plateau ---------------------------------------------------------- */

  /** Le rayon de la menace qui couvre ce point, ou 0. */
  menace(x, y) {
    for (const m of this.menaces) {
      if (m.r <= 0) continue;
      if (Math.hypot(x - m.x, y - m.y) < m.r) return m.r;
    }
    return 0;
  }

  /** Ce qu'il faut rassembler pour un sporocyste, avec le trait `sac`. Un
      gros sac emporte plus de spores et met plus longtemps a se remplir. */
  get masseSac() { return MASSE_SPORE * this.genome.sac; }

  /** Vitesse du front sur ce plateau, um/s. Une mie seche deux fois plus
      vite qu'un fromage, et c'est toute la difference de strategie. */
  get vFront() { return this.mat.front.v; }

  /** Abscisse du front de dessechement a l'instant courant. */
  get front() { return this.mat.front.depart + this.mat.front.v * this.t; }

  /** Ce que contient une cellule PLEINE sur ce plateau. Le riz plafonne
      parce qu'il n'y a presque pas d'azote a prendre, pas parce qu'on y
      pousse lentement : vitesse et stock sont deux choses. */
  get plein() { return STOCK_PLEIN * this.mat.stock; }

  /** Ce qui reste a manger dans la cellule d'un point. */
  cle(x, y) {
    return (Math.floor(x / MAILLE_DENS) * 73856093) ^ (Math.floor(y / MAILLE_DENS) * 19349663);
  }

  reste(x, y) {
    const k = this.cle(x, y);
    let s = this.stock.get(k);
    if (s === undefined) { s = this.plein * this.th.matrice(x, y); this.stock.set(k, s); }
    return s;
  }

  /** Le meme, SANS MEMORISER : le rendu lit le plateau, il ne le peuple pas.
      Un calque echantillonne dix mille cellules par image, dont la colonie
      n'a jamais approche aucune. */
  resteVu(x, y) {
    const s = this.stock.get(this.cle(x, y));
    return s === undefined ? this.plein * this.th.matrice(x, y) : s;
  }

  /**
   * INTERPOLATION BILINEAIRE, POUR LE RENDU SEULEMENT.
   *
   * Une grille de simulation lue telle quelle au rendu se voit comme un
   * damier : on lit une structure de donnees, pas un substrat. Le piege est
   * deja paye une fois sur la densite du thalle, et le calque substrat l'a
   * refait a l'identique — des carres de soixante micrometres, francs, la ou
   * la colonie avait mange.
   *
   * La simulation, elle, continue de lire la maille brute : c'est la que le
   * nutriment est stocke, et l'adoucir la fausserait.
   */
  champLisse(x, y, brut) {
    const m = MAILLE_DENS;
    const fx = x / m - 0.5, fy = y / m - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j;
    const a = brut((i + 0.5) * m, (j + 0.5) * m), b = brut((i + 1.5) * m, (j + 0.5) * m);
    const c = brut((i + 0.5) * m, (j + 1.5) * m), d = brut((i + 1.5) * m, (j + 1.5) * m);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Le substrat tel qu'on le VOIT : lisse, et sans rien memoriser. */
  substratVu(x, y) { return this.champLisse(x, y, (a, b) => this.resteVu(a, b)); }

  /** La reserve telle qu'on la VOIT. Sa maille fait 600 um : lue brute, le
      calque est un damier de dix carres de cote. */
  reserveVue(x, y) {
    const m = MAILLE_RES;
    const fx = x / m - 0.5, fy = y / m - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j;
    const g = (p, q) => this.reserveLocale((p + 0.5) * m, (q + 0.5) * m);
    const a = g(i, j), b = g(i + 1, j), c = g(i, j + 1), d = g(i + 1, j + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /* --- le graphe ----------------------------------------------------------- */

  /**
   * Promeut les points d'axe nouvellement construits en noeuds, et cable les
   * branchements et les anastomoses apparus depuis le dernier appel.
   *
   * Incrementalement : un axe ne fait que s'allonger par l'avant, donc il n'y
   * a jamais rien a defaire. C'est la meme propriete que celle qui rend une
   * paroi rigide (regle 1), a l'echelle de la colonie.
   */
  majGraphe() {
    const A = this.th.axes;
    for (let a = 0; a < A.length; a++) {
      if (!this.parAxe[a]) { this.parAxe[a] = []; this.dernier[a] = -1; }
      const ax = A[a], pas = Math.round(PAS_NOEUD / 6);
      for (let i = this.dernier[a] + 1; i < ax.n; i++) {
        if (i % pas !== 0 && i !== 0) continue;
        const id = this.noeuds.length;
        this.noeuds.push({ ax: a, i, x: ax.xs[i], y: ax.ys[i], res: 0, mort: false });
        const l = this.parAxe[a];
        if (l.length) this.aretes.push([l[l.length - 1], id]);
        l.push(id);
        /* Le premier noeud d'un axe est raccorde a son parent : sans ca le
           reseau n'est pas connexe et la reserve ne peut pas descendre dans
           une branche. */
        if (l.length === 1 && ax.lien) {
          const p = this.noeudPres(ax.lien.ax, ax.lien.i);
          if (p >= 0) this.aretes.push([p, id]);
        }
        this.dernier[a] = i;
      }
    }
    /* Les anastomoses : le raccourci, la seule facon d'aller d'une branche a
       l'autre sans repasser par l'origine.
       `sansAnastomose` ne les EMPECHE PAS : la colonie fusionne exactement
       pareil, on ne cable simplement pas l'arete. La geometrie est donc au
       micrometre pres la meme et seul le transport change — c'est la seule
       facon d'isoler ce que la topologie apporte. */
    for (; this.jVues < this.th.jonctions.length; this.jVues++) {
      if (this.sansAnastomose) continue;
      const j = this.th.jonctions[this.jVues];
      const a = this.noeudPres(j.a, j.i), b = this.noeudPres(j.b, j.j);
      if (a >= 0 && b >= 0 && a !== b) this.aretes.push([a, b]);
    }
  }

  /** Le noeud le plus proche du point `i` de l'axe `a`, ou -1. */
  noeudPres(a, i) {
    const l = this.parAxe[a];
    if (!l || !l.length) return -1;
    const k = clamp(Math.round(i / Math.round(PAS_NOEUD / 6)), 0, l.length - 1);
    return l[k];
  }

  /** Le noeud de tete d'une pointe : celui d'ou elle tire sa reserve. */
  noeudDe(p) {
    const l = this.parAxe[p.axe.idx];
    return l && l.length ? l[l.length - 1] : -1;
  }

  /** Ce que le reseau tient a portee de captation d'un point : le calque. */
  reserveLocale(x, y) {
    return this.champRes.get((Math.floor(x / MAILLE_RES) * 73856093)
                           ^ (Math.floor(y / MAILLE_RES) * 19349663)) || 0;
  }

  /** Le noeud porteur d'un sporangiophore : en arriere, sur l'etabli. */
  noeudPorteur(p) {
    const l = this.parAxe[p.axe.idx];
    if (!l || !l.length) return -1;
    return l[Math.max(0, l.length - 1 - RECUL_SPORE)];
  }

  /* --- la loi -------------------------------------------------------------- */

  /** Ce que `Thalle` demande : de combien cette pointe est-elle ralentie ? */
  modulation(p) {
    const n = this.noeudDe(p);
    if (n < 0) return 1;
    const nd = this.noeuds[n];
    if (nd.mort) return 0;
    return clamp(nd.res / CONFORT, 0, 1);
  }

  pas(dt) {
    if (this.fin) return;
    this.t += dt;
    const th = this.th;

    /* 1. La colonie pousse, avec sa loi et pas une autre. On facture ensuite
          a chaque pointe ce qu'elle a construit : `Thalle` ne connait pas la
          reserve, et il n'a pas a la connaitre.

          LE RELEVE SE FAIT A LA FIN DU PAS, PAS AU DEBUT. Pris au debut, il
          ne voyait que ce que `th.maj` venait de construire — ce qui suffit
          tant que le jeu tourne seul. Mais des qu'une pointe est VISITEE, sa
          croissance ne vient plus de `th.maj` : c'est la simulation apicale
          qui l'avance entre deux appels, par `Thalle.inscrire`. Releve au
          debut, ce materiau-la etait construit gratuitement. Releve a la
          fin, il est facture au pas suivant, et l'ecart est d'une image. */
    th.maj(dt);
    this.majGraphe();

    const fr = this.front;
    const N = this.noeuds;

    /* 2. Le front tue ce qu'il depasse. La tolerance du genome lui donne du
          retard, pas l'immunite. */
    const marge = 90 * (this.genome.tolerance - 1);
    for (const nd of N) {
      if (!nd.mort && nd.x < fr - marge) { nd.mort = true; }
      if (nd.mort) { this.perdu += nd.res * FUITE * dt; nd.res *= 1 - FUITE * dt; }
    }
    for (const p of th.pointes) {
      if (p.vive && p.x < fr - marge) { p.vive = false; p.seche = true; }
    }

    /* 2 bis. LES MENACES S'ETENDENT, et elles tuent ce qu'elles couvrent.
              Elles ne se lisent que d'en haut : voir `vue()`. */
    for (const m of this.menaces) {
      if (this.t < m.t0) continue;
      m.r = Math.min(m.rMax, R_MENACE0 + this.mat.menaces.v * (this.t - m.t0));
    }
    if (this.menaces.some((m) => m.r > 0)) {
      for (const nd of N) {
        if (nd.mort) continue;
        if (this.menace(nd.x, nd.y)) { nd.mort = true; this.tuesParMenace++; }
      }
      for (const p of th.pointes) {
        if (p.vive && this.menace(p.x, p.y)) { p.vive = false; p.brulee = true; }
      }
    }

    /* 3. Absorption. Une hyphe absorbe sur toute sa longueur. */
    for (const nd of N) {
      if (nd.mort) continue;
      const k = this.cle(nd.x, nd.y);
      let s = this.stock.get(k);
      if (s === undefined) { s = this.plein * th.matrice(nd.x, nd.y); }
      if (s <= 0) { this.stock.set(k, 0); continue; }
      /* LE RENDEMENT SUIT LA CONCENTRATION ABSOLUE, pas le remplissage
         relatif de la cellule. Rapporte a `plein`, une cellule de riz
         donnait autant par seconde qu'une cellule de fromage et se vidait
         deux fois et demie plus vite : la colonie n'avait pas le temps
         d'atteindre du frais et mourait a la cinq-centieme seconde — 0,1 mm
         de mycelium, trois noeuds autolyses, cinq plateaux sur sept morts
         au demarrage. Rapporte a STOCK_PLEIN, une cellule pauvre donne
         moins et met le MEME temps a se vider : un riz plafonne, il ne tue
         pas. C'est exactement ce que le doc demandait. */
      const q = Math.min(s, ABS * dt * (s / STOCK_PLEIN + ABS_PLANCHER));
      this.stock.set(k, s - q);
      nd.res += q;
      this.absorbe += q;
    }

    /* 3 bis. ENTRETIEN. Chaque noeud vivant paie sa respiration, et celui qui
              ne peut plus payer s'autolyse. C'est ce qui empeche la colonie
              de s'etaler gratuitement — et ce qui fait qu'un reseau pose sur
              du substrat epuise devient une CHARGE, pas un acquis. */
    /* UN NOEUD QUI PORTE UN SPORANGIOPHORE NE S'AUTOLYSE PAS DE SA PROPRE
       SOIF. Le puits le tient a zero par construction — c'est tout l'objet
       d'un puits —, donc la dette montait, et au bout de 260 s il mourait en
       emportant son sporocyste. Mesure : cinq a dix-huit avortements par
       partie, et pas une seule spore sur quarante-huit parties, toutes
       politiques confondues. La dette d'entretien dit qu'un troncon de
       mycelium n'est plus nourri ; elle ne dit rien quand c'est lui qui
       nourrit. Le front, lui, le tue toujours. */
    const kSp = this.sporocyste ? this.sporocyste.noeud : -1;
    for (let k = 0; k < N.length; k++) {
      const nd = N[k];
      if (nd.mort) continue;
      nd.res -= ENTRETIEN * dt;
      this.entretien += ENTRETIEN * dt;
      if (nd.res < 0) {
        nd.res = 0;
        nd.dette = (nd.dette || 0) + dt;
        if (nd.dette > AUTOLYSE && k !== kSp) { nd.mort = true; this.autolyses++; }
      } else if (nd.dette) nd.dette = 0;
    }

    /* 3 ter. UNE POINTE DONT LE MYCELIUM EST MORT EST MORTE. Elle tire sa
              reserve de son noeud de tete ; si celui-ci s'est autolyse, il
              n'y a plus rien derriere elle. Sans cette ligne, `modulation`
              rendait 0 pour toujours et la partie continuait avec des
              pointes vivantes qui n'avancaient plus : sur un plateau pauvre,
              trois heures de rien, et `fin` ne se declenchait jamais parce
              que `vive` restait vrai. Une colonie qui ne peut plus pousser
              n'est pas une colonie qui attend. */
    for (const p of th.pointes) {
      if (!p.vive) continue;
      const n = this.noeudDe(p);
      if (n >= 0 && N[n].mort) { p.vive = false; p.lysee = true; this.lysees++; }
    }

    /* 4. Facturation de l'extension, au noeud de tete. */
    for (const p of th.pointes) {
      const da = p.l - (p.lAv ?? p.l);
      if (da <= 0) continue;
      const n = this.noeudDe(p);
      if (n < 0) continue;
      const c = COUT_EXT * da * this.genome.calibre;
      N[n].res = Math.max(0, N[n].res - c);
      this.depense += c;
    }

    /* 5. LE TRANSPORT. Relaxation sur les aretes, K fois. Conservatif : ce
          qu'un noeud perd, son voisin le gagne, et rien ne se cree. C'est
          pauvre comme hydraulique et c'est assume — ce n'est pas un modele
          de pression, c'est un gradient qui coule. */
    const E = this.aretes;
    /* LE CALIBRE EST UN ARBITRAGE, ET C'EST LE PLUS BEL ARBITRAGE DU LOT :
       une section double transporte deux fois mieux et coute deux fois plus
       cher au micrometre. Les deux sont deja dans le moteur — la diffusivite
       ici, `COUT_EXT` a l'etape 4 —, il n'y a qu'a les brancher au meme
       trait. */
    const aTot = D_TRANS * this.genome.calibre * dt / (PAS_NOEUD * PAS_NOEUD);
    const K = Math.max(1, Math.ceil(aTot / ALPHA_MAX));
    const al = aTot / K;
    for (let k = 0; k < K; k++) {
      for (let e = 0; e < E.length; e++) {
        const a = N[E[e][0]], b = N[E[e][1]];
        if (a.mort || b.mort) continue;
        const f = al * (a.res - b.res);
        a.res -= f; b.res += f;
      }
    }

    /* 5 bis. LE CALQUE RESERVE. Une grille grossiere de ce que le reseau
              tient, a l'echelle ou un sporangiophore peut aller le chercher.
              Elle ne sert pas a la simulation : elle sert a ce que le joueur
              VOIE ce que le modele sait deja. */
    this.champRes = new Map();
    for (const nd of N) {
      if (nd.mort) continue;
      const k = (Math.floor(nd.x / MAILLE_RES) * 73856093) ^ (Math.floor(nd.y / MAILLE_RES) * 19349663);
      this.champRes.set(k, (this.champRes.get(k) || 0) + nd.res);
    }

    /* 6. Le sporocyste pompe le reseau. Il ne se remplit pas plus vite que
          la reserve n'arrive : un noeud bien connecte a l'amont le finit, un
          cul-de-sac non. C'est la que la topologie se paie. */
    const sp = this.sporocyste;
    if (sp) {
      const nd = N[sp.noeud];
      /* Son noeud est mort : tout ce qu'il avait rassemble est perdu. C'est
         la sanction du mauvais emplacement, et elle est entiere — une spore
         a moitie remplie ne germe pas. */
      if (nd.mort) { this.sporocyste = null; this.perdu += sp.masse; this.avortes++; }
      else {
        const q = Math.min(nd.res, DEBIT_SPORE * dt);
        nd.res -= q; sp.masse += q;
        if (sp.masse >= this.masseSac) {
          this.spores++; this.tSpores.push(this.t); this.sporocyste = null;
        }
      }
    }

    /* 7. LA COLONIE SPORULE TOUTE SEULE, et c'est capital pour le verdict.
          Sans cette regle, une partie passive ferait zero par construction et
          « ne rien faire est puni » serait truque. Le declencheur est celui
          de la biologie — la LIMITATION NUTRITIVE : quand les pointes
          n'arrivent plus a se nourrir, le mycelium arrete de s'etendre et
          fructifie. Elle choisit la pointe la mieux pourvue qu'elle trouve
          en tirant six au sort, comme la regle de Trinci tire six pointes
          pour ramifier.

          Le joueur, lui, voit la carte et le front. Tout son avantage doit
          venir de la : choisir un meilleur noeud, et choisir un meilleur
          moment. S'il n'y arrive pas, c'est le verdict qui le dira. */
    if (this.autoSpore && !this.sporocyste) {
      /* LE DECLENCHEUR : LE RESEAU CESSE DE S'ENRICHIR. C'est le signal
         honnete de la limitation nutritive — tant que la colonie gagne du
         terrain frais, elle accumule ; quand l'entretien de ce qu'elle a
         construit rattrape ce qu'elle absorbe, elle fructifie.

         Un seuil sur la reserve par pointe ne marchait pas : le reseau est
         plat, la reserve par pointe tourne autour de 150 quoi qu'il arrive,
         et selon le seuil choisi la regle ne se declenchait jamais ou tout
         de suite. Une DERIVEE, elle, dit quelque chose. */
      let tot = 0;
      for (const nd of N) if (!nd.mort) tot += nd.res;
      if (this.t - this.tRef > 600) { this.resRef = this.totRef; this.totRef = tot; this.tRef = this.t; }
      let best = null, bres = -1;
      if (this.t > 2700 && this.resRef > 0 && tot <= this.resRef) {
        for (let k = 0; k < 6; k++) {
          const p = th.pointes[(this.rng() * th.pointes.length) | 0];
          if (!p.vive) continue;
          const j = this.noeudDe(p);
          if (j < 0 || N[j].mort) continue;
          if (N[j].res > bres) { bres = N[j].res; best = p; }
        }
        if (best) {
          const k = this.noeudPorteur(best);
          if (k >= 0 && !N[k].mort) {
            this.sporocyste = { noeud: k, masse: 0, t0: this.t, auto: true };
          }
        }
      }
    }

    /* 8. Fins de partie. */
    if (!this.fin) {
      if (!th.pointes.some((p) => p.vive)) this.fin = 'eteint';
      else if (this.t >= T_MAX) this.fin = 'temps';
    }
    if (this.tenue) this.tempsTenu += dt; else this.tempsHaut += dt;
    /* Le releve pour le pas suivant. Voir 1. */
    for (const p of th.pointes) p.lAv = p.l;
  }

  /* --- ce que le joueur peut faire ----------------------------------------- */

  /**
   * Tenir une pointe, c'est la REGARDER. On ne peut en tenir qu'une, et tant
   * qu'on la tient on ne voit pas le reste — voir `vue()`.
   */
  tenir(p) { this.tenue = p && p.vive ? p : null; this.capForce = null; }

  /** Conduire la pointe tenue : une consigne, pas une telecommande. */
  conduire(cible) {
    if (!this.tenue) return false;
    const p = this.tenue;
    let d = cible - p.th;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.capForce = clamp(d, -1, 1);
    return true;
  }

  /**
   * Ramifier MAINTENANT. En autonomie, la regle de Trinci ramifie tous les
   * 110 um, sur une pointe tiree au sort. Tenue, on ramifie ici, a cet angle.
   */
  ramifier(cote = 1) {
    const p = this.tenue;
    if (!p || !p.vive) return false;
    /* MEME GESTE QUE LA COLONIE, ET C'EST UNE CORRECTION MESUREE. La branche
       forcee partait de (p.x, p.y) — de la pointe elle-meme — alors que la
       regle de Trinci sement 9 a 20 um en arriere. Plantee a la pointe, la
       fille naissait dans la cellule que sa mere venait de remplir : elle y
       lisait une densite saturee et mourait de famine a la seconde suivante.
       Mesure : treize famines contre cinq, et cinquante-sept branches forcees
       pour rien.

       Meme raison pour le quota : la colonie refuse de rebrancher une pointe
       qui a construit moins de 25 um depuis sa derniere branche. Sans ce
       garde-fou le joueur pouvait en poser une toutes les vingt secondes,
       soit tous les 6,5 um — sept branches la ou la colonie en met une. */
    if (p.l - (p.lBranche ?? 0) < 25) return false;
    const n = this.noeudDe(p);
    if (n < 0 || this.noeuds[n].res < 45) return false;
    this.noeuds[n].res -= 45;
    const ax = p.axe;
    const i = Math.max(0, ax.n - 1 - Math.round((9 + this.rng() * 11) / 6));
    const ang = (60 + this.rng() * 20) * Math.PI / 180;
    this.th.semer(ax.xs[i], ax.ys[i], p.th + cote * ang, p.gen + 1,
                  { ax: ax.idx, i });
    this.th.branchements++;
    this.branchesForcees++;
    p.lBranche = p.l;
    return true;
  }

  /** Monter un sporangiophore sur la pointe tenue. Un seul a la fois. */
  sporuler() {
    const p = this.tenue;
    if (!p || !p.vive || this.sporocyste) return false;
    const n = this.noeudPorteur(p);
    if (n < 0 || this.noeuds[n].mort) return false;
    this.sporocyste = { noeud: n, masse: 0, t0: this.t };
    return true;
  }

  /* --- ce que le joueur VOIT ------------------------------------------------ */

  /**
   * L'asymetrie est le coeur du jeu : en haut on voit la carte et pas le
   * detail, en bas on voit une pointe et plus rien d'autre. Une politique de
   * banc qui lirait l'etat complet a tout instant ne mesurerait pas un joueur,
   * elle mesurerait un oracle.
   */
  vue() {
    if (this.tenue) {
      const p = this.tenue, n = this.noeudDe(p);
      return {
        ou: 'micro', t: this.t,
        pointe: p,
        reserve: n >= 0 ? this.noeuds[n].res : 0,
        devant: this.reste(p.x + Math.cos(p.th) * MAILLE_DENS, p.y + Math.sin(p.th) * MAILLE_DENS),
        gauche: this.reste(p.x + Math.cos(p.th - 0.8) * MAILLE_DENS, p.y + Math.sin(p.th - 0.8) * MAILLE_DENS),
        droite: this.reste(p.x + Math.cos(p.th + 0.8) * MAILLE_DENS, p.y + Math.sin(p.th + 0.8) * MAILLE_DENS),
        sporocyste: this.sporocyste ? { ...this.sporocyste } : null,
      };
    }
    let res = 0, vives = 0;
    const tetes = [];
    for (const p of this.th.pointes) {
      if (!p.vive) continue;
      vives++;
      const n = this.noeudDe(p);
      /* ON MONTRE LE NOEUD PORTEUR, et pas seulement la pointe. Le
         sporangiophore ne nait pas a l'apex mais six noeuds en arriere : sur
         une jeune colonie, la pointe la plus avancee a son porteur pres de
         l'origine, c'est-a-dire LA OU LE FRONT ARRIVE EN PREMIER. Sans cette
         ligne, on demandait au joueur de choisir un emplacement sans le lui
         montrer, et les deux sporocystes d'une partie mouraient a 70 % et
         93 % apres soixante-cinq minutes de remplissage, x = front a
         l'unite pres. A l'ecran le sporangiophore se voit ; la vue doit
         donc le donner. */
      const k = this.noeudPorteur(p);
      const nd = k >= 0 ? this.noeuds[k] : null;
      tetes.push({
        p, reserve: n >= 0 ? this.noeuds[n].res : 0,
        porteur: nd && !nd.mort
          ? { x: nd.x, y: nd.y, res: nd.res, local: this.reserveLocale(nd.x, nd.y) }
          : null,
      });
    }
    for (const nd of this.noeuds) if (!nd.mort) res += nd.res;
    return {
      ou: 'macro', t: this.t,
      front: this.front, vives, reserveTotale: res, tetes,
      /* Le plateau se lit AVEC la carte : sa vitesse de front et celle de
         ses taches sont ce qui dit combien de temps on a. */
      vFront: this.vFront, vMenace: this.mat.menaces.v, plateau: this.mat.cle,
      /* LE CALQUE MENACE, et il n'existe QU'ICI. Une hyphe ne voit pas a un
         millimetre : la vue micro n'en dit rien, et c'est ce qui fait qu'on
         paie de rester en bas. */
      menaces: this.menaces.filter((m) => m.r > 0).map((m) => ({ x: m.x, y: m.y, r: m.r })),
      sporocyste: this.sporocyste ? { ...this.sporocyste } : null,
    };
  }

  /* --- le score ------------------------------------------------------------- */

  /**
   * CE QU'ON EMPORTE : le nombre de sporocystes menes a terme. Un sporocyste
   * inacheve ne vaut rien — une spore qui part a moitie remplie ne germe
   * pas — et c'est brutal a dessein : c'est ce qui fait de la date de
   * sporulation une decision.
   *
   * Il etait binaire, et la partie s'arretait au premier. Deux defauts, et
   * le second est le grave : la mesure ne distinguait plus « a peine » de
   * « largement », donc un verdict ne pouvait rien en tirer ; et surtout il
   * n'y avait plus d'arbitrage, puisque sporuler tot etait gratuitement
   * meilleur. Compte, la colonie doit choisir entre s'etendre encore — et
   * pouvoir en nourrir plusieurs — ou fructifier tout de suite.
   */
  get score() { return this.spores; }

  /** Avancement du sporocyste, pour le diagnostic du banc. */
  get avancement() {
    return this.sporocyste ? this.sporocyste.masse / this.masseSac : 0;
  }
}

export { MASSE_SPORE, CONFORT, STOCK_PLEIN, MAILLE_RES };
