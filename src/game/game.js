/* ---------------------------------------------------------------------------
   Le jeu : comptabilite globale du thalle, apex, concurrents, manche.

   DECISION STRUCTURANTE : LES RESSOURCES SONT GLOBALES, PAS PAR APEX.
   Un mycelium est un seul protoplaste : les pores septaux restent ouverts et un
   flux de masse de 5 um/s y a ete mesure. Il n y a donc qu un turgor et qu un
   stock de sucre pour tout le thalle, quel que soit le nombre d apex.

   Et c est la que se trouve la COURBE DE DIFFICULTE du jeu, sans qu il faille
   l ecrire nulle part : chaque apex supplementaire augmente les revenus (il
   absorbe) ET la depense (il consomme du volume et du materiau de paroi) ET
   l exposition (il ramasse la charge d antifongique) ET l encombrement (sa
   paroi est un mur de plus). Le joueur devient puissant en devenant fragile.
   C est exactement ce qu on veut d un roguelite : le jeu devient dur au moment
   ou la partie devient bonne, et il devient dur PAR LE FAIT DU JOUEUR.

   Ordre d un pas, et il compte :
     1. milieu echantillonne sous chaque apex
     2. croissance de chaque apex (geometrie, paroi, integrite)
     3. contacts : obstacles, thalle propre, concurrents, objets
     4. bilan des ressources (une seule fois, sur la somme)
     5. morts, transfert de dominance, paliers
--------------------------------------------------------------------------- */

import { clamp, lerp, mulberry32, TAU } from '../core/util.js';
import { appliquer, tirerMain } from '../data/genes.js';
import { AW_MIN_BASE, UCH } from '../data/substrats.js';
import { Champ } from './champ.js';
import { Thalle, distSeg } from './thalle.js';
import { Apex, CAP_MAX, AVANT, E_CRIT } from './apex.js';

/* --- constantes de bilan, toutes en unites par seconde -------------------- */
/* Volume a remplir par px d allongement : un tube de 5 um de diametre.
   Regle le prix de la vitesse en EAU. A 0,012, un apex a 20 px/s depense
   0,24 de turgor par seconde, soit les deux tiers de l absorption nominale :
   la poussee est donc toujours un decouvert, jamais un acquis. */
const COUT_VOLUME = 0.012;
/* Prix du materiau de paroi, en sucre par unite d epaisseur x px.
   Remarque qui a decide de la valeur : le produit e x v vaut jmaxEff des que
   l epaisseur n est plus plafonnee, donc au-dela de 16 px/s LE COUT DE PAROI NE
   DEPEND PLUS DE LA VITESSE. C est voulu et c est le coeur du modele : la
   vitesse ne coute pas du sucre, elle AMINCIT LA PAROI. A 0,0065 le plafond de
   depense vaut 0,169/s pour un flux nominal de 26. */
const COUT_PAROI = 0.0065;
/* Rendement d absorption du champ de sucre par apex.
   Cale au banc : a 0,42 le revenu valait 0,08/s contre 0,22/s de depense et les
   quatre politiques mouraient de carence en moins de cinq secondes. A 1,05 le
   point mort tombe sur un champ de sucre de 0,13.
   CALAGE EN DEUX TEMPS, LES DEUX MESURES VALENT D'ETRE GARDEES :
     - a 1,05 avec l'ancien seuil de plume, la carte etait BENEFIQUE en moyenne
       et aller tout droit sans rien faire etait l'optimum (243 s de survie
       contre 223 s pour une politique qui cherche a manger) ;
     - a 0,62 avec le nouveau seuil, elle etait deficitaire de 0,12/s sur la
       mediane et TOUTES les politiques mouraient de carence en 15 a 30 s.
   A 1,40, sur l'echelle de la pellicule : la mediane du champ rapporte 0,169/s
   contre 0,199/s de depense — un deficit LEGER, qui laisse une minute de marge
   sur le stock — et le p90 rapporte 0,585/s, soit trois fois le point mort. Une
   ligne droite s'appauvrit lentement, une trajectoire qui suit les plumes
   s'enrichit. C'est le rythme qu'on cherchait, et il tient a l'ecart entre la
   mediane et le p90 du champ, pas a son niveau absolu. */
const GAIN_SUCRE = 1.40;
/* Surcout de la poussee : la synthese d osmolytes est CARBONEE. C est ce qui
   relie les deux ressources au lieu de les laisser en parallele : pour aller
   vite il faut de l eau, et pour avoir de l eau il faut bruler du sucre. */
const COUT_POUSSEE = 0.055;
/* Fuite de turgor d un polyene, qui perce la membrane au lieu d inhiber. */
const FUITE_POLYENE = 0.35;
/**
 * ENTRETIEN PROPORTIONNEL A LA BIOMASSE, en sucre par seconde et par um de tube.
 *
 * C'est le terme qui donne au jeu sa fin, et il manquait. Le raisonnement, tire
 * de la mesure : revenus et depenses croissaient TOUS DEUX avec le nombre
 * d'apex — chaque apex absorbe son champ et paie sa paroi — donc ouvrir des
 * fronts etait neutre, et le stock de sucre restait colle a son plafond avec
 * trois apex. Un thalle qui grandit sans jamais que cela lui coute n'a aucune
 * raison de s'arreter, donc la sporulation n'a plus d'enjeu et le roguelite
 * perd son extraction.
 *
 * Un mycelium, lui, doit entretenir TOUT ce qu'il a construit : maintenir le
 * gradient de protons, renouveler les proteines, tenir le turgor sur des
 * milliers de micrometres de tube. La depense suit donc la biomasse et non le
 * nombre de pointes.
 *
 * A 0,00006 : 2 000 um de thalle coutent 0,12/s, 6 000 um en coutent 0,36/s —
 * l'ordre de grandeur du revenu de trois apex bien nourris. Le thalle atteint
 * donc son plafond de viabilite vers 6 000 a 9 000 um, et c'est la que la
 * question « continuer ou encaisser » se pose vraiment.
 */
