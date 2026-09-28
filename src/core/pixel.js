/* ---------------------------------------------------------------------------
   Tampon pixel et optique du microscope.

   On ecrit dans un Uint32Array de petite taille (typiquement 256x352) puis on
   agrandit au plus proche voisin : c'est ce qui donne le pixel art. Huit
   calques de profondeur sont floutes separement puis composites dans l'ordre
   optique, ce qui reproduit une profondeur de champ imparfaite.

   Herite de Cell-dungeon. Deux corrections y ont ete faites :
     - le gain apres flou (un flou de boite conserve l'energie totale, pas le
       pic : un objet de 3 px etale sur 9x9 perd 96 % de son opacite et
       disparait. Un objet defocalise s'assombrit, il ne s'efface pas) ;
     - le clip est rectangulaire, pas circulaire : ici on ne regarde pas dans
       un oculaire rond, on regarde une capture de camera.
--------------------------------------------------------------------------- */

import { clamp } from './util.js';

export const LAYERS = 8;
/* Quatre niveaux de flou. 4 px de rayon a 256 px de large, c'est un objet
   situe a ~3 um du plan de mise au point avec un objectif a immersion. */
const BLUR_RADIUS = [0, 1, 2, 4];
const BLUR_GAIN = [1, 1.8, 2.8, 4.2];
/* Du plus profond et flou vers le plus proche et flou. */
const COMPOSITE_ORDER = [3, 2, 1, 0, 4, 5, 6, 7];

/** Matrice de Bayer 4x4 normalisee. Tramage ordonne : stable image apres image. */
const BAYER = new Float32Array(
  [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16),
);

export function bayer(x, y) { return BAYER[((y & 3) << 2) | (x & 3)]; }

