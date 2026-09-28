# 06 · Roadmap : de la fondation à la bascule de ramnn

- Date : 2026-09-28
- Entrées : `01-audit.md` à `05-ui-porting.md` et leurs décisions validées,
  ADR 0001 à 0017, `CONTEXT.md`, catalogue des démos mint-pocs.
- Statut : proposition, à valider. C'est la dernière étape de la mission :
  après validation, on attaque le lot 0.

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

| Sujet                | Règle                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fluidité             | Aucun spinner ni squelette sur une lecture : préchargement au survol avec la même clé de requête qu'au clic (filtres normalisés par une fonction partagée), réponses prêtes à afficher, écritures optimistes avec retour arrière. Les démos `skeleton` ne servent pas ici |
| Temps réel           | Chaque module qui écrit émet ses événements du registry (ADR 0016) ; chaque écran ajoute ses lignes à la table d'invalidation de l'app                                                                                                                                    |
| UI                   | Portée de mint-pocs à l'identique (recette de `05-ui-porting.md`, section 5), captures côte à côte avec la démo, clair et sombre, 390 px et desktop                                                                                                                       |
| Mode confidentialité | Tout montant affiché passe par le masquage (`privacy-mode`), dès le premier écran qui montre un solde                                                                                                                                                                     |
| Tests                | `@keel/finance` en unitaire ; `@keel/banking` sur PGlite, RLS compris ; `@keel/bank-providers` sur réponses enregistrées. Les bugs de l'audit deviennent des cas nommés dans le lot qui porte leur module                                                                 |
| Textes               | Français et anglais dès le premier écran, via next-international ; aucun texte en dur dans un composant                                                                                                                                                                   |
| Définition de fini   | `bun run lint && bun run typecheck && bun run test`, build de production, puis validation                                                                                                                                                                                 |

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
  `main` par une PR. Blocage connu : le build échoue sur un clone neuf, parce
  que Wealthsimple Sans est ignorée par git (dépôt public). Il faut une
  solution avant la PR (question 1).
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
- **Tests visuels** : harnais Playwright (clair, sombre, 390 px, desktop) et
  premiers tests sur la coque existante (`05-ui-porting.md`, section 7).
- **`AGENTS.md`** mis à jour : trois packages, règle de test assouplie pour
  `@keel/banking`, files de jobs, registry d'événements.

Fini quand : la CI passe sur `main`, un test prouve l'isolation RLS, un
événement publié par un job arrive dans l'app et invalide une clé.

### Lot 1 · Foyer et identité

- Tables `households`, `household_members`, `member_settings` ; le foyer est
  créé dans la même transaction que l'utilisateur (hook Better Auth), avec
  fuseau détecté et devise par défaut.
- **Connexion Google**, la seule méthode de ramnn : c'est elle qui permettra
  aux utilisateurs migrés de retrouver leur compte (lot 11). L'email et mot
  de passe de keel reste ou part (question 3).
- Réglages de base : langue, fuseau, devise d'affichage, apparence.
- Démos portées : `text-field`, `select`, `button`, `switch`, `radio`,
  `segmented-control`, `profile-menu` (déjà vérifié avec la coque).

Fini quand : une inscription crée un foyer d'un membre, et chaque requête de
l'app passe par `withScope`.

### Lot 2 · Connexions et comptes

- **`@keel/bank-providers`** : port `BankingProvider`, adaptateur fake piloté
  par scénarios, adaptateur Enable Banking (JWT RS256 avec `jose`, `fetch`
  natif, réponses validées par Zod, `ProviderError` classée, signe du solde
  normalisé une fois, devise `XXX` résolue). Tests sur réponses enregistrées,
  dont les 32 cas du transform de ramnn qui restent pertinents.
- **Institutions** : table, recherche trigramme par pays, job
  `bank.institutions-refresh`.
- **Connexions** : consentement avec `state` porteur de l'id de connexion et
  nonce dans Redis, callback, choix des comptes (miroirs de carte décochés),
  un seul flux de reconnexion, retrait avec délai de grâce de 30 jours puis
  `bank.purge`, rappels `bank.consent-reminders` à J-14 et J-3.
