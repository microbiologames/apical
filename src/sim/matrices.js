/* ---------------------------------------------------------------------------
   LES MATRICES : CHAQUE PLATEAU EST UN ALIMENT.

   Une moisissure alimentaire ne pousse pas sur du bruit de Perlin. Elle pousse
   dans une mie, une pate, un parenchyme, et ces choses-la ont une
   microstructure qu'on peut regarder. C'est la que se joue la variete, et elle
   doit etre VRAIE.

   Chaque matrice donne quatre choses, et les quatre sont des parametres du
   moteur qui existe deja — il n'y a rien de nouveau a simuler :

     1. un CHAMP NUTRITIF `nut`, exactement le contrat de l'ancienne
        `Thalle.matrice` : un facteur de croissance entre 0,35 et 1,25, ou 1
        est le milieu dans lequel la micro a ete mesuree (verdict 13). Il dit
        a quelle VITESSE on pousse ;
     2. un STOCK, multiplicateur de `STOCK_PLEIN`. Il dit COMBIEN il y a a
        manger, ce qui n'est pas la meme chose : un riz pousse vite et plafonne
        parce que l'azote y manque, pas le carbone ;
     3. une STRUCTURE `struct`, de 0 (libre) a 1 (infranchissable). Elle entre
        dans `facteur` — on ne pousse pas dans un globule gras — et son
        GRADIENT entre dans le cap : une hyphe suit les interstices. C'est un
        champ de distance sur des cellules hachees en coordonnees monde,
        exactement comme le grain de gelose ;
     4. un DANGER PROPRE : le front de dessechement (vitesse et origine) et
        les taches hostiles (nombre, rayon, vitesse d'extension, et si elles
        sont la depuis le debut ou si elles arrivent).

   LE PLATEAU DICTE LA STRATEGIE DE SORTIE, et c'est ce qui donne envie d'en
   voir un autre. Une mie se colonise vite et seche vite : on sporule tot. Un
   fromage nourrit longtemps mais le sel monte : on travaille loin de la
   croute. Un zeste est un champ de mines qu'il faut lire avant d'y aller.

   Le verdict 22 refuse que deux matrices donnent la meme partie.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, fbm2, noise2, hash2 } from '../core/util.js';

/* --- outils de microstructure ---------------------------------------------
   Tous rendent 0 (libre) a 1 (bloque), en coordonnees monde, sans etat. */

/**
 * Des POCHES RONDES sur une grille hachee : alveoles d'une mie, globules gras
 * d'un fromage, vesicules a huile d'un zeste. Une par cellule, jetee au hasard
 * dans sa cellule, de rayon variable — sur une grille reguliere on lirait un
 * damier, ce que le projet a deja paye deux fois.
 *
 * On regarde les neuf cellules voisines parce qu'une poche de rayon superieur
 * a la demi-maille deborde chez le voisin.
 */
function poches(x, y, maille, rMin, rMax, densite, s) {
  const ci = Math.floor(x / maille), cj = Math.floor(y / maille);
  let v = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const a = ci + i, b = cj + j;
      if (hash2(a, b, s) > densite) continue;
      const px = (a + hash2(a, b, s + 11)) * maille;
      const py = (b + hash2(a, b, s + 23)) * maille;
      const r = lerp(rMin, rMax, hash2(a, b, s + 37));
      const d = Math.hypot(x - px, y - py);
      /* Bord adouci sur un cinquieme du rayon : un bord franc renvoie une
         pointe comme un mur au lieu de la laisser glisser.

         ET PAS PLUS : ce champ sert au MOTEUR autant qu'a l'oeil. Adouci a
         la moitie du rayon pour faire plus joli, il a baisse la structure
         moyenne de tous les plateaux a poches — le fromage est passe de 8,1
         spores a 1,0 — et les sept se sont mis a se ressembler : la paire la
         plus proche est tombee de 0,20 a 0,08 et le verdict 22 avec elle.
         Ce qui se regle pour l'apparence se regle DANS LE RENDU. */
      v = Math.max(v, 1 - smoothstep(r * 0.80, r, d));
    }
  }
  return v;
}

