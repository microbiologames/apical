/* ---------------------------------------------------------------------------
   Les substrats, et le seul endroit ou vivent leurs chiffres.

   REGLE DE CONCEPTION : un substrat n'est pas un decor, c'est un JEU DE
   COEFFICIENTS POSES SUR L'EQUATION DE CROISSANCE. Chaque contrainte de
   matrice attaque UN terme, et un seul :

     aw basse        -> le terme d'ABSORPTION D'EAU        -> le turgor tombe
     temperature     -> l'EXTENSIBILITE de paroi (Phi)     -> tout ralentit
     echinocandine   -> le FLUX VESICULAIRE (Jmax)         -> la paroi s'amincit
     azole           -> l'ABSORPTION (membrane percee)     -> le turgor tombe
     polyene         -> une FUITE directe de turgor        -> chute brutale
     acide faible    -> la MAINTENANCE (pompage de protons) -> le sucre brule
     poche de sel    -> l'ABSORPTION D'EAU, localement et brutalement

   C'est cette table qui rend les dangers lisibles sans tutoriel : le joueur
   apprend six pannes distinctes, chacune avec sa jauge qui bouge et son gene
   qui la corrige. Un septieme danger qui taperait sur les memes termes
   n'apprendrait rien de neuf, et ne doit pas etre ajoute.

   LES FRONTS MYCELIENS CONCURRENTS ONT ETE RETIRES (decision de l'auteur). Ils
   se lisaient comme des mobs a trajectoire rectiligne, ce qu'ils n'etaient pas
   censes etre, et ils encombraient un champ dont toute la difficulte doit venir
   du CHOIX DE TRAJECTOIRE dans un milieu heterogene. Le milieu ne contient donc
   plus que des elements de milieu : ressources, obstacles, antifongiques
   diffusibles et poches de sel. Ne pas les remettre sans nouvelle instruction.

   ECHELLE, posee une fois pour tout le jeu :
     1 pixel        = 1 micrometre
     1 seconde jeu  = 1 minute de biologie
   Une hyphe de Neurospora s'allonge a 20 um/min, soit 20 px/s ici : un champ
   de 256 px se traverse en 13 s. C'est la compression qui rend la croissance
   apicale JOUABLE sans la deformer — les rapports entre vitesses restent ceux
   de la paillasse.
--------------------------------------------------------------------------- */

/** Points cardinaux du champignon joueur : un mesophile de denrees. */
export const CARDINALES = { min: 2, opt: 26, max: 42 };

/**
 * aw minimale de croissance, sans gene d'osmotolerance.
 * 0.88 est la limite d'une moisissure banale de denrees ; les xerophiles
 * descendent a 0.61 (Xeromyces bisporus), et c'est precisement ce que les
 * genes d'osmotolerance vont acheter.
 */
export const AW_MIN_BASE = 0.88;

/* LONGUEURS : calees au banc, pas a l'estime. L'avancee NETTE mediane d'une
   politique qui suit le sucre est de 9 a 10 um/s, tres en dessous de la vitesse
   d'allongement (16 a 20 um/s) parce que chercher a manger fait zigzaguer. Un
   horizon de 600 px se franchit donc en une minute environ, et les quatre font
   une boucle d'a peu pres huit minutes. Les premieres longueurs, posees a
   1400 px a l'estime, faisaient qu'aucune manche sur 96 ne voyait le second
   substrat : les trois quarts du contenu n'existaient pas. */
/* `court` est le nom affiche par le HUD. La fonte fait 3 px de large et la
   colonne en tient douze caracteres : « Pellicule du fruit » s'y affichait
   « PELLICULE DU », ce qui se lit comme un bug d'affichage. Un nom long et un
   nom court valent mieux qu'un nom tronque. */
