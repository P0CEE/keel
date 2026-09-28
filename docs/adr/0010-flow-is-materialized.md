# A transaction's flow is computed once and stored

ramnn defined "what counts as spending" four times (cashflow, budgets, digest, merchant concentration), and the definitions disagreed: budgets ignored refunds and counted transfers as out-of-budget spending. We decided that one pure function classifies each transaction into a flow (income, expense, savings in or out, transfer in or out, internal, outside, unclassified) from its sign, its subcategory's nature, its account kind and its counterpart account, and that the reconciliation stores the result in `transactions.flow`. Every aggregate reads that column.

## Considered Options

- **Classify in SQL at read time.** Rejected: the rule needs the counterpart account and the nature, which became correlated subqueries in ramnn, and a SQL copy of a TypeScript rule drifts.

## Consequences

- The budget scope (expense flow, refunds netted, minus rows excluded from budgets) and the cashflow scope (every flow but internal and outside, minus rows excluded from analysis) differ on purpose, and each has one name.
- Any input change (recategorization, transfer recognition, account kind) triggers reconciliation, which updates the stored flow.
