/* ---------------------------------------------------------------------------
   Cadre : la simulation seule, sans rien autour.

   Pas de panneau, pas de chiffres, pas de barre d'echelle. Les commandes
   n'apparaissent qu'au passage du pointeur et s'effacent apres 2,5 s. Une
   graine differente a chaque chargement : ce n'est jamais deux fois la
   meme hyphe.

   C'est la version contemplative figee. Le travail sur le jeu part
   d'ailleurs et ne touche pas a cette page.
--------------------------------------------------------------------------- */

import { ORDRE_PALETTES } from './data/palette.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export function brancherCadre(app, PALETTES) {
  app.opts.echelle = false;

  /* Le grossissement est calcule sur la LARGEUR du cadre, pas sur son plus
     petit cote : sur un ecran 16/9 le tube, qui court verticalement, ne
     remplissait que 29 % de l'image et flottait au milieu du vide. On vise
     42 % de la largeur. */
  const cadrer = () => {
    const sc = app.scene;
    app.zoom = Math.min(2.4, Math.max(0.9, 0.42 * sc.w / (0.46 * Math.min(sc.w, sc.h))));
  };
  cadrer();
  addEventListener('resize', () => setTimeout(cadrer, 60));
  app.reset((Math.random() * 1e9) | 0);
  app.palette = ORDRE_PALETTES[(Math.random() * ORDRE_PALETTES.length) | 0];

  const barre = $('#barre');
  let minuteur = 0;
  const montrer = () => {
    barre.classList.add('vu');
    clearTimeout(minuteur);
    minuteur = setTimeout(() => barre.classList.remove('vu'), 2500);
  };
  addEventListener('pointermove', montrer);
  addEventListener('pointerdown', montrer);

  const maj = () => {
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $('#bPause').textContent = app.pause ? '▶' : '‖';
    $('#bPause').setAttribute('aria-label', app.pause ? 'Reprendre' : 'Pause');
  };
  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); montrer(); }; });
  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); montrer(); };
  $('#bNeuf').onclick = () => { app.reset((Math.random() * 1e9) | 0); app.prechauffer(20); montrer(); };

  app.prechauffer(20);
  maj();
  montrer();
  app.demarrer();
}
