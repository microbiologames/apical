/* Captures de la germination. Le banc mesure des rayons et des durees ;
   le gonflement, lui, se regarde. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript'};
const srv=createServer(async(q,r)=>{const u=q.url.split('?')[0];try{const b=await readFile(join('/home/user/apical',u==='/'?'index.html':u));r.writeHead(200,{'content-type':MIME[extname(u)]+'; charset=utf-8'});r.end(b);}catch{r.writeHead(404);r.end();}});
await new Promise(r=>srv.listen(8096,r));
const br=await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await br.newPage({viewport:{width:900,height:1100}});
p.on('pageerror',e=>console.error('ERREUR',e.message));
p.on('console',m=>{if(m.type()==='error'&&!/404|CERT/.test(m.text()))console.error('CONSOLE',m.text());});
await p.goto('http://localhost:8096/germination.html');
await p.waitForTimeout(600);
await p.click('[data-vit="4"]');
const vue=await p.$('#vue');
const vues=['dormance','imbibition','gonflement','polarisation','emergence','tube'];
let k=0;
for (const ph of vues) {
  await p.waitForFunction((q)=>globalThis.apical && globalThis.apical.g.phase===q, ph, {timeout:60000, polling:16}).catch(()=>console.log('  (pas vu '+ph+')'));
  await p.waitForTimeout(ph==='dormance'?200:ph==='emergence'?600:ph==='polarisation'?2600:1200);
  /* On FIGE avant de declencher : une phase de sept secondes simulees dure
     1,7 s reelle a x4, et la capture arrivait apres le basculement. */
  await p.evaluate(()=>{globalThis.apical.pause=true;});
  await p.waitForTimeout(140);
  await vue.screenshot({path:`/tmp/apical-shots/ge-${k}-${ph}.png`});
  await p.evaluate(()=>{globalThis.apical.pause=false;});
  console.log(ph, await p.evaluate(()=>{const g=globalThis.apical.g;return JSON.stringify({t:+g.t.toFixed(0),r:+g.spore.r.toFixed(2),turg:+g.spore.turg.toFixed(2),ves:g.spore.ves.length,tubes:g.tubes.length,L:+(g.principal?g.principal.hy.longueur:0).toFixed(1),fps:Math.round(globalThis.apical.fps)});}));
  k++;
}
/* Puis le thalle qui s'installe, et l'apex au grossissement de l'hyphe. */
await p.waitForTimeout(9000);
await p.evaluate(()=>{globalThis.apical.pause=true;}); await p.waitForTimeout(140);
await vue.screenshot({path:'/tmp/apical-shots/ge-6-thalle.png'});
await p.evaluate(()=>{globalThis.apical.pause=false;});
await p.click('[data-cad="apex"]');
await p.waitForTimeout(3500);
await p.evaluate(()=>{globalThis.apical.pause=true;}); await p.waitForTimeout(140);
await vue.screenshot({path:'/tmp/apical-shots/ge-7-apex.png'});
console.log('final', await p.evaluate(()=>{const g=globalThis.apical.g;return JSON.stringify({t:+g.t.toFixed(0),tubes:g.tubes.length,L:+g.principal.hy.longueur.toFixed(0)});}));
await br.close(); srv.close();
