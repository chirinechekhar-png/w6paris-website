/* W6 PARIS — storefront server
   Serves the static storefront + a protected admin API.
   Catalog in data/products.json, orders in data/orders.json. */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const PROMOS_FILE = path.join(DATA_DIR, "promos.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const IMAGES_DIR = path.join(ROOT, "images");

const STATUS_LABELS = {
  nouvelle: "Nouvelle",
  "a-preparer": "À préparer",
  expediee: "Expédiée",
  prete: "Prête au retrait",
  retiree: "Retirée",
  annulee: "Annulée"
};

/* Shipping config (editable) lives in data/shipping.json — Mondial Relay rates. */
const SHIPPING_FILE = path.join(DATA_DIR, "shipping.json");
let shippingConfigCache = null;

function loadShippingConfig() {
  if (shippingConfigCache) return shippingConfigCache;
  try {
    shippingConfigCache = JSON.parse(fs.readFileSync(SHIPPING_FILE, "utf8"));
  } catch {
    shippingConfigCache = {
      carrier: "Mondial Relay",
      freeFrom: 150,
      freeByCountry: { fr: ["diffuser", "bundle"], de: ["diffuser", "bundle"] },
      zones: {},
      countryZones: {}
    };
  }
  return shippingConfigCache;
}

function saveShippingConfig(cfg) {
  shippingConfigCache = cfg;
  fs.writeFileSync(SHIPPING_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

/* Map common country names / ISO codes -> ISO-2 code. Used for zones + free rules. */
const COUNTRY_CODES = {
  fr: "fr", france: "fr", francia: "fr",
  de: "de", allemagne: "de", germany: "de", deutschland: "de", alemania: "de",
  be: "be", belgique: "be", belgium: "be", belgie: "be", belgien: "be",
  lu: "lu", luxembourg: "lu", luxemburg: "lu",
  nl: "nl", "pays-bas": "nl", netherlands: "nl", holland: "nl", niederlande: "nl",
  es: "es", espagne: "es", spain: "es", españa: "es", spanien: "es",
  it: "it", italie: "it", italy: "it", italia: "it",
  pt: "pt", portugal: "pt",
  pl: "pl", pologne: "pl", poland: "pl", polen: "pl",
  at: "at", autriche: "at", austria: "at", österreich: "at",
  ie: "ie", irlande: "ie", ireland: "ie",
  dk: "dk", danemark: "dk", denmark: "dk", dänemark: "dk",
  se: "se", suede: "se", suède: "se", sweden: "se", schweden: "se",
  fi: "fi", finlande: "fi", finland: "fi", finnland: "fi",
  cz: "cz", "republique-tcheque": "cz", czech: "cz", tchequie: "cz",
  sk: "sk", slovaquie: "sk", slovakia: "sk", slowakei: "sk",
  hu: "hu", hongrie: "hu", hungary: "hu", ungarn: "hu",
  ro: "ro", roumanie: "ro", romania: "ro", rumänien: "ro",
  gr: "gr", grece: "gr", grèce: "gr", greece: "gr", griechenland: "gr"
};

function countryCode(country) {
  const c = String(country || "").toLowerCase().trim().replace(/[^a-zà-ÿ]/g, "").slice(0, 14);
  return COUNTRY_CODES[c] || c.slice(0, 2);
}

function shippingZone(country) {
  return loadShippingConfig().countryZones[countryCode(country)] || "eu";
}

/* Total parcel weight in kg for the order (uses per-product weightKg, or the oil size weight). */
function orderWeightKg(products, orderItems) {
  let total = 0;
  for (const it of orderItems) {
    const p = products[it.handle] || {};
    let w = typeof p.weightKg === "number" ? p.weightKg : 0;
    const sizeOpt = (p.options || []).find((o) => o.key === "size");
    if (sizeOpt) {
      const sel = it.rawOptions
        ? Object.values(it.rawOptions).find((v) => sizeOpt.values.some((x) => x.label === v))
        : null;
      const v = sel ? sizeOpt.values.find((x) => x.label === sel) : null;
      if (v && typeof v.weightKg === "number") w = v.weightKg;
    }
    total += w * it.qty;
  }
  return Math.round(total * 1000) / 1000;
}

/* Product types in the cart (used for the free-shipping rule on diffusers/packs). */
function orderProductTypes(orderItems) {
  const products = loadProducts();
  const types = new Set();
  for (const it of orderItems) {
    const p = products[it.handle];
    if (p) types.add(p.type);
  }
  return [...types];
}

/* Is shipping free because the cart contains a "free" product type for this country? */
function isFreeByType(country, productTypes) {
  const cfg = loadShippingConfig();
  const types = productTypes || [];
  if (!types.length) return false;
  const list = (cfg.freeByCountry || {})[countryCode(country)];
  return Array.isArray(list) && list.some((t) => types.includes(t));
}

/* Shipping fee in € for a country + method (relay|home) + weight + subtotal + types.
   Returns 0 when free. Falls back to the last (heaviest) tier if above the table. */
function shippingFee(country, method, weightKg, subtotal, productTypes) {
  const cfg = loadShippingConfig();
  if (Number(subtotal) >= Number(cfg.freeFrom || 0)) return 0;
  if (isFreeByType(country, productTypes)) return 0;
  const zone = shippingZone(country);
  const zoneCfg = (cfg.zones || {})[zone] || { relay: [], home: [] };
  const table = method === "home" ? zoneCfg.home : zoneCfg.relay;
  if (!Array.isArray(table) || table.length === 0) return 12.9;
  const tier = table.find((t) => weightKg <= t.maxKg) || table[table.length - 1];
  return Number(tier.price) || 0;
}

function shippingInfo(country, method, weightKg, subtotal, productTypes) {
  const cfg = loadShippingConfig();
  const free = Number(subtotal) >= Number(cfg.freeFrom || 0);
  const zone = shippingZone(country);
  const freeType = !free && isFreeByType(country, productTypes);
  return {
    zone,
    freeFrom: cfg.freeFrom,
    freeType,
    weightKg,
    fee: free || freeType ? 0 : shippingFee(country, method, weightKg, subtotal, productTypes)
  };
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const sessions = new Map(); // token -> expiry (in-memory, logged out on restart)
const customerSessions = new Map(); // token -> { email, expiry }

const app = express();
app.use(express.json());

const BLOCKED = ["/data", "/node_modules", "/server.js", "/package.json", "/package-lock.json"];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED.some((b) => p === b || p.startsWith(b + "/"))) {
    return res.status(403).end();
  }
  next();
});
app.use(express.static(ROOT));

/* ---------------- helpers ---------------- */

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveProducts(data) {
  ensureDataDir();
  const tmp = PRODUCTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, PRODUCTS_FILE);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "produit";
}

