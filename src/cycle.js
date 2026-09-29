/* ---------------------------------------------------------------------------
   LE CYCLE, SANS FIN.

   Germination, croissance apicale, ramification, sporocyste, eclatement,
   vol, retombee — puis germination. C'est le meme organisme d'un bout a
   l'autre, et c'est litteralement vrai dans le code : la spore que le
   sporocyste lache est la spore qui vole, et la spore qui vole est celle
   qui gonfle et germe. Aucun objet n'est recree entre le vol et la
   germination ; on arrete simplement de le tenir dormant.

   RIEN DE NOUVEAU N'EST SIMULE ICI. Cette page n'est qu'un enchainement :
   `Germination` pour les deux premieres etapes, `Sporange` pour la
   troisieme, `Germination` encore — dormante — pour le vol. Le pilotage de
   l'apex vient de `pasMicro`, le cadrage du sporocyste de
   `cadrerSporange`, le flou de fondu de `flouEcran`. Si cette page
   reecrivait l'une de ces lois de son cote, la meme etape ne se
   regarderait pas de la meme facon selon la page qui la montre.

   DEUX FONDUS PAR TOUR, PAS QUATRE. Germination et croissance sont la meme
   scene — seul le cadrage change, et il change en glissant. Vol et
   germination aussi. Il ne reste donc a fondre que les deux endroits ou
   l'on change VRAIMENT d'objectif : quand on quitte le thalle pour le
   sporangiophore, et quand on quitte le sporocyste pour suivre une spore
   dans l'air. C'est le geste de `monde.js` : on defocalise, on change
   d'objectif, on refocalise — et pendant ce temps les deux simulations
   vivent, rien n'est saute.

   LE VOL est la seule chose inventee, et elle est assumee : une spore
   emportee ne voit plus un substrat, elle voit passer des masses. Trois
   plans de disques flous qui defilent a des vitesses differentes, la
   parallaxe fait le reste. La spore, elle, est dessinee exactement comme
   elle le sera au sol — c'est la meme, elle est seulement dormante.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep, noise1 } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { Germination, R_GONFLE } from './sim/germination.js';
import { VueGermination } from './render/vueGermination.js';
import { Sporange } from './sim/sporange.js';
import { VueSporange } from './render/vueSporange.js';
import { cadrerSporange } from './sporange.js';
import { flouEcran } from './monde.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* Images d'un fondu, et flou maximal. Memes valeurs que sur le pont entre
   les deux echelles : un fondu plus court ne laisse pas le temps de lire
   qu'on a change d'objectif, un plus long se fait attendre. */
const IMAGES_FONDU = 84;
const FLOU_MAX = 5;

/* Secondes SIMULEES passees dans l'air avant la retombee. Au-dela de vingt,
   le defilement devient une attente ; en dessous de dix, on ne comprend pas
   qu'elle a voyage. */
const DUREE_VOL = 16;

export const ETAPES = ['germination', 'croissance', 'sporulation', 'vol'];

const LEGENDES = {
  germination: 'La spore gonfle dans toutes les directions, les vésicules se rassemblent, un tube part.',
  croissance: 'Croissance apicale. Les vésicules fusionnent avec la membrane et déversent la paroi ; le thalle ramifie.',
  sporulation: 'Un sporangiophore monte vers l’observateur. Sa pointe gonfle et devient le sporocyste.',
  vol: 'Une spore est partie. Elle ne voit plus un substrat — elle voit passer des masses.',
};

export class AppCycle {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vueG = new VueGermination(this.screen);
    this.vueS = new VueSporange(this.screen);

    this.palette = 'phase';
    this.vitesse = 2;
    this.zoom = 1;
    this.pause = false;
    this.opts = {
      vesicules: true, granulation: true, organites: true,
      membrane: true, depots: true, milieu: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };
    this.t = 0; this.last = 0; this.fps = 60;
    this.tours = 0;
    this.reset();
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  reset(graine = 11) {
    this.graine = graine;
    this.etape = 'germination';
    this.fondu = null;
    this.tEtape = 0;
    this.g = new Germination({ graine, x: 0, y: 0 });
    this.sp = null;
    this.vol = null;
    this.px = 0;
    this.etatS = { px: 0, dof: 22, zF: 0, zoom: 1 };
    this.vueG.cam.x = 0; this.vueG.cam.y = 0;
    this.tours = 0;
  }

