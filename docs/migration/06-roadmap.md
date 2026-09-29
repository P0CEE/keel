# 06 · Roadmap : de la fondation à la bascule de ramnn

- Date : 2026-09-28
- Entrées : `01-audit.md` à `05-ui-porting.md` et leurs décisions validées,
  ADR 0001 à 0017, `CONTEXT.md`, catalogue des démos mint-pocs.
- Statut : validée le 2026-09-28 ; lots 0 à 4 livrés.

## 1. Principes de découpage

1. **Des tranches verticales.** Chaque lot livre le schéma, les modules purs,
   les modules applicatifs, les jobs et l'écran, utilisables de bout en bout.
   Pas de lot « tout le schéma » ni de lot « tous les écrans » : un module
   sans écran n'est pas éprouvé, un écran sans données réelles non plus.
2. **L'ordre suit la chaîne de données** (`02-domain.md`, « Ce qu'on sait à
   chaque étape de la sync ») : connexion, Settlement, catégorisation,
   réconciliation, évaluation. Chaque lot lit ce que le précédent écrit.
3. **Parité avec ramnn avant la bascule.** Les dix utilisateurs de ramnn ne
   perdent aucune fonction du périmètre banque le jour de la reprise. Le
   foyer à plusieurs membres, qui n'existe pas dans ramnn, vient après.
4. **Chaque lot se développe sans banque réelle** grâce à l'adaptateur fake
   piloté par scénarios (ADR 0005), puis se vérifie sur la sandbox Enable
   Banking.
5. **Même porte de validation qu'aux étapes 1 à 5** : fin de lot, relecture,
   validation, puis un ou plusieurs commits conventionnels. Un lot ne commence
   pas avant la validation du précédent.

### Règles transverses, dans chaque lot

| Sujet                | Règle                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fluidité             | Aucun spinner ni squelette sur une lecture : préchargement au survol avec la même clé de requête qu'au clic (filtres normalisés par une fonction partagée), réponses prêtes à afficher, écritures optimistes avec retour arrière. Les démos `skeleton` ne servent pas ici                                                                                                                            |
| Temps réel           | Chaque module qui écrit émet ses événements du registry (ADR 0016) ; chaque écran ajoute ses lignes à la table d'invalidation de l'app                                                                                                                                                                                                                                                               |
| Notifications        | Jamais la nuit : une alerte (budget, seuil, reconnexion) se décide à tout moment, en fin de réconciliation, mais son email ne part que dans la fenêtre de jour du foyer (8 h à 21 h dans son fuseau) ; hors fenêtre, un job BullMQ retardé la livre au début de la suivante. ramnn envoyait ses alertes de budget à l'heure de la sync, que Trigger.dev étalait sur 24 h : des emails à 4 h du matin |
| UI                   | Portée de mint-pocs à l'identique (recette de `05-ui-porting.md`, section 5), captures côte à côte avec la démo, clair et sombre, 390 px et desktop                                                                                                                                                                                                                                                  |
| Mode confidentialité | Tout montant affiché passe par le masquage (`privacy-mode`), dès le premier écran qui montre un solde                                                                                                                                                                                                                                                                                                |
| Tests                | `@keel/finance` en unitaire ; `@keel/banking` sur PGlite, RLS compris ; `@keel/bank-providers` sur réponses enregistrées. Les bugs de l'audit deviennent des cas nommés dans le lot qui porte leur module                                                                                                                                                                                            |
| Textes               | Français et anglais dès le premier écran, via next-international ; aucun texte en dur dans un composant                                                                                                                                                                                                                                                                                              |
| Définition de fini   | `bun run lint && bun run typecheck && bun run test`, build de production, puis validation                                                                                                                                                                                                                                                                                                            |

## 2. Vue d'ensemble

| Lot | Objectif                               | Ce qu'on voit à la fin                                                          | Dépend de | Taille |
| --- | -------------------------------------- | ------------------------------------------------------------------------------- | --------- | ------ |
| 0   | Socle technique                        | Rien de nouveau à l'écran ; la CI passe sur la branche                          | —         | M      |
| 1   | Foyer et identité                      | Connexion Google, foyer créé à l'inscription, réglages de base                  | 0         | S      |
| 2   | Connexions et comptes                  | Connecter sa banque, page Comptes avec soldes et patrimoine, comptes manuels    | 1         | L      |
| 3   | Transactions et Settlement             | Sync réelle, page Transactions, saisie et édition, historique de solde          | 2         | L      |
| 4   | Catégorisation                         | Transactions catégorisées en quelques secondes, dock « À traiter » réel         | 3         | L      |
| 5   | Réconciliation et flux                 | Virements internes, Disponible, premiers widgets de la home sur données réelles | 4         | M      |
| 6   | Séries récurrentes                     | Charges fixes, échéances, projection                                            | 5         | L      |
| 7   | Budgets et objectif d'épargne          | Budgets par catégorie, alertes, objectif mensuel                                | 5         | M      |
| 8   | Home à widgets                         | Home complète, personnalisable, défaut adaptatif                                | 6, 7      | M      |
| 9   | Notifications, seuils, revue mensuelle | Cloche, emails, seuils de solde, revue du 1er avec narrative                    | 6, 7      | L      |
| 10  | Données du membre                      | Import et export CSV, export RGPD, suppression de compte, journal, feedback     | 4         | M      |
| 11  | Mise en production et reprise de ramnn | keel en prod, utilisateurs de ramnn migrés, ramnn éteint                        | 0 à 10    | L      |
| 12  | Foyer à plusieurs                      | Inviter un membre, comptes joints et privés, vue foyer ou membre                | 11        | M      |

