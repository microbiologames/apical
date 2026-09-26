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

## Le Spitzenkörper à l'écran

Il porte trois informations à lui seul, et c'est pour ça qu'il est dessiné en
détail :

1. **l'intention de virage.** Il se décale du côté où le joueur barre, **avant**
   que l'apex ne tourne. Le retard de 70 ms du pilotage est donc *affiché*, ce
   qui le rend maîtrisable au lieu de flou ;
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

## Les montages, et pourquoi il y en a deux

Ce ne sont pas deux thèmes graphiques, ce sont les deux montages réellement
utilisés en mycologie :

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
