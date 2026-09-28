# 01 · Audit ramnn (périmètre banque) : garder, refaire, couper

- Date : 2026-09-28
- Source : ramnn `532d9974` (2026-09-24)
- Entrées : lecture du code (4 audits en parallèle), `CONTEXT.md`, ADR 0001
  à 0011, revue d'architecture du 2026-09-28 (7 candidats, 8 défauts), eval de
  catégorisation rejouée hors ligne, runs Trigger.dev de prod.

Verdicts possibles :

- **Garder le comportement** : le comportement métier est bon. On le
  reconçoit dans keel sans copier le code.
- **Refaire autrement** : le besoin est réel, mais la forme actuelle est
  fausse ou superficielle.
- **Couper** : on ne le porte pas.

Rappel : aucune couche base de données n'est reprise. Le schéma keel est
reconçu à l'étape 2 ; ce document ne décrit que le comportement.

## Synthèse

| #   | Feature                                     | Verdict                         |
| --- | ------------------------------------------- | ------------------------------- |
| 1   | Intégration Enable Banking                  | Garder, erreurs refaites        |
| 2   | Cycle de vie des connexions                 | Refaire autrement               |
| 3   | Synchronisation et Settlement               | Garder, orchestration refaite   |
| 4   | Comptes, comptes manuels, Declared balance  | Garder le comportement          |
| 5   | Historique de soldes / patrimoine           | Refaire, historique reconstruit |
| 6   | FX multi-devises                            | Garder le comportement          |
| 7   | Référentiel des banques                     | Garder le comportement          |
| 8   | Taxonomie, nature, feuilles                 | Garder le comportement          |
| 9   | Écriture de catégorie (9 écrivains)         | Refaire autrement               |
| 10  | Merchant mappings et rule prompt            | Garder, bugs corrigés           |
| 11  | Cascade de catégorisation                   | Refaire autrement (kNN coupé)   |
| 12  | Eval de catégorisation                      | Refaire autrement               |
| 13  | Enrichissement marchand : Google Places     | Couper                          |
| 14  | Enrichissement marchand : logo par domaine  | Garder le comportement          |
| 15  | Détection d'anomalies                       | Couper (décidé)                 |
| 16  | Virements internes et mouvements d'épargne  | Garder, signal refait           |
| 17  | Séries récurrentes                          | Refaire autrement               |
| 18  | Budgets                                     | Garder, périmètre refait        |
| 19  | Objectif d'épargne (Savings target)         | Garder le comportement          |
| 20  | Revue mensuelle et narrative                | Garder le comportement          |
| 21  | Digest de transactions                      | Couper                          |
| 22  | Seuils de solde                             | Garder le comportement          |
| 23  | Notifications (in-app, email, temps réel)   | Garder le socle                 |
| 24  | Analyse : cashflow, Sankey, concentration   | Garder le comportement          |
| 25  | Home à widgets                              | Refaire (même logique)          |
| 26  | Page Transactions et CRUD                   | Garder, 3 corrections           |
| 27  | Import CSV                                  | Refaire autrement               |
| 28  | Export CSV de sélection                     | Refaire autrement               |
| 29  | Export RGPD                                 | Garder le comportement          |
| 30  | Onboarding, réglages, suppression de compte | Garder le comportement          |
| 31  | Feedback et journal d'activité              | Garder le comportement          |

La conclusion transversale la plus importante ne vient d'aucune feature isolée :
**ramnn a quatre définitions de « ce qui compte comme dépense »** (cashflow,
budgets, digest, concentration marchands) et elles ne concordent pas. Dans keel,
un seul module de **périmètre de flux** les porte toutes (voir 18 et 24).

## Signaux d'usage réels

Trigger.dev ne garde que 24 h d'historique en prod (262 runs, du 27/09 08:10
au 28/09 08:00). C'est un indice, pas une mesure.

| Tâche                            | Sortie observée                           |
| -------------------------------- | ----------------------------------------- |
| `monthly-review-scheduler`       | 4 utilisateurs candidats à la revue       |
| `send-transaction-digest`        | 2 envois tentés, `empty_window`, 0 envoyé |
| `check-balance-thresholds`       | `no_thresholds` : aucun seuil configuré   |
| `sync-account` / `-transactions` | 3 syncs par jour, 0 nouvelle ligne        |
| `evaluate-alerts`, `sync-news`   | hors périmètre, 156 runs sur 262          |
| LLM (`llm_metrics`)              | 0 appel sur la fenêtre                    |

Toutes les notifications sont activées par défaut : les réglages ne donnent
donc aucun signal d'opt-in. Les requêtes d'agrégat à lancer en prod pour
mesurer l'usage réel (lecture seule, sans donnée personnelle) sont en annexe A.

## Connexions et synchronisation

### 1. Intégration Enable Banking

- **Ce que ça fait.** JWT RS256, `/auth`, `/sessions`, soldes (préférence
  `closingBooked`), transactions paginées (plafond de 50 pages). Le transform
  lit le type de compte PSD2, la **date d'achat dans le libellé CB**, la
  méthode ISO 20022, le marchand et l'IBAN de contrepartie. Fichiers :
  `packages/banking/src/providers/enablebanking/*`, `transform.ts`,
  `utils/error.ts`.
- **Valeur.** Cœur du produit.
- **Qualité.** Transform bien testé (32 cas, fetch 10 cas, card-mirror). Mais
  le module est un pass-through (revue, candidat 6). Seules `/auth` et
  `exchangeCode` lèvent `ProviderError`, tout le reste laisse remonter des
  erreurs xior brutes. `utils/error.ts` contient encore des codes Plaid,
  Teller et GoCardless, hérités de Midday.
