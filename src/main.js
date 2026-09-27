/* ---------------------------------------------------------------------------
   Boucle principale, disposition, ecrans.

   LA CAMERA EST UNE REGLE DE CONCEPTION, PAS UN REGLAGE :
   elle suit l'apex pilote et son avancee NE DECROIT JAMAIS. Le joueur ne
   revient pas en arriere, donc :
     - ce qui est laisse derriere est definitivement laisse (d'ou le compteur
       de granules rates, qui est le seul reproche du jeu) ;
     - la geometrie derriere peut etre purgee, donc une manche de vingt minutes
       coute autant qu'une manche de deux ;
     - et ramifier ne recule pas la camera : la branche nait 14 px en arriere,
       la camera l'attend sur place. C'est ce qui rend la manoeuvre lisible.

   L'apex est place a 62 % de la hauteur, pas au centre : on a besoin de voir
   DEVANT. A 50 % on decouvrait les obstacles trop tard pour barrer, a 75 % le
   thalle qu'on vient de poser sortait du champ et les anastomoses devenaient
   incomprehensibles.
--------------------------------------------------------------------------- */

import { clamp, lerp } from './core/util.js';
import { Screen } from './core/pixel.js';
import { Input } from './core/input.js';
import { drawTextCentered } from './core/font.js';
import { SUBSTRATS_PALETTE, RARETE_HEX, UI } from './data/palette.js';
import { Game } from './game/game.js';
import { Cytoplasme } from './game/cytoplasme.js';
import { fond, decor, poussiere, vignette } from './render/scene.js';
import { branche as dessinerBranche, noeuds as dessinerNoeuds, spore as dessinerSpore }
  from './render/hyphe.js';
import { hud, fin } from './render/hud.js';

const canvas = document.getElementById('jeu');
const elOffre = document.getElementById('offre');
const elCartes = document.getElementById('cartes');
const elTitre = document.getElementById('titre');
const elPause = document.getElementById('pause');

/** Disposition. Le champ remplit l'ecran ; le HUD est en surimpression. */
function layout(w, h) {
  const ar = clamp(w / Math.max(1, h), 0.35, 3.2);
  if (ar >= 1.05) {
    const H = 272;
    const W = clamp(Math.round(H * ar), 300, 640);
    return { W, H, CX: W >> 1, CY: Math.round(H * 0.62), R: 9999, mode: 'sides' };
  }
  const W = 256;
  const H = clamp(Math.round(W / ar), 300, 470);
  return { W, H, CX: W >> 1, CY: Math.round(H * 0.62), R: 9999, mode: 'bottom' };
}

const scr = new Screen(canvas, layout(innerWidth, innerHeight));
scr.clip = false;
const input = new Input(canvas);

let g = null, cyto = null, cam = null, tPrec = 0, banque = lireBanque();

function lireBanque() {
  try { return parseInt(localStorage.getItem('apical.spores') || '0', 10) || 0; }
  catch { return 0; }
}
function ecrireBanque(v) {
  try { localStorage.setItem('apical.spores', String(v)); } catch { /* mode prive */ }
}

function semer() {
  g = new Game();
  cyto = new Cytoplasme(g.graine);
  cam = { x: 0, y: 0, z: 2.4, cx: scr.w >> 1, cy: Math.round(scr.h * 0.62) };
  elOffre.classList.remove('on');
  elTitre.classList.remove('on');
  elPause.classList.remove('on');
}

function relayout() {
  const L = layout(innerWidth, innerHeight);
  scr.applyLayout(L);
  scr.clip = false;
  if (cam) { cam.cx = L.CX; cam.cy = L.CY; }
  const st = canvas.parentElement.style;
  st.aspectRatio = L.W + ' / ' + L.H;
  st.height = 'min(100dvh, calc(100vw * ' + L.H + ' / ' + L.W + '))';
}
addEventListener('resize', relayout);

