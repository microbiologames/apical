# Apical

Simulation contemplative de la croissance apicale d'une hyphe fongique,
en pixel art vu au microscope. Sans dépendance, sans build.

```
npm run serve     # http://localhost:8080/
npm run banc      # 7 verdicts de mesure
npm run visuel    # captures de contrôle
```

Trois optiques : contraste de phase, fond noir, microscopie électronique.

`cadre.html` est la version contemplative figée : la simulation seule, plein
cadre, sans panneau. Une hyphe différente à chaque chargement.

`ramification.html` est une proposition : trois concepts d'animation pour la
ramification, avec les silhouettes calculées (union adoucie de deux distances
signées) qui prouvent qu'une branche reste un seul objet. En attente d'arbitrage.

`livraison.html` est une page de mise au point dédiée à la fusion des vésicules :
même simulation, caméra collée à l'événement, curseur de rembobinage.

`artefact.html` est la version publiée sur claude.ai : même simulation, sans
squelette HTML (la plateforme le fournit), avec le texte de présentation.

Cohérent avec Lew RR, *How does a hypha grow? The biophysics of pressurized
growth in fungi*, Nature Reviews Microbiology 9:509 (2011) — voir
`docs/01-physiologie.md` pour ce qui est repris et ce qui est simplifié.

Lire `CLAUDE.md` avant de toucher au code.
