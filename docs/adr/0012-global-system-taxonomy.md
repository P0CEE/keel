# The system taxonomy is global; households only add subcategories

ramnn copied the whole system taxonomy into every user's rows, so improving it meant a data migration per user. We decided that system categories and subcategories are global rows with a stable key and a localized name, and that a household only adds its own subcategories under them (and archives them). Transactions, budgets and mappings reference either kind of row.

## Consequences

- Row-level security lets every household read the global rows and write only its own.
- A household never renames or recolors a system category. What it needs beyond the system taxonomy, it adds as its own subcategories.