function loadOrders() {
  try {
    const arr = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveOrders(data) {
  ensureDataDir();
  const tmp = ORDERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, ORDERS_FILE);
}

function loadCustomers() {
  try {
    const obj = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, "utf8"));
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveCustomers(data) {
  ensureDataDir();
  const tmp = CUSTOMERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, CUSTOMERS_FILE);
}

function nextOrderNumber(orders) {
  const max = orders.reduce((m, o) => Math.max(m, o.number || 0), 0);
  return max + 1;
}

/* ---------------- promo codes ---------------- */

function loadPromos() {
  try {
    const arr = JSON.parse(fs.readFileSync(PROMOS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePromos(data) {
  ensureDataDir();
  const tmp = PROMOS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, PROMOS_FILE);
}

/* Returns { ok, discount, code?, reason? } — discount is in €. */
function applyPromo(promos, rawCode, subtotal) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: true, discount: 0 };
  const promo = promos.find((p) => p.code === code);
  if (!promo) return { ok: false, reason: "unknown" };
  if (promo.disabled) return { ok: false, reason: "disabled" };
  if (promo.expiresAt && Date.now() > promo.expiresAt) return { ok: false, reason: "expired" };
  if (promo.maxUses != null && (promo.uses || 0) >= promo.maxUses) return { ok: false, reason: "maxUses" };
  if (promo.minSubtotal && subtotal < promo.minSubtotal) return { ok: false, reason: "minSubtotal" };
  let discount = 0;
  if (promo.type === "percent") {
    discount = Math.round(subtotal * (promo.value / 100) * 100) / 100;
  } else {
    discount = Math.round(Math.min(promo.value, subtotal) * 100) / 100;
  }
  return { ok: true, discount, code };
}

/* Decrements stock for each ordered item. Returns true if all available. */
function decrementStock(products, orderItems) {
  for (const it of orderItems) {
    const p = products[it.handle];
    if (!p) return false;
    const s = p.stock;
    const qty = it.qty;
    if (s && typeof s === "object") {
      const values = Object.values(it.rawOptions || {});
      let matched = false;
      for (const [label, n] of Object.entries(s)) {
        if (values.indexOf(label) !== -1) {
          matched = true;
          if (n < qty) return false;
        }
      }
      if (matched) {
        for (const [label, n] of Object.entries(s)) {
          if (values.indexOf(label) !== -1) {
            s[label] = Math.max(0, n - qty);
          }
        }
      } else if (Number.isFinite(p.price)) {
        /* no variant selected on an object-stock product -> assume numeric-cap style is not used */
        return false;
      }
    } else if (typeof s === "number") {
      if (s < qty) return false;
      p.stock = Math.max(0, s - qty);
    } else {
      return false;
    }
  }
  return true;
}

function orderPriceFor(p, itemOptions) {
  if (p.type === "oil") {
    const sizeOpt = (p.options || []).find((o) => o.key === "size");
    const sel = itemOptions ? Object.values(itemOptions).find((v) => sizeOpt && sizeOpt.values.some((x) => x.label === v)) : null;
    const v = sizeOpt && sel ? sizeOpt.values.find((x) => x.label === sel) : null;
    return v ? v.price : 18;
  }
  let price = Number(p.price) || 0;
  (p.options || []).forEach((o) => {
    if (o.free) return;
    const sel = itemOptions ? Object.values(itemOptions).find((v) => o.values.some((x) => x.label === v)) : null;
    const v = sel ? o.values.find((x) => x.label === sel) : null;
    if (v && v.price) price += v.price;
  });
  return Math.round(price * 100) / 100;
}

function formatItemsForCSV(items) {
  return items
    .map((i) => `${i.name}${i.options ? " (" + i.options + ")" : ""} × ${i.qty}`)
    .join(" | ");
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function validateProduct(p) {
  if (!p || typeof p !== "object") return "product object required";
  if (!p.handle || typeof p.handle !== "string") return "handle required";
  if (!p.name || typeof p.name !== "object" || !p.name.fr) return "name.fr required";
  if (!["diffuser", "oil", "bundle"].includes(p.type)) return "invalid type";
  if (p.type !== "oil") {
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0) return "invalid price";
  }
  for (const [label, qty] of Object.entries(p.stock || {})) {
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 0 || qty > 9999) {
      return `invalid stock for "${label}"`;
    }
  }
  return null;
}

