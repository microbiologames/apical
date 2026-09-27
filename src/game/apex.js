/* ---------------------------------------------------------------------------
   L'apex : le modele de croissance apicale, et le seul endroit ou il vit.

   TROIS FAITS PHYSIOLOGIQUES, TROIS MECANIQUES. Rien d autre.

   1. LE TURGOR POUSSE, LA PAROI RETIENT.
      L extension suit la loi de Lockhart, employee telle quelle pour les
      cellules a croissance apicale :

          v = Phi x (P - Y)     si P > Y,  sinon 0

      Phi = extensibilite de la paroi, Y = seuil de fluage, P = turgor
      (0,2 a 1,5 MPa mesures sur des hyphes ; on normalise 1,0 = 1,2 MPa).
      Consequence de jeu majeure : la vitesse N EST PAS une statistique, c est
      le resultat d une pression que le joueur depense. En dessous de Y, rien
      ne bouge, quelle que soit la quantite d ameliorations.

   2. ON PILOTE LE CAP, ET LE SPITZENKORPER EN EST LA CONSEQUENCE.
      Premiere version : le joueur barrait le SPK et l apex suivait avec un
      retard du premier ordre. Fidele au modele du centre d approvisionnement en
      vesicules — le SPK avance, rayonne, et l apex est la ou les vesicules
      arrivent — mais REFUSE A L ESSAI : deux commandes en cascade (barre -> SPK
      -> apex) donnaient un pilotage qu on ne sentait pas, et afficher le SPK
      comme un corps net en faisait une poignee de commande qui n en etait pas
      une.
      Maintenant : le joueur agit sur la VITESSE ANGULAIRE du cap, avec une
      inertie de 0,34 s. On amorce un virage, il monte, et il continue un peu
      quand on lache — c est de la conduite, pas de la correction. Le SPK, lui,
      est CALCULE a partir du taux de virage et dessine en nuee diffuse : il
      reste ce qu il est reellement, l endroit vers lequel les vesicules
      convergent, et il indique l intention de virage sans etre la commande.
      L inversion de causalite est assumee : la position du SPK et la direction
      de croissance sont deux faces du meme phenomene, et seule la premiere se
      voit.

   3. LA CROISSANCE EST PULSEE, PAS CONTINUE.
      Des bouffees de Ca2+ synchronisent l assemblage d actine et l exocytose :
      les vesicules s accumulent au SPK pendant une phase lente, puis partent
      d un coup. L extension se fait PAR PALIERS, c est mesure. L animation en
      vit, et le gain d absorption est cale sur le creux du pulse, la ou l apex
      s attarde : ralentir n est donc pas subir, c est encaisser.

   4. L EPAISSEUR DE PAROI EST LE RESULTAT, PAS UN REGLAGE.
      Le materiau arrive a debit J borne (les chitine et glucane synthases ne
      vont pas plus vite). Etale sur une longueur v, il donne une epaisseur
      e = J / v. Aller vite AMINCIT LA PAROI. Sous une epaisseur critique, le
      turgor l emporte et l apex ECLATE — ce qui est litteralement le mode
      d action des echinocandines. La vitesse n est donc jamais gratuite, et
      aucune amelioration ne peut lever cet arbitrage : elle ne peut que le
      deplacer.
--------------------------------------------------------------------------- */

import { clamp, lerp, TAU } from '../core/util.js';

/** Cap borne a +/- 78 deg de l avant. */
export const CAP_MAX = 1.3614;
/** L avant du monde : y croissant. */
export const AVANT = Math.PI / 2;

/* Epaisseur en dessous de laquelle la paroi flue puis cede. 0,55 pour une
   epaisseur nominale de 1,3 a vitesse nominale : il faut donc PRESQUE
   DOUBLER la vitesse nominale pour se mettre en danger, ce qui laisse au
   joueur une marge qu il peut sentir avant de la franchir. */
