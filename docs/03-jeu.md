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

**Le choc** — rare, **soudain**, local : une tache d'antifongique, un coup d'UV.
Tue ce qui est dessous. La seule parade est structurelle : de la redondance, et
ne pas avoir toute sa réserve au même endroit.

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

## 8. Ce qui se mesure, et dans quel ordre

Aucun contenu avant ces trois verdicts. C'est la règle du projet et c'est
exactement ce qui a manqué au prototype mort.

### Verdict 19 — « ne rien faire est puni »

Deux politiques, sans rendu, N graines :

- **passive** : on ne tient jamais rien, la colonie se débrouille ;
- **active** : une politique simple et honnête — tenir la pointe la plus
  affamée du front riche, ramifier vers le substrat, anastomoser vers l'amont,
  sporuler au bon moment.

**Critère** : l'active bat la passive d'une marge nette sur la métrique de fin
(spores emportées × qualité du génome), sur une majorité franche des graines.
Le prototype mort mesurait 243 contre 223 — dans le mauvais sens.

### Verdict 20 — « tenir a un coût »

Une politique qui reste descendue en permanence sur une pointe doit **perdre**
contre une politique qui alterne. Sinon l'alternance n'est pas le jeu, c'est
une décoration — et c'est précisément ce que le joueur a demandé à voir.

### Verdict 21 — « le réseau compte »

À anastomose désactivée, la même colonie doit transporter moins bien, affamer
son front plus tôt et sporuler plus pauvre. Si l'écart est nul, le flux ne sert
à rien et il faut revenir au pool global — autant le savoir tôt.

---

## 9. Ce qui reste ouvert

- **Combien de pointes en même temps.** « Tenir = regarder » en donne une seule
  à la fois. Une lunette à deux champs serait un objet de jeu à part entière —
  à essayer, pas à décider ici.
- **Le nombre de gestes.** Cinq, c'est peut-être deux de trop pour commencer.
  Le verdict 19 tranchera : si l'active gagne avec trois gestes, les deux autres
  attendent.
- **L'interface.** Elle n'est pas décrite ici parce qu'elle dépend des trois
  verdicts. Tant qu'on ne sait pas que jouer vaut mieux que regarder, dessiner
  un panneau est prématuré.