function ensureAdminConfig() {
  ensureDataDir();
  if (fs.existsSync(ADMIN_FILE)) return;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword("admin", salt);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash }, null, 2));
  console.log(
    "[W6] Admin created with DEFAULT password \"admin\". Change it in the /admin dashboard (Settings)."
  );
}

function loadAdmin() {
  ensureAdminConfig();
  return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function verifyPassword(password) {
  const cfg = loadAdmin();
  return hashPassword(password, cfg.salt) === cfg.hash;
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function requireAuth(req, res, next) {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("w6_admin="));
  const t = raw ? raw.slice("w6_admin=".length) : undefined;
  if (!t || !sessions.has(t) || sessions.get(t) < Date.now()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

/* ---------------- public API ---------------- */

app.get("/api/products", (req, res) => {
  res.json(loadProducts());
});

app.get("/api/inventory", (req, res) => {
  const inv = {};
  const products = loadProducts();
  for (const [handle, p] of Object.entries(products)) {
    inv[handle] = { stock: p.stock, updatedAt: p.updatedAt || 0 };
  }
  res.json(inv);
});

/* ---------------- public orders API ---------------- */

app.get("/api/shipping", (req, res) => {
  const country = String(req.query.country || "").trim() || "fr";
  const method = String(req.query.method || "").trim() === "home" ? "home" : "relay";
  const subtotal = Number(req.query.subtotal) || 0;
  const weightKg = Number(req.query.weightKg) || 0;
  let types = [];
  const itemsRaw = req.query.items;
  if (itemsRaw) {
    try {
      const items = JSON.parse(itemsRaw);
      if (Array.isArray(items)) types = orderProductTypes(items);
    } catch { /* ignore malformed */ }
  }
  const cfg = loadShippingConfig();
  const zone = shippingZone(country);
  const zoneCfg = (cfg.zones || {})[zone] || { relay: [], home: [] };
  const freeFrom = Number(subtotal) >= Number(cfg.freeFrom || 0);
  const freeType = !freeFrom && isFreeByType(country, types);
  res.json({
    zone,
    freeFrom: cfg.freeFrom,
    free: freeFrom,
    freeType,
    weightKg,
    relay: { fee: shippingFee(country, "relay", weightKg, subtotal, types), tiers: zoneCfg.relay || [] },
    home: { fee: shippingFee(country, "home", weightKg, subtotal, types), tiers: zoneCfg.home || [] },
    method
  });
});

app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  const customer = b.customer || {};
  const name = String(customer.name || "").trim();
  const email = String(customer.email || "").trim();
  const phone = String(customer.phone || "").trim();
  const fulfillment = b.fulfillment === "pickup" ? "pickup" : "delivery";
  const items = Array.isArray(b.items) ? b.items : [];

  if (!name) return res.status(400).json({ error: "name required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "invalid email" });
  if (items.length < 1 || items.length > 20) return res.status(400).json({ error: "invalid items" });

  const products = loadProducts();
  const orderItems = [];
  for (const it of items) {
    const p = products[it.handle];
    if (!p) return res.status(400).json({ error: "unknown product: " + it.handle });
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: "invalid qty" });
    const price = orderPriceFor(p, it.options);
    const opts = it.options && Object.keys(it.options).length
      ? Object.entries(it.options).map(([k, v]) => k + ": " + v).join(" · ")
      : "";
    const rawOptions = it.options && typeof it.options === "object" ? it.options : {};
    orderItems.push({
      handle: p.handle,
      name: p.name.fr || p.handle,
      options: opts,
      rawOptions,
      qty,
      price,
      line: Math.round(price * qty * 100) / 100
    });
  }

  let address = null;
  let pickup = null;
  let shipping = 0;
  let deliveryMethod = "relay";
  let weightKg = 0;
  if (fulfillment === "delivery") {
    const line1 = String(b.address && b.address.line1 || "").trim();
    const city = String(b.address && b.address.city || "").trim();
    const zip = String(b.address && b.address.zip || "").trim();
    if (!line1 || !city || !zip) return res.status(400).json({ error: "address required" });
    address = { line1, city, zip, country: String(b.address.country || "").trim() };
    deliveryMethod = b.deliveryMethod === "home" ? "home" : "relay";
    const subtotal = Math.round(orderItems.reduce((s, i) => s + i.line, 0) * 100) / 100;
    weightKg = orderWeightKg(products, orderItems);
    shipping = shippingFee(address.country, deliveryMethod, weightKg, subtotal, orderProductTypes(orderItems));
  } else {
    const date = String(b.pickup && b.pickup.date || "").trim();
    const time = String(b.pickup && b.pickup.time || "").trim();
    if (!date || !time) return res.status(400).json({ error: "pickup date/time required" });
    pickup = { date, time };
  }

  const orders = loadOrders();
  const number = nextOrderNumber(orders);
  const subtotal = Math.round(orderItems.reduce((s, i) => s + i.line, 0) * 100) / 100;
  const promos = loadPromos();
  const promo = applyPromo(promos, b.promoCode, subtotal);
  if (!promo.ok) {
    return res.status(400).json({ error: "invalid promo code" });
  }
  const discount = promo.discount;
  const total = Math.round((subtotal + shipping - discount) * 100) / 100;
  const order = {
    id: "W6-" + String(number).padStart(4, "0"),
    number,
    createdAt: Date.now(),
    customer: { name, email, phone },
    fulfillment,
    deliveryMethod,
    weightKg,
    address,
    pickup,
    items: orderItems,
    subtotal,
    shipping,
    discount,
    promoCode: promo.code || "",
    total,
    status: "nouvelle",
    tracking: "",
    viewed: false
  };
  orders.push(order);
  saveOrders(orders);
  if (!decrementStock(products, orderItems)) {
    /* stock became unavailable between load and save; revert order */
    orders.pop();
    saveOrders(orders);
    return res.status(409).json({ error: "stock unavailable" });
  }
  saveProducts(products);
  if (promo.code) {
    const target = promos.find((p) => p.code === promo.code);
    if (target) {
      target.uses = (target.uses || 0) + 1;
      savePromos(promos);
    }
  }

  console.log(`[W6] NEW ORDER ${order.id} — ${order.total.toFixed(2)}€ (${subtotal.toFixed(2)} + ${shipping.toFixed(2)} port${promo.code ? " − " + discount.toFixed(2) + " promo " + promo.code : ""}) — ${name}`);
  sendOrderEmail(order);
  res.json({ ok: true, id: order.id, total: order.total });
});

const nodemailer = require("nodemailer");

function sendOrderEmail(order) {
  const host = process.env.SMTP_HOST || "smtp.ionos.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || "contact@w6paris.com";
  const pass = process.env.SMTP_PASS;

  if (!pass) {
    console.log("[Email] SMTP_PASS not set, skipping email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // false for 587 (uses STARTTLS)
    auth: { user, pass }
  });

  const itemsHtml = order.items.map(i => `<li>${i.qty}x ${i.name} ${i.options ? `(${i.options})` : ""} — ${i.line.toFixed(2)}€</li>`).join("");

  const customerHtml = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:20px;">
      <h2 style="color:#9a7b3f;">Merci pour votre commande, ${order.customer.name} !</h2>
      <p>Votre commande <strong>${order.id}</strong> a bien été enregistrée.</p>
      <h3>Récapitulatif :</h3>
      <ul>${itemsHtml}</ul>
      <p><strong>Sous-total :</strong> ${order.subtotal.toFixed(2)}€</p>
      <p><strong>Livraison :</strong> ${order.shipping.toFixed(2)}€</p>
      ${order.discount > 0 ? `<p><strong>Remise (${order.promoCode}) :</strong> -${order.discount.toFixed(2)}€</p>` : ""}
      <p><strong>Total :</strong> ${order.total.toFixed(2)}€</p>
      <p style="margin-top:30px; font-size:12px; color:#6b6b6b;">W6 Paris — 12 Rue Boulard, 75014 Paris</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:20px;">
      <h2>Nouvelle commande ${order.id} (${order.total.toFixed(2)}€)</h2>
      <p><strong>Client :</strong> ${order.customer.name} (${order.customer.email}, ${order.customer.phone || "pas de tél"})</p>
      <p><strong>Mode :</strong> ${order.fulfillment}</p>
      <h3>Articles :</h3>
      <ul>${itemsHtml}</ul>
    </div>
  `;

  transporter.sendMail({
    from: `"W6 Paris" <${user}>`,
    to: order.customer.email,
    subject: `Confirmation de commande ${order.id} — W6 Paris`,
    html: customerHtml
  }).catch(err => console.error("[Email] Error sending customer email:", err));

  transporter.sendMail({
    from: `"W6 Paris Bot" <${user}>`,
    to: user,
    subject: `[Nouvelle Commande] ${order.id} — ${order.total.toFixed(2)}€`,
    html: adminHtml
  }).catch(err => console.error("[Email] Error sending admin email:", err));
}

/* Public promo validation (for checkout preview) */
app.post("/api/promo/validate", (req, res) => {
  const subtotal = Number((req.body || {}).subtotal) || 0;
  const r = applyPromo(loadPromos(), (req.body || {}).code, subtotal);
  if (!r.ok) return res.json({ ok: false, reason: r.reason });
  res.json({ ok: true, discount: r.discount, code: r.code });
});

/* ---------------- customer accounts ---------------- */

function currentCustomer(req) {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("w6_customer="));
  const t = raw ? raw.slice("w6_customer=".length) : undefined;
  const s = t ? customerSessions.get(t) : undefined;
  if (!s || s.expiry < Date.now()) return null;
  return { token: t, email: s.email };
}

function sanitizeCustomer(c) {
  return {
    email: c.email,
    name: c.name || "",
    createdAt: c.createdAt
  };
}

app.post("/api/account/register", (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").toLowerCase().trim();
  const name = String(b.name || "").trim();
  const password = String(b.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "invalid email" });
  if (!name) return res.status(400).json({ error: "name required" });
  if (password.length < 6) return res.status(400).json({ error: "password too short" });
  const customers = loadCustomers();
  if (customers[email]) return res.status(409).json({ error: "email exists" });
  const salt = crypto.randomBytes(16).toString("hex");
  customers[email] = { email, name, salt, hash: hashPassword(password, salt), createdAt: Date.now() };
  saveCustomers(customers);
  const token = newToken();
  customerSessions.set(token, { email, expiry: Date.now() + SESSION_TTL_MS });
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", `w6_customer=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`);
  res.json({ ok: true, customer: sanitizeCustomer(customers[email]) });
});

app.post("/api/account/login", (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").toLowerCase().trim();
  const password = String(b.password || "");
  const customers = loadCustomers();
  const c = customers[email];
  if (!c || hashPassword(password, c.salt) !== c.hash) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = newToken();
  customerSessions.set(token, { email, expiry: Date.now() + SESSION_TTL_MS });
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", `w6_customer=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`);
  res.json({ ok: true, customer: sanitizeCustomer(c) });
});

app.post("/api/account/logout", (req, res) => {
  const me = currentCustomer(req);
  if (me && me.token) customerSessions.delete(me.token);
  res.clearCookie("w6_customer", { path: "/" });
  res.json({ ok: true });
});

/* Current account + its order history. Never exposes the password hash. */
app.get("/api/account/me", (req, res) => {
  const me = currentCustomer(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const customers = loadCustomers();
  const c = customers[me.email];
  if (!c) return res.status(401).json({ error: "unauthorized" });
  const orders = loadOrders()
    .filter((o) => String(o.customer && o.customer.email || "").toLowerCase() === me.email)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      statusLabel: STATUS_LABELS[o.status] || o.status,
      items: (o.items || []).map((it) => ({ name: it.name, options: it.options, qty: it.qty, line: it.line })),
      subtotal: o.subtotal,
      shipping: o.shipping || 0,
      discount: o.discount || 0,
      total: o.total
    }));
  res.json({ ok: true, customer: sanitizeCustomer(c), orders });
});

/* Public order lookup (tracking) */
app.get("/api/orders/:id", (req, res) => {
  const id = String(req.params.id || "").trim().toUpperCase();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!/^W6-\d{3,5}$/.test(id)) return res.status(400).json({ error: "invalid order id" });
  const order = loadOrders().find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: "not found" });
  if (email && order.customer.email.toLowerCase() !== email) return res.status(403).json({ error: "forbidden" });
  res.json({
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    fulfillment: order.fulfillment,
    deliveryMethod: order.deliveryMethod || "relay",
    weightKg: order.weightKg || 0,
    items: (order.items || []).map((it) => ({ handle: it.handle, name: it.name, options: it.options, qty: it.qty, price: it.price, line: it.line })),
    subtotal: order.subtotal,
    shipping: order.shipping || 0,
    discount: order.discount || 0,
    promoCode: order.promoCode || "",
    total: order.total,
    tracking: order.tracking || ""
  });
});

/* ---------------- admin API ---------------- */

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: "invalid" });
  }
  const token = newToken();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `w6_admin=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`
  );
  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAuth, (req, res) => {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("w6_admin="));
  if (raw) sessions.delete(raw.slice("w6_admin=".length));
  res.clearCookie("w6_admin", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAuth, (req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/products", requireAuth, (req, res) => {
  res.json(loadProducts());
});

app.post("/api/admin/products", requireAuth, (req, res) => {
  const p = { ...(req.body || {}).product };
  if (!p.handle && p.name && p.name.fr) p.handle = slugify(p.name.fr);
  const err = validateProduct(p);
  if (err) return res.status(400).json({ error: err });
  const products = loadProducts();
  if (products[p.handle]) {
    return res.status(409).json({ error: "handle already exists" });
  }
  products[p.handle] = { ...p, updatedAt: Date.now() };
  saveProducts(products);
  res.json({ ok: true, handle: p.handle });
});

app.put("/api/admin/products/:handle", requireAuth, (req, res) => {
  const handle = req.params.handle;
  const products = loadProducts();
  if (!products[handle]) return res.status(404).json({ error: "unknown product" });
  const p = (req.body || {}).product;
  if (!p || typeof p !== "object") return res.status(400).json({ error: "product required" });
  if (p.handle && p.handle !== handle) {
    if (products[p.handle]) return res.status(409).json({ error: "handle already exists" });
  }
  const merged = { ...products[handle], ...p, handle, updatedAt: Date.now() };
  const err = validateProduct(merged);
  if (err) return res.status(400).json({ error: err });
  if (p.handle && p.handle !== handle) {
    delete products[handle];
  }
  products[merged.handle] = merged;
  saveProducts(products);
  res.json({ ok: true, handle: merged.handle });
});

app.delete("/api/admin/products/:handle", requireAuth, (req, res) => {
  const handle = req.params.handle;
  const products = loadProducts();
  if (!products[handle]) return res.status(404).json({ error: "unknown product" });
  delete products[handle];
  saveProducts(products);
  res.json({ ok: true });
});

app.get("/api/admin/images", requireAuth, (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(IMAGES_DIR).filter((f) => /\.(jpe?g|png|webp|gif|mov|mp4)$/i.test(f));
  } catch {
    files = [];
  }
  res.json(files);
});

/* Admin shipping config (Mondial Relay rates are editable) */
app.get("/api/admin/shipping", requireAuth, (req, res) => {
  res.json(loadShippingConfig());
});

app.put("/api/admin/shipping", requireAuth, (req, res) => {
  const b = (req.body || {}).config;
  if (!b || typeof b !== "object") return res.status(400).json({ error: "config required" });
  const cfg = loadShippingConfig();
  if (typeof b.freeFrom === "number" && Number.isFinite(b.freeFrom) && b.freeFrom >= 0) {
    cfg.freeFrom = Math.round(b.freeFrom * 100) / 100;
  }
  if (b.freeByCountry && typeof b.freeByCountry === "object") {
    const clean = {};
    for (const [cc, list] of Object.entries(b.freeByCountry)) {
      if (Array.isArray(list)) {
        clean[String(cc).toLowerCase().slice(0, 2)] = list.filter((t) => ["diffuser", "oil", "bundle"].includes(t));
      }
    }
    cfg.freeByCountry = clean;
  }
  if (b.zones && typeof b.zones === "object") {
    for (const [zone, z] of Object.entries(b.zones)) {
      if (!z || typeof z !== "object") continue;
      const clean = (tiers) => Array.isArray(tiers)
        ? tiers
            .filter((t) => t && Number.isFinite(Number(t.maxKg)) && Number.isFinite(Number(t.price)) && Number(t.price) >= 0)
            .map((t) => ({ maxKg: Math.round(Number(t.maxKg) * 1000) / 1000, price: Math.round(Number(t.price) * 100) / 100 }))
            .sort((a, b) => a.maxKg - b.maxKg)
        : [];
      cfg.zones[zone] = {
        label: z.label || zone,
        relay: clean(z.relay),
        home: clean(z.home)
      };
    }
  }
  saveShippingConfig(cfg);
  res.json({ ok: true });
});

/* ---------------- admin orders API ---------------- */

function sortOrders(orders) {
  return orders.slice().sort((a, b) => b.createdAt - a.createdAt);
}

app.get("/api/admin/orders", requireAuth, (req, res) => {
  res.json(sortOrders(loadOrders()));
});

app.get("/api/admin/orders/count", requireAuth, (req, res) => {
  const orders = loadOrders();
  res.json({ total: orders.length, unviewed: orders.filter((o) => !o.viewed).length });
});

app.get("/api/admin/stats", requireAuth, (req, res) => {
  const orders = loadOrders();
  const active = orders.filter((o) => o.status !== "annulee");
  const revenue = Math.round(active.reduce((s, o) => s + (o.total || 0), 0) * 100) / 100;

  const days = 7;
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = startOfDay(new Date(now.getTime() - i * 86400000));
    const dayOrders = active.filter((o) => startOfDay(new Date(o.createdAt)) === t);
    series.push({
      date: new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      orders: dayOrders.length,
      revenue: Math.round(dayOrders.reduce((s, o) => s + (o.total || 0), 0) * 100) / 100
    });
  }

  const productCounts = {};
  active.forEach((o) => (o.items || []).forEach((it) => {
    productCounts[it.name] = (productCounts[it.name] || 0) + it.qty;
  }));
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  const customers = loadCustomers();
  const customerAccounts = Object.keys(customers).length;

  const customerTotals = {};
  active.forEach((o) => {
    const email = (o.customer && o.customer.email || "").trim().toLowerCase();
    if (!email) return;
    customerTotals[email] = customerTotals[email] || { name: (o.customer && o.customer.name) || email, orders: 0, spent: 0 };
    customerTotals[email].orders += 1;
    customerTotals[email].spent += o.total || 0;
  });
  const topCustomers = Object.entries(customerTotals)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 5)
    .map(([email, v]) => ({ email, name: v.name, orders: v.orders, spent: Math.round(v.spent * 100) / 100 }));

  res.json({
    totalOrders: orders.length,
    activeOrders: active.length,
    revenue,
    average: active.length ? Math.round((revenue / active.length) * 100) / 100 : 0,
    series,
    topProducts,
    customerAccounts,
    topCustomers
  });
});

app.post("/api/admin/orders/view-all", requireAuth, (req, res) => {
  const orders = loadOrders();
  let changed = false;
  orders.forEach((o) => { if (!o.viewed) { o.viewed = true; changed = true; } });
  if (changed) saveOrders(orders);
  res.json({ ok: true });
});

app.put("/api/admin/orders/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const orders = loadOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: "unknown order" });
  const { status, tracking } = req.body || {};
  if (status) {
    if (!STATUS_LABELS[status]) return res.status(400).json({ error: "invalid status" });
    order.status = status;
  }
  if (typeof tracking === "string") {
    order.tracking = tracking.trim();
  }
  order.updatedAt = Date.now();
  saveOrders(orders);
  res.json({ ok: true });
});

app.delete("/api/admin/orders/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const orders = loadOrders();
  const next = orders.filter((o) => o.id !== id);
  if (next.length === orders.length) return res.status(404).json({ error: "unknown order" });
  saveOrders(next);
  res.json({ ok: true });
});

app.get("/api/admin/orders/export", requireAuth, (req, res) => {
  const orders = sortOrders(loadOrders());
  const header = ["N°", "Date", "Client", "Email", "Téléphone", "Mode", "Adresse / Retrait", "Articles", "Total", "Statut", "Tracking", "Vu"];
  const lines = orders.map((o) => {
    const when = new Date(o.createdAt).toLocaleString("fr-FR");
    const how = o.fulfillment === "pickup"
      ? "Retrait " + (o.pickup ? o.pickup.date + " " + o.pickup.time : "")
      : "Livraison " + ((o.deliveryMethod === "home" ? "Domicile" : "Point Relais") + (o.weightKg ? " (" + o.weightKg + " kg)" : ""));
    const addr = o.fulfillment === "delivery" && o.address
      ? [o.address.line1, o.address.zip, o.address.city, o.address.country].filter(Boolean).join(", ")
      : (o.pickup ? o.pickup.date + " " + o.pickup.time : "");
    return [
      o.id,
      when,
      o.customer.name,
      o.customer.email,
      o.customer.phone || "",
      how,
      addr,
      formatItemsForCSV(o.items),
      o.total.toFixed(2).replace(".", ",") + " €",
      STATUS_LABELS[o.status] || o.status,
      o.tracking || "",
      o.viewed ? "Oui" : "Non"
    ].map(csvEscape).join(";");
  });
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="commandes-w6.csv"');
  res.send(csv);
});

/* Invoice PDF (single order) */
app.get("/api/admin/orders/:id/invoice", requireAuth, async (req, res) => {
  try {
    const order = loadOrders().find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "unknown order" });
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Facture " + order.id } });
    const buffers = [];
    doc.on("data", (c) => buffers.push(c));
    doc.on("end", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="facture-' + order.id + '.pdf"');
      res.send(Buffer.concat(buffers));
    });

    const when = new Date(order.createdAt);
    const dateStr = when.toLocaleDateString("fr-FR");
    const money = (v) => (v || 0).toFixed(2).replace(".", ",") + " €";
    const accent = "#9a7b3f";
    const gray = "#6b6b6b";

    doc.fontSize(22).fillColor("#1c1c1c").text("W6 Paris", { continued: false });
    doc.fontSize(9).fillColor(gray).text("Maison de parfum d'intérieur").text("12 Rue Boulard, 75014 Paris, France").text("contact@w6paris.com");

    doc.fontSize(11).fillColor("#1c1c1c").text("FACTURE", { align: "right" });
    doc.fontSize(9).fillColor(gray).text(order.id, { align: "right" });
    doc.text("Date : " + dateStr, { align: "right" });

    doc.moveDown();
    doc.fontSize(10).fillColor("#1c1c1c").text("Facturé à :");
    doc.fontSize(9).fillColor("#1c1c1c").text(order.customer.name).fillColor(gray).text(order.customer.email);
    if (order.customer.phone) doc.fontSize(9).fillColor(gray).text(order.customer.phone);
    if (order.fulfillment === "delivery" && order.address) {
      doc.fillColor(gray).text([order.address.line1, order.address.zip + " " + order.address.city, order.address.country].filter(Boolean).join(", "));
    }
    doc.fillColor("#1c1c1c").text(order.fulfillment === "pickup"
      ? "Retrait en boutique — " + (order.pickup ? order.pickup.date + " " + order.pickup.time : "")
      : "Livraison " + (order.deliveryMethod === "home" ? "à domicile" : "Point Relais") + (order.weightKg ? " — " + String(order.weightKg).replace(".", ",") + " kg" : ""));

    doc.moveDown(2);
    doc.moveTo(48, doc.y).lineTo(552, doc.y).strokeColor("#ddd").stroke();

    doc.fontSize(9).fillColor(gray);
    doc.text("Article", 48, doc.y + 8, { width: 250 });
    doc.text("Qté", 320, doc.y, { width: 60, align: "right" });
    doc.text("P.U. HT", 400, doc.y, { width: 70, align: "right" });
    doc.text("Total", 500, doc.y, { width: 52, align: "right" });

    doc.moveDown();
    const startY = doc.y;
    doc.fontSize(9).fillColor("#1c1c1c");
    order.items.forEach((it) => {
      doc.text(it.name + (it.options ? " (" + it.options + ")" : ""), 48, doc.y, { width: 270 });
      doc.text(String(it.qty), 320, doc.y, { width: 60, align: "right" });
      doc.text(money(it.price), 400, doc.y, { width: 70, align: "right" });
      doc.text(money(it.line), 500, doc.y, { width: 52, align: "right" });
      doc.moveDown(0.5);
    });

    doc.moveTo(48, doc.y).lineTo(552, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown();
    doc.fontSize(9).fillColor("#1c1c1c");
    const row = (label, value) => {
      doc.text(label, 340, doc.y, { width: 160 });
      doc.text(value, 500, doc.y, { width: 52, align: "right" });
      doc.moveDown(0.6);
    };
    row("Sous-total", money(order.subtotal));
    if (order.shipping) row("Livraison", money(order.shipping));
    if (order.discount) row("Réduction", "− " + money(order.discount));
    doc.fontSize(12).fillColor("#1c1c1c");
    row("TOTAL", money(order.total));
    doc.fontSize(9).fillColor(accent).text(order.promoCode ? "Code promo : " + order.promoCode : "");

    doc.moveDown(2);
    doc.fontSize(8.5).fillColor(gray)
      .text("W6 Paris — 12 Rue Boulard, 75014 Paris. Facture générée le " + new Date().toLocaleDateString("fr-FR") + ".", 48, null);

    doc.end();
  } catch (e) {
    res.status(500).json({ error: "invoice failed" });
  }
});

app.post("/api/admin/password", requireAuth, (req, res) => {
  const { current, next: nextPass } = req.body || {};
  if (!current || !verifyPassword(current)) {
    return res.status(401).json({ error: "invalid current password" });
  }
  if (!nextPass || String(nextPass).length < 6) {
    return res.status(400).json({ error: "new password must be at least 6 characters" });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(nextPass, salt);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash }, null, 2));
  res.json({ ok: true });
});

/* ---------------- admin promos API ---------------- */

app.get("/api/admin/promos", requireAuth, (req, res) => {
  res.json(loadPromos());
});

app.post("/api/admin/promos", requireAuth, (req, res) => {
  const b = (req.body || {}).promo || {};
  const code = String(b.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "code required" });
  if (code.length > 30) return res.status(400).json({ error: "code too long" });
  const type = b.type === "fixed" ? "fixed" : "percent";
  const value = Number(b.value);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "invalid value" });
  if (type === "percent" && value > 100) return res.status(400).json({ error: "percent > 100" });
  const promos = loadPromos();
  if (promos.some((p) => p.code === code)) return res.status(409).json({ error: "code exists" });
  const promo = {
    code,
    type,
    value,
    minSubtotal: Number(b.minSubtotal) > 0 ? Number(b.minSubtotal) : 0,
    maxUses: b.maxUses ? Number(b.maxUses) : null,
    expiresAt: b.expiresAt ? new Date(b.expiresAt).getTime() : null,
    disabled: !!b.disabled,
    uses: 0,
    createdAt: Date.now()
  };
  promos.push(promo);
  savePromos(promos);
  res.json({ ok: true });
});

app.delete("/api/admin/promos/:code", requireAuth, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const promos = loadPromos();
  const next = promos.filter((p) => p.code !== code);
  if (next.length === promos.length) return res.status(404).json({ error: "unknown code" });
  savePromos(next);
  res.json({ ok: true });
});

/* ---------------- admin page ---------------- */

app.get(["/admin", "/admin.html"], (req, res) => {
  res.sendFile(path.join(ROOT, "admin.html"));
});

app.get(["/orders", "/orders.html"], (req, res) => {
  res.sendFile(path.join(ROOT, "orders.html"));
});

/* ---------------- boot ---------------- */

ensureDataDir();
ensureAdminConfig();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[W6] server running on http://localhost:${PORT}`);
  console.log(`[W6] admin dashboard: http://localhost:${PORT}/admin`);
});
