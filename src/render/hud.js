/* ---------------------------------------------------------------------------
   HUD.

   REGLE : LE HUD NE DIT QUE CE QUE LE CHAMP NE PEUT PAS DIRE.
   Le turgor se lit deja au decollement du protoplaste, le flux vesiculaire a la
   brillance du Spitzenkorper, l'epaisseur de paroi a la paroi elle-meme, le
   sucre du milieu aux granulations du fond. Tout cela est HORS du HUD, et c'est
   volontaire : une jauge qui double une information deja visible apprend au
   joueur a ne plus regarder le champ, et le champ est le jeu.

   Restent quatre choses que l'image ne peut pas porter :
     - des VALEURS a comparer d'une manche a l'autre (longueur, spores) ;
     - l'etat du milieu SOUS l'apex en chiffres (aw, temperature) parce que la
       decision d'entrer dans une zone seche se prend au dixieme d'aw ;
     - la charge d'antifongique, qui est interne et n'a aucun signe visible ;
     - le nombre d'apex restants, c'est-a-dire le nombre de vies.

   Les deux barres d'eau et de sucre restent malgre la regle, pour une seule
   raison : elles portent la DERIVEE. Voir que le sucre descend est une
   information que l'epaisseur de paroi ne donne qu'une seconde plus tard.
--------------------------------------------------------------------------- */

import { clamp } from '../core/util.js';
import { fade32, mix32 } from '../core/pixel.js';
import { UI, RARETE_COLOR } from '../data/palette.js';
import { drawText, drawTextCentered, drawTextRight } from '../core/font.js';
import { E_CRIT } from '../game/apex.js';

/** Bandeau de fond : indispensable, la fonte 3x5 est illisible sur un decor. */
function bande(scr, x, y, w, h, a = 0.72) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) scr.direct(x + i, y + j, fade32(0xff000000 | 0x00060403, a));
  }
}

function jauge(scr, x, y, w, v, col, colDim, seuil = -1) {
  for (let i = 0; i < w; i++) {
    const u = i / w;
    scr.direct(x + i, y, u < v ? col : colDim);
    scr.direct(x + i, y + 1, u < v ? col : colDim);
  }
  if (seuil >= 0 && seuil <= 1) {
    /* Le repere de seuil est ce qui transforme une barre en decision : sous le
       seuil de fluage on n'avance plus du tout, et il faut le voir venir. */
    scr.direct(x + (w * seuil) | 0, y - 1, UI.textHot);
  }
}

