# L'animation, et pourquoi c'est le sujet et pas l'habillage

Dans Cell Dungeon, le dandinement du bacille n'était pas une finition : c'était
ce qui faisait exister la cellule. Ici c'est encore plus vrai, parce que
**l'animation EST le phénomène**. Une hyphe qui pousse sans que le cytoplasme
coule dedans est un trait qui s'allonge ; une hyphe où le cytoplasme coule est un
être vivant sous pression.

La phrase de cadrage, à relire avant de toucher au rendu :

> Un **tube à paroi rigide** contenant un **cytoplasme mou sous pression**, avec
> des **organites** dedans, observé à travers une **profondeur de champ
> insuffisante**.

Quatre mots, quatre contraintes techniques. Chacune a dicté une décision.

---

## 0. Le cadrage : la caméra est serrée, et la visibilité se paie

À l'arrêt le champ montre **56 µm de large**, à pleine vitesse 73 µm — mais la
surface parcourue par seconde double. On voit donc **moins en allant vite**,
et c'est le contraire d'une caméra de course : la visibilité est une ressource
que la vitesse consomme.

Le tube fait 14 µm de diamètre, soit **64 px de large** dans un champ de 256 :
le quart de la largeur, et l'on voit arriver chaque vésicule. C'est ce resserrement qui fait exister l'animation — à
l'échelle précédente il ne restait pas assez de pixels pour montrer à la fois
deux parois, un cytoplasme et un organite.

Deux corollaires :

- la caméra **vise devant**, dans la direction où pointe le Spitzenkörper et
  d'autant plus loin qu'on va vite. Sans cela, un rayon de braquage de 57 µm
  était impossible à anticiper dans une fenêtre de 110 µm ;
- **voir plus loin devient une amélioration** (le récepteur GPR-4 recule la
  caméra), ce qui est la traduction exacte du chimiotropisme.

### L'épaisseur de paroi ne suit pas le zoom

Toutes les longueurs sont multipliées par le zoom — sauf celle-là. À 4,6 px/µm
une paroi mise à l'échelle faisait huit pixels et le tube se lisait comme une
saucisse floue bordée de bleu.

Le fait physique tranche dans le même sens : une paroi d'hyphe fait **0,1 à
0,3 µm**, soit *un* pixel même à ce grossissement. À l'échelle elle
disparaîtrait ; à l'échelle du zoom elle devient un bourrelet. On la garde donc
à une largeur d'**écran** quasi constante (1 à 3,6 px) — assez pour rester un
trait, assez variable pour continuer à porter la jauge de sucre.

## 1. « Paroi rigide » → on rastérise par sections, pas en traits épais

Un trait épais coloré donne un **ruban** : la paroi et le cytoplasme y ont la
même couleur, et l'hyphe se lit comme un spaghetti. On rastérise donc le tube en
**sections transversales** tous les 0,8 px, et dans chaque section on place les
bandes du bord vers le centre :

```
halo de phase → paroi → interstice de plasmolyse → cytoplasme → reflet
```

C'est la seule façon d'obtenir à la fois un **bord franc** et une **épaisseur
variable au pixel près**. Et 0,8 px n'est pas cosmétique : au-delà de 1,1 px des
coutures apparaissent sur les obliques à 45°.

Le halo est **tramé** (matrice de Bayer, seuil 0,62) et non plein : un liseré
plein épaissit visuellement le tube de deux pixels et la paroi cesse d'être
lisible.

## 2. « Sous pression » → le cytoplasme se décolle de la paroi

L'intérieur n'est pas un remplissage uni. Il porte :

- un **dégradé de réfringence**, clair au centre ;
- un **reflet spéculaire** du côté de la lampe (fixe en haut à gauche pour tout
  le champ, comme dans Cell Dungeon), à 60 % du rayon. C'est ce reflet qui dit
  « rempli de liquide » plutôt que « creux » ;
- et surtout un **interstice de plasmolyse** : quand le turgor tombe, le
  protoplaste **se retire dans son tube**, et on voit apparaître entre la paroi
  et le cytoplasme un espace qui se remplit du voile du milieu.

Ce dernier point est la meilleure jauge du jeu, et elle ne coûte pas un pixel de
HUD. Elle est aussi **graduée en distance** : le décollement commence loin de
l'apex et progresse vers lui, parce que c'est l'apex qui pompe.

## 3. « Profondeur de champ insuffisante » → la position latérale est une profondeur

Le tube fait 11 µm de diamètre. La profondeur de champ d'un objectif à immersion
en fait moins. Donc **un organite près du bord du tube est plus haut ou plus bas,
donc hors du plan focal, donc il part sur un calque flouté.**

