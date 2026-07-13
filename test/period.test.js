const { test } = require("node:test");
const assert = require("node:assert");
const { daysUntilPeriodEnd, shouldRemindToSettle } = require("../core/period");

test("daysUntilPeriodEnd: counts down to the last day of the month", () => {
  assert.strictEqual(daysUntilPeriodEnd(new Date(2026, 6, 27)), 4); // July 27 -> July 31
  assert.strictEqual(daysUntilPeriodEnd(new Date(2026, 6, 31)), 0); // the last day itself
  assert.strictEqual(daysUntilPeriodEnd(new Date(2026, 6, 1)), 30); // start of a 31-day month
});

test("daysUntilPeriodEnd: handles a 28-day February", () => {
  assert.strictEqual(daysUntilPeriodEnd(new Date(2026, 1, 26)), 2); // 2026 is not a leap year
});

test("shouldRemindToSettle: true when the period is open, has expenses, and is within the threshold", () => {
  const period = { status: "open", expenses: [{ id: 1 }] };
  assert.strictEqual(shouldRemindToSettle(period, new Date(2026, 6, 27), 5), true);
});

test("shouldRemindToSettle: false when there's nothing to settle yet", () => {
  const period = { status: "open", expenses: [] };
  assert.strictEqual(shouldRemindToSettle(period, new Date(2026, 6, 27), 5), false);
});

test("shouldRemindToSettle: false once settlement has already started", () => {
  const period = { status: "settling", expenses: [{ id: 1 }] };
  assert.strictEqual(shouldRemindToSettle(period, new Date(2026, 6, 27), 5), false);
});

test("shouldRemindToSettle: false when the month isn't ending soon", () => {
  const period = { status: "open", expenses: [{ id: 1 }] };
  assert.strictEqual(shouldRemindToSettle(period, new Date(2026, 6, 10), 5), false);
});
