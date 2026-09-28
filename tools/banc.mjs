/* Banc de mesure sans rendu. Un chiffre documente sans avoir ete mesure est
   un chiffre qu'on croit seulement avoir. */
import { Hyphe, distParoi } from '../src/sim/hyphe.js';
import { Contenu, S_MAX } from '../src/sim/contenu.js';
import { clamp, angleDelta, noise1 } from '../src/core/util.js';

const KOM = 0.016, TAU_OM = 3.5;

function manche({ duree = 60, dt = 1 / 60, graine = 1, cible = null, phiSuivi = null }) {
  const hy = new Hyphe({ graine });
  const co = new Contenu(hy, { graine });
  let phi = 0, t = 0;
  const trace = [];
  let sortis = 0, nan = 0;
  const th0 = hy.th;
  while (t < duree) {
    const c = cible !== null ? cible : (noise1(t * 0.055, 31) - 0.5) * 1.5;
    phi += (c - phi) * clamp(dt * 0.9, 0, 1);
    co.maj(dt, phi, {});
    const omCible = (co.couple / dt) * KOM;
    hy.om += (omCible - hy.om) * clamp(dt / TAU_OM, 0, 1);
    hy.avancer(co.avance, dt);
    t += dt;
    if (!Number.isFinite(hy.x) || !Number.isFinite(hy.y) || !Number.isFinite(hy.th)) nan++;
    for (const v of co.ves) if (distParoi(hy, v.s, v.v, null) < -0.08) sortis++;
    if (phiSuivi) trace.push({ t, th: angleDelta(th0, hy.th), l: hy.longueur, om: hy.om });
  }
  return { hy, co, t, sortis, nan, trace, th0 };
}

const R = [];
function dire(ok, titre, detail) { R.push({ ok, titre, detail }); }

/* 1. vitesse de croissance */
{
  const vs = [];
  for (let g = 1; g <= 6; g++) { const m = manche({ duree: 45, graine: g }); vs.push(m.hy.longueur / m.t * 60); }
  vs.sort((a, b) => a - b);
  const med = vs[3];
  dire(med > 12 && med < 30, 'la vitesse de croissance est celle de Neurospora',
    `${med.toFixed(1)} um/min sur 6 manches (publi : 20 um/min ; fourchette acceptee 12-30)`);
}

/* 2. cadence de fusion */
{
  const m = manche({ duree: 45, graine: 2 });
  const f = m.co.fusions / m.t;
  dire(f > 0.9 && f < 6, 'les fusions apicales cadencent la croissance',
    `${f.toFixed(2)} fusions/s (une toutes les ${(1 / f).toFixed(2)} s), ${(m.hy.longueur / Math.max(m.co.fusions, 1) * 1000).toFixed(0)} nm d'extension chacune`);
}

/* 3. rayon de virage sous consigne maximale */
{
  const m = manche({ duree: 120, graine: 3, cible: 0.85, phiSuivi: true });
  const dth = Math.abs(angleDelta(m.th0, m.hy.th));
  const rayon = dth > 0.02 ? m.hy.longueur / dth : Infinity;
  dire(rayon > 35 && rayon < 400, 'le virage reste large',
    `rayon de courbure ${rayon.toFixed(0)} um a consigne pleine (${(dth * 180 / Math.PI).toFixed(0)} deg en ${m.hy.longueur.toFixed(0)} um)`);
}

/* 4. inertie : delai entre la consigne et le cap */
{
  const m = manche({ duree: 60, graine: 4, cible: 0.85, phiSuivi: true });
  const fin = m.trace[m.trace.length - 1].om;
  let t63 = null;
  for (const p of m.trace) if (t63 === null && Math.abs(p.om) > Math.abs(fin) * 0.63) t63 = p.t;
  dire(t63 !== null && t63 > 2.5 && t63 < 25, 'le cap a beaucoup d\'inertie',
    `63 % de la vitesse angulaire atteinte en ${t63 === null ? '—' : t63.toFixed(1)} s`);
}

/* 5. etancheite : rien ne sort du tube */
{
  let s = 0, n = 0;
  for (let g = 1; g <= 4; g++) { const m = manche({ duree: 30, graine: g }); s += m.sortis; n += m.nan; }
  dire(s === 0 && n === 0, 'rien ne traverse la paroi',
    `${s} vesicule-images hors du tube, ${n} etats non finis sur 4 x 30 s`);
}

/* 6. population stable */
{
  const m = manche({ duree: 90, graine: 5 });
  const nVes = m.co.ves.length, nMol = m.co.mols.length;
  const apicales = m.co.ves.filter((v) => v.etat === 2).length;
  dire(nVes === 120 && nMol < 430 && apicales > 8,
    'le Spitzenkorper se forme sans etre dessine',
    `${apicales} vesicules sur ${nVes} retenues dans le reservoir apical, ${nMol} molecules en vol`);
}

/* 7. budget */
{
  const t0 = performance.now();
  manche({ duree: 60, graine: 7 });
  const ms = performance.now() - t0;
  dire(ms < 3000, 'la logique tient dans son budget',
    `60 s simulees en ${ms.toFixed(0)} ms, soit ${(ms / 3600).toFixed(3)} ms par image`);
}

console.log('\n=== APICAL : banc ===\n');
for (const r of R) console.log(` ${r.ok ? ' OK  ' : 'ECHEC'}  ${r.titre}\n          ${r.detail}`);
console.log(`\n=== ${R.filter((r) => r.ok).length}/${R.length} verdicts ===\n`);
process.exit(R.every((r) => r.ok) ? 0 : 1);
