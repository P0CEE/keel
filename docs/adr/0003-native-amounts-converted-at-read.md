# Amounts are stored in their native currency and converted at read time

ramnn froze every transaction into a canonical USD amount at write time, recomputed it on edits, and still had to convert USD to the display currency on read, so it paid for two conversions and a column to keep consistent. We decided to store only native amounts and to convert at read time, at the rate of the purchase date, from one table of daily rates quoted against the euro (ECB reference rates). A cross rate A to B is derived from the two euro rates.

## Consequences

- Aggregates group by period and currency first, then convert the few resulting sums, never thousands of rows.
- Reads load only the rate range they need; ramnn loaded the whole rate history on every display query.
- Changing a household's display currency rewrites nothing.
