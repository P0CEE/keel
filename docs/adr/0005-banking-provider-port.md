# Bank aggregators sit behind a provider port with two adapters

ramnn's provider module was a pass-through: PSD2 vocabulary leaked into jobs and settlement, errors surfaced as raw HTTP-client errors that the error classifier did not recognize (so the failure counter never moved), and error codes from three other aggregators lingered. We decided on a `BankingProvider` port whose output is already in domain shape (signed minor units, holder-signed balances, resolved currency, label lines, a `providerRef` only when it is stable) and whose failures are one typed `ProviderError` with a kind: `reconnect_required`, `rate_limited` (with a retry time), `transient`, `bank_unavailable`, `psu_required` or `invalid_request`.

Two adapters make the seam real: Enable Banking, and a scenario-driven fake used by tests and by local development without a bank. A second aggregator (GoCardless, Powens, Bridge) is a third adapter, not a redesign.

## Consequences

- The Enable Banking adapter validates every response with Zod and reads the business error code from the body, not from the HTTP status.
- Purchase-date parsing from card labels, card acceptors and card-mirror detection stay in the domain, since they are bank quirks, not aggregator features.
- User-initiated syncs send every PSU header the bank requires, or none, as Enable Banking demands.
