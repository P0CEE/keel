# Balance history is reconstructed backwards from booked transactions

ramnn only recorded balances from the day an account was connected, in daily snapshots mixed with portfolio data, so a new user saw no past. We decided that each account has one balance per day in `account_balances`, reconstructed backwards from the latest balance the bank stated: the balance of a day is the next day's balance minus what the bank booked on the next day. It uses the booking date, not the purchase date, because the bank's balance moves when a row is booked.

## Consequences

- An account connected today shows up to two years of history, and a CSV import of older statements extends it further back.
- Arriving rows mark the account dirty from their oldest booking date, and reconciliation rewrites only that range.
- A manual account's history is its declared anchor plus the transfers whose counterpart it is, forwards and backwards.
