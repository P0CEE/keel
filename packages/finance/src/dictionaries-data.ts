// The deterministic dictionaries of the categorization ladder (ADR 0007),
// generated from ramnn's on 2026-09-29 with keel's category keys. Each entry
// is unambiguous by construction: a brand of one category only, a merchant
// category code whose category is certain. The model decides the rest.

export type BrandEntry = {
  /** Normalized tokens (or long distinctive substrings) to look for. */
  readonly patterns: readonly string[];
  readonly name: string;
  readonly domain: string;
  readonly key: string;
};

export const BRANDS: readonly BrandEntry[] = [
  {
    patterns: ["railway"],
    name: "Railway",
    domain: "railway.com",
    key: "telecom.software",
  },
  {
    patterns: ["cloudflare"],
    name: "Cloudflare",
    domain: "cloudflare.com",
    key: "telecom.software",
  },
  {
    patterns: ["vercel"],
    name: "Vercel",
    domain: "vercel.com",
    key: "telecom.software",
  },
  {
    patterns: ["netlify"],
    name: "Netlify",
    domain: "netlify.com",
    key: "telecom.software",
  },
  {
    patterns: ["github"],
    name: "GitHub",
    domain: "github.com",
    key: "telecom.software",
  },
  {
    patterns: ["gitlab"],
    name: "GitLab",
    domain: "gitlab.com",
    key: "telecom.software",
  },
  {
    patterns: ["digitalocean"],
    name: "DigitalOcean",
    domain: "digitalocean.com",
    key: "telecom.software",
  },
  {
    patterns: ["supabase"],
    name: "Supabase",
    domain: "supabase.com",
    key: "telecom.software",
  },
  {
    patterns: ["planetscale"],
    name: "PlanetScale",
    domain: "planetscale.com",
    key: "telecom.software",
  },
  {
    patterns: ["openai", "chatgpt"],
    name: "OpenAI",
    domain: "openai.com",
    key: "telecom.software",
  },
  {
    patterns: ["anthropic", "claudeai"],
    name: "Anthropic",
    domain: "anthropic.com",
    key: "telecom.software",
  },
  {
    patterns: ["notion"],
    name: "Notion",
    domain: "notion.so",
    key: "telecom.software",
  },
  {
    patterns: ["figma"],
    name: "Figma",
    domain: "figma.com",
    key: "telecom.software",
  },
  {
    patterns: ["jetbrains"],
    name: "JetBrains",
    domain: "jetbrains.com",
    key: "telecom.software",
  },
  {
    patterns: ["datadog"],
    name: "Datadog",
    domain: "datadoghq.com",
    key: "telecom.software",
  },
  {
    patterns: ["sentry"],
    name: "Sentry",
    domain: "sentry.io",
    key: "telecom.software",
  },
  {
    patterns: ["namecheap"],
    name: "Namecheap",
    domain: "namecheap.com",
    key: "telecom.software",
  },
  {
    patterns: ["financialmodelingprep", "fmp"],
    name: "Financial Modeling Prep",
    domain: "financialmodelingprep.com",
    key: "telecom.software",
  },
  {
    patterns: ["aws"],
    name: "Amazon Web Services",
    domain: "aws.amazon.com",
    key: "telecom.software",
  },
  {
    patterns: ["gcp", "googlecloud"],
    name: "Google Cloud",
    domain: "cloud.google.com",
    key: "telecom.software",
  },
  {
    patterns: ["ovh"],
    name: "OVHcloud",
    domain: "ovhcloud.com",
    key: "telecom.software",
  },
  {
    patterns: ["twitch"],
    name: "Twitch",
    domain: "twitch.tv",
    key: "leisure.streaming",
  },
];

