(function () {
  function $(id) { return document.getElementById(id); }

  var STEPS = ["nouvelle", "a-preparer", "expediee", "prete", "retiree"];
  var STEP_LABELS = {
    nouvelle: "Nouvelle",
    "a-preparer": "À préparer",
    expediee: "Expédiée",
    prete: "Prête au retrait",
    retiree: "Retirée"
  };
  var TRACKABLE = {
    nouvelle: 1,
    "a-preparer": 2,
    expediee: 3,
    prete: 3,
    retiree: 4
  };

  function money(v) {
    return Number(v || 0).toFixed(2).replace(".", ",") + " €";
  }

  function renderStatus(o) {
    $("trkOrderId").textContent = o.id;
    $("trkStatus").textContent = o.statusLabel;
    $("trkDate").textContent = new Date(o.createdAt).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "long", year: "numeric"
    });
    $("trkTracking").style.display = o.tracking ? "block" : "none";
    if (o.tracking) $("trkTracking").textContent = "Suivi : " + o.tracking;

    $("trkMethod").style.display = "block";
    if (o.fulfillment === "pickup") {
      $("trkMethod").textContent = "Retrait en boutique";
    } else {
      $("trkMethod").textContent = o.deliveryMethod === "home" ? "Livraison à domicile" : "Livraison Point Relais";
    }

    var cur = TRACKABLE[o.status] || 1;
    $("trkSteps").innerHTML = STEPS.map(function (s, i) {
      var n = TRACKABLE[s] || 1;
      var cls = n <= cur ? "done" : "";
      return `<div class="trk-step ${cls}"><span class="trk-dot">${i + 1}</span><label>${STEP_LABELS[s]}</label></div>`;
    }).join("");

    $("trkItems").innerHTML = o.items.map(function (it) {
      return `<div class="trk-item"><span>${it.name}${it.options ? " — " + it.options : ""}</span><span>×${it.qty}</span><span>${money(it.line)}</span></div>`;
    }).join("");

    $("trkSubtotal").textContent = money(o.subtotal);
    $("trkShipping").textContent = money(o.shipping);
    if (o.discount > 0) {
      $("trkDiscRow").style.display = "";
      $("trkDiscount").textContent = "− " + money(o.discount);
    }
    $("trkTotal").textContent = money(o.total);
  }

  function lookup() {
    var id = $("trkId").value.trim();
    var email = $("trkEmail").value.trim();
    var err = $("trkErr");
    err.style.display = "none";
    if (!id || !email) {
      err.textContent = t("tracking.errEmail") || "Veuillez renseigner votre numéro de commande et votre adresse e-mail.";
      err.style.display = "block";
      return;
    }

    fetch("/api/orders/" + encodeURIComponent(id) + "?email=" + encodeURIComponent(email))
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
      })
      .then(function (res) {
        if (res.ok) {
          $("trkResult").style.display = "block";
          $("trkResult").scrollIntoView({ behavior: "smooth", block: "start" });
          renderStatus(res.j);
        } else {
          err.textContent = res.status === 403
            ? t("tracking.errEmail")
            : (res.j && res.j.error) || t("tracking.errNotFound");
          err.style.display = "block";
        }
      })
      .catch(function () {
        err.textContent = t("tracking.errNotFound");
        err.style.display = "block";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("trackForm").addEventListener("submit", function (e) {
      e.preventDefault();
      lookup();
    });
    var p = new URLSearchParams(location.search);
    if (p.get("id")) $("trkId").value = p.get("id");
    if (p.get("email")) $("trkEmail").value = p.get("email");
    if (p.get("id") && p.get("email")) lookup();
  });
})();
