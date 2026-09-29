/* ---------------------------------------------------------------------------
   La germination, vue au microscope.

   Il n'y a presque rien ici, et c'est voulu : la spore est une tige de plus
   dans la liste que `Scene.dessiner` recoit deja. Sa silhouette, son
   remplissage, sa paroi, son halo et le conge au pied du tube germinatif
   sortent du MEME champ de distance que ceux de l'hyphe. Une spore peinte
   a part par-dessus un tube, ce serait la regle 1 refaite une fois de plus.

   Ce fichier n'ajoute donc qu'une chose : le CONTENU du corps. Il ne vit pas
   en coordonnees de tube (s, v) — une spore n'a pas d'axe — mais en polaire
   normalise, ce qui est exactement ce qu'il faut pour un gonflement
   isodiametrique : on ne deplace rien, c'est le corps qui s'etire sous le
   contenu.

   Le vocabulaire est celui du cytoplasme apical, terme pour terme : memes
   `dot` pour les grains, meme `cap` pour les mitochondries, meme
   `ell` + `disc` pour le noyau et son nucleole, meme identite de couleur
   pour les vesicules — lumen de periplasme, liseré de membrane. Deux
   vocabulaires pour le meme organisme a deux moments de sa vie, et on ne
   lit plus le meme organisme.
--------------------------------------------------------------------------- */

import { Scene } from './scene.js';
import { hexToRgba, fade32, mix32, Screen } from '../core/pixel.js';
import { clamp, lerp, TAU } from '../core/util.js';

export class VueGermination extends Scene {
  constructor(screen) {
    super(screen);
    /* CONGE PLUS SERRE QU'ENTRE DEUX HYPHES. 2,5 um est la valeur mesuree
       pour une branche sur sa mere — deux tubes de 5,5 um de rayon. Ici on
       raccorde un tube de 2 um a une spore de 6,6 : a 2,5 les deux
       evasements se rejoignaient par les flancs du corps, qui sortait en
       citron avec un angle net a neuf heures. 0,9 um donne le col concave
       sans toucher au reste du contour, et reste sous les 2,26 um de jeu
       mesures entre l'amorce du bourgeon et la paroi du corps — un conge
       ponte tout ecart inferieur a deux fois son rayon. */
    this.kConge = 0.9;
  }

  /**
   * @param {Germination} germ
   */
  dessiner(germ, pal, t, opts = {}) {
    super.dessiner(germ.tiges, pal, t, {
      ...opts,
      arriere: opts.vol ? (sc, P) => this.decorVol(P, t, opts.vol) : undefined,
      corps: (sc, P) => this.interieur(germ, P, opts),
    });
  }

  /**
   * LE VOL. Une spore emportee ne voit plus un substrat : elle voit passer
   * des masses. On ne simule rien — ce sont des disques sur les calques les
   * plus flous, qui defilent a des vitesses differentes selon leur
   * profondeur. C'est la parallaxe qui dit « ca va vite », pas le flou.
   *
   * `etat` porte `v` (la vitesse de defilement, 0 a 1) et `dir` (la
   * direction). A l'atterrissage `v` retombe a zero et le substrat, qui
   * n'a jamais cesse d'etre dessine derriere, redevient net tout seul.
   */
  decorVol(P, t, etat) {
    const sc = this.sc;
    /* 78 masses, et non 46 : a 46 le champ se vidait par plaques et on
       lisait des taches posees, pas un defilement. */
    const n = 78;
    const cs = [hexToRgba(P.milieuGrain), hexToRgba(P.milieuDebris),
                hexToRgba(P.fondBord), hexToRgba(P.grainClair)];
    const dx = Math.cos(etat.dir), dy = Math.sin(etat.dir);
    const W = this.w, H = this.h;
    const diag = Math.hypot(W, H);
    for (let i = 0; i < n; i++) {
      /* Trois plans de profondeur, donc trois vitesses. Le plus proche va
         six fois plus vite que le plus lointain : en dessous de trois, on
         lit un papier peint qui glisse. */
      const p = i % 3;
      const vit = (0.26 + p * 0.42) * etat.v;
      const ph = (i * 0.6180339887) % 1;
      /* La phase avance avec le temps et se replie : chaque masse ressort
         par le bord oppose sans qu'on ait rien a gerer. */
      const u = ((ph + etat.parcours * vit) % 1 + 1) % 1;
      const s = (u - 0.5) * diag * 2.2;
      /* Ecart lateral pseudo-aleatoire, fige par l'indice. */
      const lat = ((((i * 2654435761) >>> 0) / 4294967296) - 0.5) * diag * 1.35;
      const x = W * 0.5 + dx * s - dy * lat;
      const y = H * 0.5 + dy * s + dx * lat;
      const r = (6 + p * 16 + (i % 7) * 4) * (0.6 + 0.4 * etat.v);
      if (x < -r * 2 || y < -r * 2 || x > W + r * 2 || y > H + r * 2) continue;
      sc.layer(Screen.layerFor(1, p === 0 ? 2 : 3));
      sc.disc(x, y, r, fade32(cs[i & 3], (0.10 + 0.13 * p) * etat.v));
    }
  }

