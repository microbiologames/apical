/* ---------------------------------------------------------------------------
   Le son en donnees : ambiances, voix, machines, et le code qui les emballe.

   Meme partage que la palette. Le moteur ne connait aucune ambiance : il pose
   toujours les memes six voix — drone, nappe, cloche, basse, break, texture —
   et c'est cette table qui decide de ce qu'on entend. Ajouter une ambiance,
   c'est ajouter une entree ici, rien d'autre.

   UN CHAMP N'EST JAMAIS UN FLOTTANT LIBRE, c'est un CRAN. Un curseur qui rend
   0.37142 ne se transporte pas dans un code qu'on recopie a la main, et deux
   reglages « pareils a l'oreille » finissent par ne plus l'etre du tout. Un
   champ declare donc soit une liste de choix, soit une table de valeurs
   echelonnees A L'OREILLE (une coupure de filtre ne se regle pas lineairement
   en hertz : de 400 a 900 Hz on entend un monde, de 12 000 a 12 500 rien),
   soit un intervalle regulier. L'encodeur en deduit tout seul le nombre de
   caracteres qu'il lui faut.

   ASCII pur dans les commentaires, accents dans les textes d'interface :
   c'est la convention du depot, et ces chaines-la sont lues a l'ecran.
--------------------------------------------------------------------------- */

export const NOTES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/* Les modes, en demi-tons. Le liquid drum and bass vit sur le mineur naturel
   et le dorien — la sixte majeure du dorien est exactement ce qui empeche
   une nappe mineure de sonner funebre. Le phrygien est la pour la tension
   (substrat qui s'epuise), le lydien pour la dispersion (rien ne retombe). */
export const GAMMES = {
  eolien: [0, 2, 3, 5, 7, 8, 10],
  dorien: [0, 2, 3, 5, 7, 9, 10],
  phrygien: [0, 1, 3, 5, 7, 8, 10],
  lydien: [0, 2, 4, 6, 7, 9, 11],
  mixolydien: [0, 2, 4, 5, 7, 9, 10],
  pentamineur: [0, 3, 5, 7, 10],
  harmonique: [0, 2, 3, 5, 7, 8, 11],
};

/* Tables echelonnees a l'oreille, partagees par plusieurs champs. */
const T_COUPURE = [110, 160, 230, 320, 440, 600, 820, 1100, 1500, 2000, 2700,
  3600, 4800, 6400, 8500, 11000, 14000, 18000];
const T_ATTAQUE = [0.004, 0.02, 0.06, 0.15, 0.3, 0.6, 1.1, 1.8, 2.8, 4.2, 6.5, 10];
const T_DECLIN = [0.05, 0.1, 0.18, 0.3, 0.45, 0.7, 1.1, 1.7, 2.5, 3.8, 5.5, 8];
const T_TAILLE = [0.6, 1.1, 1.8, 2.6, 3.6, 4.8, 6.2, 8, 10, 12.5, 15];
const T_DENSITE = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];

export const GROUPES = ['Temps et harmonie', 'Espace', 'Couleur'];

/**
 * Les champs d'ambiance : ce qui vaut pour les six voix a la fois.
 * `aide` dit POURQUOI le reglage existe, jamais ce que le curseur fait.
 */
export const CHAMPS = [
  { cle: 'bpm', nom: 'Tempo', groupe: 'Temps et harmonie', unite: 'BPM', min: 80, max: 180, pas: 2,
    aide: 'Le liquid drum and bass vit entre 170 et 176. En dessous de 120 le break passe en demi-temps tout seul : c\'est la meme grille, deux fois plus lente.' },
  { cle: 'tonique', nom: 'Tonique', groupe: 'Temps et harmonie', choix: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    legendes: Object.fromEntries(NOTES.map((n, i) => [i, n])),
    aide: 'Plus bas que Fa, la fondamentale du drone descend sous 45 Hz et ne s\'entend plus que sur un casque.' },
  { cle: 'gamme', nom: 'Mode', groupe: 'Temps et harmonie', choix: Object.keys(GAMMES),
    aide: 'Le dorien garde la sixte majeure : c\'est ce qui empêche une nappe mineure de virer au funèbre.' },
  { cle: 'accords', nom: 'Richesse des accords', groupe: 'Temps et harmonie', min: 0, max: 3, pas: 1,
    legendes: { 0: 'triades', 1: 'septièmes', 2: 'neuvièmes', 3: 'onzièmes' },
    aide: 'La neuvième est la signature du genre. En triades la nappe redevient une nappe de film.' },
  { cle: 'melodie', nom: 'Densité mélodique', groupe: 'Temps et harmonie', min: 0, max: 1, pas: 0.05,
    aide: 'Combien la cloche parle. À zéro elle se tait et il ne reste que la matière.' },

  { cle: 'reverbe', nom: 'Taille de la salle', groupe: 'Espace', unite: 's', table: T_TAILLE,
    aide: 'La durée de la queue. Au-delà de 8 s on n\'entend plus une salle mais un lieu, et les attaques disparaissent dedans.' },
  { cle: 'reverbeCouleur', nom: 'Couleur de la queue', groupe: 'Espace', min: 0, max: 1, pas: 0.05,
    aide: 'À 0 la queue est sourde comme de l\'eau, à 1 elle garde ses aigus et devient une cathédrale.' },
  { cle: 'preDelai', nom: 'Pré-délai', groupe: 'Espace', unite: 'ms', min: 0, max: 120, pas: 5,
    aide: 'Le temps avant la première réflexion. C\'est lui qui dit la distance du mur, et lui seul qui laisse l\'attaque passer devant la queue.' },
  { cle: 'echo', nom: 'Écho', groupe: 'Espace', min: 0, max: 1, pas: 0.05,
    aide: 'Le ping-pong. Sur la cloche c\'est la moitié du genre ; sur la nappe ça bouche tout.' },
  { cle: 'echoTemps', nom: 'Division de l\'écho', groupe: 'Espace', choix: ['3/16', '1/8', '1/4', '3/8', '1/2'],
    aide: 'Le 3/16 tombe à côté de la grille et fait avancer le morceau. Le 1/4 le fige.' },
  { cle: 'echoRetour', nom: 'Réinjection', groupe: 'Espace', min: 0, max: 0.85, pas: 0.05,
    aide: 'Au-delà de 0,75 la boucle s\'auto-entretient et finit par saturer la réverbe.' },
  { cle: 'largeur', nom: 'Largeur stéréo', groupe: 'Espace', min: 0, max: 1, pas: 0.05,
    aide: 'Deux retards courts et modulés. C\'est ce qui met la nappe autour de la tête plutôt que devant.' },

  { cle: 'couleur', nom: 'Coupure générale', groupe: 'Couleur', unite: 'Hz', table: T_COUPURE,
    aide: 'Le passe-bas de sortie. C\'est la vitre du microscope : tout passe derrière.' },
  { cle: 'grain', nom: 'Souffle', groupe: 'Couleur', min: 0, max: 1, pas: 0.05,
    aide: 'Le bruit de fond de l\'optique. Sans lui le silence est numérique, et on entend que c\'est un synthétiseur.' },
  { cle: 'chaleur', nom: 'Saturation', groupe: 'Couleur', min: 0, max: 1, pas: 0.05,
    aide: 'Une courbe douce sur la somme. Elle colle les voix ensemble ; poussée, elle mange la réverbe.' },
  { cle: 'derive', nom: 'Dérive', groupe: 'Couleur', min: 0, max: 1, pas: 0.05,
    aide: 'La lenteur du mouvement des filtres. Rien ne doit jamais être exactement à la même place qu\'il y a une minute.' },
];

