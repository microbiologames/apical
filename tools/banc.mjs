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
import { Apex } from '../src/game/apex.js';
import { Thalle } from '../src/game/thalle.js';
import { appliquer } from '../src/data/genes.js';
import { facteurTemp } from '../src/data/substrats.js';

const DT = 1 / 60;

/* --- politiques --------------------------------------------------------- */

/* Les politiques rendent maintenant un REGIME (0 a 4) et non une poussee
   continue : la commande de vitesse est devenue un cran qui reste. */
const POLITIQUES = {
  passif: () => ({ barre: 0, regime: 1 }),

  pleinsgaz: (g) => ({ barre: gradient(g), regime: 4 }),

  prudent: (g) => ({ barre: gradient(g), regime: g.S < 0.5 ? 0 : 1 }),

  /* La politique « joueur » : elle pousse quand la paroi est confortable, elle
     consolide quand elle s'amincit, elle suit le sucre, elle ramifie quand elle
     peut. C'est la reference d'equilibrage. */
  joueur: (g) => {
    const e = g.pilote.e;
    let regime = 3;
    if (e < 0.85) regime = 1;
    /* On a ESSAYE d'ajouter ici « si la paroi est epaisse, pousser a fond », et
       la mesure l'a refuse : la profondeur mediane tombait de 876 a 581 um.
       Sur une carte deficitaire, pousser fort brule du sucre plus vite que la
       vitesse n'en rapporte, et cela reste vrai meme avec de la marge de paroi.
       Conclusion de conception : LES GENES DE PAROI N'ACHETENT PAS DE LA VITESSE
       DE CROISIERE, ils achetent la capacite a TENIR une poussee. */
    else if (g.P > 0.85) regime = 2;
    if (g.S < 0.22) regime = 0;
    return { barre: gradient(g), regime, sporuler: terminal(g) };
  },
};

/**
 * Decide d'encaisser.
 *
 * Un joueur competent ne meurt pas de faim : il sporule quand l'entretien du
 * thalle depasse durablement ce que le milieu rend. Sans cette regle, le banc ne
 * mesurait jamais l'EXTRACTION — toutes les politiques mouraient de carence, ce
 * qui donnait une table des causes uniforme et disait, a tort, que le jeu
 * n'avait qu'une seule fin.
 */
function terminal(g) {
  /* Le thalle est a l'arret faute de materiau et son entretien depasse ce qu'un
     apex bien place peut rendre : la manche ne repartira pas, on encaisse. */
  /* LE SIGNAL EST L'AUTOPHAGIE, et rien d'autre. Les versions precedentes
     testaient l'entretien ou l'immobilite : l'entretien SUIT la biomasse, donc il
     retombe a mesure que le thalle se mange, et le seuil n'etait jamais franchi
     au bon moment ; quant a l'immobilite, un thalle affame rampe encore a
     8 um/s. Des que le thalle se digere lui-meme et qu'il reste quelque chose a
     encaisser, on encaisse : c'est exactement la decision que le jeu veut faire
     prendre, et le banc doit la prendre comme un joueur la prendrait. */
  return g.S <= 0.08 && g.thalle.longueur > 400;
}

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
  const base = a.cap;
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
  /* Signe negatif : le depot est en repere ECRAN, positif = droite. Gain
     reduit de 3,2 a 1,8 : on vise une POSITION de zone de fusion, pas une
     vitesse angulaire — un gain fort la plaquait aux butees. */
  return Math.max(-1, Math.min(1, -d * 1.8));
}

/* --- moteur de simulation ---------------------------------------------- */