  /**
   * Le contenu de la spore. Tout passe par `Spore.pos`, qui rend la
   * position monde depuis les polaires normalisees : c'est le seul endroit
   * ou le gonflement est pris en compte, et il n'y en a qu'un.
   */
  interieur(germ, P, opts) {
    const sc = this.sc, sp = germ.spore;
    const K = this.pxUm;
    const pt = this._gpt || (this._gpt = { x: 0, y: 0 });
    /* Rayon de reference pour les tailles : le rayon COURANT du corps. Un
       grain defini en fraction du rayon grossit donc avec la spore — c'est
       ce que fait un cytoplasme qu'on dilue, et l'inverse (des grains de
       taille fixe dans un corps qui gonfle) se lit comme un zoom rate. */
    const R = sp.r;

    if (opts.granulation !== false) {
      const cc = hexToRgba(P.grainClair), cs = hexToRgba(P.grainSombre);
      for (const g of sp.grains) {
        sp.pos(g, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -4 || y < -4 || x > this.w + 4 || y > this.h + 4) continue;
        const pl = this.plan(g.z);
        sc.layer(pl.idx);
        sc.dot(x, y, g.rr * R * K, fade32(g.clair ? cc : cs, 0.82 - pl.dz * 0.22));
      }
    }

    if (opts.organites !== false) {
      for (const o of sp.organites) {
        if (o.rr <= 0.002) continue;
        sp.pos(o, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue;
        const pl = this.plan(o.z, 1);
        sc.layer(pl.idx);
        const r = o.rr * R * K;
        if (o.t === 'noyau') {
          sc.ell(x, y, r, r * 0.84, o.ang, fade32(hexToRgba(P.noyau), 0.42));
          sc.disc(x, y, r * 0.36, fade32(hexToRgba(P.nucleole), 0.34));
        } else if (o.t === 'mito') {
          sc.cap(x, y, r * 2.2, Math.max(r * 0.66, 1.1), o.ang, fade32(hexToRgba(P.mito), 0.62));
        } else if (o.t === 'vacuole') {
          sc.disc(x, y, r, fade32(hexToRgba(P.vacuole), 0.8), fade32(hexToRgba(P.grainClair), 0.35));
        } else {
          /* LE GLOBULE LIPIDIQUE, et c'est lui la piece a voir : une spore
             dormante en contraste de phase est un corps sombre avec trois
             ou quatre taches REFRINGENTES dedans. Bord sombre, coeur
             lumineux — une bille dans une bille. En aplat clair on lit une
             bulle de montage, pas une reserve. */
          sc.disc(x, y, r, fade32(hexToRgba(P.vacuole), 0.86),
                  fade32(hexToRgba(P.grainSombre), 0.42));
          sc.dot(x - r * 0.26, y - r * 0.30, r * 0.40,
                 fade32(hexToRgba(P.milieuClair), 0.46));
        }
      }
    }

    /* LES VESICULES DE POLARISATION. Elles se rassemblent AVANT qu'il y ait
       un tube : c'est un Spitzenkorper qui se forme dans le cytoplasme de
       la spore, comme celui d'une branche se forme dans celui de sa mere.
       Meme identite de couleur qu'a l'apex — le lumen EST du periplasme,
       le liseré EST de la membrane — parce que ce sont les memes objets. */
    if (opts.vesicules !== false) {
      const cLum = hexToRgba(P.periplasme), cMb = hexToRgba(P.membrane);
      for (const v of sp.ves) {
        sp.pos(v, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -8 || y < -8 || x > this.w + 8 || y > this.h + 8) continue;
        const pl = this.plan(v.z);
        sc.layer(pl.idx);
        const r = v.rr * R * K;
        const af = 0.94 - pl.dz * 0.14;
        sc.dot(x, y, r, fade32(cLum, af));
        if (r > 2.6) sc.arcE(x, y, r - 0.4, r - 0.4, 0, fade32(cMb, af * 0.9), 0, TAU);
      }
    }
  }
}
