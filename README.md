# 💸 Bill Splitter

A household bill-splitting app: create a household, add itemized expenses, and settle up with the fewest payments possible. Zero dependencies — just Node.

See `docs/phase-1-planning.md` for the full spec this build follows.

## Run it
```bash
npm start
```
Then open **http://localhost:3000**.

## Test it
```bash
npm test
```

## How it works
| Part | File |
|---|---|
| Pure calculation logic (itemized splitting, proportional tax/tip, debt netting) | `core/split.js` |
| HTTP server + JSON API | `server.js` |
| Frontend (vanilla JS) | `public/` |
| Saved data | `data/households.json` (gitignored — created on first run) |
| Tests | `test/split.test.js` |
| Design explorations for phase 1 | `docs/designs/` |

## Model
- A **household** has lightweight, name-only members (no passwords) and a join code.
- Expenses are **itemized**: each line item is assigned to one person, a subset, or everyone (shared default). Tax/tip is distributed proportionally to each person's item subtotal.
- Balances accumulate over a **monthly period**. Only the person who added an expense can edit/delete it, and only while the period is open.
- **Settling up** nets balances down to the minimum number of payments; once every payment is marked paid, the period locks and a new one starts at $0.

The API: `POST /api/households`, `POST /api/households/join`, `GET /api/households/:id`, `POST /api/households/:id/expenses`, `DELETE /api/households/:id/expenses/:expenseId`, `POST /api/households/:id/settle`, `POST /api/households/:id/settle/pay`.

## Requirements
Node.js 18+ (uses the built-in test runner, so nothing to install).

## Where to go next
- `docs/phase-1-planning.md` — the full spec, including what's explicitly out of scope for phase 1.
- `ISSUES.md` — legacy issues from the pre-households version of the app.
- `TRAINEE.md` — the hands-on exercise.
