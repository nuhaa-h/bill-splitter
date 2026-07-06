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
 * Given a list of people and expenses, return each person's net balance
 * (what they paid minus what they owe), in dollars.
 *   positive  -> they are owed money
 *   negative  -> they owe money
 *
 * Each expense is: { payer, amount, participants: [names] } and is split
 * equally among its participants.
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
    balance[name] = Math.round(balance[name] * 100) / 100;
  }
  return balance;
}

module.exports = { splitAmount, settleUp };
