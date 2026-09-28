# 04 · Étude IA : modèles, coûts, embeddings

- Date : 2026-09-28
- Sources des prix : pages officielles des fournisseurs et API publique de la
  Vercel AI Gateway, consultées le 2026-09-28 (liste en fin de document).
- Mesures : banc de test exécuté le 2026-09-28 via la Vercel AI Gateway
  (`ai@7`, `generateText` + `Output.object`) et l'API Gemini directe.
- Statut : recommandation validée (gpt-6-luna avec repli Gemini, pas
  d'exigence de traitement en UE), confrontée à l'échantillon réel de la prod
  (sections 3.4 et 3.5).

## 1. Inventaire des besoins

| Besoin                                                                       | Volume                                                                                                                                                                                                                                                                      | Latence acceptable                                                                                                      | Précision requise                                                                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catégorisation + identité du marchand** (nom propre, domaine pour le logo) | Import initial : jusqu'à 730 jours d'historique, soit quelques milliers de lignes par foyer une seule fois. Ensuite, de l'ordre de 150 à 400 transactions par foyer et par mois (fourchette à confirmer avec la mesure de la prod), dont seule une partie atteint le modèle | Tâche de fond, mais la fluidité exige qu'une transaction arrivée soit catégorisée dans les secondes qui suivent la sync | Au moins 95 % de bonnes feuilles sur ce qui est accepté sans revue ; aucune erreur de nature (un débit jamais en revenu) ; une abstention honnête plutôt qu'une invention |
| **Mapping des colonnes d'un CSV**                                            | Un appel par import, rare                                                                                                                                                                                                                                                   | Interactif : moins de 3 s                                                                                               | Doit être juste ou corrigeable : l'utilisateur voit l'aperçu et peut changer chaque colonne                                                                               |
| **Narrative de la revue mensuelle**                                          | Un appel par membre et par mois                                                                                                                                                                                                                                             | Tâche de fond (le 1er du mois)                                                                                          | Qualité d'écriture en français. Aucun chiffre inventé : un garde-fou rejette tout texte contenant un chiffre absent des faits (ADR 0015)                                  |
| **Nettoyage des libellés marchands**                                         | Inclus dans l'appel de catégorisation (champ `merchant`)                                                                                                                                                                                                                    | —                                                                                                                       | —                                                                                                                                                                         |

Réduction du volume avant tout appel de modèle (ADR 0007) : merchant
mappings, dictionnaires (marques, MCC, virements, noms des membres),
historique marchand, puis **dédoublonnage par `merchant_key`** dans un lot, et
table `merchants` globale qui mémorise l'identité (nom, domaine) d'un marchand
déjà vu par n'importe quel foyer. Le coût dépend donc surtout du nombre de
**nouveaux marchands**, pas du nombre de transactions.

## 2. Embeddings : pas maintenant

| Usage envisagé                                                       | Solution sans embeddings                                                                                                                       | Verdict         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| kNN pour catégoriser une transaction jamais vue, d'après les voisins | Historique marchand du foyer, merchant mappings, puis LLM. Dans ramnn, le kNN n'a jamais été mesuré et a causé un incident (audit, section 11) | Sans embeddings |
| Recherche sémantique dans les transactions                           | Index trigramme sur `search_text` (R2). Les gens cherchent « Carrefour » ou « loyer », pas « mes courses du week-end »                         | Sans embeddings |
| Regroupement de marchands                                            | Normaliseur unique (`merchantKey`) + identité donnée par le modèle (nom, domaine) + table `merchants` dédoublonnée par domaine                 | Sans embeddings |
| Détection de doublons                                                | Settlement : identité bancaire, empreinte, passe composite (ADR 0004). Déterministe et testable                                                | Sans embeddings |

Stockage, pour mémoire : 768 dimensions coûtent 3 080 octets par vecteur en
`vector` et 1 544 en `halfvec`, soit environ 77 à 154 Go par an pour
10 000 foyers à 5 000 transactions par an, hors index [PGV]. Un index HNSW
global filtré par foyer s'épuise vite (limite de 20 000 tuples par défaut
avec le scan itératif de pgvector 0.8) ; le README de pgvector recommande
alors un index B-tree sur la colonne de filtre et une recherche exacte [PGV].

