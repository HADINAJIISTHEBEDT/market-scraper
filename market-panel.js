import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore, collection, doc, getDoc, updateDoc, onSnapshot, addDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const firebaseConfig = window.FIREBASE_CONFIG;
const { MARKETS, getMarketLabel, orderMatchesMarket } = window.MarketsConfig;

const I18N = {
  tr: {
    deniedTitle: "Erisim reddedildi",
    deniedMessage: "Market panelini gormek icin admin olarak giris yapmalisiniz.",
    deniedBack: "Marketlere don",
    marketsLink: "Tum marketler",
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
    updateStatus: "Durumu guncelle",
    driver: "Surucu",
    driverName: "Surucu adi",
    driverPhone: "Surucu telefonu",
    assignDriver: "Surucu ata ve yola cikar",
    trackDriver: "Surucuyu takip et",
    chatTitle: "Canli sohbet",
    chatPlaceholder: "Musteriye mesaj yazin...",
    send: "Gonder",
    updated: "Guncellendi",
    unknown: "Bilinmiyor",
    pendingStatus: "Beklemede",
    preparing: "Hazirlaniyor",
    onTheWayStatus: "Yolda",
    delivered: "Teslim edildi",
  },
  en: {
    deniedTitle: "Access denied",
    deniedMessage: "You must be logged in as admin to view this market panel.",
    deniedBack: "Back to markets",
    marketsLink: "All markets",
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
    updateStatus: "Update status",
    driver: "Driver",
    driverName: "Driver name",
    driverPhone: "Driver phone",
    assignDriver: "Assign driver & send",
    trackDriver: "Track driver",
    chatTitle: "Live chat",
    chatPlaceholder: "Message the customer...",
    send: "Send",
    updated: "Updated",
    unknown: "Unknown",
    pendingStatus: "Pending",
    preparing: "Preparing",
    onTheWayStatus: "On the way",
    delivered: "Delivered",
  },
  ar: {
    deniedTitle: "تم رفض الوصول",
    deniedMessage: "يجب تسجيل الدخول كمسؤول لعرض لوحة السوق.",
    deniedBack: "العودة إلى الأسواق",
    marketsLink: "كل الأسواق",
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
    updateStatus: "تحديث الحالة",
    driver: "السائق",
    driverName: "اسم السائق",
    driverPhone: "هاتف السائق",
    assignDriver: "تعيين السائق وإرساله",
    trackDriver: "تتبع السائق",
    chatTitle: "دردشة مباشرة",
    chatPlaceholder: "اكتب رسالة للعميل...",
    send: "إرسال",
    updated: "تم التحديث",
    unknown: "غير معروف",
    pendingStatus: "قيد الانتظار",
    preparing: "قيد التحضير",
    onTheWayStatus: "في الطريق",
    delivered: "تم التسليم",
  },
};

const STATUSES = ["pending", "preparing", "on-the-way", "delivered"];

