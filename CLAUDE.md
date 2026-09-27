# Apical — à lire avant de toucher au code

Roguelite de **croissance apicale** jouable au navigateur. On est l'extrémité
d'une hyphe fongique : on pilote le **Spitzenkörper**, l'apex suit, on avance
vers le haut de l'écran et on ne revient jamais en arrière.

**Zéro dépendance, zéro build.** Modules ES vanilla servis tels quels.
`npm run serve` puis `http://localhost:8080/`. Playwright n'est là que pour les
bancs de mesure.

Même famille visuelle que **Cell Dungeon** : tampon pixel agrandi au plus proche
voisin, huit calques de profondeur floutés séparément, halo de contraste de phase,
tramage de Bayer. `src/core/` en vient directement.

---

## Conventions non négociables

| Où | Langue |
|---|---|
| Conversation avec l'utilisateur | **français** |
| Commentaires de code, messages de commit | **français sans accents** (ASCII pur) |
| Docs, README, textes d'interface | français accentué |

**Les commentaires disent POURQUOI, avec le chiffre qui a tranché.** Un
commentaire qui paraphrase le code ne vaut rien. Un commentaire qui dit
« mesuré : à 0,42 le revenu valait 0,08/s contre 0,22/s de dépense et les quatre
politiques mouraient en cinq secondes » évite de refaire l'erreur. Presque chaque
constante de ce dépôt porte la mesure qui l'a fixée et le défaut qu'elle corrige.
Continuer ainsi.

---

## Les quatre règles de fond

### 1. Un phénomène → un terme → une jauge visible → un gène

Rien n'entre dans le jeu qui ne produise les quatre. Un gène qui ne fait pas
bouger quelque chose de visible n'existe pas pour le joueur, donc il n'existe pas.
Pas de « +5 % de tout ».

### 2. Le modèle physiologique est la source, jamais l'inverse

L'extension suit la **loi de Lockhart** `v = Φ × (P − Y)`. L'épaisseur de paroi
est `e = J / v`. Ces deux lignes commandent tout le reste, y compris l'animation.
Quand une mécanique et la physiologie divergent, **on change la mécanique**.

Le détail, avec les chiffres mesurés et les sources, est dans
`docs/01-croissance-apicale.md`. C'est le document de référence du projet.

### 3. Le champ porte l'information, le HUD ne dit que le reste

Le turgor se lit au **décollement du protoplaste**, le flux vésiculaire à la
**brillance du Spitzenkörper**, l'épaisseur de paroi à **la paroi elle-même**, le
sucre du milieu aux **granulations du fond**. Une jauge qui double une
information déjà visible apprend au joueur à ne plus regarder le champ, et le
champ est le jeu.

