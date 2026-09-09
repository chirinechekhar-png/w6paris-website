/* W6 PARIS — main JS: language, header/footer, cart */

const LANG = (localStorage.getItem("w6lang") || "fr");
const t = (key) => {
  const keys = key.split(".");
  let obj = I18N[LANG];
  for (const k of keys) obj = obj ? obj[k] : undefined;
  return obj || key;
};

/* ---------- Language toggle ---------- */
function initLanguage() {
  document.documentElement.lang = LANG;
  const toggle = document.getElementById("langToggle");
  if (toggle) toggle.textContent = LANG === "fr" ? "EN" : "FR";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
}

function toggleLang() {
  localStorage.setItem("w6lang", LANG === "fr" ? "en" : "fr");
  window.location.reload();
}

/* ---------- Cart ---------- */
const CART_KEY = "w6cart";
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }

/* ---------- Live stock ---------- */
function totalStock(p) {
  const s = p && p.stock;
  if (s == null) return 0;
  if (typeof s === "number") return s;
  return Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
}

function variantStock(p, label) {
  const s = p && p.stock;
  if (s && typeof s === "object") return Number(s[label]) || 0;
  return Number(s) || 0;
}

function stockOf(handle) {
  return totalStock(getProduct(handle));
}

function soldOut(handle) {
  return totalStock(getProduct(handle)) <= 0;
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
}

function cartCount() {
  return cart.reduce((s, i) => s + i.qty, 0);
}

function updateCartUI() {
  const countEls = document.querySelectorAll(".cart-count");
  countEls.forEach((el) => (el.textContent = cartCount()));
}

function addToCart(item) {
  if (soldOut(item.handle)) {
    alert(t("product.soldOut"));
    return;
  }
  const existing = cart.find(
    (i) => i.handle === item.handle && JSON.stringify(i.options) === JSON.stringify(item.options)
  );
  if (existing) existing.qty += item.qty;
  else cart.push({ ...item });
  saveCart();
  renderCart();
  openCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

function changeQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  saveCart();
  renderCart();
}

function openCart() {
  document.getElementById("cartOverlay").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  document.getElementById("cartOverlay").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");
  document.body.style.overflow = "";
}