- **Bugs vérifiés.**
  - `parse-error.ts:2` attend `{error:{code}}` alors qu'une erreur xior porte
    `response.data`. `errorRetries` ne s'incrémente jamais et la déconnexion
    automatique après 3 échecs est du code mort.
  - Signe du solde crédit : `Math.abs` à la connexion (`transform.ts:76`), valeur
    brute au sync (`:130`). Le patrimoine le masque, la liste des comptes non.
  - Pas de solde renvoyé par la banque : `sync-account.ts:46` écrit 0.
- **Verdict : Garder le comportement** (transform, fenêtres, date d'achat,
  card-mirror) et refaire l'adaptateur. Il rend des erreurs classées
  (`disconnected`, `rate-limited`, `transient`), des lignes déjà en forme
  arrivante et un solde au signe normalisé une seule fois. Interface de
  provider en place pour un second agrégateur (demande de la mission ; la
  revue préférait un module concret sans interface, arbitrage à l'étape 2).

### 2. Cycle de vie des connexions

- **Ce que ça fait.** Lien `/auth` avec nonce CSRF dans Redis, callback, choix
  des comptes (miroirs de carte décochés), upsert qui préserve les renommages,
  2 syncs initiaux (t0 et +5 min), rappels d'expiration à J-14 et J-3,
  soft-delete en cascade. Fichiers : routeur `bank-connections`,
  `apps/app/app/api/enablebanking/session/route.ts`,
  `jobs/src/trigger/bank/connections/*`.
- **Valeur.** Indispensable.
- **Qualité.** Rapprochement de reconnexion testé (6 tests). Défauts :
  - `delete-connection.ts` révoque la session tout de suite alors que la
    suppression est un soft-delete annulable : une connexion restaurée est
    morte ;
  - deux chemins de reconnexion (callback et upsert de `createBankConnection`),
    l'ancienne session n'est jamais révoquée ;
  - `updateBankAccountsByReference` (`bank-connections.ts:~720`) ne filtre ni
    par connexion ni sur `deletedAt` ;
  - `internalId` unique globalement : un compte supprimé puis ré-ajouté est
    bloqué sans erreur par `onConflictDoNothing` ;
  - colonnes `status='error'`, `errorRetries`, `errorDetails` mortes.
- **Verdict : Refaire autrement.** Un seul flux de reconnexion, révocation
  différée à la purge définitive, identité de compte scopée à la connexion.
  Rappels d'expiration gardés tels quels.

### 3. Synchronisation et Settlement

- **Ce que ça fait.** Cron horaire. Chaque connexion est synchronisée une fois
  par jour, 2 à 5 h avant l'heure du digest dans le fuseau de l'utilisateur.
  Fenêtre incrémentale de 5 jours ; un sync initial ou manuel prend 365 j en
  `default` et 730 j en `longest`. Settlement pur : `insert`, `promote` (ligne
  booked révisée, catégorie et éditions préservées) ou `skip`, et une ligne
  supprimée n'est jamais ressuscitée (ADR 0010).
- **Valeur.** Élevée.
- **Qualité.** Settlement pur et testé (13 tests), orchestration sans aucun test.
  - Lots de 500 (`sync-account.ts:126`) : `fetchFull` met la fenêtre live avant
    `longest`, et la déduplication ne voit qu'un lot. Une copie périmée dans le
    lot suivant promeut par-dessus la ligne fraîche ou s'insère en doublon.
    **Confirmé.**
  - Aucun appel ne transmet le contexte PSU : le rafraîchissement manuel est
    compté comme accès non initié par l'utilisateur (environ 4 par jour et par
    compte) et n'a aucune limite de fréquence. Le setup consomme environ
    6 appels par compte le premier jour.
  - Application des verdicts écrite en ligne dans la tâche, non testée.
- **Verdict : Garder le comportement** (fenêtres, fréquence, règles de
  Settlement) et **refaire l'orchestration** : Settlement devient la seule porte
  des lignes arrivantes (revue, candidat 3). Il charge, décide et écrit une fois
  par fetch entier, avec découpage interne après décision. Le sync et l'import
  CSV lui passent la même forme de ligne. Le rafraîchissement manuel envoie le
  contexte PSU et il est limité en fréquence.

## Comptes et soldes

### 4. Comptes, comptes manuels, Declared balance

- **Ce que ça fait.** CRUD, soft-delete et restauration, classification
  courant / épargne corrigible par l'utilisateur. Solde d'un compte manuel =
  ancre déclarée + virements reconnus par le nom du compte dans le libellé
  d'un compte synchronisé, datés strictement après la déclaration (ADR 0007).
  Fichiers : routeur `bank-accounts`, `db/utils/manual-account-balance.ts`.
- **Valeur.** Élevée : les livrets absents de PSD2.
- **Qualité.** Logique pure testée (8 tests). Défauts :
  - le modal renvoie toujours `balance` (`edit-bank-account-modal.tsx:113`,
    `bank-accounts.ts:351`) : renommer remet `declaredAt` à aujourd'hui, et sur
    un compte synchronisé le solde saisi écrase celui de la banque ;
  - l'édition, la suppression et l'annulation ne recalculent pas le solde
    manuel (revue, candidat 2) ;
  - l'ADR 0004 est obsolète : il décrit une colonne `subtype`, alors que le code
    a ajouté `savings` à l'enum `type`, précisément ce que l'ADR rejetait.
- **Verdict : Garder le comportement.** « Déclarer un solde » devient une
  action distincte de « modifier le compte ». Le recalcul est déclenché par le
  module post-écriture (voir 9). La classification suit l'ADR 0004 d'origine :
  un axe liquidité séparé de l'axe actif / passif.

