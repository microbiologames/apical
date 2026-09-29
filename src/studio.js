/* ---------------------------------------------------------------------------
   Le studio : la page ou l'on choisit une ambiance.

   Ce n'est pas un lecteur, c'est un banc. Trois choses y sont vraies en
   permanence, et c'est ce qui le distingue d'un panneau de curseurs :

   - ON N'ECOUTE JAMAIS A L'ARRET. Une direction artistique ne se juge pas sur
     un accord tenu : les quatre grandeurs du contexte sont la, et le bouton
     « descendre sur un apex » rejoue le pont entre les deux echelles, qui est
     le seul moment ou le son doit tenir tout seul.

   - CE QUI S'ECARTE DE L'ADOPTE EST MARQUE. Apres vingt minutes de curseurs,
     c'est la seule facon de savoir ce qu'on a vraiment change.

   - LE CODE EST TOUJOURS AFFICHE. Il porte le preset, le rack et la graine ;
     c'est lui qu'on livre, et il doit etre copiable a n'importe quel instant
     sans passer par un menu.
--------------------------------------------------------------------------- */

import { son } from './audio/son.js';
import {
  PRESETS, RACKS, CHAMPS, GROUPES, NOMS, VOIX, CHAMPS_PAR_GENRE, MACHINES, SENS,
  ORDRE_AMBIANCES, encoderCode, crans, versCran, depuisCran,
} from './data/son-presets.js';

const $ = (id) => document.getElementById(id);
const copie = (o) => JSON.parse(JSON.stringify(o));

/* L'etat adopte, fige AVANT que le premier curseur bouge : c'est la reference
   de la comparaison et de « tout remettre ». */
const ADOPTE = { presets: copie(PRESETS), racks: copie(RACKS) };

let ambiance = 'apex';
let voixCle = 'drone';
let graine = 24301;
let arcT = -1;
let soloCle = null;
const releves = [];        // seize secondes de raies relevees, pour le verdict
const coupees = new Set();

/* ----------------------------------------------------- sourdines et rack --- */

/**
 * Le rack REELLEMENT applique : celui de l'ambiance, voix muettes a zero.
 * On ne touche pas aux valeurs reglees — un solo n'est pas un reglage, et le
 * code doit emballer ce qu'on a regle, pas ce qu'on ecoutait a l'instant.
 */
function rackApplique() {
  const r = copie(RACKS[ambiance]);
  for (const v of VOIX) {
    if (coupees.has(v.cle) || (soloCle && soloCle !== v.cle)) r[v.cle].niveau = 0;
  }
  return r;
}

function appliquer() {
  releves.length = 0;      // un releve d'avant le reglage ne dit rien de l'apres
  if (!son.pret) return;
  son.ambiance = ambiance;
  son.appliquerAmbiance(ambiance, false, PRESETS[ambiance]);
  son.appliquerRack(ambiance, false, rackApplique());
  son.majCouches();
}

/* ---------------------------------------------------------------- crans --- */

function texteDe(ch, v) {
  if (ch.legendes && ch.legendes[v] !== undefined) return ch.legendes[v];
  if (ch.choix) return String(v);
  if (ch.unite) return `${v} ${ch.unite}`;
  return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
}

function faireRang(ch, lire, ecrire, adopte, rangs) {
  const d = document.createElement('div');
  d.className = 'rang';
  d.dataset.cle = ch.cle;
  const tete = document.createElement('div');
  tete.className = 'tete';
  const nom = document.createElement('span');
  nom.className = 'nom';
  nom.textContent = ch.nom;
  const val = document.createElement('span');
  val.className = 'val';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = 0; input.max = crans(ch); input.step = 1;
  input.id = `r-${ch.cle}-${Math.random().toString(36).slice(2, 7)}`;
  const aide = document.createElement('div');
  aide.className = 'aide';
  aide.textContent = ch.aide || '';
  tete.append(nom, val);
  d.append(tete, input, aide);
  input.oninput = () => { ecrire(depuisCran(ch, +input.value)); appliquer(); rafraichir(); };
  rangs.push(() => {
    const v = lire();
    input.value = versCran(ch, v);
    val.textContent = texteDe(ch, v);
    d.classList.toggle('bouge', v !== adopte());
  });
  return d;
}

