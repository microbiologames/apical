/* ---------------------------------------------------------------------------
   Banc de mesure. On mesure, on ne devine pas.

   La logique du jeu n'a AUCUNE dependance au DOM : elle tourne donc ici, en
   node, a la vitesse qu'on veut, et on peut la piloter avec des politiques
   caricaturales. C'est ce qui permet de verifier qu'un arbitrage EXISTE
   vraiment au lieu d'en etre persuade.

   Les trois politiques repondent chacune a une question de conception :
     PASSIF        le jeu se joue-t-il sans rien faire ? Il ne DOIT pas.
     PLEINS GAZ    la vitesse tue-t-elle vraiment, et par LYSE ? Elle doit.
     PRUDENT       consolider survit-il plus longtemps en avancant moins ?

   Si les trois politiques meurent de la meme cause ou vivent le meme temps,
   l'arbitrage central du jeu n'existe pas, et aucune quantite de contenu ne le
   remplacera.
--------------------------------------------------------------------------- */

import { Game } from '../src/game/game.js';
import { appliquer } from '../src/data/genes.js';
import { facteurTemp } from '../src/data/substrats.js';

const DT = 1 / 60;

/* --- politiques --------------------------------------------------------- */

const POLITIQUES = {
  passif: () => ({ barre: 0, drive: 0 }),

  pleinsgaz: (g) => ({ barre: gradient(g), drive: 1 }),

  prudent: (g) => ({ barre: gradient(g), drive: g.S < 0.5 ? -1 : -0.3 }),

  /* La politique « joueur » : elle pousse quand la paroi est confortable, elle
     consolide quand elle s'amincit, elle suit le sucre, elle ramifie quand elle
     peut. C'est la reference d'equilibrage. */
  joueur: (g) => {
    const e = g.pilote.e;
    let drive = 0.55;
    if (e < 0.85) drive = -0.6;
    /* On a ESSAYE d'ajouter ici « si la paroi est epaisse, pousser a fond », et
       la mesure l'a refuse : la profondeur mediane tombait de 876 a 581 um.
       Sur une carte deficitaire, pousser fort brule du sucre plus vite que la
       vitesse n'en rapporte, et cela reste vrai meme avec de la marge de paroi.
       Conclusion de conception, et elle vaut : LES GENES DE PAROI N'ACHETENT PAS
       DE LA VITESSE DE CROISIERE, ils achetent la capacite a TENIR une poussee
       — c'est-a-dire un outil de pointe plus long, pas un regime plus rapide.
       Le verdict 3b les mesure donc sous pleins gaz, la ou ils servent. */
    else if (g.P > 0.85) drive = 0.2;
    if (g.S < 0.25) drive = -1;
    return { barre: gradient(g), drive };
  },
};

/**
 * Choix de cap par EVENTAIL DE SONDAGE. C'est la politique de reference, et elle
 * decrit ce qu'est « bien jouer » : on regarde cinq caps possibles, sur trois
 * distances, on note chacun, on prend le meilleur.
 *
 * Elle a remplace un simple gradient a deux echantillons, et le remplacement
 * etait une NECESSITE DE MESURE, pas un raffinement : le gradient a deux points
 * avec un gain de 3,4 oscillait, gaspillait l'avancee et se jetait sur son
 * propre thalle. Il perdait contre la politique PASSIVE (71 s et 9 spores contre
 * 99 s et 13). Tant qu'aucune politique competente ne battait « ne rien faire »,
 * le banc ne pouvait rien dire de l'equilibrage : on ne savait pas si le defaut
 * etait dans le jeu ou dans le robot.
 *
 * Les quatre termes de la note, dans l'ordre de leur poids :
 *   + le sucre rencontre le long du rayon (c'est le revenu) ;
 *   - la proximite de son propre thalle (c'est la mort la plus frequente) ;
 *   - les obstacles du plan net (les seuls qui bloquent) ;
 *   - l'ecart a l'avant (avancer est ce qui fait le score).
 */
