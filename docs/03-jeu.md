# Le jeu

> **D'où ça part.** `docs/02-thalle-et-jeu.md` avait posé l'esquisse : « gérer
> une stratégie de colonisation », la vue macro comme vue principale, la
> sporulation comme fin de phase, et le premier verdict à écrire —
> **« ne rien faire est puni »**. Ce document tranche le reste.
>
> La version contemplative (`cadre.html`, `cycle.html`) ne bouge pas. Le jeu
> est une page de plus, `jeu.html`, qui réutilise le même moteur.

---

## En une phrase

**Une lignée de moisissure traverse des plateaux. Sur chacun : germer,
coloniser, nourrir son réseau, et sporuler avant d'être prise.**

---

## Les douze arbitrages

| Question | Décision |
|---|---|
| Réussir un plateau | **Sporuler avant de mourir.** Le plateau est une course. |
| Ce que fait le joueur | **Il dépense une attention limitée** sur des pointes choisies. |
| Rôle de l'échelle micro | **Des actions impossibles d'en haut.** Il faut y descendre. |
| Adversité | **Le substrat qui s'épuise** + **des stress du milieu**. |
| Régime de temps | **Vitesse réglable, sans pause.** |
| Ressource | **Substrat local + réserve transportée dans le mycélium.** |
| Héritage | **Des traits hérités** — un génome qui dérive. |
| Échec | **Les deux selon la cause** : la famine dégrade, le choc tue. |
| Tenir une pointe | **Tenir = regarder.** Être descendu, c'est tenir. |
| Transport | **Un vrai flux dans le réseau.** |
| Stress | **Les deux** : un front lent annoncé, des chocs rares soudains. |
| Par quoi on commence | **Ce document, puis le verdict**, avant tout contenu. |

Et deux contraintes ajoutées après coup, qui valent autant que les douze :
**l'esthétique ne perd rien** — trois optiques, HUD qui s'efface, lecture par
calques (§ 9) — et **chaque plateau est une matrice alimentaire réelle**,
variée et regardable (§ 10).

Hypothèses que je prends faute d'avoir demandé, et qui se corrigent d'un mot :
navigateur, souris et clavier, zéro dépendance comme le reste ; un plateau dure
**deux à trois heures de colonie**, soit sept à douze minutes réelles aux
vitesses hautes ; une partie fait trois à cinq plateaux.

---

## 1. La rareté, c'est l'attention — et c'est tout le jeu

Le piège est connu et mesuré : sur le prototype précédent, **243 s en jouant
passivement contre 223 s en jouant activement**. L'optimum était de ne rien
faire. Une moisissure qui se débrouille bien toute seule pose exactement ce
risque, et le moteur actuel se débrouille très bien tout seul.

La parade tient en deux conditions, et les deux doivent être vraies :

1. **Une pointe tenue fait ce qu'une pointe libre ne fait pas.** Pas « plus
   vite » — un multiplicateur est plat et se contourne en tenant n'importe
   quoi. Des **actions**, qualitatives, listées au § 3.
2. **Tenir coûte.** Sans pause, descendre sur une pointe, c'est cesser de voir
   la colonie. Les stress se déclarent sur la carte macro ; descendu, on les
   rate. **L'alternance n'est pas un confort, c'est la contrainte.**

C'est pour ça que « tenir = regarder » : si l'attention s'assignait depuis la
carte, elle ne coûterait rien, et on retomberait dans le piège.

---

## 2. Les trois horloges

Elles tournent toutes les trois pendant qu'on regarde ailleurs. C'est ce qui
fait qu'on regarde ailleurs à regret.

1. **La colonie pousse.** Règle de Trinci, autotropisme négatif, anastomose —
   déjà codé, déjà mesuré (verdict 14).
2. **Le substrat s'épuise** là où elle est passée. Déjà codé : une hyphe
   consomme *derrière* elle, la densité sature à 150 et la colonie finit par
   s'étouffer. C'est la pression de fond, elle ne demande aucun contenu.
