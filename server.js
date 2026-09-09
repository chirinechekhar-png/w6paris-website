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
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const NEWSLETTER_FILE = path.join(DATA_DIR, "newsletter.json");
const PENDING_CHECKOUTS_FILE = path.join(DATA_DIR, "pending_checkouts.json");
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
      freeFrom: null,
      freeByCountry: {
        fr: ["diffuser", "bundle", "oil"],
        be: ["oil"],
        lu: ["oil"],
        nl: ["oil"]
      },
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

/* Is Relay shipping free for this country based on the product types in the cart? */
function isRelayFree(country, productTypes) {
  const cfg = loadShippingConfig();
  const c = countryCode(country);
  const types = Array.isArray(productTypes) ? productTypes : [];
  if (!types.length) return c === "fr";
  const allowed = (cfg.freeByCountry || {})[c];
  if (!Array.isArray(allowed) || !allowed.length) return false;
  return types.every((t) => allowed.includes(t));
}

const isFreeByType = isRelayFree;

/* Calculate shipping discount based on products in the cart (Option 1: highest single discount).
   - Diffuseur i6: 10 €
   - Diffuseur i7: 8 €
   - Diffuseur Nomade: 6 €
   - Pack Duo: 5 €
   - Fragrance oils (10 ml or 100 ml): 4 € */
function getShippingDiscount(orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return { amount: 0, label: "" };
  }
  const products = loadProducts();
  let maxDiscount = 0;
  let bestLabel = "";

  for (const it of orderItems) {
    const handle = String(it.handle || "");
    const p = products[handle] || {};
    let amount = 0;
    let label = "";

    if (handle === "diffuseur-i6") {
      amount = 10;
      label = "Diffuseur i6";
    } else if (handle === "diffuseur-i7") {
      amount = 8;
      label = "Diffuseur i7";
    } else if (handle === "diffuseur-nomade") {
      amount = 6;
      label = "Diffuseur Nomade";
    } else if (handle === "pack-duo") {
      amount = 5;
      label = "Pack Duo";
    } else if (p.type === "oil") {
      amount = 4;
      label = "Fragrance";
    }

    if (amount > maxDiscount) {
      maxDiscount = amount;
      bestLabel = label;
    }
  }

  return { amount: maxDiscount, label: bestLabel };
}

/* Base shipping fee before any product discount (or 0 when free by policy) */
function baseShippingFee(country, method, weightKg, subtotal, productTypes) {
  const cfg = loadShippingConfig();
  if (cfg.freeFrom && Number(subtotal) >= Number(cfg.freeFrom)) return 0;
  if (method === "relay" && isRelayFree(country, productTypes)) return 0;
  const zone = shippingZone(country);
  const zoneCfg = (cfg.zones || {})[zone] || { relay: [], home: [] };
  const table = method === "home" ? zoneCfg.home : zoneCfg.relay;
  if (!Array.isArray(table) || table.length === 0) return 12.9;
  const tier = table.find((t) => weightKg <= t.maxKg) || table[table.length - 1];
  return Number(tier.price) || 0;
}

/* Final shipping fee in € after applying product shipping discount (minimum 0 €) */
function shippingFee(country, method, weightKg, subtotal, productTypes, orderItems) {
  const base = baseShippingFee(country, method, weightKg, subtotal, productTypes);
  if (base === 0) return 0;
  const disc = getShippingDiscount(orderItems);
  return Math.round(Math.max(0, base - disc.amount) * 100) / 100;
}

function shippingInfo(country, method, weightKg, subtotal, productTypes, orderItems) {
  const base = baseShippingFee(country, method, weightKg, subtotal, productTypes);
  const disc = getShippingDiscount(orderItems);
  const discountApplied = base > 0 ? Math.min(base, disc.amount) : 0;
  const fee = Math.round(Math.max(0, base - discountApplied) * 100) / 100;
  const zone = shippingZone(country);
  return {
    zone,
    weightKg,
    baseFee: base,
    discount: discountApplied,
    discountLabel: disc.label,
    fee,
    isFree: fee === 0
  };
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const sessions = new Map(); // token -> expiry (in-memory, logged out on restart)
const customerSessions = new Map(); // token -> { email, expiry }

/* Simple sliding-window in-memory rate limiter */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "ip";
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (hits.get(ip) || []).filter((t) => t > windowStart);
    if (timestamps.length >= limit) {
      return res.status(429).json({ error: "Trop de requêtes. Veuillez réessayer plus tard." });
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}

const adminLoginLimiter = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 min
const accountLimiter = createRateLimiter(10, 15 * 60 * 1000);   // 10 attempts per 15 min
const orderLimiter = createRateLimiter(10, 15 * 60 * 1000);     // 10 orders per 15 min
const contactLimiter = createRateLimiter(5, 15 * 60 * 1000);    // 5 inquiries per 15 min
const newsletterLimiter = createRateLimiter(5, 15 * 60 * 1000); // 5 signups per 15 min

const app = express();

// Stripe webhook requires the raw body buffer for signature verification
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  handleStripeWebhook(req, res);
});