/* --- offre de genes, en DOM : la fonte 3x5 ne tient pas un texte long ----- */
function montrerOffre() {
  elCartes.innerHTML = '';
  for (let i = 0; i < g.offre.cartes.length; i++) {
    const gene = g.offre.cartes[i];
    const rang = g.rangs[gene.id] || 0;
    const b = document.createElement('button');
    b.className = 'carte';
    b.innerHTML = '<div class="top"><span class="nom"></span><span class="rar"></span></div>'
      + '<div class="desc"></div><div class="note"></div><div class="rang"></div>';
    b.querySelector('.nom').textContent = gene.nom;
    const r = b.querySelector('.rar');
    r.textContent = gene.rarete.toUpperCase();
    r.style.color = RARETE_HEX[gene.rarete];
    b.querySelector('.desc').textContent = gene.desc;
    b.querySelector('.note').textContent = gene.fondement;
    b.querySelector('.rang').textContent = gene.famille.toUpperCase()
      + (rang ? '  — RANG ' + (rang + 1) + '/' + gene.rang : '');
    b.style.borderColor = RARETE_HEX[gene.rarete];
    b.addEventListener('click', () => { g.choisir(i); elOffre.classList.remove('on'); });
    elCartes.appendChild(b);
  }
  document.getElementById('offre-titre').textContent =
    g.offre.source === 'locus' ? 'LOCUS D’EXPRESSION' : 'PALIER DE CROISSANCE';
  elOffre.classList.add('on');
}

addEventListener('keydown', (e) => {
  if (g && g.etat === 'offre' && /^Digit[123]$/.test(e.code)) {
    g.choisir(parseInt(e.code.slice(5), 10) - 1);
    elOffre.classList.remove('on');
  }
});

/* --- boucle ------------------------------------------------------------- */

