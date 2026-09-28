# 02 · Modèle de domaine et architecture (périmètre banque)

- Date : 2026-09-28
- Entrées : `01-audit.md` et ses décisions validées, revue d'architecture de
  ramnn, catalogue des requêtes de ramnn, surface Enable Banking (code et
  documentation), conventions actuelles de keel, référence de fluidité
  (Wealthsimple, septembre 2026).
- Statut : proposition, à valider. Aucun code de feature n'est écrit avant la
  validation des étapes 1 à 3.

Langue : ce document est en français. Le glossaire (`CONTEXT.md`) et les ADR
(`docs/adr/`) sont en anglais, comme le code et `AGENTS.md`, parce que leurs
termes deviennent des identifiants.

## 1. Le foyer, dès la conception

Le **foyer** (household) est le propriétaire de toute donnée financière.
L'utilisateur n'en est qu'un **membre**. Chaque personne a un foyer dès son
inscription, seule dedans ; l'invitation d'un second membre arrive plus tard
(roadmap), mais le schéma, le RLS et les modules sont construits pour
plusieurs membres dès le premier jour. Changer la clé de propriété après coup
toucherait chaque table, chaque politique, chaque contrainte unique et chaque
requête (ADR 0001).

| Appartient au foyer                          | Appartient à un membre                                 |
| -------------------------------------------- | ------------------------------------------------------ |
| Catégories du foyer, merchant mappings       | Connexions (le consentement PSD2 est personnel)        |
| Budgets, objectif d'épargne                  | Préférences : langue, notifications, layout de la home |
| Séries récurrentes                           | Revue mensuelle et alertes (calculées pour sa vue)     |
| Comptes (propriétaire : un membre, ou joint) | Seuils de solde                                        |

Règles qui en découlent :

- **Une transaction a une seule catégorie**, même sur un compte joint. La
  taxonomie et les mappings sont donc ceux du foyer.
- **Compte privé** : visible de son seul propriétaire. Le RLS le garantit, pas
  l'interface. Les transactions et soldes d'un compte privé portent
  `private_to` (dénormalisé) pour que la politique reste un simple prédicat.
- **Tout chiffre est calculé tel qu'un membre le voit.** Deux membres peuvent
  voir un « dépensé » différent si l'un a un compte privé. C'est voulu : la
  revue mensuelle, les alertes de budget et les seuils sont par membre.
- **Vue** (`household` ou un membre) : filtre sur le propriétaire des comptes,
  les comptes joints appartenant à toutes les vues. Ce n'est jamais une
  permission.
- **Fuite assumée** : un mapping créé depuis une transaction privée est une
  règle du foyer, donc son motif (nom du marchand) est visible des autres
  membres. L'interface le dit au moment de la création.

### Répartition du patrimoine par membre

Référence : l'écran « Net worth breakdown » du foyer Wealthsimple, avec un
onglet pour le foyer (« The Smiths ») et un par membre (« Jerry »). La lecture
`householdBreakdown(scope, view)` renvoie, dans la devise d'affichage :

- un segment par membre : la somme des soldes positifs des comptes qui lui
  appartiennent ;
- un segment « comptes joints » : la somme des soldes positifs des comptes
  sans propriétaire ;
- un segment « dettes » : la somme des soldes négatifs (cartes, prêts,
  découverts), tous propriétaires confondus ;
- le patrimoine total, qui est la somme des segments, dettes déduites.

Les comptes privés d'un autre membre n'entrent dans aucun segment, puisque le
RLS les rend invisibles. Le segment « Real estate & valuables » de la
référence relève des actifs, hors périmètre ; rien dans le modèle ne l'empêche
de venir plus tard sous la forme d'un nouveau type de compte manuel.

## 2. Glossaire

Le glossaire est dans `CONTEXT.md` à la racine de keel : c'est le vocabulaire
que le code, les tests et les agents doivent employer. Ce qui suit le complète
avec ce que le glossaire ne doit pas contenir : ce qu'on sait à chaque étape,
et les invariants.

### Ce qu'on sait à chaque étape de la sync

| Étape                  | On sait                                                                                                                                                                                                                                                                     | On ignore encore                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Consentement           | Banque, membre qui consent, date de fin, liste des comptes du consentement                                                                                                                                                                                                  | Solde, transactions                                             |
| Découverte des comptes | Référence stable du compte (`identification_hash`), IBAN (souvent), nom, devise (parfois `XXX`), code de type PSD2 (parfois faux), solde et sa nature (`closingBooked`...)                                                                                                  | Si c'est un miroir de carte, le vrai type si la banque ment     |
| Ligne arrivante        | `entry_reference` (parfois), date de comptabilisation, date valeur, date d'opération (rare), montant non signé + sens (CRDT/DBIT), devise, lignes de libellé, contrepartie nom et IBAN (souvent absents chez CIC), MCC (rare), code ISO 20022, solde après opération (rare) | Date d'achat, marchand, catégorie, virement interne, récurrence |
| Après Settlement       | Identité de la transaction, montant signé en unités mineures, date d'achat lue dans le libellé, méthode (carte, retrait, virement...), clé de marchand                                                                                                                      | Marchand identifié, catégorie                                   |
| Après catégorisation   | Marchand global (nom, domaine donc logo), sous-catégorie, source, confiance (modèle seulement)                                                                                                                                                                              | Virement interne, flux, série                                   |
| Après réconciliation   | Compte de contrepartie (virement interne), jambe jumelle, flux, série récurrente, historique de solde, solde des comptes manuels                                                                                                                                            | —                                                               |
| Après évaluation       | Alertes de budget et de seuil, verdicts du mois                                                                                                                                                                                                                             | —                                                               |

### Invariants

**Argent (ADR 0002)**

- Tout montant est un **entier en unités mineures** (`bigint`, lu en `number`
  côté TypeScript : exact jusqu'à 2^53 unités, soit 90 000 milliards d'euros)
  accompagné d'un **code ISO 4217** (`char(3)`, `CHECK ~ '^[A-Z]{3}$'`).
  L'exposant vient d'une table statique (EUR 2, JPY 0, KWD 3). Aucun `numeric`
  en chaîne, aucun float, aucun `roundFinancial`.
- Le parsing d'un montant décimal (`"12,50"`, `"-1 234.5"`) vers les unités
  mineures est exact et se fait sur la chaîne, jamais via un float.
- **Signe du point de vue du titulaire**, partout, sur les transactions comme
  sur les soldes : négatif = l'argent sort ou est dû. Une carte ou un prêt a
  normalement un solde négatif. Le patrimoine est la simple somme des soldes
  convertis. L'adaptateur du provider normalise le signe une fois ; ramnn
  inversait à la connexion mais pas au sync.