export function hud(scr, g, cmd) {
  const e = g.etatLisible();
  const W = scr.w, H = scr.h;

  /* --- bandeau haut : le milieu -------------------------------------- */
  bande(scr, 0, 0, W, 9, 0.66);
  drawText(scr, e.substrat.toUpperCase().slice(0, 13), 2, 2, UI.text);
  let x = 2 + 58;
  if (e.boucle > 0) { drawText(scr, 'x' + (e.boucle + 1), x, 2, UI.textHot); x += 12; }
  /* aw : trois decimales, parce que 0,88 et 0,86 ne sont pas le meme jeu. */
  const awSec = e.aw < g.stats.awMin + 0.02;
  drawText(scr, 'AW' + String(Math.round(e.aw * 100)).padStart(2, '0'), W - 74, 2,
    awSec ? UI.alerte : UI.textDim);
  drawText(scr, String(Math.round(e.temp)) + 'C', W - 44, 2,
    e.temp > 34 || e.temp < 8 ? UI.alerte : UI.textDim);
  drawTextRight(scr, String(e.avance), W - 2, 2, UI.textDim);

  /* --- charge d'antifongique : a droite, verticale -------------------- */
  let cy = 14;
  for (const [k, v] of Object.entries(e.charge)) {
    if (v < 0.02) continue;
    const col = k === 'azole' ? UI.gene : k === 'echino' ? UI.alerte
      : k === 'polyene' ? UI.sucre : UI.spore;
    bande(scr, W - 8, cy, 6, 22, 0.5);
    for (let j = 0; j < 20; j++) {
      const u = 1 - j / 20;
      scr.direct(W - 6, cy + 1 + j, u < v ? col : fade32(col, 0.16));
      scr.direct(W - 5, cy + 1 + j, u < v ? col : fade32(col, 0.16));
    }
    drawText(scr, k[0].toUpperCase(), W - 7, cy + 23, col);
    cy += 32;
  }

  /* --- bandeau bas : les ressources ---------------------------------- */
  const y0 = H - 34;
  bande(scr, 0, y0, W, 34, 0.74);

  /* Eau. Le repere est le SEUIL DE FLUAGE : a gauche de ce trait, l'hyphe est
     a l'arret quoi qu'on fasse. C'est l'information la plus utile du HUD. */
  drawText(scr, 'EAU', 2, y0 + 3, UI.eau);
  jauge(scr, 18, y0 + 4, 74, clamp(e.P / g.stats.pmax, 0, 1), UI.eau, UI.eauDim,
    g.stats.yseuil / g.stats.pmax);

  /* Sucre. */
  drawText(scr, 'SUC', 2, y0 + 10, UI.sucre);
  jauge(scr, 18, y0 + 11, 74, clamp(e.S / 1.4, 0, 1), UI.sucre, UI.sucreDim);

  /* Paroi : l'epaisseur en cours, avec le seuil de lyse. Doubler l'information
     du champ est assume ICI et nulle part ailleurs, parce que la lyse est la
     mort la plus rapide du jeu et qu'elle doit pouvoir s'anticiper au chiffre. */
  const eCol = e.e < E_CRIT ? UI.danger : e.e < E_CRIT * 1.5 ? UI.sucre : UI.paroi;
  drawText(scr, 'PAROI', 2, y0 + 17, UI.textDim);
  jauge(scr, 26, y0 + 18, 66, clamp(e.e / 1.6, 0, 1), eCol, UI.sucreDim, E_CRIT / 1.6);
  if (e.e < E_CRIT) {
    /* Clignotement : une paroi sous le seuil critique est une mort dans deux
       secondes. Rien d'autre dans le HUD n'a le droit de clignoter. */
    if ((performance.now() / 120 | 0) % 2 === 0) {
      drawText(scr, 'LYSE', 96, y0 + 17, UI.danger);
    }
  }

  /* Apex : une pastille par apex. Le nombre de fronts vivants, donc de vies. */
  drawText(scr, 'APEX', 100, y0 + 3, UI.textDim);
  for (let i = 0; i < Math.min(e.apexMax, 8); i++) {
    const vif = i < e.apex;
    const px = 122 + i * 5;
    if (vif) {
      scr.direct(px, y0 + 4, UI.paroi); scr.direct(px + 1, y0 + 4, UI.paroi);
      scr.direct(px, y0 + 5, UI.paroi); scr.direct(px + 1, y0 + 5, UI.paroi);
    } else { scr.direct(px, y0 + 4, UI.textDim); scr.direct(px + 1, y0 + 5, UI.textDim); }
  }

  /* REGIME. C'est le seul reglage de vitesse du jeu et il RESTE ou on l'a mis :
     il lui faut donc un afficheur permanent, sinon le joueur ne sait plus a
     quel cran il roule. Cinq crans, le nom en clair, et le cran 0 en alerte
     parce qu'a l'arret on ne produit plus rien. */
  const rc = e.regime === 0 ? UI.alerte : e.regime >= 3 ? UI.textHot : UI.text;
  drawText(scr, e.regimeNom, 100, y0 + 23, rc);
  for (let i = 0; i < 5; i++) {
    const px = 2 + i * 5;
    const on = i <= e.regime;
    for (let j = 0; j < 4; j++) {
      if (!on && j < 3 - (i * 0)) { /* cran eteint : un seul pixel de rappel */ }
      scr.direct(px, y0 + 25 - j, on && j <= i ? rc : (j === 0 ? UI.textDim : 0));
      scr.direct(px + 1, y0 + 25 - j, on && j <= i ? rc : 0);
    }
  }
  drawText(scr, 'REG', 30, y0 + 23, UI.textDim);

  /* Poche de sel : elle tire l'eau hors de l'hyphe, et rien dans l'image ne dit
     a quelle vitesse. C'est la quatrieme exception a la regle « le champ porte
     l'information » — les cristaux annoncent la poche, ils n'en chiffrent pas
     la violence. */
  if (e.sel > 0.05) {
    drawText(scr, 'SEL', 58, y0 + 23, UI.alerte);
    jauge(scr, 76, y0 + 24, 20, clamp(e.sel, 0, 1), UI.alerte, UI.eauDim);
  }

  /* Bilan de manche. `RATE` n'est pas une punition : c'est le chiffre qui donne
     envie de refaire la manche plus lentement. */
  drawText(scr, 'L' + e.longueur, 100, y0 + 10, UI.text);
  drawText(scr, 'N' + e.noeuds, 100, y0 + 17, UI.spore);
  drawTextRight(scr, 'G' + e.granules, W - 30, y0 + 10, UI.sucre);
  drawTextRight(scr, 'RATE' + e.rates, W - 30, y0 + 17, UI.textDim);
  drawTextRight(scr, String(e.spores) + ' SP', W - 2, y0 + 10, UI.spore);
  drawTextRight(scr, 'ENTREE', W - 2, y0 + 17,
    e.S >= 0.35 ? UI.textHot : UI.textDim);

  /* Germination : les premieres secondes n'appartiennent pas encore au joueur,
     et le dire evite qu'il croie la commande cassee. */
  if (e.germ < 1) {
    drawTextCentered(scr, e.germ <= 0 ? 'IMBIBITION' : 'TUBE GERMINATIF',
      W >> 1, y0 - 12, UI.textHot);
  }

  /* --- messages ------------------------------------------------------ */
  let fy = y0 - 10;
  for (let i = g.flash.length - 1; i >= 0; i--) {
    const f = g.flash[i];
    const col = f.ton === 'mal' ? UI.alerte : f.ton === 'gene' ? UI.gene : UI.spore;
    drawTextCentered(scr, f.txt, W >> 1, fy, fade32(col, clamp(f.t / 0.7, 0, 1)));
    fy -= 8;
  }

  /* --- zones tactiles, seulement sur ecran tactile -------------------- */
  if (cmd && cmd.tactile) {
    const my = H - 56;
    scr.direct(W >> 1, my, fade32(UI.frame, 0.6));
    for (let i = 0; i < 5; i++) scr.direct((W >> 2) + i - 2, my, fade32(UI.textDim, 0.5));
    for (let i = 0; i < 5; i++) scr.direct((W * 3 >> 2), my + i - 2, fade32(UI.textDim, 0.5));
  }
}

