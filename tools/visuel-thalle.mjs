/* Captures de la page « colonie ». Un banc mesure des densites et des
   vitesses, pas une silhouette : c'est en regardant qu'on a vu la colonie
   saturer en disque blanc, et la grille de substrat faire un damier. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript'};
const srv=createServer(async(q,r)=>{const u=q.url.split('?')[0];try{const b=await readFile(join('/home/user/apical',u==='/'?'index.html':u));r.writeHead(200,{'content-type':MIME[extname(u)]+'; charset=utf-8'});r.end(b);}catch{r.writeHead(404);r.end();}});
await new Promise(r=>srv.listen(8099,r));
const br=await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await br.newPage({viewport:{width:900,height:1100}});
p.on('pageerror',e=>console.error('ERREUR',e.message));
p.on('console',m=>{if(m.type()==='error'&&!/404|CERT/.test(m.text()))console.error('CONSOLE',m.text());});
await p.goto('http://localhost:8099/thalle.html');
const vue=await p.$('#vue');
for (const [nom, ms] of [['th-1',6000],['th-2',12000],['th-3',20000]]) {
  await p.waitForTimeout(ms);
  await vue.screenshot({path:`/tmp/apical-shots/${nom}.png`});
  console.log(nom, await p.evaluate(()=>{const a=globalThis.apical,t=a.th;return JSON.stringify({min:Math.round(t.t/60),mm:+(t.total/1000).toFixed(1),pointes:t.vives,diam:+(t.diametre/1000).toFixed(2),fps:Math.round(a.fps)});}));
}
await p.click('[data-pal="noir"]'); await p.waitForTimeout(900);
await vue.screenshot({path:'/tmp/apical-shots/th-noir.png'});
await p.click('[data-pal="phase"]');
await p.$eval('#cZoom',(el)=>{el.value='4';el.dispatchEvent(new Event('input'));});
await p.waitForTimeout(2500);
await vue.screenshot({path:'/tmp/apical-shots/th-zoom.png'});
console.log('ok');
await br.close(); srv.close();
