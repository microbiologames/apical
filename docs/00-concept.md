# Apical — concept

## Pitch

Vous êtes l'**extrémité d'une hyphe fongique** observée au microscope. Vous
poussez vers le haut de l'écran, vous ne revenez jamais en arrière, et vous
n'avez aucun moteur : vous avancez parce que vous êtes un **tube sous pression
dont la paroi cède à son extrémité**. Vous pilotez le **Spitzenkörper**, l'apex
suit. Vous traversez des denrées réelles, vous exprimez des gènes, et vous
décidez quand **sporuler** pour encaisser la manche.

Roguelite de progression, vue de dessus, manche de six à dix minutes.

---

## L'idée de départ, et les huit endroits où elle avait besoin d'être poussée

L'idée initiale était juste : hyphe, progression vers le haut, deux ressources,
expression génique, contraintes de matrice plutôt que des mobs, ramification
pour tourner, contact avec soi-même = perdu. Ce qui suit dit ce qui a été
**gardé, retourné ou remplacé**, et pourquoi. C'est le document à contredire
quand on n'est pas d'accord.

### 1. « Plus d'eau = plus vite » manquait son contrepoids

Une statistique de vitesse qui ne fait que monter donne un jeu dont l'optimum
est d'empiler de l'eau. Le contrepoids est venu de la physiologie :
`e = J / v`, l'épaisseur de paroi est le matériau divisé par la longueur
produite. **Aller vite amincit la paroi, et une paroi trop mince sous 1 MPa
éclate.**

Donc : l'eau pousse, **le sucre retient**. Les deux ressources ne sont pas deux
barres parallèles, elles sont les deux côtés d'une même équation. Et
remarquable : `e × v = J`, donc au-delà de 16 µm/s **la vitesse ne coûte pas de
sucre — elle consomme de la marge de sécurité**. Aucune amélioration ne peut
lever cet arbitrage, seulement le déplacer. C'est ce qui garantit qu'une partie
très avancée reste tendue.

### 2. « Se toucher soi-même = perdu » était trop binaire

Gardé comme sanction, remplacé comme règle. Le contact entre deux hyphes du même
thalle est une **anastomose**, et une anastomose **termine la croissance de
l'apex qui fusionne**. Ce n'est donc pas « perdu », c'est « cet apex est fini ».
Perdu n'arrive que s'il n'en restait qu'un.

Trois raisons, et elles sont toutes de conception :

- **la ramification devient un système de vies.** Le verbe le plus intéressant
  du jeu gagne l'enjeu qui lui manquait ;
- **la mort reste compréhensible.** On voit la fusion, on voit l'apex s'éteindre.
  On n'a pas « perdu sans savoir pourquoi » ;
- **la fin de manche devient graduelle.** Un thalle dense meurt apex par apex, ce
  qui laisse le temps de décider de sporuler. Une mort instantanée aurait retiré
  au joueur la décision qui est le cœur du jeu.

Et l'avertissement est lui aussi réel : les hyphes d'un même thalle
**s'évitent activement** (autotropisme négatif). Un liseré s'allume à 8 px sans
aucun gène, et un gène achète la distance à laquelle on le reçoit.

### 2 bis. La vitesse devait être un réglage, pas un réflexe

La question posée était : la croissance ne devrait-elle pas être **manuelle**,
pour que le joueur gère sa vitesse et comprenne que ralentir économise la
matière ?

Réponse retenue : **cinq crans de régime, et le réglage reste.** Un bouton à
maintenir donne bien ce contrôle, mais il le fait payer par le doigt — sur une
manche de huit minutes on tient la touche 95 % du temps, donc l'appui cesse
d'être une décision et redevient un état par défaut, avec de la fatigue en plus.
Un cran qui reste donne le même arbitrage en faisant de chaque changement
d'allure un **geste volontaire**.

