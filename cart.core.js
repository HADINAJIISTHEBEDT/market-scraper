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
  const auth = firebase.auth();
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
      orderNumber: "Siparis no", error: "Hata", unknown: "Bilinmiyor",
      paymentTitle: "Odeme yontemi", paymentHint: "Odeme, market urunleri onayladiktan sonra tamamlanir.",
      payCash: "Kapida nakit", payCard: "Kapida kart", cardName: "Kart uzerindeki isim",
      cardLast4: "Son 4 hane", cardExpiry: "AA/YY", paymentRequired: "Odeme yontemi secin"
    },
    en: {
      pageTitle: "My Cart", backLink: "Back to Search", ordersLink: "My Orders", emptyCart: "Your cart is empty.",
      searchProducts: "Search for products", each: "each", remove: "Remove", total: "Total", placeOrder: "Place Order",
      orderPlaced: "Your order was placed!", trackOrder: "Track your order", viewOrders: "My Orders",
      orderNumber: "Order no", error: "Error", unknown: "Unknown",
      paymentTitle: "Payment method", paymentHint: "Payment is completed after the market confirms your items.",
      payCash: "Cash on delivery", payCard: "Card on delivery", cardName: "Name on card",
      cardLast4: "Last 4 digits", cardExpiry: "MM/YY", paymentRequired: "Choose a payment method"
    },
    ar: {
      pageTitle: "سلتي", backLink: "العودة إلى البحث", ordersLink: "طلباتي", emptyCart: "سلتك فارغة.",
      searchProducts: "ابحث عن المنتجات", each: "للقطعة", remove: "إزالة", total: "المجموع", placeOrder: "إرسال الطلب",
      orderPlaced: "تم استلام طلبك!", trackOrder: "تتبع طلبك", viewOrders: "طلباتي",
      orderNumber: "رقم الطلب", error: "خطأ", unknown: "غير معروف",
      paymentTitle: "طريقة الدفع", paymentHint: "يتم الدفع بعد أن يؤكد السوق المنتجات.",
      payCash: "نقداً عند التسليم", payCard: "بطاقة عند التسليم", cardName: "الاسم على البطاقة",
      cardLast4: "آخر 4 أرقام", cardExpiry: "شهر/سنة", paymentRequired: "اختر طريقة الدفع"
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

  function getSelectedPaymentMethod() {
    const selected = document.querySelector('input[name="cartPaymentMethod"]:checked');
    return selected ? selected.value : "";
  }

  function paymentSectionHtml() {
    const saved = localStorage.getItem("cart_payment_method") || "cash";
    const cashSelected = saved !== "card" ? " selected" : "";
    const cardSelected = saved === "card" ? " selected" : "";
    return (
      '<div class="payment-box">' +
      "<h2>" + escapeHtml(t("paymentTitle")) + "</h2>" +
      '<p class="pay-hint">' + escapeHtml(t("paymentHint")) + "</p>" +
      '<div class="pay-method-grid">' +
      '<label class="pay-method-option' + cashSelected + '" data-pay-option="cash">' +
      '<input type="radio" name="cartPaymentMethod" value="cash"' + (saved !== "card" ? " checked" : "") + ">" +
      '<span class="pay-method-icon">💵</span><span>' + escapeHtml(t("payCash")) + "</span></label>" +
      '<label class="pay-method-option' + cardSelected + '" data-pay-option="card">' +
      '<input type="radio" name="cartPaymentMethod" value="card"' + (saved === "card" ? " checked" : "") + ">" +
      '<span class="pay-method-icon">💳</span><span>' + escapeHtml(t("payCard")) + "</span></label>" +
      "</div>" +
      '<div id="cartCardFields" class="pay-card-fields' + (saved === "card" ? " visible" : "") + '">' +
      '<input class="pay-field" id="cartCardName" placeholder="' + escapeHtml(t("cardName")) + '" />' +
      '<input class="pay-field" id="cartCardLast4" placeholder="' + escapeHtml(t("cardLast4")) + '" maxlength="4" inputmode="numeric" />' +
      '<input class="pay-field" id="cartCardExpiry" placeholder="' + escapeHtml(t("cardExpiry")) + '" />' +
      "</div></div>"
    );
  }

  function bindPaymentMethodUi() {
    document.querySelectorAll("[data-pay-option]").forEach(function (label) {
      label.addEventListener("click", function () {
        const value = label.getAttribute("data-pay-option") || "cash";
        localStorage.setItem("cart_payment_method", value);
        document.querySelectorAll(".pay-method-option").forEach(function (el) {
          el.classList.toggle("selected", el.getAttribute("data-pay-option") === value);
        });
        const cardFields = document.getElementById("cartCardFields");
        if (cardFields) cardFields.classList.toggle("visible", value === "card");
      });
    });
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
      "</div>" + paymentSectionHtml() +
      '<button class="btn-order" onclick="placeOrder()">' + escapeHtml(t("placeOrder")) + "</button></div>";
    root.innerHTML = html;
    bindPaymentMethodUi();
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

  function buildOrderPayload(orderNumber, paymentMethod, orderItems, total, marketId, marketName) {
    var mapLink = localStorage.getItem("user_map_link") || "";
    var coords = window.OrderLifecycle.parseMapCoordinates
      ? window.OrderLifecycle.parseMapCoordinates(mapLink)
      : null;
    return {
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
      preferredPaymentMethod: paymentMethod,
      paymentSummary: paymentMethod === "card" ? {
        type: "card",
        cardholderName: document.getElementById("cartCardName")?.value.trim() || "",
        last4: document.getElementById("cartCardLast4")?.value.trim() || "",
        expiry: document.getElementById("cartCardExpiry")?.value.trim() || "",
      } : { type: "cash" },
      createdAt: new Date().toISOString()
    };
  }

  function resolveOrderAuth() {
    return Promise.resolve().then(function () {
      if (auth.currentUser) return auth.currentUser.getIdToken(true);
      return new Promise(function (resolve) {
        var done = false;
        var unsub = auth.onAuthStateChanged(function (user) {
          if (done) return;
          done = true;
          try { unsub(); } catch (e) {}
          if (!user) {
            resolve("");
            return;
          }
          user.getIdToken(true).then(resolve).catch(function () { resolve(""); });
        });
        setTimeout(function () {
          if (done) return;
          done = true;
          try { unsub(); } catch (e) {}
          resolve("");
        }, 2500);
      });
    }).then(function (idToken) {
      return {
        idToken: idToken || "",
        uid: userUid,
        sessionToken: localStorage.getItem("server_session_token") || "",
      };
    });
  }

  function placeOrderOnServer(order) {
    return resolveOrderAuth().then(function (authInfo) {
      if (!authInfo.idToken && !authInfo.sessionToken) {
        throw new Error("Sign in again, then place the order.");
      }
      return fetch("/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: authInfo.idToken,
          uid: authInfo.uid,
          sessionToken: authInfo.sessionToken,
          order: order,
        }),
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || data.ok === false) {
            throw new Error(data.error || ("Server order failed (" + response.status + ")"));
          }
          return data.orderNumber || order.orderNumber;
        });
      });
    });
  }

  function allocateOrderNumberSafe() {
    return allocateOrderNumber(db).catch(function (error) {
      console.warn("Order counter unavailable, using local number", error);
      return 1000 + (Date.now() % 900000);
    });
  }

  window.placeOrder = function () {
    if (!userUid) {
      window.location.href = "login.html";
      return;
    }
    const cart = getCart();
    if (!cart.length) return;
    const paymentMethod = getSelectedPaymentMethod();
    if (!paymentMethod) {
      document.getElementById("orderMsg").innerHTML = '<span style="color:#b91c1c">' + escapeHtml(t("paymentRequired")) + "</span>";
      return;
    }
    const total = cart.reduce(function (sum, item) { return sum + (item.price || 0) * (item.qty || 1); }, 0);
    const btn = document.querySelector(".btn-order");
    if (btn) btn.disabled = true;

    const marketId = resolveOrderMarketId(cart);
    const marketName = getMarketLabel(marketId);
    const orderItems = cart.map(function (item) {
      return Object.assign({}, item, { available: item.available !== false });
    });

    allocateOrderNumberSafe().then(function (orderNumber) {
      const order = buildOrderPayload(orderNumber, paymentMethod, orderItems, total, marketId, marketName);
      return db.collection("orders").add(order).then(function () {
        return orderNumber;
      }).catch(function (firestoreError) {
        console.warn("Firestore place order failed, trying server", firestoreError);
        return placeOrderOnServer(order);
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
