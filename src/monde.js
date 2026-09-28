/* ---------------------------------------------------------------------------
   LE PONT ENTRE LES DEUX ECHELLES.

   On regarde la colonie ; on clique sur une pointe ; on descend sur son apex.
   Trois contraintes, et aucune n'est cosmetique.

   1. L'AXE NE S'INTERROMPT JAMAIS. Descendre n'instancie pas une nouvelle
      hyphe : on attache un `Contenu` et une `Membrane` a l'axe que le macro a
      construit pendant qu'on ne regardait pas (`depuisMacro`). Tant qu'on est
      en bas, c'est la micro qui pilote la pointe et le macro n'enregistre que
      son materiau (`Thalle.inscrire`). En remontant, il n'y a rien a
      raccorder : c'est le meme axe, decrit finement ou grossierement.

   2. LE FONDU N'EST PAS UN CACHE, C'EST UNE HORLOGE. Le reservoir apical met
      une vingtaine de secondes SIMULEES a se remplir. Le fondu dure donc
      exactement ca : pendant qu'on defocalise, qu'on change de grossissement
      et qu'on refocalise, la colonie ENTIERE vit ces vingt secondes. Rien
      n'est saute, rien n'est masque. Le basculement d'image se fait au
      sommet du flou, la ou il n'y a rien a lire — c'est le geste reel quand
      on change d'objectif.

   3. LE TEMPS CHANGE DE REGIME AVEC L'ECHELLE. En haut on regarde des heures,
      en bas des secondes. La vitesse retombe donc a x1 pendant la descente et
      remonte a la vitesse de colonie en repartant. Si le macro continuait a
      x300 pendant qu'on regarde une fusion, la colonie aurait traverse la
      boite avant la fin de l'exocytose.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep, angleDelta, noise1 } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Thalle, V_MICRO } from './sim/thalle.js';
import { VueThalle } from './render/vueThalle.js';
import { Scene } from './render/scene.js';
import { Hyphe, depuisMacro } from './sim/hyphe.js';
import { Contenu } from './sim/contenu.js';
import { pasMicro } from './main.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* Secondes SIMULEES de prechauffage. C'est `App.prechauffer`, et c'est ce
   qui fixe la duree du fondu. */
const PRECHAUFFE = 20;
/* Pas de la micro pendant le fondu. 1/60 comme partout ailleurs : le
   reservoir se remplit exactement comme il le ferait a l'ecran. */
const DT_MICRO = 1 / 60;
/* Images du fondu. 1 200 pas de micro a repartir : a 80 images, 15 pas par
   image, soit ~8 ms — le macro est presque gratuit a cote et le rendu est
   floute, donc moins cher. Le fondu dure ~1,3 s reelle. */
const IMAGES_FONDU = 80;
const FLOU_MAX = 5;               // px, au sommet du fondu

export class AppMonde {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vueT = new VueThalle(this.screen);
    this.vueA = new Scene(this.screen);

    this.palette = 'phase';
    this.vitesse = 300;           // vitesse de colonie
    this.zoomMacro = 1;
    this.zoomMicro = 1;
    this.pause = false;
    this.opts = {
      vesicules: true, granulation: true, organites: true,
      membrane: true, depots: true, milieu: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };

    this.mode = 'macro';          // macro | descente | micro | montee
    this.tr = 0;                  // avancement du fondu, 0..1
    this.pointe = null;           // la pointe visitee
    this.t = 0; this.last = 0; this.fps = 60;
    this.horloge = 0;             // secondes simulees, pour la derive du cap
    this.phiCible = 0;

