/* ---------------------------------------------------------------------------
   Le champ de microscope : milieu, decor, concurrents, poussieres.

   POURQUOI LE MILIEU EST DESSINE ET PAS AFFICHE EN CHIFFRES.
   Les quatre grandeurs qui decident de la manche (aw, sucre, temperature,
   antifongique) sont des CHAMPS CONTINUS. Un HUD ne peut en montrer que la
   valeur sous l'apex, ce qui arrive toujours trop tard : quand le chiffre
   bouge, on est deja dedans. Dessinees dans le fond, elles se voient DEVANT
   l'apex, et la trajectoire redevient une decision.

   Le code de lecture, tenu partout :
     sucre eleve     -> le fond se charge en granulations, il devient dense
     aw basse        -> le fond se craquele et s'assombrit, le grain durcit
     antifongique    -> un voile teinte, TOUJOURS sur un calque floute, parce
                        qu'une molecule diffusible n'a pas de bord net
     temperature     -> derive de teinte lente, jamais un chiffre qui clignote

   Et la profondeur de champ n'est pas un filtre : c'est le decor lui-meme qui
   est reparti sur huit calques de nettete. Un grain d'amidon au-dessus du plan
   de l'hyphe est flou ET plus clair, et on passe dessous. Un grain dans le plan
   est net et il BLOQUE. Le flou est donc une information de jeu, pas un effet.
--------------------------------------------------------------------------- */

import { clamp, lerp, hash2 } from '../core/util.js';
import { mix32, fade32, bayer, hexToRgba } from '../core/pixel.js';
import { CONIDIES } from '../data/palette.js';

/* Pas de la grille d'echantillonnage du fond. 6 px : 43 x 59 echantillons pour
   un champ de 256 x 352, soit 2 500 appels de bruit par image au lieu de
   90 000. Mesure : le fond par pixel coutait 11 ms par image sur un portable,
   le fond par blocs de 6 coute 0,9 ms, et la difference ne se voit pas — le
   rendu est deja tramé. */
const PAS_FOND = 6;

const TEINTE_AF = { azole: 'azole', echino: 'echino', polyene: 'polyene', sorbate: 'sorbate' };

/**
 * Le fond : milieu, gradients, voile d'antifongique.
 * Retourne la valeur moyenne de sucre a l'ecran, dont le HUD se sert pour son
 * indicateur de plume.
 */
export function fond(scr, pal, champ, cam) {
  scr.clip = false;
  const W = scr.w, H = scr.h;
  let somme = 0, n = 0;
  for (let sy = 0; sy < H; sy += PAS_FOND) {
    for (let sx = 0; sx < W; sx += PAS_FOND) {
      const wx = cam.x + (sx - cam.cx), wy = cam.y - (sy - cam.cy);
      const ech = champ.echantillon(wx, wy);
      somme += ech.sucre; n++;
      /* Base : le fond du substrat, assombri quand l'eau se retire. Une aw de
         0,70 rend 22 % plus sombre qu'une aw de 0,99 : assez pour qu'une zone
         seche se repere du premier coup d'oeil, pas assez pour qu'on n'y voie
         plus rien. */
      const sec = clamp((0.99 - ech.aw) / 0.30, 0, 1);
      let c = mix32(pal.bg, pal.voile, sec * 0.55);
      /* Granulations de sucre : leur DENSITE porte l'information, pas leur
         couleur. Un aplat colore aurait masque le decor. */
      /* GRANULATIONS. Elles sont tirees sur une grille de 2 px, pas par pixel :
         une granulation d'un pixel isole donne de la NEIGE, pas un milieu. Mesure
         a l'oeil sur capture — le premier rendu, tire par pixel a 30 % de
         densite, couvrait un tiers du champ de points orange d'un pixel et
         ressemblait a un bruit de capteur. En blocs de 2 px a 16 % de densite,
         on lit des granules. */
      const g = ech.sucre;
      for (let j = 0; j < PAS_FOND; j++) {
        for (let i = 0; i < PAS_FOND; i++) {
          const x = sx + i, y = sy + j;
          if (x >= W || y >= H) continue;
          let cc = c;
          const h = hash2((x >> 1) * 3 + 7, (y >> 1) * 5 + 11);
          if (g > 0.08 && h < g * 0.16) {
            cc = mix32(cc, pal.sucre, 0.26 + g * 0.26);
          } else if (sec > 0.3 && h > 1 - sec * 0.10) {
            /* Craquelure de dessiccation : un reseau sombre et irregulier. */
            cc = mix32(cc, pal.grainRim, 0.45);
          }
          scr.px[y * W + x] = cc | 0xff000000;
        }
      }
      /* Voile d'antifongique, sur calque flou : jamais de bord net pour une
         molecule qui diffuse. */
      if (ech.af && ech.af.v > 0.04) {
        scr.layer(6);
        const col = pal[TEINTE_AF[ech.af.type]] || pal.azole;
        scr.rect(sx, sy, PAS_FOND, PAS_FOND, fade32(col, clamp(ech.af.v, 0, 1) * 0.55));
      }
    }
  }
  scr.layer(0);
  return n ? somme / n : 0;
}