/* ---------------------------------------------------------------------------
   Les six voix.

   Ce ne sont pas six instruments choisis par gout : ce sont les six roles
   qu'un morceau de liquid drum and bass tient en meme temps, et chacun a une
   fonction que les autres ne peuvent pas remplir. On peut en couper cinq ;
   on ne peut pas en ajouter une septieme sans decider ce qu'elle raconte.
--------------------------------------------------------------------------- */

export const VOIX = [
  { cle: 'drone', nom: 'Drone', genre: 'nappe',
    aide: 'La fondamentale tenue, jamais interrompue. C\'est elle qui fait la profondeur : tout le reste est posé dessus.' },
  { cle: 'nappe', nom: 'Nappe', genre: 'nappe',
    aide: 'L\'accord. Elle porte l\'harmonie et respire avec la croissance.' },
  { cle: 'cloche', nom: 'Cloche', genre: 'pince',
    aide: 'Le liquide : Rhodes, kalimba, gouttes. Une note par-ci, très réverbérée, c\'est elle qu\'on retient.' },
  { cle: 'basse', nom: 'Basse', genre: 'basse',
    aide: 'Le corps. En micro on n\'en a pas besoin ; à l\'échelle de la colonie, sans elle il n\'y a pas de sol.' },
  { cle: 'break', nom: 'Break', genre: 'batterie',
    aide: 'La batterie. Elle n\'existe qu\'en haut : à l\'échelle de la vésicule, le temps n\'a pas de mesure.' },
  { cle: 'texture', nom: 'Texture', genre: 'texture',
    aide: 'Le bruit vivant : gouttes, craquements, grains. C\'est le son du microscope, pas celui de la musique.' },
];

/* Ce que veulent dire les deux boutons de caractere, modele par modele. Sans
   cette table ce sont deux curseurs anonymes, et on regle au hasard. */
export const SENS = {
  sines: ['Présence des harmoniques hautes', 'Battement entre les partiels'],
  dents: ['Vers l\'onde carrée', 'Creux du filtre à l\'attaque'],
  fm: ['Rapport du modulateur', 'Indice — la brillance'],
  formant: ['Voyelle, de /ou/ à /a/', 'Étroitesse des formants'],
  metal: ['Inharmonicité — le bol', 'Indice — la frappe'],
  bruit: ['Finesse de la résonance', 'Part de bruit non accordé'],
  additif: ['Position du partiel inharmonique', 'Décroissance des partiels hauts'],
  corde: ['Amortissement de la corde', 'Matière de l\'excitation'],
  goutte: ['Profondeur de la chute', 'Longueur de la goutte'],
  sub: ['Deuxième harmonique', 'Clic d\'attaque'],
  reese: ['Désaccord des deux dents', 'Vitesse du battement'],
  pincee: ['Enveloppe du filtre', 'Résonance'],
  carre: ['Épaisseur de l\'impulsion', 'Résonance'],
};

const CH_NIVEAU = { cle: 'niveau', nom: 'Niveau', min: 0, max: 1, pas: 0.05,
  aide: 'Le niveau de base. Les couches le multiplient encore selon l\'échelle et la croissance.' };
const CH_SUIVI = { cle: 'suivi', nom: 'Suivi du contexte', min: 0, max: 1, pas: 0.1,
  aide: 'À 0 la voix reste au même niveau quoi qu\'il arrive. À 1 elle obéit entièrement aux quatre grandeurs.' };
const CH_REV = { cle: 'reverbe', nom: 'Envoi réverbe', min: 0, max: 1, pas: 0.05,
  aide: 'Ce que cette voix envoie dans la salle. C\'est ici que se décide la profondeur, pas dans la taille de la salle.' };
const CH_ECHO = { cle: 'echo', nom: 'Envoi écho', min: 0, max: 1, pas: 0.05, aide: 'Ce que cette voix envoie dans le ping-pong.' };
const CH_OCTAVE = { cle: 'octave', nom: 'Octave', min: -2, max: 2, pas: 1, aide: 'Transposition en octaves.' };
const CH_COUPURE = { cle: 'coupure', nom: 'Coupure', unite: 'Hz', table: T_COUPURE, aide: 'Le passe-bas de la voix.' };