/**
 * Un RESEAU DE PAROIS : le contraire d'une poche. Les cloisons d'un
 * parenchyme, les travees d'un gluten. On prend le bruit et on garde ce qui
 * est LOIN de sa mediane : les cretes forment un reseau connexe, et les creux
 * sont les compartiments.
 */
function cloisons(x, y, ech, epaisseur, s) {
  const n = fbm2(x / ech, y / ech, s);
  /* |n - 0,5| est petit sur la ligne de niveau : c'est la cloison. */
  return 1 - smoothstep(0, epaisseur, Math.abs(n - 0.5));
}

/**
 * Des FIBRES, anisotropes : le grain d'une charcuterie. On pousse dans le sens
 * du grain, on peine a le traverser. L'anisotropie est la seule facon de faire
 * un plateau qui a une DIRECTION, et c'est ce qui le rend reconnaissable au
 * premier coup d'oeil.
 */
function fibres(x, y, ang, pas, epaisseur, s) {
  const c = Math.cos(ang), si = Math.sin(ang);
  const u = x * c + y * si;          // le long des fibres
  const v = -x * si + y * c;         // en travers
  /* Les fibres ondulent : parfaitement droites, on lit du papier reglé. */
  const ond = (noise2(u / 420, 0, s) - 0.5) * pas * 0.9;
  const t = (v + ond) / pas;
  return 1 - smoothstep(0, epaisseur, Math.abs(t - Math.round(t)));
}

/* --- les sept plateaux ----------------------------------------------------

   `stock` multiplie STOCK_PLEIN ; `front.v` est en um/s, `front.depart` en um
   avant l'origine ; `menaces.fixe` dit que les taches sont la des le debut et
   ne grandissent pas.

   LA FENETRE DE VIABILITE EST MESUREE, PAS SUPPOSEE, et elle est etroite. On
   a balaye les deux variables une a une sur une matrice neutre par ailleurs,
   cinq graines chacune, politique active :

     stock     0,50   0,65   0,80   0,95   1,10   1,25   1,40
     mycelium   0,4    1,3   14,7   79,7  114,4  151,8  165,0  mm
     spores    0,00   0,00   0,00   2,00   4,60   7,40   9,40
     eteintes   5/5    5/5    4/5    0/5    0/5    0/5    0/5

     structure  0,00   0,15   0,30   0,45   0,60   (uniforme, sans interstice)
     mycelium   86,3   86,5   40,8   27,3   10,3   mm
     eteintes    0/5    0/5    3/5    4/5    5/5

   En dessous de 0,8 de stock, le compte ne tombe jamais juste : un noeud
   absorbe moins que son entretien avant que la colonie n'ait atteint du
   frais, tout s'autolyse et la partie est finie a la quinzieme minute. C'est
   pour ca que le premier jeu de valeurs — riz a 0,42, mie a 0,62 — tuait cinq
   plateaux sur sept au demarrage.

   La bonne nouvelle est que la fenetre utile, 0,95 a 1,40, suffit largement :
   elle va de 2,0 a 9,4 spores emportees, soit un facteur PRES DE CINQ. Une
   petite difference de rendement se compose.

   Pour la structure, le balayage est le PIRE CAS — uniforme, donc sans
   interstice ou passer. Une vraie microstructure laisse des couloirs, et le
   tropisme de matrice les trouve ; on peut donc viser un peu plus haut en
   moyenne. On reste sous 0,35. */

