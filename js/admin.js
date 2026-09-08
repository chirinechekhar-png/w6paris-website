/* W6 PARIS — admin dashboard logic (v2: variant stock + product CRUD) */

const $ = (s) => document.querySelector(s);

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

function nameOf(p) {
  return (p.name && (p.name.fr || p.name.en)) || p.handle;
}

function typeLabel(t) {
  return { diffuser: "Diffuseur", oil: "Fragrance", bundle: "Pack" }[t] || t;
}

function priceLabel(p) {
  if (p.type === "oil") return "dès 18,00 €";
  if (p.compareAt) return p.price.toFixed(2).replace(".", ",") + " €";
  return p.price.toFixed(2).replace(".", ",") + " €";
}

function isObjectStock(s) {
  return s && typeof s === "object";
}

/* ---------- auth gate ---------- */
function updateOrdersBadge(n) {
  const el = $("#ordersBadge");
  if (!el) return;
  el.style.display = n > 0 ? "inline-flex" : "none";
  el.textContent = n;
}

async function refreshOrdersBadge() {
  const r = await api("/api/admin/orders/count");
  if (r.ok && r.d) updateOrdersBadge(r.d.unviewed || 0);
}

async function checkAuth() {
  const r = await api("/api/admin/me");
  if (r.ok && r.d.ok) {
    $("#loginView").style.display = "none";
    $("#dashView").style.display = "";
    loadProducts();
    loadPromos();
    loadShippingConfig();
    loadStats();
    loadMessages();
    loadNewsletter();
    refreshOrdersBadge();
    setInterval(refreshOrdersBadge, 30000);
  } else {
    $("#loginView").style.display = "";
    $("#dashView").style.display = "none";
  }
}