- **Comptes** : synchronisés et manuels, `kind` corrigeable, « Déclarer un
  solde » distinct de « Modifier le compte », archivage. Unicité
  (`connection_id`, `stable_ref`).
- **Change** : table `fx_rates`, job `fx.refresh-rates` (BCE), module `fx` de
  `@keel/finance`.
- **Écrans** : page Comptes (liste par nature, patrimoine, répartition),
  parcours de connexion, bandeau de reconnexion. Démos : `net-worth-breakdown`,
  `account-details-drawer` (pour la fiche compte, reconvertie comme le dock),
  `sheet`, `menu`, `amount-input`, `callout`, `privacy-mode`, `privacy`,
  `spinning-checkmark` (fin de connexion).
- **Onboarding** : objectif d'épargne reporté au lot 7 ; ici, le parcours
  mène à la connexion bancaire ou à un compte manuel.

Fini quand : sur la sandbox, un membre connecte une banque, voit ses comptes
et son patrimoine ; un compte manuel a son solde déclaré ; une reconnexion
garde les comptes et leurs renommages.

### Lot 3 · Transactions et Settlement

- **`@keel/finance`** : `labels` (le normaliseur unique : `merchantKey`,
  `purchaseDate` lue dans le libellé CB, `cardAcceptor`, `LABELS_VERSION`),
  `settlement` (`insert`, `promote`, `skip`, tombstones), `balances`
  (`reconstruct`).
- **`@keel/banking`** : `settleArrivals`, la seule porte (ADR 0004), qui
  charge, décide et écrit une fois par fetch entier ; `transactionsChanged`
  et ses causes (ADR 0008), avec pour l'instant les seules étapes qui existent
  (historique de solde).
- **Jobs** : `bank.sync-due` (toutes les 15 min, deux créneaux par jour dans
  le fuseau du foyer), `bank.sync-connection`, `bank.sync-account`, budget
  d'appels par compte et par jour, contexte PSU sur le rafraîchissement
  manuel limité à un toutes les 5 minutes, relances selon la classe d'erreur
  (`02-domain.md`, section 6.3). Événement `sync.progress`.
- **Historique de solde** reconstruit (ADR 0011), `account_balances`, marque
  `history_dirty_from`.
- **Écrans** : page Transactions (liste par jour, filtres dans l'URL,
  recherche trigramme en `simple` + `unaccent`, pagination par curseur), fiche
  détail avec navigation clavier, saisie manuelle, édition avec colonnes
  « banque » verrouillées sur les lignes synchronisées, suppression avec
  undo ; courbe de solde dans la fiche compte. Démos : `transactions` (déjà
  porté), `chips`, `date-time-input`, `checkbox`, `toast`, `price-chart` ou
  `return-chart` pour la courbe (à trancher sur captures), `timeframe-selector`.
- **Cas nommés** : lots de 500 de ramnn (une copie périmée ne promeut jamais
  par-dessus la ligne fraîche), deux achats identiques le même jour sans
  `entry_reference`, ligne supprimée jamais ressuscitée, `bankAccountId`
  d'un autre foyer refusé.

Fini quand : une sync réelle sur la sandbox, rejouée deux fois, ne produit
aucun doublon ; la liste s'affiche sans état de chargement au changement de
filtre préchargé.

### Lot 4 · Catégorisation

