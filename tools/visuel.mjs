/* Captures. Onze verdicts de banc ne voient pas une silhouette : sur le
   prototype precedent ils sont tous passes pendant trois iterations d'apex
   phallique. On regarde. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.env.OUT || '/tmp/apical-shots';
mkdirSync(OUT, { recursive: true });

const srv = createServer(async (req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => srv.listen(8099, r));

const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await br.newPage({ viewport: { width: 760, height: 1020 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('ERREUR PAGE:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto('http://localhost:8099/index.html');
await page.waitForTimeout(900);

const plan = JSON.parse(process.env.PLAN || '[]');
const defaut = [
  { nom: '01-phase-0s', pal: 'phase', attente: 300 },
  { nom: '02-phase-20s', pal: 'phase', vit: 4, attente: 5200 },
  { nom: '03-noir-20s', pal: 'noir', vit: 4, attente: 5200 },
  { nom: '04-met-20s', pal: 'met', vit: 4, attente: 5200 },
];
for (const e of (plan.length ? plan : defaut)) {
  await page.evaluate(() => { if (globalThis.apical) globalThis.apical.pause = false; });
  if (e.pal) await page.click(`[data-pal="${e.pal}"]`);
  if (e.vit) await page.click(`[data-vit="${e.vit}"]`);
  if (e.cal) await page.$eval('#cCal', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, String(e.cal));
  if (e.zoom) await page.$eval('#cZoom', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, String(e.zoom));
  for (const o of (e.off || [])) await page.$eval(`[data-opt="${o}"]`, (el) => { if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
  for (const o of (e.on || [])) await page.$eval(`[data-opt="${o}"]`, (el) => { if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change')); } });
  await page.waitForTimeout(e.attente ?? 1200);
  if (e.fusion) {
    /* On attend un creux de membrane d'au moins `fusion` um : c'est le
       critere VISUEL, pas l'avancement d'un evenement. Une petite vesicule
       ne creuse que 2 px et on ne voit rien. */
    await page.waitForFunction((seuil) => {
      const a = globalThis.apical;
      if (!a || !a.co.membrane) return false;
      for (const c of a.co.membrane.ch) for (let i = 0; i < c.n; i++) if (c.off[i] > seuil) return true;
      return false;
    }, e.fusion, { timeout: 60000, polling: 16 }).catch(() => console.log('  (pas de creux vu)'));
    await page.evaluate(() => { globalThis.apical.pause = true; });
    if (e.crop === 'fusion') {
      const c = await page.evaluate(() => {
        const a = globalThis.apical, mb = a.co.membrane, hy = a.hy, sc = a.scene;
        let best = -1, bi = 0, bc = 0;
        for (let k = 0; k < 2; k++) for (let i = 0; i < mb.ch[k].n; i++) {
          if (mb.ch[k].off[i] > best) { best = mb.ch[k].off[i]; bi = i; bc = k; }
        }
        const cote = bc === 0 ? -1 : 1;
        const sA = mb.sDepuisAge(mb.ch[bc].a[bi]);
        const T = hy.table(36, 0.3);
        const f = (s2) => { const q = Math.min(Math.max(s2 / T.pas, 0), T.n - 1.001), j = q | 0, t = q - j;
          return { x: T.x[j] + (T.x[j+1]-T.x[j])*t, y: T.y[j] + (T.y[j+1]-T.y[j])*t,
                   nx: T.nx[j] + (T.nx[j+1]-T.nx[j])*t, ny: T.ny[j] + (T.ny[j+1]-T.ny[j])*t }; };
        const p = f(sA), w = hy.W(sA);
        const wx = p.x + p.nx * cote * w, wy = p.y + p.ny * cote * w;
        const px = sc.sx(wx), py = sc.sy(wy);
        const cr = a.canvas.getBoundingClientRect(), vr = document.getElementById('vue').getBoundingClientRect();
        const ech = cr.width / a.canvas.width;
        return { x: cr.left - vr.left + px * ech, y: cr.top - vr.top + py * ech, off: best };
      });
      console.log('  creux', c.off.toFixed(3), 'um');
      e.crop = [Math.max(0, c.x - 150), Math.max(0, c.y - 110), 300, 220];
    }
  }
  if (e.vit) await page.click('[data-vit="1"]');
  if (e.crop) {
    const b = await page.locator('#vue').boundingBox();
    await page.screenshot({ path: `${OUT}/${e.nom}.png`,
      clip: { x: b.x + e.crop[0], y: b.y + e.crop[1], width: e.crop[2], height: e.crop[3] } });
  } else {
    await page.locator('#vue').screenshot({ path: `${OUT}/${e.nom}.png` });
  }
  const m = await page.$eval('#mesures', (n) => n.textContent);
  console.log(e.nom, '|', m);
}

/* Zoom macro : on veut voir les pixels, pas une vignette. */
await page.$eval('#cZoom', (el) => { el.value = '1.6'; el.dispatchEvent(new Event('input')); });
await page.waitForTimeout(600);
await page.locator('#vue').screenshot({ path: `${OUT}/90-macro.png` });

await br.close();
srv.close();
console.log('captures dans', OUT);
