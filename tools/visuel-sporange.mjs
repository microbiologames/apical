/* Captures de la sporulation. Le banc mesure des volumes et des pressions ;
   la mise au point, elle, se regarde. */
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
await p.goto('http://localhost:8099/sporange.html');
await p.waitForTimeout(600);
await p.click('[data-vit="4"]');
const vue=await p.$('#vue');
const vues=['rhizoides','montee','renflement','cavite','columelle','clivage','pression','eclatement','envol'];
for (const ph of vues) {
  await p.waitForFunction((q)=>globalThis.apical && globalThis.apical.sp.phase===q, ph, {timeout:60000, polling:16}).catch(()=>console.log('  (pas vu '+ph+')'));
  await p.waitForTimeout(ph==='eclatement'?260:ph==='envol'?7000:1400);
  /* On FIGE avant de declencher : l'eclatement dure 1,6 s simulee, soit
     0,4 s reelle a x4, et la capture arrivait reguliermenent quatre images
     apres le basculement en envol — donc pendant que la camera plongeait
     deja sur la spore suivie. On capturait autre chose que ce qu'on
     croyait, et on en tirait des conclusions. */
  await p.evaluate(()=>{globalThis.apical.pause=true;});
  await p.waitForTimeout(120);
  await vue.screenshot({path:`/tmp/apical-shots/sp-${vues.indexOf(ph)}-${ph}.png`});
  await p.evaluate(()=>{globalThis.apical.pause=false;});
  console.log(ph, await p.evaluate(()=>{const s=globalThis.apical.sp;return JSON.stringify({t:+s.t.toFixed(0),z:+s.z.toFixed(0),rSac:+s.rSac.toFixed(0),n:s.spores.length,f:+(s.remplissage||0).toFixed(2),fps:Math.round(globalThis.apical.fps)});}));
}
await br.close(); srv.close();
