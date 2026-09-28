/* ---------------------------------------------------------------------------
   Le contenu de l'hyphe : vesicules, granulation, organites, molecules.

   Tout vit en coordonnees de TUBE (s, v) :
     s = abscisse curviligne depuis la pointe de l'apex, um, toujours >= 0
     v = ecart lateral signe, um
   et n'est projete en monde qu'au moment du rendu. Deux consequences, toutes
   les deux voulues :

     - rien ne peut sortir du tube, la contrainte |v| < W(s) est exacte et
       verifiee AVANT le rendu, pas apres ;
     - quand l'apex avance de `da`, tout le contenu s'eloigne de la pointe
       de `da` sans qu'on ait rien a deplacer : s += da. Le flux de masse
       vers l'apex est le terme oppose. C'est litteralement le bilan de
       Lew 2011 (fig. 2b) : la croissance consomme, le flux reapprovisionne.

   Chiffres de la publi (Lew, Nat Rev Microbiol 9:509, 2011) :
     croissance 20 um/min = 0,33 um/s ; flux de masse ~5 um/s mesure a 1 cm
     du front ; diametre ~15 um ; Ca2+ apical liberant la fusion des
     vesicules ; le Ca2+ est repompe juste derriere par le RE et les
     mitochondries, d'ou un gradient qui ne diffuse pas.

   SIMPLIFICATIONS ASSUMEES, toutes visuelles :
     - les vesicules font 70-100 nm, soit 1 px a ce grossissement. On les
       dessine a l'echelle x5 : un objet d'un pixel n'a ni rebond ni fusion
       lisibles, et « l'experience visuelle est la plus importante ».
     - le Spitzenkorper d'un Neurospora contient ~10^4 vesicules. On en
       simule ~80. Il n'est JAMAIS dessine comme un objet : c'est la densite
       des vesicules retenues qui le fait apparaitre, ou pas.
     - le flux de masse est ramene a ~1,2 um/s. A 5 um/s tout traverse le
       champ en 5 s : ce n'est plus apaisant, c'est un torrent.
--------------------------------------------------------------------------- */

import { clamp, lerp, smoothstep, mulberry32, TAU } from '../core/util.js';
import { distParoi } from './hyphe.js';
import { Membrane, zonesFusion } from './membrane.js';

/* um de tube PEUPLE derriere l'apex : vesicules, grains, organites, depots.
   34 suffisait tant que la camera suivait l'apex — au-dela, la coupe du tube
   etait hors champ de toute facon. Elle ne l'est plus : le tube est dessine
   sur 200 um (Scene.S_VU) pour qu'une jonction de branche ne finisse pas
   accrochee a un moignon, et un tube dessine mais vide se voit. 70 um
   couvrent le cadre au grossissement le plus faible, avec de la marge. */
export const S_MAX = 70;
/* La MEMBRANE, elle, reste simulee sur 34 um. C'est une corde integree tous
   les 0,09 um : la prolonger doublerait le cout pour une ligne qui, au-dela
   de dix micrometres, est plate — son surplus est absorbe depuis longtemps.
   Scene.membraneLigne prolonge le TRACE le long de la paroi, sans simuler. */
export const S_MEMB = 34;
const FLUX = 1.2;                 // um/s, vitesse du flux de masse pres du front
const ZONE_APICALE = 7.5;         // um : zone d'exclusion des organites
/* um verses par fusion moyenne. Se recalibre a chaque fois qu'on change le
   nombre de vesicules : a 95 vesicules la cadence tombe a ~1,4 fusion/s, il
   faut donc verser plus a chaque fois pour tenir les 20 um/min de
   Neurospora. Mesure au banc, jamais estimee. */
const Q_FUSION = 0.300;
const TAUX_LIBERATION = 0.10;     // /s par vesicule retenue, x le pulse Ca2+
/* La coalescence entre vesicules est un ornement, pas un debit. A 0,85 /s
   par paire en contact elle vidait le reservoir a 8 fusions/s, vingt fois
   plus vite que l'exocytose : le Spitzenkorper ne se formait jamais. */
const TAUX_COALESCENCE = 0.045;
/* Epaisseur de l'enveloppe : paroi (0,1-0,3 um) + espace periplasmique +
   membrane plasmique (7 nm). Une vesicule fusionne avec la MEMBRANE, pas
   avec la paroi : elle s'arrete donc a PEAU du contour exterieur, et son
   contenu est deverse entre les deux. Le chiffre est exagere — la membrane
   fait 7 nm, soit un quinzieme de pixel — mais la distinction est le
   mecanisme meme de la croissance parietale. */
