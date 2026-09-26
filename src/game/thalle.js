/* ---------------------------------------------------------------------------
   Le thalle : la paroi deja construite.

   INVARIANT FONDATEUR : LA PAROI DEPOSEE NE CHANGE PLUS JAMAIS. C est la
   physiologie qui l impose — le fluage de la paroi fongique est plastique,
   donc irreversible, et seule la calotte apicale est encore extensible ; deux
   micrometres derriere l apex la paroi est rigidifiee et n a plus aucun
   comportement. Consequence de jeu : le joueur ECRIT LE NIVEAU en jouant. Sa
   trajectoire devient le mur contre lequel il jouera dans vingt secondes.

   C est aussi pourquoi l epaisseur est memorisee POINT PAR POINT : le moment
   ou l on a sur-pousse reste visible a l ecran, pour toujours. La trace n est
   pas decorative, c est le releve de la manche.

   Deux indexations :
     - par BRANCHE, une polyligne, pour dessiner des tubes continus ;
     - par MAILLE de 16 px, pour les tests de contact. Une maille de 16 px
       tient 3 segments en moyenne : au-dela le test redevient lineaire, en
       dessous la table grossit sans rien gagner.
--------------------------------------------------------------------------- */

const MAILLE = 16;
const cle = (x, y) => (Math.floor(x / MAILLE) * 73856093) ^ (Math.floor(y / MAILLE) * 19349663);

export class Thalle {
  constructor() {
    this.branches = [];        // [{ id, parent, pts:[{x,y,e,t,septum}] }]
    this.grille = new Map();   // cle de maille -> [segments]
    this.noeuds = [];          // anastomoses : {x,y,t}
    this.longueur = 0;         // um cumules, tous apex confondus
    this.mailles = new Set();  // empreinte : une maille occupee = 256 um2
    /* TRACE COMPLETE, jamais purgee : c'est la memoire du thalle entier, et
       elle n'existe que pour la CARTE DE FIN DE MANCHE. La geometrie fine, elle,
       est purgee derriere la camera (voir `purger`) parce qu'elle ne sert qu'a
       la collision et au rendu de proximite.
       Echantillonnee tous les 4 um : une manche de dix minutes a huit apex
       produit environ 96 000 um de tube, soit 24 000 points, soit 200 ko. La
       stocker au pas de la geometrie fine en aurait coute vingt fois plus pour
       une carte qui tient dans 200 px de large. */
    this.trace = [];           // {x, y, b} tous les 4 um
    this._resteTrace = 0;
  }

  nouvelleBranche(parent, x, y) {
    const b = { id: this.branches.length, parent, pts: [{ x, y, e: 1, t: 0, septum: false }],
      depuisSeptum: 0, longueur: 0 };
    this.branches.push(b);
    return b;
  }