let rangsAmbiance = [];
let rangsPatch = [];

/* ------------------------------------------------------------ ambiances --- */

const onglets = $('onglets');
for (const cle of ORDRE_AMBIANCES) {
  const b = document.createElement('button');
  b.textContent = NOMS[cle];
  b.dataset.cle = cle;
  b.onclick = () => { ambiance = cle; majOnglets(); etatType(); appliquer(); peupler(); };
  onglets.append(b);
}
function majOnglets() {
  for (const b of onglets.children) b.setAttribute('aria-pressed', String(b.dataset.cle === ambiance));
  $('titreAmbiance').textContent = `— ${NOMS[ambiance].toLowerCase()}`;
}

/**
 * Se placer dans un etat de jeu REPRESENTATIF de l'ambiance choisie.
 * Juger `thalle` a echelle nulle, c'est juger un morceau dont on a coupe la
 * batterie et la basse : on entendrait autre chose que ce que le jeu joue.
 */
function etatType() {
  const bas = ambiance === 'apex' || ambiance === 'cytoplasme';
  son.echelle = ambiance === 'substrat' ? 0.5 : (bas ? 0 : 1);
  son.croissance = ambiance === 'substrat' ? 0.15 : 0.6;
  son.densite = ambiance === 'front' ? 0.75 : 0.1;
  son.miseAuPoint = 0;
  refleterContexte();
}

/* ------------------------------------------------------------- contexte --- */

const CONTEXTE = [
  ['echelle', 'Échelle', '0 : l\'apex sous l\'objectif. 1 : la colonie entière. C\'est le pont, et c\'est lui qui fait entrer la batterie.'],
  ['croissance', 'Croissance', 'Ce que fait la pointe : exocytoses, vitesse d\'extension. Elle ouvre la nappe et fait parler la cloche.'],
  ['densite', 'Densité', 'L\'occupation du substrat, donc ce qui s\'épuise. Elle assombrit tout.'],
  ['miseAuPoint', 'Mise au point', 'Le flou du pont. Il ouate le son exactement comme il floute l\'image.'],
];
for (const [cle, nom, aide] of CONTEXTE) {
  const d = document.createElement('div');
  d.className = 'rang';
  d.dataset.cle = cle;
  d.innerHTML = '<div class="tete"><span class="nom"></span><span class="val">0.00</span></div>'
    + '<input type="range" min="0" max="1" step="0.01" value="0">'
    + '<div class="aide"></div>';
  d.querySelector('.nom').textContent = nom;
  d.querySelector('.aide').textContent = aide;
  const input = d.querySelector('input');
  input.id = `ctx-${cle}`;
  input.oninput = () => {
    if (arcT >= 0) basculerArc();
    son[cle] = +input.value;
    d.querySelector('.val').textContent = (+input.value).toFixed(2);
    if (son.pret) son.majCouches();
  };
  $('contexte').append(d);
}
function refleterContexte() {
  for (const d of $('contexte').children) {
    const v = son[d.dataset.cle] || 0;
    d.querySelector('input').value = v;
    d.querySelector('.val').textContent = v.toFixed(2);
  }
}

/**
 * Le pont, rejoue : on regarde la colonie, on defocalise, on descend sur un
 * apex, on remonte. C'est le seul passage ou le son doit tenir tout seul —
 * s'il y a un trou, il est ici.
 */
function basculerArc() {
  arcT = arcT >= 0 ? -1 : 0;
  $('arc').setAttribute('aria-pressed', String(arcT >= 0));
  if (arcT < 0) { $('arcEtat').textContent = 'à l\'arrêt'; etatType(); }
}
$('arc').onclick = basculerArc;

