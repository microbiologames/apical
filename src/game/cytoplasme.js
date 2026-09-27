/* ---------------------------------------------------------------------------
   Le cytoplasme : ce qui rend l'hyphe VIVANTE quand elle ne pousse pas.

   C'est l'equivalent du dandinement de Cell Dungeon : l'animation d'attente.
   Un tube immobile est un dessin ; un tube ou le cytoplasme court vers l'apex
   est un etre. Et ici l'animation d'attente n'est pas inventee, elle est LE
   phenomene central : une hyphe est un tube a paroi rigide rempli d'un
   cytoplasme qui COULE en permanence vers l'apex, parce que c'est ce flux qui
   apporte le materiau de la paroi neuve.

   CE QU'ON VOIT VRAIMENT DANS UN TUBE, de l'apex vers l'arriere :

     0 - 5 um     la CALOTTE APICALE. Aucune vacuole, aucun noyau. Bourree de
                  vesicules et occupee par le Spitzenkorper. C'est la zone la
                  plus dense en organites du champignon, et la plus claire.
     5 - 40 um    zone SUBAPICALE : mitochondries en fuseaux, premiers noyaux,
                  gouttelettes lipidiques refringentes. Le flux y est visible.
     40 um +      zone VACUOLISEE : les vacuoles apparaissent et GROSSISSENT
                  avec l'age du compartiment. C'est ce gradient d'age qui fait
                  qu'une hyphe se lit du premier coup d'oeil dans le bon sens.
     aux septa    les CORPS DE WORONIN, deux a quatre de chaque cote, immobiles.
                  Ce sont les seuls organites qui ne coulent pas : ils sont
                  ancres au pore, prets a le boucher.

   ET CHAQUE VESICULE PORTE UN ROLE. Ce n'est pas une decoration : le trafic
   vesiculaire apical est reellement heterogene, et ce que transporte une
   vesicule decide de ce qu'elle fabrique en fusionnant.

     `paroi`      CHITOSOME. Microvesicule polyedrique de 30 a 40 nm, chargee de
                  chitine synthase. Elle epaissit la paroi. C'est la vesicule
                  qu'on n'a plus quand on va trop vite.
     `extension`  MACROVESICULE apicale de 70 a 100 nm, la plus grosse. Elle
                  apporte le materiau de SURFACE : c'est elle qui allonge.
     `membrane`   vesicule lipidique. La membrane plasmique doit s'etendre en
                  meme temps que la paroi, sinon rien n'avance.
     `secretion`  enzyme exportee — amylase, protease, pectinase. Elle ne
                  construit rien : elle part DEHORS digerer le substrat.

   La composition du trafic est calculee a partir du modele (voir
   Game.mixVesicules) : le flux de paroi suit l'epaisseur deposee, le flux
   d'extension suit la vitesse. Donc POUSSER FAIT LITTERALEMENT DISPARAITRE LES
   CHITOSOMES DU TUBE, et l'arbitrage vitesse / paroi se regarde au lieu de se
   lire sur une jauge. C'est l'aboutissement de la regle « le champ porte
   l'information ».

   TROIS REGLES DE RENDU QUI VIENNENT DE LA :
     - un organite plus haut ou plus bas dans le tube est PLUS FLOU. Le tube a
       11 um de diametre et la profondeur de champ d'un objectif a immersion en
       fait moins : la position laterale sert donc de profondeur, et c'est ce
       qui donne au tube son volume au lieu d'un ruban.
     - une vesicule qui atteint le Spitzenkorper DISPARAIT. C'est l'exocytose,
       et c'est le seul endroit du jeu ou l'on voit le sucre devenir de la
       paroi.
     - rien ne s'arrete jamais. A vitesse nulle le flux continue : c'est ce qui
       fait qu'un apex bloque a l'air vivant et non en pause.
--------------------------------------------------------------------------- */

import { clamp, lerp, mulberry32, TAU } from '../core/util.js';

/* Flux visuel, en px/s, RELATIF a l'apex.
   La valeur fidele serait de plusieurs centaines de um/s a l'echelle du jeu :
   un flux de masse de 5 um/s a ete mesure chez Neurospora. A cette vitesse un
   organite traverse le champ en une fraction de seconde et il ne reste qu'un
   scintillement.
   RALENTI DE 16 A 5,5 sur demande de l'auteur : « des vesicules qui arrivent un
   peu comme dans une lampe a lave ». Le cadrage serre ne sert a rien si ce
   qu'il rapproche defile trop vite pour etre suivi. A 5,5 um/s + 0,5 x la
   vitesse d'extension, une vesicule met une dizaine de secondes a remonter le
   champ : on a le temps de la voir venir, de voir ce qu'elle porte, et de la
   voir fusionner.
   Le fait qui compte est preserve : le flux reste PLUS RAPIDE que l'apex —
   c'est le corps qui alimente la pointe, jamais l'inverse. */
const FLUX_BASE = 5.5;
const FLUX_PAR_V = 0.5;