**Si un jour un usage se justifie** (mesuré sur l'échantillon réel), l'option
la plus sobre est pgvector dans le Postgres existant, avec des vecteurs par
**marchand** (quelques milliers, partagés) plutôt que par transaction, en
`halfvec`, et `text-embedding-3-small` à 0,02 $ par million de tokens [O-PRIX]
ou `voyage-4-lite` au même prix [VOY]. Une base vectorielle dédiée
ajouterait une seconde source de vérité et un point RGPD de plus, sans
justification à cette échelle.

## 3. Benchmark

### 3.1 Méthode

- **Jeu** : golden set de ramnn, 166 transactions françaises réalistes
  étiquetées à la main sur la taxonomie à deux niveaux (57 feuilles), dont
  8 où la bonne réponse est l'abstention.
- **Prompt neutre, identique pour tous** : taxonomie et règles de
  désambiguïsation de ramnn, **sans** ses exemples few-shot et **sans** les
  noms de marchands que ses règles citaient, puisqu'ils recoupaient le golden
  set. Les descriptions de catégories citent encore quelques grandes marques
  (Netflix, Spotify, Engie, URSSAF), ce qui est un biais mineur et commun à
  tous.
- **Appel** : lots de 50, sortie structurée validée par Zod (id, marchand,
  domaine, feuille ou null, confiance), température 0 quand le modèle
  l'accepte, raisonnement coupé chez OpenAI (`reasoningEffort: "none"`) et
  réduit (`low`) pour gpt-oss.
- **Garde de signe** appliquée comme en production (un débit sur une
  catégorie de revenu devient une abstention).
- **Coût** : tokens réellement consommés × prix catalogue du jour. La
  Gateway n'ajoute pas de marge [V-PRIX].
- Deux passes sur gemini-3.1-flash-lite ont donné des résultats identiques :
  une passe par modèle ensuite.

### 3.2 Résultats sur le golden set

| Modèle (id Gateway)                         | Bonne feuille                 | Bonne catégorie | Abstentions justes | Latence d'un lot de 50 | Tokens par transaction (entrée / sortie) | Coût pour 1 000 transactions |
| ------------------------------------------- | ----------------------------- | --------------- | ------------------ | ---------------------- | ---------------------------------------- | ---------------------------- |
| `openai/gpt-6-luna`                         | **98,1 %**                    | 98,1 %          | 5/8                | 11,4 s                 | 71 / 31                                  | **0,023 $**                  |
| `google/gemini-3.8-flash`                   | 98,1 % (100 % en API directe) | 98,7 %          | 7/8                | 23 à 39 s              | 82 / 195 (raisonnement)                  | 0,79 $, puis 1,58 $ en 2027  |
| `gemma-4-31b-it` (ouvert, API Gemini)       | 98,1 %                        | 99,4 %          | 7/8                | 80 s                   | 77 / 48                                  | non confirmé                 |
| `google/gemini-3.5-flash`                   | 98,1 %                        | 98,7 %          | 6/8                | 29 s                   | 77 / 175                                 | non confirmé                 |
| `google/gemini-3.1-flash-lite` (prod ramnn) | 96,2 à 96,8 %                 | 98,1 %          | 2/8                | 6,3 s                  | 82 / 47                                  | 0,090 $                      |
| `google/gemini-3.5-flash-lite`              | 94,3 %                        | 96,8 %          | 4/8                | 6,9 s                  | 77 / 59                                  | 0,171 $                      |
| `anthropic/claude-haiku-4.5`                | 93,7 %                        | 98,1 %          | 7/8                | 9,9 s                  | 92 / 34                                  | 0,263 $                      |
| `gemini-2.5-flash-lite`                     | 93,7 %                        | 94,9 %          | 0/8                | 6,9 s                  | 77 / 58                                  | non confirmé                 |
| `openai/gpt-5.4-nano`                       | 89,2 %                        | 92,4 %          | 1/8                | 10,8 s                 | 71 / 31                                  | 0,053 $                      |
| `mistral/mistral-small`                     | 89,2 %                        | 93,0 %          | 0/8                | 10,1 s                 | 79 / 45                                  | 0,039 $                      |
| `openai/gpt-oss-120b` (Groq)                | 85,4 %                        | 89,2 %          | 4/8                | 17,6 s                 | 75 / 86                                  | 0,063 $                      |
| `mistral/ministral-8b`                      | 82,3 %                        | 86,7 %          | 0/8                | 27,5 s                 | 79 / 53                                  | 0,020 $                      |
| `openai/gpt-oss-20b` (Groq)                 | 73,4 %                        | 79,7 %          | 3/8                | 32,5 s                 | 71 / 48                                  | 0,020 $                      |

Lecture :

- **Le golden set est saturé** : quatre modèles sont à 98 % ou plus. Il
  élimine les candidats faibles mais ne départage plus les bons. Seul
  l'échantillon réel le fera (section 3.4).
- **La confiance déclarée par les LLM est inutilisable** : tous les modèles
  donnent 0,8 ou plus à presque toutes leurs réponses, justes ou fausses. Elle
  ne peut pas décider de ce qui doit être revu. ramnn s'appuyait dessus.
- **gpt-6-luna** est le meilleur rapport précision / coût / latence : même
  précision que les meilleurs, 34 fois moins cher que gemini-3.8-flash et
  4 fois moins que le modèle actuel de ramnn, en 11 s par lot.

### 3.3 JEV (TypeSafe), un modèle de décision

JEV ne génère pas de texte : il choisit parmi des options fermées et renvoie
une probabilité par option. Une transaction par appel, question « choice »
sur les 57 feuilles, via la Gateway (`experimental_evaluate`,
`typesafe-ai/jev`).

| Seuil de probabilité  | Bonne feuille | Couverture | Précision quand il répond |
| --------------------- | ------------- | ---------- | ------------------------- |
| 0 (toujours répondre) | 84,8 %        | 100 %      | 84,8 %                    |
| 0,7                   | 79,7 %        | 84,2 %     | 94,7 %                    |
| 0,9                   | 68,4 %        | 69,0 %     | **99,1 %**                |

- **Calibration** : dans la tranche 0,9 à 1 (109 lignes), il a raison 99 fois
  sur 100. Dans les tranches moyennes, la calibration est plus lâche.
- **Latence** : 344 ms médiane par transaction, 895 ms au 95e centile.
- **Coût** : environ 3 350 tokens d'entrée par transaction (les 57 options et
  leurs descriptions sont renvoyées à chaque appel), sortie gratuite, soit
  environ 0,14 $ pour 1 000 transactions : **6 fois plus cher que
  gpt-6-luna**.
