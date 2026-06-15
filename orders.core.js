(function () {
  "use strict";

  if (!window.FIREBASE_CONFIG || !window.MarketsConfig || !window.OrderLifecycle) {
    var list = document.getElementById("ordersList");
    if (list) list.innerHTML = '<p class="empty-msg" style="color:#b91c1c">Config missing from this folder.</p>';
    return;
  }
  if (typeof firebase === "undefined") {
    var list2 = document.getElementById("ordersList");
    if (list2) list2.innerHTML = '<p class="empty-msg" style="color:#b91c1c">Firebase failed to load.</p>';
    return;
  }

  const OL = window.OrderLifecycle;
  const getMarketLabel = window.MarketsConfig.getMarketLabel;
  const ORDER_STATUSES = OL.ORDER_STATUSES;
  const normalizeOrderStatus = OL.normalizeOrderStatus;
  const orderNumberDisplay = OL.orderNumberDisplay;
  const groupItemsByCategory = OL.groupItemsByCategory;
  const isOrderClosed = OL.isOrderClosed;
  const writeOrderInboxNotifications = OL.writeOrderInboxNotifications;

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  try { db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) {}

  const I18N = {
    tr: {
      pageTitle: "Siparislerim",
      searchLink: "Arama",
      cartLink: "Sepet",
      noOrders: "Henuz siparis yok.",
      startShopping: "Alisverise basla",
      orderNumber: "Siparis no",
      waiting: "Siparis hazirlaniyor",
      onTheWay: "Yolda",
      arrived: "Teslim edildi",
      available: "Mevcut",
      unavailable: "Yok",
      driver: "Surucu",
      trackDriver: "Surucuyu haritada ac",
      driverWaiting: "Surucu konumu henuz paylasilmadi",
      chatTitle: "Market ile sohbet",
      chatPlaceholder: "Market'e mesaj yazin...",
      send: "Gonder",
      market: "Market",
      unknown: "Bilinmiyor",
      feedbackTitle: "Teslimat geri bildirimi",
      feedbackPlaceholder: "Teslimat deneyiminizi paylasin...",
      feedbackSend: "Gonder",
      feedbackThanks: "Geri bildiriminiz icin tesekkurler!",
      orderClosed: "Siparis kapatildi",
    },
    en: {
      pageTitle: "My Orders",
      searchLink: "Search",
      cartLink: "Cart",
      noOrders: "No orders yet.",
      startShopping: "Start shopping",
      orderNumber: "Order no",
      waiting: "Waiting / preparing",
      onTheWay: "On the way",
      arrived: "Arrived",
      available: "Available",
      unavailable: "Unavailable",
      driver: "Driver",
      trackDriver: "Open driver on map",
      driverWaiting: "Driver location not shared yet",
      chatTitle: "Chat with market",
      chatPlaceholder: "Message the market...",
      send: "Send",
      market: "Market",
      unknown: "Unknown",
      feedbackTitle: "Delivery feedback",
      feedbackPlaceholder: "Share your delivery experience...",
      feedbackSend: "Send",
      feedbackThanks: "Thank you for your feedback!",
      orderClosed: "Order closed",
    },
    ar: {
      pageTitle: "طلباتي",
      searchLink: "البحث",
      cartLink: "السلة",
      noOrders: "لا توجد طلبات بعد.",
      startShopping: "ابدأ التسوق",
      orderNumber: "رقم الطلب",
      waiting: "قيد التحضير",
      onTheWay: "في الطريق",
      arrived: "تم التسليم",
      available: "متوفر",
      unavailable: "غير متوفر",
      driver: "السائق",
      trackDriver: "فتح السائق على الخريطة",
      driverWaiting: "لم يتم مشاركة موقع السائق بعد",
      chatTitle: "الدردشة مع السوق",
      chatPlaceholder: "اكتب رسالة للسوق...",
      send: "إرسال",
      market: "السوق",
      unknown: "غير معروف",
      feedbackTitle: "ملاحظات التسليم",
      feedbackPlaceholder: "شارك تجربة التسليم...",
      feedbackSend: "إرسال",
      feedbackThanks: "شكراً على ملاحظاتك!",
      orderClosed: "تم إغلاق الطلب",
    },
  };

  const userName = localStorage.getItem("user_name");
  const userUid = localStorage.getItem("user_uid");
  let currentLang = localStorage.getItem("app_lang") || "tr";
  let currentOrders = [];
  const chatUnsubscribers = new Map();

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
    document.getElementById("searchLink").textContent = t("searchLink");
    document.getElementById("cartLink").textContent = t("cartLink");
    document.title = t("pageTitle");
    if (userName) document.getElementById("userGreet").textContent = userName;
  }

  function statusLabel(status) {
    if (isOrderClosed(status)) return t("orderClosed");
    const normalized = normalizeOrderStatus(status);
    return {
      waiting: t("waiting"),
      "on-the-way": t("onTheWay"),
      arrived: t("arrived"),
    }[normalized] || normalized;
  }

  function statusClass(status) {
    if (isOrderClosed(status)) return "status-closed";
    return "status-" + normalizeOrderStatus(status || "waiting").replace(/\s+/g, "-");
  }

  function formatPrice(price) {
    return Number(price || 0).toFixed(2).replace(".", ",") + " TL";
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function renderTrack(status) {
    if (isOrderClosed(status)) {
      return '<div class="status-track">' +
        ORDER_STATUSES.map(function (s) {
          return '<div class="track-step done">' + escapeHtml(statusLabel(s)) + "</div>";
        }).join("") +
        '<div class="track-step done">' + escapeHtml(t("orderClosed")) + "</div></div>";
    }
    const current = ORDER_STATUSES.indexOf(normalizeOrderStatus(status));
    return '<div class="status-track">' +
      ORDER_STATUSES.map(function (s, i) {
        return '<div class="track-step ' + (i < current ? "done" : i === current ? "active" : "") + '">' +
          escapeHtml(statusLabel(s)) + "</div>";
      }).join("") +
      "</div>";
  }

  function driverHtml(order) {
    const driver = order.driver || {};
    const loc = order.driverLocation;
    const normalized = normalizeOrderStatus(order.status);
    let track = "<div>" + escapeHtml(t("driverWaiting")) + "</div>";
    if (loc && loc.lat != null && loc.lng != null) {
      const url = "https://www.google.com/maps?q=" + encodeURIComponent(loc.lat) + "," + encodeURIComponent(loc.lng);
      track = '<a href="' + url + '" target="_blank" rel="noopener">' + escapeHtml(t("trackDriver")) + "</a>";
    }
    return (
      '<div class="driver-box">' +
      "<strong>" + escapeHtml(t("driver")) + "</strong>" +
      (driver.name ? escapeHtml(driver.name) + "<br>" : "") +
      '<span class="status-badge ' + statusClass(normalized) + '">' + escapeHtml(statusLabel(order.status)) + "</span><br>" +
      track +
      "</div>"
    );
  }

  function feedbackHtml(order) {
    if (isOrderClosed(order.status)) {
      return '<div class="feedback-box feedback-closed">' + escapeHtml(t("orderClosed")) + "</div>";
    }
    const normalized = normalizeOrderStatus(order.status);
    if (normalized !== "arrived") return "";
    if (order.feedbackSubmitted) {
      return '<div class="feedback-box feedback-thanks">' + escapeHtml(t("feedbackThanks")) + "</div>";
    }
    return (
      '<div class="feedback-box">' +
      '<div class="feedback-title">' + escapeHtml(t("feedbackTitle")) + "</div>" +
      '<textarea class="feedback-input" id="feedback-input-' + escapeHtml(order.id) + '" placeholder="' +
      escapeHtml(t("feedbackPlaceholder")) + '"></textarea>' +
      '<button class="btn-send" type="button" data-order-action="submit-feedback" data-order-id="' +
      escapeHtml(order.id) + '">' + escapeHtml(t("feedbackSend")) + "</button>" +
      "</div>"
    );
  }

  function renderChatMessages(orderId, messages) {
    const root = document.getElementById("chat-messages-" + orderId);
    if (!root) return;
    root.innerHTML = messages.map(function (msg) {
      const role = msg.senderRole === "market" ? "market" : "customer";
      return (
        '<div class="chat-msg ' + role + '">' +
        '<div class="chat-msg-meta">' + escapeHtml(msg.senderName || t("unknown")) + " · " +
        escapeHtml(formatDate(msg.createdAt)) + "</div>" +
        "<div>" + escapeHtml(msg.text || "") + "</div></div>"
      );
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindChatListener(orderId) {
    if (chatUnsubscribers.has(orderId)) return;
    const unsub = db.collection("orderChats").doc(orderId).collection("messages")
      .orderBy("createdAt", "asc")
      .onSnapshot(function (snapshot) {
        const messages = snapshot.docs.map(function (entry) {
          return Object.assign({ id: entry.id }, entry.data());
        });
        renderChatMessages(orderId, messages);
      });
    chatUnsubscribers.set(orderId, unsub);
  }

  function clearChatListeners(activeOrderIds) {
    chatUnsubscribers.forEach(function (unsub, orderId) {
      if (!activeOrderIds.has(orderId)) {
        unsub();
        chatUnsubscribers.delete(orderId);
      }
    });
  }

  function sendChatMessage(orderId) {
    const input = document.getElementById("chat-input-" + orderId);
    const text = String(input && input.value || "").trim();
    if (!text) return;
    db.collection("orderChats").doc(orderId).collection("messages").add({
      senderId: userUid,
      senderRole: "customer",
      senderName: userName || t("unknown"),
      text: text,
      createdAt: new Date().toISOString(),
    }).then(function () {
      if (input) input.value = "";
    }).catch(function (error) {
      console.error("Chat send failed", error);
    });
  }

  function submitFeedback(orderId) {
    const input = document.getElementById("feedback-input-" + orderId);
    const text = String(input && input.value || "").trim();
    if (!text) return;
    const order = currentOrders.find(function (entry) { return entry.id === orderId; });
    if (!order) return;
    const now = new Date().toISOString();
    const button = document.querySelector('[data-order-action="submit-feedback"][data-order-id="' + orderId + '"]');
    if (button) button.disabled = true;

    db.collection("orders").doc(orderId).update({
      feedback: text,
      feedbackSubmitted: true,
      feedbackAt: now,
      updatedAt: now,
    }).then(function () {
      return writeOrderInboxNotifications(db, {
        inboxType: "order_feedback",
        orderId: orderId,
        orderNumber: order.orderNumber != null ? order.orderNumber : "",
        marketId: order.marketId || "",
        marketName: order.marketName || getMarketLabel(order.marketId),
        message: text,
        userName: userName || t("unknown"),
        userEmail: localStorage.getItem("user_email") || "",
      });
    }).catch(function (error) {
      console.error("Feedback submit failed", error);
      if (button) button.disabled = false;
    });
  }

  function renderOrders(orders) {
    currentOrders = orders;
    const root = document.getElementById("ordersList");
    if (!orders.length) {
      root.innerHTML = '<p class="empty-msg">' + escapeHtml(t("noOrders")) + '<br><a href="index.html">' +
        escapeHtml(t("startShopping")) + "</a></p>";
      clearChatListeners(new Set());
      return;
    }

    const activeIds = new Set(orders.map(function (order) { return order.id; }));
    root.innerHTML = orders.map(function (order) {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsHtml = groupItemsByCategory(items).map(function (group) {
        const rows = group.entries.map(function (entry) {
          const item = entry.item;
          const available = item.available !== false;
          return (
            '<div class="order-item-row' + (available ? "" : " item-unavailable") + '">' +
            "<span>" + escapeHtml(item.name) + " x " + (item.qty || 1) + "</span>" +
            "<span>" +
            '<span class="avail-badge ' + (available ? "avail-yes" : "avail-no") + '">' +
            escapeHtml(available ? t("available") : t("unavailable")) + "</span> " +
            formatPrice((item.price || 0) * (item.qty || 1)) +
            "</span></div>"
          );
        }).join("");
        return '<div class="item-category-block"><div class="item-category-title">' +
          escapeHtml(group.category) + "</div>" + rows + "</div>";
      }).join("");

      const normalizedStatus = normalizeOrderStatus(order.status);
      const showDriver = normalizedStatus !== "waiting" || !!(order.driver && (order.driver.name || order.driver.phone));
      const orderNo = orderNumberDisplay(order);

      return (
        '<div class="order-card">' +
        '<div class="order-header">' +
        "<div>" +
        (orderNo ? '<div class="order-date"><strong>' + escapeHtml(t("orderNumber")) + ":</strong> " +
          escapeHtml(orderNo) + "</div>" : "") +
        '<div class="order-date">' + escapeHtml(formatDate(order.createdAt)) + "</div>" +
        '<div class="order-date">' + escapeHtml(t("market")) + ": " +
          escapeHtml(getMarketLabel(order.marketId || order.marketName)) + "</div>" +
        '<span class="status-badge ' + statusClass(order.status) + '">' +
          escapeHtml(statusLabel(order.status)) + "</span></div>" +
        '<div class="order-total">' + formatPrice(order.totalPrice) + "</div></div>" +
        '<div class="order-items">' + itemsHtml + "</div>" +
        renderTrack(order.status) +
        (showDriver ? driverHtml(order) : "") +
        feedbackHtml(order) +
        '<div class="chat-panel">' +
        '<div class="order-date" style="padding:10px 10px 0;">' + escapeHtml(t("chatTitle")) + "</div>" +
        '<div class="chat-messages" id="chat-messages-' + escapeHtml(order.id) + '"></div>' +
        '<div class="chat-compose">' +
        '<input class="chat-input" id="chat-input-' + escapeHtml(order.id) + '" placeholder="' +
          escapeHtml(t("chatPlaceholder")) + '" />' +
        '<button class="btn-send" type="button" data-order-action="send-chat" data-order-id="' +
          escapeHtml(order.id) + '">' + escapeHtml(t("send")) + "</button>" +
        "</div></div></div>"
      );
    }).join("");

    clearChatListeners(activeIds);
    orders.forEach(function (order) { bindChatListener(order.id); });
  }

  function bindEvents() {
    document.getElementById("langSelect").addEventListener("change", function (event) {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
      renderOrders(currentOrders);
    });

    document.body.addEventListener("click", function (event) {
      const button = event.target.closest("[data-order-action]");
      if (!button) return;
      if (button.dataset.orderAction === "send-chat") {
        sendChatMessage(button.dataset.orderId || "");
      } else if (button.dataset.orderAction === "submit-feedback") {
        submitFeedback(button.dataset.orderId || "");
      }
    });

    document.body.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      const input = event.target.closest(".chat-input");
      if (!input || !input.id.startsWith("chat-input-")) return;
      event.preventDefault();
      sendChatMessage(input.id.replace("chat-input-", ""));
    });
  }

  function boot() {
    if (!userUid) {
      window.location.href = "login.html";
      return;
    }
    if (window.FeatureAccess && !window.FeatureAccess.guardPage()) return;
    applyLanguage();
    bindEvents();
    db.collection("orders").where("userId", "==", userUid).orderBy("createdAt", "desc")
      .onSnapshot(function (snapshot) {
        renderOrders(snapshot.docs.map(function (doc) {
          return Object.assign({ id: doc.id }, doc.data());
        }));
      }, function (error) {
        console.error("Orders listener failed", error);
      });
  }

  if (window.AppSettings && window.AppSettings.ready) {
    window.AppSettings.ready().finally(boot);
  } else {
    boot();
  }
})();
