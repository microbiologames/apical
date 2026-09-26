/* ---------------------------------------------------------------------------
   Tampon pixel et optique.

   Rendu en fond noir : on ecrit dans un Uint32Array de 256x352, puis on
   agrandit au plus proche voisin. Huit calques de profondeur sont floutes
   separement (flou de boite separable) puis composites dans l'ordre optique.
   Voir docs/06-heritage-wet-mount.md pour le raisonnement.
--------------------------------------------------------------------------- */

import { clamp } from './util.js';

/* Disposition. VIEW est MUTABLE : le champ doit remplir l'ecran quelle que
   soit son orientation, et le HUD change de place avec lui.
     - portrait  : le disque touche le haut, la gauche et la droite,
                   le HUD prend la bande du bas
     - paysage   : le disque touche le haut et le bas,
                   le HUD prend les deux colonnes laterales */
export const VIEW = { W: 256, H: 352, CX: 128, CY: 132, R: 124, mode: 'bottom' };

/** Calcule la disposition interne pour une fenetre donnee. */
export function computeLayout(winW, winH) {
  const ar = Math.max(0.35, Math.min(3.2, winW / Math.max(1, winH)));
  const M = 4;
  if (ar >= 1.05) {
    const H = 272;
    const R = Math.round(H / 2 - M);
    /* On garantit 60 px de colonne de chaque cote : sans ca, sur une fenetre
       presque carree le HUD n'a litteralement plus de place. Le canvas est
       alors un peu plus large que la fenetre et se met a l'echelle. */
    const W = Math.max(Math.round(H * ar), H + 120);
    return { W: Math.min(W, 720), H, CX: Math.round(Math.min(W, 720) / 2), CY: Math.round(H / 2), R, mode: 'sides' };
  }
  const W = 256;
  const R = Math.round(W / 2 - M);
  const H = Math.max(300, Math.min(470, Math.round(W / ar)));
  return { W, H, CX: Math.round(W / 2), CY: M + R, R, mode: 'bottom' };
}

export let R2 = VIEW.R * VIEW.R;

/* Huit calques : 0-3 derriere le joueur (z >= 0), 4-7 devant (z < 0).
   Le second chiffre est le niveau de flou (0 = net). */
export const LAYERS = 8;
const BLUR_RADIUS = [0, 1, 2, 4];
/* Un flou de boite conserve l'energie TOTALE, pas le pic : un organisme de
   3 px etale sur 9x9 perd 96 % de son opacite et disparait. Un objet
   defocalise s'assombrit, il ne s'efface pas. On rend donc le gain apres
   flou, ce qui redonne au halo de phase sa lisibilite. */
const BLUR_GAIN = [1, 1.8, 2.8, 4.2];
/* Ordre de composition : du plus profond et flou, vers le plus proche et flou. */
const COMPOSITE_ORDER = [3, 2, 1, 0, 4, 5, 6, 7];

