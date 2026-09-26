# Le banc — ce qu'on mesure, et ce qu'il a trouvé

```
npm run banc
```

La logique du jeu n'a **aucune dépendance au DOM** : elle tourne en node, à la
vitesse qu'on veut, pilotée par quatre politiques caricaturales. C'est ce qui
permet de vérifier qu'un arbitrage **existe** au lieu d'en être persuadé.

Onze verdicts, 96 manches simulées, environ deux minutes.

---

## Les quatre politiques

Chacune répond à une question de conception, pas à un scénario de jeu :

| Politique | Question |
|---|---|
| **passif** | le jeu se joue-t-il sans rien faire ? Il ne doit pas. Ni barre, ni poussée, **ni ramification** |
| **pleins gaz** | la poussée est-elle un régime de croisière ? Elle ne doit pas l'être |
| **prudent** | consolider survit-il plus longtemps en avançant moins ? |
| **joueur** | la référence d'équilibrage. Elle module selon l'épaisseur de paroi et sonde un **éventail de cinq caps sur trois distances** |

Si les quatre meurent de la même cause ou vivent le même temps, l'arbitrage
central du jeu n'existe pas, et **aucune quantité de contenu ne le remplacera**.

---

## Ce que le banc a trouvé, et qu'aucune relecture n'aurait trouvé

C'est la partie utile de ce document.

### 1. `hash2` ne rendait jamais que [0 ; 0,5[

Hérité de Cell Dungeon. Le mélange final `n ^ (n >> 16)` utilise un décalage
**arithmétique** : pour un `n` négatif, les seize bits de tête valent 1, donc le
bit de signe s'annule contre lui-même et le résultat ne dépasse jamais 2³¹.
Moyenne mesurée sur 20 000 tirages : **0,25 au lieu de 0,5**.

Inoffensif pour du tramage, son usage là-bas. **Fatal ici** : le champ de sucre
moyen valait 0,02 au lieu de 0,22, toutes les politiques mouraient de carence en
cinq secondes, et trois des quatre plans de profondeur du décor n'étaient jamais
tirés.

### 2. La collision ignorait le plan de profondeur que le rendu attribuait

Le rendu répartissait les obstacles sur quatre plans de netteté pendant que la
collision les arrêtait **tous**. Le joueur se faisait écraser par un grain
visiblement flou, donc visiblement hors de son plan. **14 morts sur 20 par
écrasement, aucune compréhensible à l'écran.**

Corrigé à la racine : le plan appartient à la **donnée**, le rendu et la
collision lisent le même chiffre.

### 3. Une branche naissait sur l'axe du tube parent

Donc à 0 px de sa paroi. Dès l'expiration de la tolérance d'âge d'une seconde,
elle fusionnait avec son propre parent. **Ramifier était une mort différée : 18
fusions sur 20 manches.** Une branche émerge maintenant de la **paroi latérale**,
décalée d'un rayon, avec 0,9 s de sursis.

### 4. Avec une carte bénéficiaire en moyenne, ne rien faire était l'optimum

**243 s de survie et 33 spores** en allant tout droit sans toucher à rien, contre
223 s et 30 spores en cherchant à manger. C'est le défaut de conception le plus
grave qu'on ait eu, et il est **invisible à la lecture** : chaque terme du bilan
était juste, c'est leur somme qui était fausse.

La carte est désormais **déficitaire par défaut** : la médiane du champ est sous
le point mort, seules les plumes sont bénéficiaires. Deux calages ont été
nécessaires — le premier (gain 0,62) rendait le déficit si profond que tout
mourait en 15 à 30 s.

### 5. Il n'y avait pas d'horloge, donc lambiner restait optimal

Même après 4, la politique passive tenait 81 s pour 10 spores contre 48 s et
6 spores à une politique active : sur une carte déficitaire, **aller lentement est
toujours moins cher**. Et les concurrents se déclenchaient sur l'**avancée**, donc
un joueur lent en rencontrait moins : la lenteur était récompensée deux fois.

