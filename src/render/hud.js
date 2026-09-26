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
  const y0 = H - 28;
  bande(scr, 0, y0, W, 28, 0.74);

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

  /* Apex : un pastille par apex, la pleine est le pilote. Le nombre de vies. */
  drawText(scr, 'APEX', 100, y0 + 3, UI.textDim);
  for (let i = 0; i < e.apexMax; i++) {
    const vif = i < e.apex;
    const px = 122 + i * 6;
    if (vif) { scr.direct(px, y0 + 4, UI.paroi); scr.direct(px + 1, y0 + 4, UI.paroi); scr.direct(px, y0 + 5, UI.paroi); scr.direct(px + 1, y0 + 5, UI.paroi); }
    else { scr.direct(px, y0 + 4, UI.textDim); scr.direct(px + 1, y0 + 5, UI.textDim); }
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

/** Ecran de fin, dessine par-dessus le champ fige. */
export function fin(scr, g) {
  const e = g.etatLisible();
  const W = scr.w, H = scr.h;
  bande(scr, 0, (H >> 1) - 46, W, 92, 0.88);
  const gagne = e.etat === 'sporule';
  drawTextCentered(scr, gagne ? 'SPORULATION' : 'THALLE MORT', W >> 1, (H >> 1) - 40,
    gagne ? UI.spore : UI.alerte, 1, 2);
  drawTextCentered(scr, (e.cause || '').toUpperCase().slice(0, 28), W >> 1, (H >> 1) - 24, UI.textDim);
  drawTextCentered(scr, 'LONGUEUR ' + e.longueur + ' UM', W >> 1, (H >> 1) - 12, UI.text);
  drawTextCentered(scr, 'THALLE ' + Math.round(e.aire / 1000) + 'K UM2', W >> 1, (H >> 1) - 4, UI.text);
  drawTextCentered(scr, 'PROFONDEUR ' + e.avance + ' UM', W >> 1, (H >> 1) + 4, UI.text);
  drawTextCentered(scr, 'NOEUDS ' + e.noeuds + '   RATES ' + e.rates, W >> 1, (H >> 1) + 12, UI.textDim);
  drawTextCentered(scr, String(g.spores) + ' SPORES ' + (gagne ? 'ENCAISSEES' : 'SAUVEES'),
    W >> 1, (H >> 1) + 24, UI.spore);
  drawTextCentered(scr, 'ESPACE POUR RESEMER', W >> 1, (H >> 1) + 36, UI.textHot);
}

export { RARETE_COLOR };
