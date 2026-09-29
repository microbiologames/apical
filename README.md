# Apical

Simulation contemplative de la croissance apicale d'une hyphe fongique,
en pixel art vu au microscope. Sans dépendance, sans build.

```
npm run serve           # http://localhost:8080/
npm run banc            # 16 verdicts de mesure
npm run visuel          # captures de contrôle
npm run visuel:branche  # captures de la page ramification
npm run visuel:thalle   # captures de la page colonie
npm run visuel:monde    # captures du pont entre les deux échelles
npm run visuel:sporange # captures de la sporulation
```

Trois optiques : contraste de phase, fond noir, microscopie électronique.

`cadre.html` est la version contemplative figée : la simulation seule, plein
cadre, sans panneau. Une hyphe différente à chaque chargement.

`branche.html` est la ramification **dans le moteur** : une branche est un
second axe, la silhouette est l'union des deux tubes (minimum adouci de leurs
deux distances signées), et la fille a son propre Spitzenkörper. On peut suivre
la jonction, la mère ou la fille.

`thalle.html` est l'**échelle macro** : une spore germe, la colonie ramifie
toutes les 110 µm d'hyphe construite, s'auto-évite, s'anastomose et consomme son
substrat. La vitesse des pointes n'y est pas choisie — c'est celle que le banc
mesure sur la simulation apicale, et un verdict refuse l'écart.

`monde.html` est le **pont entre les deux échelles** : on regarde la colonie,
on clique sur une pointe, on descend sur son apex, on remonte. L'axe n'est
jamais interrompu — zoomer attache un intérieur à un axe qui existe déjà — et
le fondu dure exactement le temps que met le réservoir apical à se remplir,
pendant lequel la colonie entière vit.

`sporange.html` est la **sporulation**, forme sporocyste : rhizoïdes,
sporangiophore qui monte vers l'observateur, columelle, sac qui se remplit de
spores par clivage, puis déchirure et envol. La mise au point suit la pointe —
c'est elle qui raconte la scène.

`ramification.html` est la proposition qui a précédé : trois concepts
d'animation, avec les silhouettes calculées hors ligne. Le mécanisme retenu
(A, second Spitzenkörper sub-apical) est maintenant implémenté.

`livraison.html` est une page de mise au point dédiée à la fusion des vésicules :
même simulation, caméra collée à l'événement, curseur de rembobinage.

`artefact.html` est la version publiée sur claude.ai : même simulation, sans
squelette HTML (la plateforme le fournit), avec le texte de présentation.

Cohérent avec Lew RR, *How does a hypha grow? The biophysics of pressurized
growth in fungi*, Nature Reviews Microbiology 9:509 (2011) — voir
`docs/01-physiologie.md` pour ce qui est repris et ce qui est simplifié.

Lire `CLAUDE.md` avant de toucher au code.
