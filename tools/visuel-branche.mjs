/* Captures de la page « ramification ». Un banc mesure des durees et des
   pixels de conge, pas une silhouette : sur le prototype precedent onze
   verdicts sont passes pendant trois iterations d'apex phallique. On
   regarde. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css' };
const ROOT = '/home/user/apical';
const OUT = '/tmp/apical-shots';
mkdirSync(OUT, { recursive: true });
const srv = createServer(async (req,res)=>{
  const u = req.url.split('?')[0];
  const p = join(ROOT, u === '/' ? 'index.html' : u);
  try { const b = await readFile(p); res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r=>srv.listen(8099,r));
const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await br.newPage({ viewport:{width:900,height:1000}, deviceScaleFactor:1 });
page.on('pageerror', e=>console.error('ERREUR PAGE:', e.message));
page.on('console', m=>{ if(m.type()==='error') console.error('CONSOLE:', m.text()); });
await page.goto('http://localhost:8099/branche.html');
await page.waitForTimeout(1200);
const vue = await page.$('#vue');
const etapes = [
  { nom:'br-00-naissance', attente:150 },
  { nom:'br-01-emergence', attente:2500 },
  { nom:'br-02-jeune',     attente:5000 },
  { nom:'br-03-etablie',   attente:9000 },
];
for (const e of etapes) { await page.waitForTimeout(e.attente); await vue.screenshot({ path: `${OUT}/${e.nom}.png` }); console.log(e.nom); }
await page.click('[data-pal="noir"]'); await page.waitForTimeout(600);
await vue.screenshot({ path:`${OUT}/br-04-noir.png` }); console.log('br-04-noir');
await page.click('[data-pal="phase"]');
await page.$eval('#cZoom',(el)=>{el.value='3.0';el.dispatchEvent(new Event('input'));});
await page.waitForTimeout(900);
await vue.screenshot({ path:`${OUT}/br-05-zoom.png` }); console.log('br-05-zoom');
await page.click('[data-vue="fille"]');
await page.$eval('#cZoom',(el)=>{el.value='1.2';el.dispatchEvent(new Event('input'));});
await page.waitForTimeout(4000);
await vue.screenshot({ path:`${OUT}/br-06-fille.png` }); console.log('br-06-fille');
console.log(await page.evaluate(()=>{const a=globalThis.apical;return JSON.stringify({tiges:a.tiges.length, fps:Math.round(a.fps), lg:+a.tiges[1].hy.longueur.toFixed(1), sMax:+a.tiges[1].co.sMax.toFixed(1), nves:a.tiges[1].co.ves.length});}));
await br.close(); srv.close();