| Cran | Ce qui se passe |
|---|---|
| **0 ARRÊT** | le seuil de fluage passe au-dessus du turgor : l'hyphe **s'arrête vraiment**. On regarde devant, le turgor remonte, le sucre rentre, le cytoplasme continue de couler |
| **1 LENT** | ≈ 11 µm/s, la sortie de spore |
| **2 CROISIÈRE** | ≈ 19 µm/s |
| **3 POUSSÉE** | accumulation d'osmolytes, brûle du sucre |
| **4 FORÇAGE** | le seul régime où forcer en disette peut faire éclater l'apex |

### 2 ter. Le départ manquait : on germe

Une spore ne démarre pas à pleine vitesse. Elle **s'imbibe et gonfle** (les
2,3 premières secondes ne produisent rien), un **tube germinatif** émerge, puis
l'extension devient linéaire. La spore reste ensuite à l'origine du monde,
visible derrière soi. Les cinq premières secondes ne demandent rien d'autre que
de regarder — le meilleur moment pour apprendre à lire un champ.

### 2 quater. On pilote le point de fusion des vésicules

**Troisième et dernière version du pilotage.** Le joueur ne barre plus : il
**place la zone où les vésicules fusionnent** sur la calotte, de −1 (bord
gauche) à +1 (bord droit). La surface avance là où elles arrivent, donc le cap
suit.

C'est tout le modèle du centre d'approvisionnement, et c'est aussi ce qu'on
observe : une réorientation de croissance est **précédée** du déplacement du
Spitzenkörper vers le côté du nouveau cap.

Deux conséquences, et aucune des deux n'a été inventée pour le jeu :

**On ne peut pas tourner sans déposer de matière.** La rotation est
proportionnelle à la *longueur produite*, pas au temps. Au régime 0 l'hyphe est
immobile : elle ne tourne pas non plus. Barrer coûte donc de la croissance, et
l'on ne peut plus se repositionner gratuitement juste avant un obstacle.

**Tourner amincit la paroi du côté extérieur.** L'extérieur d'un virage parcourt
un arc plus long avec moins de matériau, puisque les vésicules fusionnent du
côté intérieur. Le virage entre ainsi dans le même arbitrage que la vitesse, et
pour la même raison physique. −30 % à dépôt maximal.

Rayon de braquage : **89 µm**, soit 6,4 diamètres de tube — mesuré au banc, pas
estimé (voir ci-dessous pourquoi cette précision compte).

> **Deux pilotages écartés avant celui-ci.** Barrer le Spitzenkörper avec l'apex
> qui suit : deux commandes en cascade, un pilotage qu'on ne sentait pas, et un
> SPK dessiné net qui se donnait pour une poignée. Agir sur la vitesse angulaire
> du cap avec de l'inertie : ça se pilotait bien, mais le Spitzenkörper n'était
> plus qu'une décoration et tourner ne coûtait rien.

### 2 quater bis. (ancien) On pilote le cap, pas le Spitzenkörper

Première version : le joueur barrait le SPK, et l'apex suivait avec un retard.
Fidèle au modèle du centre d'approvisionnement en vésicules — et **refusé à
l'essai**. Deux raisons, toutes deux justes :

- **deux commandes en cascade** (barre → SPK → apex) donnent un pilotage qu'on
  ne sent pas ;
- **afficher le SPK comme un corps net** en faisait une poignée de commande qui
  n'en était pas une.

Maintenant : la barre agit sur la **vitesse angulaire** du cap, avec 0,34 s
d'inertie. On amorce un virage, il monte, il continue un peu quand on lâche.
C'est de la conduite, pas de la correction. Le SPK est **calculé** à partir du
taux de virage et dessiné en **croissant diffus** : il reste ce qu'il est
réellement — l'endroit vers lequel les vésicules convergent — et il indique
l'intention de virage sans être la commande.

> Et la barre était **inversée**. Avec un écran en y-haut, ajouter à l'angle
> depuis « l'avant » fait tourner à gauche : la touche de droite virait à
> gauche. `barre` est désormais en repère écran.