const ENTRETIEN_PAR_UM = 0.00006;
/**
 * AUTOPHAGIE : sucre rendu par micrometre de thalle recycle.
 *
 * Un mycelium a court de carbone ne meurt pas tout de suite : il SE MANGE. Le
 * cytoplasme se retire des compartiments distaux, les parois y sont lysees, et
 * la matiere remonte vers les apex. C'est un mecanisme documente et vital chez
 * les champignons filamenteux, et c'est aussi ce qui manquait au jeu.
 *
 * Sans lui, un stock de sucre a zero coupait le flux vesiculaire, donc la
 * paroi, donc l'apex : 24 manches sur 24 mouraient de « carence puis lyse » et
 * la famine ne laissait aucune fenetre pour reagir. Avec lui, la famine devient
 * un COMPTE A REBOURS VISIBLE — la longueur du thalle, donc le score, se met a
 * descendre — et c'est exactement le signal qui doit pousser a sporuler.
 *
 * RENDEMENT RAMENE DE 0,004 A 0,0018 APRES MESURE, et la mesure vaut d'etre
 * gardee : a 0,004, se manger soi-meme etait si rentable que FONCER EN
 * PERMANENCE devenait la meilleure strategie — la politique pleins gaz
 * atteignait 1 529 um de profondeur contre 1 361 a une politique qui module,
 * parce qu'elle payait sa vitesse avec un thalle dont la perte ne coutait
 * presque rien au score. L'autophagie doit etre un SURSIS, pas un carburant.
 * A 0,0018 : un deficit de 0,25/s consomme 139 um de tube par seconde, donc un
 * thalle de 4 000 um disparait en une demi-minute. Et comme l'entretien suit la
 * biomasse, le declin ralentit au lieu de s'emballer — il reste une chance de
 * retrouver une plume, mais il n'y a plus de quoi s'installer dedans.
 */
const AUTOPHAGIE_PAR_UM = 0.0018;
/* Longueur cumulee entre deux paliers d expression genique. */
export const PALIER = 620;

/**
 * LES CINQ REGIMES. La croissance n'est plus une consigne maintenue mais un
 * REGLAGE QUI RESTE, comme un chadburn de passerelle : on le change, il tient.
 *
 * Pourquoi pas un bouton a maintenir. La question posee etait « la croissance
 * ne doit-elle pas etre manuelle plutot qu'automatique, pour que le joueur
 * gere sa vitesse ». Un bouton a maintenir donne bien ce controle, mais il le
 * fait payer par le doigt : sur une manche de huit minutes on tient la touche
 * 95 % du temps, donc l'appui cesse d'etre une decision et redevient un etat
 * par defaut — avec de la fatigue en plus. Un cran qui reste donne exactement le
 * meme arbitrage (ralentir economise, pousser coute) en faisant de chaque
 * changement d'allure un GESTE VOLONTAIRE, donc lisible, donc memorable.
 *
 * Le regime 0 arrete VRAIMENT : au fond de la consolidation le seuil de fluage
 * passe au-dessus du plafond de turgor. On s'immobilise pour regarder devant
 * soi, refaire son turgor et cesser de bruler du sucre. Le cytoplasme, lui,
 * continue de couler : un apex arrete n'est pas un apex en pause.
 */
export const REGIMES = [
  { nom: 'ARRET', drive: -1 },
  { nom: 'LENT', drive: -0.45 },
  { nom: 'CROISIERE', drive: 0 },
  { nom: 'POUSSEE', drive: 0.5 },
  { nom: 'FORCAGE', drive: 1 },
];

/**
 * Duree de germination, en secondes de jeu.
 *
 * Une spore ne demarre pas a pleine vitesse : elle s'imbibe et GONFLE d'abord,
 * puis un tube germinatif emerge, puis l'extension devient lineaire. Les deux
 * premieres phases ne produisent aucune longueur. C'est la vraie ouverture du
 * jeu, et elle a une vertu de conception : les cinq premieres secondes ne
 * demandent rien d'autre que de regarder, ce qui est le meilleur moment pour
 * apprendre a lire un champ.
 */
export const T_GERM = 5.5;

/**
 * TEMPO. Facteur applique au pas de temps de TOUTE la simulation.
 *
 * Demande de l'auteur : « il faut que ce soit beaucoup plus lent que ca ». Le
 * jeu se joue de pres — on voit arriver chaque vesicule — et a ce cadrage la
 * vitesse precedente donnait un defilement qui ne laissait pas le temps de
 * regarder ce qu'on avait justement rapproche pour le voir.
 *
 * On ralentit L'HORLOGE et non les coefficients, et c'est la seule facon sure
 * de le faire : croissance, absorption, depenses, entretien, autophagie,
 * dessechement, pulse — tout est divise par le meme facteur, donc TOUS LES
 * RAPPORTS SONT PRESERVES et l'equilibrage mesure au banc reste valide tel
 * quel. Ralentir les coefficients un par un aurait casse l'equilibre a coup
 * sur.
 *
 * Consequence sur l'echelle declaree : une seconde de jeu ne vaut plus une
 * minute de biologie mais une trentaine de secondes. Les rapports entre
 * vitesses restent ceux de la paillasse.
 */
export const TEMPO = 0.48;