C'est ce qui donne au tube son **volume** au lieu d'un ruban décoré, et ça ne
coûte rien : les huit calques de netteté existaient déjà.

Même principe pour le décor, et là c'est devenu une **information de jeu** : un
obstacle reçoit un plan de profondeur à son engendrement, **la donnée le porte**,
et le rendu comme la collision lisent le même chiffre. Plan 0 = net **et**
bloquant. Plans 1 à 3 = flous **et traversables**.

> Ce point a coûté une refonte. Le rendu répartissait les obstacles sur quatre
> plans de netteté pendant que la collision les arrêtait **tous** : le joueur se
> faisait écraser par un grain visiblement flou, donc visiblement hors de son
> plan. Mesure : 14 morts sur 20 par écrasement, et aucune n'était
> compréhensible à l'écran.

## 3 bis. La calotte apicale : un tube fermé, pas un ovoïde

**Trois profils avant le bon**, et l'historique dit exactement ce qui ne va pas
dans les deux premiers :

1. **dôme court et très bombé** (L = 1,32 R) — lu comme un *bourgeon posé sur un
   tube* ;
2. **demi-ellipse allongée** (L = 1,55 R) — en cherchant la fidélité au profil
   « hyphoïde » des Ascomycètes, j'ai allongé la calotte. Résultat : **une
   silhouette phallique**. Une calotte plus longue que large donne cette lecture,
   quoi qu'elle représente, et aucune justification physiologique ne la rattrape ;
3. **superellipse d'exposant 2,8 sur L = 0,82 R** — une calotte plus **courte**
   que le rayon. Les flancs sont encore à 95 % du rayon à mi-hauteur et ne
   s'infléchissent vraiment qu'après 80 % : c'est un **tube fermé**, pas un œuf.

| d (µm) | 0 | 1,4 | 2,9 | 4,3 | 5,0 | 5,7 |
|---|---|---|---|---|---|---|
| rayon | 7,00 | 6,95 | 6,62 | 5,67 | 4,62 | 0 |

Et c'est défendable : les **Mucorales**, dont on a pris le diamètre de 14 µm,
ont des apex nettement plus obtus que le hyphoïde classique.

## 3 ter. Le tempo, et le mouvement de lampe à lave

Trois réglages, demandés ensemble — *« il faut que ce soit beaucoup plus lent »*,
*« des vésicules qui arrivent un peu comme dans une lampe à lave »* :

- **l'horloge** est divisée par 0,48 en tête de la simulation. On ralentit le
  temps, jamais les coefficients : tous les rapports sont préservés et
  l'équilibrage mesuré reste valide tel quel ;
- **le flux cytoplasmique** passe de 16 à 5,5 µm/s. Une vésicule met une
  dizaine de secondes à remonter le champ : on a le temps de la voir venir, de
  voir ce qu'elle porte, et de la voir fusionner ;
- **le freinage d'approche** : une vésicule ne fonce pas sur la membrane, elle
  ralentit en entrant dans la calotte (facteur 0,18 dans les douze derniers
  micromètres) et s'y attarde. C'est ce freinage qui fait la lampe à lave autant
  que la lenteur ;
- **la déformation** : une vésicule est une poche de membrane, pas une bille.
  Elle s'allonge et se tasse en dérivant, 22 % d'amplitude.

Et surtout : **les vésicules attendent la décharge du pulse.** Elles
s'accumulent au Spitzenkörper pendant la phase lente et sont exocytées pendant
la phase rapide — le mécanisme mesuré, et ce qui donne à la croissance ses
paliers. On voit le bouchon se former au bout puis partir d'un coup, au lieu
d'un égouttement continu. Le pulse lui-même est passé à 0,55 Hz et son amplitude
de ±38 % à ±72 % : l'apex **surgit puis attend**.

## 3 quater. (ancien) La calotte apicale : une demi-ellipse, pas un dôme

Le premier profil donnait un bout court et très bombé, qui se lisait comme un
**bourgeon posé sur un tube**. Deux causes cumulées : la calotte était trop
courte pour son rayon, et elle était en plus **gonflée** par le turgor et par le
pulse.

Le profil est maintenant une **demi-ellipse de demi-axes R et 1,55 R**. Elle a
deux vertus : elle raccorde le tube avec une tangente exactement perpendiculaire
à l'axe (donc aucune cassure visible à la base), et elle est une fois et demie
plus longue que large, ce qui est la silhouette d'un apex fongique en croissance.