Les lots 6, 7 et 10 sont indépendants entre eux une fois le lot 5 fait (le
lot 10 dès le lot 4) : ils peuvent s'entrelacer si un besoin presse.

## 3. Les lots

### Lot 0 · Socle technique

Ce que tous les lots suivants supposent.

- **Branche et CI.** `feat/ramnn-banking-migration` (étapes 1 à 5) part sur
  `main` par une PR. Le build échouait sur un clone neuf, Wealthsimple Sans
  étant ignorée par git : elle est désormais versionnée (question 1).
- **RLS réellement actif** (ADR 0013) : rôles `keel_owner` et `keel_app`,
  `withScope(scope, fn)` avec `set_config(..., true)`, fonctions
  `SECURITY DEFINER` pour les parcours globaux, test qui prouve qu'une
  requête hors scope ne voit rien.
- **PGlite** dans le catalog (dépendance de dev), et un utilitaire de test qui
  monte le schéma migré avec les deux rôles.
- **Packages** `@keel/banking` et `@keel/bank-providers` créés vides, câblés
  dans Turborepo.
- **Registry de jobs par file** : chaque entrée devient `{ queue, schema }`,
  trois files (`bank-sync`, `bank-pipeline`, `default`), un `Worker` par file
  ; port `Dispatch` avec son enregistreur de test.
- **Temps réel** (ADR 0016) : registry d'événements, publication après
  commit depuis `withScope`, flux Redis par foyer, subscription tRPC en SSE
  avec `tracked` et reprise par `lastEventId`, `RealtimeProvider` et sa table
  d'invalidation vide.
- **`AGENTS.md`** mis à jour : trois packages, règle de test assouplie pour
  `@keel/banking`, files de jobs, registry d'événements.

Fini quand : la CI passe sur `main`, un test prouve l'isolation RLS, un
événement publié par un job arrive dans l'app et invalide une clé.

### Lot 1 · Foyer et identité

- Tables `households`, `household_members` (avancées au lot 0) et
  `member_settings`. Better Auth lance ses hooks `after` une fois
  l'utilisateur commité : le foyer est donc créé par ce hook (fuseau et
  langue du navigateur passés par l'état OAuth), et à défaut par le premier
  appel du membre, `provisionMember` étant idempotent. Aucun membre ne reste
  sans foyer.
- **Connexion Google**, la seule méthode de ramnn et de keel (question 3) :
  c'est elle qui permettra aux utilisateurs migrés de retrouver leur compte
  (lot 11). L'email et mot de passe du starter disparaît.
- Réglages de base : langue, fuseau, devise d'affichage, apparence.
- Démos portées : `text-field`, `select`, `button`, `switch`, `radio`,
  `segmented-control`, `profile-menu` (déjà vérifié avec la coque).

Fini quand : une inscription crée un foyer d'un membre, et chaque requête de
l'app passe par `withScope`.

### Lot 2 · Connexions et comptes

- **`@keel/bank-providers`** : port `BankingProvider`, `ProviderError` classée
  (table des codes Enable Banking dans `enable-banking/failures.ts`, lue
  dans le corps de la réponse, jamais déduite du statut HTTP), adaptateur
  Enable Banking (JWT RS256 avec `jose`, `fetch` natif, réponses validées par
  Zod, solde gardé signé tel que la banque l'envoie, devise `XXX` résolue par
  celle du solde, préférence de solde sur les codes ISO `CLBD`... et non sur
  les noms longs que ramnn cherchait sans jamais les trouver). Fake piloté
  par scénarios (Banque Démo, Crédit Démo en `reconnect_required`, Caisse
  Démo limitée en appels, Néobanque Démo en `XXX`, Banque Privée Démo sans
  devise), dont les références encodent la session : l'API et le worker
  lisent les mêmes. Les fenêtres de ramnn et leurs 8 cas sont repris ; des
  32 cas du transform, ceux de l'adaptateur (devise, nature, contrepartie),
  la date d'achat, la méthode et l'accepteur de carte restant au domaine
  (lot 3).
