/* ---------------------------------------------------------------------------
   Banc VISUEL. Il repond a la seule question que le banc de logique ne peut
   pas poser : est-ce que la page se charge, tourne, et DESSINE quelque chose ?

   Lecon reprise de Cell Dungeon : un moteur qui ne leve pas d'exception peut
   parfaitement ne rien produire. On ne verifie donc pas l'absence d'erreur, on
   verifie le CONTENU DU CANVAS — nombre de couleurs distinctes, variance, et
   qu'il CHANGE d'une image a l'autre. Une page figee sur un fond uni passe
   n'importe quel test d'exception.
--------------------------------------------------------------------------- */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const PORT = 8137;
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
mkdirSync('captures', { recursive: true });

let serveur = null;
if (!process.env.BASE) {
  serveur = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
}

const verdicts = [];
function verdict(ok, titre, detail) {
  verdicts.push({ ok, titre, detail });
  console.log(`${ok ? '  OK ' : ' ECHEC'}  ${titre}\n         ${detail}`);
}

/* Le Chromium du conteneur (revision 1194) ne correspond pas forcement a celui
   que la version installee de Playwright attend : on le lui designe. Le lien
   /opt/pw-browsers/chromium est stable, la revision non. */
const BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const nav = await chromium.launch({
  executablePath: existsSync(BIN) ? BIN : undefined,
  /* --headless=new plutot que le shell headless, absent a cette revision. */
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  channel: undefined,
});
const erreurs = [];

/** Statistiques du canvas : couleurs distinctes et variance de luminance. */
const STATS = `(() => {
  const c = document.getElementById('jeu');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const vus = new Set();
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    vus.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]);
    const l = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    s += l; s2 += l*l; n++;
  }
  return { couleurs: vus.size, moy: s/n, ecart: Math.sqrt(s2/n - (s/n)**2), w: c.width, h: c.height };
})()`;

