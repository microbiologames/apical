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

/** Rayon du tube, EN MICROMETRES. 7 um de rayon = 14 um de diametre : un
    Rhizopus, pas un Penicillium. 10 a 15 um est la plage reelle des Mucorales.
    Sa taille a l'ecran depend maintenant du ZOOM de la camera (`cam.z`, en
    pixels par micrometre) : a z = 2,4 le tube fait 34 px de large dans un champ
    de 256, soit 13 % de la largeur. C'est ce resserrement qui fait de la
    VISIBILITE une ressource — on ne voit plus que 107 um de large, donc le
    choix de trajectoire se fait a l'aveugle et se paie. */
export const RAYON = 7;
/** Duree de rigidification apparente de la paroi. */
const MATURATION = 0.30;
/** Pas d'echantillonnage des sections. 0,8 px : au-dessus de 1,1 px des
    coutures apparaissent sur les obliques a 45 deg. */
const PAS = 0.8;
/** Longueur de tube rendue derriere chaque apex, en um. Ramenee de 470 a 300
    avec l'arrivee du zoom : a z = 2,4 le champ ne montre que 110 a 200 um, donc
    tout ce qui est au-dela de 300 um etait rasterise pour rien. */
const PORTEE = 200;

/**
 * Sections transversales d'une branche, du bout vers l'arriere.
 * Chaque section porte sa position, sa normale, son epaisseur de paroi et sa
 * date de depot — donc son etat de maturation.
 */
export function sections(branche, portee = PORTEE, pas = PAS) {
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
    for (let d = reste; d < len && total < portee; d += pas, total += pas) {
      const u = 1 - d / len;
      out.push({
        x: p0.x + dx * u, y: p0.y + dy * u,
        nx: -uy, ny: ux,
        e: lerp(p0.e, p1.e, u), t: lerp(p0.t, p1.t, u),
        s: total,
      });
    }
    reste = Math.max(0, pas - ((len - reste) % pas));
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
  /* PROFIL REVU : le precedent (exposants 1,75 et 0,52 sur L = 1,32 R) donnait
     un bout court et tres bombe, qui se lisait comme un BOURGEON pose sur un
     tube — un defaut de silhouette signale a l'essai, et il avait deux causes
     cumulees : la calotte etait trop courte pour son rayon, et elle etait en
     plus gonflee par le turgor et par le pulse.
     On prend maintenant une demi-ellipse de demi-axes R et 1,55 R. Elle a deux
     vertus : elle raccorde le tube avec une tangente exactement perpendiculaire
     a l'axe (donc aucune cassure visible a la base), et elle est une fois et
     demie plus longue que large, ce qui est la silhouette d'un apex fongique en
     croissance. Le gonflement radial a ete supprime : le pulse allonge le bout,
     il ne l'enfle pas. */
  const L = R * 1.55;
  if (d >= L) return 0;
  const u = d / L;
  return R * Math.sqrt(Math.max(0, 1 - u * u));
}

/**
 * Epaisseur de paroi A L'ECRAN, en pixels.
 *
 * ELLE NE SUIT PAS LE ZOOM, et c'est une correction importante. La version
 * precedente multipliait l'epaisseur par `z` comme toute autre longueur : a
 * z = 4,6 la paroi faisait huit pixels et le tube se lisait comme une saucisse
 * floue bordee de bleu au lieu d'un tube a paroi rigide.
 * Le fait physique tranche dans le meme sens : une paroi d'hyphe fait 0,1 a
 * 0,3 um, soit UN pixel meme a ce grossissement. Si on la dessinait a l'echelle
 * elle disparaitrait ; si on la met a l'echelle du zoom elle devient un
 * bourrelet. On la garde donc a une largeur d'ECRAN quasi constante — de 1,3 a
 * 3,4 px selon l'epaisseur du modele — pour qu'elle reste lisible comme trait
 * ET qu'elle continue de porter la jauge de sucre.
 */