/** Couleur vers entier 32 bits (petit-boutiste : 0xAABBGGRR). */
export function rgba(r, g, b, a = 255) {
  return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

export function hexToRgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

export function mix32(c0, c1, t) {
  const k = clamp(t, 0, 1);
  const r = ((c0 & 255) + (((c1 & 255) - (c0 & 255)) * k)) | 0;
  const g = (((c0 >> 8) & 255) + ((((c1 >> 8) & 255) - ((c0 >> 8) & 255)) * k)) | 0;
  const b = (((c0 >> 16) & 255) + ((((c1 >> 16) & 255) - ((c0 >> 16) & 255)) * k)) | 0;
  const a = (((c0 >>> 24) & 255) + ((((c1 >>> 24) & 255) - ((c0 >>> 24) & 255)) * k)) | 0;
  return rgba(r, g, b, a);
}

export function fade32(c, k) {
  const a = ((c >>> 24) & 255) * clamp(k, 0, 1);
  return (c & 0x00ffffff) | ((a & 255) << 24);
}

/** Eclaircit (k>0) ou assombrit (k<0) une couleur, alpha inchange. */
export function shade32(c, k) {
  const t = clamp(Math.abs(k), 0, 1);
  const to = k >= 0 ? 255 : 0;
  const r = ((c & 255) + (to - (c & 255)) * t) | 0;
  const g = (((c >> 8) & 255) + (to - ((c >> 8) & 255)) * t) | 0;
  const b = (((c >> 16) & 255) + (to - ((c >> 16) & 255)) * t) | 0;
  return (c & 0xff000000) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

class Layer {
  constructor(w, h) {
    this.w = w; this.h = h;
    /* Premultiplie : flouter du RGBA non premultiplie fait baver la couleur. */
    this.buf = new Uint8ClampedArray(w * h * 4);
    this.tmp = new Uint8ClampedArray(w * h * 4);
    this.x0 = w; this.y0 = h; this.x1 = -1; this.y1 = -1;
  }

  get empty() { return this.x1 < this.x0; }

  mark(x, y) {
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  clear() {
    if (this.empty) return;
    const { w, buf } = this;
    for (let y = this.y0; y <= this.y1; y++) {
      buf.fill(0, (y * w + this.x0) * 4, (y * w + this.x1 + 1) * 4);
    }
    this.x0 = this.w; this.y0 = this.h; this.x1 = -1; this.y1 = -1;
  }
}

/** Flou de boite separable, restreint a la boite englobante du calque. */
function boxBlur(L, r) {
  if (r <= 0 || L.empty) return;
  const { w, h, buf, tmp } = L;
  const x0 = Math.max(0, L.x0 - r), x1 = Math.min(w - 1, L.x1 + r);
  const y0 = Math.max(0, L.y0 - r), y1 = Math.min(h - 1, L.y1 + r);
  const inv = 1 / (2 * r + 1);

  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = x0 - r; k <= x0 + r; k++) {
      if (k < 0 || k >= w) continue;
      const i = (row + k) * 4;
      s0 += buf[i]; s1 += buf[i + 1]; s2 += buf[i + 2]; s3 += buf[i + 3];
    }
    for (let x = x0; x <= x1; x++) {
      const o = (row + x) * 4;
      tmp[o] = s0 * inv; tmp[o + 1] = s1 * inv; tmp[o + 2] = s2 * inv; tmp[o + 3] = s3 * inv;
      const out = x - r, add = x + r + 1;
      if (out >= 0 && out < w) { const i = (row + out) * 4; s0 -= buf[i]; s1 -= buf[i + 1]; s2 -= buf[i + 2]; s3 -= buf[i + 3]; }
      if (add >= 0 && add < w) { const i = (row + add) * 4; s0 += buf[i]; s1 += buf[i + 1]; s2 += buf[i + 2]; s3 += buf[i + 3]; }
    }
  }

  /* tmp n'est valide que sur les lignes [y0,y1] ecrites juste au-dessus :
     tout ce qui sort de cette bande compte pour zero, sinon on relit
     l'image precedente. */
  for (let x = x0; x <= x1; x++) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = y0 - r; k <= y0 + r; k++) {
      if (k < y0 || k > y1) continue;
      const i = (k * w + x) * 4;
      s0 += tmp[i]; s1 += tmp[i + 1]; s2 += tmp[i + 2]; s3 += tmp[i + 3];
    }
    for (let y = y0; y <= y1; y++) {
      const o = (y * w + x) * 4;
      buf[o] = s0 * inv; buf[o + 1] = s1 * inv; buf[o + 2] = s2 * inv; buf[o + 3] = s3 * inv;
      const out = y - r, add = y + r + 1;
      if (out >= y0 && out <= y1) { const i = (out * w + x) * 4; s0 -= tmp[i]; s1 -= tmp[i + 1]; s2 -= tmp[i + 2]; s3 -= tmp[i + 3]; }
      if (add >= y0 && add <= y1) { const i = (add * w + x) * 4; s0 += tmp[i]; s1 += tmp[i + 1]; s2 += tmp[i + 2]; s3 += tmp[i + 3]; }
    }
  }
  L.x0 = x0; L.y0 = y0; L.x1 = x1; L.y1 = y1;
}

export class Screen {
  constructor(canvas) { this.canvas = canvas; this.w = 0; this.h = 0; }