export class Game {
  constructor(graine = (Math.random() * 1e9) | 0) {
    this.graine = graine >>> 0;
    this.rng = mulberry32(this.graine ^ 0x5bf03635);
    this.champ = new Champ(this.graine);
    this.thalle = new Thalle();
    this.t = 0;
    /* Regime de croissance, cran 1 (LENT) au demarrage : on sort de la spore au
       ralenti, ce qui laisse le temps de lire le champ avant d'accelerer. */
    this.regime = 1;

    this.rangs = {};
    /* Flux gagne par les noeuds d anastomose. Il vit HORS de `rangs` parce que
       `recalcStats` reconstruit les stats a neuf a chaque gene : un bonus pose
       directement sur `stats` disparaissait au palier suivant. */
    this.bonusFlux = 0;
    this.stats = appliquer(this.rangs);

    /* Turgor de depart a 0,52 : au-dessus du seuil de fluage (0,28) mais sans
       marge. La premiere seconde de jeu apprend donc la poussee, sans texte. */
    this.P = 0.52;
    /* RESERVES DE LA SPORE. 0,75 et non 0,42 : une conidie n'est pas vide, elle
       est bourree de lipides et de trehalose, et c'est ce stock qui paie la
       germination — pendant laquelle rien n'est encore absorbe ni construit.
       Sans cela, l'autophagie se declenchait AVANT que le thalle existe et la
       manche mourait a la sixieme seconde, thalle de zero micrometre. */
    this.S = 0.75;
    /* RESERVE DE LA SPORE, distincte du stock courant.
       Une conidie ne se contente pas de demarrer la germination : elle ALIMENTE
       son tube germinatif pendant des dizaines de minutes, sur ses lipides et
       son trehalose, bien avant que le milieu ne rapporte quoi que ce soit.
       Le jeu en avait besoin autant que la biologie : sans elle, l'apex entrait
       en deficit des la sortie de spore et l'autophagie mangeait un thalle de
       quarante micrometres — mesure au banc visuel, longueur de 1 um a la
       quatorzieme seconde. A 0,045 par seconde, la reserve tient environ vingt
       secondes : le temps qu'il faut pour trouver sa premiere plume, et pas une
       de plus. Quand elle s'epuise, l'ouverture est finie. */
    this.reserveSpore = 0.9;
    this.charge = { azole: 0, echino: 0, polyene: 0, sorbate: 0 };

    const b = this.thalle.nouvelleBranche(-1, 0, 0);
    /* La phase du pulse vient du GENERATEUR DE LA MANCHE et non de Math.random.
       Defaut trouve par le banc lui-meme : les verdicts basculaient d'une
       execution a l'autre sur les memes graines, avec des medianes qui
       variaient du simple au septuple (240 um contre 1 700 um de profondeur pour
       la meme politique). Une mesure non reproductible ne mesure rien, et on ne
       peut pas distinguer un reglage d'un bruit. */
    this.apex = [new Apex(b, 0, 0, AVANT, { pilote: true, phase: this.rng() * Math.PI * 2 })];
    this.pilote = this.apex[0];

    /* Prochaine ramification SPONTANEE, en um de thalle cumules. Voir UCH. */
    this.prochaineBranche = UCH;
    this.avance = 0;              // le plus grand y atteint : la profondeur
    this.prochainPalier = PALIER;
    this.etat = 'jeu';            // jeu | offre | mort | sporule
    this.offre = null;
    this.cause = null;
    this.spores = 0;
    this.noeuds = 0;
    this.granules = 0;
    this.rates = 0;               // granules laisses derriere : mesure du gachis
    this.flash = [];              // evenements a afficher, {txt, t, ton}
    this.secousse = 0;
  }

  /* --- statistiques derivees ------------------------------------------- */

  recalcStats() {
    this.stats = appliquer(this.rangs);
    this.stats.jmax += this.bonusFlux;
  }

  /**
   * Avancement de la germination, 0 a 1.
   *
   * Les 42 premiers pour cent du temps sont le GONFLEMENT de la spore : elle
   * s'imbibe, son volume double, et rien ne sort. Le tube germinatif emerge
   * ensuite et prend sa vitesse en puissance 1,5, donc doucement d'abord.
   */
  facteurGerm() {
    if (this.t >= T_GERM) return 1;
    const u = this.t / T_GERM;
    return Math.pow(clamp((u - 0.42) / 0.58, 0, 1), 1.5);
  }

  /** Rayon apparent de la spore de depart, en um. Elle gonfle puis reste. */
  rayonSpore() {
    return lerp(4.2, 6.8, clamp(this.t / (T_GERM * 0.5), 0, 1));
  }

  /**
   * Composition du trafic vesiculaire apical.
   *
   * Elle N'EST PAS inventee pour le rendu : chaque poids suit un terme du
   * modele, et c'est ce qui fait que regarder le tube renseigne vraiment.
   *   paroi      suit l'EPAISSEUR deposee — donc s'effondre quand on pousse ;
   *   extension  suit la VITESSE — donc domine quand on pousse ;
   *   membrane   suit la vitesse aussi, la membrane s'etendant avec la surface ;
   *   secretion  monte quand le substrat sous l'apex est pauvre ET qu'on a des
   *              hydrolases : une moisissure secrete pour digerer ce qu'elle ne
   *              peut pas absorber tel quel.
   * Consequence directement visible : POUSSER FAIT DISPARAITRE LES CHITOSOMES.
   */
  mixVesicules() {
    const a = this.pilote;
    const st = this.stats;
    const ech = this.champ.echantillon(a.x, a.y);
    const hydro = Object.keys(st.hydrolases).length;
    return {
      paroi: 0.25 + a.e * 1.5,
      extension: 0.15 + a.v * 0.055,
      membrane: 0.10 + a.v * 0.030,
      secretion: 0.10 + hydro * 0.45 + (ech.sucre < 0.12 ? 0.55 : 0),
    };
  }

  /** Flux vesiculaire effectif : borne par le stock ET par les echinocandines. */
  fluxEffectif() {
    /* Saturation sur le stock : en dessous de 0,33 de sucre le flux tombe, et
       c est la que la paroi s amincit. Le joueur voit donc venir la lyse dans
       sa jauge de sucre AVANT de la voir dans sa paroi. */
    const dispo = clamp(this.S * 3, 0, 1);
    const echino = clamp(1 - this.charge.echino * 0.85, 0.08, 1);
    return this.stats.jmax * dispo * echino;
  }

  /* --- boucle ----------------------------------------------------------- */

