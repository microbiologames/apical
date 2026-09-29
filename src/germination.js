/* ---------------------------------------------------------------------------
   La page « germination ».

   Elle ne fait rien de special, et c'est encore une fois son interet : la
   spore est une tige de plus dans la liste que la `Scene` recoit, et le
   tube germinatif est une branche. Ce qu'on regarde ici, ce sont quatre
   choses qu'un banc ne voit pas :

     - la spore GONFLE avant que quoi que ce soit ne pointe ;
     - les vesicules se rassemblent SOUS la paroi avant qu'il y ait un tube ;
     - le tube EMERGE du cytoplasme au lieu d'apparaitre pose dessus ;
     - le col est concave, et c'est le conge de l'union qui le donne.

   Deux cadrages, parce qu'il y a deux echelles a voir : le germe entier —
   qui s'elargit tout seul a mesure que les tubes s'ecartent — et l'apex
   d'un tube, au grossissement de l'hyphe, la ou les vesicules sont
   lisibles.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Germination, R_GONFLE, PHASES } from './sim/germination.js';
import { VueGermination } from './render/vueGermination.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const LEGENDES = {
  dormance: 'Spore dormante : paroi épaisse et ornementée, cytoplasme dense, réserves lipidiques réfringentes. Rien ne bouge.',
  imbibition: 'Imbibition. Elle boit : la turgescence monte, l’ornementation s’efface, le contenu se remet en mouvement.',
  gonflement: 'Gonflement isodiamétrique — aucune direction n’est privilégiée. Les réserves fondent, la granulation monte, la paroi s’amincit.',
  polarisation: 'Polarisation. Les vésicules se rassemblent sous la paroi : un Spitzenkörper se forme avant qu’il y ait un tube.',
  emergence: 'Émergence. Le tube naît dans le cytoplasme de la spore et en sort ; le col concave est le congé de l’union.',
  tube: 'Croissance apicale. À partir d’ici c’est une hyphe comme les autres — mêmes vésicules, même membrane, même paroi qui migre.',
};

export class AppGermination {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vue = new VueGermination(this.screen);
    this.palette = 'phase';
    this.vitesse = 1;
    this.zoom = 1;
    this.pause = false;
    this.cadrage = 'germe';
    this.opts = {
      vesicules: true, granulation: true, organites: true,
      membrane: true, depots: true, milieu: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };
    this.t = 0; this.last = 0; this.fps = 60;
    this.reset();
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  reset(graine = 11) {
    this.g = new Germination({ graine, x: 0, y: 0 });
    this.px = 0;
    this.vue.cam.x = 0; this.vue.cam.y = 0;
    this.t = 0;
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
      /* Sous-pas : au-dela de 25 ms les collisions de vesicules traversent.
         C'est la meme borne que sur l'hyphe seule, et pour la meme raison. */
      const n = Math.max(1, Math.ceil(dt / 0.025));
      for (let i = 0; i < n; i++) this.g.maj(dt / n, this.opts);
      this.g.ramifier();
      this.t += dt;
    }

    const g = this.g, sp = g.spore, vue = this.vue;
    const pr = g.principal;

    /* --- cadrage ---------------------------------------------------------- */
    let cx, cy, pxCible;
    if (this.cadrage === 'apex' && pr && pr.hy.longueur > 1) {
      /* Au grossissement de l'hyphe, apex a 22 % du bord d'attaque : le
         meme cadrage que sur la page de l'apex seul, pour que ce soit
         visiblement la meme chose. */
      const hy = pr.hy;
      const ext = Math.abs(Math.cos(hy.th)) * vue.w + Math.abs(Math.sin(hy.th)) * vue.h;
      pxCible = (0.46 * Math.min(vue.w, vue.h)) / (2 * hy.R);
      const recul = (0.22 * ext) / pxCible;
      cx = hy.x - Math.cos(hy.th) * recul;
      cy = hy.y - Math.sin(hy.th) * recul;
    } else {
      /* LE GERME ENTIER. Le cadre suit l'etendue reelle, jamais le rayon de
         la spore : cadre sur le corps, le gonflement se serait annule tout
         seul — la spore aurait garde la meme taille a l'ecran pendant
         qu'elle doublait. On plafonne donc le grossissement a ce qu'il vaut
         a l'etat dormant, et il ne fait ensuite que descendre. */
      let rad = R_GONFLE * 1.45;
      let sx = sp.x, sy = sp.y, n = 1;
      for (const tg of g.tubes) {
        rad = Math.max(rad, Math.hypot(tg.hy.x - sp.x, tg.hy.y - sp.y) + tg.hy.R * 2.4);
        sx += tg.hy.x; sy += tg.hy.y; n++;
      }
      /* Le centre glisse vers le barycentre des apex : la spore n'a pas a
         rester au milieu quand le germe s'etend d'un seul cote. */
      const k = smoothstep(R_GONFLE * 1.6, R_GONFLE * 6, rad);
      cx = lerp(sp.x, sx / n, k * 0.62);
      cy = lerp(sp.y, sy / n, k * 0.62);
      pxCible = (0.44 * Math.min(vue.w, vue.h)) / rad;
    }
    pxCible *= this.zoom;

    /* Le grossissement rejoint sa cible lentement : un cadre qui colle a
       l'etendue exacte respire a chaque micrometre construit. */
    this.px = this.px ? this.px + (pxCible - this.px) * 0.045 : pxCible;
    vue.pxUm = this.px;
    const kc = clamp(dt0 * 2.2, 0, 1);
    vue.cam.x += (cx - vue.cam.x) * kc;
    vue.cam.y += (cy - vue.cam.y) * kc;
    /* La mise au point derive, comme sur une platine qui travaille. */
    vue.zFocus = 0.26 * Math.sin(this.t * 0.105);

    vue.dessiner(g, PALETTES[this.palette], this.t, this.opts);
    this.screen.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

export function brancherGermination(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const maj = () => {
    const g = app.g, sp = g.spore, pr = g.principal;
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $$('[data-cad]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cad === app.cadrage)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#etat').textContent = `${n(g.t, 0)} s · ${Math.round(app.fps)} i/s`;
    $('#legende').textContent = LEGENDES[g.phase] || '';
    $('#chiffres').innerHTML =
      `<b>${g.phase}</b> · spore <b>${n(sp.r * 2)}</b> µm `
      + `(<b>×${n(sp.r / 4.0, 2)}</b> en rayon) · turgescence <b>${n(sp.turg * 100, 0)} %</b> · `
      + `<b>${g.tubes.length}</b> tube${g.tubes.length > 1 ? 's' : ''} `
      + (pr ? `· le plus long <b>${n(pr.hy.longueur)}</b> µm` : `· ${g.sites.length} site${g.sites.length > 1 ? 's' : ''} de polarité`);
  };

  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $$('[data-cad]').forEach((b) => { b.onclick = () => { app.cadrage = b.dataset.cad; app.px = 0; maj(); }; });
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