3. **Les stress arrivent.** Un front lent, des chocs rares. § 5.

---

## 3. Ce qu'on peut faire, et où

Règle de conception : **toute action doit être une chose que le moteur fait
déjà**. Sinon c'est du contenu à inventer, et le contenu attendra.

### D'en haut (macro) — de la stratégie, pas des gestes

- lire le substrat, la densité, la réserve du réseau, les fronts de stress ;
- marquer une zone comme objectif (les pointes libres s'y orientent mollement,
  avec l'inertie mesurée de 8,5 s — on suggère, on n'ordonne pas) ;
- lancer une sporulation **si** une pointe éligible existe ;
- changer la vitesse du temps.

### D'en bas (micro) — les cinq gestes qui n'existent qu'ici

| Geste | Ce qui le porte déjà | Pourquoi il n'est pas faisable d'en haut |
|---|---|---|
| **Orienter l'apex** | `phiCible`, inertie 8,5 s | On conduit une pointe au lieu de la suggérer. L'inertie est le coût : pas de coup de volant. |
| **Ramifier maintenant** | `brancherSur` | En autonomie, Trinci ramifie tous les 110 µm, où il veut. Tenue, on ramifie **ici**, à **cet** angle. |
| **Forcer un passage** | à coder (léger) | Une pointe dont la cellule est épuisée s'arrête. Tenue, on peut la pousser au travers, et ça se paie en réserve. |
| **Anastomoser exprès** | anastomose auto, `AGE_MIN_ANASTOMOSE` | Diriger une pointe sur une hyphe pour créer un **raccourci de transport**. Le geste logistique central. |
| **Monter un sporangiophore** | `viserSporangiophore`, `Sporange` | Il faut être descendu, et sur une pointe dont le flanc regarde le haut. Déjà exact au degré près. |

Chaque geste coûte de la **réserve locale** — pas une réserve globale — et un
**temps de présence** : on ne lance pas et on ne remonte pas aussitôt.

---

## 4. L'économie : substrat, absorption, réserve, flux

C'est le choix le plus ambitieux des douze, et le plus rentable : il donne du
sens à la **forme** du réseau, donc à l'anastomose, donc à la ramification.

**Substrat** — la grille existante (`matrice`, `MAILLE_DENS`, `DENS_SAT`).
Hétérogène, reproductible, se consomme. Rien à faire.

**Absorption** — une hyphe absorbe **sur toute sa longueur**, pas seulement à
la pointe. C'est vrai, et c'est ce qui rend une vieille hyphe utile : elle ne
pousse plus mais elle nourrit. Taux ∝ substrat local × longueur d'hyphe dans la
cellule.

**Réserve** — portée par le réseau, pas par un compteur global. Les nœuds sont
les points d'axe déjà mémorisés **tous les 6 µm** ; les arêtes, les segments.
Sur ce graphe : diffusion vers les puits que sont les pointes qui construisent.
Une pointe loin de toute source s'affame et s'arrête.