app.use(express.json());

// Canonical domain redirect: redirect *.onrender.com to w6paris.com (GET/HEAD only)
app.use((req, res, next) => {
  const host = (req.headers.host || "").toLowerCase();
  if (host.includes("onrender.com") && (req.method === "GET" || req.method === "HEAD")) {
    return res.redirect(301, "https://w6paris.com" + req.originalUrl);
  }
  next();
});

const BLOCKED = ["/data", "/node_modules", "/server.js", "/package.json", "/package-lock.json", "/.env", "/.git"];
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

function loadPendingCheckouts() {
  try {
    const obj = JSON.parse(fs.readFileSync(PENDING_CHECKOUTS_FILE, "utf8"));
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function savePendingCheckout(id, data) {
  ensureDataDir();
  const all = loadPendingCheckouts();
  all[id] = data;
  const tmp = PENDING_CHECKOUTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, PENDING_CHECKOUTS_FILE);
}

function deletePendingCheckout(id) {
  try {
    const all = loadPendingCheckouts();
    if (all[id]) {
      delete all[id];
      const tmp = PENDING_CHECKOUTS_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
      fs.renameSync(tmp, PENDING_CHECKOUTS_FILE);
    }
  } catch {}
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

function loadMessages() {
  try {
    const arr = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveMessages(data) {
  ensureDataDir();
  const tmp = MESSAGES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, MESSAGES_FILE);
}

function loadNewsletter() {
  try {
    const arr = JSON.parse(fs.readFileSync(NEWSLETTER_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveNewsletter(data) {
  ensureDataDir();
  const tmp = NEWSLETTER_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, NEWSLETTER_FILE);
}

function nextOrderNumber(orders) {
  const max = orders.reduce((m, o) => Math.max(m, o.number || 0), 0);
  return max + 1;
}

/* ---------------- promo codes ---------------- */

function loadPromosConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(PROMOS_FILE, "utf8"));
    if (Array.isArray(raw)) {
      return { checkoutVisible: true, codes: raw };
    }
    return {
      checkoutVisible: raw && raw.checkoutVisible !== false,
      codes: Array.isArray(raw?.codes) ? raw.codes : (Array.isArray(raw?.promos) ? raw.promos : [])
    };
  } catch {
    return { checkoutVisible: true, codes: [] };
  }
}

function loadPromos() {
  return loadPromosConfig().codes;
}

function savePromosConfig(cfg) {
  ensureDataDir();
  try {
    const tmp = PROMOS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, PROMOS_FILE);
  } catch {
    fs.writeFileSync(PROMOS_FILE, JSON.stringify(cfg, null, 2));
  }
}

function savePromos(codes) {
  const cfg = loadPromosConfig();
  cfg.codes = codes;
  savePromosConfig(cfg);
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

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPassword(password) {
  const cfg = loadAdmin();
  return safeCompare(hashPassword(password, cfg.salt), cfg.hash);
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
  let parsedItems = [];
  const itemsRaw = req.query.items;
  if (itemsRaw) {
    try {
      const items = JSON.parse(itemsRaw);
      if (Array.isArray(items)) {
        types = orderProductTypes(items);
        parsedItems = items;
      }
    } catch { /* ignore malformed */ }
  }
  const cfg = loadShippingConfig();
  const zone = shippingZone(country);
  const zoneCfg = (cfg.zones || {})[zone] || { relay: [], home: [] };

  const relayBase = baseShippingFee(country, "relay", weightKg, subtotal, types);
  const homeBase = baseShippingFee(country, "home", weightKg, subtotal, types);
  const discountInfo = getShippingDiscount(parsedItems);

  const relayDiscount = relayBase > 0 ? Math.min(relayBase, discountInfo.amount) : 0;
  const relayFee = Math.round(Math.max(0, relayBase - relayDiscount) * 100) / 100;

  const homeDiscount = homeBase > 0 ? Math.min(homeBase, discountInfo.amount) : 0;
  const homeFee = Math.round(Math.max(0, homeBase - homeDiscount) * 100) / 100;

  res.json({
    zone,
    freeFrom: cfg.freeFrom || null,
    weightKg,
    discountAmount: discountInfo.amount,
    discountLabel: discountInfo.label,
    relay: {
      baseFee: relayBase,
      fee: relayFee,
      discount: relayDiscount,
      isFree: relayFee === 0,
      tiers: zoneCfg.relay || []
    },
    home: {
      baseFee: homeBase,
      fee: homeFee,
      discount: homeDiscount,
      isFree: homeFee === 0,
      tiers: zoneCfg.home || []
    },
    method,
    promoCheckoutVisible: loadPromosConfig().checkoutVisible !== false
  });
});

app.post("/api/orders", orderLimiter, (req, res) => {
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
    shipping = shippingFee(address.country, deliveryMethod, weightKg, subtotal, orderProductTypes(orderItems), orderItems);
  } else {
    const date = String(b.pickup && b.pickup.date || "").trim();
    const time = String(b.pickup && b.pickup.time || "").trim();
    if (!date || !time) return res.status(400).json({ error: "pickup date/time required" });
    pickup = { date, time };
  }

  const orders = loadOrders();
  const number = nextOrderNumber(orders);
  const promoCfg = loadPromosConfig();
  if (b.promoCode && !promoCfg.checkoutVisible) {
    return res.status(400).json({ error: "promo codes disabled" });
  }
  const promo = applyPromo(promoCfg.codes, b.promoCode, subtotal);
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

const { Resend } = require("resend");

async function sendOrderEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[Email] RESEND_API_KEY not set in environment, skipping email.");
    return;
  }

  const resend = new Resend(apiKey);
  // Supports custom RESEND_FROM env var or verified sending domain (send.w6paris.com or w6paris.com)
  const from = process.env.RESEND_FROM || "W6 Paris <contact@send.w6paris.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "contact@w6paris.com";

  let pdfAttachment = null;
  try {
    const pdfBuf = await buildInvoicePdf(order);
    if (pdfBuf) {
      pdfAttachment = {
        filename: `facture-${order.id}.pdf`,
        content: pdfBuf.toString("base64")
      };
    }
  } catch (err) {
    console.error("[Email] Could not generate invoice PDF attachment:", err.message);
  }

  const itemsHtml = order.items.map(i => `<li>${i.qty}x ${i.name} ${i.options ? `(${i.options})` : ""} — ${i.line.toFixed(2)}€</li>`).join("");

  const customerHtml = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:20px; line-height:1.6;">
      <h2 style="color:#9a7b3f; margin-bottom:10px;">Merci pour votre commande, ${order.customer.name} !</h2>
      <p>Votre commande <strong>${order.id}</strong> a bien été enregistrée.</p>
      <p>Vous trouverez votre facture officielle en pièce jointe de cet e-mail.</p>
      <div style="background:#f9f9f9; border:1px solid #eee; padding:15px; border-radius:6px; margin:20px 0;">
        <h3 style="margin-top:0; color:#1c1c1c;">Récapitulatif :</h3>
        <ul style="padding-left:20px; margin-bottom:15px;">${itemsHtml}</ul>
        <p style="margin:4px 0;"><strong>Sous-total :</strong> ${order.subtotal.toFixed(2)}€</p>
        <p style="margin:4px 0;"><strong>Livraison :</strong> ${order.shipping.toFixed(2)}€</p>
        ${order.discount > 0 ? `<p style="margin:4px 0; color:#9a7b3f;"><strong>Remise (${order.promoCode}) :</strong> -${order.discount.toFixed(2)}€</p>` : ""}
        <p style="margin:10px 0 0 0; font-size:16px;"><strong>Total payé :</strong> ${order.total.toFixed(2)}€</p>
      </div>
      <p style="font-size:13px; color:#555;">Nous préparons soigneusement votre commande. Un e-mail avec le numéro de suivi vous sera adressé dès son expédition.</p>
      <p style="margin-top:30px; font-size:12px; color:#888; border-top:1px solid #eee; padding-top:15px;">W6 Paris — 12 Rue Boulard, 75014 Paris · contact@w6paris.com</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:20px;">
      <h2>Nouvelle commande ${order.id} (${order.total.toFixed(2)}€)</h2>
      <p><strong>Client :</strong> ${order.customer.name} (${order.customer.email}, ${order.customer.phone || "pas de tél"})</p>
      <p><strong>Paiement :</strong> ${order.paymentStatus || "confirmé"}</p>
      <p><strong>Mode :</strong> ${order.fulfillment}${order.fulfillment === "delivery" ? ` (${order.deliveryMethod})` : ""}</p>
      <h3>Articles :</h3>
      <ul>${itemsHtml}</ul>
      <p><strong>Total :</strong> ${order.total.toFixed(2)}€</p>
    </div>
  `;

  const customerEmailPayload = {
    from,
    replyTo,
    to: order.customer.email,
    subject: `Confirmation de commande ${order.id} — W6 Paris`,
    html: customerHtml
  };
  if (pdfAttachment) {
    customerEmailPayload.attachments = [pdfAttachment];
  }

  resend.emails.send(customerEmailPayload).then(res => {
    if (res.error) console.error("[Email] Customer email failed from Resend API:", res.error);
    else console.log("[Email] Customer email sent successfully with invoice:", res.data);
  }).catch(err => console.error("[Email] Customer email network error:", err));

  resend.emails.send({
    from,
    replyTo,
    to: "contact@w6paris.com",
    subject: `[Nouvelle Commande] ${order.id} — ${order.total.toFixed(2)}€`,
    html: adminHtml
  }).then(res => {
    if (res.error) console.error("[Email] Admin email failed from Resend API:", res.error);
    else console.log("[Email] Admin email sent successfully:", res.data);
  }).catch(err => console.error("[Email] Admin email network error:", err));
}

function sendShippingEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !order.customer || !order.customer.email) return;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "W6 Paris <contact@send.w6paris.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "contact@w6paris.com";

  const trackingLink = `https://w6paris.com/tracking.html?id=${encodeURIComponent(order.id)}&email=${encodeURIComponent(order.customer.email)}`;
  const carrierDirectLink = order.tracking ? `https://www.mondialrelay.fr/suivi-de-colis/?NumeroColis=${encodeURIComponent(order.tracking)}` : trackingLink;

  const itemsHtml = (order.items || []).map(i => `<li>${i.qty}x ${i.name} ${i.options ? `(${i.options})` : ""}</li>`).join("");

  const trackingBox = order.tracking ? `
    <div style="background:#f9f8f6; border:1px solid #ede8e0; border-radius:8px; padding:20px; margin:24px 0; text-align:center;">
      <p style="margin:0 0 6px; font-size:12px; color:#777; text-transform:uppercase; letter-spacing:0.06em; font-weight:600;">Numéro de suivi du colis</p>
      <p style="margin:0 0 16px; font-size:22px; font-weight:bold; color:#1c1c1c; font-family:monospace; letter-spacing:0.08em;">${order.tracking}</p>
      <a href="${carrierDirectLink}" target="_blank" style="display:inline-block; background:#9a7b3f; color:#ffffff; padding:13px 26px; text-decoration:none; border-radius:6px; font-size:14px; font-weight:500;">Suivre mon colis en direct →</a>
    </div>
  ` : `
    <div style="background:#f9f8f6; border:1px solid #ede8e0; border-radius:8px; padding:20px; margin:24px 0; text-align:center;">
      <p style="margin:0 0 14px; font-size:14px; color:#444;">Votre colis a été remis au transporteur et est en cours d'acheminement.</p>
      <a href="${trackingLink}" target="_blank" style="display:inline-block; background:#9a7b3f; color:#ffffff; padding:13px 26px; text-decoration:none; border-radius:6px; font-size:14px; font-weight:500;">Consulter ma commande sur W6 Paris →</a>
    </div>
  `;

  const html = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:24px; line-height:1.6;">
      <h1 style="color:#1c1c1c; font-size:24px; font-weight:normal; margin-bottom:8px; letter-spacing:0.04em;">W6 Paris</h1>
      <h2 style="color:#9a7b3f; margin-top:0; font-size:20px;">Bonne nouvelle, votre commande a été expédiée !</h2>
      <p>Bonjour <strong>${order.customer.name}</strong>,</p>
      <p>Votre commande <strong>${order.id}</strong> a été soigneusement préparée et vient d'être expédiée.</p>
      
      ${trackingBox}

      <div style="border-top:1px solid #eee; padding-top:16px; margin-top:20px;">
        <h3 style="font-size:15px; margin-bottom:8px; color:#1c1c1c;">Rappel des articles expédiés :</h3>
        <ul style="padding-left:20px; color:#555; margin-bottom:16px;">${itemsHtml}</ul>
      </div>

      <p style="font-size:13px; color:#666; margin-top:24px;">
        Une question sur votre livraison ? Répondez simplement à cet e-mail ou écrivez-nous à <a href="mailto:contact@w6paris.com" style="color:#9a7b3f;">contact@w6paris.com</a>.
      </p>
      
      <p style="margin-top:30px; font-size:12px; color:#999; border-top:1px solid #eee; padding-top:16px;">
        W6 Paris — Maison de parfum d'intérieur<br>
        12 Rue Boulard, 75014 Paris · contact@w6paris.com
      </p>
    </div>
  `;

  resend.emails.send({
    from,
    replyTo,
    to: order.customer.email,
    subject: `Votre commande ${order.id} a été expédiée ! — W6 Paris`,
    html
  }).then(res => {
    if (res.error) console.error("[Email] Shipping notification failed:", res.error);
    else console.log(`[Email] Shipping email sent to ${order.customer.email} for order ${order.id}`);
  }).catch(err => console.error("[Email] Shipping email error:", err));
}

function sendReadyForPickupEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !order.customer || !order.customer.email) return;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "W6 Paris <contact@send.w6paris.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "contact@w6paris.com";

  const pickupDetails = order.pickup ? `<p style="margin:4px 0; color:#555;"><strong>Date & créneau demandés :</strong> ${order.pickup.date} à ${order.pickup.time}</p>` : "";

  const html = `
    <div style="font-family:sans-serif; color:#1c1c1c; max-width:600px; margin:0 auto; padding:24px; line-height:1.6;">
      <h1 style="color:#1c1c1c; font-size:24px; font-weight:normal; margin-bottom:8px; letter-spacing:0.04em;">W6 Paris</h1>
      <h2 style="color:#9a7b3f; margin-top:0; font-size:20px;">Votre commande est prête au showroom !</h2>
      <p>Bonjour <strong>${order.customer.name}</strong>,</p>
      <p>Votre commande <strong>${order.id}</strong> a bien été préparée et vous attend dans notre boutique-showroom.</p>

      <div style="background:#f9f8f6; border:1px solid #ede8e0; border-radius:8px; padding:20px; margin:24px 0;">
        <h3 style="margin-top:0; color:#1c1c1c; font-size:16px;">Adresse de retrait</h3>
        <p style="margin:4px 0; font-size:15px; font-weight:600; color:#1c1c1c;">W6 Paris — Boutique Showroom</p>
        <p style="margin:4px 0; color:#555;">12 Rue Boulard, 75014 Paris</p>
        <p style="margin:4px 0; color:#555;"><strong>Horaires :</strong> Du lundi au samedi, de 10h à 19h</p>
        ${pickupDetails}
      </div>

      <p style="font-size:13px; color:#666;">Il vous suffira d'indiquer votre nom et le numéro de commande <strong>${order.id}</strong> lors de votre venue.</p>
      
      <p style="margin-top:30px; font-size:12px; color:#999; border-top:1px solid #eee; padding-top:16px;">
        W6 Paris — 12 Rue Boulard, 75014 Paris · contact@w6paris.com
      </p>
    </div>
  `;

  resend.emails.send({
    from,
    replyTo,
    to: order.customer.email,
    subject: `Votre commande ${order.id} est prête au showroom ! — W6 Paris`,
    html
  }).then(res => {
    if (res.error) console.error("[Email] Pickup notification failed:", res.error);
    else console.log(`[Email] Ready-for-pickup email sent to ${order.customer.email} for order ${order.id}`);
  }).catch(err => console.error("[Email] Ready-for-pickup email error:", err));
}

/* Finalize an order upon verified Stripe payment (idempotent) */
async function finalizeOrder(sessionId) {
  if (!sessionId) return null;
  const orders = loadOrders();
  const existing = orders.find((o) => o.stripeSessionId === sessionId);
  if (existing) return existing;

  const pending = loadPendingCheckouts()[sessionId];
  if (!pending) {
    console.warn("[Stripe] Pending checkout not found for session:", sessionId);
    return null;
  }

  const products = loadProducts();
  const stockOk = decrementStock(products, pending.items);
  if (!stockOk) {
    console.warn("[Stripe] Stock decrement warning during finalization for session:", sessionId);
  }
  saveProducts(products);

  if (pending.promoCode) {
    const promos = loadPromos();
    const target = promos.find((p) => p.code === pending.promoCode);
    if (target) {
      target.uses = (target.uses || 0) + 1;
      savePromos(promos);
    }
  }

  const number = nextOrderNumber(orders);
  const order = {
    id: "W6-" + String(number).padStart(4, "0"),
    number,
    createdAt: Date.now(),
    customer: pending.customer,
    fulfillment: pending.fulfillment,
    deliveryMethod: pending.deliveryMethod,
    weightKg: pending.weightKg,
    address: pending.address,
    pickup: pending.pickup,
    items: pending.items,
    subtotal: pending.subtotal,
    shipping: pending.shipping,
    discount: pending.discount,
    promoCode: pending.promoCode || "",
    total: pending.total,
    status: "nouvelle",
    paymentStatus: "paid",
    stripeSessionId: sessionId,
    tracking: "",
    viewed: false
  };

  orders.push(order);
  saveOrders(orders);
  deletePendingCheckout(sessionId);

  console.log(`[W6] STRIPE PAID ORDER ${order.id} — ${order.total.toFixed(2)}€ — ${order.customer.name}`);
  sendOrderEmail(order);
  return order;
}

/* Stripe webhook event processor */
async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    console.warn("[Stripe Webhook] Received webhook but STRIPE_SECRET_KEY is not set.");
    return res.status(500).send("Stripe not configured");
  }

  const stripe = require("stripe")(stripeKey);
  let event;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      console.warn("[Stripe Webhook] Warning: STRIPE_WEBHOOK_SECRET not provided, payload parsed without signature verification.");
    }
  } catch (err) {
    console.error("[Stripe Webhook] Verification error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event && event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session && session.payment_status === "paid") {
      try {
        await finalizeOrder(session.id);
      } catch (err) {
        console.error("[Stripe Webhook] Error finalizing order:", err);
      }
    }
  }

  res.json({ received: true });
}

/* Checkout session creation endpoint */
app.post("/api/checkout/create-session", orderLimiter, async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: "Stripe payment is not configured yet. Please set STRIPE_SECRET_KEY in environment." });
  }

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
    if (p.stock !== undefined && p.stock < qty) {
      return res.status(400).json({ error: `Rupture de stock pour ${p.name && p.name.fr ? p.name.fr : p.handle}` });
    }
    const price = orderPriceFor(p, it.options);
    const opts = it.options && Object.keys(it.options).length
      ? Object.entries(it.options).map(([k, v]) => k + ": " + v).join(" · ")
      : "";
    const rawOptions = it.options && typeof it.options === "object" ? it.options : {};
    orderItems.push({
      handle: p.handle,
      name: p.name && p.name.fr ? p.name.fr : p.handle,
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
    shipping = shippingFee(address.country, deliveryMethod, weightKg, subtotal, orderProductTypes(orderItems), orderItems);
  } else {
    const date = String(b.pickup && b.pickup.date || "").trim();
    const time = String(b.pickup && b.pickup.time || "").trim();
    if (!date || !time) return res.status(400).json({ error: "pickup date/time required" });
    pickup = { date, time };
  }

  const subtotal = Math.round(orderItems.reduce((s, i) => s + i.line, 0) * 100) / 100;
  const promoCfg = loadPromosConfig();
  if (b.promoCode && !promoCfg.checkoutVisible) {
    return res.status(400).json({ error: "promo codes disabled" });
  }
  const promo = applyPromo(promoCfg.codes, b.promoCode, subtotal);
  if (!promo.ok) {
    return res.status(400).json({ error: "invalid promo code" });
  }
  const discount = promo.discount;
  const total = Math.round((subtotal + shipping - discount) * 100) / 100;

  try {
    const stripe = require("stripe")(stripeKey);

    const line_items = orderItems.map((it) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: it.name,
          description: it.options || undefined
        },
        unit_amount: Math.round(it.price * 100)
      },
      quantity: it.qty
    }));

    const shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: Math.round(shipping * 100),
            currency: "eur"
          },
          display_name: fulfillment === "pickup"
            ? "Retrait showroom 12 Rue Boulard (gratuit)"
            : (deliveryMethod === "home" ? "Livraison à domicile" : "Livraison en point relais")
        }
      }
    ];

    let discounts = undefined;
    if (discount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discount * 100),
        currency: "eur",
        duration: "once",
        name: promo.code || "Réduction"
      });
      discounts = [{ coupon: coupon.id }];
    }

    const origin = process.env.NODE_ENV === "production"
      ? "https://w6paris.com"
      : `${req.protocol}://${req.get("host")}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "link"],
      mode: "payment",
      customer_email: email,
      line_items,
      shipping_options,
      discounts,
      metadata: {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        fulfillment,
        deliveryMethod,
        promoCode: promo.code || ""
      },
      success_url: `${origin}/checkout.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout.html?canceled=true`
    });

    savePendingCheckout(session.id, {
      sessionId: session.id,
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
      total
    });

    res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[Stripe Session Error]", err);
    res.status(500).json({ error: err.message || "Failed to create checkout session" });
  }
});

