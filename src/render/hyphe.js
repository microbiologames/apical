/* ---------------------------------------------------------------------------
   Rendu de l'hyphe. C'est le fichier le plus important du depot.

   CE QU'UNE HYPHE EST, ET QUE LE DESSIN DOIT DIRE SANS LEGENDE :
   un TUBE A PAROI RIGIDE contenant un CYTOPLASME MOU sous pression, avec des
   organites dedans, observe a travers une profondeur de champ insuffisante.

   Trois de ces quatre mots sont des contraintes de rendu, et chacune a dicte
   une decision technique :

   1. « PAROI RIGIDE » -> on ne trace PAS un trait epais. On rasterise le tube
      par SECTIONS TRANSVERSALES, et dans chaque section on place la paroi comme
      deux bandes nettes de part et d'autre. C'est la seule facon d'obtenir un
      bord franc ET une epaisseur variable au pixel pres. Un trait epais
      colorie, lui, donne un ruban : la paroi et le cytoplasme y ont la meme
      couleur, et l'hyphe se lit comme un spaghetti.

   2. « CYTOPLASME MOU SOUS PRESSION » -> l'interieur n'est pas un remplissage
      uni. Il porte un degrade de refringence (clair au centre), un reflet
      specule du cote de la lampe, et surtout il SE DECOLLE DE LA PAROI quand le
      turgor tombe : c'est la plasmolyse, on voit litteralement le protoplaste
      se retracter dans son tube. C'est la jauge d'eau la plus lisible du jeu et
      elle ne coute pas un pixel de HUD.

   3. « PROFONDEUR DE CHAMP INSUFFISANTE » -> la position laterale d'un organite
      dans le tube TIENT LIEU DE PROFONDEUR. Un organite pres du bord est plus
      haut ou plus bas dans un tube de 11 um, donc hors du plan de mise au
      point, donc il part sur un calque floute. C'est ce qui donne du volume au
      tube au lieu d'un ruban decore.

   Et la quatrieme, la croissance elle-meme :

   4. « CONSTRUCTION PROGRESSIVE DE LA PAROI » -> chaque section memorise la
      date de son depot. La paroi neuve est PALE ET MINCE, elle prend sa
      couleur et son epaisseur en 0,30 s. On voit donc la paroi se construire
      derriere l'apex, en continu, ce qui est exactement le phenomene.
--------------------------------------------------------------------------- */

import { clamp, lerp, TAU } from '../core/util.js';
import { mix32, fade32, bayer, Screen } from '../core/pixel.js';

/** Rayon du tube. 7 px = 14 um de diametre : un Rhizopus, pas un Penicillium.
    Choisi POUR LE RENDU, et remonte apres capture : a 11 um le tube occupait
    4 % de la largeur du champ et se lisait comme un fil, alors qu'il EST le
    sujet du jeu. A 14 um il en occupe 5,5 %, et il reste huit pixels de
    cytoplasme entre les deux parois — de quoi voir un noyau passer. 10 a 15 um
    est la plage reelle des Mucorales, on est dedans. */
export const RAYON = 7;
/** Duree de rigidification apparente de la paroi. */
const MATURATION = 0.30;
/** Pas d'echantillonnage des sections. 0,8 px : au-dessus de 1,1 px des
    coutures apparaissent sur les obliques a 45 deg. */
const PAS = 0.8;
/** Longueur de tube rendue derriere chaque apex. Au-dela c'est hors champ. */
const PORTEE = 470;

/**
 * Sections transversales d'une branche, du bout vers l'arriere.
 * Chaque section porte sa position, sa normale, son epaisseur de paroi et sa
 * date de depot — donc son etat de maturation.
 */