export const E_CRIT = 0.55;
/* Vitesse plancher du denominateur de e = J/v. Sans elle, un apex a l arret
   affiche une paroi infinie et la jauge de sucre ne veut plus rien dire. */
const V_PLANCHER = 3;

export class Apex {
  constructor(branche, x, y, ang, opts = {}) {
    this.branche = branche;
    this.x = x; this.y = y;
    /* Le SPK est DERRIERE l apex, a `spkDist`. C est lui qui porte le cap. */
    /* `cap` est le cap REEL, borne a l avant. `omega` est sa vitesse angulaire,
       et c est elle que la barre commande — d ou l inertie. */
    this.cap = ang;
    this.omega = 0;
    /* Le SPK n a plus de cap propre : sa position est recalculee a chaque pas a
       partir du cap et du taux de virage. Il ne sert qu au rendu. */
    this.spk = { x: x - Math.cos(ang) * 6, y: y - Math.sin(ang) * 6 };
    this.dir = ang;
    this.v = 0;
    this.e = 1.1;             // epaisseur de paroi en cours de depot
    this.integrite = 1;
    this.pilote = !!opts.pilote;
    this.vivant = true;
    this.age = 0;
    this.parcouru = 0;      // um parcourus depuis la naissance
    /* Phase du pulse calcique. Desynchronisee a la naissance : deux apex qui
       pulsent ensemble donnaient un battement visuel qui se lisait comme un
       defaut de rendu. */
    /* Jamais Math.random : la phase doit venir du generateur de la manche, sinon
       deux executions de la meme graine divergent et le banc cesse de mesurer. */
    this.phase = opts.phase !== undefined ? opts.phase : 0;
    this.mort = null;          // cause, pour l ecran de fin
    this.contact = 0;          // proximite de son propre thalle, 0..1 (HUD)
    this.lance = opts.lance || 0;
  }

  /** Cap borne : jamais vers l arriere, l amplitude laterale reste large. */
  static borner(ang) {
    return clamp(ang, AVANT - CAP_MAX, AVANT + CAP_MAX);
  }

  /**
   * Vitesse d extension instantanee, loi de Lockhart modulee.
   *
   * `ft` est le facteur thermique, `pulse` le facteur de pulsation. Le pulse
   * multiplie la VITESSE et non le materiau : c est la difference entre une
   * croissance par paliers (ce qu on observe) et une croissance saccadee en
   * epaisseur (ce qu on n observe pas).
   */
  vitesse(P, stats, drive, ft) {
    /* Consolider ferme l apex : cela remonte le seuil de fluage, ce qui est la
       description correcte d une paroi apicale qui se rigidifie. On ne touche
       PAS a Phi : Phi est une propriete du materiau, pas une commande. */
    /* 0,75 : a fond de consolidation, le seuil de fluage passe AU-DESSUS du
       plafond de turgor et l'hyphe s'ARRETE net. C'est le regime 0, et c'est
       une demande explicite : pouvoir s'immobiliser pour regarder devant soi et
       pour cesser de bruler de la matiere. Physiologiquement c'est un apex qui
       se ferme — la paroi apicale se rigidifie et ne flue plus — et non une
       pause : le cytoplasme continue de couler, le turgor remonte, le sucre
       rentre. La valeur precedente (0,34) laissait 4,4 um/s au regime le plus
       bas, ce qui n'est pas un arret. */
    const y = stats.yseuil + (drive < 0 ? -drive * 0.75 : 0);
    const base = Math.max(0, stats.phi * (P - y));
    /* `germ` porte la germination : une spore ne demarre pas a pleine vitesse.
       Voir Game.facteurGerm. */
    return base * ft * (stats.germ === undefined ? 1 : stats.germ) * this.facteurPulse(stats);
  }

  /** 0,62 a 1,38 : les paliers sont VISIBLES, jamais des a-coups. */
  facteurPulse(stats) {
    const amp = 0.38 + (stats.pulse || 0) * 0.22;
    return 1 + Math.sin(this.phase) * amp;
  }