  layout() {
    const cw = this.hote.clientWidth || 640, ch = this.hote.clientHeight || 640;
    const S = clamp(Math.round(Math.min(cw, ch) / 300), 2, 6);
    let W = clamp(Math.round(cw / S), 180, 460);
    let H = clamp(Math.round(ch / S), 180, 460);
    while (W * H > 132000) { W = Math.round(W * 0.95); H = Math.round(H * 0.95); }
    this.screen.resize(W, H);
    this.vueG.alloc(W, H); this.vueS.alloc(W, H);
    this.canvas.style.width = `${W * S}px`;
    this.canvas.style.height = `${H * S}px`;
  }

  /* --- enchainement ------------------------------------------------------- */

  /** Longueur totale construite par le thalle, en um. */
  get construit() {
    let l = 0;
    for (const tg of this.g.tubes) l += tg.hy.longueur;
    return l;
  }

  /**
   * Les passages d'une etape a l'autre. Deux seulement demandent un fondu :
   * les deux ou l'on change d'objectif. Les autres sont des glissements de
   * cadrage sur la meme scene, et c'est ce qui fait qu'il n'y a pas de
   * coupure dans le cycle.
   */
  avancer(dt) {
    this.tEtape += dt;
    const e = this.etape;

    if (e === 'germination') {
      const pr = this.g.principal;
      /* On passe a la croissance quand le premier tube a de quoi se faire
         regarder de pres : en dessous de vingt-six micrometres, le cadrage
         serre ne montre qu'un bout de spore. */
      if (pr && this.g.phase === 'tube' && pr.hy.longueur > 18) this.passer('croissance');

    } else if (e === 'croissance') {
      this.g.ramifier();
      /* Le thalle a fait son travail quand il a construit de quoi porter un
         sporangiophore. 190 um tous axes confondus, soit trois unites de
         croissance germinative et une ou deux branches : moins, on n'a pas
         vu ramifier. Le plafond de 150 s est la pour que le tour ait une
         duree, meme si le substrat est pauvre. */
      if (this.construit > 190 || this.tEtape > 150) this.fondreVers('sporulation');

    } else if (e === 'sporulation') {
      /* On part avec la spore que la camera suit. Six secondes apres le
         debut de l'envol : le temps de la voir se detacher du nuage. */
      if (this.sp.phase === 'envol' && this.sp.tPhase > 6) this.fondreVers('vol');

    } else if (e === 'vol') {
      /* Le defilement retombe a zero sur les cinq dernieres secondes, et le
         substrat redevient net avec lui : c'est la retombee. On ne coupe
         pas — la spore est deja celle qui va germer. */
      const u = clamp(this.tEtape / DUREE_VOL, 0, 1);
      this.vol.v = 1 - smoothstep(0.68, 1, u);
      this.vol.parcours += dt * this.vol.v * 0.16;
      this.g.spore.th += dt * this.vol.rot * this.vol.v;
      if (u >= 1) { this.tours++; this.passer('germination'); }
    }
  }

  passer(e) { this.etape = e; this.tEtape = 0; }

