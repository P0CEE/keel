# Recurring series are identified by their counterparty and advanced by the calendar

ramnn identified a series by a text key derived from the merchant name, let the amount decide membership (plus or minus 30% around the median), and rescanned 730 days on every sync. A merchant rename duplicated series and stole a confirmed series' members, a price increase above 30% split a subscription in two, variable bills never became active, nothing noticed a late or cancelled charge, and the next due date was computed in seven places, including the client. We decided that a series is identified by its id, that incoming transactions attach to it through signatures in order of strength (SEPA mandate, counterparty IBAN, global merchant, label key), and that the amount is a property of the series (fixed or variable) rather than a membership test: a different amount on the expected date is a price change. Transactions attach incrementally on arrival; discovery only looks at unattached rows. The next due date comes from the cadence, a calendar anchor (day of month, including "last day") and learned business-day shifts, in one pure function.

The single status is split into two axes: the member's review (suggested, confirmed, dismissed) and the series' state in time (live, late, ended), advanced daily.

## Consequences

- Changing the label normalizer no longer breaks series; only the `merchant_key` signature is recomputed.
- Standing transfers (rent, savings plan) and bank fees become series; each series carries its members' flow, so only expense series are fixed charges.
- Membership is stored on the transaction, so a past month's fixed charges never change after a series ends; only a dismissal detaches members.
- Excluding one transaction from a series no longer dismisses the whole series.
