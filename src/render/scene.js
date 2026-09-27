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
import { mix32, fade32, bayer } from '../core/pixel.js';

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
  const zz = cam.z || 1;
  let somme = 0, n = 0;
  for (let sy = 0; sy < H; sy += PAS_FOND) {
    for (let sx = 0; sx < W; sx += PAS_FOND) {
      const wx = cam.x + (sx - cam.cx) / zz, wy = cam.y - (sy - cam.cy) / zz;
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
          /* Taille du grain indexee sur le ZOOM, mais a la RACINE : a z = 4,6
             un facteur lineaire donnait des blocs de 4 px qui se lisaient comme
             des carreaux de mosaique, pas comme un milieu granuleux. Une
             granulation de milieu fait environ un demi-micrometre : a z = 4,6
             cela fait deux pixels, et c'est exactement ce que rend la racine. */
          const q = Math.max(1, Math.round(Math.sqrt(zz) * 0.95));
          const h = hash2(Math.floor(x / q) * 3 + 7, Math.floor(y / q) * 5 + 11);
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
  const z = cam.z || 1;
  const x0 = cam.x - (cam.cx + 24) / z, x1 = cam.x + (scr.w - cam.cx + 24) / z;
  const y0 = cam.y - (scr.h - cam.cy + 24) / z, y1 = cam.y + (cam.cy + 24) / z;
  for (const o of champ.dansRect(x0, y0, x1, y1)) {
    const sx = cam.cx + (o.x - cam.x) * z, sy = cam.cy - (o.y - cam.y) * z;
    if (o.type === 'obstacle') {
      if (o.mort) continue;
      dessinerObstacle(scr, pal, o, sx, sy, z);
    } else if (o.type === 'sel') {
      /* CRISTAL DE SEL. Il ne fait rien par lui-meme : il rend visible le puits
         d'activite de l'eau qu'il cree autour de lui. Cubique, incolore,
         refringent — c'est son arete qu'on voit et non sa masse, donc on le rend
         en carré a bord dur avec un angle brillant. La poche s'annonce ainsi
         AVANT d'etre traversee, ce qui en fait un choix de trajectoire. */
      const r = o.r * z;
      const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
      scr.layer(0);
      for (let a = -r; a <= r; a += 0.7) {
        for (let b = -r; b <= r; b += 0.7) {
          const bord = Math.abs(a) > r - z * 0.7 || Math.abs(b) > r - z * 0.7;
          scr.plot(sx + a * ca - b * sa, sy + a * sa + b * ca, bord ? pal.selRim : pal.sel);
        }
      }
      scr.plot(sx - r * 0.4 * ca + r * 0.4 * sa, sy - r * 0.4 * sa - r * 0.4 * ca, pal.phase);
    } else if (o.type === 'granule' && !o.pris) {
      /* Un granule de reserve est REFRINGENT : clair, a bord marque, avec un
         point brillant. C'est ce qu'on voit d'un grain d'amidon ou d'une
         gouttelette lipidique en fond clair comme en fluorescence. */
      scr.layer(0);
      scr.disc(sx, sy, o.r * z, pal.grain, pal.sucreRim);
      scr.plot(sx - o.r * z * 0.3, sy - o.r * z * 0.3, pal.phase);
      if (o.amidon) {
        /* Le hile : la croix de Malte d'un grain d'amidon. Elle SIGNALE au
           joueur qu'il lui faut une amylase, sans aucun texte. */
        for (let k = -o.r * z + 1; k <= o.r * z - 1; k += 0.8) {
          scr.plot(sx + k, sy, pal.sucreRim);
          scr.plot(sx, sy + k, pal.sucreRim);
        }
      }
      scr.layer(5);
      scr.disc(sx, sy, o.r * z + 1.6 * z, fade32(pal.sucre, 0.16));
    } else if (o.type === 'goutte' && !o.pris) {
      scr.layer(0);
      scr.disc(sx, sy, o.r * z, fade32(pal.eau, 0.55), pal.eauRim);
      scr.ring(sx, sy, o.r * z - z, Math.max(1, z * 0.7), pal.phase);
      scr.layer(6);
      scr.disc(sx, sy, (o.r + 2.4) * z, fade32(pal.eau, 0.20));
    } else if (o.type === 'locus' && !o.pris) {
      /* Un locus n'est pas un objet du milieu : c'est un signal. Il a donc le
         droit de PULSER, ce qui est refuse a tout le reste du decor. */
      scr.layer(0);
      const k = 0.6 + 0.4 * Math.sin(performance.now() / 260);
      scr.disc(sx, sy, o.r * z, pal.locus, pal.locusRim);
      scr.ring(sx, sy, o.r * z + (1.5 + k) * z, Math.max(1, z * 0.7), fade32(pal.locus, 0.5 + 0.4 * k));
      scr.layer(5);
      scr.disc(sx, sy, (o.r + 4) * z, fade32(pal.locus, 0.14));
    }
  }
  scr.layer(0);
}

function dessinerObstacle(scr, pal, o, sx, sy, z) {
  const R = o.r * z, RY = o.ry * z;
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
      scr.ellipse(sx, sy, R, RY, o.ang, fill, rim);
      scr.ringE(sx, sy, R, RY, o.ang, Math.max(1, z * 0.7), pal.phase);
      scr.disc(sx, sy, Math.max(1, z * 0.6), rim);
      break;
    case 'cristal':
      /* Un cristal de saccharose est ANGULEUX. On l'approche par un losange :
         a cette taille, quatre aretes suffisent a le distinguer d'une goutte. */
      for (let k = -R; k <= R; k += 0.7) {
        const w = (1 - Math.abs(k) / R) * RY;
        for (let m = -w; m <= w; m += 0.7) {
          const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
          scr.plot(sx + k * ca - m * sa, sy + k * sa + m * ca,
            Math.abs(k) > R - 1.2 * z || Math.abs(m) > w - z ? rim : fill);
        }
      }
      break;
    case 'paroiveg': {
      /* Une paroi cellulaire vegetale est une CLOISON, pas une boule : c'est
         elle qui fait les couloirs du mesocarpe. On la dessine comme un arc
         epais, ce qui donne au champ sa lecture de reseau polygonal. */
      const n = Math.max(7, Math.round(7 * z * 0.6));
      for (let i = 0; i < n; i++) {
        const a = o.ang + (i / (n - 1) - 0.5) * 1.9;
        const px = sx + Math.cos(a) * R, py = sy + Math.sin(a) * R;
        scr.disc(px, py, 2.1 * z, fill, rim);
      }
      break;
    }
    default:
      /* Ecaille de cire : basse, allongee, mate. */
      scr.ellipse(sx, sy, R, RY * 0.7, o.ang, fill, rim);
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
  const zp = cam.z || 1;
  for (let nappe = 0; nappe < 2; nappe++) {
    const z = nappe === 0 ? 7 : 3;
    const par = nappe === 0 ? 0.55 : 1.25;   // parallaxe
    scr.layer(z);
    const pas = 44;
    const ox = cam.x * par, oy = cam.y * par;
    const vx = (scr.w / zp) * 0.6 + 40, vy = (scr.h / zp) * 0.6 + 40;
    const cx0 = Math.floor((ox - vx) / pas), cx1 = Math.floor((ox + vx) / pas);
    const cy0 = Math.floor((oy - vy) / pas), cy1 = Math.floor((oy + vy) / pas);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = hash2(cx * 31 + nappe * 977, cy * 17 + nappe * 131);
        if (h > 0.42) continue;
        const wx = cx * pas + h * pas, wy = cy * pas + hash2(cy, cx) * pas;
        /* Mouvement brownien lent. Une poussiere de 2 um dans un milieu visqueux
           ne file pas : elle tremble. */
        const dx = Math.sin(t * 0.35 + h * 40) * 2.2;
        const dy = Math.cos(t * 0.28 + h * 27) * 2.2;
        const sx = cam.cx + (wx + dx - ox) * zp, sy = cam.cy - (wy + dy - oy) * zp;
        if (sx < -8 || sx > scr.w + 8 || sy < -8 || sy > scr.h + 8) continue;
        scr.disc(sx, sy, (0.9 + h * 2.2) * zp, fade32(pal.grain, 0.45), fade32(pal.grainRim, 0.5));
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