  pas(dt, cmd) {
    if (this.etat !== 'jeu') return;
    dt = Math.min(dt, 1 / 30) * TEMPO;  // un onglet qui reprend la main
    this.t += dt;
    this.secousse = Math.max(0, this.secousse - dt * 3.4);
    for (const f of this.flash) f.t -= dt;
    this.flash = this.flash.filter((f) => f.t > 0);

    const st = this.stats;
    st.jmaxEff = this.fluxEffectif();
    st.germ = this.facteurGerm();
    this.champ.majDerive(this.t);
    /* Le regime est un ETAT du thalle, pas une commande d'image : il se lit ici
       et vaut pour le pilote comme pour les apex autonomes (ceux-ci n'ont pas de
       poussee propre, ils suivent la consigne generale a leur vitesse reduite). */
    const drivePilote = REGIMES[clamp(this.regime, 0, REGIMES.length - 1)].drive;

    let absEau = 0, absSucre = 0, coutVol = 0, coutParoi = 0, expo = null;
    let produit = 0;

    for (const a of this.apex) {
      if (!a.vivant) continue;
      const ech = this.champ.echantillon(a.x, a.y);
      const ft = this.champ.facteurTemp(ech.temp, st.tempDec);
      const estPilote = a === this.pilote;
      const barre = estPilote ? cmd.barre : this.autoBarre(a, ech);
      /* Un apex autonome subit le regime comme les autres mais ne beneficie
         jamais de la poussee : la poussee est un acte de pilotage. */
      const drive = estPilote ? drivePilote : Math.min(0, drivePilote);
      /* Un apex autonome pousse moins fort : la dominance apicale n est pas
         levee, seulement relachee. `autoVit` est ce que les genes achetent. */
      const ralenti = estPilote ? 1 : clamp(st.autoVit, 0.2, 1);

      const d = a.pas(dt * ralenti, this.P, st, barre, drive, ft, this.thalle, this.t);
      produit += d;

      /* --- bilan local, somme ensuite ------------------------------- */
      coutVol += COUT_VOLUME * a.v * ralenti;
      coutParoi += COUT_PAROI * a.e * a.v * ralenti;

      /* Absorption d eau. La marge est NORMALISEE sur la plage utile de l aw :
         (aw - awMin) / (1 - awMin). Sans normalisation l ecart brut vaut 0,1 et
         le terme etait dix fois trop petit pour peser dans le bilan. Negative
         quand l aw passe sous la limite du genotype : c est la plasmolyse. */
      const marge = (ech.aw - st.awMin) / Math.max(0.06, 1 - st.awMin);
      const azole = clamp(1 - this.charge.azole * 0.8, 0.1, 1);
      /* La poussee n est pas une pompe a eau : c est une ACCUMULATION
         D OSMOLYTES. Elle releve donc le plafond de turgor atteignable, en plus
         d accelerer l entree d eau — et c est pour ca qu elle se paie en sucre :
         le glycerol est du carbone. Sans ce relevement du plafond, le terme
         (1 - P/pmax) saturait et la commande ne servait presque a rien. */
      const pmaxEff = st.pmax * (1 + (estPilote && drive > 0 ? 0.35 * drive : 0));
      let eau = st.kEau * marge * (1 - this.P / pmaxEff) * ft * azole;
      if (marge < 0) eau = st.kEau * marge * 1.4;   // le retrait est plus rapide
      if (estPilote && drive > 0) eau *= 1 + 0.9 * drive;
      /* DRAIN SALIN. Une poche de sel ne se contente pas d'abaisser l'aw du
         terme d'absorption : elle TIRE l'eau hors de l'hyphe, par osmose, et
         d'autant plus vite que le gradient est raide. C'est le mecanisme
         demande, et c'est ce qui rend une poche dangereuse meme a turgor plein
         — l'absorption, elle, sature quand P est haut. */
      if (ech.sel > 0.02) absEau -= ech.sel * 0.55;
      absEau += eau;
      if (estPilote) this.pmaxEff = pmaxEff;

      /* Absorption du sucre sur la zone SUBAPICALE, pas a l apex : les
         transporteurs de sucres y sont concentres, et c est ce decalage qui
         fait qu on absorbe ce qu on vient de traverser. Quatre points derriere
         l apex suffisent ; huit ne changeaient pas la valeur a 3 % pres. */
      let champSucre = 0;
      const pts = [];
      for (let i = 1; i <= 4; i++) {
        const r = (i / 4) * st.rayonAbs;
        const px2 = a.x - Math.cos(a.dir) * r, py2 = a.y - Math.sin(a.dir) * r;
        pts.push([px2, py2]);
        champSucre += this.champ.echantillon(px2, py2).sucre;
      }
      champSucre /= 4;
      /* L amidon n est pas du sucre sans amylase. Le substrat le plus riche du
         jeu est donc un desert pour qui n a pas la bonne enzyme : c est ce qui
         transforme une carte commune en cle de porte. */
      if (ech.substrat.amidon && !st.hydrolases.amylase) champSucre *= 0.12;
      let gain = champSucre * GAIN_SUCRE * st.kSucre * ft;
      /* Le creux du pulse est le moment ou l apex s attarde : il absorbe mieux.
         Consolider revient a rester dans le creux, donc a ratisser. */
      if (a.creux) gain *= 1.35;
      if (estPilote && drive < 0) gain *= 1 - drive * 0.45;
      absSucre += gain;
      /* On preleve ce qu'on absorbe, reparti sur les quatre points de la zone
         subapicale. 0,9 par unite absorbee : a un gain de 0,3/s une maille est
         videe en quatre secondes d'arret, et traversee a vitesse de croisiere
         elle ne perd qu'un cinquieme de sa reserve. Brouter sur place coute
         donc la plume ; la traverser la laisse vivante pour les hyphes soeurs. */
      if (gain > 0) for (const [cx2, cy2] of pts) this.champ.consommer(cx2, cy2, gain * 0.9 * dt);

      if (ech.af && (!expo || ech.af.v > expo.v)) expo = ech.af;

      /* --- contacts ------------------------------------------------- */
      this.contactObstacles(a, st, dt);
      this.contactSoi(a, st);
      this.ramasser(a, st);
    }

    /* --- bilan global ------------------------------------------------- */
    let poussee = 0;
    if (drivePilote > 0) poussee = COUT_POUSSEE * drivePilote;
    /* La spore verse sa reserve tant qu'elle en a. */
    let spore = 0;
    if (this.reserveSpore > 0) {
      spore = Math.min(this.reserveSpore / Math.max(dt, 1e-6), 0.045);
      this.reserveSpore = Math.max(0, this.reserveSpore - spore * dt);
      if (this.reserveSpore === 0 && !this._ditSpore) {
        this._ditSpore = true; this.dire('RESERVE EPUISEE', 'mal');
      }
    }
    const sorb = 1 + this.charge.sorbate * 2.2;
    const entretien = (st.maintenance + this.thalle.longueur * ENTRETIEN_PAR_UM) * sorb;
    this.P = clamp(this.P + (absEau - coutVol - this.charge.polyene * FUITE_POLYENE) * dt,
      0, this.pmaxEff || st.pmax);
    /* Plafond de stock ramene de 2,2 a 1,6 : a 2,2 le stock servait de tampon
       si large que la jauge ne bougeait plus et cessait de porter la derivee,
       qui est sa seule raison d'exister. */
    const bilanS = (absSucre + spore - coutParoi - entretien - poussee) * dt;
    if (this.S + bilanS < 0) {
      /* Le deficit est couvert par le thalle lui-meme. On retire la longueur
         recyclee du COMPTEUR, donc du score et de l'entretien — la geometrie
         deja posee reste a l'ecran, comme dans la realite : ce sont les parois
         vides qu'on voit, et elles ne redeviennent jamais du cytoplasme. */
      /* On recycle le deficit ET de quoi garder un FOND DE STOCK. Ce detail
         decide de tout : a stock exactement nul, le flux vesiculaire tombe a
         zero, donc la paroi aussi, donc l'apex lyse — et la famine redevenait
         une mort immediate malgre l'autophagie. Avec un fond de 0,07, le thalle
         recycle alimente encore la pointe a 5,5 de flux, ce qui autorise une
         reptation de 8 um/s a paroi viable. Un thalle affame RAMPE, il n'eclate
         pas : eclater redevient reserve a qui force en pleine disette. */
      const FOND = 0.07;
      const manque = -(this.S + bilanS) + FOND;
      const um = manque / AUTOPHAGIE_PAR_UM;
      this.thalle.longueur = Math.max(0, this.thalle.longueur - um);
      this.autophagie = Math.min(1, (this.autophagie || 0) + dt * 2.5);
      this.S = FOND;
      /* On ne peut s'autodigerer que si l'on s'est d'abord construit. Le garde
         `longueurMax` evite qu'un thalle naissant — donc court par nature — soit
         declare autodigere alors qu'il n'a encore rien mange de lui-meme. */
      if (this.thalle.longueur < 8 && this.longueurMax > 60) {
        for (const a of this.apex) if (a.vivant) a.tuer('autophagie');
      }
    } else {
      this.S = clamp(this.S + bilanS, 0, 1.6);
      this.autophagie = Math.max(0, (this.autophagie || 0) - dt * 1.4);
    }
    if (this.autophagie > 0.5 && !this._ditAuto) {
      this._ditAuto = true; this.dire('AUTOPHAGIE', 'mal');
    } else if (this.autophagie < 0.1) this._ditAuto = false;

    /* Charge d antifongique : elle monte dans le milieu, elle redescend
       toujours (efflux constitutif). Le rapport des deux fixe la duree
       pendant laquelle une plume reste dangereuse apres qu on en est sorti. */
    for (const k of Object.keys(this.charge)) {
      const entree = expo && expo.type === k ? expo.v / Math.max(0.12, st.detox[k]) : 0;
      this.charge[k] = clamp(this.charge[k] + (entree * 0.85 - 0.30) * dt, 0, 1);
    }

    /* Plasmolyse : le turgor a atteint zero. La cause est distincte de la lyse
       et se lit autrement a l ecran — l apex se RETRACTE au lieu d eclater. */
    if (this.P <= 0.001) {
      for (const a of this.apex) if (a.vivant) a.tuer('plasmolyse');
    }

    this.avance = Math.max(this.avance, ...this.apex.filter((a) => a.vivant).map((a) => a.y));
    this.longueurMax = Math.max(this.longueurMax || 0, this.thalle.longueur);
    this.ramifierSpontane();
    this.moissonner();
    this.thalle.purger(Math.min(...this.apex.filter((a) => a.vivant).map((a) => a.y), this.avance));

    if (this.thalle.longueur >= this.prochainPalier) {
      this.prochainPalier += PALIER;
      this.proposer('palier');
    }
  }

