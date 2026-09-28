# Apical

Simulation contemplative de la croissance apicale d'une hyphe fongique,
en pixel art vu au microscope. Sans dépendance, sans build.

```
npm run serve           # http://localhost:8080/
npm run banc            # 12 verdicts de mesure
npm run visuel          # captures de contrôle
npm run visuel:branche  # captures de la page ramification
```

Trois optiques : contraste de phase, fond noir, microscopie électronique.

`cadre.html` est la version contemplative figée : la simulation seule, plein
cadre, sans panneau. Une hyphe différente à chaque chargement.

`branche.html` est la ramification **dans le moteur** : une branche est un
second axe, la silhouette est l'union des deux tubes (minimum adouci de leurs
deux distances signées), et la fille a son propre Spitzenkörper. On peut suivre
la jonction, la mère ou la fille.

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
