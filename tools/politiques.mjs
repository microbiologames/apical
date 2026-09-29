/* LES POLITIQUES DE BANC : quatre facons de jouer la meme colonie, dont une
   qui ne joue pas. Elles ne lisent que ce que `Jeu.vue()` rend — la carte
   quand on est en haut, une seule pointe quand on est descendu. Une
   politique qui lirait l'etat complet a tout instant ne mesurerait pas un
   joueur, elle mesurerait un oracle, et les verdicts 19 a 21 ne voudraient
   plus rien dire.

   CHAQUE POLITIQUE EST UNE FABRIQUE, et elle prend la graine. Elles tiraient
   au sort avec Math.random : deux mesures de la MEME politique sur les memes
   graines donnaient 1,50 et 1,88 spores, et on ne pouvait pas distinguer un
   reglage d'un coup de des. Un verdict qui ne se reproduit pas ne mesure
   rien.

   `frontal` est la politique VOLONTAIREMENT MAUVAISE : elle fait tout comme
   l'active mais place son sporocyste du mauvais cote. Si elle fait aussi
   bien, c'est que l'emplacement ne compte pas, et le jeu n'existe pas. */
import { mulberry32 } from '../src/core/util.js';
import { CONFORT, T_MAX, V_FRONT } from '../src/sim/jeu.js';

/* Temps de remplissage a prevoir. C'est une ESTIMATION DE JOUEUR, pas une
   lecture du modele : on ne connait pas le debit futur, on a juste appris
   qu'un sporocyste met une vingtaine de minutes quand tout va bien. */
const ATTENDU = 1500;

/* Combien de secondes le front laisse-t-il a ce noeud ? */
const sursis = (t, v) => (t.porteur.x - v.front) / V_FRONT;

/* On choisit sur le NOEUD PORTEUR : c'est lui qui portera le
   sporangiophore, et c'est lui que le front tuera. La pointe, elle, est six
   noeuds plus loin. */
function loinDuFront(v) {
  let best = null, bs = -1;
  for (const t of v.tetes) {
    if (!t.porteur) continue;
    const s = (t.porteur.x - v.front) + t.porteur.res * 3;
    if (s > bs) { bs = s; best = t; }
  }
  return best;
}
/* LA BONNE LECTURE : on pose le sporangiophore ou le reseau tient de quoi le
   remplir, a condition que le front laisse le temps. Choisir la pointe la
   plus eloignee du front revenait a choisir une jeune branche, dont le
   porteur est pose sur du mycelium mince — 11 sporocystes aboutis sur 44. */
function surLeGras(v) {
  let best = null, bs = -1;
  for (const t of v.tetes) {
    if (!t.porteur) continue;
    if (sursis(t, v) < ATTENDU) continue;
    if (menacee(v, t.porteur)) continue;
    if (t.porteur.local > bs) { bs = t.porteur.local; best = t; }
  }
  return best;
}

/* Une menace s'etend a 0,35 um/s : ce qui est a moins de ca de marge
   pendant le remplissage y sera passe avant la fin. */
function menacee(v, q) {
  for (const m of v.menaces) {
    if (Math.hypot(q.x - m.x, q.y - m.y) < m.r + 0.35 * ATTENDU) return true;
  }
  return false;
}
function presDuFront(v) {
  let best = null, bs = Infinity;
  for (const t of v.tetes) {
    if (!t.porteur) continue;
    const s = t.porteur.x - v.front;
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}
/* En dessous, la colonie ne produit pas le surplus qui remplirait un
   sporocyste : mesure, a onze pointes il arrive 2,1 u/s et le sporangiophore
   n'aboutit jamais. */
const POINTES_MIN = 25;

/* Ce qu'on fait UNE FOIS DESCENDU, et c'est le meme geste pour tout le
   monde : conduire vers le riche, ramifier quand on a de quoi et qu'il y a
   quelque chose devant. */
function travailler(j, v, rng) {
  const p = v.pointe;
  if (!p.vive) { j.tenir(null); return; }
  j.conduire(p.th + Math.max(-0.8, Math.min(0.8, (v.droite - v.gauche) * 0.0015)));
  if (v.reserve > CONFORT && v.devant > 700) j.ramifier(v.gauche > v.droite ? -1 : 1);
  return rng() < 0.4;
}

function fabrique(choisir) {
  return (graine) => {
    const rng = mulberry32((graine ^ 0x5bf03635) >>> 0);
    return (j, v) => {
      if (v.ou === 'macro') {
        if (!v.tetes.length) return;
        /* 1. Fructifier : quand la colonie produit assez de surplus, qu'il
              n'y a pas de sporocyste en cours, que le front laisse le temps
              et que la partie ne finit pas avant. */
        if (!v.sporocyste && v.vives >= POINTES_MIN) {
          const c = choisir(v);
          if (c && sursis(c, v) > ATTENDU && v.t + ATTENDU < T_MAX) {
            j.tenir(c.p); j.sporuler(); j.tenir(null); return;
          }
        }
        /* 2. Sinon on descend travailler une pointe qui a un avenir : loin du
              front ET hors des zones hostiles. On ne voit plus rien de tout
              ca une fois descendu. */
        let c = null, bs = -1;
        for (const t of v.tetes) {
          if (t.porteur && menacee(v, t.porteur)) continue;
          if (menacee(v, t.p)) continue;
          const sc = t.p.x - v.front;
          if (sc > bs) { bs = sc; c = t; }
        }
        if (c) j.tenir(c.p); else { const d = loinDuFront(v); if (d) j.tenir(d.p); }
        return;
      }
      if (travailler(j, v, rng)) j.tenir(null);
    };
  };
}

export const passive = () => () => {};
export const active = fabrique(surLeGras);
export const frontal = fabrique(presDuFront);

/**
 * COLLEE : on ne remonte jamais. Meme travail sur la pointe, meme regle de
 * sporulation — mais on ne voit jamais le front, donc on ne peut ni choisir
 * l'emplacement ni choisir l'instant. C'est le verdict 20.
 */
export const collee = (graine) => {
  const rng = mulberry32((graine ^ 0x2545f491) >>> 0);
  return (j) => {
    if (!j.tenue) {
      const m = j.vue();
      if (m.ou === 'macro' && m.tetes.length) j.tenir(m.tetes[(rng() * m.tetes.length) | 0].p);
      return;
    }
    const w = j.vue();
    if (!w.pointe.vive) { j.tenir(null); return; }
    /* Elle sporule au jugé : elle ne voit ni le front ni le nombre de
       pointes, seulement sa pointe et sa montre. */
    if (!w.sporocyste && w.t > 3600) j.sporuler();
    travailler(j, w, rng);
  };
};
