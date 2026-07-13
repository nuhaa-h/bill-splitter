// Pure calculation logic for Bill Splitter.
// No I/O, no DOM — this is what the tests in /test cover.

/**
 * Split a total amount into `n` equal shares (in dollars, rounded to cents).
 *
 * Rounds down to whole cents for every share, then hands the leftover cents
 * (at most n - 1 of them) one at a time to the first shares, so the shares
 * always sum back to exactly `total`.
 */
function splitAmount(total, n) {
  if (n <= 0) throw new Error("n must be a positive number");
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / n);
  let remainder = totalCents - baseCents * n;

  const shares = Array(n).fill(baseCents);
  for (let i = 0; i < n && remainder > 0; i++, remainder--) {
    shares[i] += 1;
  }

  return shares.map((cents) => cents / 100);
}

/**
 * Split `totalCents` proportionally across `weights` (largest-remainder
 * method), so the result always sums back to exactly `totalCents` even
 * when the proportional shares aren't whole cents.
 *
 * If every weight is zero, the total is split evenly instead (there's
 * nothing to weight by).
 */
function splitProportional(totalCents, weights) {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    return splitAmount(totalCents / 100, weights.length).map((d) => Math.round(d * 100));
  }

  const raw = weights.map((w) => (w / weightSum) * totalCents);
  const shares = raw.map(Math.floor);
  let remainder = totalCents - shares.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remainder; k++) {
    shares[order[k].i] += 1;
  }

  return shares;
}

/**
 * Resolve an item's assignees to a concrete list of member names.
 * `assignedTo` is either the string "everyone" or an array of names.
 */
function resolveAssignees(assignedTo, members) {
  const names = assignedTo === "everyone" ? members : assignedTo;
  if (!names || names.length === 0) {
    throw new Error("an item must be assigned to at least one person");
  }
  return names;
}

/**
 * Compute what each member owes for a single itemized expense.
 *
 * `expense` is { payer, items: [{ amount, assignedTo }], taxTip }.
 * Each item's amount is split evenly among its assignees; taxTip (tip,
 * delivery fee, sales tax, etc.) is then distributed proportionally to
 * each person's item subtotal. Returns { [name]: amountOwed } — a map
 * over every member who owes something, summing to the expense total.
 */
function computeItemizedShares(expense, members) {
  const { items = [], taxTip = 0 } = expense;
  const subtotalCents = {};
  for (const m of members) subtotalCents[m] = 0;

  for (const item of items) {
    const assignees = resolveAssignees(item.assignedTo, members);
    const itemCents = Math.round(item.amount * 100);
    const shares = splitAmount(itemCents / 100, assignees.length).map((d) => Math.round(d * 100));
    assignees.forEach((name, i) => {
      subtotalCents[name] = (subtotalCents[name] || 0) + shares[i];
    });
  }

  const taxTipCents = Math.round(taxTip * 100);
  const names = Object.keys(subtotalCents);
  const weights = names.map((n) => subtotalCents[n]);
  const taxTipShares = splitProportional(taxTipCents, weights);

  const owed = {};
  names.forEach((name, i) => {
    owed[name] = (subtotalCents[name] + taxTipShares[i]) / 100;
  });
  return owed;
}

/**
 * Given a household's members and a period's itemized expenses, return
 * each person's net balance (what they paid minus what they owe), in
 * dollars. Positive means they're owed money; negative means they owe.
 *
 * Each expense is { payer, items: [{ amount, assignedTo }], taxTip }.
 */
function computePeriodBalances(members, expenses) {
  const balance = {};
  for (const m of members) balance[m] = 0;

  for (const expense of expenses) {
    const owed = computeItemizedShares(expense, members);
    for (const [name, amount] of Object.entries(owed)) {
      if (!(name in balance)) balance[name] = 0;
      balance[name] -= amount;
    }
    if (!(expense.payer in balance)) balance[expense.payer] = 0;
    balance[expense.payer] += expenseTotal(expense);
  }

  for (const name of Object.keys(balance)) {
    balance[name] = Math.round(balance[name] * 100) / 100 || 0;
  }
  return balance;
}

/** Total amount of an itemized expense: sum of its items plus tax/tip. */
function expenseTotal(expense) {
  const itemsTotal = (expense.items || []).reduce((sum, item) => sum + item.amount, 0);
  return Math.round((itemsTotal + (expense.taxTip || 0)) * 100) / 100;
}

/**
 * Net a set of balances down to the minimum-ish number of payments needed
 * to settle everyone up: repeatedly match the largest debtor with the
 * largest creditor. Returns [{ from, to, amount }], amounts in dollars.
 */
function netDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const [name, dollars] of Object.entries(balances)) {
    const cents = Math.round(dollars * 100);
    if (cents > 0) creditors.push({ name, cents });
    else if (cents < 0) debtors.push({ name, cents: -cents });
  }
  creditors.sort((a, b) => b.cents - a.cents);
  debtors.sort((a, b) => b.cents - a.cents);

  const payments = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0) {
      payments.push({ from: debtors[i].name, to: creditors[j].name, amount: amount / 100 });
    }
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return payments;
}

/**
 * Legacy equal-split balance calculator, kept for expenses that don't use
 * itemization: { payer, amount, participants: [names] } split evenly.
 */
function settleUp(people, expenses) {
  const balance = {};
  for (const p of people) balance[p] = 0;

  for (const e of expenses) {
    const shares = splitAmount(e.amount, e.participants.length);
    e.participants.forEach((name, i) => {
      if (!(name in balance)) balance[name] = 0;
      balance[name] -= shares[i];
    });
    if (!(e.payer in balance)) balance[e.payer] = 0;
    balance[e.payer] += e.amount;
  }

  for (const name of Object.keys(balance)) {
    balance[name] = Math.round(balance[name] * 100) / 100 || 0;
  }
  return balance;
}

module.exports = {
  splitAmount,
  splitProportional,
  computeItemizedShares,
  computePeriodBalances,
  expenseTotal,
  netDebts,
  settleUp,
};
