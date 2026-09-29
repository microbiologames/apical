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
import { clamp, lerp, smoothstep, noise1, TAU } from '../core/util.js';
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
    /* LE SIGNE. `COMPOSITE_ORDER` vaut [3,2,1,0,4,5,6,7] : les calques 4 a 7
       sont composes EN DERNIER, donc par-dessus. La convention de `layerFor`
       est donc « zRel positif = PLUS LOIN », et notre z, lui, compte vers
       l'observateur. Sans le signe inverse, tout ce qui etait proche passait
       derriere : les rhizoides, qui plongent, se dessinaient par-dessus le
       stolon. */
    const dz = (this.zF - z) / (this.dof || DOF);
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

    /* LE FOND SE DEFOCALISE AVEC LA MONTEE. Le substrat est a z = 0 ; a
       380 um au-dessus, il n'a aucune raison d'etre net. Sans ca, la scene
       disait « on est monte » pendant que le fond disait « non ». */
    const net = clamp(1 - Math.abs(this.zF) / (2.2 * DOF), 0, 1);
    this.fond(P, { ...opts, netFond: net });
    /* Les debris du milieu passent par `dotDirect`, qui ecrit dans le tampon
       principal et ne peut donc pas etre floute. Au-dela de 50 um de montee
       ils seraient de toute facon etales sur dix pixels : on les retire. */
    if (opts.milieu !== false && net > 0.28) this.milieu(P, t);

    for (const passe of ['halo', 'corps']) {
      this.rhizoides(sp, P, passe);
      this.stolon(sp, P, passe);
    }
    this.tige(sp, P);
    this.cavite(sp, P);
    this.sacEtSpores(sp, P);

    this.ombreColumelle(sp, P);

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
  troncon(a, b, wa, wb, P, passe, col = 0) {
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
      /* Le halo suit la LARGEUR du tube. A largeur fixe, les derniers
         troncons de l'ogive — ou la demi-largeur tend vers zero — se
         recouvraient en une lentille blanche posee en travers du sommet de
         la columelle : un tube qui s'affine n'a pas un halo qui grossit. */
      const h = Math.min(2.2, 0.35 * Math.max(A, B) + 0.35);
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
    /* La columelle est du cytoplasme DENSE, vu a travers la masse des
       spores : sur les planches c'est la piece la plus sombre du
       sporocyste. Elle n'a pas sa couleur a elle — c'est la meme, poussee
       vers le bord du cylindre puis vers la membrane. */
    let c = hexToRgba(P.cyto);
    if (col > 0) c = mix32(c, hexToRgba(P.membrane), col * 0.80);
    /* Grain le long du tube, indexe sur le MATERIAU : sans lui le
       sporangiophore est une bande de couleur plate, et on avait perdu la
       matiere qu'a l'hyphe. */
    c = shade32(c, (noise1((a.q ?? a.z) * 0.075, 41) - 0.5) * 0.13);
    this.remplir(xs, ys, 4, c);
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
        5.5, 5.5, P, passe, 0);
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
        if (passe === 'corps') this.troncon(prev, q, lerp(2.6, w, (i - 1) / n), w, P, passe, 0);
        prev = q;
      }
    }
  }

  /**
   * L'axe du sporangiophore, re-echantillonne FIN pres de la pointe.
   *
   * La simulation memorise un point tous les 3 um : c'est assez pour un
   * tube droit, pas pour une ogive de 5 um de long ni pour une columelle de
   * 18. Echantillonne au pas de la simulation, le dome sortait en trois
   * facettes. On interpole donc tous les 0,5 um sur les premiers
   * 3.max(rCol, R_TIGE) micrometres.
   */
  axeFin(sp) {
    const T = sp.tige, out = [];
    const fin = 3 * Math.max(sp.rCol, R_TIGE);
    let q = 0;
    for (let i = T.length - 1; i > 0; i--) {
      const a = T[i], b = T[i - 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (d < 1e-9) continue;
      /* pas fin pres de la pointe, pas de la simulation au-dela */
      const pas = q < fin ? 0.5 : (q < fin * 2.5 ? 1.5 : 6);
      const m = Math.max(1, Math.round(d / pas));
      for (let k = 0; k < m; k++) {
        const u = k / m;
        out.push({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), q: q + d * u });
      }
      q += d;
      if (q > 260) break;        // au-dela, on est hors cadre de toute facon
    }
    out.push({ x: T[0].x, y: T[0].y, z: T[0].z, q });
    return out;
  }

  /**
   * La tige, dessinee par BANDES DE PROFONDEUR : un polygone par calque, et
   * non un quadrilatere par troncon.
   *
   * Au pas fin, les troncons font un demi-pixel de long pour quarante de
   * large : quadrilatere par quadrilatere, `remplir` laissait une couture a
   * chaque jointure et la columelle sortait striee comme un volet. Une
   * bande est un seul polygone, donc un seul balayage, donc aucune couture
   * — et il en faut cinq ou six au lieu de deux cents.
   */
  tige(sp, P) {
    const sc = this.sc;
    const A = this._axe || (this._axe = []);
    A.length = 0; for (const q of this.axeFin(sp)) A.push(q);
    if (A.length < 2) return;

    const xs = this._bx || (this._bx = new Float32Array(2048));
    const ys = this._by || (this._by = new Float32Array(2048));
    const cP = hexToRgba(P.paroi);

    /* LE CORPS COMPACT DE LA POINTE est une bande a elle seule, forcee sur
       le calque de la pointe. C'est un corps de cinquante micrometres : le
       decouper en bandes de profondeur le faisait sortir coupe net a la
       hauteur d'un changement de calque, avec sa calotte apicale dessinee
       a part et par-dessus. Un dome se dessine d'un seul tenant.

       On le demande a la SIMULATION (`qCompact`) et on ne le deduit plus de
       `rCol` : des que l'ordre des phases a ete corrige, le renflement s'est
       retrouve seul pendant vingt secondes, sans columelle pour le couvrir
       — et le meme piege est revenu a l'identique, dome coupe net et lisere
       de halo flottant au-dessus. Un corps compact est compact, qu'il
       s'appelle apophyse ou columelle. */
    let iCol = 0;
    const qC = sp.qCompact;
    if (qC > 0.3) while (iCol < A.length - 1 && A[iCol].q < qC) iCol++;

    let i0 = 0;
    while (i0 < A.length - 1) {
      const fixe = i0 === 0 && iCol > 1;
      const L = fixe ? this.plan3(A[0].z) : this.plan3(A[i0].z);
      let i1;
      if (fixe) {
        i1 = iCol;
      } else {
        i1 = i0 + 1;
        while (i1 < A.length - 1 && this.plan3(A[i1].z) === L) i1++;
      }
      const n = i1 - i0 + 1;
      if (n >= 2 && n * 2 + 2 < 2048) {
        /* demi-largeur ecran et normale image en chaque point */
        const W = this._bw || (this._bw = new Float32Array(1024));
        const NX = this._bnx || (this._bnx = new Float32Array(1024));
        const NY = this._bny || (this._bny = new Float32Array(1024));
        const PX = this._bpx || (this._bpx = new Float32Array(1024));
        const PY = this._bpy || (this._bpy = new Float32Array(1024));
        for (let k = 0; k < n; k++) {
          const a = A[i0 + k];
          PX[k] = this.px3(a.x, a.y, a.z); PY[k] = this.py3(a.x, a.y, a.z);
          W[k] = sp.profil(a.q) * this.pxUm;
        }
        for (let k = 0; k < n; k++) {
          const p = PX[Math.max(0, k - 1)], q = PX[Math.min(n - 1, k + 1)];
          const r = PY[Math.max(0, k - 1)], t = PY[Math.min(n - 1, k + 1)];
          let dx = q - p, dy = t - r;
          const l = Math.hypot(dx, dy) || 1e-6;
          NX[k] = -dy / l; NY[k] = dx / l;
        }
        /* LE HALO EST SUR LE MEME CALQUE QUE SA BANDE, dessine juste avant.
           Sur un calque plus flou, il changeait de rang dans l'ordre de
           composition et repassait par-dessus la bande voisine : un lisere
           blanc en travers du tube, a chaque changement de profondeur. Un
           halo ne peut pas etre devant ce qu'il entoure.

           Sa largeur suit celle du tube : a largeur fixe, les derniers
           points de l'ogive — ou elle tend vers zero — se recouvraient en
           une lentille blanche posee en travers du sommet. */
        sc.layer(L);
        for (let passe = 0; passe < 2; passe++) {
          let m = 0;
          for (let j = 0; j < 2 * n; j++) {
            const k = j < n ? j : 2 * n - 1 - j, sg = j < n ? 1 : -1;
            const e = W[k] + (passe === 0 ? Math.min(2.2, 0.35 * W[k] + 0.35) : 0);
            xs[m] = PX[k] + NX[k] * sg * e; ys[m] = PY[k] + NY[k] * sg * e; m++;
          }
          const qm = (A[i0].q + A[i1].q) * 0.5;
          /* Le halo est l'artefact de phase d'un SAUT D'INDICE, donc d'une
             paroi. Tant que le septum n'est pas la, il n'y en a pas dans le
             sac : garde a pleine force, c'est lui — et non le lisere — qui
             cerclait le renflement et en faisait une ampoule posee dans le
             ballon. Il monte avec `rCol`, comme la paroi. */
          let fInt = 1;
          if (qC > 0.3 && qm < qC && sp.rSac > R_TIGE * 1.2) {
            fInt = lerp(0.18, 1, smoothstep(0.02, 0.40, sp.rCol / R_COL));
          }
          if (passe === 0) {
            this.remplir(xs, ys, m, fade32(hexToRgba(P.halo), P.haloForce * 0.5 * fInt));
            continue;
          }
          const col = sp.partCol(qm);
          let c = hexToRgba(P.cyto);
          if (col > 0) c = mix32(c, hexToRgba(P.membrane), col * 0.80);
          c = shade32(c, (noise1(qm * 0.075, 41) - 0.5) * 0.13);
          this.remplir(xs, ys, m, c);
          /* Paroi : deux traits, pas une bande — a 4 um de demi-largeur elle
             fait moins de deux pixels et une bande la mangerait.

             DANS LE SAC, LA PAROI N'EXISTE QUE QUAND LE SEPTUM EXISTE. Le
             lisere tire a pleine force autour du renflement en faisait une
             ampoule fermee posee dans le ballon : on lisait deux corps a
             paroi, alors qu'a ce stade il n'y en a qu'un et que le
             cytoplasme s'y accumule simplement vers l'apex. Le trait monte
             avec `rCol`, c'est-a-dire avec la paroi qui se forme du cote
             interne de la cavite. */
          const cB = fInt < 1 ? fade32(cP, fInt) : cP;
          for (let k = 1; k < n; k++) {
            sc.line(xs[k - 1], ys[k - 1], xs[k], ys[k], cB);
            sc.line(xs[m - k], ys[m - k], xs[m - k - 1], ys[m - k - 1], cB);
          }
        }
      }
      i0 = i1;
    }
  }

  /* --- la cavite de clivage -------------------------------------------------- */

  /**
   * LA CAVITE DE CLIVAGE, celle qui annonce la columelle.
   *
   * C'est le chainon qui manquait et qui rendait la scene fausse : on
   * voyait l'apophyse arriver, puis le sac apparaitre, puis une columelle
   * pousser dedans — trois objets qui se succedent. Dans un sporocyste il
   * n'y a qu'un seul corps, et le septum ne pousse pas : il se CREUSE.
   * « A series of small vacuoles appear just above the columella, which
   * become flattened and form a cavity. A wall then develops towards the
   * inner side of the cavity. » La cavite vient AVANT la paroi, et c'est
   * elle qui dit ou la paroi ira.
   *
   * On la dessine donc sur le contour de la columelle A VENIR —
   * `profil(q, R_COL)`, la meme fonction, avec le rayon qu'elle aura — et
   * non sur une courbe a part. Quand `cav` retombe pendant la phase
   * suivante, la paroi est deja la ou la cavite etait : rien ne se
   * deplace, l'une remplace l'autre.
   *
   * Deux temps, et ce sont ceux du texte :
   *   - `cav` < 0,55 : des vacuoles rondes, isolees, qui apparaissent
   *     une a une le long du contour ;
   *   - `cav` > 0,55 : elles s'APLATISSENT — le grand axe s'allonge
   *     tangentiellement jusqu'a rejoindre les voisines, le petit axe se
   *     resserre — et coalescent en une fente continue.
   */
  cavite(sp, P) {
    if (!(sp.cav > 0.01)) return;
    const sc = this.sc;
    const A = this._axe;                 // pose par `tige`, meme axe fin
    if (!A || A.length < 3) return;

    const cav = sp.cav;
    /* Le contour de la columelle a venir, echantillonne en arc. */
    const PX = [], PY = [], TX = [], TY = [], EP = [];
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      /* On s'arrete OU LA COLUMELLE S'ARRETE : la ou son contour a venir
         rejoint celui de l'apophyse. Coupee a une abscisse fixe, la
         couronne descendait le long des flancs du sporangiophore et on
         lisait un collier accroche a la tige, alors que la cavite ne
         separe que le dome de la peripherie. */
      const e = sp.profil(a.q, R_COL);
      /* Le test ne vaut qu'APRES le dome : au sommet les deux profils
         valent zero tous les deux, l'ecart aussi, et la boucle s'arretait
         a son premier point — il ne restait de la couronne qu'un trait. */
      if (a.q > R_COL * 1.4 && e - sp.profil(a.q, 0) < 1.5) break;
      PX.push(this.px3(a.x, a.y, a.z)); PY.push(this.py3(a.x, a.y, a.z));
      EP.push(e * 1.06 * this.pxUm);
    }
    const n = PX.length;
    if (n < 3) return;
    for (let k = 0; k < n; k++) {
      const p = PX[Math.max(0, k - 1)], q = PX[Math.min(n - 1, k + 1)];
      const r = PY[Math.max(0, k - 1)], s = PY[Math.min(n - 1, k + 1)];
      const l = Math.hypot(q - p, s - r) || 1e-6;
      TX.push((q - p) / l); TY.push((s - r) / l);
    }

    /* Un seul calque, celui de la pointe : la cavite est DANS le
       sporocyste, a la profondeur de la columelle qu'elle prepare. Repartie
       sur les calques de profondeur du contour, elle se coupait en deux a
       chaque changement, exactement comme la columelle avant elle. */
    sc.layer(this.plan3(A[0].z));

    const cVac = hexToRgba(P.vacuole);
    const cBord = hexToRgba(P.grainClair);
    /* Espacement des vacuoles le long du contour, en um : douze a quinze
       poches sur un dome de dix-huit, ce qui est l'ordre des planches. */
    const PAS = 4.0 * this.pxUm;
    const RV = 1.30 * this.pxUm;

    /* ON MARCHE SUR LE CONTOUR DECALE, PAS SUR L'AXE. Espacees le long de
       l'axe puis poussees de dix-sept micrometres vers l'exterieur, les
       poches s'ecartaient d'autant que la courbure du dome est forte :
       serrees au sommet, separees d'un demi-diametre sur les flancs, elles
       ne coalescaient jamais la ou c'est le plus visible. Sur une courbe
       convexe, un decalage e multiplie la longueur d'arc par (1 + e.k). */
    const OX = new Float64Array(n), OY = new Float64Array(n);
    for (let cote = -1; cote <= 1; cote += 2) {
      for (let k = 0; k < n; k++) {
        OX[k] = PX[k] - TY[k] * cote * EP[k];
        OY[k] = PY[k] + TX[k] * cote * EP[k];
      }
      let arc = 0, prochain = PAS * 0.5, i = 0;
      while (i < n - 1) {
        const dx = OX[i + 1] - OX[i], dy = OY[i + 1] - OY[i];
        const d = Math.hypot(dx, dy);
        if (d < 1e-9) { i++; continue; }
        while (prochain <= arc + d) {
          const u = (prochain - arc) / d;
          const cx = OX[i] + dx * u, cy = OY[i] + dy * u;
          /* Chaque poche a son heure : toutes ensemble, on lit un
             pointille dessine, pas des vacuoles qui apparaissent. */
          const h = (Math.sin(prochain * 0.37 + cote * 2.1) * 0.5 + 0.5);
          const naiss = smoothstep(h * 0.42, h * 0.42 + 0.26, cav);
          if (naiss > 0.02) {
            /* L'aplatissement : le grand axe rejoint les voisines, le
               petit se resserre. C'est la coalescence, pas un fondu. */
            const ap = smoothstep(0.45, 1, cav);
            const a = lerp(RV, PAS * 0.60, ap) * naiss;
            const b = lerp(RV, RV * 0.44, ap) * naiss;
            sc.ell(cx, cy, a, b, Math.atan2(dy, dx), fade32(cVac, 0.62 * naiss),
                   ap < 0.5 ? fade32(cBord, 0.26 * naiss * (1 - ap * 2)) : 0);
          }
          prochain += PAS;
        }
        arc += d; i++;
      }
    }
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
      sc.layer(3);
      const hx = this._shx || (this._shx = new Float32Array(160));
      const hy = this._shy || (this._shy = new Float32Array(160));
      for (let i = 0; i < m; i++) { hx[i] = cx + (xs[i] - cx) * 1.05; hy[i] = cy + (ys[i] - cy) * 1.05; }
      this.remplir(hx, hy, m, fade32(hexToRgba(P.halo), P.haloForce * 0.55));
      /* Le remplissage du sac va sur le calque LE PLUS LOINTAIN — le 3, qui
         est compose en premier — et il est faible. Ce n'est pas un objet,
         c'est le fond du sac vu a travers son contenu : tout ce qui est
         dedans doit passer par-dessus, a commencer par la columelle. Pose
         sur le calque que sa profondeur donnait, il arrivait au premier
         plan et effacait le sporocyste entier. */
      sc.layer(3);
      this.remplir(xs, ys, m, fade32(mix32(hexToRgba(P.cyto), hexToRgba(P.grainClair), 0.45), 0.55));
      /* 2. la paroi du sac : un trait, interrompu la ou elle est dechiree. */
      const cP = hexToRgba(P.paroi);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (S.dechire[i] && S.dechire[j]) continue;
        sc.line(xs[i], ys[i], xs[j], ys[j], cP);
      }
    }

    /* 3. la columelle n'est plus dessinee ici : c'est l'extremite gonflee
          du sporangiophore, elle sort du profil du tube (`Sporange.profil`)
          et se dessine avec lui. Elle est donc DANS le sac par construction,
          et les calques de profondeur rangent d'eux-memes les spores du
          devant par-dessus et celles du fond derriere.

       4. les spores. Elles sont placees en 3D dans la coque : celles du fond
          sont derriere le plan de mise au point, celles du devant sont
          nettes. C'est ce qui donne l'epaisseur au sac — dessinees a plat,
          elles font un motif, pas un volume. */
    /* UNE SPORE N'EST PAS UN APLAT. A dix-huit pixels de large, le disque
       plein a lisere de la vesicule — qui marche a deux pixels — devient une
       rondelle de couleur unie, et on perd la matiere qu'a l'hyphe. Une
       spore est une CELLULE : paroi epaisse et refringente, cytoplasme
       granuleux, et le point clair excentre que donne une bille
       transparente en contraste de phase. */
    const cFill = hexToRgba(P.cyto);
    const cRim = hexToRgba(P.membrane);
    const cParoi = hexToRgba(P.paroi);
    const cGrain = hexToRgba(P.grainSombre);
    const cCoeur = hexToRgba(P.milieuClair);
    for (const s of sp.spores) {
      const wx = C.x + s.x, wy = C.y + s.y, wz = C.z + s.z;
      const x = this.px3(wx, wy, wz), y = this.py3(wx, wy, wz);
      if (x < -8 || y < -8 || x > this.w + 8 || y > this.h + 8) continue;
      const r = s.r * this.pxUm;
      if (r < 0.35) continue;
      sc.layer(this.plan3(wz, 0));
      const b = r * s.ov;
      if (r < 1.8) { sc.ell(x, y, r, b, s.ang, cFill, 0); continue; }
      /* Au-dela de onze pixels de rayon, l'aplat ne tient plus : c'est la
         SPORE QU'ON SUIT, elle occupe un cinquieme du cadre, et a cette
         taille une cellule doit montrer ce qu'un apex montre.

         CELLE QU'ON SUIT, ET ELLE SEULE. Sur le seul critere de taille,
         les deux secondes ou la camera passe de l'echelle du sac a celle
         de la spore mettaient cinq cents spores au-dessus du seuil d'un
         coup : le nuage entier devenait granuleux et cercle de halos, ce
         qui n'a aucun sens optique — dans un tas, une spore est vue a
         travers les autres. Le detail est ce que la mise au point
         designe. */
      if (s === sp.suivie && r > 11
          && Math.abs(wz - this.zF) < (this.dof || DOF) * 0.55) {
        this.sporeDetaillee(sp, s, x, y, r, b, P); continue;
      }
      /* paroi : un anneau clair, puis le lisere sombre du contraste */
      sc.ell(x, y, r, b, s.ang, mix32(cFill, cParoi, 0.42), cRim);
      sc.ell(x, y, r * 0.78, b * 0.78, s.ang, shade32(cFill, s.clair ? 0.06 : -0.05), 0);
      if (r > 3.2) {
        /* grains de reserve : deux ou trois, poses en dur sur la graine de
           la spore pour qu'ils ne scintillent pas d'une image a l'autre */
        const co = Math.cos(s.ang), si = Math.sin(s.ang);
        for (let k = 0; k < 3; k++) {
          const a = s.ang * 2.3 + k * 2.4, d = r * (0.18 + 0.26 * ((k * 7 + s.ov * 10) % 1));
          sc.dot(x + Math.cos(a) * d, y + Math.sin(a) * d * s.ov, r * 0.17,
                 fade32(cGrain, 0.34));
        }
        /* le point clair : une bille transparente concentre la lumiere un
           peu au-dessus de son centre */
        sc.dot(x - co * r * 0.22 - si * r * 0.1, y - si * r * 0.22 + co * r * 0.1,
               r * 0.24, fade32(cCoeur, s.clair ? 0.55 : 0.34));
      }
    }
  }

  /**
   * LA SPORE QU'ON SUIT, a l'echelle ou c'est une cellule.
   *
   * « J'aurais prefere avoir le meme niveau de detail sur la spore que sur
   * l'apex, la granularite, les organites. » C'est la meme demande que la
   * regle 3 : ce qu'on voit doit etre le mecanisme. Une spore n'est pas une
   * bille, c'est une cellule au repos, et une cellule au repos se reconnait
   * a trois choses — une paroi epaisse (c'est elle qui la fait survivre),
   * des globules lipidiques (c'est sa reserve, et c'est ce qui la rend
   * refringente), un cytoplasme dense et granuleux.
   *
   * On emprunte le vocabulaire du cytoplasme de l'apex, terme pour terme :
   * meme `noyau` + `nucleole`, memes `cap` pour les mitochondries, memes
   * `dot` pour les granules. Deux vocabulaires differents pour le meme
   * objet a deux echelles, et on ne lit plus le meme organisme.
   *
   * Les couches vont de l'exterieur vers l'interieur, comme au tube :
   * paroi, periplasme, membrane, cytoplasme. Ce sont les memes entrees de
   * palette — une spore n'a pas plus de couleur a elle qu'une vesicule.
   */
  sporeDetaillee(sp, s, x, y, r, b, P) {
    const sc = this.sc;
    const org = sp.detailler(s);
    const co = Math.cos(s.ang), si = Math.sin(s.ang);
    /* Repere de la spore : on echelle d'abord (r sur son grand axe, b sur
       le petit — c'est l'ellipse de la projection oblique), on tourne
       ensuite. Dans l'autre ordre, les organites sortiraient du contour du
       cote ou la spore est aplatie. */
    const ox = (u, v) => x + u * r * co - v * b * si;
    const oy = (u, v) => y + u * r * si + v * b * co;

    const cCyto = hexToRgba(P.cyto);
    const cBord = hexToRgba(P.cytoBord);

    /* 1. le halo : une spore isolee dans le milieu en porte un, comme le
          tube. Sans lui elle est posee sur le fond au lieu d'y flotter. */
    sc.ell(x, y, r * 1.07, b * 1.07, s.ang,
           fade32(hexToRgba(P.halo), P.haloForce * 0.38), 0);

    /* 2. la paroi. EPAISSE — c'est le trait d'une spore, et c'est pour ca
          qu'elle survit a la dessiccation. Un seizieme du rayon comme au
          tube serait un trait ; ici elle fait un huitieme. */
    sc.ell(x, y, r, b, s.ang, mix32(cCyto, hexToRgba(P.paroi), 0.58),
           hexToRgba(P.paroi));
    /* Ornementation : les spores de Mucorales sont striees. Un TRAIT FIN
       et pale, pas un secteur epais — a 0,30 d'alpha et deux pixels de
       large, les sept stries se lisaient comme des dents noires plantees
       dans la paroi, et la spore avait l'air sale. */
    for (let k = 0; k < 7; k++) {
      const t0 = k * (TAU / 7) + s.ov * 2.3;
      sc.arcE(x, y, r * 0.93, b * 0.93, s.ang,
              fade32(hexToRgba(P.grainSombre), 0.16), t0, t0 + 0.30, 1);
    }
    /* 3. periplasme puis membrane : les memes couleurs qu'au tube, dans le
          meme ordre. C'est la regle 3, a l'echelle de la spore. */
    sc.ell(x, y, r * 0.875, b * 0.875, s.ang, fade32(hexToRgba(P.periplasme), 0.85), 0);
    sc.ell(x, y, r * 0.825, b * 0.825, s.ang, hexToRgba(P.membrane), 0);

    /* 4. le cytoplasme, assombri au bord : une sphere vue par transparence
          est plus dense sur ses bords, parce qu'on la traverse plus
          longtemps. A plat, on relit une rondelle. */
    /* Quatre pas et non deux : en deux, l'assombrissement de bord se lisait
       comme un ANNEAU sombre pose sous la paroi — un objet de plus — au
       lieu du degrade continu que donne une sphere translucide. */
    for (let k = 0; k < 4; k++) {
      const u = k / 3;
      const e = lerp(0.795, 0.52, u);
      sc.ell(x, y, r * e, b * e, s.ang,
             mix32(shade32(cCyto, s.clair ? 0.10 : 0.03), cBord, 0.42 * (1 - u)), 0);
    }

    /* 5. les organites, tires une fois pour toutes dans la simulation :
          recalcules a chaque image ils scintilleraient. */
    const cGC = hexToRgba(P.grainClair), cGS = hexToRgba(P.grainSombre);
    for (const o of org) {
      const px = ox(o.x, o.y), py = oy(o.x, o.y);
      if (o.t === 'grain') {
        sc.dot(px, py, Math.max(0.8, o.a * r), fade32(o.clair ? cGC : cGS, 0.78));
      } else if (o.t === 'mito') {
        sc.cap(px, py, o.a * 2 * r, Math.max(1.1, o.b * 2 * r), s.ang + o.ang,
               fade32(hexToRgba(P.mito), 0.60));
      } else if (o.t === 'lipide') {
        /* LE GLOBULE LIPIDIQUE EST CE QUI FAIT BRILLER UNE SPORE. En
           contraste de phase c'est une bille dans une bille : bord sombre,
           coeur lumineux. Dessine en aplat clair, on lit une bulle de
           montage. */
        sc.ell(px, py, o.a * r, o.a * b, s.ang, fade32(hexToRgba(P.vacuole), 0.80),
               fade32(cGS, 0.40));
        sc.dot(px - o.a * r * 0.24, py - o.a * b * 0.28, o.a * r * 0.40,
               fade32(hexToRgba(P.milieuClair), 0.50));
      } else {
        /* Le noyau : une zone plus dense, pas un schema de manuel — le
           meme parti que dans l'apex. */
        sc.ell(px, py, o.a * r, o.a * b * 0.86, s.ang + o.ang * 0.1,
               fade32(hexToRgba(P.noyau), 0.70), 0);
        sc.dot(px, py, o.a * r * 0.38, fade32(hexToRgba(P.nucleole), 0.62));
      }
    }

    /* 6. le point clair du contraste de phase : une bille transparente
          concentre la lumiere un peu au-dessus de son centre. Il est LE
          meme que sur les petites spores — une seule lecture optique. */
    sc.dot(ox(-0.30, -0.26), oy(-0.30, -0.26), r * 0.15,
           fade32(hexToRgba(P.milieuClair), 0.40));
  }

  /**
   * L'ombre de la columelle, vue A TRAVERS les spores.
   *
   * Ce n'est pas une seconde geometrie : c'est le MEME profil de tube
   * (`Sporange.profil`), re-tire en sombre et en translucide par-dessus la
   * masse. Un sporocyste plein cache sa columelle derriere trois cents
   * spores, et pourtant sur les planches elle se voit — parce qu'elle est
   * dense et que les spores sont translucides. La densite optique traverse,
   * le dessin non.
   */
  ombreColumelle(sp, P) {
    if (sp.rCol < 1 || sp.rSac < 1) return;
    const sc = this.sc;
    const A = this._axe;
    if (!A || A.length < 3) return;
    const cO = hexToRgba(P.membrane);
    /* Calque proche et flou : on la voit a travers une couche diffusante. */
    sc.layer(Screen.layerFor(-1, 2));
    const xs = this._ox || (this._ox = new Float32Array(1024));
    const ys = this._oy || (this._oy = new Float32Array(1024));
    const PX = [], PY = [], W = [];
    for (let i = 0; i < A.length; i++) {
      if (A[i].q > sp.rCol * 2.8) break;
      const a = A[i];
      PX.push(this.px3(a.x, a.y, a.z)); PY.push(this.py3(a.x, a.y, a.z));
      W.push(sp.profil(a.q) * this.pxUm * sp.partCol(a.q));
    }
    const n = PX.length;
    if (n < 3) return;
    let m = 0;
    for (let s2 = 0; s2 < 2; s2++) {
      for (let j = 0; j < n; j++) {
        const k = s2 ? n - 1 - j : j;
        const p = PX[Math.max(0, k - 1)], q = PX[Math.min(n - 1, k + 1)];
        const r = PY[Math.max(0, k - 1)], t = PY[Math.min(n - 1, k + 1)];
        let dx = q - p, dy = t - r;
        const l = Math.hypot(dx, dy) || 1e-6;
        const e = (s2 ? -1 : 1) * W[k];
        xs[m] = PX[k] + (-dy / l) * e; ys[m] = PY[k] + (dx / l) * e; m++;
      }
    }
    /* Un SEUL polygone : dessine troncon par troncon, il sortait strie. */
    this.remplir(xs, ys, m, fade32(cO, 0.30));
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