function epaisseurEcran(e, z) {
  return clamp(1.15 + e * 1.35 + z * 0.06, 1.0, 3.6);
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
  const z = cam.z || 1;
  /* Le pas d'echantillonnage est fixe A L'ECRAN, pas dans le monde : c'est la
     densite de sections PAR PIXEL qui doit rester constante, sinon un zoom
     avant laisse des coutures et un zoom arriere calcule dix fois trop. */
  const pas = 0.8 / z;
  const secs = sections(b, PORTEE, pas);
  if (!secs.length) return;
  const Rpx = RAYON * z;
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
    const sx = cam.cx + (s.x - cam.x) * z;
    const sy = cam.cy - (s.y - cam.y) * z;
    /* Maturation : la paroi neuve est plus mince et plus pale. */
    const mat = clamp((t - s.t) / MATURATION, 0, 1);
    const ep = epaisseurEcran(s.e * (0.42 + 0.58 * mat), z);
    const col = mix32(pal.paroiMince, pal.paroi, mat);
    /* Plasmolyse : plus marquee loin de l'apex, ou le cytoplasme se retire en
       premier. L'apex garde son turgor le plus longtemps, c'est lui qui pompe. */
    const fill = clamp(cytoFillBase + 0.16 * (1 - clamp(s.s / 120, 0, 1)), 0.2, 1);
    const cur = { sx, sy, ep, col, fill };
    if (prec && (sx > -18 && sx < scr.w + 18 && sy > -18 && sy < scr.h + 18)) {
      troncon(scr, pal, prec.sx, prec.sy, sx, sy, Rpx, Rpx,
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
    const sx = cam.cx + (p.x - cam.x) * z, sy = cam.cy - (p.y - cam.y) * z;
    if (sx < -10 || sx > scr.w + 10 || sy < -10 || sy > scr.h + 10) continue;
    const i = b.pts.indexOf(p);
    const q = b.pts[Math.max(0, i - 1)];
    const dx = p.x - q.x, dy = -(p.y - q.y);
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    for (let k = -Rpx + z * 0.6; k <= Rpx - z * 0.6; k += 0.6) {
      scr.plot(sx + nx * k, sy + ny * k, pal.septum);
    }
    /* Corps de Woronin : deux de chaque cote du pore, refringents. On les
       dessine parce qu'ils sont la raison pour laquelle une lyse apicale ne
       vide pas tout le thalle, et un joueur qui a pris le gene doit VOIR ce
       qu'il a achete. */
    if (opts.woronin) {
      const ax = dx / l, ay = dy / l;
      for (const s2 of [-1.9 * z, 1.9 * z]) {
        for (const o of [-1.5 * z, 1.5 * z]) {
          scr.plot(sx + ax * s2 + nx * o, sy + ay * s2 + ny * o, pal.woronin);
        }
      }
    }
  }

  /* --- organites ----------------------------------------------------- */
  const orgs = cyto ? cyto.liste(b.id) : [];
  for (const o of orgs) {
    const pos = surTube(secs, o.s, pas);
    if (!pos) continue;
    const Rint = RAYON - 1.5;
    const wx = pos.x + pos.nx * o.off * Rint;
    const wy = pos.y + pos.ny * o.off * Rint;
    const sx = cam.cx + (wx - cam.x) * z, sy = cam.cy - (wy - cam.y) * z;
    if (sx < -10 || sx > scr.w + 10 || sy < -10 || sy > scr.h + 10) continue;
    /* PROFONDEUR DE CHAMP : la position laterale devient un flou. Un organite
       colle a la paroi est en haut ou en bas du tube, donc hors du plan.
       EXCEPTION : les vesicules restent NETTES. Ce sont elles le sujet — on doit
       pouvoir suivre chacune du fond du tube jusqu'a sa fusion — et floutees,
       avec un contour d'un pixel, elles disparaissaient purement et simplement. */
    const flou = o.type !== 'vesicule' && Math.abs(o.off) > 0.5 ? 1 : 0;
    scr.layer(flou);
    dessinerOrganite(scr, pal, o, sx, sy, pos, z);
  }
  scr.layer(0);

}

/** Position et normale a une distance `s` du bout. Interpolation lineaire. */
function surTube(secs, s, pas) {
  if (!secs.length) return null;
  const i = Math.round(s / pas);
  if (i < 0 || i >= secs.length) return null;
  return secs[i];
}

function dessinerOrganite(scr, pal, o, sx, sy, pos, z) {
  const r = o.r * z;
  const axx = -pos.ny, axy = -pos.nx;   // axe du tube, en ecran
  switch (o.type) {
    case 'vesicule': {
      /* CHAQUE ROLE A SA FORME, et chaque forme est celle de l'organite reel.
         A ce niveau de zoom une vesicule fait quatre a huit pixels : la forme
         se lit, et c'est elle qui porte le sens — la couleur seule ne suffirait
         pas sur un cytoplasme pale. */
      const ang = Math.atan2(axy, axx);
      switch (o.role) {
        case 'extension':
          /* Macrovesicule apicale, 70-100 nm : la plus GROSSE, et c'est elle
             qui allonge. On la dessine CONTOUREE et claire au centre — comme on
             la voit en contraste de phase, et comme on doit pouvoir la suivre :
             une vesicule pleine se confond avec le cytoplasme des qu'elle
             croise un autre organite. */
          /* REFRINGENTE, donc PLUS CLAIRE que le cytoplasme. Remplie de la
             teinte du cytoplasme, elle etait litteralement invisible : le centre
             du tube est dessine avec cette teinte-la. Une vesicule est un corps
             dense a fort indice de refraction — en contraste de phase elle
             brille, elle ne se fond pas. */
          scr.disc(sx, sy, r * 1.35, pal.phase, pal.vesExtension);
          scr.ring(sx, sy, r * 1.35, Math.max(1.4, z * 0.3), pal.vesExtension);
          break;
        case 'membrane':
          /* Vesicule lipidique : une bicouche, donc un ANNEAU et non un disque. */
          scr.disc(sx, sy, r * 1.1, pal.phase);
          scr.ring(sx, sy, r * 1.1, Math.max(1.4, z * 0.3), pal.vesMembrane);
          break;
        case 'secretion':
          /* Enzyme exportee : allongee, elle file vers la sortie. */
          scr.cap(sx, sy, r * 2.4, r * 0.85, ang, pal.phase, pal.vesSecretion);
          break;
        default:
          /* Chitosome, 30-40 nm : petit, dense, POLYEDRIQUE. On le rend carre —
             a cette taille, quatre cotes droits suffisent a le distinguer d'un
             disque, et c'est un vrai caractere ultrastructural. */
          {
            const q = r * 0.75;
            for (let a = -q; a <= q; a += 0.7) {
              for (let b = -q; b <= q; b += 0.7) {
                const bord = Math.abs(a) > q - 0.9 || Math.abs(b) > q - 0.9;
                scr.plot(sx + a, sy + b, bord ? pal.vesParoi : pal.phase);
              }
            }
          }
      }
      break;
    }
    case 'mito':
      /* Une mitochondrie fongique est un FUSEAU aligne sur l'axe du tube : elle
         suit les microtubules. La dessiner ronde donnait des billes et le flux
         perdait sa direction. */
      /* Mitochondrie ECLAIRCIE : en bleu moyen a bord fonce, elle formait au
         zoom serre un corps sombre qui se lisait comme une piece mecanique. */
      scr.cap(sx, sy, r * 2.6, r * 0.85, Math.atan2(axy, axx), pal.cyto, pal.vesicule);
      break;
    case 'noyau':
      /* `ellipse` et non `ell` : le bord y commence a 0,80 du rayon au lieu de
         0,62, donc le noyau a un CONTOUR et non un gros anneau plein. Au zoom
         serre, la difference decide de tout — a 0,62 les noyaux devenaient des
         masses sombres qui mangeaient le cytoplasme. */
      scr.ellipse(sx, sy, r * 1.25, r, Math.atan2(axy, axx), pal.cyto, pal.paroi);
      break;
    case 'lipide':
      /* Une gouttelette lipidique est tres refringente : c'est l'objet le plus
         clair du cytoplasme, avec un vrai point brillant. */
      scr.disc(sx, sy, r, pal.phase, pal.paroiRim);
      scr.plot(sx - 0.5 * z, sy - 0.5 * z, pal.phase);
      break;
    case 'vacuole':
      /* Une vacuole n'est pas un disque plein : c'est une poche a membrane fine
         et a contenu plus clair que le cytoplasme. */
      scr.ring(sx, sy, r, Math.max(1, z * 0.7), pal.paroiMince);
      scr.disc(sx, sy, Math.max(0.6, r - z), fade32(pal.voile, 0.55));
      break;
    default:
      scr.disc(sx, sy, r, pal.vesicule);
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
  const z = cam.z || 1;
  const Rpx = RAYON * z;
  const ax = cam.cx + (apex.x - cam.x) * z;
  const ay = cam.cy - (apex.y - cam.y) * z;
  const dir = apex.dir;
  const ux = Math.cos(dir), uy = -Math.sin(dir);      // axe, en ecran
  const nx = -uy, ny = ux;
  /* Le pulse ALLONGE la calotte, il ne l'enfle pas. Une bouffee de Ca2+
     declenche l'exocytose, donc un apport de membrane et de paroi a la POINTE :
     l'apex avance par paliers. La version precedente gonflait aussi le rayon,
     ce qui faisait battre la silhouette et contribuait au bourgeon. */
  const pulse = apex.facteurPulse({ pulse: opts.pulse || 0 });
  const ep0 = epaisseurEcran(apex.e, z);
  const cytoFill = 0.66 + 0.34 * clamp(P / 0.45, 0, 1);
  const mat = clamp(apex.integrite, 0, 1);

  scr.layer(0);
  /* Le bout : troncons de la calotte, de la base vers la pointe. L'epaisseur de
     paroi DIMINUE vers la pointe : la paroi y est la plus neuve, elle n'a pas
     encore de chitine cristalline. C'est aussi pour ca que c'est LA que les
     echinocandines font eclater les hyphes. */
  const etire = lerp(0.96, 1.08, clamp((pulse - 0.62) / 0.76, 0, 1));
  const L = Rpx * 1.55 * etire;
  const col = mix32(pal.paroiMince, pal.paroi, 0.35 + 0.65 * mat);
  /* Le pas est CALCULE pour tomber juste sur L : un pas fixe laissait un reste
     non couvert, donc un cran d'un ou deux pixels au sommet de la calotte —
     visible sur capture macro, et il suffisait a casser la courbe. */
  const nC = Math.max(4, Math.ceil(L / 0.7));
  const PASC = L / nC;
  for (let i = 0; i < nC; i++) {
    const d = i * PASC;
    const r0 = calotte(d / etire, Rpx);
    const r1 = calotte((d + PASC) / etire, Rpx);
    if (r0 < 0.4) break;
    troncon(scr, pal, ax + ux * d, ay + uy * d, ax + ux * (d + PASC), ay + uy * (d + PASC),
      r0, Math.max(r1, 0.35), Math.min(ep0, r0 * 0.8), Math.min(ep0 * 0.45, Math.max(r1, 0.5) * 0.8),
      col, col, cytoFill, 1, i === 0, i === nC - 1);
  }

  /* Bourrelet de vesicules apicales : la calotte est LE point le plus dense en
     organites de tout le champignon, et sur un montage au calcofluor c'est le
     point le plus lumineux. On le rend comme une nuee, pas comme un aplat. */
  /* Reste CONFINE dans le premier tiers de la calotte : etale plus loin, il
     dessinait un liseré clair tout autour du bout et c'est lui qui donnait au
     tout la silhouette d'un bulbe. */
  /* NUEE APICALE reduite a six points. Elle ne doit pas concurrencer les
     vesicules individuelles qui arrivent : au zoom serre, ce sont elles le
     spectacle, et un bourrelet dense les noyait. */
  const nVes = 5 + Math.round(pulse * 2);
  for (let i = 0; i < nVes; i++) {
    const a = (i / nVes) * TAU + t * 1.1;
    const rr = (0.9 + ((i * 7) % 4) * 0.35) * z * 0.42;
    const d = (0.8 + ((i * 3) % 3) * 0.6) * z * 0.5;
    scr.plot(ax + ux * d + nx * Math.sin(a) * rr, ay + uy * d + ny * Math.sin(a) * rr, pal.vesParoi);
  }

  /* Le Spitzenkorper. Position : `spkDist` en arriere du bout, DECALEE du cote
     ou le joueur barre — c'est exactement ce que fait le vrai organite, et
     c'est l'affichage de l'intention de virage. */
  const sd = Math.hypot(apex.x - apex.spk.x, apex.y - apex.spk.y) * z;
  const sx = cam.cx + (apex.spk.x - cam.x) * z;
  const sy = cam.cy - (apex.spk.y - cam.y) * z;
  const bril = 0.45 + 0.55 * clamp((pulse - 0.62) / 0.76, 0, 1);
  /* LE SPITZENKORPER EST UNE NUEE, PAS UN CORPS. Il etait rendu comme un disque
     net, ce qui en faisait visuellement une poignee de commande — or il n'en est
     plus une, et il n'en a jamais ete une dans un microscope : c'est un
     rassemblement de vesicules a contour flou, qu'on reconnait a sa DENSITE.
     On le dessine donc en une vingtaine de points disperses, dont l'etalement
     se resserre quand le flux monte. Il reste parfaitement lisible comme
     information — ou penche la nuee, c'est ou l'on va — sans se donner pour un
     objet qu'on manipule. */
  /* CROISSANT et non amas. Reparti sur une nuee ronde et dense, le SPK se
     lisait comme une tache grise posee au pied de la calotte — vu sur capture,
     « un insecte ». Le vrai organite est un CROISSANT de vesicules applique
     contre la face interne de l'apex : on biaise donc la distribution vers
     l'avant, on allege le nombre, et il redevient ce qu'il est — une zone plus
     dense, pas un corps. */
  const nuee = 9 + Math.round(bril * 4);
  const etal = (2.4 - bril * 0.8) * z * 0.30;
  for (let i = 0; i < nuee; i++) {
    const a = (i * 2.399) + t * 0.9;            // angle d'or : jamais de motif
    const rr = Math.sqrt(((i * 37) % 23) / 23) * etal;
    /* Biais vers l'avant : le croissant epouse la calotte. */
    const px = sx + Math.cos(a) * rr + ux * etal * 0.55;
    const py = sy + Math.sin(a) * rr + uy * etal * 0.55;
    /* Teintes CLAIRES : en points sombres, la nuee formait au pied de la
       calotte un amas noir qui se lisait comme un corps etranger — vu sur
       capture. Un Spitzenkorper est dense en vesicules, donc CLAIR en contraste
       de phase, pas noir. */
    scr.plot(px, py, i % 5 === 0 ? pal.vesExtension : pal.phase);
  }
  /* Le halo du SPK : sa brillance est la jauge de flux vesiculaire. Un joueur
     a court de sucre voit son Spitzenkorper PALIR avant que la paroi ne
     s'amincisse. La panne s'annonce, elle ne surprend pas. */
  scr.layer(1);
  scr.disc(sx, sy, (2.4 + bril * 1.5) * z * 0.62, fade32(pal.spkGlow, 0.30 * bril * (opts.flux || 1)));
  scr.layer(0);

  /* Vesicules en rayonnement du SPK vers la surface de la calotte. Le modele du
     centre d'approvisionnement, dessine tel quel. */
  /* Rayons CONTENUS dans la calotte : ils allaient jusqu'a sd + 0,9 R, ce qui
     au zoom serre les faisait sortir du tube et dessinait deux traits en
     travers de la paroi. Une vesicule ne traverse pas sa propre paroi. */
  const rays = 5;
  for (let i = 0; i < rays; i++) {
    const a = dir + (i / (rays - 1) - 0.5) * 1.7;
    const u = ((t * 2.6 + i * 0.37) % 1);
    const dd = sd * 0.25 + u * sd * 0.8;
    const px = sx + Math.cos(a) * dd, py = sy - Math.sin(a) * dd;
    scr.plot(px, py, fade32(pal.phase, 0.85 - u * 0.5));
  }

  /* Bouffees d'exocytose : la vesicule a fusionne, la paroi s'est etendue. */
  if (cyto) {
    for (const f of cyto.flashs) {
      const k = clamp(f.t / 0.26, 0, 1);
      const o = f.off * (Rpx - 1.2 * z);
      const bx2 = ax + ux * 1.2 * z + nx * o, by2 = ay + uy * 1.2 * z + ny * o;
      /* CE QUE FAIT LA VESICULE EN FUSIONNANT, dessine. Quatre gestes distincts,
         et chacun est le phenomene : la chitine epaissit le bord, la
         macrovesicule pousse le bout, la lipidique etale la membrane, l'enzyme
         part DEHORS. */
      switch (f.role) {
        case 'extension': {
          /* Un jet vers l'avant : c'est du materiau de surface qui arrive. */
          const d2 = (1 - k) * Rpx * 0.45;
          scr.disc(bx2 + ux * d2, by2 + uy * d2, 0.7 * z * k, fade32(pal.vesExtension, k));
          break;
        }
        case 'membrane':
          /* Un anneau qui s'etale : la membrane gagne de la surface. */
          scr.ring(bx2, by2, (1 - k) * 1.6 * z + 0.6, Math.max(1, z * 0.18),
            fade32(pal.vesMembrane, k * 0.9));
          break;
        case 'secretion': {
          /* Elle SORT : elle traverse la paroi et s'eloigne dans le milieu.
             C'est la seule vesicule qui ne construit rien. */
          const d3 = (1 - k) * Rpx * 1.1;
          scr.plot(bx2 + ux * d3 + nx * o * 0.3, by2 + uy * d3 + ny * o * 0.3,
            fade32(pal.vesSecretion, k));
          break;
        }
        default: {
          /* Chitine : un court arc DANS la paroi, du cote ou elle a fusionne.
             La paroi s'epaissit sous les yeux, un chitosome a la fois. */
          const s2 = f.off >= 0 ? 1 : -1;
          for (let j = -1; j <= 1; j++) {
            scr.plot(bx2 + nx * s2 * 0.45 * z + ux * j * z * 0.35,
              by2 + ny * s2 * 0.45 * z + uy * j * z * 0.35, fade32(pal.vesParoi, k));
          }
        }
      }
    }
  }

  /* Alerte d'autotropisme : on SENT son propre thalle avant de le toucher.
     Le gene achete ce liseré, et c'est la seule aide de jeu du rendu — encore
     est-elle un phenomene reel. */
  if (apex.contact > 0.02) {
    scr.ring(ax, ay, Rpx + (2.5 + apex.contact * 2) * z, Math.max(1, z * 0.6),
      fade32(pal.woronin, 0.25 + 0.6 * apex.contact));
  }
}

/** Les noeuds d'anastomose : un pont entre deux hyphes du meme thalle. */
export function noeuds(scr, pal, liste, cam) {
  const z = cam.z || 1;
  scr.layer(0);
  for (const n of liste) {
    const sx = cam.cx + (n.x - cam.x) * z, sy = cam.cy - (n.y - cam.y) * z;
    if (sx < -14 || sx > scr.w + 14 || sy < -14 || sy > scr.h + 14) continue;
    scr.disc(sx, sy, RAYON * z * 0.85, pal.cyto, pal.noeud);
    scr.ring(sx, sy, RAYON * z * 0.85 + 1.4 * z, Math.max(1, z * 0.6), fade32(pal.noeud, 0.5));
  }
}

/**
 * LA SPORE. Elle reste a l'origine du monde pendant toute la manche : c'est
 * d'elle que part le thalle, et la voir derriere soi pendant les premieres
 * secondes dit d'ou l'on vient sans une ligne de texte.
 *
 * Une conidie est refringente, a paroi epaisse et souvent ornementee. Elle
 * GONFLE pendant l'imbibition — son volume double avant que quoi que ce soit ne
 * sorte — puis elle ne change plus : elle se vide simplement de ses reserves.
 */
export function spore(scr, pal, x, y, r, cam, germ) {
  const z = cam.z || 1;
  const sx = cam.cx + (x - cam.x) * z, sy = cam.cy - (y - cam.y) * z;
  const R = r * z;
  if (sx < -R - 8 || sx > scr.w + R + 8 || sy < -R - 8 || sy > scr.h + R + 8) return;
  scr.layer(0);
  /* Paroi epaisse : deux tiers de disque interieur, un tiers de paroi. */
  scr.disc(sx, sy, R, pal.paroi, pal.paroiRim);
  scr.disc(sx, sy, R * 0.66, mix32(pal.cyto, pal.voile, 0.45 * germ));
  /* Ornementation : quatre verrues, un vrai caractere de conidie. */
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + 0.5;
    scr.plot(sx + Math.cos(a) * R * 0.86, sy + Math.sin(a) * R * 0.86, pal.paroiRim);
  }
  scr.layer(5);
  scr.disc(sx, sy, R + 2 * z, fade32(pal.phase, 0.18));
  scr.layer(0);
}

export { Screen };