async function loadStats() {
  const r = await api("/api/admin/stats");
  if (!r.ok) return;
  const d = r.d;
  $("#statRevenue").textContent = d.revenue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  $("#statOrders").textContent = d.activeOrders + " (" + d.totalOrders + ")";
  $("#statAverage").textContent = d.average.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  $("#statCustomers").textContent = d.customerAccounts;
  $("#statTopProducts").innerHTML = d.topProducts.length
    ? d.topProducts.map((p) => `<div class="admin-stat-row"><span>${esc(p.name)}</span><span class="admin-stat-qty">${p.qty} vendus</span></div>`).join("")
    : '<p class="admin-stat-empty">Aucune vente</p>';
  $("#statTopCustomers").innerHTML = d.topCustomers.length
    ? d.topCustomers.map((c) => `<div class="admin-stat-row"><span>${esc(c.name)} · ${esc(c.email)}</span><span class="admin-stat-qty">${c.orders} cmd · ${c.spent.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span></div>`).join("")
    : '<p class="admin-stat-empty">Aucun client</p>';
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

/* ---------- product list ---------- */
let products = {};

async function loadProducts() {
  const r = await api("/api/admin/products");
  products = r.ok ? r.d : {};
  renderTable();
}

function stockEditorHtml(p) {
  const key = isObjectStock(p.stock) ? Object.keys(p.stock) : [];
  if (key.length === 0) {
    return `
      <div class="admin-qty">
        <input class="admin-qty-input" type="number" min="0" max="9999" step="1" value="${esc(p.stock || 0)}" data-stock-key="__single">
        <span class="admin-status ${p.stock > 0 ? "admin-status-ok" : "admin-status-out"}">${p.stock > 0 ? "En stock" : "Rupture"}</span>
      </div>`;
  }
  return `
    <div class="admin-qty admin-qty-col">
      ${key.map((k) => `
        <label class="admin-qty-item">
          <span>${esc(k)}</span>
          <input class="admin-qty-input" type="number" min="0" max="9999" step="1" value="${esc(p.stock[k] || 0)}" data-stock-key="${esc(k)}">
          ${p.stock[k] > 0 ? "" : '<span class="admin-status admin-status-out">Rupture</span>'}
        </label>`).join("")}
    </div>`;
}

function renderTable() {
  const wrap = $("#adminRows");
  wrap.innerHTML = Object.values(products).map((p) => `
    <div class="admin-row" data-handle="${esc(p.handle)}">
      <div class="admin-prod">
        <img src="${esc(p.images && p.images[0])}" alt="" loading="lazy">
        <div>
          <strong>${esc(nameOf(p))}</strong>
          <span class="admin-handle">${esc(p.handle)}</span>
        </div>
      </div>
      <div class="admin-cat">${esc(typeLabel(p.type))}</div>
      <div class="admin-price">${esc(priceLabel(p))}</div>
      ${stockEditorHtml(p)}
      <div class="admin-actions">
        <button class="admin-link-btn save-row" type="button">Enregistrer</button>
        <button class="admin-link-btn edit-row" type="button">Modifier</button>
        <button class="admin-link-btn del-row" type="button">Supprimer</button>
      </div>
    </div>`).join("");

  wrap.querySelectorAll(".save-row").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".admin-row");
      const handle = row.dataset.handle;
      const p = products[handle];
      const inputs = row.querySelectorAll("[data-stock-key]");
      const parsed = {};
      let single = null;
      let ok = true;
      inputs.forEach((inp) => {
        const v = parseInt(inp.value, 10);
        if (!Number.isInteger(v) || v < 0) { ok = false; return; }
        if (inp.dataset.stockKey === "__single") single = v;
        else parsed[inp.dataset.stockKey] = v;
      });
      if (!ok) { setStatus("Valeur invalide : quantité entière ≥ 0.", true); return; }
      const stock = single !== null ? single : parsed;
      btn.disabled = true;
      btn.textContent = "…";
      const r = await api("/api/admin/products/" + encodeURIComponent(handle), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: { handle, stock } })
      });
      btn.disabled = false;
      btn.textContent = "Enregistrer";
      if (r.ok) {
        products[handle].stock = stock;
        setStatus("Stock mis à jour : " + nameOf(products[handle]));
        renderTable();
      } else {
        setStatus("Erreur : " + (r.d.error || "inconnue"), true);
      }
    });
  });

  wrap.querySelectorAll(".edit-row").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.closest(".admin-row").dataset.handle));
  });

  wrap.querySelectorAll(".del-row").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const handle = btn.closest(".admin-row").dataset.handle;
      if (!confirm("Supprimer « " + nameOf(products[handle]) + " » ?")) return;
      const r = await api("/api/admin/products/" + encodeURIComponent(handle), { method: "DELETE" });
      if (r.ok) {
        delete products[handle];
        setStatus("Produit supprimé.");
        renderTable();
      } else {
        setStatus("Erreur lors de la suppression.", true);
      }
    });
  });
}

/* ---------- modal ---------- */
let editingHandle = null;
let imageList = [];

async function loadImages() {
  const r = await api("/api/admin/images");
  imageList = r.ok ? r.d : [];
  const sel = $("#pfImage");
  sel.innerHTML = '<option value="">— Choisir une image —</option>' +
    imageList.map((f) => '<option value="images/' + esc(f) + '">' + esc(f) + "</option>").join("");
}

function stockKeysFor(type, existing) {
  if (existing && isObjectStock(existing.stock)) return Object.keys(existing.stock);
  if (type === "diffuser") return ["Noir", "Gris"];
  if (type === "oil") return ["10 ml", "100 ml"];
  return [];
}

function renderModalStock() {
  const type = $("#pfType").value;
  const existing = editingHandle ? products[editingHandle] : null;
  const keys = stockKeysFor(type, existing);
  const wrap = $("#pfStockWrap");
  if (keys.length === 0) {
    const val = existing && !isObjectStock(existing.stock) ? existing.stock : 0;
    wrap.innerHTML = '<label>Quantité en stock</label>' +
      '<input class="admin-input" type="number" id="pfStockSingle" min="0" max="9999" step="1" value="' + esc(val) + '">';
  } else {
    wrap.innerHTML = "<label>Stock</label>" + keys.map((k) => `
      <div class="admin-qty admin-qty-item">
        <span>${esc(k)}</span>
        <input class="admin-input" type="number" id="pfStockKey" min="0" max="9999" step="1" value="${esc(existing && isObjectStock(existing.stock) ? existing.stock[k] || 0 : 0)}" data-modal-key="${esc(k)}">
      </div>`).join("");
  }
}