export function sections(branche, portee = PORTEE) {
  const pts = branche.pts;
  const out = [];
  if (pts.length < 2) return out;
  let reste = 0, total = 0;
  for (let i = pts.length - 1; i > 0 && total < portee; i--) {
    const p1 = pts[i], p0 = pts[i - 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    const ux = dx / len, uy = dy / len;
    for (let d = reste; d < len && total < portee; d += PAS, total += PAS) {
      const u = 1 - d / len;
      out.push({
        x: p0.x + dx * u, y: p0.y + dy * u,
        nx: -uy, ny: ux,
        e: lerp(p0.e, p1.e, u), t: lerp(p0.t, p1.t, u),
        s: total,
      });
    }
    reste = Math.max(0, PAS - ((len - reste) % PAS));
  }
  return out;
}

/**
 * Profil de la calotte apicale.
 *
 * Ce n'est pas une hemisphere. Le profil median d'un apex fongique suit une
 * courbe appelee HYPHOIDE, consequence geometrique du modele du centre
 * d'approvisionnement en vesicules : le SPK avance et rayonne, et la surface se
 * construit la ou les vesicules arrivent. L'apex est donc legerement plus
 * allonge qu'un dome, et c'est visible. On l'approche par
 *     r(d) = R x (1 - (d/L)^1.75)^0.52  avec L = 1,32 R
 * ce qui donne un bout un peu ogival au lieu d'un demi-cercle. Trois pixels de
 * difference sur 11, mais ce sont les trois qui font qu'un mycologue reconnait
 * un apex en croissance d'un bout casse.
 */
function calotte(d, R) {
  const L = R * 1.32;
  if (d >= L) return 0;
  const u = d / L;
  return R * Math.pow(Math.max(0, 1 - Math.pow(u, 1.75)), 0.52);
}

/** Direction de la lampe, fixe en haut a gauche pour tout le champ. */
const LAMPE = { x: -0.7071, y: -0.7071 };

/* ---------------------------------------------------------------------------
   MASQUE DE PASSE.

   Le tube est rasterise par QUADS SUCCESSIFS qui se recouvrent largement, et
   plusieurs de ses bandes sont semi-transparentes (le halo de phase, le voile de
   plasmolyse). Sans garde, un pixel recouvert par six quads recevait six fois le
   halo et le lisere devenait un bourrelet opaque. Le masque garantit qu'un pixel
   n'est peint QU'UNE FOIS par branche.

   Il porte une GENERATION plutot qu'un effacement : effacer 120 000 octets par
   branche et par image coutait plus que le rendu lui-meme.
--------------------------------------------------------------------------- */
let masque = null, masqueW = 0, gen = 0;
function nouvellePasse(scr) {
  if (!masque || masqueW !== scr.w || masque.length < scr.w * scr.h) {
    masque = new Uint16Array(scr.w * scr.h);
    masqueW = scr.w;
    gen = 0;
  }
  gen = (gen + 1) & 0xffff;
  if (gen === 0) { masque.fill(0); gen = 1; }
}

/**
 * Peint un pixel du tube a partir de sa DISTANCE A L'AXE.
 *
 * C'est le coeur du rendu, et le passage d'un trace section par section a un
 * CHAMP DE DISTANCE a ete le correctif visuel le plus important du projet.
 * En tracant section par section, on avance de 0,8 px le long de l'axe et on
 * place les pixels par pas de 1 px le long de la normale : les deux pas ne
 * coincident pas, donc le bord tombait a des positions differentes d'une section
 * a l'autre et LA PAROI ONDULAIT. Une paroi qui ondule n'est pas rigide, et
 * toute la lecture du tube s'effondrait avec elle — vu sur capture macro.
 *
 * Avec une vraie distance, le bord est a la meme distance partout, par
 * construction. Les bandes, du bord vers le centre :
 *     halo de phase -> paroi -> interstice de plasmolyse -> cytoplasme -> reflet
 */
function pixelTube(scr, pal, x, y, d, R, ep, colParoi, cytoFill, lum, cote) {
  const o = (y | 0) * masqueW + (x | 0);
  if (x < 0 || y < 0 || x >= scr.w || y >= scr.h) return;
  if (masque[o] === gen) return;
  masque[o] = gen;
  const Rint = Math.max(0, R - ep);
  const Rcyto = Rint * cytoFill;
  if (d > R) {
    /* Halo de contraste de phase : l'anneau de diffraction du bord. Trame, pour
       qu'il ne fasse pas un lisere plein — un lisere plein epaissit le tube de
       deux pixels et la paroi cesse d'etre lisible. */
    if (bayer(x | 0, y | 0) < 0.62) scr.plot(x, y, pal.phase);
    return;
  }
  if (d > Rint) { scr.plot(x, y, colParoi); return; }
  if (d > Rcyto) {
    /* Interstice de plasmolyse : le protoplaste s'est retracte. On y met le
       voile du milieu et non du noir : c'est le milieu qui entre. */
    scr.plot(x, y, pal.voile);
    return;
  }
  /* Cytoplasme : degrade de refringence, clair au centre. Un remplissage uni
     rendait le tube plat et la paroi se confondait avec un contour dessine. */
  const k = Rcyto > 0.5 ? d / Rcyto : 0;
  let c = mix32(pal.cyto, pal.paroiMince, k * 0.34);
  /* Reflet specule : un cylindre sous pression a une bande claire du cote de la
     lampe, a peu pres a 60 % du rayon. C'est ce reflet qui dit « rempli de
     liquide » plutot que « creux ». */
  if (cote > 0 && k > 0.40 && k < 0.80) c = mix32(c, pal.phase, 0.34 * lum);
  scr.plot(x, y, c);
}

/**
 * Rasterise un troncon de tube entre deux sections, par champ de distance.
 * `ra` et `rb` sont les rayons aux deux bouts : c'est ce qui permet de rendre la
 * calotte apicale avec le meme code que le tube.
 */
function troncon(scr, pal, ax, ay, bx, by, ra, rb, epa, epb, cola, colb, cytoFill, lum,
  boutA = false, boutB = false) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const Rmax = Math.max(ra, rb) + 1.35;
  const x0 = Math.floor(Math.min(ax, bx) - Rmax), x1 = Math.ceil(Math.max(ax, bx) + Rmax);
  const y0 = Math.floor(Math.min(ay, by) - Rmax), y1 = Math.ceil(Math.max(ay, by) + Rmax);
  if (x1 < 0 || y1 < 0 || x0 >= scr.w || y0 >= scr.h) return;
  for (let y = Math.max(0, y0); y <= Math.min(scr.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(scr.w - 1, x1); x++) {
      let u = l2 > 1e-9 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      /* UN TRONCON NE PEINT QUE SA PROPRE PORTION D'AXE, et ce garde-fou est
         tout sauf cosmetique : sans lui, la boite englobante deborde de Rmax
         DANS L'AXE aussi, donc un troncon reclamait des pixels situes huit
         pixels devant ou derriere lui. Leur distance au segment y vaut alors
         plus que le rayon, ils partaient en halo, et le masque les verrouillait
         avant que le bon troncon ne les atteigne. Resultat vu sur capture
         macro : tout le tube rendu en damier de halo, sans paroi ni cytoplasme,
         seule la calotte apicale etant pleine. Les extremites vraies du tube
         (`boutA`, `boutB`) gardent le droit d'arrondir. */
      if (u < 0 && !boutA) continue;
      if (u > 1 && !boutB) continue;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = ax + dx * u, py = ay + dy * u;
      const d = Math.hypot(x - px, y - py);
      const R = ra + (rb - ra) * u;
      if (d > R + 1.35) continue;
      /* Cote eclaire : produit vectoriel du pixel avec l'axe, compare au sens
         de la lampe. Un simple test de signe suffit et ne coute pas de racine. */
      const nx = l2 > 1e-9 ? -dy / Math.sqrt(l2) : 0;
      const ny = l2 > 1e-9 ? dx / Math.sqrt(l2) : 1;
      const s = (x - px) * nx + (y - py) * ny;
      const cote = (s * (nx * LAMPE.x + ny * LAMPE.y)) > 0 ? 1 : -1;
      pixelTube(scr, pal, x, y, d, R, epa + (epb - epa) * u,
        u < 0.5 ? cola : colb, cytoFill, lum, cote);
    }
  }
}