const PEAU = 0.14;
/* Duree d'une fusion membranaire. A 0,42 s l'evenement passait avant qu'on
   ait pu le lire ; c'est le moment central de la simulation, il a droit a
   une seconde. */
export const DUREE_FUSION = 0.85;

/** Tirage gaussien reduit, Box-Muller. */
function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
}

/** Profil du flux : il s'annule a la pointe, ou la matiere est consommee. */
function flux(s) { return FLUX * (0.22 + 0.78 * smoothstep(0.4, 9, s)); }

export class Contenu {
  constructor(hy, opts = {}) {
    this.hy = hy;
    this.rng = mulberry32(opts.graine ?? 20260928);
    this.t = 0;

    this.ves = [];
    this.grains = [];
    this.organites = [];
    this.mols = [];
    /* Traces de paroi neuve. Chaque exocytose en pose une ; elle glisse
       ensuite du pole vers l'epaule puis descend le flanc et sort du champ.
       C'est le seul repere qui rend la croissance apicale VISIBLE : sans
       lui, une paroi uniforme a l'air immobile meme quand l'apex avance. */
    this.depots = [];
    /* La membrane plasmique est une ligne continue ancree dans le materiau :
       c'est elle qui porte les figures de fusion, plus le rendu. */
    /* Une BRANCHE ne simule pas 34 um : elle n'en a pas encore. `sMax` suit
       la longueur reellement construite, moins la calotte arriere ou le
       tube se referme — sans cette borne les vesicules s'entassaient dans
       le fond du bourgeon, la ou W(s) tend vers zero. */
    this.sMax = opts.sMax ?? S_MAX;
    this.membrane = new Membrane(hy, Math.min(this.sMax, S_MEMB), S_MEMB);
    this.zones = [];
    this.fusions = 0;             // compteur, sert au banc

    /* Bilan de croissance. Les fusions versent dans la reserve, l'hyphe
       tire dessus a travers un passe-bas : la paroi ne se construit pas en
       une image. Sans ce lissage, chaque exocytose faisait sauter l'apex
       de 2,8 px d'un coup — l'extension est pulsee, pas saccadee. */
    this.reserveA = 0; this.reserveC = 0;
    this.avance = 0; this.couple = 0;

    this.nVes = opts.nVes ?? Math.round(2.79 * this.sMax);
    this.nGrains = opts.nGrains ?? Math.round(18.82 * this.sMax);
    /* Densites lineiques, relevees sur l'hyphe mere : 2,79 vesicule/um,
       18,82 grain/um, 0,47 organite/um. Elles servent a `etendre` : une
       branche qui s'allonge doit se peupler au meme regime, sinon son
       cytoplasme s'eclaircit a mesure qu'elle grandit. */
    this.densVes = this.nVes / this.sMax;
    this.densGrains = this.nGrains / this.sMax;

    for (let i = 0; i < this.nVes; i++) this.ves.push(this.naitreVesicule(this.rng() * this.sMax));
    for (let i = 0; i < this.nGrains; i++) this.grains.push(this.naitreGrain(this.rng() * this.sMax));
    this.peuplerOrganites();
  }

  /* --- naissances -------------------------------------------------------- */

  naitreVesicule(s) {
    const hy = this.hy;
    /* Une vesicule reapparait au bord du champ, jamais au milieu : une
       vesicule qui apparait en plein cadre se voit. Le tapis roulant
       s'auto-regule ensuite — si le pool se vide, il libere moins, donc il
       se remplit. */
    if (s === undefined) s = this.sMax + this.rng() * 1.5;
    const w = hy.W(s);
    const r = this.rng();
    /* Deux populations. Les chitosomes (30-40 nm) portent la chitine
       synthase, les macrovesicules (70-100 nm) le materiau de paroi. A
       l'ecran : petites vives, grosses molles. */
    const grosse = r > 0.42;
    return {
      s,
      v: (this.rng() * 2 - 1) * w * 0.72,
      vs: 0, vv: 0,
      /* Rayons apparents. Une macrovesicule fait 70-100 nm et un chitosome
         30-40 nm : a ce grossissement, moins d'un pixel. On grossit x6, pas
         plus — mesure a x13 (r = 0,40-0,58 um) le champ n'etait plus qu'un
         tas de bulles et le cytoplasme avait disparu. */
      r: grosse ? lerp(0.22, 0.31, this.rng()) : lerp(0.12, 0.18, this.rng()),
      grosse,
      z: this.rng() * 2 - 1,
      vz: (this.rng() * 2 - 1) * 0.06,
      etat: 0,        // 0 transit, 2 retenue au Spk, 3 en route, 1 fusion
      tf: 0,
      phi: 0,
      am: 0, cotem: 1, // position materielle de la fusion, et de quel cote
      emis: 0,        // grains de materiau deja sortis de la poche
      cs: 0, cv: 0,   // point de membrane vise
      pont: 0,                    // temps restant d'un pont de fusion ves-ves
      pontS: 0, pontV: 0,
    };
  }

