# Settlement is the only way a transaction enters the database

In ramnn the settlement decision was pure and tested, but loading and applying its verdicts lived in the sync task, the sync chunked rows by 500 before deciding (so a stale duplicate could overwrite a fresh row), and CSV import bypassed settlement entirely (so importing on a synced account duplicated every row). We decided that every arriving row, from the bank, a CSV file or the legacy-data import, goes through one module, `settleArrivals`, which loads what the account already holds for the fetch window (tombstones included), decides insert, promote or skip for the whole fetch at once, and only then writes in batches.

A bank row's identity is its `entry_reference` when present (the only identifier Enable Banking documents as stable), otherwise a fingerprint of booking date, amount, currency and normalized label plus its occurrence rank within the fetch. Identities are unique per account. Rows of different origins without a shared identity are matched by a composite pass (same account, amount and currency, close dates, compatible labels, one to one), and the stored row adopts the bank's identity.

## Consequences

- A manual entry on a synced account acts as a placeholder: when the bank books the charge, settlement promotes the entry instead of duplicating it, and the member's category survives.
- A deleted transaction stays as a tombstone so it is never resurrected. Tombstones older than 800 days, beyond the aggregator's 730-day window, are purged.
- Promote rewrites only the bank's facts (dates, amount, label, counterparty); the category, the display name and the note are never touched.
