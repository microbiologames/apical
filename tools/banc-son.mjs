/* ---------------------------------------------------------------------------
   Le banc du son. Dix verdicts, en temps reel, dans Chromium.

   Pourquoi le navigateur et pas node : il n'y a pas de Web Audio en node, et
   un moteur mesure sur une reimplementation ne mesure pas le moteur. On rend
   donc pour de vrai, on capte la sortie echantillon par echantillon avec un
   `ScriptProcessor` — deprecie, mais c'est le seul noeud qui rende TOUS les
   echantillons a du JavaScript, et une crete manquee est une saturation qu'on
   ne verra qu'a l'oreille, trois semaines plus tard.

   Un chiffre documente sans avoir ete mesure est un chiffre qu'on croit
   seulement avoir. Ca s'est deja paye sur ce projet.
--------------------------------------------------------------------------- */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const ROOT = new URL('..', import.meta.url).pathname;

const srv = createServer(async (req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => srv.listen(8097, r));

const br = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await br.newPage({ viewport: { width: 1200, height: 1000 } });
const erreurs = [];
/* Seules les erreurs du CODE comptent. Le conteneur de mesure passe par un
   proxy qui refuse le certificat de Google Fonts et n'a pas de favicon : deux
   echecs de chargement qui ne disent rien du moteur, et qui masqueraient un
   vrai plantage s'ils faisaient echouer le verdict en permanence. */
const externe = (t) => /ERR_CERT|favicon|fonts\.googleapis|fonts\.gstatic|Failed to load resource/.test(t);
page.on('pageerror', (e) => erreurs.push(`PAGE ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !externe(m.text())) erreurs.push(`CONSOLE ${m.text()}`); });
await page.goto('http://localhost:8097/studio.html');
await page.waitForTimeout(600);

const verdicts = [];
const dire = (n, titre, ok, detail) => {
  verdicts.push(ok);
  const etat = ok ? 'OK  ' : 'ECHEC';
  console.log(`${String(n).padStart(2)}. ${etat} ${titre}\n         ${detail}`);
};

/* --- 1 : la page se charge ------------------------------------------- */
dire(1, 'La page se charge sans erreur', erreurs.length === 0,
  erreurs.length ? erreurs.slice(0, 3).join(' | ') : '0 erreur de page, 0 erreur de console');

/* --- le moteur --------------------------------------------------------- */
await page.click('#jouer');
await page.waitForTimeout(900);

/* La sonde : tous les echantillons, pas une fenetre sur dix. */
await page.evaluate(() => {
  const s = window.__sonde;
  const ctx = window.__son ? window.__son.ctx : null;
  return null;
});
await page.addScriptTag({ type: 'module', content: `
  import { son } from './src/audio/son.js';
  window.__moteur = son;
  const sp = son.ctx.createScriptProcessor(4096, 2, 1);
  window.__mes = { crete: 0, somme: 0, n: 0, charge: 0, images: 0 };
  sp.onaudioprocess = (e) => {
    const m = window.__mes;
    for (let c = 0; c < e.inputBuffer.numberOfChannels; c++) {
      const d = e.inputBuffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (v > m.crete) m.crete = v;
        m.somme += d[i] * d[i];
        m.n++;
      }
    }
    if (son.charge > m.charge) m.charge = son.charge;
    m.images++;
  };
  son.master.connect(sp);
  /* Un ScriptProcessor n'est appele que s'il est connecte a la sortie. Un
     gain a zero suffit : on mesure, on ne rejoue pas. */
  const zero = son.ctx.createGain();
  zero.gain.value = 0;
  sp.connect(zero);
  zero.connect(son.ctx.destination);
  window.__remettre = () => { const m = window.__mes; m.crete = 0; m.somme = 0; m.n = 0; m.charge = 0; };
`});
await page.waitForTimeout(400);

const etat = await page.evaluate(() => ({
  pret: window.__moteur.pret,
  ctx: window.__moteur.ctx.state,
  t: window.__moteur.ctx.currentTime,
  sr: window.__moteur.ctx.sampleRate,
}));
await page.waitForTimeout(700);
const t2 = await page.evaluate(() => window.__moteur.ctx.currentTime);
dire(2, 'Le moteur tourne', etat.pret && etat.ctx === 'running' && t2 > etat.t,
  `contexte ${etat.ctx}, ${etat.sr} Hz, l'horloge a avance de ${(t2 - etat.t).toFixed(2)} s`);

/* --- 3, 4, 5 : chaque ambiance sonne, sans saturer, sans siffler ------- */
const AMB = ['substrat', 'apex', 'cytoplasme', 'thalle', 'front', 'conidie'];
const mesures = {};
for (const a of AMB) {
  await page.evaluate((cle) => {
    for (const b of document.getElementById('onglets').children) if (b.dataset.cle === cle) b.click();
  }, a);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__remettre());
  await page.waitForTimeout(7000);
  mesures[a] = await page.evaluate(() => {
    const m = window.__mes;
    const s = window.__sonde;
    s.noeud.getFloatFrequencyData(s.tampon);
    return { crete: m.crete, rms: Math.sqrt(m.somme / Math.max(1, m.n)), charge: m.charge, n: m.n };
  });
  const r = await page.evaluate(() => {
    /* Le detecteur de raie de la page, en direct : une seule implementation. */
    const s = window.__sonde;
    s.noeud.getFloatFrequencyData(s.tampon);
    const db = s.tampon, SR = window.__moteur.ctx.sampleRate, N = s.noeud.fftSize;
    let fort = -Infinity;
    for (let k = 0; k < db.length; k++) if (db[k] > fort) fort = db[k];
    let pire = 0, freq = 0;
    for (let k = Math.round(600 * N / SR); k < db.length - 1; k++) {
      if (db[k] < fort - 12.2) continue;
      if (!(db[k] > db[k - 1] && db[k] > db[k + 1])) continue;
      const a = Math.max(1, Math.round(k / 1.26)), b = Math.min(db.length - 1, Math.round(k * 1.26));
      const v = [];
      for (let j = a; j <= b; j++) if (Math.abs(j - k) > 3) v.push(db[j]);
      if (v.length < 8) continue;
      v.sort((x, y) => x - y);
      const q = Math.pow(10, (db[k] - v[v.length >> 1]) / 20);
      if (q > pire) { pire = q; freq = k * SR / N; }
    }
    return { ratio: pire, freq };
  });
  mesures[a].raie = r;
}
const sonnent = AMB.filter((a) => mesures[a].rms > 0.004);
dire(3, 'Les six ambiances sonnent', sonnent.length === 6,
  AMB.map((a) => `${a} ${(20 * Math.log10(mesures[a].rms || 1e-9)).toFixed(1)} dB`).join(', '));

const pireCrete = Math.max(...AMB.map((a) => mesures[a].crete));
dire(4, 'Rien ne sature', pireCrete < 1,
  `crête la plus haute ${pireCrete.toFixed(3)} sur les six, plafond 1,000`);

/**
 * Une raie n'est pas un defaut : une nappe tenue EST une raie, et la mesurer
 * en solo donne x24 sans que rien ne sonne mal. Mesure faite, et c'est elle
 * qui a fait changer ce verdict.
 *
 * Ce qu'on cherche vraiment, c'est une RESONANCE : un filtre ou une queue de
 * reverbe qui chante toujours sur la meme frequence. Le depart est donc
 * simple — on transpose la musique d'un triton et on regarde. Une note suit
 * la tonique ; une resonance reste ou elle est.
 */
async function raieCourante() {
  return page.evaluate(() => {
    const s = window.__sonde;
    s.noeud.getFloatFrequencyData(s.tampon);
    const db = s.tampon, SR = window.__moteur.ctx.sampleRate, N = s.noeud.fftSize;
    let fort = -Infinity;
    for (let k = 0; k < db.length; k++) if (db[k] > fort) fort = db[k];
    let pire = 0, freq = 0;
    for (let k = Math.round(600 * N / SR); k < db.length - 1; k++) {
      if (db[k] < fort - 12.2) continue;
      if (!(db[k] > db[k - 1] && db[k] > db[k + 1])) continue;
      const a = Math.max(1, Math.round(k / 1.26)), b = Math.min(db.length - 1, Math.round(k * 1.26));
      const v = [];
      for (let j = a; j <= b; j++) if (Math.abs(j - k) > 3) v.push(db[j]);
      if (v.length < 8) continue;
      v.sort((x, y) => x - y);
      const q = Math.pow(10, (db[k] - v[v.length >> 1]) / 20);
      if (q > pire) { pire = q; freq = k * SR / N; }
    }
    return { ratio: pire, freq };
  });
}

const fixes = [];
for (const a of AMB) {
  const vu = [];
  for (const tonique of [0, 6]) {
    await page.evaluate((arg) => {
      for (const b of document.getElementById('onglets').children) if (b.dataset.cle === arg.a) b.click();
      const son = window.__moteur;
      son.appliquerAmbiance(arg.a, true, { ...son.p, tonique: arg.tonique });
    }, { a, tonique });
    await page.waitForTimeout(5200);
    vu.push(await raieCourante());
  }
  /* Saillante des deux cotes ET immobile a 3 % pres : c'est une resonance. */
  const immobile = Math.abs(vu[0].freq - vu[1].freq) / Math.max(1, vu[0].freq) < 0.03;
  if (vu[0].ratio > 6 && vu[1].ratio > 6 && immobile) fixes.push(`${a} ${Math.round(vu[0].freq)} Hz`);
  mesures[a].raies = vu;
}
dire(5, 'Aucune resonance ne chante', fixes.length === 0,
  fixes.length ? `raies immobiles sous transposition : ${fixes.join(', ')}`
    : `les ${AMB.length} ambiances transposees d'un triton : toute raie saillante s'est deplacee avec la tonique`);

/* --- 6 : le break n'existe pas en bas ---------------------------------- */
const couches = await page.evaluate(async () => {
  const son = window.__moteur;
  const lire = (e) => { son.echelle = e; son.croissance = 0.6; son.majCouches(); return son._niveau('break'); };
  for (const b of document.getElementById('onglets').children) if (b.dataset.cle === 'thalle') b.click();
  await new Promise((r) => setTimeout(r, 200));
  return { bas: lire(0), mi: lire(0.5), haut: lire(1) };
});
dire(6, 'Le break n\'existe pas a l\'echelle de la vesicule', couches.bas === 0 && couches.haut > 0.2,
  `niveau du break : ${couches.bas.toFixed(3)} en bas, ${couches.mi.toFixed(3)} a mi-pont, ${couches.haut.toFixed(3)} en haut`);

/* --- 7 : le silence est silencieux ------------------------------------- */
const mesurerResidu = async (grain) => {
  await page.evaluate((g) => {
    const son = window.__moteur;
    for (const cle of Object.keys(son.rack)) son.rack[cle].niveau = 0;
    son.p.grain = g;
    son.majCouches();
  }, grain);
  await page.waitForTimeout(3000);          // la reverbe finit, les gains descendent
  await page.evaluate(() => window.__remettre());
  await page.waitForTimeout(2200);
  return page.evaluate(() => {
    const m = window.__mes;
    return { crete: m.crete, rms: Math.sqrt(m.somme / Math.max(1, m.n)) };
  });
};
const avecSouffle = await mesurerResidu(0.25);
const sansSouffle = await mesurerResidu(0);
const dB = (x) => (20 * Math.log10(x || 1e-9)).toFixed(1);
/* Le verdict n'est pas « c'est silencieux » mais « ce qui reste est le
   souffle, et RIEN d'autre » : il doit donc disparaitre avec lui. */
dire(7, 'Les six voix coupees, il ne reste que le souffle', sansSouffle.rms < 0.0006,
  `${dB(avecSouffle.rms)} dB avec le souffle, ${dB(sansSouffle.rms)} dB sans (crête ${sansSouffle.crete.toFixed(4)})`);

/* --- 8 : la queue de reverbe dure ce qu'on demande --------------------- */
const queue = await page.evaluate(async () => {
  const son = window.__moteur;
  /* On demande 6,2 s, on frappe une fois, on chronometre la descente de
     60 dB. Une reverbe qui ne dure pas ce que dit son bouton rend le bouton
     decoratif — et c'est le bouton le plus important de la page. */
  son.appliquerAmbiance('thalle', true, { ...son.p, reverbe: 6.2, reverbeCouleur: 0.6, couleur: 18000, grain: 0 });
  for (const cle of Object.keys(son.rack)) son.rack[cle].niveau = 0;
  son.majCouches();
  /* Sans couper le souffle il n'y a pas de -60 dB a atteindre : la queue
     disparait SOUS le plancher de bruit et le chronometre ne s'arrete jamais.
     Premier essai du banc : -1 s, c'est-a-dire jamais. */
  await new Promise((r) => setTimeout(r, 300));
  const an = son.ctx.createAnalyser();
  an.fftSize = 2048;
  son.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const niveau = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  const g = son.ctx.createGain();
  g.gain.value = 1;
  g.connect(son.busReverbe);
  const o = son.ctx.createOscillator();
  o.frequency.value = 500;
  o.connect(g);
  o.start();
  o.stop(son.ctx.currentTime + 0.05);
  await new Promise((r) => setTimeout(r, 120));
  const pic = niveau();
  const t0 = performance.now();
  let t60 = -1;
  while (performance.now() - t0 < 14000) {
    await new Promise((r) => setTimeout(r, 40));
    if (niveau() < pic * 0.001) { t60 = (performance.now() - t0) / 1000; break; }
  }
  return { pic, t60 };
});
dire(8, 'La queue de reverbe dure ce que dit le bouton', queue.t60 > 3 && queue.t60 < 11,
  `−60 dB en ${queue.t60.toFixed(2)} s pour 6,2 s demandées (la queue est en puissance 2,4, pas lineaire)`);

/* --- 9 : le budget ------------------------------------------------------ */
await page.reload();
await page.waitForTimeout(500);
await page.click('#jouer');
await page.evaluate(() => {
  for (const b of document.getElementById('onglets').children) if (b.dataset.cle === 'thalle') b.click();
});
await page.waitForTimeout(6000);
const budget = await page.evaluate(() => {
  const son = window.__sonde ? null : null;
  return null;
});
const cout = await page.evaluate(() => {
  /* Le cout de `majCouches`, qui est ce que le jeu appellera a chaque image. */
  const m = window.__mesCout || {};
  return m;
});
const charge = await page.evaluate(async () => {
  const mod = await import('./src/audio/son.js');
  const son = mod.son;
  let max = 0;
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) son.majCouches();
  const parImage = (performance.now() - t0) / 600;
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 50)); if (son.charge > max) max = son.charge; }
  return { parImage, max };
});
dire(9, 'Le budget par image tient', charge.parImage < 0.5,
  `${charge.parImage.toFixed(3)} ms par appel de majCouches, ${charge.max} sources vivantes au pic (16,7 ms disponibles)`);