function image(ms) {
  requestAnimationFrame(image);
  const t = ms / 1000;
  let dt = tPrec ? t - tPrec : 0.016;
  tPrec = t;
  dt = clamp(dt, 0, 1 / 20);

  input.sample();
  if (input.takePause() && g && (g.etat === 'jeu' || g.etat === 'pause')) {
    elPause.classList.toggle('on');
  }
  const enPause = elPause.classList.contains('on');

  if (!g) { titre(); return; }

  if (g.etat === 'jeu' && !enPause) {
    const dr = input.takeRegime();
    if (dr) g.changerRegime(dr);
    if (input.takeRamifier()) g.ramifier();
    if (input.takeSporuler()) g.sporuler();
    g.pas(dt, { barre: input.barre });
    g.arbitrer();
    if (g.etat === 'offre') montrerOffre();
    if (g.etat === 'mort' || g.etat === 'sporule') {
      banque += g.spores;
      ecrireBanque(banque);
    }
  } else if ((g.etat === 'mort' || g.etat === 'sporule') && input.takeRamifier()) {
    semer();
    return;
  }

  /* --- camera ---------------------------------------------------------
     Trois comportements, et chacun repond a une contrainte de conception.

     1. ZOOM TRES SERRE, ET VARIABLE. De 4,6 px/um a l'arret — le champ ne
        montre plus que 56 um de large, soit quatre diametres de tube — a 3,5 a
        pleine vitesse (73 um). L'hyphe occupe ainsi le quart de la largeur du
        champ, et l'on voit ARRIVER CHAQUE VESICULE.
        Consequence assumee : on ne navigue plus a vue. C'est la perception
        chimiotropique (bandeau du HUD) qui dit ce qu'il y a devant, et c'est
        exactement ce qu'une hyphe fait — elle remonte un gradient qu'elle sent
        bien au-dela de ce qu'un microscope montrerait.
        Le zoom s'ouvre quand on ralentit : ralentir, c'est voir.
     2. VISEE DEVANT : la camera vise un point situe devant l'apex, dans la
        direction ou le Spitzenkorper pointe, et d'autant plus loin qu'on va
        vite. Sans elle, un rayon de braquage de 60 um etait impossible a
        anticiper dans un champ de 110 um.
     3. `y` RESTE MONOTONE : on ne revient jamais en arriere. */
  const a = g.pilote;
  const vNorm = clamp(a.v / 26, 0, 1);
  const zCible = (4.6 - 1.1 * vNorm) / (1 + (g.stats.vue || 0) / 120);
  cam.z = lerp(cam.z, zCible, 1 - Math.exp(-dt / 0.7));
  const avant = 5 + 16 * vNorm;
  const tx = a.x + Math.cos(a.cap) * avant;
  const ty = a.y + Math.sin(a.cap) * avant;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-dt / 0.28));
  cam.y = Math.max(cam.y, lerp(cam.y, ty, 1 - Math.exp(-dt / 0.22)));
  /* GARDE-FOU DE CADRAGE, ajoute apres capture : l'apex sortait par le bas.
     La camera n'avance jamais a reculons en `y`, ce qui est une regle du jeu ;
     mais quand l'apex vire pres de sa butee de cap, il n'avance presque plus en
     `y` alors que la camera, elle, a deja avance — et l'apex derivait vers le
     bord. On borne donc la camera pour que l'apex reste entre 22 % et 78 % de
     la hauteur et entre 16 % et 84 % de la largeur. La regle « on ne revient
     pas en arriere » est preservee : c'est l'apex qui avance toujours, la
     camera ne fait que le suivre sans le perdre. */
  const bandeY = [0.22, 0.78].map((u) => a.y + (u * scr.h - cam.cy) / cam.z);
  cam.y = clamp(cam.y, Math.min(bandeY[1], bandeY[0]), Math.max(bandeY[1], bandeY[0]));
  const bandeX = [0.16, 0.84].map((u) => a.x + (u * scr.w - cam.cx) / cam.z);
  cam.x = clamp(cam.x, Math.min(bandeX[0], bandeX[1]), Math.max(bandeX[0], bandeX[1]));
  /* Secousse : elle ne sert qu'aux evenements de paroi (lyse, contact,
     ramification). Jamais au decor, sinon on ne sait plus ce qui l'a declenchee. */
  const sec = g.secousse;
  const ox = sec > 0 ? (Math.random() - 0.5) * sec * 5 / cam.z : 0;
  const oy = sec > 0 ? (Math.random() - 0.5) * sec * 5 / cam.z : 0;
  const vue = { x: cam.x + ox, y: cam.y + oy, z: cam.z, cx: cam.cx, cy: cam.cy };

  const ech = g.champ.echantillon(a.x, a.y);
  const pal = SUBSTRATS_PALETTE[ech.substrat.id] || SUBSTRATS_PALETTE.mesocarpe;

  /* --- cytoplasme : avance meme en pause d'offre ---------------------- */
  const porteeCyto = Math.max(scr.w, scr.h) / cam.z + 320;
  for (const b of g.thalle.branches) {
    if (!b.pts.length) continue;
    const dernier = b.pts[b.pts.length - 1];
    if (Math.abs(dernier.x - cam.x) > porteeCyto || Math.abs(dernier.y - cam.y) > porteeCyto) {
      /* Hors de portee : on oublie ses organites plutot que de les faire vivre
         pour personne. Ils seront repeuples si la branche revient a l'ecran, ce
         qui n'arrive jamais vu la camera monotone. */
      cyto.oublier(b.id);
      continue;
    }
    const ap = g.apex.find((z) => z.vivant && z.branche === b);
    let lon = 0;
    for (let i = b.pts.length - 1; i > 0 && lon < 470; i--) {
      lon += Math.hypot(b.pts[i].x - b.pts[i - 1].x, b.pts[i].y - b.pts[i - 1].y);
    }
    cyto.maj(dt, b.id, lon, ap ? ap.v : 0, !!ap,
      ap === g.pilote ? g.mixVesicules() : undefined,
      ap ? ap.decharge : true);
  }

  /* --- rendu ---------------------------------------------------------- */
  scr.beginFrame(pal.bg);
  fond(scr, pal, g.champ, vue);
  poussiere(scr, pal, vue, t);
  decor(scr, pal, g.champ, vue);
  dessinerNoeuds(scr, pal, g.thalle.noeuds, vue);
  /* La spore de depart reste a l'origine du monde : on la voit derriere soi
     pendant les premieres secondes, et elle dit d'ou l'on vient. */
  dessinerSpore(scr, pal, 0, 0, g.rayonSpore(), vue, clamp(g.t / 5.5, 0, 1));
  const opts = {
    woronin: (g.rangs.woronin || 0) > 0,
    pulse: g.stats.pulse || 0,
    flux: clamp(g.stats.jmaxEff / Math.max(1, g.stats.jmax), 0.15, 1),
  };
  /* Les branches sans apex d'abord : le pilote doit etre dessine EN DERNIER,
     donc par-dessus, sinon une hyphe ancienne le recouvre a un croisement et
     on perd de vue ce qu'on pilote. */
  /* Portee de rendu : une branche dont le BOUT est hors de cette portee est
     entierement derriere, puisque le cap de tout apex est borne a l'avant et que
     la camera ne recule pas. Ce test evite de parcourir la geometrie de
     quarante branches mortes a chaque image — avec la ramification spontanee,
     une manche longue en accumule beaucoup. */
  const porteeRendu = Math.max(scr.w, scr.h) / cam.z + 320;
  for (const b of g.thalle.branches) {
    const ap = g.apex.find((z) => z.vivant && z.branche === b);
    if (ap) continue;
    const fin2 = b.pts[b.pts.length - 1];
    if (!fin2) continue;
    if (Math.abs(fin2.x - cam.x) > porteeRendu || Math.abs(fin2.y - cam.y) > porteeRendu) continue;
    dessinerBranche(scr, pal, b, null, vue, g.t, g.P, cyto, { ...opts, lum: 0.55 });
  }
  for (const ap of g.apex) {
    if (!ap.vivant || ap === g.pilote) continue;
    dessinerBranche(scr, pal, ap.branche, ap, vue, g.t, g.P, cyto, { ...opts, lum: 0.8 });
  }
  dessinerBranche(scr, pal, g.pilote.branche, g.pilote.vivant ? g.pilote : null,
    vue, g.t, g.P, cyto, opts);

  /* Tramage de composition a 0,10 et non 0,18. Mesure sur capture macro : un
     objet tres floute (calque 3, rayon 4, gain 4,2) a une alpha faible et
     uniforme ; a 0,18 le seuil de Bayer le decoupait en DAMIER REGULIER, et un
     grain hors plan se lisait comme une grille dessinee. A 0,10 le grain pixel
     art reste sur les bords nets, et les objets flous redeviennent des nuages. */
  scr.composite(0.10);
  vignette(scr, pal);
  hud(scr, g, { tactile: input.hasTouch });
  if (g.etat === 'mort' || g.etat === 'sporule') fin(scr, g);
  if (enPause) {
    drawTextCentered(scr, 'PAUSE', scr.w >> 1, (scr.h >> 1) - 4, UI.textHot, 1, 2);
  }
  scr.present();
}