function avancerArc(dt) {
  arcT = (arcT + dt) % 40;
  const u = arcT / 40;
  /* Le flou est une horloge, pas un cache : il monte pendant la bascule
     d'echelle et retombe une fois arrive, comme dans `monde.html`. */
  const bosse = (a, b) => (u > a && u < b ? Math.sin((u - a) / (b - a) * Math.PI) : 0);
  const flou = Math.max(bosse(0.22, 0.38), bosse(0.66, 0.82));
  let ech = 1;
  if (u >= 0.3 && u < 0.74) ech = 0;
  else if (u >= 0.74) ech = 1;
  son.echelle = son.echelle + (ech - son.echelle) * Math.min(1, dt * 1.6);
  son.miseAuPoint = flou;
  son.croissance = 0.45 + 0.4 * Math.sin(u * Math.PI * 4);
  son.densite = 0.1 + 0.5 * u;
  const ou = u < 0.25 ? 'la colonie' : (u < 0.38 ? 'on descend' : (u < 0.68 ? 'l\'apex' : (u < 0.82 ? 'on remonte' : 'la colonie')));
  $('arcEtat').textContent = `${Math.round(u * 100)} % — ${ou}`;
  refleterContexte();
}

/* ------------------------------------------------------- les six voix --- */

const boutonsVoix = $('voix');
for (const v of VOIX) {
  const b = document.createElement('button');
  b.textContent = v.nom;
  b.dataset.cle = v.cle;
  b.onclick = () => { voixCle = v.cle; peuplerMachines(); peuplerPatch(); rafraichir(); };
  boutonsVoix.append(b);
}

function peuplerMachines() {
  const v = VOIX.find((x) => x.cle === voixCle);
  const hote = $('machines');
  hote.innerHTML = '';
  for (const m of MACHINES[v.genre] || []) {
    const b = document.createElement('button');
    b.className = 'mince';
    b.textContent = m.nom;
    b.onmouseenter = () => { $('aideMachine').textContent = m.aide; };
    b.onfocus = () => { $('aideMachine').textContent = m.aide; };
    b.onclick = () => {
      Object.assign(RACKS[ambiance][voixCle], m.p);
      $('aideMachine').textContent = m.aide;
      appliquer(); peuplerPatch(); rafraichir();
      /* On fait sonner tout de suite : attendre la mesure suivante pour
         entendre le timbre qu'on vient de choisir casse l'essai en serie,
         qui est exactement ce que cette rangee sert a faire. */
      if (son.pret) son.essayer(voixCle);
    };
    hote.append(b);
  }
}

function peuplerPatch() {
  const v = VOIX.find((x) => x.cle === voixCle);
  $('patch').innerHTML = '';
  rangsPatch = [];
  $('aideVoix').textContent = v.aide || ' ';
  for (const ch of CHAMPS_PAR_GENRE[v.genre]) {
    $('patch').append(faireRang(ch,
      () => RACKS[ambiance][v.cle][ch.cle],
      (val) => { RACKS[ambiance][v.cle][ch.cle] = val; },
      () => ADOPTE.racks[ambiance][v.cle][ch.cle], rangsPatch));
  }
}

function peuplerAmbiance() {
  $('groupes').innerHTML = '';
  rangsAmbiance = [];
  for (const groupe of GROUPES) {
    const champs = CHAMPS.filter((c) => c.groupe === groupe);
    if (!champs.length) continue;
    const carte = document.createElement('div');
    carte.className = 'carte';
    const h = document.createElement('h2');
    h.textContent = groupe;
    carte.append(h);
    for (const ch of champs) {
      carte.append(faireRang(ch,
        () => PRESETS[ambiance][ch.cle],
        (v) => { PRESETS[ambiance][ch.cle] = v; },
        () => ADOPTE.presets[ambiance][ch.cle], rangsAmbiance));
    }
    $('groupes').append(carte);
  }
}

function peupler() {
  peuplerAmbiance();
  peuplerMachines();
  peuplerPatch();
  rafraichir();
}

function rafraichir() {
  for (const f of rangsAmbiance) f();
  for (const f of rangsPatch) f();
  for (const b of boutonsVoix.children) {
    const muette = coupees.has(b.dataset.cle) || (soloCle && soloCle !== b.dataset.cle);
    b.setAttribute('aria-pressed', String(b.dataset.cle === voixCle));
    b.classList.toggle('voix-muette', !!muette);
  }
  $('solo').setAttribute('aria-pressed', String(soloCle === voixCle));
  $('muet').setAttribute('aria-pressed', String(coupees.has(voixCle)));
  /* Les deux boutons de caractere ne veulent pas dire la meme chose d'un
     moteur a l'autre : sans cette legende, ce sont deux curseurs anonymes. */
  const sens = SENS[RACKS[ambiance][voixCle].modele] || null;
  for (const [i, cle] of ['timbre1', 'timbre2'].entries()) {
    const aide = $('patch').querySelector(`.rang[data-cle="${cle}"] .aide`);
    if (aide) aide.textContent = sens ? sens[i] : '';
  }
  $('codeCourant').textContent = encoderCode(ambiance, PRESETS[ambiance], RACKS[ambiance], graine);
  majCompose();
}

