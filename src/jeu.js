/* ---------------------------------------------------------------------------
   LE JEU.

   Ce fichier ne simule RIEN. Tout ce qu'il montre existe deja ailleurs et a
   ete mesure ailleurs :

     - la colonie et sa loi de croissance : `sim/thalle.js` (verdicts 13, 14) ;
     - le nutriment, la reserve qui circule, le front, les menaces et le
       sporocyste : `sim/jeu.js` (verdicts 19 a 21) ;
     - le pont entre les deux echelles : `monde.js` (verdict 15) ;
     - l'apex, ses vesicules et son inertie : `main.js` (verdicts 1 a 12).

   Si cette page reecrivait l'une de ces lois de son cote, la meme colonie ne
   se jouerait pas de la meme facon selon l'endroit qu'on regarde — et c'est
   exactement ce que le projet s'interdit depuis la regle 1.

   CE QU'ELLE AJOUTE, ET RIEN D'AUTRE : de quoi voir et de quoi agir.

   L'ESTHETIQUE NE PERD RIEN, et c'est une contrainte, pas un voeu. Les trois
   optiques restent (phase, fond noir, MET). Le panneau s'efface tout seul au
   bout de quelques secondes sans geste — on regarde pousser une moisissure,
   le HUD n'a aucune raison de rester en travers. Et ce que le joueur a besoin
   de savoir se lit SUR L'ORGANISME, par des calques qu'on allume un a la
   fois, jamais par une jauge posee a cote.
--------------------------------------------------------------------------- */

import { Screen, hexToRgba, fade32, mix32 } from './core/pixel.js';
import { clamp, lerp, smoothstep } from './core/util.js';
import { PALETTES } from './data/palette.js';
import { VueThalle } from './render/vueThalle.js';
import { Scene } from './render/scene.js';
import { depuisMacro } from './sim/hyphe.js';
import { Contenu } from './sim/contenu.js';
import { pasMicro } from './main.js';
import { flouEcran } from './monde.js';
import { Jeu, T_MAX, STOCK_PLEIN, CONFORT, GENOME_BASE, TRAITS, troisSpores } from './sim/jeu.js';
import { MATRICES } from './sim/matrices.js';
import { mulberry32 } from './core/util.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* Le fondu est celui du pont, et pour la meme raison : c'est le temps que le
   reservoir apical met a se remplir. Voir monde.js. */
const PRECHAUFFE = 20;
const DT_MICRO = 1 / 60;
const IMAGES_FONDU = 80;
const FLOU_MAX = 5;

/* Secondes reelles sans un geste avant que le panneau ne s'efface. Assez
   long pour qu'on ne le perde pas en reflechissant, assez court pour qu'une
   contemplation soit nette. */
const REPOS = 6;

/* Les calques. UN SEUL A LA FOIS, et c'est deliberé : superposes, ils
   redeviennent un tableau de bord, et on ne lit plus l'organisme. */
export const CALQUES = ['aucun', 'substrat', 'reserve', 'menace'];

/* Teintes des filtres. Ambre pour ce qu'il y a a manger, bleu froid pour ce
   que le reseau transporte, rouge eteint pour ce qui tue : trois familles
   qu'on distingue du premier coup d'oeil et qui n'appartiennent a aucune des
   trois optiques, donc qui se lisent aussi bien sur les trois. */
const TEINTES = { substrat: '#d8a24a', reserve: '#5f9fd0', menace: '#c25f5f' };

export class AppJeu {
  constructor(canvas, hote) {
    this.canvas = canvas;
    this.hote = hote;
    this.screen = new Screen(canvas);
    this.vueT = new VueThalle(this.screen);
    this.vueA = new Scene(this.screen);

    this.palette = 'phase';
    this.vitesse = 300;
    this.calque = 'aucun';
    this.pause = false;
    this.opts = {
      vesicules: true, granulation: true, organites: true,
      membrane: true, depots: true, milieu: true,
      halo: true, grain: true, echelle: true,
      exocytose: true, fusion: true,
    };

    this.mode = 'macro';
    this.tr = 0;
    this.pointe = null;
    this.t = 0; this.last = 0; this.fps = 60;
    this.phiCible = 0;            // consigne de gradient de Ca2+, en bas
    this.viseur = null;           // position ecran du pointeur, en bas
    this.geste = 0;               // horodatage du dernier geste (HUD)
    this.message = '';

    this.reset();
    addEventListener('resize', () => this.layout());
    canvas.addEventListener('pointerdown', (e) => this.toucher(e));
    canvas.addEventListener('pointermove', (e) => this.bouger(e));
    canvas.addEventListener('pointerleave', () => { this.viseur = null; });
    this.layout();
  }