/* Au-dela de cette distance derriere l'apex on ne peuple plus : c'est hors
   champ dans tous les cas de figure. */
const PORTEE = 220;

/* Composition par defaut, utilisee tant que le jeu n'en fournit pas. */
const MIX_DEFAUT = { paroi: 1, extension: 1, membrane: 0.6, secretion: 0.3 };

const TYPES = [
  /* poids, rayon min/max, part du flux, distance d'apparition mini */
  /* VESICULES : plus grosses et plus nombreuses que le reste, parce que ce sont
     elles qu'on doit pouvoir SUIVRE A L'OEIL, une par une, de leur apparition
     jusqu'a leur fusion. A 1,15-1,75 um de rayon elles font 5 a 8 px au zoom de
     jeu : assez pour qu'un contour et une forme se lisent.
     Les autres organites ont ete espaces d'autant : au zoom serre, un noyau de
     douze pixels qui passe toutes les demi-secondes mange le champ et on ne voit
     plus le trafic vesiculaire, qui est le sujet. */
  { id: 'vesicule', poids: 46, r: [1.15, 1.75], flux: 1.25, sMin: 0, sMax: 150 },
  { id: 'mito', poids: 14, r: [1.1, 1.9], flux: 1.0, sMin: 26, sMax: PORTEE },
  { id: 'noyau', poids: 5, r: [1.9, 2.7], flux: 0.72, sMin: 30, sMax: PORTEE },
  { id: 'lipide', poids: 7, r: [1.0, 1.8], flux: 0.9, sMin: 24, sMax: PORTEE },
  /* Les vacuoles ne coulent presque pas : elles appartiennent au compartiment,
     pas au flux. C'est ce qui cree le gradient d'age. */
  { id: 'vacuole', poids: 14, r: [1.6, 2.6], flux: 0.12, sMin: 52, sMax: PORTEE },
];
const POIDS_TOTAL = TYPES.reduce((a, t) => a + t.poids, 0);

function tirerType(rng, s) {
  const eligibles = TYPES.filter((t) => s >= t.sMin && s <= t.sMax);
  let total = 0;
  for (const t of eligibles) total += t.poids;
  let r = rng() * (total || POIDS_TOTAL);
  for (const t of eligibles) { r -= t.poids; if (r <= 0) return t; }
  return eligibles[0] || TYPES[1];
}

export class Cytoplasme {
  constructor(graine) {
    this.rng = mulberry32((graine ^ 0x2545f491) >>> 0);
    /* Une liste par branche. La cle est l'identifiant de branche, donc une
       branche purgee libere ses organites avec elle. */
    this.parBranche = new Map();
    /* Exocytoses en cours, pour la petite bouffee de lumiere a l'apex. */
    this.flashs = [];
  }

  liste(id) {
    let l = this.parBranche.get(id);
    if (!l) { l = []; this.parBranche.set(id, l); }
    return l;
  }