### 5. Historique de soldes et patrimoine

- **Ce que ça fait.** `net_worth_snapshots` stocke une ligne par jour et par
  utilisateur, avec holdings et comptes en JSONB. Écrite par un cron à
  23:30 UTC et par `snapshot-on-change` (8 appels collés dans le code). Le
  graphe épinglé de la home et `balanceHistory` la lisent.
- **Valeur.** Moyenne une fois le portefeuille retiré : il ne reste que la
  trésorerie totale.
- **Qualité.** Mélange portfolio et banque ; la tâche portfolio porte aussi le
  déclenchement des seuils de solde.
- **Verdict : Refaire autrement.** Un solde par compte et par jour, en devise
  native, écrit en fin de sync et par le recalcul des comptes manuels. Plus de
  JSONB, plus de déclenchement par snapshot.

### 6. FX multi-devises

- **Ce que ça fait.** Chaque transaction est figée en USD canonique au taux de
  sa date ; le taux historique sert à l'historique de solde et le taux spot aux
  seuils. Une devise vide ou `XXX` est complétée à partir de la première
  transaction.
- **Verdict : Garder le comportement.** Devise obligatoire au schéma. Le choix
  de la devise pivot (USD canonique ou conversion à la lecture) est tranché à
  l'étape 2. Source des taux : seul `market-data/rates.ts` est à reprendre.

### 7. Référentiel des banques

- **Ce que ça fait.** Recherche trigram par pays, compteur de popularité.
  Alimenté par un script manuel (`packages/banking/scripts/seed.ts`).
- **Verdict : Garder le comportement**, alimenté par un job planifié.

## Catégorisation

### 8. Taxonomie, nature, feuilles

- **Ce que ça fait.** Deux niveaux ; une transaction pointe toujours vers une
  feuille (ADR 0002). Chaque catégorie a une feuille système « Autres ». La
  nature `income | expense | transfer` est héritée (ADR 0003). L'utilisateur
  ne crée que des sous-catégories.
- **Bug.** `deleteUserBankCategory` fait un soft-delete sans détacher les
  transactions. Elles apparaissent non catégorisées, mais l'enrichissement ne
  les reprend jamais.
- **Verdict : Garder le comportement.** Les trois ADR restent valides. Supprimer
  une catégorie déplace ses lignes vers la feuille « Autres » du parent.

### 9. Écriture de catégorie

- **Ce que ça fait.** Neuf endroits écrivent la catégorie d'une transaction :
  - `bank-transactions-mutations.ts:146`, `:300` et `:797` ;
  - `bank-transactions-enrichment.ts:196` ;
  - `user-category-rules-apply.ts:168` ;
  - `merchant-mappings.ts:538` (undo) ;
  - `internal-transfers.ts:190` (appariement épargne) ;
  - `reclaim-mapped-categories.ts:123` ;
  - la FK `ON DELETE SET NULL`.

  Le rang `manual > rule-user > automatique` est défini une fois
  (`category-source.ts`) mais appliqué au cas par cas.

- **Bugs vérifiés.**
  - `updateBankTransaction` (`:797`) écrit la catégorie sans passer la source à
    `manual` : la correction reste écrasable et « à revoir ».
  - Déplacer un mapping (`merchant-mappings.ts:146`) laisse les lignes sur
    l'ancienne catégorie, contrairement à `CONTEXT.md`.
  - L'undo réécrit un `previousSource` libre venu du client.
- **Verdict : Refaire autrement.** Un seul module de recatégorisation
  (revue, candidat 1, recommandation principale) :
  `recategorize(owner, rows, target, source)`. Il porte la résolution feuille,
  le rang, le déplacement de mapping, l'undo côté serveur et l'événement
  « catégorisé ». Aucun autre code n'écrit la colonne.

### 10. Merchant mappings et rule prompt

- **Ce que ça fait.** Le mapping marchand → catégorie est le concept
  utilisateur ; les règles et conditions sont du stockage (ADR 0001). Le rule
  prompt propose « Toujours catégoriser X en Y ? » après une correction.
- **Qualité.** Aucun test DB sur les mappings et l'application des règles.
  Bugs : voir 9.
- **Verdict : Garder le comportement.** Le schéma à deux tables (règle,
  condition) sera réévalué à l'étape 2 : si l'UI ne montre que des mappings,
  le stockage peut suivre.

### 11. Cascade de catégorisation

**Ordre réel** dans `jobs/utils/categorizer.ts` (première couche qui répond
gagne), qui diffère de l'ordre annoncé :

1. dictionnaire de marques (25 marques SaaS / dev) ;
2. mot-clé de virement ou nom du titulaire ;
3. kNN sur embeddings ;
4. MCC ;
5. identité fournie par le LLM ;
6. historique marchand ;
7. catégorie proposée par le LLM, avec garde de signe selon la nature.

Les règles utilisateur s'appliquent **en dernier** et écrasent tout. Le guard
SQL revérifie le rang à l'écriture.

- LLM : `gemini-3.1-flash-lite`, température 0, sortie structurée validée par
  Zod, lots de 50, taxonomie complète et 16 exemples few-shot dans le prompt.
  Confiance ≥ 0,8 acceptée, 0,7 à 0,8 acceptée « à vérifier », < 0,7
  abstention.
- Embeddings : `gemini-embedding-001`, 768 dimensions, pgvector HNSW cosine.

**Mesure** (eval rejouée hors ligne sur les couches déterministes, aucun appel
réseau) :