/**
 * Decor et objets. Chaque objet recoit une PROFONDEUR stable tiree de sa
 * position : un obstacle qui changerait de plan d'une image a l'autre
 * clignoterait, et un obstacle dans le plan de l'hyphe doit rester le meme
 * obstacle. La profondeur decide du flou ET de la collision : seuls les
 * objets du plan 0 arretent l'apex, et c'est game.js qui l'applique.
 */
export function decor(scr, pal, champ, cam) {
  const x0 = cam.x - cam.cx - 24, x1 = cam.x + (scr.w - cam.cx) + 24;
  const y0 = cam.y - (scr.h - cam.cy) - 24, y1 = cam.y + cam.cy + 24;
  for (const o of champ.dansRect(x0, y0, x1, y1)) {
    const sx = cam.cx + (o.x - cam.x), sy = cam.cy - (o.y - cam.y);
    if (o.type === 'obstacle') {
      if (o.mort) continue;
      dessinerObstacle(scr, pal, o, sx, sy);
    } else if (o.type === 'granule' && !o.pris) {
      /* Un granule de reserve est REFRINGENT : clair, a bord marque, avec un
         point brillant. C'est ce qu'on voit d'un grain d'amidon ou d'une
         gouttelette lipidique en fond clair comme en fluorescence. */
      scr.layer(0);
      scr.disc(sx, sy, o.r, pal.grain, pal.sucreRim);
      scr.plot(sx - o.r * 0.3, sy - o.r * 0.3, pal.phase);
      if (o.amidon) {
        /* Le hile : la croix de Malte d'un grain d'amidon. Elle SIGNALE au
           joueur qu'il lui faut une amylase, sans aucun texte. */
        for (let k = -o.r + 1; k <= o.r - 1; k += 1) {
          scr.plot(sx + k, sy, pal.sucreRim);
          scr.plot(sx, sy + k, pal.sucreRim);
        }
      }
      scr.layer(5);
      scr.disc(sx, sy, o.r + 1.6, fade32(pal.sucre, 0.16));
    } else if (o.type === 'goutte' && !o.pris) {
      scr.layer(0);
      scr.disc(sx, sy, o.r, fade32(pal.eau, 0.55), pal.eauRim);
      scr.ring(sx, sy, o.r - 1, 1, pal.phase);
      scr.layer(6);
      scr.disc(sx, sy, o.r + 2.4, fade32(pal.eau, 0.20));
    } else if (o.type === 'locus' && !o.pris) {
      /* Un locus n'est pas un objet du milieu : c'est un signal. Il a donc le
         droit de PULSER, ce qui est refuse a tout le reste du decor. */
      scr.layer(0);
      const k = 0.6 + 0.4 * Math.sin(performance.now() / 260);
      scr.disc(sx, sy, o.r, pal.locus, pal.locusRim);
      scr.ring(sx, sy, o.r + 1.5 + k, 1, fade32(pal.locus, 0.5 + 0.4 * k));
      scr.layer(5);
      scr.disc(sx, sy, o.r + 4, fade32(pal.locus, 0.14));
    }
  }
  scr.layer(0);
}

