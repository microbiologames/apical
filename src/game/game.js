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
import { AW_MIN_BASE } from '../data/substrats.js';
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
/* Longueur cumulee entre deux paliers d expression genique. */
export const PALIER = 620;

export class Game {
  constructor(graine = (Math.random() * 1e9) | 0) {
    this.graine = graine >>> 0;
    this.rng = mulberry32(this.graine ^ 0x5bf03635);
    this.champ = new Champ(this.graine);
    this.thalle = new Thalle();
    this.rival = new Thalle();
    this.t = 0;

    this.rangs = {};
    /* Flux gagne par les noeuds d anastomose. Il vit HORS de `rangs` parce que
       `recalcStats` reconstruit les stats a neuf a chaque gene : un bonus pose
       directement sur `stats` disparaissait au palier suivant. */
    this.bonusFlux = 0;
    this.stats = appliquer(this.rangs);

    /* Turgor de depart a 0,52 : au-dessus du seuil de fluage (0,28) mais sans
       marge. La premiere seconde de jeu apprend donc la poussee, sans texte. */
    this.P = 0.52;
    this.S = 0.42;
    this.charge = { azole: 0, echino: 0, polyene: 0, sorbate: 0 };

    const b = this.thalle.nouvelleBranche(-1, 0, 0);
    this.apex = [new Apex(b, 0, 0, AVANT, { pilote: true })];
    this.pilote = this.apex[0];

    this.competiteurs = [];
    /* HORLOGE DES CONCURRENTS, ET C'EST UNE DATE, PAS UNE DISTANCE.
       La version precedente declenchait les fronts sur `avance`, donc un joueur
       lent en rencontrait MOINS : la lenteur etait recompensee deux fois. Une
       moisissure concurrente a germe au meme instant que vous et pousse que vous
       bougiez ou non. Le declenchement est donc temporel, et c'est la seconde
       horloge du jeu avec le dessechement. */
    this.prochainComp = 14;       // secondes avant le premier front
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
    dt = Math.min(dt, 1 / 30);          // un onglet qui reprend la main
    this.t += dt;
    this.secousse = Math.max(0, this.secousse - dt * 3.4);
    for (const f of this.flash) f.t -= dt;
    this.flash = this.flash.filter((f) => f.t > 0);

    const st = this.stats;
    st.jmaxEff = this.fluxEffectif();
    this.champ.majDerive(this.t);

    let absEau = 0, absSucre = 0, coutVol = 0, coutParoi = 0, expo = null;
    let produit = 0;

    for (const a of this.apex) {
      if (!a.vivant) continue;
      const ech = this.champ.echantillon(a.x, a.y);
      const ft = this.champ.facteurTemp(ech.temp, st.tempDec);
      const estPilote = a === this.pilote;
      const barre = estPilote ? cmd.barre : this.autoBarre(a, ech);
      const drive = estPilote ? cmd.drive : 0;
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
      absEau += eau;
      if (estPilote) this.pmaxEff = pmaxEff;

      /* Absorption du sucre sur la zone SUBAPICALE, pas a l apex : les
         transporteurs de sucres y sont concentres, et c est ce decalage qui
         fait qu on absorbe ce qu on vient de traverser. Quatre points derriere
         l apex suffisent ; huit ne changeaient pas la valeur a 3 % pres. */
      let champSucre = 0;
      for (let i = 1; i <= 4; i++) {
        const r = (i / 4) * st.rayonAbs;
        const e2 = this.champ.echantillon(a.x - Math.cos(a.dir) * r, a.y - Math.sin(a.dir) * r);
        champSucre += e2.sucre;
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

      if (ech.af && (!expo || ech.af.v > expo.v)) expo = ech.af;

      /* --- contacts ------------------------------------------------- */
      this.contactObstacles(a, st, dt);
      this.contactSoi(a, st);
      this.contactRival(a, st, dt);
      this.ramasser(a, st);
    }

    /* --- bilan global ------------------------------------------------- */
    let poussee = 0;
    if (cmd.drive > 0) poussee = COUT_POUSSEE * cmd.drive;
    const sorb = 1 + this.charge.sorbate * 2.2;
    this.P = clamp(this.P + (absEau - coutVol - this.charge.polyene * FUITE_POLYENE) * dt,
      0, this.pmaxEff || st.pmax);
    this.S = clamp(this.S + (absSucre - coutParoi - st.maintenance * sorb - poussee) * dt,
      0, 2.2);

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
    this.majCompetiteurs(dt);
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
    /* 42 px de portee et un gain de 3,4 : mesure au banc, a 30 px et 2,2 les
       apex autonomes se collaient au tube parent et la fusion emportait 20
       manches sur 24. Un apex autonome doit survivre SEUL, sinon ramifier n est
       pas une vie de secours mais une mort differee. */
    const pr = this.thalle.proche(a.x, a.y, 42, this.t, 1.6);
    if (pr) {
      const m = pr.seg;
      const ang = Math.atan2(a.y - (m.y0 + m.y1) / 2, a.x - (m.x0 + m.x1) / 2);
      let d = ang - a.spk.ang;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      return clamp(d * 3.4, -1, 1);
    }
    /* Gradient de sucre, echantillonne a gauche et a droite du cap. */
    const r = 26;
    const g = this.champ.echantillon(a.x + Math.cos(a.spk.ang + 0.7) * r, a.y + Math.sin(a.spk.ang + 0.7) * r).sucre;
    const dr = this.champ.echantillon(a.x + Math.cos(a.spk.ang - 0.7) * r, a.y + Math.sin(a.spk.ang - 0.7) * r).sucre;
    return clamp((g - dr) * 3.2, -1, 1);
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
        this.S = Math.min(2.2, this.S + 0.03);
        continue;
      }
      /* On repousse l apex ET son SPK : ne repousser que l apex le laissait
         retomber dans l obstacle a l image suivante, et l integrite fondait en
         une seconde sur un simple frottement. */
      const nx = dx / d, ny = dy / d, push = seuil - d;
      a.x += nx * push; a.y += ny * push;
      a.spk.x += nx * push; a.spk.y += ny * push;
      /* Thigmotropisme : l apex GLISSE le long de la surface au lieu de s y
         ecraser. Le cap est projete sur la tangente. */
      const tang = Math.atan2(-nx, ny);
      const alt = Math.atan2(nx, -ny);
      const cible = Math.abs(angEcart(a.spk.ang, tang)) < Math.abs(angEcart(a.spk.ang, alt)) ? tang : alt;
      a.spk.ang = Apex.borner(lerp(a.spk.ang, cible, clamp(st.glisse + 0.25, 0, 0.9)));
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
    const pr = this.thalle.proche(a.x, a.y, portee, this.t, 1.0);
    a.contact = pr ? clamp(1 - pr.d / portee, 0, 1) : 0;
    /* Sursis de naissance : une branche neuve sort d'un tube, elle est donc
       collee a lui par construction. 0,9 s, soit le temps de s'en ecarter d'un
       diametre a vitesse nominale. */
    if (a.age < 0.9) return;
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
      a.spk.ang = Apex.borner(a.spk.ang + (this.rng() < 0.5 ? -1 : 1) * 0.9);
      a.x += Math.cos(a.spk.ang) * 5; a.y += Math.sin(a.spk.ang) * 5;
      this.dire('ANASTOMOSE +FLUX', 'bon');
      this.secousse = 0.4;
      return;
    }
    this.thalle.noeud(a.x, a.y, this.t);
    a.tuer('anastomose');
    this.secousse = 0.7;
  }

  contactRival(a, st, dt) {
    const pr = this.rival.proche(a.x, a.y, 4.2, this.t, 0);
    if (!pr) return;
    if (st.mycoparasite > 0) {
      /* Trichoderma : on s enroule, on lyse, on prend la place. La recompense
         est du sucre ET du territoire, parce que c est ce que gagne un
         mycoparasite reel — le remplacement, pas le partage. */
      this.S = Math.min(2.2, this.S + 0.16);
      this.dire('MYCOPARASITISME', 'bon');
      const seg = pr.seg;
      seg.t = -1e9; seg.mort = true;
      for (const c of this.competiteurs) {
        for (const t of c.tips) if (Math.hypot(t.x - a.x, t.y - a.y) < 30) t.vivant = false;
      }
      return;
    }
    /* Interference hyphale : le contact suffit, sans penetration, et c est
       l APEX qui est la zone sensible. L extension s arrete net, la membrane
       fuit, le compartiment meurt. Decrit par Webster des les annees 1970. */
    a.integrite = Math.max(0, a.integrite - 1.9 * dt);
    this.P = Math.max(0, this.P - 0.35 * dt);
    if (a.integrite <= 0) a.tuer('interference');
    this.secousse = Math.max(this.secousse, 0.3);
  }

  ramasser(a, st) {
    for (const o of this.champ.autour(a.x, a.y, 18)) {
      if (o.pris || o.type === 'obstacle') continue;
      const d = Math.hypot(a.x - o.x, a.y - o.y);
      if (d > o.r + 2.6) continue;
      if (o.type === 'granule') {
        if (o.amidon && !st.hydrolases.amylase) continue;   // on passe dessus
        o.pris = true;
        this.S = Math.min(2.2, this.S + o.valeur * st.kSucre);
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

  /* --- concurrents ------------------------------------------------------ */

  majCompetiteurs(dt) {
    const ctx = this.champ.contexte(this.avance);
    const s = ctx.substrat;
    if (s.competiteurs.length && this.t > this.prochainComp) {
      /* La pression du substrat et le coefficient de boucle fixent l INTERVALLE
         d arrivee, pas le nombre : un front qui apparait par paquets se lit
         comme une vague scriptee, alors qu un mycelium avance en continu. */
      let p = 0, choix = s.competiteurs[0];
      for (const c of s.competiteurs) { p += c.pression; if (this.rng() * p < c.pression) choix = c; }
      const pression = choix.pression * ctx.k.pression;
      /* De 34 s a 13 s entre deux fronts selon la pression du substrat et la
         boucle. Un front met environ 10 s a traverser le champ : en dessous de
         13 s d'intervalle ils se superposent et le champ devient infranchissable. */
      this.prochainComp = this.t + lerp(34, 13, clamp(pression, 0, 1));
      this.naitreCompetiteur(choix.espece);
    }
    for (const c of this.competiteurs) {
      for (const tip of c.tips) {
        if (!tip.vivant) continue;
        /* Cap : l avant, plus une attraction vers le pilote. Un concurrent qui
           viserait l apex en permanence serait un mob, pas un mycelium : le
           poids de l attraction reste faible (0,35) et il continue d avancer
           meme si le joueur s eloigne. */
        const vers = Math.atan2(this.pilote.y - tip.y, this.pilote.x - tip.x);
        const cible = Apex.borner(lerp(AVANT + tip.biais, vers, 0.35));
        let d = angEcart(tip.ang, cible);
        tip.ang = Apex.borner(tip.ang + clamp(d, -1, 1) * c.agilite * dt);
        tip.x += Math.cos(tip.ang) * c.v * dt;
        tip.y += Math.sin(tip.ang) * c.v * dt;
        this.rival.deposer(tip.branche, tip.x, tip.y, 0.9, this.t);
        /* Un front qui se laisse distancer de 400 px est hors jeu : on le
           retire pour ne pas payer sa geometrie jusqu a la fin de la manche. */
        if (tip.y < this.avance - 400) tip.vivant = false;
      }
      c.tips = c.tips.filter((t) => t.vivant);
    }
    this.competiteurs = this.competiteurs.filter((c) => c.tips.length);
    this.rival.purger(this.avance - 120);
  }

  naitreCompetiteur(espece) {
    /* Il apparait DEVANT et de COTE, jamais dans le dos : un danger qu on ne
       peut pas voir venir n enseigne rien. 130 a 240 px devant, ce qui laisse
       entre 6 et 12 s pour decider de passer ou de contourner. */
    const cote = this.rng() < 0.5 ? -1 : 1;
    const x = this.pilote.x + cote * lerp(40, 150, this.rng());
    const y = this.avance + lerp(130, 240, this.rng());
    const vitesses = {
      botrytis: 17, penicillium: 12, aspergillus: 15,
      fusarium: 14, cladosporium: 11, xeromyces: 8, trichoderma: 20,
    };
    const c = {
      espece, v: (vitesses[espece] || 13) * (1 + this.champ.contexte(y).boucle * 0.1),
      agilite: 0.85, tips: [],
    };
    const n = 2 + (this.rng() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const b = this.rival.nouvelleBranche(-1, x, y);
      c.tips.push({
        x, y, ang: AVANT + (i - (n - 1) / 2) * 0.5,
        biais: (this.rng() - 0.5) * 0.8, branche: b, vivant: true,
      });
    }
    this.competiteurs.push(c);
    this.dire(espece.toUpperCase(), 'mal');
  }

  /* --- verbes du joueur ------------------------------------------------- */

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
    const p = this.pilote;
    const DOMINANCE = 14;
    /* Une branche emerge de la PAROI LATERALE du tube, pas de son axe. Faire
       naitre l'apex sur l'axe le posait a 0 px de la paroi parente : des que la
       tolerance d'age de 1 s expirait, il fusionnait avec son propre parent et
       ramifier etait une mort differee. Mesure : 18 fusions sur 20 manches.
       On le decale donc d'un rayon de tube, du cote ou il part. */
    const cote0 = this.rng() < 0.5 ? -1 : 1;
    const px0 = p.x - Math.cos(p.dir) * DOMINANCE;
    const py0 = p.y - Math.sin(p.dir) * DOMINANCE;
    const bx = px0 + Math.cos(p.dir + cote0 * Math.PI / 2) * 7;
    const by = py0 + Math.sin(p.dir + cote0 * Math.PI / 2) * 7;
    /* Angle de branchement : 62 a 88 deg du cap parent, ce qui est la plage
       reellement observee. Les septines l ouvrent encore. */
    const ecart = (62 + this.rng() * 26 + st.brancheAngle) * Math.PI / 180;
    const ang = Apex.borner(p.dir + cote0 * ecart);
    const b = this.thalle.nouvelleBranche(p.branche.id, bx, by);
    const na = new Apex(b, bx, by, ang, { phase: p.phase + Math.PI, lance: st.brancheVit });
    this.S -= st.coutBranche;
    this.apex.push(na);
    /* La dominance passe a la branche : c est elle qu on vient de choisir, et
       la camera doit suivre la decision du joueur, pas l inertie. Le parent
       continue en autonome — il reste une vie et une source de revenus. */
    this.pilote.pilote = false;
    na.pilote = true;
    this.pilote = na;
    this.dire('RAMIFICATION', 'bon');
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
    if (this.S < 0.35) { this.dire('SUCRE INSUFFISANT', 'mal'); return false; }
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
      substrat: ech.substrat.nom, boucle: ech.boucle,
      aw: Math.round(ech.aw * 1000) / 1000,
      temp: Math.round(ech.temp * 10) / 10,
      af: ech.af, charge: this.charge,
      noeuds: this.noeuds, granules: this.granules, rates: this.rates,
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
