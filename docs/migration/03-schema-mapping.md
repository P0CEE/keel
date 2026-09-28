# 03 · Correspondance ancien schéma → nouveau schéma (ETL)

- Date : 2026-09-28
- Source : ramnn `532d9974`, `packages/db/src/schema/{banking,core,platform,portfolio,foundation}.ts`
- Cible : schéma keel décrit dans `02-domain.md`, section 5
- Statut : document vivant. Toute évolution du schéma keel le met à jour dans
  le même commit.

L'ETL lui-même est reporté (décision 3 de la mission). Ce document garantit
qu'il reste faisable : chaque colonne de ramnn a une destination, une
transformation ou une raison d'être abandonnée.

## Principes

1. **Un utilisateur ramnn devient un foyer d'un membre.** `households.id` est
   généré ; `household_members` contient (`household_id`, `user_id`,
   `owner`). Toute colonne `owner_id` de ramnn se traduit par `household_id`,
   via la table de correspondance utilisateur → foyer.
2. **Les identifiants uuid de ramnn sont conservés** pour les lignes qui
   survivent (comptes, transactions, séries, budgets). Ce sont déjà des UUID
   v7, et les garder simplifie la vérification et le re-jeu de l'ETL.
3. **Montants** : `numeric(20,2)` en chaîne → `bigint` en unités mineures,
   par parsing exact de la chaîne (jamais via un float), selon l'exposant de
   la devise. `"-12.50"` en EUR donne `-1250` ; en JPY, `"1200.00"` donne
   `1200`. Une valeur non entière pour une devise d'exposant 0 fait échouer
   la ligne dans le rapport d'ETL, sans arrondi silencieux.
4. **Lignes supprimées** (`deleted_at` non nul) : les transactions deviennent
   des tombstones (conservées) ; pour les autres tables, la ligne n'est pas
   reprise, sauf mention contraire.
5. **Après chargement**, on lance `bank.reconcile` sur chaque foyer. Il
   recalcule ce qui est dérivé plutôt que migré : flux, compte de
   contrepartie, séries et échéances, historique de solde, soldes des comptes
   manuels.
6. **Rapport d'ETL** : nombre de lignes lues, écrites, ignorées (avec raison)
   par table ; sommes des montants par (foyer, compte, devise) avant et après,
   qui doivent être égales au centime.

## Utilisateurs et préférences

### `users` → `households` + `member_settings`

| ramnn                                                                      | keel                                                   | Transformation                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `id`                                                                       | `household_members.user_id`, `member_settings.user_id` | Identique (même `user.id` Better Auth, voir « Authentification »)                     |
| `email`, `full_name`, `avatar_url`, `email_verified`, `two_factor_enabled` | table `user` de Better Auth                            | Hors de ce document : migration de l'authentification                                 |
| `locale`                                                                   | `member_settings.locale`                               | Identique                                                                             |
| `base_currency`                                                            | `households.base_currency`                             | Nul → `EUR`                                                                           |
| `timezone`                                                                 | `households.timezone`                                  | Nul → `Europe/Paris`                                                                  |
| `timezone_auto_sync`, `time_format`, `date_format`                         | —                                                      | Abandonnés : formats dérivés de la locale                                             |
| `country_code`                                                             | —                                                      | Abandonné (le pays sert au choix de la banque, redemandé)                             |
| `onboarded_at`                                                             | `member_settings.onboarded_at`                         | Identique                                                                             |
| `dashboard_layout`                                                         | `member_settings.home_layout`                          | **Non repris** : la home est refaite (décision 6). Tous repartent du défaut adaptatif |
| `created_at`, `updated_at`                                                 | `households.created_at`                                | `created_at`                                                                          |

### Authentification

Tables `session`, `account`, `verification`, `two_factor`, `jwks` : ramnn et
keel utilisent tous deux Better Auth. Les noms de tables diffèrent (`users`
côté ramnn, `user` côté keel) et keel active email/mot de passe alors que
ramnn était en social uniquement. La migration des comptes d'authentification
fait l'objet d'une étape dédiée de la roadmap. Les sessions ne sont pas
reprises : tout le monde se reconnecte une fois.

