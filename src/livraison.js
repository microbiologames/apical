/* ---------------------------------------------------------------------------
   Page « livraison » : la meme simulation, mais la camera reste collee a une
   fusion pendant qu'elle se joue, et on peut la rembobiner.

   Aucun rendu special, aucune animation a part : ce qu'on regarde ici est
   exactement ce qui tourne dans la simulation complete. Une page de mise au
   point qui aurait sa propre version de l'animation ne servirait a rien.
--------------------------------------------------------------------------- */

import { versMonde } from './sim/hyphe.js';
import { DUREE_FUSION } from './sim/contenu.js';
import { omega } from './sim/membrane.js';
import { clamp } from './core/util.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const PHASES = [
  [0.00, 0.16, 'contact', 'Les deux membranes se touchent. Le pore est encore un point : la poche est ronde et pend a un col etroit.'],
  [0.16, 0.55, 'pore', 'L’ouverture nait au centre du contact et s’elargit. Le contenu commence a passer dans l’espace entre membrane et paroi.'],
  [0.55, 1.01, 'omega', 'La membrane de la vesicule acheve de s’etaler dans la membrane plasmique. La poche s’aplatit et derive vers l’epaule.'],
];

export function brancherLivraison(app, PALETTES) {
  app.zoom = 6.0;
  app.vitesse = 0.35;
  app.opts.echelle = false;
  let cible = null;      // la vesicule suivie
  let auto = true;       // on saute a la fusion suivante des qu'elle finit

  const pt = { x: 0, y: 0 };
  app.verrou = () => {
    if (!cible) return null;
    const T = app.hy.table(36, 0.3);
    const sA = app.co.membrane.sDepuisAge(cible.am);
    versMonde(T, sA, cible.cotem * app.hy.W(sA), pt);
    return pt;
  };

  /** Fait converger la corde vers l'etat correspondant a k, sans avancer. */
  function poser(k) {
    if (!cible) return;
    cible.tf = k * DUREE_FUSION;
    cible.emis = Math.round((cible.grosse ? 11 : 6) * clamp((k - 0.22) / 0.62, 0, 1));
    const e = [{ a: cible.am, cote: cible.cotem, r: cible.r, k }];
    /* 24 pas suffisent : la corde converge en ~0,3 s simulee. */
    for (let i = 0; i < 24; i++) app.co.membrane.maj(1 / 60, 0, e);
  }

  function phase(k) {
    for (const [a, b, nom, texte] of PHASES) if (k >= a && k < b) return [nom, texte];
    return ['—', ''];
  }

  const maj = () => {
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.vit - app.vitesse) < 1e-6)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#bAuto').setAttribute('aria-pressed', String(auto));
  };

  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $('#bAuto').onclick = () => { auto = !auto; maj(); };
  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  const zoomUI = () => { $('#cZoom').value = String(app.zoom); $('#oZoom').textContent = `×${app.zoom.toFixed(1)}`.replace('.', ','); };
  $('#cZoom').oninput = (e) => { app.zoom = +e.target.value; zoomUI(); };
  $('#cScrub').oninput = (e) => {
    app.pause = true; auto = false;
    poser(+e.target.value / 100);
    maj();
  };

  /* Boucle de suivi : on accroche la premiere fusion venue, on la garde
     jusqu'a ce qu'elle se termine, puis on saute a la suivante. */
  setInterval(() => {
    if (!auto) return;
    if (!cible || cible.etat !== 1) {
      cible = app.co.ves.find((v) => v.etat === 1) || null;
    }
  }, 60);

  setInterval(() => {
    const k = cible && cible.etat === 1 ? clamp(cible.tf / DUREE_FUSION, 0, 1) : null;
    const g = cible ? omega(cible.r, k ?? 1) : null;
    const [nom, texte] = k === null ? ['en attente', 'La prochaine vésicule touche la membrane dans un instant.'] : phase(k);
    $('#phase').textContent = nom;
    $('#explique').textContent = texte;
    $('#chiffres').innerHTML = cible
      ? `rayon <b>${(cible.r * 1000).toFixed(0)}</b> nm · bouche <b>${(g.hw * 2 * 1000).toFixed(0)}</b> nm · `
        + `poche <b>${(g.dep * 1000).toFixed(0)}</b> nm · ${cible.grosse ? 'macrovésicule' : 'chitosome'}`
      : '';
    if (k !== null && auto) $('#cScrub').value = String(Math.round(k * 100));
    $('#etat').innerHTML = `${app.hy.longueur.toFixed(1)} µm construits · ${app.co.fusions} fusions · ${Math.round(app.fps)} i/s`;
  }, 90);

  /* Au ralenti, sans prechauffage, la premiere fusion arriverait apres
     plus d'une minute d'attente. */
  zoomUI();
  app.prechauffer(32);
  maj();
  app.demarrer();
  globalThis.apical = app;
}