function openModal(handle) {
  editingHandle = handle || null;
  const existing = handle ? products[handle] : null;
  $("#modalTitle").textContent = existing ? "Modifier le produit" : "Ajouter un produit";
  $("#pfNameFr").value = existing ? (existing.name.fr || "") : "";
  $("#pfNameEn").value = existing ? (existing.name.en || "") : "";
  $("#pfType").value = existing ? existing.type : "diffuser";
  $("#pfPrice").value = existing ? existing.price : "";
  $("#pfCompare").value = existing && existing.compareAt ? existing.compareAt : "";
  $("#pfWeight").value = existing && typeof existing.weightKg === "number" ? existing.weightKg : "";
  $("#pfDescFr").value = existing ? (existing.desc.fr || "") : "";
  $("#pfDescEn").value = existing ? (existing.desc.en || "") : "";
  $("#pfImage").value = existing && existing.images && existing.images[0] ? existing.images[0] : "";
  $("#pfError").style.display = "none";
  renderModalStock();
  $("#productModal").style.display = "";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  editingHandle = null;
  $("#productModal").style.display = "none";
  document.body.style.overflow = "";
}

function readStockFromModal() {
  const type = $("#pfType").value;
  const existing = editingHandle ? products[editingHandle] : null;
  const keys = stockKeysFor(type, existing);
  if (keys.length === 0) {
    const v = parseInt($("#pfStockSingle").value || "0", 10);
    if (!Number.isInteger(v) || v < 0) return { error: "Quantité invalide." };
    return { stock: v };
  }
  const stock = {};
  document.querySelectorAll("[data-modal-key]").forEach((inp) => {
    const v = parseInt(inp.value || "0", 10);
    if (!Number.isInteger(v) || v < 0) return;
    stock[inp.dataset.modalKey] = v;
  });
  return { stock };
}

function buildProductFromModal() {
  const nameFr = $("#pfNameFr").value.trim();
  const nameEn = $("#pfNameEn").value.trim() || nameFr;
  const type = $("#pfType").value;
  const price = parseFloat($("#pfPrice").value);
  if (!nameFr) return { error: "Le nom (français) est requis." };
  if (!Number.isFinite(price) || price < 0) return { error: "Prix invalide." };
  const img = $("#pfImage").value || "images/hero.jpg";
  const descFr = $("#pfDescFr").value.trim() || (nameFr + " — W6 Paris.");
  const descEn = $("#pfDescEn").value.trim() || descFr;
  const { stock, error } = readStockFromModal();
  if (error) return { error };

  const base = {
    name: { fr: nameFr, en: nameEn },
    type,
    price,
    compareAt: $("#pfCompare").value ? parseFloat($("#pfCompare").value) : null,
    weightKg: $("#pfWeight").value ? parseFloat($("#pfWeight").value) : undefined,
    images: [img],
    desc: { fr: descFr, en: descEn },
    tagline: { fr: "", en: "" },
    features: [],
    notes: null,
    art: type === "oil" ? "p-ambre" : null,
    stock
  };

  if (type === "diffuser") {
    base.family = { fr: "Diffuseur", en: "Diffuser" };
    base.freeGift = { fr: "Un parfum offert au choix avec votre diffuseur", en: "One fragrance of your choice, free with your diffuser" };
    base.options = [
      { key: "color", name: { fr: "Couleur", en: "Colour" }, values: [{ label: "Noir", price: 0 }, { label: "Gris", price: 0 }] },
      { key: "fragrance", name: { fr: "Senteur offerte", en: "Free fragrance" }, free: true,
        values: ["Ambre Divine", "Ébène", "Ispahan", "Secret Garden", "Midnight", "Un Jardin à Rio", "Rosewood"].map((l) => ({ label: l })) }
    ];
  } else if (type === "oil") {
    base.family = { fr: "Fragrance", en: "Fragrance" };
    base.freeGift = null;
    base.options = [
      { key: "size", name: { fr: "Format", en: "Size" }, values: [{ label: "10 ml", price: 18 }, { label: "100 ml", price: 40 }] }
    ];
  } else {
    base.family = { fr: "Pack", en: "Pack" };
    base.freeGift = null;
    base.options = [{ key: "color", name: { fr: "Couleur des diffuseurs", en: "Diffuser colour" }, values: [{ label: "Noir", price: 0 }, { label: "Gris", price: 0 }] }];
  }
  return { product: base };
}