| Couche        | Lignes décidées                    | Précision feuille |
| ------------- | ---------------------------------- | ----------------- |
| Marques       | 7                                  | 7/7               |
| Virement      | 2                                  | 2/2               |
| MCC           | 5                                  | 5/5               |
| Laissé au LLM | 152 (dont 8 abstentions attendues) | 98,7 % publié     |

Les couches déterministes sont parfaites mais ne décident que **8,4 %** des
lignes. **Le LLM porte environ 91 % de la précision.**

**Étape par étape :**

| Étape                         | Valeur                         | Verdict      | Justification                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Règles utilisateur (mappings) | Haute                          | Garder       | Intention explicite ; elles passent **en premier** et le LLM n'est plus appelé pour ces lignes                                                                                                                                                                                   |
| Marques, virement, MCC        | Faible volume, précision 100 % | Garder       | Coût nul, aucun faux positif mesuré                                                                                                                                                                                                                                              |
| Historique marchand           | Stabilité                      | Garder, revu | Vote aussi sur les lignes `ai` : une erreur initiale se fige. Il doit ignorer les lignes de confiance < 0,8                                                                                                                                                                      |
| kNN + embeddings              | Non mesurée                    | **Couper**   | Jamais évalué ; asymétrie de texte (requête sur libellé brut, stockage sur nom nettoyé) ; filtrage HNSW après index qui renvoie 0 voisin aux petits comptes ; incident du 3 juillet (347 lignes chez 3 utilisateurs) ; depuis, il exige un token commun et duplique les mappings |
| LLM                           | Porte la précision             | Garder       | Choix du modèle rouvert à l'étape 3                                                                                                                                                                                                                                              |

- **Coût mal placé.** Le LLM est appelé pour 100 % des lignes, même celles
  qu'une marque ou un mapping décide. Dans keel, les couches déterministes
  passent avant et le LLM ne reçoit que le reste. La seule raison de l'appeler
  quand même serait l'identité du marchand (voir 14), traitée à l'étape 3.
- **Verdict : Refaire autrement.** Un module pur `decide` avec ports, déjà
  posé par l'ADR 0009, mais dans le bon ordre : mappings, puis dictionnaires,
  puis historique, puis LLM. L'étape 3 réévaluera les embeddings sur des
  données réelles avant toute décision définitive ; le verdict « Couper » vaut
  pour le kNN tel qu'il existe.

### 12. Eval de catégorisation

- **Ce qu'elle mesure.** `jobs/src/eval/run-eval.ts` rejoue le catégoriseur sur
  166 entrées synthétiques, dont 8 abstentions attendues et 5 avec MCC. Elle
  donne la précision feuille et catégorie, la couverture, la précision par
  source, la calibration et la matrice de confusion.
- **Réserves.**
  - Les ports sont vides (`manualNeighbors: null`, historique vide,
    `rules: []`) : kNN, historique, règles et nom du titulaire ne sont jamais
    exercés. L'ADR 0009 dit le contraire.
  - Golden set écrit à la main dans la même session que le prompt ; une
    douzaine d'entrées (REGNIER, SPOTIFY AB, FREE MOBILE, RAILWAY...) figurent
    aussi dans les exemples few-shot. Le 98,7 % est surestimé.
  - Seul signal prod : 317 lignes `ai` sur 1 370 flaggées au seuil 0,9 ; la
    tranche 0,8 est juste à environ 90 % (commit `5648b92a`).
- **Verdict : Refaire autrement.** Un jeu étiqueté tiré de la prod
  (anonymisé), sans recouvrement avec le prompt, avec des ports historique et
  règles alimentés. C'est un prérequis du benchmark de l'étape 3.

### 13. Enrichissement marchand : Google Places

- **Ce que ça fait.** Pour un marchand sans domaine fourni par le LLM : appel
  Text Search (3 résultats, masque de champs incluant `websiteUri` et
  `addressComponents`, tranche tarifaire élevée). Échecs cachés 30 jours.
- **Ce que l'UI utilise.** `city`, `country` et `websiteUrl` dans la fiche
  détail. `googlePlaceId`, `placeTypes`, lat / lng et l'adresse ne sont
  affichés nulle part.
- **Coût contre valeur.** Places n'est appelé que pour les commerces locaux,
  qui n'ont souvent pas de site, donc pas de logo, et que le matcher refuse
  sans ville. Un appel payant par nouveau marchand local pour obtenir
  « ville, pays ».
- **Verdict : Couper.**

### 14. Enrichissement marchand : logo par domaine

- **Ce que ça fait.** Domaine fourni par le LLM → logo.dev ou favicon ; table
  `merchants` globale, cache Redis 7 jours.
- **Qualité.** Le token logo.dev est stocké dans l'URL en base et envoyé au
  client : acceptable seulement pour une clé publishable.
- **Verdict : Garder le comportement.** URL du logo construite à la lecture,
  jamais stockée avec un secret.

### 15. Détection d'anomalies

- **Verdict : Couper** (décision déjà prise). Liste des fichiers à ne pas
  porter en annexe B. `packages/news/src/ingest/anomaly.ts` n'a aucun rapport.

## Flux, récurrences, budgets

### 16. Virements internes et mouvements d'épargne

- **Ce que ça fait.** Appariement glouton des deux jambes d'un virement : même
  montant au centime, même devise, fenêtre de 4 jours, comptes différents, et
  **IBAN de contrepartie appartenant au titulaire**. Le job efface puis réécrit
  tous les `transfer_pair_id` (idempotent), recatégorise en mouvement
  d'épargne, lance `reclaimMappedCategories` et recalcule les comptes manuels.
  L'utilisateur peut refuser un appariement.