/** Matrice de Bayer 4x4, normalisee sur [0,1). Tramage ordonne, stable. */
const BAYER = new Float32Array([
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map((v) => v / 16));

export function bayer(x, y) {
  return BAYER[((y & 3) << 2) | (x & 3)];
}

/** Couleur vers entier 32 bits (petit-boutiste : 0xAABBGGRR). */
export function rgba(r, g, b, a = 255) {
  return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

export function hexToRgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

/** Melange deux couleurs 32 bits (t = 0 -> a, t = 1 -> b). */
export function mix32(c0, c1, t) {
  const k = clamp(t, 0, 1);
  const r = ((c0 & 255) + (((c1 & 255) - (c0 & 255)) * k)) | 0;
  const g = (((c0 >> 8) & 255) + ((((c1 >> 8) & 255) - ((c0 >> 8) & 255)) * k)) | 0;
  const b = (((c0 >> 16) & 255) + ((((c1 >> 16) & 255) - ((c0 >> 16) & 255)) * k)) | 0;
  const a = (((c0 >>> 24) & 255) + ((((c1 >>> 24) & 255) - ((c0 >>> 24) & 255)) * k)) | 0;
  return rgba(r, g, b, a);
}

/** Applique un facteur d'alpha a une couleur. */
export function fade32(c, k) {
  const a = ((c >>> 24) & 255) * clamp(k, 0, 1);
  return (c & 0x00ffffff) | ((a & 255) << 24);
}

class Layer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    /* Premultiplie : le flou d'un RGBA non premultiplie bave la couleur. */
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

  /* passe horizontale : buf -> tmp */
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
      tmp[o] = s0 * inv; tmp[o + 1] = s1 * inv;
      tmp[o + 2] = s2 * inv; tmp[o + 3] = s3 * inv;
      const out = x - r, add = x + r + 1;
      if (out >= 0 && out < w) {
        const i = (row + out) * 4;
        s0 -= buf[i]; s1 -= buf[i + 1]; s2 -= buf[i + 2]; s3 -= buf[i + 3];
      }
      if (add >= 0 && add < w) {
        const i = (row + add) * 4;
        s0 += buf[i]; s1 += buf[i + 1]; s2 += buf[i + 2]; s3 += buf[i + 3];
      }
    }
  }

  /* passe verticale : tmp -> buf.
     tmp n'est valide que sur les lignes [y0,y1] ecrites juste au-dessus :
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
      buf[o] = s0 * inv; buf[o + 1] = s1 * inv;
      buf[o + 2] = s2 * inv; buf[o + 3] = s3 * inv;
      const out = y - r, add = y + r + 1;
      if (out >= y0 && out <= y1) {
        const i = (out * w + x) * 4;
        s0 -= tmp[i]; s1 -= tmp[i + 1]; s2 -= tmp[i + 2]; s3 -= tmp[i + 3];
      }
      if (add >= y0 && add <= y1) {
        const i = (add * w + x) * 4;
        s0 += tmp[i]; s1 += tmp[i + 1]; s2 += tmp[i + 2]; s3 += tmp[i + 3];
      }
    }
  }
  L.x0 = x0; L.y0 = y0; L.x1 = x1; L.y1 = y1;
}

export class Screen {
  constructor(canvas, layout) {
    this.canvas = canvas;
    this.applyLayout(layout || computeLayout(innerWidth, innerHeight));
  }

  /** (Re)construit les tampons pour une disposition. */
  applyLayout(L) {
    if (this.w === L.W && this.h === L.H && VIEW.mode === L.mode) {
      VIEW.CX = L.CX; VIEW.CY = L.CY; VIEW.R = L.R;
      R2 = L.R * L.R;
      this.setFieldRadius(L.R);
      return false;
    }
    Object.assign(VIEW, L);
    R2 = L.R * L.R;
    this.w = L.W;
    this.h = L.H;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(this.w, this.h);
    this.px = new Uint32Array(this.image.data.buffer);
    this.layers = [];
    for (let i = 0; i < LAYERS; i++) this.layers.push(new Layer(this.w, this.h));
    this.cur = this.layers[0];
    this.clip = true;
    this.setFieldRadius(L.R);
    return true;
  }

  /** Change le rayon du champ (objectif a immersion, transitions). */
  setFieldRadius(r) {
    this.clipR = r;
    this.clipR2 = r * r;
  }

  /** Cible les ecritures suivantes vers un calque de profondeur. */
  layer(index) {
    this.cur = this.layers[clamp(index | 0, 0, LAYERS - 1)];
    return this;
  }

  /** Indice de calque pour une profondeur z et un niveau de flou. */
  static layerFor(z, blurLevel) {
    return (z >= 0 ? 0 : 4) + clamp(blurLevel | 0, 0, 3);
  }

  static blurLevel(blurAmount) {
    return clamp(Math.round(blurAmount * 3), 0, 3);
  }

  beginFrame(bg = 0xff000000) {
    this.px.fill(bg);
    for (const L of this.layers) L.clear();
  }

  /* --- primitives ------------------------------------------------------- */

  plot(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (this.clip) {
      const dx = x - VIEW.CX, dy = y - VIEW.CY;
      if (dx * dx + dy * dy > this.clipR2) return;
    }
    const a = (c >>> 24) & 255;
    if (a === 0) return;
    const L = this.cur;
    const i = (y * this.w + x) * 4;
    const b = L.buf;
    /* premultiplie, en accumulant sur ce qui est deja la (src-over) */
    const sa = a / 255;
    const ia = 1 - sa;
    b[i] = (c & 255) * sa + b[i] * ia;
    b[i + 1] = ((c >> 8) & 255) * sa + b[i + 1] * ia;
    b[i + 2] = ((c >> 16) & 255) * sa + b[i + 2] * ia;
    b[i + 3] = a + b[i + 3] * ia;
    L.mark(x, y);
  }

  /** Disque plein, bord optionnel. */
  disc(cx, cy, r, fill, rim = 0) {
    if (r < 0.7) { this.plot(cx, cy, rim || fill); return; }
    const R = Math.ceil(r);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r) continue;
        this.plot(cx + x, cy + y, rim && d > r - 1.05 ? rim : fill);
      }
    }
  }

  /** Anneau : le halo de contraste de phase des objets hors plan. */
  ring(cx, cy, r, thickness, c) {
    const R = Math.ceil(r + thickness);
    const inner = r - thickness * 0.5;
    const outer = r + thickness * 0.5;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d < inner || d > outer) continue;
        this.plot(cx + x, cy + y, c);
      }
    }
  }

  /**
   * Ellipse pleine. Un grain d'amidon de ble est LENTICULAIRE, pas spherique :
   * le dessiner rond en fait une bulle, et le champ perd sa lecture.
   *
   * @param {number} rx demi-grand axe   @param {number} ry demi-petit axe
   */
  ellipse(cx, cy, rx, ry, ang, fill, rim = 0) {
    if (rx < 0.8 || ry < 0.8) { this.disc(cx, cy, Math.max(rx, ry), fill, rim); return; }
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    const R = Math.ceil(Math.max(rx, ry)) + 1;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        /* On ramene le pixel dans le repere de l'ellipse, puis on le teste
           sur le cercle unite : une seule racine par pixel. */
        const u = (x * ca - y * sa) / rx;
        const v = (x * sa + y * ca) / ry;
        const d = Math.sqrt(u * u + v * v);
        if (d > 1) continue;
        this.plot(cx + x, cy + y, rim && d > 0.80 ? rim : fill);
      }
    }
  }

  /** Contour d'ellipse : le halo de contraste de phase d'un grain. */
  ringE(cx, cy, rx, ry, ang, thickness, c) {
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    const R = Math.ceil(Math.max(rx, ry) + thickness) + 1;
    /* L'epaisseur est donnee en PIXELS : on la convertit en fraction de
       rayon, sinon un grain allonge a un contour deux fois plus epais sur
       son petit axe que sur son grand. */
    const e = thickness / Math.max(1, Math.min(rx, ry));
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const u = (x * ca - y * sa) / rx;
        const v = (x * sa + y * ca) / ry;
        const d = Math.sqrt(u * u + v * v);
        if (d < 1 - e || d > 1 + e * 0.4) continue;
        this.plot(cx + x, cy + y, c);
      }
    }
  }

  /** Capsule (bacille) : segment epais a bouts ronds. */
  cap(cx, cy, len, width, ang, fill, rim = 0) {
    const r = width / 2;
    const half = Math.max(len / 2 - r, 0);
    if (r < 0.62 && len < 1.4) { this.plot(cx, cy, rim || fill); return; }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bb = Math.ceil(len / 2 + r) + 1;
    for (let y = -bb; y <= bb; y++) {
      for (let x = -bb; x <= bb; x++) {
        const lx = x * ca + y * sa, ly = -x * sa + y * ca;
        const ax = Math.max(Math.abs(lx) - half, 0);
        const d = Math.sqrt(ax * ax + ly * ly);
        if (d > r) continue;
        this.plot(cx + x, cy + y, rim && d > r - 0.92 ? rim : fill);
      }
    }
  }

  /** Ellipse (levure, amibe). */
  ell(cx, cy, a, b, ang, fill, rim = 0) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bb = Math.ceil(Math.max(a, b)) + 1;
    for (let y = -bb; y <= bb; y++) {
      for (let x = -bb; x <= bb; x++) {
        const lx = x * ca + y * sa, ly = -x * sa + y * ca;
        const d = (lx * lx) / (a * a) + (ly * ly) / (b * b);
        if (d > 1) continue;
        this.plot(cx + x, cy + y, rim && d > 0.62 ? rim : fill);
      }
    }
  }

  seg(x0, y0, x1, y1, width, fill, rim = 0) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.4) { this.disc(x0, y0, width / 2, fill, rim); return; }
    this.cap((x0 + x1) / 2, (y0 + y1) / 2, len + width, width, Math.atan2(dy, dx), fill, rim);
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.plot(x + i, y + j, c);
  }

  /* --- composition ------------------------------------------------------ */

  /** Floute chaque calque puis les fusionne dans le tampon principal. */
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
               ecreter chaque canal separement desaturerait vers le blanc. */
            const g2 = Math.min(gain, 255 / Math.max(a, 1));
            a *= g2; cr *= g2; cg *= g2; cb *= g2;
          }
          /* tramage ordonne : garde le grain pixel art sur les bords flous */
          if (dither > 0 && a < 250) {
            const t = bayer(x, y) * dither * 255;
            if (a < t) continue;
          }
          const o = y * w + x;
          const d = px[o];
          const ia = 1 - a / 255;
          const r = cr + (d & 255) * ia;
          const g = cg + ((d >> 8) & 255) * ia;
          const b = cb + ((d >> 16) & 255) * ia;
          px[o] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
        }
      }
    }
  }

  /** Ecrit directement dans le tampon principal (HUD : jamais floute). */
  direct(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (c >>> 24) & 255;
    if (a === 0) return;
    const o = y * this.w + x;
    if (a === 255) { this.px[o] = c | 0xff000000; return; }
    const d = this.px[o];
    const sa = a / 255, ia = 1 - sa;
    const r = (c & 255) * sa + (d & 255) * ia;
    const g = ((c >> 8) & 255) * sa + ((d >> 8) & 255) * ia;
    const b = ((c >> 16) & 255) * sa + ((d >> 16) & 255) * ia;
    this.px[o] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }

  present() {
    this.ctx.putImageData(this.image, 0, 0);
  }
}
