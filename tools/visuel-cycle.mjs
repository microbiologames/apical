/* Captures du cycle complet. Un banc mesure des durees ; un enchainement,
   ca se regarde — et surtout ca se regarde AUX SOUDURES. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = createServer(async (q, r) => {
  const u = q.url.split('?')[0];
  try { const b = await readFile(join('/home/user/apical', u === '/' ? 'index.html' : u));
        r.writeHead(200, { 'content-type': MIME[extname(u)] + '; charset=utf-8' }); r.end(b); }
  catch { r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(8095, r));
const br = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const p = await br.newPage({ viewport: { width: 900, height: 1100 } });
p.on('pageerror', (e) => console.error('ERREUR', e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) console.error('CONSOLE', m.text()); });
await p.goto('http://localhost:8095/cycle.html');
await p.waitForTimeout(600);
await p.click('[data-vit="4"]');
const vue = await p.$('#vue');

const etat = () => p.evaluate(() => {
  const a = globalThis.apical;
  return JSON.stringify({
    etape: a.etape, fondu: a.fondu ? +a.fondu.u.toFixed(2) : null,
    t: +a.t.toFixed(0), tours: a.tours, fps: Math.round(a.fps),
    px: +a.px.toFixed(2),
    detail: a.etape === 'sporulation' ? a.sp.phase
      : a.etape === 'vol' ? 'v=' + a.vol.v.toFixed(2)
      : a.g.phase + '/' + a.g.tubes.length + ' tubes',
  });
});
const tirer = async (nom) => {
  await p.evaluate(() => { globalThis.apical.pause = true; });
  await p.waitForTimeout(150);
  await vue.screenshot({ path: `/tmp/apical-shots/cy-${nom}.png` });
  await p.evaluate(() => { globalThis.apical.pause = false; });
  console.log(nom, await etat());
};

const attendre = (test, arg, ms = 240000) =>
  p.waitForFunction(test, arg, { timeout: ms, polling: 32 }).catch(() => console.log('  (pas vu)'));

await attendre(() => globalThis.apical.etape === 'germination' && globalThis.apical.g.phase === 'gonflement');
await tirer('0-gonflement');
await attendre(() => globalThis.apical.etape === 'croissance');
await p.waitForTimeout(1500); await tirer('1-croissance');
await p.waitForTimeout(6000); await tirer('2-ramification');
/* Le fondu vers la sporulation, pris au sommet du flou. */
await attendre(() => globalThis.apical.fondu && globalThis.apical.fondu.u > 0.42 && globalThis.apical.fondu.u < 0.62);
await tirer('3-fondu');
await attendre(() => globalThis.apical.etape === 'sporulation' && globalThis.apical.sp.rSac > 30);
await tirer('4-sporocyste');
await attendre(() => globalThis.apical.etape === 'sporulation' && globalThis.apical.sp.phase === 'eclatement');
await p.waitForTimeout(260); await tirer('5-eclatement');
await attendre(() => globalThis.apical.etape === 'vol' && globalThis.apical.tEtape > 2);
await tirer('6-vol');
await attendre(() => globalThis.apical.etape === 'vol' && globalThis.apical.vol.v < 0.35);
await tirer('7-retombee');
await attendre(() => globalThis.apical.tours >= 1);
await p.waitForTimeout(1200); await tirer('8-tour2');
await br.close(); srv.close();
