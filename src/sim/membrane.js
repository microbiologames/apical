/* ---------------------------------------------------------------------------
   La membrane plasmique : UNE ligne, une seule, et elle appartient au
   materiau.

   Le defaut qu'elle corrige : la fusion etait dessinee a une position
   ECRAN. L'apex avancait, la figure d'omega restait sur place, et
   l'evenement n'etait plus « a propos » — il flottait a cote du tube au
   lieu d'etre dedans.

   Ici la membrane est une chaine de noeuds indexes sur le MATERIAU. Chaque
   noeud porte un age `a` : le nombre de micrometres dont l'apex a avance
   depuis que ce noeud etait au pole. Il suffit d'ajouter l'avance a tous
   les ages pour que la ligne entiere glisse du pole vers l'epaule puis vers
   l'arriere, exactement comme la paroi qu'elle double. On ne deplace rien :
   c'est le repere qui derive.

   Une vesicule qui fusionne n'est plus un objet qu'on dessine. Sa membrane
   S'AJOUTE a la ligne : le surplus de longueur fait mollir la ficelle, elle
   se detend vers l'interieur, et le creux qui en resulte EST la figure
   d'omega. Il derive ensuite avec le reste, et la tension le rattrape.

   Le modele est une corde 1D :
       acc = c2.d2(off)/dx2  -  k.(off - cible)  -  b.vitesse
   `off` est le deplacement transverse en um, positif vers l'interieur.
   c = sqrt(TENSION) = 2,1 um/s : la perturbation COURT le long de la ligne
   au lieu d'apparaitre partout a la fois, et c'est ce qui donne la lecture
   « molle ».
--------------------------------------------------------------------------- */

import { clamp, smoothstep } from '../core/util.js';

/* 0,09 um entre deux noeuds, soit ~1,2 px au cadrage par defaut : assez
   serre pour que la ligne n'ait pas de facettes, assez lache pour que les
   deux chaines tiennent en 760 noeuds. */
export const PAS = 0.09;

const TENSION = 1.15;     // (um/s)^2 -> c = 1,07 um/s le long de la ligne
/* Deux regimes, et c'est le coeur du modele.

   PENDANT la fusion, la vesicule est physiquement la : la membrane n'a pas
   le choix de sa forme, on la contraint fort. A 7 /s^2 la tension gagnait
   (longueur de cicatrisation sqrt(4,4/7) = 0,79 um contre 0,45 um de
   largeur d'omega) et le creux etait efface avant d'avoir ete vu : 0,03 um
   au lieu des 0,12 demandes.

   APRES, le surplus de membrane est REEL. Rien ne le ramene a plat : seule
   la tension l'etale le long de la ligne, et l'expansion de la calotte le
   consomme lentement. D'ou un rappel quasi nul et une absorption a 0,22 /s,
   soit une constante de 6,7 s — le temps qu'il faut au creux pour glisser
   visiblement vers l'epaule. A TENSION = 4,4 le creux perdait 75 % de sa
   profondeur en une seconde : il etait etale avant d'avoir derive. */
const RAPPEL_EVT = 110;   // /s^2 pendant l'evenement
const ABSORB = 0.15;      // /s : l'expansion de la calotte consomme le surplus
const AMORT = 4.6;        // /s : elle flue, elle ne vibre pas
const OFF_MIN = -0.05;    // um : elle ne rentre jamais dans la paroi
const OFF_MAX = 1.10;

class Chaine {
  constructor(capacite) {
    this.n = 0;
    this.a = new Float32Array(capacite);
    this.off = new Float32Array(capacite);
    this.vel = new Float32Array(capacite);
    this.cib = new Float32Array(capacite);
  }
}

export class Membrane {
  constructor(hy, sMax) {
    this.hy = hy;
    this.sMax = sMax;
    const cap = Math.ceil(sMax / PAS) + 8;
    /* index 0 = cote -1, index 1 = cote +1 */
    this.ch = [new Chaine(cap), new Chaine(cap)];
    for (const c of this.ch) {
      for (let i = 0; i < cap - 2 && i * PAS <= sMax; i++) { c.a[i] = i * PAS; c.n++; }
    }
  }

