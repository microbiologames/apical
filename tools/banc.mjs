/* Banc de mesure sans rendu. Un chiffre documente sans avoir ete mesure est
   un chiffre qu'on croit seulement avoir. */
import { Hyphe, distParoi, brancherSur } from '../src/sim/hyphe.js';
import { Contenu, S_MAX } from '../src/sim/contenu.js';
import { clamp, angleDelta, noise1 } from '../src/core/util.js';
import { omega, zonesFusion } from '../src/sim/membrane.js';
import { DUREE_FUSION } from '../src/sim/contenu.js';
import { Scene } from '../src/render/scene.js';
import { Thalle, V_MICRO, UCH, R_VIRAGE } from '../src/sim/thalle.js';
import { depuisMacro } from '../src/sim/hyphe.js';
import { Sporange, PHASES, R_SAC, R_COL, Z_TOTAL } from '../src/sim/sporange.js';
import { Germination, Spore, PHASES as PHASES_G, R_DORM, R_GONFLE } from '../src/sim/germination.js';
import { viserSporangiophore, PENTE, KZ, CAP_MAX } from '../src/sim/sporange.js';
import { pasMicro } from '../src/main.js';

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

/* 13. macro et micro poussent a la meme vitesse */
{
  /* LA contrainte de l'architecture a deux echelles. La vitesse macro est
     CALIBREE sur la micro, jamais choisie : l'apex micro pousse parce que
     ses vesicules fusionnent, c'est un resultat. Si le macro avait sa propre
     vitesse, la forme de la colonie dependrait de l'endroit qu'on regarde et
     zoomer changerait le jeu. */
  const dt = 1 / 60;

  /* (a) la micro, six manches, comme le verdict 1. */
  let umMin = 0;
  for (let g = 1; g <= 6; g++) {
    const m = manche({ duree: 60, graine: g });
    umMin += (m.hy.longueur / 60) * 60;
  }
  umMin /= 6;

  /* (b) une pointe macro SEULE, matrice neutralisee a 1 : c'est le meme
         regime que celui dans lequel la micro a ete mesuree. */
  const th = new Thalle({ graine: 3, vMicro: V_MICRO });
  th.matrice = () => 1;
  th.pointes.length = 1; th.axes.length = 1;
  const p = th.pointes[0];
  let t = 0;
  while (t < 60) { th.pas(0.25); t += 0.25; }
  const macro = (p.l / 60) * 60;

  /* (c) et le rayon de virage macro doit etre celui du banc, pas un chiffre
         d'auteur : omMax = v/R. */
  const rMacro = (V_MICRO / 60) / th.omMax;

  const ecart = Math.abs(macro - umMin) / umMin;
  const ecartR = Math.abs(rMacro - R_VIRAGE) / R_VIRAGE;
  dire(ecart < 0.05 && ecartR < 0.01 && Math.abs(V_MICRO - umMin) / umMin < 0.08,
    'macro et micro poussent a la meme vitesse',
    `micro ${umMin.toFixed(1)} um/min, macro ${macro.toFixed(1)} um/min `
    + `(ecart ${(ecart * 100).toFixed(1)} %) ; la constante de calibration vaut ${V_MICRO} ; `
    + `rayon de virage macro ${rMacro.toFixed(0)} um pour ${R_VIRAGE} mesures`);
}

/* 14. la colonie obeit a l'unite de croissance hyphale, et reste realiste */
{
  /* Un banc mesure des durees et des densites, pas une silhouette — mais il
     voit trois emballements qui ont chacun coute une iteration :
     la regle de Trinci qui tourne a vide, l'anastomose qui tue les branches
     a la naissance, et la densite qui depasse 100 % de couverture. */
  const th = new Thalle({ graine: 11, vMicro: V_MICRO });
  const jalons = [];
  for (const h of [1800, 7200, 14400]) {
    while (th.t < h) th.maj(2);
    const r = th.diametre / 2 / 1000;
    jalons.push({
      h, mm: th.total / 1000, pointes: th.vives,
      dens: th.total / 1000 / Math.max(Math.PI * r * r, 1e-6),
      uch: th.total / Math.max(th.vives, 1),
    });
  }
  const fin = jalons[jalons.length - 1];
  const ext = (th.diametre / 2) / (th.t / 60);      // um/min
  /* Une hyphe fait 11 um de large : au-dela de ~45 mm/mm2 le mycelium
     couvrirait la moitie du substrat, ce qu'aucune colonie ne fait au front. */
  const ok = fin.dens < 45 && fin.dens > 1 && th.vives > 30
          && th.branchements > 100 && th.anastomoses < th.branchements
          && ext > 5 && ext < V_MICRO;
  dire(ok, 'la colonie obeit a l unite de croissance hyphale',
    jalons.map((j) => `${(j.h / 3600).toFixed(0)} h : ${j.mm.toFixed(1)} mm, ${j.pointes} pointes, `
      + `${j.dens.toFixed(1)} mm/mm2`).join(' | ')
    + ` ; extension radiale ${ext.toFixed(1)} um/min (pointe : ${V_MICRO}), `
    + `${th.branchements} ramifications pour ${th.anastomoses} anastomoses, UCH cible ${UCH} um`);
}