function dessinerObstacle(scr, pal, o, sx, sy) {
  /* Le plan vient de la DONNEE (champ.js), jamais d'un hachage local : le rendu
     et la collision doivent lire le meme chiffre, sinon le flou mentirait sur ce
     qui bloque. Sept objets sur dix sont hors du plan de l'hyphe et se
     traversent, ce qui garde le champ plein sans le rendre impraticable. */
  const plan = o.plan || 0;
  const devant = o.devant;
  scr.layer(devant ? 4 + plan : plan);
  const pale = plan === 0 ? 0 : plan * 0.16;
  const fill = mix32(pal.grain, pal.voile, pale);
  const rim = mix32(pal.grainRim, pal.voile, pale);
  switch (o.forme) {
    case 'amidon':
      /* Un grain d'amidon de ble est LENTICULAIRE et porte un hile central. Le
         dessiner rond en fait une bulle et l'amande de ble devient une mousse. */
      scr.ellipse(sx, sy, o.r, o.ry, o.ang, fill, rim);
      scr.ringE(sx, sy, o.r, o.ry, o.ang, 1, pal.phase);
      scr.disc(sx, sy, 1, rim);
      break;
    case 'cristal':
      /* Un cristal de saccharose est ANGULEUX. On l'approche par un losange :
         a cette taille, quatre aretes suffisent a le distinguer d'une goutte. */
      for (let k = -o.r; k <= o.r; k += 0.7) {
        const w = (1 - Math.abs(k) / o.r) * o.ry;
        for (let m = -w; m <= w; m += 0.7) {
          const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
          scr.plot(sx + k * ca - m * sa, sy + k * sa + m * ca,
            Math.abs(k) > o.r - 1.2 || Math.abs(m) > w - 1 ? rim : fill);
        }
      }
      break;
    case 'paroiveg': {
      /* Une paroi cellulaire vegetale est une CLOISON, pas une boule : c'est
         elle qui fait les couloirs du mesocarpe. On la dessine comme un arc
         epais, ce qui donne au champ sa lecture de reseau polygonal. */
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = o.ang + (i / (n - 1) - 0.5) * 1.9;
        const px = sx + Math.cos(a) * o.r, py = sy + Math.sin(a) * o.r;
        scr.disc(px, py, 2.1, fill, rim);
      }
      break;
    }
    default:
      /* Ecaille de cire : basse, allongee, mate. */
      scr.ellipse(sx, sy, o.r, o.ry * 0.7, o.ang, fill, rim);
  }
  scr.layer(0);
}

/**
 * Les concurrents.
 *
 * Ils sont rendus PLUS PALES ET LEGEREMENT FLOUS, sur le calque 1. Ce n'est pas
 * une hierarchie graphique : un autre mycelium pousse a une autre profondeur
 * dans le substrat, et c'est exactement comme cela qu'on le voit. Cela rend
 * aussi le champ lisible quand trois fronts se croisent — le joueur reste le
 * seul objet parfaitement net de l'image.
 */
