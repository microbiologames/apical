/* Banc de mesure sans rendu. Un chiffre documente sans avoir ete mesure est
   un chiffre qu'on croit seulement avoir. */
import { Hyphe, distParoi, brancherSur } from '../src/sim/hyphe.js';
import { Contenu, S_MAX } from '../src/sim/contenu.js';
import { clamp, angleDelta, noise1 } from '../src/core/util.js';
import { omega, zonesFusion } from '../src/sim/membrane.js';
import { DUREE_FUSION } from '../src/sim/contenu.js';
import { Scene } from '../src/render/scene.js';

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
  /* La population est comparee a la consigne, pas a 95 : elle suit la
     longueur du domaine simule, qui est passee de 34 a 70 um. Ce qu'on
     verifie ici c'est qu'elle est STABLE — aucune vesicule perdue ni
     dupliquee en 90 s — et que le reservoir apical se forme quand meme. */
  dire(nVes === m.co.nVes && nMol < 470 && apicales > 7,
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

/* 10. la fusion est UNE courbe, et elle appartient au materiau */
{
  const dt = 1 / 60;
  const hy = new Hyphe({ graine: 21 });
  const co = new Contenu(hy, { graine: 21 });
  let t = 0, suivi = null, debut = null, fin = null, ecartMax = 0, testes = 0;

  while (t < 90) {
    co.maj(dt, 0, {});
    hy.avancer(co.avance, dt);

    /* (a) continuite : les deux bouts de l'arc d'omega doivent tomber
           EXACTEMENT sur la ligne de membrane. C'est la propriete que la
           version precedente n'avait pas : elle effacait un cercle pendant
           qu'elle creusait une ligne, sans jamais les raccorder. */
    for (const v of co.ves) {
      if (v.etat !== 1) continue;
      const g = omega(v.r, Math.min(v.tf / DUREE_FUSION, 1));
      const A = { x: -g.hw, y: 0, ix: 0, iy: 1, wx: 0, wy: 0, a: 0 };
      const B = { x: g.hw, y: 0, ix: 0, iy: 1, wx: 0, wy: 0, a: 1 };
      const arc = Scene.prototype.arcOmega.call({}, A, B, g.dep);
      const d0 = Math.hypot(arc[0].x - A.x, arc[0].y - A.y);
      const d1 = Math.hypot(arc[arc.length - 1].x - B.x, arc[arc.length - 1].y - B.y);
      ecartMax = Math.max(ecartMax, d0, d1);
      testes++;
    }

    /* (b) derive : l'abscisse de l'omega doit reculer exactement de ce dont
           l'apex a avance. */
    /* Apres 25 s : avant, le reservoir se remplit encore et l'apex n'a
       pas commence a avancer — on mesurerait une derive nulle sur une
       hyphe qui ne pousse pas. */
    if (!suivi && t > 25) {
      const v = co.ves.find((x) => x.etat === 1 && x.tf > 0.05 && x.tf < 0.2);
      if (v) { suivi = v; debut = { s: co.membrane.sDepuisAge(v.am), a: v.am, l: hy.longueur }; }
    } else if (suivi && suivi.tf > DUREE_FUSION * 0.9 && !fin) {
      fin = { s: co.membrane.sDepuisAge(suivi.am), a: suivi.am, l: hy.longueur };
    }
    t += dt;
  }

  /* On compare l'AGE, pas l'abscisse : sur la calotte ds/da = (pi/2).sin(psi),
     donc l'abscisse recule plus vite que la croissance a mesure qu'on
     approche de l'epaule. C'est l'expansion orthogonale, pas une erreur. */
  const recul = fin ? fin.s - debut.s : 0;
  const vieilli = fin ? fin.a - debut.a : 0;
  const pousse = fin ? fin.l - debut.l : 1;
  const err = Math.abs(vieilli - pousse) / Math.max(pousse, 1e-6);
  dire(ecartMax < 1e-9 && testes > 200 && !!fin && err < 0.06,
    'la fusion est une seule courbe, et elle appartient au materiau',
    `raccord de l'arc sur la ligne : ecart max ${ecartMax.toExponential(1)} px sur ${testes} images ; `
    + `pendant l'evenement l'omega a vieilli de ${(vieilli * 1000).toFixed(0)} nm pour `
    + `${(pousse * 1000).toFixed(0)} nm d'avance de l'apex (ecart ${(err * 100).toFixed(2)} %), `
    + `et son abscisse a recule de ${(recul * 1000).toFixed(0)} nm — l'ecart est l'expansion orthogonale`);
}

/* 11. l'ancrage est le point de contact, et deux livraisons voisines n'en
       font qu'une */
{
  const dt = 1 / 60;
  const hy = new Hyphe({ graine: 33 });
  const co = new Contenu(hy, { graine: 33 });
  let t = 0, pire = 0, ancres = 0, chevauche = 0, fenetres = 0, groupes = 0;
  const etats = new WeakMap();

  while (t < 120) {
    for (const v of co.ves) etats.set(v, v.etat);
    co.maj(dt, 0, {});
    hy.avancer(co.avance, dt);

    /* (a) au moment de l'ancrage, le point ancre doit etre le point de
           CONTACT : a r + PEAU du centre de la vesicule, pas au centre. */
    for (const v of co.ves) {
      if (v.etat !== 1 || etats.get(v) === 1) continue;
      const sA = co.membrane.sDepuisAge(v.am);
      const vA = v.cotem * hy.W(sA);
      const d = Math.hypot(sA - v.s, vA - v.v);
      pire = Math.max(pire, Math.abs(d - (v.r + 0.14)) / (v.r + 0.14));
      ancres++;
    }

    /* (b) les zones ne doivent jamais se chevaucher : la ligne de membrane
           est une section, elle est univoque. */
    const z = zonesFusion(co.ves, DUREE_FUSION);
    fenetres += co.ves.reduce((n, v) => n + (v.etat === 1 ? 1 : 0), 0);
    groupes += z.length;
    for (let i = 1; i < z.length; i++) {
      if (z[i].w0 - z[i].hw < z[i - 1].w0 + z[i - 1].hw - 1e-9) chevauche++;
    }
    t += dt;
  }

  dire(ancres > 60 && pire < 0.30 && chevauche === 0,
    'l ancrage est le point de contact, et deux livraisons voisines n en font qu une',
    `${ancres} ancrages, ecart maximal au point de contact ${(pire * 100).toFixed(1)} % du rayon ; `
    + `${fenetres} fusions-images regroupees en ${groupes} poches, ${chevauche} chevauchement`);
}

/* 12. une branche n'est pas un second objet : la silhouette est l'UNION */
{
  const W = 240, H = 240;

  /* Mere droite, cadrage centre sur la jonction. */
  const mere = new Hyphe({ graine: 5, th: 0 });
  for (let i = 0; i < 900; i++) mere.avancer(0.02, 1 / 60);

  let composantes = 0, conge = 0, congeLoin = 0, fuite = 0, etapes = 0;
  let aNaissance = 0;
  const pile = new Int32Array(W * H);

  for (const [pousse, cote, deg] of [[0, 1, 70], [0, -1, 84], [0, 1, 48],
                                    [1.5, 1, 70], [5, -1, 84], [14, 1, 70], [28, 1, 60]]) {
    const br = brancherSur(mere, { s: 11, cote, angle: deg * Math.PI / 180, graine: 2 });
    const bx = br.x, by = br.y;
    for (let i = 0; i < Math.round(pousse / 0.02); i++) br.avancer(0.02, 1 / 60);
    /* Une Scene NEUVE par cas : hors de sa boite, un champ garde l'image
       precedente, et deux cadrages differents ne sont pas comparables. */
    const sc = new Scene(null);
    sc.alloc(W, H);
    sc.pxUm = 7.5;
    sc.cam.x = bx; sc.cam.y = by;

    const tiges = [{ hy: mere }, { hy: br }];
    sc.portee = 30;
    for (let i = 0; i < 2; i++) {
      const f = sc.champ(i); f.actif = true;
      sc.contourEcran(tiges[i].hy, f);
      sc.bandeDistance(f);
      sc.remplirMasque(f);
    }
    sc.unir(2);
    const m = sc.mask, m0 = sc.champs[0].mask, m1 = sc.champs[1].mask;

    /* (a) UN seul morceau. Deux morceaux = une branche qui flotte a cote de
           sa mere, exactement le defaut qui a coule le prototype. */
    const vu = new Uint8Array(W * H);
    let n = 0, depart = -1;
    for (let o = 0; o < W * H; o++) if (m[o]) { n++; if (depart < 0) depart = o; }
    let atteint = 0, sp = 0;
    if (depart >= 0) { pile[sp++] = depart; vu[depart] = 1; }
    while (sp > 0) {
      const o = pile[--sp]; atteint++;
      const x = o % W, y = (o / W) | 0;
      if (x > 0 && m[o - 1] && !vu[o - 1]) { vu[o - 1] = 1; pile[sp++] = o - 1; }
      if (x < W - 1 && m[o + 1] && !vu[o + 1]) { vu[o + 1] = 1; pile[sp++] = o + 1; }
      if (y > 0 && m[o - W] && !vu[o - W]) { vu[o - W] = 1; pile[sp++] = o - W; }
      if (y < H - 1 && m[o + W] && !vu[o + W]) { vu[o + W] = 1; pile[sp++] = o + W; }
    }
    if (atteint !== n) composantes++;

    /* (b) le conge : des pixels DANS l'union mais dans aucun des deux tubes.
           C'est l'evasement concave de la base, et il ne doit exister que
           la. 9 um : le rayon de la mere (5,5) plus le conge (2,5), plus
           une marge. Au-dela il n'y a rien a raccorder. */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = y * W + x;
      if (!m[o] || m0[o] || m1[o]) continue;
      conge++;
      const dx = (x - W / 2) / sc.pxUm, dy = (y - H / 2) / sc.pxUm;
      if (Math.hypot(dx, dy) > 9) congeLoin++;
    }

    /* (c) rien ne fuit : tout pixel de l'union est dans un tube ou a moins
           de k du bord de l'un d'eux (k = 0,55 um, le rayon du conge). */
    const k = Math.min(27, Math.max(4, 2.5 * sc.pxUm));
    for (let o = 0; o < W * H; o++) {
      if (!m[o] || m0[o] || m1[o]) continue;
      if (Math.min(sc.champs[0].dist[o], sc.champs[1].dist[o]) > k + 1) fuite++;
    }

    if (pousse === 0) {
      /* (d) a la naissance, le bourgeon est entierement dans sa mere : il ne
             doit RIEN ajouter a la silhouette, conge compris. Teste aux
             angles extremes, 48 et 84 deg — c'est au plus perpendiculaire
             que le cul du bourgeon s'enfonce le plus loin en travers. */
      let ajout = 0;
      for (let o = 0; o < W * H; o++) if (m[o] && !m0[o]) ajout++;
      aNaissance = Math.max(aNaissance, ajout);
    }
    etapes++;
  }

  dire(composantes === 0 && conge > 0 && congeLoin === 0 && fuite === 0 && aNaissance === 0,
    'une branche n est pas un second objet : la silhouette est l union des deux tubes',
    `${etapes} ages de branche : ${composantes} silhouette(s) en deux morceaux, `
    + `${conge} px de conge concave (dont ${congeLoin} a plus de 9 um de la jonction), `
    + `${fuite} px de fuite ; a la naissance le bourgeon ajoute ${aNaissance} px a la mere`);
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
