/* ---------------------------------------------------------------------------
   L'hyphe : un axe, un profil de demi-largeur, un seul contour.

   POINT NON NEGOCIABLE. L'echec du projet precedent tient en une phrase :
   la calotte apicale etait une forme dessinee a part, posee au bout du tube.
   Ici c'est structurellement impossible.

     - il n'existe qu'UN axe, une polyligne qui se prolonge par l'avant ;
     - il n'existe qu'UNE fonction de demi-largeur W(s), s etant l'abscisse
       curviligne comptee depuis l'apex ;
     - le contour est UN polygone ferme construit en parcourant W(s) d'un
       cote puis de l'autre. W(0) = 0 : les deux cotes se rejoignent a la
       pointe, le tube se ferme tout seul.

   Il n'y a donc aucun endroit ou l'on pourrait dessiner « la calotte ».

   Forme de la calotte. W = R.(1-u^n)^(1/n) avec u = (Lc-s)/Lc, Lc donne
   en RAYONS. Deux bornes, toutes les deux mesurees :

     Lc = 1.55 R : franchement phallique (defaut du prototype precedent).
     Lc = 0.85 R : rayon de courbure au sommet R^2/Lc = 6,5 um pour un tube
                   de 5,5 um de rayon, soit un dome PLUS PLAT qu'une demi-
                   sphere — a l'ecran le tube a l'air coupe net.

   On retient Lc = 1.00 R : calotte hemispherique, rayon de courbure au
   sommet egal au rayon du tube. C'est la fermeture d'un tube, ni un
   bourgeon ni une section. n = 2 donne l'ogive ronde, n < 2 un nez plus
   pointu, n > 2 un nez plus plat ; le curseur laisse juger.

   La paroi n'est JAMAIS epaissie avec le zoom : une paroi hyphale fait
   0,1 a 0,3 um, soit moins d'un pixel. On la trace en epaisseur ecran.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, noise1, TAU } from '../core/util.js';

const PAS = 0.22;          // um entre deux points d'axe memorises
const MAX_PTS = 1600;      // ~350 um de memoire, largement hors champ

export class Hyphe {
  constructor(opts = {}) {
    this.R = opts.R ?? 5.5;              // rayon du tube, um (diam. 11 um)
    this.calotte = opts.calotte ?? 1.00; // longueur de calotte, en rayons
    this.profil = opts.profil ?? 2.0;    // 2 = ogive ronde, 3 = nez plat
    this.graine = opts.graine ?? 1234;

    this.x = 0; this.y = 0;              // apex
    this.th = -Math.PI / 2;              // cap, y vers le bas donc -PI/2 = haut
    this.om = 0;                         // vitesse angulaire, rad/s
    this.avanceFrame = 0;                // um avances a la derniere image
    this.longueur = 0;                   // um construits depuis le depart

    /* Axe stocke du plus ancien au plus recent. al = abscisse cumulee. */
    this.ax = []; this.ay = []; this.al = [];
    this.enAttente = 0;

    /* On amorce avec 90 um de tube droit derriere : sans cette queue, au
       demarrage le tube s'arrete net au bord du champ. */
    const n = Math.ceil(90 / PAS);
    for (let i = n; i >= 1; i--) {
      this.ax.push(this.x - Math.cos(this.th) * i * PAS);
      this.ay.push(this.y - Math.sin(this.th) * i * PAS);
      this.al.push((n - i) * PAS);
    }
    this.ax.push(this.x); this.ay.push(this.y); this.al.push(n * PAS);
    this.base = n * PAS;   // abscisse cumulee deja parcourue a l'amorce
  }

  /** Abscisse cumulee totale, apex compris. */
  get total() {
    const i = this.ax.length - 1;
    return this.al[i] + Math.hypot(this.x - this.ax[i], this.y - this.ay[i]);
  }

  get Lc() { return this.calotte * this.R; }

  /** Demi-largeur du tube a l'abscisse s (0 = pointe de l'apex). */
  W(s) {
    const Lc = this.Lc;
    let w;
    if (s >= Lc) {
      w = this.R;
    } else {
      const u = clamp((Lc - s) / Lc, 0, 1);
      const n = this.profil;
      w = this.R * Math.pow(Math.max(1 - Math.pow(u, n), 0), 1 / n);
    }
    /* Ondulation de paroi. Elle doit etre FIGEE dans le materiau, pas dans
       s : s recule a chaque image quand l'apex avance, une ondulation
       indexee sur s ferait onduler un tube deja construit. On l'indexe donc
       sur l'abscisse cumulee depuis l'origine, qui, elle, ne bouge plus. */
    if (s > Lc) {
      const q = this.total - s;
      const k = smoothstep(Lc, Lc + 3.5, s);
      w *= 1 + 0.045 * k * (noise1(q * 0.28, this.graine) - 0.5) * 2
             + 0.022 * k * (noise1(q * 0.93, this.graine + 5) - 0.5) * 2;
    }
    return w;
  }

  /** Maturation de la paroi : mince et plastique a l'apex, epaisse derriere. */
  maturite(s) { return smoothstep(0.3, 8.5, s); }

  /**
   * Position et normale a l'abscisse s. La normale pointe vers +v.
   * Sortie recyclee dans `out` pour ne pas allouer 600 objets par image.
   */
  atS(s, out) {
    const o = out || { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 };
    const A = this.ax, B = this.ay, L = this.al;
    const last = A.length - 1;
    const q = this.total - s;

    if (q >= L[last]) {
      /* entre le dernier point memorise et l'apex */
      const dx = this.x - A[last], dy = this.y - B[last];
      const len = Math.hypot(dx, dy) || 1;
      const t = (q - L[last]) / len;
      o.x = A[last] + dx * t; o.y = B[last] + dy * t;
      o.tx = dx / len; o.ty = dy / len;
    } else if (q <= L[0]) {
      /* au-dela du plus vieux point : on prolonge en ligne droite */
      const dx = A[1] - A[0], dy = B[1] - B[0];
      const len = Math.hypot(dx, dy) || 1;
      o.tx = dx / len; o.ty = dy / len;
      o.x = A[0] + o.tx * (q - L[0]); o.y = B[0] + o.ty * (q - L[0]);
    } else {
      let lo = 0, hi = last;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= q) lo = m; else hi = m; }
      const seg = L[hi] - L[lo] || 1;
      const t = (q - L[lo]) / seg;
      const dx = A[hi] - A[lo], dy = B[hi] - B[lo];
      o.x = A[lo] + dx * t; o.y = B[lo] + dy * t;
      const len = Math.hypot(dx, dy) || 1;
      o.tx = dx / len; o.ty = dy / len;
    }
    o.nx = -o.ty; o.ny = o.tx;
    return o;
  }

  /**
   * Fait avancer l'apex. `da` en um, `dom` en rad/s ajoutes a la vitesse
   * angulaire. Le passe n'est jamais retouche : ce qui est construit est
   * rigide, c'est la definition d'une paroi.
   */
  avancer(da, dt) {
    this.th += this.om * dt;
    this.x += Math.cos(this.th) * da;
    this.y += Math.sin(this.th) * da;
    this.avanceFrame = da;
    this.longueur += da;

    const last = this.ax.length - 1;
    const d = Math.hypot(this.x - this.ax[last], this.y - this.ay[last]);
    if (d >= PAS) {
      this.ax.push(this.x); this.ay.push(this.y);
      this.al.push(this.al[last] + d);
      if (this.ax.length > MAX_PTS) {
        this.ax.shift(); this.ay.shift(); this.al.shift();
      }
    }
  }

  /**
   * Le contour : un seul polygone ferme. Rendu dans `xs`/`ys` (Float32Array
   * fournis par l'appelant, recycles) ; renvoie le nombre de sommets.
   *
   * La calotte est echantillonnee en ANGLE et non en abscisse : le profil a
   * une pente infinie a la pointe, un echantillonnage regulier en s y
   * produirait une facette franche de plusieurs pixels.
   */
  contour(xs, ys, sMax, K = 30) {
    const Lc = this.Lc;
    const tmp = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 };
    let n = 0;

    /* abscisses a echantillonner, de la pointe vers l'arriere */
    const ss = this._ss || (this._ss = []);
    ss.length = 0;
    for (let k = 0; k <= K; k++) {
      const psi = (k / K) * (Math.PI / 2);
      ss.push(Lc * (1 - Math.cos(psi)));
    }
    /* corps : pas fin pres de l'apex, plus large au loin (le tube y est droit) */
    let s = Lc;
    while (s < sMax) {
      /* 1,2 um au maximum : a 2,4 um les facettes de l'ondulation se
         voyaient sur le flanc du tube. */
      s += lerp(0.5, 1.2, smoothstep(Lc, Lc + 22, s));
      ss.push(Math.min(s, sMax));
    }

    /* cote +v, de la pointe vers l'arriere */
    for (let i = 0; i < ss.length; i++) {
      const si = ss[i];
      this.atS(si, tmp);
      const w = this.W(si);
      xs[n] = tmp.x + tmp.nx * w; ys[n] = tmp.y + tmp.ny * w; n++;
    }
    /* cote -v, de l'arriere vers la pointe. On saute le dernier (la pointe,
       ou W = 0) : le polygone se refermera dessus tout seul. */
    for (let i = ss.length - 1; i >= 1; i--) {
      const si = ss[i];
      this.atS(si, tmp);
      const w = this.W(si);
      xs[n] = tmp.x - tmp.nx * w; ys[n] = tmp.y - tmp.ny * w; n++;
    }
    return n;
  }

  /**
   * Table (s -> position, normale) rendue une fois par image : le contenu
   * vit en coordonnees de tube et doit etre projete des centaines de fois.
   * Une recherche dichotomique par particule coute plus cher que la table.
   */
  table(sMax, pas = 0.3) {
    const n = Math.ceil(sMax / pas) + 2;
    let T = this._T;
    if (!T || T.n !== n) {
      T = this._T = { n, pas, x: new Float32Array(n), y: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n) };
    }
    T.pas = pas;
    const tmp = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 };
    for (let i = 0; i < n; i++) {
      this.atS(i * pas, tmp);
      T.x[i] = tmp.x; T.y[i] = tmp.y; T.nx[i] = tmp.nx; T.ny[i] = tmp.ny;
    }
    return T;
  }
}