  naitreGrain(s) {
    const w = this.hy.W(s);
    return {
      s,
      v: (this.rng() * 2 - 1) * w * 0.94,
      z: this.rng() * 2 - 1,
      /* um, pas px : 0,11 um fait 1,4 px au cadrage par defaut, et grossit
         avec le zoom comme tout ce qui est dans le tube. */
      r: this.rng() < 0.22 ? 0.108 : 0.062,
      clair: this.rng() < 0.45,
    };
  }

  /**
   * Allonge le domaine simule. Pour une BRANCHE uniquement : elle nait avec
   * un demi-micrometre de tube et finit par en avoir 34.
   *
   * Les nouvelles particules naissent au FOND du champ (s = sMax), jamais
   * au milieu : une vesicule qui apparait en plein cadre se voit. C'est la
   * meme regle que pour le recyclage ordinaire.
   */
  etendre(sMax) {
    const v = Math.min(sMax, S_MAX);
    if (v <= this.sMax + 1e-6) return;
    this.sMax = v;
    this.membrane.sMax = Math.min(v, S_MEMB);
    const nv = Math.round(this.densVes * v);
    while (this.ves.length < nv) this.ves.push(this.naitreVesicule());
    const ng = Math.round(this.densGrains * v);
    while (this.grains.length < ng) this.grains.push(this.naitreGrain(v - this.rng() * 1.2));
    const no = Math.round(0.47 * v);
    while (this.organites.length < no) this.ajouterOrganite(v + this.rng() * 1.5);
  }

  /** Un organite de plus, tire au sort, pose a l'abscisse s. */
  ajouterOrganite(s) {
    const t = this.rng();
    const [type, a, b] = t < 0.07 ? ['noyau', 1.30, 0.86]
                       : t < 0.50 ? ['mito', 1.10, 0.26]
                       : t < 0.70 ? ['vacuole', 0.62, 0.55]
                       : ['re', 2.20, 0.09];
    const w = this.hy.W(s);
    this.organites.push({
      type, s,
      v: (this.rng() * 2 - 1) * w * 0.6,
      vs: 0, vv: 0,
      a: a * lerp(0.82, 1.2, this.rng()),
      b: b * lerp(0.82, 1.2, this.rng()),
      ang: this.rng() * TAU,
      dang: (this.rng() * 2 - 1) * 0.12,
      z: this.rng() * 2 - 1,
      zone: ZONE_APICALE + a + this.rng() * 7,
    });
  }

  peuplerOrganites() {
    if (this.sMax < ZONE_APICALE + 4) return;   // une branche naissante n'en a pas
    /* Un organite trop gros ou trop contraste devient un dessin d'ecolier
       pose dans le tube. On reste sous la taille reelle basse : noyau 2,6 um
       de long, mitochondrie 2,2 um, vacuole 1,1 um de diametre. */
    const types = [
      ['noyau', 1, 1.30, 0.86],
      ['mito', 7, 1.10, 0.26],
      ['vacuole', 3, 0.62, 0.55],
      ['re', 5, 2.20, 0.09],
    ];
    for (const [type, n, a, b] of types) {
      for (let i = 0; i < n; i++) {
        const s = ZONE_APICALE + 1.5 + this.rng() * (this.sMax - ZONE_APICALE - 2);
        const w = this.hy.W(s);
        this.organites.push({
          type, s,
          v: (this.rng() * 2 - 1) * w * 0.6,
          vs: 0, vv: 0,
          a: a * lerp(0.82, 1.2, this.rng()),
          b: b * lerp(0.82, 1.2, this.rng()),
          ang: this.rng() * TAU,
          dang: (this.rng() * 2 - 1) * 0.12,
          z: this.rng() * 2 - 1,
          zone: ZONE_APICALE + a + this.rng() * 7,
        });
      }
    }
  }

