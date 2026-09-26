/* ---------------------------------------------------------------------------
   Le milieu : champs scalaires et objets discrets.

   REPERE DU MONDE, pose une fois : x vers la droite, y VERS L'AVANT. Avancer
   augmente y, et le rendu retourne l axe (avant = haut de l ecran). La camera
   ne recule jamais, donc rien n est jamais stocke derriere : le monde est
   engendre a la demande, deterministe a partir de la graine, et on peut le
   reengendrer identique — c est ce qui rend les bancs de mesure possibles.

   Deux natures de milieu, et la distinction est une decision de conception :

     LES CHAMPS (aw, sucre, temperature, antifongique) sont CONTINUS. Ils ne
     se ramassent pas, ils se TRAVERSENT, et ce qu on en tire depend du temps
     passe dedans. C est la moitie « exploitation » du jeu.

     LES OBJETS (granules, gouttes, loci) sont DISCRETS et demandent un
     contact de l apex. Ils se ratent, et on les rate d autant plus qu on va
     vite : le rayon de braquage croit avec la vitesse. C est la moitie
     « adresse » du jeu, et c est elle qui punit la vitesse sans l interdire.

   La strategie de recherche de nourriture d un mycelium reel est exactement
   cet arbitrage : dans une zone riche les apex ralentissent et ramifient
   dense, dans une zone pauvre ils filent droit et ne ramifient pas.
--------------------------------------------------------------------------- */

import { hash2, mulberry32, clamp, lerp, smooth } from '../core/util.js';
import { substratPour, coefBoucle, facteurTemp } from '../data/substrats.js';

/** Bruit de valeur lisse, une octave. `e` est la taille de maille en px. */
function valeur(seed, x, y, e) {
  const fx = x / e, fy = y / e;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  const h = (a, b) => hash2(a * 1013 + seed, b * 1619 + seed * 7);
  const a = lerp(h(ix, iy), h(ix + 1, iy), tx);
  const b = lerp(h(ix, iy + 1), h(ix + 1, iy + 1), tx);
  return lerp(a, b, ty);
}

/** Deux octaves : la grande donne les plumes, la petite le grain. */
function bruit2(seed, x, y, e) {
  return valeur(seed, x, y, e) * 0.68 + valeur(seed + 977, x, y, e * 0.34) * 0.32;
}

/* Maille d engendrement des objets. 64 px : un ecran de 256 px en couvre 4x6,
   donc on n engendre jamais plus d une trentaine de cellules par image, et une
   plume de sucre tient dans une cellule sans etre coupee. */
const MAILLE = 64;

export class Champ {
  constructor(graine) {
    this.graine = graine >>> 0;
    this.cache = new Map();     // "cx,cy" -> objets de la cellule
    this.ordre = [];            // cles dans l ordre d insertion, pour purger
    /* DERIVE TEMPORELLE DE L'AW : le substrat se desseche pendant la manche.
       C'est l'une des deux horloges du jeu, et elle est reelle a double titre —
       un produit stocke perd son eau libre, et une colonie epuise celle de son
       propre substrat en la transpirant. Sans horloge, le banc a montre que
       LAMBINER etait l'optimum : la politique passive survivait 81 s pour 10
       spores contre 48 s et 6 spores a une politique qui cherche a manger, parce
       que sur une carte deficitaire aller lentement est toujours moins cher.
       Un roguelite a besoin d'une pression qui rende l'attente couteuse. */
    this.deriveAw = 0;
    /* EPUISEMENT LOCAL DU SUBSTRAT, par mailles de 8 um.
       Sans lui, un apex immobile absorbait indefiniment la meme plume : la
       mesure montrait un stock de sucre colle a son plafond avec trois apex,
       donc chaque apex supplementaire etait un revenu net et la courbe de
       difficulte s'inversait. Un mycelium epuise reellement le substrat qu'il
       occupe — c'est meme pour cela qu'il explore.
       Deux consequences de jeu, toutes deux voulues : brouter sur place cesse
       de payer au bout de quelques secondes, et LA ZONE BROUTEE SE VOIT, parce
       que le fond est dessine a partir du meme echantillon. La trace de son
       propre passage devient une information. */
    this.epuise = new Map();
  }

