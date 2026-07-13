// Standalone reminder check, meant to be run on a schedule (e.g. Windows
// Task Scheduler) independently of the app server. Reads data/households.json
// directly and prints one line per household that should settle up soon.
// Prints nothing and exits 0 if there's nothing to report.

const fs = require("fs");
const path = require("path");
const { shouldRemindToSettle, daysUntilPeriodEnd } = require("../core/period");

const DATA_FILE = path.join(__dirname, "..", "data", "households.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { households: {} };
  }
}

function main() {
  const data = loadData();
  const now = new Date();
  const lines = [];

  for (const household of Object.values(data.households)) {
    const period = household.periods[household.periods.length - 1];
    if (!period) continue;
    if (shouldRemindToSettle(period, now)) {
      const days = daysUntilPeriodEnd(now);
      lines.push(`${household.name}: ${days} day${days === 1 ? "" : "s"} left in ${period.label} — settle up soon`);
    }
  }

  lines.forEach((line) => console.log(line));
}

main();