function majCompose() {
  const m = son.melodie;
  if (!m) return;
  const deg = (d) => (d < 0 ? '·' : String(d + 1));
  $('compose').textContent = `accords ${m.progression.map((d) => d + 1).join(' ')}`
    + `   ostinato ${m.motif.map(deg).join('')}`;
}

$('solo').onclick = () => { soloCle = soloCle === voixCle ? null : voixCle; appliquer(); rafraichir(); };
$('muet').onclick = () => {
  if (coupees.has(voixCle)) coupees.delete(voixCle); else coupees.add(voixCle);
  appliquer(); rafraichir();
};
$('essai').onclick = () => { if (son.pret) son.essayer(voixCle); };

/* Tirer un rack au hasard : quarante-cinq timbres ne s'essaient pas un par un,
   et les combinaisons interessantes sont rarement celles qu'on aurait posees. */
$('hasard').onclick = () => {
  for (const v of VOIX) {
    const liste = MACHINES[v.genre];
    Object.assign(RACKS[ambiance][v.cle], liste[Math.floor(Math.random() * liste.length)].p);
  }
  appliquer(); peuplerPatch(); rafraichir();
  $('aideMachine').textContent = 'Rack tiré au hasard. « Tout remettre » revient à l\'adopté.';
};

/* --------------------------------------------------------------- moteur --- */

let analyse = null;
$('jouer').onclick = () => {
  if (son.pret) {
    son.muet = !son.muet;
    son.master.gain.setTargetAtTime(son.muet ? 0 : +$('vol').value, son.ctx.currentTime, 0.05);
    if (!son.muet && son.ctx.state === 'suspended') son.ctx.resume();
  } else {
    son.volume = +$('vol').value;
    if (!son.init()) { $('jouer').textContent = 'audio indisponible'; return; }
    son.graine(graine);
    etatType();
    const a = son.ctx.createAnalyser();
    a.fftSize = 8192;
    a.smoothingTimeConstant = 0.82;
    son.master.connect(a);
    analyse = { noeud: a, tampon: new Float32Array(a.frequencyBinCount) };
    window.__sonde = analyse;      // pour le banc : la sonde de la page, pas une seconde
    appliquer();
    boucle();
  }
  $('jouer').textContent = son.pret && !son.muet ? 'Couper' : 'Écouter';
};
$('vol').oninput = () => {
  son.volume = +$('vol').value;
  if (son.pret && !son.muet) son.master.gain.setTargetAtTime(son.volume, son.ctx.currentTime, 0.03);
};

/* ----------------------------------------------------------------- code --- */

const clampGraine = (n) => Math.max(0, Math.min(65535, n | 0));
$('graine').oninput = () => { graine = clampGraine(+$('graine').value); son.graine(graine); rafraichir(); };
$('tirer').onclick = () => {
  graine = Math.floor(Math.random() * 65536);
  $('graine').value = graine;
  son.graine(graine);
  rafraichir();
};
$('copier').onclick = async () => {
  const txt = $('codeCourant').textContent;
  try {
    await navigator.clipboard.writeText(txt);
    $('etatCode').textContent = 'Copié.';
  } catch {
    const r = document.createRange();
    r.selectNodeContents($('codeCourant'));
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    $('etatCode').textContent = 'Le navigateur a refusé le presse-papier : le code est sélectionné, faire copier à la main.';
  }
};
$('btnCharger').onclick = () => {
  const code = $('charger').value.trim();
  const ok = son.pret ? son.appliquerCode(code) : false;
  if (!son.pret) { $('etatCode').innerHTML = '<span class="alerte">Lancer l\'écoute d\'abord : le moteur doit exister pour recevoir un code.</span>'; return; }
  if (!ok) {
    $('etatCode').innerHTML = '<span class="alerte">Code refusé — version, ambiance, longueur ou somme de contrôle. Rien n\'a été chargé.</span>';
    return;
  }
  ambiance = son.ambiance;
  graine = son.derniereGraine;
  PRESETS[ambiance] = { ...son.p };
  RACKS[ambiance] = copie(son.rack);
  $('graine').value = graine;
  majOnglets(); etatType(); appliquer(); peupler();
  $('etatCode').innerHTML = '<span class="vif">Chargé.</span>';
};