/** Projection (s, v) -> monde, via la table. */
export function versMonde(T, s, v, out) {
  const f = clamp(s / T.pas, 0, T.n - 1.001);
  const i = f | 0, t = f - i;
  const x = lerp(T.x[i], T.x[i + 1], t);
  const y = lerp(T.y[i], T.y[i + 1], t);
  let nx = lerp(T.nx[i], T.nx[i + 1], t);
  let ny = lerp(T.ny[i], T.ny[i + 1], t);
  const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
  out.x = x + nx * v; out.y = y + ny * v;
  out.nx = nx; out.ny = ny;
  return out;
}

/**
 * Distance d'un point (s, v) a la paroi, et direction rentrante.
 *
 * Dans le corps c'est trivial : W(s) - |v|. Dans la calotte, non : a 0,5 um
 * de la pointe la paroi est devant, pas sur le cote, et W(s) - |v| surestime
 * la distance d'un facteur 10. Une vesicule s'y serait plantee dans le nez.
 * On passe donc par la fonction implicite du profil.
 */
export function distParoi(hy, s, v, out) {
  const Lc = hy.Lc, R = hy.R, n = hy.profil;
  if (s >= Lc) {
    const w = hy.W(s);
    const d = w - Math.abs(v);
    if (out) { out.ds = 0; out.dv = v >= 0 ? -1 : 1; out.phi = v >= 0 ? Math.PI / 2 : -Math.PI / 2; }
    return d;
  }
  const u = clamp((Lc - s) / Lc, 0, 1);
  const a = Math.pow(u, n) + Math.pow(Math.abs(v) / R, n);
  const F = Math.pow(a, 1 / n);
  if (F < 1e-5) { if (out) { out.ds = 1; out.dv = 0; out.phi = 0; } return Lc; }
  /* gradient de F, puis distance de premier ordre (1-F)/|grad F| */
  const gu = Math.pow(u, n - 1) * Math.pow(a, 1 / n - 1);
  const gv = (Math.sign(v) / R) * Math.pow(Math.abs(v) / R, n - 1) * Math.pow(a, 1 / n - 1);
  const gsr = -gu / Lc;
  const g = Math.hypot(gsr, gv) || 1e-6;
  if (out) {
    /* direction rentrante = -grad F normalise ; phi = angle sur la calotte,
       0 droit devant, +-PI/2 a l'epaule */
    out.ds = -gsr / g; out.dv = -gv / g;
    out.phi = Math.atan2(gv, -gsr);
  }
  return (1 - F) / g;
}
