# The household owns the financial data, not the user

Couples read their money together, and a transaction on a joint account can only carry one category. We decided that every piece of financial data (accounts, transactions, categories, merchant mappings, budgets, recurring series, the savings target) belongs to a **household**, and that users are its **members**. Every person gets a household at sign-up, alone in it; inviting a second member comes later, but the schema, the row-level security and the modules assume several members from day one.

## Considered Options

- **Owner = user, sharing added later.** Rejected: moving the ownership key afterwards touches every table, every policy, every unique constraint and every query, and a shared taxonomy cannot be retrofitted onto per-user categories without merging them.
- **Owner = user, with a household view that unions members' data.** Rejected: two members would hold two categories for the same joint transaction.

## Consequences

- A connection stays personal: PSD2 consent is given by one person, so only the member who consented can renew it and receives the expiry reminders.
- An account is owned by one member or joint, and may be **private** to its owner. Privacy is enforced by row-level security through a denormalized `private_to` column on the account's transactions and balances, not by the interface.
- Every figure (monthly review, budget alerts, balance thresholds) is computed as one member sees the household. Two members can see different totals when one of them has a private account; that is intended.
- A merchant mapping created from a private transaction is a household rule, so its pattern is visible to the other members. The interface says so when the mapping is created.
