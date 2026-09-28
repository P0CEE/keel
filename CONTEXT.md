# Keel

Personal and household finance: bank connections, transactions, categories,
budgets, recurring charges and a monthly review. Single bounded context.

## Language

### Household and people

**Household**:
The group of people whose money is read together, and the owner of every
piece of financial data. A person always belongs to exactly one household,
alone until they invite someone.
_Avoid_: tenant, family, team, workspace

**Member**:
A person in a household. Members share the household's categories, mappings,
budgets and savings target, and see every account that is not private to
another member.
_Avoid_: user (when meaning the person inside a household)

**View**:
Whose accounts a screen reads: the whole household, or one member (their own
accounts plus the joint ones). A filter, never a permission.
_Avoid_: profile, perspective

### Connections and accounts

**Institution**:
A bank as the aggregator lists it (name, country, what it allows).
_Avoid_: bank (in code), ASPSP (aggregator jargon)

**Connection**:
One member's consent for the aggregator to read their accounts at one
institution, valid until a date. Personal: only the member who gave it can
renew it.
_Avoid_: link, item, session (the aggregator's word)

**Account**:
A place money sits: synced (owned by a connection) or manual (maintained by
hand). Owned by one member or joint, and optionally private to its owner.
_Avoid_: wallet, bank account (in prose, "account" suffices)

**Account kind**:
What an account is: current, savings, card, loan or other. Read from the bank
when connected, always correctable, and the member's word wins.
_Avoid_: type, subtype, livret

**Private account**:
An account only its owner can see. Everything it produces (transactions,
balances, figures) stays invisible to the other members.
_Avoid_: hidden account (hiding is a display preference, privacy is not)

**Balance**:
What an account holds on a day, signed from the holder's point of view:
positive is money the holder has, negative is money the holder owes. A card
or a loan normally has a negative balance.
_Avoid_: debt (as a positive number), available

**Balance history**:
The account's balance on every day, reconstructed backwards from the latest
balance the bank stated and the transactions it booked, so an account
connected today still shows its past.
_Avoid_: snapshot

**Net worth**:
The sum of the balances of every account a view can see, in one currency.
Debts count negatively. Broken down by member, joint accounts and debts.
_Avoid_: wealth, total balance

**Declared balance**:
The balance a member states for a manual account, on the day they state it.
An anchor: the balance on any other day is the anchor plus the transfers
recognized between the two days.
_Avoid_: opening balance

### Transactions

**Transaction**:
One movement of money on an account, signed from the holder's point of view:
negative leaves the account, positive enters it. Never zero.
_Avoid_: operation, movement (for a single row), trade

**Purchase date**:
The day the money was actually spent or received, as the member remembers
it. French banks write it into their card label days before they book the
row; the label wins. Every figure counts a transaction on this date.
_Avoid_: operation date, transaction date

**Booking date**:
The day the bank booked the transaction. Only settlement and the balance
history read it; no screen shows it.
_Avoid_: value date (a third date nobody reads)

**Arriving row**:
A transaction as the bank or a CSV file hands it over, before settlement has
decided what it is.
_Avoid_: raw transaction, import row

**Settlement**:
What decides, for each arriving row, whether it is new (insert), a revision of
a known transaction (promote, which rewrites only the bank's facts), or
already known (skip). A transaction the member deleted is known forever and
never comes back. Every arriving row goes through it, whatever its origin.
_Avoid_: dedup, matching, reconciliation

**Tombstone**:
A deleted transaction kept only so settlement never resurrects it.

### Categories

**Category**:
A top-level grouping (Housing, Transport). Never assigned to a transaction,
it only groups and aggregates.
_Avoid_: parent category

**Subcategory**:
The leaf a transaction is categorized as. Every category owns a catch-all
subcategory ("Other: Housing"), so a transaction never sits on a category.

**Nature**:
The flow meaning of a category, inherited by its subcategories: income,
expense or transfer. Only expense is budgetable.

**Merchant**:
The business on the other side of a card payment or a direct debit, shared by
every household (name, website). A person is never a merchant.
_Avoid_: payee, vendor

**Merchant key**:
The normalized form of a label that says which merchant a transaction is
about. Two transactions with the same merchant key are about the same
merchant for this household.

**Merchant mapping**:
A household's rule that a merchant, or a keyword in the label, always goes to
one subcategory. At most one mapping per merchant.
_Avoid_: rule, category rule, condition

**Category source**:
Who decided a transaction's subcategory, which also decides who may overwrite
whom: the member > a merchant mapping > an automatic decision (dictionary,
history, model). A decision only replaces one of equal or lower rank.
_Avoid_: confidence (a separate number, only the model gives one)

**Merchant history**:
The subcategory the automatic decisions usually gave a merchant in this
household, so a merchant keeps its category from one sync to the next.
Members' corrections are not history; a mapping is how a correction becomes
the rule.
_Avoid_: learning

**Rule prompt**:
The one-click offer after a member recategorizes a transaction: "Always
categorize this merchant as X?". Accepting creates or moves a merchant
mapping.

### Flows

**Internal transfer**:
A transaction whose other side is another account of the same household. It
moves money between the household's own pockets and is never income or
spending.
_Avoid_: transfer (alone, ambiguous), virement

**Counterpart account**:
The household account on the other side of an internal transfer, known even
when that account has no matching transaction (a manual savings account).

**Flow**:
What a transaction means for the month's money: income, expense, savings in
or out, transfer in or out, internal, or outside (a row on a savings account).
Decided once per transaction from its sign, subcategory nature and
counterpart account.
_Avoid_: type, classification

**Refund**:
A credit on an expense subcategory. It nets against spending in that
subcategory; it is not income.

**Disponible**:
What remains of a period's money after expenses, savings moves and outbound
transfers. A flow over a period, never a balance.
_Avoid_: net, leftover, available balance

**Set aside**:
What a period moved into savings, net of what came back.
_Avoid_: saved, savings (the accounts)

### Recurring

**Recurring series**:
Charges or incomes that come back on their own at a steady cadence from the
same merchant (subscription, rent, salary). Suggested by detection, confirmed
or dismissed by a member, dismissed for good.
_Avoid_: subscription (only one kind), recurring transaction

**Cadence**:
How often a recurring series comes back: weekly, every two weeks, every four
weeks, monthly, quarterly or yearly.
_Avoid_: frequency, period

**Next due date**:
When a recurring series is expected next, always derived from its last
occurrence and its cadence.

**Fixed charge**:
An expense that belongs to an active recurring series. Never exceptional,
whatever its size.

### Budgets and review

**Budget**:
A monthly spending limit on a category (covering its whole subtree) or a
subcategory. Applies from a month until a later one replaces it, so past
months keep the limit they were measured against. Totals never count a
subcategory budget twice when its category also has one.

**Savings target**:
The amount a household intends to set aside each month, versioned by month
like a budget. Budgets are the constraint, the target is the goal.
_Avoid_: goal (a dated objective, which does not exist)

**Monthly review**:
A month's facts and verdicts for one member's view of the household: real
income, fixed charges, everyday spending, exceptional purchases, what was set
aside against the target, the budgets' verdicts and the one action.

**Verdict**:
One thing a month says, decided by a rule from the review's facts, never by a
model. The first verdict of a month is its action.
_Avoid_: insight, tip, recommendation

**Exceptional purchase**:
A single expense, not a fixed charge, above a threshold set by the month's
income.
_Avoid_: anomaly, outlier

**Review narrative**:
The text a model writes about a monthly review, once, from its facts and
verdicts. It words, it never decides; a narrative that states a figure not in
the facts is dropped.

### Home

**Widget**:
A self-contained card on the home the member can add, remove and reorder.
Everything on the home is a widget.

**Layout**:
One member's arrangement of widgets. While they never customized it, the
home shows an adaptive default computed from what they have.
