# Apical — à lire avant de toucher au code

Simulation contemplative de **croissance apicale fongique**. Ce n'est pas un
jeu. On regarde l'extrémité d'une hyphe sous un microscope imparfait : des
vésicules dérivent dans le cytoplasme, se heurtent, coalescent, s'accumulent
à la pointe, fusionnent avec la membrane et y déversent le matériau de paroi.
La paroi avance. Lentement.

**Zéro dépendance, zéro build.** Modules ES vanilla servis tels quels.
`npm run serve` puis `http://localhost:8080/`. Playwright n'est là que pour
les captures de contrôle.

| Commande | Ce qu'elle fait |
|---|---|
| `npm run serve` | sert le dépôt tel quel |
| `npm run banc` | 21 verdicts de mesure, sans rendu, en node |
| `npm run visuel` | captures dans `/tmp/apical-shots` (Playwright) |
| `npm run visuel:branche` | captures de la page ramification |
| `npm run visuel:thalle` | captures de la page colonie |
| `npm run visuel:monde` | captures du pont entre les deux échelles |
| `npm run visuel:sporange` | captures de la sporulation |
| `npm run visuel:germination` | captures de la germination |
| `npm run visuel:cycle` | captures du cycle complet |
| `npm run visuel:jeu` | captures de la page de jeu |

---

## Conventions non négociables

| Où | Langue |
|---|---|
| Conversation avec l'utilisateur | **français** |
| Commentaires de code, messages de commit | **français sans accents** (ASCII pur) |
| Docs, README, textes d'interface | français accentué |

**Les commentaires disent POURQUOI, avec le chiffre qui a tranché.** Presque
chaque constante porte la mesure qui l'a fixée et le défaut qu'elle corrige.
Un commentaire qui paraphrase le code ne vaut rien ; un commentaire qui dit
« à 0,85 /s par paire la coalescence vidait le réservoir vingt fois plus vite
que l'exocytose » évite de refaire l'erreur.

---

## Les treize règles de fond

### 1. L'hyphe est UN objet

L'échec du projet précédent tient en une phrase : la calotte apicale était une
forme dessinée à part, posée au bout du tube. Ici c'est structurellement
impossible.

- il n'existe qu'**un axe** (`Hyphe.ax/ay/al`), une polyligne prolongée par
  l'avant et **jamais retouchée derrière** — une paroi construite est rigide ;
- il n'existe qu'**une fonction de demi-largeur** `W(s)`, `s` étant l'abscisse
  curviligne depuis la pointe ;
- le tube est **dessiné sur 200 µm** (`Scene.S_VU`) et **peuplé sur 70**
  (`S_MAX`). Les deux étaient confondus à 34 µm, et le tube s'arrêtait donc
  net. Tant que la caméra suit l'apex la coupe est hors champ ; dès qu'on
  regarde autre chose — une jonction de branche, demain le thalle — elle
  avance avec l'apex et finit par dépasser la ramification, qui se retrouve
  accrochée à un moignon. La **membrane**, elle, n'est simulée que sur 34 µm
  (`S_MEMB`) : c'est une corde intégrée tous les 0,09 µm et, au-delà de dix
  micromètres, elle est plate. `Scene.membraneLigne` en prolonge le **tracé**
  le long de la paroi, au même pas d'échantillonnage que le contour ;
- le contour est **un polygone fermé** (`Hyphe.contour`) obtenu en parcourant
  `W(s)` d'un côté puis de l'autre. `W(0) = 0` : les deux côtés se rejoignent
  à la pointe, le tube se ferme tout seul.
- le remplissage (balayage pair-impair), le liseré de paroi et le halo lisent
  **le même polygone** et **la même distance** (`Scene.bandeDistance`). Il ne
  peut pas y avoir de désaccord entre la silhouette et son contour, ni les
  ondulations du prototype précédent qui rasterisait tronçon par tronçon.

Le contenu vit en coordonnées de tube `(s, v)` et n'est projeté en monde qu'au
rendu : rien ne peut sortir du tube, la contrainte est vérifiée **avant** le
dessin, pas après.

### 2. L'apex n'a pas de moteur

Rien n'applique un cap à la géométrie. Une vésicule qui fusionne avec la
membrane verse `Q_FUSION` µm d'extension à l'angle φ où elle a touché :
`avance += q·cos φ`, `couple += q·sin φ`. L'hyphe ne fait que consommer ce
bilan, à travers un passe-bas de 0,55 s.

Le pilotage ne touche donc **que** la consigne angulaire du gradient de Ca²⁺,
c'est-à-dire l'endroit où les vésicules ont le plus de chances de partir. Entre
la demande et le virage il faut que le nuage se décale, qu'il fusionne et que
la paroi se construise : **10,7 s mesurées** pour atteindre 63 % de la vitesse
angulaire. On ne peut pas raccourcir ce délai sans casser le mécanisme — c'est
exactement l'inertie demandée.

### 3. Trois couches, pas une

De l'extérieur vers l'intérieur : **paroi** (chitine et glucanes, 0,1–0,3 µm,
rigide), **espace périplasmique**, **membrane plasmique** (7 nm). La
distinction n'est pas décorative, c'est le mécanisme : une vésicule fusionne
avec la **membrane** et déverse son contenu dans le **périplasme**, où le
matériau est assemblé en paroi. Une seule ligne rendait ce mécanisme faux à
l'écran.

Périplasme et membrane sont exagérés d'un facteur ~20 — ensemble ils font un
quinzième de pixel. La paroi, elle, est à peu près à l'échelle.

### 4. La membrane plasmique est UNE ligne, et elle appartient au matériau

`src/sim/membrane.js`. Ce n'est pas une bande tirée du champ de distance : une
bande ne peut que coller à la paroi. C'est une **polyligne** continue, du flanc
gauche, par-dessus l'apex, jusqu'au flanc droit, dont chaque nœud porte un âge
`a` — le nombre de micromètres dont l'apex a avancé depuis que ce nœud était au
pôle. On ajoute l'avance à tous les âges et la ligne entière glisse vers
l'arrière. **On ne déplace rien : c'est le repère qui dérive.**

**Une vésicule qui fusionne n'est plus un objet qu'on dessine.** Les nœuds de
la zone de contact sont **retirés du chemin** et remplacés par l'arc de son
propre contour (`Scene.arcOmega`, profil dans `Membrane.omega`). Le chemin reste
**une seule courbe** — c'est la définition même de la fusion. L'espace ouvert
entre paroi et membrane *est* son lumen : il se remplit de périplasme tout seul,
puisque c'est la même couleur (règle 5).

L'arc passe par trois points : les deux coins de la bouche et le fond de la
poche. Tant que `dep > hw` il est **ré-entrant**, et c'est ce qui donne le col.
La bouche va de 0,34 à 1,89 R, la poche de 2,05 à 0,43 R. La cible imposée à la
corde suit *exactement* le même profil, pour qu'au retrait de l'arc, en fin
d'événement, la chaîne porte déjà la même forme.

**Abscisse signée.** `w = côté · âge` : négative d'un flanc, positive de
l'autre, nulle au pôle. `Membrane.maj` et `Scene.membraneLigne` travaillent
tous deux sur cette coordonnée, sur **une seule liste**. Deux conséquences :

- une fusion qui a lieu **au pôle** déborde naturellement des deux côtés. Avec
  deux chaînes indépendantes, la moitié de son oméga manquait, et le côté
  retenu dépendait du signe d'un écart latéral quasi nul : l'ancrage sautait
  d'un flanc à l'autre d'une image sur l'autre ;
- `zonesFusion` **regroupe les livraisons voisines en une seule poche**. La
  ligne de membrane est une *section* : elle est univoque, deux oméga au même
  endroit ne peuvent pas y être tous les deux. Les superposer donnait un
  dédoublement qui ne veut rien dire. Une double livraison, c'est une poche
  plus large — `dep` ne s'additionne pas, il prend le maximum.

Les zones sont calculées **une fois** par `Contenu.maj` et servent à la fois à
la corde et au rendu ; si chacun les calculait de son côté, l'arc dessiné et le
creux de la chaîne finiraient par ne plus coïncider.

**L'ancrage est le point de CONTACT**, pas le centre de la vésicule :
`(s, v) − d⃗·distParoi`. Ancrer sur le centre décalait l'oméga d'un rayon, et
près du pôle, où la surface tourne vite, le décalage sautait d'une image à
l'autre. Mesuré : écart maximal au point de contact **22 % du rayon** sur 176
ancrages, contre 100 % quand on ancrait sur le centre.

**Mesuré : le raccord de l'arc sur la ligne est exact à 1,8·10⁻¹⁶ px près**,
vérifié sur 7 242 images, et pendant l'événement l'oméga vieillit de 48 nm pour
46 nm d'avance de l'apex (3 % d'écart, qui est l'expansion orthogonale).

Le modèle est une corde 1D, `acc = c²·∂²off/∂x² − k·(off − cible) − b·vitesse`,
avec `c = 1,07 µm/s` : la perturbation **court** le long de la ligne au lieu
d'apparaître partout à la fois, et c'est ça qui donne la lecture « molle ».

