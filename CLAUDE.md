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
   trois politiques. On mesure la **moyenne en croisière** et le **temps passé
   sous le seuil**.

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
- **Le tube est rastérisé par sections transversales**, pas en segments épais. Un
  trait épais coloré donne un ruban, et l'hyphe cesse d'être un objet rigide
  contenant un liquide.

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

- **La carence arrive avant la paroi.** C'est le chantier d'équilibrage le plus
  net, et il est mesuré : à plein régime, 15 manches sur 24 meurent de carence
  contre 6 de lyse franche, et les gènes de synthase n'allongent donc pas la
  manche bien qu'ils épaississent la paroi de 27 %. Un gène de sécurité ne doit
  pas abréger la partie. Trois pistes dans `docs/05-banc.md` — **à trancher en
  jouant, pas au banc.**
- **Le son.** Rien pour l'instant. La piste évidente est de faire entendre le
  **pulse calcique** : c'est déjà l'horloge du jeu, à 1,55 Hz.
- **Souches jouables.** Une seule. Candidates dans `docs/00-concept.md`.
- **Le méta.** Les spores s'accumulent en banque mais n'achètent encore rien. La
  direction prévue : des **génotypes de départ**, c'est-à-dire des gènes déjà
  exprimés à la germination, pas des statistiques.
- **Le bilan de fin de manche** mérite une carte du thalle vue de loin. C'est le
  seul moment où l'on a le droit de reculer la caméra.
- **Banc visuel.** `npm run visual` n'existe pas encore : il faut des captures en
  jeu, portrait et paysage, pour vérifier **la page qu'on livre** et pas celle
  qu'on garde.
