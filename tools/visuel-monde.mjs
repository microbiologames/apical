/* Captures du pont entre les deux echelles. Le fondu ne se mesure pas : il
   se regarde. */
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
await p.goto('http://localhost:8099/monde.html');
const vue=await p.$('#vue');
await p.waitForTimeout(14000);
await vue.screenshot({path:'/tmp/apical-shots/m-0-colonie.png'});
console.log('colonie', await p.evaluate(()=>{const a=globalThis.apical;return JSON.stringify({min:Math.round(a.th.t/60),pointes:a.th.vives});}));
/* on descend sur une pointe vivante, en visant son point a l'ecran */
const cible = await p.evaluate(()=>{
  const a=globalThis.apical, v=a.vueT;
  let best=null,bd=-1;
  for(const q of a.th.pointes){ if(!q.vive) continue; const d=Math.hypot(q.x,q.y); if(d>bd){bd=d;best=q;} }
  a.descendre(best);
  return JSON.stringify({x:+best.x.toFixed(0),y:+best.y.toFixed(0),axe:best.axe.n});
});
console.log('descente sur', cible);
for (const [nom,ms] of [['m-1-fondu',300],['m-2-fondu',350],['m-3-fondu',400]]) {
  await p.waitForTimeout(ms); await vue.screenshot({path:`/tmp/apical-shots/${nom}.png`});
  console.log(nom, await p.evaluate(()=>{const a=globalThis.apical;return a.mode+' tr='+a.tr.toFixed(2);}));
}
await p.waitForTimeout(3000);
await vue.screenshot({path:'/tmp/apical-shots/m-4-apex.png'});
console.log('apex', await p.evaluate(()=>{const a=globalThis.apical;return JSON.stringify({mode:a.mode,min:Math.round(a.th.t/60),lg:+a.pointe.micro.hy.longueur.toFixed(1),fps:Math.round(a.fps)});}));
await p.waitForTimeout(6000);
await vue.screenshot({path:'/tmp/apical-shots/m-5-apex.png'});
await p.evaluate(()=>globalThis.apical.remonter());
await p.waitForTimeout(800); await vue.screenshot({path:'/tmp/apical-shots/m-6-montee.png'});
await p.waitForTimeout(3000); await vue.screenshot({path:'/tmp/apical-shots/m-7-retour.png'});
console.log('retour', await p.evaluate(()=>{const a=globalThis.apical;return JSON.stringify({mode:a.mode,min:Math.round(a.th.t/60),pointes:a.th.vives});}));
await br.close(); srv.close();