    this.reset();
    addEventListener('resize', () => this.layout());
    canvas.addEventListener('pointerdown', (e) => this.viser(e));
    this.layout();
  }

  reset(graine = 20260928) {
    this.th = new Thalle({ graine, vMicro: V_MICRO });
    this.mode = 'macro'; this.tr = 0; this.pointe = null;
    this.vueT.cam.x = 0; this.vueT.cam.y = 0;
    this.pxMacro = 0;
  }

  layout() {
    const cw = this.hote.clientWidth || 640, ch = this.hote.clientHeight || 640;
    const S = clamp(Math.round(Math.min(cw, ch) / 300), 2, 6);
    let W = clamp(Math.round(cw / S), 180, 460);
    let H = clamp(Math.round(ch / S), 180, 460);
    while (W * H > 132000) { W = Math.round(W * 0.95); H = Math.round(H * 0.95); }
    this.screen.resize(W, H);
    this.vueT.alloc(W, H); this.vueA.alloc(W, H);
    this.canvas.style.width = `${W * S}px`;
    this.canvas.style.height = `${H * S}px`;
  }

  /* --- descendre et remonter ---------------------------------------------- */

  /** Clic dans la vue macro : on cherche la pointe vivante la plus proche. */
  viser(e) {
    if (this.mode !== 'macro') return;
    const r = this.canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * this.screen.w;
    const sy = (e.clientY - r.top) / r.height * this.screen.h;
    const wx = (sx - this.vueT.w * 0.5) / this.vueT.pxUm + this.vueT.cam.x;
    const wy = (sy - this.vueT.h * 0.5) / this.vueT.pxUm + this.vueT.cam.y;
    let best = null, bd = Infinity;
    for (const p of this.th.pointes) {
      if (!p.vive) continue;
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bd) { bd = d; best = p; }
    }
    /* 40 px a l'ecran : au-dela, on n'a pas vise une hyphe. */
    if (best && bd * this.vueT.pxUm < 40) this.descendre(best);
  }

  descendre(p) {
    /* L'axe existe deja. On ne le recree pas, on le re-echantillonne. */
    const hy = depuisMacro(p.axe.xs, p.axe.ys, p.axe.n, p.th, 210, {
      graine: (p.axe.idx * 7919 + 13) | 0,
      bout: [p.x, p.y],
    });
    const co = new Contenu(hy, { graine: (p.axe.idx * 104729 + 7) | 0 });
    p.micro = { hy, co };
    this.pointe = p;
    this.mode = 'descente';
    this.tr = 0;
    this.pasTotal = Math.round(PRECHAUFFE / DT_MICRO);
    this.pasRestants = this.pasTotal;
    this.parImage = Math.ceil(this.pasTotal / IMAGES_FONDU);
    this.pxMicro = 0;
    this.phiCible = 0;
    this.vueA.cam.x = p.x; this.vueA.cam.y = p.y;
  }

  remonter() {
    if (this.mode !== 'micro') return;
    this.mode = 'montee';
    this.tr = 1;
  }

  /* --- boucle -------------------------------------------------------------- */

  /** Un pas de micro sur la pointe visitee, rendu au macro. */
  pasVisite(dt) {
    const p = this.pointe, { hy, co } = p.micro;
    /* Derive lente du cap : meme bruit que l'hyphe seule. */
    this.horloge += dt;
    const cible = (noise1(this.horloge * 0.055, 31) - 0.5) * 1.5;
    this.phiCible += (cible - this.phiCible) * clamp(dt * 0.9, 0, 1);
    const da = pasMicro(hy, co, dt, this.phiCible, this.opts);
    this.th.inscrire(p, hy.x, hy.y, hy.th, da);
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;
    const sc = this.screen;
    if (!this.pause) this.t += dt0;

    /* --- avancement de la simulation ------------------------------------ */
    if (!this.pause) {
      if (this.mode === 'macro') {
        this.th.maj(dt0 * this.vitesse);
      } else if (this.mode === 'descente') {
        /* LE FONDU EST UNE HORLOGE, et c'est le PRECHAUFFAGE qui la donne :
           `tr` n'est pas un compteur a part, c'est la fraction du reservoir
           deja remplie. Les deux ne peuvent donc pas se desynchroniser, et
           il n'y a pas de dernier a-coup ou l'un attendrait l'autre.

           Les memes secondes sont vecues par la colonie ENTIERE. Rien n'est
           saute, rien n'est masque : le flou couvre vingt secondes de la vie
           de l'organisme, il ne les escamote pas. */
        const k = Math.min(this.parImage, this.pasRestants);
        for (let i = 0; i < k; i++) this.pasVisite(DT_MICRO);
        this.pasRestants -= k;
        this.th.maj(k * DT_MICRO);
        this.tr = 1 - this.pasRestants / this.pasTotal;
        if (this.pasRestants <= 0) { this.tr = 1; this.mode = 'micro'; }
      } else if (this.mode === 'montee') {
        /* En remontant il n'y a rien a prechauffer : on defocalise, on change
           d'objectif, on refocalise, et la colonie vit ce temps-la a x1. */
        this.tr -= 1 / IMAGES_FONDU;
        const n = Math.max(1, Math.ceil(dt0 / 0.025));
        for (let i = 0; i < n; i++) this.pasVisite(dt0 / n);
        this.th.maj(dt0);
        if (this.tr <= 0) {
          this.tr = 0; this.mode = 'macro';
          this.pointe.micro = null; this.pointe = null;
        }
      } else if (this.mode === 'micro') {
        /* En bas, le temps est celui de l'apex : x1. La colonie vit a la
           meme horloge — il n'y a qu'un organisme. */
        const n = Math.max(1, Math.ceil(dt0 / 0.025));
        for (let i = 0; i < n; i++) this.pasVisite(dt0 / n);
        this.th.maj(dt0);
      }
    }

    /* --- grossissements -------------------------------------------------- */
    const etendue = Math.max(this.th.diametre * 1.12, 600);
    const cM = (0.80 * Math.min(sc.w, sc.h)) / etendue * this.zoomMacro;
    this.pxMacro = this.pxMacro ? this.pxMacro + (cM - this.pxMacro) * 0.06 : cM;
    const cm = (0.46 * Math.min(sc.w, sc.h)) / (2 * 5.5) * this.zoomMicro;
    this.pxMicro = cm;

    /* --- rendu ------------------------------------------------------------ */
    const P = PALETTES[this.palette];
    if (this.mode === 'macro') {
      this.vueT.pxUm = this.pxMacro;
      this.vueT.dessiner(this.th, P, this.t, this.opts);
    } else if (this.mode === 'micro') {
      this.cadrerApex();
      this.vueA.dessiner([{ hy: this.pointe.micro.hy, co: this.pointe.micro.co }], P, this.t, this.opts);
    } else {
      /* Fondu. Le grossissement suit une interpolation LOGARITHMIQUE : de
         0,04 a 10,7 px/um il y a un facteur 270, et une rampe lineaire
         passerait 90 % du fondu a l'echelle macro. */
      const u = smoothstep(0, 1, this.tr);
      const px = Math.exp(lerp(Math.log(this.pxMacro), Math.log(this.pxMicro), u));
      /* On bascule d'image au SOMMET du flou, la ou il n'y a rien a lire. */
      if (u < 0.5) {
        this.vueT.pxUm = px;
        this.vueT.cam.x = lerp(0, this.pointe.x, smoothstep(0, 0.5, u));
        this.vueT.cam.y = lerp(0, this.pointe.y, smoothstep(0, 0.5, u));
        this.vueT.dessiner(this.th, P, this.t, { ...this.opts, echelle: false, grain: false });
      } else {
        this.vueA.pxUm = px;
        this.cadrerApex(1);
        this.vueA.dessiner([{ hy: this.pointe.micro.hy, co: this.pointe.micro.co }], P, this.t,
                           { ...this.opts, echelle: false, grain: false });
      }
      /* Defocalisation en cloche : on defocalise, on change d'objectif, on
         refocalise. */
      const r = Math.round(FLOU_MAX * Math.sin(Math.PI * u));
      if (r > 0) flouEcran(sc.px, sc.w, sc.h, r);
      this.vueT.grainCapteur(P, this.t);
    }
    sc.present();
  }

  /** Camera micro : l'apex a 30 % du bord d'attaque, comme sur l'hyphe seule. */
  cadrerApex(k = 0.12) {
    const hy = this.pointe.micro.hy, sc = this.vueA;
    sc.pxUm = sc.pxUm || this.pxMicro;
    const ext = Math.abs(Math.cos(hy.th)) * sc.w + Math.abs(Math.sin(hy.th)) * sc.h;
    const recul = (0.22 * ext) / sc.pxUm;
    const tx = hy.x - Math.cos(hy.th) * recul, ty = hy.y - Math.sin(hy.th) * recul;
    sc.cam.x += (tx - sc.cam.x) * k; sc.cam.y += (ty - sc.cam.y) * k;
    sc.zFocus = 0.30 * Math.sin(this.t * 0.105);
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

/**
 * Flou de boite sur le tampon fini, separable, en deux passes.
 *
 * C'est une DEFOCALISATION, pas le flou de profondeur des calques : elle
 * porte sur l'image entiere et ne compense pas le pic (`BLUR_GAIN`), parce
 * qu'un objectif qu'on devisse n'eclaircit rien — il etale.
 */
function flouEcran(px, w, h, r) {
  const n = w * h;
  let tmp = flouEcran._t;
  if (!tmp || tmp.length !== n * 3) tmp = flouEcran._t = new Uint16Array(n * 3);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let a = 0, b = 0, c = 0;
    for (let x = -r; x <= r; x++) {
      const v = px[row + clamp(x, 0, w - 1)];
      a += v & 255; b += (v >> 8) & 255; c += (v >> 16) & 255;
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (a / d) | 0;
      tmp[n + row + x] = (b / d) | 0;
      tmp[2 * n + row + x] = (c / d) | 0;
      const vo = px[row + clamp(x - r, 0, w - 1)], vi = px[row + clamp(x + r + 1, 0, w - 1)];
      a += (vi & 255) - (vo & 255);
      b += ((vi >> 8) & 255) - ((vo >> 8) & 255);
      c += ((vi >> 16) & 255) - ((vo >> 16) & 255);
    }
  }
  for (let x = 0; x < w; x++) {
    let a = 0, b = 0, c = 0;
    for (let y = -r; y <= r; y++) {
      const o = clamp(y, 0, h - 1) * w + x;
      a += tmp[o]; b += tmp[n + o]; c += tmp[2 * n + o];
    }
    for (let y = 0; y < h; y++) {
      const o = y * w + x;
      px[o] = 0xff000000 | (((c / d) | 0) << 16) | (((b / d) | 0) << 8) | ((a / d) | 0);
      const oo = clamp(y - r, 0, h - 1) * w + x, oi = clamp(y + r + 1, 0, h - 1) * w + x;
      a += tmp[oi] - tmp[oo];
      b += tmp[n + oi] - tmp[n + oo];
      c += tmp[2 * n + oi] - tmp[2 * n + oo];
    }
  }
}