  static cleE(x, y) { return (Math.floor(x / 8) * 92837111) ^ (Math.floor(y / 8) * 689287499); }

  /** Fraction de reserve restante en un point, 0 a 1. */
  reste(x, y) {
    const v = this.epuise.get(Champ.cleE(x, y));
    return v === undefined ? 1 : v;
  }

  /** Preleve `q` de reserve a un point. */
  consommer(x, y, q) {
    const k = Champ.cleE(x, y);
    const v = this.epuise.get(k);
    this.epuise.set(k, Math.max(0, (v === undefined ? 1 : v) - q));
    /* Purge grossiere : la camera ne revient jamais, donc au-dela de 40 000
       mailles memorisees (2,5 mm2 de substrat) les plus anciennes ne seront
       plus jamais relues. */
    if (this.epuise.size > 40000) {
      let n = 0;
      for (const cle of this.epuise.keys()) { this.epuise.delete(cle); if (++n > 8000) break; }
    }
  }

  /** A appeler une fois par image : le substrat se desseche avec le temps. */
  majDerive(t) {
    /* 0,00035 par seconde, plafonne a 0,11 : apres cinq minutes l'aw a baisse de
       0,10, ce qui suffit a pousser un genotype sans osmotolerance sous sa limite
       dans les substrats secs. Plafonne, parce qu'une derive non bornee finissait
       par rendre la plasmolyse inevitable et toutes les morts se ressemblaient. */
    this.deriveAw = -Math.min(0.11, t * 0.00035);
  }

  /** Substrat, boucle et coefficients pour une avancee donnee. */
  contexte(y) {
    const { substrat, boucle, reste, index } = substratPour(Math.max(0, y));
    const k = coefBoucle(boucle);
    return { substrat, boucle, reste, index, k };
  }

  /**
   * Echantillon du milieu en un point.
   * Retourne les quatre grandeurs qui entrent dans l equation de croissance.
   */
  echantillon(x, y, ctx = this.contexte(y)) {
    const s = ctx.substrat;
    const g = this.graine;
    /* aw : le bruit est BASSE FREQUENCE (mailles de 180 px). Une aw qui
       varierait pixel par pixel serait illisible et injouable : le joueur doit
       pouvoir voir venir une zone seche et decider de la contourner. */
    const naw = bruit2(g + 11, x, y, 180) - 0.5;
    /* POCHES DE SEL. Une aw de milieu n'est pas homogene : un sel qui cristallise
       localement creuse un puits d'activite de l'eau bien plus profond que le
       bruit de fond, sur quelques dizaines de micrometres. On le modelise par une
       troisieme octave a SEUIL HAUT (0,70) : seuls les sommets du bruit
       deviennent des poches, donc elles sont rares, nettes et contournables —
       ce qui en fait un choix de trajectoire et non une penalite de zone.
       Le decor dessine des cristaux exactement la ou ce terme est fort, donc la
       poche s'ANNONCE : voir cellule(). */
    const sel = s.sel
      ? clamp((bruit2(g + 131, x, y, 110) - 0.70) / 0.16, 0, 1) * s.sel * ctx.k.sel
      : 0;
    const aw = clamp(s.aw + ctx.k.aw + this.deriveAw + naw * s.awBruit * 2.4
      - sel * 0.30, 0.45, 1);
    /* sucre : plumes a l echelle du substrat, avec un seuil qui cree de vrais
       vides. Sans seuil le champ etait partout a 0,4 et la carte n avait plus
       de relief : on ne cherchait plus rien. */
    let su = bruit2(g + 29, x, y, s.sucreEchelle);
    /* LA CARTE EST DEFICITAIRE PAR DEFAUT, ET C'EST LA DECISION D'EQUILIBRAGE
       LA PLUS IMPORTANTE DU JEU.
       Le banc a etabli qu'avec une carte benefique en moyenne, ALLER TOUT DROIT
       SANS RIEN FAIRE etait la meilleure strategie : 243 s de survie et 33
       spores, contre 223 s et 30 spores pour une politique qui cherche a manger.
       Un jeu dont l'optimum est de lacher la manette n'a pas de jeu.
       Le seuil et la pente sont donc cales pour que la valeur MEDIANE du champ
       soit SOUS le point mort (0,29 de champ pour un flux nominal), et que
       seules les plumes soient benefiques. Mesure sur le bruit a deux octaves :
       mediane 0,487, p10 0,275, p90 0,705. Avec un seuil a 0,40 et une pente de
       0,34, la mediane du champ tombe a 0,26 et le p90 monte a 0,90 : la moitie
       de la carte fait perdre du sucre, les plumes en font gagner trois fois le
       point mort. C'est ce qui cree le RYTHME du jeu — traverser les vides en
       brulant son stock, s'attarder dans les plumes pour le refaire — et c'est
       exactement la strategie de recherche de nourriture d'un mycelium reel. */
    su = clamp((su - 0.40) / 0.34, 0, 1);
    const sucre = su * s.sucre * this.reste(x, y);
    /* temperature : un gradient lent, plus une derive de boucle. Un silo
       s auto-echauffe, il ne clignote pas. */
    const temp = s.temp + (bruit2(g + 43, x, y, 320) - 0.5) * 7 + ctx.boucle * 1.2;
    let af = null;
    if (s.antifongique) {
      const a = s.antifongique;
      let v = bruit2(g + 61, x, y, a.echelle);
      v = clamp((v - 0.42) / 0.45, 0, 1);
      if (v > 0.02) af = { type: a.type, v: v * a.intensite * ctx.k.antifongique };
    }
    return { aw, sucre, temp, af, sel, substrat: s, boucle: ctx.boucle };
  }

