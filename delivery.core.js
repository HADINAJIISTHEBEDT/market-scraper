(function () {
  "use strict";

  const OL = window.OrderLifecycle || {};
  const ORDER_STATUSES = OL.ORDER_STATUSES || ["waiting", "on-the-way", "arrived"];
  const DRIVER_STATUSES = OL.DRIVER_STATUSES || ["preparing", "on-the-way", "arrived"];
  const getDriverStatusOptions = OL.getDriverStatusOptions || function (currentStatus) {
    var normalized = normalizeOrderStatus(currentStatus);
    var options = DRIVER_STATUSES.slice();
    if (normalized && options.indexOf(normalized) === -1) options.unshift(normalized);
    return options;
  };
  const normalizeOrderStatus = OL.normalizeOrderStatus || function (s) { return s || "waiting"; };
  const orderNumberDisplay = OL.orderNumberDisplay || function () { return ""; };
  const orderMatchesMarket = OL.orderMatchesMarket || function () { return true; };
  const orderAssignedToDriver = OL.orderAssignedToDriver || function () { return true; };
  const orderAssignedToDriverIdentity = OL.orderAssignedToDriverIdentity || function (order, identity) {
    return orderAssignedToDriver(order, identity && identity.phone);
  };
  const isOrderClosed = OL.isOrderClosed || function () { return false; };
  const isOrderCommunicationActive = OL.isOrderCommunicationActive || function () { return false; };
  const isDeliveryChatActive = OL.isDeliveryChatActive || function () { return false; };
  const archiveOrderConversation = OL.archiveOrderConversation || function () { return Promise.resolve(); };
  const getOrderCustomerLocation = OL.getOrderCustomerLocation || function () { return null; };
  const buildDualLocationMapHtml = OL.buildDualLocationMapHtml || function () { return { html: "", openUrl: "" }; };
  const orderChatCollection = OL.orderChatCollection || function (db, id) {
    return db.collection("orderChats").doc(id).collection("messages");
  };
  const writeOrderInboxNotifications = OL.writeOrderInboxNotifications || function () { return Promise.resolve(); };
  const resolveChatSenderDisplayName = OL.resolveChatSenderDisplayName || function (msg) {
    return (msg && msg.senderName) || "Unknown";
  };
  const chatRoleClass = OL.chatRoleClass || function (role) {
    return role === "driver" ? "driver" : role === "market" ? "market" : "customer";
  };
  const groupItemsByCategory = OL.groupItemsByCategory || function (items) {
    return [{ category: "General", entries: (items || []).map(function (item, index) { return { item: item, index: index }; }) }];
  };
  const computeOrderTotal = OL.computeOrderTotal || function (items) {
    return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
      if (item && item.available === false) return sum;
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);
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
  function driverNameKey() { return "driver_name_" + (MARKET_ID || "default"); }
  let driverPhone = localStorage.getItem(driverPhoneKey()) || "";
  let driverName = localStorage.getItem(driverNameKey()) || "";

  const I18N = {
    tr: {
      pageTitle: "Surucu takibi",
      pageHelp: "Aktif teslimatlar icin canli GPS paylasin ve siparis durumunu guncelleyin.",
      driverGateTitle: "Surucu girisi",
      driverGateHelp: "Marketin atadigi adi girin. Telefon opsiyoneldir.",
      driverNamePlaceholder: "Surucu adi (market panelindeki ile ayni)",
      driverNameRequired: "Surucu adi gerekli.",
      driverPhonePlaceholder: "Telefon (opsiyonel)",
      driverLoginContinue: "Devam et",
      noOrdersForDriver: "Bu ada atanmis aktif siparis yok. Market panelindeki surucu adi ile birebir ayni yazin.",
      marketOnly: "Bu surucu sayfasi sadece kendi marketiniz icindir.",
      wrongMarket: "Gecersiz market. Surucu sayfasini market panelinden acin.",
      ordersTitle: "Aktif teslimatlar",
      noOrders: "Aktif siparis yok.",
      noOrdersForPhone: "Bu telefon numarasina atanmis aktif siparis yok. Market panelindeki numara ile ayni girin (or. 532... veya 0532...).",
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
      total: "Toplam",
      waiting: "Siparis inceleniyor",
      awaitingPayment: "Odeme bekleniyor",
      preparing: "Hazirlaniyor",
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
      customerLocation: "Musteri konumu (Google Maps)",
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
      marketPanelLink: "Market paneli",
      logout: "Cikis yap",
      historyTitle: "Gecmis siparisler",
      callHistoryTitle: "Arama gecmisi",
      noHistory: "Gecmis kayit yok.",
      callWith: "Konusan",
      callCompleted: "Tamamlandi",
      callDeclined: "Reddedildi",
      callRemoteEnded: "Karsi taraf kapatti",
      portalDenied: "Surucu paneli market panelinden acilamaz. Once cikis yapin.",
      bootErrorConfig: "Yapilandirma eksik. firebase-config.global.js dosyasini ayni klasorde tutun.",
      bootErrorFirebase: "Firebase yuklenemedi. Internet baglantinizi kontrol edin.",
      bootErrorOrders: "Siparisler yuklenemedi.",
      categoryGeneral: "Genel",
    },
    en: {
      pageTitle: "Driver tracking",
      pageHelp: "Share live GPS for active deliveries and update order status.",
      driverGateTitle: "Driver login",
      driverGateHelp: "Enter the name assigned to you in the market panel. Phone is optional.",
      driverNamePlaceholder: "Driver name (same as in market panel)",
      driverNameRequired: "Driver name is required.",
      driverPhonePlaceholder: "Phone (optional)",
      driverLoginContinue: "Continue",
      driverPhoneTitle: "Driver login",
      driverPhoneHelp: "Enter the name assigned to you in the market panel. Phone is optional.",
      driverPhoneSave: "Continue",
      marketOnly: "This driver page is only for your market.",
      wrongMarket: "Invalid market. Open the driver page from your market panel.",
      ordersTitle: "Active deliveries",
      noOrders: "No active orders.",
      noOrdersForDriver: "No active orders for this name. Enter the exact name from the market panel.",
      noOrdersForPhone: "No active orders for this name. Enter the exact name from the market panel.",
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
      total: "Total",
      waiting: "Waiting / reviewing",
      awaitingPayment: "Awaiting payment",
      preparing: "Preparing",
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
      customerLocation: "Customer location (Google Maps)",
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
      marketPanelLink: "Market panel",
      logout: "Log out",
      historyTitle: "Order history",
      callHistoryTitle: "Call history",
      noHistory: "No history yet.",
      callWith: "With",
      callCompleted: "Completed",
      callDeclined: "Declined",
      callRemoteEnded: "Remote ended",
      portalDenied: "The driver portal cannot be opened from the market panel. Log out first.",
      bootErrorConfig: "Config missing. Keep firebase-config.global.js in the same folder.",
      bootErrorFirebase: "Firebase failed to load. Check your internet connection.",
      bootErrorOrders: "Could not load orders.",
      categoryGeneral: "General",
    },
    ar: {
      pageTitle: "تتبع السائق",
      pageHelp: "شارك GPS المباشر للتسليمات النشطة وحدّث حالة الطلب.",
      driverGateTitle: "تسجيل دخول السائق",
      driverGateHelp: "أدخل الاسم المعين لك في لوحة السوق. الهاتف اختياري.",
      driverNamePlaceholder: "اسم السائق (نفس الاسم في لوحة السوق)",
      driverNameRequired: "اسم السائق مطلوب.",
      driverPhonePlaceholder: "الهاتف (اختياري)",
      driverLoginContinue: "متابعة",
      driverPhoneTitle: "تسجيل دخول السائق",
      driverPhoneHelp: "أدخل الاسم المعين لك في لوحة السوق. الهاتف اختياري.",
      driverPhoneSave: "متابعة",
      marketOnly: "صفحة السائق هذه مخصصة لسوقك فقط.",
      wrongMarket: "سوق غير صالح. افتح صفحة السائق من لوحة السوق.",
      ordersTitle: "التسليمات النشطة",
      noOrders: "لا توجد طلبات نشطة.",
      noOrdersForDriver: "لا توجد طلبات نشطة لهذا الاسم. أدخل نفس الاسم من لوحة السوق.",
      noOrdersForPhone: "لا توجد طلبات نشطة لهذا الاسم. أدخل نفس الاسم من لوحة السوق.",
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
      total: "المجموع",
      waiting: "قيد المراجعة",
      awaitingPayment: "في انتظار الدفع",
      preparing: "قيد التحضير",
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
      customerLocation: "موقع العميل (Google Maps)",
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
      marketPanelLink: "لوحة السوق",
      logout: "تسجيل الخروج",
      historyTitle: "سجل الطلبات",
      callHistoryTitle: "سجل المكالمات",
      noHistory: "لا يوجد سجل بعد.",
      callWith: "مع",
      callCompleted: "مكتملة",
      callDeclined: "مرفوضة",
      callRemoteEnded: "أنهى الطرف الآخر",
      portalDenied: "لا يمكن فتح بوابة السائق من لوحة السوق. سجّل الخروج أولاً.",
      bootErrorConfig: "الإعدادات ناقصة. احتفظ بملف firebase-config.global.js في نفس المجلد.",
      bootErrorFirebase: "تعذر تحميل Firebase. تحقق من اتصال الإنترنت.",
      bootErrorOrders: "تعذر تحميل الطلبات.",
      categoryGeneral: "عام",
    },
  };

  let currentLang = localStorage.getItem("app_lang") || "tr";

  function showBootError(message) {
    const help = document.getElementById("pageHelp");
    if (help) help.textContent = message;
  }

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  }

  if (!window.FIREBASE_CONFIG) {
    showBootError(t("bootErrorConfig"));
    return;
  }

  if (typeof firebase === "undefined") {
    showBootError(t("bootErrorFirebase"));
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  const db = firebase.firestore();
  try { db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) {}

  var portalCheck = window.PortalAccess && window.PortalAccess.guardDriverPanel
    ? window.PortalAccess.guardDriverPanel(MARKET_ID)
    : { ok: true };
  if (!portalCheck.ok) {
    showBootError(t("portalDenied"));
    return;
  }

  var marketPanelLink = document.getElementById("marketPanelLink");
  if (marketPanelLink) marketPanelLink.hidden = true;

  let currentOrders = [];
  let allMarketOrders = [];
  let historyOrders = [];
  let callHistoryEntries = [];
  let activeOrderId = "";
  let pendingStatusUpdate = null;
  let statusUpdateBusy = false;
  let suppressStatusChange = false;
  let geoWatchId = null;
  let chatUnsub = null;
  let driverDisplayName = "";

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
      "awaiting-payment": t("awaitingPayment"),
      preparing: t("preparing"),
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

  function driverStatusOptions(currentStatus) {
    return getDriverStatusOptions(currentStatus);
  }

  function patchLocalOrderStatus(orderId, payload) {
    function patchList(list) {
      const order = list.find(function (entry) { return entry.id === orderId; });
      if (!order) return;
      order.status = payload.status;
      order.updatedAt = payload.updatedAt;
      if (payload.arrivedAt) order.arrivedAt = payload.arrivedAt;
    }
    patchList(allMarketOrders);
    patchList(currentOrders);
  }

  function applyPendingStatusToOrders() {
    if (!pendingStatusUpdate || Date.now() - pendingStatusUpdate.at > 10000) return;
    const order = allMarketOrders.find(function (entry) { return entry.id === pendingStatusUpdate.orderId; });
    if (!order) return;
    order.status = pendingStatusUpdate.status;
    order.updatedAt = new Date().toISOString();
    if (normalizeOrderStatus(pendingStatusUpdate.status) === "arrived") {
      order.arrivedAt = order.arrivedAt || new Date().toISOString();
    }
  }

  function renderDriverStatusSelect(order) {
    const select = document.getElementById("driverStatusSelect");
    if (!select) return;
    const options = driverStatusOptions(order.status);
    const normalizedCurrent = normalizeOrderStatus(order.status);
    let selectedValue = normalizedCurrent;
    if (
      pendingStatusUpdate &&
      pendingStatusUpdate.orderId === order.id &&
      Date.now() - pendingStatusUpdate.at < 10000
    ) {
      selectedValue = normalizeOrderStatus(pendingStatusUpdate.status);
    } else if (select.value) {
      const normalizedSelect = normalizeOrderStatus(select.value);
      if (options.indexOf(normalizedSelect) >= 0) selectedValue = normalizedSelect;
    }
    select.innerHTML = options.map(function (status) {
      const selected = normalizeOrderStatus(status) === selectedValue ? " selected" : "";
      return '<option value="' + status + '"' + selected + ">" + escapeHtml(statusLabel(status)) + "</option>";
    }).join("");
    suppressStatusChange = true;
    select.value = selectedValue;
    suppressStatusChange = false;
  }

  function isActiveOrder(order) {
    if (isOrderClosed(order.status)) return false;
    if (!orderAssignedToDriverIdentity(order, driverIdentity())) return false;
    const status = normalizeOrderStatus(order.status);
    return status === "preparing" || status === "on-the-way" || status === "arrived";
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
    if (gateTitle) gateTitle.textContent = t("driverGateTitle");
    const gateHelp = document.getElementById("driverGateHelp");
    if (gateHelp) gateHelp.textContent = t("driverGateHelp");
    const nameInput = document.getElementById("driverNameInput");
    if (nameInput) nameInput.placeholder = t("driverNamePlaceholder");
    const phoneInput = document.getElementById("driverPhoneInput");
    if (phoneInput) phoneInput.placeholder = t("driverPhonePlaceholder");
    const phoneSave = document.getElementById("driverPhoneSave");
    if (phoneSave) phoneSave.textContent = t("driverLoginContinue") || t("driverPhoneSave");
    const logoutBtn = document.getElementById("driverLogoutBtn");
    if (logoutBtn) logoutBtn.textContent = t("logout");
    const historyTitle = document.getElementById("historyTitle");
    if (historyTitle) historyTitle.textContent = t("historyTitle");
    const callHistoryTitle = document.getElementById("callHistoryTitle");
    if (callHistoryTitle) callHistoryTitle.textContent = t("callHistoryTitle");
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

  function renderDriverChatMessages(messages, order) {
    const root = document.getElementById("driverChatMessages");
    if (!root) return;
    root.innerHTML = messages.filter(function (msg) {
      return String(msg.senderRole || "").toLowerCase() !== "market";
    }).map(function (msg) {
      const role = chatRoleClass(msg.senderRole);
      const senderLabel = resolveChatSenderDisplayName(msg, order, {
        getMarketLabel: getMarketLabel,
        adminLabel: "Admin",
        driverLabel: t("driver"),
        unknownLabel: t("unknown"),
      });
      return (
        '<div class="chat-msg ' + role + '">' +
        '<div class="chat-msg-meta">' + escapeHtml(senderLabel) + " · " +
        escapeHtml(formatDate(msg.createdAt)) + "</div>" +
        "<div>" + escapeHtml(msg.text || "") + "</div></div>"
      );
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindDriverChatListener(order) {
    clearDriverChatListener();
    if (!order || !order.id) return;
    if (!isDeliveryChatActive(order) && !isOrderCommunicationActive(order) && !isOrderClosed(order.status)) return;
    chatUnsub = orderChatCollection(db, order.id)
      .orderBy("createdAt", "asc")
      .onSnapshot(function (snapshot) {
        renderDriverChatMessages(snapshot.docs.map(function (entry) {
          return Object.assign({ id: entry.id }, entry.data());
        }), order);
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
    const chatActive = isDeliveryChatActive(order) || commActive;
    callRow.hidden = !commActive;
    chatPanel.hidden = !chatActive && !isOrderClosed(order.status);
    chatPanel.classList.toggle("chat-disabled", !chatActive);
    if (chatCompose) chatCompose.style.display = chatActive ? "" : "none";

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
            callerRole: "driver",
            localId: driverNameKey() + ":" + driverName,
            meta: callMetaForOrder(order),
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
            callerRole: "driver",
            localId: driverNameKey() + ":" + driverName,
            meta: callMetaForOrder(order),
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
    if (!order || (!isDeliveryChatActive(order) && !isOrderCommunicationActive(order))) return;
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
    const customer = getOrderCustomerLocation(order);
    const driver = order && order.driverLocation;
    if (!customer && !(driver && driver.lat != null)) {
      box.textContent = t("locationUnavailable");
      return;
    }
    const map = buildDualLocationMapHtml(customer, driver, {
      liveBadge: driver && driver.lat != null && geoWatchId != null ? t("trackingLive") : "",
    });
    box.innerHTML =
      map.html +
      (driver && driver.lat != null
        ? '<div class="card-meta">' + escapeHtml(t("lastUpdate")) + ": " + escapeHtml(formatDate(driver.updatedAt)) + "</div>"
        : "") +
      (customer
        ? '<div class="card-meta">' + escapeHtml(t("customerLocation")) + ": " +
          escapeHtml(String(customer.lat)) + ", " + escapeHtml(String(customer.lng)) + "</div>"
        : "") +
      (map.openUrl
        ? '<a href="' + escapeHtml(map.openUrl) + '" target="_blank" rel="noopener">' + escapeHtml(t("openMap")) + "</a>"
        : "");
  }

  function maybeAutoStartTracking(order) {
    if (!order || order.id !== activeOrderId) return;
    if (isOrderClosed(order.status)) {
      stopTracking();
      return;
    }
    const status = normalizeOrderStatus(order.status);
    if ((status === "on-the-way" || status === "arrived") && geoWatchId == null && navigator.geolocation) {
      startTracking();
    }
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

  function driverIdentity() {
    return { name: driverName, phone: driverPhone };
  }

  function driverLogout() {
    localStorage.removeItem(driverNameKey());
    localStorage.removeItem(driverPhoneKey());
    driverName = "";
    driverPhone = "";
    if (window.PortalAccess && window.PortalAccess.clearPortal) window.PortalAccess.clearPortal();
    if (window.InAppCall) window.InAppCall.close(false);
    updateDriverGate();
    renderOrders(allMarketOrders);
  }

  function callMetaForOrder(order) {
    return {
      orderNumber: order.orderNumber != null ? order.orderNumber : "",
      marketId: order.marketId || MARKET_ID || "",
      marketName: order.marketName || getMarketLabel(order.marketId || MARKET_ID),
      driverName: (order.driver && order.driver.name) || driverName || "",
      customerName: order.userName || t("unknown"),
      customerPhoto: order.userPhoto || "",
      driverPhoto: "",
    };
  }

  function renderHistorySections() {
    var ordersRoot = document.getElementById("historyOrdersList");
    var callsRoot = document.getElementById("historyCallsList");
    if (!ordersRoot || !callsRoot) return;

    var closed = historyOrders.filter(function (order) {
      return orderVisibleToDriver(order) || orderAssignedToDriverIdentity(order, driverIdentity());
    }).sort(function (a, b) {
      return String(b.closedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.closedAt || a.updatedAt || a.createdAt || ""));
    }).slice(0, 40);

    if (!closed.length) {
      ordersRoot.innerHTML = '<p class="empty-msg">' + escapeHtml(t("noHistory")) + "</p>";
    } else {
      ordersRoot.innerHTML = closed.map(function (order) {
        var orderNo = orderNumberDisplay(order);
        return (
          '<div class="card">' +
          '<div class="card-title">' + escapeHtml(getMarketLabel(order.marketId || order.marketName)) +
          (orderNo ? " · " + escapeHtml(orderNo) : "") + "</div>" +
          '<div class="card-meta">' + escapeHtml(t("driver")) + ": " + escapeHtml((order.driver && order.driver.name) || driverName || t("unknown")) + "</div>" +
          '<div class="card-meta">' + escapeHtml(formatDate(order.closedAt || order.updatedAt || order.createdAt)) + "</div>" +
          "</div>"
        );
      }).join("");
    }

    var calls = callHistoryEntries.filter(function (entry) {
      return !driverName || !entry.driverName || String(entry.driverName).toLowerCase() === String(driverName).toLowerCase();
    }).slice(0, 40);

    if (!calls.length) {
      callsRoot.innerHTML = '<p class="empty-msg">' + escapeHtml(t("noHistory")) + "</p>";
    } else {
      callsRoot.innerHTML = calls.map(function (entry) {
        var outcome = entry.outcome === "declined" ? t("callDeclined")
          : entry.outcome === "remote-ended" ? t("callRemoteEnded") : t("callCompleted");
        return (
          '<div class="card">' +
          '<div class="card-title">' + escapeHtml(getMarketLabel(entry.marketId || entry.marketName)) +
          (entry.orderNumber ? " · #" + escapeHtml(String(entry.orderNumber)) : "") + "</div>" +
          '<div class="card-meta">' + escapeHtml(t("callWith")) + ": " +
          escapeHtml(entry.callerName || t("unknown")) + " · " +
          escapeHtml(entry.customerName || t("unknown")) + "</div>" +
          '<div class="card-meta">' + escapeHtml(formatDate(entry.startedAt || entry.createdAt)) +
          " · " + escapeHtml(entry.mode === "video" ? callTMode("video") : callTMode("voice")) +
          " · " + escapeHtml(outcome) + "</div>" +
          "</div>"
        );
      }).join("");
    }
  }

  function callTMode(mode) {
    return mode === "video" ? t("videoCall") : t("voiceCall");
  }

  function ensureHistorySections() {
    if (document.getElementById("driverHistoryPanel")) return;
    var app = document.getElementById("driverApp");
    if (!app) return;
    var panel = document.createElement("div");
    panel.id = "driverHistoryPanel";
    panel.innerHTML =
      '<h2 id="historyTitle" style="font-size:20px;margin:24px 0 12px;">History</h2>' +
      '<div id="historyOrdersList"></div>' +
      '<h2 id="callHistoryTitle" style="font-size:20px;margin:24px 0 12px;">Calls</h2>' +
      '<div id="historyCallsList"></div>';
    app.appendChild(panel);
  }

  function startCallHistoryListener() {
    db.collection("orderCallHistory").where("marketId", "==", MARKET_ID).onSnapshot(function (snapshot) {
      callHistoryEntries = snapshot.docs.map(function (entry) {
        return Object.assign({ id: entry.id }, entry.data());
      }).sort(function (a, b) {
        return String(b.startedAt || b.createdAt || "").localeCompare(String(a.startedAt || a.createdAt || ""));
      });
      renderHistorySections();
    }, function () {
      db.collection("orderCallHistory").onSnapshot(function (snapshot) {
        callHistoryEntries = snapshot.docs.map(function (entry) {
          return Object.assign({ id: entry.id }, entry.data());
        });
        renderHistorySections();
      });
    });
  }

  function orderVisibleToDriver(order) {
    if (!MARKET_ID || !orderMatchesMarket(order, MARKET_ID)) return false;
    if (!driverName) return false;
    return orderAssignedToDriverIdentity(order, driverIdentity());
  }

  function updateDriverGate() {
    var gate = document.getElementById("driverGate");
    var app = document.getElementById("driverApp");
    var logoutBtn = document.getElementById("driverLogoutBtn");
    if (!MARKET_ID) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      showBootError(t("wrongMarket"));
      return;
    }
    if (!driverName) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    if (logoutBtn) logoutBtn.hidden = false;
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

    const orderNo = orderNumberDisplay(order);
    document.getElementById("activeOrderMeta").innerHTML =
      (orderNo ? "<strong>" + escapeHtml(t("orderNumber")) + ":</strong> " + escapeHtml(orderNo) + "<br>" : "") +
      "<strong>" + escapeHtml(t("total")) + ":</strong> " + formatPrice(computeOrderTotal(items)) + "<br>" +
      escapeHtml(t("customer")) + ": " + escapeHtml(order.userName || t("unknown")) + "<br>" +
      escapeHtml(t("phone")) + ": " + escapeHtml(order.userPhone || t("unknown")) + "<br>" +
      escapeHtml(t("address")) + ": " + escapeHtml(order.userAddress || t("unknown")) + "<br>" +
      escapeHtml(t("market")) + ": " + escapeHtml(getMarketLabel(order.marketId || order.marketName)) + "<br>" +
      escapeHtml(formatDate(order.createdAt));

    document.getElementById("activeOrderPayment").innerHTML = paymentHtml(order);
    document.getElementById("activeOrderItems").innerHTML = itemsHtml;
    renderDriverStatusSelect(order);
    renderLocationBox(order);
    driverDisplayName = (order.driver && order.driver.name) || t("driver");
    maybeAutoStartTracking(order);
    const closeBtn = document.getElementById("closeOrderBtn");
    if (closeBtn) {
      const arrived = normalizeOrderStatus(order.status) === "arrived";
      closeBtn.hidden = !arrived || isOrderClosed(order.status);
    }
    renderDriverCommunication(order);
  }

  function renderOrders(orders) {
    const marketOrders = orders.filter(function (order) {
      return orderMatchesMarket(order, MARKET_ID);
    });
    const assignedOrders = marketOrders.filter(function (order) {
      return orderAssignedToDriverIdentity(order, driverIdentity());
    });
    const active = assignedOrders.filter(function (order) {
      return isActiveOrder(order);
    }).sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
    currentOrders = active;
    const root = document.getElementById("ordersList");

    if (!active.length) {
      var emptyMsg = t("noOrders");
      if (marketOrders.length && !assignedOrders.length) {
        emptyMsg = t("noOrdersForDriver");
      }
      root.innerHTML = '<p class="empty-msg">' + escapeHtml(emptyMsg) + "</p>";
      document.getElementById("activeOrderCard").hidden = true;
      activeOrderId = "";
      stopTracking(true);
      clearDriverChatListener();
      syncDriverCallWatch();
      return;
    }

    if (!activeOrderId || !active.some(function (order) { return order.id === activeOrderId; })) {
      activeOrderId = active[0].id;
    }

    root.innerHTML = active.map(function (order) {
      const orderNo = orderNumberDisplay(order);
      const items = Array.isArray(order.items) ? order.items : [];
      return (
        '<div class="card">' +
        '<div class="card-title">' + escapeHtml(order.userName || t("unknown")) +
        (orderNo ? " · " + escapeHtml(orderNo) : "") + "</div>" +
        '<div class="card-meta">' + escapeHtml(getMarketLabel(order.marketId || order.marketName)) +
        " · " + escapeHtml(statusLabel(order.status)) +
        " · " + escapeHtml(formatPrice(computeOrderTotal(items))) +
        " · " + escapeHtml(formatDate(order.createdAt)) + "</div>" +
        '<div class="actions-row">' +
        '<button class="btn-primary" type="button" data-driver-action="select-order" data-order-id="' +
        escapeHtml(order.id) + '">' + escapeHtml(t("selectOrder")) + "</button>" +
        "</div></div>"
      );
    }).join("");

    renderActiveOrderDetails();
    syncDriverCallWatch();
  }

  function syncDriverCallWatch() {
    if (!window.InAppCall || !window.InAppCall.syncWatch || !driverName) return;
    window.InAppCall.syncWatch({
      orderIds: currentOrders.map(function (order) { return order.id; }),
      localId: driverNameKey() + ":" + driverName,
      localRole: "driver",
      displayName: driverName || t("driver"),
    });
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
      trackingActive: true,
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
    navigator.geolocation.getCurrentPosition(pushDriverLocation, function () {}, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    geoWatchId = navigator.geolocation.watchPosition(
      pushDriverLocation,
      function (error) {
        console.error("Geolocation failed", error);
        document.getElementById("locationBox").textContent = t("locationUnavailable");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    document.getElementById("startTrackingBtn").hidden = true;
    document.getElementById("stopTrackingBtn").hidden = false;
    const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; });
    if (order) renderLocationBox(order);
  }

  function stopTracking(clearRemote) {
    if (geoWatchId != null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    const startBtn = document.getElementById("startTrackingBtn");
    const stopBtn = document.getElementById("stopTrackingBtn");
    const box = document.getElementById("locationBox");
    if (startBtn) startBtn.hidden = false;
    if (stopBtn) stopBtn.hidden = true;
    if (box) box.textContent = t("trackingStopped");
    if (clearRemote && activeOrderId) {
      db.collection("orders").doc(activeOrderId).update({
        driverLocation: firebase.firestore.FieldValue.delete(),
        trackingActive: false,
        updatedAt: new Date().toISOString(),
      }).catch(function (error) {
        console.error("Clear driver location failed", error);
      });
    }
  }

  function updateDriverStatus() {
    if (!activeOrderId || statusUpdateBusy || suppressStatusChange) return;
    const select = document.getElementById("driverStatusSelect");
    const status = select ? select.value : "";
    if (!status) return;
    const order = currentOrders.find(function (entry) { return entry.id === activeOrderId; }) ||
      allMarketOrders.find(function (entry) { return entry.id === activeOrderId; });
    if (!order) return;
    if (normalizeOrderStatus(order.status) === normalizeOrderStatus(status)) return;

    const payload = { status: status, updatedAt: new Date().toISOString() };
    if (normalizeOrderStatus(status) === "arrived") payload.arrivedAt = payload.updatedAt;

    statusUpdateBusy = true;
    pendingStatusUpdate = { orderId: activeOrderId, status: status, at: Date.now() };
    patchLocalOrderStatus(activeOrderId, payload);
    renderOrders(allMarketOrders);

    db.collection("orders").doc(activeOrderId).update(payload).then(function () {
      pendingStatusUpdate = null;
      statusUpdateBusy = false;
      if (normalizeOrderStatus(status) === "arrived") {
        stopTracking();
        const closeBtn = document.getElementById("closeOrderBtn");
        if (closeBtn) closeBtn.hidden = false;
      }
      renderActiveOrderDetails();
    }).catch(function (error) {
      console.error("Status update failed", error);
      pendingStatusUpdate = null;
      statusUpdateBusy = false;
      alert(error.message || t("unknown"));
      renderOrders(allMarketOrders);
      renderActiveOrderDetails();
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
      trackingActive: false,
      driverLocation: firebase.firestore.FieldValue.delete(),
    }).then(function () {
      return archiveOrderConversation(db, orderId, order, "order_closed");
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
      if (window.InAppCall) window.InAppCall.close(false);
      stopTracking(false);
      activeOrderId = "";
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
  document.getElementById("driverStatusSelect").addEventListener("change", updateDriverStatus);
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
    var nameInput = document.getElementById("driverNameInput");
    var phoneInput = document.getElementById("driverPhoneInput");
    driverName = String(nameInput && nameInput.value || "").trim();
    if (!driverName) {
      alert(t("driverNameRequired"));
      return;
    }
    driverPhone = String(phoneInput && phoneInput.value || "").trim();
    var normalizePhone = OL.normalizePhone || function (v) { return String(v || "").replace(/\D/g, ""); };
    if (driverPhone) driverPhone = normalizePhone(driverPhone) || driverPhone;
    localStorage.setItem(driverNameKey(), driverName);
    localStorage.setItem(driverPhoneKey(), driverPhone);
    updateDriverGate();
    renderOrders(allMarketOrders);
    syncDriverCallWatch();
  });

  document.getElementById("driverNameInput")?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("driverPhoneSave")?.click();
    }
  });
  document.getElementById("driverPhoneInput")?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("driverPhoneSave")?.click();
    }
  });

  applyLanguage();
  updateDriverGate();
  var logoutBtn = document.getElementById("driverLogoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", driverLogout);
  var savedNameInput = document.getElementById("driverNameInput");
  if (savedNameInput && driverName) savedNameInput.value = driverName;
  var savedPhoneInput = document.getElementById("driverPhoneInput");
  if (savedPhoneInput && driverPhone) savedPhoneInput.value = driverPhone;

  function applyOrdersSnapshot(snapshot) {
    allMarketOrders = snapshot.docs.map(function (entry) {
      return Object.assign({ id: entry.id }, entry.data());
    }).filter(function (order) {
      return orderMatchesMarket(order, MARKET_ID);
    });
    applyPendingStatusToOrders();
    historyOrders = allMarketOrders.filter(function (order) {
      return isOrderClosed(order.status);
    });
    renderOrders(allMarketOrders);
    if (activeOrderId) renderActiveOrderDetails();
  }

  if (MARKET_ID) {
    db.collection("orders").where("marketId", "==", MARKET_ID).onSnapshot(function (snapshot) {
      applyOrdersSnapshot(snapshot);
    }, function (error) {
      console.error("Orders listener failed", error);
      db.collection("orders").onSnapshot(function (snapshot) {
        applyOrdersSnapshot(snapshot);
      }, function (fallbackError) {
        console.error("Orders fallback listener failed", fallbackError);
        showBootError(fallbackError.message || t("bootErrorOrders"));
      });
    });
  }
})();