/**
 * Dessine une branche complete, de son bout vers l'arriere.
 *
 * @param {object} apex  l'apex vivant de cette branche, ou null
 */
export function branche(scr, pal, b, apex, cam, t, P, cyto, opts = {}) {
  const secs = sections(b);
  if (!secs.length) return;
  const cytoFillBase = 0.62 + 0.38 * clamp(P / 0.45, 0, 1);
  const lum = opts.lum === undefined ? 1 : opts.lum;

  /* --- la calotte apicale, DESSINEE AVANT le tube ---------------------
     Elle passe en premier parce qu'elle partage le masque de passe avec lui :
     dessinee apres, le tube lui aurait deja pris ses pixels de base et le bout
     serait apparu tronque. */
  scr.layer(0);
  nouvellePasse(scr);
  if (apex) calotteEtSpk(scr, pal, apex, cam, t, P, cyto, opts);

  /* --- le tube -------------------------------------------------------- */
  let prec = null;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    const sx = cam.cx + (s.x - cam.x);
    const sy = cam.cy - (s.y - cam.y);
    /* Maturation : la paroi neuve est plus mince et plus pale. */
    const mat = clamp((t - s.t) / MATURATION, 0, 1);
    const ep = clamp(s.e * (0.42 + 0.58 * mat) * 1.45, 0.6, 3.4);
    const col = mix32(pal.paroiMince, pal.paroi, mat);
    /* Plasmolyse : plus marquee loin de l'apex, ou le cytoplasme se retire en
       premier. L'apex garde son turgor le plus longtemps, c'est lui qui pompe. */
    const fill = clamp(cytoFillBase + 0.16 * (1 - clamp(s.s / 120, 0, 1)), 0.2, 1);
    const cur = { sx, sy, ep, col, fill };
    if (prec && (sx > -18 && sx < scr.w + 18 && sy > -18 && sy < scr.h + 18)) {
      troncon(scr, pal, prec.sx, prec.sy, sx, sy, RAYON, RAYON,
        prec.ep, ep, prec.col, col, (prec.fill + fill) / 2, lum,
        /* Le premier troncon ferme l'avant SEULEMENT si la branche n'a plus
           d'apex : sinon c'est la calotte qui ferme, et elle le fait mieux. */
        i === 1 && !apex, i === secs.length - 1);
    }
    prec = cur;
  }

  /* --- septa et corps de Woronin ------------------------------------- */
  for (const p of b.pts) {
    if (!p.septum) continue;
    const sx = cam.cx + (p.x - cam.x), sy = cam.cy - (p.y - cam.y);
    if (sx < -8 || sx > scr.w + 8 || sy < -8 || sy > scr.h + 8) continue;
    const i = b.pts.indexOf(p);
    const q = b.pts[Math.max(0, i - 1)];
    const dx = p.x - q.x, dy = -(p.y - q.y);
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    for (let k = -RAYON + 1; k <= RAYON - 1; k += 0.7) {
      scr.plot(sx + nx * k, sy + ny * k, pal.septum);
    }
    /* Corps de Woronin : deux de chaque cote du pore, refringents. On les
       dessine parce qu'ils sont la raison pour laquelle une lyse apicale ne
       vide pas tout le thalle, et un joueur qui a pris le gene doit VOIR ce
       qu'il a achete. */
    if (opts.woronin) {
      const ax = dx / l, ay = dy / l;
      for (const s2 of [-1.9, 1.9]) {
        for (const o of [-1.5, 1.5]) {
          scr.plot(sx + ax * s2 + nx * o, sy + ay * s2 + ny * o, pal.woronin);
        }
      }
    }
  }

  /* --- organites ----------------------------------------------------- */
  const orgs = cyto ? cyto.liste(b.id) : [];
  for (const o of orgs) {
    const pos = surTube(secs, o.s);
    if (!pos) continue;
    const Rint = RAYON - 1.5;
    const wx = pos.x + pos.nx * o.off * Rint;
    const wy = pos.y + pos.ny * o.off * Rint;
    const sx = cam.cx + (wx - cam.x), sy = cam.cy - (wy - cam.y);
    if (sx < -8 || sx > scr.w + 8 || sy < -8 || sy > scr.h + 8) continue;
    /* PROFONDEUR DE CHAMP : la position laterale devient un flou. Un organite
       colle a la paroi est en haut ou en bas du tube, donc hors du plan. */
    const flou = Math.abs(o.off) > 0.5 ? 1 : 0;
    scr.layer(flou);
    dessinerOrganite(scr, pal, o, sx, sy, pos, cam);
  }
  scr.layer(0);

}