/* 15. descendre sur une hyphe n'interrompt pas son axe */
{
  /* La contrainte n 1 du pont : zoomer n'instancie PAS une nouvelle hyphe.
     On attache un interieur a un axe qui existe deja et qui a une histoire.
     Trois choses a verifier, et aucune n'est visible a l'oeil. */
  const th = new Thalle({ graine: 17, vMicro: V_MICRO });
  while (th.t < 5400) th.maj(3);

  /* la pointe vivante qui a le plus long axe */
  let p = null;
  for (const q of th.pointes) if (q.vive && (!p || q.axe.n > p.axe.n)) p = q;
  const nAvant = p.axe.n, totalAvant = th.total;

  const hy = depuisMacro(p.axe.xs, p.axe.ys, p.axe.n, p.th, 210,
    { graine: 5, bout: [p.x, p.y] });

  /* (a) l'apex micro est exactement la pointe macro. */
  const dApex = Math.hypot(hy.x - p.x, hy.y - p.y);

  /* (b) l'axe fin PASSE par les points macro : la spline ne doit pas
         inventer une trajectoire, seulement l'arrondir. */
  let pire = 0, remonte = 0;
  for (let i = p.axe.n - 1; i > 0 && remonte < 180; i--) {
    remonte += Math.hypot(p.axe.xs[i] - p.axe.xs[i - 1], p.axe.ys[i] - p.axe.ys[i - 1]);
    const mx = p.axe.xs[i], my = p.axe.ys[i];
    let d = Infinity;
    for (let j = 0; j < hy.ax.length; j++) {
      const e = Math.hypot(hy.ax[j] - mx, hy.ay[j] - my);
      if (e < d) d = e;
    }
    if (d > pire) pire = d;
  }

  /* (c) la micro pilote, le macro enregistre : l'axe doit se prolonger sans
         saut au point de reprise. */
  const co = new Contenu(hy, { graine: 5 });
  p.micro = {};
  let t = 0, phi = 0;
  while (t < 90) {
    const da = pasMicro(hy, co, 1 / 60, phi, {});
    th.inscrire(p, hy.x, hy.y, hy.th, da);
    t += 1 / 60;
  }
  let saut = 0;
  for (let i = Math.max(1, nAvant - 2); i < p.axe.n; i++) {
    const d = Math.hypot(p.axe.xs[i] - p.axe.xs[i - 1], p.axe.ys[i] - p.axe.ys[i - 1]);
    saut = Math.max(saut, Math.abs(d - 6));
  }
  const pousse = th.total - totalAvant;

  dire(dApex < 1e-9 && pire < 0.25 && saut < 1.2 && p.axe.n > nAvant && pousse > 20,
    'descendre sur une hyphe n interrompt pas son axe',
    `axe macro ${nAvant} points ; re-echantillonne a ${hy.ax.length} points fins, `
    + `apex a ${dApex.toExponential(1)} um de la pointe, ecart maximal a l'axe macro `
    + `${(pire * 1000).toFixed(0)} nm ; apres 90 s pilotees par la micro, `
    + `${(pousse).toFixed(1)} um construits et ${p.axe.n - nAvant} points ajoutes, `
    + `ecart maximal au pas de 6 um : ${(saut * 1000).toFixed(0)} nm`);
}