function renderCart() {
  const wrap = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  const empty = document.getElementById("cartEmpty");
  if (!wrap) return;

  const freeShipEl = document.getElementById("cartFreeShip");
  if (cart.length === 0) {
    wrap.innerHTML = "";
    if (empty) empty.style.display = "block";
    if (totalEl) totalEl.textContent = "€0,00";
    if (freeShipEl) freeShipEl.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";

  let total = 0;
  wrap.innerHTML = cart.map((item, i) => {
    const p = getProduct(item.handle) || {};
    total += item.qty * item.price;
    const img = (p.images && p.images[0]) ? p.images[0] : "";
    const opts = Object.values(item.options || {}).join(" · ");
    const label = (p.name && p.name[LANG]) ? p.name[LANG] : item.handle;
    return `
      <div class="cart-line">
        <img src="${img}" alt="${label}">
        <div class="cart-line-info">
          <h4>${label}</h4>
          ${opts ? `<div class="variant">${opts}</div>` : ""}
          <div class="cart-line-qty">
            <button onclick="changeQty(${i}, -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="changeQty(${i}, 1)">+</button>
          </div>
          <button class="cart-remove" onclick="removeFromCart(${i})">${t("cart.remove")}</button>
        </div>
        <div class="cart-line-price">${formatPrice(item.price * item.qty)}</div>
      </div>`;
  }).join("");

  if (totalEl) totalEl.textContent = formatPrice(total);

  if (freeShipEl) {
    const hasDiffusers = cart.some((it) => {
      const p = getProduct(it.handle) || {};
      return p.type === "diffuser" || p.type === "bundle";
    });
    const hasOnlyOils = cart.length > 0 && cart.every((it) => {
      const p = getProduct(it.handle) || {};
      return p.type === "oil";
    });

    let msg = "";
    if (hasOnlyOils) {
      msg = (LANG === "fr")
        ? `<strong>Point Relais offert</strong> en France, Belgique, Luxembourg & Pays-Bas`
        : `<strong>Complimentary pickup point delivery</strong> in France, Belgium, Luxembourg & Netherlands`;
    } else if (hasDiffusers) {
      msg = (LANG === "fr")
        ? `<strong>Point Relais offert</strong> en France métropolitaine`
        : `<strong>Complimentary pickup point delivery</strong> in France`;
    } else {
      msg = (LANG === "fr")
        ? `<strong>Point Relais offert</strong> selon éligibilité`
        : `<strong>Complimentary pickup point delivery</strong> based on location`;
    }
    freeShipEl.style.display = "block";
    freeShipEl.innerHTML = `
      <div class="cart-fs-text cart-fs-unlocked">${msg}</div>
    `;
  }
}

window.checkout = function () {
  if (cart.length === 0) {
    alert(t("cart.empty"));
    return;
  }
  location.href = "checkout.html";
};

/* ---------- Header / Footer injection ---------- */
function injectChrome() {
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="announce" data-i18n="announce">${t("announce")}</div>
    <header class="site-header">
      <div class="header-inner">
        <a href="index.html" class="brand"><img src="images/logo.png" alt="W6 Paris"></a>
        <nav class="nav" data-nav></nav>
        <div class="header-actions">
          <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Menu">☰</button>
          <button class="lang-toggle" id="langToggle" onclick="toggleLang()"></button>
          <a class="icon-btn icon-account" href="account.html" title="${t("account.title")}">${t("account.title")}</a>
          <button class="icon-btn" onclick="openCart()">
            ${t("cart.title")} <span class="cart-count">${cartCount()}</span>
          </button>
        </div>
      </div>
    </header>`);

  const nav = document.querySelector("[data-nav]");
  const links = ["home", "diffusers", "fragrances", "pack", "about", "contact"];
  const hrefs = { home: "index.html", diffusers: "shop.html", fragrances: "fragrances.html", pack: "product.html?p=pack-duo", about: "about.html", contact: "contact.html" };
  nav.innerHTML = links
    .map((l) => `<a href="${hrefs[l]}" data-nav-link="${l}">${t(`nav.${l}`)}</a>`)
    .join("");

  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

  window.toggleMobileMenu = function () {
    nav.classList.toggle("open");
  };

  document.querySelectorAll("[data-nav-link]").forEach((a) => {
    const page = document.body.dataset.page;
    if (a.dataset.navLink === page) a.classList.add("active");
  });

  document.body.insertAdjacentHTML("beforeend", `
    <div class="cart-overlay" id="cartOverlay" onclick="closeCart()"></div>
    <aside class="cart-drawer" id="cartDrawer">
      <div class="cart-drawer-head">
        <h3>${t("cart.title")}</h3>
        <button class="cart-close" onclick="closeCart()">&times;</button>
      </div>
      <div class="cart-freeship" id="cartFreeShip" style="display:none"></div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-items" id="cartEmpty" style="display:none">
        <div class="cart-empty">
          <p>${t("cart.empty")}</p>
          <a class="btn mt-2" href="shop.html">${t("cart.explore")}</a>
        </div>
      </div>
      <div class="cart-foot">
        <div class="cart-total">
          <span>${t("cart.subtotal")}</span>
          <strong id="cartTotal">€0,00</strong>
        </div>
        <button class="btn btn-solid add-to-cart" onclick="checkout()">${t("cart.checkout")}</button>
        <p class="checkout-note">${t("cart.note")}</p>
      </div>
    </aside>
    <div class="concierge-floating" id="conciergeBadge">
      <a href="mailto:contact@w6paris.com?subject=${encodeURIComponent(LANG === 'fr' ? 'Demande de conseil personnalisé — W6 Paris' : 'Fragrance advice inquiry — W6 Paris')}" class="concierge-pill" title="${LANG === 'fr' ? 'Écrivez-nous · Réponse rapide garantie' : 'Email us · Fast response'}">
        <span class="concierge-icon">✉</span>
        <span class="concierge-text">
          <span class="concierge-title">${LANG === 'fr' ? 'Conseil personnalisé ?' : 'Need fragrance advice?'}</span>
          <span class="concierge-sub">${LANG === 'fr' ? 'Écrivez-nous · Réponse rapide' : 'Email us · Fast response'}</span>
        </span>
      </a>
    </div>`);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });
}

function injectFooter() {
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <img src="images/logo.png" alt="W6 Paris">
            <p>${t("footer.tagline")}</p>
            <p style="margin-top:14px;">${t("home.storeAddress")}</p>
            <p style="font-size:13px;opacity:.85;"><a href="mailto:contact@w6paris.com" style="color:var(--muted);text-decoration:underline;">contact@w6paris.com</a></p>
            <p style="font-size:12px;color:#bfa068;margin-top:10px;">${LANG === 'fr' ? 'Une question ? Écrivez-nous — Réponse rapide garantie.' : 'Questions? Email us — Rapid reply guaranteed.'}</p>
          </div>
          <div class="footer-col">
            <h4>${t("footer.careTitle")}</h4>
            <a href="contact.html">${t("footer.care.contact")}</a>
            <a href="shipping.html">${t("footer.care.shipping")}</a>
            <a href="tracking.html">${t("footer.care.tracking")}</a>
            <a href="refund-policy.html">${t("footer.care.returns")}</a>
            <a href="faq.html">${t("footer.care.faq")}</a>
          </div>
          <div class="footer-col">
            <h4>${t("footer.infoTitle")}</h4>
            <a href="about.html">${t("footer.info.about")}</a>
            <a href="account.html">${t("footer.info.account")}</a>
            <a href="terms.html">${t("footer.info.terms")}</a>
            <a href="privacy-policy.html">${t("footer.info.privacy")}</a>
            <a href="refund-policy.html">${t("footer.info.refund")}</a>
            <a href="mentions-legales.html">${t("footer.info.legal")}</a>
          </div>
          <div class="footer-col">
            <h4>${t("footer.socialsTitle")}</h4>
            <a href="https://www.instagram.com/w6paris/" target="_blank" rel="noopener">Instagram</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2026 W6 Paris. ${t("footer.rights")}.</span>
          <span>${t("footer.madein")}</span>
        </div>
      </div>
    </footer>`);
}