export const CHAMPS_PAR_GENRE = {
  nappe: [
    { cle: 'modele', nom: 'Moteur', choix: ['sines', 'dents', 'fm', 'formant', 'metal', 'bruit'],
      aide: 'Six façons de tenir une note. Elles ne se ressemblent pas : changer de moteur change plus que tous les autres curseurs réunis.' },
    CH_NIVEAU,
    { cle: 'timbre1', nom: 'Caractère 1', min: 0, max: 1, pas: 0.05, aide: '' },
    { cle: 'timbre2', nom: 'Caractère 2', min: 0, max: 1, pas: 0.05, aide: '' },
    CH_COUPURE,
    { cle: 'resonance', nom: 'Résonance', min: 0, max: 1, pas: 0.05,
      aide: 'Poussée, elle fait chanter le filtre — et fait siffler la réverbe sur la note de coupure.' },
    { cle: 'attaque', nom: 'Attaque', unite: 's', table: T_ATTAQUE,
      aide: 'Au-delà de 2 s l\'accord arrive après la mesure suivante : la nappe ne joue plus l\'harmonie, elle la suit.' },
    { cle: 'relache', nom: 'Relâche', unite: 's', table: T_DECLIN, aide: 'Le recouvrement entre deux accords. Court, ça respire ; long, ça empile.' },
    { cle: 'desaccord', nom: 'Désaccord', unite: 'cents', min: 0, max: 30, pas: 1,
      aide: 'Trois voix désaccordées. C\'est le désaccord, pas le nombre de voix, qui fait l\'impression de liquide.' },
    { cle: 'mouvement', nom: 'Mouvement du filtre', min: 0, max: 1, pas: 0.05, aide: 'Une oscillation très lente sur la coupure. Sans elle la nappe est une photo.' },
    CH_OCTAVE, CH_REV, CH_ECHO, CH_SUIVI,
  ],

  pince: [
    { cle: 'modele', nom: 'Moteur', choix: ['fm', 'additif', 'corde', 'goutte'],
      aide: 'La FM fait les Rhodes et les cloches, l\'additif les métaux, la corde les harpes, la goutte ce qui tombe.' },
    CH_NIVEAU,
    { cle: 'timbre1', nom: 'Caractère 1', min: 0, max: 1, pas: 0.05, aide: '' },
    { cle: 'timbre2', nom: 'Caractère 2', min: 0, max: 1, pas: 0.05, aide: '' },
    CH_COUPURE,
    { cle: 'declin', nom: 'Déclin', unite: 's', table: T_DECLIN, aide: 'Une cloche qui dure plus que la mesure se superpose à elle-même : c\'est voulu, jusqu\'à un point.' },
    { cle: 'densite', nom: 'Notes par mesure', table: T_DENSITE, aide: 'Au-delà de 4, ce n\'est plus une ponctuation, c\'est un arpège.' },
    { cle: 'contretemps', nom: 'Contretemps', min: 0, max: 1, pas: 0.1,
      aide: 'La part des notes qui tombent entre les temps. À 0 la cloche est sur la grille et le morceau devient carré.' },
    { cle: 'dispersion', nom: 'Dispersion stéréo', min: 0, max: 1, pas: 0.1, aide: 'Chaque note prise à une place différente. C\'est ce qui empêche la répétition de s\'entendre.' },
    CH_OCTAVE, CH_REV, CH_ECHO, CH_SUIVI,
  ],

  basse: [
    { cle: 'modele', nom: 'Moteur', choix: ['sub', 'reese', 'pincee', 'carre'],
      aide: 'Le sub ne s\'entend pas sur un petit haut-parleur, il se sent. La reese s\'entend partout.' },
    CH_NIVEAU,
    { cle: 'timbre1', nom: 'Caractère 1', min: 0, max: 1, pas: 0.05, aide: '' },
    { cle: 'timbre2', nom: 'Caractère 2', min: 0, max: 1, pas: 0.05, aide: '' },
    CH_COUPURE,
    { cle: 'declin', nom: 'Déclin', unite: 's', table: T_DECLIN, aide: 'Une basse qui tient jusqu\'à la note suivante bouche le bas du spectre.' },
    { cle: 'motif', nom: 'Motif', choix: ['tenue', 'pulse', 'contretemps', 'double', 'suit le break', 'rien'],
      aide: '« Suit le break » place la basse sous la grosse caisse : c\'est le placement du genre.' },
    CH_OCTAVE, CH_REV, CH_SUIVI,
  ],

  batterie: [
    { cle: 'modele', nom: 'Break', choix: ['amen', 'deux-temps', 'rouleau', 'brosses', 'peaux', 'clairsemé', 'shuffle', 'demi-temps'],
      aide: 'Huit grilles. Le « rouleau » est le break liquide classique, « brosses » ne garde que les fantômes.' },
    CH_NIVEAU,
    { cle: 'grosse', nom: 'Grosse caisse', min: 0, max: 1, pas: 0.05, aide: 'Elle déclenche aussi le ducking : c\'est elle qui fait respirer la nappe.' },
    { cle: 'caisse', nom: 'Caisse claire', min: 0, max: 1, pas: 0.05, aide: '' },
    { cle: 'charley', nom: 'Charleston', min: 0, max: 1, pas: 0.05, aide: '' },
    { cle: 'fantome', nom: 'Notes fantômes', min: 0, max: 1, pas: 0.05,
      aide: 'Les coups faibles entre les temps. Retirés, le break devient une boîte à rythmes.' },
    { cle: 'corps', nom: 'Corps de la caisse', min: 0, max: 1, pas: 0.05, aide: 'De la peau au bruit. Très haut, c\'est une caisse de studio ; très bas, un carton.' },
    CH_COUPURE,
    { cle: 'swing', nom: 'Swing', min: 0, max: 0.4, pas: 0.02, aide: 'Le retard des doubles croches paires. Au-delà de 0,25 ce n\'est plus du drum and bass.' },
    { cle: 'ducking', nom: 'Ducking', min: 0, max: 1, pas: 0.05, aide: 'Ce que la grosse caisse creuse dans les voix tenues. Sans lui, le bas du spectre est plein en permanence.' },
    CH_REV, CH_ECHO, CH_SUIVI,
  ],

  texture: [
    { cle: 'modele', nom: 'Matière', choix: ['gouttes', 'craquements', 'souffle', 'grains', 'bulles', 'poussière', 'cristaux'],
      aide: 'Ce qu\'on entend quand on écoute une préparation plutôt qu\'un morceau.' },
    CH_NIVEAU,
    { cle: 'densite', nom: 'Événements par mesure', table: T_DENSITE, aide: '' },
    { cle: 'hauteur', nom: 'Hauteur', min: 0, max: 1, pas: 0.05, aide: 'Les textures graves se confondent avec le drone ; les aiguës vivent au-dessus de tout.' },
    { cle: 'etendue', nom: 'Étendue', min: 0, max: 1, pas: 0.05, aide: 'L\'écart de hauteur d\'un événement à l\'autre. À 0 c\'est un métronome.' },
    { cle: 'dispersion', nom: 'Dispersion stéréo', min: 0, max: 1, pas: 0.1, aide: '' },
    CH_COUPURE, CH_REV, CH_ECHO, CH_SUIVI,
  ],
};

/* ---------------------------------------------------------------------------
   Les machines : des timbres tout faits, a choisir AVANT de regler.

   Elles ne touchent jamais au niveau ni aux envois : changer d'instrument ne
   doit pas faire sauter l'equilibre du mix. C'est le point de depart qu'on
   demandait — on en essaie dix en dix secondes, on en garde un, et seulement
   ensuite on ouvre les curseurs.
--------------------------------------------------------------------------- */