Deux régimes, et c'est le cœur du modèle :

- **pendant** la fusion, la vésicule est physiquement là : on contraint fort
  (`RAPPEL_EVT = 110`). À 7 la tension gagnait — longueur de cicatrisation
  `sqrt(4,4/7) = 0,79 µm` contre 0,45 µm de largeur d'oméga — et le creux était
  effacé avant d'avoir été vu : 0,03 µm au lieu des 0,12 demandés ;
- **après**, le surplus de membrane est **réel**. Rien ne le ramène à plat :
  seule la tension l'étale, et l'expansion de la calotte le consomme
  (`ABSORB = 0,15 /s`). Un rappel vers zéro le ferait disparaître sur place.

`ABSORB = 0,75 /s`. À 0,15 le surplus s'accumulait : chaque fusion en injecte et
rien ne le retirait assez vite, si bien qu'au bout d'une minute **la ligne
entière flottait à 0,6 µm de la paroi** au lieu de 0,02. L'équilibre est
maintenant proche de zéro et le creux reste visible ~1,5 s après l'événement.

### 5. Une vésicule n'a pas de couleur à elle

Sa membrane **est** de la membrane (`P.membrane`), son lumen **est** du
périplasme (`P.periplasme`) — il le devient à la seconde où le pore s'ouvre.
Il n'y a volontairement **pas d'entrée `vesicule`** dans la palette : deux
entrées séparées finiraient par diverger, et c'est précisément cette identité
qui rend la fusion lisible sans qu'on ait rien à expliquer.

`Scene.fusions` ne dessine donc plus **rien** de la vésicule : dès le contact,
elle est un arc de la polyligne. Il n'y reste que le matériau déversé, qui sort
**pendant** que la poche s'ouvre et non à la fin — émis d'un coup au terme de
l'événement, les grains surgissaient de nulle part une fois la poche refermée.

`livraison.html` est une page dédiée à cette animation : même simulation, mais
la caméra reste collée à une fusion et un curseur permet de la rembobiner. Une
page de mise au point qui aurait sa propre version de l'animation ne servirait
à rien.

### 6. La paroi neuve migre, et ça doit se voir

Une hyphe s'allonge par son apex : la paroi formée à la pointe se retrouve
progressivement sur les flancs, puis hors champ. Une paroi uniforme a l'air
immobile même quand l'apex avance de trois pixels par seconde. Deux dispositifs
rendent ce déplacement lisible :

- chaque exocytose pose une **trace** (`Contenu.depots`) à la latitude où elle
  a eu lieu. Elle remonte le profil du pôle vers l'épaule — l'expansion
  orthogonale de Reinhardt, reprise par Lew 2011 fig. 2 — puis descend le flanc
  à vitesse constante. **Mesuré : pleine largeur après 17 s, 70 µm derrière
  l'apex après 200 s.**
- la **texture de paroi** est indexée sur l'abscisse cumulée depuis l'origine,
  pas sur la distance à l'apex. Indexée sur `s` elle serait figée dans le
  repère de l'apex ; indexée sur le matériau elle glisse vers l'arrière.

Même raisonnement pour le milieu extérieur : le grain de gélose et les débris
sont tirés d'un hachage de cellules en **coordonnées monde**. Sans repère fixe
hors du tube, il n'y a aucune impression de progression.

### 7. Une branche n'est pas un second objet

`branche.html`. Une branche est un **second axe** ; la silhouette est
l'**union** des deux tubes, calculée comme un **minimum adouci** de leurs deux
distances signées. On n'a jamais deux contours, on a un contour qui a un Y
dedans. `App.tiges` est la liste des axes, `Scene.unir` fait l'union, tout le
reste — remplissage, paroi, halo — lit ce seul champ.