- **Disponibilité** : trois relances le même jour ont échoué à plus de 98 %
  (« upstream provider is currently experiencing high demand »), même à
  faible concurrence. Le service est en accès anticipé.

Conclusion : JEV n'est ni moins cher ni plus précis qu'un bon LLM pour la
catégorisation seule. Sa valeur serait la **probabilité calibrée**, que les
LLM ne donnent pas. On ne l'intègre pas maintenant. On le réévaluera comme
juge de revue (« cette catégorie est-elle juste ? », question booléenne sur
une seule option, donc beaucoup moins de tokens), quand le service sera
stable.

### 3.4 Échantillon réel de la prod

Extrait le 2026-09-28 depuis l'intérieur de Railway (`railway ssh` sur le
service API, une transaction en lecture seule, anonymisation faite dans le
conteneur). Le proxy TCP public de la base ne répond pas, ce qui interdisait
toute extraction depuis un poste.

**Contenu** : 55 transactions distinctes, étiquetées par une personne, chez
3 utilisateurs : 45 corrections manuelles et 10 lignes de merchant mapping.
C'est un **jeu de cas difficiles par construction**. Une correction manuelle
est presque toujours un cas où la catégorisation automatique s'était trompée,
ou une préférence personnelle.

| Modèle                         | Réponses | Précision quand il répond : feuille | Précision quand il répond : catégorie |
| ------------------------------ | -------- | ----------------------------------- | ------------------------------------- |
| `google/gemini-3.8-flash`      | 49/55    | **30,6 %**                          | **59,2 %**                            |
| `google/gemini-3.5-flash`      | 49/55    | 30,6 %                              | 55,1 %                                |
| `google/gemini-3.1-flash-lite` | 51/55    | 25,5 %                              | 49,0 %                                |
| `anthropic/claude-haiku-4.5`   | 52/55    | 23,1 %                              | 51,9 %                                |
| `openai/gpt-5.4-nano`          | 48/55    | 18,8 %                              | 39,6 %                                |
| `openai/gpt-6-luna`            | 47/55    | 17,0 %                              | 51,1 %                                |
| `mistral/mistral-small`        | 54/55    | 13,0 %                              | 44,4 %                                |

Quand `gpt-6-luna` et `gemini-3.1-flash-lite` sont d'accord (26 lignes), ils
ont raison à 23 % seulement : l'accord entre modèles ne signale pas les
réponses fiables.