export const MACHINES = {
  nappe: [
    { nom: 'Verre filé', aide: 'Additif, partiels hauts tenus. Le son de référence d\'une nappe qui ne pèse rien.',
      p: { modele: 'sines', timbre1: 0.55, timbre2: 0.25, coupure: 6400, resonance: 0.1, attaque: 2.8, relache: 3.8, desaccord: 9, mouvement: 0.4 } },
    { nom: 'Cordes gelées', aide: 'Dents désaccordées sous un filtre bas. Large, sombre, immobile.',
      p: { modele: 'dents', timbre1: 0.25, timbre2: 0.35, coupure: 1100, resonance: 0.2, attaque: 4.2, relache: 5.5, desaccord: 18, mouvement: 0.55 } },
    { nom: 'Chœur lointain', aide: 'Formants sur /ou/. Ça se lit comme des voix sans qu\'aucun mot ne se forme.',
      p: { modele: 'formant', timbre1: 0.15, timbre2: 0.6, coupure: 3600, resonance: 0.15, attaque: 1.8, relache: 3.8, desaccord: 12, mouvement: 0.3 } },
    { nom: 'Rhodes tenu', aide: 'FM au rapport 1, indice faible. Le piano électrique quand on ne relâche jamais la touche.',
      p: { modele: 'fm', timbre1: 0.2, timbre2: 0.3, coupure: 4800, resonance: 0.05, attaque: 0.6, relache: 2.5, desaccord: 6, mouvement: 0.25 } },
    { nom: 'Souffle de gélose', aide: 'Bruit résonant à peine accordé. À la limite entre une note et une matière.',
      p: { modele: 'bruit', timbre1: 0.6, timbre2: 0.45, coupure: 2700, resonance: 0.3, attaque: 2.8, relache: 3.8, desaccord: 14, mouvement: 0.5 } },
    { nom: 'Bourdon de verre', aide: 'FM inharmonique douce. Un verre frotté au doigt, tenu indéfiniment.',
      p: { modele: 'metal', timbre1: 0.2, timbre2: 0.2, coupure: 8500, resonance: 0.1, attaque: 4.2, relache: 5.5, desaccord: 5, mouvement: 0.35 } },
    { nom: 'Cuivre éteint', aide: 'Dents vers le carré, coupure au ras. Un cuivre dont on n\'entend que le corps.',
      p: { modele: 'dents', timbre1: 0.75, timbre2: 0.5, coupure: 600, resonance: 0.35, attaque: 1.1, relache: 1.7, desaccord: 8, mouvement: 0.45 } },
    { nom: 'Bol de métal', aide: 'Inharmonicité forte : les partiels ne tombent sur aucune note et le bol bat tout seul.',
      p: { modele: 'metal', timbre1: 0.7, timbre2: 0.5, coupure: 6400, resonance: 0.15, attaque: 1.8, relache: 5.5, desaccord: 4, mouvement: 0.2 } },
    { nom: 'Vapeur', aide: 'Résonances fines sur du bruit. Il n\'y a pas d\'instrument là-dedans, juste de l\'air qui a une hauteur.',
      p: { modele: 'bruit', timbre1: 0.85, timbre2: 0.2, coupure: 8500, resonance: 0.25, attaque: 2.8, relache: 2.5, desaccord: 20, mouvement: 0.7 } },
    { nom: 'Orgue noyé', aide: 'Partiels d\'orgue, tout l\'envoi dans la salle. C\'est la réverbe qu\'on entend, pas l\'orgue.',
      p: { modele: 'sines', timbre1: 0.8, timbre2: 0.1, coupure: 3600, resonance: 0.05, attaque: 0.6, relache: 3.8, desaccord: 3, mouvement: 0.15 } },
  ],

  pince: [
    { nom: 'Rhodes', aide: 'Le timbre du genre. FM rapport 1, une pointe d\'indice à l\'attaque.',
      p: { modele: 'fm', timbre1: 0.2, timbre2: 0.45, coupure: 4800, declin: 1.1, contretemps: 0.6, dispersion: 0.4 } },
    { nom: 'Tine', aide: 'Rapport élevé : la lame métallique du Rhodes, sans son corps.',
      p: { modele: 'fm', timbre1: 0.85, timbre2: 0.3, coupure: 8500, declin: 0.45, contretemps: 0.5, dispersion: 0.5 } },
    { nom: 'Kalimba', aide: 'Un partiel inharmonique haut et court. Sec, sans sustain, très africain de placement.',
      p: { modele: 'additif', timbre1: 0.6, timbre2: 0.7, coupure: 6400, declin: 0.7, contretemps: 0.7, dispersion: 0.6 } },
    { nom: 'Glockenspiel', aide: 'Inharmonique et long. Une cloche de laboratoire.',
      p: { modele: 'fm', timbre1: 0.65, timbre2: 0.2, coupure: 11000, declin: 1.7, contretemps: 0.4, dispersion: 0.5 } },
    { nom: 'Marimba', aide: 'Partiel à la quadruple octave, déclin court. Du bois.',
      p: { modele: 'additif', timbre1: 0.45, timbre2: 0.85, coupure: 3600, declin: 0.3, contretemps: 0.6, dispersion: 0.4 } },
    { nom: 'Harpe', aide: 'Corde pincée par réinjection. L\'attaque garde le bruit du doigt.',
      p: { modele: 'corde', timbre1: 0.3, timbre2: 0.4, coupure: 6400, declin: 1.7, contretemps: 0.5, dispersion: 0.6 } },
    { nom: 'Cristal', aide: 'Additif long sous un filtre haut. Ça n\'a pas d\'attaque : ça apparaît.',
      p: { modele: 'additif', timbre1: 0.75, timbre2: 0.25, coupure: 11000, declin: 2.5, contretemps: 0.3, dispersion: 0.7 } },
    { nom: 'Pluck nylon', aide: 'Corde amortie, excitation douce. Le plus discret des neuf.',
      p: { modele: 'corde', timbre1: 0.7, timbre2: 0.15, coupure: 2700, declin: 0.7, contretemps: 0.6, dispersion: 0.3 } },
    { nom: 'Goutte', aide: 'Une sinusoïde qui tombe. Ce n\'est pas une note, c\'est un événement — et c\'est le son du projet.',
      p: { modele: 'goutte', timbre1: 0.55, timbre2: 0.35, coupure: 4800, declin: 0.45, contretemps: 0.8, dispersion: 0.8 } },
    { nom: 'Célesta', aide: 'FM rapport 3, indice bas, déclin long. Un jouet, mais accordé juste.',
      p: { modele: 'fm', timbre1: 0.45, timbre2: 0.15, coupure: 8500, declin: 1.7, contretemps: 0.4, dispersion: 0.4 } },
  ],

  basse: [
    { nom: 'Sub pur', aide: 'Presque une sinusoïde. Sur une enceinte d\'ordinateur on ne l\'entend pas — c\'est normal, on la sent.',
      p: { modele: 'sub', timbre1: 0.1, timbre2: 0.15, coupure: 320, declin: 0.7, motif: 'suit le break' } },
    { nom: 'Reese', aide: 'Deux dents désaccordées qui battent. Le son fondateur du genre, de 1992 à aujourd\'hui.',
      p: { modele: 'reese', timbre1: 0.5, timbre2: 0.3, coupure: 600, declin: 1.1, motif: 'tenue' } },
    { nom: 'Bois', aide: 'Enveloppe de filtre moyenne : ça claque un peu, sans jamais mordre.',
      p: { modele: 'pincee', timbre1: 0.45, timbre2: 0.25, coupure: 440, declin: 0.45, motif: 'pulse' } },
    { nom: 'Pincée', aide: 'Attaque franche, déclin court. Laisse toute la place au break.',
      p: { modele: 'pincee', timbre1: 0.75, timbre2: 0.4, coupure: 820, declin: 0.18, motif: 'suit le break' } },
    { nom: 'Harmonique', aide: 'Une octave plus haut, deuxième harmonique forte : la basse devient audible sur un téléphone.',
      p: { modele: 'sub', timbre1: 0.6, timbre2: 0.2, coupure: 1100, declin: 1.1, motif: 'contretemps' } },
    { nom: 'Carrée filtrée', aide: 'Impulsion épaisse sous un passe-bas bas. Vieux, et ça s\'entend.',
      p: { modele: 'carre', timbre1: 0.5, timbre2: 0.35, coupure: 440, declin: 0.7, motif: 'double' } },
    { nom: 'Reese large', aide: 'Désaccord poussé : la basse occupe toute la largeur et devient un lieu.',
      p: { modele: 'reese', timbre1: 0.9, timbre2: 0.6, coupure: 820, declin: 2.5, motif: 'tenue' } },
    { nom: 'Contrebasse', aide: 'Coupure au ras, déclin moyen. Le seul patch de la liste qui pourrait être acoustique.',
      p: { modele: 'pincee', timbre1: 0.3, timbre2: 0.15, coupure: 320, declin: 0.7, motif: 'contretemps' } },
  ],

  batterie: [
    { nom: 'Amen filtré', aide: 'La grille de 1969, passée sous un filtre. Dense, tous les fantômes.',
      p: { modele: 'amen', grosse: 0.8, caisse: 0.7, charley: 0.45, fantome: 0.7, corps: 0.55, coupure: 8500, swing: 0.06 } },
    { nom: 'Deux-temps', aide: 'Caisse sur le 2 et le 4 seulement. Le break le plus lisible, et le plus sage.',
      p: { modele: 'deux-temps', grosse: 0.85, caisse: 0.75, charley: 0.5, fantome: 0.25, corps: 0.6, coupure: 11000, swing: 0.04 } },
    { nom: 'Rouleau liquide', aide: 'Le break du liquid : caisse claire noyée, fantômes partout, charleston en doubles.',
      p: { modele: 'rouleau', grosse: 0.7, caisse: 0.6, charley: 0.55, fantome: 0.8, corps: 0.4, coupure: 6400, swing: 0.1 } },
    { nom: 'Brosses', aide: 'Presque plus de frappes franches : il ne reste que le tissu entre les temps.',
      p: { modele: 'brosses', grosse: 0.45, caisse: 0.3, charley: 0.35, fantome: 0.9, corps: 0.2, coupure: 4800, swing: 0.16 } },
    { nom: 'Peaux', aide: 'Corps de caisse au maximum, bruit au minimum. Des toms, pas une batterie.',
      p: { modele: 'peaux', grosse: 0.9, caisse: 0.55, charley: 0.2, fantome: 0.45, corps: 0.9, coupure: 2700, swing: 0.08 } },
    { nom: 'Clairsemé', aide: 'Quatre frappes par mesure. Ce qu\'on met sous une nappe sans la couvrir.',
      p: { modele: 'clairsemé', grosse: 0.6, caisse: 0.45, charley: 0.25, fantome: 0.15, corps: 0.45, coupure: 6400, swing: 0.02 } },
    { nom: 'Shuffle', aide: 'Swing poussé jusqu\'au ternaire. À 174 BPM ça bascule vers le jungle.',
      p: { modele: 'shuffle', grosse: 0.75, caisse: 0.65, charley: 0.5, fantome: 0.6, corps: 0.5, coupure: 8500, swing: 0.24 } },
    { nom: 'Demi-temps', aide: 'La caisse une fois par mesure. Même tempo, deux fois moins de mouvement.',
      p: { modele: 'demi-temps', grosse: 0.8, caisse: 0.7, charley: 0.3, fantome: 0.3, corps: 0.6, coupure: 6400, swing: 0.06 } },
  ],

  texture: [
    { nom: 'Gouttes proches', aide: 'Des impulsions courtes et accordées. C\'est le battement d\'une préparation vivante.',
      p: { modele: 'gouttes', densite: 2, hauteur: 0.55, etendue: 0.5, dispersion: 0.7, coupure: 6400 } },
    { nom: 'Gouttes lointaines', aide: 'Les mêmes, plus rares et plus graves. Ça devient un lieu plutôt qu\'un événement.',
      p: { modele: 'gouttes', densite: 0.5, hauteur: 0.25, etendue: 0.7, dispersion: 0.9, coupure: 2700 } },
    { nom: 'Craquements de paroi', aide: 'Des micro-transitoires irréguliers : la chitine qui s\'assemble.',
      p: { modele: 'craquements', densite: 4, hauteur: 0.6, etendue: 0.8, dispersion: 0.8, coupure: 8500 } },
    { nom: 'Souffle d\'optique', aide: 'Le bruit d\'un objectif ouvert. Continu, jamais au premier plan.',
      p: { modele: 'souffle', densite: 1, hauteur: 0.4, etendue: 0.3, dispersion: 0.5, coupure: 4800 } },
    { nom: 'Grains de cytoplasme', aide: 'Granulation dense : chaque grain est trop court pour avoir une hauteur, mais l\'ensemble en a une.',
      p: { modele: 'grains', densite: 8, hauteur: 0.5, etendue: 0.6, dispersion: 1, coupure: 6400 } },
    { nom: 'Bulles', aide: 'Des chutes de hauteur inversées. Rondes, un peu comiques : à doser.',
      p: { modele: 'bulles', densite: 1.5, hauteur: 0.65, etendue: 0.75, dispersion: 0.8, coupure: 4800 } },
    { nom: 'Poussière de gélose', aide: 'Des clics très fins, très rares. À la limite du défaut de gravure.',
      p: { modele: 'poussière', densite: 3, hauteur: 0.8, etendue: 0.4, dispersion: 1, coupure: 14000 } },
    { nom: 'Cristaux', aide: 'Des résonances hautes et longues. La seule texture de la liste qui tienne une note.',
      p: { modele: 'cristaux', densite: 0.75, hauteur: 0.85, etendue: 0.55, dispersion: 0.9, coupure: 11000 } },
    { nom: 'Vésicules', aide: 'Rares, graves, presque muettes. Une fusion toutes les deux mesures.',
      p: { modele: 'bulles', densite: 0.25, hauteur: 0.3, etendue: 0.4, dispersion: 0.6, coupure: 2000 } },
  ],
};