/* Maintenir pour entendre l'adopte. L'oreille compare mal deux sons separes
   par dix secondes de reglage, et tres bien deux sons separes par rien. */
let travail = null;
const cmp = $('comparer');
const prendre = () => {
  if (travail) return;
  travail = { preset: copie(PRESETS[ambiance]), rack: copie(RACKS[ambiance]) };
  PRESETS[ambiance] = copie(ADOPTE.presets[ambiance]);
  RACKS[ambiance] = copie(ADOPTE.racks[ambiance]);
  appliquer();
  cmp.setAttribute('aria-pressed', 'true');
};
const relacher = () => {
  if (!travail) return;
  PRESETS[ambiance] = travail.preset;
  RACKS[ambiance] = travail.rack;
  travail = null;
  appliquer();
  cmp.setAttribute('aria-pressed', 'false');
};
cmp.onmousedown = prendre;
cmp.onmouseup = relacher;
cmp.onmouseleave = relacher;
cmp.ontouchstart = (e) => { e.preventDefault(); prendre(); };
cmp.ontouchend = relacher;

$('remettre').onclick = () => {
  PRESETS[ambiance] = copie(ADOPTE.presets[ambiance]);
  RACKS[ambiance] = copie(ADOPTE.racks[ambiance]);
  appliquer(); peupler();
};

$('exporter').onclick = () => {
  const val = (v) => (typeof v === 'string' ? `'${v}'` : v);
  const l = ['/* --- a recopier dans src/data/son-presets.js --- */', 'export const PRESETS = {'];
  for (const cle of ORDRE_AMBIANCES) {
    const p = PRESETS[cle];
    l.push(`  ${cle}: { ${CHAMPS.map((ch) => `${ch.cle}: ${val(p[ch.cle])}`).join(', ')} },`);
  }
  l.push('};', '', 'export const RACKS = {');
  for (const cle of ORDRE_AMBIANCES) {
    l.push(`  ${cle}: {`);
    for (const v of VOIX) {
      const champs = CHAMPS_PAR_GENRE[v.genre].map((ch) => `${ch.cle}: ${val(RACKS[cle][v.cle][ch.cle])}`);
      l.push(`    ${v.cle}: { ${champs.join(', ')} },`);
    }
    l.push('  },');
  }
  l.push('};', '', '/* Codes correspondants :');
  for (const cle of ORDRE_AMBIANCES) l.push(`   ${cle.padEnd(11)} ${encoderCode(cle, PRESETS[cle], RACKS[cle], graine)}`);
  l.push('*/');
  const t = $('sortie');
  t.hidden = false;
  t.value = l.join('\n');
  t.select();
};

/* -------------------------------------------------------------- spectre --- */

const cv = $('spectre');
const g2 = cv.getContext('2d');
const lire = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * Le detecteur de raie : chaque pic compare a la mediane de son propre tiers
 * d'octave.
 *
 * MAIS UNE RAIE N'EST PAS UN DEFAUT. Mesure faite au banc, voix par voix :
 * une nappe tenue seule donne x24, une cloche x82 — une note tenue EST une
 * raie, c'est sa definition. Crier au sifflement des x9, comme le faisait
 * la premiere version de cette page, revient a signaler la musique.
 *
 * Ce qu'on cherche est une RESONANCE : un filtre ou une queue de reverbe qui
 * chante toujours sur la MEME frequence. Le depart est donc l'immobilite, pas
 * la hauteur du pic — on garde seize secondes de releves, soit onze mesures a
 * 174 BPM, donc au moins deux tours de la progression : une note a forcement
 * bouge, une resonance non. C'est exactement le critere du banc, qui lui
 * transpose d'un triton pour le verifier en une fois.
 */