Et surtout : **le pulse allonge le bout, il ne l'enfle pas.** Une bouffée de Ca²⁺
apporte de la membrane et de la paroi à la pointe — l'apex avance par paliers.
Gonfler le rayon faisait battre la silhouette et contribuait au bourgeon.

## 4. « Construction progressive de la paroi » → chaque section porte sa date

Chaque point de paroi mémorise **l'instant de son dépôt**. La paroi neuve est
**pâle et mince**, elle prend sa couleur et son épaisseur en 0,30 s. On voit donc
la paroi se construire derrière l'apex, en continu.

La rigidification a sa propre constante de temps (0,18 s), soit environ **11 px
de tube à vitesse nominale** — la longueur réelle de la zone encore extensible
derrière un apex.

Et la calotte apicale a une **épaisseur dégressive vers la pointe** : la paroi y
est la plus neuve, elle n'a pas encore de chitine cristalline. C'est aussi pour
ça que c'est là que les échinocandines font éclater les hyphes.

---

## Le cytoplasme : l'animation d'attente

C'est l'équivalent exact du dandinement. Ce qu'on voit dans un tube réel, de
l'apex vers l'arrière :

| Distance de l'apex | Contenu |
|---|---|
| 0 – 5 µm | **calotte apicale** : aucune vacuole, aucun noyau, bourrée de vésicules, Spitzenkörper. Le point le plus dense en organites du champignon |
| 5 – 40 µm | **subapicale** : mitochondries en fuseaux, premiers noyaux, gouttelettes lipidiques réfringentes |
| 40 µm et + | **vacuolisée** : les vacuoles apparaissent et **grossissent avec l'âge du compartiment** |
| aux septa | **corps de Woronin**, immobiles, ancrés au pore |

Trois règles qui en découlent :

- **le flux est toujours plus rapide que l'apex.** C'est le corps qui alimente la
  pointe. À 40 px/s la différence change de signe et l'apex semble *aspirer* son
  cytoplasme ;
- **une vésicule qui atteint le Spitzenkörper disparaît**, avec une bouffée de
  lumière. C'est l'exocytose, et c'est le seul endroit du jeu où l'on voit le
  sucre devenir de la paroi ;
- **rien ne s'arrête jamais.** À vitesse nulle le flux continue : c'est ce qui
  fait qu'un apex bloqué a l'air vivant et non en pause.

Le **gradient de vacuolisation** est ce qui donne au tube son sens de lecture
sans aucune flèche : gros et vacuolisé derrière, dense et clair devant.

Une mitochondrie fongique est un **fuseau aligné sur l'axe du tube** (elle suit
les microtubules) : la dessiner ronde donnait des billes et le flux perdait sa
direction.

### La seule entorse à l'échelle, et elle est signalée dans le code

Le flux de masse mesuré chez *Neurospora* est de **5 µm/s**, ce qui vaudrait
**300 px/s** à l'échelle du jeu (1 s = 1 min) : un organite traverserait le champ
en moins d'une seconde et il ne resterait qu'un scintillement. Le flux est donc
rendu à **16 px/s + 0,8 × la vitesse d'extension**. Le fait qui compte est
préservé — le flux dépasse toujours l'apex.

---

## Les vésicules, et ce que chacune fait en fusionnant

C'est le cœur du champ depuis que la caméra est serrée. Quatre rôles, quatre
formes, et chaque forme est celle de l'organite réel : le **chitosome** est
polyédrique donc carré, la **macrovésicule** est la plus grosse et ronde, la
**lipidique** est une bicouche donc un anneau, l'**enzyme** est allongée.

Trois règles qui ont chacune corrigé un défaut vu sur capture :

- **une vésicule est réfringente**, donc plus claire que le cytoplasme. Remplie
  de la teinte du cytoplasme elle était littéralement invisible — le centre du
  tube est dessiné avec cette teinte-là ;
- **une vésicule n'est jamais floutée**, contrairement aux autres organites. On
  doit pouvoir suivre chacune, et un contour d'un pixel flouté disparaît ;
- **chaque fusion a son geste** : un arc dans la paroi pour la chitine, un jet
  vers l'avant pour la macrovésicule, un anneau qui s'étale pour la membrane, un
  point qui **sort** du tube pour l'enzyme.

## Le Spitzenkörper à l'écran

Il est dessiné en **croissant diffus**, jamais en corps net. Deux raisons :
rendu en disque il se donnait pour une poignée de commande — or il n'en est plus
une — et dans un microscope on ne voit jamais un contour, seulement une zone plus
dense. Réparti en nuée ronde il faisait une tache grise au pied de la calotte ;
en croissant appliqué contre la face interne de l'apex, il redevient ce qu'il est.

