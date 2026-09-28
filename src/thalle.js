/* ---------------------------------------------------------------------------
   La page du thalle : l'echelle macro, seule.

   Ce n'est PAS `App` : `App` tient une hyphe et son interieur. Ici il n'y a
   ni vesicule ni membrane, seulement des axes qui poussent. Les deux
   echelles ne sont pas encore reliees — cliquer sur une hyphe pour
   redescendre sur son apex reste a faire, et c'est la piece qui manque.

   La camera recule toute seule a mesure que la colonie grandit : c'est le
   geste d'un time-lapse au microscope, et ca evite de demander un reglage
   pour voir quelque chose.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Thalle, V_MICRO, UCH } from './sim/thalle.js';
import { VueThalle } from './render/vueThalle.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export class AppThalle {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vue = new VueThalle(this.screen);
    this.palette = 'phase';
    this.vitesse = 300;
    this.zoom = 1;
    this.pause = false;
    this.opts = { grain: true, echelle: true, halo: true };
    this.t = 0;              // secondes reelles, pour le grain
    this.last = 0;
    this.fps = 60;
    this.reset();
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  reset(graine = 20260928) {
    this.th = new Thalle({ graine, vMicro: V_MICRO });
    this.vue.cam.x = 0; this.vue.cam.y = 0;
    this.pxUm = 0;
  }

  layout() {
    const cw = this.hote.clientWidth || 640;
    const ch = this.hote.clientHeight || 640;
    const S = clamp(Math.round(Math.min(cw, ch) / 300), 2, 6);
    let W = clamp(Math.round(cw / S), 180, 460);
    let H = clamp(Math.round(ch / S), 180, 460);
    while (W * H > 132000) { W = Math.round(W * 0.95); H = Math.round(H * 0.95); }
    this.screen.resize(W, H);
    this.vue.alloc(W, H);
    this.canvas.style.width = `${W * S}px`;
    this.canvas.style.height = `${H * S}px`;
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;

    if (!this.pause) {
      this.th.maj(dt0 * this.vitesse);
      this.t += dt0;
    }

    /* Recul automatique : la colonie tient toujours dans 72 % du cadre, et
       jamais plus serre que 600 um de large — sinon, a la germination, on
       serait a un grossissement ou une hyphe fait trois pixels de large et
       ou le modele macro n'a rien a montrer. */
    const sc = this.vue;
    const etendue = Math.max(this.th.diametre * 1.12, 600);
    const cible = (0.80 * Math.min(sc.w, sc.h)) / etendue * this.zoom;
    this.pxUm = this.pxUm ? this.pxUm + (cible - this.pxUm) * 0.06 : cible;
    sc.pxUm = this.pxUm;

    sc.dessiner(this.th, PALETTES[this.palette], this.t, this.opts);
    this.screen.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

export function brancherThalle(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const horloge = (s) => {
    const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0;
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  };

  const maj = () => {
    const th = app.th;
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#etat').textContent = `${horloge(th.t)} · ${Math.round(app.fps)} i/s`;
    $('#chiffres').innerHTML =
      `<b>${n(th.total / 1000, 2)}</b> mm de mycélium · <b>${th.vives}</b> pointes · `
      + `colonie <b>${n(th.diametre / 1000, 2)}</b> mm · `
      + `extension <b>${n(th.t > 60 ? th.diametre / 2 / (th.t / 60) : 0)}</b> µm/min · `
      + `<b>${th.branchements}</b> ramifications, <b>${th.anastomoses}</b> anastomoses`;
  };

  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $('#bNeuf').onclick = () => { app.reset((Math.random() * 1e9) | 0); maj(); };
  const z = $('#cZoom'), oz = $('#oZoom');
  const majZoom = () => { app.zoom = +z.value; oz.textContent = `×${n(app.zoom, 2)}`; };
  z.oninput = majZoom; majZoom();

  globalThis.apical = app;
  maj();
  setInterval(maj, 400);
  app.demarrer();
}