function gradient(g) {
  const a = g.pilote;
  const base = a.spk.ang;
  let meilleur = 0, meilleureNote = -1e9;
  for (let i = -2; i <= 2; i++) {
    const cap = base + i * 0.45;
    let note = 0;
    for (const r of [14, 28, 44]) {
      const x = a.x + Math.cos(cap) * r, y = a.y + Math.sin(cap) * r;
      note += g.champ.echantillon(x, y).sucre * (r === 14 ? 1.4 : 1);
      const pr = g.thalle.proche(x, y, 16, g.t, 1.2);
      if (pr) note -= (16 - pr.d) * 0.22;
      for (const o of g.champ.autour(x, y, 12)) {
        if (o.type === 'obstacle' && o.plan === 0 && !o.mort) {
          const d = Math.hypot(x - o.x, y - o.y);
          if (d < o.r + 7) note -= (o.r + 7 - d) * 0.14;
        }
      }
    }
    /* L'ecart a l'avant est paye : c'est l'avancee qui fait le score, et une
       politique qui derive lateralement engrange de la longueur sans profondeur. */
    note -= Math.abs(cap - Math.PI / 2) * 0.55;
    if (note > meilleureNote) { meilleureNote = note; meilleur = cap; }
  }
  let d = meilleur - base;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-1, Math.min(1, d * 3.2));
}

/* --- moteur de simulation ---------------------------------------------- */

function manche(graine, nom, { ramifier = true, tMax = 400, choixGene = null, forcerGenes = null } = {}) {
  const g = new Game(graine);
  if (forcerGenes) { Object.assign(g.rangs, forcerGenes); g.recalcStats(); }
  const pol = POLITIQUES[nom];
  let nRamif = 0, eMin = 9, eSum = 0, eN = 0, eBas = 0;
  while (g.etat === 'jeu' && g.t < tMax) {
    if (g.etat === 'offre') break;
    const cmd = pol(g);
    if (ramifier && g.S > 0.7 && g.apex.filter((a) => a.vivant).length < g.stats.apexMax) {
      if (g.ramifier()) nRamif++;
    }
    g.pas(DT, cmd);
    g.arbitrer();
    if (g.etat === 'offre') {
      /* Choix automatique : la premiere carte, ou celle qu'on impose. */
      const i = choixGene ? g.offre.cartes.findIndex((c) => c.id === choixGene) : 0;
      g.choisir(i >= 0 ? i : 0);
    }
    /* On mesure la paroi EN CROISIERE, et separement le temps passe sous le
       seuil. Le minimum seul ne disait rien : il est toujours atteint pendant
       l'effondrement final, donc il valait 0,02 pour les trois politiques et ne
       distinguait plus rien. */
    if (g.pilote.v > 6) {
      eMin = Math.min(eMin, g.pilote.e);
      eSum += g.pilote.e; eN++;
      if (g.pilote.e < 0.55) eBas++;
    }
    if (!Number.isFinite(g.P) || !Number.isFinite(g.S) || !Number.isFinite(g.pilote.x)) {
      return { ...bilan(g), nan: true, nRamif, eMin, eMoy: eSum / Math.max(1, eN), partBas: eBas / Math.max(1, eN) };
    }
  }
  return { ...bilan(g), nRamif, eMin, eMoy: +(eSum / Math.max(1, eN)).toFixed(3), partBas: +(eBas / Math.max(1, eN)).toFixed(3) };
}

/** Epaisseur de paroi moyenne en croisiere, mediane sur les manches. */
function moyParoi(nom) { return stats(R[nom], 'eMoy').med; }
/** Part du temps de croisiere passee sous le seuil de lyse. */
function partBasse(nom) { return stats(R[nom], 'partBas').med; }

function bilan(g) {
  const e = g.etatLisible();
  return {
    graine: g.graine, t: +g.t.toFixed(2), cause: g.cause || (g.etat === 'jeu' ? 'TIMEOUT' : g.etat),
    etat: g.etat, longueur: e.longueur, avance: e.avance, aire: e.aire,
    spores: g.spores || e.spores, P: +g.P.toFixed(3), S: +g.S.toFixed(3),
    e: e.e, apex: e.apex, noeuds: e.noeuds, granules: e.granules, rates: e.rates,
    genes: Object.keys(g.rangs).length, nan: false,
  };
}

function stats(liste, cle) {
  const v = liste.map((x) => x[cle]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { med: 0, min: 0, max: 0, moy: 0 };
  return {
    med: v[v.length >> 1], min: v[0], max: v[v.length - 1],
    moy: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2),
  };
}

