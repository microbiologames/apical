/* ---------------------------------------------------------------------------
   Le thalle vu de loin.

   Meme banc optique que l'apex — meme `Screen`, memes calques de profondeur,
   meme tramage, meme grain de capteur, memes palettes. C'est voulu : on
   change de grossissement, pas d'instrument. D'ou l'heritage de `Scene`,
   qui apporte le cadrage, le vignetage, le grain et le texte.

   Ce qui change, c'est l'echelle. A 7 mm de colonie dans 400 px, une hyphe
   de 11 um fait 0,6 pixel : on ne dessine plus un tube avec sa paroi et sa
   membrane, on dessine une LIGNE. Toute la geometrie fine de `Hyphe` serait
   invisible, et c'est exactement ce que dit la regle des deux echelles.

   Le substrat consomme est dessine, parce que c'est le plateau de jeu : les
   zones riches sont claires, celles que le mycelium a epuisees s'assombrissent
   derriere lui. Sans ca on voit un dessin de reseau, pas une colonie qui
   mange.
--------------------------------------------------------------------------- */

import { Scene } from './scene.js';
import { MAILLE_DENS, DENS_SAT } from '../sim/thalle.js';
import { hexToRgba, mix32, fade32, shade32 } from '../core/pixel.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

export class VueThalle extends Scene {
  /**
   * @param {Thalle} th
   * @param {object} pal  une des PALETTES
   * @param {number} t    secondes reelles, pour le grain de capteur
   */
  dessiner(th, pal, t, opts = {}) {
    const sc = this.sc;
    this.alloc(sc.w, sc.h);
    const P = pal;
    sc.beginFrame(hexToRgba(P.fond));

    this.substrat(th, P, opts);
    this.mycelium(th, P, opts);
    /* UN CALQUE EST UN FILTRE, DONC IL EST DANS LE TRAJET OPTIQUE : il passe
       avant la composition des calques de profondeur et avant le grain de
       capteur. Pose sur l'image finie, on lirait une peinture par-dessus la
       photo — et le grain se retrouverait dessous, ce qui n'a aucun sens.
       Hors du jeu personne ne passe ce crochet et rien ne change. */
    opts.calque?.();

    sc.composite(P.dither);
    if (opts.grain !== false) this.grainCapteur(P, t);
    if (opts.echelle !== false) this.barreEchelle(P);
  }

  /**
   * Le milieu : la matrice nutritive, et ce que le mycelium en a deja pris.
   *
   * Echantillonne par blocs de 2x2 px. La matrice est deux octaves de fbm —
   * l'evaluer par pixel coutait 5 ms sur un cadre de 130 kpx, et elle varie
   * sur 250 um, soit des dizaines de pixels a ce grossissement.
   */
  substrat(th, P, opts) {
    const sc = this.sc, w = this.w, h = this.h;
    const c0 = hexToRgba(P.fond), c1 = hexToRgba(P.fondBord);
    const cEp = hexToRgba(P.cytoBord);
    const inv = 1 / this.pxUm;
    const ox = this.cam.x - (w * 0.5) * inv, oy = this.cam.y - (h * 0.5) * inv;
    const vg = this.vign;
    /* Blocs de 2x2 px. A 3, le pas d'echantillonnage battait avec la maille
       de 60 um du substrat et rendait des carres nets — on lisait la grille,
       pas le milieu. */
    const B = 2;
    const nx = Math.ceil(w / B) + 1;
    let cache = this._sub;
    if (!cache || cache.length !== nx * 2) cache = this._sub = new Float32Array(nx * 2);

    for (let y = 0; y < h; y++) {
      const row = y * w;
      if (y % B === 0) {
        const wy = oy + y * inv;
        for (let i = 0; i < nx; i++) {
          const wx = ox + i * B * inv;
          cache[i] = th.matrice(wx, wy);
          cache[nx + i] = clamp(this.densLisse(th, wx, wy) / DENS_SAT, 0, 1);
        }
      }
      for (let x = 0; x < w; x++) {
        const i = (x / B) | 0;
        /* Riche = clair. L'ecart est volontairement discret (0,22) : la
           matrice est un fond de lecture, pas une carte de chaleur. */
        let c = mix32(c1, c0, smoothstep(0.35, 1.25, cache[i]));
        c = shade32(c, (cache[i] - 0.8) * 0.22);
        const ep = cache[nx + i];
        if (ep > 0.02) c = mix32(c, cEp, ep * 0.55);
        c = mix32(c, c1, vg[row + x]);
        sc.px[row + x] = c | 0xff000000;
      }
    }
  }