/** Position et normale a une distance `s` du bout. Interpolation lineaire. */
function surTube(secs, s) {
  if (!secs.length) return null;
  const i = Math.round(s / PAS);
  if (i < 0 || i >= secs.length) return null;
  return secs[i];
}

function dessinerOrganite(scr, pal, o, sx, sy, pos, cam) {
  const axx = -pos.ny, axy = -pos.nx;   // axe du tube, en ecran
  switch (o.type) {
    case 'vesicule':
      scr.plot(sx, sy, pal.vesicule);
      break;
    case 'mito':
      /* Une mitochondrie fongique est un FUSEAU aligne sur l'axe du tube : elle
         suit les microtubules. La dessiner ronde donnait des billes et le flux
         perdait sa direction. */
      scr.cap(sx, sy, o.r * 3.4, o.r * 1.35, Math.atan2(axy, axx), pal.vesicule, pal.paroiRim);
      break;
    case 'noyau':
      scr.ell(sx, sy, o.r * 1.25, o.r, Math.atan2(axy, axx), pal.cyto, pal.paroi);
      break;
    case 'lipide':
      /* Une gouttelette lipidique est tres refringente : c'est l'objet le plus
         clair du cytoplasme, avec un vrai point brillant. */
      scr.disc(sx, sy, o.r, pal.phase, pal.paroiRim);
      scr.plot(sx - 0.5, sy - 0.5, pal.phase);
      break;
    case 'vacuole':
      /* Une vacuole n'est pas un disque plein : c'est une poche a membrane fine
         et a contenu plus clair que le cytoplasme. */
      scr.ring(sx, sy, o.r, 1, pal.paroiMince);
      scr.disc(sx, sy, Math.max(0.6, o.r - 1), fade32(pal.voile, 0.55));
      break;
    default:
      scr.disc(sx, sy, o.r, pal.vesicule);
  }
}