  /** Demarre un fondu : on defocalise, on change d'objectif, on refocalise. */
  fondreVers(e) {
    if (this.fondu) return;
    this.fondu = { u: 0, vers: e, de: this.etape, bascule: false };
    if (e === 'sporulation') {
      this.sp = new Sporange({ graine: (this.graine * 7 + this.tours * 131) | 0, x: 0, y: 0, th: 0.12 });
      this.etatS = { px: 0, dof: 22, zF: 0, zoom: this.zoom };
    } else if (e === 'vol') {
      /* LA SPORE QUI VOLE EST CELLE QUI VA GERMER. On instancie la
         germination maintenant, dormante, et on la tient telle quelle
         pendant tout le vol : il n'y a rien a raccorder a l'atterrissage,
         c'est le meme objet. */
      const gr = (this.graine * 31 + this.tours * 977) | 0;
      this.g = new Germination({ graine: gr, x: 0, y: 0 });
      this.vol = { v: 1, parcours: 0, dir: Math.atan2(0.42, 1), rot: 0.22 };
      /* La camera est POSEE sur la spore, pas amenee : elle rejoint sa
         cible en 0,45 s et le fondu, lui, ne dure qu'une seconde et demie.
         On sortait donc du flou avec la spore a moitie hors cadre. */
      this.px = 0;
      this.vueG.cam.x = 0; this.vueG.cam.y = 0;
    }
  }

  /* --- simulation --------------------------------------------------------- */

  majSim(dt) {
    const e = this.etape, f = this.fondu;
    /* Pendant un fondu les DEUX scenes vivent : le flou couvre le
       changement d'objectif, il n'escamote pas le temps. */
    const gVit = (e === 'germination' || e === 'croissance' || f?.vers === 'vol');
    if (gVit && this.etape !== 'vol') {
      const n = Math.max(1, Math.ceil(dt / 0.025));
      for (let i = 0; i < n; i++) this.g.maj(dt / n, this.opts);
    }
    if (this.sp && (e === 'sporulation' || f?.vers === 'sporulation')) {
      const n = Math.max(1, Math.ceil(dt / 0.033));
      for (let i = 0; i < n; i++) this.sp.maj(dt / n);
    }
    this.avancer(dt);
  }

  /* --- cadrage ------------------------------------------------------------ */

  cadrerGerme(dt0) {
    const g = this.g, sp = g.spore, vue = this.vueG;
    let cx, cy, pxCible;
    if (this.etape === 'croissance' && g.principal) {
      /* Au grossissement de l'hyphe, apex a 22 % du bord d'attaque : le
         meme cadrage que sur la page de l'apex seul. */
      const hy = g.principal.hy;
      const ext = Math.abs(Math.cos(hy.th)) * vue.w + Math.abs(Math.sin(hy.th)) * vue.h;
      pxCible = (0.46 * Math.min(vue.w, vue.h)) / (2 * hy.R);
      const recul = (0.22 * ext) / pxCible;
      cx = hy.x - Math.cos(hy.th) * recul;
      cy = hy.y - Math.sin(hy.th) * recul;
    } else if (this.etape === 'vol') {
      cx = sp.x; cy = sp.y;
      pxCible = (0.34 * Math.min(vue.w, vue.h)) / (2 * sp.r);
    } else {
      /* Le germe entier. Le grossissement est PLAFONNE a ce qu'il vaut sur
         une spore gonflee : cadre sur le rayon courant, le gonflement
         s'annulerait tout seul — la spore garderait la meme taille a
         l'ecran pendant qu'elle double. */
      let rad = R_GONFLE * 1.45;
      let sx = sp.x, sy = sp.y, n = 1;
      for (const tg of g.tubes) {
        rad = Math.max(rad, Math.hypot(tg.hy.x - sp.x, tg.hy.y - sp.y) + tg.hy.R * 2.4);
        sx += tg.hy.x; sy += tg.hy.y; n++;
      }
      const k = smoothstep(R_GONFLE * 1.6, R_GONFLE * 6, rad);
      cx = lerp(sp.x, sx / n, k * 0.62);
      cy = lerp(sp.y, sy / n, k * 0.62);
      pxCible = (0.44 * Math.min(vue.w, vue.h)) / rad;
    }
    pxCible *= this.zoom;
    this.px = this.px ? this.px + (pxCible - this.px) * 0.045 : pxCible;
    vue.pxUm = this.px;
    const kc = clamp(dt0 * 2.2, 0, 1);
    vue.cam.x += (cx - vue.cam.x) * kc;
    vue.cam.y += (cy - vue.cam.y) * kc;
    vue.zFocus = 0.26 * Math.sin(this.t * 0.105)
      + (this.etape === 'vol' ? 0.9 * noise1(this.t * 0.5, 9) * this.vol.v : 0);
  }

