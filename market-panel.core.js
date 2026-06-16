(function () {
  "use strict";

  const MARKET_ID = String(window.MARKET_ID || "").trim();
  const MARKET_LABEL = String(window.MARKET_LABEL || MARKET_ID || "Market");
  const MARKET_COLOR = String(window.MARKET_COLOR || "#2563eb");

  const I18N = {
    tr: {
      driverLink: "Surucu",
      orders: "Siparisler",
      pending: "Beklemede",
      onTheWay: "Yolda",
      noOrders: "Bu market icin siparis yok.",
      customerProfile: "Musteri profili",
      payment: "Odeme",
      payCash: "Kapida nakit",
      payCard: "Kart",
      cardLast4: "Son 4 hane",
      cardName: "Kart sahibi",
      cardExpiry: "Son kullanma",
      phone: "Telefon",
      address: "Adres",
      email: "E-posta",
      available: "Mevcut",
      unavailable: "Yok",
      markAvailable: "Mevcut yap",
      markUnavailable: "Yok yap",
      category: "Kategori",
      itemsTitle: "Urunler",
      updateStatus: "Durumu guncelle",
      driver: "Surucu",
      driverName: "Surucu adi",
      driverPhone: "Surucu telefonu",
      assignDriver: "Surucu ata ve yola cikar",
      deliveryPage: "Surucu sayfasi",
      trackDriver: "Surucuyu takip et",
      savedDrivers: "Kayitli suruculer",
      addDriver: "Surucu ekle",
      deleteDriver: "Surucuyu sil",
      selectDriver: "Surucu sec",
      chatTitle: "Canli sohbet",
      chatPlaceholder: "Musteriye mesaj yazin...",
      send: "Gonder",
      updated: "Guncellendi",
      unknown: "Bilinmiyor",
      orderNumber: "Siparis no",
      waitingStatus: "Siparis hazirlaniyor",
      onTheWayStatus: "Yolda",
      arrivedStatus: "Teslim edildi",
      inboxTitle: "Gelen kutusu",
      inboxEmpty: "Yeni bildirim yok.",
      inboxFeedback: "Musteri geri bildirimi",
      inboxClosed: "Siparis kapatildi",
      panelLoading: "{market} paneli yukleniyor...",
      deniedTitle: "Panel yuklenemedi",
      deniedMessageDefault: "Tum dosyalarin ayni klasorde oldugundan emin olun.",
      categoryGeneral: "Genel",
      bootErrorConfig: "Yapilandirma eksik. firebase-config.global.js dosyasini ayni klasorde tutun ve dogrudan market sayfasini acin (bim.html, sok.html vb.).",
      bootErrorFirebase: "Firebase yuklenemedi. Internet baglantinizi kontrol edin.",
      bootErrorOrders: "Siparisler yuklenemedi.",
    },
    en: {
      driverLink: "Driver",
      orders: "Orders",
      pending: "Pending",
      onTheWay: "On the way",
      noOrders: "No orders for this market yet.",
      customerProfile: "Customer profile",
      payment: "Payment",
      payCash: "Cash on delivery",
      payCard: "Card",
      cardLast4: "Last 4 digits",
      cardName: "Cardholder",
      cardExpiry: "Expiry",
      phone: "Phone",
      address: "Address",
      email: "Email",
      available: "Available",
      unavailable: "Unavailable",
      markAvailable: "Mark available",
      markUnavailable: "Mark unavailable",
      category: "Category",
      itemsTitle: "Items",
      updateStatus: "Update status",
      driver: "Driver",
      driverName: "Driver name",
      driverPhone: "Driver phone",
      assignDriver: "Assign driver & send",
      deliveryPage: "Driver delivery page",
      trackDriver: "Track driver",
      savedDrivers: "Saved drivers",
      addDriver: "Add driver",
      deleteDriver: "Delete driver",
      selectDriver: "Select driver",
      chatTitle: "Live chat",
      chatPlaceholder: "Message the customer...",
      send: "Send",
      updated: "Updated",
      unknown: "Unknown",
      orderNumber: "Order no",
      waitingStatus: "Waiting / preparing",
      onTheWayStatus: "On the way",
      arrivedStatus: "Arrived",
      inboxTitle: "Inbox",
      inboxEmpty: "No new notifications.",
      inboxFeedback: "Customer feedback",
      inboxClosed: "Order closed",
      panelLoading: "Loading {market} panel...",
      deniedTitle: "Panel could not load",
      deniedMessageDefault: "Check that all files are in the same folder.",
      categoryGeneral: "General",
      bootErrorConfig: "Config missing. Keep firebase-config.global.js in the same folder and open this market page directly (bim.html, sok.html, etc.).",
      bootErrorFirebase: "Firebase failed to load. Check your internet connection.",
      bootErrorOrders: "Could not load orders.",
    },
    ar: {
      driverLink: "السائق",
      orders: "الطلبات",
      pending: "قيد الانتظار",
      onTheWay: "في الطريق",
      noOrders: "لا توجد طلبات لهذا السوق بعد.",
      customerProfile: "ملف العميل",
      payment: "الدفع",
      payCash: "نقداً عند التسليم",
      payCard: "بطاقة",
      cardLast4: "آخر 4 أرقام",
      cardName: "اسم حامل البطاقة",
      cardExpiry: "تاريخ الانتهاء",
      phone: "الهاتف",
      address: "العنوان",
      email: "البريد الإلكتروني",
      available: "متوفر",
      unavailable: "غير متوفر",
      markAvailable: "تعيين متوفر",
      markUnavailable: "تعيين غير متوفر",
      category: "الفئة",
      itemsTitle: "المنتجات",
      updateStatus: "تحديث الحالة",
      driver: "السائق",
      driverName: "اسم السائق",
      driverPhone: "هاتف السائق",
      assignDriver: "تعيين السائق وإرساله",
      deliveryPage: "صفحة تسليم السائق",
      trackDriver: "تتبع السائق",
      savedDrivers: "السائقون المحفوظون",
      addDriver: "إضافة سائق",
      deleteDriver: "حذف السائق",
      selectDriver: "اختر السائق",
      chatTitle: "دردشة مباشرة",
      chatPlaceholder: "اكتب رسالة للعميل...",
      send: "إرسال",
      updated: "تم التحديث",
      unknown: "غير معروف",
      orderNumber: "رقم الطلب",
      waitingStatus: "قيد التحضير",
      onTheWayStatus: "في الطريق",
      arrivedStatus: "تم التسليم",
      inboxTitle: "صندوق الوارد",
      inboxEmpty: "لا توجد إشعارات جديدة.",
      inboxFeedback: "ملاحظات العميل",
      inboxClosed: "تم إغلاق الطلب",
      panelLoading: "جاري تحميل لوحة {market}...",
      deniedTitle: "تعذر تحميل اللوحة",
      deniedMessageDefault: "تأكد من أن جميع الملفات في نفس المجلد.",
      categoryGeneral: "عام",
      bootErrorConfig: "الإعدادات ناقصة. احتفظ بملف firebase-config.global.js في نفس المجلد وافتح صفحة السوق مباشرة.",
      bootErrorFirebase: "تعذر تحميل Firebase. تحقق من اتصال الإنترنت.",
      bootErrorOrders: "تعذر تحميل الطلبات.",
    },
  };

  const OL = window.OrderLifecycle || {};
  const STATUSES = OL.ORDER_STATUSES || ["waiting", "on-the-way", "arrived"];
  const normalizeOrderStatus = OL.normalizeOrderStatus || function (s) { return s || "waiting"; };
  const orderNumberDisplay = OL.orderNumberDisplay || function () { return ""; };
  const groupItemsByCategory = OL.groupItemsByCategory || function (items) {
    return [{ category: "General", entries: (items || []).map(function (item, index) { return { item: item, index: index }; }) }];
  };
  const computeOrderTotal = OL.computeOrderTotal || function (items) {
    return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
      if (item && item.available === false) return sum;
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);
  };
  const isOrderClosed = OL.isOrderClosed || function () { return false; };
  const isOrderCommunicationActive = OL.isOrderCommunicationActive || function () { return true; };
  const orderChatCollection = OL.orderChatCollection || function (db, id) {
    return db.collection("orderChats").doc(id).collection("messages");
  };
  const normalizePhone = OL.normalizePhone || function (v) { return String(v || "").replace(/\D/g, ""); };
  let currentLang = localStorage.getItem("app_lang") || "tr";
  let currentOrders = [];
  let currentInboxEntries = [];
  let marketDrivers = [];
  const userCache = new Map();
  const chatUnsubscribers = new Map();

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  }

  if (!window.FIREBASE_CONFIG || !MARKET_ID) {
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

  function showBootError(message) {
    const loading = document.getElementById("marketLoading");
    const denied = document.getElementById("accessDenied");
    if (loading) loading.style.display = "none";
    if (denied) {
      denied.style.display = "block";
      const title = document.getElementById("deniedTitle");
      const msg = document.getElementById("deniedMessage");
      if (title) title.textContent = t("deniedTitle");
      if (msg) msg.textContent = message || t("deniedMessageDefault");
    }
  }

  function categoryLabel(name) {
    return name === "General" ? t("categoryGeneral") : name;
  }

  function deliveryPageHref() {
    return MARKET_ID + "-delivery.html";
  }

  function normalizeMarketKey(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }

  function orderMatchesMarket(order, marketId) {
    const target = normalizeMarketKey(marketId);
    if (!target) return false;
    if (normalizeMarketKey(order.marketId || order.marketName) === target) return true;
    return (Array.isArray(order.items) ? order.items : []).some((item) => normalizeMarketKey(item.market) === target);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 2200);
  }

  function formatPrice(price) {
    return `${Number(price || 0).toFixed(2).replace(".", ",")} TL`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function statusLabel(status) {
    const normalized = normalizeOrderStatus(status);
    return {
      waiting: t("waitingStatus"),
      "on-the-way": t("onTheWayStatus"),
      arrived: t("arrivedStatus"),
    }[normalized] || normalized;
  }

  function statusClass(status) {
    return "status-" + String(normalizeOrderStatus(status) || "waiting").replace(/\s+/g, "-");
  }

  function paymentHtml(order) {
    if (!order.paymentMethod && !order.paymentSummary) return "";
    const summary = order.paymentSummary || {};
    if (order.paymentMethod === "card" || summary.type === "card") {
      return `
        <strong>${escapeHtml(t("payment"))}</strong>
        ${escapeHtml(t("payCard"))}<br>
        ${escapeHtml(t("cardName"))}: ${escapeHtml(summary.cardholderName || t("unknown"))}<br>
        ${escapeHtml(t("cardLast4"))}: ${escapeHtml(summary.last4 || "----")}<br>
        ${escapeHtml(t("cardExpiry"))}: ${escapeHtml(summary.expiry || "-")}
      `;
    }
    return `<strong>${escapeHtml(t("payment"))}</strong>${escapeHtml(t("payCash"))}`;
  }

  function renderOrderItemsHtml(items, orderId) {
    return groupItemsByCategory(items).map(function (group) {
      const rows = group.entries.map(function (entry) {
        const item = entry.item;
        const itemIndex = entry.index;
        const available = item.available !== false;
        const lineTotal = available ? (Number(item.price) || 0) * (Number(item.qty) || 1) : 0;
        return `
          <div class="order-item-row ${available ? "" : "item-unavailable"}">
            <div>
              <div>${escapeHtml(item.name)} x ${item.qty || 1}</div>
              <div class="card-meta">${formatPrice(lineTotal)}</div>
            </div>
            <span class="avail-badge ${available ? "avail-yes" : "avail-no"}">${escapeHtml(available ? t("available") : t("unavailable"))}</span>
            <button class="btn-small btn-secondary" type="button"
              data-market-action="toggle-item" data-order-id="${escapeHtml(orderId)}" data-item-index="${itemIndex}" data-available="${available ? "0" : "1"}">
              ${escapeHtml(available ? t("markUnavailable") : t("markAvailable"))}
            </button>
          </div>
        `;
      }).join("");
      return `
        <div class="item-category-block">
          <div class="item-category-title">${escapeHtml(categoryLabel(group.category))}</div>
          ${rows}
        </div>
      `;
    }).join("");
  }

  function driverMapLink(order) {
    const loc = order.driverLocation || order.driver?.location;
    if (!loc || loc.lat == null || loc.lng == null) return "";
    const url = `https://www.google.com/maps?q=${encodeURIComponent(loc.lat)},${encodeURIComponent(loc.lng)}`;
    return `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(t("trackDriver"))}</a>`;
  }

  async function getUserProfile(userId, order) {
    if (userCache.has(userId)) return userCache.get(userId);
    let profile = {
      name: order.userName || "",
      email: order.userEmail || "",
      phone: order.userPhone || "",
      address: order.userAddress || "",
    };
    try {
      const snap = await db.collection("users").doc(userId).get();
      if (snap.exists) {
        const data = snap.data();
        profile = {
          name: data.name || profile.name,
          email: data.email || profile.email,
          phone: data.phone || profile.phone,
          address: data.address || profile.address,
        };
      }
    } catch (error) {
      console.warn("User profile fetch failed", error);
    }
    userCache.set(userId, profile);
    return profile;
  }

  function renderChatMessages(orderId, messages) {
    const root = document.getElementById(`chat-messages-${orderId}`);
    if (!root) return;
    const order = currentOrders.find((entry) => entry.id === orderId);
    const getMarketLabel = window.MarketsConfig?.getMarketLabel || function (key) {
      return String(key || MARKET_LABEL || "Market");
    };
    const resolveName = OL.resolveChatSenderDisplayName || function (msg) {
      return msg.senderName || t("unknown");
    };
    const roleClass = OL.chatRoleClass || function (role) {
      return role === "driver" ? "driver" : role === "market" ? "market" : "customer";
    };
    if (!messages.length) {
      root.innerHTML = `<div class="card-meta">${escapeHtml(t("chatTitle"))}</div>`;
      return;
    }
    root.innerHTML = messages.map((msg) => {
      const role = roleClass(msg.senderRole);
      const senderLabel = resolveName(msg, order, {
        getMarketLabel: getMarketLabel,
        adminLabel: "Admin",
        driverLabel: t("driver"),
        unknownLabel: t("unknown"),
      });
      return `
        <div class="chat-msg ${role}">
          <div class="chat-msg-meta">${escapeHtml(senderLabel)} · ${escapeHtml(formatDate(msg.createdAt))}</div>
          <div>${escapeHtml(msg.text || "")}</div>
        </div>
      `;
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindChatListener(order) {
    const orderId = order.id;
    if (chatUnsubscribers.has(orderId)) return;
    if (!isOrderCommunicationActive(order) && !isOrderClosed(order.status)) return;
    const unsub = orderChatCollection(db, orderId)
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => {
        renderChatMessages(orderId, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      });
    chatUnsubscribers.set(orderId, unsub);
  }

  function clearChatListeners(activeOrderIds) {
    chatUnsubscribers.forEach((unsub, orderId) => {
      if (!activeOrderIds.has(orderId)) {
        unsub();
        chatUnsubscribers.delete(orderId);
      }
    });
  }

  function inboxTypeLabel(entry) {
    const type = String(entry.inboxType || "").toLowerCase();
    if (type === "order_closed") return t("inboxClosed");
    if (type === "order_feedback") return t("inboxFeedback");
    return t("inboxTitle");
  }

  function driverSelectOptions(selectedId) {
    const options = [`<option value="">${escapeHtml(t("selectDriver"))}</option>`];
    marketDrivers.forEach((driver) => {
      const selected = driver.id === selectedId ? " selected" : "";
      options.push(`<option value="${escapeHtml(driver.id)}"${selected}>${escapeHtml(driver.name || t("unknown"))} · ${escapeHtml(driver.phone || "")}</option>`);
    });
    return options.join("");
  }

  function renderDriversPanel() {
    let root = document.getElementById("marketDriversPanel");
    if (!root) {
      root = document.createElement("div");
      root.id = "marketDriversPanel";
      root.className = "card";
      const ordersList = document.getElementById("ordersList");
      if (ordersList && ordersList.parentNode) {
        ordersList.parentNode.insertBefore(root, ordersList);
      }
    }
    const rows = marketDrivers.map((driver) => (
      `<div class="order-item-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span>${escapeHtml(driver.name || t("unknown"))} · ${escapeHtml(driver.phone || "")}</span>
        <button class="btn-danger" type="button" data-market-action="delete-driver" data-driver-id="${escapeHtml(driver.id)}">${escapeHtml(t("deleteDriver"))}</button>
      </div>`
    )).join("");
    root.innerHTML = `
      <div class="card-title">${escapeHtml(t("savedDrivers"))}</div>
      ${rows || `<p class="card-meta">${escapeHtml(t("unknown"))}</p>`}
      <div class="driver-fields" style="margin-top:10px;display:grid;gap:8px;">
        <input class="field-input" id="newDriverName" placeholder="${escapeHtml(t("driverName"))}" />
        <input class="field-input" id="newDriverPhone" placeholder="${escapeHtml(t("driverPhone"))}" />
        <button class="btn-secondary" type="button" data-market-action="add-driver">${escapeHtml(t("addDriver"))}</button>
      </div>
    `;
  }

  async function loadMarketDrivers() {
    try {
      const snap = await db.collection("marketDrivers").doc(MARKET_ID).get();
      marketDrivers = snap.exists && Array.isArray(snap.data().drivers) ? snap.data().drivers : [];
    } catch (error) {
      console.warn("Market drivers load failed", error);
      marketDrivers = [];
    }
    renderDriversPanel();
  }

  async function saveMarketDrivers() {
    await db.collection("marketDrivers").doc(MARKET_ID).set({
      marketId: MARKET_ID,
      drivers: marketDrivers,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    renderDriversPanel();
  }

  async function addMarketDriver() {
    const name = document.getElementById("newDriverName")?.value.trim() || "";
    const phoneRaw = document.getElementById("newDriverPhone")?.value.trim() || "";
    const phone = normalizePhone(phoneRaw) || phoneRaw;
    if (!name || !phone) return;
    const id = "drv_" + Date.now().toString(36);
    marketDrivers.push({ id, name, phone });
    await saveMarketDrivers();
    document.getElementById("newDriverName").value = "";
    document.getElementById("newDriverPhone").value = "";
    showToast(t("updated"));
    renderOrders(currentOrders);
  }

  async function deleteMarketDriver(driverId) {
    if (!driverId) return;
    marketDrivers = marketDrivers.filter((entry) => entry.id !== driverId);
    await saveMarketDrivers();
    showToast(t("updated"));
    renderOrders(currentOrders);
  }

  function renderMarketInbox(entries) {
    const root = document.getElementById("marketInboxList");
    if (!root) return;
    currentInboxEntries = entries;
    const visible = entries.filter((entry) => String(entry.message || "").trim());
    if (!visible.length) {
      root.innerHTML = `<p class="empty-msg">${escapeHtml(t("inboxEmpty"))}</p>`;
      return;
    }
    root.innerHTML = visible.map((entry) => {
      const orderNo = orderNumberDisplay({ orderNumber: entry.orderNumber });
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(inboxTypeLabel(entry))}${orderNo ? ` · ${escapeHtml(orderNo)}` : ""}</div>
              <div class="card-meta">${escapeHtml(formatDate(entry.requestedAt || entry.createdAt))}</div>
              ${entry.userName || entry.name ? `<div class="card-meta">${escapeHtml(entry.userName || entry.name || "")}</div>` : ""}
            </div>
          </div>
          <div class="message-box">${escapeHtml(entry.message)}</div>
        </div>
      `;
    }).join("");
  }

  function startMarketInboxListener() {
    const root = document.getElementById("marketInboxList");
    if (!root) return;
    const renderInboxSnapshot = (snapshot) => {
      const entries = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((entry) => !entry.marketId || normalizeMarketKey(entry.marketId) === normalizeMarketKey(MARKET_ID))
        .sort((a, b) => String(b.requestedAt || b.createdAt || "").localeCompare(String(a.requestedAt || a.createdAt || "")));
      renderMarketInbox(entries);
    };
    db.collection("marketInbox").where("marketId", "==", MARKET_ID)
      .onSnapshot(renderInboxSnapshot, (error) => {
        console.error("Market inbox listener failed", error);
        db.collection("marketInbox").onSnapshot(renderInboxSnapshot, (fallbackError) => {
          console.error("Market inbox fallback failed", fallbackError);
        });
      });
  }

  function startOrdersListener() {
    const renderSnapshot = (snapshot) => {
      const orders = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      renderOrders(orders.filter((order) => orderMatchesMarket(order, MARKET_ID)));
    };
    db.collection("orders").where("marketId", "==", MARKET_ID).onSnapshot(renderSnapshot, (error) => {
      console.error("Orders listener failed", error);
      db.collection("orders").onSnapshot(renderSnapshot, (fallbackError) => {
        console.error("Orders fallback listener failed", fallbackError);
        showBootError(fallbackError.message || t("bootErrorOrders"));
      });
    });
  }

  async function renderOrders(orders) {
    const filtered = orders
      .filter((order) => orderMatchesMarket(order, MARKET_ID))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    currentOrders = filtered;
    document.getElementById("statTotal").textContent = String(filtered.length);
    document.getElementById("statPending").textContent = String(filtered.filter((o) => normalizeOrderStatus(o.status) === "waiting").length);
    document.getElementById("statActive").textContent = String(filtered.filter((o) => normalizeOrderStatus(o.status) === "on-the-way").length);

    const root = document.getElementById("ordersList");
    if (!filtered.length) {
      root.innerHTML = `<p class="empty-msg">${escapeHtml(t("noOrders"))}</p>`;
      clearChatListeners(new Set());
      return;
    }

    const profiles = await Promise.all(filtered.map((order) => getUserProfile(order.userId, order)));
    const activeIds = new Set(filtered.map((order) => order.id));

    root.innerHTML = filtered.map((order, index) => {
      const profile = profiles[index];
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsHtml = renderOrderItemsHtml(items, order.id);

      const currentStatus = normalizeOrderStatus(order.status);
      const orderNo = orderNumberDisplay(order);
      const closed = isOrderClosed(order.status);
      const statusOptions = STATUSES.map((status) =>
        `<option value="${status}" ${currentStatus === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`
      ).join("");
      const driver = order.driver || {};
      const driverTrack = driverMapLink(order);

      return `
        <div class="card" id="order-${escapeHtml(order.id)}">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(profile.name || order.userName || t("unknown"))}${orderNo ? ` · ${escapeHtml(orderNo)}` : ""}</div>
              <div class="card-meta">${orderNo ? `${escapeHtml(t("orderNumber"))}: ${escapeHtml(orderNo)} · ` : ""}${escapeHtml(formatDate(order.createdAt))}</div>
              <span class="status-badge ${statusClass(currentStatus)}">${escapeHtml(statusLabel(order.status))}</span>
            </div>
            <div class="card-title">${formatPrice(computeOrderTotal(items))}</div>
          </div>
          <div class="profile-box">
            <strong>${escapeHtml(t("customerProfile"))}</strong>
            ${escapeHtml(t("email"))}: ${escapeHtml(profile.email || t("unknown"))}<br>
            ${escapeHtml(t("phone"))}: ${escapeHtml(profile.phone || t("unknown"))}<br>
            ${escapeHtml(t("address"))}: ${escapeHtml(profile.address || t("unknown"))}
          </div>
          ${paymentHtml(order) ? `<div class="payment-box">${paymentHtml(order)}</div>` : ""}
          <div class="items-section">
            <strong>${escapeHtml(t("itemsTitle"))}</strong>
            ${itemsHtml}
          </div>
          <div class="actions-row">
            <select class="status-select" id="status-${escapeHtml(order.id)}" ${closed ? "disabled" : ""}>${statusOptions}</select>
            <button class="btn-update" type="button" data-market-action="update-status" data-order-id="${escapeHtml(order.id)}" ${closed ? "disabled" : ""}>${escapeHtml(t("updateStatus"))}</button>
          </div>
          <div class="driver-box">
            <strong>${escapeHtml(t("driver"))}</strong>
            <div class="driver-fields">
              <select class="field-input" id="driver-select-${escapeHtml(order.id)}" data-market-action="pick-driver" data-order-id="${escapeHtml(order.id)}">${driverSelectOptions(driver.driverId || "")}</select>
              <input class="field-input" id="driver-name-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("driverName"))}" value="${escapeHtml(driver.name || "")}" />
              <input class="field-input" id="driver-phone-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("driverPhone"))}" value="${escapeHtml(driver.phone || "")}" />
            </div>
            <div class="actions-row">
              <button class="btn-primary" type="button" data-market-action="assign-driver" data-order-id="${escapeHtml(order.id)}" ${isOrderClosed(order.status) ? "disabled" : ""}>${escapeHtml(t("assignDriver"))}</button>
              ${driverTrack}
            </div>
          </div>
          ${isOrderClosed(order.status) ? `<div class="card-meta" style="margin-top:10px;">${escapeHtml(t("inboxClosed"))}</div>` : `
          <div class="chat-panel${isOrderCommunicationActive(order) ? "" : " chat-disabled"}">
            <div class="card-meta" style="padding:10px 10px 0;">${escapeHtml(t("chatTitle"))}</div>
            <div class="chat-messages" id="chat-messages-${escapeHtml(order.id)}"></div>
            <div class="chat-compose" ${isOrderCommunicationActive(order) ? "" : 'style="display:none"'}>
              <input class="chat-input" id="chat-input-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("chatPlaceholder"))}" />
              <button class="btn-primary" type="button" data-market-action="send-chat" data-order-id="${escapeHtml(order.id)}">${escapeHtml(t("send"))}</button>
            </div>
          </div>`}
        </div>
      `;
    }).join("");

    clearChatListeners(activeIds);
    filtered.forEach((order) => {
      if (isOrderCommunicationActive(order) || isOrderClosed(order.status)) {
        bindChatListener(order);
      }
    });
  }

  async function toggleItemAvailability(orderId, itemIndex, makeAvailable) {
    const order = currentOrders.find((entry) => entry.id === orderId);
    if (!order) return;
    const items = Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [];
    if (!items[itemIndex]) return;
    items[itemIndex].available = makeAvailable;
    const totalPrice = computeOrderTotal(items);
    await db.collection("orders").doc(orderId).update({
      items,
      totalPrice,
      updatedAt: new Date().toISOString(),
    });
    showToast(t("updated"));
  }

  async function updateOrderStatus(orderId) {
    const order = currentOrders.find((entry) => entry.id === orderId);
    if (!order) {
      showToast(t("unknown"));
      return;
    }
    if (isOrderClosed(order.status)) {
      showToast(t("inboxClosed"));
      return;
    }
    const select = document.getElementById(`status-${orderId}`);
    if (!select || select.disabled) return;
    const status = normalizeOrderStatus(select.value);
    if (!STATUSES.includes(status)) return;
    const button = document.querySelector(`[data-market-action="update-status"][data-order-id="${orderId}"]`);
    try {
      if (button) button.disabled = true;
      await db.collection("orders").doc(orderId).update({
        status,
        updatedAt: new Date().toISOString(),
        ...(status === "arrived" ? { arrivedAt: new Date().toISOString() } : {}),
      });
      showToast(t("updated"));
    } catch (error) {
      console.error("Market status update failed", error);
      showToast(String(error.message || t("unknown")));
    } finally {
      if (button && !isOrderClosed(order.status)) button.disabled = false;
    }
  }

  async function assignDriver(orderId) {
    const select = document.getElementById(`driver-select-${orderId}`);
    const selectedId = select ? select.value : "";
    let name = document.getElementById(`driver-name-${orderId}`)?.value.trim() || "";
    let phone = document.getElementById(`driver-phone-${orderId}`)?.value.trim() || "";
    let driverId = "";
    if (selectedId) {
      const saved = marketDrivers.find((entry) => entry.id === selectedId);
      if (saved) {
        name = saved.name || name;
        phone = saved.phone || phone;
        driverId = saved.id;
      }
    }
    phone = normalizePhone(phone) || phone;
    if (!name || !phone) return;
    if (!driverId && !marketDrivers.some((entry) => normalizePhone(entry.phone) === phone)) {
      driverId = "drv_" + Date.now().toString(36);
      marketDrivers.push({ id: driverId, name, phone });
      await saveMarketDrivers();
    }
    await db.collection("orders").doc(orderId).update({
      status: "on-the-way",
      marketId: MARKET_ID,
      marketName: MARKET_LABEL,
      driver: { driverId, name, phone: normalizePhone(phone) || phone },
      driverAssignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    showToast(t("updated"));
  }

  async function sendChatMessage(orderId) {
    const order = currentOrders.find((entry) => entry.id === orderId);
    if (!order || !isOrderCommunicationActive(order)) return;
    const input = document.getElementById(`chat-input-${orderId}`);
    const text = String(input?.value || "").trim();
    if (!text) return;
    await orderChatCollection(db, orderId).add({
      senderId: localStorage.getItem("user_uid") || "market",
      senderRole: "market",
      senderName: MARKET_LABEL,
      marketId: MARKET_ID,
      text,
      createdAt: new Date().toISOString(),
    });
    input.value = "";
  }

  function bindMarketActions() {
    const root = document.getElementById("marketGuard");
    if (!root || root.dataset.actionsBound === "1") return;
    root.dataset.actionsBound = "1";
    root.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-market-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.marketAction;
      const orderId = button.dataset.orderId || "";
      try {
        if (action === "toggle-item") {
          await toggleItemAvailability(orderId, Number(button.dataset.itemIndex), button.dataset.available === "1");
        } else if (action === "update-status") {
          await updateOrderStatus(orderId);
        } else if (action === "assign-driver") {
          await assignDriver(orderId);
        } else if (action === "add-driver") {
          await addMarketDriver();
        } else if (action === "delete-driver") {
          await deleteMarketDriver(button.dataset.driverId || "");
        } else if (action === "send-chat") {
          await sendChatMessage(orderId);
        }
      } catch (error) {
        console.error("Market action failed", action, error);
        showToast(`${t("unknown")}: ${error.message}`);
      }
    });
    root.addEventListener("change", (event) => {
      const select = event.target.closest("[data-market-action='pick-driver']");
      if (!select) return;
      const orderId = select.dataset.orderId || "";
      const saved = marketDrivers.find((entry) => entry.id === select.value);
      if (!saved) return;
      const nameInput = document.getElementById(`driver-name-${orderId}`);
      const phoneInput = document.getElementById(`driver-phone-${orderId}`);
      if (nameInput) nameInput.value = saved.name || "";
      if (phoneInput) phoneInput.value = saved.phone || "";
    });
    root.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const input = event.target.closest(".chat-input");
      if (!input || !input.id.startsWith("chat-input-")) return;
      event.preventDefault();
      await sendChatMessage(input.id.replace("chat-input-", ""));
    });
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.getElementById("langSelect").value = currentLang;
    const driverLink = document.getElementById("driverLink");
    if (driverLink) {
      driverLink.textContent = t("driverLink");
      driverLink.href = deliveryPageHref();
    }
    document.getElementById("statTotalLabel").textContent = t("orders");
    document.getElementById("statPendingLabel").textContent = t("pending");
    document.getElementById("statActiveLabel").textContent = t("onTheWay");
    const inboxTitle = document.getElementById("marketInboxTitle");
    if (inboxTitle) inboxTitle.textContent = t("inboxTitle");
    const loading = document.getElementById("marketLoading");
    if (loading) loading.textContent = t("panelLoading").replace("{market}", MARKET_LABEL);
    document.title = `${MARKET_LABEL} Panel`;
    document.getElementById("marketTitle").textContent = MARKET_LABEL;
    const badge = document.getElementById("marketBadge");
    if (badge) badge.textContent = MARKET_LABEL.slice(0, 3).toUpperCase();
  }

  function startPanel() {
    const loadingEl = document.getElementById("marketLoading");
    if (loadingEl) loadingEl.style.display = "none";
    document.getElementById("marketGuard").style.display = "block";
    const header = document.getElementById("marketHeader");
    if (header) header.style.borderLeftColor = MARKET_COLOR;
    const badge = document.getElementById("marketBadge");
    if (badge) badge.style.background = MARKET_COLOR;
    bindMarketActions();
    applyLanguage();
    document.getElementById("langSelect").addEventListener("change", (event) => {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
      renderOrders(currentOrders);
      renderMarketInbox(currentInboxEntries);
    });
    startMarketInboxListener();
    loadMarketDrivers();
    startOrdersListener();
  }

  startPanel();
})();
