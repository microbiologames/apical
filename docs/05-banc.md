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

### 0. Le banc n'était pas reproductible

La phase du pulse du premier apex venait de `Math.random()`. Deux exécutions sur
les **mêmes graines** donnaient des médianes variant du simple au septuple —
240 µm contre 1 700 µm de profondeur pour la même politique — et les verdicts
basculaient au hasard d'une exécution à l'autre.

**Une mesure non reproductible ne mesure rien**, et surtout : on ne peut pas
distinguer un réglage d'un bruit. C'est le défaut le plus coûteux de la liste,
parce qu'il invalidait rétroactivement tout ce qu'on croyait avoir mesuré.

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

### 10. L'exclusion de contact était en temps, pas en distance

Calée sur une vitesse de croisière de 20 µm/s, la règle « ignorer la paroi de
moins d'une seconde » protégeait les 20 µm derrière l'apex. Au régime lent
(3 µm/s) elle n'en protégeait plus que trois : l'apex se déclarait en contact
avec son propre tube dès la première seconde et fusionnait. **24 manches sur 24
mortes à 4,5 s**, le jour même où le régime 0 a été ajouté.

Elle est maintenant en **abscisse curviligne** : 34 µm de tube derrière l'apex,
quelle que soit l'allure. C'est défendable géométriquement — on ne peut pas se
toucher soi-même à moins d'un rayon de braquage, qui vaut au minimum 57 µm.

### 11. La famine tuait toujours, et par la même mort

23 manches sur 24 en « carence puis lyse ». Il manquait deux mécanismes, tous
deux réels, et les ajouter a rendu au jeu six causes de mort distinctes :

- la **rétroaction de disette** : un apex à court de matériau ne fonce pas vers
  sa propre rupture, il **se ferme**. Elle est volontairement imparfaite (elle
  ne peut retirer que 82 % de la vitesse demandée), ce qui laisse **forcer en
  pleine disette** comme seule façon de lyser ;
- l'**autophagie** : un mycélium affamé **se mange**. La longueur du thalle,
  donc le score, se met à descendre. La famine devient un compte à rebours
  visible au lieu d'une mort sèche.

Le rendement de l'autophagie a dû être mesuré deux fois : à 0,004 par µm, se
manger soi-même était si rentable que **foncer en permanence devenait la
meilleure stratégie** (1 529 µm de profondeur contre 1 361 à une politique qui
module). L'autophagie doit être un sursis, pas un carburant.

### 12. La sporulation était impossible au moment où il faut la prendre

Elle exigeait 0,35 de sucre, or la décision se prend quand le thalle commence à
se manger, donc à stock au plancher. La politique de référence ne parvenait
jamais à encaisser, et le banc ne mesurait donc **jamais l'extraction** — c'est
pourtant l'affirmation la plus importante du jeu.

C'est aussi un contresens biologique : chez les champignons filamenteux, c'est
**la limitation en nutriments qui induit la conidiation**. Seuil ramené à 0,04.

Une fois corrigé, le verdict d'extraction dit ce qu'on voulait entendre :
**33 spores en sporulant à temps contre 15 en poussant jusqu'à la mort**, sur
les mêmes graines.

### 13. Deux verdicts affirmaient des choses devenues fausses

- « la poussée ne peut pas être un régime de croisière, donc elle atteint moins
  de profondeur » : **faux** depuis la rétroaction de disette — pleins gaz
  atteint 1 700 µm contre 1 116 en modulant. La poussée *achète* de la distance ;
  ce qu'elle vend, c'est de la paroi (1,11 contre 1,41) et du temps pour lire le
  champ. Le verdict affirme maintenant cela ;
- « les synthases font reculer la lyse » : la lyse est devenue trop rare
  (4 manches sur 24 même avec une construction de vitesse) pour que
  l'échantillon distingue quoi que ce soit. **Un verdict qui tranche sur quatre
  événements ne garde rien.** Il ne compare plus que les épaisseurs de paroi.

---

## Chantier ouvert : la paroi fait-elle encore peur ?

La rétroaction de disette a réglé un vrai problème et en a créé un plus petit :
**la lyse est devenue rare**. L'arbitrage vitesse / paroi reste mesurable dans
l'épaisseur (1,11 en poussant contre 1,41 en consolidant) et dans la durée de
manche, mais il ne se paie plus guère d'une mort.

À rejuger à la manette, pas au banc : si la jauge de paroi cesse de faire peur,
il faudra rendre la rétroaction plus imparfaite — elle retire aujourd'hui 82 %
de la vitesse demandée, et c'est ce chiffre qui décide.

---

## Ce que le banc ne couvre pas encore

- **Fait : le rendu.** `npm run visual` existe, avec neuf verdicts, des captures
  portrait et paysage, une **capture macro ×4 centrée sur l'apex** (la seule qui
  permette de juger un organite de deux pixels dans un tube de trente-quatre) et
  une capture de l'**écran de bilan**, pour que la carte du thalle soit testée.
- **Le tactile.** Les zones et les seuils de tap n'ont jamais été mesurés sur un
  vrai doigt.
- **La page livrée.** La leçon de Cell Dungeon — « vérifier la page qu'on LIVRE,
  pas celle qu'on garde » — n'a pas encore d'outil ici.