**Ce que révèlent les erreurs** : la bonne réponse dépend d'un savoir que seul
le foyer possède. L'assurance MMA couvre la voiture, pas le logement ; un
virement à « Sandrine G » est un cadeau ; un prêt finance des travaux ; un
prélèvement de la DGFiP est une facture d'eau. Aucun libellé ne contient cette
information, donc aucun modèle ne peut la deviner. Sur 55 lignes, l'écart
entre le meilleur modèle et `gpt-6-luna` (7 réponses justes) n'est pas
significatif. Il penche dans le même sens que le golden set : les modèles qui
raisonnent (Gemini Flash) s'en sortent un peu mieux sur l'ambigu, pour 34 fois
le prix.

**Enseignements pour le produit** :

1. **Le levier est la boucle d'apprentissage, pas le modèle.** En prod,
   36 % des transactions sont déjà catégorisées par des règles créées par les
   utilisateurs, contre 51 % par le LLM. Chaque correction doit proposer, en
   un clic, de devenir un merchant mapping (rule prompt). Les mappings passent
   avant le modèle (ADR 0007).
2. **Mieux vaut s'abstenir que deviner.** Tous les modèles répondent à 85 à
   98 % de ces lignes impossibles. Le prompt doit exiger une abstention sur
   une ligne de carte sans marchand identifiable (ville seule), et
   l'abstention envoie la ligne dans « à revoir » (section 4.2).
3. **L'eval se nourrit de l'usage.** Dans keel, chaque correction manuelle est
   enregistrée avec la proposition du modèle qu'elle remplace. Le jeu de cas
   difficiles grossit tout seul, et chaque changement de modèle ou de prompt
   est rejoué dessus avant d'être déployé.

### 3.5 Volumes réels de la prod

| Mesure                                                      | Valeur                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Utilisateurs / avec une banque connectée                    | 10 / 3                                                                                                 |
| Transactions (toutes)                                       | 3 244, du 2023-05-05 au 2026-09-26                                                                     |
| Transactions par utilisateur actif et par mois, sur 12 mois | médiane **69**, 90e centile 129, maximum 189                                                           |
| Sources de catégorie                                        | LLM 51 %, merchant mappings 36 %, inconnue 6 %, dictionnaires et historique 4 %, kNN 2 %, manuelle 2 % |
| Merchant mappings                                           | 16 conditions dans 12 règles                                                                           |

## 4. Recommandation

### 4.1 Un modèle par besoin

| Besoin                                | Modèle                                                                                                                                            | Configuration                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Catégorisation + identité du marchand | `openai/gpt-6-luna`                                                                                                                               | `reasoningEffort: "none"`, sortie structurée, lots de 50 lignes distinctes par `merchant_key`, conservation zéro activée sur la Gateway |
| Repli de la catégorisation            | `google/gemini-3.1-flash-lite`                                                                                                                    | Déclaré en modèle de secours de la Gateway (`providerOptions.gateway.models`) : autre fournisseur, bascule automatique [V-MOD]          |
| Mapping CSV                           | Heuristique d'en-têtes d'abord (Date, Libellé, Débit, Crédit, Montant, Solde, en français et en anglais), puis `openai/gpt-6-luna` si elle échoue | Gère les formats à deux colonnes Débit / Crédit, que ramnn ignorait                                                                     |
| Narrative de la revue                 | À départager entre `google/gemini-3.8-flash` et `openai/gpt-6-luna` avec raisonnement, sur trois mois réels relus par toi                         | Le volume rend le coût négligeable ; on choisit sur la qualité du texte                                                                 |
| Embeddings                            | Aucun                                                                                                                                             | Section 2                                                                                                                               |

Les modèles sont déclarés **par rôle** dans `packages/ai`
(`categorize`, `categorizeFallback`, `csvMapping`, `reviewNarrative`), sous
forme de chaînes Gateway surchargeables par variable d'environnement. Changer
de modèle ne demande aucun changement de code. Le catalog passe de `ai ^6` à
`ai ^7`, qui est la version sur laquelle le banc de test a tourné.

### 4.2 Ce qui décide d'une revue

La confiance des LLM ne vaut rien (section 3.2). Une transaction est marquée
« à revoir » par des règles, dans le module `categorization` :

- le modèle s'est abstenu ;
- sa réponse contredit l'historique du marchand dans le foyer ;
- le marchand est inconnu et le montant dépasse un seuil relatif aux revenus
  du foyer.

JEV pourra plus tard remplacer ces règles par une probabilité calibrée.

### 4.3 Coût mensuel par foyer

