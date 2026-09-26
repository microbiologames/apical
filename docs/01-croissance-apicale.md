# La croissance apicale, et ce qu'elle donne comme jeu

Ce document est la base du projet. Il ne décrit pas une mécanique inspirée de
la biologie : il décrit **six phénomènes réels**, et pour chacun la mécanique
qui en découle. Quand une décision de conception doit être tranchée, c'est ici
qu'on revient.

Règle qu'on ne négocie pas : **un phénomène → un terme de l'équation → une
jauge visible → un gène qui la déplace.** Un phénomène qui ne produit pas les
quatre n'entre pas dans le jeu.

---

## 1. Le turgor pousse, la paroi retient

Une hyphe n'est pas un muscle : elle n'a aucun moteur qui la tire vers l'avant.
Elle est un **tube sous pression** dont la paroi cède plastiquement à son
extrémité. La pression interne — le turgor — presse la membrane contre la face
interne de la paroi, et la paroi flue là où elle est encore molle, c'est-à-dire
uniquement dans les deux ou trois micromètres de la calotte apicale.

Chiffres mesurés :

| Grandeur | Valeur | Source |
|---|---|---|
| Turgor d'hyphes diverses | 0,2 à 0,9 MPa | mesures sur champignons et oomycètes |
| Turgor moyen en culture liquide | 0,74 MPa (osmométrie) | |
| Plasmolyse naissante | 1,0 à 1,2 MPa | |
| Vitesse d'allongement, champignon rapide | ≈ 20 µm/min (*Neurospora*) | |
| Flux de masse cytoplasmique associé | 5 µm/s | |

La loi qui relie les deux est la **loi de Lockhart**, utilisée telle quelle pour
les cellules à croissance apicale :

```
v = Φ × (P − Y)      si P > Y,  sinon 0
```

`Φ` est l'extensibilité de la paroi, `Y` le seuil de fluage, `P` le turgor. La
paroi est un polymère **viscoélastique** : une part de son étirement est
réversible (élastique), une part ne l'est pas (visqueuse, plastique). Seule la
part irréversible est de la croissance.

**Ce que ça donne comme jeu.** La vitesse n'est pas une statistique, c'est le
**résultat d'une pression que le joueur dépense**. Deux conséquences énormes :

- il existe un **seuil en dessous duquel rien ne bouge**, quel que soit le
  nombre d'améliorations accumulées. Le repère `Y` est dessiné sur la jauge
  d'eau : à gauche de ce trait, l'hyphe est à l'arrêt. Aucun autre jeu de
  croissance n'a ce plancher, et c'est lui qui rend l'eau angoissante ;
- allonger le tube **consomme du volume**, donc fait tomber la pression. Avancer
  vite se paie immédiatement en eau. La poussée est toujours un découvert.

---

## 2. On ne pilote pas l'apex. On pilote le Spitzenkörper

C'est la trouvaille qui donne au jeu sa main.

Le **Spitzenkörper** est un amas de vésicules, entourant un cœur riche en
actine, en ribosomes et en microtubules, situé juste en arrière du bout. Il
reçoit les vésicules issues du Golgi et les redistribue vers la membrane
apicale, ce qui crée un **gradient d'exocytose** — donc la forme du bout.

Le modèle qui décrit cela s'appelle le **centre d'approvisionnement en
vésicules** (*vesicle supply center*, Bartnicki-García). Son point essentiel :
**le Spitzenkörper se déplace, et c'est son déplacement qui détermine la
direction et la vitesse de croissance.** La forme de l'hyphe est la *trace
géométrique* de ce déplacement. La courbe obtenue porte même un nom, l'**hyphoïde**,
et elle épouse les profils d'apex observés en microscopie électronique.

Deux types de vésicules y transitent : les macrovésicules apicales (70 à
100 nm) et des microvésicules polyédriques (30 à 40 nm). Leur temps de
renouvellement dans l'organite, mesuré en FRAP, est de **1,3 à 2,5 min**.

**Ce que ça donne comme jeu.** Le joueur barre le **SPK**, pas l'apex. L'apex
suit, avec un retard de 70 ms. C'est une commande indirecte, et c'est ce qui lui
donne de la profondeur : on **anticipe** au lieu de corriger. Trois effets :

- le SPK se décale visiblement du côté du virage **avant** que l'apex ne tourne.
  Le retard est donc *affiché*, ce qui le rend maîtrisable au lieu de flou ;
- la **vitesse de virage décroît avec la vitesse d'avance** (le rayon de
  courbure que le SPK peut décrire est borné par la géométrie du cône apical).
  C'est l'arbitrage central du jeu : la vitesse achète de la distance et vend de
  la précision ;
