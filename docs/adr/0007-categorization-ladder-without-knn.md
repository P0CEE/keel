# Categorization runs mappings, dictionaries and history before the model, and drops kNN

Replaying ramnn's evaluation offline showed the deterministic layers decide 8% of transactions, all correctly, and the model the rest; yet the model was called for every row, and the kNN layer over embeddings had never been measured, compared raw labels against cleaned ones, filtered other users' vectors after the index, and caused a 347-row miscategorization. We decided the ladder runs merchant mappings first, then the dictionaries (brands, merchant category codes, transfer keywords, members' names), then merchant history, and only sends the remaining rows to the model. kNN and its embeddings table are removed; whether embeddings return in another form is decided by the AI study on real data.

## Consequences

- The model sits behind a `CategorizationModel` port (Vercel AI SDK in production, scripted answers in tests and in the evaluation), so the provider is a configuration choice.
- Merchant history ignores model decisions below the review confidence, so an early model mistake no longer freezes into precedent.
- The evaluation runs the whole ladder with its ports fed, on a labeled sample of real transactions that shares nothing with the prompt's examples.