$("#addProductBtn").addEventListener("click", () => openModal(null));

$("#modalClose").addEventListener("click", closeModal);
$("#modalCancel").addEventListener("click", closeModal);
$("#productModal").addEventListener("click", (e) => { if (e.target.id === "productModal") closeModal(); });

$("#pfType").addEventListener("change", renderModalStock);

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#pfError");
  err.style.display = "none";
  const built = buildProductFromModal();
  if (built.error) { err.textContent = built.error; err.style.display = ""; return; }

  let r;
  if (editingHandle) {
    const keep = products[editingHandle];
    const product = { ...built.product, handle: editingHandle, images: built.product.images || keep.images };
    r = await api("/api/admin/products/" + encodeURIComponent(editingHandle), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product })
    });
  } else {
    r = await api("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: built.product })
    });
  }

  if (r.ok) {
    closeModal();
    setStatus(editingHandle ? "Produit modifié." : "Produit ajouté.");
    loadProducts();
  } else {
    err.textContent = r.status === 409 ? "Ce nom existe déjà." : (r.d.error || "Erreur lors de l'enregistrement.");
    err.style.display = "";
  }
});

/* ---------- status bar ---------- */
let statusTimer;
function setStatus(msg, isError) {
  const el = $("#saveStatus");
  el.textContent = msg;
  el.style.display = "";
  el.style.background = isError ? "#b3564a" : "#e9f2ea";
  el.style.color = isError ? "#fff" : "#3c5a41";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.style.display = "none"; }, 4000);
}

/* ---------- password ---------- */
$("#passForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#passError");
  const ok = $("#passOk");
  err.style.display = "none";
  ok.style.display = "none";
  const r = await api("/api/admin/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current: $("#curPass").value, next: $("#newPass").value })
  });
  if (r.ok && r.d.ok) {
    $("#curPass").value = "";
    $("#newPass").value = "";
    ok.style.display = "";
  } else {
    err.textContent = r.status === 401 ? "Mot de passe actuel incorrect." : (r.d.error || "Erreur.");
    err.style.display = "";
  }
});

checkAuth();
loadImages();

/* ---------- promo codes ---------- */
let PROMOS = [];

function fmtExpiry(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR");
}

function renderPromos() {
  const list = $("#promoList");
  if (!list) return;
  list.innerHTML = PROMOS.length
    ? PROMOS.map((p) => `
        <div class="promo-row${p.disabled ? " promo-off" : ""}">
          <strong>${esc(p.code)}</strong>
          <span>${p.type === "percent" ? p.value + "%" : p.value.toFixed(2).replace(".", ",") + " €"}</span>
          ${p.minSubtotal ? `<span>min ${p.minSubtotal.toFixed(2).replace(".", ",")} €</span>` : ""}
          ${p.maxUses ? `<span>${p.uses}/${p.maxUses}</span>` : `<span>${p.uses}×</span>`}
          <span>exp ${fmtExpiry(p.expiresAt)}</span>
          <button type="button" class="admin-link-btn promo-del" data-code="${esc(p.code)}">Supprimer</button>
        </div>`).join("")
    : '<p class="admin-empty" style="font-size:13px;">Aucun code promo.</p>';
  list.querySelectorAll(".promo-del").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const r = await api("/api/admin/promos/" + encodeURIComponent(btn.dataset.code), { method: "DELETE" });
      if (r.ok) { setStatus("Code supprimé : " + btn.dataset.code); loadPromos(); }
    })
  );
}

