const app = document.getElementById("app");

const PALETTE = ["#6366F1", "#0D8A78", "#D97706", "#DB2777", "#2563EB", "#7C3AED", "#059669", "#B91C1C"];

const STORAGE_HOUSEHOLD_ID = "billsplitter.householdId";
const STORAGE_PERSON_NAME = "billsplitter.personName";

let household = null;
let personName = localStorage.getItem(STORAGE_PERSON_NAME) || "";
let draftExpense = null; // reset each time the add-expense view is entered

function colorFor(name) {
  const members = household ? household.members : [];
  const idx = Math.max(0, members.indexOf(name));
  return PALETTE[idx % PALETTE.length];
}

function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function money(n) {
  const abs = Math.abs(Number(n) || 0);
  return `$${abs.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function saveIdentity(householdId, name) {
  localStorage.setItem(STORAGE_HOUSEHOLD_ID, householdId);
  localStorage.setItem(STORAGE_PERSON_NAME, name);
  personName = name;
}

function clearIdentity() {
  localStorage.removeItem(STORAGE_HOUSEHOLD_ID);
  personName = "";
}

function currentPeriod() {
  return household.periods.find((p) => p.id === household.currentPeriodId);
}

/* ---------------------------------------------------------------------- */
/* Bootstrap + routing                                                    */
/* ---------------------------------------------------------------------- */

function inviteLinkFor(joinCode) {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(joinCode)}`;
}

async function init() {
  // An invite link (?join=CODE) always takes you to the join form
  // prefilled with that code, even if this browser already belongs to
  // another household — following someone's invite is a deliberate choice.
  const inviteCode = new URLSearchParams(location.search).get("join");
  if (inviteCode) return renderAuth({ prefillJoinCode: inviteCode });

  const householdId = localStorage.getItem(STORAGE_HOUSEHOLD_ID);
  if (!householdId || !personName) return renderAuth();

  try {
    household = await api(`/api/households/${householdId}`, { method: "GET" });
  } catch {
    clearIdentity();
    return renderAuth();
  }
  route();
}

window.addEventListener("hashchange", route);

function route() {
  if (!household) return renderAuth();
  const view = location.hash.replace("#", "") || "dashboard";
  if (view === "add-expense") renderAddExpense();
  else if (view === "settle-up") renderSettleUp();
  else if (view === "invite") renderInvite();
  else renderDashboard();
}

async function refreshHousehold() {
  household = await api(`/api/households/${household.id}`, { method: "GET" });
}

/* ---------------------------------------------------------------------- */
/* Auth: create / join a household                                        */
/* ---------------------------------------------------------------------- */

function renderAuth(opts) {
  const prefillJoinCode = opts && opts.prefillJoinCode;
  app.innerHTML = `
    <div class="auth-shell">
      <div class="brand"><div class="brand-mark">&#127811;</div>Bill Splitter</div>

      <div class="auth-tabs">
        <button id="tab-create" class="${prefillJoinCode ? "" : "active"}">Create a household</button>
        <button id="tab-join" class="${prefillJoinCode ? "active" : ""}">Join a household</button>
      </div>

      <div id="auth-panel"></div>
    </div>
  `;

  document.getElementById("tab-create").onclick = () => showCreatePanel();
  document.getElementById("tab-join").onclick = () => showJoinPanel();
  if (prefillJoinCode) showJoinPanel(prefillJoinCode);
  else showCreatePanel();
}

function setActiveTab(tabId) {
  document.getElementById("tab-create").classList.toggle("active", tabId === "tab-create");
  document.getElementById("tab-join").classList.toggle("active", tabId === "tab-join");
}

