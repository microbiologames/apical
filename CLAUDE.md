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
| `npm run banc` | 9 verdicts de mesure, sans rendu, en node |
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

## Les six règles de fond

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

### 4. Une vésicule n'a pas de couleur à elle

Sa membrane **est** de la membrane (`P.membrane`), son lumen **est** du
périplasme (`P.periplasme`) — il le devient à la seconde où le pore s'ouvre.
Il n'y a volontairement **pas d'entrée `vesicule`** dans la palette : deux
entrées séparées finiraient par diverger, et c'est précisément cette identité
qui rend la fusion lisible sans qu'on ait rien à expliquer. Le contenu déversé
est déjà de la couleur de l'espace où il se déverse.

La fusion (`Scene.fusions`, 0,85 s) suit le schéma de référence
`Apex_references/Mecanisms/Vesicule mecanisme.png`, en trois temps :

1. **contact** — les deux membranes se touchent. La vésicule décélère en
   approchant (`0,32 + 1,45·smoothstep` sur la distance restante) : à vitesse
   constante on voyait un choc, pas un contact.
2. **pore** — une ouverture naît au centre du contact et s'élargit. C'est
   `Screen.arcE` qui la dessine, en omettant un secteur angulaire du contour :
   un contour fermé ne peut pas montrer une membrane qui s'ouvre.
3. **oméga** — la vésicule se rabat dans la membrane plasmique, ouverte vers
   l'extérieur, et son lumen se confond avec le périplasme.

L'oméga bombe **vers le cytoplasme**, jamais vers l'extérieur : c'est son
ouverture qui donne sur le périplasme, pas son corps. Poussée dehors, elle se
dessinait par-dessus la paroi — un lumen pâle sur une paroi pâle, donc rien.

Ces événements sont dessinés **après** `paroi()`, dans `fusions()`. Dessinés
avant, la bande de périplasme et le trait de membrane leur passaient dessus :
ni le pore ni le matériau déversé n'étaient visibles.

### 5. La paroi neuve migre, et ça doit se voir

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

### 6. Le Spitzenkörper n'est jamais dessiné

C'est une densité, pas un objet : un puits de rétention à ~2 µm de la pointe,
et le nuage apparaît tout seul. Le dessiner net était la mauvaise réponse
(« le fait de représenter si net le spitzenkorper n'est peut-être pas la bonne
solution »).

---

## Chiffres mesurés (`npm run banc`)

| | mesuré | référence |
|---|---|---|
| croissance | 19,1 µm/min | 20 µm/min (*Neurospora*, Lew 2011) |
| exocytoses | 1,89 /s, une toutes les 0,53 s | — |
| extension par fusion | 157 nm | — |
| durée d'une fusion | 0,85 s | — |
| rayon de virage, consigne pleine | 82 µm | unité de croissance hyphale ~110 µm |
| inertie du cap (63 %) | 7,2 s | — |
| migration de la paroi neuve | pleine largeur en 17 s, 70 µm en 200 s | — |
| matériau déversé hors périplasme | 7,1 % | — |
| étanchéité | 0 vésicule hors du tube sur 4 × 30 s | — |
| budget logique | 0,18 ms/image | 16,7 ms disponibles |

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
- La **paroi ne grossit jamais avec le zoom** : 0,1 à 0,3 µm dans la réalité,
  donc une épaisseur écran bornée à [1,0 ; 2,6] px.
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
- **Un `sed` qui ne trouve pas son motif ne dit rien.** Deux remplacements
  successifs de `Q_FUSION` ont échoué en silence et j'ai documenté une valeur
  que le fichier n'avait pas. Seul le banc l'a vu (22,8 µm/min au lieu de 20).
  Vérifier le fichier après chaque substitution, ou passer par Python avec un
  `assert`.
