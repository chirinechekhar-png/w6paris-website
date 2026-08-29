/* W6 PARIS — admin orders page */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const STATUS = {
  nouvelle:    { label: "Nouvelle",          color: "#b3261e" },
  "a-preparer":{ label: "À préparer",        color: "#b08a3e" },
  expediee:    { label: "Expédiée",          color: "#2e7d5b" },
  prete:       { label: "Prête au retrait",  color: "#2e7d5b" },
  retiree:     { label: "Retirée",           color: "#9aa0a6" },
  annulee:     { label: "Annulée",           color: "#9aa0a6" }
};
const STATUS_KEYS = Object.keys(STATUS);

function nextStatus(o) {
  switch (o.status) {
    case "nouvelle":     return "a-preparer";
    case "a-preparer":   return o.fulfillment === "pickup" ? "prete" : "expediee";
    case "expediee":
    case "prete":        return "retiree";
    default:             return null;
  }
}

let ORDERS = [];
let FILTER = "all";

function api(path, opts) {
  return fetch(path, opts).then((r) =>
    r.json().catch(() => ({ error: "network" })).then((d) => ({ ok: r.ok, status: r.status, d }))
  );
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v) {
  return Number(v || 0).toFixed(2).replace(".", ",") + " €";
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function currentStep(status) {
  const i = STATUS_KEYS.indexOf(status);
  return i === -1 ? 0 : i;
}

/* ---------- auth gate ---------- */
async function checkAuth() {
  const r = await api("/api/admin/me");
  if (r.ok && r.d.ok) {
    $("#loginView").style.display = "none";
    $("#dashView").style.display = "";
    loadOrders();
  } else {
    $("#loginView").style.display = "";
    $("#dashView").style.display = "none";
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: $("#loginPass").value })
  });
  if (r.ok && r.d.ok) {
    $("#loginError").style.display = "none";
    $("#loginPass").value = "";
    checkAuth();
  } else {
    $("#loginError").style.display = "";
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.reload();
});

/* ---------- load ---------- */
async function loadStats() {
  const r = await api("/api/admin/stats");
  if (!r.ok || !r.d) return;
  const s = r.d;
  $("#stRevenue").textContent = money(s.revenue);
  $("#stOrders").textContent = s.activeOrders;
  $("#stAvg").textContent = money(s.average);
  $("#stTop").textContent = s.topProducts.length ? s.topProducts[0].name + " (" + s.topProducts[0].qty + ")" : "—";
  $("#statsGrid").style.display = s.activeOrders ? "" : "none";
}

async function loadOrders() {
  const r = await api("/api/admin/orders");
  if (!r.ok) return;
  ORDERS = r.d || [];
  renderFilters();
  render();
  loadStats();
}

function filtered() {
  if (FILTER === "all") return ORDERS;
  if (FILTER === "new") return ORDERS.filter((o) => !o.viewed);
  return ORDERS.filter((o) => o.status === FILTER);
}

/* ---------- filters ---------- */
function renderFilters() {
  const unviewed = ORDERS.filter((o) => !o.viewed).length;
  const counts = {};
  ORDERS.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  const items = [
    { key: "all", label: `Toutes (${ORDERS.length})` },
    { key: "new", label: `Non lues (${unviewed})` },
    ...STATUS_KEYS.map((k) => ({ key: k, label: `${STATUS[k].label} (${counts[k] || 0})` }))
  ];
  $("#filterBar").innerHTML = items.map((it) =>
    `<button type="button" class="filter-chip${FILTER === it.key ? " active" : ""}" data-f="${it.key}">${esc(it.label)}</button>`
  ).join("");
  $$("#filterBar .filter-chip").forEach((b) =>
    b.addEventListener("click", () => { FILTER = b.dataset.f; renderFilters(); render(); })
  );
}

/* ---------- order card ---------- */
function fulfillmentInfo(o) {
  if (o.fulfillment === "pickup" && o.pickup) {
    return `Retrait boutique · ${esc(o.pickup.date)} ${esc(o.pickup.time)}`;
  }
  if (o.address) {
    const method = o.deliveryMethod === "home" ? "Livraison domicile" : "Livraison Point Relais";
    const weight = o.weightKg ? ` · ${String(o.weightKg).replace(".", ",")} kg` : "";
    return `${method}${weight} · ${esc([o.address.line1, o.address.zip, o.address.city, o.address.country].filter(Boolean).join(", "))}`;
  }
  return "—";
}

