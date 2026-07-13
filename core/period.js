// Pure period/date calculations for Bill Splitter.
// No I/O, no DOM — this is what the tests in /test cover.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many days remain until the end of `now`'s calendar month (the day
 * a monthly period would typically close), counting today as day 0.
 * e.g. on July 27th, July 31st is 4 days away.
 */
function daysUntilPeriodEnd(now) {
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((endOfMonth - startOfToday) / MS_PER_DAY);
}

/**
 * Whether it's time to nudge the household to settle up: the period is
 * still open, has at least one expense to settle, and the month is
 * within `thresholdDays` of ending (default 5).
 */
function shouldRemindToSettle(period, now, thresholdDays = 5) {
  if (period.status !== "open" || period.expenses.length === 0) return false;
  return daysUntilPeriodEnd(now) <= thresholdDays;
}

module.exports = { daysUntilPeriodEnd, shouldRemindToSettle };