- **Valeur.** Centrale : ne jamais compter deux fois, calculer le Disponible.
- **Qualité.** Code pur et testé. **Défaut de fond** : l'ADR 0007 constate que
  CIC via Enable Banking n'envoie aucun IBAN de contrepartie. L'appariement ne
  se déclenche donc presque jamais pour ce fournisseur ; l'épargne passe
  surtout par la regex de libellé. `reclaim-mapped-categories.ts` éponge la
  dette d'un ancien bug.
- **Verdict : Garder le comportement, refaire le signal.** La reconnaissance
  « compte propre » combine IBAN, libellé et nom de compte, comme pour les
  comptes manuels. L'écriture de catégorie passe par le module de
  recatégorisation (9). Couper `reclaim` et le remplacer, si besoin, par une
  étape unique de l'ETL.

### 17. Séries récurrentes

- **Ce que ça fait.** Regroupement par marchand, devise et sens, groupes de
  montants à ±30 %, 6 cadences testées. Statuts `suggested | active |
rejected | ended` ; un rejet est définitif ; une série disparue passe à
  `ended` après 180 jours. Ajout manuel par `trackTransaction`. Alimente les
  charges fixes de la revue, la projection de solde et les échéances.
- **Qualité.** Partie pure bien testée ; `recurring-series.ts` (710 lignes) sans
  test.
  - Identité = clé textuelle `nom-normalisé:DEVISE:sens`. Toute évolution de
    l'enrichissement change la clé, d'où la dérive : une série confirmée
    redevient `suggested` et une suggestion rejetée revient. Rustines :
    `baseDetectionKey`, `assignByNearestAmount`, `sweepOrphanedDetectedSeries`.
  - `nextExpectedAt` est calculé à 7 endroits, dont le client. **Le serveur
    stocke la date envoyée par le client.** Bug connu en prod : une série dont
    l'échéance précède d'un mois sa dernière occurrence (`upcoming.tsx:13`).
  - 5 normaliseurs de libellé différents (revue, candidat 7).
- **Verdict : Refaire autrement.** Un module qui possède l'identité d'une série
  (id stable rattaché aux transactions, clé de marchand issue du normaliseur
  unique) et la lecture de son statut. Échéance toujours dérivée côté serveur
  de `dernière occurrence + cadence`, jamais reçue du client (revue,
  candidats 4 et 7).

### 18. Budgets

- **Ce que ça fait.** Budget sur une catégorie ou une feuille, versionné par
  `effective_from`, agrégé par sous-arbre, avec suggestions à partir de la
  moyenne, historique budget / réel sur 6 mois, alertes à 80 % et 100 %
  dédupliquées.
- **Qualité.** Module superficiel (revue, candidat 5) :
  - résultat à moitié converti que 5 appelants complètent ;
  - règle anti double comptage écrite 4 fois, dont une côté client ;
  - les alertes lisent l'arbre complet, la revue seulement les lignes du haut :
    un sous-budget dépassé déclenche une alerte mais jamais un Verdict.
- **Bugs.**
  - « Hors budget » inclut les catégories de nature `transfer`.
  - Les remboursements ne sont pas déduits (contraire à `CONTEXT.md`). Le
    Verdict `budget_over` peut donc contredire les dépenses de la même revue.
  - Enum `budget_recurrence` (weekly, biweekly, yearly) acceptée par l'API mais
    traitée comme mensuelle.
  - `budgetPeriod` utilise l'horloge UTC du serveur au lieu du fuseau de
    l'utilisateur.
- **Verdict : Garder le comportement, refaire le périmètre.**
  `budgetOverview(owner, month, displayCurrency)` rend un arbre entièrement
  converti, avec un total juste, et porte la règle « seul `expense` se
  budgète ». Il lit le module unique de périmètre de flux (remboursements
  déduits). Alertes, revue et formulaire lisent le même arbre. Couper l'enum de
  récurrence : budgets mensuels uniquement.

### 19. Objectif d'épargne

- **Ce que ça fait.** Montant mensuel en vigueur à partir d'un mois donné.
  **Il n'existe pas d'objectif daté** : `CONTEXT.md` réserve « goal » à une
  fonctionnalité future.
- **Verdict : Garder le comportement.** Pas d'objectif daté (décision 7).

## Revue mensuelle et notifications

### 20. Revue mensuelle et narrative

- **Ce que ça fait.** `buildMonthlyReview` (pur, testé) décide les Verdicts et
  le ton du mois (ADR 0008). Un LLM rédige la narrative une fois, le 1er ; elle
  est rejetée si un chiffre n'appartient pas aux faits. Graphique SVG → PNG via
  `sharp`, servi par jeton public. Email du 1er, fiche dans l'app, note de
  l'utilisateur.
- **Usage.** 4 utilisateurs candidats en prod.
- **Qualité.** Bonne séparation entre décider et formuler, nombreux tests. Le
  curseur d'envoi réutilise `lastDigestAt` et `digestHour`. Elle hérite des
  incohérences de périmètre des budgets.
- **Verdict : Garder le comportement.** C'est le cœur de valeur du produit. Le
  curseur a son propre champ ; les faits viennent du périmètre de flux unique.
  Le graphique de l'email est réévalué : un PNG rendu par `sharp` impose une
  police système dans l'image du worker.

### 21. Digest de transactions

- **Ce que ça fait.** Email quotidien ou hebdomadaire des transactions,
  décision pure dans `digest-content.ts`. Périmètre de flux propre : aucun
  filtre de nature.