  /**
   * UNE NOUVELLE PARTIE : un parcours, pas un plateau. On repart d'une spore
   * sauvage et on enchaine les aliments.
   */
  reset(graine = (Math.random() * 1e6) | 0) {
    this.rngP = mulberry32((graine ^ 0x3c6ef35f) >>> 0);
    this.genome = { ...GENOME_BASE };
    this.tour = 0;
    this.parcours = [];
    this.candidates = null;
    /* L'ORDRE DES PLATEAUX EST TIRE UNE FOIS, PAS A CHAQUE FOIS. Tire a
       chaque passage, on retombait sur le meme aliment deux fois de suite et
       le parcours n'avait plus de forme. */
    this.ordre = MATRICES.map((_, i) => i);
    for (let i = this.ordre.length - 1; i > 0; i--) {
      const j = (this.rngP() * (i + 1)) | 0;
      [this.ordre[i], this.ordre[j]] = [this.ordre[j], this.ordre[i]];
    }
    this.nouveauPlateau();
  }

  /** Le plateau suivant, avec le genome qu'on a emporte. */
  nouveauPlateau() {
    this.mat = MATRICES[this.ordre[this.tour % MATRICES.length]];
    this.tour++;
    this.graine = (this.rngP() * 1e6) | 0;
    this.jeu = new Jeu({ graine: this.graine, matrice: this.mat, genome: this.genome });
    this.th = this.jeu.th;
    this.mode = 'macro'; this.tr = 0; this.pointe = null;
    this.candidates = null;
    this.vueT.cam.x = 0; this.vueT.cam.y = 0;
    this.pxMacro = 0;
    this.dire(this.mat.nom + ' — ' + this.mat.strategie);
    this.marquer();
  }

  /**
   * LE GESTE DE FIN, et il etait deja dessine. A l'eclatement, `Sporange`
   * choisit une spore et la camera la suit ; ici le joueur en choisit une
   * parmi trois, chacune avec son genome mute, et il la regarde partir. Le
   * plus beau moment du moteur devient le moment de decision.
   */
  choisir(i) {
    if (!this.candidates || !this.candidates[i]) return;
    this.genome = this.candidates[i].genome;
    this.parcours.push({
      plateau: this.mat.cle, spores: this.jeu.spores,
      trait: this.candidates[i].dominante,
    });
    this.nouveauPlateau();
  }

  marquer() { this.geste = performance.now(); }

  /** Un mot ne reste pas a l'ecran : il se dit et il s'efface. */
  dire(m) { this.message = m; this.tMot = performance.now(); }

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

  /* --- ce que le joueur fait ------------------------------------------------ */

