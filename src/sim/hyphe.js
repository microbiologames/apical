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

   Retenu par l'auteur apres essai au curseur : Lc = 1.40 R, n = 2.1. Le
   dome est plus long qu'une demi-sphere, et l'exposant 2.1 l'aplatit juste
   assez. C'est un choix d'oeil, pas de calcul : les deux curseurs existent
   precisement pour que ce soit tranche en regardant.

   La paroi n'est JAMAIS epaissie avec le zoom : une paroi hyphale fait
   0,1 a 0,3 um, soit moins d'un pixel. On la trace en epaisseur ecran.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, noise1, TAU } from '../core/util.js';

const PAS = 0.22;          // um entre deux points d'axe memorises
const MAX_PTS = 1600;      // ~350 um de memoire, largement hors champ

/**
 * Pas d'echantillonnage du contour a l'abscisse s, en um.
 *
 * Fin pres de l'apex : a 1,2 um le polygone LISSAIT l'ondulation de paroi que
 * la membrane, elle, echantillonne tous les 0,09 um, et au fort grossissement
 * les deux lignes s'ecartaient jusqu'a 0,6 um l'une de l'autre sans raison.
 *
 * Grossier au loin, ou le tube est droit et le plus souvent hors champ :
 * `remplirMasque` reparcourt TOUS les sommets a chaque ligne de balayage, et
 * 200 um echantillonnes a 0,45 um en font 900. La membrane prolongee suit le
 * meme pas, pour que les deux lignes restent paralleles.
 */
export function pasContour(s, Lc) {
  if (s < 45) return lerp(0.35, 0.45, smoothstep(Lc, Lc + 22, s));
  return lerp(0.45, 2.4, smoothstep(45, 130, s));
}

export class Hyphe {
  constructor(opts = {}) {
    this.R = opts.R ?? 5.5;              // rayon du tube, um (diam. 11 um)
    this.calotte = opts.calotte ?? 1.40; // longueur de calotte, en rayons
    this.profil = opts.profil ?? 2.1;    // 2 = ogive ronde, 3 = nez plat
    this.graine = opts.graine ?? 1234;

    this.x = opts.x ?? 0; this.y = opts.y ?? 0;     // apex
    this.th = opts.th ?? -Math.PI / 2;   // cap, y vers le bas donc -PI/2 = haut
    this.om = 0;                         // vitesse angulaire, rad/s
    this.avanceFrame = 0;                // um avances a la derniere image
    this.longueur = 0;                   // um construits depuis le depart

    /* Une BRANCHE demarre a sa base, elle n'a pas d'histoire derriere elle,
       et son tube part etroit pour s'elargir : 0,55 R a la base, presque la
       pleine largeur apres 25 um. C'est ce que fait une vraie branche, et
       c'est aussi ce qui donne a la base sa lecture de jeune pousse. */
    this.branche = !!opts.branche;
    this.rBase = opts.rBase ?? 0.55;
    this.rMonte = opts.rMonte ?? 25;

    /* Axe stocke du plus ancien au plus recent. al = abscisse cumulee. */
    this.ax = []; this.ay = []; this.al = [];
    this.enAttente = 0;

    if (this.branche) {
      /* L'axe de naissance. Il est ENFONCE dans le parent : sans ce
         chevauchement l'union des deux tubes n'est pas connexe et la
         branche flotte a cote de sa mere.

         Et ce n'est PAS un segment droit. Deux raisons, mesurees toutes les
         deux :

           - la branche a besoin de ~7 um de tube des sa naissance. Avec
             3 um elle n'avait que 0,6 um de domaine simule, donc pas la
             place d'un Spitzenkorper, qui se tient a 2 um de la pointe :
             elle ne fusionnait pas, donc ne poussait pas, donc n'avait
             toujours pas de tube. 1,5 um en vingt secondes contre 6,4
             attendus ;
           - mais 7 um de tube DROIT plante en travers d'une mere de 11 um
             de diametre ressortent par le flanc oppose. Le conge de
             l'union, qui a 2,5 um de rayon, se mettait alors a ponter le
             bourgeon a la paroi d'en face et faisait bomber la mere sur
             toute sa longueur : 1 587 px ajoutes a la silhouette a la
             naissance, la ou il n'en faut aucun.

         L'axe part donc DE l'axe de la mere, dans son cytoplasme, et
         s'incurve vers le flanc. C'est aussi le mecanisme A : le second
         Spitzenkorper est sub-apical, il se forme dans le cytoplasme
         maternel avant que rien ne bombe a la surface. Il reste a le
         nourrir du pool de la mere ; pour l'instant chaque tige a le sien.
         Voir `brancherSur`, qui construit cette amorce. */
      const axe = opts.axe;
      let l = 0;
      for (let i = 0; i < axe.length; i++) {
        if (i > 0) l += Math.hypot(axe[i][0] - axe[i - 1][0], axe[i][1] - axe[i - 1][1]);
        this.ax.push(axe[i][0]); this.ay.push(axe[i][1]); this.al.push(l);
      }
      this.x = axe[axe.length - 1][0];
      this.y = axe[axe.length - 1][1];
      this.base = l;
      return;
    }

    /* On amorce avec 150 um de tube droit derriere : sans cette queue, au
       demarrage le tube s'arrete net au bord du champ. 150 et non 90 parce
       que le tube est maintenant DESSINE sur 200 um (S_VU) et non plus 34 :
       au-dela du plus vieux point d'axe, atS prolonge en ligne droite, ce
       qui donne le meme trait mais sans ondulation de paroi. */
    const n = Math.ceil(150 / PAS);
    for (let i = n; i >= 1; i--) {
      this.ax.push(this.x - Math.cos(this.th) * i * PAS);
      this.ay.push(this.y - Math.sin(this.th) * i * PAS);
      this.al.push((n - i) * PAS);
    }
    this.ax.push(this.x); this.ay.push(this.y); this.al.push(n * PAS);
    this.base = n * PAS;   // abscisse cumulee deja parcourue a l'amorce
  }