/* Retrieve completed order by Stripe session ID (for checkout confirmation screen) */
app.get("/api/checkout/session/:id", async (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  if (!sessionId) return res.status(400).json({ error: "missing session id" });

  try {
    let order = loadOrders().find((o) => o.stripeSessionId === sessionId);
    if (!order) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const stripe = require("stripe")(stripeKey);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session && session.payment_status === "paid") {
          order = await finalizeOrder(sessionId);
        }
      }
    }

    if (order) {
      return res.json({
        ok: true,
        order: {
          id: order.id,
          total: order.total,
          customer: order.customer,
          fulfillment: order.fulfillment
        }
      });
    }

    res.status(404).json({ error: "Order not found or payment pending" });
  } catch (err) {
    console.error("[GET /api/checkout/session/:id Error]", err);
    res.status(500).json({ error: err.message });
  }
});

/* Public promo validation (for checkout preview) */
app.get("/api/promo/config", (req, res) => {
  const cfg = loadPromosConfig();
  res.json({ checkoutVisible: cfg.checkoutVisible !== false });
});

app.post("/api/promo/validate", (req, res) => {
  const cfg = loadPromosConfig();
  if (cfg.checkoutVisible === false) {
    return res.json({ ok: false, reason: "disabled" });
  }
  const subtotal = Number((req.body || {}).subtotal) || 0;
  const r = applyPromo(cfg.codes, (req.body || {}).code, subtotal);
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

app.post("/api/account/register", accountLimiter, (req, res) => {
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

app.post("/api/account/login", accountLimiter, (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").toLowerCase().trim();
  const password = String(b.password || "");
  const customers = loadCustomers();
  const c = customers[email];
  if (!c || !safeCompare(hashPassword(password, c.salt), c.hash)) {
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

/* Public order lookup (tracking) - requires order ID and matching customer email */
app.get("/api/orders/:id", (req, res) => {
  const id = String(req.params.id || "").trim().toUpperCase();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!/^W6-\d{3,5}$/.test(id)) return res.status(400).json({ error: "invalid order id" });
  if (!email) return res.status(400).json({ error: "E-mail requis pour consulter la commande" });
  const order = loadOrders().find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: "not found" });
  if (order.customer.email.toLowerCase() !== email) return res.status(403).json({ error: "forbidden" });
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

app.post("/api/admin/login", adminLoginLimiter, (req, res) => {
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
  if (b.freeFrom === null || b.freeFrom === undefined || b.freeFrom === 0) {
    cfg.freeFrom = null;
  } else if (typeof b.freeFrom === "number" && Number.isFinite(b.freeFrom) && b.freeFrom > 0) {
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
  const prevStatus = order.status;
  const prevTracking = order.tracking || "";

  if (status) {
    if (!STATUS_LABELS[status]) return res.status(400).json({ error: "invalid status" });
    order.status = status;
  }
  if (typeof tracking === "string") {
    order.tracking = tracking.trim();
  }
  order.updatedAt = Date.now();
  saveOrders(orders);

  // Auto-send email notifications to customer upon shipping or ready-for-pickup
  const isNowShipped = order.status === "expediee" && (prevStatus !== "expediee" || (order.tracking && !prevTracking));
  const isNowReady = order.status === "prete" && prevStatus !== "prete";

  if (isNowShipped) {
    sendShippingEmail(order);
  } else if (isNowReady) {
    sendReadyForPickupEmail(order);
  }

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

function buildInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Facture " + order.id } });
      const buffers = [];
      doc.on("data", (c) => buffers.push(c));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

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
      reject(e);
    }
  });
}

/* Invoice PDF (single order) */
app.get("/api/admin/orders/:id/invoice", requireAuth, async (req, res) => {
  try {
    const order = loadOrders().find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "unknown order" });
    const buf = await buildInvoicePdf(order);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="facture-' + order.id + '.pdf"');
    res.send(buf);
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
  const cfg = loadPromosConfig();
  res.json({
    checkoutVisible: cfg.checkoutVisible !== false,
    promos: cfg.codes
  });
});

app.post("/api/admin/promos/visibility", requireAuth, (req, res) => {
  const b = req.body || {};
  const cfg = loadPromosConfig();
  cfg.checkoutVisible = !!b.checkoutVisible;
  savePromosConfig(cfg);
  res.json({ ok: true, checkoutVisible: cfg.checkoutVisible });
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
  const cfg = loadPromosConfig();
  const promos = cfg.codes;
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
  savePromosConfig(cfg);
  res.json({ ok: true, promo });
});

app.patch("/api/admin/promos/:code/toggle", requireAuth, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const cfg = loadPromosConfig();
  const target = cfg.codes.find((p) => p.code === code);
  if (!target) return res.status(404).json({ error: "unknown code" });
  target.disabled = !target.disabled;
  savePromosConfig(cfg);
  res.json({ ok: true, code: target.code, disabled: target.disabled });
});

app.delete("/api/admin/promos/:code", requireAuth, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const cfg = loadPromosConfig();
  const next = cfg.codes.filter((p) => p.code !== code);
  if (next.length === cfg.codes.length) return res.status(404).json({ error: "unknown code" });
  cfg.codes = next;
  savePromosConfig(cfg);
  res.json({ ok: true });
});

/* ---------------- contact & newsletter API ---------------- */

app.post("/api/contact", contactLimiter, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const subject = String(b.subject || "").trim();
  const message = String(b.message || "").trim();

  if (!name || !message) {
    return res.status(400).json({ error: "Nom et message requis." });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide." });
  }

  const messages = loadMessages();
  const newMsg = {
    id: "MSG-" + Date.now().toString(36).toUpperCase(),
    createdAt: Date.now(),
    name,
    email,
    subject: subject || "Question générale",
    message,
    read: false
  };
  messages.unshift(newMsg);
  saveMessages(messages);

  console.log(`[W6] Contact message received from ${name} (${email}) — ${subject}`);

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: "W6 Paris <noreply@w6paris.com>",
        to: "contact@w6paris.com",
        replyTo: email,
        subject: `[Contact W6] ${subject || "Nouveau message"} — ${name}`,
        text: `Message de: ${name} (${email})\nSujet: ${subject}\n\n${message}`
      });
    } catch (e) {
      console.error("[Email] Error forwarding contact email:", e.message);
    }
  }

  res.json({ ok: true, message: "Votre message a bien été envoyé." });
});