- **Taxonomie système globale** (ADR 0012) : seed versionné avec clés
  stables, noms traduits, couleurs de la palette catégorielle, glyphes de
  `@keel/ui/finance/category-glyphs` ; table de correspondance `slug ramnn →
key keel` écrite en même temps (pour l'ETL). Sous-catégories du foyer.
- **Marchands** : table globale, route `/logos/<domaine>.svg` immuable
  (`MerchantLogo` cesse de montrer l'initiale quand un domaine est connu).
- **Merchant mappings** et **rule prompt** après chaque correction.
- **Échelle** (ADR 0007) : mappings, dictionnaires (marques, MCC, virements,
  noms des membres), historique (qui ignore les décisions du modèle non
  revues), puis modèle ; dédoublonnage par `merchant_key` dans un lot.
- **`packages/ai`** : modèles par rôle (`categorize` = `openai/gpt-6-luna`,
  `categorizeFallback` = `google/gemini-3.1-flash-lite`), Gateway avec
  conservation zéro, surcharge par variable d'environnement. Les helpers
  `describeImage` et `generateReply` du starter disparaissent s'ils n'ont
  plus d'appelant.
- **Recatégorisation** (ADR 0006) : le seul écrivain de la colonne, undo côté
  serveur, catégorisation en masse.
- **À revoir** : règles de `04-ai-study.md` (section 4.2), jamais la confiance
  déclarée. Le dock « À traiter » de la coque lit la vraie file.
- **Boucle d'eval** : chaque correction garde la proposition qu'elle remplace ;
  le banc de test du scratchpad entre dans le dépôt (sans clé), rejouable sur
  le golden set et sur les corrections accumulées.
- Démos : `tag` (déjà porté), `menu`, `icon-picker` (icône d'une
  sous-catégorie), `callout` (rule prompt).

Fini quand : une transaction arrivée par la sync est catégorisée et visible
en quelques secondes sans recharger ; une correction proposée en mapping
recatégorise les lignes du marchand.

### Lot 5 · Réconciliation et flux

- **`@keel/finance`** : `transfers` (compte propre reconnu par IBAN, libellé
  et nom de compte, ADR 0009), `flow` (`flowOf`, `decompose`).
- **`bank.reconcile`** : recalcul complet du foyer, écriture du seul diff,
  dédoublonné par foyer ; `bank.daily-advance`. Solde des comptes manuels
  recalculé à chaque changement.
- **Lectures** : `cashflow(period)` (une lecture pour Disponible, Dépenses,
  Épargne, Top catégories), `accountsOverview`, `balanceHistory`.
- **Écrans** : premiers widgets de la home sur données réelles, qui
  remplacent les données d'exemple. Démos : `cash-flow` (déjà porté),
  `spend-save`, `spending-breakdown`, `market-heatmap` (la treemap des
  dépenses), `monthly-spend`, `animated-number` (déjà porté).
- **Cas nommés** : aucun virement interne compté en dépense ; une dépense
  remboursée nette dans sa sous-catégorie ; l'écart nommé entre « dépensé »
  budget et cashflow.

Fini quand : sur les données du fake et de la sandbox, `revenus = dépenses +
épargne + virements sortants + Disponible` au centime, pour chaque mois.

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

Fini quand : budgets, alertes et revue lisent le même arbre, et les bugs de
l'audit (transferts « hors budget », remboursements, mois UTC) sont des tests
qui passent.

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
  et claim atomique (logique de ramnn gardée).
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

- **Police sous licence** en place, si la question 1 ne l'a pas réglée plus
  tôt.
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
chiffre d'un compte privé ne fuit dans la vue de l'autre (test RLS et test
visuel).

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

1. **Police.** Le build échoue sans Wealthsimple Sans, et le dépôt est
   public. Choisir maintenant la police sous licence définitive (le lot 0 la
   pose et la CI passe), ou garder Wealthsimple Sans en local avec une police
   de repli libre pour la CI jusqu'au lot 11 ?
2. **Hébergement de keel** : Railway comme ramnn (Postgres, Redis et
   services au même endroit, bascule simple), ou autre chose ?
3. **Connexion par email et mot de passe** : ramnn n'avait que Google. On la
   garde dans keel, ou Google seul ?
4. **Enable Banking en développement** : une application sandbox distincte
   de celle de la prod ramnn, pour ne jamais toucher aux sessions réelles
   avant la bascule ?
5. **Glisser-déposer de la home** : dnd-kit comme ramnn, ou le mécanisme de
   réorganisation de la démo `holdings-table` de mint-pocs, pour rester sur
   la même physique que le reste ?
6. **Reconversion de démos d'investissement** (`earnings-calendar` pour les
   échéances, `account-details-drawer` pour la fiche compte,
   `unlock-progress` pour l'objectif) : même règle que le dock, on garde le
   mécanisme à l'identique et on change le contenu. D'accord sur le principe,
   chaque cas étant confirmé sur captures ?