  /* --- pilotage automatique des apex non pilotes ----------------------- */

  /**
   * Tropisme d un apex autonome, dans cet ordre de priorite :
   *   1. il FUIT son propre thalle (autotropisme negatif),
   *   2. il monte le gradient de sucre (chimiotropisme),
   *   3. il garde le cap.
   * Les trois sont documentes chez les champignons filamenteux, et cet ordre
   * est ce qui fait un mycelium etale : sans la priorite a la fuite, les apex
   * autonomes revenaient se coller au tube parent en quatre secondes.
   */
  autoBarre(a, ech) {
    /* PORTEE D'EVITEMENT : 42 um a l'origine, ramenee a 24. A 42 les apex
       autonomes esquivaient si bien qu'aucune manche sur 96 ne mourait plus par
       fusion — le danger que l'auteur voulait au coeur du jeu avait disparu de
       la table des causes. A 24 um ils s'ecartent encore de leur parent mais
       peuvent se croiser entre eux, et le pilote peut se faire enfermer par son
       propre reseau. L'autotropisme negatif est un evitement, pas un radar. */
    const pr = this.thalle.proche(a.x, a.y, 24, this.t, 0.6,
      a.branche.id, a.branche.longueur, 40);
    if (pr) {
      const m = pr.seg;
      const ang = Math.atan2(a.y - (m.y0 + m.y1) / 2, a.x - (m.x0 + m.x1) / 2);
      let d = ang - a.cap;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      /* Signe negatif : le depot est exprime EN REPERE ECRAN (positif = droite)
         alors que `d` est un ecart d angle mathematique. Voir apex.js.
         Gain reduit de 2,2 a 1,3 : la commande vise desormais une POSITION de
         zone de fusion et non une vitesse angulaire, donc un gain fort la
         collait aux butees et l apex autonome zigzaguait. */
      return clamp(-d * 1.3, -1, 1);
    }
    /* Gradient de sucre, echantillonne a gauche et a droite du cap. */
    const r = 26;
    const g = this.champ.echantillon(a.x + Math.cos(a.cap + 0.7) * r, a.y + Math.sin(a.cap + 0.7) * r).sucre;
    const dr = this.champ.echantillon(a.x + Math.cos(a.cap - 0.7) * r, a.y + Math.sin(a.cap - 0.7) * r).sucre;
    const flair = 2.0 * (1 + (this.stats.flair || 0));
    return clamp(-(g - dr) * flair, -1, 1);
  }

  /* --- contacts --------------------------------------------------------- */