app.post("/api/newsletter", newsletterLimiter, (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide." });
  }
  const subscribers = loadNewsletter();
  const existing = subscribers.find((s) => s.email === email);
  if (!existing) {
    subscribers.push({ email, createdAt: Date.now() });
    saveNewsletter(subscribers);
  }
  res.json({ ok: true, promoCode: "WELCOME10" });
});

app.get("/api/admin/messages", requireAuth, (req, res) => {
  res.json({ ok: true, messages: loadMessages() });
});

app.delete("/api/admin/messages/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const messages = loadMessages().filter((m) => m.id !== id);
  saveMessages(messages);
  res.json({ ok: true });
});

app.put("/api/admin/messages/:id/read", requireAuth, (req, res) => {
  const id = req.params.id;
  const messages = loadMessages();
  const m = messages.find((x) => x.id === id);
  if (m) m.read = true;
  saveMessages(messages);
  res.json({ ok: true });
});

app.get("/api/admin/newsletter", requireAuth, (req, res) => {
  res.json({ ok: true, subscribers: loadNewsletter() });
});

app.post("/api/admin/test-email", requireAuth, async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "RESEND_API_KEY non configurée dans l'environnement Render." });
  }
  const to = (req.body && req.body.to) ? String(req.body.to).trim() : "contact@w6paris.com";
  const from = process.env.RESEND_FROM || "W6 Paris <contact@send.w6paris.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "contact@w6paris.com";

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      replyTo,
      to,
      subject: "Test de confirmation d'e-mail — W6 Paris",
      html: `
        <div style="font-family:sans-serif; color:#1c1c1c; padding:20px;">
          <h2 style="color:#9a7b3f;">Test d'envoi réussi !</h2>
          <p>Le serveur W6 Paris parvient bien à envoyer des e-mails via Resend.</p>
          <p style="font-size:12px; color:#777;">Envoyé depuis : ${from}<br>Répondre à : ${replyTo}</p>
        </div>
      `
    });
    if (result.error) {
      console.error("[Email Test] Resend API error:", result.error);
      return res.status(400).json({ ok: false, error: result.error.message || JSON.stringify(result.error), details: result.error });
    }
    console.log("[Email Test] Sent successfully:", result.data);
    return res.json({ ok: true, data: result.data });
  } catch (err) {
    console.error("[Email Test] Exception:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* ---------------- admin page ---------------- */

app.get(["/admin", "/admin.html"], (req, res) => {
  res.sendFile(path.join(ROOT, "admin.html"));
});

app.get(["/orders", "/orders.html"], (req, res) => {
  res.sendFile(path.join(ROOT, "orders.html"));
});

/* 404 handler */
app.use((req, res) => {
  if (req.accepts("html")) {
    return res.status(404).sendFile(path.join(ROOT, "404.html"));
  }
  res.status(404).json({ error: "Not found" });
});

/* ---------------- boot ---------------- */

ensureDataDir();
ensureAdminConfig();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[W6] server running on http://localhost:${PORT}`);
  console.log(`[W6] admin dashboard: http://localhost:${PORT}/admin`);
});