/** Merchant category codes (ISO 18245) whose category is certain. */
export const MCC_EXACT: Readonly<Record<string, string>> = {
  "5411": "food.groceries", // Grocery stores, supermarkets
  "5422": "food.groceries", // Freezer & locker meat provisioners
  "5441": "food.groceries", // Candy, nut & confectionery stores
  "5451": "food.groceries", // Dairy products stores
  "5462": "food.groceries", // Bakeries
  "5499": "food.groceries", // Misc food stores / convenience
  "4111": "transport.transit", // Local/suburban commuter transport
  "4112": "transport.transit", // Passenger railways
  "4121": "transport.taxi", // Taxicabs & rideshare
  "4131": "transport.transit", // Bus lines
  "4784": "transport.parking", // Tolls & bridge fees
  "4789": "transport.other", // Transportation services (not elsewhere classified)
  "5541": "transport.fuel", // Service stations (fuel)
  "5542": "transport.fuel", // Automated fuel dispensers
  "7523": "transport.parking", // Parking lots & garages
  "4411": "travel.transport", // Cruise lines
  "4511": "travel.transport", // Airlines (not elsewhere classified)
  "4722": "travel.other", // Travel agencies & tour operators
  "7011": "travel.lodging", // Lodging - hotels, motels, resorts
  "5912": "health.pharmacy", // Drug stores & pharmacies
  "8011": "health.doctor", // Doctors & physicians
  "8021": "health.doctor", // Dentists & orthodontists
  "8031": "health.doctor", // Osteopaths
  "8041": "health.doctor", // Chiropractors
  "8042": "health.doctor", // Optometrists & ophthalmologists
  "8043": "health.other", // Opticians & eyeglasses (retail, not a practitioner)
  "8049": "health.doctor", // Podiatrists & chiropodists
  "8050": "health.other", // Nursing & personal care facilities
  "8062": "health.doctor", // Hospitals
  "8071": "health.other", // Medical & dental laboratories
  "8099": "health.other", // Medical services & health practitioners (NEC)
  "8211": "family.school", // Elementary & secondary schools
  "8220": "family.school", // Colleges, universities, professional schools
  "8241": "family.lessons", // Correspondence schools
  "8244": "family.lessons", // Business & secretarial schools
  "8249": "family.lessons", // Vocational & trade schools
  "8299": "family.lessons", // Educational services (NEC)
  "4814": "telecom.other", // Telecom services (mobile vs internet is ambiguous)
  "4899": "leisure.streaming", // Cable, satellite & other pay TV/radio
  "4900": "housing.energy", // Utilities - electric, gas, water, sanitary
  "6513": "housing.rent", // Real estate agents & managers - rentals
  "6211": "movements.securities", // Security brokers & dealers
  "5734": "telecom.software", // Computer software stores
  "7372": "telecom.software", // Computer programming, data processing, integrated systems
  "7230": "shopping.beauty", // Barber & beauty shops (hairdresser)
  "7297": "shopping.beauty", // Massage parlors
  "7298": "shopping.beauty", // Health & beauty spas
  "7832": "leisure.outings", // Motion picture theaters / cinemas
  "7922": "leisure.outings", // Theatrical producers & ticket agencies
  "7991": "leisure.outings", // Tourist attractions & exhibits
  "7992": "leisure.sport", // Public golf courses
  "7994": "leisure.gaming", // Video game arcades
  "7995": "leisure.betting", // Betting: casinos, lotteries, online gambling
  "7996": "leisure.outings", // Amusement parks, carnivals, circuses
  "7997": "leisure.sport", // Membership clubs (sports, recreation)
  "7998": "leisure.outings", // Aquariums, zoos, seaquariums
  "7999": "leisure.other", // Recreation services (NEC)
  "5311": "shopping.other", // Department stores
  "5331": "shopping.other", // Variety stores
  "5611": "shopping.clothing", // Men's & boys' clothing
  "5621": "shopping.clothing", // Women's ready-to-wear
  "5631": "shopping.clothing", // Women's accessory & specialty
  "5641": "shopping.clothing", // Children's & infants' wear
  "5651": "shopping.clothing", // Family clothing stores
  "5655": "shopping.clothing", // Sports & riding apparel
  "5661": "shopping.clothing", // Shoe stores
  "5691": "shopping.clothing", // Men's & women's clothing
  "5699": "shopping.clothing", // Misc apparel & accessories
  "5732": "shopping.electronics", // Electronics stores
  "5733": "leisure.hobbies", // Music stores - instruments
  "5944": "shopping.other", // Jewelry & watches
  "5945": "shopping.other", // Hobby, toy & game shops (toys vs hobby is ambiguous)
  "5946": "shopping.electronics", // Camera & photographic supply
  "5947": "shopping.gifts", // Gift, card, novelty & souvenir
  "5949": "leisure.hobbies", // Sewing, needlework, fabric
  "5970": "leisure.hobbies", // Artist supply & craft shops
  "5992": "shopping.gifts", // Florists
  "5999": "shopping.other", // Misc retail stores
};

export const MCC_RANGES: readonly {
  readonly min: number;
  readonly max: number;
  readonly key: string;
}[] = [
  { min: 3000, max: 3299, key: "travel.transport" }, // Airlines (per carrier)
  { min: 3500, max: 3999, key: "travel.lodging" }, // Lodging (per chain)
];
