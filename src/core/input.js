/* ---------------------------------------------------------------------------
   Entrees. Clavier lu par event.code (position physique) : ZQSD et WASD
   tombent sur les memes touches, aucun reglage.

   Cinq verbes, pas plus :
     - BARRER      gauche/droite : on oriente le SPITZENKORPER, pas l'apex.
     - POUSSEE     haut          : on pompe des osmolytes, le turgor monte.
     - CONSOLIDER  bas           : on ferme l'apex, la paroi epaissit.
     - RAMIFIER    espace        : un nouvel apex derriere soi, a 60-90 deg.
     - SPORULER    entree        : on encaisse la manche.

   Tactile : moitie gauche = barre horizontale, moitie droite = glissement
   vertical (poussee / consolidation) et TAP = ramifier. Sporuler passe par
   le bouton du HUD, jamais par un geste : c'est une decision irreversible.
--------------------------------------------------------------------------- */

import { clamp } from './util.js';

const BARRE = { KeyA: -1, KeyD: 1, ArrowLeft: -1, ArrowRight: 1 };
const DRIVE = { KeyW: 1, KeyS: -1, ArrowUp: 1, ArrowDown: -1 };

/* Au-dela de ce deplacement du doigt la barre est a fond. 22 % de la largeur
   affichee : plus court, le pouce sortait de la zone gauche en virage serre ;
   plus long, on ne pouvait pas donner un coup de barre franc. */
const BARRE_COURSE = 0.22;
/* Un tap est un contact bref et immobile. Au-dela de 14 px il s'agit d'un
   glissement : sinon chaque correction de barre ramifiait. */
const TAP_MS = 220;
const TAP_PX = 14;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.barre = 0;          // -1 .. 1, maintenu
    this.drive = 0;          // -1 (consolider) .. 1 (poussee), maintenu
    this.ramifier = false;   // impulsion, consommee
    this.sporuler = false;   // impulsion, consommee
    this.pause = false;
    this.anyPress = false;
    this.hasTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    /* Etat expose pour que le HUD dessine les zones tactiles. */
    this.pad = { barre: false, bx: 0, drive: false, dy: 0 };
    this._touches = new Map();
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.anyPress = true;
      if (e.code === 'Space') { this.ramifier = true; e.preventDefault(); }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { this.sporuler = true; e.preventDefault(); }
      if (e.code === 'Escape' || e.code === 'KeyP') this.pause = true;
      if (BARRE[e.code] || DRIVE[e.code]) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    c.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, r };
  }

  _down(e) {
    /* La souris ne pilote pas le jeu, mais elle doit pouvoir le DEMARRER :
       l'ecran de titre n'attendait qu'une touche, donc sur une page ouverte
       d'un clic (un artifact, un iframe) on cliquait sans rien obtenir et on
       concluait que le jeu ne marchait pas. Un clic compte donc comme une
       pression, et seul le pilotage reste reserve au tactile. */
    if (e.pointerType === 'mouse') { this.anyPress = true; return; }
    e.preventDefault();
    this.anyPress = true;
    const { u, r } = this._local(e);
    const role = u < 0.5 ? 'barre' : 'drive';
    this._touches.set(e.pointerId, {
      role, ox: e.clientX, oy: e.clientY, r, t0: performance.now(), moved: 0,
    });
    if (role === 'barre') { this.pad.barre = true; this.pad.bx = 0; }
    else { this.pad.drive = true; this.pad.dy = 0; }
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* sans effet */ }
  }

  _move(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    t.moved = Math.max(t.moved, Math.hypot(e.clientX - t.ox, e.clientY - t.oy));
    if (t.role === 'barre') {
      this.pad.bx = clamp((e.clientX - t.ox) / (t.r.width * BARRE_COURSE), -1, 1);
    } else {
      /* Vers le haut = poussee, donc signe inverse de l'axe ecran. */
      this.pad.dy = clamp(-(e.clientY - t.oy) / (t.r.height * 0.14), -1, 1);
    }
  }

  _up(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    this._touches.delete(e.pointerId);
    try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { /* sans effet */ }
    const bref = performance.now() - t.t0 < TAP_MS && t.moved < TAP_PX;
    if (t.role === 'barre') { this.pad.barre = false; this.pad.bx = 0; }
    else {
      this.pad.drive = false; this.pad.dy = 0;
      if (bref) this.ramifier = true;
    }
  }

  /** A appeler une fois par image, avant la logique. */
  sample() {
    let b = 0, d = 0;
    for (const code of this.keys) {
      if (BARRE[code]) b += BARRE[code];
      if (DRIVE[code]) d += DRIVE[code];
    }
    if (this.pad.barre) b += this.pad.bx;
    if (this.pad.drive) d += this.pad.dy;
    this.barre = clamp(b, -1, 1);
    this.drive = clamp(d, -1, 1);
  }

  takeRamifier() { const v = this.ramifier; this.ramifier = false; return v; }
  takeSporuler() { const v = this.sporuler; this.sporuler = false; return v; }
  takePause() { const v = this.pause; this.pause = false; return v; }
  takeAnyPress() { const v = this.anyPress; this.anyPress = false; return v; }
}
