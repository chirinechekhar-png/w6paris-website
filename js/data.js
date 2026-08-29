/* W6 PARIS — product catalogue (FR/EN) */

const PRODUCTS = [
  {
    handle: "diffuseur-i6",
    type: "diffuser",
    name: { fr: "Diffuseur i6", en: "Diffuser i6" },
    family: { fr: "Diffuseur", en: "Diffuser" },
    tagline: { fr: "L'art du parfum réinventé", en: "The art of fragrance, reinvented" },
    price: 199.99,
    weightKg: 3.5,
    stock: {"Noir":1,"Gris":1},
    images: ["images/i6-new-1.webp", "images/i6-new-2.webp", "images/i6-new-3.png", "images/i6-new-4.png", "images/i6-new-5.jpg"],
    colorImages: {
      "Noir": ["images/i6-new-1.webp", "images/i6-new-2.webp", "images/i6-new-3.png", "images/i6-new-4.png", "images/i6-new-5.jpg"],
      "Gris": ["images/i6-new-1.webp", "images/i6-new-2.webp", "images/i6-new-3.png", "images/i6-new-4.png", "images/i6-new-5.jpg"]
    },
    freeGift: {
      fr: "Un parfum offert au choix avec votre diffuseur",
      en: "One fragrance of your choice, free with your diffuser"
    },
    desc: {
      fr: "Conçu pour les intérieurs d'exception, le Diffuseur i6 associe une technologie de nébulisation de précision à un pilotage intuitif, pour une atmosphère à votre image. Nos huiles, formulées à Grasse, berceau du parfum, et conformes aux normes IFRA, se révèlent ici dans toute leur pureté.",
      en: "Designed for exceptional interiors, the Diffuser i6 pairs precision cold-nebulization technology with intuitive control to shape an atmosphere that reflects you. Our oils, composed in Grasse — the cradle of perfumery — and compliant with IFRA standards, are revealed here in all their purity."
    },
    features: [
      { fr: "Nébulisation à froid", en: "Cold nebulization" },
      { fr: "Intensité sur mesure", en: "Custom intensity" },
      { fr: "Ligne épurée", en: "Sleek silhouette" },
      { fr: "Rayonnement jusqu'à 100 m²", en: "Coverage up to 100 m²" },
      { fr: "Pilotage connecté (Bluetooth)", en: "Connected control (Bluetooth)" }
    ],
    options: [
      {
        key: "color",
        name: { fr: "Couleur", en: "Colour" },
        values: [
          { label: "Noir", price: 0 },
          { label: "Gris", price: 0 }
        ]
      },
      {
        key: "fragrance",
        name: { fr: "Senteur offerte", en: "Free fragrance" },
        free: true,
        values: [
          { label: "Ambre Divine" },
          { label: "Ébène" },
          { label: "Ispahan" },
          { label: "Secret Garden" },
          { label: "Midnight" },
          { label: "Un Jardin à Rio" },
          { label: "Rosewood" }
        ]
      }
    ]
  },
  {
    handle: "diffuseur-i7",
    type: "diffuser",
    name: { fr: "Diffuseur i7", en: "Diffuser i7" },
    family: { fr: "Diffuseur", en: "Diffuser" },
    tagline: { fr: "La signature olfactive absolue", en: "The absolute olfactory signature" },
    price: 249.0,
    weightKg: 3,
    stock: {"Gris":18},
    images: ["images/i7-new-1.webp", "images/i7-new-2.jpg", "images/i7-new-3.jpg", "images/i7-new-4.jpg", "images/i7-new-5.jpg", "images/i7-new-6.jpg", "images/i7-new-7.webp", "images/i7-new-8.webp"],
    colorImages: {
      "Gris": ["images/i7-new-1.webp", "images/i7-new-2.jpg", "images/i7-new-3.jpg", "images/i7-new-4.jpg", "images/i7-new-5.jpg", "images/i7-new-6.jpg", "images/i7-new-7.webp", "images/i7-new-8.webp"]
    },
    freeGift: {
      fr: "Un parfum offert au choix avec votre diffuseur",
      en: "One fragrance of your choice, free with your diffuser"
    },
    desc: {
      fr: "Le Diffuseur i7 est un système de diffusion haut de gamme, sans chaleur, pensé pour les espaces les plus raffinés. Sa technologie brevetée de diffusion à froid disperse avec finesse nos huiles parfumées, formulées à Grasse, pour une expérience sensorielle d'exception, sans jamais en altérer la richesse. Maison, hôtel ou espace professionnel : le Diffuseur i7 façonne une identité olfactive unique, à la mesure de chaque lieu.",
      en: "The Diffuser i7 is a high-end, heat-free diffusion system designed for the most refined spaces. Its patented cold-diffusion technology finely disperses our fragrance oils, composed in Grasse, for an exceptional sensory experience — never altering their richness. Home, hotel or professional space: the Diffuser i7 shapes a unique olfactory identity, in keeping with every place."
    },
    features: [
      { fr: "Diffusion à froid", en: "Cold diffusion" },
      { fr: "Rayonnement généreux", en: "Generous coverage" },
      { fr: "Ligne épurée", en: "Sleek silhouette" },
      { fr: "Pilotage connecté", en: "Connected control" }
    ],
    options: [
      {
        key: "color",
        name: { fr: "Couleur", en: "Colour" },
        values: [
          { label: "Gris", price: 0 }
        ]
      },
      {
        key: "fragrance",
        name: { fr: "Senteur offerte", en: "Free fragrance" },
        free: true,
        values: [
          { label: "Ambre Divine" },
          { label: "Ébène" },
          { label: "Ispahan" },
          { label: "Secret Garden" },
          { label: "Midnight" },
          { label: "Un Jardin à Rio" },
          { label: "Rosewood" }
        ]
      }
    ]
  },
  {
    handle: "diffuseur-nomade",
    type: "diffuser",
    name: { fr: "Diffuseur Nomade", en: "Nomade Diffuser" },
    family: { fr: "Diffuseur", en: "Diffuser" },
    tagline: { fr: "L'élégance qui vous suit partout", en: "Elegance that follows you everywhere" },
    badge: { fr: "Meilleure vente", en: "Best seller" },
    price: 89.99,
    weightKg: 0.9,
    stock: {"Noir":23,"Gris":3},
    images: ["images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg", "images/nomade-new-4.jpg", "images/nomade-new-5.jpg", "images/nomade-new-6.jpg", "images/nomade-video.mp4"],
    colorImages: {
      "Noir": ["images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg", "images/nomade-new-4.jpg", "images/nomade-new-5.jpg", "images/nomade-new-6.jpg", "images/nomade-video.mp4"],
      "Gris": ["images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg", "images/nomade-new-4.jpg", "images/nomade-new-5.jpg", "images/nomade-new-6.jpg", "images/nomade-video.mp4"]
    },
    freeGift: {
      fr: "Un parfum offert au choix avec votre diffuseur",
      en: "One fragrance of your choice, free with your diffuser"
    },
    desc: {
      fr: "Compact et raffiné, le Diffuseur Nomade utilise la nébulisation à froid pour préserver chaque nuance de nos huiles parfumées, formulées à Grasse, capitale mondiale du parfum. Pensé pour les espaces jusqu'à 45 m², il installe une atmosphère douce et apaisante, où que vous soyez.",
      en: "Compact and refined, the Nomade Diffuser uses cold nebulization to preserve every nuance of our fragrance oils, composed in Grasse — the world capital of perfume. Designed for spaces up to 45 m², it creates a soft, soothing atmosphere wherever you are."
    },
    features: [
      { fr: "Diffusion homogène pour pièces jusqu'à 40 m²", en: "Even diffusion for rooms up to 40 m²" },
      { fr: "Simplicité absolue : un bouton", en: "Absolute simplicity: one button" },
      { fr: "Sans chaleur, pour révéler chaque fragrance", en: "Heat-free, revealing every fragrance in full depth" }
    ],
    options: [
      {
        key: "color",
        name: { fr: "Couleur", en: "Colour" },
        values: [
          { label: "Noir", price: 0 },
          { label: "Gris", price: 0 }
        ]
      },
      {
        key: "fragrance",
        name: { fr: "Senteur offerte", en: "Free fragrance" },
        free: true,
        values: [
          { label: "Ambre Divine" },
          { label: "Ébène" },
          { label: "Ispahan" },
          { label: "Secret Garden" },
          { label: "Midnight" },
          { label: "Un Jardin à Rio" },
          { label: "Rosewood" }
        ]
      }
    ]
  },
  {
    handle: "ambre-divine",
    type: "oil",
    name: { fr: "Ambre Divine", en: "Ambre Divine" },
    family: { fr: "Oriental boisé", en: "Amber Woody" },
    tagline: { fr: "Un souffle chaud et enveloppant, entre sensualité et sérénité.", en: "A warm, enveloping breath — between sensuality and serenity." },
    badge: { fr: "Meilleure vente", en: "Best seller" },
    art: "p-ambre",
    images: ["images/scent-ambre.jpg", "images/oil-new-1.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Bergamote, cardamome", en: "Bergamot, cardamom" },
      heart: { fr: "Rose, jasmin", en: "Rose, jasmine" },
      base: { fr: "Ambre, vanille, musc blanc", en: "Amber, vanilla, white musk" }
    },
    desc: {
      fr: "Une fragrance ambrée, enveloppante et raffinée, pensée pour les intérieurs qui aiment les ambiances profondes et chaleureuses.",
      en: "An amber, enveloping and refined fragrance, created for interiors that love deep, warm atmospheres."
    }
  },
  {
    handle: "ebene",
    type: "oil",
    name: { fr: "Ébène", en: "Ébène" },
    family: { fr: "Boisé fumé", en: "Smoky Woody" },
    tagline: { fr: "La profondeur mystérieuse du bois précieux, noble et intemporel.", en: "The mysterious depth of precious wood — noble and timeless." },
    art: "p-ebene",
    images: ["images/scent-ebene.jpg", "images/oil-new-2.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Poivre noir, vétiver", en: "Black pepper, vetiver" },
      heart: { fr: "Cèdre, oud", en: "Cedar, oud" },
      base: { fr: "Ébène, mousse de chêne, ambre gris", en: "Ebony, oakmoss, grey amber" }
    },
    desc: {
      fr: "Un boisé fumé et intense, pour une signature puissante, sombre et élégante.",
      en: "An intense, smoky woody scent — a powerful, dark and elegant signature."
    }
  },
  {
    handle: "ispahan",
    type: "oil",
    name: { fr: "Ispahan", en: "Ispahan" },
    family: { fr: "Floral oriental", en: "Oriental Floral" },
    tagline: { fr: "Un voyage en Orient, floral et épicé comme un jardin persan au crépuscule.", en: "A journey to the Orient — floral and spicy, like a Persian garden at dusk." },
    art: "p-ispahan",
    images: ["images/scent-ispahan.jpg", "images/oil-new-3.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Rose de Damas, litchi", en: "Damask rose, lychee" },
      heart: { fr: "Jasmin, patchouli", en: "Jasmine, patchouli" },
      base: { fr: "Oud, encens, musc", en: "Oud, incense, musk" }
    },
    desc: {
      fr: "Une rose orientale sublimée d'épices, mille senteurs pour un voyage sensoriel unique.",
      en: "An oriental rose elevated with spices — a thousand scents for a unique sensory journey."
    }
  },
  {
    handle: "secret-garden",
    type: "oil",
    name: { fr: "Secret Garden", en: "Secret Garden" },
    family: { fr: "Floral vert", en: "Green Floral" },
    tagline: { fr: "La fraîcheur d'un jardin secret au petit matin, vert et délicat.", en: "The freshness of a secret garden at dawn — green and delicate." },
    art: "p-secret",
    images: ["images/scent-jardin-secret.jpg", "images/oil-new-4.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Feuille de violette, poire", en: "Violet leaf, pear" },
      heart: { fr: "Pivoine, muguet", en: "Peony, lily of the valley" },
      base: { fr: "Mousse blanche, cèdre, musc doux", en: "White moss, cedar, soft musk" }
    },
    desc: {
      fr: "Une escapade au cœur de la nature, fraîche et florale, à la fois limpide et apaisante.",
      en: "An escape into the heart of nature — fresh, floral, limpid and calming."
    }
  },
  {
    handle: "midnight",
    type: "oil",
    name: { fr: "Midnight", en: "Midnight" },
    family: { fr: "Chypré cuiré", en: "Leather Chypre" },
    tagline: { fr: "L'élégance de la nuit — sombre, sensuel, inoubliable.", en: "The elegance of the night — dark, sensual, unforgettable." },
    art: "p-midnight",
    images: ["images/scent-midnight.jpg", "images/oil-new-5.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Bergamote noire, poivre rose", en: "Black bergamot, pink pepper" },
      heart: { fr: "Iris, vétiver fumé", en: "Iris, smoked vetiver" },
      base: { fr: "Cuir, ambre noir, musc", en: "Leather, black amber, musk" }
    },
    desc: {
      fr: "Une fragrance captivante pour les nuits d'exception, mystérieuse et magnétique.",
      en: "A captivating fragrance for exceptional nights — mysterious and magnetic."
    }
  },
  {
    handle: "un-jardin-a-rio",
    type: "oil",
    name: { fr: "Un Jardin à Rio", en: "Un Jardin à Rio" },
    family: { fr: "Floral fruité", en: "Fruity Floral" },
    tagline: { fr: "L'éclat tropical d'un jardin brésilien sous le soleil de midi.", en: "The tropical radiance of a Brazilian garden under the midday sun." },
    badge: { fr: "Meilleure vente", en: "Best seller" },
    art: "p-rio",
    images: ["images/scent-rio.jpg", "images/oil-new-6.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Citron vert, goyave, feuille de bananier", en: "Lime, guava, banana leaf" },
      heart: { fr: "Jasmin blanc, fleur de tiaré", en: "White jasmine, tiare flower" },
      base: { fr: "Santal, musc solaire", en: "Sandalwood, solar musk" }
    },
    desc: {
      fr: "Vivacité tropicale et notes fruitées : l'évasion à portée de nez.",
      en: "Tropical vibrancy and fruity notes — escape within a breath."
    }
  },
  {
    handle: "rosewood",
    type: "oil",
    name: { fr: "Rosewood", en: "Rosewood" },
    family: { fr: "Floral boisé", en: "Woody Floral" },
    tagline: { fr: "La douceur boisée et florale du bois de rose, pure et apaisante.", en: "The woody, floral softness of rosewood — pure and calming." },
    badge: { fr: "Meilleure vente", en: "Best seller" },
    art: "p-rosewood",
    images: ["images/scent-bois-de-rose.jpg", "images/oil-new-7.jpg"],
    stock: {"10 ml":100,"100 ml":100},
    options: [
      {
        key: "size",
        name: { fr: "Format", en: "Size" },
        values: [
          { label: "10 ml", price: 18, weightKg: 0.15 },
          { label: "100 ml", price: 40, weightKg: 0.35 }
        ]
      }
    ],
    notes: {
      top: { fr: "Bergamote, géranium", en: "Bergamot, geranium" },
      heart: { fr: "Rose, bois de rose", en: "Rose, rosewood" },
      base: { fr: "Santal, cèdre, musc crémeux", en: "Sandalwood, cedar, creamy musk" }
    },
    desc: {
      fr: "Une douceur élégante et intemporelle, entre le floral et le boisé.",
      en: "An elegant, timeless softness — between floral and woody."
    }
  },
  {
    handle: "pack-duo",
    type: "bundle",
    name: { fr: "Le Pack Duo", en: "The Duo Pack" },
    family: { fr: "2 Diffuseurs Nomade + 7 senteurs offertes", en: "2 Nomade Diffusers + 7 scents free" },
    tagline: { fr: "À deux, le parfum se partage", en: "Fragrance, best shared" },
    price: 179.99,
    compareAt: 305.98,
    weightKg: 2.85,
    stock: 3,
    badge: { fr: "Offre exclusive", en: "Exclusive offer" },
    images: ["images/pack.jpg", "images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg"],
    colorImages: {
      "Noir": ["images/pack.jpg", "images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg"],
      "Gris": ["images/pack.jpg", "images/nomade-new-1.jpg", "images/nomade-new-2.jpg", "images/nomade-new-3.jpg"]
    },
    desc: {
      fr: "Deux Diffuseurs Nomade et les sept fragrances de la collection en format 10 ml, offertes. Pour partager l'atmosphère W6 à deux — une pièce, deux adresses, ou un cadeau d'exception.",
      en: "Two Nomade Diffusers and all seven fragrances of the collection in 10 ml, free. Share the W6 atmosphere together — one room, two addresses, or an exceptional gift."
    },
    features: [
      { fr: "2 Diffuseurs Nomade (Noir ou Gris)", en: "2 Nomade Diffusers (Noir or Gris)" },
      { fr: "Les 7 fragrances de la collection en 10 ml offertes", en: "All 7 fragrances of the collection in 10 ml, free" },
      { fr: "Économisez 125,99 €", en: "Save €125.99" }
    ],
    options: [
      {
        key: "color1",
        name: { fr: "Diffuseur n°1 — Couleur", en: "Diffuser #1 — Colour" },
        values: [
          { label: "Noir", price: 0 },
          { label: "Gris", price: 0 }
        ]
      },
      {
        key: "color2",
        name: { fr: "Diffuseur n°2 — Couleur", en: "Diffuser #2 — Colour" },
        values: [
          { label: "Noir", price: 0 },
          { label: "Gris", price: 0 }
        ]
      }
    ]
  }
];

function getProduct(handle) {
  return PRODUCTS.find((p) => p.handle === handle);
}

function formatPrice(n) {
  return "€" + n.toFixed(2).replace(".", ",");
}

function oilProducts() {
  return PRODUCTS.filter((p) => p.type === "oil");
}

function diffuserProducts() {
  return PRODUCTS.filter((p) => p.type === "diffuser");
}

function productStock(handle) {
  const p = getProduct(handle);
  if (!p || p.stock == null) return 0;
  if (typeof p.stock === "number") return p.stock;
  return Object.values(p.stock).reduce((a, b) => a + (Number(b) || 0), 0);
}

function variantStock(p, label) {
  const s = p && p.stock;
  if (s && typeof s === "object") return Number(s[label]) || 0;
  return Number(s) || 0;
}