- **Usage.** 2 envois tentés sur 24 h, 0 envoyé (fenêtre vide). Incident du
  10 juillet (emails envoyés à 23 h).
- **Verdict : Couper** (décision 3). La revue mensuelle et
  les notifications in-app couvrent le besoin ; s'il revient, il lit le
  périmètre de flux unique.

### 22. Seuils de solde

- **Ce que ça fait.** Seuil bas et haut sur un périmètre (courant, avoirs
  bancaires, total), hystérésis de 2 %, claim atomique avec rollback si rien
  n'a été délivré.
- **Usage.** Aucun seuil configuré en prod.
- **Qualité.** Bonne (15 tests), mais déclenché uniquement par la tâche de
  snapshot portfolio.
- **Verdict : Garder le comportement**, déclenché en fin de sync. Coût faible,
  logique déjà propre ; l'absence d'usage vient probablement de l'absence de
  mise en avant (réglage enfoui).

### 23. Notifications

- **Ce que ça fait.** 8 types, dont 6 dans le périmètre (`transaction_sync`,
  `balance_alert`, `bank_connection`, `budget_alert`, `monthly_review`,
  `system`). `anomaly_alert` est coupé et `alert` concerne le portefeuille.
  Canaux in-app et email (Resend), pas de push. Temps réel : Redis pub/sub
  vers SSE, pour invalider des requêtes.
- **Verdict : Garder le socle.** Les producteurs passent par le registry de
  jobs de keel.

### 24. Analyse : cashflow, Sankey, concentration

- **Ce que ça fait.** Cashflow et Sankey (SVG fait main + framer-motion),
  décomposition exacte `revenus = dépenses + épargne + virements sortants +
Disponible`, historique sur 6 mois, concentration marchands (Pareto),
  entrées de projection de solde.
- **Qualité.** Décomposition testée. La concentration exclut toute paire au
  lieu d'utiliser `cashflow-scope.ts`.
- **Verdict : Garder le comportement.** Tous les calculs lisent le périmètre
  de flux unique. L'écart volontaire entre « dépensé » côté budget et côté
  cashflow est conservé, mais nommé explicitement dans le glossaire.

## Application

### 25. Home à widgets

- **Ce que ça fait.** Registry de widgets, dnd-kit, layout par utilisateur,
  défaut adaptatif (ADR 0006). 10 widgets banque : trésorerie, disponible,
  dépenses, épargne, top catégories, projection, budget, échéances,
  transactions, à revoir. 4 widgets investissement coupés.
- **Graphe épinglé.** Il lit les snapshots mixtes et propose des vues holdings,
  prix live et sélecteur de période du portefeuille. En banque seule, il ne
  montre plus que la trésorerie, ce qui fait doublon avec le widget du même
  nom.
- **Verdict : Refaire autrement** (décision 6). Même logique de widgets
  (registry, layout utilisateur, défaut adaptatif), home entièrement refaite
  sur les composants mint-pocs. Le graphe épinglé devient une courbe de
  trésorerie alimentée par l'historique de soldes reconstruit (décision 5). Le
  contrat du ticker de Verdicts sous la salutation est gardé.

### 26. Page Transactions et CRUD

- **Ce que ça fait.** Table maison, liste mobile, facettes dans l'URL (nuqs),
  pagination par curseur, fiche détail avec navigation clavier, soft-delete
  avec undo, journal d'audit par mutation, exclusion du budget ou de
  l'analyse.
- **Défauts.**
  - `bankAccountId` en création et en édition n'est jamais vérifié comme
    appartenant à l'utilisateur (`bank-transactions-mutations.ts:253`, `:730`).
  - Le formulaire laisse éditer date, montant et devise d'une transaction
    synchronisée ; un `promote` les réécrira ensuite.
  - Recherche plein texte en `english` sur des libellés français.
  - Pas de catégorisation en masse.
- **Verdict : Garder le comportement**, avec contrôle de propriété à chaque
  écriture, colonnes « banque » verrouillées sur les lignes synchronisées,
  recherche en `simple` + `unaccent`, et catégorisation en masse par le
  module de recatégorisation.

### 27. Import CSV

- **Ce que ça fait.** Upload R2 par URL présignée, mapping des colonnes
  prérempli par LLM (Gemini), parsing robuste (`@ramnn/import` : UTF-8 puis
  Windows-1252, détection jour / mois, montants FR).
- **Bugs vérifiés.**
  - Contournement de Settlement : `onConflictDoNothing` sur une clé propre au
    CSV. Importer sur un compte synchronisé duplique chaque ligne, et rien ne
    l'empêche (entrée de menu visible sur tous les comptes).
  - `import-csv.ts:127` : clé d'occurrence sur le texte brut, empreinte sur les
    valeurs parsées. « 1,00 » et « 1.00 » entrent en collision et la seconde
    ligne est ignorée sans bruit.
  - Chaque import crée une ligne dans le coffre et déclenche un snapshot
    portfolio.
  - Le mapping ne gère pas les formats à deux colonnes Débit / Crédit,
    fréquents dans les banques françaises.
- **Verdict : Refaire autrement.** Le parsing est gardé ; les lignes passent
  par Settlement avec la même forme que le sync ; l'occurrence est calculée sur
  les valeurs parsées ; ni coffre ni snapshot. Détection heuristique des
  en-têtes d'abord, LLM en repli (étape 3).

### 28. Export CSV de sélection

- **Ce que ça fait.** Job qui produit un zip CSV + XLSX sur R2, enregistré dans
  le coffre et partageable par lien court. Montants formatés en devise locale
  (« +12,50 € »), inexploitables dans un tableur. Pas d'export du filtre
  courant, ni de sous-catégorie ni de nature.
