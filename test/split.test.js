const { test } = require("node:test");
const assert = require("node:assert");
const {
  splitAmount,
  splitProportional,
  computeItemizedShares,
  computePeriodBalances,
  expenseTotal,
  netDebts,
  settleUp,
} = require("../core/split");

test("splitAmount divides evenly when it can", () => {
  assert.deepStrictEqual(splitAmount(10, 2), [5, 5]);
});

test("splitAmount shares always sum back to the original total", () => {
  const shares = splitAmount(10, 3);
  const total = shares.reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(total * 100) / 100, 10);
});

test("settleUp: the payer is owed by the others (even split)", () => {
  const balances = settleUp(
    ["Sam", "Alex"],
    [{ id: 1, description: "Lunch", payer: "Sam", amount: 20, participants: ["Sam", "Alex"] }]
  );
  assert.strictEqual(balances.Sam, 10);
  assert.strictEqual(balances.Alex, -10);
});

test("settleUp: balances net to zero with even splits", () => {
  const balances = settleUp(
    ["Sam", "Alex", "Jordan"],
    [{ id: 1, description: "Pizza", payer: "Sam", amount: 30, participants: ["Sam", "Alex", "Jordan"] }]
  );
  const sum = Object.values(balances).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(sum * 100) / 100, 0);
});

test("splitProportional shares always sum back to the total", () => {
  const shares = splitProportional(1000, [1, 1, 1]);
  assert.strictEqual(shares.reduce((a, b) => a + b, 0), 1000);
});

test("splitProportional weights larger shares toward larger weights", () => {
  const shares = splitProportional(300, [1, 2]);
  assert.deepStrictEqual(shares, [100, 200]);
});

test("splitProportional falls back to an even split when all weights are zero", () => {
  const shares = splitProportional(100, [0, 0, 0]);
  assert.strictEqual(shares.reduce((a, b) => a + b, 0), 100);
});

test("computeItemizedShares: an item assigned to one person is owed fully by them", () => {
  const expense = {
    payer: "Alex",
    items: [{ amount: 20, assignedTo: ["Jordan"] }],
    taxTip: 0,
  };
  const owed = computeItemizedShares(expense, ["Alex", "Jordan"]);
  assert.strictEqual(owed.Jordan, 20);
  assert.strictEqual(owed.Alex, 0);
});

test("computeItemizedShares: an 'everyone' item splits evenly among all members", () => {
  const expense = {
    payer: "Priya",
    items: [{ amount: 30, assignedTo: "everyone" }],
    taxTip: 0,
  };
  const owed = computeItemizedShares(expense, ["Priya", "Alex", "Sam"]);
  assert.strictEqual(owed.Priya, 10);
  assert.strictEqual(owed.Alex, 10);
  assert.strictEqual(owed.Sam, 10);
});

test("computeItemizedShares: tax/tip is distributed proportionally to item subtotals", () => {
  const expense = {
    payer: "Jordan",
    items: [
      { amount: 18, assignedTo: ["Alex"] },
      { amount: 12, assignedTo: ["Jordan"] },
    ],
    taxTip: 9,
  };
  const owed = computeItemizedShares(expense, ["Alex", "Jordan"]);
  // Alex's subtotal is 18/30 of the item total, Jordan's is 12/30.
  assert.strictEqual(owed.Alex, 18 + 9 * 0.6);
  assert.strictEqual(owed.Jordan, 12 + 9 * 0.4);
  assert.strictEqual(Math.round((owed.Alex + owed.Jordan) * 100) / 100, 39);
});

test("expenseTotal: sums item amounts plus tax/tip", () => {
  const expense = { items: [{ amount: 18 }, { amount: 12 }], taxTip: 9 };
  assert.strictEqual(expenseTotal(expense), 39);
});

test("computePeriodBalances: nets to zero across a mix of itemized expenses", () => {
  const members = ["Alex", "Priya", "Sam", "Jordan"];
  const expenses = [
    { payer: "Priya", items: [{ amount: 2400, assignedTo: "everyone" }], taxTip: 0 },
    {
      payer: "Jordan",
      items: [
        { amount: 18, assignedTo: ["Alex"] },
        { amount: 14.5, assignedTo: ["Priya"] },
        { amount: 12.8, assignedTo: ["Sam"] },
      ],
      taxTip: 9,
    },
  ];
  const balances = computePeriodBalances(members, expenses);
  const sum = Object.values(balances).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(sum * 100) / 100 || 0, 0);
});

test("netDebts: a single creditor is paid directly by every debtor", () => {
  const payments = netDebts({ Priya: 674, Alex: -217, Sam: -4, Jordan: -453 });
  assert.strictEqual(payments.length, 3);
  for (const p of payments) assert.strictEqual(p.to, "Priya");
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  assert.strictEqual(Math.round(total * 100) / 100, 674);
});

test("netDebts: simplifies a chain (A owes B, B owes C) to a single payment", () => {
  const payments = netDebts({ A: -10, B: 0, C: 10 });
  assert.deepStrictEqual(payments, [{ from: "A", to: "C", amount: 10 }]);
});