### 2 quinquies. Chaque vésicule porte un rôle

Au zoom de jeu, une vésicule fait cinq à huit pixels : on peut la **suivre du
fond du tube jusqu'à sa fusion**. Il fallait donc qu'elle veuille dire quelque
chose. Le trafic vésiculaire apical est réellement hétérogène, et ce qu'une
vésicule transporte décide de ce qu'elle fabrique :

| Vésicule | Ce qu'elle est | Ce qu'on voit à la fusion |
|---|---|---|
| **chitosome** | microvésicule polyédrique de 30–40 nm, chitine synthase | un court arc **dans la paroi** : elle s'épaissit sous les yeux |
| **macrovésicule** | apicale, 70–100 nm, la plus grosse | un jet vers l'avant : c'est elle qui allonge |
| **lipidique** | une bicouche, donc dessinée en anneau | un anneau qui s'étale : la membrane gagne de la surface |
| **enzyme** | hydrolase exportée | elle **sort** et s'éloigne : la seule qui ne construit rien |

La composition vient du **modèle**, pas du rendu : le flux de chitosomes suit
l'épaisseur déposée, celui des macrovésicules suit la vitesse. **Pousser fait
donc littéralement disparaître les chitosomes du tube.** L'arbitrage vitesse /
paroi se regarde au lieu de se lire sur une jauge — c'est l'aboutissement de la
règle « le champ porte l'information ».

### 2 sexies. La réserve de spore, et l'ouverture

Une conidie n'est pas vide : elle est bourrée de lipides et de tréhalose, et
elle **alimente son tube germinatif** bien avant que le milieu ne rapporte quoi
que ce soit. La réserve tient une vingtaine de secondes.

C'est l'horloge de l'ouverture : il faut avoir trouvé sa première plume avant
qu'elle ne s'épuise. Le HUD l'affiche tant qu'elle dure, et le message
« RÉSERVE ÉPUISÉE » marque le moment où la partie commence vraiment.

### 3. Des contraintes sans agentivité ne sont que du terrain

Une contrainte statique se mémorise et cesse d'exister. Trois étages ont donc été
posés :

- **des champs continus** (aw, température, sucre, antifongique) qu'on
  **traverse** et qui se lisent **dans le fond**, avant d'y entrer ;
- **des poches de sel**, qui creusent l'aw localement et **tirent l'eau hors de
  l'hyphe** par osmose — dangereuses même à turgor plein, puisque l'absorption,
  elle, sature quand P est haut. Les cristaux les annoncent, donc elles se
  contournent : c'est un choix de trajectoire, pas une pénalité de zone ;
- **des événements diffus** : une plume de fongicide, le dessèchement
  progressif, un silo qui s'échauffe.

> **Les fronts mycéliens concurrents ont été retirés** (décision de l'auteur,
> après essai). Ils se lisaient comme des mobs à trajectoire rectiligne, ce
> qu'ils n'étaient pas censés être, et ils encombraient un champ dont toute la
> difficulté doit venir du choix de trajectoire. Ne pas les remettre.

Et la règle qui rend six dangers apprenables sans tutoriel : **chaque contrainte
attaque un terme de l'équation, et un seul** — un azole n'est pas « des dégâts »,
c'est une chute de turgor sans que l'aw ait changé. Table complète dans
`01-croissance-apicale.md`.

### 4. Il manquait une extraction, donc un roguelite

« Faire l'hyphe la plus longue » est un score-attack : on joue jusqu'à la mort et
la mort annule tout. La **sporulation** est l'extraction : on la déclenche quand
on veut, elle encaisse **100 %** des spores et **termine la manche**. Mourir n'en
rend que 25 % (55 % avec la cascade *abaA/wetA*).

C'est ce qui transforme chaque seconde de la fin de manche en arbitrage :
continuer (le thalle grandit, donc la mise grandit) ou encaisser. Sans elle, il
n'y a pas de « encore une partie ».

