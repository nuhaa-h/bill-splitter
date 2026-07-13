# Phase 1 Planning — Household Bill Splitter

## Audience
Roommates / households sharing recurring expenses (rent, utilities, groceries), not one-off trip groups.

## Core model

### Household
- Created by one person, who shares a join code/link.
- Other roommates join by picking/entering their name — a **lightweight account** (no password, name-based identity).
- A person's account may belong to multiple households.

### Accounts & permissions
- No passwords. Identity is just a chosen name within a household.
- Any member can add a new expense.
- Only the creator of an expense can edit or delete it.
- Once a monthly period is settled, all its expenses are **locked** — no further edits/deletes. Corrections after settling require a new adjustment entry in the current period.

### Expenses & splitting
- Expenses are **itemized**: a bill (e.g. a grocery receipt) is broken into line items.
- Each item can be assigned to:
  - one person,
  - a subset of people (splits evenly among just those assigned), or
  - marked as a shared/default item (splits evenly among everyone in the household).
- Tax, tip, and delivery fees are distributed **proportionally** to each person's item subtotal (not split evenly, not itemized separately).

### Periods & settle-up
- Balances accumulate over a **monthly period**.
- At month end (or on demand), a member triggers settle-up:
  - The app computes each person's net balance for the period.
  - Balances are **netted down to the minimum number of payments** (debt simplification — e.g. if A owes B and B owes C, this may collapse to A owes C).
  - Members mark payments as done; once all are marked, the period is **settled and locked**, and a new period starts at zero.

### Currency
- Single currency per household (configured once, e.g. USD). No multi-currency support in this phase.

### Persistence
- Simple file/JSON storage (no real database) — consistent with the project's zero-dependency approach. Data must survive server restarts.

## Explicitly out of scope for Phase 1
- Real authentication (passwords, sessions, security).
- Multi-currency support.
- Editing/deleting expenses after a period is settled.
- Push notifications / payment reminders.
- Integration with real payment processors (Venmo, etc.) — settle-up is a manual "mark as paid" action.

## Open questions for later phases
- What happens if a household member leaves mid-period (unsettled balance)?
- Should there be a way to view historical (settled) periods, and if so, how far back?
- Should the debt-netting algorithm be shown transparently (i.e., can users see the original per-expense debts that produced a simplified balance)?