Il porte trois informations à lui seul :

1. **l'intention de virage.** Il se décale du côté intérieur du virage, et c'est
   *calculé* à partir du taux de virage : voir où penche le croissant, c'est
   voir où l'on va avant que le tube ne l'ait montré ;
2. **le flux vésiculaire.** Sa brillance suit `jmaxEff`. Un joueur à court de
   sucre voit son Spitzenkörper **pâlir avant que la paroi ne s'amincisse** : la
   panne s'annonce, elle ne surprend pas ;
3. **le pulse.** Il brille au pic d'exocytose, et la calotte gonfle avec lui.

Et des **vésicules en rayonnent vers la surface de la calotte** : c'est le modèle
du centre d'approvisionnement, dessiné tel quel.

---

## Ce qui a le droit de bouger, et ce qui n'en a pas le droit

Une règle de discipline, sinon le champ devient un sapin de Noël :

| A le droit | N'a pas le droit |
|---|---|
| le cytoplasme (toujours) | le décor : un grain d'amidon ne respire pas |
| la calotte et le Spitzenkörper (pulse) | les obstacles |
| les **locus** (ils pulsent : ce sont des signaux, pas des objets du milieu) | les granules et les gouttes |
| les poussières hors plan (mouvement brownien lent) | le fond |
| la jauge de paroi sous le seuil (**seule chose du HUD qui clignote**) | tout le reste du HUD |

Les **poussières** ne servent à rien, et c'est pour ça qu'elles comptent : un
champ de microscope réel n'est jamais propre. Deux nappes à des parallaxes
différentes (0,55 et 1,25) donnent l'épaisseur de la préparation. Sans elles le
fond paraissait peint derrière une vitre.

La **secousse** d'écran est réservée aux événements de paroi (lyse, contact,
ramification). Jamais au décor : sinon on ne sait plus ce qui l'a déclenchée.

---

## Le fond dit le milieu

Les quatre grandeurs qui décident de la manche sont des champs continus. Un HUD
n'en montre que la valeur **sous** l'apex, ce qui arrive toujours trop tard.
Dessinées dans le fond, elles se voient **devant**, et la trajectoire redevient
une décision.

| Grandeur | Code de lecture |
|---|---|
| sucre élevé | le fond se charge en **granulations** — la densité porte l'information, pas la couleur |
| aw basse | le fond **se craquelle** et s'assombrit (−22 % entre aw 0,99 et 0,70) |
| antifongique | un **voile teinté, toujours sur calque flouté** : une molécule diffusible n'a pas de bord net |
| température | dérive de teinte lente, jamais un chiffre qui clignote |

Le fond est échantillonné par **blocs de 6 px** : 2 500 appels de bruit par image
au lieu de 90 000. Le rendu étant déjà tramé, la différence ne se voit pas.

---

## Le montage : bleu coton lactophénol, partout

Deux montages sont écrits dans le code, tous deux réels et tous deux justes.
**Un seul est utilisé** : le bleu coton, donc le fond clair. Le calcofluor
reste défini pour un usage futur.

La raison est une décision de l'auteur, après essai : le fond clair *« donne
l'impression d'être directement dans une gélose »*, et c'est l'effet recherché.
Mais surtout, alterner les deux faisait **basculer le fond du noir au clair en
cours de manche**, au passage d'un substrat à l'autre — un basculement qu'on lit
comme une panne d'affichage, pas comme un changement de milieu.

Les quatre substrats se distinguent donc par la **teinte de leur gélose**, et
chacune est celle du milieu réel : pâle et verdie pour une cuticule, crème pour
une chair de fruit, ambre pour un sirop, ocre pour une amande de céréale.

Les deux montages, pour mémoire :

- **bleu coton lactophénol** — fond clair, paroi teintée en **bleu**. Le colorant
  se fixe sur la **chitine de la paroi**, pas sur le cytoplasme : c'est pour ça
  que l'hyphe se lit comme un tube bordé et non comme un trait plein ;
- **blanc de calcofluor** sous épifluorescence — fond noir, paroi **fluorescente**.
  Le fluorochrome se lie à la chitine et à la cellulose, et comme la paroi
  **neuve** est la plus riche en chitine fraîche, **l'apex est le point le plus
  lumineux du champ** — exactement ce que le joueur doit regarder.

Conséquence de conception qui a décidé du choix : **les deux montages colorent la
paroi**, donc l'épaisseur de paroi — qui est la jauge de sucre — reste lisible
dans les deux. Un montage qui aurait coloré le cytoplasme aurait caché
l'information la plus importante du jeu.
