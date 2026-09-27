/* ---------------------------------------------------------------------------
   Expression genique : le catalogue d'ameliorations.

   On ne parle pas d'evolution mais d'EXPRESSION. Le genome est deja la depuis
   la spore ; ce que la manche debloque, c'est la transcription d'un gene que
   le milieu vient d'induire. C'est vrai — une amylase ne s'exprime que devant
   de l'amidon, une pompe d'efflux que devant un azole — et ca justifie
   exactement la mecanique de roguelite : les cartes proposees DEPENDENT du
   substrat traverse.

   TROIS REGLES DE CONCEPTION, tenues par tout le catalogue :

   1. UN GENE TOUCHE UN TERME DE L'EQUATION, et le joueur peut le voir bouger.
      Pas de « +5 % de tout » : un gene qui ne fait pas bouger une jauge
      visible n'existe pas pour le joueur, donc il n'existe pas.

   2. UN GENE SE VOIT SUR LE CORPS. C'est l'heritage direct de Cell Dungeon :
      une paroi epaissie est plus large a l'ecran, la melanine fonce l'hyphe,
      un flux vesiculaire double rend le Spitzenkorper deux fois plus brillant.
      Le champ de microscope EST la fiche de personnage.

   3. LES MEILLEURS GENES SONT DES DETTES. Un gene qui accelere sans rien
      coûter rendrait la manche monotone. Les legendaires ouvrent un plafond
      ET creusent une vulnerabilite, parce que c'est ce qui fait que la partie
      devient difficile a jouer AU MOMENT OU ON DEVIENT PUISSANT.
--------------------------------------------------------------------------- */

/**
 * Statistiques de depart.
 *
 * Elles sont les COEFFICIENTS DE L'EQUATION DE CROISSANCE, pas des points de
 * personnage : `phi` et `yseuil` sont l'extensibilite et le seuil de fluage de
 * la loi de Lockhart v = Phi x (P - Y), utilisee telle quelle pour les cellules
 * a croissance apicale. Voir docs/01-croissance-apicale.md.
 */
export const BASE = {
  phi: 46,            // extensibilite de paroi, px/s par unite de turgor
  yseuil: 0.28,       // seuil de fluage : sous ce turgor, la paroi ne cede pas
  jmax: 26,           // flux vesiculaire maximal, materiau de paroi par seconde
  kEau: 0.85,         // debit d'absorption d'eau
  awMin: 0.88,        // aw sous laquelle on ne prend plus d'eau
  pmax: 1.0,          // plafond de turgor
  /* 0,55 et non 1,9. CETTE LIGNE A DEJA ETE CORRIGEE UNE FOIS, ET LE
     REMPLACEMENT AVAIT ECHOUE EN SILENCE : la valeur est restee a 1,9 pendant
     deux passes entieres, pendant lesquelles le rayon de braquage a ete
     annonce a 57 um alors qu'il valait 17 um — exactement l'epingle a cheveux
     que la correction pretendait supprimer, et que l'auteur avait signalee.
     Aucun des onze verdicts ne mesurait cette grandeur : c'est pour cela que le
     banc mesure desormais le RAYON DE BRAQUAGE. Un chiffre qu'on documente sans
     le mesurer est un chiffre qu'on croit avoir. */
  agilite: 0.55,      // facteur de courbure du depot vesiculaire
  spkDist: 6,         // px : distance Spitzenkorper - apex. Petit = tourne court
  kSucre: 1.0,        // rendement d'absorption du sucre
  rayonAbs: 9,        // px : rayon de la zone subapicale absorbante
  apexMax: 4,         // apex simultanes. Un thalle EST ramifie : voir UCH
  coutBranche: 0.30,  // sucre par ramification
  maintenance: 0.030, // sucre/s brule a l'entretien
  integrite: 0.55,    // reparation de paroi par seconde
  eNom: 1.25,         // epaisseur de paroi VISEE en croisiere
  eMax: 1.6,          // epaisseur maximale, atteinte en consolidant
  spores: 1,          // rendement de sporulation
  autotropisme: 0,    // px : portee a laquelle on SENT son propre thalle
  tempDec: 0,         // decalage des points cardinaux, en degres
  autoVit: 0.55,      // fraction de vitesse d'un apex autonome
  detox: { azole: 1, echino: 1, polyene: 1, sorbate: 1 },
  hydrolases: {},     // amylase, cellulase, lipase, protease
};