export const MATRICES = [
  {
    cle: 'mie',
    nom: 'Mie de pain',
    note: 'Réseau alvéolaire de gluten, granules d’amidon gonflés. Beaucoup de '
        + 'carbone, presque pas d’azote — et la croûte sèche vers le cœur.',
    strategie: 'On se colonise vite et on sèche vite : sporuler tôt.',
    /* Carbone abondant : on pousse vite partout. */
    nut: (x, y) => clamp(0.80 + 0.55 * fbm2(x / 700, y / 700, 71), 0.35, 1.25),
    /* Azote rare : il y a peu a prendre, meme si on pousse vite. */
    stock: 0.98,
    /* Les alveoles sont des VIDES : on court sur leurs parois. Grandes bulles
       et un reseau de travees plus fin entre elles. */
    struct: (x, y) => Math.max(
      poches(x, y, 260, 70, 130, 0.72, 101),
      poches(x, y, 90, 18, 34, 0.55, 113) * 0.75,
    ),
    /* Le dessechement est le danger propre, et il est RAPIDE : une fois
       passe l'origine il balaie le plateau en une heure, deux fois plus vite
       que partout ailleurs. C'est LA mie, et c'est ce qui impose d'y
       sporuler tot.
       Mais il doit arriver quand la colonie EXISTE. A -2200 il atteignait
       l'origine a la cinquante et unieme minute, avant qu'il y ait quoi que
       ce soit a secher : 6,5 mm de mycelium et zero pointe vivante. On
       recule donc l'origine pour qu'il arrive a la soixante-quinzieme. */
    front: { v: 0.72, depart: -3240 },
    menaces: { n: 2, r0: 260, r1: 620, v: 0.30, fixe: false },
    teinte: '#c8a96e', teinteForce: 0.22,
  },
  {
    cle: 'fromage',
    nom: 'Pâte de fromage',
    note: 'Matrice de caséine, globules gras sphériques, cristaux de tyrosine '
        + 'en aiguilles. Riche et gras — mais le sel monte depuis la croûte.',
    strategie: 'Ça nourrit longtemps : travailler loin de la croûte.',
    nut: (x, y) => clamp(0.82 + 0.45 * fbm2(x / 900, y / 900, 17), 0.35, 1.25),
    /* Azote abondant : c'est le plateau le plus riche. */
    stock: 1.38,
    /* Les globules gras sont des obstacles RONDS, et il y en a beaucoup. */
    struct: (x, y) => poches(x, y, 130, 30, 62, 0.80, 211),
    /* Le sel monte depuis la croute : c'est un front, mais LENT — il
       n'atteint l'origine qu'a la cent cinquantieme minute. */
    front: { v: 0.30, depart: -2700 },
    menaces: { n: 3, r0: 300, r1: 700, v: 0.22, fixe: false },
    teinte: '#e0d2a4', teinteForce: 0.20,
  },
  {
    cle: 'fruit',
    nom: 'Confiture de fruit',
    note: 'Parois cellulaires végétales polygonales, vacuoles, cristaux de '
        + 'sucre. Du sucre à profusion, mais l’eau est trop liée pour être bue.',
    strategie: 'Le parenchyme est un damier : on circule sur les cloisons.',
    /* L'eau liee bride la vitesse malgre le sucre : on pousse lentement. */
    nut: (x, y) => clamp(0.79 + 0.40 * fbm2(x / 600, y / 600, 53), 0.35, 1.25),
    /* Mais il y a enormement a prendre. */
    stock: 1.30,
    /* Le parenchyme : des COMPARTIMENTS fermes, et on circule sur leurs
       cloisons. C'est l'inverse d'une poche — le libre est la ligne de
       niveau, et le bloque est le coeur des cellules. */
    /* Le coeur d'une cellule n'est pas un mur : c'est plus lent a degrader
       que la lamelle moyenne, pas impossible. A 1 la structure moyenne
       montait a 0,64, tres au-dessus du seuil mesure, et le plateau mourait
       en cinq millimetres. */
    struct: (x, y) => 0.55 * (1 - cloisons(x, y, 150, 0.16, 307)),
    front: { v: 0.34, depart: -2244 },
    /* L'acidite, par taches. */
    menaces: { n: 5, r0: 250, r1: 560, v: 0.26, fixe: false },
    teinte: '#c0616b', teinteForce: 0.24,
  },
  {
    cle: 'zeste',
    nom: 'Zeste d’agrume',
    note: 'Flavédo, et de grosses vésicules à huile essentielle en poches '
        + 'claires. L’albédo est une éponge. Les vésicules sont des mines.',
    strategie: 'Un champ de mines : lire le plateau avant d’y aller.',
    /* Pauvre et disperse. */
    nut: (x, y) => clamp(0.59 + 0.62 * fbm2(x / 380, y / 380, 149), 0.35, 1.25),
    stock: 1.02,
    /* L'albedo est une EPONGE : une structure fine et partout. */
    struct: (x, y) => clamp(0.55 * poches(x, y, 62, 12, 24, 0.62, 401), 0, 1),
    front: { v: 0.40, depart: -2640 },
    /* LES VESICULES A HUILE SONT DES MINES : nombreuses, LA DES LE DEBUT, et
       elles ne grandissent pas. C'est le seul plateau qu'on peut lire en
       entier avant de jouer — et le seul ou ca sert vraiment. */
    menaces: { n: 11, r0: 160, r1: 330, v: 0, fixe: true },
    teinte: '#d8a83c', teinteForce: 0.22,
  },
  {
    cle: 'riz',
    nom: 'Riz cuit',
    note: 'Granules d’amidon gélatinisés, très homogène. Du carbone régulier, '
        + 'presque pas d’azote : un plateau ouvert où la colonie plafonne.',
    strategie: 'Confortable et sans horizon : on n’y fera pas un gros '
             + 'sporocyste, autant repartir vite.',
    /* Tres homogene : c'est sa signature. */
    nut: (x, y) => clamp(0.88 + 0.16 * fbm2(x / 1200, y / 1200, 29), 0.35, 1.25),
    /* LA FAMINE AZOTEE, au plancher de la fenetre viable. C'est le plateau
       qui rend le moins, et c'est tout son interet : on s'y etend sans
       jamais accumuler, donc on n'y fera pas un gros sporocyste. En dessous
       il ne plafonnerait pas, il tuerait — le balayage le dit. */
    stock: 1.00,
    /* Quasi aucune structure : un plateau ouvert. */
    struct: () => 0,
    front: { v: 0.38, depart: -2736 },
    menaces: { n: 1, r0: 300, r1: 600, v: 0.20, fixe: false },
    teinte: '#ded8c6', teinteForce: 0.16,
  },
  {
    cle: 'charcuterie',
    nom: 'Charcuterie sèche',
    note: 'Fibres musculaires striées et cristaux de sel. Des protéines, donc '
        + 'de l’azote — et des nitrites, par taches.',
    strategie: 'Les fibres canalisent : on pousse dans le sens du grain.',
    nut: (x, y) => clamp(0.82 + 0.42 * fbm2(x / 800, y / 800, 89), 0.35, 1.25),
    stock: 1.20,
    /* LE GRAIN. C'est le seul plateau qui a une DIRECTION, et ca se voit du
       premier coup d'oeil : la colonie y pousse en navette au lieu de faire
       un disque. */
    struct: (x, y) => 0.78 * fibres(x, y, 0.40, 105, 0.30, 503),
    front: { v: 0.36, depart: -2484 },
    /* Les nitrites, en taches. */
    menaces: { n: 6, r0: 200, r1: 430, v: 0.18, fixe: true },
    teinte: '#a8524a', teinteForce: 0.24,
  },
  {
    cle: 'compost',
    nom: 'Feuille en décomposition',
    note: 'Tissu végétal en décomposition, trachéides, et d’autres '
        + 'micro-organismes. Très riche par endroits — et ce n’est pas un '
        + 'plateau vide.',
    strategie: 'Un labyrinthe, et de la concurrence qui gagne du terrain.',
    /* Tres inegal : c'est ce qui le distingue du riz. */
    nut: (x, y) => clamp(0.44 + 1.15 * fbm2(x / 420, y / 420, 191), 0.35, 1.25),
    stock: 1.25,
    /* UN LABYRINTHE : des cloisons serrees dans les deux sens. */
    struct: (x, y) => clamp(
      cloisons(x, y, 110, 0.22, 601) * 0.55 + poches(x, y, 200, 30, 58, 0.40, 613) * 0.42,
      0, 1),
    front: { v: 0.32, depart: -2304 },
    /* LA CONCURRENCE. Beaucoup de taches, et elles POUSSENT — c'est le seul
       danger qui gagne du terrain aussi vite qu'on en gagne. */
    menaces: { n: 8, r0: 300, r1: 900, v: 0.42, fixe: false },
    teinte: '#6f7a4a', teinteForce: 0.24,
  },
];