  /**
   * Rayon local du tube pour le MATERIAU a l'abscisse cumulee q depuis
   * l'origine. Constant pour une hyphe mere ; croissant pour une branche.
   * Indexe sur le materiau et non sur s, sinon l'elargissement resterait
   * fige dans le repere de l'apex et la branche n'aurait jamais l'air de
   * grossir.
   */
  rayonA(q) {
    if (!this.branche) return this.R;
    return this.R * (this.rBase + (1 - this.rBase) * smoothstep(0, this.rMonte, q));
  }

  /**
   * Longueur de la calotte ARRIERE d'une branche. Une branche n'est pas un
   * tube coupe net : c'est un bourgeon, ferme des deux bouts. Sans ce fond
   * arrondi, sa section de base — un disque de 3 um de rayon pose a 3,2 um
   * sous la paroi de la mere — depassait par endroits du tube parent, et
   * l'union laissait voir une arete droite en travers du cytoplasme.
   */
  get Lb() { return this.branche ? 1.2 : 0; }

  /** Abscisse cumulee totale, apex compris. */
  get total() {
    const i = this.ax.length - 1;
    return this.al[i] + Math.hypot(this.x - this.ax[i], this.y - this.ay[i]);
  }

  get Lc() {
    /* La calotte suit le rayon LOCAL de la pointe : une jeune branche a une
       petite calotte, sinon son dome ferait deux fois son tube. */
    return this.calotte * (this.branche ? this.rayonA(this.total) : this.R);
  }