  /** (Re)construit les tampons. Renvoie true si la taille a change. */
  resize(w, h) {
    if (this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(w, h);
    this.px = new Uint32Array(this.image.data.buffer);
    this.layers = [];
    for (let i = 0; i < LAYERS; i++) this.layers.push(new Layer(w, h));
    this.cur = this.layers[0];
    return true;
  }

  layer(index) { this.cur = this.layers[clamp(index | 0, 0, LAYERS - 1)]; return this; }

  /** Calque pour une profondeur relative au plan de mise au point. */
  static layerFor(zRel, blurLevel) {
    return (zRel >= 0 ? 0 : 4) + clamp(blurLevel | 0, 0, 3);
  }

  /** Niveau de flou pour un ecart au plan focal exprime en [0,1]. */
  static blurLevel(amount) { return clamp(Math.round(amount * 3), 0, 3); }

  beginFrame(bg = 0xff000000) {
    this.px.fill(bg);
    for (const L of this.layers) L.clear();
  }

  /* --- primitives sur calque -------------------------------------------- */

  plot(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (c >>> 24) & 255;
    if (a === 0) return;
    const L = this.cur;
    const i = (y * this.w + x) * 4;
    const b = L.buf;
    const sa = a / 255, ia = 1 - sa;
    b[i] = (c & 255) * sa + b[i] * ia;
    b[i + 1] = ((c >> 8) & 255) * sa + b[i + 1] * ia;
    b[i + 2] = ((c >> 16) & 255) * sa + b[i + 2] * ia;
    b[i + 3] = a + b[i + 3] * ia;
    L.mark(x, y);
  }

  /** Disque plein, liseré optionnel. */
  disc(cx, cy, r, fill, rim = 0) {
    /* Sous 1,85 px on passe par `dot` : un disque euclidien de rayon 1,2
       donne une croix a quatre branches, pas un granule. */
    if (r < 1.85) { this.dot(cx, cy, r, rim || fill); return; }
    const R = Math.ceil(r);
    const ix = Math.round(cx), iy = Math.round(cy);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r) continue;
        this.plot(ix + x, iy + y, rim && d > r - 1.05 ? rim : fill);
      }
    }
  }

  /**
   * Petit corps rond. En dessous de 1,7 px de rayon un disque euclidien
   * donne une CROIX (les quatre pixels a distance 1 passent, les diagonales
   * a 1,41 ne passent pas) : le champ se couvrait d'etoiles a quatre
   * branches la ou il devait y avoir des granules. On quantifie donc :
   * 1 px, puis 2x2, puis 3x3, puis le disque.
   */
  dot(x, y, r, c) {
    const ix = Math.round(x), iy = Math.round(y);
    if (r < 0.80) { this.plot(ix, iy, c); return; }
    if (r < 1.25) {
      this.plot(ix, iy, c); this.plot(ix + 1, iy, c);
      this.plot(ix, iy + 1, c); this.plot(ix + 1, iy + 1, c);
      return;
    }
    if (r < 1.85) {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.plot(ix + i, iy + j, c);
      return;
    }
    this.disc(ix, iy, r, c);
  }

  /**
   * Comme `dot`, mais ecrit direct dans le tampon principal : sert au
   * milieu exterieur, qui passe sous le tube et n'a pas de calque.
   */
  dotDirect(x, y, r, c) {
    const ix = Math.round(x), iy = Math.round(y);
    if (r < 0.80) { this.direct(ix, iy, c); return; }
    if (r < 1.25) {
      this.direct(ix, iy, c); this.direct(ix + 1, iy, c);
      this.direct(ix, iy + 1, c); this.direct(ix + 1, iy + 1, c);
      return;
    }
    /* Meme quantification que `dot` : sans le palier 3x3, un rayon de
       1,6 px donne une croix a quatre branches, et le milieu se couvrait
       de petits « + » des qu'on dezoomait. */
    if (r < 1.85) {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.direct(ix + i, iy + j, c);
      return;
    }
    const R = Math.ceil(r);
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        if (i * i + j * j > r * r) continue;
        this.direct(ix + i, iy + j, c);
      }
    }
  }

  /** Ellipse pleine orientee. Une vesicule qui fusionne s'aplatit : elle ne
      reste pas ronde jusqu'a disparaitre. */
  ell(cx, cy, a, b, ang, fill, rim = 0) {
    if (a < 0.8 || b < 0.8) { this.disc(cx, cy, Math.max(a, b), fill, rim); return; }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bb = Math.ceil(Math.max(a, b)) + 1;
    const ix = Math.round(cx), iy = Math.round(cy);
    for (let y = -bb; y <= bb; y++) {
      for (let x = -bb; x <= bb; x++) {
        const lx = x * ca + y * sa, ly = -x * sa + y * ca;
        const d = (lx * lx) / (a * a) + (ly * ly) / (b * b);
        if (d > 1) continue;
        this.plot(ix + x, iy + y, rim && d > 0.58 ? rim : fill);
      }
    }
  }

  /** Segment fin, trace point par point. La membrane plasmique fait un
      pixel : une capsule serait 20 fois plus chere pour le meme resultat. */
  line(x0, y0, x1, y1, c) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= n; i++) this.plot(x0 + dx * (i / n), y0 + dy * (i / n), c);
  }

  /**
   * Arc d'ellipse parametrique, de t0 a t1 (radians, dans le repere de
   * l'ellipse : t = 0 est l'extremite du demi-axe `a`).
   *
   * Sert a une seule chose, mais elle est centrale : dessiner la membrane
   * d'une vesicule EN OMETTANT le pore de fusion. Un contour ferme ne peut
   * pas montrer une membrane qui s'ouvre.
   */
  arcE(cx, cy, a, b, rot, c, t0, t1, ep = 1) {
    const n = Math.max(12, Math.ceil((t1 - t0) * Math.max(a, b) * 1.6));
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * (i / n);
      const lx = a * Math.cos(t), ly = b * Math.sin(t);
      const px = cx + lx * ca - ly * sa, py = cy + lx * sa + ly * ca;
      if (ep > 1.3) this.dot(px, py, 1.0, c); else this.plot(px, py, c);
    }
  }

  /** Capsule : segment epais a bouts ronds (mitochondrie, brin de RE). */
  cap(cx, cy, len, width, ang, fill, rim = 0) {
    const r = width / 2;
    const half = Math.max(len / 2 - r, 0);
    if (r < 0.62 && len < 1.4) { this.plot(cx, cy, rim || fill); return; }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bb = Math.ceil(len / 2 + r) + 1;
    const ix = Math.round(cx), iy = Math.round(cy);
    for (let y = -bb; y <= bb; y++) {
      for (let x = -bb; x <= bb; x++) {
        const lx = x * ca + y * sa, ly = -x * sa + y * ca;
        const ax = Math.max(Math.abs(lx) - half, 0);
        const d = Math.sqrt(ax * ax + ly * ly);
        if (d > r) continue;
        this.plot(ix + x, iy + y, rim && d > r - 0.92 ? rim : fill);
      }
    }
  }

  /* --- composition ------------------------------------------------------ */

  composite(dither = 0.18) {
    for (const idx of COMPOSITE_ORDER) {
      const L = this.layers[idx];
      if (L.empty) continue;
      const level = idx & 3;
      boxBlur(L, BLUR_RADIUS[level]);
      const gain = BLUR_GAIN[level];
      const { w, buf } = L;
      const px = this.px;
      for (let y = L.y0; y <= L.y1; y++) {
        for (let x = L.x0; x <= L.x1; x++) {
          const i = (y * w + x) * 4;
          let a = buf[i + 3];
          if (a === 0) continue;
          let cr = buf[i], cg = buf[i + 1], cb = buf[i + 2];
          if (gain !== 1) {
            /* Le meme facteur sur l'alpha ET la couleur premultipliee :
               ecreter canal par canal desaturerait vers le blanc. */
            const g2 = Math.min(gain, 255 / Math.max(a, 1));
            a *= g2; cr *= g2; cg *= g2; cb *= g2;
          }
          if (dither > 0 && a < 250) {
            if (a < bayer(x, y) * dither * 255) continue;
          }
          const o = y * w + x;
          const d = px[o];
          const ia = 1 - a / 255;
          px[o] = 0xff000000
            | (((cb + ((d >> 16) & 255) * ia) & 255) << 16)
            | (((cg + ((d >> 8) & 255) * ia) & 255) << 8)
            | ((cr + (d & 255) * ia) & 255);
        }
      }
    }
  }

  /** Ecrit directement dans le tampon principal : fond, cytoplasme, grain. */
  direct(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (c >>> 24) & 255;
    if (a === 0) return;
    const o = y * this.w + x;
    if (a === 255) { this.px[o] = c | 0xff000000; return; }
    const d = this.px[o];
    const sa = a / 255, ia = 1 - sa;
    this.px[o] = 0xff000000
      | (((((c >> 16) & 255) * sa + ((d >> 16) & 255) * ia) & 255) << 16)
      | (((((c >> 8) & 255) * sa + ((d >> 8) & 255) * ia) & 255) << 8)
      | ((((c & 255) * sa + (d & 255) * ia)) & 255);
  }

  present() { this.ctx.putImageData(this.image, 0, 0); }
}