  /** Vrai quand l apex est dans le creux du pulse : c est la qu il absorbe. */
  get creux() { return Math.sin(this.phase) < -0.25; }

  /**
   * Un pas de croissance. Ne touche a aucune ressource globale : le turgor et
   * le sucre appartiennent au thalle entier (un seul protoplaste, pores
   * septaux ouverts, flux de masse mesure a 5 um/s), et c est game.js qui en
   * tient la comptabilite.
   *
   * @returns {number} la longueur produite pendant dt, en px
   */
  pas(dt, P, stats, barre, drive, ft, thalle, t) {
    this.age += dt;
    /* Cadence du pulse : 1,55 Hz. Cale sur la periode de renouvellement des
       vesicules du SPK mesuree en FRAP (1,3 a 2,5 min) ramenee a l echelle de
       temps du jeu (1 s de jeu = 1 min de biologie). Ce n est donc pas un
       chiffre d animation : c est la vraie horloge de l organite. */
    this.phase = (this.phase + dt * 1.15 * TAU) % TAU;

    let v = this.vitesse(P, stats, drive, ft);
    /* RETROACTION DE DISETTE. Un apex a court de materiau de paroi ne fonce pas
       vers sa propre rupture : il SE FERME. L'extension ralentit jusqu'a ce que
       le materiau disponible suffise a maintenir une paroi viable. C'est une
       vraie boucle de regulation — la synthese parietale et le fluage sont
       couples a l'apex — et c'etait le chainon manquant du modele.
       Sans elle, manquer de sucre tuait TOUJOURS, et par la meme mort : 23
       manches sur 24 en « carence puis lyse », une table des causes uniforme, et
       un jeu ou la famine ne laissait aucune fenetre pour reagir ou pour
       encaisser.
       Elle est VOLONTAIREMENT IMPARFAITE : elle ne peut retirer que 82 % de la
       vitesse demandee. Aux regimes bas, cela suffit a rester au-dessus du seuil
       de rupture, donc la disette se traduit par un ARRET et non par une mort.
       Aux regimes hauts, la demande residuelle depasse encore ce que la paroi
       peut encaisser : FORCER EN PLEINE DISETTE reste mortel, et c'est la seule
       facon de mourir de lyse. La famine retire la vitesse, le joueur retire
       sa vie. */
    const vViable = stats.jmaxEff / (E_CRIT * 1.2);
    if (v > vViable) v = Math.max(vViable, v * 0.18);
    this.v = v;

    /* --- barre : on agit sur la VITESSE ANGULAIRE ----------------------
       SIGNE. L ecran a son y vers le HAUT alors qu un angle mathematique croit
       dans le sens trigonometrique : partant du cap « avant » (pi/2), AJOUTER a
       l angle fait donc tourner vers la GAUCHE de l ecran. La premiere version
       ajoutait `barre` tel quel, et la touche de droite faisait virer a gauche.
       Defaut signale a l essai, confirme au calcul : cos(pi/2 + 0,5) = -0,48.
       On SOUSTRAIT donc, et `barre` positif veut dire droite a l ecran.

       AMPLITUDE. La vitesse de virage decroit avec la vitesse d avance : le
       rayon de courbure qu un cone apical peut decrire est borne. A 20 um/s,
       omega = 0,35 rad/s donc R = 57 um (quatre diametres de tube) ; a 35 um/s,
       R = 129 um. Une hyphe ne fait pas d epingle a cheveux.

       INERTIE. 0,34 s de constante de temps sur omega, pas sur le cap : c est
       ce qui donne la sensation de barre. Sur le cap, l inertie aurait donne un
       retard ; sur la vitesse angulaire, elle donne un ELAN. */
    const omegaMax = stats.agilite / (1 + v / 34);
    const cible = -barre * omegaMax;
    this.omega += (cible - this.omega) * (1 - Math.exp(-dt / 0.34));
    const capVoulu = this.cap + this.omega * dt;
    this.cap = Apex.borner(capVoulu);
    /* Contre la butee de cap, l elan se casse au lieu de s accumuler : sans
       cela on restait colle a +/-78 deg pendant une seconde apres avoir lache. */
    if (Math.abs(capVoulu - this.cap) > 1e-9) this.omega *= 0.25;

    const px = this.x, py = this.y;
    this.x += Math.cos(this.cap) * v * dt;
    this.y += Math.sin(this.cap) * v * dt;
    this.dir = this.cap;
    const d = Math.hypot(this.x - px, this.y - py);

    /* --- le Spitzenkorper, DEDUIT du virage ---------------------------
       Il se tient a `spkDist` en arriere du bout, et il se DECALE du cote
       interieur du virage — c est ce que fait le vrai organite, et c est de ce
       decalage que nait la courbure dans le modele du centre
       d approvisionnement. On le calcule donc au lieu de le piloter, et il
       redevient une information : voir ou penche la nuee, c est voir ou l on
       va avant que le tube ne l ait montre. */
    const lat = clamp(this.omega / Math.max(0.05, omegaMax), -1, 1) * stats.spkDist * 0.55;
    this.spk.x = this.x - Math.cos(this.cap) * stats.spkDist + Math.cos(this.cap - Math.PI / 2) * lat;
    this.spk.y = this.y - Math.sin(this.cap) * stats.spkDist + Math.sin(this.cap - Math.PI / 2) * lat;

    /* --- epaisseur de paroi : e = min(consigne, J / v) -----------------
       LE FLUX MAXIMAL EST UN PLAFOND, PAS UNE CONSIGNE. La premiere version
       posait e = J/v tout court, donc une cellule bien pourvue en synthases
       deposait une paroi inutilement epaisse a toute vitesse. Consequence
       mesuree au banc : le cout de paroi valant COUT_PAROI x e x v = COUT_PAROI
       x J, acheter des chitine synthases achetait surtout une FACTURE. Une
       construction CHS x4 + FKS x4 mourait plus vite (311 um de profondeur) que
       la meme sans genes de paroi (666 um). Un gene de securite qui tue est un
       gene casse.
       Une cellule construit sa paroi a une EPAISSEUR CIBLE et n'utilise sa
       capacite de synthese excedentaire que quand la vitesse l'exige. Les
       synthases repoussent donc la vitesse a laquelle la paroi commence a
       s'amincir — au flux de base, 21 px/s ; avec CHS x4, 35 px/s — sans rien
       couter de plus en croisiere. C'est exactement ce qu'un gene de paroi doit
       acheter. */
    const eNom = Math.min(stats.eMax,
      stats.eNom * (1 + (drive < 0 ? -drive * 0.28 : 0)));
    const eCible = clamp(Math.min(eNom, stats.jmaxEff / Math.max(v, V_PLANCHER)),
      0, stats.eMax);
    /* Rigidification progressive : la paroi met du temps a prendre. 0,18 s de
       constante de temps, soit environ 11 px de tube a vitesse nominale — la
       longueur reelle de la zone encore extensible derriere un apex. */
    this.e = lerp(this.e, eCible, 1 - Math.exp(-dt / 0.18));

    /* --- integrite : le turgor contre une paroi trop mince ------------ */
    if (this.e < E_CRIT) {
      this.integrite -= (E_CRIT - this.e) * Math.max(P, 0.2) * 2.6 * dt;
      if (this.integrite <= 0) { this.integrite = 0; this.tuer('lyse'); }
    } else {
      this.integrite = Math.min(1, this.integrite + stats.integrite * dt);
    }

    if (d > 0.02) thalle.deposer(this.branche, this.x, this.y, this.e, t);
    this.parcouru += d;
    return d;
  }

  tuer(cause) {
    if (!this.vivant) return;
    this.vivant = false;
    this.mort = cause;
  }
}