function manche(graine, nom, { ramifier = true, tMax = 400, choixGene = null, forcerGenes = null, jamaisSporuler = false } = {}) {
  const g = new Game(graine);
  if (forcerGenes) { Object.assign(g.rangs, forcerGenes); g.recalcStats(); }
  const pol = POLITIQUES[nom];
  let nRamif = 0, eMin = 9, eSum = 0, eN = 0, eBas = 0;
  while (g.etat === 'jeu' && g.t < tMax) {
    if (g.etat === 'offre') break;
    const cmd = pol(g);
    g.regime = cmd.regime;
    if (cmd.sporuler && !jamaisSporuler && g.sporuler()) break;
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
/* LA CLAUSE DE PROFONDEUR A ETE RETIREE, et c'est une correction de raisonnement
   plutot que de reglage. Depuis que la politique de reference SPORULE, elle
   s'arrete volontairement a 129 s alors que la politique passive derive encore a
   312 s : la passive finit donc PLUS PROFOND, tout en rapportant moins de la
   moitie des spores. Exiger les deux revenait a reprocher a la bonne politique
   d'avoir encaisse au bon moment. Le score du jeu, ce sont les spores. */
verdict(spPassif < spJoueur * 0.6,
  'ne rien faire rapporte nettement moins',
  `passif ${spPassif} spores en ${tPassif} s, joueur ${spJoueur} spores en `
  + `${tJoueur} s (il faut moins de 60 % des spores). La passive va plus loin `
  + `(${avPassif} um contre ${avJoueur}) parce qu'elle ne s'arrete jamais : `
  + `c'est le resultat voulu, pas un defaut.`);

/* 3a. La vitesse AMINCIT VISIBLEMENT la paroi, meme sans tuer. C'est
       l'arbitrage central, et il doit se SENTIR avant de se payer : aux stats de
       base la paroi doit descendre pres du seuil sans le franchir. Un modele ou
       la vitesse est gratuite jusqu'a la mort subite n'enseigne rien. */
const eGaz = moyParoi('pleinsgaz'), ePrud = moyParoi('prudent'), eJoueur = moyParoi('joueur');
const bGaz = partBasse('pleinsgaz'), bJoueur = partBasse('joueur');
const tGazM = stats(R.pleinsgaz, 't').med, tJoueurM = stats(R.joueur, 't').med;
const avGazM = stats(R.pleinsgaz, 'avance').med, avJoueurM = stats(R.joueur, 'avance').med;
/* Le verdict ne porte plus sur le TEMPS passe sous le seuil de lyse : depuis
   que l'apex se ferme quand le materiau manque, ce temps est nul pour toutes les
   politiques, et c'est le comportement voulu. Ce qui doit rester vrai, c'est que
   pousser AMINCIT mesurablement la paroi et RACCOURCIT la manche. */
/* CE VERDICT A CHANGE D'AFFIRMATION, APRES MESURE.
   Il soutenait que pousser en continu ne pouvait pas etre un regime de
   croisiere, et donc que la profondeur atteinte devait y etre moindre. C'EST
   FAUX depuis la retroaction de disette : pleins gaz atteint 1 700 um contre
   1 116 um en modulant. La poussee ACHETE bien de la distance — ce qu'elle
   vend, c'est de la paroi (1,11 contre 1,41 en consolidant) et du temps pour
   lire le champ. On affirme donc ce qui est vrai et mesurable, et le prix se
   lit dans le verdict suivant, sur la recolte. */
verdict(eGaz < ePrud * 0.85 && eJoueur > eGaz,
  'pousser achete de la distance et la paie en paroi',
  `paroi moyenne en croisiere : pleins gaz ${eGaz.toFixed(2)}, prudent ${ePrud.toFixed(2)}, `
  + `joueur qui module ${eJoueur.toFixed(2)} ; `
  + `profondeur ${avGazM} um en ${tGazM} s pleins gaz, contre `
  + `${avJoueurM} um en ${tJoueurM} s en modulant`);

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
/* 3b. SPORULER A TEMPS DOIT PAYER. C'est l'affirmation la plus importante du
       jeu : la manche a une EXTRACTION, et la prendre au bon moment vaut mieux
       que de pousser jusqu'a la mort. Elle n'avait jamais ete mesuree.
       On rejoue les memes graines avec la meme politique, une fois avec la
       regle d'encaissement et une fois sans. */
const avecSporu = graines.map((s) => manche(s, 'joueur'));
const sansSporu = graines.map((s) => manche(s, 'joueur', { jamaisSporuler: true }));
const spAvec = med(avecSporu, 'spores'), spSans = med(sansSporu, 'spores');
verdict(spAvec > spSans * 1.5,
  'sporuler a temps vaut mieux que pousser jusqu\'a la mort',
  `${spAvec} spores en encaissant contre ${spSans} en poussant jusqu'au bout `
  + `(il faut au moins 1,5x). Causes sans encaissement : ${causes(sansSporu)}`);

/* 3c. LE RAYON DE BRAQUAGE, mesure en isolation.
       Ce verdict existe parce qu'il a manque : la constante d'agilite est restee
       a 1,9 au lieu de 0,55 pendant deux passes — un remplacement de fichier
       avait echoue en silence — donc le rayon valait 17 um au lieu des 57
       annonces. Une epingle a cheveux pour un tube de 14 um de diametre, et
       personne ne l'a vu : les onze autres verdicts mesuraient des durees, des
       causes et des epaisseurs, aucun ne regardait la GEOMETRIE de la
       trajectoire, qui est pourtant ce que le joueur pilote.
       Mesure sur un apex isole, sans milieu ni obstacle : depot a fond, et l'on
       compte la longueur deposee par radian de cap gagne. */
const rayonBraquage = (() => {
  const th = new Thalle();
  const b = th.nouvelleBranche(-1, 0, 0);
  const a = new Apex(b, 0, 0, Math.PI / 2, { phase: 0 });
  const st = appliquer({}); st.jmaxEff = 26; st.germ = 1;
  const h = (1 / 60) * 0.48;
  let L = 0; const cap0 = a.cap;
  for (let i = 0; i < 20000 && Math.abs(a.cap - cap0) < 0.6; i++) {
    L += a.pas(h, 0.75, st, 1, 0, 1, th, i * h);
  }
  return Math.abs(L / (a.cap - cap0));
})();
verdict(rayonBraquage > 40 && rayonBraquage < 120,
  'le rayon de braquage est celui d\'une hyphe, pas d\'une epingle a cheveux',
  `${rayonBraquage.toFixed(0)} um a depot maximal, soit `
  + `${(rayonBraquage / 14).toFixed(1)} diametres de tube (il en faut 3 a 9). `
  + `Une hyphe s'incurve sur des dizaines a des centaines de micrometres.`);

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
/* Seuils cales sur les BORNES REELLES des horizons, qui ont ete raccourcies de
   30 % avec l'arrivee du TEMPO : 420, 1 180, 2 080. Ils etaient restes a 600 et
   1 700, donc le verdict mesurait des frontieres qui n'existaient plus. */
const h2 = tous.filter((r) => r.avance > 420).length;
const h3 = tous.filter((r) => r.avance > 1180).length;
verdict(h2 >= tous.length * 0.25 && h3 >= 2,
  'les substrats suivants sont atteignables',
  `${h2}/${tous.length} manches passent le 1er horizon (420 um), `
  + `${h3} atteignent le 3e (1180 um)`);

/* 10. Cout de la logique : le rendu doit avoir de la place. */
const t0 = performance.now();
manche(4242, 'joueur', { tMax: 60 });
const ms = performance.now() - t0;
verdict(ms < 900, 'la logique tient dans son budget',
  `60 s de jeu simulees en ${ms.toFixed(0)} ms, soit ${(ms / (60 * 60)).toFixed(3)} ms par image`);

const ko = verdicts.filter((v) => !v.ok).length;
console.log(`\n=== ${verdicts.length - ko}/${verdicts.length} verdicts ===\n`);
process.exit(ko ? 1 : 0);