  /* --- gradient de calcium ---------------------------------------------- */

  /**
   * Ca2+ local. Apical (Lew 2011 fig. 6a), pulse, et biaise angulairement
   * par la consigne de direction : c'est CE biais qui fait tourner l'apex,
   * jamais un « cap » applique de force a la geometrie.
   */
  ca(s, phi, phiCible) {
    const apical = Math.exp(-s / 2.3);
    const dphi = phi - phiCible;
    const angulaire = Math.exp(-(dphi * dphi) / (2 * 0.62 * 0.62));
    return apical * (0.30 + 0.70 * angulaire) * this.pulse;
  }

  /* --- mise a jour ------------------------------------------------------- */

  maj(dt, phiCible, opts = {}) {
    const hy = this.hy;
    const da = hy.avanceFrame;
    this.t += dt;

    /* Pulses de Ca2+ : l'extension d'un hyphe est en marches d'escalier,
       pas lineaire. Periode ~5,5 s, deux composantes non commensurables
       pour que ca ne batte pas. */
    this.pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(this.t * (TAU / 5.5)))
               + 0.16 * (0.5 + 0.5 * Math.sin(this.t * (TAU / 2.13) + 1.7));

    this.majVesicules(dt, da, phiCible, opts);
    this.majGrains(dt, da);
    this.majOrganites(dt, da);
    this.majMolecules(dt, da);
    this.majDepots(dt);

    /* La membrane recoit les fusions en cours et derive avec le materiau.
       Les zones sont calculees UNE fois et servent a la fois a la corde et
       au rendu : si les deux les calculaient chacun de leur cote, l'arc
       dessine et le creux de la chaine finiraient par ne plus coincider. */
    for (const v of this.ves) if (v.etat === 1) v.am += da;
    this.zones = zonesFusion(this.ves, DUREE_FUSION);
    this.membrane.maj(dt, da, this.zones);

