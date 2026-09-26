# Les substrats

Un substrat n'est pas un décor : c'est un **jeu de coefficients posé sur
l'équation de croissance**. Chacun attaque des termes différents, et c'est ce qui
fait qu'il se joue différemment plutôt qu'il ne ressemble à autre chose.

Tous les chiffres vivent dans `src/data/substrats.js`, et nulle part ailleurs.

---

## Les quatre, dans l'ordre

### 1. Pellicule du fruit — 600 µm

`aw 0,98 · 22 °C · sucre 0,42 · écailles de cire · Botrytis`

Une cuticule est **riche en eau mais pauvre en sucre accessible** : le sucre est
dedans, la cuticule est une barrière cirée. D'où le premier arbitrage du jeu —
traverser vite vers la chair, ou brouter la surface.

Les écailles de cire sont des obstacles **bas et nombreux** : elles gênent la
barre sans jamais fermer un passage. Leur rôle est pédagogique : apprendre à
barrer.

### 2. Mésocarpe — 1 100 µm

`aw 0,99 · 20 °C · sucre 0,72 · parois végétales · Botrytis + Fusarium · sorbate 0,18`

Le substrat le plus **généreux** et le plus **encombré**. Les parois cellulaires
végétales forment un réseau polygonal où l'on circule dans les interstices :
c'est là que la ramification paie, et c'est le seul substrat dont les obstacles
sont des **cloisons** plutôt que des boules.

pH 3,4 : l'acide organique du fruit est déjà un acide faible. Faible dose, juste
de quoi faire sentir le terme de maintenance — et rendre la **polygalacturonase**
désirable, l'enzyme avec laquelle *Botrytis* fait réellement pourrir les fruits.

### 3. Confiture — 1 300 µm

`aw 0,76 · 18 °C · sucre 0,95 · cristaux · Xeromyces + Penicillium · sorbate 0,55`

68 Brix : **le sucre est énorme et l'eau introuvable**. C'est le seul substrat du
jeu à retourner les deux ressources l'une contre l'autre, et sans osmotolérance
on n'y entre pas. Le sorbate de potassium est la conservation réelle d'une
confiture peu sucrée : il fait brûler le sucre à l'arrêt, ce qui est exactement
le pire endroit pour ça.

Le concurrent est *Xeromyces bisporus*, l'organisme le plus xérophile connu. Il
est lent (8 px/s) mais il est **chez lui**.

### 4. Grain stocké — 1 500 µm

`aw 0,70 · 36 °C · amidon 0,88 · granules d'amidon · Aspergillus + Cladosporium · azole 0,5`

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
2. **Les concurrents arrivent sur une date, pas sur une distance.** Une
   moisissure concurrente a germé au même instant que vous et pousse que vous
   bougiez ou non. Intervalle de 34 s à 13 s selon la pression du substrat et la
   boucle.

> La version précédente déclenchait les fronts sur l'avancée, donc un joueur lent
> en rencontrait **moins** : la lenteur était récompensée deux fois.

---

## L'escalade

Le jeu ne s'arrête pas au quatrième substrat : il **recommence la série en la
durcissant**, comme Risk of Rain. **Deux durcissements seulement** :

- l'eau se retire : `aw −0,035` par boucle ;
- les concurrents arrivent plus vite : `× (1 + 0,45 n)` sur la pression, et
  `× (1 + 0,30 n)` sur l'intensité des antifongiques.

Durcir aussi le sucre a été écarté : la paroi devenait infabricable et **toutes
les morts se ressemblaient**. Deux durcissements qui menacent des termes
différents valent mieux que trois qui tapent au même endroit.

---

## Les concurrents

Ce ne sont pas des mobs : ce sont des **fronts mycéliens**. Ils prennent de
l'**espace**, et l'espace ne revient pas.

- ils apparaissent **devant et de côté**, jamais dans le dos — 130 à 240 px, soit
  6 à 12 s pour décider de passer ou de contourner. Un danger qu'on ne peut pas
  voir venir n'enseigne rien ;
- ils visent l'avant **plus une attraction faible vers le pilote** (poids 0,35).
  Un front qui viserait l'apex en permanence serait un mob, pas un mycélium ;
- le contact est une **interférence hyphale** : le simple contact suffit, sans
  pénétration, et la zone sensible est l'apex ;
- ils sont rendus **plus pâles et légèrement flous** (calque 1), parce qu'un autre
  mycélium pousse à une autre profondeur dans le substrat. Le joueur reste le
  seul objet parfaitement net de l'image.

La couleur d'un front est celle de ses **conidies**, parce que c'est un vrai
caractère d'identification : *Penicillium* vert-bleu, *Aspergillus niger* noir,
*Botrytis* gris souris, *Fusarium* rose saumon, *Trichoderma* vert vif,
*Cladosporium* brun olive, *Xeromyces* crème. On ne les invente pas et on ne les
échange pas.

---

## Le cinquième candidat

**Croûte de fromage** : sel, aw 0,90, lipides et protéines. Il demande **lipase**
et **protéase**, donc il rendrait indispensables deux familles d'hydrolases
aujourd'hui décoratives. Concurrents : *Penicillium* (celui du camembert est chez
lui), *Cladosporium*, acariens exclus. Il attend d'abord que les quatre premiers
aient été joués pour de vrai.