  ecran(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * this.screen.w,
             y: (e.clientY - r.top) / r.height * this.screen.h };
  }

  bouger(e) {
    const s = this.ecran(e);
    this.viseur = s;
    if (this.mode === 'micro') this.marquer();
  }

  /**
   * En haut, toucher c'est CHOISIR UNE POINTE et descendre dessus. En bas,
   * c'est dire ou l'on veut aller — et c'est tout ce qu'on peut dire, parce
   * qu'on ne pilote pas un apex : on deplace la consigne du gradient de
   * calcium et on attend les 10,7 s d'inertie mesurees.
   */
  toucher(e) {
    this.marquer();
    if (this.jeu.fin) return;
    const s = this.ecran(e);
    if (this.mode !== 'macro') { this.viseur = s; return; }
    const wx = (s.x - this.vueT.w * 0.5) / this.vueT.pxUm + this.vueT.cam.x;
    const wy = (s.y - this.vueT.h * 0.5) / this.vueT.pxUm + this.vueT.cam.y;
    let best = null, bd = Infinity;
    for (const p of this.th.pointes) {
      if (!p.vive) continue;
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bd) { bd = d; best = p; }
    }
    /* Une pointe qui vient de naitre n'a pas encore d'axe a re-echantillonner :
       `depuisMacro` a besoin de points de controle. On ne descend pas dessus,
       on le dit. */
    if (!best || bd * this.vueT.pxUm >= 40) return;
    if (best.axe.n < 3) { this.dire('cette branche vient de naitre'); return; }
    this.descendre(best);
  }

  descendre(p) {
    /* L'axe existe deja : on le re-echantillonne, on ne le recree pas. */
    const hy = depuisMacro(p.axe.xs, p.axe.ys, p.axe.n, p.th, 210, {
      graine: (p.axe.idx * 7919 + 13) | 0,
      bout: [p.x, p.y],
    });
    const co = new Contenu(hy, { graine: (p.axe.idx * 104729 + 7) | 0 });
    p.micro = { hy, co };
    this.pointe = p;
    this.jeu.tenir(p);
    this.mode = 'descente';
    this.tr = 0;
    this.pasTotal = Math.round(PRECHAUFFE / DT_MICRO);
    this.pasRestants = this.pasTotal;
    this.parImage = Math.ceil(this.pasTotal / IMAGES_FONDU);
    this.pxMicro = 0;
    this.phiCible = 0;
    this.vueA.cam.x = p.x; this.vueA.cam.y = p.y;
    this.marquer();
  }

  remonter() {
    if (this.mode !== 'micro') return;
    this.mode = 'montee';
    this.tr = 1;
    this.marquer();
  }

  /** Ramifier ICI, maintenant. La colonie, elle, ramifie ou elle veut. */
  ramifier() {
    if (this.mode !== 'micro') return false;
    const v = this.jeu.vue();
    const ok = this.jeu.ramifier(v.gauche > v.droite ? -1 : 1);
    this.dire(ok ? 'branche' : 'pas de quoi brancher');
    this.marquer();
    return ok;
  }

  /**
   * Monter un sporangiophore. Il ne part pas de la pointe mais du mycelium
   * etabli, six noeuds en arriere — et c'est la tout le choix : ce noeud-la
   * doit tenir jusqu'au bout, et on ne voit d'ou il est ni le front ni les
   * zones hostiles quand on est descendu.
   */
  sporuler() {
    const ok = this.jeu.sporuler();
    this.dire(ok ? 'sporangiophore monte'
      : (this.jeu.sporocyste ? 'un sporocyste est deja en route' : 'impossible ici'));
    this.marquer();
    return ok;
  }

  /* --- la boucle ------------------------------------------------------------ */

  /**
   * Un pas de micro sur la pointe tenue, rendu au macro.
   *
   * LA POINTE TENUE RESTE SOUMISE A SA RESERVE. `Thalle.pas` l'ignore — c'est
   * la micro qui la pilote — mais rien ne justifie qu'une pointe affamee
   * pousse a plein regime parce qu'on la regarde. On applique donc la meme
   * modulation que la colonie : c'est le meme organisme.
   */
  pasVisite(dt) {
    const p = this.pointe, { hy, co } = p.micro;
    const f = this.jeu.modulation(p);
    if (f <= 0.001) return;
    const da = pasMicro(hy, co, dt * f, this.phiCible, this.opts);
    this.th.inscrire(p, hy.x, hy.y, hy.th, da);
  }

  /** La consigne de gradient suit le pointeur, avec l'inertie de l'apex. */
  majConsigne(dt) {
    if (this.mode !== 'micro' || !this.viseur) return;
    const hy = this.pointe.micro.hy;
    const wx = (this.viseur.x - this.vueA.w * 0.5) / this.vueA.pxUm + this.vueA.cam.x;
    const wy = (this.viseur.y - this.vueA.h * 0.5) / this.vueA.pxUm + this.vueA.cam.y;
    let d = Math.atan2(wy - hy.y, wx - hy.x) - hy.th;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const cible = clamp(d * 1.6, -1.5, 1.5);
    this.phiCible += (cible - this.phiCible) * clamp(dt * 0.9, 0, 1);
  }

  image(ts) {
    const dt0 = this.last ? clamp((ts - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = ts;
    this.fps += (1 / Math.max(dt0, 1e-3) - this.fps) * 0.05;
    const sc = this.screen;
    if (!this.pause) this.t += dt0;

    /* La partie est finie : on propose trois spores, une seule fois. Sans
       sporocyste mene a terme il n'y a rien a emporter — c'est tout l'objet
       du jeu, et le parcours s'arrete la. */
    if (this.jeu.fin && !this.candidates && this.jeu.spores > 0) {
      this.candidates = troisSpores(this.genome, this.rngP);
    }

    if (!this.pause && !this.jeu.fin) {
      if (this.mode === 'macro') {
        this.jeu.pas(dt0 * this.vitesse);
      } else if (this.mode === 'descente') {
        /* Le fondu est une horloge : `tr` EST la fraction du reservoir
           deja remplie. Pendant ces vingt secondes simulees, la colonie
           entiere vit — rien n'est saute. */
        const k = Math.min(this.parImage, this.pasRestants);
        for (let i = 0; i < k; i++) this.pasVisite(DT_MICRO);
        this.pasRestants -= k;
        this.jeu.pas(k * DT_MICRO);
        this.tr = 1 - this.pasRestants / this.pasTotal;
        if (this.pasRestants <= 0) { this.tr = 1; this.mode = 'micro'; }
      } else if (this.mode === 'montee') {
        this.tr -= 1 / IMAGES_FONDU;
        const n = Math.max(1, Math.ceil(dt0 / 0.025));
        for (let i = 0; i < n; i++) this.pasVisite(dt0 / n);
        this.jeu.pas(dt0);
        if (this.tr <= 0) {
          this.tr = 0; this.mode = 'macro';
          this.jeu.tenir(null);
          this.pointe.micro = null; this.pointe = null;
        }
      } else if (this.mode === 'micro') {
        this.majConsigne(dt0);
        const n = Math.max(1, Math.ceil(dt0 / 0.025));
        for (let i = 0; i < n; i++) this.pasVisite(dt0 / n);
        this.jeu.pas(dt0);
        /* Une pointe qui meurt sous nos yeux nous renvoie en haut : il n'y a
           plus rien a regarder, et c'est un evenement, pas une panne. */
        if (!this.pointe.vive) { this.dire('la pointe est morte'); this.remonter(); }
      }
    }

    /* --- grossissements ---------------------------------------------------- */
    const etendue = Math.max(this.th.diametre * 1.12, 600);
    const cM = (0.80 * Math.min(sc.w, sc.h)) / etendue;
    this.pxMacro = this.pxMacro ? this.pxMacro + (cM - this.pxMacro) * 0.06 : cM;
    this.pxMicro = (0.46 * Math.min(sc.w, sc.h)) / (2 * 5.5);

    /* --- rendu -------------------------------------------------------------- */
    const P = PALETTES[this.palette];
    if (this.mode === 'macro') {
      this.vueT.pxUm = this.pxMacro;
      this.vueT.dessiner(this.th, P, this.t,
                         { ...this.opts, calque: () => this.peindreCalque(P) });
      this.marqueurs(P);
    } else if (this.mode === 'micro') {
      this.cadrerApex();
      this.vueA.dessiner([{ hy: this.pointe.micro.hy, co: this.pointe.micro.co }], P, this.t, this.opts);
    } else {
      const u = smoothstep(0, 1, this.tr);
      const px = Math.exp(lerp(Math.log(this.pxMacro), Math.log(this.pxMicro), u));
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
      const r = Math.round(FLOU_MAX * Math.sin(Math.PI * u));
      if (r > 0) flouEcran(sc.px, sc.w, sc.h, r);
      this.vueT.grainCapteur(P, this.t);
    }
    sc.present();
  }

  /* --- les calques ---------------------------------------------------------- */

  /**
   * UN CALQUE, C'EST UN FILTRE QU'ON GLISSE DANS LE TRAJET OPTIQUE, pas un
   * graphique pose a cote. Il teinte le champ la ou la grandeur est forte et
   * ne touche a rien d'autre — on continue de voir le mycelium a travers.
   *
   * Il est dessine APRES la colonie et AVANT le grain : c'est ce qui lui
   * donne l'air d'appartenir a l'image et non de flotter par-dessus.
   */
  peindreCalque(P) {
    if (this.calque === 'aucun' || this.mode !== 'macro') return;
    const sc = this.screen, v = this.vueT;
    const inv = 1 / v.pxUm;
    const ox = v.cam.x - (v.w * 0.5) * inv, oy = v.cam.y - (v.h * 0.5) * inv;
    /* Une maille d'ecran de 3 px : plus fin, on paie un echantillonnage de
       grille pour une information qui n'a pas cette resolution. */
    const M = 3;
    /* LES COULEURS DU CALQUE NE SONT PAS CELLES DE L'ORGANISME, et c'est
       voulu : un calque est un FILTRE qu'on glisse dans le trajet optique,
       il a sa teinte a lui. Tirees de la palette, elles etaient pales sur un
       fond pale et on ne lisait rien du tout — le premier essai de calque
       substrat etait rigoureusement invisible. */
    const cSub = hexToRgba(TEINTES.substrat);
    const cRes = hexToRgba(TEINTES.reserve);
    const cMen = hexToRgba(TEINTES.menace);
    sc.layer(0);
    for (let sy = 0; sy < v.h; sy += M) {
      for (let sx = 0; sx < v.w; sx += M) {
        const wx = ox + sx * inv, wy = oy + sy * inv;
        let a = 0, c = 0;
        if (this.calque === 'substrat') {
          /* La matrice va de 0,35 a 1,25 : normalise sur [0, 1] le calque
             etait un aplat uniforme au debut de la partie, quand rien n'est
             encore mange. On l'etale sur la plage REELLE, et ce qui se lit
             alors est ce qu'on veut voir — les plages riches, et le trou que
             la colonie creuse derriere elle. */
          const u = clamp((this.jeu.substratVu(wx, wy) / STOCK_PLEIN - 0.28) / 1.0, 0, 1);
          /* Sobre : le filtre doit se lire, pas repeindre la lame. A 0,56
             partout le champ entier virait a l'ambre et on ne voyait plus
             le mycelium. */
          a = 0.05 + 0.26 * u;
          c = cSub;
        } else if (this.calque === 'reserve') {
          a = 0.34 * clamp(this.jeu.reserveVue(wx, wy) / 6000, 0, 1);
          c = cRes;
        } else {
          /* La menace : pleine dans le disque, et un liseré au bord pour
             qu'on voie OU elle en est, pas seulement qu'elle est la. */
          let d = Infinity, r = 0;
          for (const m of this.jeu.menaces) {
            if (m.r <= 0) continue;
            const q = Math.hypot(wx - m.x, wy - m.y);
            if (q - m.r < d - r) { d = q; r = m.r; }
          }
          if (r > 0 && d < r) a = lerp(0.16, 0.60, smoothstep(0.55, 1, d / r));
          c = cMen;
        }
        if (a < 0.012) continue;
        const col = fade32(c, a);
        for (let y = sy; y < sy + M && y < v.h; y++) {
          for (let x = sx; x < sx + M && x < v.w; x++) sc.plot(x, y, col);
        }
      }
    }
  }

  /**
   * LES MARQUEURS SONT TROIS, ET PAS UN DE PLUS : le front, la pointe qu'on
   * s'apprete a prendre, et le sporocyste. Tout le reste se lit sur
   * l'organisme ou dans un calque.
   */
  marqueurs(P) {
    const sc = this.screen, v = this.vueT;
    /* LE RETICULE, LUI, EST SUR LE VERRE DE L'OCULAIRE : il passe APRES la
       composition et apres le grain, en `direct`, parce qu'il n'appartient
       pas a la scene. C'est la difference exacte entre un filtre et un
       reticule, et elle se voit : dessine sur un calque de profondeur apres
       que `dessiner` a deja composite, il n'apparaissait pas du tout. */
    const c = hexToRgba(P.paroi);

    /* Le front de dessechement : une ligne verticale, la ou il en est. */
    const xf = Math.round(v.sx(this.jeu.front));
    if (xf > -2 && xf < v.w + 2) {
      for (let y = 0; y < v.h; y += 2) sc.direct(xf, y, fade32(c, 0.40));
    }

    /* Le sporocyste : un anneau qui se remplit. Il n'y en a qu'un. */
    const sp = this.jeu.sporocyste;
    if (sp) {
      const nd = this.jeu.noeuds[sp.noeud];
      if (nd && !nd.mort) {
        const x = v.sx(nd.x), y = v.sy(nd.y);
        const f = clamp(sp.masse / 10000, 0, 1);
        for (let k = 0; k < 28; k++) {
          const th = (k / 28) * Math.PI * 2 - Math.PI / 2;
          const a = k / 28 <= f ? 0.90 : 0.20;
          sc.direct(x + Math.cos(th) * 6, y + Math.sin(th) * 6, fade32(c, a));
        }
      }
    }

    /* La pointe visee : un simple crochet, et seulement quand le pointeur
       est assez pres pour qu'elle soit vraiment prenable. */
    if (this.viseur && !this.jeu.fin) {
      const inv = 1 / v.pxUm;
      const wx = (this.viseur.x - v.w * 0.5) * inv + v.cam.x;
      const wy = (this.viseur.y - v.h * 0.5) * inv + v.cam.y;
      let best = null, bd = Infinity;
      for (const p of this.th.pointes) {
        if (!p.vive) continue;
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd * v.pxUm < 40) {
        const x = Math.round(v.sx(best.x)), y = Math.round(v.sy(best.y));
        for (let k = -4; k <= 4; k++) {
          if (Math.abs(k) < 2) continue;
          sc.direct(x + k, y, fade32(c, 0.85));
          sc.direct(x, y + k, fade32(c, 0.85));
        }
      }
    }
  }

  cadrerApex(k = 0.12) {
    const hy = this.pointe.micro.hy, sc = this.vueA;
    sc.pxUm = sc.pxUm || this.pxMicro;
    const ext = Math.abs(Math.cos(hy.th)) * sc.w + Math.abs(Math.sin(hy.th)) * sc.h;
    const recul = (0.22 * ext) / sc.pxUm;
    const tx = hy.x - Math.cos(hy.th) * recul, ty = hy.y - Math.sin(hy.th) * recul;
    sc.cam.x += (tx - sc.cam.x) * k; sc.cam.y += (ty - sc.cam.y) * k;
    sc.zFocus = 0.30 * Math.sin(this.t * 0.105);
  }

  /* --- ce que le panneau affiche -------------------------------------------- */

  etat() {
    const j = this.jeu;
    const reste = Math.max(0, T_MAX - j.t);
    /* ON DEMANDE A LA VUE CE QU'ELLE EST, on ne le deduit pas du mode.
       `vue()` rend la carte ou une pointe selon qu'une pointe est TENUE, et
       elle l'est des le debut de la descente — bien avant que le mode ne
       bascule en `micro`, au sommet du flou. Deduit du mode, le panneau
       lisait `tetes` sur une vue qui n'en avait pas, pendant tout le fondu. */
    const w = j.vue();
    const v = w.ou === 'macro' ? w : null;
    return {
      mode: this.mode,
      fin: j.fin,
      tour: this.tour,
      plateau: this.mat.nom,
      note: this.mat.note,
      strategie: this.mat.strategie,
      genome: this.genome,
      candidates: this.candidates && this.candidates.map((c) => ({
        trait: TRAITS[c.dominante].nom,
        pour: TRAITS[c.dominante].pour,
        contre: TRAITS[c.dominante].contre,
        valeur: c.genome[c.dominante],
        sens: c.sens,
      })),
      parcours: this.parcours.length,
      spores: j.spores,
      avancement: j.sporocyste ? j.sporocyste.masse / 10000 : 0,
      pointes: this.th.vives,
      mycelium: this.th.total / 1000,
      reste,
      pressant: reste < 1800,
      /* Ce que le front laisse au noeud porteur de la pointe visee. */
      sursis: v && v.tetes.length
        ? Math.max(0, ...v.tetes.filter((t) => t.porteur).map((t) => (t.porteur.x - v.front) / v.vFront))
        : 0,
      reserve: v ? 0 : w.reserve,
      message: this.tMot && performance.now() - this.tMot < 4000 ? this.message : '',
    };
  }

  demarrer() {
    const boucle = (ts) => { this.image(ts); requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }
}

/* --------------------------------------------------------------------------
   LE PANNEAU. Il s'efface tout seul, et c'est la moitie du cahier des
   charges : « que les elements de gameplay n'enlevent rien a l'esthetique ».
-------------------------------------------------------------------------- */

export function brancherJeu(app) {
  const presse = (sel, f) => $$(sel).forEach((b) => b.addEventListener('click', () => { f(b); maj(); }));

  presse('[data-pal]', (b) => {
    app.palette = b.dataset.pal; app.marquer();
    $$('[data-pal]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  presse('[data-cal]', (b) => {
    app.calque = b.dataset.cal; app.marquer();
    $$('[data-cal]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  presse('[data-vit]', (b) => {
    app.vitesse = +b.dataset.vit; app.marquer();
    $$('[data-vit]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  presse('#bRemonter', () => app.remonter());
  presse('#bBrancher', () => app.ramifier());
  presse('#bSporuler', () => app.sporuler());
  presse('#bRejouer', () => app.reset());
  presse('[data-spore]', (b) => app.choisir(+b.dataset.spore));
  presse('#bPause', (b) => { app.pause = !app.pause; b.setAttribute('aria-pressed', String(app.pause)); });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') app.remonter();
    else if (e.key === 'b' || e.key === 'B') app.ramifier();
    else if (e.key === 's' || e.key === 'S') app.sporuler();
    else if (e.key === ' ') { e.preventDefault(); app.pause = !app.pause; }
    else return;
    maj();
  });
  addEventListener('pointermove', () => app.marquer());

  const hms = (s) => `${Math.floor(s / 60)} min`;

  function maj() {
    const e = app.etat();
    const bas = e.mode === 'micro';
    $('#ou').textContent = bas ? 'sur une pointe' : 'la colonie';
    $('#chrono').textContent = e.fin ? '—' : hms(e.reste);
    $('#chrono').classList.toggle('pressant', e.pressant && !e.fin);
    $('#spores').textContent = e.spores;
    $('#sporo').textContent = e.avancement > 0 ? `${Math.round(e.avancement * 100)} %` : '—';
    $('#pointes').textContent = e.pointes;
    $('#mm').textContent = `${e.mycelium.toFixed(1)} mm`;
    $('#bRemonter').disabled = !bas;
    $('#bBrancher').disabled = !bas;
    $('#bSporuler').disabled = !bas || !!app.jeu.sporocyste;
    $('#mot').textContent = e.message || '';
    $('#plateau').textContent = e.plateau;
    $('#tour').textContent = e.tour;
    $('#fin').hidden = !e.fin;
    if (e.fin) {
      const gagne = e.spores > 0;
      $('#finTitre').textContent = gagne ? 'La colonie a essaimé' : 'La colonie s’est éteinte';
      $('#finTexte').textContent = gagne
        ? `${e.spores} sporocyste${e.spores > 1 ? 's' : ''} mené${e.spores > 1 ? 's' : ''} à terme sur ${e.mycelium.toFixed(0)} mm de mycélium. Une seule spore repartira — choisissez laquelle.`
        : `Aucun sporocyste n’a été rempli, donc rien n’est emporté. ${e.fin === 'eteint' ? 'Plus une pointe vivante.' : 'Le temps a manqué.'}`;
      $('#spores3').hidden = !gagne;
      $('#bRejouer').hidden = gagne;
      if (gagne && e.candidates) {
        e.candidates.forEach((c, i) => {
          const el = $(`[data-spore="${i}"]`);
          el.querySelector('.tr').textContent = c.trait;
          el.querySelector('.va').textContent =
            (c.valeur >= 1 ? '×' : '×') + c.valeur.toFixed(2);
          el.querySelector('.va').className = 'va ' + (c.sens > 0 ? 'plus' : 'moins');
          el.querySelector('.po').textContent = c.sens > 0 ? c.pour : c.contre === '—' ? 'moins fort' : c.contre;
        });
      }
    }
  }

  /* L'EFFACEMENT. On ne cache pas le panneau, on le retire du chemin : il
     redescend et s'eteint, et le moindre geste le ramene. */
  function repos() {
    const dort = (performance.now() - app.geste) / 1000 > REPOS && !app.jeu.fin;
    document.body.classList.toggle('repos', dort);
    requestAnimationFrame(repos);
  }

  maj();
  setInterval(maj, 250);
  requestAnimationFrame(repos);
  app.demarrer();
}