function chercherRaie(db, SR, N) {
  let fort = -Infinity;
  for (let k = 0; k < db.length; k++) if (db[k] > fort) fort = db[k];
  let pire = 0, freq = 0;
  const kmin = Math.round(600 * N / SR);
  for (let k = kmin; k < db.length - 1; k++) {
    if (db[k] < fort - 12.2) continue;
    if (!(db[k] > db[k - 1] && db[k] > db[k + 1])) continue;
    const a = Math.max(1, Math.round(k / 1.26));
    const b = Math.min(db.length - 1, Math.round(k * 1.26));
    const v = [];
    for (let j = a; j <= b; j++) if (Math.abs(j - k) > 3) v.push(db[j]);
    if (v.length < 8) continue;
    v.sort((x, y) => x - y);
    /* Les decibels sont deja logarithmiques : l'ecart EST le rapport. */
    const r = Math.pow(10, (db[k] - v[v.length >> 1]) / 20);
    if (r > pire) { pire = r; freq = k * SR / N; }
  }
  return { ratio: pire, freq };
}

let dernierVerdict = 0;
function dessiner() {
  const { noeud, tampon } = analyse;
  noeud.getFloatFrequencyData(tampon);
  const SR = son.ctx.sampleRate, N = noeud.fftSize;
  const L = cv.width, H = cv.height;
  g2.clearRect(0, 0, L, H);
  /* Echelle logarithmique : celle de l'oreille, et la seule ou une raie du
     medium se voit a cote d'une grosse caisse. */
  const f0 = 30, f1 = Math.min(18000, SR / 2);
  g2.strokeStyle = 'rgba(255,255,255,.10)';
  g2.lineWidth = 1;
  g2.beginPath();
  for (const f of [100, 500, 1000, 5000, 10000]) {
    const x = Math.round(L * Math.log(f / f0) / Math.log(f1 / f0)) + 0.5;
    g2.moveTo(x, 0); g2.lineTo(x, H);
  }
  g2.stroke();
  const grad = g2.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, lire('--brass') || '#cfae6c');
  grad.addColorStop(1, 'rgba(207,174,108,.15)');
  g2.strokeStyle = grad;
  g2.lineWidth = 1.4;
  g2.beginPath();
  for (let x = 0; x < L; x++) {
    const f = f0 * Math.pow(f1 / f0, x / L);
    const k = Math.min(tampon.length - 1, Math.round(f * N / SR));
    const y = H - H * Math.max(0, Math.min(1, (tampon[k] + 100) / 90));
    if (x === 0) g2.moveTo(x, y); else g2.lineTo(x, y);
  }
  g2.stroke();

  if (performance.now() - dernierVerdict > 260) {
    dernierVerdict = performance.now();
    const r = chercherRaie(tampon, SR, N);
    releves.push(r);
    if (releves.length > 62) releves.shift();      // 62 x 260 ms = 16 s
    const el = $('verdict');
    if (r.ratio < 1.5) {
      el.textContent = 'aucune raie au-dessus du plancher.';
      el.className = 'note mono';
    } else {
      const proches = releves.filter((x) => x.ratio > 6 && Math.abs(x.freq - r.freq) / Math.max(1, r.freq) < 0.03);
      const part = releves.length >= 40 ? proches.length / releves.length : 0;
      const bloquee = r.ratio > 6 && part > 0.7;
      el.className = bloquee ? 'note mono alerte' : 'note mono';
      el.textContent = `raie la plus saillante : ×${r.ratio.toFixed(1)} à ${Math.round(r.freq)} Hz`
        + (bloquee ? `  — immobile sur ${Math.round(part * 100)} % des seize dernières secondes : c'est une résonance, pas une note.`
          : (releves.length < 40 ? '  — relevé en cours.' : '  — elle suit l\'harmonie, donc c\'est une note.'));
    }
  }
}

/* --------------------------------------------------------------- boucle --- */

let precedent = 0;
function boucle(t = 0) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.1, (t - precedent) / 1000);
  precedent = t;
  if (!son.pret) return;
  if (arcT >= 0) avancerArc(dt);
  son.majCouches();
  if (analyse) dessiner();
}

/* ---------------------------------------------------------------- amorce --- */

majOnglets();
peupler();
$('graine').value = graine;
$('aideMachine').textContent = 'Survoler pour lire, cliquer pour entendre.';