  /**
   * Densite interpolee entre les quatre cellules voisines.
   *
   * La simulation, elle, lit la cellule telle quelle — c'est sa maille, et
   * une pointe n'a pas besoin de mieux. Mais au rendu, la grille de 60 um se
   * voyait comme un DAMIER de carres nets des qu'on zoomait sur le front :
   * on lisait une structure de donnees, pas un substrat.
   */
  densLisse(th, x, y) {
    const m = MAILLE_DENS;
    const u = x / m - 0.5, v = y / m - 0.5;
    const i = Math.floor(u), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const d = (a, b) => th.densite((a + 0.5) * m, (b + 0.5) * m);
    return lerp(lerp(d(i, j), d(i + 1, j), fu),
                lerp(d(i, j + 1), d(i + 1, j + 1), fu), fv);
  }

  /**
   * Le mycelium. Une hyphe est un trait : a ce grossissement elle fait moins
   * d'un pixel de large, et lui dessiner une paroi serait un mensonge de
   * trois pixels.
   *
   * Deux passes sur deux calques : un halo floute, puis le trait net. C'est
   * la meme lecture « contraste de phase » que sur l'apex, obtenue par le
   * meme mecanisme — le flou par calque de `Screen`.
   */
  mycelium(th, P, opts) {
    /* Largeur apparente d'une hyphe, en pixels. C'est elle qui decide du
       mode de rendu — et il en faut DEUX, pour une raison qui n'est pas
       esthetique. */
    const large = 11 * this.pxUm;
    if (large < 1.1) this.myceliumLoin(th, P, large);
    else this.myceliumPres(th, P, opts, large);
  }

