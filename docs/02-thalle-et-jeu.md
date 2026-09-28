# Le thalle, les deux échelles, et ce qui deviendra un jeu

Décisions prises par l'auteur, à conserver. Rien de ce qui suit n'est encore
codé ; c'est l'architecture à respecter quand ça le sera.

---

## Les arbitrages

| Question | Décision |
|---|---|
| Mécanisme de ramification | **A — second Spitzenkörper sub-apical.** La bifurcation apicale reste en réserve comme événement rare. |
| Caméra à la ramification | **Elle peut suivre la fille.** C'est l'intérêt de brancher : changer de direction de façon disruptive. |
| Vignette du thalle | **Retenue**, et elle devient la vue principale : on dézoome jusqu'au mycélium entier, on clique sur n'importe quelle hyphe, on redescend sur son apex. |
| Forme de l'apex | Calotte **1,40 R**, profil **2,1**. Figé. |

---

## Les deux échelles

C'est la décision structurante, et la bonne nouvelle est que **le code la porte
déjà** : `Hyphe` tient l'axe et la croissance ; `Contenu` et `Membrane` sont des
pièces *attachées* à une `Hyphe`. Il n'y a donc pas deux simulations à
réconcilier, il y a une simulation à laquelle on branche ou débranche son
intérieur.

**Macro — tout le mycélium, en permanence.** Par pointe : un axe grossier, un
cap avec inertie, une vitesse, une règle de ramification. Rien d'autre. Coût de
l'ordre de la microseconde par pointe et par pas ; des milliers de pointes
tiennent sans effort. **Mise à jour à 2–5 Hz, et seulement sur le front** :
tout ce qui est derrière est de la géométrie figée.

**Micro — une seule hyphe à la fois.** Celle qu'on regarde. On lui attache un
`Contenu` et une `Membrane`, on préchauffe, et c'est la simulation actuelle,
à 0,19 ms par image.

### Les quatre points à ne pas rater

1. **L'axe ne s'interrompt jamais.** Quand on zoome, on n'instancie pas une
   nouvelle hyphe : on attache un intérieur à un axe qui existe déjà et qui a
   déjà une histoire. C'est ce qui rend l'illusion étanche — la chose qu'on
   regardait n'a jamais cessé d'exister.

2. **La vitesse macro est calibrée sur la micro, jamais choisie.** L'apex
   micro pousse à 19,2 µm/min parce que ses vésicules fusionnent ; c'est un
   résultat, pas un réglage. La loi macro `v = v₀·f(matrice)` doit redonner ce
   chiffre dans les mêmes conditions, sinon la forme de la colonie dépendrait
   de l'endroit qu'on regarde. **C'est un verdict de banc à écrire** :
   « macro et micro poussent à la même vitesse ».

3. **Le flou de transition n'est pas un cache, c'est une horloge.** Le
   réservoir apical met une vingtaine de secondes simulées à se remplir
   (`App.prechauffer`). La durée du fondu doit être *exactement* celle du
   préchauffage, réparti sur plusieurs images pour ne pas faire de à-coup. On
   défocalise, on change de grossissement, on refocalise — c'est le geste réel
   quand on change d'objectif, et c'est ce qui couvre honnêtement la bascule.

4. **Deux niveaux de détail sur la géométrie aussi.** Un axe tous les 0,22 µm
   pour dix mètres de mycélium ferait 45 millions de points. Le macro stocke un
   point tous les 5 à 20 µm ; seule l'hyphe visitée est ré-échantillonnée fin.
   On ne voit jamais le détail fin et le lointain en même temps, donc personne
   ne le remarque.

### Ce que le macro doit obtenir pour que la colonie soit crédible

- **Unité de croissance hyphale** ≈ 110 µm : on ramifie quand longueur totale /
  nombre de pointes dépasse le quota. C'est *la* règle, pas un hasard.
- **Autotropisme négatif** : les branches s'écartent du parent et entre elles.
  Sans lui la colonie ressemble à une fougère ; avec lui, à une colonie.
- **Anastomose** derrière le front : les hyphes fusionnent. C'est ce qui fait un
  **réseau** et non un arbre.
- **Matrice hétérogène** : elle oriente le front, et c'est le plateau de jeu.
- **Graine reproductible** (`mulberry32`) : sans elle la colonie se re-tirerait
  dans le dos du joueur pendant qu'il est ailleurs, et ça se verrait.

---

## Le jeu, esquissé

Gérer une stratégie de colonisation. La matrice est hétérogène et plus ou moins
favorable. La moisissure pousse toute seule ; le joueur **prend le contrôle**
d'hyphes choisies pour accélérer, produire des métabolites, ramifier à fond,
partir vers le haut ou vers le bas selon la matrice, lancer des conidiophores.

Fin de phase : on zoome sur une conidie, elle se décroche, le fond part
complètement flou parce que la mise au point reste sur elle, c'est chaotique,
elle est emportée, elle atterrit sur une nouvelle matrice. Nouveau cycle.

**Le système de rendu porte déjà cette fin.** « La mise au point reste sur la
conidie pendant que tout le reste se défocalise » est littéralement ce que font
les huit calques de profondeur. Il n'y a rien à inventer, juste à cadrer.

### Le défaut à mesurer en premier

Le prototype mort avait un verdict qui a échoué et qui s'applique mot pour mot
ici : **« ne rien faire est puni »**. Il mesurait 243 s en jouant passivement
contre 223 s en jouant activement — l'optimum était de ne rien faire.

Une moisissure autonome qui se débrouille bien toute seule pose exactement ce
risque : si prendre le contrôle d'une hyphe ne vaut pas mieux que la laisser
pousser, le joueur est décoratif. **C'est le premier verdict à écrire, avant
tout contenu.**

### Une remarque sur la boucle

Coloniser un plateau, puis disperser vers un plateau neuf tiré au hasard, c'est
une structure de **roguelite** greffée sur un jeu de stratégie. Ça peut être
exactement ce qu'on veut — mais autant le savoir en le décidant.