/** La matrice par defaut : celle sur laquelle le macro a ete calibre.

    ELLE N'A NI STRUCTURE NI DANGER PROPRE, et c'est la raison d'etre de son
    existence : `thalle.html`, `monde.html` et `cycle.html` la prennent, et le
    verdict 13 fait tourner le macro a matrice = 1. Une matrice de jeu ne doit
    pas pouvoir changer ce qui a ete mesure ailleurs. */
export const MATRICE_NEUTRE = {
  cle: 'neutre',
  nom: 'Gélose',
  note: 'Deux octaves de bruit. C’est une hypothèse de travail, pas une mesure.',
  strategie: '',
  nut: (x, y) => clamp(0.35 + 1.15 * (0.68 * fbm2(x / 900, y / 900, 71)
                                    + 0.32 * fbm2(x / 250, y / 250, 113)), 0.35, 1.25),
  stock: 1,
  struct: () => 0,
  /* LES CHIFFRES DE LA GELOSE SONT CEUX QUE LES VERDICTS 19 A 21 ONT
     MESURES, et ils sont la reference des six autres plateaux.

     0,42 um/s traverse quatre millimetres en deux heures et demie de
     colonie : le front est LENT et VISIBLE, c'est le stress qu'on anticipe.
     Il part d'assez loin pour qu'on ait le temps de s'installer.

     Quatre taches de 0,4 a 1,1 mm, et le nombre n'a PAS ete choisi sur le
     verdict 20 — il l'est sur la lisibilite du plateau et sur le fait de ne
     pas ecraser la partie. Sur vingt graines : a quatre taches la colonie
     livree a elle-meme emporte 1,10 spore, c'est-a-dire ce qu'elle emportait
     sans menaces du tout (1,15) ; a sept elle tombe a 0,65, a dix a 0,70, et
     avec des taches jusqu'a 1,5 mm a 0,15. Une matrice hostile doit se
     contourner, pas condamner.

     0,35 um/s : deux fois plus lent qu'une pointe, donc on peut lui
     echapper, mais une tache double son rayon en six minutes. Et elle
     S'ARRETE : sans rayon final elle grossissait pendant trois heures, soit
     3,8 mm, cinq disques couvrent le plateau et toutes les politiques
     tombaient de 2,55 a 1,05 d'un coup. Une croute de sel est une tache, pas
     une fatalite. */
  front: { v: 0.42, depart: -2600 },
  menaces: { n: 4, r0: 400, r1: 1100, v: 0.35, fixe: false },
  /* PAS DE TEINTE : c'est de la gelose, et surtout `thalle.html`,
     `monde.html` et `cycle.html` la prennent. Elles ne doivent rien voir
     changer. */
  teinte: '#9a9a86', teinteForce: 0,
};

export const parCle = (c) => MATRICES.find((m) => m.cle === c) || MATRICE_NEUTRE;
