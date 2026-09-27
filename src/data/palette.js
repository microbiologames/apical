/* ---------------------------------------------------------------------------
   Palettes.

   Chaque substrat choisit son MODE D'OBSERVATION, et ce n'est pas un choix
   decoratif : ce sont les deux montages reellement utilises en mycologie.

     mode 'coton'      BLEU COTON LACTOPHENOL, le montage classique.
                       Fond clair, paroi teintee en BLEU : le colorant se
                       fixe sur la chitine de la paroi, pas sur le
                       cytoplasme. C'est pour ca que l'hyphe se lit comme un
                       tube borde et non comme un trait plein.

     mode 'calco'      BLANC DE CALCOFLUOR sous epifluorescence. Le fluorochrome
                       se lie a la chitine et a la cellulose : sur fond noir,
                       la paroi brille et le cytoplasme reste sombre. Et comme
                       la paroi NEUVE est la plus riche en chitine fraiche,
                       l'apex est le point le plus lumineux du champ — ce qui
                       tombe exactement sur ce que le joueur doit regarder.

   Consequence de conception : l'EPAISSEUR DE PAROI est la jauge de sucre,
   et elle est lisible dans les deux montages parce que les deux colorent la
   paroi. Un montage qui colorerait le cytoplasme aurait cache l'information
   la plus importante du jeu.
--------------------------------------------------------------------------- */

import { hexToRgba } from '../core/pixel.js';

/** Chrome du HUD : toujours sur la bande noire du pourtour. */
export const UI = {
  text: hexToRgba('#d8e4ef'),
  textDim: hexToRgba('#5f7383'),
  textHot: hexToRgba('#ffd479'),
  frame: hexToRgba('#243a47'),
  eau: hexToRgba('#6ec6ff'),
  eauDim: hexToRgba('#255a80'),
  sucre: hexToRgba('#ffc24a'),
  sucreDim: hexToRgba('#7d5a12'),
  paroi: hexToRgba('#9fe8ff'),
  alerte: hexToRgba('#ff5a6e'),
  danger: hexToRgba('#ff2e46'),
  spore: hexToRgba('#c9ffe0'),
  gene: hexToRgba('#c07bff'),
};

/* --- montage au BLEU COTON : fond clair, paroi bleue ---------------------- */
const COTON = {
  mode: 'coton',
  /* Halo de contraste de phase : le bord d'un objet dephase plus fort que son
     centre. En fond clair il se lit comme un lisere blanc. */
  phase: hexToRgba('#ffffff', 92),
  halo: hexToRgba('#6b6455', 148),

  /* La paroi est le seul element colore : trois tons pour l'epaisseur.
     `paroiMince` n'est pas une variante graphique, c'est un AVERTISSEMENT :
     une paroi sous-alimentee est visiblement plus pale et plus fine. */
  paroi: hexToRgba('#2f4f9e'),
  paroiRim: hexToRgba('#16265a'),
  paroiMince: hexToRgba('#7d8ec4'),
  cyto: hexToRgba('#ccd6ea'),
  /* Le Spitzenkorper est un amas de vesicules : refringent, tres net. */
  spk: hexToRgba('#101f4a'),
  spkGlow: hexToRgba('#6d86d6'),
  /* Organites RECLAIRCIS apres capture macro : a #4a63ab ils formaient, dans un
     tube devenu large par le zoom, un amas franchement sombre qui se lisait
     comme une tache et non comme un cytoplasme granuleux. Un montage au bleu
     coton colore la PAROI ; le contenu y reste pale et seulement contraste. */
  vesicule: hexToRgba('#8b9cc9'),
  /* UNE TEINTE PAR ROLE DE VESICULE. Le chitosome porte la couleur de la paroi
     parce qu'il VA devenir de la paroi : voir un point bleu foncé arriver et se
     fondre dans le bord, c'est voir la paroi se construire. Les trois autres
     s'en ecartent juste assez pour se distinguer d'un coup d'oeil. */
  vesParoi: hexToRgba('#2f4f9e'),
  vesExtension: hexToRgba('#6f93d6'),
  vesMembrane: hexToRgba('#b07a2a'),
  vesSecretion: hexToRgba('#3f7f5a'),
  septum: hexToRgba('#0e1c44'),
  woronin: hexToRgba('#8a6a22'),
  noeud: hexToRgba('#1d7d6a'),

  /* Ressources du milieu. */
  sucre: hexToRgba('#b06a08'), sucreRim: hexToRgba('#5e3603'),
  /* Le sel est un cristal cubique incolore : c'est son ARETE qui se voit, pas
     sa masse. On le rend donc presque blanc a bord dur et bleute. */
  sel: hexToRgba('#f2f6ff'), selRim: hexToRgba('#6b7f9e'),
  eau: hexToRgba('#2d7ea8'), eauRim: hexToRgba('#12415a'),
  locus: hexToRgba('#7a2fb0'), locusRim: hexToRgba('#3d1159'),
  /* Un antifongique est un HALO diffusible, jamais un objet net. */
  azole: hexToRgba('#8f4dcf', 120),
  echino: hexToRgba('#c23a5a', 120),
  polyene: hexToRgba('#c98a10', 120),
  sorbate: hexToRgba('#4a8f3a', 120),
};

