const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { computePeriodBalances, expenseTotal, netDebts } = require("./core/split");
const { daysUntilPeriodEnd, shouldRemindToSettle } = require("./core/period");

const DATA_FILE = path.join(__dirname, "data", "households.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { households: {} };
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function newJoinCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function currentPeriodLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// The active period is the most recent one, unless it's already settled —
// in which case a fresh open period is created. A period stays "active"
// (and keeps its expenses/settlement visible) through "open" and
// "settling", so starting a settlement doesn't get mistaken for there
// being no current period.
function activePeriod(household) {
  let period = household.periods[household.periods.length - 1];
  if (!period || period.status === "settled") {
    period = { id: newId(), label: currentPeriodLabel(), status: "open", expenses: [], settlement: null };
    household.periods.push(period);
  }
  return period;
}

function householdView(household) {
  const period = activePeriod(household);
  const balances = computePeriodBalances(household.members, period.expenses);
  const now = new Date();
  return {
    ...household,
    balances,
    currentPeriodId: period.id,
    daysUntilPeriodEnd: daysUntilPeriodEnd(now),
    settleUpReminder: shouldRemindToSettle(period, now),
  };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function serveStatic(req, res) {
  const pathOnly = req.url.split("?")[0];
  const urlPath = pathOnly === "/" ? "/index.html" : pathOnly;
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: "forbidden" });
  fs.readFile(filePath, (err, content) => {
    if (err) return sendJSON(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(content);
  });
}

function findHousehold(data, id) {
  return data.households[id];
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parts = url.split("?")[0].split("/").filter(Boolean);

  if (url === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // POST /api/households  { name, creatorName }
    if (url === "/api/households" && method === "POST") {
      const { name, creatorName } = await readBody(req);
      if (!name || !name.trim() || !creatorName || !creatorName.trim()) {
        return sendJSON(res, 400, { error: "name and creatorName are required" });
      }
      const data = loadData();
      const household = {
        id: newId(),
        name: name.trim(),
        joinCode: newJoinCode(),
        members: [creatorName.trim()],
        periods: [],
      };
      activePeriod(household);
      data.households[household.id] = household;
      saveData(data);
      return sendJSON(res, 201, householdView(household));
    }

    // POST /api/households/join  { joinCode, name }
    if (url === "/api/households/join" && method === "POST") {
      const { joinCode, name } = await readBody(req);
      if (!joinCode || !name || !name.trim()) {
        return sendJSON(res, 400, { error: "joinCode and name are required" });
      }
      const data = loadData();
      const household = Object.values(data.households).find(
        (h) => h.joinCode === joinCode.trim().toUpperCase()
      );
      if (!household) return sendJSON(res, 404, { error: "no household with that join code" });
      if (!household.members.includes(name.trim())) household.members.push(name.trim());
      saveData(data);
      return sendJSON(res, 200, householdView(household));
    }

    // GET /api/households/:id
    if (parts[0] === "api" && parts[1] === "households" && parts.length === 3 && method === "GET") {
      const data = loadData();
      const household = findHousehold(data, parts[2]);
      if (!household) return sendJSON(res, 404, { error: "household not found" });
      const view = householdView(household);
      if (view.settleUpReminder) {
        const label = activePeriod(household).label;
        console.log(`[reminder] ${household.name}: ${view.daysUntilPeriodEnd} day(s) left in ${label} — settle up soon`);
      }
      return sendJSON(res, 200, view);
    }

    // POST /api/households/:id/expenses  { description, payer, createdBy, items, taxTip }
    if (parts[0] === "api" && parts[1] === "households" && parts[3] === "expenses" && parts.length === 4 && method === "POST") {
      const data = loadData();
      const household = findHousehold(data, parts[2]);
      if (!household) return sendJSON(res, 404, { error: "household not found" });
      const { description, payer, createdBy, items, taxTip } = await readBody(req);
      if (!payer || !createdBy || !Array.isArray(items) || items.length === 0) {
        return sendJSON(res, 400, { error: "payer, createdBy and at least one item are required" });
      }
      for (const item of items) {
        if (!item.label || typeof item.amount !== "number" || item.amount <= 0) {
          return sendJSON(res, 400, { error: "each item needs a label and a positive amount" });
        }
        if (item.assignedTo !== "everyone" && (!Array.isArray(item.assignedTo) || item.assignedTo.length === 0)) {
          return sendJSON(res, 400, { error: "each item must be assigned to 'everyone' or a non-empty list of people" });
        }
      }
      const period = activePeriod(household);
      if (period.status !== "open") {
        return sendJSON(res, 400, { error: "this period is being settled — wait for it to close before adding new expenses" });
      }
      const expense = {
        id: newId(),
        description: description || "",
        payer,
        createdBy,
        items,
        taxTip: Number(taxTip) || 0,
      };
      period.expenses.push(expense);
      saveData(data);
      return sendJSON(res, 201, householdView(household));
    }

    // DELETE /api/households/:id/expenses/:expenseId?actingAs=Name
    if (parts[0] === "api" && parts[1] === "households" && parts[3] === "expenses" && parts.length === 5 && method === "DELETE") {
      const data = loadData();
      const household = findHousehold(data, parts[2]);
      if (!household) return sendJSON(res, 404, { error: "household not found" });
      const actingAs = new URL(url, "http://localhost").searchParams.get("actingAs");
      const period = activePeriod(household);
      if (period.status !== "open") {
        return sendJSON(res, 400, { error: "this period is being settled and its expenses are locked" });
      }
      const expense = period.expenses.find((e) => e.id === parts[4]);
      if (!expense) return sendJSON(res, 404, { error: "expense not found in the open period" });
      if (expense.createdBy !== actingAs) {
        return sendJSON(res, 403, { error: "only the person who added an expense can delete it" });
      }
      period.expenses = period.expenses.filter((e) => e.id !== expense.id);
      saveData(data);
      return sendJSON(res, 200, householdView(household));
    }

    // POST /api/households/:id/settle
    if (parts[0] === "api" && parts[1] === "households" && parts[3] === "settle" && parts.length === 4 && method === "POST") {
      const data = loadData();
      const household = findHousehold(data, parts[2]);
      if (!household) return sendJSON(res, 404, { error: "household not found" });
      const period = activePeriod(household);
      if (period.settlement) return sendJSON(res, 200, householdView(household));
      if (period.expenses.length === 0) {
        return sendJSON(res, 400, { error: "nothing to settle yet — add an expense first" });
      }
      const balances = computePeriodBalances(household.members, period.expenses);
      const payments = netDebts(balances).map((p) => ({ ...p, paid: false }));
      period.settlement = { payments, settledAt: null };
      period.status = "settling";
      saveData(data);
      return sendJSON(res, 200, householdView(household));
    }

    // POST /api/households/:id/settle/pay  { paymentIndex }
    if (parts[0] === "api" && parts[1] === "households" && parts[3] === "settle" && parts[4] === "pay" && parts.length === 5 && method === "POST") {
      const data = loadData();
      const household = findHousehold(data, parts[2]);
      if (!household) return sendJSON(res, 404, { error: "household not found" });
      const period = household.periods.find((p) => p.status === "settling");
      if (!period || !period.settlement) return sendJSON(res, 400, { error: "no settlement in progress" });
      const { paymentIndex } = await readBody(req);
      const payment = period.settlement.payments[paymentIndex];
      if (!payment) return sendJSON(res, 404, { error: "payment not found" });
      payment.paid = true;
      if (period.settlement.payments.every((p) => p.paid)) {
        period.status = "settled";
        period.settlement.settledAt = new Date().toISOString();
        activePeriod(household);
      }
      saveData(data);
      return sendJSON(res, 200, householdView(household));
    }

    if (url.startsWith("/api/")) return sendJSON(res, 404, { error: "unknown endpoint" });

    return serveStatic(req, res);
  } catch (err) {
    return sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Bill Splitter running at http://localhost:${PORT}`);
});