Trois exceptions, assumées : les deux barres eau/sucre (elles portent la
**dérivée**, que l'image ne donne qu'une seconde plus tard), la jauge de paroi
(la lyse est la mort la plus rapide et doit pouvoir s'anticiper au chiffre), et la
charge d'antifongique (interne, aucun signe visible).

### 4. Ce qui est seulement invraisemblable se règle par un biais ; ce qui est LAID se ferme

Reprise de Cell Dungeon, et elle vaut ici aussi.

---

## La méthode : on mesure, on ne devine pas

**`npm run banc` avant et après toute modification d'équilibrage.** La logique du
jeu n'a aucune dépendance au DOM : elle tourne en node, à la vitesse qu'on veut,
pilotée par quatre politiques caricaturales. Onze verdicts.

Ce que le banc a trouvé, et qu'aucune relecture n'aurait trouvé :

0. **Le banc n'était pas reproductible.** La phase du pulse du premier apex
   venait de `Math.random()`. Deux exécutions sur les mêmes graines donnaient
   des médianes variant du simple au septuple (240 µm contre 1 700 µm de
   profondeur pour la même politique), et les verdicts basculaient au hasard.
   **Une mesure non reproductible ne mesure rien.** Tout aléa de simulation
   vient du générateur de la manche.

1. **`hash2` ne rendait jamais que [0 ; 0,5[.** Un décalage arithmétique au lieu
   de logique annulait le bit de signe contre lui-même. Inoffensif pour du
   tramage (son usage dans Cell Dungeon), **fatal ici** : le champ de sucre moyen
   valait 0,02 au lieu de 0,22 et trois des quatre plans de profondeur du décor
   n'étaient jamais tirés.
2. **La collision ignorait le plan de profondeur que le rendu attribuait.** Le
   joueur se faisait écraser par un grain visiblement flou. 14 morts sur 20.
3. **Une branche naissait sur l'axe du tube parent**, donc à 0 px de sa paroi :
   dès l'expiration de la tolérance d'âge elle fusionnait avec son propre parent.
   Ramifier était une mort différée. 18 fusions sur 20.
4. **Avec une carte bénéficiaire en moyenne, ne rien faire était l'optimum** :
   243 s de survie et 33 spores en allant tout droit sans toucher à rien, contre
   223 s et 30 spores en cherchant à manger. C'est le défaut de conception le
   plus grave qu'on ait eu, et il est invisible à la lecture.
5. **Le gradient à deux échantillons perdait contre la politique passive.** Tant
   qu'aucune politique compétente ne battait « ne rien faire », le banc ne
   pouvait rien dire : on ne savait pas si le défaut était dans le jeu ou dans le
   robot. La politique de référence sonde maintenant un **éventail** de cinq caps
   sur trois distances.
6. **Mesurer le minimum d'épaisseur de paroi ne distinguait rien** : il est
   toujours atteint pendant l'effondrement final, donc il valait 0,02 pour les
   trois politiques. On mesure la **moyenne en croisière**.
7. **L'exclusion de contact avec sa propre paroi était en TEMPS.** Calée sur
   20 µm/s, elle protégeait les 20 µm derrière l'apex ; au régime lent (3 µm/s)
   elle n'en protégeait plus que trois, et l'apex fusionnait avec son propre
   tube dès la première seconde. **24 manches sur 24 mortes à 4,5 s.** Elle est
   maintenant en **abscisse curviligne**, donc indépendante de l'allure.
8. **La famine tuait toujours, et par la même mort** : 23 manches sur 24 en
   « carence puis lyse ». Il manquait deux mécanismes réels — la **rétroaction
   de disette** (un apex à court de matériau se ferme au lieu de foncer vers sa
   rupture) et l'**autophagie** (un mycélium affamé se mange). Avec eux, la
   famine devient un compte à rebours visible et six causes de mort coexistent.
9bis. **LA BARRE ETAIT INVERSEE.** `cap += barre × ω` avec un écran en y-haut :
   partant de π/2, ajouter à l'angle tourne vers la **gauche**. La touche de
   droite faisait virer à gauche. Signalé à l'essai, confirmé au calcul
   (`cos(π/2 + 0,5) = −0,48`). **`barre` est désormais en repère écran**,
   positif = droite, et tout ce qui la produit doit respecter ce repère
   (`autoBarre`, l'éventail du banc).
9ter. **L'autophagie mangeait un thalle qui n'existait pas encore.** Pendant la
   germination rien n'est absorbé ni construit ; le thalle faisait quarante
   micromètres et se digérait à la sixième seconde. Une conidie **alimente son
   tube germinatif** sur ses propres réserves : c'est la `reserveSpore`, et elle
   tient vingt secondes — le temps de trouver sa première plume.
9quater. **L'épaisseur de paroi était mise à l'échelle du zoom.** À 4,6 px/µm
   elle faisait huit pixels et le tube devenait une saucisse floue. Une paroi
   d'hyphe fait 0,1 à 0,3 µm : elle doit rester un **trait d'écran** (1 à 3,6 px)
   quel que soit le grossissement, sinon elle cesse d'être rigide.
9quinquies. **Une vésicule remplie de la couleur du cytoplasme est invisible** —
   le centre du tube est dessiné avec cette teinte-là. Une vésicule est
   **réfringente** : plus claire que son fond, toujours nette, jamais floutée.

10. **La calotte apicale, trois profils avant le bon.** Dôme court et bombé :
   lu comme un **bourgeon**. Demi-ellipse allongée (L = 1,55 R), en cherchant la
   fidélité au profil « hyphoïde » : **pire, lue comme un phallus**. Une calotte
   plus longue que large donne cette silhouette-là, quoi qu'elle représente.
   Ce qu'il faut est un **tube fermé** : superellipse d'exposant 2,8 sur une
   longueur de **0,82 R** — donc une calotte plus COURTE que le rayon, des
   flancs encore à 95 % du rayon à mi-hauteur. Défendable : les Mucorales, dont
   on a pris le diamètre, ont des apex nettement plus obtus que le hyphoïde
   classique des Ascomycètes.

9. **La sporulation exigeait du sucre**, donc était impossible au moment exact
   où il faut la prendre. C'est aussi un contresens biologique : c'est **la
   limitation en nutriments qui induit la conidiation**. Seuil ramené à 0,04.

Corollaire de 4 et 5 : **un banc dont tous les verdicts passent du premier coup
ne garde rien.** Vérifier qu'un verdict attrape le défaut qu'il prétend garder,
en remettant le défaut.

---

## Invariants à ne pas casser

- **La paroi déposée ne change plus jamais.** Le fluage de la paroi fongique est
  plastique, donc irréversible. Conséquence : le joueur **écrit le niveau** en
  jouant, et le moment où il a sur-poussé reste visible derrière lui pour
  toujours. L'épaisseur est donc mémorisée **point par point**.
- **Le cap de tout apex est borné à ±78° de l'avant** (`Apex.borner`). Trois
  choses en dépendent et tombent ensemble si on le lève : la caméra monotone, la
  purge de la géométrie arrière (`Thalle.purger`), et la garantie que `avance`
  croît.
- **Les ressources sont GLOBALES, pas par apex.** Un mycélium est un seul
  protoplaste : pores septaux ouverts, flux de masse mesuré à 5 µm/s. C'est de là
  que vient toute la courbe de difficulté — chaque apex de plus augmente revenus,
  dépense, exposition **et** encombrement.
- **La carte est déficitaire par défaut.** La médiane du champ de sucre est sous
  le point mort, seules les plumes sont bénéficiaires. Voir la mesure 4 ci-dessus.
  Ne pas « adoucir » sans relancer le banc.
- **Le plan de profondeur d'un obstacle appartient à la DONNÉE** (`champ.js`),
  jamais au rendu. Le rendu et la collision doivent lire le même chiffre, sinon
  le flou mentirait sur ce qui bloque.
- **Le pilote est dessiné en dernier.** Sinon une hyphe ancienne le recouvre à un
  croisement et on perd de vue ce qu'on pilote.
- **La caméra n'avance jamais à reculons**, et son `y` est monotone par
  construction. Ramifier ne la recule pas : la branche naît 14 px en arrière, la
  caméra attend sur place.
- **Rien ne s'arrête jamais dans le cytoplasme.** À vitesse nulle le flux
  continue : c'est ce qui fait qu'un apex bloqué a l'air vivant et non en pause.
- **Une seule chose clignote dans tout le jeu** : la jauge de paroi sous le seuil
  de lyse. Si autre chose clignote, l'alerte ne veut plus rien dire.
- **Le tube est rastérisé par CHAMP DE DISTANCE**, pas en segments épais ni
  section par section. Un trait épais coloré donne un ruban ; un tracé section
  par section fait **onduler la paroi**, et une paroi qui ondule n'est pas
  rigide.
- **Le plan de contact avec sa propre paroi s'exclut en DISTANCE D'ARC**, jamais
  en temps. Voir la mesure 7 ci-dessus.
- **Aucun `Math.random()` dans la simulation.** Tout aléa vient de `game.rng`,
  sinon le banc ne mesure plus rien (mesure 0).
- **Les ressources sont globales, mais l'ENTRETIEN suit la BIOMASSE.** C'est ce
  terme qui donne une fin à la manche et qui rend la sporulation nécessaire.
  Sans lui, revenus et dépenses croissaient tous deux avec le nombre d'apex et
  ouvrir des fronts était neutre.
- **Le substrat s'épuise localement** (mailles de 8 µm). Brouter sur place cesse
  de payer, et **la zone broutée se voit** puisque le fond est dessiné à partir
  du même échantillon.
- **Tous les substrats sont montés au bleu coton**, donc en fond clair. Un
  basculement fond clair / fond noir en cours de manche se lit comme une panne
  d'affichage. Ne pas remettre de fond noir.
- **Pas de concurrents.** Décision de l'auteur : ils se lisaient comme des mobs
  à trajectoire rectiligne. Le milieu ne contient que des éléments de milieu.
- **`barre` est en REPÈRE ÉCRAN** : positif = droite. Voir la mesure 9bis.
- **On pilote `cap` par son `omega`, pas le Spitzenkörper.** Le SPK est
  **calculé** à partir du taux de virage et dessiné en croissant diffus : il
  informe, il ne commande pas. Deux commandes en cascade ne se sentaient pas, et
  un SPK net se donnait pour une poignée qu'il n'était pas.
- **L'épaisseur de paroi ne suit PAS le zoom** (`epaisseurEcran`). Voir 9quater.
- **Les vésicules sont toujours nettes et plus claires que le cytoplasme.** Elles
  sont le sujet du champ : on doit pouvoir suivre chacune du fond du tube
  jusqu'à sa fusion. Voir 9quinquies.
- **La composition du trafic vésiculaire vient du MODÈLE** (`mixVesicules`), pas
  du rendu : le flux de chitosomes suit l'épaisseur déposée, celui des
  macrovésicules suit la vitesse. Pousser fait donc littéralement disparaître les
  chitosomes du tube.
- **La calotte est un TUBE FERMÉ, pas un ovoïde** : elle est plus courte que le
  rayon (0,82 R). Voir la mesure 10 — une calotte plus longue que large donne
  une silhouette phallique, et aucune justification physiologique ne rattrape ça.
- **Le TEMPO ralentit l'HORLOGE, jamais les coefficients.** `dt` est multiplié
  par 0,48 en tête de `Game.pas`, donc croissance, absorption, dépenses,
  entretien, autophagie, dessèchement et pulse sont divisés par le même facteur
  et **tous les rapports sont préservés**. Ralentir les coefficients un par un
  casserait l'équilibrage à coup sûr.
- **Les vésicules attendent la DÉCHARGE du pulse.** Elles s'accumulent au
  Spitzenkörper pendant la phase lente et sont exocytées pendant la phase
  rapide : c'est le mécanisme mesuré, et c'est ce qui donne à la croissance ses
  paliers. On voit le bouchon se former puis partir d'un coup.
- **La caméra garde l'apex dans le cadre** (22–78 % en hauteur, 16–84 % en
  largeur). Elle n'avance toujours pas à reculons, mais au zoom serré un apex qui
  vire près de sa butée de cap dérivait hors de l'écran.

---

## Où lire quoi

| Fichier | Contenu |
|---|---|
| `docs/00-concept.md` | le concept, les huit arbitrages de conception, les cinq verbes, les morts |
| `docs/01-croissance-apicale.md` | **la physiologie, les chiffres mesurés et les sources.** Document de référence |
| `docs/02-genes.md` | le catalogue d'expression génique et ses règles |
| `docs/03-substrats.md` | les quatre substrats, l'escalade, les concurrents |
| `docs/04-animation.md` | **le rendu : ce qu'est une hyphe à l'écran.** À lire avant de toucher au rendu |
| `docs/05-banc.md` | le banc, ses verdicts, et ce qu'il a trouvé |

Le code porte l'essentiel du raisonnement : `src/game/apex.js`,
`src/render/hyphe.js`, `src/game/cytoplasme.js` et `src/game/game.js` sont
commentés en profondeur.

---

## Chantiers ouverts

- **La lyse est devenue rare** (4 manches sur 24 même avec une construction de
  vitesse), conséquence assumée de la rétroaction de disette. L'arbitrage
  vitesse / paroi se lit maintenant dans l'**épaisseur** et dans la **durée de
  manche**, plus dans une mort. À rejuger à la manette : si la paroi cesse de
  faire peur, il faudra rendre la rétroaction plus imparfaite.
- **La plasmolyse domine la table des causes** (environ 15 manches sur 24 pour
  toutes les politiques). Le dessèchement plus les poches de sel forment
  maintenant la pression principale, et les autres morts sont reléguées. À
  rejuger : soit adoucir la dérive d'aw, soit rendre l'osmotolérance plus
  accessible dans le catalogue.
- **Le méta.** Les spores s'accumulent mais n'achètent rien.
- **Le son.** Rien pour l'instant. La piste évidente est de faire entendre le
  **pulse calcique** : c'est déjà l'horloge du jeu, à 1,55 Hz.
- **Souches jouables.** Une seule. Candidates dans `docs/00-concept.md`.
- **Le méta.** Les spores s'accumulent en banque mais n'achètent encore rien. La
  direction prévue : des **génotypes de départ**, c'est-à-dire des gènes déjà
  exprimés à la germination, pas des statistiques.
- **Le bilan de fin de manche** mérite une carte du thalle vue de loin. C'est le
  seul moment où l'on a le droit de reculer la caméra.
- **La carte de fin de manche** existe mais reste brute : pas de densité de
  réseau, pas de comparaison avec les manches précédentes. C'est pourtant le
  seul écran où l'on a le droit de reculer la caméra.
