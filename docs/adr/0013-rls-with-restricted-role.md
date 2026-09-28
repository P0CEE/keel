# Row-level security is enforced with a restricted role and transaction-local settings

keel declared a policy on `tasks` but connected as the tables' owner, which bypasses row-level security, so nothing was actually protected; ramnn had no row-level security at all. We decided that migrations run as `keel_owner`, which owns the tables, while the API and the worker connect as `keel_app`, which owns nothing and cannot bypass policies. Every unit of work runs inside `withScope({ householdId, memberId }, fn)`, a transaction that sets `app.household_id` and `app.user_id` with `set_config(..., true)`, so the values never outlive the transaction on a pooled connection.

## Consequences

- Policies read those settings, including `private_to` for private accounts. Queries keep their explicit household filter: the policy is the second lock, not the only one.
- The few cross-household scans (sync scheduler, consent reminders, review candidates, purges) go through `SECURITY DEFINER` functions that return ids only; the job then reopens a scoped transaction per household.
- Each transaction costs one extra `set_config` round trip.
