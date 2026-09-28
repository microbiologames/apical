import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'};
const ROOT='/home/user/apical';
const srv=createServer(async(req,res)=>{const u=req.url.split('?')[0];
  try{const b=await readFile(join(ROOT,u==='/'?'index.html':u));
    res.writeHead(200,{'content-type':MIME[extname(u)]||'application/octet-stream'});res.end(b);}
  catch{res.writeHead(404);res.end('');}});
await new Promise(r=>srv.listen(8103,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for (const [nom,w,h,dark] of [['liv-clair',1000,1500,false],['liv-sombre',1000,900,true],['liv-tel',402,900,false]]) {
  const page=await br.newPage({viewport:{width:w,height:h},colorScheme:dark?'dark':'light'});
  page.on('pageerror',e=>console.error('ERREUR:',e.message));
  page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE:',m.text());});
  await page.goto('http://localhost:8103/livraison.html');
  await page.waitForTimeout(6000);
  /* on fige l'evenement en cours a mi-parcours : c'est l'instant a juger */
  await page.$eval('#cScrub', (el) => { el.value = '38'; el.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(600);
  await page.screenshot({path:`/tmp/apical-shots/${nom}.png`, fullPage: nom==='liv-clair'});
  console.log(nom, await page.$eval('#phase',n=>n.textContent).catch(()=>'-'),
    '|', await page.$eval('#chiffres',n=>n.textContent).catch(()=>'-'),
    '| scrollW', await page.evaluate(()=>document.documentElement.scrollWidth), 'vs', w);
  await page.close();
}
await br.close(); srv.close();