export function brancherMonde(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const horloge = (s) => {
    const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0;
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  };

  const maj = () => {
    const th = app.th, bas = app.mode === 'micro';
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => {
      b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse));
      b.disabled = app.mode !== 'macro';
    });
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#bHaut').disabled = !bas;
    $('#bNeuf').disabled = app.mode !== 'macro';
    $('#etat').textContent = `${horloge(th.t)} · ${Math.round(app.fps)} i/s`;
    $('#ou').textContent = app.mode === 'macro' ? 'colonie'
      : bas ? 'apex' : "changement d'objectif";
    $('#chiffres').innerHTML = bas
      ? `apex <b>${n(app.pointe.micro.hy.longueur)}</b> µm construits depuis la descente · `
        + `Spk <b>${app.pointe.micro.co.ves.reduce((k, v) => k + (v.etat === 2 ? 1 : 0), 0)}</b> vésicules · `
        + `colonie <b>${n(th.total / 1000, 2)}</b> mm, <b>${th.vives}</b> pointes`
      : `<b>${n(th.total / 1000, 2)}</b> mm de mycélium · <b>${th.vives}</b> pointes · `
        + `colonie <b>${n(th.diametre / 1000, 2)}</b> mm — <b>cliquez sur une pointe</b> pour descendre`;
  };

  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $('#bNeuf').onclick = () => { app.reset((Math.random() * 1e9) | 0); maj(); };
  $('#bHaut').onclick = () => { app.remonter(); maj(); };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { app.remonter(); maj(); } });
  const z = $('#cZoom'), oz = $('#oZoom');
  const majZoom = () => {
    const v = +z.value;
    if (app.mode === 'micro') app.zoomMicro = v; else app.zoomMacro = v;
    oz.textContent = `×${n(v, 2)}`;
  };
  z.oninput = majZoom; majZoom();

  globalThis.apical = app;
  maj();
  setInterval(maj, 300);
  app.demarrer();
}