- **Verdict : Refaire autrement.** Export synchrone et streamé du filtre
  courant, en CSV avec montants numériques bruts, feuille et nature. Garder la
  protection contre l'injection de formules. Ni coffre ni lien court.

### 29. Export RGPD

- **Verdict : Garder le comportement** (archive complète, lien valable 12 h,
  purge). Retirer portfolio et coffre ; ajouter compte et catégorie aux
  transactions, absents aujourd'hui.

### 30. Onboarding, réglages, suppression de compte

- **Verdict : Garder le comportement.** L'onboarding pose l'objectif
  d'épargne puis mène à la connexion bancaire. La suppression de compte
  (step-up + lien email, révocation Enable Banking, purge R2, Resend, Redis,
  cascade) est solide. Réglages Assistant (MCP) coupés pour l'instant, sans
  fermer la porte (décision 2).

### 31. Feedback et journal d'activité

- **Verdict.** Journal d'activité : **Garder le comportement**, en remplaçant
  shiki par un diff simple. Feedback vers Slack : gardé (décision 8).

## Dépendances

### À ne pas reprendre : mortes (0 import vérifié par grep)

`tus-js-client`, `little-date`, `camelcase-keys`, `snakecase-keys`,
`@cloudflare/workers-types` (avec l'alias fantôme `@engine/*`), `@date-fns/utc`,
`@hono/zod-validator`, `@better-auth/cimd`, `@dnd-kit/utilities`, `uuid`,
`heic-convert`, `prettier` (seulement listés en `external` dans la config
Trigger). `tailwindcss-animate` est sans objet sous Tailwind v4.

### À ne pas reprendre : hors périmètre

- Coffre : `pdfjs-dist`, `@napi-rs/canvas`, `embla-carousel`.
- Marchés et news : `yahoo-finance2`, `@ramnn/pricing`, `@ramnn/news`,
  `@ramnn/market-data` (sauf `rates.ts`).
- MCP (plus tard) : `@modelcontextprotocol/server`, `@better-auth/mcp`,
  `@better-auth/oauth-provider`.
- Jobs : `@trigger.dev/*` (remplacé par BullMQ, décision 4).
- Anomalies, kNN : l'extension pgvector (sous réserve de l'étape 3), Google
  Places.
- Doublons d'icônes : `@radix-ui/react-icons`, `react-icons` (lucide seul).
- `shiki`, `@shikijs/langs`, `@ai-sdk/rsc`.

### Comportements utiles qui demandent une dépendance (catalog keel)

| Besoin                           | ramnn                                                 | Remarque pour keel                               |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Client HTTP + JWT Enable Banking | `xior`, `jose`                                        | `fetch` natif suffit probablement ; `jose` gardé |
| Parsing CSV                      | `papaparse`, `chrono-node`, `change-case`             | à réévaluer à l'étape 4 de la roadmap            |
| Dates et fuseaux                 | `date-fns`, `@date-fns/tz`                            | fuseau utilisateur partout                       |
| Export et RGPD                   | `@fast-csv/format`, `@zip.js/zip.js`                  | XLSX optionnel                                   |
| Stockage objet                   | `@aws-sdk/*` (R2)                                     | pour l'import CSV et le RGPD                     |
| Email                            | `react-email`, `resend`                               |                                                  |
| LLM                              | `ai`, `@ai-sdk/google`                                | fournisseur choisi à l'étape 3                   |
| Graphique de l'email             | `sharp`                                               | à réévaluer (voir 20)                            |
| UI                               | `nuqs`, dnd-kit, `motion`, `react-day-picker`, `cmdk` | à l'étape 4, depuis mint-pocs d'abord            |

`packages/cache` de ramnn importe `nanoid` sans le déclarer : à ne pas
reproduire.

## Ce que la revue d'architecture devient dans keel

| Candidat                      | Force           | Dans keel                                                                                                                                                                                                                             |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Écriture de catégorie      | Strong          | Module de recatégorisation (9)                                                                                                                                                                                                        |
| 2. Suite d'une écriture       | Strong          | Module post-écriture : `transactionsChanged(owner, ids, cause)` décide les étapes et les planifie derrière un port de dispatch (BullMQ en prod, enregistreur en test). Couvre la saisie manuelle, l'édition, la suppression et l'undo |
| 3. Settlement seule porte     | Strong          | Sync et CSV, même forme de ligne (3, 27)                                                                                                                                                                                              |
| 4. Identité de série          | Worth exploring | Adopté (17)                                                                                                                                                                                                                           |
| 5. Vue budget entière         | Worth exploring | Adopté (18)                                                                                                                                                                                                                           |
| 6. Provider bancaire profond  | Worth exploring | Adopté, avec interface de provider (1)                                                                                                                                                                                                |
| 7. Normaliseur de libellés    | Speculative     | Absorbé par 17 : un module `labelTokens` / `merchantKey`                                                                                                                                                                              |
| Non listé : périmètre de flux | Nouveau         | Un module unique pour cashflow, budgets, revue et concentration (18, 24)                                                                                                                                                              |

Les 8 défauts relevés par la revue sont tous confirmés par cet audit. Ils
deviennent des tests de non-régression dans keel.

## Décisions validées (2026-09-28)

1. **kNN et embeddings** : le kNN actuel est coupé. L'étape 3 décide si des
   embeddings reviennent sous une autre forme, mesurés sur des données
   réelles.
2. **Google Places** : coupé. Le logo par domaine est gardé.
3. **Digest de transactions** : coupé.
4. **Import CSV** : autorisé sur tous les comptes, synchronisés compris, et il
   passe par Settlement. Il sert à reprendre un historique plus ancien que les
   730 jours de PSD2.
