(function () {
  function $(id) { return document.getElementById(id); }

  var FULFILL_KEYS = ["Mode de réception", "Receiving method", "Retrait prévu", "Scheduled pickup"];
  var promoState = { code: "", discount: 0 };
  var promoCheckoutEnabled = true;

  function updatePromoVisibility(visible) {
    promoCheckoutEnabled = visible !== false;
    var promoGroup = $("coPromoGroup");
    var cardTitle = $("coCard3Title");
    if (promoGroup) {
      promoGroup.style.display = promoCheckoutEnabled ? "" : "none";
    }
    if (cardTitle) {
      cardTitle.dataset.i18n = promoCheckoutEnabled ? "checkout.paymentCardTitle" : "checkout.paymentCardTitleWithoutPromo";
      cardTitle.textContent = promoCheckoutEnabled
        ? (t("checkout.paymentCardTitle") || (LANG === "en" ? "3. Promo code & Payment" : "3. Code avantage & Paiement"))
        : (t("checkout.paymentCardTitleWithoutPromo") || (LANG === "en" ? "3. Payment" : "3. Paiement"));
    }
    if (!promoCheckoutEnabled && promoState.code) {
      promoState = { code: "", discount: 0 };
      var promoInput = $("coPromo");
      if (promoInput) promoInput.value = "";
      var promoMsg = $("coPromoMsg");
      if (promoMsg) promoMsg.style.display = "none";
      refreshShipping();
    }
  }

  function cleanOptions(raw) {
    var out = {};
    Object.entries(raw || {}).forEach(function (pair) {
      var k = pair[0], v = pair[1];
      if (FULFILL_KEYS.indexOf(k) === -1 && v !== undefined && v !== null) out[k] = v;
    });
    return out;
  }

  function subtotal() {
    return cart.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
  }

  function renderSummary() {
    var wrap = $("coItems");
    wrap.innerHTML = cart.map(function (item, i) {
      var p = getProduct(item.handle) || {};
      var label = (p.name && p.name[LANG]) ? p.name[LANG] : item.handle;
      var img = (p.images && p.images[0]) ? p.images[0] : "";
      var opts = Object.values(cleanOptions(item.options || {})).join(" · ");
      return `
        <div class="co-line">
          ${img ? `<img src="${img}" alt="${label}">` : ""}
          <div class="co-line-info">
            <h4>${label}</h4>
            ${opts ? `<div class="variant">${opts}</div>` : ""}
            <div class="variant">${item.qty} × ${formatPrice(item.price)}</div>
          </div>
          <div class="co-line-price">${formatPrice(item.qty * item.price)}</div>
        </div>`;
    }).join("");
    $("coSubtotal").textContent = formatPrice(subtotal());
    refreshShipping();
  }

  function deliveryMethod() {
    var b = document.querySelector("#coMethod button.active");
    return b ? b.dataset.method : "relay";
  }

  function cartWeightKg() {
    var total = 0;
    cart.forEach(function (item) {
      var p = getProduct(item.handle) || {};
      var kg = typeof p.weightKg === "number" ? p.weightKg : 0;
      var opts = cleanOptions(item.options || {});
      (p.options || []).forEach(function (o) {
        if (o.key !== "size") return;
        var sel = Object.keys(opts).some(function (k) { return opts[k] === o.values[0].label; })
          ? opts[Object.keys(opts).find(function (k) { return opts[k] === o.values[0].label; })]
          : null;
        if (!sel) sel = Object.values(opts).find(function (v) { return o.values.some(function (x) { return x.label === v; }); });
        var v = sel ? o.values.find(function (x) { return x.label === sel; }) : null;
        if (v && typeof v.weightKg === "number") kg = v.weightKg;
      });
      total += kg * item.qty;
    });
    return Math.round(total * 1000) / 1000;
  }

  function refreshShipping() {
    var mode = document.querySelector("#coFulfillment button.active").dataset.full;
    var shipEl = $("coShipping");
    var totalEl = $("coTotal");
    var discEl = $("coDiscount");
    var discRow = $("coDiscRow");
    var methodFeeEl = $("coMethodFee");
    var sub = subtotal();
    var showDisc = promoState.discount > 0;
    if (discRow) discRow.style.display = showDisc ? "flex" : "none";
    if (discEl) discEl.textContent = "− " + formatPrice(promoState.discount);
    if (mode === "pickup") {
      if (shipEl) shipEl.textContent = formatPrice(0);
      totalEl.textContent = formatPrice(sub - promoState.discount);
      $("coFreeShip").style.display = "none";
      var shipDiscRow = $("coShipDiscRow");
      if (shipDiscRow) shipDiscRow.style.display = "none";
      if (methodFeeEl) methodFeeEl.style.display = "none";
      return;
    }
    var country = $("coCountry").value.trim() || "fr";
    var method = deliveryMethod();
    var weight = cartWeightKg();
    var items = cart.map(function (item) {
      return { handle: item.handle, qty: item.qty, options: cleanOptions(item.options || {}) };
    });
    var qs = "country=" + encodeURIComponent(country)
      + "&method=" + method
      + "&subtotal=" + sub
      + "&weightKg=" + weight
      + "&items=" + encodeURIComponent(JSON.stringify(items));
    fetch("/api/shipping?" + qs)
      .then(function (r) { return r.json(); })
      .then(function (q) {
        var methodData = method === "home" ? q.home : q.relay;
        var relayFee = (q.relay && typeof q.relay.fee === "number") ? q.relay.fee : 0;
        var homeFee = (q.home && typeof q.home.fee === "number") ? q.home.fee : 0;
        var fee = method === "home" ? homeFee : relayFee;
        var baseFee = (methodData && typeof methodData.baseFee === "number") ? methodData.baseFee : fee;
        var discount = (methodData && typeof methodData.discount === "number") ? methodData.discount : 0;
        var isFree = fee === 0;

        if (typeof q.promoCheckoutVisible === "boolean") {
          updatePromoVisibility(q.promoCheckoutVisible);
        }

        if (shipEl) {
          if (discount > 0) {
            shipEl.innerHTML = '<s style="opacity:.5; font-size:12px; font-weight:normal; margin-right:6px;">' + formatPrice(baseFee) + '</s>' + (isFree ? t("checkout.freeShip") : formatPrice(fee));
          } else {
            shipEl.textContent = isFree ? t("checkout.freeShip") : formatPrice(fee);
          }
        }

        var shipDiscRow = $("coShipDiscRow");
        var shipDiscLabel = $("coShipDiscLabel");
        var shipDiscVal = $("coShipDisc");
        if (shipDiscRow) {
          if (discount > 0) {
            shipDiscRow.style.display = "flex";
            var prodLabel = q.discountLabel ? " (" + q.discountLabel + ")" : "";
            if (shipDiscLabel) shipDiscLabel.textContent = t("checkout.shippingDiscount") + prodLabel;
            if (shipDiscVal) shipDiscVal.textContent = "− " + formatPrice(discount);
          } else {
            shipDiscRow.style.display = "none";
          }
        }

        totalEl.textContent = formatPrice(sub + fee - promoState.discount);

        var freeEl = $("coFreeShip");
        if (freeEl) {
          freeEl.style.display = isFree ? "block" : "none";
          freeEl.textContent = t("checkout.freeShip") + " !";
        }

        var relayBtn = document.querySelector('#coMethod button[data-method="relay"]');
        var homeBtn = document.querySelector('#coMethod button[data-method="home"]');

        var relayLabel = t("checkout.deliveryRelay");
        var homeLabel = t("checkout.deliveryHome");

        if (relayBtn && q.relay) {
          var rText = "";
          var rBase = typeof q.relay.baseFee === "number" ? q.relay.baseFee : q.relay.fee;
          var rDisc = typeof q.relay.discount === "number" ? q.relay.discount : 0;
          if (relayFee === 0) {
            rText = t("checkout.freeShip");
            if (rDisc > 0) {
              rText += ' <span style="font-size:11px;opacity:.7;">(' + t("checkout.insteadOf") + ' ' + formatPrice(rBase) + ')</span>';
            }
          } else {
            rText = "+ " + formatPrice(relayFee);
            if (rDisc > 0) {
              rText += ' <span style="font-size:11px;opacity:.7;">(' + t("checkout.insteadOf") + ' ' + formatPrice(rBase) + ')</span>';
            }
          }
          relayBtn.innerHTML = relayLabel + " · " + rText;
        }

        if (homeBtn && q.home) {
          var hText = "";
          var hBase = typeof q.home.baseFee === "number" ? q.home.baseFee : q.home.fee;
          var hDisc = typeof q.home.discount === "number" ? q.home.discount : 0;
          if (homeFee === 0) {
            hText = t("checkout.freeShip");
            if (hDisc > 0) {
              hText += ' <span style="font-size:11px;opacity:.7;">(' + t("checkout.insteadOf") + ' ' + formatPrice(hBase) + ')</span>';
            }
          } else {
            hText = "+ " + formatPrice(homeFee);
            if (hDisc > 0) {
              hText += ' <span style="font-size:11px;opacity:.7;">(' + t("checkout.insteadOf") + ' ' + formatPrice(hBase) + ')</span>';
            }
          }
          homeBtn.innerHTML = homeLabel + " · " + hText;
        }

        if (methodFeeEl) {
          methodFeeEl.style.display = "block";
          var curData = method === "home" ? q.home : q.relay;
          var curFee = method === "home" ? homeFee : relayFee;
          var curDisc = curData && typeof curData.discount === "number" ? curData.discount : 0;
          var discNote = curDisc > 0 ? (LANG === "fr" ? " — Remise de " + formatPrice(curDisc) + " appliquée" : " — " + formatPrice(curDisc) + " discount applied") : "";

          if (method === "relay") {
            methodFeeEl.textContent = relayFee === 0
              ? (LANG === "fr" ? "Point Relais · Livraison offerte" + discNote : "Pickup point · Free delivery" + discNote)
              : (LANG === "fr" ? "Point Relais · +" + formatPrice(relayFee) + discNote : "Pickup point · +" + formatPrice(relayFee) + discNote);
          } else {
            methodFeeEl.textContent = homeFee === 0
              ? (LANG === "fr" ? "Livraison à domicile · Offerte" + discNote : "Home delivery · Free" + discNote)
              : (LANG === "fr" ? "Livraison à domicile · +" + formatPrice(homeFee) + discNote : "Home delivery · +" + formatPrice(homeFee) + discNote);
          }
        }
      })
      .catch(function () { /* server unavailable -> shipping 0 */ });
  }

  function setMethod(method) {
    var buttons = document.querySelectorAll("#coMethod button");
    buttons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.method === method);
    });
    refreshShipping();
  }

  function applyPromo() {
    if (!promoCheckoutEnabled) return;
    var input = $("coPromo");
    var code = input.value.trim();
    var msg = $("coPromoMsg");
    msg.style.display = "none";
    if (!code) { promoState = { code: "", discount: 0 }; refreshShipping(); return; }
    fetch("/api/promo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, subtotal: subtotal() })
    })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (q.ok) {
          promoState = { code: q.code, discount: q.discount };
          input.value = q.code;
          msg.style.display = "block";
          msg.style.color = "var(--accent)";
          msg.textContent = "− " + formatPrice(q.discount);
        } else {
          promoState = { code: "", discount: 0 };
          msg.style.display = "block";
          msg.style.color = "#b3261e";
          msg.textContent = t("checkout.promoInvalid");
        }
        refreshShipping();
      })
      .catch(function () { promoState = { code: "", discount: 0 }; refreshShipping(); });
  }

  function setFulfillment(mode) {
    var buttons = document.querySelectorAll("#coFulfillment button");
    buttons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.full === mode);
    });
    $("coDelivery").style.display = mode === "delivery" ? "block" : "none";
    $("coPickup").style.display = mode === "pickup" ? "block" : "none";
    refreshShipping();
  }

  function showError(msg) {
    var el = $("coError");
    el.textContent = msg;
    el.style.display = "block";
  }

  function buildPayload() {
    var mode = document.querySelector("#coFulfillment button.active").dataset.full;
    var payload = {
      customer: {
        name: $("coName").value.trim(),
        email: $("coEmail").value.trim(),
        phone: $("coPhone").value.trim()
      },
      fulfillment: mode,
      items: cart.map(function (item) {
        return {
          handle: item.handle,
          qty: item.qty,
          options: cleanOptions(item.options || {})
        };
      })
    };
    if (mode === "delivery") {
      payload.deliveryMethod = deliveryMethod();
      payload.address = {
        line1: $("coAddr").value.trim(),
        zip: $("coZip").value.trim(),
        city: $("coCity").value.trim(),
        country: $("coCountry").value.trim()
      };
    } else {
      payload.pickup = {
        date: $("coDate").value,
        time: $("coTime").value
      };
    }
    if (promoState.code) payload.promoCode = promoState.code;
    return payload;
  }

  function validate(payload) {
    if (!payload.customer.name) return t("checkout.errRequired");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.customer.email)) return t("checkout.errRequired");
    if (payload.fulfillment === "delivery") {
      if (!payload.address.line1 || !payload.address.zip || !payload.address.city) return t("checkout.errRequired");
    } else {
      if (!payload.pickup.date || !payload.pickup.time) return t("checkout.errRequired");
    }
    return "";
  }

  function submitOrder() {
    var payload = buildPayload();
    var err = validate(payload);
    if (err) { showError(err); return; }

    var btn = document.querySelector('#coForm button[type="submit"]');
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Redirection vers le paiement sécurisé…";
    $("coError").style.display = "none";

    fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (j) {
            throw new Error(j.error || "HTTP " + r.status);
          });
        }
        return r.json();
      })
      .then(function (res) {
        if (res.url) {
          window.location.href = res.url;
        } else {
          throw new Error("No checkout URL returned");
        }
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.innerHTML = original;
        showError(t("checkout.errSubmit") + " (" + e.message + ")");
      });
  }

  function handleReturnFromStripe() {
    var params = new URLSearchParams(window.location.search);
    var sessionId = params.get("session_id");
    var canceled = params.get("canceled");

    if (canceled) {
      var coCanceled = $("coCanceled");
      if (coCanceled) {
        coCanceled.textContent = t("checkout.canceledNotice") || "Paiement non finalisé. Vos articles sont conservés.";
        coCanceled.style.display = "block";
      }
    }

    if (sessionId) {
      localStorage.removeItem(CART_KEY);
      cart = [];
      if (typeof updateCartUI === "function") updateCartUI();

      $("coLayout").style.display = "none";
      $("coSuccess").style.display = "block";
      $("coOrderId").textContent = "Confirmation en cours…";

      fetch("/api/checkout/session/" + encodeURIComponent(sessionId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.order) {
            $("coOrderId").textContent = data.order.id;
          } else {
            $("coOrderId").textContent = "Paiement validé";
          }
        })
        .catch(function () {
          $("coOrderId").textContent = "Paiement validé";
        });
      return true;
    }
    return false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var isConfirmed = handleReturnFromStripe();
    if (isConfirmed) return;

    renderSummary();
    document.querySelectorAll("#coFulfillment button").forEach(function (b) {
      b.addEventListener("click", function () { setFulfillment(b.dataset.full); });
    });
    document.querySelectorAll("#coMethod button").forEach(function (b) {
      b.addEventListener("click", function () { setMethod(b.dataset.method); });
    });
    $("coCountry").addEventListener("change", refreshShipping);
    $("coPromoBtn").addEventListener("click", applyPromo);
    $("coPromo").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });
    $("coForm").addEventListener("submit", function (e) { e.preventDefault(); submitOrder(); });

    fetch("/api/account/me")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok || !d.customer) return;
        if (!$("coName").value) $("coName").value = d.customer.name || "";
        if (!$("coEmail").value) $("coEmail").value = d.customer.email || "";
      })
      .catch(function () {});

    fetch("/api/promo/config")
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (q && typeof q.checkoutVisible === "boolean") {
          updatePromoVisibility(q.checkoutVisible);
        }
      })
      .catch(function () {});

    if (cart.length === 0) {
      $("coLayout").style.display = "none";
      $("coEmpty").style.display = "block";
    }
  });
})();