/* 16. le sporocyste se remplit, se tend, et cede */
{
  /* Trois choses qu'on ne voit pas a l'oeil et qui ont chacune casse une
     iteration : le sac qui ne se remplit jamais assez pour rompre, les
     spores qui debordent de la paroi, et la rupture sans bombement. */
  const sp = new Sporange({ graine: 23 });
  const dt = 1 / 60;
  const vues = [], jalons = {};
  let debord = 0, bombMax = 0, fMax = 0, pRupture = -1, bombRupture = -1;
  /* L'ORDRE DE L'ONTOGENIE, et c'est lui qui etait faux : la pointe gonfle
     et DEVIENT le sporocyste, la cavite de clivage se creuse ensuite, et la
     columelle n'est que la paroi qui se forme du cote interne de cette
     cavite. On mesure donc que le sac est complet avant que la columelle
     n'existe, et non l'inverse. */
  let rColAvantSac = 0, sacALaCavite = 0, cavAvantCol = 0;

  while (sp.t < 260) {
    const avant = sp.phase;
    if (sp.phase === 'renflement' || sp.phase === 'cavite') rColAvantSac = Math.max(rColAvantSac, sp.rCol);
    if (sp.phase === 'columelle') cavAvantCol = Math.max(cavAvantCol, sp.cav);
    sp.maj(dt);
    if (sp.phase !== avant) {
      vues.push(sp.phase);
      jalons[sp.phase] = sp.t;
      if (sp.phase === 'cavite') sacALaCavite = sp.rSac;
      if (sp.phase === 'eclatement') { pRupture = sp.pression; bombRupture = bombMax; }
    }
    if (sp.rSac > 1) {
      let b = 0;
      for (let i = 0; i < sp.sac.n; i++) b = Math.max(b, sp.sac.off[i]);
      if (sp.rupture < 0) bombMax = Math.max(bombMax, b);
      fMax = Math.max(fMax, sp.remplissage || 0);
      /* ETANCHEITE : avant la rupture, aucune spore ne doit depasser la
         paroi. Tirees a 0,94 R, celles de 4,6 um debordaient de 10 % et on
         voyait une couronne accrochee a l'exterieur du sac. */
      if (sp.rupture < 0) {
        for (const s of sp.spores) {
          const d = Math.hypot(s.x, s.y, s.z) + s.r;
          if (d > sp.rSac * 1.02) debord++;
        }
      }
    }
  }

  const libres = sp.spores.filter((s) => s.libre).length;
  const ordre = ['montee', 'renflement', 'cavite', 'columelle', 'clivage', 'pression', 'eclatement', 'envol'];
  const bonOrdre = ordre.every((ph, i) => vues[i] === ph);

  dire(bonOrdre && debord === 0 && fMax > 0.50 && fMax < 0.75
       && bombRupture > 1.2 && pRupture >= 1 && libres > sp.spores.length * 0.5
       && sp.suivie !== null && jalons.eclatement < 140
       && rColAvantSac === 0 && sacALaCavite >= R_SAC * 0.98 && cavAvantCol > 0.9,
    'le sporocyste se remplit, se tend, et cede',
    `${vues.length} phases dans l'ordre ; le sac fait `
    + `${(sacALaCavite * 2).toFixed(0)} um quand la cavite se creuse, la columelle `
    + `mesure encore ${rColAvantSac.toFixed(1)} um a ce moment-la et la cavite est `
    + `faite a ${(cavAvantCol * 100).toFixed(0)} % quand elle commence ; `
    + `tige ${sp.z.toFixed(0)} um ; `
    + `remplissage maximal ${(fMax * 100).toFixed(0)} % (empilement physique : < 75) ; `
    + `${debord} spore-image hors du sac avant rupture ; la paroi s'est bombee de `
    + `${bombRupture.toFixed(1)} um avant de ceder a p = ${pRupture.toFixed(2)} `
    + `(t = ${jalons.eclatement.toFixed(0)} s) ; ${libres}/${sp.spores.length} spores liberees, `
    + `une suivie par la camera`);
}

