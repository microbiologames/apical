/* Outils numériques partagés. */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** Générateur déterministe : deux runs de même graine sont identiques. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bruit de valeur stable en espace monde (pas de scintillement image à image).
 *
 * ATTENTION, DEFAUT CORRIGÉ ICI, ET IL COÛTAIT CHER : la version héritée
 * mélangeait par `n ^ (n >> 16)`, un décalage ARITHMÉTIQUE. Pour un `n` négatif
 * les seize bits de tête de `n >> 16` valent 1, donc le bit de signe s'annule
 * toujours contre lui-même et le résultat ne dépasse jamais 2^31. La fonction
 * rendait donc [0 ; 0,5[ avec une moyenne de 0,25 au lieu de 0,5 — mesuré sur
 * 20 000 tirages. Inoffensif pour du tramage, fatal ici : le champ de sucre
 * moyen tombait à 0,02 au lieu de 0,22 et TOUTES les parties mouraient de
 * carence en cinq secondes, tandis que trois des quatre plans de profondeur du
 * décor n'étaient jamais tirés. Le décalage est maintenant LOGIQUE (`>>>`),
 * et `Math.imul` remplace la multiplication flottante qui perdait ses bits de
 * poids faible au-delà de 2^53.
 */
export function hash2(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Tirage pondéré : entries = [{w:poids, ...}] */
export function weightedPick(rng, entries, weightOf = (e) => e.w) {
  let total = 0;
  for (const e of entries) total += weightOf(e);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= weightOf(e);
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

/** Distance angulaire signée la plus courte. */
export function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Giration : fait tourner un cap vers une cible, avec de l'inertie.
 *
 * Poser `ang = atan2(...)` fait CLAQUER l'orientation : le corps saute d'un
 * cap a l'autre en une image, et toutes les animations qui en dependent
 * (flagelles, cambrure) sautent avec lui. Un petit poisson ne fait pas ca :
 * il amorce, il tourne, il se redresse.
 *
 * Le modele est un ressort ANGULAIRE a amortissement critique, de meme
 * constante de temps `tau` que le moteur de translation. Les deux inerties
 * sont donc solidaires, et la flagellation pilote les deux d'un coup :
 * peritriche vire sec, polaire vire large. C'est exactement le caractere
 * qu'on veut faire sentir.
 *
 * @param {{ang:number, omega:number}} o  objet porteur du cap
 * @param {number} dt
 * @param {number} cible   cap vise, en radians
 * @param {number} tau     constante de temps, en secondes
 * @param {number} omegaMax vitesse angulaire maximale, en rad/s
 * @returns {number} la vitesse angulaire apres coup, en rad/s
 */
export function girer(o, dt, cible, tau, omegaMax) {
  const t = Math.max(tau, 0.02);
  const k = 1 / (t * t);              // raideur
  const c = 2 / t;                    // amortissement critique
  /* Sous-pas si l'image est longue : un ressort raide integre en Euler
     explose au-dela de dt ~ tau/2, et la cellule se met a tourner sur
     elle-meme. Ca arrive vraiment sur un onglet qui reprend la main. */
  const n = Math.min(4, Math.max(1, Math.ceil(dt / (t * 0.5))));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const err = angDelta(o.ang, cible);
    o.omega += (err * k - o.omega * c) * h;
    if (o.omega > omegaMax) o.omega = omegaMax;
    else if (o.omega < -omegaMax) o.omega = -omegaMax;
    o.ang += o.omega * h;
  }
  /* On garde le cap borne, sinon il derive vers des valeurs enormes sur un
     run de douze minutes et la precision flottante se degrade. */
  if (o.ang > Math.PI) o.ang -= TAU;
  else if (o.ang < -Math.PI) o.ang += TAU;
  return o.omega;
}

/** Formate un temps en m:ss. */
export function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