  /**
   * Avance le cytoplasme d'une branche.
   *
   * @param {number} id      identifiant de branche
   * @param {number} lon     longueur utile de la branche, en px
   * @param {number} v       vitesse d'extension de son apex (0 si morte)
   * @param {boolean} vive   la branche a-t-elle encore un apex
   */
  maj(dt, id, lon, v, vive, mix = MIX_DEFAUT, decharge = true) {
    const l = this.liste(id);
    this.mix = mix;
    const portee = Math.min(lon, PORTEE);
    const flux = FLUX_BASE + FLUX_PAR_V * v;
    /* Densite : un organite tous les 7 px de tube. Mesure a l'oeil sur capture
       MACRO, la seule qui permette d'en juger : a 14 px le tube paraissait vide,
       a 9 px on comptait les organites un par un, a 5 px ils se chevauchaient et
       la paroi ne se lisait plus. Le tube fait 14 um de diametre, donc un
       organite tous les 7 px correspond a une densite lineaire d'environ un par
       demi-diametre, ce qui est ce qu'on voit sur une hyphe en croissance. */
    /* Un organite tous les 5 um : a z = 4,6 cela fait un toutes les 23 px le
       long d'un tube large de 64. Recale avec le zoom serre — a 7 um le tube
       paraissait vide, maintenant qu'on le voit de pres. */
    const cible = Math.min(120, Math.ceil(portee / 6) + 4);

    for (let i = l.length - 1; i >= 0; i--) {
      const o = l[i];
      /* s est mesure DEPUIS LE BOUT de la branche. Le bout avance de v x dt,
         donc un organite immobile dans le monde voit son s croitre d'autant ;
         le flux le ramene vers l'apex. La somme des deux est ce que l'oeil
         percoit, et c'est pour cela qu'un apex rapide semble ASPIRER son
         cytoplasme : a 40 px/s la difference change de signe. */
      /* DECELERATION D'APPROCHE. Une vesicule ne fonce pas sur la membrane :
         elle ralentit en entrant dans la calotte, s'y attarde, et y attend sa
         fusion. C'est ce freinage qui donne le mouvement de lampe a lave — sans
         lui, les vesicules arrivaient a pleine vitesse et disparaissaient net.
         Le facteur tombe a 0,18 dans les douze derniers micrometres. */
      const frein = o.type === 'vesicule' ? lerp(0.18, 1, clamp((o.s - 4) / 12, 0, 1)) : 1;
      o.s += (vive ? v : 0) * dt - flux * o.flux * frein * dt;
      /* Ballottement lateral : le cytoplasme est mou, les organites se
         bousculent. Amplitude bornee a 0,72 du rayon pour qu'aucun ne chevauche
         la paroi — un organite qui mord sur la paroi casse la lecture du tube
         comme objet rigide. */
      o.ph += dt * o.w;
      o.off = clamp(o.off0 + Math.sin(o.ph) * 0.17, -0.72, 0.72);
      /* DEFORMATION. Une vesicule est une poche de membrane, pas une bille :
         elle s'allonge et se tasse en derivant. Deux pour cent d'amplitude
         suffisent a lui oter sa raideur, et c'est ce qui manquait a l'effet de
         lampe a lave autant que la lenteur. */
      o.defo = 1 + Math.sin(o.ph * 0.7 + o.s * 0.08) * 0.22;
      /* Les vacuoles grossissent avec l'age du compartiment, et c'est ce qui
         donne au tube son sens de lecture sans aucune fleche. */
      if (o.type === 'vacuole') o.r = lerp(o.r0, o.r0 * 2.3, clamp((o.s - 52) / 320, 0, 1));

      if (o.s < 4.5) {
        if (o.type === 'vesicule') {
          /* ELLES ATTENDENT LA DECHARGE. Les vesicules secretoires s'accumulent
             au Spitzenkorper pendant la phase lente du pulse et sont exocytees
             pendant la phase rapide : c'est le mecanisme mesure, et c'est ce qui
             donne a la croissance ses paliers. En jeu, on VOIT donc le bouchon
             se former au bout puis partir d'un coup, au lieu d'un egouttement
             continu. */
          if (!decharge) { o.s = 3.2 + (o.att = (o.att || 0) + dt * 0.4) % 1.6; continue; }
          /* EXOCYTOSE. La vesicule fusionne, et ce qu'elle portait se voit :
             un chitosome epaissit la paroi, une macrovesicule pousse le bout,
             une lipidique etale la membrane, une enzyme part dehors. C'est le
             seul endroit du jeu ou l'on voit le sucre devenir de la paroi. */
          this.flashs.push({ off: o.off, t: 0.26, role: o.role });
          l.splice(i, 1);
          continue;
        }
        /* Les gros organites n'entrent pas dans la calotte apicale : ils sont
           refoules. On les renvoie en arriere plutot que de les supprimer, ce
           qui evite un clignotement a l'apex. */
        o.s = 5 + this.rng() * 5;
        o.off0 = (this.rng() * 2 - 1) * 0.6;
      }
      if (o.s > portee + 26) l.splice(i, 1);
    }

    /* Peuplement. Les nouveaux apparaissent A L'ARRIERE de la portee visible
       quand la branche pousse, et REPARTIS quand on vient de la creer. */
    let garde = 0;
    while (l.length < cible && garde++ < 24) {
      const neuf = l.length > cible * 0.6;
      const s = neuf ? portee - this.rng() * 24 : this.rng() * portee;
      const t = tirerType(this.rng, s);
      l.push({
        type: t.id, s, role: t.id === 'vesicule' ? this.tirerRole() : null,
        r0: lerp(t.r[0], t.r[1], this.rng()),
        r: lerp(t.r[0], t.r[1], this.rng()),
        off0: (this.rng() * 2 - 1) * 0.62,
        /* Ballottement TRES lent : 0,25 a 0,7 rad/s au lieu de 1,1 a 2,9. Un
           cytoplasme est visqueux, et une vesicule y derive, elle n'y vibre
           pas. */
        off: 0, ph: this.rng() * TAU, w: lerp(0.25, 0.7, this.rng()), defo: 1,
        flux: t.flux * lerp(0.82, 1.18, this.rng()),
        ang: this.rng() * Math.PI,
      });
    }

    for (let i = this.flashs.length - 1; i >= 0; i--) {
      this.flashs[i].t -= dt;
      if (this.flashs[i].t <= 0) this.flashs.splice(i, 1);
    }
    return l;
  }

  /** Tire un role selon la composition courante du trafic. */
  tirerRole() {
    const m = this.mix || MIX_DEFAUT;
    const total = m.paroi + m.extension + m.membrane + m.secretion;
    let r = this.rng() * (total || 1);
    if ((r -= m.paroi) <= 0) return 'paroi';
    if ((r -= m.extension) <= 0) return 'extension';
    if ((r -= m.membrane) <= 0) return 'membrane';
    return 'secretion';
  }

  oublier(id) { this.parBranche.delete(id); }
}
