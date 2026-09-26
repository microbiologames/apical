# Apical

Roguelite de **croissance apicale**. Vous êtes l'extrémité d'une hyphe fongique
observée au microscope : vous poussez vers le haut de l'écran, vous ne revenez
jamais en arrière, et vous n'avez aucun moteur — vous avancez parce que vous êtes
un **tube sous pression dont la paroi cède à son extrémité**.

**État : maquette jouable.** Page statique, aucune compilation, zéro dépendance.

```bash
npm run serve     # puis http://localhost:8080
npm run banc      # les 11 verdicts d'equilibrage, en node, sans navigateur
```

---

## Ce qui rend le jeu différent

**On ne pilote pas l'apex. On pilote le Spitzenkörper.**

Le Spitzenkörper est un amas de vésicules situé juste derrière le bout de
l'hyphe. Le modèle qui décrit la croissance apicale — le *centre
d'approvisionnement en vésicules* — dit que **c'est son déplacement qui détermine
la direction de croissance** : la forme de l'hyphe est la trace géométrique de son
trajet. Vous barrez donc le Spitzenkörper, et l'apex suit, avec 70 ms de retard.
On anticipe, on ne corrige pas.

**L'eau pousse, le sucre retient.**

L'extension suit la loi de Lockhart, `v = Φ × (P − Y)` : pas de turgor, pas de
mouvement, et il existe un seuil sous lequel rien ne bouge quel que soit le
nombre d'améliorations. Mais le matériau de paroi arrive à débit borné, donc
l'épaisseur vaut `e = J / v` : **aller vite amincit la paroi**, et une paroi trop
mince sous 1 MPa éclate — ce qui est exactement le mode d'action des
échinocandines.

Conséquence remarquable : au-delà de 16 µm/s, **la vitesse ne coûte pas de
ressource, elle consomme de la marge de sécurité**. Aucune amélioration ne peut
lever cet arbitrage, seulement le déplacer.

**Le thalle qu'on construit est le terrain sur lequel on jouera.**

La paroi déposée ne change plus jamais — le fluage de la paroi fongique est
plastique, donc irréversible. Votre trajectoire devient le mur contre lequel vous
jouerez dans vingt secondes, et le moment où vous avez sur-poussé reste visible
derrière vous jusqu'à la fin de la manche.

**On devient puissant en devenant fragile.**

Un mycélium est un seul protoplaste : un turgor, un stock de sucre, quel que soit
le nombre d'apex. Chaque apex de plus augmente les revenus **et** la dépense
**et** l'exposition aux antifongiques **et** l'encombrement. La courbe de
difficulté n'est pas scriptée : c'est votre propre thalle.

---

## Les commandes

| | Clavier | Tactile |
|---|---|---|
| **Barrer** le Spitzenkörper | `A` / `D` / flèches | glissement horizontal, moitié gauche |
| **Poussée** osmotique | `W` / `↑` | glissement vers le haut, moitié droite |
| **Consolider** la paroi | `S` / `↓` | glissement vers le bas, moitié droite |
| **Ramifier** | `Espace` | tap, moitié droite |
| **Sporuler** et encaisser | `Entrée` | — |
| Pause | `Échap` / `P` | — |

Les touches sont lues par position physique (`event.code`) : AZERTY et QWERTY
fonctionnent sans réglage.

---

## Les six morts

Chacune tape sur un terme différent de l'équation, chacune a son gène qui la
corrige. On ne rejoue pas pour aller plus loin : on rejoue pour **corriger la
panne précédente**.

| Mort | Ce qui s'est passé |
|---|---|
| **Lyse apicale** | la paroi est passée sous le seuil critique, le turgor l'a emporté |
| **Carence puis lyse** | plus de sucre → plus de flux → plus de paroi |
| **Plasmolyse** | l'aw est passée sous la limite du génotype |
| **Apex fusionné** | anastomose sur son propre thalle, et c'était le dernier apex |
| **Apex détruit** | écrasement sur un obstacle net, ou interférence hyphale d'un concurrent |
| **Sporulation** | choisie. Ce n'est pas une mort, c'est la victoire |

Sporuler encaisse **100 %** des spores et termine la manche. Mourir n'en rend que
25 %. C'est l'arbitrage de chaque fin de manche : continuer, ou encaisser.

---

## Ce qu'on voit au microscope

Le rendu ne cherche pas le joli : chaque effet est un phénomène réel, et c'est ce
qui le rend lisible.

- **La paroi est rigide.** Le tube est rastérisé par sections transversales, pas
  en traits épais : la paroi est deux bandes nettes, le cytoplasme est autre
  chose. Son **épaisseur** est la jauge de sucre, et elle est visible.
- **Le cytoplasme est mou et sous pression.** Reflet spéculaire du côté de la
  lampe, dégradé de réfringence, et surtout — quand le turgor tombe, le
  **protoplaste se décolle de la paroi**. C'est la plasmolyse, et c'est la
  meilleure jauge du jeu.
- **Le cytoplasme coule.** Toujours, même à l'arrêt, et toujours plus vite que
  l'apex : c'est le corps qui alimente la pointe. Mitochondries en fuseaux,
  noyaux, gouttelettes lipidiques réfringentes, vacuoles qui **grossissent avec
  l'âge du compartiment** — ce gradient donne au tube son sens de lecture sans
  aucune flèche.
- **La profondeur de champ est insuffisante, comme au microscope.** Un organite
  près du bord du tube est plus haut ou plus bas, donc flou : c'est ce qui donne
  du volume au tube. Et pour le décor, le flou est une **information de jeu
  exacte** — seuls les obstacles nets bloquent.
- **La paroi se construit devant vous.** Chaque section mémorise sa date de
  dépôt : la paroi neuve est pâle et mince, elle prend en 0,30 s.
- **Le Spitzenkörper dit trois choses** : il se décale du côté du virage avant que
  l'apex ne tourne, il **pâlit quand le sucre manque** (la panne s'annonce), et il
  brille au pic du pulse calcique.
- **Deux montages, tous deux réels** : bleu coton lactophénol (fond clair, paroi
  bleue) et blanc de calcofluor sous épifluorescence (fond noir, paroi
  fluorescente). Les deux colorent la **paroi**, ce qui est précisément ce qu'il
  fallait.

---

## Documentation

Commencer par **`CLAUDE.md`** : conventions, invariants, et ce que le banc a
trouvé.

| Fichier | Contenu |
|---|---|
| `docs/00-concept.md` | le concept et les huit arbitrages de conception |
| `docs/01-croissance-apicale.md` | **la physiologie, les chiffres mesurés, les sources** |
| `docs/02-genes.md` | les 37 gènes et les règles du catalogue |
| `docs/03-substrats.md` | les quatre substrats, les deux horloges, les concurrents |
| `docs/04-animation.md` | **le rendu : ce qu'est une hyphe à l'écran** |
| `docs/05-banc.md` | le banc et les neuf défauts qu'il a trouvés |

Même famille visuelle que [Cell Dungeon](https://github.com/microbiologames/Cell-dungeon),
dont `src/core/` est directement issu.