Deux horloges ajoutées, toutes deux réelles : le **dessèchement** du substrat
(−0,00035 d'aw par seconde, plafonné à −0,11) et les concurrents sur une
**date**. Plus une pondération du score qui paie la **profondeur** autant que la
longueur.

### 6. La politique de référence perdait contre « ne rien faire »

Un gradient à deux échantillons avec un gain de 3,4 oscillait, gaspillait
l'avancée et se jetait sur son propre thalle. **Tant qu'aucune politique
compétente ne battait le passif, le banc ne pouvait rien dire de l'équilibrage :
on ne savait pas si le défaut était dans le jeu ou dans le robot.** La politique
sonde maintenant un éventail.

### 7. Le harnais ramifiait pour la politique passive

Ce qui lui donnait une seconde vie et une seconde source de revenus : « ne rien
faire » était mesuré **en train de faire quelque chose**. Le verdict
correspondant ne voulait rien dire.

### 8. Mesurer le minimum d'épaisseur de paroi ne distinguait rien

Le minimum est toujours atteint pendant l'effondrement final : il valait 0,02
pour les trois politiques. On mesure la **moyenne en croisière** et le **temps
passé sous le seuil** — et là l'écart est net : 15 % du temps sous le seuil en
pleins gaz contre 0 % en modulant.

### 9. Trois bugs de pas de temps

Les dégâts d'obstacle et d'interférence étaient écrits avec un `0.016` en dur au
lieu de `dt` : la mort arrivait donc **plus vite sur un écran à 120 Hz**.

---

## Deux leçons de méthode

**Un banc dont tous les verdicts passent du premier coup ne garde rien.** Les
défauts 4, 5, 6 et 7 ont tous été trouvés parce qu'un verdict a échoué, puis
parce que le verdict lui-même était mal posé. Vérifier qu'un verdict attrape le
défaut qu'il prétend garder, en remettant le défaut.

**Un verdict doit porter sur ce que le jeu récompense, pas sur ce qu'il est
facile de mesurer.** Exiger que la politique passive meure plus vite aurait
demandé de punir la prudence, alors que le jeu doit punir la **stérilité**. Le
verdict porte donc sur les spores et la profondeur, et il assume qu'une politique
lente survive plus longtemps en rapportant moins.

---

## Chantier ouvert : la carence arrive avant la paroi

Le seul verdict qui a résisté, et il vaut d'être écrit plutôt que contourné.

L'arbitrage central du jeu est **vitesse contre épaisseur de paroi**. Il est
mesurable en croisière — 15 % du temps sous le seuil de lyse en poussée continue
contre 0 % en modulant — mais **il n'est pas ce qui tue à plein régime** : sur
24 manches menées pleins gaz avec une construction de vitesse, 15 meurent de
**carence** et 6 seulement de lyse franche. La poussée coûte 0,055 de sucre par
seconde, en plus du volume et de la paroi ; sur une carte déficitaire, le stock
part avant la paroi.

Conséquence gênante : les gènes de synthase **épaississent bien la paroi**
(0,63 → 0,80 en croisière, +27 %) et **font reculer la lyse**, mais ils
n'allongent pas une manche à plein régime, parce qu'une paroi plus épaisse coûte
un peu plus de sucre. Un gène de sécurité ne doit pas abréger la partie.

Trois pistes, non tranchées :

1. **baisser le coût de la poussée** (0,055 → 0,03) pour que la carence cesse de
   devancer systématiquement la paroi ;
2. **découpler le prix du matériau de l'épaisseur** au-delà de l'épaisseur
   nominale, ce qui serait défendable : une paroi plus épaisse coûte surtout au
   dépôt initial ;
3. **donner aux synthases un second effet** qui ne passe pas par le sucre, par
   exemple une réparation d'intégrité plus rapide.

À trancher en jouant, pas au banc : le banc dit que le problème existe, il ne
dit pas laquelle des trois est la bonne.

---

## Ce que le banc ne couvre pas encore

- **Le rendu.** Aucune capture, aucune vérification de lisibilité à la taille
  réelle. C'est le chantier le plus urgent : `npm run visual`.
- **Le tactile.** Les zones et les seuils de tap n'ont jamais été mesurés sur un
  vrai doigt.
- **La page livrée.** La leçon de Cell Dungeon — « vérifier la page qu'on LIVRE,
  pas celle qu'on garde » — n'a pas encore d'outil ici.