/* Rarete -> poids de tirage. Les legendaires restent rares MAIS ne sont
   jamais absentes : c'est la promesse qui fait relancer une manche. */
export const POIDS = {
  commune: 100, peucommune: 52, rare: 24, epique: 10, legendaire: 3.2,
};

/**
 * Le catalogue.
 *
 * `famille` sert au tirage : on evite de proposer trois genes de la meme
 * famille dans une meme main, sinon un choix a trois n'en est plus un.
 * `induit` liste les substrats qui DOUBLENT le poids du gene : c'est
 * l'induction, et c'est ce qui fait qu'un substrat se joue differemment.
 * `rang` est le nombre de fois ou le gene peut sortir (surexpression).
 */
export const GENES = [
  /* --- FAMILLE PAROI : la chitine et le glucane ------------------------- */
  {
    id: 'chs', nom: 'Chitine synthase CHS3', famille: 'paroi', rarete: 'commune', rang: 4,
    desc: 'La paroi ne commence a s amincir qu a plus haute vitesse. Ne coute rien en croisiere.',
    fondement: 'Les chitine synthases deposent la chitine de la paroi a l apex. Leur nombre fixe le debit maximal de construction.',
    effet: { jmax: 4.5 },
  },
  {
    id: 'fks', nom: 'Glucane synthase FKS1', famille: 'paroi', rarete: 'commune', rang: 4,
    desc: 'La paroi resiste mieux au turgor : la lyse apicale arrive plus tard.',
    fondement: 'FKS1 synthetise le beta-1,3-glucane, l armature de la paroi. C est la cible des echinocandines, qui font eclater les apex.',
    effet: { integrite: 0.22 },
  },
  {
    id: 'hydrophobine', nom: 'Hydrophobine', famille: 'paroi', rarete: 'peucommune', rang: 2,
    desc: 'Enduit la paroi : moins de fuite de turgor, et +18 % de spores encaissees.',
    fondement: 'Les hydrophobines forment un film amphiphile a la surface des hyphes aeriennes ; sans elles, pas de conidiophore qui tienne.',
    effet: { integrite: 0.10, spores: 0.18 },
  },
  {
    id: 'melanine', nom: 'Melanine DHN', famille: 'paroi', rarete: 'rare', rang: 2,
    desc: 'Hyphe brunie : resiste aux antifongiques et a la chaleur, mais alourdit la paroi (-6 % de vitesse).',
    fondement: 'La melanine dihydroxynaphtalene blinde la paroi, pare les radicaux et le stress thermique. Elle est ce qui rend Aspergillus niger noir.',
    effet: { detox: { azole: 0.35, echino: 0.2, polyene: 0.2, sorbate: 0.2 }, tempDec: 2.5, phi: -3 },
  },

  /* --- FAMILLE TURGOR : la pompe qui pousse ---------------------------- */
  {
    id: 'glycerol', nom: 'Glycerol-3-P deshydrogenase', famille: 'turgor', rarete: 'commune', rang: 4,
    desc: 'Osmolyte de reserve : on descend de 0,04 d aw a chaque rang.',
    fondement: 'Le glycerol est LE solute compatible des moisissures. Xeromyces bisporus en accumule tant qu il germe a aw 0,61.',
    effet: { awMin: -0.04 },
    induit: ['confiture', 'grain'],
  },
  {
    id: 'hog', nom: 'Voie HOG1', famille: 'turgor', rarete: 'peucommune', rang: 3,
    desc: 'Reponse osmotique rapide : l absorption d eau monte de 22 %.',
    fondement: 'La cascade MAP kinase HOG declenche la synthese d osmolytes des que la pression externe change. C est le capteur, pas le solute.',
    effet: { kEau: 0.22 },
    induit: ['confiture'],
  },
  {
    id: 'aquaporine', nom: 'Aquaporine', famille: 'turgor', rarete: 'commune', rang: 3,
    desc: 'Canal a eau : l absorption monte de 18 %, mais un polyene fuit plus vite.',
    fondement: 'Les aquaporines laissent passer l eau bien plus vite que la bicouche seule ; plus de canaux, plus de trous.',
    effet: { kEau: 0.18, detox: { polyene: -0.15 } },
  },
  {
    id: 'atpase', nom: 'H+-ATPase PMA1', famille: 'turgor', rarete: 'rare', rang: 2,
    desc: 'Plafond de turgor +0,14. La poussee devient vraiment une poussee.',
    fondement: 'L ATPase membranaire etablit le gradient de protons qui alimente tous les transports actifs. Le turgor mesure de 0,2 a 1,5 MPa en depend directement.',
    effet: { pmax: 0.14, maintenance: 0.008 },
  },

  /* --- FAMILLE SPITZENKORPER : le centre de distribution --------------- */
  {
    id: 'myov', nom: 'Myosine V', famille: 'spk', rarete: 'commune', rang: 4,
    desc: 'Convoyage des vesicules jusqu a l apex : +4 de flux.',
    fondement: 'La myosine V tire les vesicules secretoires sur les cables d actine du dernier micrometre, la ou les microtubules s arretent.',
    effet: { jmax: 4 },
  },
  {
    id: 'exocyste', nom: 'Exocyste SEC6', famille: 'spk', rarete: 'peucommune', rang: 3,
    desc: 'Fusion des vesicules mieux ciblee : +5 de flux et +5 % de vitesse.',
    fondement: 'L exocyste arrime la vesicule au bon point de la membrane apicale. C est le dernier verrou avant l exocytose.',
    effet: { jmax: 5, phi: 2.2 },
  },
  {
    id: 'spkserre', nom: 'Spitzenkorper resserre', famille: 'spk', rarete: 'rare', rang: 2,
    desc: 'Le SPK colle a l apex : on tourne beaucoup plus court, au prix de 8 % de vitesse.',
    fondement: 'La forme de l hyphe est la trace geometrique du deplacement du Spitzenkorper. Un centre de distribution plus proche de l apex decrit une courbe plus serree.',
    effet: { spkDist: -2.2, phi: -3.8, agilite: 0.09 },
  },
  {
    id: 'pulse', nom: 'Canal calcique CCH1', famille: 'spk', rarete: 'peucommune', rang: 3,
    desc: 'Pulsations plus fortes : la croissance avance par a-coups plus francs, et chaque pulse absorbe plus.',
    fondement: 'Des bouffees de Ca2+ synchronisent l assemblage d actine et l exocytose : l extension apicale est reellement PAR PALIERS, pas continue.',
    effet: { kSucre: 0.15, pulse: 0.5 },
  },
  {
    id: 'kinesine', nom: 'Kinesine-1', famille: 'spk', rarete: 'rare', rang: 2,
    desc: 'Approvisionnement longue distance : les apex autonomes gagnent 20 % de vitesse.',
    fondement: 'Les kinesines portent les vesicules sur les microtubules depuis le Golgi subapical, sur des dizaines de micrometres.',
    effet: { autoVit: 0.20, jmax: 2 },
  },

  /* --- FAMILLE TROPISME : sentir ou aller ------------------------------ */
  {
    id: 'gpcr', nom: 'Recepteur GPR-4', famille: 'tropisme', rarete: 'commune', rang: 3,
    desc: 'Chimiotropisme : la camera se recule, on VOIT plus loin devant.',
    fondement: 'Les hyphes d Aspergillus nidulans font vraiment du chimiotropisme vers les nutriments et vers le pH, par recepteurs couples aux proteines G. Percevoir plus loin, c est litteralement ce que ce recepteur achete.',
    effet: { vue: 22, portee: 18 },
  },
  {
    id: 'agilite', nom: 'Polarisome CDC42', famille: 'tropisme', rarete: 'commune', rang: 4,
    desc: 'Barre plus vive : +18 % de vitesse de virage.',
    fondement: 'Le module Cdc42/Rac fixe et deplace le site de polarite. Deplacer ce site, c est litteralement tourner.',
    effet: { agilite: 0.10 },
  },
  {
    id: 'autotropisme', nom: 'Autotropisme negatif', famille: 'tropisme', rarete: 'peucommune', rang: 3,
    desc: 'On SENT ses propres hyphes a 22 px : elles s allument avant le contact.',
    fondement: 'Les hyphes d un meme thalle s evitent activement — c est ce qui fait un mycelium etale et non une pelote. Le signal est un gradient qu elles emettent et lisent.',
    effet: { autotropisme: 22 },
  },
  {
    id: 'thigmo', nom: 'Thigmotropisme', famille: 'tropisme', rarete: 'rare', rang: 2,
    desc: 'Le contact d un obstacle fait glisser l apex le long au lieu de l abimer.',
    fondement: 'Candida albicans devie sa croissance selon la topographie de la surface, par une reponse mecanosensible dependante du calcium externe.',
    effet: { glisse: 0.55 },
  },

  /* --- FAMILLE RAMIFICATION : faire des fronts ------------------------- */
  {
    id: 'nox', nom: 'NADPH oxydase NoxA', famille: 'ramification', rarete: 'peucommune', rang: 3,
    desc: 'Ramifier coute 30 % moins de sucre.',
    fondement: 'La production locale de radicaux par le complexe NOX est ce qui autorise l emergence d une branche ; c est elle qui leve la dominance apicale de proche en proche.',
    effet: { coutBranche: -0.09 },
  },
  {
    id: 'dominance', nom: 'Dominance apicale relachee', famille: 'ramification', rarete: 'epique', rang: 3,
    desc: '+1 apex simultane. Plus de fronts, plus de revenus, plus de murs a soi.',
    fondement: 'Un apex en croissance reprime l emergence de tips voisins par un gradient de Ca2+ et de radicaux. Relacher cette repression, c est ramifier dense.',
    effet: { apexMax: 1, maintenance: 0.012 },
  },
  {
    id: 'septine', nom: 'Septine AspB', famille: 'ramification', rarete: 'rare', rang: 2,
    desc: 'Les branches partent a angle plus ouvert et demarrent lancees.',
    fondement: 'Les septines marquent et cerclent le site de branchement avant toute excroissance : elles dessinent la porte avant qu on la franchisse.',
    effet: { brancheVit: 0.35, brancheAngle: 12 },
  },

  /* --- FAMILLE HYDROLASES : ouvrir des substrats ----------------------- */
  {
    id: 'amylase', nom: 'Alpha-amylase', famille: 'hydrolase', rarete: 'peucommune', rang: 1,
    desc: 'L AMIDON devient du sucre. Sans elle, le grain stocke est un desert.',
    fondement: 'Une moisissure de stockage secrete des amylases extracellulaires : elle ne peut absorber que des sucres simples, donc elle digere dehors avant d absorber.',
    effet: { hydrolases: { amylase: 1 } },
    induit: ['grain'],
  },
  {
    id: 'pectinase', nom: 'Polygalacturonase', famille: 'hydrolase', rarete: 'peucommune', rang: 2,
    desc: 'Dissout les parois vegetales : les obstacles du mesocarpe cedent.',
    fondement: 'Les pectinases de Botrytis ramollissent la lamelle moyenne des parois vegetales. C est l arme du pourrissement des fruits.',
    effet: { perce: 0.55 },
    induit: ['mesocarpe'],
  },
  {
    id: 'invertase', nom: 'Invertase', famille: 'hydrolase', rarete: 'commune', rang: 3,
    desc: '+20 % de rendement sur tout sucre absorbe.',
    fondement: 'L invertase coupe le saccharose en glucose et fructose, les seules formes que les transporteurs membranaires acceptent.',
    effet: { kSucre: 0.20 },
  },
  {
    id: 'transporteur', nom: 'Transporteur MstA', famille: 'hydrolase', rarete: 'commune', rang: 4,
    desc: 'Zone d absorption subapicale elargie : on ratisse plus large.',
    fondement: 'Les transporteurs de sucres a haute affinite sont concentres dans la region subapicale, juste derriere le cone de croissance.',
    effet: { rayonAbs: 2.6 },
  },

  /* --- FAMILLE TRANSPORT : la logistique du thalle --------------------- */
  {
    id: 'fluxmasse', nom: 'Flux de masse', famille: 'transport', rarete: 'rare', rang: 3,
    desc: 'Le thalle pousse le cytoplasme vers l avant : +12 % de vitesse par rang.',
    fondement: 'Chez Neurospora un flux de masse de 5 um/s a ete mesure dans des hyphes qui s allongent a 20 um/min : le corps entier alimente l apex.',
    effet: { phi: 5.5 },
  },
  {
    id: 'woronin', nom: 'Corps de Woronin', famille: 'transport', rarete: 'peucommune', rang: 2,
    desc: 'Une lyse apicale ne vide plus tout le thalle : on garde 40 % du turgor.',
    fondement: 'Ces corps peroxysomaux de 128 nm bouchent en quelques secondes un pore septal de 41 nm quand un compartiment voisin est perce. C est un clapet anti-retour.',
    effet: { woronin: 0.40 },
  },
  {
    id: 'anastomose', nom: 'Anastomose', famille: 'transport', rarete: 'epique', rang: 2,
    desc: 'Toucher son propre thalle ne detruit plus l apex : il FUSIONNE et cree un noeud (+ flux permanent).',
    fondement: 'La fusion entre hyphes du meme thalle est un vrai programme de developpement : elle transforme un arbre en reseau et redistribue le cytoplasme.',
    effet: { anastomose: 1 },
  },

  /* --- FAMILLE DETOX : survivre a la conservation ---------------------- */
  {
    id: 'abc', nom: 'Pompe ABC AtrB', famille: 'detox', rarete: 'commune', rang: 3,
    desc: 'Efflux large spectre : -30 % de charge pour tous les antifongiques.',
    fondement: 'La surexpression des transporteurs ABC et MFS rejette les xenobiotiques hors de la cellule. C est le premier mecanisme de resistance acquise, et le moins specifique.',
    effet: { detox: { azole: 0.3, echino: 0.3, polyene: 0.3, sorbate: 0.3 }, maintenance: 0.01 },
  },
  {
    id: 'cyp51', nom: 'CYP51A mute', famille: 'detox', rarete: 'rare', rang: 2,
    desc: 'Immunise a 70 % contre les AZOLES.',
    fondement: 'Les azoles bloquent la lanosterol 14-alpha-demethylase, donc la synthese d ergosterol. Une mutation de la cible les laisse passer sans se lier.',
    effet: { detox: { azole: 0.7 } },
    induit: ['grain'],
  },
  {
    id: 'sterol', nom: 'Remaniement des sterols', famille: 'detox', rarete: 'rare', rang: 2,
    desc: 'Membrane sans ergosterol libre : les POLYENES ne trouvent plus de cible.',
    fondement: 'Les polyenes ne tuent pas une enzyme : ils se lient a l ergosterol lui-meme et percent la membrane. Changer le sterol, c est retirer la serrure.',
    effet: { detox: { polyene: 0.65 } },
  },
  {
    id: 'pdr12', nom: 'Pompe a acides PDR12', famille: 'detox', rarete: 'peucommune', rang: 2,
    desc: 'Rejette les ACIDES FAIBLES : -55 % de surcout de maintenance.',
    fondement: 'Le sorbate traverse la membrane sous forme non dissociee puis se dissocie dedans : la cellule doit pomper les protons en continu, et c est ce pompage qui coute.',
    effet: { detox: { sorbate: 0.55 } },
    induit: ['confiture', 'mesocarpe'],
  },
  {
    id: 'hsp', nom: 'HSP30 / trehalose', famille: 'detox', rarete: 'peucommune', rang: 2,
    desc: 'Cardinales decalees de +3 degres : le silo chaud devient tenable.',
    fondement: 'Le trehalose et les chaperons stabilisent les proteines et les membranes au-dela de l optimum. C est la reponse thermique canonique des champignons.',
    effet: { tempDec: 3 },
    induit: ['grain'],
  },

  /* --- FAMILLE SPORULATION : encaisser ------------------------------- */
  {
    id: 'brla', nom: 'Regulateur brlA', famille: 'sporulation', rarete: 'peucommune', rang: 3,
    desc: '+30 % de spores encaissees par sporulation.',
    fondement: 'brlA est le premier verrou de la voie de conidiation ; sans lui l hyphe aerienne pousse sans jamais faire de tete conidienne.',
    effet: { spores: 0.30 },
  },
  {
    id: 'abaa', nom: 'Cascade abaA / wetA', famille: 'sporulation', rarete: 'rare', rang: 2,
    desc: 'Sporulation en urgence : en mourant on garde 55 % des spores au lieu de 25 %.',
    fondement: 'abaA et wetA achevent la maturation des conidies et leur donnent leurs reserves. Une conidie mure survit a la mort du thalle qui l a faite.',
    effet: { secours: 0.30 },
  },

  /* --- LES DETTES : legendaires a double tranchant --------------------- */
  {
    id: 'hyperturgor', nom: 'Hyperturgor', famille: 'turgor', rarete: 'legendaire', rang: 1,
    desc: 'Plafond de turgor +0,45 et seuil de fluage effondre : tres rapide. La paroi, elle, n a pas change.',
    fondement: 'La vitesse d extension suit v = Phi x (P - Y). Monter P sans monter la synthese de paroi est exactement ce que fait une echinocandine a l envers : l apex eclate.',
    effet: { pmax: 0.45, yseuil: -0.12, integrite: -0.2 },
  },
  {
    id: 'apexmultiple', nom: 'Croissance apicale multiple', famille: 'ramification', rarete: 'legendaire', rang: 1,
    desc: '+2 apex, autonomes plus rapides. Le thalle devient un reseau — et le reseau devient le danger.',
    fondement: 'La croissance totale d un mycelium est exponentielle parce que le nombre d apex croit, pas parce qu un apex accelere. C est la demonstration de Trinci.',
    effet: { apexMax: 2, autoVit: 0.25, maintenance: 0.03 },
  },
  {
    id: 'xerophile', nom: 'Conversion xerophile', famille: 'turgor', rarete: 'legendaire', rang: 1,
    desc: 'aw minimale a 0,62 : plus aucun substrat n est trop sec. Mais l eau abondante ne sert plus a rien (-18 % d absorption).',
    fondement: 'Xeromyces bisporus pousse jusqu a aw 0,61, record du vivant, et supporte mal le retour a l eau libre : un xerophile extreme est un specialiste, pas un generaliste.',
    effet: { awMin: -0.26, kEau: -0.18 },
  },
  {
    /* A REMPLACE « Genes mycoparasites », devenu sans objet le jour ou les fronts
       concurrents ont ete retires : un gene dont la cible n'existe plus est une
       carte morte dans le paquet, et une carte morte legendaire est pire encore.
       Le remplacant sert la meme famille (percevoir et exploiter le milieu) et
       la nouvelle source de difficulte, qui est le choix de trajectoire. */
    id: 'gradient', nom: 'Recepteurs de gradient', famille: 'tropisme', rarete: 'legendaire', rang: 1,
    desc: 'On voit BEAUCOUP plus loin, et les hyphes soeurs trouvent le sucre toutes seules.',
    fondement: 'Le chimiotropisme fongique passe par des recepteurs couples aux proteines G et des canaux calciques : un apex remonte reellement un gradient de nutriments. Un thalle qui le fait bien n explore pas, il choisit.',
    effet: { vue: 45, flair: 1.6, portee: 30 },
  },
];