- un gène (« Spitzenkörper resserré ») rapproche le SPK du bout : on tourne
  beaucoup plus court, et on perd de la vitesse. C'est la même géométrie, lue
  dans l'autre sens.

---

## 3. La croissance est pulsée, pas continue

On croit volontiers qu'une hyphe s'allonge régulièrement. C'est faux : des
**bouffées de Ca²⁺** coordonnent dans le temps l'assemblage de l'actine et
l'exocytose, ce qui produit une **extension par paliers**. Les vésicules
s'accumulent au Spitzenkörper pendant une phase lente, puis partent d'un coup
pendant une phase rapide.

**Ce que ça donne comme jeu.** Une horloge, calée sur le temps de
renouvellement réel de l'organite (1,3–2,5 min, soit ≈ 1,5 Hz à l'échelle de
temps du jeu). Elle sert trois fois :

- l'**animation** : la calotte gonfle puis avance. C'est le palier, ce n'est pas
  un effet ;
- l'**absorption** : dans le creux du pulse, l'apex s'attarde, donc il absorbe
  mieux (× 1,35). Ralentir n'est donc pas subir, c'est encaisser ;
- la **lisibilité** : deux apex ont des phases désynchronisées, ce qui les rend
  distinguables d'un coup d'œil.

---

## 4. L'épaisseur de paroi est un résultat, jamais un réglage

Le matériau de paroi arrive à un **débit borné** : les chitine synthases et la
glucane synthase FKS1 ne travaillent pas plus vite qu'elles ne travaillent.
Étalé sur une longueur produite `v`, ce débit `J` donne une épaisseur :

```
e = J / v
```

**Aller vite amincit la paroi.** Et une paroi trop mince sous un turgor de
1 MPa cède : l'apex **éclate**. Ce n'est pas une extrapolation, c'est
exactement le mode d'action des **échinocandines** : en inhibant la
β-1,3-glucane synthase, elles provoquent à la fois un ralentissement
fongistatique et des **lyses répétées des compartiments apicaux**.

**Ce que ça donne comme jeu.** L'arbitrage que le joueur ne peut jamais fuir.
Remarquable : `e × v = J`, donc **au-delà de 16 px/s le coût en sucre de la
paroi ne dépend plus de la vitesse**. La vitesse ne coûte pas de ressource, elle
consomme de la *marge de sécurité*. Aucune amélioration ne peut lever cet
arbitrage — elle peut seulement le déplacer. C'est ce qui garantit qu'une partie
très avancée reste une partie tendue.

Et c'est lisible sans HUD : la **paroi déposée garde son épaisseur pour
toujours**. Le moment où l'on a sur-poussé reste visible à l'écran, derrière soi,
jusqu'à la fin de la manche.

---

## 5. Les contraintes du milieu attaquent chacune un terme, et un seul

C'est ce qui rend six dangers apprenables sans tutoriel.

| Contrainte | Réalité | Terme attaqué | Ce que le joueur voit |
|---|---|---|---|
| **aw basse** | l'eau n'est plus disponible ; les xérophiles répondent en accumulant du glycérol | absorption d'eau | le turgor tombe, le protoplaste se décolle |
| **Température** | cloche asymétrique sur les points cardinaux | Φ, donc tous les débits | tout ralentit, uniformément |
| **Azolés** | inhibent la lanostérol 14α-déméthylase (ERG11/CYP51), donc la synthèse d'ergostérol : membrane plus perméable et plus rigide | absorption | le turgor tombe sans que l'aw ait changé |
| **Polyènes** (natamycine, nystatine) | ne visent pas une enzyme : ils se lient à l'ergostérol et **percent** la membrane | fuite directe de turgor | chute brutale, sans rapport avec le milieu |
| **Échinocandines** | inhibent FKS1, donc le β-1,3-glucane | flux de paroi `J` | la paroi s'amincit, la lyse guette |
| **Acides faibles** (sorbate) | entrent non dissociés, se dissocient dedans : la cellule pompe des protons en continu | maintenance | le sucre brûle à l'arrêt |

Limites d'aw réelles, qui fixent l'échelle du jeu : une moisissure banale de
denrées s'arrête vers 0,88 ; *Aspergillus penicillioides* germe à **0,640** ;
*Xeromyces bisporus*, l'organisme le plus xérophile connu, pousse jusqu'à
**0,61** et germe à 0,637 avec un apport de glycérol. Chez les xérophiles
extrêmes, le métabolisme s'arrête entre 0,700 et 0,640. Le catalogue de gènes
achète exactement ce trajet : de 0,88 à 0,62.

---

## 6. Le thalle est un réseau, et le réseau est le danger

Quatre faits, et ils forment à eux seuls la courbe de difficulté du jeu.