export async function initMarketPanel(marketId, options = {}) {
  if (!window.FIREBASE_CONFIG || !window.MarketsConfig) {
    const denied = document.getElementById("accessDenied");
    const loading = document.getElementById("marketLoading");
    if (loading) loading.style.display = "none";
    if (denied) {
      denied.style.display = "block";
      const msg = document.getElementById("deniedMessage");
      if (msg) msg.textContent = "Config files missing. Keep all files in the same folder.";
    }
    return;
  }

  const fixedMarket = Boolean(options.fixedMarket);
  const showMarketSelect = Boolean(options.showMarketSelect);
  let currentMarketId = marketId || MARKETS[0].key;
  let currentLang = localStorage.getItem("app_lang") || "tr";
  let currentOrders = [];
  const userCache = new Map();
  const chatUnsubscribers = new Map();

  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
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
    return {
      pending: t("pendingStatus"),
      preparing: t("preparing"),
      "on-the-way": t("onTheWayStatus"),
      delivered: t("delivered"),
    }[status] || status;
  }

  function statusClass(status) {
    return "status-" + String(status || "pending").replace(/\s+/g, "-");
  }

  function paymentHtml(order) {
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
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) {
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
    if (!messages.length) {
      root.innerHTML = `<div class="card-meta">${escapeHtml(t("chatTitle"))}</div>`;
      return;
    }
    root.innerHTML = messages.map((msg) => {
      const role = msg.senderRole === "market" ? "market" : "customer";
      return `
        <div class="chat-msg ${role}">
          <div class="chat-msg-meta">${escapeHtml(msg.senderName || t("unknown"))} · ${escapeHtml(formatDate(msg.createdAt))}</div>
          <div>${escapeHtml(msg.text || "")}</div>
        </div>
      `;
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function bindChatListener(orderId) {
    if (chatUnsubscribers.has(orderId)) return;
    const q = query(collection(db, "orderChats", orderId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      renderChatMessages(orderId, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
    chatUnsubscribers.set(orderId, unsub);
  }

  function clearChatListeners(activeOrderIds) {
    for (const [orderId, unsub] of chatUnsubscribers.entries()) {
      if (!activeOrderIds.has(orderId)) {
        unsub();
        chatUnsubscribers.delete(orderId);
      }
    }
  }

  async function renderOrders(orders) {
    const filtered = orders
      .filter((order) => orderMatchesMarket(order, currentMarketId))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    currentOrders = filtered;
    document.getElementById("statTotal").textContent = String(filtered.length);
    document.getElementById("statPending").textContent = String(filtered.filter((o) => o.status === "pending").length);
    document.getElementById("statActive").textContent = String(filtered.filter((o) => o.status === "on-the-way").length);

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
      const itemsHtml = items.map((item, itemIndex) => {
        const available = item.available !== false;
        return `
          <div class="order-item-row ${available ? "" : "item-unavailable"}">
            <div>
              <div>${escapeHtml(item.name)} x ${item.qty || 1}</div>
              <div class="card-meta">${formatPrice((item.price || 0) * (item.qty || 1))}</div>
            </div>
            <span class="avail-badge ${available ? "avail-yes" : "avail-no"}">${escapeHtml(available ? t("available") : t("unavailable"))}</span>
            <button class="btn-small btn-secondary" type="button"
              data-market-action="toggle-item" data-order-id="${escapeHtml(order.id)}" data-item-index="${itemIndex}" data-available="${available ? "0" : "1"}">
              ${escapeHtml(available ? t("markUnavailable") : t("markAvailable"))}
            </button>
          </div>
        `;
      }).join("");

      const statusOptions = STATUSES.map((status) =>
        `<option value="${status}" ${order.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`
      ).join("");
      const driver = order.driver || {};
      const driverTrack = driverMapLink(order);

      return `
        <div class="card" id="order-${escapeHtml(order.id)}">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(profile.name || order.userName || t("unknown"))}</div>
              <div class="card-meta">${escapeHtml(formatDate(order.createdAt))}</div>
              <span class="status-badge ${statusClass(order.status)}">${escapeHtml(statusLabel(order.status))}</span>
            </div>
            <div class="card-title">${formatPrice(order.totalPrice)}</div>
          </div>
          <div class="profile-box">
            <strong>${escapeHtml(t("customerProfile"))}</strong>
            ${escapeHtml(t("email"))}: ${escapeHtml(profile.email || t("unknown"))}<br>
            ${escapeHtml(t("phone"))}: ${escapeHtml(profile.phone || t("unknown"))}<br>
            ${escapeHtml(t("address"))}: ${escapeHtml(profile.address || t("unknown"))}
          </div>
          <div class="payment-box">${paymentHtml(order)}</div>
          <div>${itemsHtml}</div>
          <div class="actions-row">
            <select class="status-select" id="status-${escapeHtml(order.id)}">${statusOptions}</select>
            <button class="btn-update" type="button" data-market-action="update-status" data-order-id="${escapeHtml(order.id)}">${escapeHtml(t("updateStatus"))}</button>
          </div>
          <div class="driver-box">
            <strong>${escapeHtml(t("driver"))}</strong>
            <div class="driver-fields">
              <input class="field-input" id="driver-name-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("driverName"))}" value="${escapeHtml(driver.name || "")}" />
              <input class="field-input" id="driver-phone-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("driverPhone"))}" value="${escapeHtml(driver.phone || "")}" />
            </div>
            <div class="actions-row">
              <button class="btn-primary" type="button" data-market-action="assign-driver" data-order-id="${escapeHtml(order.id)}">${escapeHtml(t("assignDriver"))}</button>
              ${driverTrack}
            </div>
          </div>
          <div class="chat-panel">
            <div class="card-meta" style="padding:10px 10px 0;">${escapeHtml(t("chatTitle"))}</div>
            <div class="chat-messages" id="chat-messages-${escapeHtml(order.id)}"></div>
            <div class="chat-compose">
              <input class="chat-input" id="chat-input-${escapeHtml(order.id)}" placeholder="${escapeHtml(t("chatPlaceholder"))}" />
              <button class="btn-primary" type="button" data-market-action="send-chat" data-order-id="${escapeHtml(order.id)}">${escapeHtml(t("send"))}</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    clearChatListeners(activeIds);
    filtered.forEach((order) => bindChatListener(order.id));
  }

  async function toggleItemAvailability(orderId, itemIndex, makeAvailable) {
    const order = currentOrders.find((entry) => entry.id === orderId);
    if (!order) return;
    const items = Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [];
    if (!items[itemIndex]) return;
    items[itemIndex].available = makeAvailable;
    await updateDoc(doc(db, "orders", orderId), { items, updatedAt: new Date().toISOString() });
    showToast(t("updated"));
  }

  async function updateOrderStatus(orderId) {
    const select = document.getElementById(`status-${orderId}`);
    if (!select) return;
    await updateDoc(doc(db, "orders", orderId), { status: select.value, updatedAt: new Date().toISOString() });
    showToast(t("updated"));
  }

  async function assignDriver(orderId) {
    const name = document.getElementById(`driver-name-${orderId}`)?.value.trim() || "";
    const phone = document.getElementById(`driver-phone-${orderId}`)?.value.trim() || "";
    await updateDoc(doc(db, "orders", orderId), {
      status: "on-the-way",
      driver: { name, phone },
      driverAssignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    showToast(t("updated"));
  }

  async function sendChatMessage(orderId) {
    const input = document.getElementById(`chat-input-${orderId}`);
    const text = String(input?.value || "").trim();
    if (!text) return;
    await addDoc(collection(db, "orderChats", orderId, "messages"), {
      senderId: localStorage.getItem("user_uid") || "market",
      senderRole: "market",
      senderName: localStorage.getItem("user_name") || "Market",
      marketId: currentMarketId,
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
        } else if (action === "send-chat") {
          await sendChatMessage(orderId);
        }
      } catch (error) {
        console.error("Market action failed", action, error);
        showToast(`${t("unknown")}: ${error.message}`);
      }
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
    document.getElementById("marketsLink").textContent = t("marketsLink");
    document.getElementById("driverLink").textContent = t("driverLink");
    document.getElementById("statTotalLabel").textContent = t("orders");
    document.getElementById("statPendingLabel").textContent = t("pending");
    document.getElementById("statActiveLabel").textContent = t("onTheWay");
    document.getElementById("deniedTitle").textContent = t("deniedTitle");
    document.getElementById("deniedMessage").textContent = t("deniedMessage");
    document.getElementById("deniedBack").textContent = t("deniedBack");
    const label = getMarketLabel(currentMarketId);
    document.title = `${label} - Market`;
    document.getElementById("marketTitle").textContent = label;
  }

  function renderMarketSelect() {
    const select = document.getElementById("marketSelect");
    if (!select) return;
    select.innerHTML = MARKETS.map((market) =>
      `<option value="${escapeHtml(market.key)}" ${market.key === currentMarketId ? "selected" : ""}>${escapeHtml(market.label)}</option>`
    ).join("");
  }

  function switchMarket(nextMarketId) {
    if (fixedMarket) return;
    currentMarketId = nextMarketId;
    const url = new URL(window.location.href);
    url.searchParams.set("market", nextMarketId);
    window.history.replaceState({}, "", url);
    applyLanguage();
    renderOrders(currentOrders);
  }

  await Promise.race([
    window.AppSettings?.ready?.() || Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);

  const isFileProtocol = window.location.protocol === "file:";
  const userUid = localStorage.getItem("user_uid");
  if (!userUid && !isFileProtocol) {
    window.location.href = "login.html";
    return;
  }
  const canOpenPanel = window.FeatureAccess?.isAdminUser?.() || isFileProtocol;
  if (!canOpenPanel) {
    const loading = document.getElementById("marketLoading");
    if (loading) loading.style.display = "none";
    document.getElementById("accessDenied").style.display = "block";
    return;
  }

  const loadingEl = document.getElementById("marketLoading");
  if (loadingEl) loadingEl.style.display = "none";
  document.getElementById("marketGuard").style.display = "block";
  const marketSelect = document.getElementById("marketSelect");
  if (marketSelect) {
    marketSelect.hidden = !showMarketSelect;
    marketSelect.style.display = showMarketSelect ? "" : "none";
  }

  bindMarketActions();
  if (showMarketSelect) renderMarketSelect();
  applyLanguage();

  document.getElementById("langSelect").addEventListener("change", (event) => {
    currentLang = String(event.target.value || "tr");
    localStorage.setItem("app_lang", currentLang);
    applyLanguage();
    renderOrders(currentOrders);
  });

  if (showMarketSelect && marketSelect) {
    marketSelect.addEventListener("change", (event) => {
      switchMarket(String(event.target.value || MARKETS[0].key));
    });
  }

  onSnapshot(collection(db, "orders"), (snapshot) => {
    renderOrders(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  });
}

const PAGE_MARKET_IDS = {
  "bim.html": "bim",
  "a101.html": "a101",
  "sok.html": "sok",
  "migros.html": "migros",
  "tahtakale.html": "tahtakale",
  "carrefour.html": "carrefour",
};

function bootMarketPanelFromPage() {
  const script = document.currentScript;
  const pageName = String(window.location.pathname || "").split("/").pop().toLowerCase();
  const marketId = script?.dataset?.marketId
    || new URLSearchParams(window.location.search).get("market")
    || PAGE_MARKET_IDS[pageName]
    || "bim";
  const fixedMarket = script?.dataset?.marketFixed === "true" || Boolean(PAGE_MARKET_IDS[pageName]);
  const showMarketSelect = script?.dataset?.marketSelect === "true" || (!fixedMarket && pageName === "market.html");

  initMarketPanel(marketId, { fixedMarket, showMarketSelect }).catch((error) => {
    console.error("Market panel boot failed", error);
    const denied = document.getElementById("accessDenied");
    if (denied) {
      denied.style.display = "block";
      const msg = document.getElementById("deniedMessage");
      if (msg) msg.textContent = error.message || "Market panel failed to load.";
    }
  });
}

if (document.currentScript) {
  bootMarketPanelFromPage();
}