export const SUBSTRATS = [
  {
    id: 'pellicule',
    nom: 'Pellicule du fruit', court: 'PELLICULE',
    /* Une cuticule est riche en eau mais pauvre en sucre accessible : le
       sucre est DEDANS, la cuticule est une barriere ciree. D'ou le premier
       arbitrage du jeu : traverser vite vers la chair, ou brouter la surface. */
    aw: 0.98, awBruit: 0.01,
    temp: 22,
    sucre: 0.42, sucreEchelle: 96,
    /* Les ecailles de cire sont des obstacles bas et nombreux : elles genent
       la barre sans jamais fermer un passage. Role : apprendre a barrer. */
    obstacle: { type: 'cire', densite: 0.35, taille: [3, 7] },
    sel: 0,
    antifongique: null,
    longueur: 600,
  },
  {
    id: 'mesocarpe',
    nom: 'Mesocarpe', court: 'MESOCARPE',
    /* La chair : le substrat le plus genereux du jeu, et le plus encombre.
       Les parois cellulaires vegetales forment un reseau polygonal ou l'on
       circule dans les interstices. C'est la que la ramification paie. */
    aw: 0.99, awBruit: 0.005,
    temp: 20,
    sucre: 0.72, sucreEchelle: 120,
    obstacle: { type: 'paroiveg', densite: 0.62, taille: [10, 26] },
    sel: 0.12,
    /* pH 3,4 : l'acide organique du fruit est deja un acide faible. Faible
       dose, juste de quoi faire sentir le terme de maintenance. */
    antifongique: { type: 'sorbate', intensite: 0.18, echelle: 200 },
    longueur: 1100,
  },
  {
    id: 'confiture',
    nom: 'Confiture', court: 'CONFITURE',
    /* 68 Brix : le sucre est ENORME et l'eau introuvable. Le substrat
       retourne les deux ressources l'une contre l'autre, et c'est le seul
       du jeu a le faire. Sans osmotolerance on n'y entre pas. */
    aw: 0.76, awBruit: 0.04,
    temp: 18,
    sucre: 0.95, sucreEchelle: 150,
    obstacle: { type: 'cristal', densite: 0.44, taille: [5, 14] },
    sel: 0.45,
    /* Sorbate de potassium, la conservation reelle d'une confiture peu sucree. */
    antifongique: { type: 'sorbate', intensite: 0.55, echelle: 160 },
    longueur: 1300,
  },
  {
    id: 'grain',
    nom: 'Grain stocke', court: 'GRAIN',
    /* Ble a 14 % d'humidite : aw 0.70, la zone des Aspergillus et Eurotium.
       Le sucre est en AMIDON, donc inaccessible sans amylase — le substrat
       qui transforme un gene d'hydrolase en cle de porte. Et un silo
       s'auto-echauffe : la temperature y monte vers le maximum cardinal. */
    aw: 0.70, awBruit: 0.03,
    temp: 36,
    sucre: 0.88, sucreEchelle: 130, amidon: true,
    obstacle: { type: 'amidon', densite: 0.58, taille: [8, 20] },
    sel: 0.30,
    /* Traitement de conservation des grains : un imidazole de synthese. */
    antifongique: { type: 'azole', intensite: 0.5, echelle: 180 },
    longueur: 1500,
  },
];

/**
 * Coefficients d'une boucle.
 *
 * Le jeu ne s'arrete pas au quatrieme substrat : il recommence la serie en la
 * durcissant, comme Risk of Rain. Deux durcissements SEULEMENT, parce que ce
 * sont les deux qui menacent des termes differents : l'eau devient rare et
 * les concurrents deviennent nombreux. Durcir aussi le sucre rendrait la
 * paroi infabricable et toutes les morts se ressembleraient.
 */
export function coefBoucle(n) {
  return {
    aw: -0.035 * n,            // l'eau se retire : 4 boucles = -0,14 d'aw
    antifongique: 1 + 0.30 * n,
    sel: 1 + 0.35 * n,
  };
}

/**
 * UNITE DE CROISSANCE HYPHALE, en um de tube par apex.
 *
 * C'est le chiffre qui fait qu'un thalle EST ramifie. Trinci a montre que la
 * croissance totale d'un mycelium est exponentielle non parce qu'un apex
 * accelere — un apex isole s'allonge a vitesse constante — mais parce que le
 * NOMBRE D'APEX croit : le rapport longueur totale / nombre de tips reste a peu
 * pres constant, et c'est lui qu'on appelle l'unite de croissance hyphale.
 * Elle vaut typiquement 50 a 200 um. A 110 um, un thalle atteint son quatrieme
 * apex vers 330 um de tube, soit une trentaine de secondes de jeu : assez tot
 * pour que le joueur voie son thalle se ramifier, assez tard pour qu'il ait
 * compris le pilotage d'un seul apex avant.
 */
export const UCH = 110;

/** Substrat et boucle pour une distance parcourue donnee, en px. */
export function substratPour(distance) {
  let d = distance, boucle = 0, i = 0;
  /* Garde-fou : une manche de plusieurs heures ne doit pas boucler ici. */
  for (let garde = 0; garde < 512; garde++) {
    const s = SUBSTRATS[i];
    if (d < s.longueur) return { substrat: s, boucle, reste: s.longueur - d, index: i };
    d -= s.longueur;
    i++;
    if (i >= SUBSTRATS.length) { i = 0; boucle++; }
  }
  return { substrat: SUBSTRATS[0], boucle, reste: SUBSTRATS[0].longueur, index: 0 };
}

/**
 * Facteur thermique : cloche asymetrique sur les points cardinaux.
 *
 * Asymetrique parce que la biologie l'est : un champignon perd 20 % de
 * vitesse en descendant de 6 degres sous l'optimum, et il LYSE en montant de
 * 6 degres au-dessus. On modelise donc la branche chaude avec un exposant
 * plus raide (2,4 contre 1,5) : c'est ce qui rend le silo chaud dangereux
 * alors qu'une chambre froide n'est que lente.
 */
export function facteurTemp(t, card = CARDINALES) {
  if (t <= card.min || t >= card.max) return 0;
  if (t <= card.opt) {
    const u = (t - card.min) / (card.opt - card.min);
    return Math.pow(u, 1.5);
  }
  const u = (card.max - t) / (card.max - card.opt);
  return Math.pow(u, 2.4);
}
