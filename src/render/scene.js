/* ---------------------------------------------------------------------------
   Rendu.

   Ordre de passage, et pourquoi :
     1. fond + vignetage            ecrit direct dans le tampon principal
     2. bande de distance au contour   (exacte, calculee depuis le polygone)
     3. remplissage du cytoplasme   direct aussi : c'est la plus grosse
        surface de l'image, la faire passer par un calque flouté coute cher
        pour rien, elle est nette par construction
     4. contenu (grains, organites, vesicules, molecules) sur les 8 calques
        de profondeur, selon l'ecart au plan de mise au point
     5. paroi + halo sur les calques avant
     6. composition (flou par calque + tramage ordonne)
     7. grain de capteur + barre d'echelle

   La paroi n'est pas un objet : c'est la bande |d| < e autour du MEME
   polygone qui a servi a remplir le cytoplasme. Il ne peut donc pas y avoir
   de desaccord entre la silhouette et son liseré.
--------------------------------------------------------------------------- */

import { Screen, hexToRgba, mix32, fade32, shade32, rgba, bayer } from '../core/pixel.js';
import { clamp, lerp, smoothstep, fbm2, noise2, hash2, noise1, TAU } from '../core/util.js';
import { versMonde, pasContour } from '../sim/hyphe.js';
import { DUREE_FUSION } from '../sim/contenu.js';
import { omega, PAS as PAS_MEMB } from '../sim/membrane.js';

/* Portee du champ de distance.

   Une hyphe SEULE n'a besoin que du halo : 7 px, comme avant. Des qu'il y a
   DEUX tubes il faut beaucoup plus, parce que l'union est un minimum adouci
   et qu'on ne peut pas raccorder plus large que ce qu'on mesure : le conge
   d'une base de branche fait 2,5 um, soit 27 px au cadrage par defaut. A
   1 um la jonction se lisait encore comme un V — deux tubes poses l'un sur
   l'autre, exactement ce qu'on ne veut pas.

   Mesure a 126 kpx, en rendu logiciel : la portee large coute 2,8 ms par
   image et par tube. C'est pour ca qu'elle est CONDITIONNELLE — l'hyphe
   seule, qui est le cas courant, ne paye rien.

   Le HALO, lui, reste a 6 px dans tous les cas : c'est un reglage d'oeil,
   pas une portee de calcul. */
const BANDE = 30;
const HALO = 6;

/* Longueur de tube DESSINEE derriere l'apex, en um — a distinguer de S_MAX,
   qui est la longueur SIMULEE (vesicules, grains, organites, membrane,
   depots) et reste a 34 um.

   Les deux etaient confondues, et le tube s'arretait donc net a 34 um. Tant
   que la camera suit l'apex ca ne se voit pas, la coupe est hors champ. Mais
   des qu'on regarde autre chose que la pointe — une jonction de branche, et
   demain le thalle — l'apex s'eloigne, la coupe avance avec lui et finit par
   depasser la ramification : on voit la branche accrochee a un moignon, et
   la base du bourgeon, que le tube de la mere est justement la pour cacher.

   200 um : a 20 um/min, dix minutes avant que la coupe rattrape une branche
   nee a 9 um de l'apex. Ca ne coute presque rien — le contour est echantillonne
   de plus en plus grossierement vers l'arriere (`pasContour`), 467 sommets au
   lieu de 197, et tout ce qui est hors cadre est rejete par sa boite. */
const S_VU = 200;
const MAX_SOMMETS = 4096;

/* Fonte 4x6, juste de quoi ecrire la barre d'echelle. */
const GLYPHES = {
  '0': [6, 9, 9, 9, 9, 6], '1': [2, 6, 2, 2, 2, 7], '2': [6, 9, 1, 2, 4, 15],
  '5': [15, 8, 14, 1, 9, 6], 'u': [0, 0, 9, 9, 9, 7], 'm': [0, 0, 10, 15, 9, 9],
  ' ': [0, 0, 0, 0, 0, 0],
};

export class Scene {
  constructor(screen) {
    this.sc = screen;
    this.cam = { x: 0, y: 0 };
    this.pxUm = 10;
    this.zFocus = 0;
    this.xs = new Float32Array(MAX_SOMMETS);
    this.ys = new Float32Array(MAX_SOMMETS);
    this.n = 0;
    this.w = 256; this.h = 352;
    this.box = { x0: 0, y0: 0, x1: -1, y1: -1 };
    this.pt = { x: 0, y: 0 };
    this.tempsGrain = 0;
    this.seedGrain = 0;
  }