- **Institutions** : table globale, recherche par pays en trigramme
  (`pg_trgm`, chargé aussi dans PGlite), job `bank.institutions-refresh`
  hebdomadaire et au premier démarrage du worker.
- **Connexions** : le `state` n'est qu'un nonce ; ce qu'il désigne
  (connexion pré-allouée, membre, banque, type d'accès) reste dans Redis,
  15 minutes, lu et effacé d'un `GETDEL`. Le callback est une route REST de
  l'API (`/v1/bank/callback`, navigation de premier niveau, donc cookie de
  session présent) qui échange le code avec le contexte PSU du membre et
  renvoie toujours sur `/accounts`. Les comptes du consentement sont décrits
  une fois et gardés une heure comme « offre » ; le membre choisit, le
  miroir de carte décoché. Un seul flux de renouvellement, qui retrouve les
  comptes par `stable_ref` (renommages gardés) et rend l'ancienne session à
  la banque. Retrait avec 30 jours de grâce, restauration, puis
  `bank.purge` quotidien qui révoque avant de supprimer (une révocation
  ratée attend le lendemain). `psu_type` mémorisé sur la connexion.
  **Écart** : `bank.consent-reminders` (J-14, J-3) est reporté au lot 9,
  faute de canal de notification ; le bandeau de reconnexion de la page
  Comptes s'affiche dès J-14 en attendant.
- **Comptes** : synchronisés et manuels, nature corrigible (le choix du
  membre prime), « Déclarer un solde » distinct de « Modifier », masquer
  des totaux, archivage. Unicité (`connection_id`, `stable_ref`). Le solde
  d'un compte manuel est son ancre jusqu'à la reconnaissance des virements
  (lot 5).
- **Change** : table `fx_rates`, job `fx.refresh-rates` (BCE, fichier de
  90 jours, historique complet pour un rattrapage plus ancien), module `fx`
  de `@keel/finance` en arithmétique entière. Une devise sans taux sort du
  total, qui le dit.