/**
 * LA CARTE DU THALLE.
 *
 * C'est le seul moment du jeu ou la camera a le droit de reculer, et c'est pour
 * cela qu'il compte : pendant toute la manche on ne voit qu'un apex dans une
 * fenetre de cent micrometres, sans jamais savoir a quoi ressemble ce qu'on
 * construit. La carte est la recompense de cette cecite — elle montre d'un coup
 * le chemin parcouru, les detours, les impasses, les fronts qu'on a laisses
 * filer et le reseau qu'ils ont dessine.
 *
 * Elle est tracee depuis `thalle.trace`, echantillonnee tous les 4 um et jamais
 * purgee, et non depuis la geometrie de jeu qui, elle, est oubliee derriere la
 * camera. C'est la seule raison d'etre de cette trace.
 */
export function carteThalle(scr, g, x, y, w, h) {
  const tr = g.thalle.trace;
  if (tr.length < 2) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of tr) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  /* Marge de 8 um pour que la spore et les bouts ne touchent pas le cadre. */
  x0 -= 8; x1 += 8; y0 -= 8; y1 += 8;
  const k = Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0));
  const ox = x + (w - (x1 - x0) * k) / 2;
  const oy = y + h - (h - (y1 - y0) * k) / 2;
  const px = (p) => ox + (p.x - x0) * k;
  const py = (p) => oy - (p.y - y0) * k;

  /* Une passe par branche : la trace est interfoliee des qu'il y a plusieurs
     apex, donc deux points consecutifs du tableau n'appartiennent pas au meme
     tube et les relier tracerait des traverses qui n'existent pas. */
  const parBranche = new Map();
  for (const p of tr) {
    let l = parBranche.get(p.b);
    if (!l) { l = []; parBranche.set(p.b, l); }
    l.push(p);
  }
  for (const l of parBranche.values()) {
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i];
      const ax = px(a), ay = py(a), bx = px(b), by = py(b);
      /* Un saut de plus de 14 px sur la carte signale une purge de trace ou un
         changement de compartiment : on ne le relie pas. */
      if (Math.hypot(bx - ax, by - ay) > 14) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let j = 0; j <= n; j++) {
        scr.direct(ax + (bx - ax) * j / n, ay + (by - ay) * j / n, UI.paroi);
      }
    }
  }
  for (const nd of g.thalle.noeuds) {
    const sx = px(nd), sy = py(nd);
    scr.direct(sx, sy, UI.spore); scr.direct(sx + 1, sy, UI.spore);
    scr.direct(sx, sy + 1, UI.spore); scr.direct(sx + 1, sy + 1, UI.spore);
  }
  /* La spore d'origine, pour que la carte ait un DEPART lisible. */
  const s0 = px({ x: 0 }), s1 = py({ y: 0 });
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) scr.direct(s0 + a, s1 + b, UI.textHot);
  return k;
}

