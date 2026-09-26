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

   2. L APEX NE SE PILOTE PAS. ON PILOTE LE SPITZENKORPER.
      Le modele du « centre d approvisionnement en vesicules » dit que la forme
      de l hyphe est la trace geometrique du deplacement du SPK : le SPK avance,
      rayonne ses vesicules, et l apex est la ou elles arrivent. Le joueur
      barre donc le SPK, et l apex SUIT, avec un retard. C est ce retard qui
      donne au pilotage sa profondeur : on anticipe, on ne corrige pas.

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
    this.spk = { x: x - Math.cos(ang) * 6, y: y - Math.sin(ang) * 6, ang };
    this.dir = ang;
    this.v = 0;
    this.e = 1.1;             // epaisseur de paroi en cours de depot
    this.integrite = 1;
    this.pilote = !!opts.pilote;
    this.vivant = true;
    this.age = 0;
    /* Phase du pulse calcique. Desynchronisee a la naissance : deux apex qui
       pulsent ensemble donnaient un battement visuel qui se lisait comme un
       defaut de rendu. */
    this.phase = opts.phase !== undefined ? opts.phase : Math.random() * TAU;
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
    /* 0,34 et non 0,22 : mesure au banc, a 0,22 la consolidation complete ne
       descendait qu a 13 px/s contre 23 en poussee, soit 1,8x d amplitude. La
       commande ne se SENTAIT pas. A 0,34 l amplitude est de 2,4x, et avec la
       pulsation la vitesse instantanee couvre 6 a 33 px/s. */
    const y = stats.yseuil + (drive < 0 ? -drive * 0.34 : 0);
    const base = Math.max(0, stats.phi * (P - y));
    return base * ft * this.facteurPulse(stats);
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
    this.phase = (this.phase + dt * 1.55 * TAU) % TAU;

    const v = this.vitesse(P, stats, drive, ft);
    this.v = v;

    /* --- barre : on tourne le SPK -------------------------------------
       La vitesse de virage DECROIT avec la vitesse d avance. Ce n est pas une
       penalite arbitraire : le rayon de courbure que le SPK peut decrire est
       borne par la geometrie du cone apical, donc plus il avance vite, plus la
       courbe est large. C est le coeur de l arbitrage du jeu — la vitesse
       achete de la distance et vend de la precision. */
    const omega = stats.agilite / (1 + v / 22);
    this.spk.ang = Apex.borner(this.spk.ang + barre * omega * dt);
    this.spk.x += Math.cos(this.spk.ang) * v * dt;
    this.spk.y += Math.sin(this.spk.ang) * v * dt;

    /* --- l apex suit le SPK ------------------------------------------
       Premier ordre, constante de temps 70 ms. C est ce retard qui fait la
       « main » du jeu : trop court, le pilotage devient nerveux et la courbe
       perd sa signature d hyphe ; trop long, on ne rattrape plus un obstacle. */
    const cx = this.spk.x + Math.cos(this.spk.ang) * stats.spkDist;
    const cy = this.spk.y + Math.sin(this.spk.ang) * stats.spkDist;
    const k = 1 - Math.exp(-dt / 0.07);
    const px = this.x, py = this.y;
    this.x = lerp(this.x, cx, k);
    this.y = lerp(this.y, cy, k);
    const dx = this.x - px, dy = this.y - py;
    const d = Math.hypot(dx, dy);
    if (d > 0.02) this.dir = Math.atan2(dy, dx);

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
    return d;
  }

  tuer(cause) {
    if (!this.vivant) return;
    this.vivant = false;
    this.mort = cause;
  }
}