  alloc(w, h) {
    if (this.w === w && this.h === h && this.mask) return;
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    /* Le vignetage ne depend que de la position dans le cadre : le
       recalculer par image coutait un hypot sur 118 000 pixels. */
    this.vign = new Float32Array(w * h);
    const cx = w * 0.5, cy = h * 0.5, rmax = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.vign[y * w + x] = smoothstep(0.52, 1.02, Math.hypot(x - cx, y - cy) / rmax) * 0.85;
      }
    }
    this.dist = new Float32Array(w * h);
    this.portee = HALO + 1;
    this.dist.fill(BANDE + 1);
    /* Quel tube est le plus proche : sert a savoir de quelle hyphe un pixel
       de paroi tient sa maturite et sa texture. */
    this.own = new Uint8Array(w * h);
    this.champs = null;
    this.box = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  }

  /* --- geometrie --------------------------------------------------------- */

  sx(wx) { return (wx - this.cam.x) * this.pxUm + this.w * 0.5; }
  sy(wy) { return (wy - this.cam.y) * this.pxUm + this.h * 0.5; }

  /* --- passes ------------------------------------------------------------ */

  /**
   * `tiges` : [{hy, co}, ...]. Une hyphe seule est un tableau d'un element.
   *
   * On ne dessine JAMAIS deux silhouettes. On calcule un champ de distance
   * signe par tube, on en prend le minimum adouci, et tout le reste — le
   * remplissage, la paroi, le halo — lit ce champ-la. Il ne peut donc pas y
   * avoir deux contours qui se croisent : il y a un contour, avec un Y
   * dedans.
   */
  dessiner(tiges, pal, t, opts) {
    const sc = this.sc;
    this.alloc(sc.w, sc.h);
    const P = pal;
    const n = tiges.length;
    this.portee = n > 1 ? BANDE : HALO + 1;

    const fond = hexToRgba(P.fond);
    sc.beginFrame(fond);

    this.fond(P, opts);
    if (opts.milieu !== false) this.milieu(P, t);

    for (let i = 0; i < n; i++) {
      const f = this.champ(i);
      f.actif = true;
      this.contourEcran(tiges[i].hy, f);
      this.bandeDistance(f);
      this.remplirMasque(f);
    }
    for (let i = n; i < (this.champs?.length ?? 0); i++) this.champs[i].actif = false;
    this.unir(n);

    this.cytoplasme(tiges, P, t, opts);
    for (let i = 0; i < n; i++) this.contenu(tiges[i].hy, tiges[i].co, P, opts);
    this.paroi(tiges, P, opts);
    for (let i = 0; i < n; i++) {
      this.membraneLigne(tiges[i].hy, tiges[i].co, P, opts, i);
      this.fusions(tiges[i].hy, tiges[i].co, P, opts, i);
      if (opts.depots !== false) this.tracesParoi(tiges[i].hy, tiges[i].co, P, i);
    }
    if (opts.milieu !== false) this.milieuAvant(P);

    sc.composite(P.dither);

    if (opts.grain !== false) this.grainCapteur(P, t);
    if (opts.echelle !== false) this.barreEchelle(P);
  }

  fond(P, opts) {
    const sc = this.sc, w = this.w, h = this.h;
    const c0 = hexToRgba(P.fond), c1 = hexToRgba(P.fondBord);
    const inv = 1 / this.pxUm;
    const cx = w * 0.5, cy = h * 0.5;
    const ox = this.cam.x - cx * inv, oy = this.cam.y - cy * inv;
    const vg = this.vign;
    /* `netFond` : 1 = net, 0 = completement defocalise. Une texture vue hors
       du plan de mise au point ne se brouille pas, elle S'APLATIT — c'est ce
       qu'on obtient en reduisant son amplitude. Sert a la sporulation, ou on
       s'eleve de 380 um au-dessus du substrat. */
    const asp = opts.milieu === false ? 0 : (opts.netFond ?? 1);
    /* Texture du milieu, indexee sur les coordonnees MONDE : c'est elle qui
       rend l'avancee lisible. Sur un fond uniforme l'apex a l'air de faire
       du surplace meme quand il progresse de trois pixels par seconde.
       Une seule octave de bruit bilineaire (4 hachages) plus un hachage sur
       la cellule monde : a trois octaves la seule passe de fond coutait
       6 ms et l'image tombait a 46 i/s. */
    /* Evalue par blocs de 2x2 et mis en cache par ligne : la texture varie
       sur ~30 px, l'echantillonner pixel par pixel coutait 2,4 millions de
       hachages par image pour un resultat identique. Le pas de 2 se voit
       d'autant moins qu'on est deja en pixel art. */
    let cache = this._bruitFond;
    if (!cache || cache.length !== (w >> 1) + 1) cache = this._bruitFond = new Float32Array((w >> 1) + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      if (asp && (y & 1) === 0) {
        const wy = (oy + y * inv) * 0.72;
        const wyh = ((oy + y * inv) * 3.1) | 0;
        for (let i = 0; i <= (w >> 1); i++) {
          const wx = ox + (i << 1) * inv;
          cache[i] = ((noise2(wx * 0.72, wy, 61) - 0.5) * 0.74
                    + (hash2((wx * 3.1) | 0, wyh, 83) - 0.5) * 0.26) * 0.13;
        }
      }
      for (let x = 0; x < w; x++) {
        let c = mix32(c0, c1, vg[row + x]);
        if (asp) c = shade32(c, cache[x >> 1]);
        sc.px[row + x] = c | 0xff000000;
      }
    }
  }

  /**
   * Particules du milieu : grains de gelose, debris, corps refringents.
   * Tires d'un hachage de cellules en coordonnees MONDE, donc stables et
   * infinis : la camera glisse dessus et c'est ce glissement qui donne
   * l'impression de progression. Ecrits en direct, donc sous le tube.
   */
  milieu(P, t) {
    const sc = this.sc, CELL = 2.4;
    const inv = 1 / this.pxUm;
    const x0 = this.cam.x - this.w * 0.5 * inv, x1 = this.cam.x + this.w * 0.5 * inv;
    const y0 = this.cam.y - this.h * 0.5 * inv, y1 = this.cam.y + this.h * 0.5 * inv;
    const cg = hexToRgba(P.milieuGrain), cd = hexToRgba(P.milieuDebris);
    const cc = hexToRgba(P.milieuClair);
    const K = this.pxUm;
    const av = [];
    for (let cy = Math.floor(y0 / CELL) - 1; cy <= Math.ceil(y1 / CELL) + 1; cy++) {
      for (let cx = Math.floor(x0 / CELL) - 1; cx <= Math.ceil(x1 / CELL) + 1; cx++) {
        const h0 = hash2(cx, cy, 991);
        if (h0 > 0.78) continue;
        const wx = (cx + hash2(cx, cy, 11)) * CELL;
        const wy = (cy + hash2(cx, cy, 23)) * CELL;
        const px = this.sx(wx), py = this.sy(wy);
        if (px < -8 || py < -8 || px > this.w + 8 || py > this.h + 8) continue;
        const z = hash2(cx, cy, 37);
        /* Debris flottant AU-DESSUS du plan focal. Le calque 7 a un rayon de
           flou de 4 px et un gain de 4,2 : a 10 % des cellules et 11 px de
           rayon, ils couvraient le champ de grosses taches molles, le tube
           compris. 2 % des cellules, 4 px maximum, alpha 0,08. */
        if (z > 0.978) { av.push([px, py, (0.12 + z * 0.20) * K, cd]); continue; }
        const k = hash2(cx, cy, 53);
        /* Les tailles sont en MICROMETRES et suivent le zoom. En pixels,
           les grains gardaient leur calibre pendant que leur espacement
           grandissait : le milieu avait l'air de glisser sur un autre
           plan. Un grain de gelose fait ~0,06 um, un debris ~0,18, un
           corps refringent ~0,14. */
        const e = 1 + z * 0.7;
        if (k < 0.70) {
          sc.dotDirect(px, py, 0.055 * e * K, fade32(cg, 0.55 + z * 0.4));
        } else if (k < 0.93) {
          sc.dotDirect(px, py, 0.17 * e * K, fade32(cd, 0.5 + z * 0.4));
        } else {
          const r = 0.13 * e * K;
          sc.dotDirect(px, py, r * 1.55, fade32(cd, 0.45));
          sc.dotDirect(px, py, r, fade32(cc, 0.8));
        }
      }
    }
    this._avant = av;
  }

  /** Les quelques debris flottant AU-DESSUS du plan : tres flous, devant tout. */
  milieuAvant(P) {
    const sc = this.sc;
    sc.layer(7);
    for (const [x, y, r, c] of (this._avant || [])) {
      sc.disc(x, y, r, fade32(c, 0.085));
    }
  }

  /* --- silhouette : un champ par tube, puis leur union ------------------- */

  /**
   * Le champ de distance d'UN tube. Alloue a la demande : une hyphe seule
   * n'en paye qu'un, et c'est le cas le plus frequent.
   */
  champ(i) {
    const c = this.champs || (this.champs = []);
    const n = this.w * this.h;
    if (!c[i] || c[i].dist.length !== n) {
      c[i] = {
        dist: new Float32Array(n), mask: new Uint8Array(n),
        xs: new Float32Array(MAX_SOMMETS), ys: new Float32Array(MAX_SOMMETS), n: 0,
        box: { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1 }, actif: false,
      };
      c[i].dist.fill(this.portee + 1);
    }
    return c[i];
  }

  contourEcran(hy, f) {
    const n = hy.contour(f.xs, f.ys, S_VU, 32);
    for (let i = 0; i < n; i++) {
      f.xs[i] = this.sx(f.xs[i]);
      f.ys[i] = this.sy(f.ys[i]);
    }
    f.n = n;
  }

  /**
   * Distance exacte au contour, dans une bande de +-BANDE px. On parcourt
   * les aretes et on garde le minimum : pas d'accumulation, donc pas de
   * double melange aux jointures, ce qui laissait des points sombres sur
   * chaque sommet quand on tracait arete par arete en src-over.
   */
  bandeDistance(f) {
    const { xs, ys, n, dist, mask } = f;
    const w = this.w, h = this.h;
    const b = f.box;
    const BANDE = this.portee;
    for (let y = Math.max(0, b.y0); y <= Math.min(h - 1, b.y1); y++) {
      dist.fill(BANDE + 1, y * w + Math.max(0, b.x0), y * w + Math.min(w - 1, b.x1) + 1);
      mask.fill(0, y * w + Math.max(0, b.x0), y * w + Math.min(w - 1, b.x1) + 1);
    }
    let X0 = w, Y0 = h, X1 = -1, Y1 = -1;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = xs[i], ay = ys[i], bx = xs[j], by = ys[j];
      const ex = bx - ax, ey = by - ay;
      const l2 = ex * ex + ey * ey || 1e-9;
      let x0 = Math.floor(Math.min(ax, bx) - BANDE), x1 = Math.ceil(Math.max(ax, bx) + BANDE);
      let y0 = Math.floor(Math.min(ay, by) - BANDE), y1 = Math.ceil(Math.max(ay, by) + BANDE);
      if (x1 < 0 || y1 < 0 || x0 >= w || y0 >= h) continue;
      x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, w - 1); y1 = Math.min(y1, h - 1);
      if (x0 < X0) X0 = x0; if (x1 > X1) X1 = x1;
      if (y0 < Y0) Y0 = y0; if (y1 > Y1) Y1 = y1;
      for (let y = y0; y <= y1; y++) {
        const row = y * w;
        const py = y + 0.5 - ay;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5 - ax;
          let u = (px * ex + py * ey) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const dx = px - ex * u, dy = py - ey * u;
          const d = Math.sqrt(dx * dx + dy * dy);
          const o = row + x;
          if (d < dist[o]) dist[o] = d;
        }
      }
    }
    f.box = { x0: X0, y0: Y0, x1: X1, y1: Y1 };
  }

  /**
   * Le plein du polygone, par balayage pair-impair : une seule silhouette,
   * aucune couture. C'est le remede au defaut qui a coule le prototype
   * precedent, ou chaque troncon etait rasterise pour son compte et faisait
   * onduler la paroi.
   *
   * Le masque dit seulement « dedans / dehors ». La peinture, elle, est une
   * passe separee, parce qu'avec deux tubes elle doit lire le champ UNI et
   * non celui du tube qu'on vient de remplir.
   */
  remplirMasque(f) {
    const { xs, ys, n, mask } = f;
    const w = this.w, h = this.h;
    let ymin = h, ymax = -1;
    for (let i = 0; i < n; i++) { const y = ys[i]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(h - 1, Math.ceil(ymax));
    const xsInt = this._xi || (this._xi = new Float32Array(256));

    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let m = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ya = ys[i], yb = ys[j];
        if ((ya <= yc) === (yb <= yc)) continue;
        const t2 = (yc - ya) / (yb - ya);
        if (m < 256) xsInt[m++] = xs[i] + (xs[j] - xs[i]) * t2;
      }
      if (m < 2) continue;
      for (let a = 1; a < m; a++) { const v = xsInt[a]; let b2 = a - 1; while (b2 >= 0 && xsInt[b2] > v) { xsInt[b2 + 1] = xsInt[b2]; b2--; } xsInt[b2 + 1] = v; }
      const row = y * w;
      for (let k = 0; k + 1 < m; k += 2) {
        const xa = Math.max(0, Math.ceil(xsInt[k] - 0.5));
        const xb = Math.min(w - 1, Math.floor(xsInt[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) mask[row + x] = 255;
      }
    }
  }

  /**
   * UNION DES TUBES. Une branche n'est pas un second objet pose a cote de
   * sa mere : c'est un second axe, et la silhouette est l'union des deux
   * tubes, prise comme un MINIMUM ADOUCI de leurs deux distances signees.
   *
   *   u = max(k - a, 0), v = max(k - b, 0)
   *   smin(a, b) = max(k, min(a, b)) - hypot(u, v)
   *
   * C'est le conge CIRCULAIRE, et le k qu'on lit est vraiment le rayon de
   * raccordement. Le minimum polynomial, essaye d'abord, ne creuse que k/4 :
   * a k = 1,1 um il rabotait la jonction de 0,25 um et l'angle rentrant se
   * lisait encore comme un V — deux tubes poses l'un sur l'autre, exactement
   * ce qu'on ne veut pas. Ici le rayon est le rayon.
   *
   * Il a aussi le bon comportement aux bords, sans rustine : des que les
   * deux distances depassent k, u et v sont nuls et le resultat est le
   * minimum EXACT. Le conge n'existe donc qu'a la jonction, et nulle part
   * ailleurs — la ou la formule polynomiale, elle, laissait un terme k/4
   * partout ou les deux champs saturaient a la meme valeur, soit un halo
   * fantome a exactement BANDE pixels de la paroi.
   *
   * k = 1,1 um, borne par la portee du champ : on ne peut pas raccorder
   * plus large que ce qu'on mesure.
   */
  unir(nt) {
    const { w, h, dist, mask, own } = this;
    const C = this.champs;
    const BANDE = this.portee;
    const k = clamp(2.5 * this.pxUm, 4, BANDE - 3);

    let X0 = w, Y0 = h, X1 = -1, Y1 = -1;
    for (let i = 0; i < nt; i++) {
      const b = C[i].box;
      if (b.x1 < b.x0) continue;
      if (b.x0 < X0) X0 = b.x0; if (b.x1 > X1) X1 = b.x1;
      if (b.y0 < Y0) Y0 = b.y0; if (b.y1 > Y1) Y1 = b.y1;
    }
    X0 = Math.max(0, X0); Y0 = Math.max(0, Y0);
    X1 = Math.min(w - 1, X1); Y1 = Math.min(h - 1, Y1);
    this.box = { x0: X0, y0: Y0, x1: X1, y1: Y1 };
    if (X1 < X0) return;

    /* Chaque tube ne nettoie son champ que sur SA boite. Hors de la, ce qui
       traine est le reste de l'image precedente — ou de l'allocation. Lu tel
       quel, un 8 perime passait pour une paroi a 8 px et le conge se mettait
       a ponter n'importe quoi : 4 400 px de silhouette inventes loin de
       toute jonction. On teste donc l'appartenance a la boite. */
    const bx0 = this._ubx0 || (this._ubx0 = new Int32Array(8));
    const bx1 = this._ubx1 || (this._ubx1 = new Int32Array(8));
    const by0 = this._uby0 || (this._uby0 = new Int32Array(8));
    const by1 = this._uby1 || (this._uby1 = new Int32Array(8));
    for (let i = 0; i < nt; i++) {
      const b = C[i].box;
      bx0[i] = b.x0; bx1[i] = b.x1; by0[i] = b.y0; by1[i] = b.y1;
    }
    const SAT = BANDE + 1;

    const d0 = C[0].dist, m0 = C[0].mask;
    for (let y = Y0; y <= Y1; y++) {
      const row = y * w;
      const r0 = y >= by0[0] && y <= by1[0];
      for (let x = X0; x <= X1; x++) {
        const o = row + x;
        let sg = (r0 && x >= bx0[0] && x <= bx1[0]) ? (m0[o] ? -d0[o] : d0[o]) : SAT;
        let iw = 0, best = sg;
        for (let i = 1; i < nt; i++) {
          const f = C[i];
          const dedans = y >= by0[i] && y <= by1[i] && x >= bx0[i] && x <= bx1[i];
          const si = dedans ? (f.mask[o] ? -f.dist[o] : f.dist[o]) : SAT;
          if (si < best) { best = si; iw = i; }
          const u = k - sg, v = k - si;
          if (u <= 0 && v <= 0) { sg = si < sg ? si : sg; continue; }
          const uu = u > 0 ? u : 0, vv = v > 0 ? v : 0;
          const lo = si < sg ? si : sg;
          sg = (lo > k ? lo : k) - Math.sqrt(uu * uu + vv * vv);
        }
        own[o] = iw;
        mask[o] = sg < 0 ? 255 : 0;
        const a = sg < 0 ? -sg : sg;
        dist[o] = a > BANDE + 1 ? BANDE + 1 : a;
      }
    }
  }

  /**
   * Un pixel est-il CACHE par un autre tube que `i` ? Sert a la membrane et
   * aux traces de paroi : la base d'une branche est enfoncee dans sa mere,
   * et sa paroi, la, n'existe pas — c'est du cytoplasme continu.
   *
   * On ne coupe qu'au-dela de l'epaisseur de l'enveloppe : a la jonction
   * exacte les deux parois se confondent, et couper au premier pixel
   * interieur aurait laisse un trou d'un pixel dans la ligne de membrane.
   */
  cache(i, x, y) {
    const C = this.champs;
    if (!C || C.length < 2) return false;
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return false;
    const o = yi * this.w + xi;
    /* Dans le conge, la paroi de l'union s'est ecartee de celle du tube :
       la membrane du tube y doublerait une paroi qui n'existe plus, et elle
       coupait l'angle que la silhouette, elle, arrondit. On la coupe la
       aussi. La marge de 0,8 um laisse passer le creux d'une fusion, qui
       peut atteindre 0,6. */
    if (this.dist[o] > this.peau().base + 0.8 * this.pxUm) return true;
    /* Borne par la portee du champ : au fort grossissement l'enveloppe fait
       7 px et 1,6 fois ca depassait la saturation du champ — le test ne
       repondait plus jamais vrai et la membrane de la branche se voyait en
       plein cytoplasme maternel, deux traits sombres en diagonale. */
    const seuil = Math.min(this.peau().base * 1.6, this.portee - 2);
    for (let j = 0; j < C.length; j++) {
      if (j === i || !C[j].actif) continue;
      const b = C[j].box;
      if (xi < b.x0 || xi > b.x1 || yi < b.y0 || yi > b.y1) continue;
      if (C[j].mask[o] && C[j].dist[o] > seuil) return true;
    }
    return false;
  }

  /**
   * Peinture du cytoplasme sur le masque UNI : le conge de la jonction se
   * remplit donc tout seul, il n'y a rien a raccorder.
   *
   * La texture, elle, appartient a UN tube : elle coule le long de son axe.
   * On donne la priorite au tube 0 — la mere — partout ou le pixel est chez
   * elle, si bien que la couture entre les deux reperes tombe exactement sur
   * la paroi de la mere, la ou le liseré et l'assombrissement de bord la
   * couvrent. Prise sur le tube le plus proche, elle tombait en plein
   * cytoplasme et se voyait comme un trait.
   */
  cytoplasme(tiges, P, t, opts) {
    const { w, h, mask, dist, own } = this;
    const sc = this.sc;
    const b = this.box;
    const nt = tiges.length;
    const cCyto = hexToRgba(P.cyto);
    const cBord = hexToRgba(P.cytoBord);
    const force = opts.granulation === false ? 0 : (P.texture ?? P.bruit);

    const AX = this._cyAX || (this._cyAX = new Float64Array(8));
    const AY = this._cyAY || (this._cyAY = new Float64Array(8));
    const CT = this._cyCT || (this._cyCT = new Float64Array(8));
    const ST = this._cyST || (this._cyST = new Float64Array(8));
    for (let i = 0; i < nt; i++) {
      const hy = tiges[i].hy;
      AX[i] = this.sx(hy.x); AY[i] = this.sy(hy.y);
      CT[i] = Math.cos(hy.th); ST[i] = Math.sin(hy.th);
    }
    /* La texture derive AVEC le cytoplasme, pas avec la paroi : 0,9 um/s,
       le flux de masse (1,2) moins la croissance (0,33). Sans ce terme le
       tube est granuleux mais parfaitement immobile a l'interieur. */
    const derive = -t * 0.9;
    /* Frequences en um^-1 : 2,2 cycles/um pour les plages, 8,1 pour le
       grain. En dessous de 1,5 px de periode la fine octave n'est plus que
       du bruit qui scintille, on l'attenue. */
    const invK = 1 / this.pxUm;
    const F1 = 2.2, F2 = 8.1;
    const attF2 = clamp(this.pxUm / (F2 * 1.5), 0, 1);
    const C = this.champs;

    for (let y = Math.max(0, b.y0); y <= Math.min(h - 1, b.y1); y++) {
      const row = y * w;
      for (let x = Math.max(0, b.x0); x <= Math.min(w - 1, b.x1); x++) {
        const o = row + x;
        if (!mask[o]) continue;
        const d = dist[o];
        /* Assombrissement au bord : un cylindre vu de cote presente plus
           d'epaisseur optique sur ses flancs. Tire de la MEME distance
           que la paroi, donc rigoureusement concentrique. */
        let c = mix32(cCyto, cBord, clamp(1 - d / 3.6, 0, 1) * 0.34);
        if (force > 0) {
          let i = own[o];
          for (let j = 0; j < nt; j++) {
            const bj = C[j].box;
            if (x >= bj.x0 && x <= bj.x1 && y >= bj.y0 && y <= bj.y1 && C[j].mask[o]) { i = j; break; }
          }
          /* Coordonnees en MICROMETRES, pas en pixels. Indexee sur le
             pixel, la granulation gardait la meme taille apparente quand
             on zoomait : le tube grossissait, le grain non, et le fond
             avait l'air pose sur un autre plan. En um, il grossit avec
             tout le reste. Le terme de derive etait en um pendant que la
             coordonnee etait en px : la texture ne coulait donc pas a la
             bonne vitesse non plus. */
          const dx = x - AX[i], dy = y - AY[i];
          const lx = (dx * CT[i] + dy * ST[i]) * invK;
          const ly = (-dx * ST[i] + dy * CT[i]) * invK;
          const g = (fbm2((lx + derive) * F1, ly * F1, 17) - 0.5) * 0.62
                  + (fbm2((lx + derive) * F2, ly * F2, 43) - 0.5) * 0.38 * attF2;
          c = shade32(c, g * force * 3.0);
        }
        sc.px[o] = c | 0xff000000;
      }
    }
  }

  /* --- contenu ----------------------------------------------------------- */

  /**
   * Choix du calque pour une profondeur z dans le tube.
   *
   * Le coefficient 0,62 (et non 1) est mesure : a 0,92 un objet de 2 px
   * partait au niveau 3, soit un flou de 4 px de rayon avec un gain de 4,2 —
   * il devenait une tache blanche de 10 px et le champ se remplissait de
   * nuages. Un objet defocalise doit s'assombrir et s'etaler un peu, pas
   * exploser. `plancher` sert aux organites, toujours un peu flous,
   * `plafond` aux evenements de membrane, toujours nets.
   */
  plan(z, plancher = 0, plafond = 3) {
    const dz = Math.abs(z - this.zFocus);
    const n = clamp(Screen.blurLevel(clamp(dz * 0.62, 0, 1)), plancher, plafond);
    return { idx: Screen.layerFor(z - this.zFocus, n), dz };
  }

  contenu(hy, co, P, opts) {
    const sc = this.sc, T = hy.table(S_VU + 2, 0.3), pt = this.pt;
    const K = this.pxUm;

    if (opts.granulation !== false) {
      const cc = hexToRgba(P.grainClair), cs = hexToRgba(P.grainSombre);
      for (const g of co.grains) {
        versMonde(T, g.s, g.v, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -4 || y < -4 || x > this.w + 4 || y > this.h + 4) continue;
        const pl = this.plan(g.z);
        sc.layer(pl.idx);
        /* Les granules s'effacent en approchant de la calotte : elle est
           occupee par les vesicules et par elles seules, c'est une
           observation de MET (planche de reference, panneau C). */
        const ap = 0.22 + 0.78 * smoothstep(0.9, 5.0, g.s);
        const c = fade32(g.clair ? cc : cs, (0.82 - pl.dz * 0.22) * ap);
        /* Rayon en um : un granule a une taille, pas un nombre de pixels. */
        sc.dot(x, y, g.r * K, c);
      }
    }

    if (opts.organites !== false) {
      const pt2 = this._pt2 || (this._pt2 = { x: 0, y: 0 });
      for (const o of co.organites) {
        versMonde(T, o.s, o.v, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue;
        /* Orientation : l'AXE du tube, pas le hasard. Les mitochondries et
           le reticulum d'une hyphe sont etires dans le sens du flux ;
           orientes au hasard ils se lisaient comme des batonnets jetes. */
        versMonde(T, Math.max(o.s - 0.6, 0), o.v, pt2);
        const axe = Math.atan2(this.sy(pt2.y) - y, this.sx(pt2.x) - x);
        const pl = this.plan(o.z, 1);
        sc.layer(pl.idx);
        if (o.type === 'noyau') {
          /* Pas d'anneau nucleolaire net : a ce grossissement un noyau est
             une zone un peu plus dense, pas un schema de manuel. */
          sc.ell(x, y, o.a * K, o.b * K, axe + o.ang * 0.08, fade32(hexToRgba(P.noyau), 0.42));
          sc.disc(x, y, o.b * K * 0.40, fade32(hexToRgba(P.nucleole), 0.34));
        } else if (o.type === 'mito') {
          sc.cap(x, y, o.a * 2 * K, o.b * 2 * K, axe + o.ang * 0.22, fade32(hexToRgba(P.mito), 0.62));
        } else if (o.type === 'vacuole') {
          sc.disc(x, y, o.b * K, fade32(hexToRgba(P.vacuole), 0.8), fade32(hexToRgba(P.grainClair), 0.35));
        } else {
          sc.cap(x, y, o.a * 2 * K, Math.max(o.b * 2 * K, 1.1), axe + o.ang * 0.05,
                 fade32(hexToRgba(P.mito), 0.26));
        }
      }
    }

    if (opts.vesicules !== false) {
      /* Une vesicule n'a pas de couleur a elle : sa membrane EST de la
         membrane, son lumen EST du periplasme — il le devient a la seconde
         ou le pore s'ouvre. C'est cette identite de couleur qui rend la
         fusion lisible sans qu'on ait rien a expliquer. */
      const cLum = hexToRgba(P.periplasme), cMb = hexToRgba(P.membrane);
      for (const v of co.ves) {
        if (v.etat === 1) continue;     // dessinee apres la paroi, cf. fusions()
        versMonde(T, v.s, v.v, pt);
        const x = this.sx(pt.x), y = this.sy(pt.y);
        if (x < -8 || y < -8 || x > this.w + 8 || y > this.h + 8) continue;
        const pl = this.plan(v.z);
        sc.layer(pl.idx);
        const r = v.r * K;
        if (v.pont > 0) {
          /* Coalescence : deux vesicules qui n'en font plus qu'une passent
             par un halteres. Sans lui, la fusion est une disparition. */
          versMonde(T, v.pontS, v.pontV, pt);
          const x2 = this.sx(pt.x), y2 = this.sy(pt.y);
          sc.cap((x + x2) / 2, (y + y2) / 2, Math.hypot(x2 - x, y2 - y) + r * 1.4,
                 r * 1.15, Math.atan2(y2 - y, x2 - x), cLum, cMb);
        }
        const af = 0.94 - pl.dz * 0.14;
        sc.dot(x, y, r, fade32(cLum, af));
        /* Le liseré de membrane n'a de sens qu'au-dessus de 2,6 px de rayon.
           A 2,2 il recouvrait presque tout le lumen et la vesicule se
           lisait comme un anneau sombre : le compartiment disparaissait au
           profit de son contour. */
        if (r > 2.6) sc.arcE(x, y, r - 0.4, r - 0.4, 0, fade32(cMb, af * 0.9), 0, TAU);
      }
    }
  }

  /** Epaisseurs de l'enveloppe, en pixels ECRAN. Partagees par la bande de
      distance et par la polyligne de membrane : si elles divergeaient, la
      membrane flotterait a cote du periplasme. */
  peau() {
    /* La paroi fait 0,19 um : a l'echelle, donc, et non « bornee a 2,6 px ».
       Le plafond a 9 px ne sert qu'a empecher la saucisse floue du
       prototype precedent ; il n'est atteint qu'au-dela de x3,5, la ou on
       est de toute facon a l'echelle de la microscopie electronique et ou
       une paroi epaisse est ce qu'on veut voir. Le plancher a 1 px garantit
       qu'elle ne disparait jamais en vue large. */
    const ep = clamp(0.19 * this.pxUm, 1.0, 9);
    const gp = clamp(0.075 * this.pxUm, 1.1, 5);
    return { ep, gp, base: ep + gp };
  }

  /**
   * La membrane plasmique : UNE polyligne, continue du flanc gauche, par
   * dessus l'apex, jusqu'au flanc droit. Chaque noeud est indexe sur le
   * MATERIAU, donc la ligne et ses creux derivent vers l'arriere avec la
   * paroi qu'ils doublent.
   *
   * Une vesicule qui fusionne n'est plus dessinee : sa membrane s'est
   * ajoutee a celle-ci, le surplus de longueur creuse la ligne vers
   * l'interieur, et l'espace ainsi ouvert entre paroi et membrane EST son
   * lumen — il se remplit de periplasme tout seul.
   */
  /**
   * Point de la membrane a l'abscisse SIGNEE w (negatif d'un flanc, positif
   * de l'autre, nul au pole) : sur la ligne, et son vis-a-vis sur la face
   * interne de la paroi.
   */
  ptMembrane(mb, hy, T, w, off, out) {
    const { ep, base } = this.peau();
    const cote = w >= 0 ? 1 : -1;
    const sA = mb.sDepuisAge(Math.abs(w));
    const o = this._ptM || (this._ptM = {});
    versMonde(T, sA, cote * hy.W(sA), o);
    const ix = -cote * o.nx, iy = -cote * o.ny;
    const x0 = this.sx(o.x), y0 = this.sy(o.y);
    const dd = base + off * this.pxUm;
    out.x = x0 + ix * dd; out.y = y0 + iy * dd;
    out.wx = x0 + ix * ep; out.wy = y0 + iy * ep;
    out.ix = ix; out.iy = iy; out.w = w;
    return out;
  }

  /** Profondeur de la chaine a l'abscisse signee w. */
  offW(mb, w) {
    const ch = mb.ch[w >= 0 ? 1 : 0];
    if (ch.n === 0) return 0;
    return ch.off[clamp(Math.round(Math.abs(w) / PAS_MEMB), 0, ch.n - 1)];
  }

  /**
   * La membrane plasmique : UNE polyligne, d'un flanc a l'autre en passant
   * par le pole, indexee sur une abscisse SIGNEE. Une seule liste, donc une
   * fusion qui a lieu au pole deborde naturellement des deux cotes — avec
   * deux listes separees, la moitie de son omega manquait.
   *
   * Une vesicule qui fusionne n'est PAS dessinee a cote : les noeuds de la
   * zone de contact sont retires du chemin et remplaces par l'arc de son
   * propre contour. Le chemin reste une seule courbe.
   */
  membraneLigne(hy, co, P, opts, it = 0) {
    if (opts.membrane === false) return;
    const sc = this.sc, mb = co.membrane;
    const T = hy.table(S_VU + 2, 0.3);
    const cM = hexToRgba(P.membrane), cPer = hexToRgba(P.periplasme);
    const cMol = hexToRgba(P.molecule);
    const K = this.pxUm;
    const { base } = this.peau();

    /* --- 1. une seule liste, de w = -A a w = +A ----------------------- */
    /* Au-dela du domaine SIMULE, la membrane n'est plus une corde : a 34 um
       de l'apex son surplus a ete absorbe depuis longtemps et elle colle a
       la paroi. On prolonge donc la LIGNE le long du tube, jusqu'au bout de
       ce qui est dessine, sans rien simuler — sinon le liseré s'arretait net
       en plein milieu du tube, a l'endroit exact ou la corde finit. Meme pas
       d'echantillonnage que le contour, pour que les deux restent
       paralleles. */
    const bout = [];
    for (let a = mb.sMax; a < S_VU; ) {
      a += pasContour(a, hy.Lc);
      bout.push(Math.min(a, S_VU));
    }

    const item = [];
    for (let i = bout.length - 1; i >= 0; i--) {
      const q = this.ptMembrane(mb, hy, T, -bout[i], 0, {});
      q.hid = this.cache(it, q.x, q.y);
      item.push(q);
    }
    for (const [c, sens] of [[0, -1], [1, 1]]) {
      const ch = mb.ch[c], cote = c === 0 ? -1 : 1;
      const i0 = sens < 0 ? ch.n - 1 : 0, i1 = sens < 0 ? -1 : ch.n;
      for (let i = i0; i !== i1; i += sens) {
        if (mb.sDepuisAge(ch.a[i]) > mb.sMax) continue;
        const q = this.ptMembrane(mb, hy, T, cote * ch.a[i], ch.off[i], {});
        /* La base d'une branche est ENFONCEE dans sa mere : la, il n'y a ni
           paroi ni membrane, c'est du cytoplasme continu. On marque le
           noeud au lieu de le retirer — retire, la ligne se refermait d'un
           trait droit en travers de la jonction. */
        q.hid = this.cache(it, q.x, q.y);
        item.push(q);
      }
    }
    for (let i = 0; i < bout.length; i++) {
      const q = this.ptMembrane(mb, hy, T, bout[i], 0, {});
      q.hid = this.cache(it, q.x, q.y);
      item.push(q);
    }

    /* --- 2. les zones de fusion, deja regroupees par la simulation ---- */
    const zones = (co.zones || []).map((z) => ({ ...z }));
    for (let zi = zones.length - 1; zi >= 0; zi--) {
      const z = zones[zi];
      const A = this.ptMembrane(mb, hy, T, z.w0 - z.hw, this.offW(mb, z.w0 - z.hw), {});
      const B = this.ptMembrane(mb, hy, T, z.w0 + z.hw, this.offW(mb, z.w0 + z.hw), {});
      if (this.cache(it, A.x, A.y) || this.cache(it, B.x, B.y)) { zones.splice(zi, 1); continue; }
      z.pts = this.arcOmega(A, B, z.dep * K);
      z.A = A; z.B = B;
      let k0 = 0;
      while (k0 < item.length && item[k0].w <= z.w0 - z.hw) k0++;
      let k1 = k0;
      while (k1 < item.length && item[k1].w < z.w0 + z.hw) k1++;
      item.splice(k0, k1 - k0, ...z.pts);
    }

    /* --- 3. le lumen : la poche ouverte entre paroi et membrane -------- */
    sc.layer(4);
    const xs = this._polX || (this._polX = new Float32Array(256));
    const ys = this._polY || (this._polY = new Float32Array(256));
    for (const z of zones) {
      if (!z.pts || z.pts.length < 3) continue;
      let n = 0;
      for (const p of z.pts) if (n < 250) { xs[n] = p.x; ys[n] = p.y; n++; }
      xs[n] = z.B.wx; ys[n] = z.B.wy; n++;
      xs[n] = z.A.wx; ys[n] = z.A.wy; n++;
      const t = clamp(z.dep / Math.max(z.hw, 1e-4), 0, 1);
      this.remplir(xs, ys, n, mix32(cPer, cMol, 0.18 + 0.34 * t));
    }
    /* poches residuelles de la chaine, la ou elle s'est ecartee sans arc */
    for (let k = 0; k + 1 < item.length; k++) {
      const a = item[k], b = item[k + 1];
      if (a.hid || b.hid) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 6) continue;
      const da = Math.hypot(a.x - a.wx, a.y - a.wy), db = Math.hypot(b.x - b.wx, b.y - b.wy);
      if (da < base + 1.2 && db < base + 1.2) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= n; j++) {
        const u = j / n;
        sc.line(lerp(a.wx, b.wx, u), lerp(a.wy, b.wy, u), lerp(a.x, b.x, u), lerp(a.y, b.y, u), cPer);
      }
    }

    /* --- 4. la ligne, d'un bout a l'autre ----------------------------- */
    for (let i = 0; i + 1 < item.length; i++) {
      const a = item[i], b = item[i + 1];
      if (a.hid || b.hid) continue;
      if ((a.x < -2 && b.x < -2) || (a.y < -2 && b.y < -2)
          || (a.x > this.w + 2 && b.x > this.w + 2) || (a.y > this.h + 2 && b.y > this.h + 2)) continue;
      sc.line(a.x, a.y, b.x, b.y, cM);
    }
  }

  /**
   * L'arc de l'omega : le cercle qui passe par les deux coins de la bouche
   * (A, B) et par un fond situe a `dep` px vers l'interieur. Tant que
   * dep > |AB|/2 il est re-entrant, et c'est le col.
   */
  arcOmega(A, B, dep) {
    const mx = (A.x + B.x) * 0.5, my = (A.y + B.y) * 0.5;
    let ux = B.x - A.x, uy = B.y - A.y;
    const L = Math.hypot(ux, uy) || 1e-3;
    ux /= L; uy /= L;
    let nx = -uy, ny = ux;
    /* la normale doit regarder vers l'interieur du tube */
    if (nx * A.ix + ny * A.iy < 0) { nx = -nx; ny = -ny; }
    const hw = L * 0.5;
    const d = Math.max(dep, 0.35);
    const R = (hw * hw + d * d) / (2 * d);
    const D = Math.atan2(hw, R - d);
    const cy = d - R;
    const n = clamp(Math.ceil(2 * D * R / 0.7), 10, 90);
    const out = [];
    for (let j = 0; j <= n; j++) {
      const th = D - 2 * D * (j / n);
      const X = -R * Math.sin(th), Y = cy + R * Math.cos(th);
      const t = j / n;
      out.push({
        x: mx + ux * X + nx * Y, y: my + uy * X + ny * Y,
        wx: lerp(A.wx, B.wx, t), wy: lerp(A.wy, B.wy, t),
        ix: A.ix, iy: A.iy, w: lerp(A.w, B.w, t),
      });
    }
    return out;
  }

  /** Remplissage pair-impair d'un petit polygone, sur le calque courant. */
  remplir(xs, ys, n, c) {
    const sc = this.sc;
    let y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) { if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.h - 1, Math.ceil(y1));
    const xi = this._xiP || (this._xiP = new Float32Array(64));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let m = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if ((ys[i] <= yc) === (ys[j] <= yc)) continue;
        if (m < 64) xi[m++] = xs[i] + (xs[j] - xs[i]) * ((yc - ys[i]) / (ys[j] - ys[i]));
      }
      if (m < 2) continue;
      for (let a = 1; a < m; a++) { const v = xi[a]; let b = a - 1; while (b >= 0 && xi[b] > v) { xi[b + 1] = xi[b]; b--; } xi[b + 1] = v; }
      for (let k = 0; k + 1 < m; k += 2) {
        const xa = Math.max(0, Math.round(xi[k])), xb = Math.min(this.w - 1, Math.round(xi[k + 1]));
        for (let x = xa; x <= xb; x++) sc.plot(x, y, c);
      }
    }
  }

  /**
   * Les evenements de membrane, dessines APRES la paroi.
   *
   * Ils se passent DANS l'enveloppe : dessines avant, la bande de periplasme
   * et le trait de membrane leur passaient dessus et on ne voyait ni le pore
   * ni le materiau deverse.
   *
   * Il n'y reste que le materiau deverse. La vesicule, elle, n'est plus
   * dessinee du tout a partir du contact : elle est devenue un arc de la
   * polyligne de membrane. Avant, un cercle s'effacait pendant qu'une
   * ligne se creusait, sans que les deux se raccordent jamais — « on voit
   * les vesicules disparaitre, mais pas de continuite de ligne pure ».
   */
  fusions(hy, co, P, opts, it = 0) {
    if (opts.vesicules === false) return;
    const sc = this.sc, T = hy.table(S_VU + 2, 0.3), pt = this.pt, K = this.pxUm;
    const cMol = hexToRgba(P.molecule);

    for (const v of co.ves) {
      if (v.etat !== 1) continue;
      /* Rien a dessiner : depuis qu'elle a touche, la vesicule EST un arc
         de la polyligne de membrane (membraneLigne). On ne garde que le
         repere de cadrage pour le banc visuel. */
      const sA = co.membrane.sDepuisAge(v.am);
      versMonde(T, sA, v.cotem * hy.W(sA), pt);
      this.derniereFusion = { x: this.sx(pt.x), y: this.sy(pt.y), k: clamp(v.tf / DUREE_FUSION, 0, 1) };
    }

    /* Le materiau deverse, dans le periplasme. */
    sc.layer(4);
    for (const m of co.mols) {
      versMonde(T, m.s, m.v, pt);
      const x = this.sx(pt.x), y = this.sy(pt.y);
      if (x < -4 || y < -4 || x > this.w + 4 || y > this.h + 4) continue;
      if (this.cache(it, x, y)) continue;
      const k = 1 - m.t / m.vie;
      sc.dot(x, y, k > 0.55 ? 1.0 : 0.6, fade32(cMol, 0.35 + 0.65 * k * k));
    }
  }

  /* --- paroi ------------------------------------------------------------- */

  /**
   * L'enveloppe, en trois couches distinctes de l'exterieur vers l'interieur :
   *
   *   paroi          — chitine et glucanes, 0,1 a 0,3 um, rigide
   *   periplasme     — l'espace ou le materiau deverse est assemble
   *   membrane       — la membrane plasmique, 7 nm
   *
   * La distinction est le mecanisme meme : une vesicule fusionne avec la
   * MEMBRANE et libere son contenu dans le periplasme ; la paroi se
   * construit de l'exterieur de la membrane. Dessiner une seule ligne
   * rendait ce mecanisme faux a l'ecran.
   *
   * Periplasme et membrane sont exageres d'un facteur ~20 : a l'echelle ils
   * font ensemble un quinzieme de pixel. La paroi, elle, est a peu pres a
   * l'echelle — et son epaisseur est en pixels ECRAN, jamais en um, sinon
   * le tube devient une saucisse des qu'on zoome.
   */
  paroi(tiges, P, opts) {
    const { w, h, dist, mask, own } = this;
    const sc = this.sc;
    const b = this.box;
    const nt = tiges.length;
    const cP = hexToRgba(P.paroi), cJ = hexToRgba(P.paroiJeune);
    const cH = hexToRgba(P.halo);
    const cPer = hexToRgba(P.periplasme);
    const halo = opts.halo === false ? 0 : P.haloForce;
    const peau = opts.membrane !== false;

    const pk = this.peau();
    const e = pk.ep;
    const gp = peau ? pk.gp : 0;
    /* Chaque tube a son apex : la maturite de la paroi et sa texture se
       comptent depuis LE SIEN. On prend celui dont le pixel est le plus
       proche — c'est la paroi qu'on est en train de dessiner. */
    const AX = this._paAX || (this._paAX = new Float64Array(8));
    const AY = this._paAY || (this._paAY = new Float64Array(8));
    for (let i = 0; i < nt; i++) { AX[i] = this.sx(tiges[i].hy.x); AY[i] = this.sy(tiges[i].hy.y); }
    const invPx = 1 / this.pxUm;

    const y0 = Math.max(0, b.y0), y1 = Math.min(h - 1, b.y1);
    const x0 = Math.max(0, b.x0), x1 = Math.min(w - 1, b.x1);

    sc.layer(4);
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const o = row + x;
        const d = dist[o];
        if (d > HALO) continue;
        const dedans = mask[o] !== 0;
        const iw = own[o];
        const hy = tiges[iw].hy;
        const s = Math.hypot(x - AX[iw], y - AY[iw]) * invPx;
        const mat = hy.maturite(s);
        /* Texture de paroi indexee sur le MATERIAU (abscisse cumulee depuis
           l'origine), pas sur la distance a l'apex. Indexee sur s elle
           serait figee dans le repere de l'apex et la paroi aurait l'air
           immobile ; indexee sur q elle glisse vers l'arriere a mesure que
           l'apex avance, et c'est ce glissement qu'on veut voir. Symetrique
           gauche-droite : une paroi de revolution depose des anneaux. */
        const q = hy.total - s;
        const gr = noise1(q * 1.7, 3) - 0.5;
        const c = mix32(cJ, cP, clamp(mat + gr * 0.22, 0, 1));
        const ep = e * (0.72 + 0.28 * mat) * (1 + gr * 0.16);
        if (d <= ep) {
          /* bande centree sur le contour, un peu plus dedans que dehors */
          const k = dedans ? d / (ep * 1.05) : d / (ep * 0.72);
          if (k <= 1) { sc.plot(x, y, fade32(c, (1 - 0.45 * k * k) * (1 + gr * 0.2))); continue; }
        }
        if (dedans && peau && d <= ep + gp) {
          /* Le periplasme va jusqu'a la membrane, qui n'est PLUS dessinee
             ici : c'est une polyligne ancree dans le materiau (membrane.js),
             elle peut s'ecarter de la paroi et il n'y a aucun moyen de faire
             ca avec une bande de distance. */
          sc.plot(x, y, fade32(cPer, 0.62));
          continue;
        }
        if (!dedans && halo > 0 && d < HALO) {
          const k = 1 - (d - ep * 0.72) / (HALO - ep * 0.72);
          if (k > 0) sc.plot(x, y, fade32(cH, k * k * halo * (0.45 + 0.55 * mat)));
        }
      }
    }

    if (halo > 0) {
      /* Doublure floue du halo : c'est elle qui donne la lecture
         « contraste de phase » plutot que « contour detoure ». */
      sc.layer(5);
      for (let y = y0; y <= y1; y++) {
        const row = y * w;
        for (let x = x0; x <= x1; x++) {
          const o = row + x;
          const d = dist[o];
          if (d > HALO || mask[o]) continue;
          const k = 1 - d / HALO;
          sc.plot(x, y, fade32(cH, k * k * halo * 0.55));
        }
      }
    }
  }

  /**
   * Traces de paroi neuve. Chacune est posee par une exocytose, a la
   * latitude ou elle a eu lieu, puis remonte le profil du pole vers
   * l'epaule et descend le flanc jusqu'a sortir du champ.
   *
   * C'est la reponse a « on ne voit pas que la paroi formee a la pointe se
   * retrouve sur les bords » : une paroi uniforme a l'air immobile, meme
   * quand l'apex avance de trois pixels par seconde.
   */
  tracesParoi(hy, co, P, it = 0) {
    const sc = this.sc, T = hy.table(S_VU + 2, 0.3);
    const a = this._pd || (this._pd = { s: 0, v: 0, jeune: false });
    const p1 = this.pt, p2 = this._pt2 || (this._pt2 = { x: 0, y: 0 });
    const p3 = this._pt3 || (this._pt3 = { x: 0, y: 0 });
    const cF = hexToRgba(P.paroiFraiche), cP = hexToRgba(P.paroi);
    const ep = this.peau().ep;
    sc.layer(4);
    for (const d of co.depots) {
      co.posDepot(d, a);
      if (a.s > co.sMax) continue;
      versMonde(T, a.s, a.v, p1);
      const x = this.sx(p1.x), y = this.sy(p1.y);
      if (x < -6 || y < -6 || x > this.w + 6 || y > this.h + 6) continue;
      if (this.cache(it, x, y)) continue;
      /* Orientation : la tangente a la SURFACE, prise entre deux points du
         contour — pas la tangente a l'axe. Avec l'axe, une trace posee au
         pole etait dessinee perpendiculairement a la paroi et sortait du
         tube comme une epingle. */
      const s1 = Math.max(a.s - 0.25, 0), s2 = a.s + 0.25;
      versMonde(T, s1, d.cote * hy.W(s1), p2);
      versMonde(T, s2, d.cote * hy.W(s2), p3);
      const ang = Math.atan2(this.sy(p3.y) - this.sy(p2.y), this.sx(p3.x) - this.sx(p2.x));
      /* Eclat a la pose, puis une marque faible qui persiste : c'est la
         PERSISTANCE qui rend le deplacement lisible, pas l'eclat. */
      /* On le dessine DANS LE PERIPLASME, la ou le materiau deverse est
         reellement assemble — pas sur la paroi, ou un trait clair sur une
         paroi deja claire est invisible. Il glisse ensuite du pole vers
         l'epaule avec le materiau. */
      versMonde(T, a.s, 0, p2);
      let ix = this.sx(p2.x) - x, iy = this.sy(p2.y) - y;
      const il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il;
      const dec = ep * 1.25;
      /* Discret. A 0,72 d'alpha et melange a moitie vers le blanc, en fond
         noir chaque trace devenait un rectangle lumineux pose sur la paroi :
         on lisait des artefacts, pas du materiau neuf. */
      const al = 0.09 + 0.34 * Math.exp(-d.t / 2.6);
      sc.cap(x + ix * dec, y + iy * dec, 0.42 * this.pxUm, ep * 0.8, ang,
             fade32(mix32(cP, cF, 0.22), al * d.force));
    }
  }

  /* --- finition ---------------------------------------------------------- */

  grainCapteur(P, t) {
    const sc = this.sc, w = this.w, h = this.h;
    /* Le grain se renouvelle a 14 Hz. A 60 Hz il scintille et fatigue. */
    const g = Math.floor(t * 14);
    const amp = P.bruit * 230;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const n = hash2(x, y, g) - 0.5;
        const c = sc.px[o];
        const d = (n * amp) | 0;
        const r = clamp((c & 255) + d, 0, 255);
        const gg = clamp(((c >> 8) & 255) + d, 0, 255);
        const b = clamp(((c >> 16) & 255) + d, 0, 255);
        sc.px[o] = 0xff000000 | (b << 16) | (gg << 8) | r;
      }
    }
  }

  barreEchelle(P) {
    const sc = this.sc;
    const um = 10;
    const L = Math.round(um * this.pxUm);
    if (L > this.w - 30) return;
    const x = this.w - L - 10, y = this.h - 12;
    const c = hexToRgba(P.paroi);
    for (let i = 0; i < L; i++) { sc.direct(x + i, y, c); sc.direct(x + i, y + 1, c); }
    this.texte('10 um', x + L - 22, y - 8, c);
  }

  texte(str, x, y, c) {
    const sc = this.sc;
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHES[str[i]];
      if (!g) continue;
      for (let r = 0; r < 6; r++) {
        for (let b = 0; b < 4; b++) {
          if (g[r] & (8 >> b)) sc.direct(x + i * 5 + b, y + r, c);
        }
      }
    }
  }
}