function showCreatePanel() {
  setActiveTab("tab-create");
  const panel = document.getElementById("auth-panel");
  panel.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="field-label">Household name</label>
        <input type="text" id="household-name" placeholder="e.g. Maple House" />
      </div>
      <div class="field">
        <label class="field-label">Your name</label>
        <input type="text" id="your-name" placeholder="e.g. Alex" value="${escapeHtml(personName)}" />
      </div>
      <div id="auth-error" class="form-error hidden"></div>
      <div class="actions" style="justify-content:stretch">
        <button class="btn btn-primary" id="create-btn" style="width:100%; justify-content:center">Create household</button>
      </div>
    </div>
  `;
  document.getElementById("create-btn").onclick = async () => {
    const name = document.getElementById("household-name").value.trim();
    const creatorName = document.getElementById("your-name").value.trim();
    const errorEl = document.getElementById("auth-error");
    if (!name || !creatorName) {
      errorEl.textContent = "Enter a household name and your name.";
      errorEl.classList.remove("hidden");
      return;
    }
    try {
      household = await api("/api/households", { method: "POST", body: JSON.stringify({ name, creatorName }) });
      saveIdentity(household.id, creatorName);
      showJoinCodePanel();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  };
}

function showJoinPanel(prefillJoinCode) {
  setActiveTab("tab-join");
  const panel = document.getElementById("auth-panel");
  panel.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="field-label">Join code</label>
        <input type="text" id="join-code" placeholder="e.g. 3F9A2B" style="text-transform:uppercase" value="${escapeHtml(prefillJoinCode || "")}" />
      </div>
      <div class="field">
        <label class="field-label">Your name</label>
        <input type="text" id="your-name" placeholder="e.g. Priya" value="${escapeHtml(personName)}" />
      </div>
      <div id="auth-error" class="form-error hidden"></div>
      <div class="actions" style="justify-content:stretch">
        <button class="btn btn-primary" id="join-btn" style="width:100%; justify-content:center">Join household</button>
      </div>
    </div>
  `;
  document.getElementById("join-btn").onclick = async () => {
    const joinCode = document.getElementById("join-code").value.trim();
    const name = document.getElementById("your-name").value.trim();
    const errorEl = document.getElementById("auth-error");
    if (!joinCode || !name) {
      errorEl.textContent = "Enter the join code and your name.";
      errorEl.classList.remove("hidden");
      return;
    }
    try {
      household = await api("/api/households/join", { method: "POST", body: JSON.stringify({ joinCode, name }) });
      saveIdentity(household.id, name);
      history.replaceState(null, "", `${location.pathname}#dashboard`);
      route();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  };
}

function showJoinCodePanel() {
  const panel = document.getElementById("auth-panel");
  const link = inviteLinkFor(household.joinCode);
  panel.innerHTML = `
    <div class="card">
      <div class="card-desc" style="margin-bottom:10px;">Share this code or link with your roommates so they can join <b>${escapeHtml(household.name)}</b>.</div>
      <div class="join-code-display">${escapeHtml(household.joinCode)}</div>
      <div class="field">
        <label class="field-label">Invite link</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="invite-link" readonly value="${escapeHtml(link)}" style="font-size:12.5px;" />
          <button class="btn btn-secondary" id="copy-invite-link" style="flex-shrink:0;">Copy</button>
        </div>
      </div>
      <div class="actions" style="justify-content:stretch">
        <button class="btn btn-primary" id="continue-btn" style="width:100%; justify-content:center">Continue to dashboard</button>
      </div>
    </div>
  `;
  wireCopyInviteLink();
  document.getElementById("continue-btn").onclick = () => {
    location.hash = "dashboard";
    route();
  };
}

function wireCopyInviteLink() {
  const btn = document.getElementById("copy-invite-link");
  const input = document.getElementById("invite-link");
  if (!btn || !input) return;
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  };
}

/* ---------------------------------------------------------------------- */
/* Shared shell (nav)                                                     */
/* ---------------------------------------------------------------------- */