/* --- montage au CALCOFLUOR : fond noir, paroi fluorescente ---------------- */
const CALCO = {
  mode: 'calco',
  phase: hexToRgba('#e8f6ff', 90),
  halo: hexToRgba('#bfe8ff', 140),

  paroi: hexToRgba('#9fe8ff'),
  paroiRim: hexToRgba('#3f89b0'),
  paroiMince: hexToRgba('#42707f'),
  /* Cytoplasme remonte de #16323f a #1e4557 apres capture : a l'ancien ton, les
     organites (qui sont dessines PLUS CLAIRS que lui) tranchaient si peu qu'on
     ne voyait plus le flux, et le tube se lisait comme un tuyau vide. Il reste
     tres sombre devant la paroi, ce qui est correct : le calcofluor marque la
     paroi, pas le cytoplasme. */
  cyto: hexToRgba('#1e4557'),
  spk: hexToRgba('#ffffff'),
  spkGlow: hexToRgba('#7fe3ff'),
  vesicule: hexToRgba('#cbf2ff'),
  vesParoi: hexToRgba('#9fe8ff'),
  vesExtension: hexToRgba('#ffffff'),
  vesMembrane: hexToRgba('#ffd479'),
  vesSecretion: hexToRgba('#9be8a8'),
  septum: hexToRgba('#dff6ff'),
  woronin: hexToRgba('#ffd479'),
  noeud: hexToRgba('#6affc8'),

  sucre: hexToRgba('#ffc24a'), sucreRim: hexToRgba('#9a6f12'),
  sel: hexToRgba('#eaf2ff'), selRim: hexToRgba('#7f93b5'),
  eau: hexToRgba('#6ec6ff'), eauRim: hexToRgba('#2a6a96'),
  locus: hexToRgba('#c07bff'), locusRim: hexToRgba('#6a3aa0'),
  azole: hexToRgba('#b98cff', 120),
  echino: hexToRgba('#ff6b8a', 120),
  polyene: hexToRgba('#ffd06b', 120),
  sorbate: hexToRgba('#9be8a8', 120),
};

/**
 * Couleur des conidies d'un competiteur.
 *
 * Ce n'est PAS une teinte de role : la couleur des conidies est un vrai
 * caractere d'identification, celui que lit un mycologue a l'oeil nu sur une
 * boite. Un Penicillium est vert-bleu, un Aspergillus niger est noir, un
 * Botrytis est gris souris, un Fusarium est rose a saumon, un Trichoderma est
 * vert vif. On ne les invente pas, et on ne les echange pas.
 */