- Montant de transaction non nul (`CHECK <> 0`). Budgets, objectifs et montant
  typique d'une série sont des magnitudes (`CHECK > 0`). Les seuils de solde
  sont signés (un seuil bas peut être un découvert).

**Devises (ADR 0003)**

- Chaque transaction et chaque compte portent leur devise native, obligatoire.
  Une devise `XXX` venant de la banque est résolue par l'adaptateur (devise du
  solde) ; à défaut, le compte n'est pas créé et l'erreur est visible.
- Aucune colonne de montant converti n'est stockée. La conversion se fait à la
  lecture, au taux du jour de la date d'achat, depuis une table de taux
  quotidiens exprimés contre l'euro (source BCE). Un taux croisé A→B se déduit
  des deux taux contre l'euro.
- Les agrégats groupent par (période, devise) puis convertissent le résultat :
  on convertit quelques dizaines de sommes, pas des milliers de lignes.

**Dates**

- **Date d'achat** (`purchased_on`, `date`) : la date du domaine. Toute
  période, tout mois, tout budget la lit.
- **Date de comptabilisation** (`booked_on`, `date`) : stockée (ramnn la
  jetait), lue seulement par Settlement et par l'historique de solde, car le
  solde de la banque bouge à la comptabilisation, pas à l'achat.
- Le mois et « aujourd'hui » sont ceux du **fuseau du foyer**
  (`households.timezone`, obligatoire). Plus jamais l'UTC du serveur.
- Tous les instants sont en `timestamptz`. C'est un écart volontaire avec la
  table `tasks` actuelle de keel, qui utilise `timestamp` sans fuseau.

**Identité et dédoublonnage (ADR 0004)**

- Identité d'une transaction venue de la banque, dans l'ordre :
  1. `entry_reference` s'il existe (le seul identifiant stable selon la
     documentation Enable Banking ; `transaction_id` peut changer et n'est
     jamais utilisé comme identité) ;
  2. sinon **empreinte** : hash de (date de comptabilisation, montant,
     devise, libellé normalisé) plus son **rang d'occurrence** parmi les lignes
     identiques d'un même fetch. Le libellé entre dans l'empreinte ; ramnn
     l'omettait, ce qui écrasait deux achats identiques du même jour.
- Les deux identités sont uniques **par compte**, pas globalement.
- Une ligne CSV a la même forme de ligne arrivante ; son empreinte est
  calculée sur les valeurs parsées, pas sur le texte brut.
- Une ligne d'une autre origine (CSV, saisie manuelle, reprise de données)
  sans identité commune est rapprochée par une passe composite : même compte,
  même montant et devise, dates proches, libellés compatibles, appariement un
  pour un. Elle est alors promue et adopte l'identité de la banque.
- Une transaction supprimée reste en **tombstone** (`deleted_at`) : Settlement
  la reconnaît et ne la réinsère jamais. Les tombstones sont purgées après
  800 jours, au-delà de la fenêtre maximale de 730 jours de l'agrégateur.

**Catégorie (ADR 0006)**

- Une transaction pointe toujours vers une **feuille** (contrôle par trigger en
  base, en plus du module).
- Rang des sources : `user` (3) > `mapping` (2) > `history` = `dictionary` =
  `model` (1) > aucune (0). Une écriture ne remplace qu'une catégorie de rang
  inférieur ou égal. La règle vit dans un seul module, le seul qui écrit la
  colonne.
- Nature et signe : un débit ne tombe jamais sur une catégorie `income` ; un
  crédit sur une catégorie `expense` est un remboursement.

**Flux (ADR 0010)**

- Le flux d'une transaction est calculé une fois par une fonction pure et
  **stocké** (`transactions.flow`). Cashflow, Sankey, budgets, revue et
  concentration marchands lisent tous cette colonne. Il n'y a plus quatre
  définitions de la dépense, mais une fonction et une colonne.
- Le périmètre budget (flux `expense`, remboursements déduits, hors
  `excluded_from_budget`) et le périmètre cashflow (tous les flux sauf
  `internal` et `outside`, hors `excluded_from_analysis`) diffèrent
  volontairement, et chacun porte un nom.

## 3. Découpage en modules profonds

### Trois packages

| Package                | Contenu                                                                    | I/O             | Importable côté client      |
| ---------------------- | -------------------------------------------------------------------------- | --------------- | --------------------------- |
| `@keel/finance`        | Toute la logique métier pure                                               | Aucune          | Oui (argent, formats, flux) |
| `@keel/banking`        | Modules applicatifs : ils chargent, appellent le pur, écrivent, planifient | Postgres, ports | Non                         |
| `@keel/bank-providers` | Port provider, adaptateur Enable Banking, adaptateur fake                  | HTTP            | Non                         |

`@keel/db` garde le schéma et des requêtes minces scopées par foyer.
`apps/api` (routeurs tRPC) et `apps/worker` (processeurs) n'appellent que
`@keel/banking`. Aucun routeur n'écrit directement une table bancaire
(ADR 0014).

### `@keel/finance` : la logique pure

Chaque module a une interface courte et se teste sans Postgres ni Redis.

| Module           | Interface                                                                                                            | Remplace dans ramnn                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `money`          | `Money`, `parseMinor(text, currency)`, `formatParts(money, locale)`, `sumByCurrency`, `convert(money, rate)`         | `financial-math.ts`, conversions dispersées                                          |
| `fx`             | `rateOn(rates, from, to, day)`, `toDisplay(buckets, currency, rates)`                                                | `utils/fx.ts`, gel USD canonique                                                     |
| `labels`         | `labelTokens(label)`, `merchantKey(lines)`, `purchaseDate(lines, bookedOn)`, `cardAcceptor(lines)`, `LABELS_VERSION` | 5 normaliseurs (revue, candidat 7)                                                   |
| `settlement`     | `settle(stored, arriving) -> Verdict[]` : insert, promote, skip                                                      | `transaction-settlement.ts` et sa ré-application dans les tâches                     |
| `categorization` | `ladder(rows, context) -> { decided, forModel }`, `finalize(forModel, modelOutput)`, `mayOverwrite(current, next)`   | `categorizer.ts`, `category-source.ts`, gardes SQL                                   |
| `transfers`      | `recognize(rows, accounts) -> { counterpartAccountId, peerId }[]`                                                    | `internal-transfers.ts`, `transfer-detection.ts`, reconnaissance des comptes manuels |
| `flow`           | `flowOf(tx, account, counterpart, nature)`, `decompose(buckets) -> Cashflow`                                         | `cashflow-scope.ts` et ses trois variantes                                           |
| `recurring`      | `detect(history, series) -> SeriesChange[]`, `identityOf(tx)`, `nextDue(series)`, `statusOf(series, today)`          | `recurring-detection.ts` et les 7 calculs d'échéance                                 |
| `budgets`        | `budgetOverview(budgets, spend, taxonomy) -> BudgetTree`                                                             | `budget-rollup.ts`, `budget-overview.ts`, règle anti double compte x4                |
| `balances`       | `reconstruct(anchor, bookedRows, fromDay) -> DailyBalance[]`, `manualBalance(declared, legs, day)`                   | Snapshots JSONB, `manual-account-balance.ts`                                         |
| `review`         | `buildMonthlyReview(facts, calendarDay) -> { verdicts, tone }`                                                       | Comportement gardé (ADR 0015)                                                        |