/** Ecran de fin : la carte du thalle, puis le bilan chiffre. */
export function fin(scr, g) {
  const e = g.etatLisible();
  const W = scr.w, H = scr.h;
  const gagne = e.etat === 'sporule';
  /* Opacite 0,97 et non 0,90 : a 0,90 le champ de jeu transparaissait sous la
     carte et les deux trames se melangeaient. Le bilan est un ecran, pas une
     surimpression. */
  bande(scr, 0, 0, W, H, 0.97);

  drawTextCentered(scr, gagne ? 'SPORULATION' : 'THALLE MORT', W >> 1, 10,
    gagne ? UI.spore : UI.alerte, 1, 2);
  /* Sur une sporulation, repeter « SPORULATION » sous le titre n'apprend rien :
     on affiche plutot OU l'on s'est arrete, qui est l'information utile. */
  const sous = gagne
    ? e.substrat.toUpperCase() + (e.boucle ? ' x' + (e.boucle + 1) : '')
    : (e.cause || '').toUpperCase().slice(0, 30);
  drawTextCentered(scr, sous, W >> 1, 26, UI.textDim);

  const hCarte = Math.min(Math.round(H * 0.46), H - 120);
  carteThalle(scr, g, 10, 38, W - 20, hCarte);
  /* Cadre : sans lui la carte flotte et on ne sait pas ou elle s'arrete. */
  for (let i = 0; i < W - 20; i += 2) {
    scr.direct(10 + i, 36, UI.frame); scr.direct(10 + i, 38 + hCarte, UI.frame);
  }
  for (let j = 0; j < hCarte + 2; j += 2) {
    scr.direct(10, 36 + j, UI.frame); scr.direct(W - 11, 36 + j, UI.frame);
  }

  let y = 46 + hCarte;
  const ligne = (g1, v1, g2, v2) => {
    drawText(scr, g1, 12, y, UI.textDim);
    drawTextRight(scr, v1, (W >> 1) - 6, y, UI.text);
    drawText(scr, g2, (W >> 1) + 6, y, UI.textDim);
    drawTextRight(scr, v2, W - 12, y, UI.text);
    y += 8;
  };
  ligne('LONGUEUR', e.longueur + ' UM', 'PROFONDEUR', e.avance + ' UM');
  ligne('SURFACE', Math.round(e.aire / 1000) + 'K UM2', 'APEX', String(e.apex) + '/' + e.apexMax);
  ligne('NOEUDS', String(e.noeuds), 'GRANULES', String(e.granules));
  ligne('RATES', String(e.rates), 'GENES', String(Object.keys(g.rangs).length));
  y += 4;
  drawTextCentered(scr, String(g.spores) + ' SPORES ' + (gagne ? 'ENCAISSEES' : 'SAUVEES'),
    W >> 1, y, UI.spore); y += 12;
  drawTextCentered(scr, 'ESPACE POUR RESEMER', W >> 1, y, UI.textHot);
}

export { RARETE_COLOR };