Volume mesuré en prod (section 3.5) : 69 transactions par mois en médiane,
129 au 90e centile. Même si toutes allaient au modèle, le coût serait de
129 × 0,023 $ / 1 000 = **0,003 $ par foyer et par mois** au 90e centile.
Avec les mappings, les dictionnaires, l'historique et le dédoublonnage par
marchand, seule une partie des lignes atteint le modèle.

- Import initial (en prod, l'historique va jusqu'à 3 ans et demi) : moins de
  0,1 $ par foyer, une fois.
- Narrative de la revue : un appel par membre et par mois, négligeable.
- Pour 10 000 foyers : quelques centaines de dollars par an tout compris.

### 4.4 Cache et batch

- **Cache de prompt** : le préfixe statique (taxonomie et règles, environ
  2 200 tokens) passe en tête du prompt. OpenAI le met en cache
  automatiquement au-delà de 1 024 tokens, avec une lecture à 0,1 × le prix
  d'entrée [O-CACHE]. Aucun cache n'a été observé pendant le banc de test
  (appels trop espacés), donc les coûts mesurés sont un plafond.
- **Batch** : non retenu. La Batch API de la Gateway ne supporte ni la sortie
  structurée, ni la conservation zéro [V-BATCH], et la fluidité exige une
  catégorisation dans les secondes qui suivent la sync. L'import initial
  pourra passer en batch direct chez le fournisseur (−50 %) si son volume le
  justifie.
- **Cache métier** : la table `merchants` globale et l'historique du foyer
  évitent de redemander ce qui est connu. C'est le levier principal.

### 4.5 Risques

| Risque                                                            | Réponse                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traitement hors UE (OpenAI via la Gateway : États-Unis seulement) | Accepté (décision de validation). Libellés sans nom de personne par construction du prompt, conservation zéro activée, pas d'entraînement sur les données d'API [O-DATA]. Repli possible sur Gemini en région UE (`inferenceRegion`) si l'exigence change [V-REG] |
| Modèle retiré ou dégradé                                          | Modèle par rôle en configuration, repli Gateway sur un autre fournisseur, eval rejouable avant tout changement                                                                                                                                                    |
| Hausse de prix (Gemini Flash doublé au 1er janvier 2027) [G-PRIX] | Le repli est Flash-Lite, non concerné par l'annonce                                                                                                                                                                                                               |
| Claude Haiku 4.5 retiré au plus tôt le 15 octobre 2026 [A-MOD]    | Non retenu                                                                                                                                                                                                                                                        |

## Sources

Consultées le 2026-09-28 ; date de la page quand elle en affiche une.

- [G-PRIX] https://ai.google.dev/gemini-api/docs/pricing (2026-09-24)
- [O-PRIX] https://developers.openai.com/api/docs/pricing
- [O-CACHE] https://developers.openai.com/api/docs/guides/prompt-caching
- [O-DATA] https://developers.openai.com/api/docs/guides/your-data
- [A-MOD] https://platform.claude.com/docs/en/about-claude/models/overview
- [V-PRIX] https://vercel.com/docs/ai-gateway/pricing (2026-09-08)
- [V-MOD] https://vercel.com/docs/ai-gateway/models-and-providers (2026-09-08) et `/model-fallbacks` (2026-09-10)
- [V-REG] https://vercel.com/docs/ai-gateway/security-and-compliance/regional-inference (2026-09-10)
- [V-BATCH] https://vercel.com/docs/ai-gateway/models-and-providers/batch-processing (2026-09-18)
- [V-API] https://ai-gateway.vercel.sh/v1/models (interrogée le 2026-09-28)
- [VOY] https://docs.voyageai.com/docs/pricing (2026-08-26)
- [PGV] https://github.com/pgvector/pgvector (README, version 0.8.6 du 2026-07-29)
- JEV : https://flaviocopes.com/jev/ et mesures directes via la Gateway

## Décisions validées (2026-09-28)

1. Étude validée : `openai/gpt-6-luna` pour la catégorisation, repli
   `google/gemini-3.1-flash-lite`, pas d'exigence de traitement en UE, pas
   d'embeddings, JEV différé. L'échantillon réel (section 3.4) ne remet pas
   le choix en cause : sur les cas personnels, aucun modèle ne dépasse 31 %,
   et le levier est la boucle d'apprentissage.
2. Le catalog passe de `ai ^6` à `ai ^7`.
3. Le modèle de la narrative de revue sera choisi en relisant trois revues
   réelles, au moment de construire la revue mensuelle.
