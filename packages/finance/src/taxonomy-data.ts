// The system taxonomy's data (ADR 0012), generated from ramnn's on 2026-09-29
// with keel's stable keys. Changing a key breaks every row that references it:
// add, never rename. `ramnn` is the slug the ETL maps from (03-schema-mapping).

import type { TaxonomyGroup } from "./taxonomy";

export const SYSTEM_TAXONOMY: readonly TaxonomyGroup[] = [
  {
    key: "income",
    ramnn: "revenus",
    nature: "income",
    color: "green",
    icon: "income",
    label: {
      fr: "Revenus",
      en: "Income",
      description:
        "Money coming in: salary, pension, benefits, rental and investment income",
    },
    leaves: [
      {
        key: "income.salary",
        ramnn: "revenus-salaire",
        catchAll: false,
        label: {
          fr: "Salaire",
          en: "Salary",
          description:
            "Wages and salary payments from an employer, including bonuses and freelance invoices",
        },
      },
      {
        key: "income.pension",
        ramnn: "revenus-retraite",
        catchAll: false,
        label: {
          fr: "Retraite",
          en: "Pension",
          description: "Pension and retirement payments",
        },
      },
      {
        key: "income.benefits",
        ramnn: "revenus-aides",
        catchAll: false,
        label: {
          fr: "Aides & allocations",
          en: "Benefits",
          description:
            "Government benefits and allowances (family benefits, unemployment, housing aid)",
        },
      },
      {
        key: "income.investments",
        ramnn: "revenus-placements",
        catchAll: false,
        label: {
          fr: "Revenus de placements",
          en: "Investment income",
          description:
            "Dividends, interest and other investment income paid into the account",
        },
      },
      {
        key: "income.rental",
        ramnn: "revenus-locatifs",
        catchAll: false,
        label: {
          fr: "Revenus locatifs",
          en: "Rental income",
          description: "Rent collected from a property you own",
        },
      },
      {
        key: "income.refunds",
        ramnn: "revenus-remboursements",
        catchAll: false,
        label: {
          fr: "Remboursements",
          en: "Reimbursements",
          description:
            "Incoming refunds not tied to a specific spending category: cashback, overpayment recovery, expense reimbursements",
        },
      },
      {
        key: "income.gifts",
        ramnn: "revenus-dons",
        catchAll: false,
        label: {
          fr: "Argent reçu",
          en: "Money received",
          description: "Money received from family or friends as a gift",
        },
      },
      {
        key: "income.other",
        ramnn: "revenus-autres",
        catchAll: true,
        label: {
          fr: "Autres : Revenus",
          en: "Other: Income",
          description: "Income that fits no other income subcategory",
        },
      },
    ],
  },
  {
    key: "movements",
    ramnn: "mouvements",
    nature: "transfer",
    color: "mauve",
    icon: "transfer",
    label: {
      fr: "Mouvements internes",
      en: "Internal movements",
      description:
        "Internal money movements between your own accounts — neither income nor spending",
    },
    leaves: [
      {
        key: "movements.transfers",
        ramnn: "mouvements-virements",
        catchAll: false,
        label: {
          fr: "Virements",
          en: "Transfers",
          description:
            "Transfers between own accounts or person-to-person transfers with no commercial counterparty",
        },
      },
      {
        key: "movements.savings",
        ramnn: "mouvements-epargne",
        catchAll: false,
        label: {
          fr: "Épargne",
          en: "Savings",
          description:
            "Moves to or from a savings account (Livret A, savings plan)",
        },
      },
      {
        key: "movements.securities",
        ramnn: "mouvements-titres",
        catchAll: false,
        label: {
          fr: "Titres & placements",
          en: "Securities",
          description:
            "Cash moved to or from a brokerage or securities account (stock, crypto purchases)",
        },
      },
      {
        key: "movements.other",
        ramnn: "mouvements-autres",
        catchAll: true,
        label: {
          fr: "Autres : Mouvements internes",
          en: "Other: Internal movements",
          description:
            "Internal movements that fit no other movement subcategory",
        },
      },
    ],
  },
  {
    key: "housing",
    ramnn: "logement",
    nature: "expense",
    color: "purple",
    icon: "housing",
    label: {
      fr: "Logement",
      en: "Housing",
      description:
        "Home costs: rent, mortgage, utilities, insurance, works and furnishing",
    },
    leaves: [
      {
        key: "housing.rent",
        ramnn: "logement-loyer",
        catchAll: false,
        label: {
          fr: "Loyer",
          en: "Rent",
          description: "Rent paid to a landlord or property manager",
        },
      },
      {
        key: "housing.mortgage",
        ramnn: "logement-pret",
        catchAll: false,
        label: {
          fr: "Prêt immobilier",
          en: "Mortgage",
          description: "Mortgage or home-loan installments",
        },
      },
      {
        key: "housing.energy",
        ramnn: "logement-energie",
        catchAll: false,
        label: {
          fr: "Énergie",
          en: "Energy",
          description: "Electricity, gas and heating bills (EDF, Engie)",
        },
      },
      {
        key: "housing.water",
        ramnn: "logement-eau",
        catchAll: false,
        label: {
          fr: "Eau",
          en: "Water",
          description: "Water bills",
        },
      },
      {
        key: "housing.charges",
        ramnn: "logement-charges",
        catchAll: false,
        label: {
          fr: "Charges & copropriété",
          en: "Building charges",
          description:
            "Building charges, co-ownership fees and household services",
        },
      },
      {
        key: "housing.insurance",
        ramnn: "logement-assurance",
        catchAll: false,
        label: {
          fr: "Assurance habitation",
          en: "Home insurance",
          description: "Home insurance premiums",
        },
      },
      {
        key: "housing.renovation",
        ramnn: "logement-travaux",
        catchAll: false,
        label: {
          fr: "Travaux",
          en: "Renovation",
          description: "Renovation, repairs and craftsmen for the home",
        },
      },
      {
        key: "housing.furniture",
        ramnn: "logement-equipement",
        catchAll: false,
        label: {
          fr: "Équipement & mobilier",
          en: "Furniture & appliances",
          description:
            "Furniture, appliances and home equipment (IKEA, Darty white goods)",
        },
      },
      {
        key: "housing.other",
        ramnn: "logement-autres",
        catchAll: true,
        label: {
          fr: "Autres : Logement",
          en: "Other: Housing",
          description: "Housing costs that fit no other housing subcategory",
        },
      },
    ],
  },
  {
    key: "food",
    ramnn: "alimentation",
    nature: "expense",
    color: "orange",
    icon: "dining",
    label: {
      fr: "Alimentation",
      en: "Food & Groceries",
      description: "Food: groceries, restaurants and meal delivery",
    },
    leaves: [
      {
        key: "food.groceries",
        ramnn: "alimentation-courses",
        catchAll: false,
        label: {
          fr: "Courses",
          en: "Groceries",
          description: "Supermarkets, grocery stores, bakeries and food shops",
        },
      },
      {
        key: "food.restaurants",
        ramnn: "alimentation-restaurants",
        catchAll: false,
        label: {
          fr: "Restaurants & cafés",
          en: "Restaurants & cafés",
          description: "Restaurants, cafés, bars and fast food eaten out",
        },
      },
      {
        key: "food.delivery",
        ramnn: "alimentation-livraison",
        catchAll: false,
        label: {
          fr: "Livraison de repas",
          en: "Food delivery",
          description: "Meal delivery platforms (Uber Eats, Deliveroo)",
        },
      },
      {
        key: "food.other",
        ramnn: "alimentation-autres",
        catchAll: true,
        label: {
          fr: "Autres : Alimentation",
          en: "Other: Food & Groceries",
          description: "Food spending that fits no other food subcategory",
        },
      },
    ],
  },
  {
    key: "transport",
    ramnn: "transports",
    nature: "expense",
    color: "blue",
    icon: "transport",
    label: {
      fr: "Transports",
      en: "Transport",
      description:
        "Day-to-day transport: fuel, transit, taxi, parking and the vehicle itself",
    },
    leaves: [
      {
        key: "transport.fuel",
        ramnn: "transports-carburant",
        catchAll: false,
        label: {
          fr: "Carburant",
          en: "Fuel",
          description: "Fuel and vehicle charging (service stations)",
        },
      },
      {
        key: "transport.transit",
        ramnn: "transports-commun",
        catchAll: false,
        label: {
          fr: "Transports en commun",
          en: "Public transit",
          description:
            "Public transit passes and tickets (metro, bus, commuter rail)",
        },
      },
      {
        key: "transport.taxi",
        ramnn: "transports-taxi",
        catchAll: false,
        label: {
          fr: "Taxi & VTC",
          en: "Taxi & rideshare",
          description: "Taxis and rideshare (Uber, Bolt)",
        },
      },
      {
        key: "transport.parking",
        ramnn: "transports-parking",
        catchAll: false,
        label: {
          fr: "Parking & péages",
          en: "Parking & tolls",
          description: "Parking, road tolls and traffic fines",
        },
      },
      {
        key: "transport.maintenance",
        ramnn: "transports-entretien",
        catchAll: false,
        label: {
          fr: "Entretien du véhicule",
          en: "Vehicle maintenance",
          description: "Vehicle maintenance, repairs and technical inspection",
        },
      },
      {
        key: "transport.insurance",
        ramnn: "transports-assurance",
        catchAll: false,
        label: {
          fr: "Assurance auto",
          en: "Vehicle insurance",
          description: "Car, motorbike or bike insurance premiums",
        },
      },
      {
        key: "transport.loan",
        ramnn: "transports-credit",
        catchAll: false,
        label: {
          fr: "Crédit auto",
          en: "Car loan",
          description: "Car loan or vehicle lease installments",
        },
      },
      {
        key: "transport.other",
        ramnn: "transports-autres",
        catchAll: true,
        label: {
          fr: "Autres : Transports",
          en: "Other: Transport",
          description:
            "Transport spending that fits no other transport subcategory",
        },
      },
    ],
  },
  {
    key: "health",
    ramnn: "sante",
    nature: "expense",
    color: "green-light",
    icon: "health",
    label: {
      fr: "Santé",
      en: "Health",
      description: "Health: doctors, pharmacy and health insurance",
    },
    leaves: [
      {
        key: "health.doctor",
        ramnn: "sante-medecin",
        catchAll: false,
        label: {
          fr: "Médecin",
          en: "Doctor",
          description:
            "Doctors, dentists, specialists, hospitals and medical care",
        },
      },
      {
        key: "health.pharmacy",
        ramnn: "sante-pharmacie",
        catchAll: false,
        label: {
          fr: "Pharmacie",
          en: "Pharmacy",
          description: "Pharmacies and parapharmacy purchases",
        },
      },
      {
        key: "health.insurance",
        ramnn: "sante-mutuelle",
        catchAll: false,
        label: {
          fr: "Mutuelle",
          en: "Health insurance",
          description: "Health insurance and mutual premiums",
        },
      },
      {
        key: "health.other",
        ramnn: "sante-autres",
        catchAll: true,
        label: {
          fr: "Autres : Santé",
          en: "Other: Health",
          description: "Health spending that fits no other health subcategory",
        },
      },
    ],
  },
  {
    key: "shopping",
    ramnn: "shopping",
    nature: "expense",
    color: "yellow",
    icon: "shopping",
    label: {
      fr: "Shopping & personnel",
      en: "Shopping & Personal",
      description:
        "Personal shopping: clothing, electronics, personal care, gifts, pets",
    },
    leaves: [
      {
        key: "shopping.clothing",
        ramnn: "shopping-vetements",
        catchAll: false,
        label: {
          fr: "Vêtements",
          en: "Clothing",
          description: "Clothing, shoes and fashion accessories",
        },
      },
      {
        key: "shopping.electronics",
        ramnn: "shopping-hightech",
        catchAll: false,
        label: {
          fr: "High-tech",
          en: "Electronics",
          description:
            "Consumer electronics and gadgets (phones, computers, cameras)",
        },
      },
      {
        key: "shopping.beauty",
        ramnn: "shopping-beaute",
        catchAll: false,
        label: {
          fr: "Beauté & soins",
          en: "Personal care",
          description: "Hairdresser, beauty salon, spa and cosmetics",
        },
      },
      {
        key: "shopping.gifts",
        ramnn: "shopping-cadeaux",
        catchAll: false,
        label: {
          fr: "Cadeaux",
          en: "Gifts",
          description: "Gifts bought for others, flowers and souvenirs",
        },
      },
      {
        key: "shopping.pets",
        ramnn: "shopping-animaux",
        catchAll: false,
        label: {
          fr: "Animaux",
          en: "Pets",
          description: "Pet food, vet and pet supplies",
        },
      },
      {
        key: "shopping.tobacco",
        ramnn: "shopping-tabac",
        catchAll: false,
        label: {
          fr: "Tabac & vape",
          en: "Tobacco & vaping",
          description: "Tobacco, cigarettes and vaping products",
        },
      },
      {
        key: "shopping.other",
        ramnn: "shopping-autres",
        catchAll: true,
        label: {
          fr: "Autres : Shopping & personnel",
          en: "Other: Shopping & Personal",
          description:
            "General retail that fits no other shopping subcategory (department stores, misc purchases)",
        },
      },
    ],
  },
  {
    key: "leisure",
    ramnn: "loisirs",
    nature: "expense",
    color: "pink",
    icon: "entertainment",
    label: {
      fr: "Loisirs & sorties",
      en: "Leisure & Outings",
      description: "Leisure: streaming, sports, outings, gaming and hobbies",
    },
    leaves: [
      {
        key: "leisure.streaming",
        ramnn: "loisirs-streaming",
        catchAll: false,
        label: {
          fr: "Streaming & médias",
          en: "Streaming & media",
          description:
            "Consumer media subscriptions: video and music streaming, pay TV, press (Netflix, Spotify, Canal+)",
        },
      },
      {
        key: "leisure.sport",
        ramnn: "loisirs-sport",
        catchAll: false,
        label: {
          fr: "Sport & salle",
          en: "Sports & gym",
          description: "Gym memberships, sports clubs and sport equipment",
        },
      },
      {
        key: "leisure.outings",
        ramnn: "loisirs-sorties",
        catchAll: false,
        label: {
          fr: "Sorties",
          en: "Outings",
          description: "Cinema, concerts, museums, events and nights out",
        },
      },
      {
        key: "leisure.gaming",
        ramnn: "loisirs-gaming",
        catchAll: false,
        label: {
          fr: "Jeux vidéo",
          en: "Gaming",
          description: "Video games, in-game purchases and gaming services",
        },
      },
      {
        key: "leisure.betting",
        ramnn: "loisirs-paris",
        catchAll: false,
        label: {
          fr: "Paris & jeux d'argent",
          en: "Betting & gambling",
          description:
            "Sports betting, poker, lotteries and online gambling operators (deposits and winnings)",
        },
      },
      {
        key: "leisure.hobbies",
        ramnn: "loisirs-hobbies",
        catchAll: false,
        label: {
          fr: "Hobbies & passions",
          en: "Hobbies",
          description:
            "Hobby gear and creative pastimes (books, music instruments, crafts)",
        },
      },
      {
        key: "leisure.other",
        ramnn: "loisirs-autres",
        catchAll: true,
        label: {
          fr: "Autres : Loisirs & sorties",
          en: "Other: Leisure & Outings",
          description:
            "Leisure spending that fits no other leisure subcategory",
        },
      },
    ],
  },
  {
    key: "travel",
    ramnn: "voyages",
    nature: "expense",
    color: "green-deep",
    icon: "travel",
    label: {
      fr: "Voyages",
      en: "Travel",
      description:
        "Travel and vacations: long-distance transport, accommodation, rentals, activities",
    },
    leaves: [
      {
        key: "travel.transport",
        ramnn: "voyages-transport",
        catchAll: false,
        label: {
          fr: "Avion & train",
          en: "Flights & trains",
          description: "Flights, long-distance trains and ferries for a trip",
        },
      },
      {
        key: "travel.lodging",
        ramnn: "voyages-hebergement",
        catchAll: false,
        label: {
          fr: "Hébergement",
          en: "Accommodation",
          description: "Hotels, vacation rentals and campsites",
        },
      },
      {
        key: "travel.rental",
        ramnn: "voyages-location",
        catchAll: false,
        label: {
          fr: "Location de véhicule",
          en: "Vehicle rental",
          description: "Car or vehicle rental while traveling",
        },
      },
      {
        key: "travel.activities",
        ramnn: "voyages-activites",
        catchAll: false,
        label: {
          fr: "Activités & excursions",
          en: "Activities",
          description: "Tours, excursions and activities while traveling",
        },
      },
      {
        key: "travel.other",
        ramnn: "voyages-autres",
        catchAll: true,
        label: {
          fr: "Autres : Voyages",
          en: "Other: Travel",
          description: "Travel spending that fits no other travel subcategory",
        },
      },
    ],
  },
  {
    key: "family",
    ramnn: "famille",
    nature: "expense",
    color: "blue",
    icon: "baby",
    label: {
      fr: "Famille & éducation",
      en: "Family & Education",
      description:
        "Family and education: school, childcare, lessons, child support",
    },
    leaves: [
      {
        key: "family.school",
        ramnn: "famille-scolarite",
        catchAll: false,
        label: {
          fr: "Scolarité & études",
          en: "School & tuition",
          description:
            "School and university fees, canteen and school supplies",
        },
      },
      {
        key: "family.childcare",
        ramnn: "famille-garde",
        catchAll: false,
        label: {
          fr: "Garde d'enfants",
          en: "Childcare",
          description: "Childcare: nursery, nanny, babysitting",
        },
      },
      {
        key: "family.lessons",
        ramnn: "famille-cours",
        catchAll: false,
        label: {
          fr: "Cours & formation",
          en: "Lessons & training",
          description: "Private lessons, professional training and courses",
        },
      },
      {
        key: "family.support",
        ramnn: "famille-pension",
        catchAll: false,
        label: {
          fr: "Pension alimentaire",
          en: "Child support",
          description: "Child support and alimony payments",
        },
      },
      {
        key: "family.other",
        ramnn: "famille-autres",
        catchAll: true,
        label: {
          fr: "Autres : Famille & éducation",
          en: "Other: Family & Education",
          description: "Family spending that fits no other family subcategory",
        },
      },
    ],
  },
  {
    key: "telecom",
    ramnn: "telecom",
    nature: "expense",
    color: "purple",
    icon: "bolt",
    label: {
      fr: "Télécom & logiciels",
      en: "Telecom & Software",
      description:
        "Telecom and software: internet, mobile plans, software and online services",
    },
    leaves: [
      {
        key: "telecom.internet",
        ramnn: "telecom-internet",
        catchAll: false,
        label: {
          fr: "Internet & box",
          en: "Internet",
          description: "Home internet and box plans",
        },
      },
      {
        key: "telecom.mobile",
        ramnn: "telecom-mobile",
        catchAll: false,
        label: {
          fr: "Forfait mobile",
          en: "Mobile plan",
          description: "Mobile phone plans",
        },
      },
      {
        key: "telecom.software",
        ramnn: "telecom-logiciels",
        catchAll: false,
        label: {
          fr: "Logiciels & services en ligne",
          en: "Software & online services",
          description:
            "Software, SaaS, cloud storage, hosting, domains, dev tools and paid APIs",
        },
      },
      {
        key: "telecom.other",
        ramnn: "telecom-autres",
        catchAll: true,
        label: {
          fr: "Autres : Télécom & logiciels",
          en: "Other: Telecom & Software",
          description:
            "Telecom or software spending that fits no other telecom subcategory",
        },
      },
    ],
  },
  {
    key: "taxes",
    ramnn: "impots",
    nature: "expense",
    color: "yellow",
    icon: "building",
    label: {
      fr: "Impôts & taxes",
      en: "Taxes",
      description: "Taxes: income tax, property taxes, social contributions",
    },
    leaves: [
      {
        key: "taxes.income",
        ramnn: "impots-revenu",
        catchAll: false,
        label: {
          fr: "Impôt sur le revenu",
          en: "Income tax",
          description: "Income tax payments to the tax authority",
        },
      },
      {
        key: "taxes.property",
        ramnn: "impots-fonciers",
        catchAll: false,
        label: {
          fr: "Impôts fonciers",
          en: "Property taxes",
          description: "Property and residence taxes",
        },
      },
      {
        key: "taxes.social",
        ramnn: "impots-sociales",
        catchAll: false,
        label: {
          fr: "Cotisations sociales",
          en: "Social contributions",
          description:
            "Social security contributions (URSSAF, self-employed charges)",
        },
      },
      {
        key: "taxes.other",
        ramnn: "impots-autres",
        catchAll: true,
        label: {
          fr: "Autres : Impôts & taxes",
          en: "Other: Taxes",
          description: "Taxes that fit no other tax subcategory",
        },
      },
    ],
  },
  {
    key: "bank",
    ramnn: "banque",
    nature: "expense",
    color: "mauve",
    icon: "bank",
    label: {
      fr: "Banque & crédits",
      en: "Bank & Credits",
      description: "Bank charges and loan repayments",
    },
    leaves: [
      {
        key: "bank.fees",
        ramnn: "banque-frais",
        catchAll: false,
        label: {
          fr: "Frais bancaires",
          en: "Bank fees",
          description:
            "The bank's own charges: account and card fees, commissions, overdraft interest",
        },
      },
      {
        key: "bank.loan",
        ramnn: "banque-credit",
        catchAll: false,
        label: {
          fr: "Crédit & prêts",
          en: "Loan repayment",
          description:
            "Consumer and personal loan installments (a housing loan is Mortgage, a car loan is Car loan)",
        },
      },
      {
        key: "bank.other",
        ramnn: "banque-autres",
        catchAll: true,
        label: {
          fr: "Autres : Banque & crédits",
          en: "Other: Bank & Credits",
          description:
            "Bank-related spending that fits no other bank subcategory",
        },
      },
    ],
  },
  {
    key: "other",
    ramnn: "autres",
    nature: "expense",
    color: "mauve",
    icon: "receipt",
    label: {
      fr: "Autres dépenses",
      en: "Other Expenses",
      description: "Expenses that belong to no other category",
    },
    leaves: [
      {
        key: "other.donations",
        ramnn: "autres-dons",
        catchAll: false,
        label: {
          fr: "Dons & associations",
          en: "Donations",
          description: "Donations to charities and associations",
        },
      },
      {
        key: "other.professional",
        ramnn: "autres-pro",
        catchAll: false,
        label: {
          fr: "Frais professionnels",
          en: "Professional expenses",
          description: "Professional expenses paid personally",
        },
      },
      {
        key: "other.misc",
        ramnn: "autres-divers",
        catchAll: true,
        label: {
          fr: "Divers",
          en: "Miscellaneous",
          description: "Spending that fits nowhere else",
        },
      },
    ],
  },
];