- **Lecture** : `accounts.overview`, une seule requête pour la page
  (groupes par nature, soldes convertis, patrimoine et répartition,
  connexions et ce qu'elles demandent), préchargée par le layout.
  Événements `connection.changed` et `accounts.changed`.
- **Écrans** : page Comptes (patrimoine en `privacy-balance`, répartition
  en `BreakdownCard` par nature, comptes par nature, banques en
  composition `cards-inset`), choix de la banque, choix des comptes (fin sur
  `spinning-checkmark`), compte manuel (`amount-input`), fiche compte
  (`account-details-drawer` reconverti : carte dessinée aux couleurs de la
  nature, IBAN masqué, « masquer des totaux » à la place du gel), bandeaux
  (`callout`), menu des banques (`menu`). Mode confidentialité monté pour
  toute l'app, branché sur tous les composants de montant.
- **Onboarding** : objectif d'épargne reporté au lot 7 ; ici, la page Comptes
  vide mène à la connexion bancaire ou à un compte manuel.
- **Développement** : `BANKING_PROVIDER=fake` par défaut, la fausse banque
  répond sans réseau ; `bun run db:seed-demo <email>` donne à un membre
  local deux connexions et un compte manuel (refusé en production).

Fini quand : sur la sandbox, un membre connecte une banque, voit ses comptes
et son patrimoine ; un compte manuel a son solde déclaré ; une reconnexion
garde les comptes et leurs renommages. Vérifié le 2026-09-28 sur la fausse
banque (tests de `@keel/banking` sur PGlite, et parcours réel en local) ;
le passage sur Enable Banking attend les identifiants de l'application et
l'autorisation de l'URL de callback.

### Lot 3 · Transactions et Settlement

- **`@keel/finance`** : `labels` (le normaliseur unique : `merchantKey`,
  `purchaseDate` lue dans le libellé CB, `cardAcceptor`, `transactionMethod`,
  `LABELS_VERSION`), `settlement` (`insert`, `promote`, `skip`, tombstones),
  `balances` (`reconstruct`), `transaction-filter` (le filtre de la liste,
  normalisé par la même fonction dans l'app et l'API). L'empreinte d'une
  ligne sans `entry_reference` lit un libellé figé (`identityLabel`) : changer
  le normaliseur de marchands ne la déplace jamais. Settlement passe dans
  l'ordre : répétitions du fetch, identité (référence, puis empreinte et
  rang), révision d'une ligne sans référence dont la banque a reformulé le
  libellé, rapprochement composite avec une ligne d'une autre origine
  (5 jours d'écart au plus, IBAN de contrepartie non contradictoire), puis
  insertion.
- **`@keel/bank-providers`** : chaque ligne arrivante porte `part`, la
  requête du fetch qui l'a rendue (0 pour la fenêtre live). Les deux moitiés
  d'un fetch complet se recouvrent : les rangs d'occurrence se comptent par
  partie. Le fake date ses lignes du jour du consentement (une vraie banque
  ne déplace pas ses lignes) et la Banque Démo a deux ans d'historique.
- **`@keel/banking`** : `settleArrivals`, la seule porte (ADR 0004), qui
  charge, décide et écrit une fois par fetch entier ; une saisie promue
  garde son libellé comme nom et sa note. `transactionsChanged` et
  `followUps` (ADR 0008) : pour l'instant toutes les causes planifient
  `bank.reconcile`, dédoublonné par foyer (5 s). Saisie, édition (montant,
  date et libellé verrouillés sur une ligne synchronisée), suppression en
  tombstone et restauration ; `transactionsPage` par curseur,
  `transactionDetail`, `balanceHistory`.
- **Jobs** : `bank.sync-due` (toutes les 15 min, parcours `SECURITY DEFINER`
  `keel_connections_due`), `bank.sync-connection` (créneaux 7 h et 19 h dans
  le fuseau du foyer, décalés de 0 à 29 min par connexion), `bank.sync-account`
  (fenêtre `full` tant que le compte n'a jamais été synchronisé),
  `bank.reconcile` (une passe par membre, `keel_household_member_ids`, pour
  voir les comptes privés de chacun). Budget : 4 syncs non initiées par
  compte et par jour, compteur Redis ; rafraîchissement manuel par le seul
  membre qui a consenti, avec son contexte PSU, un par connexion toutes les
  5 minutes. `rate_limited` remet le job en file sans compter d'échec,
  `reconnect_required` passe la connexion à reconnecter, `transient` et
  `bank_unavailable` sont relancés 5 fois à partir de 30 s. Sync initiale
  après le choix des comptes, et sync de reprise après une reconnexion.
  Événements `sync.progress`, `transactions.changed`, `household.reconciled`.
- **Historique de solde** reconstruit (ADR 0011), `account_balances` : tout
  l'historique d'un compte marqué (`history_dirty_from`) est réécrit, car un
  nouveau solde de la banque déplace chaque jour ; le compte est verrouillé
  pendant la reconstruction. Un compte manuel a son solde déclaré depuis le
  jour de la déclaration, jusqu'à la reconnaissance des virements (lot 5).
- **Écrans** : page Transactions (filtres dans l'URL, `?accounts=`, chips de
  période, de sens et de comptes préchargées au survol, recherche trigramme
  sans accents, pages suivantes chargées avant la fin du scroll), fiche
  détail avec ↑/↓ (ou K/J), saisie (dépense ou rentrée), renommer, note,
  édition entière d'une saisie, suppression avec toast « Annuler » ; courbe
  de solde (price-chart reconverti) et « Voir les transactions » dans la
  fiche compte ; « Actualiser » sur chaque banque, qui suit la sync sans
  requête. Démos portées : `chips`, `checkbox`, `toast`, `date-time-input`,
  `timeframe-selector`, `price-chart` (retenu plutôt que `return-chart` :
  un solde se lit contre son niveau d'ouverture, pas en rendement).
- **Écarts** : les montants de la liste restent en devise native (la
  conversion vient avec les agrégats du lot 5) ; les captures côte à côte
  n'ont pas été faites à la clôture du lot.
- **Cas nommés** (tests) : lots de 500 de ramnn, deux achats identiques le
  même jour sans `entry_reference`, ligne supprimée jamais ressuscitée,
  `bankAccountId` d'un autre foyer refusé (aussi par une clé étrangère
  composite en base), sync rejouée deux fois sans doublon.

Fini quand : une sync réelle sur la sandbox, rejouée deux fois, ne produit
aucun doublon ; la liste s'affiche sans état de chargement au changement de
filtre préchargé. Vérifié le 2026-09-29 sur la fausse banque (PGlite, puis
Postgres 17 en local avec le seed) ; la sandbox Enable Banking attend la clé
de l'application, absente des environnements de dev.

### Lot 4 · Catégorisation

- **Taxonomie système globale** (ADR 0012) : `@keel/finance/taxonomy`,
  générée depuis celle de ramnn (14 catégories, 75 feuilles, noms fr et en,
  descriptions pour le modèle, couleur de la palette catégorielle, glyphe),
  avec la table `slug ramnn → clé keel` pour l'ETL. Seed dans la migration
  0012, ids en UUID v8 du md5 de la clé (les mêmes partout). Triggers :
  une transaction ou un mapping pointe une feuille ; deux niveaux au plus,
  une sous-catégorie du foyer sous une catégorie système seulement.
- **Marchands** : table globale (clé = `merchant_key`), identité donnée par
  un dictionnaire ou le modèle. Logos : `/v1/logos/<domaine>.png`, logo.dev
  interrogé une fois par domaine, octets gardés en base (`merchant_logos`),
  `Cache-Control: immutable` ; sans logo, 404 et l'initiale.
- **Échelle** (ADR 0007, `@keel/finance/categorization`) : mapping du
  marchand, puis mot-clé le plus long ; dictionnaires (marques et MCC portés
  de ramnn, mots de virement et d'épargne, nom complet d'un membre) ;
  historique du marchand à majorité des deux tiers (décisions automatiques
  hors revue) ; puis le modèle, une question par marchand et par sens dans
  un lot. Garde de signe partout : un débit n'est jamais un revenu.
- **À revoir** (`04-ai-study.md`, section 4.2) : abstention, réponse
  contraire à l'historique, marchand inconnu au-delà du quart d'un mois de
  revenus (500 par défaut). Jamais la confiance déclarée, gardée pour l'eval.
- **`packages/ai`** : modèles par rôle surchargeables (`AI_MODEL_*`),
  `gpt-6-luna` avec `gemini-3.1-flash-lite` en repli déclaré à la Gateway,
  raisonnement coupé, pas d'entraînement, conservation zéro réglable
  (`AI_ZERO_DATA_RETENTION`). **Écart** : la conservation zéro exige le plan
  Pro de la Gateway ; la clé de dev (Hobby) la refuse, elle est coupée en
  dev et devra être active en production. `describeImage`, `generateReply` et le
  routeur `ai` du starter ont été supprimés le 2026-09-29, avec le reste du
  starter (webhook d'exemple, shadcn, Tailwind, landing).
- **Job** `bank.categorize` (file `bank-pipeline`, dédoublonné par foyer,
  une passe par membre pour les comptes privés) : lots de 200, l'échelle en
  transaction, le modèle hors transaction par lots de 50, écriture gardée
  par le rang des sources ; un long arriéré continue dans un nouveau run.
  Arrivées et saisies planifient la catégorisation avant la réconciliation.
  Événements `transactions.categorized` et `categories.changed`.
- **Recatégorisation** (ADR 0006) : `recategorize` écrit la parole du
  membre sur une ligne ou une sélection (500 au plus), garde chaque décision
  automatique remplacée (`category_corrections`), rend un jeton d'undo gardé
  côté serveur un jour (`category_undos`), et propose la règle quand toutes
  les lignes sont d'un même marchand. `saveMapping` crée ou déplace une
  règle et l'applique (jamais sur un choix du membre) ; `deleteMapping`
  renvoie ses lignes à l'échelle. `confirmCategories` vide la file.
- **Boucle d'eval** : golden set de ramnn en clés keel
  (`packages/banking/eval/golden-set.json`) et banc rejouable
  (`bun run eval:categorization`, `--corrections <email>`). Mesuré le
  2026-09-29 : 98,1 % de bonnes feuilles (155/158), 99,4 % de bonnes
  catégories, 7 abstentions justes sur 8, en 37 s, comme dans l'étude.
- **Écrans** : catégorie sur chaque ligne (glyphe et nom), fiche avec la
  ligne de catégorie et qui l'a décidée, sélecteur groupé et cherchable
  (sans les revenus pour un débit), encart « À vérifier » avec « C'est bon »,
  encart de règle, toast « Annuler » ; chip « À revoir » et filtre par
  catégorie ; sélection multiple et « Catégoriser » ; saisie avec catégorie
  optionnelle ; dock « À traiter » sur la vraie file et les banques à
  reconnecter ; page Foyer : sous-catégories (nom, icône, archivage) et
  règles. Démos : `icon-picker` (porté, sans rangée de couleurs pour une
  sous-catégorie), 28 glyphes ajoutés, sélection dans `transaction-list`.

Fini quand : une transaction arrivée par la sync est catégorisée et visible
en quelques secondes sans recharger ; une correction proposée en mapping
recatégorise les lignes du marchand. Vérifié le 2026-09-29 sur PGlite
(tests), puis en local avec le modèle réel : 464 lignes catégorisées en
8 s environ, une correction de Dizima proposée en règle a déplacé ses
9 autres lignes du foyer.

### Lot 5 · Réconciliation et flux

- **`@keel/finance`** : `transfers` (ADR 0009) : l'IBAN du foyer fait foi ;
  à défaut, un libellé catégorisé en mouvement qui nomme un compte (tous
  les mots d'un de ses noms, le plus précis gagne, une égalité ne nomme
  personne) ; jumelles au centime près, même devise, comptes différents,
  4 jours au plus, avec au moins un signal de virement (un achat et un
  remboursement du même montant ne s'apparient pas), la sortie la plus
  ancienne prend l'entrée la plus proche. `flow` (ADR 0010) : une ligne de
  livret ou de prêt est `outside` ; un virement vers un livret est de
  l'épargne, jumelle ou pas ; entre compte courant et carte, `internal` ; le
  remboursement d'un prêt suivi garde le flux de sa catégorie (le membre l'a
  payé ce mois-ci) ; une feuille d'épargne ou de titres sans compte reconnu
  est de l'épargne, un autre mouvement un virement sortant ou entrant ; sans
  catégorie, `unclassified`, compté par son signe. `decompose` :
  Disponible est toujours la somme brute des lignes du périmètre, et
  `entrées - sorties` le redonne au centime. `balances.manualMoves`,
  `dates.addMonths` et `endOfMonth`.
- **Schéma** (migration 0013) : `counterpart_account_id`,
  `transfer_peer_id`, `transfer_dismissed`, `flow`, `excluded_from_budget`,
  `excluded_from_analysis` ; fonction `keel_households_starting_day`.
- **`bank.reconcile`** : liens et flux recalculés sur tout le foyer, seul le
  diff écrit (une deuxième passe n'écrit rien) ; une tombstone lâche sa
  jumelle ; solde et historique des comptes manuels (ancre déclarée, plus
  ses propres lignes et les jambes reconnues vers lui) ; historiques
  prolongés au jour courant. La passe d'un membre ne touche pas un lien vers
  un compte privé qu'il ne voit pas. Renommer un compte ou changer son type
  replanifie la réconciliation. **`bank.daily-advance`**, chaque heure : les
  foyers dont la journée commence dans leur fuseau.
- **Lectures, par bloc et non par page** (les pages seront redisposées) :
  `insights.cashflow({ months })` (revenus, dépenses, épargne, virements
  sortants, à catégoriser, entrées, sorties, Disponible, par mois) et
  `insights.spending({ month })` (par catégorie avec ses sous-catégories et
  sa moyenne sur trois mois, par marchand, cumul jour par jour contre le mois
  d'avant), converties à la devise d'affichage au taux de fin de mois.
- **Geste** : « Ce n'est pas un virement interne », et son retour, depuis la
  fiche transaction, qui dit vers quel compte part le virement.
- **Écrans** : la home sur données réelles, en blocs indépendants
  (patrimoine et Disponible du mois, `cash-flow`, `spend-save`,
  `spending-breakdown`, la treemap de `market-heatmap` limitée à cinq
  catégories plus « Autres », `monthly-spend`, dernières transactions). La
  disposition est provisoire, les composants sont portés à l'identique.
- **Cas nommés** (tests) : virement sans IBAN (CIC) apparié par le libellé ;
  jambe vers un compte manuel sans jumelle ; carte remboursée par le compte
  courant, interne des deux côtés ; aucun virement interne compté en
  dépense ; remboursement net dans sa sous-catégorie ; ligne exclue de
  l'analyse comptée nulle part ; lien vers un compte privé jamais défait par
  un autre membre ; identité au centime ; Disponible égal à la somme brute.
- **Écarts** : un virement comptabilisé le jour même d'une déclaration de
  solde manuel n'est pas compté (la déclaration vaut fin de journée, comme
  dans ramnn) ; les montants sont convertis au taux de fin de mois, pas de
  chaque jour d'achat ; un virement entre deux devises n'est pas apparié.
  L'écart nommé entre « dépensé » budget et cashflow vient avec les budgets
  (lot 7).

Fini quand : sur les données du fake et de la sandbox, `revenus = dépenses +
épargne + virements sortants + Disponible` au centime, pour chaque mois.
Vérifié le 2026-09-29 sur PGlite (tests) ; le parcours en local sur le seed
et la sandbox Enable Banking restent à faire.

**Revue des catégories (2026-09-29, pendant le lot 5).**

- **Un seul écrivain, pour de vrai** (ADR 0006) : `category-writer`
  (`assignCategories`, `releaseCategories`) applique la règle de rang,
  écrit en quelques requêtes (plus une par ligne) et annonce la suite ; la
  catégorisation, les règles, la recatégorisation et l'annulation ne font
  plus que décider. Une recatégorisation ne reconstruit plus l'historique de
  solde (seules les causes qui déplacent de l'argent le font).
- **Sans modèle configuré**, ce que l'échelle ne décide pas reste en attente
  (plus d'abstention définitive) ; la file se lit par curseur. Une réponse
  du modèle hors format est redemandée une fois, puis au modèle de repli.
- **Côté app**, un seul `displayOf` / `useCategoryDisplay` (nom, couleur,
  glyphe, catégorie, description) pour la liste, la fiche, le sélecteur,
  les réglages et les graphiques ; requêtes des catégories découpées par
  sujet.
- **Taxonomie** : feuille `other.cash` « Retraits d'espèces » (migration
  0014, les retraits décidés automatiquement y passent) avec l'échelon
  « méthode retrait » et les MCC 6010/6011 ; « Caisse d'Épargne » ne vaut
  plus épargne ; MCC 4112 laissé au modèle (TER ou TGV), douze codes MCC
  ajoutés ; vingt descriptions précisées (assurance vie, CESU, Pajemploi,
  péages, débit différé, note de frais, pension reçue, ventes d'occasion...)
  et règles du prompt correspondantes ; descriptions françaises pour les
  membres, reprises de ramnn. Eval : 97,6 % de bonnes feuilles (166/170),
  98,8 % de bonnes catégories, 8 abstentions justes sur 8, avec douze cas
  ajoutés au golden set (97,5 % avant, sur 158).

### Lot 6 · Séries récurrentes

- **`@keel/finance`** `recurring` (section 10 de `02-domain.md`) :
  signatures, rattachement incrémental, découverte, calendrier TARGET2,
  ancres, séries variables, `advance`, `nextDue`.
- **Gestes** serveur : confirmer, rejeter, détacher une transaction,
  rattacher, créer depuis une transaction, « résiliée ». Événement de
  changement de prix.
- **Lectures** : `upcoming`, charges fixes du mois, projection de solde.
- **Écrans** : échéances à venir, détail de série, liste des séries. Démos :
  `cycle-input` (cadence), `earnings-calendar` (calendrier des échéances,
  reconverti comme le dock : à confirmer sur captures), `callout`.
- **Eval** : scénarios nommés de ramnn et de l'analyse, générateur de séries
  synthétiques, puis rejeu de l'historique de prod anonymisé contre les
  décisions des utilisateurs (46 % de séries rejetées dans ramnn : c'est le
  chiffre à battre).

Fini quand : les invariants du générateur tiennent (échéance jamais avant la
dernière occurrence, un changement de prix ne crée jamais de seconde série),
et le rejeu de prod donne moins de faux positifs que ramnn.

### Lot 7 · Budgets et objectif d'épargne

- **`@keel/finance`** `budgets` : `budgetOverview` renvoie un arbre entier,
  converti, sans double compte, sur le périmètre budget (flux `expense`,
  remboursements déduits). Budgets mensuels seulement.
- Suggestions depuis la moyenne, historique budget contre réel sur 6 mois,
  objectif d'épargne versionné par mois (et l'étape correspondante de
  l'onboarding).
- Alertes à 80 % et 100 % par membre, dédoublonnées, lues sur le même arbre
  que la revue (un sous-budget dépassé produit aussi un Verdict).
- Démos : `category-budget`, `amount-input`, `amount-stepper`,
  `unlock-progress` (objectif d'épargne, à confirmer sur captures).

- **Cas nommé** : un dépassement constaté par une sync à 4 h part à 8 h dans
  le fuseau du foyer, une seule fois ; le mois du budget est celui du foyer,
  jamais le mois UTC.

Fini quand : budgets, alertes et revue lisent le même arbre, et les bugs de
l'audit (transferts « hors budget », remboursements, mois UTC, alertes de
nuit) sont des tests qui passent.

### Lot 8 · Home à widgets

- Registry de widgets, layout par membre (`member_settings.home_layout`),
  défaut adaptatif calculé depuis ce que le membre a (comptes, budgets,
  séries).
- Les dix widgets banque de l'audit (section 25), sur les composants déjà
  portés ; courbe de trésorerie épinglée sur l'historique reconstruit ;
  réorganisation au glisser (bibliothèque à choisir, question 5).
- Une lecture par surface : les widgets qui partagent des agrégats partagent
  la requête.

Fini quand : la home s'affiche d'un bloc, sans cascade, sur un compte neuf
comme sur un historique de trois ans.

### Lot 9 · Notifications, seuils, revue mensuelle

- **Notifications** : tables, préférences (écarts au défaut seulement),
  `notify.email` via Resend et react-email, événement `notification.created`.
  Démos : `notification-bell`, `notification-center`, `toast`.
- **Seuils de solde** déclenchés en fin de réconciliation, avec hystérésis
  et claim atomique (logique de ramnn gardée), livrés dans la fenêtre de jour
  du foyer comme toute alerte (règle transverse).
- **Fenêtre de jour** : le module de livraison calcule le prochain instant
  permis dans le fuseau du foyer (`@keel/finance/dates`, changements d'heure
  compris) ; l'alerte reste visible dans la cloche dès sa décision, seul
  l'email attend.
- **Revue mensuelle** : `review` pur (ADR 0015) sur les faits du périmètre de
  flux, `review.dispatch` et `review.send` avec leur propre curseur, page de
  revue, note du membre, ligne du mois clos sous la salutation (contrat du
  ticker de Verdicts).
- **Narrative** : choix entre `google/gemini-3.8-flash` et `openai/gpt-6-luna`
  avec raisonnement, sur trois revues réelles relues par toi (décision 3 de
  l'étude IA) ; garde-fou des chiffres.
- **Graphique de l'email** : PNG rendu par `sharp` ou autre voie, tranché ici
  (audit, section 20).

Fini quand : une revue de septembre générée sur données réelles passe ta
relecture, et l'email arrive le 1er à 8 h dans le fuseau du foyer.

### Lot 10 · Données du membre

- **Import CSV** : upload présigné (R2), parsing gardé de ramnn (encodages,
  jour/mois, montants FR), mapping heuristique des en-têtes puis modèle en
  repli, colonnes Débit / Crédit, passage par `settleArrivals`, table
  `csv_imports` pour annuler un import, événement `import.progress`. Autorisé
  sur les comptes synchronisés (reprise au-delà de 730 jours).
- **Export CSV** synchrone et streamé du filtre courant, montants numériques
  bruts, feuille et nature, protection contre l'injection de formules.
- **Export RGPD**, **suppression de compte** (step-up, lien email,
  révocations, purges), **journal d'activité** (diff simple), **feedback
  vers Slack**.

Fini quand : un relevé CSV d'une banque française, importé deux fois sur un
compte synchronisé, ne crée aucun doublon.

### Lot 11 · Mise en production et reprise de ramnn

- **Hébergement** de keel (question 2) : web, app, API, worker, Postgres,
  Redis, stockage objet ; Sentry ; sauvegardes et restauration testée.
- **Secrets** : rotation de la clé de la Gateway et des variables de ramnn
  utilisées pendant l'étude, comme prévu.
- **Enable Banking** : même application qu'en prod ramnn, pour que les
  sessions existantes restent lisibles (`03-schema-mapping.md`).
- **Authentification** : comptes Google repris avec le même identifiant
  d'utilisateur ; tout le monde se reconnecte une fois.
- **ETL** selon `03-schema-mapping.md` : script rejouable, rapport par table,
  vérifications de fin (sommes au centime par compte et devise, comptes de
  lignes, tombstones), puis `bank.reconcile` par foyer et une sync à blanc.
- **Répétition** sur une copie de la prod, puis bascule : gel de ramnn, ETL,
  vérifications, ouverture de keel, ramnn en lecture seule quelques jours
  pour le retour arrière, puis extinction.

Fini quand : les dix utilisateurs retrouvent leurs comptes, transactions,
catégories, budgets et séries dans keel, et la vérification 7 de l'ETL (sync
à blanc sans insertion en double) passe sur chaque compte réel.

### Lot 12 · Foyer à plusieurs

- Invitation par email, acceptation, départ d'un membre (ses comptes
  personnels partent avec lui, les joints restent).
- Comptes joints et privés dans l'interface ; avertissement au moment de
  créer un mapping depuis une transaction privée.
- Sélecteur de vue (foyer ou membre) ; répartition du patrimoine avec un
  onglet par membre (`net-worth-breakdown`, déjà porté au lot 2).
- Revue, alertes et seuils calculés par membre : déjà vrais par
  construction, vérifiés ici avec deux membres réels.

Fini quand : deux membres d'un même foyer voient chacun leur vue, et aucun
chiffre d'un compte privé ne fuit dans la vue de l'autre (test RLS et
vérification à la main).

## 4. Hors roadmap

- **MCP** (réglages Assistant de ramnn) : reporté, la porte reste ouverte.
- **JEV** comme juge de revue : quand le service sera stable (étude IA,
  section 3.3).
- **Embeddings** : seulement si une mesure sur données réelles le justifie.
- **Second agrégateur** : le port le permet, aucun besoin aujourd'hui.
- **Actifs** (immobilier, objets de valeur) : un futur type de compte manuel.
- Tout ce que l'audit coupe : anomalies, Google Places, digest, kNN,
  portefeuille, coffre, news.

## 5. Questions ouvertes

1. **Police.** Tranchée le 2026-09-28 : Wealthsimple Sans est versionnée
   dans le dépôt, sans police de remplacement prévue.
2. **Hébergement de keel** : Railway comme ramnn (Postgres, Redis et
   services au même endroit, bascule simple), ou autre chose ?
3. **Connexion** : tranchée le 2026-09-28, Google seul, comme ramnn.
4. **Enable Banking en développement** : tranchée le 2026-09-28, la même
   application que la prod ramnn. Conséquence : en développement, ne jamais
   révoquer ni supprimer une session qu'on n'a pas créée soi-même.
5. **Glisser-déposer de la home** : reportée. Le design de chaque widget
   sera revu au lot 8, et le mécanisme de réorganisation choisi avec lui.
6. **Reconversion de démos d'investissement** : tranchée le 2026-09-28,
   d'accord sur le principe (mécanisme identique, contenu changé), chaque
   cas vérifié à l'écran.