function orderCard(o) {
  const step = currentStep(o.status);
  const steps = STATUS_KEYS.map((k, i) =>
    `<span class="step${i <= step ? " done" : ""}${k === o.status ? " cur" : ""}" data-status="${k}" title="${STATUS[k].label}">${i + 1}</span>`
  ).join("");

  const items = o.items.map((it) =>
    `<div class="ord-item"><span>${esc(it.name)}${it.options ? " — " + esc(it.options) : ""}</span><span class="ord-qty">×${it.qty}</span><span class="ord-line">${money(it.line)}</span></div>`
  ).join("");

  return `
    <article class="order-card${o.viewed ? "" : " order-new"}">
      <div class="ord-head">
        <div class="ord-id">
          <strong>${esc(o.id)}</strong>
          <span class="ord-date">${fmtDate(o.createdAt)}</span>
          ${o.viewed ? "" : '<span class="ord-new-badge">NOUVEAU</span>'}
        </div>
        <span class="ord-status" style="color:${STATUS[o.status] ? STATUS[o.status].color : "#666"}">${STATUS[o.status] ? STATUS[o.status].label : esc(o.status)}</span>
      </div>

      <div class="ord-body">
        <div class="ord-col">
          <h4>${esc(o.customer.name)}</h4>
          <p>${esc(o.customer.email)}${o.customer.phone ? "<br>" + esc(o.customer.phone) : ""}</p>
          <p class="ord-fulfill">${fulfillmentInfo(o)}</p>
          ${o.tracking ? `<p class="ord-tracking">Tracking : ${esc(o.tracking)}</p>` : ""}
        </div>
        <div class="ord-col ord-items">${items}</div>
        <div class="ord-col ord-total">
          <span>Total</span>
          <strong>${money(o.total)}</strong>
          ${typeof o.shipping === "number" ? `<span class="ord-shipbreak">dont ${money(o.shipping)} port</span>` : ""}
          ${o.promoCode ? `<span class="ord-shipbreak">code ${esc(o.promoCode)} −${money(o.discount || 0)}</span>` : ""}
        </div>
      </div>

      <div class="ord-actions">
        <div class="ord-steps">${steps}</div>
        <div class="ord-btns">
          <button type="button" class="btn" onclick="window.open('/api/admin/orders/${o.id}/invoice')">Facture PDF</button>
          ${STATUS[o.status] && o.status !== "annulee"
            ? `<button type="button" class="btn" onclick="advance('${o.id}')">${nextStatus(o) ? "Passer à : " + STATUS[nextStatus(o)].label : "Clôturer"}</button>`
            : ""}
          ${o.status === "annulee"
            ? `<button type="button" class="btn" onclick="setStatus('${o.id}','nouvelle')">Rouvrir</button>`
            : `<button type="button" class="btn" onclick="setStatus('${o.id}','annulee')">Annuler</button>`}
          <button type="button" class="btn admin-danger-btn" onclick="removeOrder('${o.id}')">Supprimer</button>
        </div>
      </div>
      <details class="ord-tracking-form">
        <summary>Suivi de livraison</summary>
        <div class="ord-tracking-row">
          <input class="admin-input" type="text" id="trk-${o.id}" placeholder="N° de suivi (Mondial Relay…)" value="${esc(o.tracking || "")}">
          <button type="button" class="btn" onclick="setTracking('${o.id}')">Enregistrer</button>
          ${o.tracking ? `<a class="btn" target="_blank" href="https://www.mondialrelay.fr/suivi-de-colis/?NumeroColis=${encodeURIComponent(o.tracking)}">Voir sur Mondial Relay ↗</a>` : ""}
        </div>
      </details>
    </article>`;
}

function render() {
  const list = filtered();
  $("#ordersSub").textContent =
    ORDERS.length === 0 ? "Aucune commande." :
    `${list.length} commande${list.length > 1 ? "s" : ""} affichée${list.length > 1 ? "s" : ""} sur ${ORDERS.length}.`;
  $("#ordersList").innerHTML = list.length
    ? list.map(orderCard).join("")
    : `<p class="admin-empty">Aucune commande dans cette vue.</p>`;
}

/* ---------- actions ---------- */
window.setStatus = async function (id, status) {
  const r = await api("/api/admin/orders/" + encodeURIComponent(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (r.ok) loadOrders();
};

window.advance = async function (id) {
  const o = ORDERS.find((x) => x.id === id);
  const ns = o ? nextStatus(o) : null;
  if (!ns) return;
  await setStatus(id, ns);
};

window.setTracking = async function (id) {
  const val = document.getElementById("trk-" + id).value.trim();
  const r = await api("/api/admin/orders/" + encodeURIComponent(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracking: val })
  });
  if (r.ok) loadOrders();
};

window.removeOrder = async function (id) {
  if (!confirm("Supprimer la commande " + id + " ?")) return;
  const r = await api("/api/admin/orders/" + encodeURIComponent(id), { method: "DELETE" });
  if (r.ok) loadOrders();
};

$("#viewAllBtn").addEventListener("click", async () => {
  await api("/api/admin/orders/view-all", { method: "POST" });
  loadOrders();
});

checkAuth();