### `@keel/banking` : les modules applicatifs

Des modules profonds : une petite interface cache le chargement, la décision
pure, l'écriture transactionnelle et la planification de la suite.

| Module           | Interface                                                                                          | Absorbe (revue d'architecture)                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Arrivées         | `settleArrivals(scope, accountId, rows, origin) -> Summary`                                        | Candidat 3 : une seule porte pour le sync, le CSV et la reprise                        |
| Recatégorisation | `recategorize(scope, selection, target, source) -> { moved, undoToken }`                           | Candidat 1 : les 9 écrivains, le déplacement de mapping, l'undo côté serveur           |
| Après-écriture   | `transactionsChanged(scope, ids, cause)`                                                           | Candidat 2 : l'ordre des étapes décidé à un endroit, derrière un port `Dispatch`       |
| Catégorisation   | `categorizePending(scope)`                                                                         | L'échelle, avec le modèle derrière un port `CategorizationModel`                       |
| Réconciliation   | `reconcileHousehold(scope)`                                                                        | Virements, flux, séries, soldes, alertes ; recalcul complet avec écriture du seul diff |
| Séries           | `trackSeries`, `confirmSeries`, `dismissSeries`                                                    | Candidat 4 : identité et échéance décidées en un lieu                                  |
| Lectures         | `transactionsPage`, `cashflow`, `budgetOverview`, `upcoming`, `accountsOverview`, `balanceHistory` | Candidat 5 : des vues livrées entières, déjà converties                                |

`scope` = `{ householdId, memberId }`. Chaque module ouvre sa transaction via
`withScope(scope, tx => ...)`, qui pose les variables du RLS (section 5.3).

Ports et adaptateurs (deux adaptateurs par port, sinon pas de port) :

| Port                  | Production                               | Tests et dev local            |
| --------------------- | ---------------------------------------- | ----------------------------- |
| `Dispatch`            | BullMQ (`enqueue` du registry)           | Enregistreur en mémoire       |
| `CategorizationModel` | Vercel AI SDK, modèle choisi à l'étape 3 | Réponses scriptées, et l'eval |
| `BankingProvider`     | Enable Banking                           | Fake piloté par scénarios     |

### Ce que `transactionsChanged` décide

| Cause                                              | Étapes planifiées                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `arrival` (sync, CSV)                              | Catégoriser les nouvelles lignes, puis réconcilier ; historique de solde marqué sale depuis la plus ancienne date de comptabilisation reçue |
| `entry` (saisie manuelle)                          | Catégoriser si aucune catégorie n'a été choisie, puis réconcilier                                                                           |
| `recategorized`                                    | Réconcilier (le flux et les séries dépendent de la nature)                                                                                  |
| `edited`, `deleted`, `restored`                    | Réconcilier, historique de solde sale depuis la date touchée                                                                                |
| `account-changed` (type, propriétaire, visibilité) | Recalculer flux et `private_to` des lignes du compte, puis réconcilier                                                                      |
| `declared` (solde déclaré)                         | Recalculer le compte manuel et son historique                                                                                               |

La saisie manuelle passe donc par la même suite que le sync : ramnn ne
catégorisait pas les transactions saisies à la main et ne recalculait pas les
comptes manuels après une édition. Les deux bugs disparaissent par
construction.

### Tests

- `@keel/finance` : tests unitaires exhaustifs à travers chaque interface. Les
  8 défauts vérifiés de la revue et les bugs de l'audit deviennent des cas
  nommés (par exemple : « deux achats identiques le même jour sans
  entry_reference sont deux transactions »).
- `@keel/banking` : tests à travers l'interface des modules sur PGlite
  (Postgres en WASM, en mémoire, supporté par Drizzle, avec `SET ROLE` pour
  tester le RLS), avec les adaptateurs de test des ports. Cela assouplit la
  règle actuelle d'`AGENTS.md` (« mock at the boundary or skip ») : c'est la
  question 5.
- `@keel/bank-providers` : l'adaptateur Enable Banking est testé sur des
  réponses enregistrées, sans réseau. Chaque réponse est validée par Zod à la
  frontière, comme toute entrée externe.
- L'eval de catégorisation fait partie de l'étape 3.

## 4. Fluidité : ce que le domaine doit à l'interface

La référence est le web de Wealthsimple : pas d'état de chargement, pas de
cascade de requêtes, préchargement au survol. Une part se joue dans l'UI
(étape 4) ; ce qui suit se joue ici.

- **Réponses prêtes à afficher.** Une ligne de transaction arrive avec son
  montant natif et converti, le nom affiché, la catégorie et sa couleur, le
  nom du compte et l'**URL du logo** du marchand. Le client ne fait jamais une
  requête par ligne.
- **URL de logo prévisible et immuable** : `/logos/<domaine>.svg` servi par
  l'API avec `Cache-Control: immutable`, qui va chercher la source une seule
  fois. On ne stocke plus en base d'URL contenant un token (ramnn).
- **Entrées de requête déterministes.** Chaque lecture a un filtre normalisé
  par une fonction partagée entre client et serveur : tableaux triés, défauts
  explicites, dates au format jour. Le préchargement au survol et la requête
  au clic ont ainsi la même clé de cache.
- **Une lecture par surface**, pas par widget quand plusieurs widgets lisent
  les mêmes agrégats. Par exemple, `cashflow(month)` sert Disponible,
  Dépenses, Épargne et Top catégories.
- **Écritures optimistes partout** : `recategorize` renvoie ce qu'il a déplacé
  et un jeton d'undo, ce qui permet la mise à jour immédiate et l'annulation.
- **Invalidation en temps réel** : la fin d'une réconciliation publie un
  événement par foyer (SSE, le mécanisme des jobs de keel), et l'app invalide
  les clés concernées.
- **Index calés sur les écrans instantanés** (section 5.4). Pour les volumes
  visés (quelques milliers de transactions par foyer et par an), un mois
  entier d'agrégats reste sous la milliseconde avec le bon index. On n'ajoute
  pas de table d'agrégats pré-calculés sans mesure.

## 5. Schéma Drizzle

### 5.1 Conventions

- Tables au pluriel en snake_case, propriétés en camelCase, colonnes nommées
  explicitement (convention actuelle de keel).
- Identifiants des nouvelles tables : `uuid` natif en **v7** (ordonné dans le
  temps, 16 octets). C'est un écart avec `tasks` (UUID v4 en `text`) : la
  table des transactions est de loin la plus grosse, et la localité d'index
  compte. `user.id` reste en `text` (Better Auth).
- Toute table appartenant au foyer porte `household_id` en tête de ses index,
  et une politique RLS.
- Instants en `timestamptz`, dates du domaine en `date`, montants en `bigint`,
  devises en `char(3)`.
- Soft delete seulement là où il a un sens métier : tombstones de transactions,
  archivage des comptes et catégories, délai de grâce des connexions. ramnn
  mettait `deleted_at` partout, avec un prédicat obligatoire dans chaque
  requête et des index uniques partiels partout.
- Le schéma complet en TypeScript sera écrit après validation, dans
  `packages/db/src/schema/banking/*.ts`. Ce document fixe les tables, colonnes,
  contraintes et index.

Extrait de la forme visée :

```ts
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    privateTo: text("private_to").references(() => user.id),
    purchasedOn: date("purchased_on").notNull(),
    bookedOn: date("booked_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    flow: flowEnum("flow").notNull().default("unclassified"),
    // ...
  },
  (t) => [
    index("transactions_household_purchased_idx")
      .on(t.householdId, t.purchasedOn.desc(), t.id.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check("transactions_amount_nonzero", sql`${t.amountMinor} <> 0`),
    pgPolicy("transactions_member_policy", {
      for: "all",
      to: appRole,
      using: householdVisible(t),
      withCheck: householdVisible(t),
    }),
  ],
);
```

### 5.2 Tables

Légende : **PK** clé primaire, **FK** clé étrangère, **U** unique.

#### Foyer et personnes

**`households`** : id ; `name` ; `base_currency char(3)` (devise
d'affichage par défaut) ; `timezone text` (mois et « aujourd'hui ») ;
`created_at`.

**`household_members`** : PK (`household_id`, `user_id`) ; `role`
(`owner` | `member`) ; `joined_at`. **U** (`user_id`) : une personne, un foyer.

**`member_settings`** : PK `user_id` ; `household_id` ; `locale` ;
`display_currency char(3) null` (null = celle du foyer) ; `home_layout jsonb
null` (null = défaut adaptatif) ; `onboarded_at`. La table Better Auth `user`
n'est pas modifiée.

#### Banques et connexions

**`institutions`** (globale, sans RLS) : id ; `provider` (enum, pour l'instant
`enable_banking`) ; `provider_ref` ; `name` ; `country char(2)` ; `logo_url` ;
`psu_types text[]` ; `required_psu_headers text[]` (inutilisé par ramnn,
nécessaire pour les syncs manuelles) ; `max_consent_days` ;
`max_history_days` ; `popularity` ; `active` ; `updated_at`.
**U** (`provider`, `provider_ref`). Index : (`country`, `active`) ; GIN
trigramme sur `name` (recherche par nom, requête R19).

**`bank_connections`** : id ; `household_id` ; `consented_by` (FK `user`, le
membre qui a consenti) ; `institution_id` ; `provider` ;
`provider_session_ref` ; `status` (`active` | `reconnect_required` |
`removed`) ; `consent_expires_at` ; `next_sync_at` ; `last_synced_at` ;
`consecutive_failures smallint` ; `last_error_kind` (classe d'erreur du
provider) ; `removed_at` ; `created_at`, `updated_at`.
Index :

- (`next_sync_at`) `WHERE status = 'active'` : planificateur, R14 ;
- (`consent_expires_at`) `WHERE status = 'active'` : rappels, R15 ;
- (`household_id`).

Pas d'unicité (foyer, banque) : deux membres, ou deux identifiants d'un même
membre, peuvent se connecter à la même banque. La reconnexion vise une
connexion par son id, transporté dans le `state` OAuth.

**`bank_accounts`** : id ; `household_id` ; `connection_id` (null = compte
manuel) ; `owner_id` (FK `user`, null = joint) ; `is_private bool` ;
`provider_account_ref` (l'uid, qui change à chaque session) ; `stable_ref`
(`identification_hash`, stable entre sessions) ; `provider_name` ;
`custom_name` ; `kind` (`current` | `savings` | `card` | `loan` | `other`) ;
`kind_set_by` (`provider` | `member`) ; `currency` ; `iban` ;
`balance_minor` ; `balance_as_of` ; `declared_balance_minor` ;
`declared_on` ; `history_dirty_from date null` ; `hidden bool` (préférence
d'affichage, pour les miroirs de carte) ; `archived_at` ; `created_at`,
`updated_at`.
Contraintes :

- `CHECK ((connection_id IS NULL) = (declared_on IS NOT NULL AND
declared_balance_minor IS NOT NULL))` : un compte manuel a toujours son
  ancre, un compte synchronisé jamais ;
- `CHECK (NOT is_private OR owner_id IS NOT NULL)` ;
- **U** (`connection_id`, `stable_ref`) `WHERE connection_id IS NOT NULL`, qui
  sert à la reconnexion (ramnn n'avait aucune unicité ici) ;
- index (`household_id`).

**`account_balances`** : PK (`account_id`, `day`) ; `household_id` ;
`private_to` ; `balance_minor` ; `source` (`provider` | `reconstructed` |
`declared`). Une ligne par compte et par jour, du premier jour connu jusqu'à
aujourd'hui. Remplace les snapshots JSONB mêlés au portefeuille, sert le
graphe de trésorerie (R10) et reconstruit le passé (ADR 0011).

#### Transactions

**`transactions`** :

| Colonne                                                      | Type                                 | Rôle                                                                              |
| ------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------- |
| `id`                                                         | uuid v7                              |                                                                                   |
| `household_id`, `account_id`                                 | uuid                                 | FK, `account_id` obligatoire (ramnn l'acceptait nul)                              |
| `private_to`                                                 | text null                            | Copie de la visibilité du compte, pour le RLS                                     |
| `origin`                                                     | enum `provider` \| `csv` \| `manual` |                                                                                   |
| `provider_ref`                                               | text null                            | `entry_reference` uniquement                                                      |
| `fingerprint`, `occurrence`                                  | text, smallint                       | Identité de repli                                                                 |
| `import_id`                                                  | uuid null                            | FK `csv_imports`, pour annuler un import                                          |
| `purchased_on`, `booked_on`                                  | date                                 | Voir les invariants                                                               |
| `amount_minor`, `currency`                                   | bigint, char(3)                      | Signé, non nul                                                                    |
| `label`                                                      | text                                 | Libellé bancaire joint                                                            |
| `raw`                                                        | jsonb null                           | Champs bruts utiles du provider, pour re-parser quand le parseur s'améliore       |
| `counterparty_name`, `counterparty_iban`, `mcc`, `bank_code` | text null                            |                                                                                   |
| `method`                                                     | enum                                 | `card`, `cash_withdrawal`, `transfer`, `direct_debit`, `fee`, `interest`, `other` |
| `merchant_key`                                               | text null                            | Sortie du normaliseur unique                                                      |
| `merchant_id`                                                | uuid null                            | FK `merchants` (globale)                                                          |
| `display_name`, `note`                                       | text null                            | Éditions du membre, jamais lues par la machine                                    |
| `category_id`                                                | uuid null                            | FK feuille, `ON DELETE RESTRICT`                                                  |
| `category_source`                                            | enum null                            | `user`, `mapping`, `history`, `dictionary`, `model`                               |
| `category_mapping_id`                                        | uuid null                            | Le mapping qui a décidé, pour déplacer exactement ses lignes                      |
| `category_confidence`                                        | real null                            | Modèle seulement                                                                  |
| `categorized_at`                                             | timestamptz null                     | Null = catégorisation en attente                                                  |
| `needs_review`                                               | bool, généré                         | Pas de catégorie, ou modèle de confiance < 0,8                                    |
| `counterpart_account_id`                                     | uuid null                            | Compte du foyer de l'autre côté (ADR 0009)                                        |
| `transfer_peer_id`                                           | uuid null                            | La jambe jumelle, si elle existe                                                  |
| `transfer_dismissed`                                         | bool                                 | « Ce n'est pas un virement interne »                                              |
| `flow`                                                       | enum                                 | Voir les invariants (ADR 0010)                                                    |
| `recurring_series_id`                                        | uuid null                            |                                                                                   |
| `excluded_from_budget`, `excluded_from_analysis`             | bool                                 |                                                                                   |
| `search_text`                                                | text, généré                         | `lower(unaccent(label, nom affiché, contrepartie, note))`                         |
| `deleted_at`                                                 | timestamptz null                     | Tombstone                                                                         |
| `created_at`, `updated_at`                                   | timestamptz                          |                                                                                   |

Contraintes : `CHECK (amount_minor <> 0)` ;
**U** (`account_id`, `provider_ref`) `WHERE provider_ref IS NOT NULL` ;
**U** (`account_id`, `fingerprint`, `occurrence`) ; trigger « feuille
seulement » sur `category_id`.

`raw` ne sert qu'au re-parsing ; aucune requête ne le lit.

**`csv_imports`** : id ; `household_id` ; `account_id` ; `imported_by` ;
`file_name` ; `column_mapping jsonb` ; compteurs `inserted`, `promoted`,
`skipped` ; `status` ; `created_at`. Permet « annuler cet import » et garde
le mapping pour le prochain fichier de la même banque.

#### Catégorisation

**`categories`** : id ; `household_id null` (null = taxonomie système,
globale) ; `parent_id null` ; `key text null` (clé stable des lignes système,
par exemple `housing.rent`) ; `name` (nom pour les catégories du foyer, clé
i18n pour le système) ; `nature` ; `color` ; `icon` ; `is_catch_all` ;
`archived_at` ; `created_at`.
Contraintes : **U** (`key`) `WHERE household_id IS NULL` ; **U**
(`household_id`, `parent_id`, `name`) ; trigger « deux niveaux au plus ».
RLS : lecture si `household_id IS NULL` ou si c'est le foyer courant ;
écriture seulement sur le foyer courant. Un foyer ajoute des sous-catégories
sous les catégories système (ADR 0012).

**`merchants`** (globale) : id ; `key text U` ; `name` ; `domain null` ;
`created_at`, `updated_at`. Le logo se déduit du domaine à la lecture. Les
colonnes Google Places disparaissent (lieu, coordonnées, types).

**`merchant_mappings`** : id ; `household_id` ; `matcher` (`merchant` |
`keyword`) ; `pattern` ; `category_id` ; `created_by` ; `created_at`,
`updated_at`. **U** (`household_id`, `matcher`, `pattern`). Une table
remplace `user_category_rules` + `user_category_rule_conditions` : l'ADR 0001
de ramnn avait déjà fait du mapping le seul concept visible, et le conteneur
« règle » n'existait plus que pour le stockage. Entre deux mots-clés qui
correspondent, le plus long l'emporte (déterministe), ce qui remplace la
colonne `priority`.

#### Séries, budgets, objectif

**`recurring_series`** : id ; `household_id` ; `private_to` ;
`identity_key` ; `merchant_key` ; `direction` (`outflow` | `inflow`) ;
`currency` ; `cadence` ; `typical_amount_minor` (> 0) ; `name` ; `status`
(`suggested` | `active` | `dismissed` | `ended`) ; `origin` (`detected` |
`member`) ; `last_on` ; `next_due_on` (écrit par le seul module) ;
`occurrence_count` ; `confirmed_at` ; `created_at`, `updated_at`.
**U** (`household_id`, `identity_key`) : le rejet (`dismissed`) est une
tombstone qui empêche la re-suggestion. Index (`household_id`,
`next_due_on`) `WHERE status = 'active'` pour les échéances et le calendrier
(R8).

**`budgets`** : id ; `household_id` ; `category_id` ; `effective_month`
(`CHECK` premier du mois) ; `amount_minor null` (null = plus de budget à
partir de ce mois) ; `currency` ; `created_by` ; `created_at`.
**U** (`household_id`, `category_id`, `effective_month`), qui sert aussi la
lecture « dernier budget en vigueur » (R20). ramnn avait en plus deux index
redondants avec cette contrainte.

**`savings_targets`** : PK (`household_id`, `effective_month`) ;
`amount_minor null` ; `currency` ; `created_at`.

#### Revue, alertes, notifications

**`monthly_reviews`** : PK (`user_id`, `month`) ; `household_id` ; `locale` ;
`narrative jsonb null` ; `model` ; `emailed_at` (remplace l'emprunt de
`last_digest_at` au digest) ; `chart_token U` ; `rating` ; `rating_comment` ;
`rated_at` ; `created_at`.

**`balance_thresholds`** : PK `user_id` ; `household_id` ; `scope`
(`current` | `liquid` | `total`) ; `low_minor null` ; `high_minor null` ;
`currency` ; `low_fired_at` ; `high_fired_at` ; `updated_at`.

**`notifications`** : id ; `user_id` ; `household_id` ; `type` ;
`payload jsonb` ; `read_at` ; `archived_at` ; `created_at`.
Index : (`user_id`, `created_at` desc, `id` desc) `WHERE archived_at IS NULL`
(liste) ; (`user_id`) `WHERE read_at IS NULL` (badge).

**`notification_preferences`** : PK (`user_id`, `type`, `channel`) ;
`enabled`. Seuls les écarts au défaut du code sont stockés.

**`activity_events`** : id ; `household_id` ; `actor_id null` (null =
système) ; `entity_type` ; `entity_id` ; `action` ; `changes jsonb` ;
`created_at`. Index (`household_id`, `created_at` desc). Purge à 90 jours.

#### Change

**`fx_rates`** (globale) : PK (`currency`, `day`) ; `per_eur numeric(20,10)`.
Lecture bornée à la plage demandée, jamais la série entière (ramnn
rechargeait tout l'historique à chaque requête d'affichage).

### 5.3 Isolation : RLS réellement actif (ADR 0013)

État actuel de keel : une politique existe sur `tasks`, mais l'app se connecte
avec le rôle propriétaire des tables, qui contourne le RLS. Rien n'est protégé.

Cible :

1. Deux rôles. `keel_owner` possède les tables et exécute les migrations.
   `keel_app` sert à l'API et au worker, sans `BYPASSRLS`, sans propriété.
2. `withScope({ householdId, memberId }, fn)` ouvre une transaction et exécute
   `set_config('app.household_id', $1, true)` et
   `set_config('app.user_id', $2, true)`. Le `true` rend la valeur locale à la
   transaction : jamais de `SET` de session sur une connexion du pool.
3. Politique type : `household_id = current_setting('app.household_id')::uuid
AND (private_to IS NULL OR private_to = current_setting('app.user_id'))`.
4. Les quelques parcours globaux (planificateur de sync, rappels de
   consentement, candidats à la revue, purges) passent par des fonctions
   `SECURITY DEFINER` qui ne renvoient que des identifiants. Le processeur
   rouvre ensuite une transaction `withScope` pour le foyer concerné.
5. Les requêtes gardent aussi leur `WHERE household_id = ?` : le RLS est un
   second verrou, pas le seul.

Coût : un aller-retour `set_config` par transaction, négligeable devant le
reste.

### 5.4 Index justifiés par les requêtes réelles

Les requêtes viennent du catalogue de ramnn, rapportées aux écrans de keel.

| #   | Requête (écran)                                                                                                                                        | Fréquence                        | Index                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Liste de transactions : filtres vue, comptes, catégories, période, montant, recherche ; tri par date et curseur (Transactions, détail de compte, home) | La plus chaude                   | (`household_id`, `purchased_on` desc, `id` desc) `WHERE deleted_at IS NULL`                                                                                                                         |
| R1b | Même liste triée par montant                                                                                                                           | Occasionnelle                    | (`household_id`, `amount_minor`, `id`) `WHERE deleted_at IS NULL` (ramnn triait sur un `CAST` sans index)                                                                                           |
| R2  | Recherche texte                                                                                                                                        | À la frappe                      | GIN trigramme sur `search_text`. ramnn combinait une FTS en `english` et quatre ILIKE non indexés dans un OR, ce qui neutralisait le GIN                                                            |
| R3  | Compteurs « à revoir » (home)                                                                                                                          | Chaque chargement                | (`household_id`) `WHERE needs_review AND deleted_at IS NULL`                                                                                                                                        |
| R4  | Détail d'une transaction + jambe jumelle                                                                                                               | Au clic                          | PK (la jumelle est désignée par `transfer_peer_id`, plus de recherche) ; index partiel sur `transfer_peer_id` pour la FK                                                                            |
| R5  | Cashflow et Sankey d'une période (home, analyse, revue)                                                                                                | Chaque chargement de la home     | R1, groupé par (mois, catégorie, flux, devise). Le flux stocké supprime le `NOT EXISTS` corrélé de ramnn                                                                                            |
| R6  | Dépenses par catégorie pour les budgets                                                                                                                | Home, budgets, alertes           | R1, `flow = 'expense'`                                                                                                                                                                              |
| R7  | Concentration marchands                                                                                                                                | Analyse                          | R1, groupé par `merchant_id`                                                                                                                                                                        |
| R8  | Échéances et calendrier                                                                                                                                | Home                             | (`household_id`, `next_due_on`) partiel sur `recurring_series`                                                                                                                                      |
| R9  | Comptes et soldes                                                                                                                                      | Chaque page                      | (`household_id`) sur `bank_accounts`                                                                                                                                                                |
| R10 | Historique de solde (graphe de trésorerie)                                                                                                             | Home, détail de compte           | PK (`account_id`, `day`)                                                                                                                                                                            |
| R11 | Settlement : lignes connues d'un compte dans la fenêtre du fetch, tombstones comprises                                                                 | Chaque sync                      | (`account_id`, `booked_on`) sans filtre sur `deleted_at` ; les deux uniques d'identité                                                                                                              |
| R12 | Catégorisation : lignes en attente ; votes d'historique ; application d'un mapping                                                                     | Chaque sync, chaque mapping      | (`household_id`) `WHERE categorized_at IS NULL` ; (`household_id`, `merchant_key`) `WHERE deleted_at IS NULL`. `merchant_key` est stocké, donc plus d'expression `normalize(lower())` non indexable |
| R13 | Réconciliation : lignes du foyer sur la fenêtre                                                                                                        | Après chaque écriture, regroupée | R1                                                                                                                                                                                                  |
| R14 | Planificateur de sync                                                                                                                                  | Toutes les 15 min                | (`next_sync_at`) partiel. Fini le scan global filtré en JS                                                                                                                                          |
| R15 | Rappels d'expiration                                                                                                                                   | Quotidien                        | (`consent_expires_at`) partiel                                                                                                                                                                      |
| R16 | Notifications et badge                                                                                                                                 | Chaque page                      | Voir la table                                                                                                                                                                                       |
| R17 | Journal d'activité                                                                                                                                     | Réglages                         | (`household_id`, `created_at` desc)                                                                                                                                                                 |
| R18 | Taux de change sur une plage                                                                                                                           | Chaque lecture convertie         | PK (`currency`, `day`)                                                                                                                                                                              |
| R19 | Recherche de banque                                                                                                                                    | Connexion                        | (`country`, `active`) + trigramme sur `name`                                                                                                                                                        |
| R20 | Budgets en vigueur pour un mois                                                                                                                        | Home, budgets                    | U (`household_id`, `category_id`, `effective_month`)                                                                                                                                                |
| R21 | Membres d'une série récurrente                                                                                                                         | Détail de série                  | (`recurring_series_id`) partiel                                                                                                                                                                     |
| R22 | Annuler un import                                                                                                                                      | Rare                             | (`import_id`) partiel                                                                                                                                                                               |

Index de ramnn qu'on ne recrée pas : ceux qu'aucune requête n'utilisait
(`bank_connections_error_idx`, `not_enriched_idx`, trigramme et Places sur
`merchants`, GIN des snapshots), et les doublons exacts de contraintes
uniques (budgets, snapshots, merchants, catégories, cibles d'épargne).

Pas d'index couvrant (`INCLUDE`) au départ : Drizzle ne le déclare pas et le
volume ne le justifie pas. On l'ajoutera par une migration SQL écrite à la
main si une mesure le demande.

### 5.5 Les 12 tables bancaires de ramnn, une par une

| ramnn                           | keel                | Différence et raison                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_bank_categories`          | `categories`        | La taxonomie système devient globale au lieu d'être copiée chez chaque utilisateur (ADR 0012). La propriété passe au foyer. `slug` devient `key`, réservé au système                                                                                                                                                                                                                                                                     |
| `user_category_rules`           | `merchant_mappings` | Le conteneur de stockage disparaît (ADR 0006)                                                                                                                                                                                                                                                                                                                                                                                            |
| `user_category_rule_conditions` | `merchant_mappings` | Idem. `priority` remplacée par « le motif le plus long gagne »                                                                                                                                                                                                                                                                                                                                                                           |
| `bank_connections`              | `bank_connections`  | Consentement lié à un membre ; `next_sync_at` pour le planificateur ; classe d'erreur typée ; colonnes `error*` mortes supprimées ; unicité (banque, propriétaire) abandonnée ; révocation différée à la purge                                                                                                                                                                                                                           |
| `bank_accounts`                 | `bank_accounts`     | Propriétaire et visibilité ; `kind` à la place de `type`, et l'ADR 0004 de ramnn, contredite par son code, est tranchée ; unicité (connexion, `stable_ref`) ; `CHECK` compte manuel ; devise obligatoire ; solde en unités mineures signé du point de vue du titulaire                                                                                                                                                                   |
| `recurring_series`              | `recurring_series`  | `identity_key` calculée à partir du `merchant_key` stocké : plus de dérive quand l'enrichissement change. `next_due_on` n'est plus jamais reçu du client. `rejected` devient `dismissed`. Plus de soft delete                                                                                                                                                                                                                            |
| `bank_transactions`             | `transactions`      | Unités mineures ; `booked_on` gardé ; identité par compte (`provider_ref` ou empreinte + rang) au lieu d'un `internal_id` global préfixé par l'utilisateur ; plus de gel USD ; `counterpart_account_id` et `transfer_peer_id` à la place de `transfer_pair_id` ; `flow` stocké ; `merchant_key` stocké ; `categorized_at` remplace `enrichment_completed` ; recherche en trigramme à la place de la FTS `english` ; `raw` pour re-parser |
| `bank_transaction_embeddings`   | —                   | Coupée (kNN, décision 1). L'étape 3 peut en réintroduire, sous une autre forme                                                                                                                                                                                                                                                                                                                                                           |
| `transaction_anomaly_scores`    | —                   | Coupée (anomalies)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `budgets`                       | `budgets`           | Mois de prise d'effet au lieu d'une date libre ; enum `recurrence` supprimé ; fin d'un budget = ligne avec montant nul, plus de soft delete                                                                                                                                                                                                                                                                                              |
| `savings_targets`               | `savings_targets`   | Clé naturelle (foyer, mois)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `monthly_reviews`               | `monthly_reviews`   | Par membre ; `emailed_at` remplace le curseur emprunté au digest                                                                                                                                                                                                                                                                                                                                                                         |

Tables annexes : `net_worth_snapshots` → `account_balances` ;
`notification_settings` → `notification_preferences` (écarts au défaut
seulement, sans le digest) ; `domain_events` → `activity_events` ;
`exchange_rates` + `exchange_rate_history` → `fx_rates` ; `merchants` sans les
colonnes Places ; `users` (colonnes métier) → `households` +
`member_settings`. Nouvelles tables : `households`, `household_members`,
`csv_imports`.

La correspondance colonne par colonne, pour l'ETL, est dans
`03-schema-mapping.md`.

## 6. Jobs BullMQ

### 6.1 Files

Le registry de keel n'a qu'une file. On passe à trois files, pour que la
concurrence de chacune soit réglée indépendamment :

| File            | Rôle                                    | Concurrence                  |
| --------------- | --------------------------------------- | ---------------------------- |
| `bank-sync`     | Appels à l'agrégateur                   | Faible, avec limiteur global |
| `bank-pipeline` | Catégorisation (LLM) et réconciliation  | Moyenne                      |
| `default`       | Emails, exports, purges, taux de change | Celle d'aujourd'hui          |

Changement du registry : chaque entrée devient `{ queue, schema }`. Le
worker démarre un `Worker` par file. Toujours un seul point d'entrée
`enqueue(name, payload)`, validé par Zod.

### 6.2 Liste

| Job                            | Payload (Zod)                                                                                                       | Déclenchement                                         | Idempotence                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bank.sync-due`                | `{}`                                                                                                                | Planificateur, toutes les 15 min                      | Parcours `SECURITY DEFINER` des connexions dues, puis enqueue de chacune                                                                                                                   |
| `bank.sync-connection`         | `{ connectionId: uuid, reason: "scheduled" \| "manual" \| "initial" \| "reconnect", psu?: { ip, userAgent, ... } }` | `sync-due`, bouton rafraîchir, fin de consentement    | `jobId` = `sync:<connectionId>:<créneau>`                                                                                                                                                  |
| `bank.sync-account`            | `{ accountId: uuid, window: "incremental" \| "full", reason, psu? }`                                                | Fan-out de `sync-connection`, un job par compte       | `jobId` = `sync-account:<accountId>:<créneau>` ; Settlement est idempotent par construction                                                                                                |
| `bank.categorize`              | `{ householdId: uuid }`                                                                                             | `transactionsChanged`                                 | Regroupement par foyer (dédoublonnage BullMQ, anti-rebond de 5 s avec `extend` et `replace`). Traite tout ce qui est en attente (`categorized_at IS NULL`) : aucune liste d'ids dans Redis |
| `bank.reconcile`               | `{ householdId: uuid }`                                                                                             | `transactionsChanged`, fin de `categorize`            | Même regroupement. Recalcul complet du foyer, écriture du seul diff                                                                                                                        |
| `bank.consent-reminders`       | `{}`                                                                                                                | Quotidien                                             | `jobId` = `reminder:<connectionId>:<J-14 ou J-3>`                                                                                                                                          |
| `bank.purge`                   | `{}`                                                                                                                | Quotidien                                             | Connexions retirées depuis plus de 30 jours : révocation chez l'agrégateur puis suppression. Tombstones de plus de 800 jours                                                               |
| `bank.institutions-refresh`    | `{ country?: string }`                                                                                              | Hebdomadaire                                          | Upsert sur (`provider`, `provider_ref`)                                                                                                                                                    |
| `fx.refresh-rates`             | `{ from?: date }`                                                                                                   | Quotidien, après publication de la BCE                | Upsert sur (`currency`, `day`)                                                                                                                                                             |
| `csv.import`                   | `{ importId: uuid }`                                                                                                | Fin du mapping des colonnes                           | Passe par `settleArrivals`, donc rejouable                                                                                                                                                 |
| `review.dispatch`              | `{}`                                                                                                                | Toutes les heures                                     | Membres dont c'est le 1er du mois, 8 h, dans le fuseau du foyer, sans `emailed_at`                                                                                                         |
| `review.send`                  | `{ userId, month }`                                                                                                 | `review.dispatch`                                     | `jobId` = `review:<userId>:<month>`, upsert (`user_id`, `month`)                                                                                                                           |
| `notify.email`                 | `{ notificationId: uuid }`                                                                                          | Création d'une notification avec le canal email actif | `jobId` = id de la notification                                                                                                                                                            |
| `export.gdpr` / `export.purge` | `{ userId }` / `{ key }`                                                                                            | Réglages ; 12 h plus tard                             | `jobId` par utilisateur et par jour                                                                                                                                                        |
| `user.delete-data`             | `{ userId }`                                                                                                        | Confirmation par email                                | Chaque étape idempotente (révocations, purge R2, suppression)                                                                                                                              |

Le digest de transactions n'existe plus (décision 3).

### 6.3 Relances et erreurs du provider

Les erreurs de l'agrégateur arrivent classées par l'adaptateur (section 7) :

| Classe                            | Conduite du job                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `reconnect_required`              | `UnrecoverableError` ; la connexion passe à `reconnect_required` ; notification au membre qui a consenti               |
| `rate_limited`                    | `DelayedError` jusqu'à `retryAfter` (6 h pour Enable Banking), qui ne compte pas comme un échec                        |
| `transient`, `bank_unavailable`   | 5 tentatives, backoff exponentiel à partir de 30 s ; `consecutive_failures` incrémenté ; alerte ops au-delà d'un seuil |
| `invalid_request`, `psu_required` | Échec immédiat, remonté à Sentry : c'est un bug d'intégration                                                          |

Budget d'appels : la plupart des banques limitent les accès non initiés par
l'utilisateur à 4 par jour et par compte. Un compteur Redis par (compte,
jour) protège ce budget. Un rafraîchissement manuel envoie tous les en-têtes
PSU exigés par la banque (`required_psu_headers`) ou aucun ; il échappe alors
au plafond, mais il est limité à un par connexion toutes les 5 minutes.

Fréquence proposée : deux syncs planifiées par jour (7 h et 19 h dans le
fuseau du foyer, avec une gigue aléatoire), plus le manuel. Cela laisse de la
marge pour les relances dans le plafond de 4 (question 6).

## 7. Intégration Enable Banking derrière un port (ADR 0005)

```ts
interface BankingProvider {
  readonly id: ProviderId;
  listInstitutions(country: string): Promise<ProviderInstitution[]>;
  startConsent(input: StartConsent): Promise<{ redirectUrl: string }>;
  completeConsent(input: { code: string; psu: PsuContext }): Promise<Consent>;
  getConsent(sessionRef: string): Promise<Consent>;
  revokeConsent(sessionRef: string): Promise<void>;
  fetchAccount(ref: AccountRef, psu?: PsuContext): Promise<ProviderAccount>;
  fetchTransactions(
    ref: AccountRef,
    window: "incremental" | "full",
    psu?: PsuContext,
  ): Promise<ArrivingRow[]>;
}
```

- **Sortie déjà dans la forme du domaine** : montants signés en unités
  mineures, solde signé du point de vue du titulaire, devise résolue, type de
  compte proposé, lignes de libellé, `providerRef` seulement si
  `entry_reference` existe. Le vocabulaire PSD2 ne sort pas de l'adaptateur.
- **`fetchTransactions` renvoie le fetch entier**, dans l'ordre de la banque :
  la fenêtre live (`default`) d'abord, puis `longest`. Pagination par
  `continuation_key` interne. Settlement reçoit tout d'un bloc et découpe
  seulement ses écritures (correction du bug des lots de 500).
- **Erreurs** : une seule `ProviderError { kind, retryAfterSeconds?,
providerCode }`. Les réponses sont validées par Zod ; une réponse
  inattendue devient `invalid_request`. Le code d'erreur Enable Banking
  (`EXPIRED_SESSION`, `ASPSP_RATE_LIMIT_EXCEEDED`, `PSU_HEADER_NOT_PROVIDED`)
  est lu dans le corps, pas déduit du code HTTP.
- **Ce qui reste dans le domaine**, applicable quel que soit l'agrégateur : la
  date d'achat lue dans le libellé, l'accepteur de carte, la détection des
  miroirs de carte, la méthode.
- **Deux adaptateurs** : Enable Banking (JWT RS256 avec `jose`, `fetch`
  natif ; `xior` n'est pas repris) et un fake piloté par scénarios pour les
  tests et le développement local sans banque. La revue d'architecture
  préférait un module concret sans interface tant qu'il n'y a qu'un adaptateur
  ; le fake en fait deux, et un second agrégateur ne demandera aucune refonte.

## 8. Décisions validées (2026-09-28)

1. **Foyer** : schéma et RLS prêts pour plusieurs membres dès le départ ;
   l'invitation d'un membre (écran, emails, départ) vient dans une étape
   ultérieure de la roadmap.
2. **Comptes privés** : supportés dès le schéma, avec `private_to` dénormalisé
   et garanti par le RLS.
3. **Chiffres par membre** : revue mensuelle, alertes de budget et seuils sont
   calculés pour la vue de chaque membre. La vue foyer et la vue membre suivent
   la référence Wealthsimple, y compris la répartition du patrimoine par
   membre (section 1).
4. **Taxonomie système globale**, jamais renommée par un foyer. Les foyers
   ajoutent seulement leurs sous-catégories.
5. **Tests DB sur PGlite** : ajouté au catalog en dépendance de dev ; la règle
   d'`AGENTS.md` est assouplie pour les modules de `@keel/banking`.
6. **Deux syncs planifiées par jour**, plus le rafraîchissement manuel.
7. **Retrait d'une connexion** : délai de grâce de 30 jours, annulable, puis
   révocation et purge.
8. **RLS réellement actif** avec le rôle restreint `keel_app`, table `tasks`
   comprise.
9. **Langue** : `CONTEXT.md` et ADR en anglais, documents de migration en
   français.
10. **Trois packages** : `@keel/finance`, `@keel/banking`,
    `@keel/bank-providers`.