### 5. La vitesse devait faire rater des choses — pas seulement tuer

L'intuition était bonne, il fallait la rendre mécanique. Deux natures de
nourriture :

- les **champs** ne se ramassent pas, ils se traversent : ce qu'on en tire dépend
  du **temps passé dedans**, donc **ralentir rapporte** ;
- les **objets discrets** (granules, gouttes, locus) demandent un **contact de
  l'apex**, et le rayon de braquage croît avec la vitesse : **aller vite les fait
  rater**.

Le compteur `RATE` affiche les granules définitivement laissés derrière — la
caméra n'y retourne pas. Ce n'est pas une punition, c'est le chiffre qui donne
envie de refaire la manche plus lentement.

### 5 bis. Un thalle n'est pas une hyphe : il se ramifie tout seul

La ramification n'est plus seulement un verbe : elle **arrive d'elle-même**,
tous les 110 µm de tube produits. C'est l'**unité de croissance hyphale** de
Trinci — le rapport longueur totale / nombre d'apex reste constant, et c'est ce
qui rend la croissance d'un mycélium exponentielle alors qu'aucun apex
n'accélère.

On voit donc l'hyphe sœur partir de son côté, et **elle continue sa route en
direct**, hors champ, sur son propre tropisme : fuir le thalle, puis remonter le
gradient de sucre. Le thalle final n'est pas une décoration, c'est le produit de
quatre trajectoires simultanées dont on n'en pilotait qu'une.

Un cran reste **toujours libre** sous le plafond, pour que le joueur garde un
emplacement quand il veut ramifier volontairement — sinon la ramification
spontanée lui confisquait son seul virage serré.

### 5 ter. La carte du thalle, à la fin

C'est le seul moment du jeu où la caméra a le droit de reculer, et c'est pour
cela qu'il compte : pendant toute la manche on ne voit qu'un apex dans une
fenêtre de cent micromètres, **sans jamais savoir à quoi ressemble ce qu'on
construit**. La carte est la récompense de cette cécité — le chemin parcouru,
les détours, les impasses, les fronts qu'on a laissés filer, et le réseau qu'ils
ont dessiné.

Elle est tracée depuis un relevé échantillonné tous les 4 µm et **jamais
purgé** ; la géométrie de jeu, elle, est oubliée derrière la caméra.

### 5 quater. La visibilité est une ressource que la vitesse consomme

La caméra est resserrée sur l'apex : à l'arrêt le champ montre 100 µm de large,
à pleine vitesse 138 µm — mais la **surface parcourue par seconde double**. Le
résultat se sent comme un rétrécissement : plus on va vite, moins on a le temps
de lire ce qui arrive.

Trois conséquences :