  /** Facteur thermique au point, avec le decalage de cardinales des genes. */
  facteurTemp(temp, tempDec) {
    return facteurTemp(temp, { min: 2 - tempDec, opt: 26 + tempDec, max: 42 + tempDec });
  }

  /* --- objets discrets --------------------------------------------------- */

  /**
   * Objets d une cellule de maille, engendres une fois et memorises.
   *
   * La memorisation n est pas une optimisation : c est ce qui fait qu un
   * granule deja absorbe RESTE absorbe. Le monde etant engendre a la demande,
   * sans cache un aller-retour aurait remis tout le sucre en place.
   */
  cellule(cx, cy) {
    const cle = cx + ',' + cy;
    let liste = this.cache.get(cle);
    if (liste) return liste;
    liste = [];
    const rng = mulberry32(this.graine ^ (cx * 0x9e3779b1) ^ (cy * 0x85ebca6b));
    const x0 = cx * MAILLE, y0 = cy * MAILLE;
    const ctx = this.contexte(y0 + MAILLE / 2);
    const s = ctx.substrat;
    const ech = this.echantillon(x0 + MAILLE / 2, y0 + MAILLE / 2, ctx);

    /* Obstacles. Leur densite suit le substrat ; leur POSITION est bruitee
       pour qu ils ne dessinent pas la maille. Un joueur qui voit la grille
       perd le milieu de vue. */
    const nObs = Math.round(s.obstacle.densite * 4.2);
    for (let i = 0; i < nObs; i++) {
      const r = lerp(s.obstacle.taille[0], s.obstacle.taille[1], rng());
      /* LE PLAN DE PROFONDEUR EST UNE DONNEE, PAS UN EFFET DE RENDU, et cette
         ligne a coute une refonte. Le rendu repartissait les obstacles sur
         quatre plans de nettete alors que la collision les arretait TOUS : le
         joueur se faisait ecraser par un grain visiblement flou, donc
         visiblement hors de son plan. Mesure au banc : 14 morts sur 20 par
         ecrasement, et aucune n'etait comprehensible a l'ecran.
         Maintenant : plan 0 = net ET bloquant, plans 1 a 3 = flous et
         TRAVERSABLES, `devant` = au-dessus du plan de l'hyphe. Le flou est donc
         devenu une information de jeu exacte, ce qu'il pretendait etre. */
      const h = rng();
      liste.push({
        type: 'obstacle', forme: s.obstacle.type,
        x: x0 + rng() * MAILLE, y: y0 + rng() * MAILLE,
        r, ang: rng() * Math.PI, ry: r * lerp(0.42, 0.95, rng()),
        plan: h < 0.30 ? 0 : h < 0.56 ? 1 : h < 0.80 ? 2 : 3,
        devant: h > 0.90,
      });
    }

    /* Granules de reserve : la ou le champ de sucre est deja riche. Le joueur
       lit donc la plume et sait qu il y a des granules dedans : le champ
       ANNONCE les objets, et c est ce qui rend la trajectoire pilotable. */
    const nGran = ech.sucre > 0.25 ? Math.round(ech.sucre * 3.4) : 0;
    for (let i = 0; i < nGran; i++) {
      liste.push({
        type: 'granule',
        x: x0 + rng() * MAILLE, y: y0 + rng() * MAILLE,
        r: lerp(2.6, 4.6, rng()),
        valeur: lerp(0.10, 0.20, rng()),
        /* Dans le grain, la reserve est de l AMIDON : sans amylase on passe
           dessus sans rien prendre, et le HUD le dit. */
        amidon: !!s.amidon,
        pris: false,
      });
    }

    /* Gouttes d eau libre : rares, et d autant plus precieuses que l aw est
       basse. C est la seule source d eau d une confiture. */
    if (rng() < clamp(1.08 - ech.aw, 0.04, 0.5)) {
      liste.push({
        type: 'goutte', x: x0 + rng() * MAILLE, y: y0 + rng() * MAILLE,
        r: lerp(3.2, 5.4, rng()), valeur: lerp(0.18, 0.34, rng()), pris: false,
      });
    }

    /* Cristaux de sel, dessines LA OU le terme salin est fort. Ils n'ont aucun
       effet propre : ils rendent visible un puits d'aw qui, sinon, ne se
       decouvrirait qu'en le traversant. Le decor explique le champ. */
    if (ech.sel > 0.25) {
      const n = 2 + Math.round(ech.sel * 4);
      for (let i = 0; i < n; i++) {
        liste.push({
          type: 'sel', x: x0 + rng() * MAILLE, y: y0 + rng() * MAILLE,
          r: lerp(1.6, 3.4, rng()), ang: rng() * Math.PI,
        });
      }
    }

    /* Locus d expression : la carte a piocher. 6 % par cellule, soit environ
       une tous les 260 px parcourus en ligne droite. */
    if (rng() < 0.06) {
      liste.push({
        type: 'locus', x: x0 + rng() * MAILLE, y: y0 + rng() * MAILLE,
        r: 4, pris: false,
      });
    }

    this.cache.set(cle, liste);
    this.ordre.push(cle);
    /* Purge FIFO. 3000 cellules = 12 millions de px2 de monde memorise, tres
       au-dela de ce qu un thalle peut reparcourir, et la camera ne recule
       jamais : ce qui sort du cache ne sera jamais revu. */
    if (this.ordre.length > 3000) {
      const vieux = this.ordre.shift();
      this.cache.delete(vieux);
    }
    return liste;
  }

  /** Tous les objets a portee d un point. */
  autour(x, y, rayon) {
    const c0x = Math.floor((x - rayon) / MAILLE), c1x = Math.floor((x + rayon) / MAILLE);
    const c0y = Math.floor((y - rayon) / MAILLE), c1y = Math.floor((y + rayon) / MAILLE);
    const out = [];
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) out.push(...this.cellule(cx, cy));
    }
    return out;
  }

  /** Objets visibles dans un rectangle du monde (rendu). */
  dansRect(x0, y0, x1, y1) {
    const out = [];
    for (let cy = Math.floor(y0 / MAILLE); cy <= Math.floor(y1 / MAILLE); cy++) {
      for (let cx = Math.floor(x0 / MAILLE); cx <= Math.floor(x1 / MAILLE); cx++) {
        for (const o of this.cellule(cx, cy)) {
          if (o.x >= x0 - 32 && o.x <= x1 + 32 && o.y >= y0 - 32 && o.y <= y1 + 32) out.push(o);
        }
      }
    }
    return out;
  }
}
