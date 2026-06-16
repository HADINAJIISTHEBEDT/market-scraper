(function () {
  "use strict";

  if (!window.FIREBASE_CONFIG || !window.MarketsConfig || !window.OrderLifecycle) {
    document.getElementById("orderMsg").innerHTML = '<span style="color:#b91c1c">Config missing from this folder.</span>';
    return;
  }
  if (typeof firebase === "undefined") {
    document.getElementById("orderMsg").innerHTML = '<span style="color:#b91c1c">Firebase failed to load.</span>';
    return;
  }

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  try { db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) {}

  const resolveOrderMarketId = window.MarketsConfig.resolveOrderMarketId;
  const getMarketLabel = window.MarketsConfig.getMarketLabel;
  const allocateOrderNumber = window.OrderLifecycle.allocateOrderNumber;
  const formatOrderNumber = window.OrderLifecycle.formatOrderNumber;

  const I18N = {
    tr: {
      pageTitle: "Sepetim", backLink: "Aramaya don", ordersLink: "Siparislerim", emptyCart: "Sepetiniz bos.",
      searchProducts: "Urun ara", each: "adet", remove: "Kaldir", total: "Toplam", placeOrder: "Siparis ver",
      orderPlaced: "Siparisiniz alindi!", trackOrder: "Siparisinizi takip edin", viewOrders: "Siparislerim",
      orderNumber: "Siparis no", error: "Hata", unknown: "Bilinmiyor"
    },
    en: {
      pageTitle: "My Cart", backLink: "Back to Search", ordersLink: "My Orders", emptyCart: "Your cart is empty.",
      searchProducts: "Search for products", each: "each", remove: "Remove", total: "Total", placeOrder: "Place Order",
      orderPlaced: "Your order was placed!", trackOrder: "Track your order", viewOrders: "My Orders",
      orderNumber: "Order no", error: "Error", unknown: "Unknown"
    },
    ar: {
      pageTitle: "سلتي", backLink: "العودة إلى البحث", ordersLink: "طلباتي", emptyCart: "سلتك فارغة.",
      searchProducts: "ابحث عن المنتجات", each: "للقطعة", remove: "إزالة", total: "المجموع", placeOrder: "إرسال الطلب",
      orderPlaced: "تم استلام طلبك!", trackOrder: "تتبع طلبك", viewOrders: "طلباتي",
      orderNumber: "رقم الطلب", error: "خطأ", unknown: "غير معروف"
    }
  };

  const userName = localStorage.getItem("user_name");
  const userUid = localStorage.getItem("user_uid");
  let currentLang = localStorage.getItem("app_lang") || "tr";

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.getElementById("langSelect").value = currentLang;
    document.getElementById("pageTitle").textContent = t("pageTitle");
    document.getElementById("backLink").textContent = t("backLink");
    document.getElementById("ordersLink").textContent = t("viewOrders");
    document.title = t("pageTitle");
    if (userName) document.getElementById("userGreet").textContent = userName;
  }

  function getCart() {
    return JSON.parse(localStorage.getItem("cart") || "[]");
  }

  function saveCart(cart) {
    localStorage.setItem("cart", JSON.stringify(cart));
  }

  function formatPrice(price) {
    if (!price && price !== 0) return "";
    return Number(price).toFixed(2).replace(".", ",") + " TL";
  }

  function renderCart() {
    const cart = getCart();
    const root = document.getElementById("cartList");
    if (!cart.length) {
      root.innerHTML = '<p class="empty-msg">' + escapeHtml(t("emptyCart")) + '<br><a href="index.html">' + escapeHtml(t("searchProducts")) + "</a></p>";
      return;
    }
    let total = 0;
    let html = "";
    cart.forEach(function (item, idx) {
      const subtotal = (item.price || 0) * (item.qty || 1);
      total += subtotal;
      html += '<div class="cart-item">' +
        (item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" onerror="this.style.display=\'none\'">' : "") +
        '<div class="cart-item-info"><div class="cart-item-name">' + escapeHtml(item.name) + '</div>' +
        '<div class="cart-item-price">' + formatPrice(item.price) + " " + escapeHtml(t("each")) + "</div></div>" +
        '<div class="qty-controls"><button class="qty-btn" onclick="changeQty(' + idx + ',-1)">-</button>' +
        '<span class="qty-num">' + (item.qty || 1) + '</span><button class="qty-btn" onclick="changeQty(' + idx + ',1)">+</button></div>' +
        '<div class="cart-item-price">' + formatPrice(subtotal) + '</div>' +
        '<button class="remove-btn" onclick="removeItem(' + idx + ')" title="' + escapeHtml(t("remove")) + '">X</button></div>';
    });
    html += '<div class="cart-summary"><div class="cart-total">' + escapeHtml(t("total")) + ": " + formatPrice(total) +
      '</div><button class="btn-order" onclick="placeOrder()">' + escapeHtml(t("placeOrder")) + "</button></div>";
    root.innerHTML = html;
  }

  window.changeQty = function (idx, delta) {
    const cart = getCart();
    cart[idx].qty = Math.max(1, (cart[idx].qty || 1) + delta);
    saveCart(cart);
    renderCart();
  };

  window.removeItem = function (idx) {
    const cart = getCart();
    cart.splice(idx, 1);
    saveCart(cart);
    renderCart();
  };

  window.placeOrder = function () {
    if (!userUid) {
      window.location.href = "login.html";
      return;
    }
    const cart = getCart();
    if (!cart.length) return;
    const total = cart.reduce(function (sum, item) { return sum + (item.price || 0) * (item.qty || 1); }, 0);
    const btn = document.querySelector(".btn-order");
    if (btn) btn.disabled = true;

    const marketId = resolveOrderMarketId(cart);
    const marketName = getMarketLabel(marketId);
    const orderItems = cart.map(function (item) {
      return Object.assign({}, item, { available: item.available !== false });
    });

    allocateOrderNumber(db).then(function (orderNumber) {
      var mapLink = localStorage.getItem("user_map_link") || "";
      var coords = window.OrderLifecycle.parseMapCoordinates
        ? window.OrderLifecycle.parseMapCoordinates(mapLink)
        : null;
      return db.collection("orders").add({
        userId: userUid,
        userName: userName || t("unknown"),
        userEmail: localStorage.getItem("user_email") || "",
        userPhone: localStorage.getItem("user_phone") || "",
        userAddress: localStorage.getItem("user_address") || "",
        userMapLink: mapLink,
        userPhoto: localStorage.getItem("user_photo") || "",
        userLat: coords ? coords.lat : null,
        userLng: coords ? coords.lng : null,
        marketId: marketId,
        marketName: marketName,
        orderNumber: orderNumber,
        items: orderItems,
        totalPrice: total,
        status: "waiting",
        paymentStatus: "pending",
        createdAt: new Date().toISOString()
      }).then(function () {
        return orderNumber;
      });
    }).then(function (orderNumber) {
      localStorage.removeItem("cart");
      const num = formatOrderNumber(orderNumber);
      document.getElementById("orderMsg").innerHTML =
        '<span style="color:#16a34a"><strong>' + escapeHtml(t("orderPlaced")) + "</strong><br>" +
        escapeHtml(t("orderNumber")) + ": " + escapeHtml(num) + "<br>" +
        escapeHtml(t("trackOrder")) + ' — <a href="orders.html">' + escapeHtml(t("viewOrders")) + "</a></span>";
      document.getElementById("cartList").innerHTML = "";
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      document.getElementById("orderMsg").innerHTML =
        '<span style="color:#b91c1c">' + escapeHtml(t("error")) + ": " + escapeHtml(e.message || String(e)) + "</span>";
    });
  };

  function boot() {
    if (window.FeatureAccess && !window.FeatureAccess.guardPage()) return;
    applyLanguage();
    renderCart();
    document.getElementById("langSelect").addEventListener("change", function (event) {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
      renderCart();
    });
  }

  if (window.AppSettings && window.AppSettings.ready) {
    window.AppSettings.ready().finally(boot);
  } else {
    boot();
  }
})();
