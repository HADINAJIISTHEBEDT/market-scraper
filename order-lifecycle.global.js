(function () {
  "use strict";

  const ORDER_STATUSES = ["waiting", "on-the-way", "arrived"];

  const LEGACY_STATUS_MAP = {
    pending: "waiting",
    preparing: "waiting",
    waiting: "waiting",
    "on-the-way": "on-the-way",
    delivered: "arrived",
    arrived: "arrived",
    closed: "closed",
  };

  function normalizeOrderStatus(status) {
    const key = String(status || "waiting").trim().toLowerCase();
    return LEGACY_STATUS_MAP[key] || "waiting";
  }

  function isOrderClosed(status) {
    return String(status || "").trim().toLowerCase() === "closed";
  }

  function writeOrderInboxNotifications(db, entry) {
    const now = new Date().toISOString();
    const base = {
      inboxType: entry.inboxType || "order_event",
      orderId: String(entry.orderId || ""),
      orderNumber: entry.orderNumber != null ? entry.orderNumber : "",
      marketId: String(entry.marketId || ""),
      marketName: String(entry.marketName || ""),
      message: String(entry.message || ""),
      userName: String(entry.userName || ""),
      userEmail: String(entry.userEmail || ""),
      name: String(entry.userName || entry.name || ""),
      email: String(entry.userEmail || entry.email || ""),
      requestedAt: now,
      createdAt: now,
      status: entry.status || "new",
    };
    const adminWrite = db.collection("adminInbox").add(Object.assign({}, base, { scope: "admin" }));
    const marketWrite = base.marketId
      ? db.collection("marketInbox").add(Object.assign({}, base, { scope: "market" }))
      : Promise.resolve();
    return Promise.all([adminWrite, marketWrite]);
  }

  function formatOrderNumber(value) {
    if (value == null || value === "") return "";
    const raw = String(value).trim();
    if (!raw) return "";
    return raw.startsWith("#") ? raw : `#${raw}`;
  }

  function orderNumberDisplay(order) {
    if (!order) return "";
    return formatOrderNumber(order.orderNumber ?? order.orderNo ?? "");
  }

  function statusIndex(status) {
    return ORDER_STATUSES.indexOf(normalizeOrderStatus(status));
  }

  function allocateOrderNumber(db) {
    return db.runTransaction(function (transaction) {
      var ref = db.collection("counters").doc("orders");
      return transaction.get(ref).then(function (snap) {
        var num = snap.exists ? Number(snap.data().next) || 1001 : 1001;
        transaction.set(ref, { next: num + 1 }, { merge: true });
        return num;
      });
    });
  }

  function normalizeMarketKey(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }

  function orderMatchesMarket(order, marketId) {
    var target = normalizeMarketKey(marketId);
    if (!target || !order) return false;
    if (normalizeMarketKey(order.marketId || order.marketName) === target) return true;
    return (Array.isArray(order.items) ? order.items : []).some(function (item) {
      return normalizeMarketKey(item.market) === target;
    });
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function orderAssignedToDriver(order, driverPhone) {
    var phone = normalizePhone(driverPhone);
    if (!phone) return false;
    return normalizePhone(order.driver && order.driver.phone) === phone;
  }

  function hasAssignedDriver(order) {
    var driver = order && order.driver;
    return !!(driver && (driver.name || driver.phone || driver.driverId));
  }

  function isOrderCommunicationActive(order) {
    if (!order || isOrderClosed(order.status)) return false;
    if (!hasAssignedDriver(order)) return false;
    var status = normalizeOrderStatus(order.status);
    return status === "on-the-way" || status === "arrived";
  }

  function formatTelHref(phone) {
    var digits = normalizePhone(phone);
    if (!digits) return "";
    if (digits.length === 10 && digits.charAt(0) === "5") return "tel:+90" + digits;
    if (digits.length === 11 && digits.charAt(0) === "0") return "tel:+9" + digits;
    if (digits.indexOf("90") === 0) return "tel:+" + digits;
    return "tel:+" + digits;
  }

  function getVideoCallRoom(orderId) {
    return "marketfiyati-" + String(orderId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  }

  function getVideoCallUrl(orderId, displayName) {
    var room = getVideoCallRoom(orderId);
    var name = encodeURIComponent(String(displayName || "Guest").slice(0, 40));
    return "https://meet.jit.si/" + room + "#userInfo.displayName=" + name;
  }

  function orderChatCollection(db, orderId) {
    return db.collection("orderChats").doc(String(orderId || "")).collection("messages");
  }

  function groupItemsByCategory(items) {
    var groups = [];
    var map = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item, index) {
      var category = String(item.category || item._searchTerm || "General").trim() || "General";
      if (!map.has(category)) {
        var group = { category: category, entries: [] };
        map.set(category, group);
        groups.push(group);
      }
      map.get(category).entries.push({ item: item, index: index });
    });
    return groups;
  }

  window.OrderLifecycle = {
    ORDER_STATUSES: ORDER_STATUSES,
    normalizeOrderStatus: normalizeOrderStatus,
    formatOrderNumber: formatOrderNumber,
    orderNumberDisplay: orderNumberDisplay,
    statusIndex: statusIndex,
    allocateOrderNumber: allocateOrderNumber,
    normalizeMarketKey: normalizeMarketKey,
    orderMatchesMarket: orderMatchesMarket,
    normalizePhone: normalizePhone,
    orderAssignedToDriver: orderAssignedToDriver,
    groupItemsByCategory: groupItemsByCategory,
    isOrderClosed: isOrderClosed,
    hasAssignedDriver: hasAssignedDriver,
    isOrderCommunicationActive: isOrderCommunicationActive,
    formatTelHref: formatTelHref,
    getVideoCallRoom: getVideoCallRoom,
    getVideoCallUrl: getVideoCallUrl,
    orderChatCollection: orderChatCollection,
    writeOrderInboxNotifications: writeOrderInboxNotifications,
  };
})();
