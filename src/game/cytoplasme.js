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
   La valeur fidele serait 300 px/s : un flux de masse de 5 um/s a ete mesure
   chez Neurospora, et l'echelle du jeu est 1 s = 1 min. A 300 px/s un organite
   traverse le champ en moins d'une seconde et il ne reste qu'un scintillement.
   On rend donc le flux a 16 px/s + 0,8 x la vitesse d'extension : lisible, et
   toujours PLUS RAPIDE que l'apex, ce qui est le fait qui compte — c'est le
   corps qui alimente la pointe, jamais l'inverse. */
const FLUX_BASE = 16;
const FLUX_PAR_V = 0.8;

/* Au-dela de cette distance derriere l'apex on ne peuple plus : c'est hors
   champ dans tous les cas de figure. */
const PORTEE = 460;

const TYPES = [
  /* poids, rayon min/max, part du flux, distance d'apparition mini */
  { id: 'vesicule', poids: 30, r: [0.7, 1.15], flux: 1.25, sMin: 0, sMax: 150 },
  { id: 'mito', poids: 22, r: [1.1, 1.9], flux: 1.0, sMin: 7, sMax: PORTEE },
  { id: 'noyau', poids: 7, r: [1.9, 2.7], flux: 0.72, sMin: 16, sMax: PORTEE },
  { id: 'lipide', poids: 10, r: [1.0, 1.8], flux: 0.9, sMin: 10, sMax: PORTEE },
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
  maj(dt, id, lon, v, vive) {
    const l = this.liste(id);
    const portee = Math.min(lon, PORTEE);
    const flux = FLUX_BASE + FLUX_PAR_V * v;
    /* Densite : un organite tous les 7 px de tube. Mesure a l'oeil sur capture
       MACRO, la seule qui permette d'en juger : a 14 px le tube paraissait vide,
       a 9 px on comptait les organites un par un, a 5 px ils se chevauchaient et
       la paroi ne se lisait plus. Le tube fait 14 um de diametre, donc un
       organite tous les 7 px correspond a une densite lineaire d'environ un par
       demi-diametre, ce qui est ce qu'on voit sur une hyphe en croissance. */
    const cible = Math.min(120, Math.ceil(portee / 7) + 4);

    for (let i = l.length - 1; i >= 0; i--) {
      const o = l[i];
      /* s est mesure DEPUIS LE BOUT de la branche. Le bout avance de v x dt,
         donc un organite immobile dans le monde voit son s croitre d'autant ;
         le flux le ramene vers l'apex. La somme des deux est ce que l'oeil
         percoit, et c'est pour cela qu'un apex rapide semble ASPIRER son
         cytoplasme : a 40 px/s la difference change de signe. */
      o.s += (vive ? v : 0) * dt - flux * o.flux * dt;
      /* Ballottement lateral : le cytoplasme est mou, les organites se
         bousculent. Amplitude bornee a 0,72 du rayon pour qu'aucun ne chevauche
         la paroi — un organite qui mord sur la paroi casse la lecture du tube
         comme objet rigide. */
      o.ph += dt * o.w;
      o.off = clamp(o.off0 + Math.sin(o.ph) * 0.17, -0.72, 0.72);
      /* Les vacuoles grossissent avec l'age du compartiment, et c'est ce qui
         donne au tube son sens de lecture sans aucune fleche. */
      if (o.type === 'vacuole') o.r = lerp(o.r0, o.r0 * 2.3, clamp((o.s - 52) / 320, 0, 1));

      if (o.s < 4.5) {
        if (o.type === 'vesicule') {
          /* Exocytose : la vesicule fusionne et devient de la paroi. */
          this.flashs.push({ off: o.off, t: 0.16 });
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
        type: t.id, s,
        r0: lerp(t.r[0], t.r[1], this.rng()),
        r: lerp(t.r[0], t.r[1], this.rng()),
        off0: (this.rng() * 2 - 1) * 0.62,
        off: 0, ph: this.rng() * TAU, w: lerp(1.1, 2.9, this.rng()),
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

  oublier(id) { this.parBranche.delete(id); }
}