/* ---------- Quick add from cards ---------- */
window.quickAdd = function (handle) {
  const p = getProduct(handle);
  if (!p) return;
  const opts = {};
  const opt = (p.options || []).find((x) => !x.free);
  const sizeOpt = (p.options || []).find((x) => x.key === "size");
  let price = p.type === "oil" ? (sizeOpt && sizeOpt.values && sizeOpt.values[0] ? sizeOpt.values[0].price : 23.99) : p.price;
  if (opt && opt.values && opt.values.length) {
    opts[opt.name[LANG]] = opt.values[0].label;
    if (sizeOpt && sizeOpt.values && sizeOpt.values[0]) {
      price = sizeOpt.values[0].price || price;
    }
  }
  addToCart({ handle, qty: 1, price, options: opts });
};

/* ---------- Product card ---------- */
function basePrice(p) {
  if (p.type === "oil") {
    const sizeOpt = (p.options || []).find((x) => x.key === "size");
    return (sizeOpt && sizeOpt.values && sizeOpt.values[0] ? sizeOpt.values[0].price : 23.99);
  }
  return p.price;
}

function productCard(p, opts = {}) {
  const name = p.name[LANG];
  const type = p.type === "oil"
    ? `<div class="card-type">${p.family[LANG]}</div>`
    : p.type === "bundle"
      ? `<div class="card-type">${p.family[LANG]}</div>`
      : "";
  const badge = p.badge ? `<span class="card-badge">${p.badge[LANG]}</span>` : "";
  const out = soldOut(p.handle);
  const badgeOut = out ? `<span class="card-badge card-badge-out">${t("product.soldOut")}</span>` : "";
  const second = p.images[1] ? `<img class="second" src="${p.images[1]}" alt="${name}">` : "";
  let priceHtml;
  if (p.type === "oil") priceHtml = `<div class="card-price">${t("product.from")} ${formatPrice(basePrice(p))}</div>`;
  else if (p.compareAt) priceHtml = `<div class="card-price">${formatPrice(p.price)} <s style="opacity:.5">${formatPrice(p.compareAt)}</s></div>`;
  else priceHtml = `<div class="card-price">${formatPrice(p.price)}</div>`;

  return `
    <div class="card fade-in${out ? " is-out" : ""}">
      <a href="product.html?p=${p.handle}">
        <div class="media">
          ${badge}
          ${badgeOut}
          <img class="first" src="${p.images[0]}" alt="${name}">
          ${second}
        </div>
      </a>
      <div class="card-body">
        ${type}
        <h3><a href="product.html?p=${p.handle}">${name}</a></h3>
        ${priceHtml}
        <button class="card-add" onclick="event.stopPropagation(); quickAdd('${p.handle}')"${out ? " disabled" : ""}>
          ${out ? t("product.soldOut") : t("product.addToCart")}
        </button>
      </div>
    </div>`;
}

function fragranceCard(p) {
  return productCard(p);
}

/* ---------- Render collections ---------- */
function renderDiffusersGrid(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = diffuserProducts().map((p) => productCard(p)).join("");
}

function renderFragranceGrid(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = oilProducts().map((p) => fragranceCard(p)).join("");
}

function renderOilsGrid(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = oilProducts().map((p) => productCard(p)).join("");
}

function renderPacksGrid(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = PRODUCTS.filter((p) => p.type === "bundle").map((p) => productCard(p)).join("");
}

/* ---------- Init ---------- */
async function loadLiveStock() {
  try {
    const r = await fetch("/api/products", { cache: "no-store" });
    if (!r.ok) return;
    const serverProducts = await r.json();
    const list = Object.values(serverProducts || {});
    if (list.length > 0) {
      PRODUCTS.length = 0;
      PRODUCTS.push(...list);
    }
  } catch (e) {
    /* opened offline / via file:// -> fall back to data.js defaults */
  }
}

document.addEventListener("DOMContentLoaded", () => {
  injectChrome();
  injectFooter();
  initLanguage();
  renderCart();
  updateCartUI();
  document.querySelectorAll(".newsletter-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = form.querySelector("button");
      const input = form.querySelector("input");
      const email = input ? input.value.trim() : "";
      if (!email) return;

      const original = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "…";
      }

      fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })
        .then((r) => r.json())
        .then((res) => {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "✓ WELCOME10";
            setTimeout(() => { btn.textContent = original; }, 4000);
          }
          if (input) input.value = "";
          const note = form.parentElement ? form.parentElement.querySelector(".newsletter-note") : null;
          if (note) {
            note.textContent = LANG === "fr"
              ? "Merci ! Utilisez le code WELCOME10 pour profiter de -10%."
              : "Thank you! Use code WELCOME10 for 10% off your order.";
            note.style.color = "var(--accent)";
          }
        })
        .catch(() => {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original;
          }
        });
    });
  });
  loadLiveStock().then(() => {
    if (window.initPage) window.initPage();
  });
});