Tables `oauth_*` (MCP) : non reprises (MCP reporté).

## Connexions et comptes

### `institutions` → `institutions`

| ramnn                                           | keel                                   | Transformation                                                                   |
| ----------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `id` (md5 12 caractères + suffixe `-personal`)  | `id` (uuid)                            | Nouvel id ; table de correspondance ancien → nouveau, gardée pour les connexions |
| `name`, `logo`                                  | `name`, `logo_url`                     | Identique                                                                        |
| `provider`                                      | `provider`                             | `enablebanking` → `enable_banking`                                               |
| `countries[]` (toujours un seul pays)           | `country`                              | Premier élément                                                                  |
| —                                               | `provider_ref`                         | `<COUNTRY>:<name>` (Enable Banking nomme une banque par nom et pays)             |
| `available_history`, `maximum_consent_validity` | `max_history_days`, `max_consent_days` | Identique                                                                        |
| `popularity`                                    | `popularity`                           | Identique                                                                        |
| `status`                                        | `active`                               | `active` → vrai                                                                  |
| `type`                                          | `psu_types`                            | `[type]`                                                                         |

Plus simple encore : relancer `bank.institutions-refresh`, puis rattacher par
(`country`, `name`) ; le `type` de ramnn devient le `psu_type` de la
connexion.

### `bank_connections` → `bank_connections`

| ramnn                            | keel                           | Transformation                                                                                                                      |
| -------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | `id`                           | Identique                                                                                                                           |
| `owner_id`                       | `household_id`, `consented_by` | Foyer de l'utilisateur ; `consented_by` = l'utilisateur                                                                             |
| `institution_id`                 | `institution_id`               | Via la correspondance des institutions                                                                                              |
| `provider`                       | `provider`                     | `enable_banking`                                                                                                                    |
| `reference_id`                   | `provider_session_ref`         | Identique. Les sessions Enable Banking restent valides : la même application (`ENABLEBANKING_APPLICATION_ID`) les lit               |
| `expires_at`                     | `consent_expires_at`           | Nul → `now()` et statut `reconnect_required`                                                                                        |
| `status`                         | `status`                       | `connected` → `active` ; `disconnected` et `error` → `reconnect_required`                                                           |
| `last_accessed`                  | `last_synced_at`               | Identique                                                                                                                           |
| `error_details`, `error_retries` | —                              | Abandonnés (morts dans ramnn)                                                                                                       |
| `name`, `logo_url`               | —                              | Lus depuis l'institution                                                                                                            |
| `deleted_at`                     | `removed_at`                   | Connexion supprimée : non reprise, sauf si supprimée depuis moins de 30 jours (reprise en `removed`, pour garder le délai de grâce) |
| —                                | `next_sync_at`                 | `now()` : première sync dès la bascule                                                                                              |

### `bank_accounts` → `bank_accounts`

