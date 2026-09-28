# Business rules live in a pure package; I/O lives in application modules

In ramnn, rules were spread across the database queries, the job bodies, the routers and the client, so the same rule was written several times and the parts that caused bugs had no tests. We decided on three packages. `@keel/finance` holds every business rule as pure functions (money, labels, settlement, categorization ladder, transfers, flow, recurring series, budgets, balances, monthly review) and is tested without Postgres or Redis. `@keel/banking` holds the application modules, which load, call the pure rules, write in one transaction and dispatch the follow-up; routers and job processors call only these. `@keel/bank-providers` holds the provider port and its adapters.

## Consequences

- `@keel/finance` has no server dependency, so the client imports the same money formatting and filter normalization as the server.
- Application modules are tested through their interface on PGlite (in-process Postgres, with roles for row-level security) with the ports' test adapters, instead of mocking the database.