/* --- ecran de titre ----------------------------------------------------- */
let tTitre = 0;
function titre() {
  tTitre += 0.016;
  scr.beginFrame(SUBSTRATS_PALETTE.mesocarpe.bg);
  scr.composite();
  vignette(scr, SUBSTRATS_PALETTE.mesocarpe);
  drawTextCentered(scr, 'APICAL', scr.w >> 1, (scr.h >> 1) - 20, UI.text, 1, 3);
  drawTextCentered(scr, 'CROISSANCE APICALE', scr.w >> 1, (scr.h >> 1) + 4, UI.textDim);
  if (banque > 0) {
    drawTextCentered(scr, String(banque) + ' SPORES EN BANQUE', scr.w >> 1, (scr.h >> 1) + 16, UI.spore);
  }
  if ((tTitre * 2 | 0) % 2 === 0) {
    drawTextCentered(scr, 'ESPACE POUR GERMER', scr.w >> 1, (scr.h >> 1) + 34, UI.textHot);
  }
  scr.present();
  if (input.takeRamifier() || input.takeAnyPress()) semer();
}

/* Sonde pour le banc visuel. Elle ne sert qu'a la mesure et ne coute rien :
   sans elle, le banc ne peut verifier que des pixels et pas que la PARTIE a
   progresse — or un rendu superbe sur une simulation gelee passe tous les tests
   de pixels. */
window.__apical = () => (g ? g.etatLisible() : null);

relayout();
requestAnimationFrame(image);