/* ---------------------------------------------------------------------------
   Les six ambiances.

   Elles ne sont pas six humeurs decoratives : ce sont les six endroits ou le
   jeu se tient. `apex` et `cytoplasme` sont en bas, dans le temps de la
   vesicule, ou une mesure n'a aucun sens ; `thalle` et `front` sont en haut,
   a l'echelle de la colonie, ou il y a enfin assez de choses simultanees pour
   qu'un rythme veuille dire quelque chose ; `substrat` est l'avant-partie et
   `conidie` la dispersion.

   Le pont entre les deux echelles (`monde.html`) traverse donc aussi le son,
   et c'est la grandeur `echelle` qui le fait — voir `src/audio/son.js`.
--------------------------------------------------------------------------- */

export const NOMS = {
  substrat: 'Le substrat',
  apex: 'L\'apex',
  cytoplasme: 'Le cytoplasme',
  thalle: 'Le thalle',
  front: 'Le front',
  conidie: 'La conidie',
};

/** Le rack par defaut d'un genre. Chaque ambiance ne dit que ses ecarts. */
const BASE = {
  drone: { modele: 'sines', niveau: 0.6, timbre1: 0.4, timbre2: 0.25, coupure: 2700, resonance: 0.1,
    attaque: 4.2, relache: 5.5, desaccord: 8, mouvement: 0.4, octave: -1, reverbe: 0.55, echo: 0, suivi: 0.2 },
  nappe: { modele: 'dents', niveau: 0.5, timbre1: 0.3, timbre2: 0.35, coupure: 1500, resonance: 0.15,
    attaque: 1.8, relache: 3.8, desaccord: 12, mouvement: 0.5, octave: 0, reverbe: 0.7, echo: 0.15, suivi: 0.6 },
  cloche: { modele: 'fm', niveau: 0.45, timbre1: 0.2, timbre2: 0.45, coupure: 4800, declin: 1.1,
    densite: 1.5, contretemps: 0.6, dispersion: 0.5, octave: 1, reverbe: 0.75, echo: 0.6, suivi: 0.7 },
  basse: { modele: 'sub', niveau: 0.5, timbre1: 0.2, timbre2: 0.15, coupure: 440, declin: 0.7,
    motif: 'suit le break', octave: 0, reverbe: 0.1, suivi: 0.9 },
  break: { modele: 'rouleau', niveau: 0.5, grosse: 0.7, caisse: 0.6, charley: 0.5, fantome: 0.7,
    corps: 0.45, coupure: 8500, swing: 0.08, ducking: 0.45, reverbe: 0.35, echo: 0.2, suivi: 1 },
  texture: { modele: 'gouttes', niveau: 0.45, densite: 2, hauteur: 0.55, etendue: 0.6,
    dispersion: 0.8, coupure: 6400, reverbe: 0.85, echo: 0.35, suivi: 0.8 },
};

