/* ---------------------------------------------------------------------------
   Trois optiques.

   La consigne est « quelque chose entre le contraste de phase et la MET ».
   Ce sont deux inversions opposees : en phase le cytoplasme est PLUS SOMBRE
   que le fond et la paroi porte un halo CLAIR ; en MET tout est sombre sur
   fond clair et il n'y a pas de halo ; en fond noir (la video de reference)
   le fond est noir et c'est la paroi qui brille.

   Le moteur de rendu ne connait aucun de ces cas : il pose toujours
   « fond, cytoplasme, grain, paroi, halo » et c'est la palette qui decide du
   sens. Ajouter une optique = ajouter une entree ici, rien d'autre.

   Regle apprise a la dure : une vesicule remplie de la couleur du cytoplasme
   est une vesicule invisible. `vesicule` doit trancher NETTEMENT sur `cyto`.
--------------------------------------------------------------------------- */

export const PALETTES = {
  phase: {
    nom: 'Contraste de phase',
    note: 'Ce que donne un objectif a phase sur gelose : le cytoplasme absorbe, la paroi porte un halo clair.',
    fond: '#c9c5cf',
    fondBord: '#a9a5b2',      // vignetage
    cyto: '#8f8b9c',
    cytoBord: '#726e80',      // assombrissement au bord du cylindre
    grainClair: '#a9a5b6',
    grainSombre: '#6b6778',
    paroi: '#f4f2f8',
    paroiJeune: '#ddd9e6',    // la paroi apicale est mince et peu contrastee
    halo: '#ffffff',
    haloForce: 0.40,
    vesicule: '#d9d6e4',
    vesiculeRim: '#ffffff',
    molecule: '#f6f4fa',
    membrane: '#55515f',
    periplasme: '#bcb8c8',
    paroiFraiche: '#ffffff',
    milieuGrain: '#b2aeba',
    milieuDebris: '#9a96a6',
    milieuClair: '#e9e7f0',
    noyau: '#87838f',
    nucleole: '#736f7e',
    mito: '#7c788a',
    vacuole: '#c2bfce',
    grainForce: 0.55,
    texture: 0.16,
    bruit: 0.030,
    dither: 0.16,
  },

  noir: {
    nom: 'Fond noir',
    note: 'Le rendu de la video de reference : rien ne diffuse hors de l\'hyphe, la paroi est un liseré lumineux.',
    fond: '#06070a',
    fondBord: '#000000',
    cyto: '#33363e',
    cytoBord: '#1d1f25',
    grainClair: '#5d626d',
    grainSombre: '#24262c',
    paroi: '#e6eaf2',
    paroiJeune: '#9aa0ac',
    halo: '#8f97a6',
    haloForce: 0.24,
    vesicule: '#aab0bd',
    vesiculeRim: '#f2f5fa',
    molecule: '#cfd5e0',
    membrane: '#949ba6',
    periplasme: '#575d67',
    paroiFraiche: '#ffffff',
    milieuGrain: '#191b20',
    milieuDebris: '#252930',
    milieuClair: '#394049',
    noyau: '#3d4048',
    nucleole: '#666b76',
    mito: '#575c66',
    vacuole: '#23262d',
    grainForce: 0.75,
    texture: 0.26,
    bruit: 0.042,
    dither: 0.20,
  },

  met: {
    nom: 'Microscopie electronique',
    note: 'Coupe ultrafine contrastee : tout est sombre sur la resine claire, pas de halo, granulation fine.',
    fond: '#ded9d0',
    fondBord: '#c3bdb2',
    cyto: '#a79f92',
    cytoBord: '#8b8376',
    grainClair: '#b8b1a5',
    grainSombre: '#6d665b',
    paroi: '#4e4941',
    paroiJeune: '#6f6a60',
    halo: '#5a544b',
    haloForce: 0.12,
    vesicule: '#55503f',      // les chitosomes sont electrodenses : SOMBRES
    vesiculeRim: '#2e2b26',
    molecule: '#3d3932',
    /* En MET la membrane plasmique EST une ligne sombre : c'est la seule
       des trois optiques ou on la voit vraiment. */
    membrane: '#39352e',
    periplasme: '#c2bbae',
    paroiFraiche: '#2b2822',
    milieuGrain: '#d1cbc1',
    milieuDebris: '#c0b9ad',
    milieuClair: '#f0ece5',
    noyau: '#8e8679',
    nucleole: '#585144',
    mito: '#575046',
    vacuole: '#d2ccc2',
    grainForce: 0.85,
    texture: 0.20,
    bruit: 0.024,
    dither: 0.13,
  },
};

export const ORDRE_PALETTES = ['phase', 'noir', 'met'];