  contactObstacles(a, st, dt) {
    for (const o of this.champ.autour(a.x, a.y, 30)) {
      if (o.type !== 'obstacle' || o.mort) continue;
      /* Seul le plan net arrete : un obstacle floute est au-dessus ou en dessous
         du plan de croissance, on passe. */
      if (o.plan !== 0) continue;
      const dx = a.x - o.x, dy = a.y - o.y;
      const d = Math.hypot(dx, dy);
      const seuil = o.r + 2.4;
      if (d > seuil || d < 1e-4) continue;
      /* Pectinase : les parois vegetales cedent. Une enzyme qui ouvre un
         passage est plus satisfaisante qu un bonus de degats, et c est
         exactement ce que fait Botrytis dans un fruit. */
      if (o.forme === 'paroiveg' && st.perce > 0.4) {
        o.mort = true;
        this.S = Math.min(1.6, this.S + 0.03);
        continue;
      }
      /* Le SPK etant desormais recalcule a chaque pas a partir du cap, il suffit
         de repousser l apex : la nuee suivra d elle-meme. */
      const nx = dx / d, ny = dy / d, push = seuil - d;
      a.x += nx * push; a.y += ny * push;
      /* Thigmotropisme : l apex GLISSE le long de la surface au lieu de s y
         ecraser. Le cap est projete sur la tangente. */
      const tang = Math.atan2(-nx, ny);
      const alt = Math.atan2(nx, -ny);
      const cible = Math.abs(angEcart(a.cap, tang)) < Math.abs(angEcart(a.cap, alt)) ? tang : alt;
      a.cap = Apex.borner(lerp(a.cap, cible, clamp(st.glisse + 0.25, 0, 0.9)));
      /* Le glissement recentre la zone de fusion : longer un obstacle remet le
         depot dans l axe, sinon l apex repart aussitot dedans. */
      a.depot *= 0.4;
      /* 0,50 par seconde de contact continu, et en dt reel : la version au pas
         fixe de 0,016 tuait en 1,9 s quel que soit le nombre d'images, donc
         differemment sur un ecran a 120 Hz. */
      a.integrite = Math.max(0, a.integrite - (1 - clamp(st.glisse, 0, 0.85)) * 0.50 * dt);
      if (a.integrite <= 0) a.tuer('ecrasement');
      this.secousse = Math.max(this.secousse, 0.25);
    }
  }

  /**
   * Contact avec son PROPRE thalle.
   *
   * L auteur voulait « si on se touche soi-meme c est perdu, car on est
   * coince ». On garde la sanction mais on la rend PHYSIOLOGIQUE : le contact
   * entre deux hyphes du meme thalle est une ANASTOMOSE, et une anastomose
   * TERMINE la croissance de l apex qui fusionne. Ce n est donc pas « perdu »,
   * c est « cet apex est fini ». Perdu n arrive que s il n en restait qu un.
   *
   * Trois raisons de conception, et elles valent d etre ecrites :
   *   - la ramification devient un SYSTEME DE VIES, ce qui donne au verbe le
   *     plus interessant du jeu un enjeu qu il n avait pas ;
   *   - la mort reste comprehensible : on voit la fusion, on voit l apex
   *     s eteindre, on n a pas « perdu sans savoir pourquoi » ;
   *   - et la fin de manche devient graduelle. Un thalle dense meurt apex par
   *     apex, ce qui laisse au joueur le temps de decider de SPORULER. Une mort
   *     instantanee lui aurait retire cette decision, qui est le coeur du jeu.
   */
  contactSoi(a, st) {
    /* Detection avant contact : c est l autotropisme negatif, et il est joue
       comme une AIDE VISUELLE plutot que comme un evitement automatique. Rendre
       la main au joueur vaut mieux que corriger a sa place. */
    /* 8 px de perception SANS gene : le liseré d alerte doit exister d entree,
       sinon la mort par fusion arrive sans le moindre signe et se lit comme une
       injustice. Le gene d autotropisme n achete donc pas la perception, il
       achete la DISTANCE a laquelle on la recoit — ce qui est aussi ce que fait
       le vrai gradient d evitement entre hyphes d un meme thalle. */
    const portee = 8 + st.autotropisme;
    const pr = this.thalle.proche(a.x, a.y, portee, this.t, 0.4,
      a.branche.id, a.branche.longueur);
    a.contact = pr ? clamp(1 - pr.d / portee, 0, 1) : 0;
    /* Sursis de naissance, EN DISTANCE et non en duree, pour la meme raison que
       l'exclusion d'abscisse : une branche neuve sort de la paroi de son parent
       et doit s'en ecarter d'un diametre avant qu'on la teste. A l'arret elle ne
       s'en ecarte jamais, donc un sursis en secondes l'aurait condamnee. */
    if (a.parcouru < 26) return;
    /* 4,6 px et non 3,6 : le contact doit correspondre a ce qu'on VOIT. Deux
       tubes de 7 px de rayon se touchent quand leurs axes sont a 14 px ; a 3,6
       ils se chevauchaient profondement avant que la fusion ne se declenche, et
       le joueur voyait deux hyphes se croiser sans consequence. On reste
       nettement en dessous de 2 R, donc indulgent, mais plus incoherent. */
    if (!pr || pr.d > 4.6) return;
    if (st.anastomose > 0) {
      /* Gene d anastomose : la fusion devient un GAIN. Le noeud est un vrai
         benefice de reseau — un mycelium anastomose redistribue son cytoplasme
         et resiste a la coupure. On garde l apex vivant, on le devie. */
      this.thalle.noeud(a.x, a.y, this.t);
      this.noeuds++;
      this.bonusFlux += 0.9;
      this.stats.jmax += 0.9;
      a.cap = Apex.borner(a.cap + (this.rng() < 0.5 ? -1 : 1) * 0.9);
      a.depot = 0;
      a.x += Math.cos(a.cap) * 5; a.y += Math.sin(a.cap) * 5;
      this.dire('ANASTOMOSE +FLUX', 'bon');
      this.secousse = 0.4;
      return;
    }
    this.thalle.noeud(a.x, a.y, this.t);
    a.tuer('anastomose');
    this.secousse = 0.7;
  }

  ramasser(a, st) {
    for (const o of this.champ.autour(a.x, a.y, 18)) {
      if (o.pris || o.type === 'obstacle') continue;
      const d = Math.hypot(a.x - o.x, a.y - o.y);
      if (d > o.r + 2.6) continue;
      if (o.type === 'granule') {
        if (o.amidon && !st.hydrolases.amylase) continue;   // on passe dessus
        o.pris = true;
        this.S = Math.min(1.6, this.S + o.valeur * st.kSucre);
        this.granules++;
      } else if (o.type === 'goutte') {
        o.pris = true;
        this.P = Math.min(st.pmax, this.P + o.valeur);
      } else if (o.type === 'locus') {
        o.pris = true;
        this.proposer('locus');
      }
    }
  }