async function loadPromos() {
  const r = await api("/api/admin/promos");
  if (r.ok) { PROMOS = r.d || []; renderPromos(); }
}

$("#promoAddBtn").addEventListener("click", async () => {
  const err = $("#promoError");
  err.style.display = "none";
  const promo = {
    code: $("#promoCode").value,
    type: $("#promoType").value,
    value: parseFloat($("#promoValue").value),
    minSubtotal: parseFloat($("#promoMin").value) || 0,
    maxUses: parseInt($("#promoMax").value, 10) || null,
    expiresAt: $("#promoExpiry").value || null
  };
  if (!promo.code) { err.textContent = "Code requis."; err.style.display = ""; return; }
  const r = await api("/api/admin/promos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promo })
  });
  if (r.ok) {
    $("#promoCode").value = "";
    $("#promoValue").value = "";
    $("#promoMin").value = "";
    $("#promoMax").value = "";
    $("#promoExpiry").value = "";
    setStatus("Code ajouté.");
    loadPromos();
  } else {
    err.textContent = r.d.error || "Erreur.";
    err.style.display = "";
  }
});

/* ---------- shipping editor ---------- */
let shipConfig = null;
let shipZone = "fr";

const SHIP_COUNTRIES = [
  ["fr", "France"], ["de", "Allemagne"], ["be", "Belgique / Luxembourg"], ["lu", "Luxembourg"],
  ["nl", "Pays-Bas"], ["es", "Espagne / Portugal / Italie"], ["pt", "Portugal"], ["it", "Italie"],
  ["pl", "Pologne"], ["eu", "Autres UE"]
];
const SHIP_TYPES = [
  ["diffuser", "Diffuseurs"], ["bundle", "Packs"], ["oil", "Fragrances"]
];

function freeRuleHtml(cc, types) {
  return `
    <div class="ship-free-rule">
      <select class="admin-input ship-free-country">${SHIP_COUNTRIES.map(([c, l]) => `<option value="${c}"${c === cc ? " selected" : ""}>${l}</option>`).join("")}</select>
      ${SHIP_TYPES.map(([t, l]) => `<label class="ship-free-type"><input type="checkbox" value="${t}"${(types || []).includes(t) ? " checked" : ""}> ${l}</label>`).join("")}
      <button type="button" class="admin-link-btn ship-free-del" title="Retirer">&times;</button>
    </div>`;
}

function renderShipFreeRules() {
  const rules = shipConfig.freeByCountry || { fr: ["diffuser", "bundle"] };
  const html = Object.entries(rules)
    .map(([cc, types]) => freeRuleHtml(cc, types))
    .join("");
  $("#shipFreeRules").innerHTML = html || '<p class="admin-empty" style="font-size:12px;">Aucun pays — aucun port offert par type.</p>';
}

function collectFreeRules() {
  const rules = {};
  document.querySelectorAll("#shipFreeRules .ship-free-rule").forEach((row) => {
    const cc = row.querySelector(".ship-free-country").value;
    const types = [...row.querySelectorAll("input:checked")].map((cb) => cb.value);
    if (cc && types.length) rules[cc] = types;
  });
  return rules;
}

function tierRowHtml(t, kind) {
  return `
    <div class="ship-tier-row" data-kind="${kind}">
      <input class="admin-input" type="number" step="0.01" min="0" value="${esc(t.maxKg)}" data-ship-field="maxKg" placeholder="kg max">
      <input class="admin-input" type="number" step="0.01" min="0" value="${esc(t.price)}" data-ship-field="price" placeholder="€">
      <button type="button" class="admin-link-btn ship-tier-del" title="Supprimer">&times;</button>
    </div>`;
}

function renderShipTiers() {
  const z = shipConfig.zones[shipZone] || { relay: [], home: [], label: shipZone };
  $("#shipRelayTiers").innerHTML = (z.relay || []).map((t) => tierRowHtml(t, "relay")).join("");
  $("#shipHomeTiers").innerHTML = (z.home || []).map((t) => tierRowHtml(t, "home")).join("");
}

