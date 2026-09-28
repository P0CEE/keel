# What follows a write is decided in one module and coalesced per household

In ramnn the order of work after new transactions existed only as a chain of task triggers spread over five tasks; manual entries were never categorized, and edits, deletions and undo never recomputed transfers or manual-account balances. We decided that every write reports `transactionsChanged(scope, ids, cause)`, and that this module alone decides the follow-up for each cause (arrival, entry, recategorized, edited, deleted, restored, account changed, balance declared), dispatched through a `Dispatch` port (BullMQ in production, an in-memory recorder in tests).

Follow-up jobs carry only the household id. `bank.categorize` processes whatever is pending (`categorized_at IS NULL`) and `bank.reconcile` recomputes the household's derived state and writes only the difference. Both are debounced per household with BullMQ deduplication, so a burst of writes becomes one run.

## Consequences

- Job payloads never hold lists of transaction ids, and a lost or duplicated job is harmless: the next run finds the same pending state in the database.
- A member's edit and a bank arrival follow the same path, so derived state cannot drift depending on how a row changed.
