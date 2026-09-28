/* ---------------------------------------------------------------------------
   Boucle, camera, pilotage, panneau de reglages.

   Le pilotage ne touche JAMAIS au cap de l'hyphe. Il deplace la consigne
   angulaire du gradient de Ca2+, donc l'endroit ou les vesicules ont le plus
   de chances de fusionner. L'apex tourne parce que la paroi s'epaissit d'un
   cote. C'est la raison pour laquelle il y a « beaucoup d'inertie » : entre
   le moment ou on demande un virage et le moment ou la geometrie bouge, il
   faut que le nuage de vesicules se decale, qu'il fusionne, et que la paroi
   se construise. Environ six secondes. On ne peut pas l'accelerer sans
   casser le mecanisme.
--------------------------------------------------------------------------- */

import { Screen } from './core/pixel.js';
import { clamp, lerp, smoothstep, angleDelta, noise1, TAU } from './core/util.js';
import { PALETTES, ORDRE_PALETTES } from './data/palette.js';
import { Hyphe } from './sim/hyphe.js';
import { Contenu, S_MAX } from './sim/contenu.js';
import { Scene } from './render/scene.js';

/* Reglage du virage. Mesure sur 3 manches de 120 s a consigne pleine :
   0,008 -> 130 um de rayon, 0,014 -> 71, 0,020 -> 49, 0,032 -> 32.
   On retient 0,016, soit ~62 um : un hyphe serpente, il ne fait pas
   d'epingle a cheveux (defaut releve sur le prototype precedent,
   « les virages sont trop serres »). */
const KOM = 0.016;
const TAU_OM = 3.5;         // s : constante d'inertie du cap

export class App {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.screen = new Screen(canvas);
    this.scene = new Scene(this.screen);
    this.reset();

    this.opts = {
      vesicules: true, granulation: true, organites: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };
    this.palette = 'phase';
    this.vitesse = 1;
    this.zoom = 1;
    this.pause = false;
    this.pilotage = 'auto';
    this.miseAuPoint = null;    // null = derive automatique
    this.pointeur = null;

    this.t = 0;
    this.last = 0;
    this.fps = 60;

    addEventListener('resize', () => this.layout());
    canvas.addEventListener('pointermove', (e) => this.viser(e));
    canvas.addEventListener('pointerdown', (e) => { this.pilotage = 'souris'; this.viser(e); this.onPilotage?.(); });
    canvas.addEventListener('pointerleave', () => { this.pointeur = null; });
    this.layout();
  }

  reset(graine = 20260928) {
    this.hy = new Hyphe({ graine });
    this.co = new Contenu(this.hy, { graine });
    this.phiCible = 0;
    this.scene.cam.x = this.hy.x;
    this.scene.cam.y = this.hy.y;
    this.horloge = 0;
  }

  layout() {
    const cw = this.host.clientWidth || 640;
    const ch = this.host.clientHeight || 800;
    const S = clamp(Math.round(Math.min(cw, ch) / 300), 2, 6);
    let W = clamp(Math.round(cw / S), 180, 460);
    let H = clamp(Math.round(ch / S), 180, 460);
    /* Borne de cout : au-dela de ~130 kpx le remplissage et la bande de
       distance ne tiennent plus dans une image a 60 Hz en JS. */
    while (W * H > 132000) { W = Math.round(W * 0.95); H = Math.round(H * 0.95); }
    this.screen.resize(W, H);
    /* La Scene doit connaitre la taille AVANT la premiere simulation : le
       recul camera se calcule sur l'etendue du cadre, et un cadre de
       taille indefinie donnait une camera NaN, donc une image vide. */
    this.scene.alloc(W, H);
    this.canvas.style.width = `${W * S}px`;
    this.canvas.style.height = `${H * S}px`;
  }

  viser(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointeur = {
      x: (e.clientX - r.left) / r.width * this.screen.w,
      y: (e.clientY - r.top) / r.height * this.screen.h,
    };
  }

  /* --- simulation --------------------------------------------------------- */

  maj(dt) {
    const hy = this.hy, co = this.co, sc = this.scene;
    this.horloge += dt;

    /* 1. Consigne angulaire du gradient de Ca2+. */
    let cible = 0;
    if (this.pilotage === 'souris' && this.pointeur) {
      const wx = (this.pointeur.x - sc.w * 0.5) / sc.pxUm + sc.cam.x;
      const wy = (this.pointeur.y - sc.h * 0.5) / sc.pxUm + sc.cam.y;
      const d = Math.hypot(wx - hy.x, wy - hy.y);
      if (d > 0.8) cible = clamp(angleDelta(hy.th, Math.atan2(wy - hy.y, wx - hy.x)), -0.85, 0.85);
    } else {
      /* Derive lente : une hyphe libre n'est pas droite, elle serpente. */
      cible = (noise1(this.horloge * 0.055, 31) - 0.5) * 1.5;
    }
    this.phiCible += (cible - this.phiCible) * clamp(dt * 0.9, 0, 1);

    /* 2. Le contenu vit, et fusionne. */
    co.maj(dt, this.phiCible, this.opts);

    /* 3. L'hyphe ne fait que consommer le bilan des fusions. */
    const da = co.avance;
    const omCible = (co.couple / Math.max(dt, 1e-4)) * KOM;
    hy.om += (omCible - hy.om) * clamp(dt / TAU_OM, 0, 1);
    hy.avancer(da, dt);

    /* 4. Camera. L'apex se tient a 30 % du bord d'attaque, quel que soit
       son cap et quel que soit le format de la fenetre : on calcule donc
       le recul en pixels sur l'etendue du cadre dans la direction du cap,
       pas en um sur une constante. */
    const ext = Math.abs(Math.cos(hy.th)) * sc.w + Math.abs(Math.sin(hy.th)) * sc.h;
    const recul = (0.22 * ext) / sc.pxUm;
    const tx = hy.x - Math.cos(hy.th) * recul, ty = hy.y - Math.sin(hy.th) * recul;
    const k = 1 - Math.exp(-dt / 1.8);
    sc.cam.x += (tx - sc.cam.x) * k;
    sc.cam.y += (ty - sc.cam.y) * k;

    /* 5. Mise au point : elle derive, comme sur une platine qui travaille. */
    sc.zFocus = this.miseAuPoint !== null
      ? this.miseAuPoint
      : 0.30 * Math.sin(this.horloge * 0.105) + 0.18 * (noise1(this.horloge * 0.07, 5) - 0.5);
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;

    const sc0 = this.scene;
    sc0.pxUm = (0.46 * Math.min(sc0.w, sc0.h)) / (2 * this.hy.R) * this.zoom;

    if (!this.pause) {
      const dt = dt0 * this.vitesse;
      /* Sous-pas : au-dela de 25 ms les collisions traversent. */
      const n = Math.max(1, Math.ceil(dt / 0.025));
      for (let i = 0; i < n; i++) this.maj(dt / n);
      this.t += dt;
    }

    const sc = this.scene;
    sc.dessiner(this.hy, this.co, PALETTES[this.palette], this.t, this.opts);
    this.screen.present();
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}
