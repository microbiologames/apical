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

/**
 * Geometrie de la figure d'omega, en um, pour une vesicule de rayon r a
 * l'avancement k de la fusion.
 *
 *   hw  demi-largeur de la bouche, le long de la membrane
 *   dep profondeur, vers le cytoplasme
 *
 * A k = 0 la bouche est etroite (0,34 r) et la poche profonde (2,05 r) :
 * c'est la vesicule tout juste ouverte, encore ronde, pendue a un col. A
 * k = 1 la bouche fait 1,89 r et la poche 0,43 r : la membrane de la
 * vesicule s'est etalee dans la membrane plasmique. L'arc qui passe par
 * ces trois points — les deux coins de la bouche et le fond — est
 * RE-ENTRANT tant que dep > hw, et c'est ce qui donne le col.
 */
export function omega(r, k) {
  const e = smoothstep(0, 1, clamp(k, 0, 1));
  return { hw: r * (0.34 + 1.55 * e), dep: r * (2.05 - 1.62 * e) };
}

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
/* 0,75 /s. A 0,15 le surplus s'accumulait : chaque fusion en injecte et
   rien ne le retirait assez vite, si bien qu'au bout d'une minute la ligne
   entiere flottait a 0,6 um de la paroi au lieu de 0,2. L'equilibre est
   maintenant atteint pres de zero, et le creux reste visible ~1,5 s apres
   l'evenement — le temps qu'il faut pour le voir deriver. */
const ABSORB = 0.75;      // /s : l'expansion de la calotte consomme le surplus
const AMORT = 4.6;        // /s : elle flue, elle ne vibre pas
const OFF_MIN = -0.05;    // um : elle ne rentre jamais dans la paroi
const OFF_MAX = 0.60;

class Chaine {
  constructor(capacite) {
    this.n = 0;
    this.a = new Float32Array(capacite);
    this.off = new Float32Array(capacite);
    this.vel = new Float32Array(capacite);
    this.cib = new Float32Array(capacite);
  }
}

/**
 * Regroupe les fusions en cours en ZONES, sur une abscisse SIGNEE
 * `w = cote . age` : negative d'un cote de l'apex, positive de l'autre,
 * nulle au pole. Deux consequences, toutes les deux voulues.
 *
 * 1. Une fusion qui a lieu AU POLE straddle naturellement les deux flancs.
 *    Avec deux chaines independantes, la moitie de son omega manquait, et
 *    le cote retenu dependait du signe d'un ecart lateral quasi nul :
 *    l'ancrage sautait d'un flanc a l'autre d'une image sur l'autre.
 *
 * 2. Deux livraisons voisines sont FUSIONNEES en une seule poche. La ligne
 *    de membrane est une section : elle est univoque, deux omegas au meme
 *    endroit ne peuvent pas y etre tous les deux. Les superposer donnait un
 *    dedoublement qui ne veut rien dire. Une double livraison, c'est une
 *    poche plus large.
 */
export function zonesFusion(ves, duree) {
  const z = [];
  for (const v of ves) {
    if (v.etat !== 1) continue;
    const k = clamp(v.tf / duree, 0, 1);
    const g = omega(v.r, k);
    z.push({ w0: v.cotem * v.am, hw: g.hw, dep: g.dep, k });
  }
  if (z.length < 2) return z;
  z.sort((a, b) => a.w0 - b.w0);
  const out = [z[0]];
  for (let i = 1; i < z.length; i++) {
    const p = out[out.length - 1], c = z[i];
    if (c.w0 - c.hw <= p.w0 + p.hw) {
      const lo = Math.min(p.w0 - p.hw, c.w0 - c.hw);
      const hi = Math.max(p.w0 + p.hw, c.w0 + c.hw);
      p.w0 = (lo + hi) * 0.5;
      p.hw = (hi - lo) * 0.5;
      /* La profondeur ne s'additionne pas : deux vesicules cote a cote
         creusent plus LARGE, pas plus profond. */
      p.dep = Math.max(p.dep, c.dep);
      p.k = Math.max(p.k, c.k);
    } else out.push(c);
  }
  return out;
}


export class Membrane {
  constructor(hy, sMax, capMax) {
    this.hy = hy;
    this.sMax = sMax;
    /* La capacite est dimensionnee sur le MAXIMUM atteignable, pas sur la
       longueur actuelle : une branche demarre a 0,5 um de tube et en fera
       34, et une chaine qu'il faudrait reallouer en cours de route perdrait
       ses offsets — donc ses creux — a chaque agrandissement. */
    const cap = Math.ceil((capMax ?? sMax) / PAS) + 8;
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
   * @param {number} da    um avances par l'apex a cette image
   * @param {Array}  zones fusions regroupees : {w0, hw, dep}
   */
  maj(dt, da, zones) {
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
      for (const e of zones) {
        /* La cible suit EXACTEMENT le profil de l'omega dessine, pour qu'au
           retrait de l'arc, en fin d'evenement, la chaine porte deja la
           meme forme. Sans cette egalite, la ligne sautait a l'instant ou
           la vesicule cessait d'etre un arc pour redevenir des noeuds.
           Comparaison sur l'abscisse SIGNEE : une fusion au pole deborde
           sur les deux flancs. */
        const win = e.hw * 1.25;
        for (let i = 0; i < ch.n; i++) {
          const d = (cote * ch.a[i] - e.w0) / win;
          if (d < -1 || d > 1) continue;
          const b = (1 - d * d) * (1 - d * d);
          if (e.dep * b > ch.cib[i]) ch.cib[i] = e.dep * b;
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