  /** Demi-largeur du tube a l'abscisse s (0 = pointe de l'apex). */
  W(s) {
    const Lc = this.Lc;
    const R = this.branche ? this.rayonA(this.total - s) : this.R;
    let w;
    if (s >= Lc) {
      w = R;
    } else {
      const u = clamp((Lc - s) / Lc, 0, 1);
      const n = this.profil;
      w = R * Math.pow(Math.max(1 - Math.pow(u, n), 0), 1 / n);
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
    /* Fond de la branche : meme ogive qu'a l'apex, mais sur l'abscisse
       MATERIELLE depuis l'origine, donc figee a la base une fois pour
       toutes. W(total) = 0 : le bourgeon est un volume ferme, et l'union
       avec la mere n'a aucune arete a cacher. */
    if (this.branche) {
      const q = this.total - s;
      const Lb = this.Lb;
      if (q < Lb) {
        const u = clamp((Lb - q) / Lb, 0, 1);
        const n = this.profil;
        w *= Math.pow(Math.max(1 - Math.pow(u, n), 0), 1 / n);
      }
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
    const tmp = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 };
    let n = 0;

    /* Une BRANCHE s'arrete a son propre materiau : au-dela, atS prolonge
       l'axe en ligne droite et le tube lui poussait une queue de 34 um en
       travers de sa mere. */
    const sTot = this.branche ? Math.min(sMax, this.total) : sMax;
    /* Les deux calottes ne peuvent pas se chevaucher : sur un bourgeon de
       3 um, une calotte avant de 4,4 um et une calotte arriere de 2,6 um
       se recouvrent et l'echantillonnage n'est plus monotone. */
    const Lc = Math.min(this.Lc, sTot * 0.5);
    const Lb = this.branche ? Math.min(this.Lb, sTot * 0.5) : 0;

    /* abscisses a echantillonner, de la pointe vers l'arriere */
    const ss = this._ss || (this._ss = []);
    ss.length = 0;
    const pousser = (v) => {
      v = v < 0 ? 0 : v > sTot ? sTot : v;
      if (!ss.length || v > ss[ss.length - 1] + 1e-4) ss.push(v);
    };
    for (let k = 0; k <= K; k++) {
      const psi = (k / K) * (Math.PI / 2);
      pousser(Lc * (1 - Math.cos(psi)));
    }
    /* corps : pas fin pres de l'apex, plus large au loin (le tube y est droit) */
    let s = Lc;
    const sCorps = sTot - Lb;
    while (s < sCorps) {
      s += pasContour(s, Lc);
      pousser(Math.min(s, sCorps));
    }
    /* Calotte ARRIERE du bourgeon, echantillonnee en angle pour la meme
       raison qu'a l'avant : le profil y a une pente infinie, un pas
       regulier en s y aurait produit une facette de plusieurs pixels. */
    if (Lb > 0) for (let k = K; k >= 0; k--) {
      const psi = (k / K) * (Math.PI / 2);
      pousser(sTot - Lb * (1 - Math.cos(psi)));
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

/**
 * Fait naitre une branche sur `par`, a `s` um derriere son apex.
 *
 * Une branche n'est pas un second objet : c'est un second AXE, et la
 * silhouette reste l'union des deux tubes (Scene.unir). Son apex nait
 * 3,6 um SOUS la paroi de sa mere, et son bourgeon s'enfonce encore de 6 um
 * derriere : a la naissance il est entierement dans le cytoplasme maternel,
 * donc invisible, et il emerge en grandissant. Sans ce chevauchement
 * l'union ne serait pas connexe et la branche flotterait a cote de sa mere.
 *
 * 3,6 um et non 1 : le conge de l'union a un rayon de 2,5 um, et un apex
 * pose plus pres que ca faisait deja bomber la paroi de la mere avant que
 * la branche n'existe. A la naissance il ne doit RIEN se passer — le
 * renflement vient apres, des le premier micrometre de pousse.
 *
 * Angle 45-90 deg, le plus souvent 60-80 (Trinci) ; diametre initial
 * ~0,6 fois celui du parent, d'ou rBase, et 0,86 a terme.
 */
export function brancherSur(par, o = {}) {
  const cote = o.cote ?? 1;
  const ang = o.angle ?? (70 * Math.PI / 180);
  const s = o.s ?? 11;
  const p = par.atS(s, {});
  const w = par.W(s);
  /* La tangente du parent basculee de `ang` vers le flanc choisi : a 0 la
     branche partirait dans l'axe, a 90 deg droit sur le cote. */
  const dx = Math.cos(ang) * p.tx + Math.sin(ang) * cote * p.nx;
  const dy = Math.cos(ang) * p.ty + Math.sin(ang) * cote * p.ny;

  /* Amorce : une Bezier quadratique P0 -> P1 -> P2.
       P2 l'apex, 3,6 um SOUS la paroi — plus pres, le conge de 2,5 um
          ferait deja bomber la mere alors que la branche n'existe pas ;
       P1 en arriere de l'apex DANS la direction de la branche, ce qui fixe
          la tangente de sortie : sans lui l'amorce arrivait a l'apex par la
          radiale et il y avait un coude de 20 deg a la jonction ;
       P0 sur l'axe de la mere, 4 um derriere : l'amorce part donc parallele
          au tube parent, au coeur du cytoplasme, et ne peut pas en sortir. */
  const P2 = [p.x + cote * p.nx * (w - 3.6), p.y + cote * p.ny * (w - 3.6)];
  const P1 = [P2[0] - dx * 2.5, P2[1] - dy * 2.5];
  const P0 = [P1[0] - p.tx * 4.0, P1[1] - p.ty * 4.0];
  const axe = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    axe.push([u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0],
              u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]);
  }

  return new Hyphe({
    graine: o.graine ?? 1,
    branche: true,
    R: par.R * (o.R ?? 0.86),
    calotte: par.calotte, profil: par.profil,
    axe,
    th: Math.atan2(dy, dx),
  });
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
  /* Rayon LOCAL : sur une branche le tube s'elargit avec le materiau, et
     une vesicule qui croirait le tube plein calibre se planterait dans la
     paroi a mi-hauteur du bourgeon. */
  const Lc = hy.Lc, n = hy.profil;
  const R = hy.branche ? hy.rayonA(hy.total - s) : hy.R;
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
