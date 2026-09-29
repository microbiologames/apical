/* ---------------------------------------------------------------------------
   Le sporocyste, vu au microscope.

   Meme banc optique que l'apex et que la colonie : meme `Screen`, memes huit
   calques de profondeur, meme tramage, meme grain. D'ou l'heritage de
   `Scene`, qui apporte le fond, le milieu, le grain et le texte.

   CE QUI CHANGE : il y a une VRAIE troisieme dimension. Le sporangiophore
   monte vers l'observateur, les rhizoides plongent sous lui, et le stolon
   reste ou il est. La mise au point suit la pointe — donc tout le reste
   sort du plan et devient flou en quelques micrometres. C'est le geste
   qu'on fait vraiment devant une preparation, et c'est aussi la seule facon
   de montrer 380 um de tige dans un cadre de 200.

   La profondeur de champ est de 22 um : au-dela, flou maximal. Les huit
   calques de `Screen` portaient deja ca pour le contenu d'un tube ; ici ils
   portent une scene entiere.

   La projection est oblique : (x, y, z) -> (x, y - z.KZ). KZ = 0,26, donc
   380 um de montee ne font que 99 um dans l'image — le sporangiophore est
   vu en RACCOURCI. C'est ce que demande « il monte legerement vers le
   haut » : l'essentiel de sa longueur est vers nous, pas vers le haut.
--------------------------------------------------------------------------- */

import { Scene } from './scene.js';
import { hexToRgba, mix32, fade32, shade32, Screen } from '../core/pixel.js';
import { clamp, lerp, smoothstep, TAU } from '../core/util.js';
import { R_SAC, R_COL, R_TIGE } from '../sim/sporange.js';

const KZ = 0.26;          // part de z rendue dans l'image
/* Profondeur de champ, en um : ecart au plan de mise au point pour le flou
   maximal. Elle se REFERME quand on monte en grossissement — c'est ce que
   fait un objectif reel, et c'est la seule chose qui isole une spore dans un
   nuage. A 22 um, les voisines de celle qu'on suit restaient nettes et on
   suivait un mur de spores au lieu d'une. */
const DOF = 22;

export class VueSporange extends Scene {
  /** Projection oblique : la seule chose qui fasse exister z a l'ecran. */
  px3(x, y, z) { return this.sx(x); }
  py3(x, y, z) { return this.sy(y - z * KZ); }

  /** Calque pour une profondeur z, en um. */
  plan3(z, plancher = 0) {
    const dz = (z - this.zF) / (this.dof || DOF);
    const n = clamp(Screen.blurLevel(clamp(Math.abs(dz), 0, 1)), plancher, 3);
    return Screen.layerFor(dz, n);
  }

  /**
   * @param {Sporange} sp
   * @param {number}   zF   plan de mise au point, en um
   */
  dessiner(sp, pal, t, zF, opts = {}) {
    const sc = this.sc;
    this.alloc(sc.w, sc.h);
    this.zF = zF;
    const P = pal;
    sc.beginFrame(hexToRgba(P.fond));

    this.fond(P, opts);
    if (opts.milieu !== false) this.milieu(P, t);

    for (const passe of ['halo', 'corps']) {
      this.rhizoides(sp, P, passe);
      this.stolon(sp, P, passe);
      this.tige(sp, P, passe);
    }
    this.pointeArrondie(sp, P);
    this.sacEtSpores(sp, P);

    sc.composite(P.dither);
    if (opts.grain !== false) this.grainCapteur(P, t);
    if (opts.echelle !== false) this.barreEchelle(P);
  }

  /* --- tubes --------------------------------------------------------------- */

  /**
   * Un troncon de tube entre deux points 3D, avec sa paroi et son halo.
   *
   * Dessine troncon par troncon et NON d'un seul polygone, parce que chaque
   * troncon est a une profondeur differente : c'est le seul moyen pour que
   * la tige soit nette pres de la pointe et fondue a sa base. Un polygone
   * unique aurait une seule profondeur, donc un seul flou, et la tige
   * paraitrait couchee dans le plan.
   */
  troncon(a, b, wa, wb, P, passe) {
    const sc = this.sc;
    const ax = this.px3(a.x, a.y, a.z), ay = this.py3(a.x, a.y, a.z);
    const bx = this.px3(b.x, b.y, b.z), by = this.py3(b.x, b.y, b.z);
    let dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy) || 1e-6; dx /= l; dy /= l;
    const nx = -dy, ny = dx;
    const A = wa * this.pxUm, B = wb * this.pxUm;
    const z = (a.z + b.z) * 0.5;