**Dépenses** — s'étendre (par µm construit), ramifier (forfait), résister à un
stress (dépense continue et locale), sporuler (gros forfait : c'est la course).

**Trois conséquences de design, toutes voulues :**

- l'**anastomose** cesse d'être un ornement : c'est un raccourci de transport ;
- l'**étalement** devient risqué — un front trop loin de ses sources meurt de
  faim, ce qui est exactement ce qui arrive aux vraies colonies ;
- **le calibre du tube** devient un arbitrage : large transporte mieux et coûte
  plus cher à construire. C'est un trait héritable (§ 6).

**Simplification assumée.** Diffusion explicite à pas fixe sur le graphe, pas
de résolution de réseau ; mise à jour à 2–5 Hz, sur le front et ses amonts
seulement. Ce n'est pas de l'hydraulique, c'est un gradient qui coule.

---

## 5. Les stress

Deux natures, deux réponses, et la même grille qu'ailleurs — rien de neuf dans
le rendu.

**Le front de dessèchement** — lent, **visible à l'avance**, vitesse connue. Il
traverse le plateau. Derrière lui, le substrat est mort et les hyphes fines
meurent. Réponses possibles, et elles s'excluent : rapatrier la réserve,
épaissir localement, traverser vite pour prendre de l'avance, ou sporuler tout
de suite et partir.

**La zone hostile** — locale, elle apparaît quelque part, elle **s'étend**, et
elle s'arrête : une croûte de sel, une goutte de saumure, une tache de
moisissure concurrente. Elle tue ce qu'elle couvre. C'est écrit
(`Jeu.menaces`) : quatre par plateau, 0,4 à 1,1 mm de rayon final, 0,35 µm/s —
deux fois plus lent qu'une pointe, donc on peut lui échapper, mais elle double
son rayon en six minutes.

**Et elle ne se lit que d'en haut.** Une hyphe ne voit pas à un millimètre :
`vue()` la donne dans la vue macro et pas dans la vue micro. C'est ce qui rend
l'alternance payante — imparfaitement, voir § 8.

C'est la traduction directe de « l'échec : les deux selon la cause ». On apprend
à craindre le lent, on subit le brutal.

---

## 6. L'héritage : un génome qui dérive

**Les traits sont déjà des constantes du moteur.** C'est ce qui rend cette
partie presque gratuite — et ce qui garantit qu'un trait hérité se *voit*.

| Trait | Constante | Arbitrage |
|---|---|---|
| vitesse de pointe | `V_MICRO` | étendue rapide contre coût par µm |
| unité de croissance | `UCH` | ramifier dense ou filer loin |
| rayon de virage | `R_VIRAGE` | manœuvrabilité contre ligne droite |
| calibre du tube | `Hyphe.R` | débit de transport contre coût |
| tolérance au sec | seuil de mort | survivre au front contre rendement |
| taille du sporocyste | `R_SAC`, `N_SPORES` | combien de spores emportées |
| réserve de la spore | `R_DORM` | germer vite contre germer riche |

**Le geste de fin est déjà dessiné.** À l'éclatement, `Sporange` choisit
aujourd'hui une spore au hasard et la caméra la suit. Dans le jeu, **le joueur
en choisit une parmi trois**, chacune avec son génome muté — et il la regarde
partir. Le plus beau moment du moteur devient le moment de décision du
roguelite. Il n'y a rien à inventer, juste à proposer trois candidates.

**C'est écrit** (`GENOME_BASE`, `muter`, `troisSpores`). Six traits, chacun
branché sur la constante qui le porte : `vitesse` → `V_MICRO`, `uch` → `UCH`,
`calibre` → la diffusivité de transport **et** le coût d'extension,
`tolerance` → la marge sur le front, `sac` → `MASSE_SPORE`, `reserve` → ce que
la spore apporte en arrivant.

Chaque candidate porte **une mutation dominante** en plus de la dérive de fond,
et les trois dominantes sont toujours différentes. Sans ça, trois tirages
gaussiens sur six traits se ressemblent tous et le choix n'en est pas un : on
veut pouvoir dire « celle-là est la rapide ».

**La réserve de la spore a dû être mesurée, pas choisie**, parce qu'elle change
l'*ouverture*, donc tout le reste — sur huit graines :

| réserve | passive | active | devant | collée | frontale |
|---|---|---|---|---|---|
| 0 | 1,13 | 2,13 | 3/8 | 2,63 | 0,50 |
| 120 | 1,75 | 2,13 | 3/8 | 3,00 | 1,00 |
| **220** | **0,88** | **2,38** | **6/8** | **1,88** | **0,25** |
| 330 | 1,50 | 1,63 | 4/8 | 2,00 | 0,38 |

À zéro et à 120, la colonie livrée à elle-même s'en sort aussi bien qu'une
colonie jouée : l'ouverture est si contrainte qu'aucune décision précoce ne
porte. À 330 elle est si confortable que le début ne se joue plus non plus.
**À 220 l'ouverture est une décision** — et c'est aussi le seul réglage où la
politique active passe devant la politique collée.

---

## 7. La forme d'une partie

```
  germination ──► colonisation ──► sporulation ──► vol ──► germination
       ▲              (le jeu)          (choix)              (plateau
       └──────────────────────────────────────────────────── suivant)
```

- **Germination** : on arrive avec une spore et son génome. Elle gonfle, elle
  sort un à trois tubes. Rien à faire — c'est le générique, et il dure ce que
  dure une germination.
- **Colonisation** : le jeu. Deux à trois heures de colonie.
- **Sporulation** : dès qu'une pointe est éligible et qu'on a la réserve. Tôt =
  sûr mais pauvre ; tard = riche mais on joue avec le front.
- **Vol et retombée** : déjà codés. Le plateau suivant est tiré d'une graine
  dérivée — reproductible, comme tout le reste.

**Fin de lignée** : plus de spore viable. On compare les générations atteintes.

---

## 8. Ce qui se mesure, et c'est mesuré

Aucun contenu avant ces trois verdicts. C'était la règle du projet, c'est
exactement ce qui a manqué au prototype mort, et **les trois passent
maintenant** (`npm run banc`, verdicts 19 à 21). Quatre politiques, écrites
dans `tools/politiques.mjs`, qui ne lisent **que** `Jeu.vue()` — la carte
quand on est en haut, une seule pointe quand on est descendu. Une politique
qui lirait l'état complet à tout instant ne mesurerait pas un joueur, elle
mesurerait un oracle.

| politique | ce qu'elle fait | spores emportées |
|---|---|---|
| **passive** | rien ; la colonie fructifie toute seule | **1,10** |
| **active** | alterne, place le sporangiophore sur le gras, évite les menaces | **2,35** |
| **collée** | ne remonte jamais, sporule sur la pointe qu'elle tient | 1,70 |
| **frontale** | comme l'active, mais du mauvais côté du front | 0,45 |

*20 graines de 3 h, pas d'intégration 2 s. Les moyennes sont stables avec le
pas (passive 1,00 / 1,13 / 1,38 et active 2,88 / 2,75 / 3,00 à dt = 1, 2 et 4) ;
seules les graines prises une à une divergent — c'est un système chaotique, et
ce n'est pas ce qu'on mesure. Le banc en refait 8, pour tenir dans son budget.*

### Verdict 19 — « ne rien faire est puni »

**2,35 contre 1,10**, un facteur 2,1, l'active devant ou à égalité sur la
grande majorité des graines. Le prototype mort mesurait 243 contre 223 — dans
le mauvais sens.

Le zéro de la passive n'est pas truqué : la colonie **fructifie toute seule**
si on ne fait rien, sur un déclencheur de limitation nutritive (le réseau cesse
de s'enrichir). Sans cette règle, « ne rien faire » ferait zéro par
construction et le verdict ne dirait rien.

### Verdict 20 — ce qu'il mesure, et ce qu'il ne mesure pas encore

**Ce qui passe : l'emplacement décide, et c'est un geste macro.** Même
politique, même cadence, même travail sur la pointe — posée sur le gras du
réseau elle emporte 2,35 spores, posée du mauvais côté du front 0,45. **Un
facteur cinq**, et la frontale est derrière sur presque toutes les graines. En
bas on ne voit ni le front ni les zones hostiles : c'est le seul endroit où ce
choix existe.

**Ce qui ne passe pas : rester descendu n'est pas assez puni.** Le doc
demandait qu'une politique collée à une pointe *perde* contre une politique qui
alterne. Elle perd **en moyenne** (1,70 contre 2,35) mais elle est devant sur
**9 graines sur 20**. L'écart tient à quelques grosses parties, pas à un
avantage constant — et c'est un demi-résultat, pas un résultat.

Les menaces ont été ajoutées **pour ça** : le front est lent, rectiligne et
déductible d'une horloge, donc on n'a pas besoin de le regarder. Une zone
hostile, elle, apparaît quelque part et s'étend, et ne se lit que d'en haut.
Elles ont amélioré la moyenne (avant elles, sur vingt graines : collée 2,60
contre active 2,55 — **la collée gagnait**), pas la constance. Balayage
complet, vingt graines par ligne, « devant » = graines où l'active bat la
collée :

| menaces | rayon final | active | collée | passive | frontale | devant |
|---|---|---|---|---|---|---|
| 4 | 250–800 | 2,40 | 2,45 | 0,90 | 0,65 | 7/20 |
| **4** | **400–1100** | **2,35** | **1,70** | **1,10** | **0,45** | **9/20** |
| 4 | 600–1500 | 2,10 | 2,00 | 0,75 | 0,50 | 8/20 |
| 7 | 250–800 | 1,95 | 1,75 | 0,80 | 0,55 | 8/20 |
| 7 | 400–1100 | 1,55 | 1,15 | 0,65 | 0,35 | 10/20 |
| 7 | 600–1500 | 0,90 | 0,90 | 0,25 | 0,30 | 5/20 |
| 10 | 250–800 | 1,70 | 2,10 | 0,65 | 0,40 | 6/20 |
| 10 | 400–1100 | 1,15 | 1,25 | 0,70 | 0,30 | 6/20 |
| 10 | 600–1500 | 0,75 | 0,65 | 0,15 | 0,30 | 6/20 |

**Aucun réglage ne dépasse 10/20.** Le réglage retenu — 4 taches de 0,4 à
1,1 mm — n'a donc **pas** été choisi là-dessus : il l'est sur la lisibilité du
plateau et sur le fait de ne pas écraser la partie (à ce réglage la colonie
livrée à elle-même emporte 1,10 spore, c'est-à-dire ce qu'elle emportait sans
aucune menace ; à dix taches elle tombe à 0,70, avec des taches de 1,5 mm à
0,15). Une matrice hostile doit se contourner, pas condamner.

**Pourquoi c'est encore ouvert.** Tenir une pointe ne fait rien perdre de
mécanique : la colonie tourne aussi bien pendant qu'on est en bas, et le seul
prix est de rater une décision de placement — or il n'y en a qu'une toutes les
vingt minutes. Trois pistes, à mesurer, pas à choisir :

1. **plusieurs sporocystes à la fois**, donc plusieurs décisions de placement
   en vol, donc un coût d'absence proportionnel au temps passé en bas ;
2. **un geste micro qui se périme** — une consigne de cap tenue trop longtemps
   sans être revue devrait dériver, comme le cap réel dérive ;
3. **une menace qui se réoriente** vers le mycélium le plus dense, de sorte
   que ne pas regarder coûte un morceau de réseau et pas seulement une
   occasion.

Rien de tout ça ne s'écrit avant d'être mesuré, et le banc dit déjà, dans sa
propre sortie, que ce verdict est un demi-résultat.

### Verdict 21 — « le réseau compte »

La même colonie au micromètre près, anastomoses **non câblées** — on ne les
empêche pas, on ne pose simplement pas l'arête, pour que seul le transport
change : **55 % de spores en moins** (2,75 contre 1,25, 8 graines).

### Et le réglage qui décide si le jeu existe

Le transport est une **diffusivité**, en µm²/s, et c'est elle qu'il a fallu
mesurer :

| D (µm²/s) | contraste de réserve | remplissage | passive | active |
|---|---|---|---|---|
| 400 | 2,4 | 33 min | 0,75 | 0,88 |
| **800** | **2,2** | **20 min** | **1,00** | **1,88** |
| 1 600 | 1,5 | 12 min | 2,13 | 2,00 |
| 3 200 | 1,2 | 12 min | 2,63 | 2,63 |
| 9 500 | 1,1 | 12 min | 3,25 | 2,88 |

Au-delà de 1 600 **le réseau est un bac commun** — contraste 1,1 entre
l'intérieur et le front — et l'active se met à **perdre** contre la passive :
quand la colonie nourrit un sporangiophore où qu'il soit, choisir où le poser
ne sert plus à rien et le joueur ne fait que gaspiller son attention.
**C'est la cause du 243 contre 223, et on la tient.**

À 800, une perturbation parcourt √(D·t) = 980 µm pendant les vingt minutes
d'un remplissage, soit le rayon de la colonie à la mi-partie : **un sporocyste
est nourri par son voisinage, pas par la colonie entière.**

---

## 9. L'esthétique ne perd rien — c'est une contrainte, pas un vœu

Le jeu n'a pas le droit de dégrader ce qui existe. Trois règles.

**Les trois optiques restent, et on joue dans les trois.** Contraste de phase,
fond noir, MET. Aucun élément de jeu ne peut supposer une palette : tout passe
par les entrées existantes, comme le reste du moteur. Un joueur qui préfère la
MET doit pouvoir faire une partie entière en MET.

**Le HUD s'efface.** Après quelques secondes sans geste, le panneau disparaît et
il ne reste que la préparation. Le premier mouvement le ramène. Ce n'est pas une
option de confort : c'est la seule façon de garder `cadre.html` *à l'intérieur*
du jeu plutôt qu'à côté.

**On ne gribouille pas la carte : on change de filtre.** Ce qu'un joueur doit
lire — où est le nutriment, où coule la réserve, où est la menace — ne se dit
pas avec des icônes posées dessus. Ça se dit en **changeant ce qu'on regarde**,
exactement comme on change de filtre sur un microscope. Un calque à la fois :

| Calque | Ce qu'il montre | Comment |
|---|---|---|
| *(aucun)* | la préparation | l'image telle qu'elle est aujourd'hui |
| **substrat** | le champ nutritif restant | densité tramée, palette courante, sous le mycélium |
| **réserve** | ce qui coule dans le réseau | les hyphes s'éclairent là où la réserve passe |
| **menace** | fronts et chocs | un voile qui avance, pas un rectangle rouge |
| **âge** | ce qui est neuf, ce qui est mort | la texture de paroi porte déjà l'abscisse depuis l'origine |

Chacun est **monochrome et tramé** comme le reste, et aucun ne pose un trait qui
n'existe pas dans le monde simulé.

**Et l'état se lit sur l'organisme.** Pas de barre de vie au-dessus d'une
pointe. Une pointe affamée est plus **pâle et plus fine** — elle l'est déjà, le
calibre suit le matériau. Une pointe tenue porte un **Spitzenkörper dense** —
il est déjà là, et la règle 10 dit qu'on ne le dessine jamais, qu'il apparaît
tout seul. Une hyphe qui transporte est plus **dense**. Tout ce dont le jeu a
besoin, le rendu sait déjà le dire.

---

## 10. Les matrices : chaque plateau est un aliment

C'est là que se joue la variété, et elle doit être **vraie**. Une moisissure
alimentaire ne pousse pas sur du bruit de Perlin : elle pousse dans une mie, une
pâte, un parenchyme, et ces choses-là ont une microstructure qu'on peut
regarder.

Chaque matrice donne quatre choses, et les quatre sont des paramètres du moteur
existant :

1. une **texture** — ce qu'on voit au fond, en coordonnées monde comme le grain
   de gélose actuel ;
2. un **champ nutritif** — où est le carbone, où est l'azote, et à quel point
   c'est inégal ;
3. des **structures** — ce qui bloque, ce qui canalise : parois cellulaires,
   alvéoles, globules gras, fibres. Une hyphe suit les interstices ;
4. un **danger propre** — ce qui, dans cet aliment, tue les moisissures.

| Matrice | Ce qu'on voit | Nutriment | Structure | Danger propre |
|---|---|---|---|---|
| **Mie de pain** | réseau alvéolaire de gluten, granules d'amidon gonflés, grandes bulles | carbone abondant, azote rare | les alvéoles sont des vides : on court sur leurs parois | dessèchement rapide de la croûte vers le cœur |
| **Pâte de fromage** | matrice de caséine, globules gras sphériques, cristaux de tyrosine en aiguilles | riche et gras, azote abondant | les globules gras sont des obstacles ronds | le sel, en gradient depuis la croûte |
| **Confiture / fruit** | parois cellulaires végétales polygonales, vacuoles, cristaux de sucre | sucre à profusion | le parenchyme est un damier de cellules | l'acidité, et l'eau trop liée pour être bue |
| **Zeste d'agrume** | flavédo, vésicules à huile essentielle en grosses poches claires | pauvre, dispersé | l'albédo est une éponge | les vésicules d'huile : des mines, on les évite ou on meurt |
| **Riz ou céréale cuite** | granules d'amidon gélatinisés, très homogène | carbone régulier, azote presque nul | quasi aucune : un plateau ouvert | famine azotée, la colonie plafonne |
| **Charcuterie sèche** | fibres musculaires striées, cristaux de sel | protéines, donc azote | les fibres canalisent : on pousse dans le sens du grain | nitrites, en taches |
| **Compost / feuille** | tissu végétal en décomposition, trachéides, autres micro-organismes | inégal, très riche par endroits | un labyrinthe | la concurrence : ce n'est pas un plateau vide |

**Ce que ça change pour le joueur.** Une mie de pain se colonise vite et sèche
vite : on sporule tôt. Un fromage nourrit longtemps mais le sel monte : on
travaille loin de la croûte. Un zeste est un champ de mines qu'il faut lire
avant d'y aller. Un riz est confortable et plafonne : on n'y fera jamais un gros
sporocyste, autant repartir vite. **Le plateau dicte la stratégie de sortie**,
et c'est ce qui donne envie d'en voir un nouveau.

**Comment c'est produit.** `src/sim/matrices.js`. Une matrice est une fonction
de bruit et un jeu de constantes, pas une image. Les structures — alvéoles,
cellules, globules, fibres — sont des champs de distance sur des cellules
hachées en coordonnées monde, exactement comme le grain de gélose. C'est la
même technique que la silhouette de l'hyphe, à une autre échelle.

Chaque plateau donne quatre choses : un **champ nutritif** (la vitesse), un
**stock** (le rendement — ce n'est pas la même chose), une **structure**
(0 libre, 1 infranchissable) et un **danger propre** (front et taches).

### La fenêtre de viabilité est étroite, et elle est mesurée

Premier jeu de valeurs : **cinq plateaux sur sept mouraient au démarrage**,
0,1 à 4 mm de mycélium. On a donc balayé les deux variables une à une, sur une
matrice neutre par ailleurs, cinq graines chacune :

| stock | 0,50 | 0,65 | 0,80 | 0,95 | 1,10 | 1,25 | 1,40 |
|---|---|---|---|---|---|---|---|
| mycélium (mm) | 0,4 | 1,3 | 14,7 | 79,7 | 114,4 | 151,8 | 165,0 |
| spores | 0,00 | 0,00 | 0,00 | 2,00 | 4,60 | 7,40 | 9,40 |
| éteintes | 5/5 | 5/5 | 4/5 | 0/5 | 0/5 | 0/5 | 0/5 |

| structure (uniforme) | 0,00 | 0,15 | 0,30 | 0,45 | 0,60 |
|---|---|---|---|---|---|
| mycélium (mm) | 86,3 | 86,5 | 40,8 | 27,3 | 10,3 |
| éteintes | 0/5 | 0/5 | 3/5 | 4/5 | 5/5 |

En dessous de 0,8 de stock le compte ne tombe jamais juste : un nœud absorbe
moins que son entretien avant que la colonie n'ait atteint du frais. **La
bonne nouvelle est que la fenêtre utile, 0,95 à 1,40, suffit largement** :
elle va de 2,0 à 9,4 spores, soit un facteur près de cinq. Une petite
différence de rendement se compose.

Trois corrections sont sorties de là, et les trois étaient des erreurs de
modèle, pas de réglage :

1. **le rendement suit la concentration, pas le remplissage relatif.** Rapporté
   au plein de *sa* cellule, un riz donnait autant par seconde qu'un fromage et
   se vidait deux fois et demie plus vite — la colonie mourait à la
   cinq-centième seconde. Rapporté à une référence absolue, une cellule pauvre
   donne moins et met le **même** temps à se vider : un riz plafonne, il ne tue
   pas ;
2. **une structure n'est pas une condamnation.** Retranchée en plein, elle
   faisait tomber le facteur sous le seuil de famine dès qu'on touchait une
   cloison. À 0,75, une pointe prise dans une structure pleine pousse au quart
   de sa vitesse : elle peine, elle cherche, elle sort ;
3. **une colonie dont tous les nœuds sont morts était encore « vivante ».**
   Elle ne poussait plus, mais `fin` ne se déclenchait jamais. Une pointe dont
   le mycélium est autolysé est morte.

### Ce que les sept plateaux donnent

Mesuré, politique active, 8 graines de 3 h :

| plateau | mycélium | pointes | densité | spores | 1er sporocyste |
|---|---|---|---|---|---|
| **riz** | 118 mm | 73 | 4,7 | 3,0 | 63 min |
| **fromage** | 79 mm | 53 | 4,2 | **8,1** | 61 min |
| **fruit** | 70 mm | 40 | 3,4 | 5,5 | 55 min |
| **charcuterie** | 43 mm | 28 | 1,5 | 2,9 | **104 min** |
| **compost** | 29 mm | 5 | 1,5 | 2,4 | 61 min |
| **zeste** | 26 mm | 0 | — | **0,4** | 62 min |
| **mie** | 19 mm | 0 | — | 1,3 | 61 min |

Chacun tient son identité. Le **riz** fait la plus grosse colonie et le plus
petit sporocyste — on s'y étend sans accumuler, exactement ce qu'on voulait.
La **charcuterie** est la seule à avoir une *direction* : la colonie s'y étale
dans le sens du grain au lieu de faire un disque, et sa densité le dit (1,5
contre 4,7). La **mie** meurt avant la fin mais emporte quand même quelque
chose, parce qu'elle sporule tôt. Le **zeste** est le plateau dur.

### Verdict 22 — « deux aliments ne donnent pas la même partie »

Colonie **en autonomie** sur chacun des sept — ce qu'on mesure est le plateau,
pas le joueur — et on compare cinq grandeurs normalisées : mycélium, pointes,
densité, spores, date du premier sporocyste. **La paire la plus proche
(charcuterie/compost) est à 0,20**, et les sept sont colonisables. La marge
sur le seuil (0,15) n'est pas énorme, et c'est dit.

---

## 11. Ce qui reste ouvert

- **Combien de pointes en même temps.** « Tenir = regarder » en donne une seule
  à la fois. Une lunette à deux champs serait un objet de jeu à part entière —
  à essayer, pas à décider ici.
- **Le nombre de gestes.** Cinq, c'est peut-être deux de trop pour commencer.
  Le verdict 19 tranchera : si l'active gagne avec trois gestes, les deux autres
  attendent.
- **L'interface.** Elle n'est pas décrite ici parce qu'elle dépend des trois
  verdicts. Tant qu'on ne sait pas que jouer vaut mieux que regarder, dessiner
  un panneau est prématuré.
