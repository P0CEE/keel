# Money is a signed integer of minor units, signed from the holder's point of view

ramnn stored amounts as `numeric(20,2)` strings, computed in floating point with rounding helpers, and stored a credit card's balance positive at connection time but negative after a sync. We decided that every amount is a `bigint` of minor units (read as a JavaScript `number`, exact up to 2^53) with an ISO 4217 currency, and that transactions and balances are signed from the account holder's point of view: negative means money leaves or is owed.

## Consequences

- A card or a loan normally has a negative balance, and net worth is the plain sum of converted balances. The provider adapter normalizes the sign once; nothing downstream calls `Math.abs`.
- Decimal text from banks and CSV files is parsed to minor units on the string, never through a float. The exponent comes from a static ISO 4217 table (EUR 2, JPY 0, KWD 3).
- Magnitudes that are not movements (budget limits, savings target, a series' typical amount) are positive by constraint. Balance thresholds are signed, since a low threshold can be an overdraft.