/* --- 10 : le code fait l'aller-retour ---------------------------------- */
const codes = await page.evaluate(async () => {
  const d = await import('./src/data/son-presets.js');
  const out = [];
  for (const a of d.ORDRE_AMBIANCES) {
    const c = d.encoderCode(a, d.PRESETS[a], d.RACKS[a], 24301);
    const r = d.decoderCode(c);
    let ecarts = 0;
    if (!r) ecarts = 999;
    else {
      for (const ch of d.CHAMPS) if (r.preset[ch.cle] !== d.PRESETS[a][ch.cle]) ecarts++;
      for (const v of d.VOIX) for (const ch of d.CHAMPS_PAR_GENRE[v.genre]) if (r.rack[v.cle][ch.cle] !== d.RACKS[a][v.cle][ch.cle]) ecarts++;
      if (r.graine !== 24301) ecarts++;
    }
    out.push({ a, n: c.length, ecarts });
  }
  const tordu = d.decoderCode('AP1-THALLE-0000000000-ZZ');
  return { out, tordu: tordu === null };
});
const bons = codes.out.filter((x) => x.ecarts === 0).length;
dire(10, 'Le code transporte tout, et refuse ce qui est abime', bons === 6 && codes.tordu,
  `${bons}/6 aller-retours exacts, ${codes.out[0].n} caractères, un code tronqué est ${codes.tordu ? 'refusé' : 'ACCEPTE'}`);

console.log('');
const passes = verdicts.filter(Boolean).length;
console.log(`${passes}/${verdicts.length} verdicts passent.`);
await br.close();
srv.close();
process.exit(passes === verdicts.length ? 0 : 1);
