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

/* 8. la paroi neuve migre du pole vers le flanc */
{
  const hy = new Hyphe({ graine: 9 });
  const co = new Contenu(hy, { graine: 9 });
  const dt = 1 / 60;
  let t = 0, trace = null;
  const a = { s: 0, v: 0, jeune: false };
  while (t < 140) {
    co.maj(dt, 0, {});
    hy.avancer(co.avance, dt);
    if (!trace && co.depots.length) trace = co.depots[0];
    t += dt;
  }
  /* on reprend le tout premier depot et on regarde ou il en est */
  const suivi = [];
  {
    const hy2 = new Hyphe({ graine: 9 });
    const co2 = new Contenu(hy2, { graine: 9 });
    let t2 = 0, d0 = null;
    while (t2 < 200) {
      co2.maj(dt, 0, {});
      hy2.avancer(co2.avance, dt);
      /* On suit une trace posee PRES DU POLE : une trace nee a l'epaule
         n'a plus de trajet a faire, elle ne mesure rien. */
      if (!d0) d0 = co2.depots.find((z) => z.u0 < 0.22) || null;
      if (d0) { co2.posDepot(d0, a); suivi.push({ t: t2, s: a.s, v: Math.abs(a.v) }); }
      t2 += dt;
    }
    var R2 = hy2.R, Lc2 = hy2.Lc;
  }
  const debut = suivi[0], fin = suivi[suivi.length - 1];
  const epaule = suivi.find((p) => p.v > R2 * 0.97);
  dire(debut.v < R2 * 0.55 && !!epaule && fin.s > 20,
    'la paroi neuve migre du pole vers le flanc puis sort du champ',
    `posee a ${debut.s.toFixed(2)} um / ${debut.v.toFixed(2)} um de l'axe, `
    + `pleine largeur (${R2} um) apres ${epaule ? epaule.t.toFixed(0) : '—'} s, `
    + `a ${fin.s.toFixed(0)} um derriere l'apex a la fin`);
}

/* 9. le materiau deverse reste dans le periplasme */
{
  const hy = new Hyphe({ graine: 11 });
  const co = new Contenu(hy, { graine: 11 });
  const dt = 1 / 60;
  let t = 0, loin = 0, total = 0;
  while (t < 60) {
    co.maj(dt, 0, {});
    hy.avancer(co.avance, dt);
    /* La bonne mesure est la DISTANCE a la paroi, pas le rapport au rayon :
       au pole une molecule posee sur la surface a v = 0 et W = 0. */
    for (const m of co.mols) { total++; if (distParoi(hy, m.s, m.v, null) > 0.30) loin++; }
    t += dt;
  }
  const part = total ? loin / total : 1;
  dire(part < 0.12, 'le materiau deverse reste plaque contre la paroi',
    `${(part * 100).toFixed(1)} % des molecules-images a plus de 0,30 um de la paroi (seuil 12 %), sur ${total} echantillons`);
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