async function session(nom, viewport) {
  /* Facteur 4 : le canvas est agrandi au plus proche voisin, donc la capture
     montre exactement les pixels du jeu, quatre fois plus gros. */
  const page = await nav.newPage({ viewport, deviceScaleFactor: 4 });
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`${nom}: ${m.text()}`); });
  page.on('pageerror', (e) => erreurs.push(`${nom}: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const titre = await page.evaluate(STATS);
  /* On germe, puis on joue : barre a droite, poussee, une ramification. */
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  const t2 = await page.evaluate(STATS);
  await page.screenshot({ path: `captures/${nom}-02s.png` });

  /* Pilotage DOUX et alterne. La premiere version tenait D puis A a fond
     pendant plus d'une seconde : l'hyphe partait a la limite de cap, ne
     trouvait plus de sucre et mourait de carence en 14 s. Une capture prise sur
     une partie ratee ne dit rien du rendu qu'on veut juger. */
  for (const [touche, ms] of [['KeyD', 380], ['KeyA', 520], ['KeyD', 300]]) {
    await page.keyboard.down(touche);
    await page.waitForTimeout(ms);
    await page.keyboard.up(touche);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `captures/${nom}-06s.png` });

  await page.keyboard.press('Space');       // ramifier
  for (const [touche, ms] of [['KeyA', 300], ['KeyW', 600], ['KeyD', 340], ['KeyS', 900]]) {
    await page.keyboard.down(touche);
    await page.waitForTimeout(ms);
    await page.keyboard.up(touche);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(3000);
  const t14 = await page.evaluate(STATS);
  await page.screenshot({ path: `captures/${nom}-14s.png` });

  /* CAPTURE MACRO, centree sur l'apex. C'est la seule facon de juger ce que le
     jeu montre vraiment : a la taille d'ecran, un organite de deux pixels dans
     un tube de quatorze est invisible sur une capture, et on conclut a tort
     qu'il n'est pas dessine. Le cadre suit la position de l'apex a l'ecran,
     soit 62 % de la hauteur du champ. */
  const cadre = await page.evaluate(`(() => {
    const c = document.getElementById('jeu');
    const r = c.getBoundingClientRect();
    const ex = r.width / c.width, ey = r.height / c.height;
    return { x: r.x + r.width / 2 - 34 * ex, y: r.y + r.height * 0.62 - 30 * ey,
             width: 68 * ex, height: 60 * ey };
  })()`);
  await page.screenshot({ path: `captures/${nom}-macro.png`, clip: cadre });

  /* Deux images consecutives : le champ doit CHANGER. Un rendu figé est le
     defaut le plus facile a ne pas voir, parce qu'il est joli. */
  const a = await page.evaluate(`(() => {
    const c = document.getElementById('jeu');
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice(0, 40000).join(',');
  })()`);
  await page.waitForTimeout(220);
  const b = await page.evaluate(`(() => {
    const c = document.getElementById('jeu');
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice(0, 40000).join(',');
  })()`);

  /* Etat interne, expose pour le banc. */
  const etat = await page.evaluate('window.__apical ? window.__apical() : null');
  await page.close();
  return { titre, t2, t14, bouge: a !== b, etat };
}

console.log('\n=== APICAL : banc visuel ===\n');
const port = await session('portrait', { width: 420, height: 820 });
const pays = await session('paysage', { width: 900, height: 480 });

verdict(erreurs.length === 0, 'aucune erreur de console ni exception',
  erreurs.length ? erreurs.slice(0, 4).join(' | ') : 'deux sessions, portrait et paysage');

verdict(port.t2.couleurs > 60 && pays.t2.couleurs > 60,
  'le champ est vraiment dessine',
  `couleurs distinctes : portrait ${port.t2.couleurs}, paysage ${pays.t2.couleurs} `
  + `(il en faut plus de 60 ; un fond uni en donne 1)`);

verdict(port.t2.ecart > 12 && pays.t2.ecart > 12,
  'le champ a du contraste, pas un aplat',
  `ecart type de luminance : portrait ${port.t2.ecart.toFixed(1)}, paysage ${pays.t2.ecart.toFixed(1)}`);

verdict(port.bouge && pays.bouge, 'le rendu n\'est pas fige',
  'deux images a 220 ms d\'intervalle differentent dans les deux orientations');

verdict(port.titre.couleurs < port.t2.couleurs,
  'la germination fait bien entrer en jeu',
  `titre ${port.titre.couleurs} couleurs, jeu ${port.t2.couleurs}`);

verdict(port.t14.couleurs > 60 && pays.t14.couleurs > 60,
  'le champ tient encore apres 14 s de jeu',
  `portrait ${port.t14.couleurs} couleurs, paysage ${pays.t14.couleurs}`);

if (port.etat) {
  const e = port.etat;
  /* On verifie que la SIMULATION a tourne, pas que le robot ait bien joue : un
     pilotage scripte meurt legitimement, et exiger qu'il survive ferait echouer
     le banc a chaque reglage d'equilibrage sans rien dire du rendu. Ce qu'on
     garde, c'est qu'un rendu superbe sur une simulation gelee ne doit pas
     passer : 100 um de thalle, c'est une dizaine de secondes de croissance. */
  verdict(e.longueur > 100 && e.avance > 60,
    'la simulation a reellement tourne derriere le rendu',
    `longueur ${e.longueur} um, avance ${e.avance} um, ${e.apex} apex, etat ${e.etat}`);
}

verdict(port.t2.w === 256, 'la disposition portrait fait 256 px de large',
  `${port.t2.w} x ${port.t2.h} en portrait, ${pays.t2.w} x ${pays.t2.h} en paysage`);

await nav.close();
if (serveur) serveur.kill();
writeFileSync('captures/etat.json', JSON.stringify({ port, pays, erreurs }, null, 2));
const ko = verdicts.filter((v) => !v.ok).length;
console.log(`\n=== ${verdicts.length - ko}/${verdicts.length} verdicts visuels ===`);
console.log('captures dans captures/\n');
process.exit(ko ? 1 : 0);
