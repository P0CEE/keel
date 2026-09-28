# An internal transfer is a transaction whose counterpart account is known

ramnn paired transfer legs only through the counterparty IBAN, which its main bank feed never provides, and recognized transfers to manual accounts through a separate label-matching path. We decided that a transaction records the household account on its other side, `counterpart_account_id`, recognized from IBAN, label and account name alike, and separately `transfer_peer_id` when the mirrored leg exists. A transfer to a manual savings account has a counterpart but no peer, and is still an internal transfer.

## Consequences

- A manual account's balance is its declared anchor plus the legs whose counterpart is that account, with no separate recognition rule.
- Savings moves are internal transfers whose counterpart is a savings account, whether or not the other leg exists.
- Recomputing transfers writes only the legs that changed; ramnn cleared and rewrote every pair of the owner on every sync.
