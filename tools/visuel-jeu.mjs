/* Captures du jeu. Le banc mesure que jouer bat regarder ; ce qu'on voit en
   jouant, lui, se regarde. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript'};
const srv=createServer(async(q,r)=>{const u=q.url.split('?')[0];try{const b=await readFile(join('/home/user/apical',u==='/'?'index.html':u));r.writeHead(200,{'content-type':MIME[extname(u)]+'; charset=utf-8'});r.end(b);}catch{r.writeHead(404);r.end();}});
await new Promise(r=>srv.listen(8096,r));
const br=await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await br.newPage({viewport:{width:900,height:1000}});
p.on('pageerror',e=>console.error('ERREUR',e.message));
p.on('console',m=>{if(m.type()==='error'&&!/404|CERT/.test(m.text()))console.error('CONSOLE',m.text());});
await p.goto('http://localhost:8096/jeu.html');
await p.waitForTimeout(800);
await p.evaluate(()=>{ globalThis.apical.reset(7); });

const etat=async()=>p.evaluate(()=>{const e=globalThis.apical.etat();return JSON.stringify({mode:e.mode,t:Math.round(globalThis.apical.jeu.t),pointes:e.pointes,mm:+e.mycelium.toFixed(1),spores:e.spores,sporo:+e.avancement.toFixed(2),fps:Math.round(globalThis.apical.fps)});});
const tirer=async(nom)=>{ await p.evaluate(()=>{globalThis.apical.pause=true;}); await p.waitForTimeout(120);
  await (await p.$('#vue')).screenshot({path:`/tmp/apical-shots/jeu-${nom}.png`});
  await p.evaluate(()=>{globalThis.apical.pause=false;}); console.log(nom, await etat()); };

/* on laisse la colonie s'installer */
const jusqua=async(s)=>{ await p.waitForFunction((q)=>globalThis.apical.jeu.t>q, s, {timeout:120000, polling:32}); };

await jusqua(900);
await tirer('0-colonie');
for (const c of ['substrat','reserve','menace']) {
  await p.click(`[data-cal="${c}"]`); await p.waitForTimeout(200);
  await tirer('1-calque-'+c);
}
await p.click('[data-cal="aucun"]');

/* on descend sur une pointe : on clique au milieu d'une hyphe vivante */
await jusqua(2400);
await tirer('2-etablie');
const ok = await p.evaluate(()=>{
  const a=globalThis.apical, v=a.vueT;
  let best=null,bd=-1;
  for(const q of a.th.pointes){ if(!q.vive)continue; const d=q.x; if(d>bd){bd=d;best=q;} }
  if(!best) return false;
  a.descendre(best); return true;
});
console.log('descente', ok);
await p.waitForTimeout(400); await tirer('3-fondu');
await p.waitForFunction(()=>globalThis.apical.mode==='micro',null,{timeout:30000,polling:32});
await p.waitForTimeout(1200); await tirer('4-apex');
await p.evaluate(()=>{ globalThis.apical.sporuler(); });
await p.waitForTimeout(400); await tirer('5-sporuler');
await p.evaluate(()=>{ globalThis.apical.remonter(); });
await p.waitForFunction(()=>globalThis.apical.mode==='macro',null,{timeout:30000,polling:32});
await p.waitForTimeout(600); await tirer('6-remonte');

/* LES SEPT PLATEAUX. Ce que le banc mesure, on le regarde aussi : une mie
   n'a pas la meme tete qu'un fromage, et si elle en a une, il n'y en a
   qu'un. */
const cles = await p.evaluate(async () => {
  const { MATRICES } = await import('/src/sim/matrices.js');
  return MATRICES.map((m) => m.cle);
});
for (const c of cles) {
  await p.evaluate((k) => {
    const a = globalThis.apical;
    a.reset(11);
    const i = a.ordre.findIndex((j) => j >= 0);
    /* on force le plateau demande */
    a.tour = 0; a.ordre = [k];
    a.nouveauPlateau();
  }, cles.indexOf(c));
  await p.waitForFunction(() => globalThis.apical.jeu.t > 2700, null, { timeout: 120000, polling: 32 });
  await tirer('p-' + c);
}

/* LE CHOIX DES TROIS SPORES. On force une fin gagnante : le geste de fin du
   roguelite est ce qui se regarde le plus dans une partie. */
await p.evaluate(() => {
  const a = globalThis.apical;
  a.reset(5); a.jeu.spores = 3; a.jeu.fin = 'temps';
});
await p.waitForTimeout(700);
await (await p.$('#vue')).screenshot({ path: '/tmp/apical-shots/jeu-9-spores.png' });
console.log('spores', await p.evaluate(() => {
  const c = globalThis.apical.etat().candidates;
  return c ? c.map((x) => x.trait + ' ' + x.valeur.toFixed(2)).join(' | ') : 'aucune';
}));
/* et on en choisit une : le plateau doit changer */
await p.click('[data-spore="1"]');
await p.waitForTimeout(500);
console.log('apres choix', await p.evaluate(() => {
  const a = globalThis.apical, e = a.etat();
  return JSON.stringify({ tour: e.tour, plateau: e.plateau,
    genome: Object.fromEntries(Object.entries(e.genome).map(([k, v]) => [k, +v.toFixed(2)])) });
}));

/* le HUD au repos : on ne touche plus a rien pendant huit secondes */
await p.evaluate(()=>{ globalThis.apical.geste = performance.now() - 20000; });
await p.waitForTimeout(1400);
await (await p.$('#vue')).screenshot({path:'/tmp/apical-shots/jeu-7-repos.png'});
await p.screenshot({path:'/tmp/apical-shots/jeu-8-page.png'});
console.log('repos', await p.evaluate(()=>document.body.className));
await br.close(); srv.close();
