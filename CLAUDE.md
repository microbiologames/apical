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
| `npm run banc` | 11 verdicts de mesure, sans rendu, en node |
| `npm run visuel` | captures dans `/tmp/apical-shots` (Playwright) |

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

## Les sept règles de fond

### 1. L'hyphe est UN objet

L'échec du projet précédent tient en une phrase : la calotte apicale était une
forme dessinée à part, posée au bout du tube. Ici c'est structurellement
impossible.

- il n'existe qu'**un axe** (`Hyphe.ax/ay/al`), une polyligne prolongée par
  l'avant et **jamais retouchée derrière** — une paroi construite est rigide ;
- il n'existe qu'**une fonction de demi-largeur** `W(s)`, `s` étant l'abscisse
  curviligne depuis la pointe ;
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

### 7. Le Spitzenkörper n'est jamais dessiné

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
| budget logique | 0,19 ms/image | 16,7 ms disponibles |

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
- **Un `sed` qui ne trouve pas son motif ne dit rien.** Deux remplacements
  successifs de `Q_FUSION` ont échoué en silence et j'ai documenté une valeur
  que le fichier n'avait pas. Seul le banc l'a vu (22,8 µm/min au lieu de 20).
  Vérifier le fichier après chaque substitution, ou passer par Python avec un
  `assert`.