  /**
   * Compte les granules DEFINITIVEMENT rates.
   *
   * Cette mesure ne sert pas au score : elle sert au joueur. Un granule laisse
   * derriere ne revient jamais (la camera n y retourne pas), et l afficher
   * apprend le seul reproche que le jeu ait a faire a la vitesse : on n a pas
   * perdu, on a laisse passer. C est ce chiffre qui donne envie de refaire une
   * manche plus lentement.
   */
  moissonner() {
    const seuil = this.avance - 140;
    for (const o of this.champ.autour(this.pilote ? this.pilote.x : 0, this.avance - 150, 200)) {
      if (o.type === 'granule' && !o.pris && !o.compte && o.y < seuil) {
        o.compte = true; this.rates++;
      }
    }
  }

  /**
   * RAMIFICATION SPONTANEE, sur l'unite de croissance hyphale.
   *
   * Un thalle n'est pas une hyphe : c'est un reseau, et il le devient tout seul.
   * Tous les UCH micrometres de tube produits, un nouvel apex emerge quelque
   * part en subapical — c'est la loi de Trinci, et c'est ce qui rend la
   * croissance totale exponentielle alors qu'aucun apex n'accelere.
   *
   * Deux garde-fous de conception :
   *   - on laisse TOUJOURS un cran libre sous le plafond, pour que le joueur ait
   *     un emplacement disponible quand il veut ramifier volontairement. Sans
   *     cela, la ramification spontanee lui confisquait son seul virage serre ;
   *   - en dessous de 0,12 de sucre, rien ne se ramifie. La ramification est
   *     reellement dependante des nutriments, et un thalle affame qui continue
   *     d'ouvrir des fronts se serait suicide sans que le joueur comprenne.
   */
  ramifierSpontane() {
    if (this.thalle.longueur < this.prochaineBranche) return;
    this.prochaineBranche += UCH;
    const vivants = this.apex.filter((a) => a.vivant);
    if (vivants.length >= this.stats.apexMax - 1) return;
    if (this.S < 0.12) return;
    const parent = vivants[(this.rng() * vivants.length) | 0];
    if (!parent) return;
    this.poserBranche(parent, false);
    this.dire('RAMIFICATION', 'bon');
  }

  /**
   * Pose une branche en subapical d'un apex donne.
   * `pilotage` dit si la dominance passe a la nouvelle branche.
   */
  poserBranche(p, pilotage) {
    const st = this.stats;
    /* La branche nait a DOMINANCE um derriere l'apex, jamais a l'apex : un apex
       en croissance reprime l'emergence de tips dans son voisinage par un
       gradient de Ca2+ et de radicaux. */
    const DOMINANCE = 14;
    const cote0 = this.rng() < 0.5 ? -1 : 1;
    const px0 = p.x - Math.cos(p.dir) * DOMINANCE;
    const py0 = p.y - Math.sin(p.dir) * DOMINANCE;
    /* Elle emerge de la PAROI LATERALE du tube, pas de son axe : sur l'axe, elle
       fusionnait avec son propre parent des la fin du sursis de naissance. */
    const bx = px0 + Math.cos(p.dir + cote0 * Math.PI / 2) * 7;
    const by = py0 + Math.sin(p.dir + cote0 * Math.PI / 2) * 7;
    /* 62 a 88 degres du cap parent : la plage reellement observee. */
    const ecart = (62 + this.rng() * 26 + st.brancheAngle) * Math.PI / 180;
    const ang = Apex.borner(p.dir + cote0 * ecart);
    const b = this.thalle.nouvelleBranche(p.branche.id, bx, by);
    const na = new Apex(b, bx, by, ang, { phase: p.phase + Math.PI, lance: st.brancheVit });
    this.apex.push(na);
    if (pilotage) {
      this.pilote.pilote = false;
      na.pilote = true;
      this.pilote = na;
    }
    return na;
  }

  /* --- verbes du joueur ------------------------------------------------- */

  /** Change de regime d'un cran. C'est le seul reglage de vitesse du jeu. */
  changerRegime(d) {
    const n = clamp(this.regime + d, 0, REGIMES.length - 1);
    if (n === this.regime) return false;
    this.regime = n;
    return true;
  }

  /**
   * Ramifier. Le seul moyen de changer de cap SANS rayon de braquage, et le
   * seul moyen d avoir une vie de secours.
   *
   * La branche nait a `DOMINANCE` px DERRIERE l apex, jamais a l apex : un
   * apex en croissance reprime l emergence de tips dans son voisinage par un
   * gradient de Ca2+ et de radicaux. On paie donc la manoeuvre en terrain, ce
   * qui l empeche d etre le virage par defaut.
   */
  ramifier() {
    const st = this.stats;
    if (this.etat !== 'jeu') return false;
    const vivants = this.apex.filter((a) => a.vivant);
    if (vivants.length >= st.apexMax) { this.dire('DOMINANCE APICALE', 'mal'); return false; }
    if (this.S < st.coutBranche) { this.dire('SUCRE INSUFFISANT', 'mal'); return false; }
    this.S -= st.coutBranche;
    this.poserBranche(this.pilote, true);
    this.dire('RAMIFICATION DIRIGEE', 'bon');
    this.secousse = 0.35;
    return true;
  }

  /**
   * Sporuler : encaisser la manche et l arreter volontairement.
   *
   * C est l EXTRACTION du jeu, et c est ce qui transforme un score-attack en
   * roguelite. Le joueur arbitre en permanence entre continuer (le thalle
   * grandit, donc la mise grandit) et encaisser (on garde tout). Mourir ne
   * rend que 25 % — 55 % avec abaA/wetA, parce qu une conidie mure survit au
   * thalle qui l a faite.
   */
  sporuler() {
    if (this.etat !== 'jeu') return false;
    /* 0,04 et non 0,35. Le seuil eleve interdisait de sporuler exactement au
       moment ou il le faut : le banc a montre que la politique de reference ne
       parvenait jamais a encaisser, parce que la decision se prend quand le
       thalle commence a se manger, donc a stock au plancher.
       Et c'est la realite qui tranche dans le meme sens : chez les champignons
       filamenteux, c'est LA LIMITATION EN NUTRIMENTS qui induit la conidiation.
       Une moisissure ne sporule pas quand tout va bien, elle sporule quand le
       substrat s'epuise. Le seuil ne garde donc qu'un plancher symbolique : il
       faut de quoi batir le conidiophore, pas de quoi continuer a pousser. */
    if (this.S < 0.04) { this.dire('SUCRE INSUFFISANT', 'mal'); return false; }
    this.spores = this.recolte(1);
    this.etat = 'sporule';
    this.cause = 'sporulation';
    return true;
  }