L'adoucissement retenu est le **congé circulaire**, `max(k, min(a,b)) −
hypot(max(k−a,0), max(k−b,0))` : le k qu'on lit est vraiment le rayon de
raccordement. Le minimum polynomial, essayé d'abord, ne creuse que k/4 — à
k = 1,1 µm il rabotait la jonction de 0,25 µm et l'angle rentrant se lisait
encore comme un V. **k = 2,5 µm.**

On ne peut pas raccorder plus large que ce qu'on mesure : la portée du champ de
distance doit donc dépasser k. Elle est **conditionnelle** — 7 px pour une
hyphe seule, 30 px dès qu'il y en a deux, parce que la portée large coûte
2,8 ms par image et par tube et que l'hyphe seule est le cas courant.

**Le bourgeon naît dans le cytoplasme de sa mère.** Son apex est posé 3,2 µm
sous la paroi (plus près, le congé ferait bomber la mère avant que la branche
n'existe) et son axe d'amorce part **de l'axe maternel**, 7 µm en arrière, puis
s'incurve vers le flanc. Deux raisons, toutes les deux mesurées : une branche a
besoin de ~7 µm de tube dès sa naissance, sinon elle n'a pas la place d'un
Spitzenkörper, donc elle ne fusionne pas, donc elle ne pousse pas ; mais 7 µm
de tube **droit** planté en travers d'une mère de 11 µm de diamètre ressortent
par le flanc opposé. C'est aussi exactement le mécanisme **A** : le second
Spitzenkörper est sub-apical, il se forme dans le cytoplasme maternel avant que
rien ne bombe à la surface.

Le tube de la fille s'élargit avec son **matériau** — 0,55 R au col, le calibre
plein après 25 µm — et non avec s, sinon l'élargissement resterait figé dans le
repère de l'apex et la branche n'aurait jamais l'air de grossir.

La caméra **peut suivre la fille** — c'est l'intérêt de brancher : l'apex ne
tourne pas serré (58 µm de rayon), la branche part à 60–80°, donc **brancher
est la seule façon de tourner vite**. Détail et suite dans
`docs/02-thalle-et-jeu.md`, qui fixe aussi l'architecture à deux échelles.

**Reste à faire.** Le pool de vésicules n'est pas partagé : chaque tige a le
sien, donc l'apex mère ne ralentit pas quand la fille démarre. Et la
ramification n'est pas encore autonome — c'est `App.brancher` qui la déclenche.
`ramification.html` reste la proposition qui a précédé ; la bifurcation apicale
y reste en réserve comme événement rare.

### 8. Deux échelles, un seul axe

`src/sim/thalle.js`, `thalle.html`. Le macro simule tout le mycélium : par
pointe un axe grossier, un cap avec inertie, une vitesse, une règle de
ramification. Rien d'autre — ni vésicule, ni membrane. Un point d'axe tous les
**6 µm** et non 0,22 : au pas micro, dix mètres de mycélium feraient 45 millions
de points.

**La vitesse macro est calibrée sur la micro, jamais choisie.** `V_MICRO` ne se
règle pas ici : c'est ce que le banc mesure sur l'apex, où le tube avance parce
que ses vésicules fusionnent. `omMax` est `v/R` avec le rayon de virage mesuré.
**Le verdict 13 fait tourner les deux côte à côte et refuse l'écart** — sinon la
forme de la colonie dépendrait de l'endroit qu'on regarde, et zoomer changerait
le jeu.

Trois mécanismes font une colonie plutôt qu'une éponge :

- **la règle de Trinci**, et une seule : on ramifie quand la longueur moyenne
  construite par pointe *depuis sa dernière branche* dépasse l'unité de
  croissance hyphale (110 µm). Sur « longueur totale / nombre de pointes », les
  hyphes mortes continuaient de pousser au branchement et le rapport
  s'emballait à 3 564 µm ;
- **l'autotropisme négatif**, lu sur le gradient d'une grille de densité ;
- **le substrat qui se consomme.** C'est ce qui limite la colonie, et sans lui
  le modèle s'emballe : les pointes doublent toutes les six minutes pendant que
  la colonie ne s'étend que linéairement, et on obtenait 140 mm d'hyphe par
  mm² — plus de 100 % de couverture. C'est aussi, mot pour mot, le plateau de
  jeu.

**Le pont.** `src/monde.js`, `monde.html`. On clique sur une pointe, on
descend sur son apex, on remonte.

**L'axe ne s'interrompt jamais.** Descendre n'instancie pas une nouvelle
hyphe : `depuisMacro` ré-échantillonne à 0,22 µm, par une Catmull-Rom, l'axe
que le macro a construit pendant qu'on ne regardait pas — une interpolation
linéaire laisserait un coude visible tous les soixante pixels et on lirait la
structure de données. Tant qu'on est en bas, la micro pilote la pointe et
`Thalle.inscrire` n'enregistre que son matériau ; en remontant, il n'y a rien à
raccorder. **Mesuré (verdict 15) : apex exact, écart nul à l'axe macro, et le
pas de 6 µm tenu à 60 nm près à la reprise.** La position COURANTE de la pointe
doit être passée en dernier point de contrôle : elle n'est pas dans l'axe, et
sans elle l'apex naissait jusqu'à 6 µm derrière — donc l'axe sautait.

**Le fondu est une horloge, et c'est le préchauffage qui la donne.** `tr`
n'est pas un compteur à part : c'est la fraction du réservoir apical déjà
remplie. Les deux ne peuvent donc pas se désynchroniser, et il n'y a pas de
dernier à-coup où l'un attendrait l'autre. Pendant ces vingt secondes
simulées, la colonie **entière** vit — rien n'est sauté, rien n'est masqué. Le
basculement d'image se fait au **sommet du flou**, là où il n'y a rien à lire,
et le grossissement suit une rampe **logarithmique** : d'un bout à l'autre il y
a un facteur 270, et une rampe linéaire passerait 90 % du fondu à l'échelle de
la colonie.

**Le temps change de régime avec l'échelle** : ×1 en bas, sinon la colonie
traverserait la boîte avant la fin d'une exocytose. Mais elle ne s'arrête
pas — il n'y a qu'un organisme et qu'une horloge.

`cadre.html` est la version contemplative **figée** : la simulation seule, sans
panneau. Le travail sur le jeu part d'ailleurs et n'y touche pas.

### 9. La sporulation est un sac, pas une chaîne

`src/sim/sporange.js`, `sporange.html`. Sur une hyphe **non septée**, la
reproduction asexuée se fait par **sporocyste** : rhizoïdes, sporangiophore,
apophyse, columelle, sac, spores, déchirure. Anatomie relevée sur
`Apex_references/Art/conidia`.

**La columelle n'est pas un objet.** C'est l'**extrémité gonflée** du
sporangiophore : une seconde ogive, plus large, qui prend le dessus dans
`Sporange.profil(q)` à mesure qu'elle enfle, et qui se raccorde à la tige par
une décroissance exponentielle — l'apophyse. Dessinée à part, en cercle plein
posé au bout de la tige, on lisait une bille accrochée à un bâton, et elle
semblait exister dès la première seconde. **C'est la règle 1, refaite à
l'identique.** Le sporangiophore, lui, est une hyphe comme les autres : ogive
apicale 1,40 R, exposant 2,1 — les valeurs arrêtées pour l'apex. Il pousse par
sa pointe, rien ne justifie qu'il se termine autrement.

**L'ordre n'est pas celui qu'on croit, et il était à l'envers.** On voyait
« l'apophyse arriver puis le sac apparaître ensuite » — trois objets qui se
succèdent, alors qu'il n'y a qu'un corps. La séquence réelle, relevée sur la
littérature *Rhizopus* / *Mucor* :

1. la pointe du sporangiophore **gonfle et devient le sporocyste entier**,
   noyaux et cytoplasme poussant vers l'apex ;
2. le cytoplasme s'organise : riche en périphérie sous la paroi, vacuolisé au
   centre ;
3. **une série de petites vacuoles apparaît juste au-dessus du centre,
   s'aplatit et coalesce en une cavité de clivage** ;
4. **une paroi se forme du côté interne de cette cavité** et sépare le centre
   — la columelle — de la périphérie. Elle se bombe et pousse dans le
   sporocyste ;
5. la périphérie se clive en spores.

La columelle est donc un **septum qui bombe**, pas un bourgeon qui pousse, et
le sac n'arrive pas par-dessus elle : il est là depuis le début, c'est la
pointe elle-même. `PHASES` suit cet ordre — `renflement`, `cavite`,
`columelle` — et **le verdict 16 le mesure** : le sac fait 80 µm quand la
cavité se creuse, la columelle mesure encore 0,0 µm à ce moment-là, et la
cavité est faite à 100 % quand le septum commence.

**La cavité de clivage se dessine sur le contour de la columelle À VENIR** —
`profil(q, R_COL)`, la même fonction avec le rayon qu'elle aura. Quand le
septum se forme, la paroi est déjà là où la cavité était : rien ne se
déplace, l'une remplace l'autre. Deux définitions de « où est la columelle »
finiraient par ne plus coïncider, et le septum se formerait à côté de la
cavité qui l'annonce. C'est pour ça que `profil` **et** `partCol` prennent
toutes deux le rayon en paramètre.

**Dans le sac, la paroi n'existe que quand le septum existe.** Le liseré et le
halo tirés à pleine force autour du renflement en faisaient une **ampoule
fermée posée dans le ballon** : on lisait deux corps à paroi alors qu'à ce
stade il n'y en a qu'un. Les deux montent avec `rCol`, c'est-à-dire avec la
paroi qui se forme. Un halo est l'artefact de phase d'un **saut d'indice** ;
sans paroi, pas de saut.

**La spore qu'on suit est une cellule, pas une bille.** À neuf pixels par
micromètre elle fait soixante-dix pixels de large, et à cette taille l'aplat
ne tient plus : elle porte les mêmes couches que le tube — paroi épaisse,
périplasme, membrane, cytoplasme —, le même vocabulaire d'organites que
l'apex (`noyau` + `nucleole`, `cap` pour les mitochondries, `dot` pour les
grains) et des globules lipidiques, qui sont ce qui rend une spore
réfringente. Le détail est réservé à **celle que la mise au point désigne** :
sur le seul critère de taille, les deux secondes où la caméra passe de
l'échelle du sac à celle de la spore mettaient cinq cents spores au-dessus du
seuil d'un coup, et le nuage entier devenait granuleux — dans un tas, une
spore est vue à travers les autres.

**Les spores naissent par CLIVAGE, pas par bourgeonnement.** Le sporocyste est
un cénocyte — un sac de cytoplasme à plusieurs milliers de noyaux — et des
membranes s'y referment autour de paquets de cytoplasme, à peu près en même
temps, dans tout le volume. D'où le grain qui se prend partout à la fois au
lieu de croître depuis la columelle. Elles sont placées en **trois
dimensions** dans la coque : celles du fond sont derrière le plan de mise au
point. À plat, elles font un motif, pas un volume.

**Le sac est une corde**, comme la membrane plasmique (règle 4) : un anneau
fermé, même équation, plus un terme de pression. Longueur de cicatrisation
13 µm, soit un tiers du sac. Au-delà de 42 % de remplissage il ne se comprime
plus, il se tend ; il se bombe de 2,3 µm, cède au nœud le plus tendu, et la
paroi déchirée cesse de tirer vers sa forme de sac pour se retrousser en
**collerette** autour de la columelle.

**Il y a ici une VRAIE troisième dimension**, et c'est elle qui raconte la
scène. Le sporangiophore monte vers l'observateur — 380 µm en z pour 99 dans
l'image, il est vu en **raccourci** —, les rhizoïdes plongent sous lui, le
stolon reste où il est. La mise au point suit la pointe, donc tout le reste
sort du plan dès la deuxième seconde — **le fond compris** : le substrat est à
z = 0, il n'a aucune raison d'être net à 380 µm au-dessus. Profondeur de champ
**22 µm**, qui se
**referme à 6,5** quand la caméra monte en grossissement pour suivre une
spore : c'est ce que fait un objectif réel, et c'est la seule chose qui isole
une spore dans un nuage.

**Assumé.** Une sporulation réelle prend des heures, elle est jouée en 90 s ;
le sporangiophore fait 380 µm au lieu du millimètre réel ; la rupture est
**mécanique**, alors que chez beaucoup de Mucorales la paroi se lyse ou se
dessèche — la pression est le mécanisme d'autres genres, et c'est celui qui se
voit.

### 11. La germination est un gonflement, pas un pointage

`src/sim/germination.js`, `germination.html`. C'est le seul moment du cycle où
la croissance n'est **pas apicale**. Une spore qui germe commence par gonfler
dans toutes les directions à la fois — croissance isodiamétrique —, et ce n'est
qu'après, quand un site de polarité s'est établi, que la machine apicale
démarre. Sauter le gonflement, c'est faire sortir un tube d'une bille inerte ;
c'est exactement ce qui se voit.

Quatre temps, et chacun a son signe à l'écran :

1. **dormance** — paroi épaisse et ornementée, cytoplasme dense, quelques gros
   globules lipidiques réfringents. Rien ne bouge : `mob = 0`, et un cytoplasme
   dormant qui brasse quand même est le moyen le plus sûr de ne pas faire lire
   la dormance ;
2. **imbibition** — elle boit. Le volume ne change presque pas (+8 % en rayon)
   mais la turgescence monte, l'ornementation s'efface — une paroi tendue se
   lisse — et le contenu se remet en mouvement. **Ça se voit avant que la
   taille n'ait bougé** ;
3. **gonflement** — le rayon passe de **4,0 à 6,6 µm**, soit ×1,65 en rayon et
   ×4,5 en volume, la fourchette des Mucorales. La paroi s'**amincit** : la
   même quantité de matériau s'étale sur 2,7 fois plus de surface. Les réserves
   lipidiques fondent, les vacuoles grossissent, la granulation monte ;
4. **polarisation** — un à trois sites se choisissent, séparés d'au moins 75°,
   et les vésicules s'y rassemblent. C'est un **Spitzenkörper qui se forme
   avant qu'il y ait un tube pour le contenir** — le mécanisme A de la
   ramification (règle 7), à ceci près qu'ici la mère est une spore.

**La spore est une tige de plus, pas une peinture.** Elle expose exactement ce
que la `Scene` demande — un contour fermé en coordonnées monde, un centre, un
cap, une maturité de paroi, une abscisse totale — et rien d'autre. Le rendu
n'a pas à savoir ce que c'est ; il lui suffit de ne pas lui demander ce
qu'elle n'a pas (`co === null` : pas de coordonnées `(s, v)`, donc pas de
passe de contenu de tube). Son remplissage, sa paroi, son halo et le **col
concave** au pied du tube sortent du même champ de distance que ceux de
l'hyphe. Une spore peinte par-dessus un tube, ce serait la règle 1 une
quatrième fois.

**Le tube germinatif EST une branche.** Pas une analogie : la même classe, la
même option `branche`, le même fond de bourgeon arrondi, le même
élargissement indexé sur le matériau. Il naît à 4 µm de diamètre et met 60 µm
à prendre son calibre — un tube germinatif est **longtemps étroit**, et à 34 µm
il sortait en cône.

**Elle s'arrondit en gonflant.** Dormante elle est ovoïde et un peu anguleuse ;
turgescente elle est une sphère, parce que c'est la pression interne qui la met
en forme et qu'une pression est isotrope. Ce n'est pas qu'une lecture : le
petit axe passe de 5,4 à 6,3 µm, et **c'est ce qui donne à l'amorce du tube les
2,05 µm de jeu dont elle a besoin** pour que le congé de l'union ne la ponte
pas à la paroi.

**Le contenu vit en polaire normalisé.** C'est la seule façon d'obtenir un
gonflement isodiamétrique sans rien déplacer : le contenu garde ses
coordonnées, c'est le corps qui s'étire sous lui. Même geste que la membrane
plasmique, où l'on n'écarte pas les nœuds — on fait dériver le repère.

### 12. Le cycle n'est qu'un enchaînement

`src/cycle.js`, `cycle.html`. Germination, croissance apicale, ramification,
**recul sur la colonie**, redescente, sporangiophore, sporocyste, éclatement,
vol, retombée — puis germination. **Rien de nouveau n'y est simulé.** L'apex
avance avec `pasMicro`, le sporocyste est cadré par `cadrerSporange`, le flou
de fondu est `flouEcran`, le macro est `Thalle` : si cette page réécrivait
l'une de ces lois de son côté, la même étape ne se regarderait pas de la même
façon selon la page qui la montre.

**C'est le même organisme, et c'est littéralement vrai dans le code.** La
spore que la caméra suit après l'éclatement est instanciée comme une
`Germination` dormante, tenue telle quelle pendant tout le vol, puis relâchée.
Il n'y a rien à raccorder à l'atterrissage : c'est le même objet.

**Le thalle est le germe qui a grandi, pas une autre colonie.** Chaque tube
germinatif est **greffé** sur le macro avec son axe (`Thalle.greffer`), qui le
ré-échantillonne au pas de 6 µm et pose sa densité au passage : la pointe
macro reprend exactement où la micro s'était arrêtée. C'est la règle 8 dans
l'autre sens — en descendant, `depuisMacro` rend l'axe fin ; en montant,
`greffer` rend l'axe grossier. **Mesuré (verdict 18) : apex exact, 0,0 µm
d'écart entre ce que la micro avait construit et ce que le macro inscrit.**

On reste en haut **1 h 48**, et pas quatre heures : à quatre heures la colonie
fait 590 mm pour neuf millimètres de diamètre, chaque hyphe tombe sous le
dixième de pixel et on ne lit plus qu'un disque floconneux. Vers deux heures
elle fait 90 mm pour quatre — **on voit les hyphes, les ramifications et le
front**, et c'est pour ça qu'on monte.

**LE SPORANGIOPHORE COMMENCE PAR ÊTRE UNE BRANCHE.** On ne fond pas vers un
sporangiophore qui aurait poussé tout seul ailleurs : on branche vraiment, sur
la mère qu'on regarde, avec le mécanisme de la règle 7 — bourgeon qui émerge
du cytoplasme maternel, col concave donné par le congé de l'union, tube qui
s'élargit avec son matériau. Ce qui change, c'est qu'elle **ne rampera pas**.

Et le raccord de direction est le point dur, parce qu'**un fondu ne rattrape
pas une direction** : si la branche part à droite et que la tige monte tout
droit, on lit deux objets. Trois choses le rendent exact :

- le cap du sporangiophore est **demandé à l'écran**, pas déduit d'une dérive
  latérale. `Sporange` reçoit `capImage` et en déduit son pas monde, `KZ`
  compris — sans compenser le cisaillement de la projection oblique, la tige
  partait 18° plus haut que demandé ;
- **on choisit la pointe en haut.** Le cap d'une branche vaut `thMère ± 46–88°`
  et celui d'une tige ne s'écarte pas de la verticale de plus de 40° : les deux
  ne se rencontrent pas pour toutes les orientations de mère. Avec trois cents
  pointes au choix dans la vue macro, il y en a toujours une dont le flanc
  regarde vers le haut — `viserSporangiophore` la trouve, résidu nul ;
- **l'origine du stolon est posée pour que la pointe tombe juste.** Un bourgeon
  naît 3,6 µm sous la paroi, donc décalé sur le côté : la corde qui va de l'axe
  maternel à sa pointe n'est pas son cap, elle s'en écarte de 4,6° à dix-sept
  micromètres. On recule donc l'origine le long du cap, de 1,35 µm — très sous
  le rayon du tube, le stolon recouvre toujours la mère.

**Mesuré : la pointe saute de 0 nm et la direction est tenue à 0,7°.**

**Le fondu est celui du pont entre les échelles**, et la rampe de
grossissement y est **logarithmique** : entre 13 px/µm sur un apex et 0,04 sur
une colonie il y a un facteur trois cents, et une rampe linéaire passerait
90 % du fondu à l'échelle de la colonie. On défocalise, on change d'objectif,
on refocalise, **et pendant ce temps les trois simulations vivent**.

**Le vol est la seule chose inventée, et elle est assumée.** Une spore emportée
ne voit plus un substrat : elle voit passer des masses. Trois plans de disques
flous qui défilent à des vitesses différentes — c'est la **parallaxe** qui dit
« ça va vite », pas le flou. La spore, elle, est dessinée exactement comme elle
le sera au sol.

### 13. Le jeu ne s'écrit qu'après la mesure

`src/sim/jeu.js`, `docs/03-jeu.md`, verdicts 19 à 21. **Rien n'est dessiné
tant que le modèle sans rendu n'a pas prouvé que jouer vaut mieux que
regarder.** Le prototype précédent est mort exactement là : 243 secondes en
jouant passivement contre 223 en jouant activement, l'optimum était de ne rien
faire, et personne ne l'avait mesuré avant d'avoir dessiné le panneau.

Le modèle n'ajoute que trois choses à la colonie de `thalle.js` : un
**nutriment qui s'épuise**, une **réserve qui circule** sur un graphe posé sur
les axes, et une **attention** — on ne tient qu'une pointe à la fois, et
`vue()` ne rend que ce que le joueur voit *vraiment*, la carte en haut, une
seule pointe en bas. Une politique de banc qui lirait l'état complet
mesurerait un oracle, pas un joueur.

**LE TRANSPORT EST LE RÉGLAGE QUI DÉCIDE SI LE JEU EXISTE**, et c'est le
résultat le plus important de toute cette passe. Il s'écrit en **diffusivité**,
µm²/s, et non en nombre de passes de relaxation — une diffusivité se lit, une
perturbation parcourt √(D·t). Balayé sur cinq valeurs :

| D (µm²/s) | contraste de réserve | passive | active |
|---|---|---|---|
| 800 | 2,2 | 1,00 | **1,88** |
| 1 600 | 1,5 | 2,13 | 2,00 |
| 9 500 | 1,1 | 3,25 | 2,88 |

Au-delà de 1 600, **le réseau est un bac commun** et l'active se met à *perdre*
contre la passive : quand la colonie nourrit un sporangiophore où qu'il soit,
choisir où le poser ne sert plus à rien. **C'est la cause du 243 contre 223, et
elle est tenue.** À 800, √(D·t) vaut 980 µm sur les vingt minutes d'un
remplissage — le rayon de la colonie à la mi-partie. Un sporocyste est nourri
par son voisinage, pas par la colonie entière.

**Ce qu'on décide, c'est OÙ et QUAND**, et il n'y a pas de seuil de départ :
la faisabilité d'un sporocyste n'est pas une affaire de stock, c'est une
affaire de débit. Il se remplit de ce que son voisinage lui livre. Le seuil
qu'il y avait tombait pile sur la moyenne du réseau et refusait une fois sur
deux au hasard de la relaxation — 178 refus sur 178 essais dans une partie.
**Un seuil qui trie au hasard n'est pas une contrainte, c'est du bruit.**

**Le score est gradué.** Il a été binaire — la partie s'arrêtait au premier
sporocyste — et c'était deux fautes : la mesure ne distinguait plus « à peine »
de « largement », et il n'y avait plus d'arbitrage puisque sporuler tôt était
gratuitement meilleur.

**La page, c'est `jeu.html` + `src/jeu.js`, et elle ne simule RIEN.** La
colonie vient de `sim/thalle.js`, le nutriment et la réserve de
`sim/jeu.js`, le pont entre les échelles de `monde.js`, l'apex de
`main.js`. Elle n'ajoute que de quoi voir et de quoi agir. On clique une
pointe, on descend dessus par le fondu du pont, on la conduit en déplaçant
la consigne du gradient de Ca²⁺ — avec les 10,7 s d'inertie mesurées, pas
une télécommande —, on ramifie, on monte un sporangiophore, on remonte.

**Une pointe tenue reste soumise à sa réserve.** `Thalle.pas` l'ignore
puisque la micro la pilote, mais rien ne justifie qu'une pointe affamée
pousse à plein régime parce qu'on la regarde : `pasVisite` applique la même
modulation que la colonie. Et le relevé d'extension de `Jeu.pas` se fait
désormais **à la fin du pas**, sinon tout ce que la micro construit entre
deux appels serait construit gratuitement.

**L'ESTHÉTIQUE NE PERD RIEN, et ça se code.** Les trois optiques restent.
Le panneau s'efface tout seul après six secondes sans geste — on regarde
pousser une moisissure, le HUD n'a aucune raison de rester en travers — et
le moindre mouvement le ramène. Ce qu'il faut savoir se lit **sur
l'organisme**, par des calques qu'on allume **un à la fois** : superposés,
ils redeviennent un tableau de bord.

**Un calque est un FILTRE, un marqueur est un RÉTICULE, et les deux ne
vivent pas au même endroit.** Le filtre est dans le trajet optique : il
passe avant la composition des calques de profondeur et avant le grain de
capteur (crochet `opts.calque` de `VueThalle`). Le réticule — le front, le
sporocyste, la pointe visée — est sur le verre de l'oculaire : après tout,
en `direct`. Il n'y en a que trois, et pas un de plus.

**Et le verdict 20 est un demi-résultat, dit comme tel dans la sortie du
banc.** L'emplacement décide (2,35 spores contre 0,45 posé du mauvais côté,
un facteur cinq) et c'est un geste qui n'existe qu'en haut. Mais une politique
qui ne remonte jamais perd seulement *en moyenne* (1,70 contre 2,35) : elle
est devant sur 9 graines sur 20, et sur neuf réglages de menaces ce compte n'a
jamais dépassé 10/20. **Tenir une pointe ne coûte pas encore assez.** Les
pistes sont dans `docs/03-jeu.md` § 8 ; aucune ne s'écrit avant d'être mesurée.

---

### 10. Le Spitzenkörper n'est jamais dessiné

C'est une densité, pas un objet : un puits de rétention à ~2 µm de la pointe,
et le nuage apparaît tout seul. Le dessiner net était la mauvaise réponse
(« le fait de représenter si net le spitzenkorper n'est peut-être pas la bonne
solution »).

---

## Chiffres mesurés (`npm run banc`)

| | mesuré | référence |
|---|---|---|
| croissance | 19,2 µm/min | 20 µm/min (*Neurospora*, Lew 2011) |
| exocytoses | 1,64 /s, une toutes les 0,61 s | — |
| extension par fusion | 194 nm | — |
| durée d'une fusion | 0,85 s | — |
| raccord de l'arc sur la ligne | 1,8·10⁻¹⁶ px sur 7 242 images | 0 |
| écart de l'ancrage au point de contact | 22 % du rayon, 176 ancrages | 0 |
| chevauchements de poches | 0 sur 8 976 fusions-images | 0 |
| dérive de l'oméga pendant l'événement | 48 nm pour 46 nm d'avance | égalité |
| rayon de virage, consigne pleine | 58 µm | unité de croissance hyphale ~110 µm |
| inertie du cap (63 %) | 8,5 s | — |
| migration de la paroi neuve | pleine largeur en 20 s, 70 µm en 200 s | — |
| matériau déversé hors périplasme | 0,0 % | — |
| étanchéité | 0 vésicule hors du tube sur 4 × 30 s | — |
| budget logique | 0,53 ms/image | 16,7 ms disponibles |

Et pour la ramification :

| | mesuré | référence |
|---|---|---|
| silhouette en deux morceaux | 0 sur 7 âges de branche | 0 |
| congé hors de la jonction | 0 px au-delà de 9 µm | 0 |
| ce que le bourgeon ajoute à sa naissance | 0 px, de 48° à 84° | 0 |
| la fille perce la paroi | 16 s après sa naissance | — |
| croissance de la fille | 16,0 µm/min sur 120 s | mère : 21,5 |
| diamètre au col | 5,2 µm, soit 0,47 × la mère | ~0,6 × (Trinci) |
| calibre plein atteint | 9,5 µm après 32 µm de pousse | — |
| coût de la portée large | +2,8 ms par image et par tube | conditionnelle |

Et pour la colonie :

| | mesuré | référence |
|---|---|---|
| pointe micro / pointe macro | 20,0 / 19,4 µm/min | écart 2,9 % |
| rayon de virage macro | 58 µm | `v/R`, R mesuré sur la micro |
| extension radiale de la colonie | 19,0 µm/min | un peu sous la vitesse de pointe |
| colonie à 4 h | 590 mm, 386 pointes | 1 704 branches, 1 214 anastomoses |
| densité au front | 9,1 mm/mm² | ~10 % de couverture |

Et pour le pont :

| | mesuré | référence |
|---|---|---|
| apex micro / pointe macro | 0 µm | 0 |
| écart de l'axe fin à l'axe macro | 0 nm | 0 |
| pas de 6 µm tenu à la reprise | 60 nm | 0 |
| ré-échantillonnage | 307 points macro → 1 148 fins | — |
| durée du fondu | 20 s simulées, ~1,3 s réelle | = le préchauffage |

Et pour la sporulation :

| | mesuré | référence |
|---|---|---|
| remplissage maximal du sac | 53 % | empilement physique < 75 % |
| spores hors du sac avant rupture | 0 | 0 |
| bombement de la paroi avant rupture | 2,3 µm | > 0 |
| séquence complète | 8 phases dans l'ordre, éclatement à 93 s | — |
| diamètre du sac quand la cavité se creuse | 80 µm | le sac est complet |
| columelle à ce moment-là | 0,0 µm | 0 |
| cavité faite quand le septum commence | 100 % | 100 % |
| spores libérées | 344 sur 520 | — |

Et pour la germination :

| | mesuré | référence |
|---|---|---|
| gonflement | 4,0 → 6,6 µm de rayon, ×1,65 | ×1,5 à ×3 en diamètre (Mucorales) |
| rayon de la spore à la naissance du tube | 6,6 µm, phase « émergence » | le gonflement est fini |
| jeu de l'amorce à la paroi | 2,05 µm | > 1,8 (deux fois le congé) |
| ce que le bourgeon ajoute à sa naissance | 0 px, silhouette en 1 morceau | 0 |
| croissance du tube germinatif | 20,8 µm/min | hyphe mûre : 19,4 |
| tubes par spore, sur 12 spores | 1 à 3 | 1 à 3 |
| écart minimal entre deux sites | 83° | > 75° |

Et pour le cycle :

| | mesuré | référence |
|---|---|---|
| greffe : apex micro / pointe macro | 0 µm | 0 |
| ce que la micro a construit / ce que le macro inscrit | 0,0 µm d'écart | pas de 6 µm |
| colonie à la redescente | 1 h 48, 90 mm, 160 pointes | on voit encore les hyphes |
| redescente : apex micro / pointe macro | 0 µm | 0 |
| résidu de visée sur la pointe choisie | 0° | 0 |
| résidu maximal, toutes orientations de mère | 52° | d'où le choix en haut |
| la pointe saute au raccord | 0 nm | 0 |
| direction tenue au raccord | 0,7° | 0 |
| recul de l'origine du stolon | 1,35 µm | < rayon du tube (5,5) |

Et pour le jeu (20 graines de 3 h, `src/sim/jeu.js`) :

| | mesuré | référence |
|---|---|---|
| passive / active | 1,10 / 2,35 spores | l'active devant sur 14/20 |
| posé sur le gras / du mauvais côté | 2,35 / 0,45 | facteur 5 |
| collée à une pointe / en alternant | 1,70 / 2,35 | devant sur 9/20 seulement |
| avec / sans anastomoses | 2,75 / 1,25 | 55 % de moins |
| contraste de réserve intérieur/front | 2,2 | > 1 (1,1 = bac commun) |
| remplissage d'un sporocyste | 20 min, à 6 u/s livrées | palier mesuré |
| débit livré à un puits | 2,1 u/s à 11 pointes, 9,4 à 49 | — |
| budget d'une partie | 62 % entretien, 14 % extension, 18 % perdu | 7 % disponible |
| indépendance au pas d'intégration | 2,88 / 2,75 / 3,00 à dt = 1, 2, 4 | égalité |

Un chiffre documenté sans avoir été mesuré est un chiffre qu'on croit seulement
avoir. Ça s'est déjà payé.

**Et le banc ne voit pas tout.** Sur le prototype précédent, onze verdicts sont
passés pendant trois itérations d'apex phallique : un banc mesure des durées,
des causes et des épaisseurs, pas une silhouette. **Regarder les captures fait
partie du travail**, pas après, pendant.

---

## Pièges déjà payés

- `hash2` doit décaler en **logique** (`>>>`). En arithmétique le bit de signe
  est recopié et le hash reste borné à [0, 0.5) : trois plans de profondeur sur
  quatre n'étaient jamais dessinés.
- Un **disque euclidien de rayon 1,2 px est une croix** à quatre branches. En
  dessous de 1,85 px on passe par `Screen.dot`, qui quantifie 1 px / 2×2 / 3×3.
- Un **flou de boîte conserve l'énergie totale, pas le pic** : un objet de 2 px
  étalé sur 9×9 perd 96 % de son opacité. D'où `BLUR_GAIN`. Mais le gain rend
  aussi un petit objet très flou **explosif** : le coefficient de profondeur
  est à 0,62, pas 0,92, sinon le champ se couvre de nuages blancs.
- **Une vésicule remplie de la couleur du cytoplasme est invisible.** Le liseré
  clair en bordure donne l'effet inverse recherché : un anneau blanc à centre
  sombre, lecture « bulle ». Disque plein + cœur plus clair.
- La **paroi est à l'échelle** (0,19 µm), bornée à [1,0 ; 9] px. Le plafond
  n'empêche que la saucisse floue du prototype précédent ; il n'est atteint
  qu'au-delà de ×3,5, là où on est de toute façon à l'échelle de la MET. Bornée
  à 2,6 px comme avant, elle devenait *relativement* plus fine à chaque cran de
  zoom, ce qui est le défaut symétrique.
- `Lc = 0,85 R` donne un rayon de courbure au sommet de `R²/Lc` = 6,5 µm pour
  un tube de 5,5 µm : le dôme est **plus plat qu'une demi-sphère** et le tube a
  l'air coupé net. `Lc = 1,55 R` est franchement phallique. On retient 1,00 R.
- Le recul de caméra se calcule sur l'**étendue du cadre en pixels**, pas sur
  une constante en µm — et la `Scene` doit connaître sa taille **avant** la
  première simulation, sinon la caméra part à NaN et l'image est vide.
- `distParoi` renvoie la direction **rentrante**. Pour ramener une molécule
  vers la paroi il faut donc **soustraire**. Avec le signe inverse, les
  molécules libérées s'enfonçaient dans le cytoplasme au lieu de s'incorporer,
  et 100 % d'entre elles finissaient à plus de 0,3 µm de la paroi — visible à
  l'écran comme une bande sombre en travers du tube.
- `flux(s)` descend sous la vitesse de croissance près de la pointe. Les
  granules y trouvaient donc un **point de stagnation vers s = 1,6 µm** et s'y
  accumulaient en une barre sombre. D'où le plancher à 0,62 µm/s dans
  `majGrains` : ils avancent toujours, sont consommés à l'apex, et repartent du
  fond du champ.
- Une trace de paroi s'oriente sur la tangente à la **surface**, jamais sur
  celle de l'axe : au pôle les deux sont perpendiculaires et la trace sortait
  du tube comme une épingle.
- **Un liseré de membrane sur une vésicule de 2,2 px recouvre son lumen** :
  la vésicule se lit alors comme un anneau sombre, le compartiment disparaît
  au profit de son contour. Seuil à 2,6 px ; en dessous, disque plein.
- Une trace de paroi neuve mélangée à moitié vers le blanc et à 0,72 d'alpha
  devient, en fond noir, un **rectangle lumineux posé sur la paroi** : on lit
  un artefact, pas du matériau neuf. 0,22 de mélange, 0,43 d'alpha au pic.
- **Une animation dessinée à une position ÉCRAN reste sur place** pendant que
  l'apex avance, et l'événement se met à flotter à côté du tube au lieu d'être
  dedans. Tout ce qui appartient à la paroi ou à la membrane doit être indexé
  sur le **matériau** : les traces (`depots`), la texture de paroi, et la
  membrane elle-même.
- Un banc qui cherche « le creux le plus profond » ne mesure pas une dérive :
  de nouveaux creux naissent sans cesse au même endroit **dans le repère de
  l'apex**, et on ne distingue plus « le creux a suivi le matériau » de « un
  autre creux est apparu au même endroit ». Le verdict coupe donc l'exocytose
  avant de suivre.
- Le contour est un polygone échantillonné ; la membrane, elle, l'est tous les
  0,09 µm. Avec un pas de contour à 1,2 µm le polygone **lissait l'ondulation de
  paroi** que la membrane suivait : au fort grossissement les deux lignes
  s'écartaient jusqu'à 0,6 µm sans raison. Pas ramené à 0,45 µm.
- Deux chaînes de membrane indépendantes (une par flanc) **ne peuvent pas
  porter un événement qui a lieu au pôle** : il en manque la moitié, et le côté
  retenu dépend du signe d'un écart latéral quasi nul. Une seule liste sur une
  abscisse signée, et le cas particulier disparaît.
- Un **minimum polynomial adouci ne creuse que k/4**. À k = 1,1 µm il rabotait
  la jonction de 0,25 µm et l'angle rentrant se lisait encore comme un V. Le
  congé circulaire, lui, a le rayon qu'on lui donne. Et il n'a pas besoin de
  garde-fou aux bords : dès que les deux distances dépassent k, il redonne le
  minimum exact, là où la formule polynomiale laissait un terme k/4 partout où
  les deux champs saturaient — un halo fantôme à exactement `BANDE` pixels de
  la paroi.
- **Un champ de distance n'est propre que dans sa boîte.** `bandeDistance` ne
  nettoie que la sienne ; ailleurs traîne l'image précédente. `Scene.unir` lit
  les deux champs sur la boîte **union**, donc plus large : un 8 périmé passait
  pour une paroi à 8 px et le congé se mettait à ponter n'importe quoi,
  4 400 px de silhouette inventés loin de toute jonction. Même piège dans le
  banc, où une seule `Scene` servait à des cadrages différents.
- **Une branche qui n'a pas la place d'un Spitzenkörper ne pousse pas.** Avec
  3 µm d'enfoncement elle n'avait que 0,6 µm de domaine simulé — le réservoir
  se tient à 2 µm de la pointe. Elle ne fusionnait pas, donc ne poussait pas,
  donc n'avait toujours pas de tube : 1,5 µm en vingt secondes contre 6,4
  attendus. Mais 7 µm de tube **droit** planté en travers d'une mère de 11 µm
  ressortent par le flanc opposé. L'amorce part donc de l'axe maternel et
  s'incurve.
- **Longueur simulée et longueur dessinée ne sont pas la même chose.** Les
  confondre a coûté deux fois : d'abord une coupe franche en travers du tube
  dès qu'on regardait ailleurs que l'apex, puis — en allongeant le dessin
  sans allonger le contenu — un tube dessiné mais vide. Il y a maintenant
  trois portées, et chacune a sa raison : 200 µm dessinés, 70 µm peuplés,
  34 µm de membrane simulée.
- **Les calques avant vont de 0 à 3 par flou CROISSANT.** Le 3 a 4 px de rayon
  et un gain de 4,2. En y dessinant le mycélium en croyant y trouver le net,
  les hyphes sortaient cinq fois trop épaisses et la colonie se remplissait de
  blanc.
- **Des traits sous-pixel empilés en src-over saturent, et baisser l'opacité
  ne corrige rien** — ça ne fait que déplacer le seuil. À 48 µm par pixel, une
  hyphe fait un vingtième de pixel et 590 mm de mycélium tombent sur 12 000 px
  dans un disque de 17 600 : dix passages sur le même pixel donnent
  1 − (1−a)¹⁰. Vu de loin, on accumule donc la **surface** réellement occupée
  et on en tire l'opacité une seule fois, à la fin.
- Une pointe macro **se freinait sur sa propre trace** : elle lisait le substrat
  sous elle, où elle venait de déposer 60 µm d'hyphe dans une cellule qui sature
  à 150. Une pointe isolée en milieu neutre poussait à 18,6 µm/min au lieu de
  19,4 — et toute la colonie s'étendait 25 % trop lentement. Une hyphe consomme
  **derrière** elle, pas devant.
- Une grille de simulation lue telle quelle au rendu **se voit comme un
  damier** : on lit une structure de données, pas un substrat. Interpolation
  bilinéaire au rendu, la maille brute pour la simulation.
- **La position d'une pointe macro n'est pas dans son axe.** Le macro n'y
  mémorise un point que tous les 6 µm ; la pointe est quelque part entre les
  deux. En reconstruisant l'hyphe micro sur les seuls points mémorisés, son
  apex naissait jusqu'à 6 µm **derrière** la vraie pointe — 1,4 µm mesurés — et
  le premier tronçon rendu au macro faisait un saut du même ordre. L'axe
  s'interrompait, ce qui est exactement ce que le pont doit rendre impossible.
- **Deux horloges parallèles finissent par se désynchroniser.** Le fondu avait
  son compteur d'images et le préchauffage son compteur de pas ; à la fin l'un
  attendait l'autre et lâchait tout le reste en une image. `tr` est maintenant
  *dérivé* du préchauffage — `1 − pasRestants/pasTotal` — et le problème ne
  peut plus exister.
- **Un halo dessiné tronçon par tronçon recouvre le tronçon suivant.** C'est
  un quadrilatère opaque, élargi de part et d'autre : dessiné dans la foulée
  de son propre tronçon, il posait une couture claire en travers du tube tous
  les six micromètres. Le halo est une **passe à part**, sur toute la
  géométrie, avant les corps.
- **Ce qui est dans un sac ne peut pas être dessiné au premier plan.** Le
  remplissage du sporocyste, posé sur le calque que sa profondeur donnait,
  recouvrait la columelle — la pièce la plus reconnaissable d'un sporocyste.
  Il va sur un calque **arrière imposé** : derrière la face avant du sac,
  devant sa face arrière.
- **La silhouette d'une sphère cisaillée par une projection oblique est une
  ellipse**, pas un cercle : demi-axe vertical × √(1+KZ²). Tracée en cercle,
  les spores du fond et du devant débordaient de la paroi.
- **`COMPOSITE_ORDER` vaut `[3,2,1,0,4,5,6,7]` : les calques 4 à 7 sont
  composés EN DERNIER, donc par-dessus.** La convention de `layerFor` est donc
  « zRel positif = plus **loin** ». Dans une scène qui a une vraie troisième
  dimension, le signe compte : avec l'inverse, tout ce qui était proche passait
  derrière, et les rhizoïdes — qui plongent — se dessinaient par-dessus le
  stolon.
- **Un halo ne peut pas être sur un calque plus flou que ce qu'il entoure.**
  Il change alors de rang dans l'ordre de composition et repasse devant la
  bande voisine : un liseré blanc en travers du tube à chaque changement de
  profondeur. Il va sur le **même** calque que sa bande, dessiné juste avant.
  Et sa largeur suit celle du tube : à largeur fixe, les derniers points d'une
  ogive se recouvraient en une lentille blanche posée sur le sommet.
- **Un corps compact ne se découpe pas en bandes de profondeur.** La columelle
  fait cinquante micromètres : bandée, elle sortait coupée net à la hauteur
  d'un changement de calque. Et au pas fin — un demi-pixel de long pour
  quarante de large — chaque jointure de quadrilatère laissait une couture, si
  bien qu'elle sortait striée comme un volet. **Un polygone par bande**, et la
  columelle en une seule.
- Définir une pièce par sa **largeur** plutôt que par son **matériau** la fait
  disparaître là où elle s'affine : `partCol` comparée à la largeur du tube nu
  tombait à zéro sur toute l'ogive apicale de la columelle, et le sommet du
  dôme se dessinait en couleur de cytoplasme — invisible.
- **Un axe qui pointe vers l'observateur se voit en bout.** À 0,16 d'image pour
  1 de z, la columelle — corps de révolution autour de cet axe — sortait en
  lentille plate de 80 px de large pour 15 de haut. À 0,55, l'axe fait ~55° avec
  la ligne de visée : le dôme est un dôme, et la montée en z reste entière.
  **Le flou dit qu'on s'élève, pas la pente.**
- **Un `sed` qui ne trouve pas son motif ne dit rien.** Deux remplacements
  successifs de `Q_FUSION` ont échoué en silence et j'ai documenté une valeur
  que le fichier n'avait pas. Seul le banc l'a vu (22,8 µm/min au lieu de 20).
  Vérifier le fichier après chaque substitution, ou passer par Python avec un
  `assert`.
- **Une extrémité définie par une interpolation de largeur est coupée net.**
  L'apophyse était écrite en tronc de cône — `lerp(a, R_TIGE, q/La)` — et se
  terminait donc à q = 0 sur une **coupe franche de vingt micromètres**, avec
  le liseré de paroi en travers. Tant que la columelle la coiffait, on ne
  voyait rien ; dès que l'ordre des phases a été corrigé et que le renflement
  s'est retrouvé seul, on a lu un gobelet posé dans le ballon. **C'est la
  règle 1 une troisième fois.** Une extrémité se ferme : ogive, comme tout le
  reste.
- **Un piège réparé revient quand l'anatomie change.** Le corps compact était
  détecté par `rCol > 0.3` ; l'ordre corrigé laisse vingt secondes de
  renflement sans columelle, et le dôme s'est remis à sortir coupé net entre
  deux calques, avec son halo flottant au-dessus. Le critère appartient à la
  **simulation** (`Sporange.qCompact`), pas au rendu : un corps compact est
  compact, qu'il s'appelle apophyse ou columelle.
- **Espacer des objets le long d'un axe ne les espace pas sur un contour
  décalé.** Les vacuoles de la cavité étaient placées tous les 4 µm d'axe puis
  poussées de dix-sept micromètres vers l'extérieur : sur une courbe convexe,
  un décalage `e` multiplie la longueur d'arc par `(1 + e·κ)`. Serrées au
  sommet du dôme, séparées d'un demi-diamètre sur les flancs, elles ne
  coalesçaient jamais là où c'est le plus visible. **On marche sur le contour
  décalé**, pas sur l'axe.
- **Un test d'écart entre deux profils s'annule là où les deux valent zéro.**
  La couronne devait s'arrêter là où le contour de la columelle rejoint celui
  de l'apophyse ; au sommet les deux valent 0, l'écart aussi, et la boucle
  sortait à son premier point — il ne restait de la cavité qu'un trait. Le
  test ne vaut qu'**après** le dôme.
- **Un seuil de détail fondé sur la taille seule bascule tout un nuage d'un
  coup.** Pendant les deux secondes où la caméra passe de l'échelle du sac à
  celle de la spore, cinq cents spores franchissaient les onze pixels
  ensemble : le tas entier devenait granuleux et cerclé de halos. Le détail
  est ce que **la mise au point désigne**, pas ce qui est assez gros.
- **Une amorce qui bombe vers l'extérieur ressort d'un corps qui se referme.**
  Celle de la ramification est une quadratique qui s'écarte du tube : sur une
  mère **tubulaire** elle s'enfonce dans un cylindre qui continue derrière, et
  tout va bien. Plantée dans une spore, son point de départ se retrouvait à
  5,1 µm du centre d'un corps qui en fait 6,6, et le fond du bourgeon — rond,
  donc large — ressortait par le flanc : deux pointes latérales sur la spore et
  deux traits de membrane en travers, **à 90° du tube**. Une cubique qui tourne
  *dans* le corps donne le même arc (6,5 µm, de quoi loger un Spitzenkörper)
  sans jamais dépasser 52 % du rayon.
- **Le rayon du congé n'a de sens que rapporté aux corps qu'il raccorde.**
  2,5 µm est la valeur mesurée pour deux tubes de 5,5 µm de rayon. Sur une
  spore de 6,6 percée d'un tube de 2, les deux évasements se rejoignaient par
  les flancs et le corps sortait **en citron**, avec un angle net à neuf
  heures. Et un congé **ponte tout écart inférieur à deux fois son rayon** :
  c'est cette inégalité — pas l'œil — qui dit combien de jeu il faut laisser
  entre un bourgeon et la paroi qui l'entoure.
- **Une branche n'a pas de membrane au-delà de son propre matériau.** Le tracé
  était prolongé jusqu'à `S_VU` pour tout le monde ; au-delà du fond du
  bourgeon, `atS` extrapole l'axe **en ligne droite** et la ligne suivait cette
  droite imaginaire. Sur une branche ordinaire ça ne se voyait pas — la droite
  reste dans le cytoplasme de la mère, où `cache` la masque.
- **Des vésicules qui convergent vers un point unique s'empilent sur un
  pixel.** Quarante-quatre par site, toutes visant le même angle : à l'écran on
  lisait trois vésicules et pas un Spitzenkörper. Chacune a sa place dans le
  nuage, tirée une fois pour toutes — 0,30 rad d'écart type, soit deux
  micromètres, ce qui est la taille d'un Spitzenkörper.
- **Cadrer sur la taille courante d'un corps qui gonfle annule le
  gonflement** : la spore garde la même taille à l'écran pendant qu'elle
  double. Le grossissement est plafonné à ce qu'il vaut à l'état gonflé, et il
  ne fait ensuite que descendre.
- **Un fondu ne rattrape pas une direction.** Il couvre un changement
  d'objectif, pas un changement d'objet. Le sporocyste du cycle repartait tout
  droit pendant que la branche dont il sortait montait de biais : au sortir du
  flou on lisait deux tiges différentes. Le cap est donc **demandé à l'écran**
  et non déduit d'une dérive latérale — et il faut alors compenser le
  cisaillement de la projection oblique, `+ KZ` par micromètre de z, sans quoi
  la tige part 18° plus haut que demandé. `KZ` vit pour cette raison dans la
  **simulation**, pas dans le rendu.
- **Une contrainte impossible en bas se résout en haut.** Le cap d'une branche
  vaut `thMère ± 46–88°`, celui d'un sporangiophore ne s'écarte pas de la
  verticale de plus de 40° : pour une mère qui descend, aucun couple
  (côté, angle) ne convient, et on attendait indéfiniment qu'elle tourne.
  Vue de la colonie, il y a trois cents pointes et il s'en trouve toujours une
  dont le flanc regarde vers le haut. **Le choix de la pointe et le raccord de
  direction sont le même problème.**
- **La corde d'un bourgeon n'est pas son cap.** Il naît 3,6 µm sous la paroi,
  donc décalé sur le côté : le vecteur qui va de l'axe maternel à sa pointe
  s'écarte de son cap de 4,6° à dix-sept micromètres. En faisant partir la tige
  de l'axe, elle repartait dans la bonne direction mais sa pointe sautait d'un
  micromètre et demi — **et c'est la pointe qu'on regarde**. On recule
  l'origine le long du cap.
- **Un corps repris en cours de route doit aussi reprendre son horloge.** Le
  sporangiophore du cycle démarre à la hauteur de la branche (`z0`), mais
  `monter` est monotone : rangé au début de la phase, il restait immobile
  jusqu'à six secondes, le temps que la rampe le rattrape — pile après le
  fondu, c'est-à-dire à l'endroit du cycle où l'on regarde le plus
  attentivement. On inverse la loi de la phase pour entrer au bon instant.
- **Un état de scène lu sur l'objet pendant un fondu est déjà celui d'après.**
  `this.etape` bascule au sommet du flou alors qu'on dessine encore la scène
  précédente : la caméra cadrait la scène d'arrivée sur l'image de départ.
  L'étape se **passe en argument**.
- **Un pool qui se relaxe vite est un pool global, et alors la topologie ne
  veut rien dire.** Le transport était écrit en passes de relaxation par
  seconde ; la diffusivité effective valait 9 500 µm²/s, soit sept minutes
  pour égaliser une colonie de deux millimètres. La réserve allait de 47 à
  102 par nœud du centre au front — un facteur deux —, le commentaire du
  fichier sur le cul-de-sac était un vœu, et **la politique active perdait
  contre la passive**. Un modèle de flux doit se dire en µm²/s, pas en passes.
- **Un puits qui tient son nœud à zéro le tue.** Le sporangiophore pompait
  14 u/s sur un nœud qui en absorbe 0,5 : la dette d'entretien montait par
  construction et au bout de 260 s le nœud s'autolysait en emportant son
  sporocyste — cinq à dix-huit avortements par partie, **pas une seule spore
  sur quarante-huit parties**. La dette dit qu'un tronçon n'est plus nourri ;
  elle ne dit rien quand c'est lui qui nourrit.
- **Un seuil posé sur la moyenne d'une grandeur plate trie au hasard.** Le
  seuil de départ d'un sporangiophore était à 140 et la réserve moyenne par
  nœud à 137 : 178 refus sur 178 essais dans une partie, score nul, et rien
  dans la sortie pour le dire. Ce n'est pas une contrainte, c'est du bruit.
- **Le geste du joueur doit être le geste de la colonie.** La branche forcée
  partait de la pointe elle-même, alors que la règle de Trinci sème 9 à 20 µm
  en arrière : la fille naissait dans la cellule que sa mère venait de
  remplir, y lisait une densité saturée et mourait de faim à la seconde
  suivante. Treize famines contre cinq, et cinquante-sept branches posées
  pour rien.
- **Demander un choix sans montrer sur quoi il porte.** Le sporangiophore
  naît six nœuds derrière la pointe ; la vue ne donnait que la pointe. Le
  joueur choisissait « la pointe la plus loin du front » et posait son
  sporocyste sur une jeune branche, près de l'origine : les deux sporocystes
  d'une partie mouraient à 70 % et 93 %, `x = front` à l'unité près.
- **Une politique de banc qui tire à `Math.random` ne mesure rien.** Deux
  mesures de la MÊME politique sur les mêmes graines donnaient 1,50 et 1,88
  spores, et on ne pouvait plus distinguer un réglage d'un coup de dés.
- **Huit graines ne suffisent pas à trancher un écart de 10 %.** Le verdict
  « tenir a un coût » passait à 2,75 contre 2,50 sur huit graines ; à vingt,
  la politique collée gagnait, 2,60 contre 2,55. Un verdict qui bascule sur
  une graine n'est pas un verdict — il faut regarder le compte graine par
  graine, pas seulement la moyenne.
- **Un stress sans borne n'est pas un stress, c'est une fin.** Les zones
  hostiles grossissaient à 0,35 µm/s sans rayon final : 3,8 mm après trois
  heures, cinq disques couvrent le plateau, et toutes les politiques tombaient
  de 2,55 à 1,05 d'un coup. Une croûte de sel est une tache, pas une fatalité.
- **`line` repose toujours son sommet commun, et un liseré translucide s'y
  accumule.** Elle pose `n+1` points, extrémités comprises, avec n ≥ 1 : un
  segment plus court qu'un pixel en pose deux fois le même. Mesuré sur le
  fût du sporangiophore, dont l'axe est échantillonné plus fin que le
  pixel : **1 158 appels pour 578 pixels, dont 197 posés une fois, 247 deux
  fois et 134 trois fois ou plus.** D'où `Screen.trait`, une polyligne
  ouverte qui ne pose jamais deux fois le même pixel.
- **Un contour et son remplissage doivent rastériser avec la MÊME règle.**
  `remplir` couvre `[round(xa), round(xb)]` ; `plot` tronque. Un liseré
  tronqué tombait jusqu'à un pixel **en dedans** de la dernière colonne
  remplie, et cette colonne-là, pleine de cytoplasme, restait à l'air
  libre : une encoche sombre d'un pixel, répétée à chaque frontière de
  calque — l'escalier qu'on voyait descendre le long du fût.
- **Deux bandes voisines se recouvrent d'un point, elles ne se touchent
  pas.** Le remplissage est opaque : un recouvrement d'un pixel ne se voit
  pas, un trou si. Le halo, lui, ne déborde pas — il est translucide et se
  cumulerait.
- **Un flou de boîte ne conserve pas le pic d'un TRAIT, et `BLUR_GAIN` est
  calibré pour des aires.** Le rapport de pic vaut 1 / 0,60 / 0,56 / 0,47 du
  plus net au plus flou : un liseré tiré à pleine force ressortait entier
  sur la bande au point et invisible sur les voisines — 246 de luminance
  puis rien vingt pixels plus bas, soit un trait vertical clair bordé de
  deux coutures, exactement aux frontières de calques. Ce n'est pas la bande
  floue qu'il faut éteindre, c'est **la bande nette qu'il faut retenir** :
  0,62 au point, 1 dès qu'on est franchement flou, et **continu**, parce que
  les bandes partagent leurs extrémités.
- **La normale d'une section se calcule sur l'axe entier, pas par bande.**
  Aux extrémités d'une bande il n'y a pas de voisin et le code retombait sur
  une différence d'un seul côté : le dernier point d'une bande et le premier
  de la suivante sont le MÊME point de l'axe et recevaient pourtant deux
  normales différentes.
- **Un calque dessiné après `composite` n'existe pas.** `VueThalle.dessiner`
  aplatit ses calques de profondeur avant de rendre la main : tout ce qui
  est posé ensuite sur un `layer` n'est jamais composité. Le premier calque
  substrat était rigoureusement invisible, et rien ne le disait.
- **Les couleurs d'un calque ne sont pas celles de l'organisme.** Tirées de
  la palette, elles étaient pâles sur un fond pâle : ambre, bleu froid,
  rouge éteint — un filtre a sa teinte à lui, et celles-là se lisent sur les
  trois optiques.
- **Le damier, une deuxième fois.** La grille de nutriment lue telle quelle
  au rendu redonnait des carrés francs de soixante micromètres là où la
  colonie avait mangé. Interpolation bilinéaire **au rendu**, maille brute
  pour la simulation — c'est exactement ce que la densité du thalle avait
  déjà coûté.
- **Le rendu ne peuple pas le modèle.** `reste` mémorise la cellule qu'on
  lui demande ; un calque en échantillonne dix mille par image, dont la
  colonie n'a jamais approché aucune. D'où `resteVu`, qui lit sans écrire.
- **Une vue ne se déduit pas d'un mode.** `Jeu.vue()` rend la carte ou une
  pointe selon qu'une pointe est TENUE — et elle l'est dès le début de la
  descente, bien avant que le mode ne bascule au sommet du flou. Déduit du
  mode, le panneau lisait `tetes` sur une vue qui n'en avait pas, pendant
  tout le fondu.
- **Une capture prise N millisecondes après un changement de phase ne montre
  pas ce qu'on croit.** L'éclatement dure 1,6 s simulée, soit 0,4 s réelle à
  ×4 : la capture arrivait régulièrement quatre images après le basculement en
  envol, donc pendant que la caméra plongeait déjà sur la spore suivie — et on
  en tirait des conclusions sur le cadrage de l'éclatement. **On fige la
  simulation avant de déclencher.**
