/* ---------------------------------------------------------------------------
   Branchement du panneau. Aucune logique de simulation ici.
--------------------------------------------------------------------------- */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const NOTICE = `<b>Ce qu'on regarde.</b> L'extrémité d'une hyphe de moisissure, vue de côté.
Le tube est <b>un seul objet</b> : une ligne d'axe et un profil de demi-largeur qui se referme
à la pointe — il n'y a nulle part où dessiner « la calotte » séparément.
Le cytoplasme flue vers l'apex&nbsp;; les vésicules dérivent, se heurtent, coalescent,
s'accumulent en un <b>Spitzenkörper</b> qui n'est jamais dessiné (c'est une densité, pas un objet),
puis fusionnent avec la membrane et y déversent le matériau de paroi.
<b>C'est la seule chose qui fait avancer l'hyphe.</b> Elle tourne quand les fusions se font
préférentiellement d'un côté, d'où une inertie d'une dizaine de secondes qu'on ne peut pas
raccourcir sans casser le mécanisme.
<br><br>
<b>Mesuré.</b> Croissance 18,8 µm/min (Neurospora : 20), 1,6 exocytose/s, rayon de virage 79 µm
à consigne pleine, 10,7 s pour atteindre 63 % de la vitesse angulaire.
<br>
<b>Source.</b> Lew RR, <i>How does a hypha grow? The biophysics of pressurized growth in fungi</i>,
Nat Rev Microbiol 9:509 (2011) — turgescence 600 kPa, flux de masse, gradient de Ca²⁺ apical
libérant la fusion des vésicules.
<br>
<b>Simplifié, et assumé.</b> Les vésicules font 70–100 nm, soit un pixel : elles sont grossies ×5.
Le Spitzenkörper d'un Neurospora en contient ~10⁴, on en simule 120. Le flux de masse est ramené
de 5 à 1,2 µm/s — à 5 µm/s tout traverse le champ en cinq secondes, ce n'est plus apaisant.`;

export function brancher(app, PALETTES) {
  const maj = () => {
    $('#optiqueNom').textContent = PALETTES[app.palette].nom;
    $$('[data-vit]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vit === app.vitesse)));
    $$('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === app.palette)));
    $$('[data-pil]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pil === app.pilotage)));
    $('#bPause').textContent = app.pause ? 'Reprendre' : 'Pause';
    $('#bPause').setAttribute('aria-pressed', String(app.pause));
    $('#bFocAuto').setAttribute('aria-pressed', String(app.miseAuPoint === null));
  };

  $('#bPause').onclick = () => { app.pause = !app.pause; maj(); };
  $$('[data-vit]').forEach((b) => { b.onclick = () => { app.vitesse = +b.dataset.vit; maj(); }; });
  $$('[data-pal]').forEach((b) => { b.onclick = () => { app.palette = b.dataset.pal; maj(); }; });
  $$('[data-pil]').forEach((b) => { b.onclick = () => { app.pilotage = b.dataset.pil; maj(); }; });
  app.onPilotage = maj;
  $('#bReset').onclick = () => { app.reset((Math.random() * 1e9) | 0); };

  const lier = (id, out, fmt, set) => {
    const el = $(id), o = $(out);
    const f = () => { o.textContent = fmt(+el.value); set(+el.value); };
    el.oninput = f; f();
  };
  lier('#cCal', '#oCal', (v) => `${v.toFixed(2)} R`, (v) => { app.hy.calotte = v; });
  lier('#cPro', '#oPro', (v) => v.toFixed(2), (v) => { app.hy.profil = v; });
  lier('#cZoom', '#oZoom', (v) => `×${v.toFixed(2)}`, (v) => { app.zoom = v; });
  lier('#cFoc', '#oFoc', (v) => v.toFixed(2), (v) => { app.miseAuPoint = v; maj(); });
  $('#bFocAuto').onclick = () => { app.miseAuPoint = null; maj(); };

  $$('[data-opt]').forEach((c) => {
    c.onchange = () => { app.opts[c.dataset.opt] = c.checked; };
  });

  $('#notice').innerHTML = NOTICE;

  /* Le cap et la calotte survivent a un « Relancer » : ce sont des reglages
     de concept, pas un etat de simulation. */
  const reset0 = app.reset.bind(app);
  app.reset = (g) => { const c = app.hy?.calotte, p = app.hy?.profil; reset0(g); if (c) { app.hy.calotte = c; app.hy.profil = p; } };

  let t0 = performance.now(), f0 = 0;
  setInterval(() => {
    const co = app.co, hy = app.hy;
    const dt = (performance.now() - t0) / 1000;
    const fus = (co.fusions - f0) / dt;
    t0 = performance.now(); f0 = co.fusions;
    const spk = co.ves.reduce((n, v) => n + (v.etat === 2 ? 1 : 0), 0);
    $('#mesures').innerHTML =
      `<b>${(hy.longueur / Math.max(app.t, 0.1) * 60).toFixed(1)}</b> µm/min · `
      + `<b>${fus.toFixed(1)}</b> exocytose/s · Spk <b>${spk}</b> · ${Math.round(app.fps)} i/s`;
  }, 700);

  maj();
  app.demarrer();
}
