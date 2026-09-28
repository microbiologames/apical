# Le concept visuel

## Ce qu'on regarde

L'extrémité d'une hyphe de moisissure, vue de côté, sous un objectif à
immersion dont la mise au point n'est jamais tout à fait juste. Le tube entre
par le bas du cadre et se ferme en haut. Il avance de 20 µm par minute —
c'est-à-dire, à ce grossissement, d'environ trois pixels par seconde.

Il n'y a pas de but, pas de score, pas de fin. C'est le point.

## Les références

| Fichier | Ce qu'on en a tiré |
|---|---|
| `Apex_references/Art/b.jpg` | Le contraste de phase : cytoplasme plus sombre que le fond, halo clair autour de la paroi, Spitzenkörper visible comme une zone **plus dense**, ramification naissant en bosse latérale. |
| `Apex_references/Art/c.jpg` | La planche MET : la calotte apicale ne contient **que** des vésicules — pas un noyau, pas une mitochondrie. Le panneau C donne la densité du Spitzenkörper. |
| `Apex_references/Art/a.jpg`, `e.jpg`, `f.jpg` | L'échelle du thalle, pour plus tard. |
| `Apex_references/Mecanisms/a.jpg` | Le schéma de trafic : Golgi → vésicules sécrétoires → sécrétion apicale. |
| `Apex_references/Mecanisms/e.jpg` | Le gradient d'extension : maximal à la pointe, nul dès la pleine largeur atteinte. |
| `Apex_references/Mecanisms/Vesicule mecanisme.png` | Les trois temps de la fusion, et surtout : la membrane de la vésicule et la membrane plasmique sont **du même trait**, son lumen et le périplasme sont **de la même couleur**. |
| `Apex_references/Mecanisms/Capture…png` | Le gradient de Ca²⁺ : InsP₃ libère le Ca²⁺ interne à la pointe, le Ca²⁺ déclenche la fusion des vésicules, le RE et les mitochondries le repompent juste derrière. |
| [amazingfungi, *Hyphal growth and branching 01*](https://www.youtube.com/watch?v=Rxh5zFzA8Zk) | **La référence décisive.** Tube gris granuleux, liseré clair continu, fond noir, apex en ogive émoussée. C'est la palette « fond noir ». |

## Les partis pris

**Une vésicule n'a pas de couleur à elle.** Sa membrane est de la membrane,
son lumen est du périplasme — il le devient à la seconde où le pore s'ouvre.
C'est cette identité de couleur qui rend la fusion lisible sans qu'on ait rien
à expliquer : les deux traits se touchent, l'ouverture naît au centre du
contact et s'élargit, la vésicule se rabat en oméga, et le contenu déversé est
déjà de la couleur de l'espace où il arrive. Schéma de référence :
`Apex_references/Mecanisms/Vesicule mecanisme.png`.

**L'enveloppe a trois couches.** Paroi, espace périplasmique, membrane
plasmique. La vésicule fusionne avec la **membrane** et déverse dans le
**périplasme** : c'est là que le matériau de paroi est assemblé. Dessiner une
seule ligne rendait le mécanisme faux — la vésicule avait l'air de cogner dans
la paroi.

**La paroi neuve migre du pôle vers le flanc.** Chaque exocytose pose une trace
qui remonte le profil de l'apex, atteint la pleine largeur en 17 secondes, puis
descend le flanc et sort du champ. C'est le seul repère qui rend la croissance
apicale visible : une paroi uniforme a l'air immobile.

**Le milieu extérieur a du grain.** Gélose, débris, corps réfringents, tirés
d'un hachage en coordonnées monde. Sans repère fixe hors du tube, l'apex a
l'air de faire du surplace.

**Le tube est un seul objet.** Détaillé dans `CLAUDE.md`, règle 1. C'est la
contrainte qui a fait échouer le projet précédent et c'est la première chose
qui a été construite ici.

**L'apex n'a pas de moteur.** Il avance là où les vésicules fusionnent. Il
tourne quand elles fusionnent préférentiellement d'un côté. L'inertie n'est
pas un amortisseur ajouté après coup, c'est le temps qu'il faut au nuage pour
se déplacer : dix secondes.

**Trois optiques plutôt qu'une.** La consigne était « quelque chose entre le
contraste de phase et la MET » — ce sont deux inversions opposées. Plutôt que
d'inventer un compromis, on donne les deux bornes et le rendu de la vidéo, et
on laisse juger. Le moteur ne connaît aucun des trois cas : il pose toujours
« fond, cytoplasme, grain, paroi, halo », c'est la palette qui décide du sens.

**La calotte est réglable.** Le désaccord sur la forme de l'apex a coûté trois
itérations au projet précédent. Deux curseurs (longueur, profil) le rendent
discutable en une seconde au lieu d'un aller-retour.

## Ce qui est simplifié, et assumé

| | Réalité | Ici | Pourquoi |
|---|---|---|---|
| Taille des vésicules | 70–100 nm (macro), 30–40 nm (chitosomes) | ×6 | À l'échelle, une vésicule fait un pixel : ni rebond, ni coalescence, ni fusion lisibles. |
| Nombre de vésicules | ~10⁴ au Spitzenkörper | 120 en tout | Budget d'image, et lisibilité : on doit pouvoir suivre une vésicule des yeux. |
| Flux de masse | 5 µm/s | 1,2 µm/s | À 5 µm/s tout traverse le champ en cinq secondes. Ce n'est plus apaisant. |
| Structure du Spitzenkörper | stratifié (cœur de microvésicules, écorce de macrovésicules) | deux populations mélangées | Invisible à ce grossissement. |
| Cytosquelette | câbles d'actine, microtubules, moteurs | implicite | Invisible. Il ne reste que son effet : une vésicule « en route » écarte le réservoir au lieu de s'y arrêter. |
| Turgescence | 600 kPa, loi de Lockhart | implicite | Invisible, et son seul effet visible — l'extension — est déjà porté par les fusions. |
| Coupe optique | 11 µm d'épaisseur, DOF ~1 µm | 8 plans | Assez pour la lecture « mauvaise mise au point ». |

## Ce qui n'est pas là

- **La ramification.** Elle est dans la vidéo de référence et elle est belle,
  mais une branche est une deuxième silhouette : c'est exactement le terrain
  où le projet précédent s'est cassé. Elle viendra une fois le tube unique
  validé, comme un second axe partageant le même polygone.
- **Le septum, les corps de Woronin, les noyaux qui migrent.** Plus tard.
- **Tout gameplay.** L'étape d'après, si le concept tient, est un jeu de
  stratégie — pas un roguelite.