/** Un rack complet : la base, plus les ecarts voix par voix. */
const rack = (ecarts = {}) => Object.fromEntries(VOIX.map((v) =>
  [v.cle, { ...BASE[v.cle], ...(ecarts[v.cle] || {}) }]));

export const PRESETS = {
  /* Presque rien. Le drone tient seul pendant que l'oeil cherche la colonie.
     15 s de queue : a cette taille la reverbe n'est plus un effet, c'est le
     seul instrument qu'on entende vraiment. */
  substrat: { bpm: 84, tonique: 5, gamme: 'eolien', accords: 1, melodie: 0.15,
    reverbe: 15, reverbeCouleur: 0.25, preDelai: 45, echo: 0.25, echoTemps: '1/2', echoRetour: 0.5,
    largeur: 0.8, couleur: 2700, grain: 0.45, chaleur: 0.3, derive: 0.8 },

  /* Le temps de la vesicule. Le break est a zero et ce n'est pas un reglage
     timide : une mesure n'a aucun sens a l'echelle ou une exocytose dure
     0,85 s et ou l'apex avance de 194 nm a chaque fusion. */
  apex: { bpm: 172, tonique: 5, gamme: 'dorien', accords: 2, melodie: 0.35,
    reverbe: 10, reverbeCouleur: 0.4, preDelai: 35, echo: 0.5, echoTemps: '3/16', echoRetour: 0.55,
    largeur: 0.75, couleur: 6400, grain: 0.35, chaleur: 0.35, derive: 0.65 },

  /* Le flux interieur : tout le monde derive vers la pointe. La texture passe
     devant la musique, c'est la seule ambiance ou elle est la voix principale. */
  cytoplasme: { bpm: 174, tonique: 2, gamme: 'dorien', accords: 2, melodie: 0.5,
    reverbe: 6.2, reverbeCouleur: 0.5, preDelai: 25, echo: 0.55, echoTemps: '3/16', echoRetour: 0.6,
    largeur: 0.85, couleur: 8500, grain: 0.4, chaleur: 0.45, derive: 0.55 },

  /* La colonie. C'est ici que le genre existe pour de bon : il y a enfin
     assez de pointes simultanees pour qu'un rythme veuille dire quelque chose. */
  thalle: { bpm: 174, tonique: 2, gamme: 'dorien', accords: 2, melodie: 0.55,
    reverbe: 6.2, reverbeCouleur: 0.6, preDelai: 20, echo: 0.55, echoTemps: '3/16', echoRetour: 0.6,
    largeur: 0.7, couleur: 11000, grain: 0.25, chaleur: 0.5, derive: 0.4 },

  /* Le substrat s'epuise. Phrygien, coupure basse, break dense : la seule
     ambiance ou quelque chose presse. */
  front: { bpm: 176, tonique: 1, gamme: 'phrygien', accords: 1, melodie: 0.25,
    reverbe: 4.8, reverbeCouleur: 0.45, preDelai: 15, echo: 0.4, echoTemps: '1/8', echoRetour: 0.5,
    largeur: 0.6, couleur: 4800, grain: 0.35, chaleur: 0.65, derive: 0.3 },

  /* La dispersion. Lydien : la quarte augmentee ne retombe jamais, et c'est
     exactement ce qu'on veut d'une conidie emportee. */
  conidie: { bpm: 176, tonique: 9, gamme: 'lydien', accords: 3, melodie: 0.7,
    reverbe: 12.5, reverbeCouleur: 0.75, preDelai: 60, echo: 0.7, echoTemps: '3/16', echoRetour: 0.65,
    largeur: 0.95, couleur: 14000, grain: 0.3, chaleur: 0.3, derive: 0.7 },
};