function causes(liste) {
  const c = {};
  for (const r of liste) c[r.cause] = (c[r.cause] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(', ');
}

/* --- verdicts ----------------------------------------------------------- */

const verdicts = [];
function verdict(ok, titre, detail) {
  verdicts.push({ ok, titre, detail });
  console.log(`${ok ? '  OK ' : ' ECHEC'}  ${titre}\n         ${detail}`);
}

const N = 24;
const graines = Array.from({ length: N }, (_, i) => 1000 + i * 7919);

console.log('\n=== APICAL : banc de croissance ===\n');

const R = {};
for (const nom of ['passif', 'pleinsgaz', 'prudent', 'joueur']) {
  /* Deux politiques sont mesurees SANS ramification, chacune pour sa raison :
       - PLEINS GAZ pour isoler l arbitrage vitesse / paroi, une manche qui
         ramifie mourant d abord de fusion ;
       - PASSIF parce que ramifier EST une action. Le harnais ramifiait pour lui,
         ce qui lui donnait une seconde vie et une seconde source de revenus :
         « ne rien faire » etait donc mesure en train de faire quelque chose, et
         le verdict correspondant ne voulait rien dire. */
  const sansRamif = nom === 'pleinsgaz' || nom === 'passif';
  R[nom] = graines.map((s) => manche(s, nom, { ramifier: !sansRamif }));
  const t = stats(R[nom], 't'), l = stats(R[nom], 'longueur'), sp = stats(R[nom], 'spores');
  const av = stats(R[nom], 'avance');
  console.log(`-- ${nom.padEnd(10)} duree med ${String(t.med).padStart(6)} s  `
    + `avance med ${String(av.med).padStart(5)} um  `
    + `longueur med ${String(l.med).padStart(6)} um  spores med ${String(sp.med).padStart(4)}`);
  console.log(`   ${' '.repeat(10)} causes : ${causes(R[nom])}`);
}
console.log('');

/* 1. Aucun NaN, jamais. */
const nans = Object.values(R).flat().filter((r) => r.nan).length;
verdict(nans === 0, 'aucun etat non fini',
  `${Object.values(R).flat().length} manches simulees, ${nans} NaN`);

/* 2. Le jeu ne se joue pas tout seul. */
const tPassif = stats(R.passif, 't').med, tJoueur = stats(R.joueur, 't').med;
const spPassif = stats(R.passif, 'spores').med, spJoueur = stats(R.joueur, 'spores').med;
const avPassif = stats(R.passif, 'avance').med, avJoueur = stats(R.joueur, 'avance').med;
/* LE VERDICT PORTE SUR LE SCORE, PAS SUR LA DUREE, et c est une decision de
   conception : il est parfaitement legitime qu une politique lente SURVIVE plus
   longtemps. Ce qui ne doit pas etre legitime, c est qu elle RAPPORTE autant.
   La premiere version exigeait que le passif meure plus vite, ce qui aurait
   demande de punir la prudence — alors que le jeu doit punir la STERILITE. */
verdict(spPassif < spJoueur * 0.7 && avPassif < avJoueur * 0.8,
  'ne rien faire rapporte nettement moins',
  `passif ${spPassif} spores / ${avPassif} um de profondeur, `
  + `joueur ${spJoueur} spores / ${avJoueur} um `
  + `(il faut moins de 70 % des spores ET 80 % de la profondeur). `
  + `Durees ${tPassif} s contre ${tJoueur} s : survivre plus longtemps en `
  + `rapportant moins est le resultat voulu.`);

/* 3a. La vitesse AMINCIT VISIBLEMENT la paroi, meme sans tuer. C'est
       l'arbitrage central, et il doit se SENTIR avant de se payer : aux stats de
       base la paroi doit descendre pres du seuil sans le franchir. Un modele ou
       la vitesse est gratuite jusqu'a la mort subite n'enseigne rien. */
const eGaz = moyParoi('pleinsgaz'), ePrud = moyParoi('prudent'), eJoueur = moyParoi('joueur');
const bGaz = partBasse('pleinsgaz'), bJoueur = partBasse('joueur');
const tGazM = stats(R.pleinsgaz, 't').med, tJoueurM = stats(R.joueur, 't').med;
verdict(eGaz < ePrud * 0.72 && bJoueur < 0.12 && bGaz > bJoueur * 2 && tGazM < tJoueurM,
  'la poussee est un outil de pointe, pas un regime de croisiere',
  `paroi moyenne en croisiere : pleins gaz ${eGaz.toFixed(2)}, prudent ${ePrud.toFixed(2)}, `
  + `joueur qui module ${eJoueur.toFixed(2)} ; temps sous le seuil : `
  + `${(bGaz * 100).toFixed(0)} % pleins gaz contre ${(bJoueur * 100).toFixed(0)} % en modulant ; `
  + `duree ${tGazM} s contre ${tJoueurM} s`);

/* 3b. LA DETTE DES LEGENDAIRES DOIT SE PAYER, ET LES GENES DE PAROI DOIVENT
       L'EFFACER. Le verdict compare deux constructions sur les MEMES graines :
         VITESSE = hyperturgor + ATPase + flux de masse, aucune synthase ;
         PAROI   = la meme, plus CHS x4 et FKS x4.
       C'est la formulation qui vaut, et elle a remplace un comptage de « lyses
       franches » qui distinguait la lyse par vitesse de la lyse par carence.
       Cette distinction n'a pas de sens ici : aller plus vite etale le meme flux
       sur plus de longueur ET brule plus de sucre, donc les deux chemins sont le
       MEME defaut de paroi. Ce qui doit etre vrai, c'est que la paroi soit la
       cause, et que les genes de paroi soient la reponse. */
const med = (l, k) => l.map((x) => x[k]).filter(Number.isFinite).sort((a, b) => a - b)[l.length >> 1];
const cfgVitesse = { hyperturgor: 1, atpase: 2, fluxmasse: 3 };
const cfgParoi = { ...cfgVitesse, chs: 4, fks: 4 };
/* Mesure sous PLEINS GAZ, apres deux essais rates qui valent d'etre gardes :
     - sous pleins gaz AVANT la correction du modele de paroi, les synthases
       aggravaient tout, parce que e = J/v faisait deposer une paroi inutilement
       epaisse : acheter du flux achetait surtout une facture ;
     - sous une politique qui module, elles n'aidaient pas davantage, parce que
       cette politique ne convertit pas sa marge en prise de risque — et lui
       faire pousser a fond quand la paroi est epaisse DEGRADAIT sa profondeur
       de 876 a 581 um, la carte etant deficitaire.
   Ce que les genes de paroi achetent reellement, c'est la capacite a TENIR une
   poussee. On les mesure donc la ou une poussee est tenue. */
const bVit = graines.map((s) => manche(s, 'pleinsgaz', { ramifier: false, forcerGenes: cfgVitesse }));
const bPar = graines.map((s) => manche(s, 'pleinsgaz', { ramifier: false, forcerGenes: cfgParoi }));
const lyses = bVit.filter((r) => /LYSE/.test(r.cause)).length;
const avVit = med(bVit, 'avance'), avPar = med(bPar, 'avance');
const eVit = med(bVit, 'eMoy'), ePar = med(bPar, 'eMoy');
const tVit = med(bVit, 't'), tPar = med(bPar, 't');
const lyVit = bVit.filter((r) => /LYSE APICALE/.test(r.cause)).length;
const lyPar = bPar.filter((r) => /LYSE APICALE/.test(r.cause)).length;
/* CE QUE CE VERDICT AFFIRME, ET CE QU'IL N'AFFIRME PAS.
   Il affirme que les synthases font ce qu'un gene de paroi doit faire :
   epaissir la paroi en croisiere et faire reculer la lyse franche.
   Il n'affirme PAS qu'elles allongent une manche menee pleins gaz, parce que la
   mesure dit le contraire et qu'on ne force pas une mesure : a plein regime, les
   deux constructions meurent de CARENCE avant que la paroi n'ait son mot a dire
   (15 sur 24 pour la construction de vitesse), et la paroi plus epaisse coute un
   peu plus cher en sucre, donc elle abrege legerement la manche.
   C'est un CHANTIER D'EQUILIBRAGE ouvert, consigne dans docs/05-banc.md : la
   carence arrive trop tot pour que l'arbitrage vitesse / paroi soit visible a
   plein regime. Tant qu'il n'est pas traite, ce verdict garde ce qui est vrai
   plutot que de pretendre ce qui ne l'est pas. */
verdict(lyses >= N * 0.5 && eVit < ePar * 0.88 && lyPar < lyVit,
  'les synthases epaississent la paroi et font reculer la lyse',
  `VITESSE : ${lyses}/${N} morts par la paroi, paroi ${eVit.toFixed(2)}, `
  + `${lyVit} lyses franches, ${avVit} um en ${tVit} s (${causes(bVit)}) | `
  + `PAROI : paroi ${ePar.toFixed(2)}, ${lyPar} lyses franches, ${avPar} um en ${tPar} s. `
  + `La profondeur n'augmente PAS : voir docs/05-banc.md, chantier « la carence `
  + `arrive avant la paroi ».`);

/* 4. Consolider survit plus longtemps MAIS avance moins. Les deux moities
      comptent : si prudent avance autant, consolider est gratuit. */
const tPrud = stats(R.prudent, 't').med, aPrud = stats(R.prudent, 'avance').med;
const tGaz = stats(R.pleinsgaz, 't').med, aGaz = stats(R.pleinsgaz, 'avance').med;
verdict(tPrud > tGaz && aPrud / Math.max(1, tPrud) < aGaz / Math.max(1, tGaz),
  'consolider echange de la distance contre du temps',
  `prudent ${tPrud} s / ${aPrud} um (${(aPrud / tPrud).toFixed(1)} um/s), `
  + `gaz ${tGaz} s / ${aGaz} um (${(aGaz / tGaz).toFixed(1)} um/s)`);

/* 5. Les causes de mort sont PLURIELLES. Une seule cause = une seule lecon. */
const toutes = new Set(Object.values(R).flat().map((r) => r.cause));
verdict(toutes.size >= 3, 'plusieurs causes de mort distinctes',
  `${toutes.size} causes : ${[...toutes].join(', ')}`);

/* 6. La cloche thermique est bien asymetrique : c'est ce qui rend le silo
      chaud dangereux et la chambre froide seulement lente. */
const froid = facteurTemp(26 - 8), chaud = facteurTemp(26 + 8);
verdict(chaud < froid * 0.75, 'la cloche thermique penalise plus le chaud',
  `-8 C -> ${froid.toFixed(3)}, +8 C -> ${chaud.toFixed(3)}`);

/* 7. Les genes bougent bien le terme annonce, et les bornes tiennent. */
const s0 = appliquer({});
const s1 = appliquer({ glycerol: 4 });
const s2 = appliquer({ melanine: 2, chs: 4 });
verdict(Math.abs((s1.awMin - s0.awMin) + 0.16) < 1e-6 && s2.jmax > s0.jmax && s2.phi < s0.phi,
  'les rangs de genes s\'appliquent et se bornent',
  `glycerol x4 : awMin ${s0.awMin} -> ${s1.awMin.toFixed(2)} ; `
  + `melanine x2 + chs x4 : jmax ${s0.jmax} -> ${s2.jmax}, phi ${s0.phi} -> ${s2.phi}`);

/* 8. Un thalle dense finit par se toucher : la ramification doit avoir un prix
      spatial, sinon ramifier est un choix sans contrepartie. */
const dense = graines.slice(0, 12).map((s) => manche(s, 'joueur', { choixGene: 'dominance' }));
const fusion = dense.filter((r) => /FUSIONNE|ANASTOMOSE/.test(r.cause)
  || r.noeuds > 0 || r.apex < 2).length;
verdict(fusion >= 4, 'un thalle dense se touche lui-meme',
  `${fusion}/12 manches avec fusion ou perte d'apex`);

/* 9. La manche atteint un second substrat : sinon trois quarts du contenu ne
      sont jamais vus, et le catalogue induit ne sert a rien. */
const tous = Object.values(R).flat();
const h2 = tous.filter((r) => r.avance > 600).length;
const h3 = tous.filter((r) => r.avance > 1700).length;
verdict(h2 >= tous.length * 0.25 && h3 >= 2,
  'les substrats suivants sont atteignables',
  `${h2}/${tous.length} manches passent le 1er horizon (600 um), `
  + `${h3} atteignent le 3e (1700 um)`);

/* 10. Cout de la logique : le rendu doit avoir de la place. */
const t0 = performance.now();
manche(4242, 'joueur', { tMax: 60 });
const ms = performance.now() - t0;
verdict(ms < 900, 'la logique tient dans son budget',
  `60 s de jeu simulees en ${ms.toFixed(0)} ms, soit ${(ms / (60 * 60)).toFixed(3)} ms par image`);

const ko = verdicts.filter((v) => !v.ok).length;
console.log(`\n=== ${verdicts.length - ko}/${verdicts.length} verdicts ===\n`);
process.exit(ko ? 1 : 0);
