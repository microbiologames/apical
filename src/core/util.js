/* ---------------------------------------------------------------------------
   Outils numeriques. Rien de specifique a la simulation ici.
--------------------------------------------------------------------------- */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Ecart angulaire signe le plus court de a vers b. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Generateur reproductible. Un banc qui tire sur Math.random ne mesure rien. */
export function mulberry32(a) {
  let s = a | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Hash entier -> [0,1[. Le decalage doit etre LOGIQUE (>>>) : avec un
   decalage arithmetique le bit de signe est recopie, le resultat reste
   borne a [0, 0.5) et tout champ construit dessus vaut la moitie de ce
   qu'on croit. Defaut mesure sur le projet precedent, il avait annule
   trois plans de profondeur sur quatre. */
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur bilineaire. Une octave. */
export function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Deux octaves : assez pour une granulation cytoplasmique, pas plus cher. */
export function fbm2(x, y, s = 0) {
  return noise2(x, y, s) * 0.62 + noise2(x * 2.17, y * 2.17, s + 91) * 0.38;
}

/** Bruit 1D lisse, pour les derives lentes (mise au point, cap vise). */
export function noise1(x, s = 0) {
  const xi = Math.floor(x), xf = x - xi;
  const u = xf * xf * (3 - 2 * xf);
  return lerp(hash2(xi, 7919, s), hash2(xi + 1, 7919, s), u);
}