/** Index par identifiant. */
export const GENE_PAR_ID = Object.fromEntries(GENES.map((g) => [g.id, g]));

/**
 * Replie les rangs exprimes sur les stats de base.
 *
 * `rangs` = { idGene: nombre }. Additif, jamais multiplicatif : deux rangs de
 * +4 de flux donnent +8, et pas +8,16. Le multiplicatif rend les derniers
 * rangs incomparables aux premiers et l equilibrage devient impossible a
 * raisonner de tete.
 */
export function appliquer(rangs) {
  const s = {
    ...BASE,
    detox: { ...BASE.detox },
    hydrolases: { ...BASE.hydrolases },
    portee: 0, glisse: 0, perce: 0, woronin: 0, anastomose: 0,
    secours: 0, pulse: 0, brancheVit: 0, brancheAngle: 0, flair: 0,
  };
  for (const [id, rang] of Object.entries(rangs || {})) {
    const g = GENE_PAR_ID[id];
    if (!g || rang <= 0) continue;
    const n = Math.min(rang, g.rang);
    for (const [k, v] of Object.entries(g.effet)) {
      if (k === 'detox') {
        for (const [dk, dv] of Object.entries(v)) s.detox[dk] += dv * n;
      } else if (k === 'hydrolases') {
        for (const hk of Object.keys(v)) s.hydrolases[hk] = 1;
      } else {
        s[k] = (s[k] || 0) + v * n;
      }
    }
  }
  /* Bornes de securite. Sans elles, quatre rangs de melanine annulaient la
     vitesse et la manche se figeait sans mourir : un blocage se lit comme un
     bug, jamais comme une difficulte. */
  s.phi = Math.max(12, s.phi);
  s.yseuil = Math.max(0.08, s.yseuil);
  s.spkDist = Math.max(2.2, s.spkDist);
  s.awMin = Math.max(0.55, s.awMin);
  s.integrite = Math.max(0.1, s.integrite);
  for (const k of Object.keys(s.detox)) s.detox[k] = Math.max(0.12, Math.min(3, s.detox[k]));
  return s;
}

