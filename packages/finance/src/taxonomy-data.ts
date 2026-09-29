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
      descriptionFr:
        "Argent entrant : salaire, retraite, aides, revenus locatifs et de placements",
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
          descriptionFr:
            "Salaires et payes versés par un employeur, primes et factures freelance incluses",
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
          descriptionFr: "Pensions de retraite",
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
            "Government benefits and allowances (CAF family benefits, France Travail unemployment, housing aid), and child support received, including through CAF/ARIPA",
          descriptionFr:
            "Aides et allocations (CAF, France Travail, aide au logement), et pension alimentaire reçue, y compris via la CAF ou l’ARIPA",
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
          descriptionFr:
            "Dividendes, intérêts et autres revenus de placements versés sur le compte",
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
          descriptionFr: "Loyers perçus d'un bien immobilier que vous possédez",
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
            "Incoming refunds not tied to a specific spending category: cashback, overpayment recovery. A refund of a purchase, or an employer paying back an expense report, nets into that expense instead",
          descriptionFr:
            "Remboursements sans dépense précise : cashback, trop-perçu. Le remboursement d’un achat, ou d’une note de frais par l’employeur, se déduit de sa dépense",
        },
      },
      {
        key: "income.gifts",
        ramnn: "revenus-dons",
        catchAll: false,
        label: {
          fr: "Argent reçu",
          en: "Money received",
          description:
            "Money received as a gift, only when the label says so (cadeau, anniversaire); a transfer from a person is otherwise movements.transfers",
          descriptionFr:
            "Argent reçu en cadeau, quand le libellé le dit (cadeau, anniversaire) ; sinon, un virement d’une personne est un virement",
        },
      },
      {
        key: "income.other",
        ramnn: "revenus-autres",
        catchAll: true,
        label: {
          fr: "Autres : Revenus",
          en: "Other: Income",
          description:
            "Income that fits no other income subcategory, such as second-hand sale payouts (Vinted, Leboncoin, eBay)",
          descriptionFr:
            "Revenus qui n’entrent dans aucune autre sous-catégorie, comme les ventes d’occasion (Vinted, Leboncoin, eBay)",
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
      descriptionFr:
        "Mouvements d'argent internes entre vos propres comptes, ni revenu ni dépense",
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
            "Transfers between own accounts, person-to-person transfers with no commercial counterparty (Lydia, Wero), and a deferred-debit card's monthly settlement (FACTURE CARTE, RELEVE CB, DEBIT DIFFERE)",
          descriptionFr:
            "Virements entre ses propres comptes, entre particuliers sans commerçant (Lydia, Wero), et débit mensuel d’une carte à débit différé",
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
            "Moves to or from a savings product: savings accounts (Livret A, LDDS, LEP), PEL, CEL, life insurance (assurance vie) and retirement plans (PER)",
          descriptionFr:
            "Argent placé ou repris sur un produit d’épargne : livrets (Livret A, LDDS, LEP), PEL, CEL, assurance vie, PER",
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
            "Cash moved to or from an investment account: brokerage, PEA, CTO, crypto exchanges",
          descriptionFr:
            "Argent versé ou repris sur un compte d’investissement : compte-titres, PEA, CTO, plateformes crypto",
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
            "Other movements of the household's own money: a loan disbursement (DEBLOCAGE PRET), a currency exchange between own accounts. Never cash, which is other.cash",
          descriptionFr:
            "Autres mouvements de l’argent du foyer : déblocage d’un prêt, change entre ses propres comptes. Jamais des espèces",
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
      descriptionFr:
        "Coûts du logement : loyer, prêt, énergie, assurance, travaux et équipement",
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
          descriptionFr: "Loyer versé à un propriétaire ou une agence",
        },
      },
      {
        key: "housing.mortgage",
        ramnn: "logement-pret",
        catchAll: false,
        label: {
          fr: "Prêt immobilier",
          en: "Mortgage",
          description:
            "Mortgage or home-loan installments, with their borrower insurance",
          descriptionFr:
            "Échéances de prêt immobilier, avec leur assurance emprunteur",
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
          descriptionFr:
            "Factures d'électricité, de gaz et de chauffage (EDF, Engie)",
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
          descriptionFr: "Factures d'eau",
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
            "Building charges, co-ownership fees and home services: cleaning, gardening, home help, including CESU paid through URSSAF",
          descriptionFr:
            "Charges, copropriété et services à domicile : ménage, jardinage, aide à domicile, y compris le CESU payé à l’URSSAF",
        },
      },
      {
        key: "housing.insurance",
        ramnn: "logement-assurance",
        catchAll: false,
        label: {
          fr: "Assurance habitation",
          en: "Home insurance",
          description:
            "Home insurance premiums, including multi-risk bundles (MAIF, MACIF, MATMUT)",
          descriptionFr:
            "Assurance habitation, y compris les contrats multirisques (MAIF, MACIF, MATMUT)",
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
          descriptionFr: "Travaux, réparations et artisans pour le logement",
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
          descriptionFr:
            "Meubles, électroménager et équipement de la maison (IKEA, gros électroménager)",
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
          descriptionFr:
            "Dépenses de logement qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Alimentation : courses, restaurants et livraison de repas",
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
          descriptionFr:
            "Supermarchés, épiceries, boulangeries et commerces de bouche",
        },
      },
      {
        key: "food.restaurants",
        ramnn: "alimentation-restaurants",
        catchAll: false,
        label: {
          fr: "Restaurants & cafés",
          en: "Restaurants & cafés",
          description:
            "Restaurants, cafés, bars and fast food: food and drinks bought out",
          descriptionFr:
            "Restaurants, cafés, bars et restauration rapide : ce qu’on mange et boit dehors",
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
          descriptionFr:
            "Plateformes de livraison de repas (Uber Eats, Deliveroo)",
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
          descriptionFr:
            "Dépenses alimentaires qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Transports du quotidien : carburant, transports en commun, taxi, parking et véhicule",
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
          descriptionFr: "Carburant et recharge du véhicule (stations-service)",
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
            "Public transit passes and tickets (metro, bus, commuter rail), and bike or scooter sharing (Vélib', Lime, Dott)",
          descriptionFr:
            "Abonnements et tickets de transports en commun (métro, bus, train de banlieue), vélos et trottinettes en libre-service (Vélib’, Lime, Dott)",
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
          descriptionFr: "Taxis et VTC (Uber, Bolt)",
        },
      },
      {
        key: "transport.parking",
        ramnn: "transports-parking",
        catchAll: false,
        label: {
          fr: "Parking, péages & amendes",
          en: "Parking & tolls",
          description:
            "Parking, road tolls (péage) and traffic fines (amendes)",
          descriptionFr: "Parking, péages et amendes",
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
          descriptionFr:
            "Entretien, réparations et contrôle technique du véhicule",
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
          descriptionFr: "Primes d'assurance auto, moto ou vélo",
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
          descriptionFr: "Échéances de crédit auto ou de leasing",
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
          descriptionFr:
            "Dépenses de transport qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr: "Santé : médecins, pharmacie et mutuelle",
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
          descriptionFr:
            "Médecins, dentistes, spécialistes, hôpitaux et soins médicaux",
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
          descriptionFr: "Pharmacies et achats de parapharmacie",
        },
      },
      {
        key: "health.insurance",
        ramnn: "sante-mutuelle",
        catchAll: false,
        label: {
          fr: "Mutuelle",
          en: "Health insurance",
          description: "Health insurance premiums: mutuelle and prévoyance",
          descriptionFr: "Cotisations de mutuelle et de prévoyance",
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
          descriptionFr:
            "Dépenses de santé qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Achats personnels : vêtements, high-tech, soins, cadeaux, animaux",
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
          descriptionFr: "Vêtements, chaussures et accessoires de mode",
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
          descriptionFr:
            "Électronique grand public et gadgets (téléphones, ordinateurs, photo)",
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
          descriptionFr: "Coiffeur, institut de beauté, spa et cosmétiques",
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
          descriptionFr: "Cadeaux offerts, fleurs et souvenirs",
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
          descriptionFr: "Nourriture, vétérinaire et accessoires pour animaux",
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
          descriptionFr: "Tabac, cigarettes et produits de vape",
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
          descriptionFr:
            "Achats divers qui ne rentrent dans aucune autre sous-catégorie (grands magasins, achats variés)",
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
      descriptionFr:
        "Loisirs : streaming, sport, sorties, jeux vidéo et hobbies",
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
          descriptionFr:
            "Abonnements médias grand public : streaming vidéo et musique, TV payante, presse (Netflix, Spotify, Canal+)",
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
          descriptionFr:
            "Salle de sport, clubs sportifs et équipement de sport",
        },
      },
      {
        key: "leisure.outings",
        ramnn: "loisirs-sorties",
        catchAll: false,
        label: {
          fr: "Sorties",
          en: "Outings",
          description:
            "Tickets and entry: cinema, concerts, museums, shows, events. Drinks at a bar are food.restaurants",
          descriptionFr:
            "Billets et entrées : cinéma, concerts, musées, spectacles, événements. Un verre au bar va dans Restaurants & cafés",
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
          descriptionFr: "Jeux vidéo, achats in-game et services de jeu",
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
          descriptionFr:
            "Paris sportifs, poker, loteries et opérateurs de jeux d'argent (dépôts et gains)",
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
          descriptionFr:
            "Matériel de hobby et passe-temps créatifs (livres, instruments, loisirs créatifs)",
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
          descriptionFr:
            "Dépenses de loisirs qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Voyages et vacances : transport longue distance, hébergement, locations, activités",
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
          descriptionFr:
            "Avion, trains longue distance et ferries pour un voyage",
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
          descriptionFr: "Hôtels, locations de vacances et campings",
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
          descriptionFr: "Location de voiture ou de véhicule en voyage",
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
          descriptionFr: "Visites, excursions et activités en voyage",
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
          descriptionFr:
            "Dépenses de voyage qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Famille et éducation : scolarité, garde, cours, pension alimentaire",
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
          descriptionFr:
            "Frais de scolarité et d'études, cantine et fournitures scolaires",
        },
      },
      {
        key: "family.childcare",
        ramnn: "famille-garde",
        catchAll: false,
        label: {
          fr: "Garde d'enfants",
          en: "Childcare",
          description:
            "Childcare: nursery, nanny, babysitting, including a nanny paid through Pajemploi/URSSAF",
          descriptionFr:
            "Garde d’enfants : crèche, nounou, baby-sitting, y compris une nounou payée via Pajemploi",
        },
      },
      {
        key: "family.lessons",
        ramnn: "famille-cours",
        catchAll: false,
        label: {
          fr: "Cours & formation",
          en: "Lessons & training",
          description:
            "Private lessons, professional training, courses and driving school",
          descriptionFr:
            "Cours particuliers, formation professionnelle, cours et auto-école",
        },
      },
      {
        key: "family.support",
        ramnn: "famille-pension",
        catchAll: false,
        label: {
          fr: "Pension alimentaire",
          en: "Child support",
          description:
            "Child support and alimony paid (received is income.benefits)",
          descriptionFr:
            "Pension alimentaire versée (reçue, c’est une aide dans Revenus)",
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
          descriptionFr:
            "Dépenses familiales qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Télécom et logiciels : internet, forfaits mobiles, logiciels et services en ligne",
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
          descriptionFr: "Abonnements internet et box",
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
          descriptionFr: "Forfaits de téléphonie mobile",
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
          descriptionFr:
            "Logiciels, SaaS, stockage cloud, hébergement, domaines, outils dev et API payantes",
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
          descriptionFr:
            "Dépenses télécom ou logicielles qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr:
        "Impôts et taxes : impôt sur le revenu, impôts fonciers, cotisations sociales",
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
          descriptionFr: "Prélèvements d'impôt sur le revenu",
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
          descriptionFr: "Taxe foncière et taxe d'habitation",
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
          descriptionFr: "Cotisations sociales (URSSAF, charges d'indépendant)",
        },
      },
      {
        key: "taxes.other",
        ramnn: "impots-autres",
        catchAll: true,
        label: {
          fr: "Autres : Impôts & taxes",
          en: "Other: Taxes",
          description:
            "Taxes and administrative fees that fit no other tax subcategory: ANTS, carte grise, passport, timbre fiscal",
          descriptionFr:
            "Impôts et frais administratifs qui n’entrent nulle part ailleurs : ANTS, carte grise, passeport, timbre fiscal",
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
      descriptionFr: "Frais bancaires et remboursements de crédits",
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
          descriptionFr:
            "Frais de la banque elle-même : cotisations de compte et de carte, commissions, agios",
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
            "Consumer and personal loan installments, student loans and revolving credit, with their borrower insurance (a housing loan is Mortgage, a car loan is Car loan)",
          descriptionFr:
            "Échéances de crédit à la consommation, prêt étudiant, crédit renouvelable, avec leur assurance emprunteur (un prêt immobilier ou auto a sa propre sous-catégorie)",
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
          descriptionFr:
            "Dépenses bancaires qui ne rentrent dans aucune autre sous-catégorie",
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
      descriptionFr: "Dépenses qui n'appartiennent à aucune autre catégorie",
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
          descriptionFr: "Dons aux associations et œuvres caritatives",
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
          descriptionFr: "Frais professionnels payés personnellement",
        },
      },
      {
        key: "other.cash",
        ramnn: null,
        catchAll: false,
        label: {
          fr: "Retraits d'espèces",
          en: "Cash withdrawals",
          description:
            "Cash withdrawn at an ATM or a counter (RETRAIT DAB), and cash deposited back, which nets against withdrawals. The bank's fee for a withdrawal is bank.fees",
          descriptionFr:
            "Retraits d’espèces au distributeur ou au guichet, et dépôts d’espèces, qui s’en déduisent. Les frais de retrait vont dans Frais bancaires",
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
          descriptionFr: "Dépenses qui ne rentrent nulle part ailleurs",
        },
      },
    ],
  },
];