/**
 * La calotte apicale, le Spitzenkorper et le flux de vesicules qui en part.
 *
 * C'est ici que le modele physiologique devient litteralement visible : le SPK
 * est un corps dense un peu en arriere du bout, et des vesicules en RAYONNENT
 * vers la surface. La direction dans laquelle il se deplace est la direction de
 * croissance — donc quand le joueur barre, il voit le SPK se decaler du cote du
 * virage AVANT que l'apex ne tourne. Le retard du pilotage est donc affiche, et
 * c'est ce qui le rend maitrisable au lieu de flou.
 */
function calotteEtSpk(scr, pal, apex, cam, t, P, cyto, opts) {
  const ax = cam.cx + (apex.x - cam.x);
  const ay = cam.cy - (apex.y - cam.y);
  const dir = apex.dir;
  const ux = Math.cos(dir), uy = -Math.sin(dir);      // axe, en ecran
  const nx = -uy, ny = ux;
  /* Le pulse gonfle la calotte. Ce n'est pas un effet : une bouffee de Ca2+
     declenche l'exocytose, donc un apport de membrane et de paroi, donc
     l'apex avance par paliers. Le gonflement EST le palier. */
  const pulse = apex.facteurPulse({ pulse: opts.pulse || 0 });
  const ep0 = clamp(apex.e * 1.45, 0.55, 3.2);
  const cytoFill = 0.66 + 0.34 * clamp(P / 0.45, 0, 1);
  const mat = clamp(apex.integrite, 0, 1);

  scr.layer(0);
  /* Le bout : troncons de la calotte, de la base vers la pointe. L'epaisseur de
     paroi DIMINUE vers la pointe : la paroi y est la plus neuve, elle n'a pas
     encore de chitine cristalline. C'est aussi pour ca que c'est LA que les
     echinocandines font eclater les hyphes. */
  const L = RAYON * 1.32 * lerp(0.94, 1.1, clamp((pulse - 0.62) / 0.76, 0, 1));
  const col = mix32(pal.paroiMince, pal.paroi, 0.35 + 0.65 * mat);
  const PASC = 0.9;
  for (let d = 0; d + PASC <= L; d += PASC) {
    const r0 = calotte(d, RAYON) * lerp(1, 1.04, clamp(P, 0, 1));
    const r1 = calotte(d + PASC, RAYON) * lerp(1, 1.04, clamp(P, 0, 1));
    if (r0 < 0.4) break;
    troncon(scr, pal, ax + ux * d, ay + uy * d, ax + ux * (d + PASC), ay + uy * (d + PASC),
      r0, Math.max(r1, 0.4), Math.min(ep0, r0 * 0.8), Math.min(ep0 * 0.45, Math.max(r1, 0.5) * 0.8),
      col, col, cytoFill, 1, d === 0, d + PASC * 2 > L);
  }

  /* Bourrelet de vesicules apicales : la calotte est LE point le plus dense en
     organites de tout le champignon, et sur un montage au calcofluor c'est le
     point le plus lumineux. On le rend comme une nuee, pas comme un aplat. */
  const nVes = 9 + Math.round(pulse * 5);
  for (let i = 0; i < nVes; i++) {
    const a = (i / nVes) * TAU + t * 1.4;
    const rr = 1.2 + ((i * 7) % 5) * 0.55;
    const d = 1.4 + ((i * 3) % 4) * 0.9;
    scr.plot(ax + ux * d + nx * Math.sin(a) * rr, ay + uy * d + ny * Math.sin(a) * rr, pal.vesicule);
  }

  /* Le Spitzenkorper. Position : `spkDist` en arriere du bout, DECALEE du cote
     ou le joueur barre — c'est exactement ce que fait le vrai organite, et
     c'est l'affichage de l'intention de virage. */
  const sd = Math.hypot(apex.x - apex.spk.x, apex.y - apex.spk.y);
  const sx = cam.cx + (apex.spk.x - cam.x);
  const sy = cam.cy - (apex.spk.y - cam.y);
  const bril = 0.45 + 0.55 * clamp((pulse - 0.62) / 0.76, 0, 1);
  scr.disc(sx, sy, 1.5 + bril * 0.9, mix32(pal.spkGlow, pal.spk, 0.5), pal.spk);
  scr.plot(sx, sy, pal.spk);
  /* Le halo du SPK : sa brillance est la jauge de flux vesiculaire. Un joueur
     a court de sucre voit son Spitzenkorper PALIR avant que la paroi ne
     s'amincisse. La panne s'annonce, elle ne surprend pas. */
  scr.layer(1);
  scr.disc(sx, sy, 2.4 + bril * 1.5, fade32(pal.spkGlow, 0.30 * bril * (opts.flux || 1)));
  scr.layer(0);

  /* Vesicules en rayonnement du SPK vers la surface de la calotte. Le modele du
     centre d'approvisionnement, dessine tel quel. */
  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const a = dir + (i / (rays - 1) - 0.5) * 2.3;
    const u = ((t * 2.6 + i * 0.37) % 1);
    const dd = sd * 0.4 + u * (sd + RAYON * 0.9);
    const px = sx + Math.cos(a) * dd, py = sy - Math.sin(a) * dd;
    scr.plot(px, py, fade32(pal.vesicule, 1 - u * 0.5));
  }

  /* Bouffees d'exocytose : la vesicule a fusionne, la paroi s'est etendue. */
  if (cyto) {
    for (const f of cyto.flashs) {
      const k = f.t / 0.16;
      const o = f.off * (RAYON - 1.2);
      scr.plot(ax + ux * 1.5 + nx * o, ay + uy * 1.5 + ny * o, fade32(pal.phase, k));
    }
  }

  /* Alerte d'autotropisme : on SENT son propre thalle avant de le toucher.
     Le gene achete ce liseré, et c'est la seule aide de jeu du rendu — encore
     est-elle un phenomene reel. */
  if (apex.contact > 0.02) {
    scr.ring(ax, ay, RAYON + 2.5 + apex.contact * 2, 1,
      fade32(pal.woronin, 0.25 + 0.6 * apex.contact));
  }
}

/** Les noeuds d'anastomose : un pont entre deux hyphes du meme thalle. */
export function noeuds(scr, pal, liste, cam, t) {
  scr.layer(0);
  for (const n of liste) {
    const sx = cam.cx + (n.x - cam.x), sy = cam.cy - (n.y - cam.y);
    if (sx < -10 || sx > scr.w + 10 || sy < -10 || sy > scr.h + 10) continue;
    scr.disc(sx, sy, RAYON * 0.85, pal.cyto, pal.noeud);
    scr.ring(sx, sy, RAYON * 0.85 + 1.4, 1, fade32(pal.noeud, 0.5));
  }
}

export { Screen };