/**
 * Tire une main de trois genes.
 *
 * Deux garde-fous, chacun paye par un defaut observe sur table :
 *   - jamais deux genes de la MEME FAMILLE dans une main : sinon la main se
 *     lit comme un seul choix a deux options, et le joueur a l impression
 *     d avoir moins de catalogue qu il n en a ;
 *   - le substrat courant DOUBLE le poids des genes qu il induit : c est ce
 *     qui donne a chaque substrat sa couleur de jeu, et c est la version
 *     jouable de l induction enzymatique.
 */
export function tirerMain(rng, rangs, substratId, taille = 3) {
  const dispo = GENES.filter((g) => (rangs[g.id] || 0) < g.rang);
  const main = [];
  const familles = new Set();
  for (let essai = 0; essai < 240 && main.length < taille; essai++) {
    const pool = dispo.filter((g) => !main.includes(g)
      && (!familles.has(g.famille) || essai > 140));
    if (!pool.length) break;
    let total = 0;
    const poids = pool.map((g) => {
      let p = POIDS[g.rarete] || 1;
      if (g.induit && g.induit.includes(substratId)) p *= 2;
      /* Un gene deja exprime reste tirable mais s efface : sans ce biais, les
         communes a quatre rangs monopolisaient les mains de fin de manche. */
      if (rangs[g.id]) p *= 0.55;
      total += p;
      return p;
    });
    let r = rng() * total;
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= poids[i];
      if (r <= 0) { pick = pool[i]; break; }
    }
    main.push(pick);
    familles.add(pick.famille);
  }
  return main;
}