    const xs = this._tx || (this._tx = new Float32Array(8));
    const ys = this._ty || (this._ty = new Float32Array(8));
    xs[0] = ax + nx * A; ys[0] = ay + ny * A;
    xs[1] = bx + nx * B; ys[1] = by + ny * B;
    xs[2] = bx - nx * B; ys[2] = by - ny * B;
    xs[3] = ax - nx * A; ys[3] = ay - ny * A;

    /* LE HALO EST UNE PASSE A PART, sur toute la geometrie, avant les
       corps. Dessine troncon par troncon dans la foulee du sien, il
       recouvrait le troncon SUIVANT : une couture claire en travers du
       tube tous les six micrometres, parfaitement visible. */
    if (passe === 'halo') {
      sc.layer(this.plan3(z, 1));
      const h = 2.2;
      const hx = this._hx || (this._hx = new Float32Array(8));
      const hy2 = this._hy || (this._hy = new Float32Array(8));
      for (let i = 0; i < 4; i++) {
        const k = i === 0 || i === 1 ? 1 : -1;
        hx[i] = xs[i] + nx * k * h; hy2[i] = ys[i] + ny * k * h;
      }
      this.remplir(hx, hy2, 4, fade32(hexToRgba(P.halo), P.haloForce * 0.5));
      return;
    }
    sc.layer(this.plan3(z));
    this.remplir(xs, ys, 4, hexToRgba(P.cyto));
    /* Paroi : deux traits, pas une bande — a 4 um de demi-largeur elle fait
       moins de deux pixels et une bande la mangerait. */
    const cP = hexToRgba(P.paroi);
    sc.line(xs[0], ys[0], xs[1], ys[1], cP);
    sc.line(xs[3], ys[3], xs[2], ys[2], cP);
  }

  stolon(sp, P, passe) {
    const c = Math.cos(sp.thStolon), s = Math.sin(sp.thStolon);
    const L = 420;
    for (let k = -L; k < L; k += 24) {
      this.troncon(
        { x: sp.x0 + c * k, y: sp.y0 + s * k, z: 0 },
        { x: sp.x0 + c * (k + 24), y: sp.y0 + s * (k + 24), z: 0 },
        5.5, 5.5, P, passe);
    }
  }

  /**
   * Les rhizoides. On ne les verra presque pas : ils plongent, donc ils
   * sortent du plan de mise au point en deux secondes. Ils existent quand
   * meme — c'est le meme evenement qui les declenche, et un sporangiophore
   * sans ancrage est un dessin, pas un organisme.
   */
  rhizoides(sp, P, passe) {
    for (const r of sp.rhizoides) {
      if (r.long < 1) continue;
      const n = Math.max(2, Math.ceil(r.long / 9));
      let prev = { x: sp.x0, y: sp.y0, z: 0 };
      for (let i = 1; i <= n; i++) {
        const u = i / n, d = r.long * u;
        const a = r.a + r.courbe * u * u;
        const q = {
          x: sp.x0 + Math.cos(a) * d * (1 - r.plonge),
          y: sp.y0 + Math.sin(a) * d * (1 - r.plonge),
          z: -d * r.plonge,
        };
        const w = lerp(2.6, 0.7, u);
        if (passe === 'corps') this.troncon(prev, q, lerp(2.6, w, (i - 1) / n), w, P, passe);
        prev = q;
      }
    }
  }

  tige(sp, P, passe) {
    const T = sp.tige;
    /* On arrete la tige sous la columelle des qu'elle existe. Le haut du
       sporangiophore est DANS le sac : dessine quand meme, son halo — qui
       est un quadrilatere opaque — se retrouvait au premier plan des que le
       plan de mise au point passait sous la pointe, et posait un rectangle
       blanc en travers de la columelle. */
    const zMax = sp.rCol > 0.6 ? sp.pointe.z - sp.rCol * 0.75 : Infinity;
    /* Pas de 2 points : un troncon par 6 um de montee suffit, et ca divise
       par deux le nombre de polygones a remplir. */
    for (let i = 1; i < T.length; i += 2) {
      const a = T[i - 1], b = T[Math.min(i + 1, T.length - 1)];
      if (a.z > zMax) break;
      /* Un troncon degenere — deux points confondus en fin de liste — donne
         un quadrilatere plat que `remplir` rend comme une tache. */
      if (Math.abs(b.z - a.z) < 1e-6 && Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
      this.troncon(a, b, sp.largeur(a.z), sp.largeur(b.z), P, passe);
    }
  }

  /**
   * La pointe du sporangiophore tant qu'elle n'a pas gonfle. Sans ce dome,
   * la tige finissait par une coupe franche — un tube scie, pas un apex.
   */
  pointeArrondie(sp, P) {
    if (sp.rCol > 0.6) return;
    const sc = this.sc, T = sp.tige;
    const p = T[T.length - 1], q = T[Math.max(0, T.length - 3)];
    const x = this.px3(p.x, p.y, p.z), y = this.py3(p.x, p.y, p.z);
    const qx = this.px3(q.x, q.y, q.z), qy = this.py3(q.x, q.y, q.z);
    const ang = Math.atan2(y - qy, x - qx);
    const w = sp.largeur(p.z) * this.pxUm;
    sc.layer(this.plan3(p.z, 1));
    sc.ell(x, y, w * 1.35, w * 1.35, 0, fade32(hexToRgba(P.halo), P.haloForce * 0.5), 0);
    sc.layer(this.plan3(p.z));
    sc.ell(x, y, w * 1.06, w, ang, hexToRgba(P.cyto), hexToRgba(P.paroi));
  }

  /**
   * L'apophyse et la columelle : un dome plein, posé au bout de la tige et
   * qui reste DANS le sac. Sur les planches c'est la piece la plus sombre de
   * tout le sporocyste — c'est du cytoplasme dense vu a travers la masse des
   * spores.
   */
  columelle(sp, P) {
    if (sp.rCol < 0.2) return;
    const sc = this.sc, p = sp.pointe;
    const x = this.px3(p.x, p.y, p.z), y = this.py3(p.x, p.y, p.z);
    const R = sp.rCol * this.pxUm;
    /* Meme calque impose que le remplissage du sac, et dessinee juste
       apres : elle est DANS le sac, donc derriere sa face avant. Les spores
       du devant passeront par-dessus, celles du fond resteront derriere. */
    sc.layer(Screen.layerFor(-1, 2));
    const cC = mix32(hexToRgba(P.cytoBord), hexToRgba(P.membrane), 0.72);
    sc.ell(x, y - R * 0.34, R, R * 0.88, 0, cC, 0);
    /* Le col : elle se raccorde a la tige sans couture. */
    sc.ell(x, y, R * 0.62, R * 0.5, 0, cC, 0);
  }

  /* --- le sac et les spores ------------------------------------------------- */

  sacEtSpores(sp, P) {
    const sc = this.sc;
    if (sp.rSac < 0.2 && !sp.spores.length) return;
    const C = sp.centre;
    const cx = this.px3(C.x, C.y, C.z), cy = this.py3(C.x, C.y, C.z);
    const S = sp.sac, n = S.n;

    /* 1. la masse : l'interieur du sac, qui est du cytoplasme en train de se
          cloisonner. Il est plus clair que le tube — c'est ce qui fait lire
          le sac comme une baie et non comme une bulle. */
    if (sp.rSac > 0.2) {
      const xs = this._sx || (this._sx = new Float32Array(160));
      const ys = this._sy || (this._sy = new Float32Array(160));
      /* La silhouette d'une SPHERE cisaillee par la projection oblique est
         une ellipse, pas un cercle : demi-axe vertical x sqrt(1 + KZ^2).
         Tracee en cercle, les spores du fond et du devant debordaient. */
      const ky = Math.sqrt(1 + KZ * KZ);
      let m = 0;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU, r = sp.rayonSac(i) * this.pxUm;
        xs[m] = cx + Math.cos(th) * r; ys[m] = cy + Math.sin(th) * r * ky; m++;
      }
      sc.layer(this.plan3(C.z, 1));
      const hx = this._shx || (this._shx = new Float32Array(160));
      const hy = this._shy || (this._shy = new Float32Array(160));
      for (let i = 0; i < m; i++) { hx[i] = cx + (xs[i] - cx) * 1.05; hy[i] = cy + (ys[i] - cy) * 1.05; }
      this.remplir(hx, hy, m, fade32(hexToRgba(P.halo), P.haloForce * 0.55));
      /* Le remplissage du sac va sur un calque ARRIERE impose, pas sur celui
         que sa profondeur donnerait. Sinon il arrive au premier plan et
         recouvre tout ce qui est dedans — a commencer par la columelle, qui
         est la piece la plus reconnaissable d'un sporocyste. Ce qui est
         dans un sac doit etre derriere sa face avant et devant sa face
         arriere ; un disque opaque au premier plan ne peut pas faire ca. */
      sc.layer(Screen.layerFor(-1, 2));
      this.remplir(xs, ys, m, fade32(mix32(hexToRgba(P.cyto), hexToRgba(P.grainClair), 0.45), 0.86));
      /* 2. la paroi du sac : un trait, interrompu la ou elle est dechiree. */
      const cP = hexToRgba(P.paroi);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (S.dechire[i] && S.dechire[j]) continue;
        sc.line(xs[i], ys[i], xs[j], ys[j], cP);
      }
    }

    /* 3. la columelle, DANS le sac : dessinee avant lui, son remplissage la
          recouvrait entierement — or c'est la piece la plus reconnaissable
          d'un sporocyste. Les spores du devant passeront par-dessus, celles
          du fond resteront derriere : les calques s'en chargent. */
    this.columelle(sp, P);

    /* 4. les spores. Elles sont placees en 3D dans la coque : celles du fond
          sont derriere le plan de mise au point, celles du devant sont
          nettes. C'est ce qui donne l'epaisseur au sac — dessinees a plat,
          elles font un motif, pas un volume. */
    const cFill = hexToRgba(P.periplasme);
    const cRim = hexToRgba(P.membrane);
    const cCoeur = hexToRgba(P.milieuClair);
    for (const s of sp.spores) {
      const wx = C.x + s.x, wy = C.y + s.y, wz = C.z + s.z;
      const x = this.px3(wx, wy, wz), y = this.py3(wx, wy, wz);
      if (x < -8 || y < -8 || x > this.w + 8 || y > this.h + 8) continue;
      const r = s.r * this.pxUm;
      if (r < 0.35) continue;
      sc.layer(this.plan3(wz, 0));
      /* Meme recette qu'une vesicule : disque plein et coeur plus clair. Un
         simple liseré sur fond clair donnait un anneau, pas un corps. */
      sc.ell(x, y, r, r * s.ov, s.ang, cFill, r > 1.6 ? cRim : 0);
      if (r > 2.2) sc.ell(x, y, r * 0.42, r * 0.42 * s.ov, s.ang, fade32(cCoeur, s.clair ? 0.5 : 0.28), 0);
    }
  }

  barreEchelle(P) {
    const sc = this.sc;
    const max = (this.w * 0.33) / this.pxUm;
    const choix = [10, 20, 50, 100, 200];
    let um = choix[0];
    for (const v of choix) if (v <= max) um = v;
    const L = Math.round(um * this.pxUm);
    if (L < 12) return;
    const x = this.w - L - 10, y = this.h - 12;
    const c = hexToRgba(P.paroi);
    for (let i = 0; i < L; i++) { sc.direct(x + i, y, c); sc.direct(x + i, y + 1, c); }
    const txt = `${um} um`;
    this.texte(txt, x + L - txt.length * 5, y - 8, c);
  }
}

export { KZ };