function renderShipZoneSelect() {
  const sel = $("#shipZoneSel");
  sel.innerHTML = Object.keys(shipConfig.zones || {}).map((z) => {
    const label = (shipConfig.zones[z].label || z) + " (" + z + ")";
    return `<option value="${esc(z)}"${z === shipZone ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
}

function collectShipTiers(kind) {
  return [...document.querySelectorAll("#ship" + kind[0].toUpperCase() + kind.slice(1) + "Tiers .ship-tier-row")].map((row) => {
    const maxKg = parseFloat(row.querySelector('[data-ship-field="maxKg"]').value);
    const price = parseFloat(row.querySelector('[data-ship-field="price"]').value);
    if (!Number.isFinite(maxKg) || !Number.isFinite(price) || price < 0) return null;
    return { maxKg, price };
  }).filter(Boolean);
}

async function loadShippingConfig() {
  const r = await api("/api/admin/shipping");
  if (!r.ok) return;
  shipConfig = r.d;
  $("#shipFreeFrom").value = shipConfig.freeFrom || 0;
  renderShipFreeRules();
  renderShipZoneSelect();
  renderShipTiers();
}

$("#shipZoneSel").addEventListener("change", (e) => {
  shipZone = e.target.value;
  renderShipTiers();
});

$("#shipSaveBtn").addEventListener("click", async () => {
  const err = $("#shipError");
  const ok = $("#shipOk");
  err.style.display = "none";
  ok.style.display = "none";
  const freeFrom = parseFloat($("#shipFreeFrom").value);
  if (!Number.isFinite(freeFrom) || freeFrom < 0) { err.textContent = "Seuil de livraison offerte invalide."; err.style.display = ""; return; }
  shipConfig.freeFrom = Math.round(freeFrom * 100) / 100;
  shipConfig.freeByCountry = collectFreeRules();
  const relay = collectShipTiers("relay");
  const home = collectShipTiers("home");
  if (!relay.length || !home.length) { err.textContent = "Chaque zone doit avoir au moins un palier."; err.style.display = ""; return; }
  shipConfig.zones[shipZone] = { ...shipConfig.zones[shipZone], relay, home };
  const r = await api("/api/admin/shipping", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: shipConfig })
  });
  if (r.ok) {
    ok.style.display = "";
    setTimeout(() => { ok.style.display = "none"; }, 3000);
  } else {
    err.textContent = r.d.error || "Erreur.";
    err.style.display = "";
  }
});

$("#shipAddTierBtn").addEventListener("click", () => {
  const z = shipConfig.zones[shipZone] || { relay: [], home: [], label: shipZone };
  z.relay.push({ maxKg: 0, price: 0 });
  z.home.push({ maxKg: 0, price: 0 });
  shipConfig.zones[shipZone] = z;
  renderShipTiers();
});

$("#shipAddRuleBtn").addEventListener("click", () => {
  $("#shipFreeRules").insertAdjacentHTML("beforeend", freeRuleHtml("fr", ["diffuser", "bundle"]));
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("ship-tier-del")) {
    e.target.closest(".ship-tier-row").remove();
  }
  if (e.target.classList.contains("ship-free-del")) {
    e.target.closest(".ship-free-rule").remove();
  }
});

/* ---------- Messages & Newsletter admin handlers ---------- */

async function loadMessages() {
  const r = await api("/api/admin/messages");
  const listEl = $("#messagesList");
  const emptyEl = $("#messagesEmpty");
  const badgeEl = $("#msgCountBadge");
  if (!listEl) return;
  if (!r.ok || !r.d || !r.d.messages || r.d.messages.length === 0) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    if (badgeEl) badgeEl.style.display = "none";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  const msgs = r.d.messages;
  const unreadCount = msgs.filter((m) => !m.read).length;
  if (badgeEl) {
    badgeEl.textContent = unreadCount;
    badgeEl.style.display = unreadCount > 0 ? "inline-block" : "none";
  }

  listEl.innerHTML = msgs.map((m) => {
    const dateStr = new Date(m.createdAt).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    return `
      <div class="admin-msg-card" style="background:#fff;border:1px solid var(--line);padding:16px;margin-bottom:12px;border-left:4px solid ${m.read ? "var(--line)" : "var(--accent)"};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <strong>${esc(m.subject)}</strong> — <span style="color:var(--muted);">${esc(m.name)} (&lt;<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>&gt;)</span>
          </div>
          <span style="font-size:12px;color:var(--muted);">${dateStr}</span>
        </div>
        <p style="margin:8px 0;white-space:pre-wrap;font-size:14px;color:var(--ink);">${esc(m.message)}</p>
        <div style="display:flex;gap:10px;margin-top:10px;">
          ${!m.read ? `<button class="btn admin-btn-sm" onclick="markMessageRead('${m.id}')" style="font-size:12px;padding:4px 10px;">Marquer comme lu</button>` : ""}
          <button class="btn admin-btn-sm" onclick="deleteMessage('${m.id}')" style="font-size:12px;padding:4px 10px;color:#b3261e;border-color:#b3261e;">Supprimer</button>
        </div>
      </div>
    `;
  }).join("");
}

window.markMessageRead = async function(id) {
  await api(`/api/admin/messages/${id}/read`, { method: "PUT" });
  loadMessages();
};

window.deleteMessage = async function(id) {
  if (!confirm("Supprimer ce message ?")) return;
  await api(`/api/admin/messages/${id}`, { method: "DELETE" });
  loadMessages();
};

async function loadNewsletter() {
  const r = await api("/api/admin/newsletter");
  const listEl = $("#newsletterList");
  const emptyEl = $("#newsletterEmpty");
  const countEl = $("#newsletterCount");
  if (!listEl) return;
  if (!r.ok || !r.d || !r.d.subscribers || r.d.subscribers.length === 0) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    if (countEl) countEl.textContent = "0";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  const subs = r.d.subscribers;
  if (countEl) countEl.textContent = subs.length;

  listEl.innerHTML = `
    <div style="max-height:240px;overflow-y:auto;background:#fff;border:1px solid var(--line);padding:12px;">
      ${subs.map((s) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
          <span>${esc(s.email)}</span>
          <span style="color:var(--muted);">${new Date(s.createdAt).toLocaleDateString("fr-FR")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

const expNewsBtn = $("#exportNewsletterBtn");
if (expNewsBtn) {
  expNewsBtn.addEventListener("click", async () => {
    const r = await api("/api/admin/newsletter");
    if (!r.ok || !r.d || !r.d.subscribers || r.d.subscribers.length === 0) {
      alert("Aucun abonné à exporter.");
      return;
    }
    const csv = "Email,Date d'inscription\n" + r.d.subscribers.map((s) => `"${s.email}","${new Date(s.createdAt).toISOString()}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-w6paris-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });
}

const sendTestBtn = $("#sendTestEmailBtn");
if (sendTestBtn) {
  sendTestBtn.addEventListener("click", async () => {
    const toInput = $("#testEmailTo");
    const okEl = $("#testEmailOk");
    const errEl = $("#testEmailErr");
    okEl.style.display = "none";
    errEl.style.display = "none";

    const to = toInput ? toInput.value.trim() : "";
    const original = sendTestBtn.textContent;
    sendTestBtn.disabled = true;
    sendTestBtn.textContent = "Envoi en cours…";

    const r = await api("/api/admin/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to })
    });

    sendTestBtn.disabled = false;
    sendTestBtn.textContent = original;

    if (r.ok && r.d && r.d.ok) {
      okEl.style.display = "block";
      setTimeout(() => { okEl.style.display = "none"; }, 8000);
    } else {
      errEl.textContent = "Erreur : " + ((r.d && r.d.error) || "Impossible d'envoyer l'e-mail.");
      errEl.style.display = "block";
    }
  });
}