5. **Historique de soldes** : on le reconstruit en entier, au lieu de ne
   l'écrire qu'à partir du jour où le compte est connecté comme le fait ramnn.
   Le solde d'un jour passé se déduit du solde connu et des transactions qui
   ont suivi. L'historique est recalculé à chaque arrivée de lignes anciennes
   (sync initial, import CSV). Conception à l'étape 2.
6. **Home** : entièrement refaite, avec la même logique de widgets (registry,
   layout utilisateur, défaut adaptatif), sur les composants portés de
   mint-pocs. Le choix Tailwind ou non est tranché à l'étape 4. L'ADR 0006
   n'est pas reprise telle quelle.
7. **Objectifs d'épargne** : pas d'objectif daté. On garde le Savings target
   mensuel, rien de plus.
8. **Feedback vers Slack** : gardé.
9. **Eval** : autorisation de construire un jeu étiqueté à partir de
   transactions de prod anonymisées (étape 3).
10. **Mesure d'usage** : autorisée en lecture seule sur la prod. Voir
    l'annexe A pour l'état.
11. **IA** : Vercel AI SDK, pour pouvoir changer de fournisseur par simple
    configuration. Le choix du modèle se fait à l'étape 3.
12. **Jobs** : BullMQ, Trigger.dev n'est pas repris.

## Annexe A · Requêtes d'usage (lecture seule, agrégats)

Noms de tables et colonnes de ramnn au 2026-09-24 ; à ajuster si besoin.

État : exécutées le 2026-09-28 depuis l'intérieur de Railway (`railway ssh`,
transaction en lecture seule), le proxy public de la base ne répondant pas.
Résultats :

| Mesure                                         | Valeur                                                     | Ce que ça confirme                                                      |
| ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Utilisateurs / avec une banque                 | 10 / 3                                                     | Peu d'utilisateurs, ETL simple                                          |
| Transactions par utilisateur actif et par mois | médiane 69, 90e centile 129                                | Coûts IA très bas (étude IA)                                            |
| Jambes de virement interne appariées           | **0 sur 3 244**                                            | L'appariement par IBAN ne se déclenche jamais (section 16, ADR 0009)    |
| Séries récurrentes détectées puis rejetées     | **31 sur 67 (46 %)** ; 15 séries actives jamais confirmées | Le détecteur se trompe presque une fois sur deux (section 17, ADR 0017) |
| Budgets / utilisateurs avec budgets            | 16 / 4                                                     | Fonction utilisée, gardée                                               |
| Revues mensuelles envoyées / notées            | 3 / 0                                                      | Gardée, mais la note n'est pas utilisée                                 |
| Seuils de solde                                | 2                                                          | Faible usage, gardé (coût faible)                                       |
| Homes personnalisées                           | 2 sur 10                                                   | La home refaite garde le défaut adaptatif                               |
| Sources de catégorie                           | LLM 51 %, mappings 36 %                                    | Les mappings sont le levier principal                                   |

```sql
-- Revue mensuelle : envois, notes, narratives gardées
SELECT count(*) AS reviews,
       count(*) FILTER (WHERE narrative IS NOT NULL) AS with_narrative,
       count(*) FILTER (WHERE rating IS NOT NULL)    AS rated
FROM monthly_reviews;

-- Digest et seuils : qui a quoi
SELECT count(*) FILTER (WHERE last_digest_at IS NOT NULL) AS digest_users
FROM notification_settings;
SELECT count(*) AS thresholds FROM balance_thresholds;

-- Home : combien ont personnalisé leur layout
SELECT count(*) FILTER (WHERE dashboard_layout IS NOT NULL) AS customized,
       count(*) AS users
FROM users;

-- Catégorisation : répartition des sources
SELECT category_source, count(*)
FROM bank_transactions
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;

-- Comptes manuels, import CSV, séries récurrentes par statut
SELECT manual, count(*) FROM bank_accounts WHERE deleted_at IS NULL GROUP BY 1;
SELECT status, count(*) FROM recurring_series GROUP BY 1;
SELECT count(*) FROM budgets;
SELECT count(*) FROM savings_targets;
```

## Annexe B · Hors périmètre, à ne pas porter

- **Routeurs** : holdings, trades, instruments, assetClasses, markets,
  economics, news, pricing, alerts (prix), documents, shortLinks,
  mcpConnections, anomaly. `netWorth` est à redécouper.
- **Jobs** : exports holdings et trades, `market-data/*`, `news/*`,
  `portfolio/snapshots/*` (en extraire le déclenchement des seuils),
  `score-anomalies`, `embed-transactions` (kNN), `enrich-merchants` (partie
  Places).
- **Packages** : news, pricing, market-data (sauf `rates.ts`).
- **Tables** : holdings, trades, net*worth_snapshots, instruments,
  asset_classes, alerts, news*_, documents, short*links, oauth*_,
  transaction_anomaly_scores, bank_transaction_embeddings.
- **Routes app** : `/holdings/*`, `/macro`, `/vault`, `/s/[shortId]`,
  `/oauth/consent`, `api/s`, `api/calendar/earnings`, `api/preview`,
  `settings/assistant`.
- **Anomalies (détail)** : `anomaly-scoring.ts`, `queries/anomaly-detection.ts`,
  événements `anomaly_*`, topic temps réel `anomalyScores`, type
  `ANOMALY_ALERT`, email `anomaly-alert.tsx`, `anomaly-indicator.tsx` et ses
  usages, mention dans la page de confidentialité.
