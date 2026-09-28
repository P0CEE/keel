# One module writes a transaction's category, and merchant mappings replace rules

Nine places in ramnn wrote a transaction's category, each applying the source ranking its own way: the edit form never marked its change as manual, moving a merchant mapping left its rows on the old category, and undo trusted a source sent by the client. We decided that only `recategorize(scope, selection, target, source)` writes the category. It resolves the target to a leaf, applies the source ranking (member > merchant mapping > dictionary = history = model), moves the rows a mapping owns when the mapping moves, returns an undo token handled server-side, and reports the change to the after-write pipeline.

Merchant mappings are stored in one table (household, matcher, pattern, category). ramnn's rule-plus-condition pair existed only as storage once its ADR 0001 made the mapping the only user-facing concept. When two keyword mappings match, the longest pattern wins, which replaces the hidden `priority` column.

## Consequences

- Each transaction records the mapping that categorized it, so moving or deleting a mapping touches exactly its rows.
- A database trigger rejects a category that is not a leaf, as a second lock behind the module.
