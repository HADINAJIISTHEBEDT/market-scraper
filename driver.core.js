(function () {
  "use strict";

  if (!window.FIREBASE_CONFIG) {
    showBootError("Config missing. Keep firebase-config.global.js in the same folder.");
    return;
  }

  if (typeof firebase === "undefined") {
    showBootError("Firebase failed to load. Check your internet connection.");
    return;
  }

  const OL = window.OrderLifecycle || {};
  const ORDER_STATUSES = OL.ORDER_STATUSES || ["waiting", "on-the-way", "arrived"];
  const normalizeOrderStatus = OL.normalizeOrderStatus || function (s) { return s || "waiting"; };
  const orderNumberDisplay = OL.orderNumberDisplay || function () { return ""; };
  const orderMatchesMarket = OL.orderMatchesMarket || function () { return true; };
  const orderAssignedToDriver = OL.orderAssignedToDriver || function () { return true; };
  const isOrderClosed = OL.isOrderClosed || function () { return false; };
  const isOrderCommunicationActive = OL.isOrderCommunicationActive || function () { return false; };
  const orderChatCollection = OL.orderChatCollection || function (db, id) {
    return db.collection("orderChats").doc(id).collection("messages");
  };
  const writeOrderInboxNotifications = OL.writeOrderInboxNotifications || function () { return Promise.resolve(); };
  const groupItemsByCategory = OL.groupItemsByCategory || function (items) {
    return [{ category: "General", entries: (items || []).map(function (item, index) { return { item: item, index: index }; }) }];
  };
  const getMarketLabel = window.MarketsConfig?.getMarketLabel || function (k) { return k || "Unknown"; };

  const normalizeMarketKey = window.MarketsConfig?.normalizeMarketKey || function (value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  };
  const MARKET_ID = normalizeMarketKey(
    window.DELIVERY_MARKET_ID || window.MARKET_ID || window.DRIVER_MARKET_ID ||
    new URLSearchParams(window.location.search).get("market") || ""
  );
  function driverPhoneKey() { return "driver_phone_" + (MARKET_ID || "default"); }
  let driverPhone = localStorage.getItem(driverPhoneKey()) || "";

  const I18N = {
    tr: {
      pageTitle: "Surucu takibi",
      pageHelp: "Aktif teslimatlar icin canli GPS paylasin ve siparis durumunu guncelleyin.",
      driverPhoneTitle: "Surucu telefonu",
      driverPhoneHelp: "Size atanan siparisleri gormek icin telefon numaranizi girin.",
      driverPhonePlaceholder: "Telefon numaraniz",
      driverPhoneSave: "Devam et",
      marketOnly: "Bu surucu sayfasi sadece kendi marketiniz icindir.",
      wrongMarket: "Gecersiz market. Surucu sayfasini market panelinden acin.",
      ordersTitle: "Aktif teslimatlar",
      noOrders: "Aktif siparis yok.",
      selectOrder: "Takip icin sec",
      activeOrder: "Aktif siparis",
      orderNumber: "Siparis no",
      customer: "Musteri",
      market: "Market",
      phone: "Telefon",
      address: "Adres",
      payment: "Odeme",
      payCash: "Kapida nakit",
      payCard: "Kart",
      cardLast4: "Son 4 hane",
      cardName: "Kart sahibi",
      cardExpiry: "Son kullanma",
      available: "Mevcut",
      unavailable: "Yok",
      waiting: "Siparis hazirlaniyor",
      onTheWay: "Yolda",
      arrived: "Teslim edildi",
      driver: "Surucu",
      updateStatus: "Durumu guncelle",
      startTracking: "Canli takibi baslat",
      stopTracking: "Takibi durdur",
      trackingLive: "Canli konum paylasiliyor",
      trackingStopped: "Takip durduruldu",
      lastUpdate: "Son guncelleme",
      openMap: "Haritada ac",
      locationUnavailable: "Konum alinamadi",
      updated: "Guncellendi",
      unknown: "Bilinmiyor",
      closeOrder: "Siparisi kapat",
      closed: "Siparis kapatildi",
      orderClosed: "Siparis tamamlandi ve kapatildi",
      chatTitle: "Musteri ile sohbet",
      chatPlaceholder: "Musteriye mesaj yazin...",
      send: "Gonder",
      voiceCall: "Musteriyi ara",
      videoCall: "Goruntulu ara",
      chatDisabled: "Siparis kapandi",
    },
    en: {
      pageTitle: "Driver tracking",
      pageHelp: "Share live GPS for active deliveries and update order status.",
      driverPhoneTitle: "Driver phone",
      driverPhoneHelp: "Enter your phone number to see orders assigned to you.",
      driverPhonePlaceholder: "Your phone number",
      driverPhoneSave: "Continue",
      marketOnly: "This driver page is only for your market.",
      wrongMarket: "Invalid market. Open the driver page from your market panel.",
      ordersTitle: "Active deliveries",
      noOrders: "No active orders.",
      selectOrder: "Select to track",
      activeOrder: "Active order",
      orderNumber: "Order no",
      customer: "Customer",
      market: "Market",
      phone: "Phone",
      address: "Address",
      payment: "Payment",
      payCash: "Cash on delivery",
      payCard: "Card",
      cardLast4: "Last 4 digits",
      cardName: "Cardholder",
      cardExpiry: "Expiry",
      available: "Available",
      unavailable: "Unavailable",
      waiting: "Waiting / preparing",
      onTheWay: "On the way",
      arrived: "Arrived",
      driver: "Driver",
      updateStatus: "Update status",
      startTracking: "Start live tracking",
      stopTracking: "Stop tracking",
      trackingLive: "Sharing live location",
      trackingStopped: "Tracking stopped",
      lastUpdate: "Last update",
      openMap: "Open map",
      locationUnavailable: "Location unavailable",
      updated: "Updated",
      unknown: "Unknown",
      closeOrder: "Close order",
      closed: "Order closed",
      orderClosed: "Order completed and closed",
      chatTitle: "Chat with customer",
      chatPlaceholder: "Message the customer...",
      send: "Send",
      voiceCall: "Call customer",
      videoCall: "Video call",
      chatDisabled: "Order closed",
    },
    ar: {
      pageTitle: "تتبع السائق",
      pageHelp: "شارك GPS المباشر للتسليمات النشطة وحدّث حالة الطلب.",
      driverPhoneTitle: "هاتف السائق",
      driverPhoneHelp: "أدخل رقم هاتفك لرؤية الطلبات المعينة لك.",
      driverPhonePlaceholder: "رقم هاتفك",
      driverPhoneSave: "متابعة",
      marketOnly: "صفحة السائق هذه مخصصة لسوقك فقط.",
      wrongMarket: "سوق غير صالح. افتح صفحة السائق من لوحة السوق.",
      ordersTitle: "التسليمات النشطة",
      noOrders: "لا توجد طلبات نشطة.",
      selectOrder: "اختر للتتبع",
      activeOrder: "الطلب النشط",
      orderNumber: "رقم الطلب",
      customer: "العميل",
      market: "السوق",
      phone: "الهاتف",
      address: "العنوان",
      payment: "الدفع",
      payCash: "نقداً عند التسليم",
      payCard: "بطاقة",
      cardLast4: "آخر 4 أرقام",
      cardName: "اسم حامل البطاقة",
      cardExpiry: "تاريخ الانتهاء",
      available: "متوفر",
      unavailable: "غير متوفر",
      waiting: "قيد التحضير",
      onTheWay: "في الطريق",
      arrived: "تم التسليم",
      driver: "السائق",
      updateStatus: "تحديث الحالة",
      startTracking: "بدء التتبع المباشر",
      stopTracking: "إيقاف التتبع",
      trackingLive: "يتم مشاركة الموقع المباشر",
      trackingStopped: "تم إيقاف التتبع",
      lastUpdate: "آخر تحديث",
      openMap: "فتح الخريطة",
      locationUnavailable: "الموقع غير متاح",
      updated: "تم التحديث",
      unknown: "غير معروف",
      closeOrder: "إغلاق الطلب",
      closed: "تم إغلاق الطلب",
      orderClosed: "اكتمل الطلب وأُغلق",
      chatTitle: "الدردشة مع العميل",
      chatPlaceholder: "اكتب رسالة للعميل...",
      send: "إرسال",
      voiceCall: "اتصل بالعميل",
      videoCall: "مكالمة فيديو",
      chatDisabled: "تم إغلاق الطلب",
    },
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  const db = firebase.firestore();
  try { db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) {}

  let currentLang = localStorage.getItem("app_lang") || "tr";
  let currentOrders = [];
  let allMarketOrders = [];
  let activeOrderId = "";
  let geoWatchId = null;
  let chatUnsub = null;
  let driverDisplayName = "";

  function showBootError(message) {
    const help = document.getElementById("pageHelp");
    if (help) help.textContent = message;
  }

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatPrice(price) {
    return Number(price || 0).toFixed(2).replace(".", ",") + " TL";
  }

  function statusLabel(status) {
    const normalized = normalizeOrderStatus(status);
    return {
      waiting: t("waiting"),
      "on-the-way": t("onTheWay"),
      arrived: t("arrived"),
    }[normalized] || normalized;
  }

  function paymentHtml(order) {
    const summary = order.paymentSummary || {};
    if (order.paymentMethod === "card" || summary.type === "card") {
      return (
        "<strong>" + escapeHtml(t("payment")) + "</strong><br>" +
        escapeHtml(t("payCard")) + "<br>" +
        escapeHtml(t("cardName")) + ": " + escapeHtml(summary.cardholderName || t("unknown")) + "<br>" +
        escapeHtml(t("cardLast4")) + ": " + escapeHtml(summary.last4 || "----") + "<br>" +
        escapeHtml(t("cardExpiry")) + ": " + escapeHtml(summary.expiry || "-")
      );
    }
    return "<strong>" + escapeHtml(t("payment")) + "</strong> " + escapeHtml(t("payCash"));
  }

  function isActiveOrder(order) {
    if (isOrderClosed(order.status)) return false;
    const status = normalizeOrderStatus(order.status);
    return status === "waiting" || status === "on-the-way" || status === "arrived";
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.getElementById("langSelect").value = currentLang;
    document.getElementById("pageTitle").textContent = t("pageTitle");
    document.getElementById("pageHelp").textContent = t("pageHelp");
    const marketLabel = document.getElementById("marketLabel");
    if (marketLabel) marketLabel.textContent = MARKET_ID ? getMarketLabel(MARKET_ID) : t("wrongMarket");
    const gateTitle = document.getElementById("driverGateTitle");
    if (gateTitle) gateTitle.textContent = t("driverPhoneTitle");
    const gateHelp = document.getElementById("driverGateHelp");
    if (gateHelp) gateHelp.textContent = t("driverPhoneHelp");
    const phoneInput = document.getElementById("driverPhoneInput");
    if (phoneInput) phoneInput.placeholder = t("driverPhonePlaceholder");
    const phoneSave = document.getElementById("driverPhoneSave");
    if (phoneSave) phoneSave.textContent = t("driverPhoneSave");
    document.getElementById("ordersTitle").textContent = t("ordersTitle");
    document.getElementById("activeOrderTitle").textContent = t("activeOrder");
    document.getElementById("startTrackingBtn").textContent = t("startTracking");
    document.getElementById("stopTrackingBtn").textContent = t("stopTracking");
    document.getElementById("updateStatusBtn").textContent = t("updateStatus");
    const closeBtn = document.getElementById("closeOrderBtn");
    if (closeBtn) closeBtn.textContent = t("closeOrder");
    const chatTitle = document.getElementById("driverChatTitle");
    if (chatTitle) chatTitle.textContent = t("chatTitle");
    const chatInput = document.getElementById("driverChatInput");
    if (chatInput) chatInput.placeholder = t("chatPlaceholder");
    const chatSend = document.getElementById("driverChatSend");
    if (chatSend) chatSend.textContent = t("send");
    document.title = t("pageTitle");
  }

  function clearDriverChatListener() {
    if (chatUnsub) {
      chatUnsub();
      chatUnsub = null;
    }
  }

  function renderDriverChatMessages(messages) {
    const root = document.getElementById("driverChatMessages");
    if (!root) return;
    root.innerHTML = messages.map(function (msg) {
      const role = msg.senderRole === "driver" ? "driver" : "customer";
      return (
        '<div class="chat-msg ' + role + '">' +
        '<div class="chat-msg-meta">' + escapeHtml(msg.senderName || t("unknown")) + " · " +
        escapeHtml(formatDate(msg.createdAt)) + "</div>" +
        "<div>" + escapeHtml(msg.text || "") + "</div></div>"
      );
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindDriverChatListener(order) {
    clearDriverChatListener();
    if (!order || !order.id) return;
    if (!isOrderCommunicationActive(order) && !isOrderClosed(order.status)) return;
    chatUnsub = orderChatCollection(db, order.id)
      .orderBy("createdAt", "asc")
      .onSnapshot(function (snapshot) {
        renderDriverChatMessages(snapshot.docs.map(function (entry) {
          return Object.assign({ id: entry.id }, entry.data());
        }));
      });
  }

  function renderDriverCommunication(order) {
    const callRow = document.getElementById("driverCallRow");
    const chatPanel = document.getElementById("driverChatPanel");
    const chatCompose = chatPanel && chatPanel.querySelector(".chat-compose");
    if (!callRow || !chatPanel) return;

    if (!order || isOrderClosed(order.status)) {
      callRow.hidden = true;
      chatPanel.hidden = false;
      chatPanel.classList.add("chat-disabled");
      if (chatCompose) chatCompose.style.display = "none";
      const chatTitle = document.getElementById("driverChatTitle");
      if (chatTitle) chatTitle.textContent = t("chatDisabled");
      bindDriverChatListener(order);
      return;
    }

    const commActive = isOrderCommunicationActive(order);
    callRow.hidden = !commActive;
    chatPanel.hidden = !commActive && !isOrderClosed(order.status);
    chatPanel.classList.toggle("chat-disabled", !commActive);
    if (chatCompose) chatCompose.style.display = commActive ? "" : "none";

    if (commActive) {
      callRow.innerHTML =
        '<button class="btn-call" type="button" id="driverVoiceCallBtn">' + escapeHtml(t("voiceCall")) + "</button>" +
        '<button class="btn-video" type="button" id="driverVideoCallBtn">' + escapeHtml(t("videoCall")) + "</button>";
      var voiceBtn = document.getElementById("driverVoiceCallBtn");
      var videoBtn = document.getElementById("driverVideoCallBtn");
      if (voiceBtn && window.InAppCall) {
        voiceBtn.onclick = function () {
          window.InAppCall.open({
            orderId: order.id,
            displayName: driverDisplayName || t("driver"),
            mode: "voice",
            title: t("voiceCall"),
          }).catch(function (error) { console.error("Voice call failed", error); });
        };
      }
      if (videoBtn && window.InAppCall) {
        videoBtn.onclick = function () {
          window.InAppCall.open({
            orderId: order.id,
            displayName: driverDisplayName || t("driver"),
            mode: "video",
            title: t("videoCall"),
          }).catch(function (error) { console.error("Video call failed", error); });
        };
      }
      bindDriverChatListener(order);
    } else {
      clearDriverChatListener();
    }
  }

  function sendDriverChatMessage() {
    const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; });
    if (!order || !isOrderCommunicationActive(order)) return;
    const input = document.getElementById("driverChatInput");
    const text = String(input && input.value || "").trim();
    if (!text) return;
    orderChatCollection(db, activeOrderId).add({
      senderId: driverPhone || "driver",
      senderRole: "driver",
      senderName: driverDisplayName || t("driver"),
      text: text,
      createdAt: new Date().toISOString(),
    }).then(function () {
      if (input) input.value = "";
    }).catch(function (error) {
      console.error("Driver chat send failed", error);
    });
  }

  function renderLocationBox(order) {
    const box = document.getElementById("locationBox");
    const loc = order && order.driverLocation;
    if (!loc || loc.lat == null || loc.lng == null) {
      box.textContent = t("locationUnavailable");
      return;
    }
    const mapUrl = "https://www.google.com/maps?q=" + encodeURIComponent(loc.lat) + "," + encodeURIComponent(loc.lng);
    box.innerHTML =
      '<span class="live-badge">' + escapeHtml(t("trackingLive")) + "</span><br>" +
      escapeHtml(t("lastUpdate")) + ": " + escapeHtml(formatDate(loc.updatedAt)) + "<br>" +
      "Lat: " + escapeHtml(String(loc.lat)) + ", Lng: " + escapeHtml(String(loc.lng)) + "<br>" +
      '<a href="' + mapUrl + '" target="_blank" rel="noopener">' + escapeHtml(t("openMap")) + "</a>";
  }

  function renderItemsHtml(items) {
    return groupItemsByCategory(items).map(function (group) {
      var rows = group.entries.map(function (entry) {
        var item = entry.item;
        var available = item.available !== false;
        var lineTotal = available ? (Number(item.price) || 0) * (Number(item.qty) || 1) : 0;
        return (
          '<div class="order-item-row' + (available ? "" : " item-unavailable") + '">' +
          "<span>" + escapeHtml(item.name) + " x " + (item.qty || 1) + "</span>" +
          '<span class="avail-badge ' + (available ? "avail-yes" : "avail-no") + '">' +
          escapeHtml(available ? t("available") : t("unavailable")) + "</span>" +
          "<span>" + formatPrice(lineTotal) + "</span>" +
          "</div>"
        );
      }).join("");
      return (
        '<div class="item-category-block">' +
        '<div class="item-category-title">' + escapeHtml(group.category) + "</div>" +
        rows +
        "</div>"
      );
    }).join("");
  }

  function orderVisibleToDriver(order) {
    if (!MARKET_ID || !orderMatchesMarket(order, MARKET_ID)) return false;
    if (!driverPhone) return false;
    return orderAssignedToDriver(order, driverPhone);
  }

  function updateDriverGate() {
    var gate = document.getElementById("driverGate");
    var app = document.getElementById("driverApp");
    if (!MARKET_ID) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      showBootError(t("wrongMarket"));
      return;
    }
    if (!driverPhone) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
  }

  function renderActiveOrderDetails() {
    const card = document.getElementById("activeOrderCard");
    const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; });
    if (!order) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = renderItemsHtml(items);

    const statusOptions = ORDER_STATUSES.map(function (status) {
      const selected = normalizeOrderStatus(order.status) === status ? " selected" : "";
      return '<option value="' + status + '"' + selected + ">" + escapeHtml(statusLabel(status)) + "</option>";
    }).join("");

    const orderNo = orderNumberDisplay(order);
    document.getElementById("activeOrderMeta").innerHTML =
      (orderNo ? "<strong>" + escapeHtml(t("orderNumber")) + ":</strong> " + escapeHtml(orderNo) + "<br>" : "") +
      escapeHtml(t("customer")) + ": " + escapeHtml(order.userName || t("unknown")) + "<br>" +
      escapeHtml(t("phone")) + ": " + escapeHtml(order.userPhone || t("unknown")) + "<br>" +
      escapeHtml(t("address")) + ": " + escapeHtml(order.userAddress || t("unknown")) + "<br>" +
      escapeHtml(t("market")) + ": " + escapeHtml(getMarketLabel(order.marketId || order.marketName)) + "<br>" +
      escapeHtml(formatDate(order.createdAt));

    document.getElementById("activeOrderPayment").innerHTML = paymentHtml(order);
    document.getElementById("activeOrderItems").innerHTML = itemsHtml;
    document.getElementById("driverStatusSelect").innerHTML = statusOptions;
    renderLocationBox(order);
    driverDisplayName = (order.driver && order.driver.name) || t("driver");
    const closeBtn = document.getElementById("closeOrderBtn");
    if (closeBtn) {
      const arrived = normalizeOrderStatus(order.status) === "arrived";
      closeBtn.hidden = !arrived || isOrderClosed(order.status);
    }
    renderDriverCommunication(order);
  }

  function renderOrders(orders) {
    const active = orders.filter(function (order) {
      return orderVisibleToDriver(order) && isActiveOrder(order);
    }).sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
    currentOrders = active;
    const root = document.getElementById("ordersList");

    if (!active.length) {
      root.innerHTML = '<p class="empty-msg">' + escapeHtml(t("noOrders")) + "</p>";
      document.getElementById("activeOrderCard").hidden = true;
      activeOrderId = "";
      clearDriverChatListener();
      return;
    }

    if (!activeOrderId || !active.some(function (order) { return order.id === activeOrderId; })) {
      activeOrderId = active[0].id;
    }

    root.innerHTML = active.map(function (order) {
      const orderNo = orderNumberDisplay(order);
      return (
        '<div class="card">' +
        '<div class="card-title">' + escapeHtml(order.userName || t("unknown")) +
        (orderNo ? " · " + escapeHtml(orderNo) : "") + "</div>" +
        '<div class="card-meta">' + escapeHtml(getMarketLabel(order.marketId || order.marketName)) +
        " · " + escapeHtml(statusLabel(order.status)) +
        " · " + escapeHtml(formatDate(order.createdAt)) + "</div>" +
        '<div class="actions-row">' +
        '<button class="btn-primary" type="button" data-driver-action="select-order" data-order-id="' +
        escapeHtml(order.id) + '">' + escapeHtml(t("selectOrder")) + "</button>" +
        "</div></div>"
      );
    }).join("");

    renderActiveOrderDetails();
  }

  function pushDriverLocation(position) {
    if (!activeOrderId) return;
    const now = new Date().toISOString();
    db.collection("orders").doc(activeOrderId).update({
      driverLocation: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: now,
      },
      updatedAt: now,
    }).then(function () {
      const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; });
      if (order) {
        order.driverLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: now,
        };
        renderLocationBox(order);
      }
    }).catch(function (error) {
      console.error("Location update failed", error);
    });
  }

  function startTracking() {
    if (!activeOrderId || !navigator.geolocation) return;
    if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = navigator.geolocation.watchPosition(
      pushDriverLocation,
      function (error) {
        console.error("Geolocation failed", error);
        document.getElementById("locationBox").textContent = t("locationUnavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    document.getElementById("startTrackingBtn").hidden = true;
    document.getElementById("stopTrackingBtn").hidden = false;
  }

  function stopTracking() {
    if (geoWatchId != null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    document.getElementById("startTrackingBtn").hidden = false;
    document.getElementById("stopTrackingBtn").hidden = true;
    document.getElementById("locationBox").textContent = t("trackingStopped");
  }

  function updateDriverStatus() {
    if (!activeOrderId) return;
    const select = document.getElementById("driverStatusSelect");
    const status = select ? select.value : "waiting";
    const payload = { status: status, updatedAt: new Date().toISOString() };
    if (status === "arrived") payload.arrivedAt = new Date().toISOString();
    db.collection("orders").doc(activeOrderId).update(payload).then(function () {
      if (status === "arrived") {
        stopTracking();
        const closeBtn = document.getElementById("closeOrderBtn");
        if (closeBtn) closeBtn.hidden = false;
      }
      renderOrders(allMarketOrders);
      renderActiveOrderDetails();
      alert(t("updated"));
    }).catch(function (error) {
      console.error("Status update failed", error);
      alert(error.message || t("unknown"));
    });
  }

  function closeOrder() {
    if (!activeOrderId) return;
    const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; });
    if (!order) return;
    if (normalizeOrderStatus(order.status) !== "arrived") {
      alert(t("updateStatus"));
      return;
    }
    const now = new Date().toISOString();
    const orderId = activeOrderId;
    db.collection("orders").doc(orderId).update({
      status: "closed",
      feedbackRequested: true,
      closedAt: now,
      updatedAt: now,
    }).then(function () {
      return writeOrderInboxNotifications(db, {
        inboxType: "order_closed",
        orderId: orderId,
        orderNumber: order.orderNumber != null ? order.orderNumber : "",
        marketId: order.marketId || MARKET_ID || "",
        marketName: order.marketName || getMarketLabel(order.marketId || MARKET_ID),
        message: t("orderClosed"),
        userName: order.userName || t("unknown"),
        userEmail: order.userEmail || "",
      });
    }).then(function () {
      if (window.InAppCall) window.InAppCall.close();
      activeOrderId = "";
      stopTracking();
      clearDriverChatListener();
      alert(t("closed"));
      renderOrders(allMarketOrders);
    }).catch(function (error) {
      console.error("Close order failed", error);
      alert(error.message || t("unknown"));
    });
  }

  document.getElementById("startTrackingBtn").addEventListener("click", startTracking);
  document.getElementById("stopTrackingBtn").addEventListener("click", stopTracking);
  document.getElementById("updateStatusBtn").addEventListener("click", updateDriverStatus);
  document.getElementById("closeOrderBtn").addEventListener("click", closeOrder);
  document.getElementById("driverChatSend").addEventListener("click", sendDriverChatMessage);
  document.getElementById("driverChatInput").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      sendDriverChatMessage();
    }
  });

  document.body.addEventListener("click", function (event) {
    const button = event.target.closest("[data-driver-action]");
    if (!button) return;
    if (button.dataset.driverAction === "select-order") {
      activeOrderId = button.dataset.orderId || "";
      renderActiveOrderDetails();
    }
  });

  document.getElementById("langSelect").addEventListener("change", function (event) {
    currentLang = String(event.target.value || "tr");
    localStorage.setItem("app_lang", currentLang);
    applyLanguage();
    renderOrders(currentOrders);
    renderActiveOrderDetails();
  });

  document.getElementById("driverPhoneSave").addEventListener("click", function () {
    var input = document.getElementById("driverPhoneInput");
    driverPhone = String(input && input.value || "").trim();
    if (!driverPhone) return;
    var normalizePhone = OL.normalizePhone || function (v) { return String(v || "").replace(/\D/g, ""); };
    driverPhone = normalizePhone(driverPhone) || driverPhone;
    localStorage.setItem(driverPhoneKey(), driverPhone);
    updateDriverGate();
    renderOrders(allMarketOrders);
  });

  applyLanguage();
  updateDriverGate();
  var savedPhoneInput = document.getElementById("driverPhoneInput");
  if (savedPhoneInput && driverPhone) savedPhoneInput.value = driverPhone;

  if (MARKET_ID) {
    db.collection("orders").where("marketId", "==", MARKET_ID).onSnapshot(function (snapshot) {
      allMarketOrders = snapshot.docs.map(function (entry) {
        return { id: entry.id, ...entry.data() };
      });
      renderOrders(allMarketOrders);
      if (activeOrderId) renderActiveOrderDetails();
    }, function (error) {
      console.error("Orders listener failed", error);
      showBootError(error.message || "Could not load orders.");
    });
  }
})();