| ramnn                                       | keel                                    | Transformation                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                        | `id`                                    | Identique                                                                                                                                                                                                                                        |
| `owner_id`                                  | `household_id`, `owner_id`              | Foyer ; propriétaire = l'utilisateur ; `is_private` = faux                                                                                                                                                                                       |
| `bank_connection_id`                        | `connection_id`                         | Identique ; nul si `manual`                                                                                                                                                                                                                      |
| `account_id` (uid EB)                       | `provider_account_ref`                  | Identique. Pour un compte manuel, ramnn stockait une valeur factice : non reprise                                                                                                                                                                |
| `account_reference` (`identification_hash`) | `stable_ref`                            | Identique. S'il est nul sur un compte synchronisé, rattachement par IBAN à la première sync, sinon compte à relier par le membre                                                                                                                 |
| `name`                                      | `provider_name`                         | Identique                                                                                                                                                                                                                                        |
| —                                           | `custom_name`                           | Nul. ramnn écrasait `name` avec le renommage du membre ; impossible à distinguer, donc `custom_name` = `name` si le compte est manuel                                                                                                            |
| `currency`                                  | `currency`                              | Nul ou `XXX` → devise de la première transaction du compte ; sans transaction, compte signalé dans le rapport                                                                                                                                    |
| `type`                                      | `kind`, `kind_set_by`                   | `checking` → `current` ; `savings` → `savings` ; `credit` → `card` ; `loan` → `loan` ; `other_asset` et `other_liability` → `other` ; nul → `current`. `kind_set_by` = `member` (on ne sait pas qui l'a posé, et le choix du membre doit gagner) |
| `balance`                                   | `balance_minor`                         | Unités mineures. **Signe** : pour `card` et `loan`, `-abs(balance)`, car ramnn stockait la dette en positif à la connexion et en brut au sync. Pour les autres, identique                                                                        |
| `declared_balance`, `declared_at`           | `declared_balance_minor`, `declared_on` | Unités mineures ; identique                                                                                                                                                                                                                      |
| `enabled`                                   | `hidden`                                | `hidden = NOT enabled`                                                                                                                                                                                                                           |
| `iban`                                      | `iban`                                  | Identique                                                                                                                                                                                                                                        |
| `error_details`, `error_retries`            | —                                       | Abandonnés                                                                                                                                                                                                                                       |
| `manual`                                    | —                                       | Déduit de `connection_id IS NULL`                                                                                                                                                                                                                |
| `deleted_at`                                | `archived_at`                           | Si le compte a des transactions non supprimées : archivé ; sinon non repris                                                                                                                                                                      |
| `created_at`, `updated_at`                  | idem                                    | Identique                                                                                                                                                                                                                                        |
| —                                           | `history_dirty_from`                    | Date de la plus ancienne transaction : l'historique sera reconstruit                                                                                                                                                                             |

## Transactions

### `bank_transactions` → `transactions`

| ramnn                                             | keel                                             | Transformation                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                              | `id`                                             | Identique                                                                                                                                                                                                                                                                                                                               |
| `owner_id`                                        | `household_id`                                   | Foyer                                                                                                                                                                                                                                                                                                                                   |
| `bank_account_id`                                 | `account_id`                                     | Identique. **Nul dans ramnn** : ligne rattachée au seul compte du foyer s'il n'y en a qu'un, sinon ignorée et signalée                                                                                                                                                                                                                  |
| —                                                 | `private_to`                                     | Nul                                                                                                                                                                                                                                                                                                                                     |
| `manual` + forme de `internal_id`                 | `origin`                                         | `internal_id` contenant `_csv_` → `csv` ; `manual` vrai sans `_csv_` → `manual` ; sinon `provider`                                                                                                                                                                                                                                      |
| `internal_id` (`<owner>_<providerId>`)            | `provider_ref` ou `fingerprint`                  | Retirer le préfixe `<owner>_`. Si le reste est un md5 (32 hexadécimaux), c'est un hash de repli et non un `entry_reference` : `provider_ref` nul. Sinon, `provider_ref` = le reste. ramnn ne distinguait pas `entry_reference` de `transaction_id` ; la passe composite de Settlement rattrape les cas où l'identité ne correspond plus |
| —                                                 | `fingerprint`, `occurrence`                      | Recalculés avec l'algorithme keel, avec `booked_on` = `transaction_date` (voir ci-dessous) ; `occurrence` = rang dans (compte, empreinte) par `created_at`                                                                                                                                                                              |
| `transaction_date` (date d'achat)                 | `purchased_on`                                   | Identique                                                                                                                                                                                                                                                                                                                               |
| —                                                 | `booked_on`                                      | **Inconnu dans ramnn** : `transaction_date` par défaut. La première sync complète (fenêtre de 730 jours) corrige par `promote` la date de comptabilisation de toutes les lignes encore couvertes                                                                                                                                        |
| `amount`                                          | `amount_minor`                                   | Unités mineures, signe conservé (débit négatif)                                                                                                                                                                                                                                                                                         |
| `currency`                                        | `currency`                                       | Majuscules                                                                                                                                                                                                                                                                                                                              |
| `name`                                            | `label`                                          | Identique                                                                                                                                                                                                                                                                                                                               |
| `description`                                     | `note`                                           | Identique (texte libre de l'utilisateur)                                                                                                                                                                                                                                                                                                |
| `display_name`                                    | `display_name`                                   | Identique                                                                                                                                                                                                                                                                                                                               |
| `method`                                          | `method`                                         | `card_purchase` → `card` ; `card_atm` → `cash_withdrawal` ; `transfer` et `ach` → `transfer` ; `fee` → `fee` ; `interest` → `interest` ; `deposit`, `other` et `unknown` → `other`                                                                                                                                                      |
| `status`                                          | —                                                | Abandonnée (toujours `posted`, ADR 0010 de ramnn)                                                                                                                                                                                                                                                                                       |
| `balance`                                         | —                                                | Abandonnée : solde après opération rarement fourni, l'historique est reconstruit                                                                                                                                                                                                                                                        |
| `base_amount`, `base_currency`, `conversion_rate` | —                                                | Abandonnées : conversion à la lecture (ADR 0003)                                                                                                                                                                                                                                                                                        |
| `counterparty_name`, `counterparty_iban`          | idem                                             | Identique                                                                                                                                                                                                                                                                                                                               |
| `merchant_category_code`                          | `mcc`                                            | Identique                                                                                                                                                                                                                                                                                                                               |
| `creditor_city`                                   | —                                                | Abandonnée (seule la fiche Places l'utilisait)                                                                                                                                                                                                                                                                                          |
| `website_domain`                                  | —                                                | Portée par `merchants.domain`                                                                                                                                                                                                                                                                                                           |
| `merchant_name`                                   | `merchant_key`                                   | `merchantKey()` du module `labels`, appliqué au libellé. `merchant_name` sert de nom au marchand global                                                                                                                                                                                                                                 |
| `merchant_id`                                     | `merchant_id`                                    | Via la correspondance des marchands                                                                                                                                                                                                                                                                                                     |
| `user_bank_category_id`                           | `category_id`                                    | Via la correspondance des catégories (section suivante)                                                                                                                                                                                                                                                                                 |
| `category_source`                                 | `category_source`, `categorized_at`              | `manual` → `user` ; `rule-user` → `mapping` ; `brand`, `rule` et `mcc` → `dictionary` ; `history` → `history` ; `ai` et `knn` → `model` ; `unknown` ou nul avec catégorie → `model` ; sans catégorie → nul. `categorized_at` = `updated_at` si `enrichment_completed`, sinon nul (la ligne sera catégorisée à nouveau)                  |
| —                                                 | `category_mapping_id`                            | Pour `rule-user` : le mapping dont le motif correspond à la ligne ; nul si aucun ne correspond                                                                                                                                                                                                                                          |
| `category_confidence`                             | `category_confidence`                            | Identique pour `model`, nul ailleurs                                                                                                                                                                                                                                                                                                    |
| `category_model_version`, `category_reasoning`    | —                                                | Abandonnées                                                                                                                                                                                                                                                                                                                             |
| `enrichment_completed`                            | —                                                | Voir `categorized_at`                                                                                                                                                                                                                                                                                                                   |
| `recurring_series_id`                             | `recurring_series_id`                            | Identique si la série est reprise                                                                                                                                                                                                                                                                                                       |
| `transfer_pair_id`                                | `transfer_peer_id`                               | Pour chaque paire, chaque jambe pointe vers l'autre. `counterpart_account_id` est recalculé par la réconciliation                                                                                                                                                                                                                       |
| `internal_transfer_dismissed`                     | `transfer_dismissed`                             | Identique                                                                                                                                                                                                                                                                                                                               |
| `exclude_from_budget`, `exclude_from_analytics`   | `excluded_from_budget`, `excluded_from_analysis` | Identique                                                                                                                                                                                                                                                                                                                               |
| `fts_vector`                                      | —                                                | Remplacée par `search_text` (générée)                                                                                                                                                                                                                                                                                                   |
| `deleted_at`                                      | `deleted_at`                                     | Identique : les supprimées deviennent des tombstones                                                                                                                                                                                                                                                                                    |
| `created_at`, `updated_at`                        | idem                                             | Identique                                                                                                                                                                                                                                                                                                                               |
| —                                                 | `flow`                                           | Recalculé par la réconciliation                                                                                                                                                                                                                                                                                                         |
| —                                                 | `raw`                                            | Nul (ramnn ne gardait pas la réponse brute)                                                                                                                                                                                                                                                                                             |

### `bank_transaction_embeddings` et `transaction_anomaly_scores`

Non repris (kNN et anomalies coupés).

## Catégorisation

### `user_bank_categories` → `categories`

ramnn copie la taxonomie système chez chaque utilisateur. keel a une
taxonomie système globale.

| Cas ramnn                                                                  | Destination keel                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_system = true`                                                         | Pas de ligne créée. Correspondance par `slug` vers la ligne système keel de même `key`. La table `slug ramnn → key keel` est écrite avec la taxonomie keel et versionnée avec l'ETL |
| `is_system = false`, `parent_id` non nul (sous-catégorie de l'utilisateur) | Nouvelle ligne du foyer sous la catégorie système correspondant au parent. `name`, `color`, `icon` et `nature` conservés                                                            |
| `is_system = false`, `parent_id` nul                                       | Impossible dans ramnn (l'utilisateur ne crée que des sous-catégories) : signalé si rencontré                                                                                        |
| `deleted_at` non nul                                                       | Non repris. Les transactions qui y pointaient encore (bug de ramnn) passent sur la feuille « Autres » du parent                                                                     |
| `description`                                                              | Abandonnée                                                                                                                                                                          |

Personnalisations d'une catégorie système (nom, couleur) : non reprises. Un
foyer ne renomme jamais une catégorie système (décision 4 de `02-domain.md`).

### `user_category_rules` + `user_category_rule_conditions` → `merchant_mappings`

Une ligne `merchant_mappings` par condition vivante :

| ramnn                        | keel           | Transformation                                                                                                     |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `condition.id`               | `id`           | Identique                                                                                                          |
| `condition.owner_id`         | `household_id` | Foyer                                                                                                              |
| `condition.match_type`       | `matcher`      | Identique (`merchant`, `keyword`)                                                                                  |
| `condition.pattern`          | `pattern`      | Recalculé : pour `merchant`, `merchantKey()` du motif (normaliseur keel) ; pour `keyword`, minuscules sans accents |
| `rule.user_bank_category_id` | `category_id`  | Via la correspondance des catégories                                                                               |
| `rule.priority`              | —              | Abandonnée (le motif le plus long gagne)                                                                           |
| `created_at`, `updated_at`   | idem           | Ceux de la condition                                                                                               |
| —                            | `created_by`   | L'utilisateur                                                                                                      |

Deux conditions qui deviennent identiques après la nouvelle normalisation :
la plus récente est gardée, et le conflit est signalé dans le rapport.

### `merchants` → `merchants`

| ramnn                                                                                                                  | keel     | Transformation                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                   | `id`     | Identique                                                                                                 |
| `normalized_name`                                                                                                      | `key`    | Recalculé avec `merchantKey()`. En cas de fusion, le premier id est gardé et la correspondance est tracée |
| `name`                                                                                                                 | `name`   | Identique                                                                                                 |
| `website_url`                                                                                                          | `domain` | Hôte de l'URL, sans `www.`                                                                                |
| `logo_url`                                                                                                             | —        | Déduit du domaine à la lecture (le token logo.dev ne sort plus de l'API)                                  |
| `google_place_id`, `place_types`, `formatted_address`, `city`, `country`, `latitude`, `longitude`, `enrichment_source` | —        | Abandonnées (Google Places coupé)                                                                         |

## Séries, budgets, objectifs

### `recurring_series` → `recurring_series`

| ramnn                                  | keel                                                                         | Transformation                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                   | `id`                                                                         | Identique                                                                                                                                                                                                                               |
| `owner_id`                             | `household_id`                                                               | Foyer ; `private_to` nul                                                                                                                                                                                                                |
| `detection_key`                        | signatures `mandate_ref`, `counterparty_iban`, `merchant_id`, `merchant_key` | Recalculées depuis les transactions membres. Deux séries ramnn qui partagent une signature après recalcul (la dérive connue) sont fusionnées : la revue la plus engagée gagne (`confirmed` > `suggested`), et un rejet reste un rejet   |
| `name`                                 | `name`                                                                       | Identique                                                                                                                                                                                                                               |
| `source`                               | `origin`                                                                     | `detected` → `detected` ; `manual` → `member`                                                                                                                                                                                           |
| `direction`                            | `direction`                                                                  | `expense` → `outflow` ; `income` → `inflow`                                                                                                                                                                                             |
| `status`, `confirmed_at`, `source`     | `review`, `state`                                                            | `rejected` → `review = dismissed`. `confirmed_at` renseigné ou `source = manual` → `confirmed`. `active` sans confirmation (activée automatiquement par ramnn) → `suggested`. `state` recalculé par le module (`live`, `late`, `ended`) |
| `frequency`                            | `cadence`, `anchor`, `shifts_to_business_day`                                | Cadence identique ; ancre et décalage appris depuis les membres                                                                                                                                                                         |
| `amount`                               | `typical_amount_minor`, `amount_kind`, fourchette                            | Unités mineures ; `amount_kind` et fourchette recalculés depuis les membres                                                                                                                                                             |
| `currency`                             | `currency`                                                                   | Identique                                                                                                                                                                                                                               |
| `last_occurrence_at`                   | `last_on`                                                                    | Identique                                                                                                                                                                                                                               |
| `next_expected_at`                     | —                                                                            | Recalculé par `nextDue()`, ce qui corrige les échéances fausses de la prod                                                                                                                                                              |
| `occurrence_count`                     | `occurrence_count`                                                           | Recalculé depuis les membres                                                                                                                                                                                                            |
| `confirmed_at`                         | `confirmed_at`                                                               | Identique                                                                                                                                                                                                                               |
| `merchant_id`, `signals`, `renamed_at` | —                                                                            | Abandonnées                                                                                                                                                                                                                             |
| `deleted_at`                           | —                                                                            | Série manuelle supprimée : non reprise                                                                                                                                                                                                  |

### `budgets` → `budgets`

| ramnn                   | keel                         | Transformation                                                             |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `id`                    | `id`                         | Identique                                                                  |
| `owner_id`              | `household_id`, `created_by` | Foyer ; l'utilisateur                                                      |
| `user_bank_category_id` | `category_id`                | Via la correspondance des catégories                                       |
| `amount`                | `amount_minor`               | Unités mineures                                                            |
| `currency`              | `currency`                   | Identique                                                                  |
| `effective_from`        | `effective_month`            | Premier jour du mois de la date                                            |
| `recurrence`            | —                            | Abandonnée (toujours traitée comme mensuelle par ramnn)                    |
| `deleted_at`            | —                            | Non repris : la suppression dans ramnn retirait le budget de tous les mois |

Deux budgets ramnn du même mois pour la même catégorie après troncature :
le plus récent (`effective_from` le plus tardif) est gardé.

### `savings_targets` → `savings_targets`

`owner_id` → `household_id` ; `amount` → `amount_minor` ; `currency`
identique ; `effective_from` → `effective_month` (premier du mois) ;
supprimées non reprises.

## Revue, alertes, notifications, audit

### `monthly_reviews` → `monthly_reviews`

| ramnn                                  | keel                       | Transformation                                                                       |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `owner_id`                             | `user_id`, `household_id`  | L'utilisateur ; son foyer                                                            |
| `month`                                | `month`                    | Identique                                                                            |
| `locale`                               | `locale`                   | Identique                                                                            |
| `narrative`                            | `narrative`                | Identique (même forme JSON, à vérifier contre le schéma Zod keel au moment de l'ETL) |
| `model_version`                        | `model`                    | Identique                                                                            |
| `chart_key`                            | —                          | Abandonnée : l'image est rendue à la demande                                         |
| `chart_token`                          | `chart_token`              | Identique : les liens des emails déjà envoyés continuent de fonctionner              |
| `rating`, `rating_comment`, `rated_at` | idem                       | Identique                                                                            |
| `created_at`                           | `created_at`, `emailed_at` | `emailed_at` = `created_at` : la revue de ce mois a déjà été envoyée                 |

### `balance_thresholds` → `balance_thresholds`

`owner_id` → `user_id` + `household_id` ; `scope` : `checking` → `current`,
`bank_assets` → `liquid`, `total` → `total` ; `low_amount` et `high_amount`
en unités mineures ; `currency` identique ; `low_triggered_at` et
`high_triggered_at` → `low_fired_at` et `high_fired_at`.

### `notifications` → `notifications`

Seules les notifications des 90 derniers jours sont reprises, sauf les types
coupés (`anomaly_alert`, `alert`). `status` : `read` → `read_at =
updated_at` ; `archived` → `archived_at = updated_at`. `title` et `message`
disparaissent : le texte est rendu à l'affichage depuis `type` et `payload`.
Les anciennes notifications gardent `{ legacyTitle, legacyMessage }` dans
`payload`.

### `notification_settings` → `notification_preferences`

Seules les lignes qui diffèrent du défaut keel sont reprises, et seulement
pour les types qui existent encore. Le type `transaction_sync` par email
(digest), ainsi que ses colonnes `frequency`, `digest_hour` et
`last_digest_at`, ne sont pas repris.

### `domain_events` → `activity_events`

Les 90 derniers jours, pour les types d'entité du périmètre banque
(transactions, comptes, connexions, catégories, mappings, budgets, séries).
`owner_id` → `household_id` ; `actor_type` + `actor_id` → `actor_id` (nul
pour le système) ; `metadata` fusionné dans `changes` ; `reversible`
abandonné.

## Soldes et change

### `net_worth_snapshots` → `account_balances`

La reconstruction couvre 730 jours pour un compte synchronisé, c'est-à-dire
tout l'historique de ramnn (en prod depuis août 2025). Les snapshots ne sont
donc repris que pour ce que la reconstruction ne sait pas refaire :

- pour chaque compte manuel, et chaque jour d'un snapshot, `accounts[id]` en
  devise native devient une ligne `account_balances` (`source` =
  `declared`) ;
- tout le reste (holdings, `cost_basis`, `total_net_worth`, `bank_balance`)
  est abandonné.

### `exchange_rates` + `exchange_rate_history` → `fx_rates`

Non repris : `fx.refresh-rates` recharge l'historique BCE (base euro) depuis
la plus ancienne transaction. La base USD de ramnn ne se convertit pas
proprement en base euro sans perte de précision.

## Tables sans destination

| Table ramnn                                                    | Raison                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `holdings`, `trades`, `instruments`, `asset_classes`, `alerts` | Portefeuille, hors périmètre                                                                                                                   |
| `news_*`                                                       | News, hors périmètre                                                                                                                           |
| `documents`                                                    | Coffre-fort, hors périmètre. Les fichiers CSV importés ne sont pas repris                                                                      |
| `short_links`                                                  | Hors périmètre                                                                                                                                 |
| `oauth_*`, `jwks`                                              | MCP reporté                                                                                                                                    |
| `deleted_users`                                                | Recréée par le processus de suppression de keel si besoin ; les tombstones existantes sont reprises telles quelles pour respecter l'effacement |
| `bank_transaction_embeddings`, `transaction_anomaly_scores`    | Coupés                                                                                                                                         |

## Vérifications de fin d'ETL

1. Pour chaque (foyer, compte, devise) : somme des `amount_minor` des
   transactions non supprimées = somme des `amount` ramnn × 10^exposant.
2. Nombre de transactions par compte identique, tombstones comprises.
3. Solde de chaque compte synchronisé = `balance` ramnn (au signe près pour
   les cartes et prêts).
4. Chaque transaction catégorisée pointe vers une feuille.
5. Aucune transaction sans compte.
6. Les séries `active` de ramnn sont `active` dans keel, et aucune série
   rejetée n'est redevenue `suggested`.
7. Une sync à blanc sur un compte réel ne produit aucune insertion en double
   (seulement des `skip` et des `promote` de `booked_on`).