  /** Les options de la scene germination, vol compris. */
  optsG() {
    if (this.etape !== 'vol' && !(this.fondu && this.fondu.vers === 'vol')) return this.opts;
    /* EN L'AIR, IL N'Y A PAS DE SUBSTRAT. Le fond s'aplatit — une texture
       hors du plan de mise au point ne se brouille pas, elle perd son
       amplitude — et les debris de gelose, qui passent par `dotDirect` et
       ne peuvent donc pas etre floutes, disparaissent. */
    const v = this.vol ? this.vol.v : 1;
    return { ...this.opts, vol: this.vol, netFond: lerp(1, 0.10, v), milieu: v < 0.35 };
  }

  /* --- rendu -------------------------------------------------------------- */

  dessinerEtape(e, dt0, opts) {
    const P = PALETTES[this.palette];
    if (e === 'sporulation') {
      this.etatS.zoom = this.zoom;
      cadrerSporange(this.sp, this.vueS, this.etatS, dt0);
      this.vueS.dessiner(this.sp, P, this.t, this.etatS.zF, opts);
    } else {
      this.cadrerGerme(dt0);
      this.vueG.dessiner(this.g, P, this.t, { ...this.optsG(), ...opts });
    }
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;
    if (!this.pause) {
      const dt = dt0 * this.vitesse;
      this.majSim(dt);
      this.t += dt;
    }

    const sc = this.screen;
    if (!this.fondu) {
      this.dessinerEtape(this.etape, dt0, {});
    } else {
      const f = this.fondu;
      if (!this.pause) f.u += 1 / IMAGES_FONDU;
      const u = clamp(f.u, 0, 1);
      /* On bascule d'image au SOMMET du flou, la ou il n'y a rien a lire.
         C'est le geste reel quand on change d'objectif. */
      const e = u < 0.5 ? f.de : f.vers;
      if (u >= 0.5 && !f.bascule) { f.bascule = true; this.passer(f.vers); }
      this.dessinerEtape(e, dt0, { echelle: false, grain: false });
      const r = Math.round(FLOU_MAX * Math.sin(Math.PI * u));
      if (r > 0) flouEcran(sc.px, sc.w, sc.h, r);
      (e === 'sporulation' ? this.vueS : this.vueG).grainCapteur(PALETTES[this.palette], this.t);
      if (u >= 1) this.fondu = null;
    }
    sc.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

export function brancherCycle(app) {
  const n = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const maj = () => {
    $('#phase').textContent = PALETTES[app.palette].nom;
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#etat').textContent = `tour ${app.tours + 1} · ${n(app.t, 0)} s · ${Math.round(app.fps)} i/s`;
    $('#legende').textContent = LEGENDES[app.etape] || '';
    const e = app.etape;
    let d = '';
    if (e === 'germination') {
      d = `spore <b>${n(app.g.spore.r * 2)}</b> µm · <b>${app.g.phase}</b> · `
        + `<b>${app.g.tubes.length}</b> tube${app.g.tubes.length > 1 ? 's' : ''}`;
    } else if (e === 'croissance') {
      d = `<b>${app.g.tubes.length}</b> axes · <b>${n(app.construit, 0)}</b> µm construits`;
    } else if (e === 'sporulation') {
      const s = app.sp;
      d = `<b>${s.phase}</b> · tige <b>${n(s.z, 0)}</b> µm`
        + (s.rSac > 1 ? ` · sporocyste <b>${n(s.rSac * 2, 0)}</b> µm` : '')
        + (s.spores.length ? ` · <b>${s.spores.length}</b> spores` : '');
    } else {
      d = `en vol · <b>${n(app.vol ? app.vol.v * 100 : 0, 0)} %</b> de vitesse`;
    }
    $('#chiffres').innerHTML = `<b>${e}</b> — ${d}`;
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