  /**
   * Depose un point de paroi.
   *
   * Les septa sont poses automatiquement tous les 44 px et non par le joueur :
   * la septation d une hyphe est periodique et liee au cycle nucleaire, pas a
   * une decision. En faire un verbe aurait ajoute une touche pour un choix que
   * personne ne regrette jamais.
   */
  deposer(b, x, y, e, t) {
    const p0 = b.pts[b.pts.length - 1];
    const d = Math.hypot(x - p0.x, y - p0.y);
    if (d < 0.9) return null;
    b.depuisSeptum += d;
    b.longueur += d;
    let septum = false;
    if (b.depuisSeptum >= 44) { septum = true; b.depuisSeptum = 0; }
    const p = { x, y, e, t, septum };
    b.pts.push(p);
    this.longueur += d;
    this._resteTrace += d;
    if (this._resteTrace >= 4) {
      this._resteTrace = 0;
      /* Borne dure : au-dela de 60 000 points la carte de fin ne gagne plus
         rien en lisibilite et le tableau commence a peser. On echantillonne
         alors un point sur deux en jetant les plus anciens. */
      if (this.trace.length > 60000) this.trace = this.trace.filter((_, i) => i & 1);
      this.trace.push({ x, y, b: b.id });
    }
    /* Le segment est enregistre dans TOUTES les mailles qu il traverse, par
       echantillonnage au pas de 6 px. Un simple enregistrement aux extremites
       laissait passer les croisements obliques : c est la premiere cause de
       faux negatif d un hachage spatial. */
    /* `s` est l'abscisse curviligne DANS SA BRANCHE. Elle sert a exclure du test
       de contact la paroi qu'on vient soi-meme de poser, et cette exclusion doit
       etre en DISTANCE et non en temps — c'est un defaut qui a casse le jeu.
       L'ancienne regle ignorait la paroi de moins d'une seconde : cale sur une
       vitesse de croisiere de 20 um/s, elle protegeait les 20 um derriere
       l'apex. Au regime lent (3 um/s) elle n'en protegeait plus que trois, donc
       l'apex se declarait en contact avec son propre tube des la premiere
       seconde et fusionnait. Mesure : 24 manches sur 24 mortes a 4,5 s.
       En abscisse curviligne, la protection ne depend plus de l'allure. */
    const seg = { x0: p0.x, y0: p0.y, x1: x, y1: y, e, t, b: b.id, s: b.longueur };
    const n = Math.max(1, Math.ceil(d / 6));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const sx = p0.x + (x - p0.x) * u, sy = p0.y + (y - p0.y) * u;
      const k = cle(sx, sy);
      let l = this.grille.get(k);
      if (!l) { l = []; this.grille.set(k, l); }
      if (l[l.length - 1] !== seg) l.push(seg);
      this.mailles.add(k);
    }
    return p;
  }

  /**
   * Segment le plus proche d un point, hors paroi trop recente.
   *
   * `ageMin` est la seule chose qui empeche un apex de se declarer en contact
   * avec la paroi qu il vient de poser lui-meme. Il est en SECONDES et non en
   * distance : a vitesse variable, un seuil de distance laissait l apex lent
   * se toucher tout seul et l apex rapide traverser une vraie boucle.
   */
  proche(x, y, rayon, t, ageMin = 0.85, bid = -1, bLen = 0, arcMin = 34) {
    let best = null, bd = rayon;
    const c0x = Math.floor((x - rayon) / MAILLE), c1x = Math.floor((x + rayon) / MAILLE);
    const c0y = Math.floor((y - rayon) / MAILLE), c1y = Math.floor((y + rayon) / MAILLE);
    const vus = new Set();
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const l = this.grille.get((cx * 73856093) ^ (cy * 19349663));
        if (!l) continue;
        for (const s of l) {
          if (vus.has(s)) continue;
          vus.add(s);
          /* Sa propre paroi toute proche en abscisse : on ne peut pas se
             toucher soi-meme a moins d'un rayon de braquage, qui vaut au
             minimum 57 um a vitesse de croisiere. 34 um de protection est donc
             large sans jamais masquer un vrai croisement. */
          if (s.b === bid && bLen - s.s < arcMin) continue;
          if (t - s.t < ageMin) continue;
          const d = distSeg(x, y, s.x0, s.y0, s.x1, s.y1);
          if (d < bd) { bd = d; best = s; }
        }
      }
    }
    return best ? { seg: best, d: bd } : null;
  }

  noeud(x, y, t) { this.noeuds.push({ x, y, t }); }

  /** Empreinte du thalle, en um2 : une maille occupee vaut 16 x 16. */
  get aire() { return this.mailles.size * MAILLE * MAILLE; }

  /**
   * Oublie la geometrie trop en arriere.
   *
   * Legitime parce que le cap de tout apex est borne a +/- 78 deg de l avant
   * (voir apex.js) : aucun apex ne peut revenir sur une paroi laissee a plus
   * de 700 px derriere le plus retardataire d entre eux. Sans cette purge, une
   * manche de vingt minutes accumule 25 000 segments et le test de contact
   * finit par couter plus cher que le rendu.
   */
  purger(yMin) {
    const seuil = yMin - 700;
    if (seuil < 0) return;
    for (const b of this.branches) {
      let i = 0;
      while (i < b.pts.length - 2 && b.pts[i].y < seuil) i++;
      if (i > 0) b.pts.splice(0, i);
    }
    for (const [k, l] of this.grille) {
      const garde = l.filter((s) => s.y0 >= seuil || s.y1 >= seuil);
      if (!garde.length) this.grille.delete(k);
      else if (garde.length !== l.length) this.grille.set(k, garde);
    }
  }
}

/** Distance d un point a un segment. */
export function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(px - x0, py - y0);
  let u = ((px - x0) * dx + (py - y0) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - (x0 + dx * u), py - (y0 + dy * u));
}