    /* Constante 0,55 s : c'est la duree pendant laquelle une vesicule
       fusionnee verse son materiau dans la paroi. */
    const k = 1 - Math.exp(-dt / 0.55);
    this.avance = this.reserveA * k; this.reserveA -= this.avance;
    this.couple = this.reserveC * k; this.reserveC -= this.couple;
  }

  /**
   * Point de la calotte vise pour un angle phi (0 = droit devant,
   * +-PI/2 = l'epaule). Inversion du profil : sur l'ellipse
   * u^2 + (v/R)^2 = 1, la normale d'angle phi touche le point
   *   u = Lc.k.cos(phi), v = R^2.k.sin(phi),  k = 1/hypot(Lc cos, R sin).
   */
  cible(phi) {
    const hy = this.hy, Lc = hy.Lc, R = hy.R;
    const ph = clamp(phi, -1.5, 1.5);
    const ap = Math.abs(ph);
    if (ap > Math.PI / 2 - 0.02) {
      /* au-dela de l'epaule : on vise le flanc du cylindre */
      const s = Lc + (ap - Math.PI / 2 + 0.02) * R * 2.2;
      return { s, v: Math.sign(ph) * (hy.W(s) - 0.05) };
    }
    const c = Math.cos(ph), sn = Math.sin(ph);
    const k = 1 / Math.hypot(Lc * c, R * sn);
    return { s: Lc * (1 - Lc * k * c), v: R * R * k * sn };
  }

  majVesicules(dt, da, phiCible, opts) {
    const hy = this.hy, rng = this.rng, ves = this.ves;
    const dp = { ds: 0, dv: 0, phi: 0 };
    const sSpk = 2.05 + 0.3 * Math.sin(this.t * 0.62);

    for (let i = 0; i < ves.length; i++) {
      const p = ves[i];
      p.s += da;
      if (p.pont > 0) p.pont -= dt;

      /* --- exocytose en cours : arrimee, elle ne derive plus ------------- */
      if (p.etat === 1) {
        p.tf += dt;
        /* Le contenu sort PENDANT que la poche s'ouvre, pas a la fin.
           Emis d'un coup au terme de l'evenement, les grains apparaissaient
           quand l'omega s'etait deja referme : on voyait des points blancs
           surgir de nulle part au lieu d'un deversement. */
        const k = p.tf / DUREE_FUSION;
        if (k > 0.22) {
          const vise = Math.round((p.grosse ? 11 : 6) * clamp((k - 0.22) / 0.62, 0, 1));
          while (p.emis < vise) { this.grainDeverse(p); p.emis++; }
        }
        if (p.tf > DUREE_FUSION) { this.livrer(p); ves[i] = this.naitreVesicule(); }
        continue;
      }

      p.z = clamp(p.z + p.vz * dt, -1, 1);
      if (p.z <= -1 || p.z >= 1) p.vz = -p.vz;

      if (p.etat === 0) {
        /* --- transit : le flux de masse l'amene vers l'apex -------------- */
        const f = flux(p.s);
        p.vs += (-f - p.vs) * clamp(dt * 3.4, 0, 1);
        p.vv += (0 - p.vv) * clamp(dt * 3.0, 0, 1);
        p.vs += (rng() * 2 - 1) * 1.4 * dt;
        p.vv += (rng() * 2 - 1) * 1.4 * dt;
        if (p.s < 4.6) { p.etat = 2; p.tf = 0; }
      } else if (p.etat === 2) {
        /* --- retenue. C'est CE puits qui fait apparaitre le
           Spitzenkorper : il n'est jamais dessine, c'est une densite. ----- */
        p.vs += -(p.s - sSpk) * 2.6 * dt;
        p.vv += -p.v * 1.9 * dt;
        p.vs += (rng() * 2 - 1) * 2.4 * dt;
        p.vv += (rng() * 2 - 1) * 2.4 * dt;
        p.vs *= 1 - clamp(2.6 * dt, 0, 0.9);
        p.vv *= 1 - clamp(2.6 * dt, 0, 0.9);
        /* Liberation, cadencee par le pulse de Ca2+ : l'extension d'un
           hyphe se fait en marches, pas de facon continue. */
        if (opts.exocytose !== false && rng() < TAUX_LIBERATION * this.pulse * dt) {
          p.etat = 3; p.tf = 0;
          /* L'angle est tire autour de la consigne : c'est le seul endroit
             ou le pilotage entre dans la simulation. */
          p.phi = clamp(phiCible + gauss(rng) * 0.85, -1.45, 1.45);
          const c = this.cible(p.phi);
          p.cs = c.s; p.cv = c.v;
        }
      } else {
        /* --- en route vers la membrane ---------------------------------- */
        p.tf += dt;
        const ds = p.cs - p.s, dv = p.cv - p.v;
        const d = Math.hypot(ds, dv) || 1e-6;
        /* Elle ralentit en arrivant. A vitesse constante elle percutait la
           membrane, et « les deux membranes se touchent » ne se lisait pas :
           on voyait un choc, pas un contact. */
        const vit = 0.32 + 1.45 * smoothstep(0.12, 1.5, d);
        p.vs += (ds / d * vit - p.vs) * clamp(dt * 4.0, 0, 1);
        p.vv += (dv / d * vit - p.vv) * clamp(dt * 4.0, 0, 1);
        p.vs += (rng() * 2 - 1) * 0.8 * dt;
        p.vv += (rng() * 2 - 1) * 0.8 * dt;
        if (p.tf > 4) {
          /* Elle a rate sa cible. Elle ne retourne pas au reservoir — elle
             en vise une autre : un aller-retour se lisait comme une hesitation
             et bloquait plus de la moitie du debit. */
          p.tf = 0;
          p.phi = clamp(phiCible + gauss(rng) * 0.85, -1.45, 1.45);
          const c2 = this.cible(p.phi);
          p.cs = c2.s; p.cv = c2.v;
        }
      }

      p.s += p.vs * dt;
      p.v += p.vv * dt;
      if (p.s < 0.02) { p.s = 0.02; p.vs = Math.abs(p.vs) * 0.3; }
      if (p.s > this.sMax + 2.5) { ves[i] = this.naitreVesicule(); continue; }

      /* --- paroi : contrainte exacte, calotte comprise ------------------- */
      /* On soustrait PEAU : la vesicule bute sur la membrane plasmique,
         qui est en retrait de la paroi. */
      const dw0 = distParoi(hy, p.s, p.v, dp);
      const dw = dw0 - PEAU;
      if (dw < p.r) {
        const pen = p.r - dw;
        p.s += dp.ds * pen; p.v += dp.dv * pen;
        /* Rebond tres amorti : a ce nombre de Reynolds rien ne rebondit,
           tout se repousse lentement. */
        const vn = p.vs * dp.ds + p.vv * dp.dv;
        if (vn < 0) { p.vs -= 1.3 * vn * dp.ds; p.vv -= 1.3 * vn * dp.dv; }
        if (p.etat === 3 && opts.exocytose !== false) {
          p.etat = 1; p.tf = 0;
          /* Ancrage : le POINT DE CONTACT, pas le centre de la vesicule.
             `dp` est la direction rentrante et `dw0` la distance a la
             paroi : le point de contact est donc a (s,v) - dp.dw0. Ancrer
             sur le centre decalait l'omega d'un rayon, et pres du pole,
             ou la surface tourne vite, le decalage sautait d'une image a
             l'autre. Le cote se lit sur le contact, pas sur le signe de
             phi — au pole phi vaut zero a epsilon pres et son signe
             basculait d'un flanc a l'autre. */
          const cs = Math.max(p.s - dp.ds * dw0, 0);
          const cv = p.v - dp.dv * dw0;
          p.am = this.membrane.ageDepuisS(cs);
          p.cotem = cv >= 0 ? 1 : -1;
          p.emis = 0;
        }
      }
    }

    /* --- collisions ----------------------------------------------------- */
    /* n ~ 78, donc 3000 paires par image : pas besoin de grille. */
    for (let i = 0; i < ves.length; i++) {
      const a = ves[i];
      if (a.etat === 1) continue;
      for (let j = i + 1; j < ves.length; j++) {
        const b = ves[j];
        if (b.etat === 1) continue;
        const ds = b.s - a.s, dv = b.v - a.v;
        const rr = a.r + b.r;
        if (ds > rr || ds < -rr || dv > rr || dv < -rr) continue;
        const d = Math.hypot(ds, dv);
        if (d >= rr || d < 1e-5) continue;
        const nx = ds / d, ny = dv / d;
        const pen = rr - d;
        /* Une vesicule en route (3) est tractee sur un cable d'actine : elle
           ecarte le reservoir au lieu de s'y arreter. Symetrique, la moitie
           du debit d'exocytose restait coincee dans le nuage. */
        let wa = 0.5, wb = 0.5;
        if (a.etat === 3 && b.etat !== 3) { wa = 0.08; wb = 0.92; }
        else if (b.etat === 3 && a.etat !== 3) { wa = 0.92; wb = 0.08; }
        a.s -= nx * pen * wa; a.v -= ny * pen * wa;
        b.s += nx * pen * wb; b.v += ny * pen * wb;
        const rel = (b.vs - a.vs) * nx + (b.vv - a.vv) * ny;
        if (rel < 0) {
          const k = rel * 0.62;
          a.vs += k * nx * (wa * 2); a.vv += k * ny * (wa * 2);
          b.vs -= k * nx * (wb * 2); b.vv -= k * ny * (wb * 2);
        }
        /* Fusion homotypique, seulement dans le reservoir et seulement si
           le contact est LENT : c'est ce qui donne la lenteur de lampe a
           lave plutot qu'un tas de billes. */
        if (opts.fusion !== false && a.etat === 2 && b.etat === 2
            && Math.abs(rel) < 0.30 && a.pont <= 0 && b.pont <= 0
            && a.r < 0.34 && rng() < TAUX_COALESCENCE * dt) {
          this.fusionner(a, b, ves, j);
          break;
        }
      }
    }
  }

  /** Deux vesicules n'en font plus qu'une, volume conserve. */
  fusionner(a, b, ves, j) {
    const r = Math.cbrt(a.r * a.r * a.r + b.r * b.r * b.r);
    a.pontS = b.s; a.pontV = b.v; a.pont = 0.38;
    const m1 = a.r ** 3, m2 = b.r ** 3, m = m1 + m2;
    a.s = (a.s * m1 + b.s * m2) / m;
    a.v = (a.v * m1 + b.v * m2) / m;
    a.vs = (a.vs * m1 + b.vs * m2) / m;
    a.vv = (a.vv * m1 + b.vv * m2) / m;
    a.r = Math.min(r, 0.40);
    a.grosse = true;
    ves[j] = this.naitreVesicule();
  }

  /**
   * Livraison : la vesicule verse son contenu dans la paroi. C'est le SEUL
   * mecanisme qui fait avancer l'hyphe. L'apex n'a pas de « moteur » : il
   * avance la ou les vesicules fusionnent, et il tourne quand elles
   * fusionnent de preference d'un cote. L'inertie n'est donc pas un
   * amortisseur ajoute apres coup, c'est le temps qu'il faut au nuage de
   * vesicules pour se deplacer.
   */
  /**
   * Livraison. La vesicule a fusionne avec la MEMBRANE PLASMIQUE ; son
   * contenu part dans l'espace periplasmique, entre la membrane et la
   * paroi, ou il est assemble. C'est le seul mecanisme qui fait avancer
   * l'hyphe : l'apex n'a pas de moteur.
   */
  livrer(p) {
    const q = Q_FUSION * (p.grosse ? 1.30 : 0.55);
    this.reserveA += q * Math.cos(p.phi);
    this.reserveC += q * Math.sin(p.phi);
    this.fusions++;

    /* La trace de paroi neuve, posee a la latitude ou la fusion a eu lieu.
       `u` est la fraction du trajet pole -> epaule ; elle avance ensuite
       avec la croissance, pas avec le temps. */
    const psi = clamp(Math.abs(p.phi), 0, Math.PI / 2);
    this.depots.push({
      u0: psi / (Math.PI / 2),
      g0: this.hy.longueur,
      cote: p.phi >= 0 ? 1 : -1,
      force: p.grosse ? 1 : 0.6,
      t: 0,
    });
    if (this.depots.length > 260) this.depots.shift();
  }

  /**
   * Un grain de materiau qui sort de la poche. Il nait a la BOUCHE de
   * l'omega — au contact de la membrane, pas au centre de la vesicule — et
   * part vers la paroi, ou il sera incorpore.
   */
  grainDeverse(p) {
    const hy = this.hy, rng = this.rng;
    const sA = this.membrane.sDepuisAge(p.am);
    const w = hy.W(sA);
    const a = (rng() * 2 - 1) * 1.2;
    this.mols.push({
      s: Math.max(sA + Math.sin(a) * p.r * 0.7, 0.04),
      v: p.cotem * Math.max(w - PEAU * 0.8, 0.02),
      vs: Math.sin(a) * (0.30 + rng() * 0.45),
      vv: p.cotem * (0.10 + rng() * 0.20),
      z: p.z,
      t: 0,
      vie: 1.0 + rng() * 1.0,
    });
  }

  /** Vieillissement des traces ; on jette celles sorties du champ simule. */
  majDepots(dt) {
    const hy = this.hy, Lc = hy.Lc, d = this.depots;
    for (let i = d.length - 1; i >= 0; i--) {
      d[i].t += dt;
      const g = hy.longueur - d[i].g0;
      const u = d[i].u0 + g / Lc;
      if (u >= 1 && Lc + (g - (1 - d[i].u0) * Lc) > this.sMax) d.splice(i, 1);
    }
  }

  /**
   * Position d'une trace : (s, v) dans le tube.
   * Tant que u < 1 elle remonte le profil du pole vers l'epaule — c'est la
   * paroi apicale qui s'etale en passant sous le dome, l'expansion
   * orthogonale de Reinhardt reprise par Lew 2011 (fig. 2). Une fois a
   * l'epaule la paroi est rigide : elle ne fait plus que s'eloigner.
   */
  posDepot(d, out) {
    const hy = this.hy, Lc = hy.Lc;
    const g = hy.longueur - d.g0;
    const u = d.u0 + g / Lc;
    let s;
    if (u < 1) s = Lc * (1 - Math.cos(u * Math.PI / 2));
    else s = Lc + (g - (1 - d.u0) * Lc);
    out.s = s;
    out.v = d.cote * hy.W(s);
    out.jeune = u < 1;
    return out;
  }

  majMolecules(dt, da) {
    const hy = this.hy, mols = this.mols, dp = { ds: 0, dv: 0, phi: 0 };
    for (let i = mols.length - 1; i >= 0; i--) {
      const m = mols[i];
      m.t += dt;
      if (m.t > m.vie) { mols.splice(i, 1); continue; }
      m.s += da + m.vs * dt;
      m.v += m.vv * dt;
      m.vs *= 1 - clamp(3.2 * dt, 0, 0.9);
      m.vv *= 1 - clamp(3.2 * dt, 0, 0.9);
      if (m.s < 0.02) m.s = 0.02;
      /* Elles restent dans l'espace periplasmique : plaquees contre la face
         interne de la paroi, elles glissent le long d'elle et s'y
         incorporent. Avant, elles derivaient vers l'interieur du tube et on
         les voyait « partir un peu nulle part ». */
      const d = distParoi(hy, m.s, m.v, dp);
      const cible = PEAU * 0.45;
      /* `dp` pointe vers l'INTERIEUR. Pour ramener la molecule vers la
         paroi il faut donc soustraire, pas ajouter : avec le signe inverse
         elles s'enfoncaient dans le cytoplasme et formaient une bande
         sombre en travers du tube, exactement le « ca part un peu nulle
         part » qu'on voulait corriger. */
      const k = clamp(6 * dt, 0, 1);
      m.s -= dp.ds * (d - cible) * k;
      m.v -= dp.dv * (d - cible) * k;
    }
    if (mols.length > 460) mols.splice(0, mols.length - 460);
  }

  majGrains(dt, da) {
    const hy = this.hy, g = this.grains, rng = this.rng;
    const dp = { ds: 0, dv: 0, phi: 0 };
    for (let i = 0; i < g.length; i++) {
      const p = g[i];
      /* Plancher de 0,62 um/s sur le flux, soit nettement au-dessus de la
         croissance (0,33). Sans lui, `da - flux.dt` change de signe vers
         s = 1,6 um : les granules s'y accumulaient et dessinaient une
         BANDE SOMBRE en travers du tube, juste derriere le Spitzenkorper.
         Avec le plancher ils avancent toujours vers la pointe, y sont
         consommes, et repartent du fond du champ. */
      const f = Math.max(flux(p.s), 0.62);
      p.s += da - f * dt + (rng() * 2 - 1) * 0.35 * dt;
      p.v += (rng() * 2 - 1) * 0.35 * dt;
      if (p.s > this.sMax || p.s < 0.6) { g[i] = this.naitreGrain(this.sMax - rng() * 1.2); continue; }
      const w = distParoi(hy, p.s, p.v, dp);
      if (w < 0.12) { p.s += dp.ds * (0.12 - w); p.v += dp.dv * (0.12 - w); }
    }
  }

  majOrganites(dt, da) {
    const hy = this.hy, o = this.organites, rng = this.rng;
    const dp = { ds: 0, dv: 0, phi: 0 };
    for (let i = 0; i < o.length; i++) {
      const p = o[i];
      p.s += da;
      const f = flux(p.s);
      p.vs += (-f - p.vs) * clamp(dt * 2.2, 0, 1);
      p.vv += (0 - p.vv) * clamp(dt * 2.0, 0, 1);
      p.vs += (rng() * 2 - 1) * 0.55 * dt;
      p.vv += (rng() * 2 - 1) * 0.55 * dt;

      /* Zone apicale sans organites : c'est un fait d'observation (la
         calotte ne contient que des vesicules, cf. la planche MET de
         reference) et c'est aussi ce qui garde la pointe lisible. */
      /* Repoussoir doux et PROPRE A CHAQUE organite (p.zone) : un seuil
         commun les empilait tous sur la meme abscisse et ils se lisaient
         comme une seule masse grise en travers du tube. */
      if (p.s < p.zone) p.vs += (p.zone - p.s) * 0.85 * dt;
      p.s += p.vs * dt;
      p.v += p.vv * dt;
      p.ang += p.dang * dt;
      if (p.s > this.sMax + 2) { p.s = ZONE_APICALE + 1 + rng() * 2; p.v = (rng() * 2 - 1) * 2; }

      const rr = Math.max(p.b, p.a * 0.35);
      const d = distParoi(hy, p.s, p.v, dp);
      if (d < rr) {
        p.s += dp.ds * (rr - d); p.v += dp.dv * (rr - d);
        const vn = p.vs * dp.ds + p.vv * dp.dv;
        if (vn < 0) { p.vs -= 1.2 * vn * dp.ds; p.vv -= 1.2 * vn * dp.dv; }
      }
    }
  }
}