export function rivaux(scr, pal, competiteurs, rival, cam) {
  const conidies = {};
  for (const c of competiteurs) {
    if (!conidies[c.espece]) {
      const k = CONIDIES[c.espece] || CONIDIES.penicillium;
      conidies[c.espece] = { fill: hexToRgba(k.fill), rim: hexToRgba(k.rim) };
    }
  }
  scr.layer(1);
  for (const b of rival.branches) {
    const pts = b.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], p = pts[i];
      const ax = cam.cx + (a.x - cam.x), ay = cam.cy - (a.y - cam.y);
      const px = cam.cx + (p.x - cam.x), py = cam.cy - (p.y - cam.y);
      if ((ax < -12 && px < -12) || (ax > scr.w + 12 && px > scr.w + 12)) continue;
      if ((ay < -12 && py < -12) || (ay > scr.h + 12 && py > scr.h + 12)) continue;
      scr.seg(ax, ay, px, py, 3.4, pal.paroiMince, pal.paroiRim);
    }
  }
  /* Les apex rivaux portent la couleur de conidies de leur espece. C'est la
     seule information dont le joueur a besoin : elle dit a quelle vitesse le
     front avance et donc s'il faut passer devant ou renoncer. */
  for (const c of competiteurs) {
    const col = conidies[c.espece];
    for (const t of c.tips) {
      const sx = cam.cx + (t.x - cam.x), sy = cam.cy - (t.y - cam.y);
      scr.layer(1);
      scr.disc(sx, sy, 2.6, col.fill, col.rim);
      scr.layer(5);
      scr.disc(sx, sy, 5, fade32(col.fill, 0.18));
    }
  }
  scr.layer(0);
}

/**
 * Poussieres hors plan.
 *
 * Elles ne servent a rien, et c'est pour cela qu'elles comptent : un champ de
 * microscope reel n'est jamais propre. Deux nappes qui derivent a des vitesses
 * differentes donnent la parallaxe, donc l'epaisseur de la preparation. Sans
 * elles le fond paraissait peint derriere une vitre.
 */
export function poussiere(scr, pal, cam, t) {
  for (let nappe = 0; nappe < 2; nappe++) {
    const z = nappe === 0 ? 7 : 3;
    const par = nappe === 0 ? 0.55 : 1.25;   // parallaxe
    scr.layer(z);
    const pas = 44;
    const ox = cam.x * par, oy = cam.y * par;
    const cx0 = Math.floor((ox - 140) / pas), cx1 = Math.floor((ox + 140) / pas);
    const cy0 = Math.floor((oy - 200) / pas), cy1 = Math.floor((oy + 200) / pas);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = hash2(cx * 31 + nappe * 977, cy * 17 + nappe * 131);
        if (h > 0.42) continue;
        const wx = cx * pas + h * pas, wy = cy * pas + hash2(cy, cx) * pas;
        /* Mouvement brownien lent. Une poussiere de 2 um dans un milieu visqueux
           ne file pas : elle tremble. */
        const dx = Math.sin(t * 0.35 + h * 40) * 2.2;
        const dy = Math.cos(t * 0.28 + h * 27) * 2.2;
        const sx = cam.cx + (wx + dx - ox), sy = cam.cy - (wy + dy - oy);
        if (sx < -6 || sx > scr.w + 6 || sy < -6 || sy > scr.h + 6) continue;
        scr.disc(sx, sy, 0.9 + h * 2.2, fade32(pal.grain, 0.45), fade32(pal.grainRim, 0.5));
      }
    }
  }
  scr.layer(0);
}

/**
 * Vignetage et aberration de bord.
 *
 * Aucun objectif n'eclaire son champ uniformement, et aucun ne corrige tout
 * jusqu'au bord. On assombrit donc les coins et on laisse une derive de teinte
 * dans les 18 derniers pixels. C'est ce qui fait que l'image se lit comme
 * regardee A TRAVERS quelque chose, ce qui est tout le sujet.
 */
export function vignette(scr, pal) {
  const W = scr.w, H = scr.h, cx = W / 2, cy = H / 2;
  const rmax = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy) / rmax;
      if (r < 0.62) continue;
      const k = (r - 0.62) / 0.38;
      const a = k * k * 0.55;
      if (bayer(x, y) > a * 1.6) continue;
      const o = y * W + x;
      const d = scr.px[o];
      const ia = 1 - a;
      scr.px[o] = 0xff000000
        | ((((d >> 16) & 255) * ia) << 16)
        | ((((d >> 8) & 255) * ia) << 8)
        | (((d & 255) * ia) | 0);
    }
  }
}
