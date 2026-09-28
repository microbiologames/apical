/* ---------------------------------------------------------------------------
   Ramification : la meme simulation, avec un second axe.

   Cette page ne fait rien de special. C'est son interet : la branche n'est
   pas une animation a part, c'est une tige de plus dans la meme liste, et la
   silhouette reste l'union des tubes. Ce qu'on regarde ici, ce sont trois
   choses qu'un banc ne voit pas :

     - le bourgeon emerge du cytoplasme maternel au lieu d'apparaitre pose
       sur le flanc ;
     - la base a un evasement CONCAVE, pas un angle vif ;
     - le tube de la fille s'elargit avec son materiau, du col au calibre
       plein, au lieu de naitre a sa taille definitive.

   Brancher est aussi la seule facon de tourner vite : l'apex ne vire qu'a
   58 um de rayon, la branche part a 60-80 degres.
--------------------------------------------------------------------------- */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export function brancherPage(app, PALETTES) {
  app.zoom = 1.5;
  app.vitesse = 2;

  /* Camera. Trois points de vue, et un seul mecanisme : `verrou` rend un
     point MONDE a suivre, `suivi` dit de quelle tige on suit l'apex.
     La jonction est le premier point d'axe de la branche : il est fixe dans
     le monde, puisqu'une paroi construite ne bouge plus. */
  let vue = 'jonction';
  app.verrou = () => {
    const f = app.tiges[1];
    if (!f || vue !== 'jonction') return null;
    /* Decale de 5 um vers l'apex de la mere : centre pile sur la base, le
       cadre attrapait la coupe arriere du tube a 34 um, un trait droit en
       travers qui n'existe que parce que la simulation s'arrete la. */
    const m = app.tiges[0].hy;
    return { x: f.hy.ax[0] + Math.cos(m.th) * 5, y: f.hy.ay[0] + Math.sin(m.th) * 5 };
  };

  const cadrer = () => {
    app.suivi = (vue === 'fille' && app.tiges[1]) ? 1 : 0;
    app.active = app.suivi;
  };

  const maj = () => {
    const f = app.tiges[1];
    $$('[data-vue]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vue === vue)));
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bBrancher').disabled = !!f;
    $('#mesures').innerHTML = f
      ? `branche <b>${f.hy.longueur.toFixed(1)}</b> µm · col <b>${(f.hy.rayonA(0) * 2).toFixed(1)}</b> µm, `
        + `pointe <b>${(f.hy.rayonA(f.hy.total) * 2).toFixed(1)}</b> µm · `
        + `angle <b>${Math.round(Math.abs(((f.hy.th - app.hy.th) * 180 / Math.PI + 540) % 360 - 180))}°</b> · `
        + `${Math.round(app.fps)} i/s`
      : `une seule tige · ${Math.round(app.fps)} i/s`;
  };

  $$('[data-vue]').forEach((b) => { b.onclick = () => { vue = b.dataset.vue; cadrer(); maj(); }; });
  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $('#cZoom').oninput = (e) => { app.zoom = +e.target.value; $('#oZoom').textContent = `×${app.zoom.toFixed(2)}`; };

  const neuf = () => {
    app.reset((Math.random() * 1e9) | 0);
    app.prechauffer(20);
    vue = 'jonction';
    cadrer();
    maj();
  };
  $('#bNeuf').onclick = neuf;
  $('#bBrancher').onclick = () => { app.brancher(0, { s: 9 }); cadrer(); maj(); };

  globalThis.apical = app;
  app.prechauffer(20);
  /* On branche tout de suite : la page n'existe que pour ca, et attendre
     vingt secondes devant un tube droit n'apprend rien. */
  app.brancher(0, { s: 9, cote: 1, angle: 68 * Math.PI / 180 });
  cadrer();
  maj();
  setInterval(maj, 500);
  app.demarrer();
}
