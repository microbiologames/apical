/* ---------------------------------------------------------------------------
   La page « sporulation ».

   Toute la mise en scene tient dans une phrase : LA MISE AU POINT SUIT LA
   POINTE. C'est elle qui fait sortir le stolon et les rhizoides du plan des
   la deuxieme seconde, elle qui raconte que la tige monte vers nous, et
   elle qui, a la fin, abandonne le sporocyste pour partir avec une spore.

   Le grossissement recule en meme temps : on part a l'echelle du tube
   (5 px/um, l'hyphe fait 55 px de large) et on finit a celle du sporocyste
   (2,2 px/um, le sac fait 176 px). Sans ce recul, le sac sortirait du cadre.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Sporange, R_SAC } from './sim/sporange.js';
import { VueSporange, KZ } from './render/vueSporange.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const LEGENDES = {
  rhizoides: 'Les rhizoïdes plongent dans le substrat et la tige démarre — un seul événement.',
  montee: 'Le sporangiophore monte vers l’observateur. Le stolon sort du plan de mise au point.',
  renflement: 'La pointe elle-même gonfle : elle devient le sporocyste. L’apophyse est le raccord.',
  cavite: 'Des vacuoles apparaissent au-dessus du centre, s’aplatissent et coalescent en cavité de clivage.',
  columelle: 'Une paroi se forme du côté interne de la cavité et bombe : la columelle.',
  clivage: 'Le cytoplasme se cloisonne. Les spores naissent partout à la fois, pas depuis un centre.',
  pression: 'Le sac est plein. La paroi se tend.',
  eclatement: 'Rupture. La déchirure court le long de la paroi, qui se retrousse en collerette.',
  envol: 'La mise au point quitte le sporocyste et part avec une spore.',
};

/**
 * LA MISE EN SCENE DE LA SPORULATION, en une fonction.
 *
 * Elle est exportee parce que la page du cycle complet la rejoue : si elle
 * y recopiait ce cadrage, les deux finiraient par diverger et la meme
 * sporulation ne se regarderait pas de la meme facon selon la page qui la
 * montre. Meme raison que `pasMicro` dans `main.js`.
 *
 * `etat` porte et recoit `px`, `dof`, `zF` et lit `zoom`.
 */
export function cadrerSporange(sp, vue, etat, dt0) {
  /* --- ou regarde-t-on, et a quelle profondeur ------------------------- */
  let cz, cx, cy, pxCible;
  if (sp.phase === 'envol' && sp.suivie) {
    const s = sp.suivie, C = sp.centre;
    cx = C.x + s.x; cy = C.y + s.y; cz = C.z + s.z;
    /* 9 px/um : la spore fait soixante-dix pixels de large, ce qui est
       l'echelle ou une cellule montre ses organites — la meme que celle
       du cytoplasme apical. A 4,2 elle en faisait trente-cinq et on ne
       lisait qu'une bille avec un point clair. */
    pxCible = 9.0;
    /* On monte en grossissement, donc la profondeur de champ se referme :
       6,5 um au lieu de 22. Tout ce qui n'est pas la spore part dans le
       flou, y compris ses voisines immediates — c'est ce qui fait qu'on
       en suit UNE. */
    etat.dof = lerp(22, 6.5, smoothstep(0, 2.4, sp.tPhase));
  } else if (sp.rSac > 1) {
    const C = sp.centre;
    cx = C.x; cy = C.y; cz = C.z;
    /* Le cadrage suit la taille du sac : il tient toujours dans 62 % du
       cadre, quelle que soit sa croissance. */
    /* On recule a l'eclatement : le nuage part a cinquante micrometres du
       sac, et au cadrage qui allait au sporocyste plein il sortait du
       cadre avant qu'on ait vu la dechirure. */
    const part = sp.phase === 'eclatement' || sp.phase === 'envol' ? 0.40 : 0.62;
    pxCible = (part * Math.min(vue.w, vue.h)) / (2 * Math.max(sp.rSac, R_SAC * 0.5) * 1.25);
  } else {
    const p = sp.pointe;
    cx = p.x; cy = p.y; cz = p.z;
    /* On recule a mesure que la tige monte : a 5 px/um l'hyphe fait 55 px
       de large, ce qui est l'echelle du tube ; a 2,6 on voit arriver le
       sac. */
    pxCible = lerp(5.0, 2.6, smoothstep(0, 1, sp.z / 380));
  }
  pxCible *= etat.zoom ?? 1;

  etat.px = etat.px ? etat.px + (pxCible - etat.px) * 0.05 : pxCible;
  vue.pxUm = etat.px;
  vue.dof = etat.dof || 22;
  /* La mise au point suit la pointe, avec un peu de retard : un plan de
     mise au point qui colle exactement n'a plus l'air d'etre regle par
     quelqu'un. */
  etat.zF += (cz - etat.zF) * clamp(dt0 * 2.2, 0, 1);
  const ty = cy - cz * KZ;
  vue.cam.x += (cx - vue.cam.x) * clamp(dt0 * 2.4, 0, 1);
  vue.cam.y += (ty - vue.cam.y) * clamp(dt0 * 2.4, 0, 1);
  return etat;
}

export class AppSporange {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vue = new VueSporange(this.screen);
    this.palette = 'phase';
    this.vitesse = 1;
    this.zoom = 1;
    this.pause = false;
    this.opts = { grain: true, echelle: true, milieu: true };
    this.t = 0; this.last = 0; this.fps = 60;
    this.reset();
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  reset(graine = 7) {
    this.dof = 22;
    this.sp = new Sporange({ graine, x: 0, y: 0, th: 0.12 });
    this.zF = 0;
    this.px = 0;
    this.vue.cam.x = 0; this.vue.cam.y = 0;
  }

  layout() {
    const cw = this.hote.clientWidth || 640, ch = this.hote.clientHeight || 640;
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
      const dt = dt0 * this.vitesse;
      const n = Math.max(1, Math.ceil(dt / 0.033));
      for (let i = 0; i < n; i++) this.sp.maj(dt / n);
      this.t += dt0;
    }

    cadrerSporange(this.sp, this.vue, this, dt0);
    this.vue.dessiner(this.sp, PALETTES[this.palette], this.t, this.zF, this.opts);
    this.screen.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

export function brancherSporange(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const maj = () => {
    const sp = app.sp;
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#etat').textContent = `${n(sp.t, 0)} s · ${Math.round(app.fps)} i/s`;
    $('#legende').textContent = LEGENDES[sp.phase] || '';
    const libres = sp.spores.reduce((k, s) => k + (s.libre ? 1 : 0), 0);
    $('#chiffres').innerHTML =
      `<b>${sp.phase}</b> · tige <b>${n(sp.z, 0)}</b> µm · `
      + (sp.rSac > 1 ? `sporocyste <b>${n(sp.rSac * 2, 0)}</b> µm · ` : '')
      + `<b>${sp.spores.length}</b> spores, remplissage <b>${n((sp.remplissage || 0) * 100, 0)} %</b> · `
      + `pression <b>${n(sp.pression, 2)}</b>${libres ? ` · <b>${libres}</b> libérées` : ''}`;
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
  setInterval(maj, 250);
  app.demarrer();
}