  /**
   * Vu de loin : on rend la COUVERTURE, pas des traits.
   *
   * A 48 um par pixel, une hyphe fait un vingtieme de pixel et 590 mm de
   * mycelium tombent sur 12 000 px dans un disque de 17 600. Empiles en
   * src-over, meme a faible opacite, ces traits saturent : dix passages sur
   * le meme pixel donnent 1 - (1-a)^10, et la colonie devient un disque
   * BLANC uniforme ou on ne lit plus rien. Baisser l'opacite ne corrige pas
   * ca, ca ne fait que deplacer le seuil.
   *
   * On accumule donc la SURFACE reellement occupee : longueur du troncon x
   * 11 um de large, rapportee a l'aire d'un pixel. L'opacite en est tiree
   * une seule fois, a la fin. C'est exact, ca ne peut pas saturer, et ca
   * redonne ce qu'on veut voir : un centre dense, un front clairseme.
   */
  myceliumLoin(th, P, large) {
    const sc = this.sc, w = this.w, h = this.h;
    const couv = this._couv && this._couv.length === w * h
      ? this._couv : (this._couv = new Float32Array(w * h));
    couv.fill(0);
    const marge = 4;
    /* Surface d'hyphe par um de longueur, rapportee a l'aire d'un pixel. */
    const parUm = 11 * this.pxUm * this.pxUm;

    for (const ax of th.axes) {
      const bx0 = this.sx(ax.x0) - marge, bx1 = this.sx(ax.x1) + marge;
      const by0 = this.sy(ax.y0) - marge, by1 = this.sy(ax.y1) + marge;
      if (bx1 < 0 || by1 < 0 || bx0 > w || by0 > h) continue;

      let px = this.sx(ax.xs[0]), py = this.sy(ax.ys[0]);
      let wx = ax.xs[0], wy = ax.ys[0];
      for (let i = 1; i < ax.n; i++) {
        const qx = this.sx(ax.xs[i]), qy = this.sy(ax.ys[i]);
        const ux = ax.xs[i], uy = ax.ys[i];
        const lu = Math.hypot(ux - wx, uy - wy);          // um
        const dx = qx - px, dy = qy - py;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
        const part = (lu / n) * parUm;
        for (let k = 0; k < n; k++) {
          const x = (px + dx * (k / n)) | 0, y = (py + dy * (k / n)) | 0;
          if (x >= 0 && y >= 0 && x < w && y < h) couv[y * w + x] += part;
        }
        px = qx; py = qy; wx = ux; wy = uy;
      }
    }

    /* Calque 0 : le NET. Les calques avant vont de 0 a 3 par flou
       CROISSANT — le 3 a 4 px de rayon et un gain de 4,2, et tout y passait
       par erreur : les hyphes sortaient cinq fois trop epaisses et la
       colonie se remplissait de blanc. */
    sc.layer(0);
    const cP = hexToRgba(P.paroi);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const c = couv[row + x];
        if (c < 0.004) continue;
        /* Gain de 1,9, et c'est une exageration assumee — la meme famille
           que les vesicules grossies x6 ou le periplasme x20. A couverture
           exacte, 15 % de substrat occupe donnent 15 % d'opacite d'un blanc
           sur un gris clair : la colonie est juste, et on ne la voit pas.
           Le gain ne change pas la FORME, seulement le contraste. */
        sc.plot(x, y, fade32(cP, 1 - Math.exp(-c * 1.9)));
      }
    }
  }

  /**
   * Vu de pres : des traits, avec leur halo. Au-dela d'un pixel de large,
   * les hyphes sont separees et l'empilement n'est plus un probleme — c'est
   * la meme lecture « contraste de phase » que sur l'apex, obtenue par le
   * meme mecanisme, le flou par calque de `Screen`.
   */
  myceliumPres(th, P, opts, large) {
    const sc = this.sc, w = this.w, h = this.h;
    const cH = hexToRgba(P.halo), cP = hexToRgba(P.paroi);
    const marge = 8;
    const halo = opts.halo === false ? 0 : P.haloForce * clamp(large - 1, 0, 1);

    for (let passe = 0; passe < 2; passe++) {
      if (passe === 0 && halo <= 0) continue;
      /* Le halo sur un calque legerement flou (2), le trait sur le net (0).
         Pas le 3 : c'est le plus flou des calques avant. */
      sc.layer(passe === 0 ? 2 : 0);
      const c = passe === 0 ? fade32(cH, halo * 0.55) : cP;

      for (const ax of th.axes) {
        /* Rejet par boite : une colonie de 4 h porte 1 700 polylignes, la
           plupart hors cadre des qu'on zoome. */
        const bx0 = this.sx(ax.x0) - marge, bx1 = this.sx(ax.x1) + marge;
        const by0 = this.sy(ax.y0) - marge, by1 = this.sy(ax.y1) + marge;
        if (bx1 < 0 || by1 < 0 || bx0 > w || by0 > h) continue;

        let px = this.sx(ax.xs[0]), py = this.sy(ax.ys[0]);
        for (let i = 1; i < ax.n; i++) {
          const qx = this.sx(ax.xs[i]), qy = this.sy(ax.ys[i]);
          if (!((px < -2 && qx < -2) || (py < -2 && qy < -2)
             || (px > w + 2 && qx > w + 2) || (py > h + 2 && qy > h + 2))) {
            sc.line(px, py, qx, qy, c);
          }
          px = qx; py = qy;
        }
      }
    }

    /* Les pointes vivantes : c'est la que la colonie se passe. Un point un
       peu plus clair, pas un marqueur — on ne dessine pas de curseur sur une
       preparation. */
    sc.layer(0);
    const cT = hexToRgba(P.paroiFraiche);
    for (const p of th.pointes) {
      if (!p.vive) continue;
      const x = this.sx(p.x), y = this.sy(p.y);
      if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
      sc.dot(x, y, 1.2, fade32(cT, 0.75));
    }
  }

  /**
   * Barre d'echelle en millimetres : a ce grossissement, 10 um font un
   * vingtieme de pixel. On choisit le plus grand rond qui tienne dans un
   * tiers du cadre.
   */
  barreEchelle(P) {
    const sc = this.sc;
    const max = (this.w * 0.33) / this.pxUm;     // um disponibles
    const choix = [100, 200, 500, 1000, 2000, 5000, 10000];
    let um = choix[0];
    for (const v of choix) if (v <= max) um = v;
    const L = Math.round(um * this.pxUm);
    if (L < 12) return;
    const x = this.w - L - 10, y = this.h - 12;
    const c = hexToRgba(P.paroi);
    for (let i = 0; i < L; i++) { sc.direct(x + i, y, c); sc.direct(x + i, y + 1, c); }
    const txt = um >= 1000 ? `${um / 1000} mm` : `${um} um`;
    this.texte(txt, x + L - txt.length * 5, y - 8, c);
  }
}
