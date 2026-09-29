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
| `npm run banc` | 15 verdicts de mesure, sans rendu, en node |
| `npm run banc:son` | 10 verdicts sur le moteur sonore, en temps réel dans Chromium |
| `npm run visuel` | captures dans `/tmp/apical-shots` (Playwright) |
| `npm run visuel:branche` | captures de la page ramification |
| `npm run visuel:thalle` | captures de la page colonie |
| `npm run visuel:monde` | captures du pont entre les deux échelles |

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

## Les neuf règles de fond

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

### 9. Le Spitzenkörper n'est jamais dessiné

C'est une densité, pas un objet : un puits de rétention à ~2 µm de la pointe,
et le nuage apparaît tout seul. Le dessiner net était la mauvaise réponse
(« le fait de représenter si net le spitzenkorper n'est peut-être pas la bonne
solution »).

### 10. Le son obéit aux mêmes grandeurs que l'image

`src/audio/son.js`, `src/data/son-presets.js`, `studio.html`. Ambient / liquid
drum and bass, **entièrement synthétisé** : pas un octet d'échantillon dans le
dépôt, pour la raison qui fait qu'il n'y a pas de build — on doit pouvoir
changer une sonorité en changeant un chiffre.

Même partage que la palette, et pour le même motif. Le moteur ne connaît
**aucune ambiance** : il pose toujours **six voix** — drone, nappe, cloche,
basse, break, texture — et c'est la table de données qui décide de ce qu'on
entend. Ajouter une ambiance, c'est ajouter une entrée, rien d'autre.

**Quatre grandeurs de contexte, et pas une cinquième** : `echelle`,
`croissance`, `densite`, `miseAuPoint`. Ce sont celles que la simulation sait
déjà produire, et `miseAuPoint` est *littéralement* le flou du pont. Un moteur
qui accepte douze signaux finit par être piloté au hasard.

**Le break n'existe pas en bas.** À l'échelle où une exocytose dure 0,85 s et
où l'apex avance de 194 nm par fusion, une mesure ne veut rien dire : la
batterie monte avec `echelle` entre 0,25 et 0,7 — exactement la plage où le
fondu du pont travaille — et il ne reste, en bas, que le drone, les gouttes et
le souffle. C'est le seul endroit où le son dit la même chose que le rendu :
on change d'objectif, pas de sujet.

**Le code** (`AP1-…`, 120 caractères) porte l'ambiance, les seize réglages
généraux, les six racks **et la graine**. Un code qui ne porterait que le
preset rendrait un autre morceau chez celui qui le charge.

`studio.html` est le banc où l'on choisit. Trois choses y sont vraies : on
n'écoute jamais à l'arrêt (les quatre grandeurs sont là, et un bouton rejoue
le pont), ce qui s'écarte de l'adopté est marqué, et le code est affiché en
permanence.

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

Et pour le son (`npm run banc:son`, 10/10) :

| | mesuré | référence |
|---|---|---|
| niveau des six ambiances | −20,4 à −14,8 dB RMS | — |
| crête la plus haute | 0,669 | < 1 |
| résonances immobiles sous transposition | 0 sur 6 ambiances | 0 |
| les six voix coupées, souffle coupé | −120,0 dB | silence |
| niveau du break selon l'échelle | 0,000 / 0,345 / 0,592 | 0 en bas |
| queue de réverbe à −60 dB | 5,75 s pour 6,2 s demandées | — |
| coût de `majCouches` | 0,011 ms par appel | 16,7 ms disponibles |
| sources vivantes au pic | 146 | — |
| longueur du code, aller-retour | 120 caractères, 6/6 exacts | 0 écart |

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
- **Une courbe de saturation normalisée amplifie le silence.** `tanh(k·x) /
  tanh(k)` a une pente de *k* à l'origine : elle ne colle pas les crêtes, elle
  multiplie tout ce qui est faible. Mesuré : les six voix coupées, il restait
  le souffle de l'optique à **−27,7 dB au lieu de −50**, parce que la chaleur
  à 0,5 le multipliait par 5,5. On plie au-dessus d'un seuil et on ne touche à
  rien en dessous — à chaleur nulle, la courbe est l'identité exacte.
- **Une raie n'est pas un défaut : une note tenue EST une raie.** Mesuré voix
  par voix : une nappe seule donne ×24, une cloche ×82. Le détecteur repris
  tel quel signalait donc la musique. Ce qu'on cherche est une **résonance**,
  c'est-à-dire une raie *immobile* : le banc transpose d'un triton et regarde
  si le pic suit, la page garde seize secondes de relevés — onze mesures à
  174 BPM, donc deux tours de progression — et signale ce qui n'a pas bougé.
- **La boucle de retard de Web Audio ne descend pas sous 128 échantillons.**
  Un Karplus-Strong câblé en `DelayNode` plafonne donc à 375 Hz à 48 kHz : tout
  ce qui est au-dessus du fa dièse 4 sonne faux, sans erreur ni avertissement.
  La corde est calculée hors ligne dans un `AudioBuffer`, et mise en cache.
- **Un `sed` qui ne trouve pas son motif ne dit rien.** Deux remplacements
  successifs de `Q_FUSION` ont échoué en silence et j'ai documenté une valeur
  que le fichier n'avait pas. Seul le banc l'a vu (22,8 µm/min au lieu de 20).
  Vérifier le fichier après chaque substitution, ou passer par Python avec un
  `assert`.