export const RACKS = {
  substrat: rack({
    drone: { niveau: 0.9, modele: 'bruit', timbre1: 0.6, timbre2: 0.45, coupure: 1500, octave: -2, reverbe: 0.7, mouvement: 0.6 },
    nappe: { niveau: 0.55, modele: 'formant', timbre1: 0.15, timbre2: 0.6, coupure: 2000, attaque: 4.2, reverbe: 0.85 },
    cloche: { niveau: 0.25, modele: 'additif', timbre1: 0.75, timbre2: 0.25, coupure: 11000, declin: 2.5, densite: 0.5, reverbe: 0.9 },
    basse: { niveau: 0.3, modele: 'sub', motif: 'tenue', coupure: 320, declin: 2.5 },
    break: { niveau: 0 },
    texture: { niveau: 0.5, modele: 'poussière', densite: 1.5, hauteur: 0.8, coupure: 14000 },
  }),

  apex: rack({
    drone: { niveau: 0.75, modele: 'metal', timbre1: 0.2, timbre2: 0.2, coupure: 4800, octave: -1, reverbe: 0.6 },
    nappe: { niveau: 0.5, modele: 'sines', timbre1: 0.55, timbre2: 0.25, coupure: 4800, attaque: 2.8, reverbe: 0.8 },
    cloche: { niveau: 0.4, modele: 'goutte', timbre1: 0.55, timbre2: 0.35, declin: 0.45, densite: 1, contretemps: 0.8, dispersion: 0.8 },
    basse: { niveau: 0.2, modele: 'sub', motif: 'tenue', declin: 2.5 },
    break: { niveau: 0 },
    texture: { niveau: 0.65, modele: 'gouttes', densite: 2, hauteur: 0.55, reverbe: 0.9 },
  }),

  cytoplasme: rack({
    drone: { niveau: 0.6, modele: 'bruit', timbre1: 0.85, timbre2: 0.2, coupure: 3600, mouvement: 0.7 },
    nappe: { niveau: 0.55, modele: 'fm', timbre1: 0.2, timbre2: 0.3, coupure: 4800, attaque: 0.6, reverbe: 0.7 },
    cloche: { niveau: 0.5, modele: 'additif', timbre1: 0.6, timbre2: 0.7, coupure: 6400, declin: 0.7, densite: 2, contretemps: 0.7 },
    basse: { niveau: 0.4, modele: 'pincee', timbre1: 0.45, coupure: 440, declin: 0.45, motif: 'pulse' },
    break: { niveau: 0.3, modele: 'brosses', grosse: 0.45, caisse: 0.3, charley: 0.35, fantome: 0.9, corps: 0.2, coupure: 4800, swing: 0.16 },
    texture: { niveau: 0.75, modele: 'grains', densite: 8, hauteur: 0.5, dispersion: 1, coupure: 6400 },
  }),

  thalle: rack({
    drone: { niveau: 0.5, modele: 'sines', timbre1: 0.4, coupure: 2000, reverbe: 0.5 },
    nappe: { niveau: 0.65, modele: 'dents', timbre1: 0.25, timbre2: 0.35, coupure: 1500, desaccord: 18, reverbe: 0.7 },
    cloche: { niveau: 0.6, modele: 'fm', timbre1: 0.2, timbre2: 0.45, coupure: 4800, declin: 1.1, densite: 2, reverbe: 0.7, echo: 0.65 },
    basse: { niveau: 0.7, modele: 'reese', timbre1: 0.5, timbre2: 0.3, coupure: 600, declin: 1.1, motif: 'tenue' },
    break: { niveau: 0.8, modele: 'rouleau', grosse: 0.7, caisse: 0.6, charley: 0.55, fantome: 0.8, corps: 0.4, coupure: 6400, swing: 0.1 },
    texture: { niveau: 0.3, modele: 'craquements', densite: 3, hauteur: 0.6, coupure: 8500 },
  }),

  front: rack({
    drone: { niveau: 0.7, modele: 'dents', timbre1: 0.75, timbre2: 0.5, coupure: 600, resonance: 0.35, octave: -2 },
    nappe: { niveau: 0.5, modele: 'metal', timbre1: 0.7, timbre2: 0.5, coupure: 2700, attaque: 1.1, reverbe: 0.55 },
    cloche: { niveau: 0.35, modele: 'corde', timbre1: 0.7, timbre2: 0.15, coupure: 2700, declin: 0.7, densite: 1, reverbe: 0.5 },
    basse: { niveau: 0.75, modele: 'pincee', timbre1: 0.75, timbre2: 0.4, coupure: 820, declin: 0.18, motif: 'suit le break' },
    break: { niveau: 0.8, modele: 'amen', grosse: 0.8, caisse: 0.7, charley: 0.45, fantome: 0.7, corps: 0.55, coupure: 8500, swing: 0.06 },
    texture: { niveau: 0.4, modele: 'craquements', densite: 4, hauteur: 0.6, etendue: 0.8, coupure: 8500 },
  }),

  conidie: rack({
    drone: { niveau: 0.45, modele: 'metal', timbre1: 0.7, timbre2: 0.5, coupure: 8500, octave: -1, reverbe: 0.8 },
    nappe: { niveau: 0.6, modele: 'sines', timbre1: 0.8, timbre2: 0.1, coupure: 6400, attaque: 0.6, reverbe: 0.9, echo: 0.3 },
    cloche: { niveau: 0.65, modele: 'fm', timbre1: 0.65, timbre2: 0.2, coupure: 11000, declin: 1.7, densite: 3, dispersion: 0.9, echo: 0.75, reverbe: 0.85 },
    basse: { niveau: 0.45, modele: 'sub', timbre1: 0.6, coupure: 1100, declin: 1.1, motif: 'contretemps', octave: 1 },
    break: { niveau: 0.45, modele: 'clairsemé', grosse: 0.6, caisse: 0.45, charley: 0.25, fantome: 0.15, corps: 0.45, coupure: 6400, swing: 0.02, reverbe: 0.6 },
    texture: { niveau: 0.6, modele: 'poussière', densite: 3, hauteur: 0.8, etendue: 0.4, dispersion: 1, coupure: 14000, reverbe: 0.9 },
  }),
};

export const ORDRE_AMBIANCES = ['substrat', 'apex', 'cytoplasme', 'thalle', 'front', 'conidie'];

/* ---------------------------------------------------------------------------
   Les grilles de break.

   Deux mesures, 32 pas par mesure — des quadruples croches. Ce n'est pas du
   luxe : a 16 pas on ne peut pas ecrire une note fantome entre deux doubles
   croches, et les fantomes sont exactement ce qui separe un break d'une
   boite a rythmes. Les groupes de huit valent une noire, et l'espace n'est
   la que pour l'oeil — il est retire au chargement.

     K grosse forte   k grosse faible
     S caisse forte   s caisse fantome
     H charleston ouvert   h charleston ferme
--------------------------------------------------------------------------- */

const grille = (s) => s.replace(/ /g, '');

