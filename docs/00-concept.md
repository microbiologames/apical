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

### 3. Des contraintes sans agentivité ne sont que du terrain

Une contrainte statique se mémorise et cesse d'exister. Trois étages ont donc été
posés :

- **des champs continus** (aw, température, sucre, antifongique) qu'on
  **traverse** et qui se lisent **dans le fond**, avant d'y entrer ;
- **des fronts mycéliens concurrents**, qui ne sont pas des mobs : ils prennent
  de l'**espace**, et l'espace ne revient pas. Ils créent une course, pas un
  combat ;
- **des événements aigus** : une plume de fongicide, un front de dessiccation,
  un silo qui s'échauffe.

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
| **Poussée** | `W` | accumulation d'osmolytes : le plafond de turgor monte, et **ça brûle du sucre** (le glycérol est du carbone) |
| **Consolider** | `S` | on ferme l'apex : le seuil de fluage monte, la paroi épaissit, l'absorption augmente |
| **Ramifier** | `Espace` | un nouvel apex à 62–88° derrière soi : le seul virage sans rayon de braquage, et une vie de secours |
| **Sporuler** | `Entrée` | encaisser et arrêter |

Cinq verbes, dont deux sur un même axe analogique. C'est jouable au pouce.

---

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
| **Lyse apicale** | paroi sous le seuil critique, le turgor l'emporte | on allait trop vite pour son flux |
| **Carence puis lyse** | plus de sucre, donc plus de flux, donc plus de paroi | on a choisi le mauvais itinéraire |
| **Plasmolyse** | l'aw est passée sous la limite du génotype | il fallait de l'osmotolérance, ou contourner |
| **Apex fusionné** | anastomose, dernier apex | on ne regardait pas son propre thalle |
| **Apex détruit** | écrasement sur un obstacle net, ou interférence hyphale | on n'a pas vu ce qui était dans son plan |
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