export const CONIDIES = {
  botrytis: { fill: '#8c8f86', rim: '#4a4d46' },
  penicillium: { fill: '#5f9e6a', rim: '#2c5232' },
  aspergillus: { fill: '#2b2b2b', rim: '#0d0d0d' },
  fusarium: { fill: '#d98a9a', rim: '#7d4050' },
  trichoderma: { fill: '#55c93a', rim: '#256118' },
  cladosporium: { fill: '#4a4232', rim: '#211d15' },
  xeromyces: { fill: '#d8cfae', rim: '#7d7355' },
};

/* ---------------------------------------------------------------------------
   TOUS LES SUBSTRATS SONT MONTES AU BLEU COTON, donc en fond clair.

   Decision de l'auteur apres essai : le fond clair « donne l'impression d'etre
   directement dans une gelose », et c'est exactement l'effet recherche. Le
   montage au calcofluor reste ecrit plus haut et reste juste, mais il faisait
   alterner fond noir et fond clair EN COURS DE MANCHE, au passage d'un substrat
   a l'autre — un basculement qu'on lit comme une panne d'affichage, pas comme
   un changement de milieu. Un seul montage pour toute la manche.

   Les quatre substrats se distinguent donc par la TEINTE de leur gelose, et
   chacune est celle du milieu reel : pale et verdie pour une cuticule, creme
   pour une chair de fruit, ambre pour un sirop, ocre pour une amande de
   cereale. Ne pas remettre de fond noir sans nouvelle instruction.
--------------------------------------------------------------------------- */
export const SUBSTRATS_PALETTE = {
  pellicule: {
    nom: 'PELLICULE',
    ...COTON,
    /* Cuticule : une gelose pale, a peine verdie par les cires. */
    bg: hexToRgba('#e6e9d8'),
    grain: hexToRgba('#f6f8ea'), grainRim: hexToRgba('#8a9276'),
    voile: hexToRgba('#cdd2b9', 88),
  },
  mesocarpe: {
    nom: 'MESOCARPE',
    ...COTON,
    /* Chair de fruit : pale, gorgee d'eau, et ses parois cellulaires
       dessinent un vrai reseau polygonal. C'est le decor le plus structure
       du jeu, et c'est ce reseau qui fait les couloirs. */
    bg: hexToRgba('#efe8d4'),
    grain: hexToRgba('#fbf6e6'), grainRim: hexToRgba('#9a8f70'),
    voile: hexToRgba('#d6ceb4', 85),
  },
  confiture: {
    nom: 'CONFITURE',
    ...COTON,
    /* Sirop concentre : ambre, dense, et les cristaux de sucre y sont des
       objets refringents a bord dur. */
    bg: hexToRgba('#e2c087'),
    grain: hexToRgba('#fff3d2'), grainRim: hexToRgba('#a07a2e'),
    voile: hexToRgba('#c9a464', 95),
  },
  grain: {
    nom: 'GRAIN STOCKE',
    ...COTON,
    /* Amande de cereale : ocre, dense, et les granules d'amidon y dominent le
       champ — ce sont eux qu'on voit d'abord dans une coupe de ble. */
    bg: hexToRgba('#d8c79a'),
    grain: hexToRgba('#fdf6e0'), grainRim: hexToRgba('#8a7038'),
    voile: hexToRgba('#bfa971', 95),
  },
};

export const RARETE_COLOR = {
  commune: hexToRgba('#9aa8b0'),
  peucommune: hexToRgba('#6fd98a'),
  rare: hexToRgba('#59c9ff'),
  epique: hexToRgba('#c07bff'),
  legendaire: hexToRgba('#ffd24a'),
};

export const RARETE_HEX = {
  commune: '#9aa8b0',
  peucommune: '#6fd98a',
  rare: '#59c9ff',
  epique: '#c07bff',
  legendaire: '#ffd24a',
};
