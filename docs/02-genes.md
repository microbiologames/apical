# Expression génique — le catalogue

On ne dit pas « évolution », on dit **expression**. Le génome est déjà là depuis
la spore ; ce que la manche débloque, c'est la **transcription d'un gène que le
milieu vient d'induire**. C'est vrai — une amylase ne s'exprime que devant de
l'amidon, une pompe d'efflux que devant un azole — et ça justifie exactement la
mécanique de roguelite : **les cartes proposées dépendent du substrat traversé**
(un gène induit voit son poids doublé).

37 gènes, dix familles, quatre raretés plus les légendaires.

---

## Les trois règles du catalogue

### 1. Un gène touche un terme de l'équation, et le joueur peut le voir bouger

Pas de « +5 % de tout ». Le catalogue est écrit en face des coefficients du
modèle, pas en face d'une fiche de personnage :

| Terme | Ce que c'est | Familles qui y touchent |
|---|---|---|
| `Φ` | extensibilité de paroi | transport (flux de masse), Spitzenkörper |
| `Y` | seuil de fluage | turgor (hyperturgor) |
| `J` | flux vésiculaire, donc **épaisseur de paroi** | paroi, Spitzenkörper |
| `kEau`, `awMin`, `pmax` | absorption d'eau et plafond de turgor | turgor |
| `agilité`, `spkDist` | rayon de braquage | tropisme, Spitzenkörper |
| `kSucre`, `rayonAbs` | revenus | hydrolases |
| `apexMax`, `coûtBranche` | nombre de fronts, donc de vies | ramification |
| `detox` | charge d'antifongique | détox |

### 2. Un gène se voit sur le corps

Héritage direct de Cell Dungeon. Une paroi épaissie est plus large à l'écran, la
mélanine fonce l'hyphe, un flux doublé rend le Spitzenkörper deux fois plus
brillant, les corps de Woronin apparaissent aux septa. **Le champ de microscope
est la fiche de personnage.**

### 3. Les meilleurs gènes sont des dettes

Un gène qui accélère sans rien coûter rendrait la manche monotone. Les quatre
légendaires ouvrent un plafond **et** creusent une vulnérabilité, parce que c'est
ce qui fait que la partie devient difficile **au moment où on devient puissant**.

| Légendaire | Ce qu'il ouvre | Ce qu'il coûte |
|---|---|---|
| **Hyperturgor** | plafond de turgor +0,45, seuil de fluage effondré | la paroi n'a pas changé → l'apex éclate. C'est une échinocandine à l'envers |
| **Croissance apicale multiple** | +2 apex, autonomes plus rapides | le thalle devient un réseau, et le réseau devient le danger |
| **Conversion xérophile** | aw minimale à 0,62 : plus aucun substrat n'est trop sec | −18 % d'absorption : un xérophile extrême est un spécialiste, pas un généraliste |
| **Récepteurs de gradient** | on **voit beaucoup plus loin**, et les hyphes sœurs trouvent le sucre seules | rien d'autre : il achète de la perception, pas de la puissance |

> **« Gènes mycoparasites » a été remplacé** le jour où les fronts concurrents
> ont été retirés : un gène dont la cible n'existe plus est une carte morte dans
> le paquet, et une carte morte légendaire est pire encore. Le remplaçant sert la
> nouvelle source de difficulté, qui est le choix de trajectoire.

Le banc vérifie la dette : avec *hyperturgor + ATPase + flux de masse*, la
construction roule avec une **paroi mesurablement plus mince** (0,83 contre 0,92
avec les synthases) et meurt plus tôt. La lyse elle-même est devenue rare depuis
que l'apex se ferme quand le matériau manque — voir `docs/05-banc.md`.

---

## Les dix familles

| Famille | Pathway réel | Ce qu'elle achète |
|---|---|---|
| **paroi** | chitine synthases CHS, glucane synthase FKS1, hydrophobines, mélanine DHN | de la marge avant la lyse |
| **turgor** | glycérol-3-P déshydrogénase, voie HOG1, aquaporines, H⁺-ATPase PMA1 | de la vitesse et de l'osmotolérance |
| **spk** | myosine V, exocyste SEC6, canal calcique CCH1, kinésine-1 | du flux et du rayon de braquage |
| **tropisme** | récepteurs GPCR, polarisome Cdc42, autotropisme négatif, thigmotropisme | de la précision et, littéralement, **du champ de vision** |
| **ramification** | NADPH oxydase NoxA, dominance apicale, septines AspB | des fronts, donc des vies |
| **hydrolase** | α-amylase, polygalacturonase, invertase, transporteur MstA | l'accès à des substrats fermés |
| **transport** | flux de masse, corps de Woronin, anastomose | de la logistique et de la survie au dégât |
| **détox** | pompes ABC/MFS, CYP51A muté, remaniement des stérols, PDR12, HSP30 | la résistance à la conservation |
| **sporulation** | brlA, cascade abaA/wetA | le rendement de l'encaissement |

Deux gènes méritent un mot parce qu'ils **changent une règle** au lieu d'un
chiffre :

- **Anastomose** (épique) : toucher son propre thalle ne détruit plus l'apex, il
  **fusionne** et crée un nœud qui donne du flux permanent. C'est une vraie
  transformation d'un arbre en réseau, et ça retourne complètement la gestion de
  l'espace ;
- **Récepteur GPR-4** (commune) : il **recule la caméra**. C'est le seul gène du
  jeu qui n'achète aucune statistique — il achète de l'information, et sur une
  carte où l'on ne voit que cent micromètres devant soi, c'est souvent le
  meilleur achat de la main ;
- **α-amylase** (peu commune, rang unique) : **l'amidon devient du sucre**. Sans
  elle, le grain stocké — le substrat le plus riche du jeu — est un désert. Une
  carte commune devient une clé de porte, et c'est le meilleur argument du
  système d'induction.

---

## Le tirage

Deux garde-fous, chacun pour un défaut de main :

- **jamais deux gènes de la même famille dans une main.** Sinon la main se lit
  comme un seul choix à deux options, et le joueur a l'impression d'avoir moins
  de catalogue qu'il n'en a ;
- **un gène déjà exprimé voit son poids × 0,55.** Sans ce biais, les communes à
  quatre rangs monopolisaient les mains de fin de manche.

Les rangs s'additionnent, **jamais ne se multiplient** : deux rangs de +4 de flux
donnent +8, pas +8,16. Le multiplicatif rend les derniers rangs incomparables aux
premiers et l'équilibrage devient impossible à raisonner de tête.

Deux sources de cartes :

- **palier** tous les 620 µm de thalle cumulé ;
- **locus d'expression**, croisé dans le milieu, environ un tous les 260 µm en
  ligne droite. Il faut le **toucher**, donc on le rate si on va vite.

---

## Bornes de sécurité

`appliquer()` borne `Φ ≥ 12`, `Y ≥ 0,08`, `spkDist ≥ 2,2`, `awMin ≥ 0,55`,
`intégrité ≥ 0,1`, `detox ∈ [0,12 ; 3]`.

Sans elles, quatre rangs de mélanine annulaient la vitesse et la manche **se
figeait sans mourir**. Un blocage se lit comme un bug, jamais comme une
difficulté.