export const BREAKS = {
  amen: {
    kick: grille('K------- -------- ----K--- --------  -------- K------- ----K--- --------'),
    snare: grille('-------- S---s--- --s----- S---s---  --s----- S------- --s---s- S-------'),
    hat: grille('h---h--- h---h--- h---h--- h---H---  h---h--- h---h--- h---h--- h---H---'),
  },
  'deux-temps': {
    kick: grille('K------- -------- -------- --------  K------- -------- ----K--- --------'),
    snare: grille('-------- S------- -------- S-------  -------- S------- -------- S-------'),
    hat: grille('h---h--- h---h--- h---h--- h---H---  h---h--- h---h--- h---h--- h---H---'),
  },
  rouleau: {
    kick: grille('K------- -------- ----K--- --------  -------- --K----- ----K--- --------'),
    snare: grille('-------- S---s-s- --s----- S-s---s-  --s-s--- S---s--- --s---s- S-s-s-s-'),
    hat: grille('h--h-h-- h--h-h-- h--h-h-- h--h-H--  h--h-h-- h--h-h-- h--h-h-- h--h-H--'),
  },
  brosses: {
    kick: grille('k------- -------- -------- --------  -------- -------- k------- --------'),
    snare: grille('--s-s-s- s-s-s-s- --s-s-s- s-s---s-  --s-s-s- s-s-s-s- --s-s-s- s-s-s-s-'),
    hat: grille('--h---h- --h---h- --h---h- --h---h-  --h---h- --h---h- --h---h- --h---H-'),
  },
  peaux: {
    kick: grille('K------- ----K--- -------- K-------  -------- K------- --K----- --------'),
    snare: grille('-------- S------- -------- --------  -------- S------- -------- S-------'),
    hat: grille('-------- -------- --h----- --------  -------- -------- --h----- --------'),
  },
  'clairsemé': {
    kick: grille('K------- -------- -------- --------  -------- -------- K------- --------'),
    snare: grille('-------- -------- S------- --------  -------- -------- S------- --------'),
    hat: grille('-------- ----h--- -------- ----h---  -------- ----h--- -------- ----H---'),
  },
  shuffle: {
    kick: grille('K-----k- -------- --K----- --------  K------- -----k-- --K----- --------'),
    snare: grille('-------- S-----s- -------- S-----s-  -------- S-----s- --s----- S-----s-'),
    hat: grille('h--h--h- h--h--h- h--h--h- h--h--H-  h--h--h- h--h--h- h--h--h- h--h--H-'),
  },
  'demi-temps': {
    kick: grille('K------- -------- -------- --------  -------- ----K--- -------- --------'),
    snare: grille('-------- -------- S------- --------  -------- -------- S------- --------'),
    hat: grille('h------- --h----- h------- --h-----  h------- --h----- h------- --h---H-'),
  },
};

export const PAS_PAR_MESURE = 32;
export const MESURES = 2;

/* ---------------------------------------------------------------------------
   Les crans, et le code.

   Le code porte le preset ET le rack ET la graine : l'identite, le son et
   l'interpretation. Un code qui ne porterait que le preset rendrait un autre
   morceau chez celui qui le charge, ce qui est le contraire du but.

   La largeur en caracteres de chaque champ est DEDUITE de son nombre de
   crans, jamais fixee : le jour ou une table gagne une valeur, le code
   s'allonge tout seul au lieu de tronquer en silence.
--------------------------------------------------------------------------- */

const A36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export const crans = (ch) => (ch.choix ? ch.choix.length - 1
  : (ch.table ? ch.table.length - 1 : Math.round((ch.max - ch.min) / ch.pas)));

export const versCran = (ch, v) => {
  if (ch.choix) return Math.max(0, ch.choix.indexOf(v));
  if (ch.table) {
    /* Une valeur hors table ne doit pas devenir 0 en silence : on prend le
       cran le plus proche. C'est ce qui permet a une machine d'ecrire une
       valeur ronde sans connaitre la table par coeur. */
    let meilleur = 0, ecart = Infinity;
    for (let i = 0; i < ch.table.length; i++) {
      const d = Math.abs(ch.table[i] - v);
      if (d < ecart) { ecart = d; meilleur = i; }
    }
    return meilleur;
  }
  return Math.max(0, Math.min(crans(ch), Math.round((v - ch.min) / ch.pas)));
};

export const depuisCran = (ch, n) => {
  const k = Math.max(0, Math.min(crans(ch), n | 0));
  if (ch.choix) return ch.choix[k];
  if (ch.table) return ch.table[k];
  /* Arrondi au milliemme : sans lui, 7 crans de 0,05 donnent 0,35000000000000003
     et la comparaison a la valeur adoptee est fausse a chaque fois. */
  return Math.round((ch.min + k * ch.pas) * 1000) / 1000;
};

const largeur = (ch) => Math.max(1, Math.ceil(Math.log(crans(ch) + 1) / Math.log(36)));

/** Tous les champs du code, dans l'ordre. Un seul endroit, donc pas de derive. */
function plan() {
  const l = CHAMPS.map((ch) => ({ ch, ou: ['preset', ch.cle] }));
  for (const v of VOIX) {
    for (const ch of CHAMPS_PAR_GENRE[v.genre]) l.push({ ch, ou: ['rack', v.cle, ch.cle] });
  }
  return l;
}
const PLAN = plan();

const ecrire = (n, w) => {
  let s = '';
  let x = n;
  for (let i = 0; i < w; i++) { s = A36[x % 36] + s; x = Math.floor(x / 36); }
  return s;
};
const lire = (s) => {
  let n = 0;
  for (const c of s) {
    const k = A36.indexOf(c);
    if (k < 0) return -1;
    n = n * 36 + k;
  }
  return n;
};

/* Somme de controle : un code recopie a la main perd un caractere une fois
   sur dix, et charger a moitie un preset est pire que le refuser. */
function somme(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ecrire(((h ^ (h >>> 16)) >>> 0) % 1296, 2);
}

export function encoderCode(ambiance, preset, rackAmb, graine) {
  let corps = '';
  for (const { ch, ou } of PLAN) {
    const v = ou[0] === 'preset' ? preset[ou[1]] : rackAmb[ou[1]][ou[2]];
    corps += ecrire(versCran(ch, v), largeur(ch));
  }
  corps += ecrire((graine | 0) & 0xffff, 4);
  const coupe = corps.match(/.{1,10}/g).join('-');
  return `AP1-${ambiance}-${coupe}-${somme(ambiance + corps)}`.toUpperCase();
}

/**
 * @returns {{ambiance,preset,rack,graine}|null} null si le code est refuse.
 *   Refuser en bloc, jamais a moitie : un preset charge de travers est un
 *   bug qu'on cherche pendant une heure.
 */
export function decoderCode(code) {
  const parts = String(code).trim().toLowerCase().split('-');
  if (parts.length < 4 || parts[0] !== 'ap1') return null;
  const ambiance = parts[1];
  if (!PRESETS[ambiance]) return null;
  const ctrl = parts[parts.length - 1];
  const corps = parts.slice(2, -1).join('');
  const attendu = PLAN.reduce((n, { ch }) => n + largeur(ch), 0) + 4;
  if (corps.length !== attendu) return null;
  if (somme(ambiance + corps).toLowerCase() !== ctrl) return null;

  const preset = { ...PRESETS[ambiance] };
  const rk = JSON.parse(JSON.stringify(RACKS[ambiance]));
  let i = 0;
  for (const { ch, ou } of PLAN) {
    const w = largeur(ch);
    const n = lire(corps.slice(i, i + w));
    if (n < 0) return null;
    i += w;
    const v = depuisCran(ch, n);
    if (ou[0] === 'preset') preset[ou[1]] = v; else rk[ou[1]][ou[2]] = v;
  }
  const graine = lire(corps.slice(i, i + 4));
  if (graine < 0) return null;
  return { ambiance, preset, rack: rk, graine };
}