- **ralentir n'est plus seulement économique, c'est ce qui permet de voir** ;
- le rayon de braquage étant devenu large (57 µm à vitesse de croisière,
  129 µm à pleine vitesse — une hyphe ne fait pas d'épingle à cheveux), la
  caméra **vise devant**, dans la direction où pointe le Spitzenkörper, et
  d'autant plus loin qu'on va vite ;
- **voir plus loin devient une amélioration** : le récepteur GPR-4 recule la
  caméra, et le légendaire « Récepteurs de gradient » beaucoup plus.

Le cadrage a été **beaucoup resserré** après essai : 56 µm de champ à l'arrêt,
73 µm à pleine vitesse, et le tube occupe le quart de la largeur. On voit
arriver chaque vésicule. Conséquence assumée : **on ne navigue plus à vue**.

C'est la **perception chimiotropique** qui dit ce qu'il y a devant — un bandeau
de onze caps sondés bien au-delà du champ visible, vers le haut ce qu'il y a à
gagner, vers le bas ce qu'il y a à craindre. Ce n'est pas une carte : on ne voit
ni la forme ni la distance, seulement « ça sent bon par là ». Le choix de
trajectoire reste un pari, ce qui est le sujet.

Et c'est exactement ce qu'une hyphe fait : elle remonte un gradient qu'elle
**sent** bien au-delà de ce qu'un objectif montrerait, par des récepteurs
couplés aux protéines G.

### 6. La caméra et les apex multiples se contredisaient

La caméra suit **un** apex et n'avance jamais à reculons. Ramifier crée un
second front. Résolution : la **dominance passe à la branche** — c'est elle qu'on
vient de choisir, la caméra suit la décision. Le parent continue en
**autonome** : il reste une vie *et* une source de revenus, sur un tropisme
simple (fuir son propre thalle, puis monter le gradient de sucre).

La branche naît **14 px en arrière** (dominance apicale) et **sur la paroi
latérale** du tube. La caméra ne recule pas : elle attend sur place.

### 7. La courbe de difficulté devait venir du joueur

C'était la demande la plus exigeante : « progresser jusqu'à ce que le jeu
devienne difficile à jouer ». La réponse est dans le fait qu'un mycélium est
**un seul protoplaste** : un turgor, un stock de sucre, quel que soit le nombre
d'apex.

Chaque apex de plus augmente **les revenus** (il absorbe) **et la dépense** (il
consomme du volume et du matériau) **et l'exposition** (il ramasse la charge
d'antifongique) **et l'encombrement** (sa paroi est un mur de plus, pour
toujours).

**Le joueur devient puissant en devenant fragile, et l'obstacle final est son
propre thalle.** Rien n'est scripté : c'est la courbe de Snake, obtenue par la
physiologie.

### 8. Ce qui a été écarté

- **La mise au point comme commande.** Dans Cell Dungeon elle est une arme parce
  que le ciblage en dépend. Ici rien n'en dépendrait : ce serait une molette sans
  décision. **La profondeur de champ reste comme rendu** — c'est elle qui fait
  lire le champ comme un microscope — et le plan de netteté d'un obstacle dit
  maintenant s'il bloque ou non. Le flou est donc devenu une information de jeu
  exacte au lieu d'un effet.
- **Un verbe de septation.** La septation d'une hyphe est périodique et liée au
  cycle nucléaire, pas à une décision. Elle est automatique, tous les 44 px, et
  visible.
- **Des mobs.** Un front mycélien est plus menaçant qu'un monstre, et il est
  vrai.

---

## Les cinq verbes

| Verbe | Clavier | Ce que c'est vraiment |
|---|---|---|
| **Barrer** | `A` / `D` | on oriente le **Spitzenkörper**, l'apex suit avec 70 ms de retard |
| **Accélérer** | `W` | un **cran** de régime en plus. Le réglage reste |
| **Ralentir** | `S` | un cran en moins ; au cran 0 l'hyphe **s'arrête** |
| **Ramifier** | `Espace` | un nouvel apex à 62–88° derrière soi : le seul virage sans rayon de braquage, et une vie de secours |
| **Sporuler** | `Entrée` | encaisser et arrêter |

Cinq verbes, dont deux sur un même axe **cranté**. C'est jouable au pouce.

---

## La fin d'une manche, et pourquoi elle existe

Trois termes ajoutés après mesure, et ils tiennent ensemble :

1. **l'entretien suit la biomasse.** Un mycélium doit entretenir tout ce qu'il a
   construit. Sans ce terme, revenus et dépenses croissaient tous deux avec le
   nombre d'apex, donc grandir était neutre et rien ne poussait jamais à
   s'arrêter ;
2. **le substrat s'épuise localement.** Brouter sur place cesse de payer au bout
   de quelques secondes, et **la zone broutée se voit** — la trace de son propre
   passage devient une information ;
3. **un thalle affamé se mange.** L'autophagie est réelle et vitale chez les
   champignons filamenteux : le cytoplasme se retire des compartiments distaux
   et la matière remonte vers les apex. En jeu, la longueur du thalle — donc le
   score — **se met à descendre**. C'est un compte à rebours visible.

D'où la question que chaque fin de manche pose : **continuer ou encaisser ?**
Mesuré au banc sur les mêmes graines : **33 spores en sporulant à temps contre
15 en poussant jusqu'à la mort.**

Et c'est la biologie qui ferme la boucle : chez les champignons filamenteux,
c'est **la limitation en nutriments qui induit la conidiation**. Une moisissure
ne sporule pas quand tout va bien, elle sporule quand le substrat s'épuise.

## Le rythme d'une manche

La carte est **déficitaire par défaut** : la valeur médiane du champ de sucre est
sous le point mort, et seules les **plumes** sont bénéficiaires. Ce n'est pas un
réglage, c'est la décision d'équilibrage centrale, et le banc l'a imposée — avec
une carte bénéficiaire en moyenne, **aller tout droit sans rien faire était la
meilleure stratégie**.

Il en sort la boucle suivante, qui est aussi la stratégie de recherche de
nourriture d'un mycélium réel :

```
   traverser un vide           s'attarder dans une plume
   vite, droit, en brûlant     lentement, en consolidant,
   son stock                   en ramifiant dense
        \                             /
         --> et le choix de la plume suivante, lu dans le fond
```

Toutes les 620 µm de thalle cumulé, un **palier** propose trois gènes. Les
**locus** croisés en route en proposent un de plus, immédiatement.

---

## Les morts, et ce que chacune enseigne

| Mort | Mécanisme | Leçon |
|---|---|---|
| **Lyse apicale** | paroi sous le seuil critique, le turgor l'emporte. Rare : il faut **forcer en pleine disette** | la rétroaction de disette ferme l'apex, le joueur l'a rouverte |
| **Thalle autodigéré** | l'autophagie a consommé tout le thalle | il fallait sporuler il y a trente secondes |
| **Plasmolyse** | l'aw est passée sous la limite du génotype | il fallait de l'osmotolérance, ou contourner |
| **Apex fusionné** | anastomose, dernier apex | on ne regardait pas son propre thalle |
| **Apex détruit** | écrasement sur un obstacle **net** — les flous se traversent | on n'a pas vu ce qui était dans son plan |
| **Sporulation** | choisie | ce n'est pas une mort, c'est la victoire |

Six morts distinctes, chacune sur un terme différent, chacune avec son gène qui
la corrige. C'est ce qui donne envie de relancer : on ne rejoue pas pour aller
plus loin, on rejoue pour **corriger la panne précédente**.

---

## Le méta

Les spores encaissées s'accumulent en banque (`localStorage`). Direction prévue,
pas encore implémentée : elles achètent des **génotypes de départ** — non pas des
statistiques, mais des **gènes déjà exprimés à la germination**, ce qui change la
façon de jouer la première minute. Un génotype xérophile commence pauvre et
rapide ; un génotype mélanisé commence lent et blindé.

---

## Chantiers ouverts

- **Souches jouables.** Une seule pour l'instant. Les candidates sont réelles et
  se distinguent par une seule caractéristique, jamais par un paquet de stats :
  *Rhizopus* (hyphes larges, très rapide, peu de septa — donc une lyse qui coûte
  cher), *Aspergillus niger* (mélanisé d'office), *Xeromyces bisporus* (démarre
  à aw 0,61 et supporte mal l'eau libre), *Trichoderma* (mycoparasite d'entrée).
- **Le son.** Rien pour l'instant. La piste évidente est de faire entendre le
  **pulse calcique** : c'est déjà l'horloge du jeu.
- **Le bilan de fin de manche** mérite une carte du thalle, la trajectoire vue
  de loin. C'est le seul moment où l'on a le droit de reculer la caméra.
- **Substrats.** Quatre. Le cinquième candidat est la **croûte de fromage**
  (sel, lipides, protéines : il demande lipase et protéase, donc il rend
  indispensables deux familles d'hydrolases aujourd'hui décoratives).