**Un seul protoplaste.** Les septa portent un pore central par lequel le
cytoplasme circule en continu et par où passent même des organites. Il n'y a
donc **qu'un turgor et qu'un stock de sucre pour tout le thalle**, quel que soit
le nombre d'apex. Chaque apex supplémentaire augmente les revenus *et* la
dépense *et* l'exposition *et* l'encombrement.

**La dominance apicale.** Un apex en croissance **réprime l'émergence de
nouveaux apex dans son voisinage**, par un gradient de Ca²⁺ et de radicaux
produits par le complexe NADPH oxydase. Une branche ne peut donc pas naître au
bout : elle naît en arrière, et on paie la manœuvre en terrain.

**La croissance totale est exponentielle parce que le nombre d'apex croît** — la
démonstration de Trinci. Un apex isolé, lui, s'allonge à vitesse constante. Le
jeu dit donc la vérité : pour aller plus loin, il ne faut pas un apex plus
rapide, il faut *plus d'apex*.

**L'autotropisme négatif et l'anastomose.** Les hyphes d'un même thalle
**s'évitent activement** — c'est ce qui fait un mycélium étalé et non une
pelote. Et quand elles se touchent quand même, elles **fusionnent** : c'est
l'anastomose, un vrai programme de développement qui transforme un arbre en
réseau et redistribue le cytoplasme.

**Ce que ça donne comme jeu.** Voir `00-concept.md`, section « la mort ». En
résumé : le contact avec son propre thalle ne tue pas, il **termine l'apex qui
fusionne**. Les branches deviennent donc un système de vies, et le thalle qu'on
construit devient le terrain sur lequel on jouera dans vingt secondes.

---

## 7. Les voisins

Le jeu n'a pas de « mobs ». Il a des **fronts mycéliens concurrents**, ce qui
est plus menaçant qu'un monstre : un front prend de l'**espace**, et l'espace ne
revient pas.

- **Interférence hyphale** (décrite par Webster dès les années 1970) : le simple
  contact suffit, sans pénétration. La zone sensible est l'**apex** : l'extension
  s'arrête net, la membrane fuit, le compartiment meurt.
- **Mycoparasitisme** : *Trichoderma* s'enroule sur l'hyphe hôte, la lyse par
  chitinases et glucanases, et **prend sa place**. C'est un remplacement, pas un
  partage.
- L'issue d'une rencontre entre deux mycéliums est soit le **blocage**
  (*deadlock*, aucun n'avance), soit le **remplacement** : l'un gagne du
  territoire.

La couleur d'un front est celle de ses **conidies**, parce que c'est un vrai
caractère d'identification : *Penicillium* vert-bleu, *Aspergillus niger* noir,
*Botrytis* gris souris, *Fusarium* rose saumon, *Trichoderma* vert vif. On ne
les invente pas et on ne les échange pas.

---

## 8. Les corps de Woronin

Les Pezizomycotina possèdent un organite dédié : **3,4 ± 0,2 corps de Woronin
de chaque côté d'un septum**, de **128,5 ± 3,6 nm** de diamètre, qui bouchent en
quelques secondes un pore septal de **41 ± 1,5 nm** quand un compartiment voisin
est percé. C'est un clapet anti-retour, et sa fonction est précisément
d'empêcher la perte massive de cytoplasme.

**Ce que ça donne comme jeu.** Le gène ne réduit pas la mort de l'apex : il
réduit la **cascade**. Une lyse apicale vide 65 % du turgor du thalle ; avec les
corps de Woronin, 26 %. Et ils sont **dessinés** aux septa, parce qu'un joueur
qui achète un clapet doit voir le clapet.

---

## Échelle, posée une fois pour tout le jeu

```
1 pixel       = 1 micromètre
1 seconde jeu = 1 minute de biologie
```

Une hyphe de 11 µm de diamètre fait 11 px de large : c'est un Mucorale (10 à
15 µm), pas un *Penicillium*. Le choix est dicté par le **rendu** — sous 8 µm il
ne reste pas assez de pixels pour montrer à la fois deux parois, un cytoplasme
et un organite, et le sujet du jeu disparaît.

*Neurospora* s'allonge à 20 µm/min, soit 20 px/s ici : le champ de 256 px se
traverse en 13 s. Les rapports entre vitesses restent ceux de la paillasse.

**Une seule entorse, assumée et signalée dans le code.** Le flux de masse
cytoplasmique mesuré (5 µm/s) vaudrait 300 px/s à cette échelle : un organite
traverserait le champ en moins d'une seconde et il ne resterait qu'un
scintillement. Le flux est donc rendu à 16 px/s + 0,8 × la vitesse d'extension.
Le fait qui compte est préservé : **le flux est toujours plus rapide que
l'apex**, c'est le corps qui alimente la pointe.

