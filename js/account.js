(function () {
  function $(id) { return document.getElementById(id); }

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

  function fmtDate(ms) {
    return new Date(ms).toLocaleDateString(LANG === "en" ? "en-GB" : "fr-FR", {
      day: "2-digit", month: "long", year: "numeric"
    });
  }

  function setTab(tab) {
    document.querySelectorAll(".account-tabs button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    $("accLoginForm").style.display = tab === "login" ? "block" : "none";
    $("accRegisterForm").style.display = tab === "register" ? "block" : "none";
  }

  function showErr(el, msg) {
    el.textContent = msg;
    el.style.display = "block";
  }

  function renderOrders(orders) {
    var wrap = $("accOrders");
    $("accOrdersEmpty").style.display = orders.length ? "none" : "block";
    wrap.innerHTML = orders.map(function (o) {
      var items = (o.items || []).map(function (it) {
        return `<div class="trk-item"><span>${esc(it.name)}${it.options ? " — " + esc(it.options) : ""}</span><span>×${it.qty}</span><span>${money(it.line)}</span></div>`;
      }).join("");
      return `
        <div class="account-order">
          <div class="trk-head">
            <h2>${esc(o.id)}</h2>
            <span class="trk-status">${esc(o.statusLabel)}</span>
          </div>
          <p class="trk-date">${fmtDate(o.createdAt)}</p>
          <div class="trk-items">${items}</div>
          <div class="trk-totals">
            <div class="trk-total"><span>${t("cart.subtotal")}</span><strong>${money(o.subtotal)}</strong></div>
            ${o.shipping ? `<div class="trk-total"><span>${t("checkout.shipping")}</span><strong>${money(o.shipping)}</strong></div>` : ""}
            ${o.discount ? `<div class="trk-total"><span>${t("checkout.discount")}</span><strong>− ${money(o.discount)}</strong></div>` : ""}
            <div class="trk-total trk-grand"><span>${t("checkout.grandTotal")}</span><strong>${money(o.total)}</strong></div>
          </div>
        </div>`;
    }).join("");
  }

  function renderDash(data) {
    $("accAuth").style.display = "none";
    $("accDash").style.display = "block";
    $("accHello").textContent = data.customer.name ? data.customer.name : data.customer.email;
    $("accEmailLabel").textContent = data.customer.email;
    renderOrders(data.orders || []);
  }

  function checkSession() {
    fetch("/api/account/me")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) renderDash(d);
      })
      .catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".account-tabs button").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.dataset.tab); });
    });

    $("accLoginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("accLoginErr");
      err.style.display = "none";
      fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: $("accEmail").value.trim(), password: $("accPass").value })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) renderDash(d);
          else showErr(err, t("account.errInvalid"));
        })
        .catch(function () { showErr(err, t("account.errInvalid")); });
    });

    $("accRegisterForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("accRegErr");
      err.style.display = "none";
      fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: $("accRegName").value.trim(),
          email: $("accRegEmail").value.trim(),
          password: $("accRegPass").value
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (res.ok) renderDash(res.d);
          else if (res.status === 409) showErr(err, t("account.errExists"));
          else if (res.status === 400) showErr(err, t("account.errWeak"));
          else showErr(err, t("account.errGeneric"));
        })
        .catch(function () { showErr(err, t("account.errGeneric")); });
    });

    $("accLogoutBtn").addEventListener("click", function () {
      fetch("/api/account/logout", { method: "POST" }).then(function () {
        location.reload();
      });
    });

    checkSession();
  });
})();