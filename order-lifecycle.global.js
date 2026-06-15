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
    writeOrderInboxNotifications: writeOrderInboxNotifications,
  };
})();