/* 17. la spore gonfle avant de pointer, et le tube nait dedans */
{
  /* Quatre choses qu'on ne voit pas a l'oeil et qui ont chacune casse une
     iteration : le tube qui sort avant la fin du gonflement, l'amorce qui
     ressort par le flanc du corps, le bourgeon qui ajoute de la silhouette
     a sa naissance, et le tube germinatif qui ne pousse pas faute de place
     pour un Spitzenkorper. */
  const dt = 1 / 60;

  /* (a) douze graines : combien de tubes, et les sites sont-ils separes ? */
  let tubesMin = 99, tubesMax = 0, ecartMin = 999;
  for (let gr = 1; gr <= 12; gr++) {
    const g = new Germination({ graine: gr });
    tubesMin = Math.min(tubesMin, g.sites.length);
    tubesMax = Math.max(tubesMax, g.sites.length);
    for (let i = 0; i < g.sites.length; i++) {
      for (let j = i + 1; j < g.sites.length; j++) {
        const d = Math.abs(((g.sites[i].a - g.sites[j].a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        ecartMin = Math.min(ecartMin, d * 180 / Math.PI);
      }
    }
  }
  if (ecartMin > 900) ecartMin = 180;    // une seule spore n'a qu'un site

  /* (b) une germination complete : le gonflement precede-t-il le tube, et
         l'amorce tient-elle dans le corps ? */
  const g = new Germination({ graine: 11 });
  let rNaissance = 0, phaseNaissance = '', jeuMin = 1e9, rMax = 0;
  let vues = new Set();
  while (g.t < 210) {
    const avant = g.tubes.length;
    g.maj(dt, {});
    vues.add(g.phase);
    rMax = Math.max(rMax, g.spore.r);
    if (g.tubes.length > avant) {
      if (!rNaissance) { rNaissance = g.spore.r; phaseNaissance = g.phase; }
      /* JEU A LA PAROI : le conge de l'union ponte tout ecart inferieur a
         deux fois son rayon. A 0,9 um de conge il faut donc plus de 1,8 um
         de jeu, sinon la paroi de la spore est tiree vers le bourgeon a
         quatre-vingt-dix degres du tube. */
      const hy = g.tubes[g.tubes.length - 1].hy;
      for (let i = 0; i < hy.ax.length; i++) {
        const d = Math.hypot(hy.ax[i] - g.spore.x, hy.ay[i] - g.spore.y);
        const w = hy.W(hy.total - hy.al[i]);
        jeuMin = Math.min(jeuMin, g.spore.rayon(Math.atan2(hy.ay[i] - g.spore.y, hy.ax[i] - g.spore.x)) - (d + w));
      }
    }
  }
  const pr = g.principal;
  /* (c) le tube germinatif POUSSE : il a la place d'un Spitzenkorper. */
  const l0 = pr.hy.longueur;
  let t0 = g.t;
  while (g.t < t0 + 120) g.maj(dt, {});
  const vitesse = ((pr.hy.longueur - l0) / 120) * 60;

  /* (d) a la naissance, le bourgeon ne doit RIEN ajouter a la silhouette :
         c'est le meme test que pour la ramification, et le meme defaut a
         eviter — un tube qui apparait pose sur le corps au lieu d'en
         sortir. On rejoue une germination jusqu'au premier tube. */
  const W = 240, H = 240;
  const g2 = new Germination({ graine: 11 });
  while (g2.tubes.length === 0 && g2.t < 200) g2.maj(dt, {});
  const sc0 = new Scene(null);
  sc0.alloc(W, H); sc0.pxUm = 12; sc0.kConge = 0.9;
  sc0.cam.x = g2.spore.x; sc0.cam.y = g2.spore.y;
  const masque = (tiges) => {
    sc0.portee = tiges.length > 1 ? 30 : 7;
    for (let i = 0; i < tiges.length; i++) {
      const f = sc0.champ(i); f.actif = true;
      sc0.contourEcran(tiges[i].hy, f);
      sc0.bandeDistance(f);
      sc0.remplirMasque(f);
    }
    for (let i = tiges.length; i < sc0.champs.length; i++) sc0.champs[i].actif = false;
    sc0.unir(tiges.length);
    return Uint8Array.from(sc0.mask);
  };
  /* Deux Scenes NEUVES : hors de sa boite, un champ garde l'image
     precedente, et deux cadrages ne sont pas comparables. */
  const mSeule = masque([{ hy: g2.spore }]);
  const scA = new Scene(null);
  scA.alloc(W, H); scA.pxUm = 12; scA.kConge = 0.9;
  scA.cam.x = g2.spore.x; scA.cam.y = g2.spore.y;
  scA.portee = 30;
  const tiges = [{ hy: g2.spore }, { hy: g2.tubes[0].hy }];
  for (let i = 0; i < 2; i++) {
    const f = scA.champ(i); f.actif = true;
    scA.contourEcran(tiges[i].hy, f);
    scA.bandeDistance(f);
    scA.remplirMasque(f);
  }
  scA.unir(2);
  const mUnion = scA.mask;
  let ajout = 0, morceaux = 0;
  for (let o = 0; o < W * H; o++) if (mUnion[o] && !mSeule[o]) ajout++;
  /* Un seul morceau. */
  const vu = new Uint8Array(W * H), pile = new Int32Array(W * H);
  let n = 0, depart = -1;
  for (let o = 0; o < W * H; o++) if (mUnion[o]) { n++; if (depart < 0) depart = o; }
  let atteint = 0, sp = 0;
  if (depart >= 0) { pile[sp++] = depart; vu[depart] = 1; }
  while (sp > 0) {
    const o = pile[--sp]; atteint++;
    const x = o % W, y = (o / W) | 0;
    if (x > 0 && mUnion[o - 1] && !vu[o - 1]) { vu[o - 1] = 1; pile[sp++] = o - 1; }
    if (x < W - 1 && mUnion[o + 1] && !vu[o + 1]) { vu[o + 1] = 1; pile[sp++] = o + 1; }
    if (y > 0 && mUnion[o - W] && !vu[o - W]) { vu[o - W] = 1; pile[sp++] = o - W; }
    if (y < H - 1 && mUnion[o + W] && !vu[o + W]) { vu[o + W] = 1; pile[sp++] = o + W; }
  }
  if (atteint !== n) morceaux = 1;

  const ordre = PHASES_G.every((p) => vues.has(p));
  dire(ordre && rNaissance > R_GONFLE * 0.99 && phaseNaissance === 'emergence'
       && jeuMin > 1.8 && ajout === 0 && morceaux === 0 && vitesse > 8
       && tubesMin >= 1 && tubesMax <= 3 && ecartMin > 75,
    'la spore gonfle avant de pointer, et le tube nait dedans',
    `${vues.size} phases vues ; la spore passe de ${R_DORM} a ${rMax.toFixed(1)} um de rayon `
    + `(x${(rMax / R_DORM).toFixed(2)}) et le premier tube nait a ${rNaissance.toFixed(1)} um, `
    + `en phase « ${phaseNaissance} » ; l'amorce garde ${jeuMin.toFixed(2)} um de jeu a la paroi `
    + `(conge 0,9 um, il en faut 1,8) ; a la naissance le bourgeon ajoute ${ajout} px a la `
    + `silhouette, qui est en ${morceaux + 1} morceau ; le tube pousse a ${vitesse.toFixed(1)} um/min ; `
    + `sur 12 spores, ${tubesMin} a ${tubesMax} tubes, sites separes d'au moins `
    + `${ecartMin.toFixed(0)} degres`);
}

/* 18. le cycle ne coupe pas l'organisme : on greffe, on monte, on redescend,
      et le sporocyste reprend la branche au degre pres */
{
  /* Trois soudures, et chacune peut casser sans qu'on la voie : le germe
     qui devient colonie, la pointe macro sur laquelle on redescend, et la
     branche que le sporangiophore reprend. La troisieme est la seule qu'on
     regarde vraiment — c'est un raccord de direction, et un fondu ne
     rattrape pas une direction. */
  const dt = 1 / 60;

  /* (a) LA GREFFE. Le thalle doit repartir des axes du germe, pas de zero. */
  const g = new Germination({ graine: 11 });
  while (g.tubes.length === 0 || g.principal.hy.longueur < 30) g.maj(dt, {});
  const germes = [], apex = [];
  let longMicro = 0;
  for (const tg of g.tubes) {
    const hy = tg.hy, pts = [];
    for (let i = 0; i < hy.ax.length; i++) pts.push([hy.ax[i], hy.ay[i]]);
    pts.push([hy.x, hy.y]);
    germes.push({ pts, th: hy.th });
    apex.push([hy.x, hy.y]);
    for (let i = 1; i < pts.length; i++) longMicro += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const th = new Thalle({ graine: 5, vMicro: V_MICRO, germes });
  let dApex = 0;
  for (let i = 0; i < th.pointes.length; i++) {
    dApex = Math.max(dApex, Math.hypot(th.pointes[i].x - apex[i][0], th.pointes[i].y - apex[i][1]));
  }
  const ecartLong = Math.abs(th.total - longMicro);

  /* (b) ON MONTE. La colonie pousse deux heures, puis on redescend sur la
         pointe qui offre un flanc vers le haut. */
  while (th.t < 1.8 * 3600) th.maj(1);
  let best = null, bd = 1e9, visee = null;
  for (const p of th.pointes) {
    if (!p.vive || p.axe.n < 6) continue;
    const v = viserSporangiophore(p.th);
    const score = v.residu * 1000 - Math.hypot(p.x, p.y) * 0.001;
    if (score < bd) { bd = score; best = p; visee = v; }
  }
  const hy = depuisMacro(best.axe.xs, best.axe.ys, best.axe.n, best.th, 210, { bout: [best.x, best.y] });
  const dDescente = Math.hypot(hy.x - best.x, hy.y - best.y);

  /* (c) LE RACCORD. On branche au cap vise, on laisse la branche sortir, et
         on demande au sporocyste de la reprendre : meme origine, meme cap
         image, meme longueur d'image. */
  const co = new Contenu(hy, { graine: 3 });
  let phi = 0;
  for (let i = 0; i < 60 * 20; i++) pasMicro(hy, co, dt, phi, {});
  const s = 12;
  const p = hy.atS(s, {});
  const br = brancherSur(hy, { s, cote: visee.cote, angle: visee.angle, graine: 4 });
  const coB = new Contenu(br, { graine: 4, sMax: Math.max(1, br.total - br.Lb - 0.4) });
  while (Math.hypot(br.x - p.x, br.y - p.y) < 17) {
    pasMicro(br, coB, dt, 0, {});
    coB.etendre(br.total - br.Lb - 0.4);
  }
  const capBranche = br.th;
  const L = Math.hypot(br.x - p.x, br.y - p.y);
  /* Origine reculee le long du cap pour que l'apex tombe juste : c'est ce
     que fait le cycle, et c'est ce qu'on mesure. */
  const ox = br.x - Math.cos(visee.cap) * L, oy = br.y - Math.sin(visee.cap) * L;
  const dOrigine = Math.hypot(ox - p.x, oy - p.y);
  const sp = new Sporange({ graine: 9, x: ox, y: oy, th: Math.atan2(p.ty, p.tx),
                            capImage: visee.cap, z0: L / PENTE });
  const q = sp.pointe;
  /* La direction et la longueur telles qu'on les VOIT : la projection
     oblique remonte l'image de KZ par micrometre de z, il faut donc la
     retirer pour comparer a la branche, qui est a z = 0. */
  const capTige = Math.atan2(q.y - oy - KZ * q.z, q.x - ox);
  const Ltige = Math.hypot(q.x - ox, q.y - oy - KZ * q.z);
  const dCap = Math.abs(((capTige - capBranche + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
  /* Ce qu'on regarde vraiment : de combien la POINTE saute au raccord. */
  const dApexRaccord = Math.hypot(q.x - br.x, q.y - br.y - KZ * q.z);
  const dL = Math.abs(Ltige - L);

  /* (d) et la visee tient sur TOUTES les orientations de mere possibles ? */
  let pireResidu = 0;
  for (let d = 0; d < 360; d += 3) {
    pireResidu = Math.max(pireResidu, viserSporangiophore(d * Math.PI / 180).residu);
  }

  dire(dApex < 1e-9 && ecartLong < 7 && dDescente < 1e-6
       && visee.residu < 1e-9 && dCap < 1.0 && dApexRaccord < 0.05 && dL < 0.05
       && dOrigine < 2.5 && pireResidu < 0.95,
    'le cycle ne coupe pas l organisme, et le sporocyste reprend la branche',
    `greffe : ${germes.length} germes, apex a ${dApex.toExponential(1)} um de la pointe macro, `
    + `${ecartLong.toFixed(1)} um d'ecart entre ce que la micro avait construit et ce que le `
    + `macro inscrit (pas de 6 um) ; `
    + `apres ${(th.t / 3600).toFixed(1)} h la colonie fait ${(th.total / 1000).toFixed(0)} mm et `
    + `${th.pointes.filter((x) => x.vive).length} pointes, on redescend sur une pointe a `
    + `${dDescente.toExponential(1)} um, residu de visee ${(visee.residu * 180 / Math.PI).toFixed(1)} deg ; `
    + `la branche sort a ${(capBranche * 180 / Math.PI).toFixed(1)} deg sur ${L.toFixed(1)} um, `
    + `la tige repart a ${(capTige * 180 / Math.PI).toFixed(1)} deg sur ${Ltige.toFixed(1)} um `
    + `(ecart ${dCap.toFixed(2)} deg, la pointe saute de ${(dApexRaccord * 1000).toFixed(0)} nm, `
    + `origine reculee de ${dOrigine.toFixed(2)} um) ; `
    + `residu maximal sur 120 orientations de mere : ${(pireResidu * 180 / Math.PI).toFixed(0)} deg`);
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