  /** Age materiel correspondant a l'abscisse s. Inverse du profil. */
  ageDepuisS(s) {
    const Lc = this.hy.Lc;
    if (s >= Lc) return s;
    const u = clamp((Lc - s) / Lc, -1, 1);
    return Lc * Math.acos(u) / (Math.PI / 2);
  }

  /** Abscisse s d'un noeud d'age a. */
  sDepuisAge(a) {
    const Lc = this.hy.Lc;
    if (a >= Lc) return a;
    return Lc * (1 - Math.cos((a / Lc) * (Math.PI / 2)));
  }

  /**
   * @param {number} da  um avances par l'apex a cette image
   * @param {Array}  evts fusions en cours : {a, cote, r, k}
   */
  maj(dt, da, evts) {
    for (let c = 0; c < 2; c++) {
      const ch = this.ch[c];
      const cote = c === 0 ? -1 : 1;

      /* 1. Derive. Toute la ligne vieillit du meme montant : c'est ce seul
            terme qui fait glisser la membrane et ses creux vers l'arriere. */
      if (da) for (let i = 0; i < ch.n; i++) ch.a[i] += da;

      /* 2. Naissance au pole, mort en sortie de champ. */
      while (ch.n > 0 && ch.a[0] > PAS && ch.n < ch.a.length) {
        ch.a.copyWithin(1, 0, ch.n);
        ch.off.copyWithin(1, 0, ch.n);
        ch.vel.copyWithin(1, 0, ch.n);
        ch.cib.copyWithin(1, 0, ch.n);
        ch.a[0] = 0; ch.off[0] = ch.off[1] * 0.5; ch.vel[0] = 0; ch.cib[0] = 0;
        ch.n++;
      }
      while (ch.n > 1 && ch.a[ch.n - 1] > this.sMax) ch.n--;

      /* 3. Cibles imposees par les fusions en cours. */
      ch.cib.fill(0, 0, ch.n);
      for (const e of evts) {
        if (e.cote !== cote) continue;
        /* Avant l'ouverture du pore la vesicule POUSSE la membrane vers
           l'exterieur ; apres, sa propre membrane s'y est ajoutee et le
           surplus de longueur creuse vers l'interieur. La transition est
           continue : un saut de signe se lisait comme un clignotement. */
        const t = smoothstep(0.17, 0.90, e.k);
        const amp = -0.26 * e.r * (1 - t) + 1.25 * e.r * t;
        const win = e.r * (0.95 + 1.15 * t);
        for (let i = 0; i < ch.n; i++) {
          const d = (ch.a[i] - e.a) / win;
          if (d < -1 || d > 1) continue;
          const b = (1 - d * d) * (1 - d * d);
          if (Math.abs(amp * b) > Math.abs(ch.cib[i])) ch.cib[i] = amp * b;
        }
      }

      /* 4. Corde. */
      const inv2 = 1 / (PAS * PAS);
      const fa = 1 - clamp(ABSORB * dt, 0, 0.5);
      for (let i = 0; i < ch.n; i++) {
        const gm = i > 0 ? ch.off[i - 1] : ch.off[i];
        const gp = i < ch.n - 1 ? ch.off[i + 1] : ch.off[i];
        const lap = (gm + gp - 2 * ch.off[i]) * inv2;
        const rap = ch.cib[i] !== 0 ? RAPPEL_EVT * (ch.off[i] - ch.cib[i]) : 0;
        ch.vel[i] += (TENSION * lap - rap - AMORT * ch.vel[i]) * dt;
      }
      for (let i = 0; i < ch.n; i++) {
        ch.off[i] = clamp((ch.off[i] + ch.vel[i] * dt) * (ch.cib[i] !== 0 ? 1 : fa),
                          OFF_MIN, OFF_MAX);
      }
      /* Les deux chaines se rejoignent au pole : sans cette couture, un
         creux d'un cote laissait une marche a la pointe. */
    }
    const g = this.ch[0], d = this.ch[1];
    if (g.n && d.n) {
      const m = (g.off[0] + d.off[0]) * 0.5;
      g.off[0] = m; d.off[0] = m;
    }
  }
}