  /**
   * Recolte de spores.
   *
   * Trois termes, chacun pour une facon de jouer, et c est voulu : on peut
   * viser le long (la longueur), le large (l empreinte) ou le reseau (les
   * noeuds d anastomose). Sans les trois, une seule trajectoire serait
   * optimale et le catalogue de genes deviendrait decoratif.
   */
  recolte(part) {
    /* PONDERATION : la PROFONDEUR pese autant que la longueur, et c'est une
       decision, pas un reglage. Avec `longueur / 100` seul, une politique qui
       tournait en rond longtemps marquait plus qu'une politique qui avancait :
       le score recompensait la survie et pas la progression, alors que le sujet
       du jeu est d'aller de l'avant. La longueur reste payee (c'est la mesure du
       thalle) mais moins cher a l'unite. */
    const l = this.thalle.longueur / 160;
    const a = this.thalle.aire / 4200;
    const n = this.noeuds * 3;
    const prof = this.avance / 100;
    return Math.max(0, Math.round((l + a * 1.6 + n + prof * 2.2) * this.stats.spores * part));
  }

  proposer(source) {
    const ctx = this.champ.contexte(this.avance);
    this.offre = { source, cartes: tirerMain(this.rng, this.rangs, ctx.substrat.id, 3) };
    if (!this.offre.cartes.length) { this.offre = null; return; }
    this.etat = 'offre';
  }

  choisir(index) {
    if (this.etat !== 'offre' || !this.offre) return;
    const g = this.offre.cartes[index];
    if (g) {
      this.rangs[g.id] = (this.rangs[g.id] || 0) + 1;
      this.recalcStats();
      this.dire(g.nom.toUpperCase().slice(0, 18), 'gene');
    }
    this.offre = null;
    this.etat = 'jeu';
  }

  /* --- fin de vie d un apex -------------------------------------------- */

  /** A appeler apres `pas` : gere les morts et le transfert de dominance. */
  arbitrer() {
    if (this.etat === 'mort' || this.etat === 'sporule') return;
    const st = this.stats;
    for (const a of this.apex) {
      if (a.vivant || a.traite) continue;
      a.traite = true;
      if (a.mort === 'lyse' || a.mort === 'interference' || a.mort === 'ecrasement') {
        /* Une lyse apicale vide le compartiment. Les corps de Woronin bouchent
           le pore septal en quelques secondes et sauvent le reste du thalle :
           le gene ne reduit pas la mort de l apex, il reduit la CASCADE. */
        const garde = clamp(st.woronin, 0, 0.9);
        this.P *= lerp(0.35, 1, garde);
        /* Distinguer les deux chemins vers la lyse : ils ne s apprennent pas de
           la meme facon. Trop vite pour sa paroi, c est un probleme de conduite ;
           plus de sucre du tout, c est un probleme d itineraire. */
        const carence = this.S < 0.04;
        this.dire(a.mort !== 'lyse' ? 'APEX DETRUIT'
          : carence ? 'CARENCE PUIS LYSE' : 'LYSE APICALE', 'mal');
        this.secousse = 0.9;
      } else if (a.mort === 'anastomose') {
        this.dire('APEX FUSIONNE', 'mal');
      } else if (a.mort === 'plasmolyse') {
        this.dire('PLASMOLYSE', 'mal');
      } else if (a.mort === 'autophagie') {
        this.dire('THALLE AUTODIGERE', 'mal');
      }
    }
    const vivants = this.apex.filter((a) => a.vivant);
    if (!vivants.length) {
      this.etat = 'mort';
      this.cause = this.dernierePanne();
      this.spores = this.recolte(0.25 + clamp(st.secours, 0, 0.6));
      return;
    }
    if (!this.pilote.vivant) {
      /* Transfert de dominance : au plus avance, parce que c est celui dont la
         camera bougera le moins et dont le milieu est deja charge. */
      vivants.sort((a, b) => b.y - a.y);
      this.pilote = vivants[0];
      this.pilote.pilote = true;
      this.dire('TRANSFERT DE DOMINANCE', 'bon');
    }
    this.apex = vivants;
  }

  dernierePanne() {
    for (let i = this.flash.length - 1; i >= 0; i--) {
      if (this.flash[i].ton === 'mal') return this.flash[i].txt;
    }
    return 'THALLE CLOS';
  }

  dire(txt, ton = 'bon') {
    this.flash.push({ txt, t: 2.2, ton });
    if (this.flash.length > 5) this.flash.shift();
  }

  /* --- lecture pour le HUD et les bancs -------------------------------- */

  etatLisible() {
    const ech = this.champ.echantillon(this.pilote.x, this.pilote.y);
    return {
      t: this.t,
      longueur: Math.round(this.thalle.longueur),
      aire: this.thalle.aire,
      avance: Math.round(this.avance),
      P: this.P, S: this.S,
      v: Math.round(this.pilote.v * 10) / 10,
      e: Math.round(this.pilote.e * 100) / 100,
      integrite: this.pilote.integrite,
      apex: this.apex.filter((a) => a.vivant).length,
      apexMax: this.stats.apexMax,
      substrat: ech.substrat.court || ech.substrat.nom, boucle: ech.boucle,
      aw: Math.round(ech.aw * 1000) / 1000,
      temp: Math.round(ech.temp * 10) / 10,
      af: ech.af, charge: this.charge,
      noeuds: this.noeuds, granules: this.granules, rates: this.rates,
      entretien: Math.round((this.stats.maintenance + this.thalle.longueur * ENTRETIEN_PAR_UM) * 1000) / 1000,
      autophagie: this.autophagie || 0,
      regime: this.regime, regimeNom: REGIMES[this.regime].nom,
      depot: this.pilote.depot,
      reserve: this.reserveSpore,
      germ: this.facteurGerm(), sel: ech.sel || 0,
      spores: this.recolte(1),
      etat: this.etat, cause: this.cause,
    };
  }
}

function angEcart(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export { CAP_MAX, AVANT, E_CRIT };
