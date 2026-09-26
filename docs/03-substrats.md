# Les substrats

Un substrat n'est pas un décor : c'est un **jeu de coefficients posé sur
l'équation de croissance**. Chacun attaque des termes différents, et c'est ce qui
fait qu'il se joue différemment plutôt qu'il ne ressemble à autre chose.

Tous les chiffres vivent dans `src/data/substrats.js`, et nulle part ailleurs.

---

## Les quatre, dans l'ordre

### 1. Pellicule du fruit — 600 µm

`aw 0,98 · 22 °C · sucre 0,42 · écailles de cire · pas de sel`

Une cuticule est **riche en eau mais pauvre en sucre accessible** : le sucre est
dedans, la cuticule est une barrière cirée. D'où le premier arbitrage du jeu —
traverser vite vers la chair, ou brouter la surface.

Les écailles de cire sont des obstacles **bas et nombreux** : elles gênent la
barre sans jamais fermer un passage. Leur rôle est pédagogique : apprendre à
barrer.

### 2. Mésocarpe — 1 100 µm

`aw 0,99 · 20 °C · sucre 0,72 · parois végétales · sel 0,12 · sorbate 0,18`

Le substrat le plus **généreux** et le plus **encombré**. Les parois cellulaires
végétales forment un réseau polygonal où l'on circule dans les interstices :
c'est là que la ramification paie, et c'est le seul substrat dont les obstacles
sont des **cloisons** plutôt que des boules.

pH 3,4 : l'acide organique du fruit est déjà un acide faible. Faible dose, juste
de quoi faire sentir le terme de maintenance — et rendre la **polygalacturonase**
désirable, l'enzyme avec laquelle *Botrytis* fait réellement pourrir les fruits.

### 3. Confiture — 1 300 µm

`aw 0,76 · 18 °C · sucre 0,95 · cristaux · sel 0,45 · sorbate 0,55`

68 Brix : **le sucre est énorme et l'eau introuvable**. C'est le seul substrat du
jeu à retourner les deux ressources l'une contre l'autre, et sans osmotolérance
on n'y entre pas. Le sorbate de potassium est la conservation réelle d'une
confiture peu sucrée : il fait brûler le sucre à l'arrêt, ce qui est exactement
le pire endroit pour ça.

C'est aussi le substrat le plus salé du jeu : les poches y sont partout, et sans
osmotolérance elles vident l'hyphe plus vite que le milieu ne la remplit.

### 4. Grain stocké — 1 500 µm

`aw 0,70 · 36 °C · amidon 0,88 · granules d'amidon · sel 0,30 · azole 0,5`

Blé à 14 % d'humidité : la zone des *Aspergillus* et *Eurotium*. Trois
contraintes se cumulent, et c'est voulu :

- le sucre est en **amidon**, donc inaccessible sans **amylase**. Le granule
  porte sa croix de Malte à l'écran : le signal est dessiné, pas écrit ;
- un silo **s'auto-échauffe** : 36 °C, tout près du maximum cardinal (42 °C), et
  la branche chaude de la cloche thermique est la plus raide ;
- **azole** de conservation des grains : la membrane est percée, le turgor tombe
  sans que l'aw ait changé.

---

## Les deux horloges

Le jeu n'a pas de minuteur affiché. Il a deux pressions temporelles, toutes deux
réelles, et elles existent pour une raison mesurée : **sans horloge, lambiner
était l'optimum** (voir `docs/05-banc.md`).

1. **Le dessèchement.** L'aw dérive de −0,00035 par seconde, plafonné à −0,11.
   Après cinq minutes, un génotype sans osmotolérance est sous sa limite dans les
   substrats secs. Un produit stocké perd son eau libre, et une colonie épuise
   celle de son propre substrat.
2. **L'entretien du thalle croît avec sa biomasse.** Plus on a construit, plus
   il faut de sucre pour le tenir. C'est l'horloge qui décide de la fin de la
   manche, et c'est elle qui rend la sporulation nécessaire. Détail dans
   `docs/00-concept.md`, section « la fin d'une manche ».
3. **Le substrat s'épuise là où on broute.** Il ne se régénère jamais, et la
   caméra n'y revient pas.

---

## L'escalade

Le jeu ne s'arrête pas au quatrième substrat : il **recommence la série en la
durcissant**, comme Risk of Rain. **Deux durcissements seulement** :

- l'eau se retire : `aw −0,035` par boucle ;
- les poches de sel se creusent : `× (1 + 0,35 n)` ;
- les antifongiques montent : `× (1 + 0,30 n)`.

Durcir aussi le sucre a été écarté : la paroi devenait infabricable et **toutes
les morts se ressemblaient**. Trois durcissements qui menacent des termes
différents valent mieux que quatre qui tapent au même endroit.

---

## Le sel, et l'hétérogénéité de l'aw

L'activité de l'eau d'un milieu n'est pas homogène. Un sel qui cristallise
localement creuse un **puits d'aw** bien plus profond que le bruit de fond, sur
quelques dizaines de micromètres.

En jeu, une poche de sel fait deux choses distinctes, et la seconde est la plus
dangereuse :

- elle **abaisse l'aw** du terme d'absorption, comme une zone sèche ;
- elle **tire l'eau hors de l'hyphe** par osmose, à un débit proportionnel au
  gradient. C'est ce qui la rend mortelle même à turgor plein — l'absorption,
  elle, sature quand la pression est haute.

Les poches sont **rares, nettes et contournables** (seuil haut sur le bruit :
seuls les sommets deviennent des poches), et les **cristaux les annoncent** :
ils sont dessinés exactement là où le terme salin est fort. Le décor explique le
champ, donc la poche est un choix de trajectoire et non une pénalité de zone.

Densité par substrat : nulle sur la pellicule, 0,12 dans le mésocarpe, 0,30 dans
le grain, **0,45 dans la confiture** — où elle s'ajoute à une aw déjà basse.

---


## Le cinquième candidat

**Croûte de fromage** : sel, aw 0,90, lipides et protéines. Il demande **lipase**
et **protéase**, donc il rendrait indispensables deux familles d'hydrolases
aujourd'hui décoratives. Il attend d'abord que les quatre premiers aient été
joués pour de vrai.