function navHtml(active) {
  const period = currentPeriod();
  const link = (view, label) => `<a data-view="${view}" class="${active === view ? "active" : ""}">${label}</a>`;
  return `
    <div class="topnav">
      <div class="brand"><div class="brand-mark">&#127811;</div>${escapeHtml(household.name)}</div>
      <div class="navlinks">
        ${link("dashboard", "Dashboard")}
        ${link("add-expense", "Add Expense")}
        ${link("settle-up", "Settle Up")}
      </div>
      <div class="navright">
        <div class="period-chip">${escapeHtml(period.label)}</div>
        <button class="btn btn-secondary" id="invite-nav-btn" style="padding:7px 14px; font-size:13px;" data-view="invite">+ Invite</button>
        <select id="acting-as" class="period-chip" title="You're acting as">
          ${household.members.map((m) => `<option value="${escapeHtml(m)}" ${m === personName ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

function wireNav() {
  document.querySelectorAll(".navlinks a").forEach((a) => {
    a.onclick = () => {
      location.hash = a.dataset.view;
      route();
    };
  });
  const inviteBtn = document.getElementById("invite-nav-btn");
  if (inviteBtn) {
    inviteBtn.onclick = () => {
      location.hash = "invite";
      route();
    };
  }
  const actingAs = document.getElementById("acting-as");
  if (actingAs) {
    actingAs.onchange = () => {
      saveIdentity(household.id, actingAs.value);
      route();
    };
  }
}

/* ---------------------------------------------------------------------- */
/* Invite                                                                 */
/* ---------------------------------------------------------------------- */

async function renderInvite() {
  await refreshHousehold();
  const link = inviteLinkFor(household.joinCode);

  app.innerHTML = `
    ${navHtml("invite")}
    <div class="shell">
      <div class="page-head">
        <div>
          <div class="crumb">Dashboard &nbsp;/&nbsp; Invite</div>
          <h1>Invite a roommate</h1>
          <p>Anyone with this code or link can join ${escapeHtml(household.name)} by picking their name.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Join code</h2></div>
        <div class="join-code-display">${escapeHtml(household.joinCode)}</div>

        <div class="field" style="margin-top:18px;">
          <label class="field-label">Invite link</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="invite-link" readonly value="${escapeHtml(link)}" style="font-size:12.5px;" />
            <button class="btn btn-secondary" id="copy-invite-link" style="flex-shrink:0;">Copy</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Current members</h2><span>${household.members.length}</span></div>
        <div class="chip-summary-list">
          ${household.members
            .map(
              (m) => `
            <div class="person-chip-stat">
              <div class="person-avatar" style="background:${colorFor(m)}">${initials(m)}</div>
              <div class="info"><div class="name">${escapeHtml(m)}</div></div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  wireNav();
  wireCopyInviteLink();
}

/* ---------------------------------------------------------------------- */
/* Shared math helpers (client-side preview only — server recomputes      */
/* authoritatively on save)                                               */
/* ---------------------------------------------------------------------- */

function splitEvenCents(totalCents, n) {
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  const shares = Array(n).fill(base);
  for (let i = 0; i < n && remainder > 0; i++, remainder--) shares[i] += 1;
  return shares;
}

function splitProportionalCents(totalCents, weights) {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return splitEvenCents(totalCents, weights.length);
  const raw = weights.map((w) => (w / weightSum) * totalCents);
  const shares = raw.map(Math.floor);
  let remainder = totalCents - shares.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) shares[order[k].i] += 1;
  return shares;
}

function computeItemizedSharesPreview(items, taxTip, members) {
  const subtotalCents = {};
  for (const m of members) subtotalCents[m] = 0;
  for (const item of items) {
    const assignees = item.assignedTo === "everyone" ? members : item.assignedTo;
    if (!assignees || assignees.length === 0 || !item.amount) continue;
    const shares = splitEvenCents(Math.round(item.amount * 100), assignees.length);
    assignees.forEach((name, i) => {
      subtotalCents[name] = (subtotalCents[name] || 0) + shares[i];
    });
  }
  const taxTipCents = Math.round((taxTip || 0) * 100);
  const names = Object.keys(subtotalCents);
  const taxTipShares = splitProportionalCents(taxTipCents, names.map((n) => subtotalCents[n]));
  const owed = {};
  names.forEach((name, i) => {
    owed[name] = (subtotalCents[name] + taxTipShares[i]) / 100;
  });
  return owed;
}

function netDebtsPreview(balances) {
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
    if (amount > 0) payments.push({ from: debtors[i].name, to: creditors[j].name, amount: amount / 100 });
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return payments;
}

/* ---------------------------------------------------------------------- */
/* SVG diagram: who owes whom                                             */
/* ---------------------------------------------------------------------- */

function buildOwesDiagram(payments) {
  if (payments.length === 0) {
    return `<div class="empty-note">Everyone is settled up — no payments needed.</div>`;
  }
  const debtorNames = [...new Set(payments.map((p) => p.from))];
  const creditorNames = [...new Set(payments.map((p) => p.to))];
  const width = 480;
  const height = Math.max(160, Math.max(debtorNames.length, creditorNames.length) * 90 + 40);
  const leftX = 90;
  const rightX = width - 90;
  const yFor = (list, name) => {
    const i = list.indexOf(name);
    const step = height / (list.length + 1);
    return step * (i + 1);
  };

  const debtorTotals = {};
  const creditorTotals = {};
  for (const p of payments) {
    debtorTotals[p.from] = (debtorTotals[p.from] || 0) + p.amount;
    creditorTotals[p.to] = (creditorTotals[p.to] || 0) + p.amount;
  }
  const maxAmount = Math.max(...payments.map((p) => p.amount), 1);

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width:${width}px">`;
  svg += `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--text-tertiary)" /></marker></defs>`;

  payments.forEach((p) => {
    const y1 = yFor(debtorNames, p.from);
    const y2 = yFor(creditorNames, p.to);
    const weight = 1.5 + (p.amount / maxAmount) * 3.5;
    const midX = width / 2;
    const midY = (y1 + y2) / 2;
    svg += `<line x1="${leftX + 24}" y1="${y1}" x2="${rightX - 30}" y2="${y2}" stroke="var(--negative)" stroke-width="${weight}" marker-end="url(#arrow)" opacity="0.55"/>`;
    svg += `<rect x="${midX - 30}" y="${midY - 12}" width="60" height="22" rx="11" class="arrow-amt-bg" stroke="var(--border)"/>`;
    svg += `<text x="${midX}" y="${midY + 4}" class="arrow-amt" fill="var(--negative)">${money(p.amount)}</text>`;
  });

  debtorNames.forEach((name) => {
    const y = yFor(debtorNames, name);
    svg += `<circle cx="${leftX}" cy="${y}" r="26" fill="${colorFor(name)}" />`;
    svg += `<text x="${leftX}" y="${y + 4}" class="node-label">${escapeHtml(name)}</text>`;
    svg += `<text x="${leftX}" y="${y + 44}" class="flow-caption" fill="var(--negative)">pays ${money(debtorTotals[name])}</text>`;
  });
  creditorNames.forEach((name) => {
    const y = yFor(creditorNames, name);
    svg += `<circle cx="${rightX}" cy="${y}" r="26" fill="${colorFor(name)}" />`;
    svg += `<text x="${rightX}" y="${y + 4}" class="node-label">${escapeHtml(name)}</text>`;
    svg += `<text x="${rightX}" y="${y + 44}" class="flow-caption" fill="var(--positive)">receives ${money(creditorTotals[name])}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                               */
/* ---------------------------------------------------------------------- */

async function renderDashboard() {
  await refreshHousehold();
  const period = currentPeriod();
  const balances = household.balances;
  const totalSpent = period.expenses.reduce((sum, e) => sum + expenseTotalClient(e), 0);
  const myBalance = balances[personName] || 0;
  const payments = netDebtsPreview(balances);

  const paidByTotals = {};
  for (const m of household.members) paidByTotals[m] = 0;
  period.expenses.forEach((e) => {
    paidByTotals[e.payer] = (paidByTotals[e.payer] || 0) + expenseTotalClient(e);
  });
  const donut = buildDonut(paidByTotals, totalSpent);

  app.innerHTML = `
    ${navHtml("dashboard")}
    <div class="shell">
      <div class="page-head">
        <div>
          <h1>Good to see you, ${escapeHtml(personName)}</h1>
          <p>Here's how ${escapeHtml(household.name)} is tracking for the ${escapeHtml(period.label)} period.</p>
        </div>
        <button class="btn btn-primary" id="go-settle">Settle Up &nbsp;&rarr;</button>
      </div>

      ${
        household.members.length < 2
          ? `<div class="card lock-card" style="margin-bottom:18px;">
              <div class="lock-icon">&#128101;</div>
              <div>
                <div class="stat-value">It's just you so far</div>
                <div class="stat-sub">Invite a roommate to start splitting expenses &mdash; <a href="#invite" id="dashboard-invite-link" style="text-decoration:underline; font-weight:600;">get your invite link</a>.</div>
              </div>
            </div>`
          : household.settleUpReminder
          ? `<div class="card lock-card" style="margin-bottom:18px; background:var(--negative-bg);">
              <div class="lock-icon" style="background:var(--negative);">&#8987;</div>
              <div>
                <div class="stat-value" style="color:var(--negative);">${household.daysUntilPeriodEnd <= 0 ? "Today's the last day of" : `${household.daysUntilPeriodEnd} day${household.daysUntilPeriodEnd === 1 ? "" : "s"} left in`} ${escapeHtml(period.label)}</div>
                <div class="stat-sub" style="color:var(--negative); opacity:0.85;">${escapeHtml(household.name)} usually settles up around month-end &mdash; <a href="#settle-up" style="text-decoration:underline; font-weight:600; color:inherit;">settle up now</a> before it closes.</div>
              </div>
            </div>`
          : ""
      }

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total spent this period</div>
          <div class="stat-value">${money(totalSpent)}</div>
          <div class="stat-sub">Across ${period.expenses.length} expense${period.expenses.length === 1 ? "" : "s"} &middot; ${household.members.length} members</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Your balance ${myBalance < 0 ? '<span class="pill pill-negative">You owe</span>' : myBalance > 0 ? '<span class="pill pill-positive">You are owed</span>' : ""}</div>
          <div class="stat-value" style="color:${myBalance < 0 ? "var(--negative)" : myBalance > 0 ? "var(--positive)" : "var(--text)"}">${myBalance < 0 ? "&minus;" : ""}${money(myBalance)}</div>
          <div class="stat-sub ${myBalance < 0 ? "negative" : myBalance > 0 ? "positive" : ""}">${myBalance === 0 ? "You're all settled up" : "Settle up to clear this"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Period</div>
          <div class="stat-value">${escapeHtml(period.label)}</div>
          <div class="stat-sub">${period.status === "settling" ? "Settlement in progress" : "Open &mdash; expenses can still be added"}</div>
        </div>
      </div>

      <div class="main-grid">
        <div class="card">
          <div class="card-head"><h2>Spend by who paid</h2><span>${escapeHtml(period.label)}</span></div>
          <div class="card-desc">${money(totalSpent)} total across ${period.expenses.length} expense${period.expenses.length === 1 ? "" : "s"}.</div>
          ${donut}
        </div>
        <div class="card">
          <div class="card-head"><h2>Who owes whom</h2><span>Suggested settle-up</span></div>
          <div class="card-desc">Debts simplified to the fewest payments needed to zero everyone out.</div>
          <div class="diagram-wrap">${buildOwesDiagram(payments)}</div>
        </div>
      </div>

      <div class="section-title"><h2>Expenses this period</h2></div>
      <div class="expense-list">
        ${
          period.expenses.length
            ? period.expenses
                .map(
                  (e) => `
          <div class="expense-row">
            <div class="cat-dot">&#128179;</div>
            <div>
              <div class="expense-desc">${escapeHtml(e.description || "(no description)")}</div>
              <div class="expense-meta">${e.items.length} line item${e.items.length === 1 ? "" : "s"}${e.taxTip ? " + tax/tip" : ""}</div>
            </div>
            <div class="expense-payer">Paid by <b>${escapeHtml(e.payer)}</b></div>
            <div class="expense-amt">${money(expenseTotalClient(e))}</div>
            ${e.createdBy === personName ? `<button class="expense-del" data-id="${e.id}" title="Delete">&#10005;</button>` : "<span></span>"}
          </div>`
                )
                .join("")
            : `<div class="empty-note">No expenses yet this period &mdash; add one to get started.</div>`
        }
      </div>

      <div class="footer-note">${escapeHtml(household.name)} &middot; ${escapeHtml(period.label)} period &middot; expenses lock once settled</div>
    </div>
  `;

  wireNav();
  document.getElementById("go-settle").onclick = () => {
    location.hash = "settle-up";
    route();
  };
  document.querySelectorAll(".expense-del").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/households/${household.id}/expenses/${btn.dataset.id}?actingAs=${encodeURIComponent(personName)}`, { method: "DELETE" });
        renderDashboard();
      } catch (err) {
        alert(err.message);
      }
    };
  });
}

function expenseTotalClient(expense) {
  const itemsTotal = (expense.items || []).reduce((sum, item) => sum + item.amount, 0);
  return Math.round((itemsTotal + (expense.taxTip || 0)) * 100) / 100;
}

function buildDonut(totalsByMember, total) {
  const entries = Object.entries(totalsByMember).filter(([, amount]) => amount > 0);
  if (total <= 0 || entries.length === 0) {
    return `<div class="empty-note">No expenses yet this period.</div>`;
  }
  const circumference = 2 * Math.PI * 70;
  let offset = 0;
  let arcs = "";
  entries.forEach(([name, amount]) => {
    const fraction = amount / total;
    const len = fraction * circumference;
    arcs += `<circle r="70" cx="0" cy="0" fill="none" stroke="${colorFor(name)}" stroke-width="22" stroke-dasharray="${len} ${circumference}" stroke-dashoffset="${-offset}" stroke-linecap="butt" />`;
    offset += len;
  });
  const legend = entries
    .map(
      ([name, amount]) => `
      <div class="legend-row">
        <div class="legend-swatch" style="background:${colorFor(name)}"></div>
        <div class="legend-name">${escapeHtml(name)}</div>
        <div class="legend-amt">${money(amount)}</div>
        <div class="legend-pct">${Math.round((amount / total) * 100)}%</div>
      </div>`
    )
    .join("");
  return `
    <div class="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <g transform="translate(90,90) rotate(-90)">
          <circle r="70" cx="0" cy="0" fill="none" stroke="#F0F1F5" stroke-width="22" />
          ${arcs}
        </g>
        <text x="90" y="86" style="font-size:20px; font-weight:700; fill:var(--text); text-anchor:middle;">${money(total)}</text>
        <text x="90" y="104" style="font-size:11px; fill:var(--text-tertiary); font-weight:600; text-anchor:middle;">TOTAL</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Add expense                                                            */
/* ---------------------------------------------------------------------- */

function newDraft() {
  return {
    description: "",
    payer: personName,
    taxTip: 0,
    items: [{ label: "", amount: "", assignedTo: "everyone" }],
  };
}

async function renderAddExpense() {
  await refreshHousehold();
  if (!draftExpense) draftExpense = newDraft();
  renderAddExpenseView();
}

function renderAddExpenseView() {
  const members = household.members;
  const owed = computeItemizedSharesPreview(
    draftExpense.items.map((i) => ({ ...i, amount: Number(i.amount) || 0 })),
    Number(draftExpense.taxTip) || 0,
    members
  );
  const total = draftExpense.items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) + (Number(draftExpense.taxTip) || 0);

  app.innerHTML = `
    ${navHtml("add-expense")}
    <div class="shell">
      <div class="page-head">
        <div>
          <div class="crumb">Dashboard &nbsp;/&nbsp; New expense</div>
          <h1>Add an expense</h1>
          <p>Break it into line items and assign each one to whoever it belongs to.</p>
        </div>
      </div>

      <div class="layout">
        <div>
          <div class="card">
            <div class="card-head"><h2>Expense details</h2></div>
            <div class="card-desc">The basics &mdash; what it was and who paid.</div>

            <div class="field">
              <label class="field-label">Description</label>
              <input type="text" id="exp-description" value="${escapeHtml(draftExpense.description)}" placeholder="e.g. Costco run" />
            </div>

            <div class="field">
              <label class="field-label">Paid by</label>
              <div class="payer-select">
                ${members
                  .map(
                    (m) => `
                  <div class="payer-chip ${m === draftExpense.payer ? "selected" : ""}" data-payer="${escapeHtml(m)}">
                    <div class="chip-avatar" style="background:${colorFor(m)}">${initials(m)}</div>${escapeHtml(m)}
                  </div>`
                  )
                  .join("")}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Line items</h2><span>${draftExpense.items.length} item${draftExpense.items.length === 1 ? "" : "s"}</span></div>
            <div class="card-desc">Assign each item to one person, a few people, or everyone (shared default).</div>

            ${draftExpense.items
              .map(
                (item, idx) => `
              <div class="item-row">
                <div class="item-desc-input">
                  <input type="text" data-item-idx="${idx}" class="item-label" value="${escapeHtml(item.label)}" placeholder="Item" />
                </div>
                <div class="item-amt-wrap">
                  <span class="prefix">$</span>
                  <input type="number" min="0" step="0.01" data-item-idx="${idx}" class="item-amount" value="${escapeHtml(item.amount)}" placeholder="0.00" />
                </div>
                <div class="assign-group">
                  <span class="assign-everyone ${item.assignedTo === "everyone" ? "on" : ""}" data-item-idx="${idx}" data-action="everyone">&#128101; Everyone</span>
                  ${members
                    .map((m) => {
                      const isOn = item.assignedTo === "everyone" ? false : item.assignedTo.includes(m);
                      return `<div class="assign-pill ${isOn ? "on" : ""}" style="${isOn ? `background:${colorFor(m)}` : ""}" data-item-idx="${idx}" data-member="${escapeHtml(m)}"><span class="dot" style="background:rgba(255,255,255,0.3)">${initials(m)}</span>${escapeHtml(m)}</div>`;
                    })
                    .join("")}
                  ${item.assignedTo !== "everyone" && item.assignedTo.length === 0 ? '<span class="assign-warning">Unassigned</span>' : ""}
                </div>
                <button class="item-remove" data-item-idx="${idx}" title="Remove item">&#10005;</button>
              </div>`
              )
              .join("")}

            <button class="add-item-btn" id="add-item">+ Add line item</button>

            <div class="tax-row">
              <div>
                <div class="label-inline">Tax / tip / delivery fee</div>
                <div class="note">Folded proportionally into each person's item subtotal.</div>
              </div>
              <div class="amount-wrap">
                <span class="prefix">$</span>
                <input type="number" min="0" step="0.01" id="exp-taxtip" value="${escapeHtml(draftExpense.taxTip)}" style="padding-left:24px;" />
              </div>
            </div>
          </div>

          <div id="form-error" class="form-error hidden"></div>

          <div class="actions">
            <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="save-btn">Save expense</button>
          </div>
        </div>

        <div class="summary-sticky">
          <div class="card">
            <div class="card-head"><h2>Per-person subtotal</h2></div>
            <div class="card-desc">Updates live as you edit amounts and assignments.</div>

            <div class="chip-summary-list">
              ${members
                .map(
                  (m) => `
                <div class="person-chip-stat">
                  <div class="person-avatar" style="background:${colorFor(m)}">${initials(m)}</div>
                  <div class="info"><div class="name">${escapeHtml(m)}</div></div>
                  <div class="total">${money(owed[m] || 0)}</div>
                </div>`
                )
                .join("")}
            </div>

            <div class="summary-total-row">
              <div class="label">Total</div>
              <div class="value">${money(total)}</div>
            </div>

            <div class="info-callout">
              ${escapeHtml(draftExpense.payer)} pays the full ${money(total)}. Once saved, everyone else will owe ${escapeHtml(draftExpense.payer)} their share shown above.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  wireNav();
  wireAddExpenseForm();
}

function wireAddExpenseForm() {
  document.getElementById("exp-description").oninput = (e) => {
    draftExpense.description = e.target.value;
  };
  document.getElementById("exp-taxtip").oninput = (e) => {
    draftExpense.taxTip = e.target.value;
    renderAddExpenseView();
  };
  document.querySelectorAll(".payer-chip").forEach((chip) => {
    chip.onclick = () => {
      draftExpense.payer = chip.dataset.payer;
      renderAddExpenseView();
    };
  });
  document.querySelectorAll(".item-label").forEach((input) => {
    input.oninput = (e) => {
      draftExpense.items[Number(e.target.dataset.itemIdx)].label = e.target.value;
    };
  });
  document.querySelectorAll(".item-amount").forEach((input) => {
    input.oninput = (e) => {
      draftExpense.items[Number(e.target.dataset.itemIdx)].amount = e.target.value;
      renderAddExpenseView();
    };
  });
  document.querySelectorAll(".item-remove").forEach((btn) => {
    btn.onclick = () => {
      draftExpense.items.splice(Number(btn.dataset.itemIdx), 1);
      if (draftExpense.items.length === 0) draftExpense.items.push({ label: "", amount: "", assignedTo: "everyone" });
      renderAddExpenseView();
    };
  });
  document.getElementById("add-item").onclick = () => {
    draftExpense.items.push({ label: "", amount: "", assignedTo: "everyone" });
    renderAddExpenseView();
  };
  document.querySelectorAll('.assign-everyone[data-action="everyone"]').forEach((el) => {
    el.onclick = () => {
      draftExpense.items[Number(el.dataset.itemIdx)].assignedTo = "everyone";
      renderAddExpenseView();
    };
  });
  document.querySelectorAll(".assign-pill").forEach((el) => {
    el.onclick = () => {
      const idx = Number(el.dataset.itemIdx);
      const member = el.dataset.member;
      const item = draftExpense.items[idx];
      let arr = item.assignedTo === "everyone" ? [...household.members] : [...item.assignedTo];
      arr = arr.includes(member) ? arr.filter((m) => m !== member) : [...arr, member];
      item.assignedTo = arr;
      renderAddExpenseView();
    };
  });
  document.getElementById("cancel-btn").onclick = () => {
    draftExpense = null;
    location.hash = "dashboard";
    route();
  };
  document.getElementById("save-btn").onclick = saveExpense;
}

async function saveExpense() {
  const errorEl = document.getElementById("form-error");
  const items = draftExpense.items.map((i) => ({ label: i.label.trim(), amount: Number(i.amount), assignedTo: i.assignedTo }));

  if (items.some((i) => !i.label || !i.amount || i.amount <= 0)) {
    errorEl.textContent = "Every line item needs a label and a positive amount.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (items.some((i) => i.assignedTo !== "everyone" && i.assignedTo.length === 0)) {
    errorEl.textContent = "Every line item must be assigned to someone.";
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    await api(`/api/households/${household.id}/expenses`, {
      method: "POST",
      body: JSON.stringify({
        description: draftExpense.description.trim(),
        payer: draftExpense.payer,
        createdBy: personName,
        items,
        taxTip: Number(draftExpense.taxTip) || 0,
      }),
    });
    draftExpense = null;
    location.hash = "dashboard";
    route();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
}

/* ---------------------------------------------------------------------- */
/* Settle up                                                              */
/* ---------------------------------------------------------------------- */

async function renderSettleUp() {
  await refreshHousehold();
  const period = currentPeriod();

  if (!period.settlement) {
    const balances = household.balances;
    const payments = netDebtsPreview(balances);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);

    app.innerHTML = `
      ${navHtml("settle-up")}
      <div class="shell">
        <div class="page-head">
          <div>
            <div class="crumb">Dashboard &nbsp;/&nbsp; Settle up</div>
            <h1>Settle up &mdash; ${escapeHtml(period.label)}</h1>
            <p>Debts simplified down to the fewest payments possible. Once every payment is marked paid, the period locks.</p>
          </div>
        </div>

        ${
          period.expenses.length === 0
            ? `<div class="main-card"><div class="empty-note">No expenses logged yet this period &mdash; nothing to settle.</div></div>`
            : household.members.length < 2
            ? `<div class="main-card"><div class="empty-note">You're the only member of ${escapeHtml(household.name)}, so there's no one to split with yet. <a href="#invite" style="text-decoration:underline; font-weight:600;">Invite a roommate</a> to get started.</div></div>`
            : payments.length === 0
            ? `<div class="main-card"><div class="empty-note">Everyone's already even &mdash; nothing to settle this period.</div></div>`
            : `
        <div class="main-card">
          <div class="main-card-head">
            <div><h2>Preview</h2><p>This is what settling up now would look like.</p></div>
            <div class="count-chip">${payments.length} payment${payments.length === 1 ? "" : "s"} &middot; ${money(total)}</div>
          </div>
          <div class="diagram-wrap">${buildOwesDiagram(payments)}</div>
          <div class="footer-actions">
            <div class="hint">Once you settle up, the period locks and these payments become official.</div>
            <button class="btn btn-primary" id="settle-btn">Settle Up</button>
          </div>
        </div>`
        }
      </div>
    `;

    wireNav();
    const settleBtn = document.getElementById("settle-btn");
    if (settleBtn) {
      settleBtn.onclick = async () => {
        try {
          await api(`/api/households/${household.id}/settle`, { method: "POST" });
          renderSettleUp();
        } catch (err) {
          alert(err.message);
        }
      };
    }
    return;
  }

  const payments = period.settlement.payments;
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const confirmedCount = payments.filter((p) => p.paid).length;
  const unconfirmedNames = [...new Set(payments.filter((p) => !p.paid).map((p) => p.from))];

  app.innerHTML = `
    ${navHtml("settle-up")}
    <div class="shell">
      <div class="page-head">
        <div>
          <div class="crumb">Dashboard &nbsp;/&nbsp; Settle up</div>
          <h1>Settle up &mdash; ${escapeHtml(period.label)}</h1>
          <p>Debts simplified down to the fewest payments possible. Once every payment is marked paid, the period locks.</p>
        </div>
      </div>

      <div class="stat-strip">
        <div class="stat-card">
          <div class="stat-label">Total to settle</div>
          <div class="stat-value">${money(total)}</div>
          <div class="stat-sub">Across ${payments.length} simplified payment${payments.length === 1 ? "" : "s"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Payments confirmed</div>
          <div class="stat-value">${confirmedCount} of ${payments.length}</div>
          <div class="stat-sub">${unconfirmedNames.length ? `Waiting on ${unconfirmedNames.map(escapeHtml).join(", ")}` : "All confirmed"}</div>
        </div>
        <div class="stat-card lock-card">
          <div class="lock-icon">&#128274;</div>
          <div>
            <div class="stat-value">Period will close once settled</div>
            <div class="stat-sub">${escapeHtml(period.label)} locks and a new period begins</div>
          </div>
        </div>
      </div>

      <div class="main-card">
        <div class="main-card-head">
          <div><h2>Minimum payment plan</h2><p>Debts simplified to the fewest payments needed to zero everyone out.</p></div>
        </div>

        <div class="diagram-wrap">${buildOwesDiagram(payments.map((p) => ({ from: p.from, to: p.to, amount: p.amount })))}</div>

        <div class="payment-list">
          ${payments
            .map(
              (p, idx) => `
            <div class="payment-row">
              <div class="pair-avatars">
                <div class="a1" style="background:${colorFor(p.from)}">${initials(p.from)}</div>
                <span class="pair-arrow">&rarr;</span>
                <div class="a2" style="background:${colorFor(p.to)}">${initials(p.to)}</div>
              </div>
              <div class="payment-info">
                <div class="line"><b>${escapeHtml(p.from)}</b> pays <b>${escapeHtml(p.to)}</b></div>
              </div>
              <div class="payment-amt">${money(p.amount)}</div>
              ${p.paid ? `<button class="btn btn-done" disabled>&#10003; Paid</button>` : `<button class="btn btn-outline" data-payment-idx="${idx}">Mark as paid</button>`}
            </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="footer-note">Once all ${payments.length} payment${payments.length === 1 ? "" : "s"} are confirmed, ${escapeHtml(period.label)} locks permanently and a new period starts at $0.</div>
    </div>
  `;

  wireNav();
  document.querySelectorAll("[data-payment-idx]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/households/${household.id}/settle/pay`, {
          method: "POST",
          body: JSON.stringify({ paymentIndex: Number(btn.dataset.paymentIdx) }),
        });
        renderSettleUp();
      } catch (err) {
        alert(err.message);
      }
    };
  });
}

init();