---

## Sources

- [Spitzenkörper — revue, ScienceDirect Topics](https://www.sciencedirect.com/topics/immunology-and-microbiology/spitzenkorper)
- [Hyphal Growth: a Tale of Motors, Lipids, and the Spitzenkörper — *Eukaryotic Cell*](https://journals.asm.org/doi/10.1128/ec.00381-06)
- [Vesicle trafficking via the Spitzenkörper during hyphal tip growth in *Rhizoctonia solani* — PubMed](https://pubmed.ncbi.nlm.nih.gov/23334442/)
- [Mapping the Growth of Fungal Hyphae: Orthogonal Cell Wall Expansion during Tip Growth and the Role of Turgor — *Biophysical Journal*](https://www.sciencedirect.com/science/article/pii/S0006349500764836)
- [Biomechanics of Hyphal Growth — Lew (revue PDF)](https://www.yorku.ca/planters/Mycota_Review.pdf)
- [Physical forces supporting hyphal growth — *Fungal Biology Reviews*](https://www.sciencedirect.com/science/article/pii/S1087184525000027)
- [Modelling fungal hypha tip growth via viscous sheet approximation](https://www.sciencedirect.com/science/article/abs/pii/S002251932030045X)
- [Pulses of Ca²⁺ coordinate actin assembly and exocytosis for stepwise cell extension — *PNAS*](https://www.pnas.org/doi/full/10.1073/pnas.1700204114)
- [Roles of calcium gradients in hyphal tip growth: a mathematical model — *Microbiology*](https://www.microbiologyresearch.org/content/journal/micro/10.1099/00221287-144-10-2771)
- [Branching of fungal hyphae: regulation, mechanisms and comparison with other branching systems — *Mycologia*](https://www.tandfonline.com/doi/full/10.3852/08-177)
- [Hyphal branching in filamentous fungi — *Developmental Biology*](https://www.sciencedirect.com/science/article/pii/S0012160618307309)
- [Design Principles of Branching Morphogenesis in Filamentous Organisms — *Current Biology*](https://www.sciencedirect.com/science/article/pii/S0960982219311819)
- [Hyphae of *Aspergillus nidulans* demonstrate chemotropism to nutrients and pH — *PLOS Biology*](https://journals.plos.org/plosbiology/article?id=10.1371%2Fjournal.pbio.3002726)
- [Thigmotropism — revue, ScienceDirect Topics](https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/thigmotropism)
- [The Woronin Body: A Fungal Organelle Regulating Multicellularity](https://link.springer.com/chapter/10.1007/978-3-030-05448-9_1)
- [Woronin body-based sealing of septal pores — *Fungal Biology Reviews*](https://www.sciencedirect.com/science/article/pii/S1087184517301512)
- [Genome and physiology of *Xeromyces bisporus*, the most xerophilic organism isolated to date — *Environmental Microbiology*](https://enviromicro-journals.onlinelibrary.wiley.com/doi/10.1111/1462-2920.12596)
- [Glycerol enhances fungal germination at the water-activity limit for life — *Environmental Microbiology*](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5363249/)
- [Water-, pH- and temperature relations of germination for the extreme xerophiles](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5328819/)
- [ZfpA-regulated chitin synthesis in *A. fumigatus* détermine la lyse apicale fongicide par les antifongiques anti-FksA](https://pmc.ncbi.nlm.nih.gov/articles/PMC13321839/)
- [Mechanisms of action in antifungal drugs — EBSCO Research Starters](https://www.ebsco.com/research-starters/agriculture-and-agribusiness/mechanisms-action-antifungal-drugs)
- [Insights into the role of sterol metabolism in antifungal drug resistance — *Frontiers in Microbiology*](https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2024.1409085/full)
- [Interspecific combative interactions between wood-decaying basidiomycetes — *FEMS Microbiology Ecology*](https://academic.oup.com/femsec/article/31/3/185/461131)
- [Mycoparasitism studies of *Trichoderma harzianum* against *Rhizoctonia solani* — PubMed](https://pubmed.ncbi.nlm.nih.gov/17534583)
- [Fungal foraging behaviour and hyphal space exploration in micro-structured Soil Chips — *The ISME Journal*](https://www.nature.com/articles/s41396-020-00886-7)
- [Hyphal exploration strategies of an arbuscular mycorrhizal fungus in microengineered soil chips](https://www.sciencedirect.com/science/article/pii/S175450482300079X)
- [Describing hyphal branching — David Moore, *Fungal Biology*](https://www.davidmoore.org.uk/Sec02_02.htm)
