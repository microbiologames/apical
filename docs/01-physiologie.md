# Physiologie retenue

Source principale : **Lew RR, *How does a hypha grow? The biophysics of
pressurized growth in fungi*, Nature Reviews Microbiology 9:509–518 (2011)**
(`Apex_references/Mecanisms/nrmicro2591.pdf`).

## Les chiffres de la publi

| Grandeur | Valeur | Où |
|---|---|---|
| Vitesse de colonie | 10–100 µm/min selon organisme, nutriments, température | p. 509 |
| Croissance d'une hyphe de *Neurospora crassa* | **20 µm/min** avant traitement | fig. 3a |
| Turgescence de *N. crassa* | **600 kPa** | fig. 3a |
| Diamètre hyphal | ~15 µm | encadré 2 |
| Vitesse du flux de masse | **5 µm/s**, mesuré à 1–1,5 cm du front | encadré 2 |
| Nombre de Péclet | ≈ 1 : flux et diffusion contribuent également pour un métabolite ; pour un organite, le flux domine | encadré 2 |
| Récupération de turgescence | H⁺-ATPase activée, puis entrée de K⁺, puis reprise de la croissance ; le glycérol suit, en retard | fig. 3c–e, fig. 4 |

## Les mécanismes retenus

**Force motrice.** ΔP = RT(cᵢ − cₒ). L'eau entre là où la paroi cède, donc
surtout à la pointe, et le flux décroît exponentiellement derrière
(fig. 2b). Dans la simulation la turgescence n'est pas modélisée : son seul
effet visible est l'extension, qui est déjà portée par les fusions.

**Extension orthogonale.** Maximale à la pointe, nulle dès la pleine largeur
atteinte (Reinhardt 1892, cité p. 509). C'est exactement le profil `W(s)` :
la paroi ne bouge plus au-delà de `s = Lc`.

**Gradient de Ca²⁺ apical.** Chez *N. crassa* le Ca²⁺ n'entre pas
préférentiellement à la pointe : le gradient est **entretenu de l'intérieur**.
Une phospholipase C activée par l'étirement produit de l'InsP₃, l'InsP₃ libère
le Ca²⁺ des stocks internes à la pointe, et **le Ca²⁺ provoque la fusion des
vésicules** ; le RE (Ca²⁺-ATPase) et les mitochondries apicales le repompent
juste derrière (fig. 6a).

C'est le cœur du modèle : `Contenu.ca(s, φ, φcible)` = un terme apical
`exp(−s/2,3)`, un terme angulaire gaussien autour de la consigne, et un pulse.
Rien d'autre ne pilote la croissance.

**Flux de masse.** Le réseau hyphal se comporte comme un réseau de tubes
micro-hydrauliques : un gradient de pression intra-hyphal déplace tout ce qui
n'est pas ancré, sans discrimination (fig. 5, encadré 2). D'où le fait que
grains, organites et vésicules subissent **le même** champ de vitesse.

**Extension pulsée.** Elle découle du modèle plutôt qu'elle n'y est imposée :
le pulse de Ca²⁺ cadence la libération des vésicules, donc les fusions, donc
l'extension. Période ~5,5 s, avec une seconde composante non commensurable
pour éviter le battement.

## Complément hors publi

- **Zone apicale sans organites.** Observation MET (`Apex_references/Art/c.jpg`
  et `Mecanisms/a.jpg`) : la calotte ne contient que des vésicules. Codé comme
  un répoussoir doux, propre à chaque organite pour éviter l'empilement.
- **Épaisseur de paroi** 0,1–0,3 µm, d'où un liseré en épaisseur écran bornée.
- **Maturation de la paroi** : mince et plastique à l'apex, épaisse et rigide
  derrière. Rampe sur 8,5 µm.
- **Deux populations de vésicules** : chitosomes 30–40 nm (chitine synthase) et
  macrovésicules 70–100 nm (matériau de paroi).
