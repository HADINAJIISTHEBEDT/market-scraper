(function () {
  "use strict";

  const ORDER_STATUSES = ["waiting", "awaiting-payment", "preparing", "on-the-way", "arrived"];
  const PAYMENT_TIMEOUT_MS = 20 * 60 * 1000;

  const LEGACY_STATUS_MAP = {
    pending: "waiting",
    preparing: "preparing",
    waiting: "waiting",
    "awaiting-payment": "awaiting-payment",
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
    var digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 12 && digits.indexOf("90") === 0) digits = digits.slice(2);
    if (digits.length === 11 && digits.charAt(0) === "0") digits = digits.slice(1);
    return digits;
  }

  function phonesMatch(a, b) {
    var left = normalizePhone(a);
    var right = normalizePhone(b);
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length >= 10 && right.length >= 10) {
      return left.slice(-10) === right.slice(-10);
    }
    return false;
  }

  function normalizeDriverName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function driverNamesMatch(a, b) {
    var left = normalizeDriverName(a);
    var right = normalizeDriverName(b);
    if (!left || !right) return false;
    return left === right;
  }

  function orderAssignedToDriver(order, driverPhone) {
    if (!driverPhone) return false;
    return phonesMatch(order.driver && order.driver.phone, driverPhone);
  }

  function orderAssignedToDriverIdentity(order, identity) {
    identity = identity || {};
    var driver = order && order.driver;
    if (!driver || !identity.name) return false;
    if (!driverNamesMatch(driver.name, identity.name)) return false;
    if (identity.phone && driver.phone) {
      return phonesMatch(driver.phone, identity.phone);
    }
    return true;
  }

  function hasAssignedDriver(order) {
    var driver = order && order.driver;
    return !!(driver && (driver.name || driver.phone || driver.driverId));
  }

  function allItemsAvailable(order) {
    var items = Array.isArray(order && order.items) ? order.items : [];
    if (!items.length) return false;
    return items.every(function (item) {
      return item && item.available !== false;
    });
  }

  function isAwaitingPayment(order) {
    return normalizeOrderStatus(order && order.status) === "awaiting-payment";
  }

  function isOrderPaid(order) {
    return !!(order && (order.paidAt || order.paymentMethod));
  }

  function paymentDeadlinePassed(order) {
    if (!order || !order.paymentDeadline) return false;
    return Date.now() > new Date(order.paymentDeadline).getTime();
  }

  function parseMapCoordinates(mapLink) {
    var raw = String(mapLink || "").trim();
    if (!raw) return null;
    var atMatch = raw.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    var qMatch = raw.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    var pathMatch = raw.match(/\/(-?\d+\.?\d*),(-?\d+\.?\d*)(?:\/?|$|\?)/);
    if (pathMatch) return { lat: parseFloat(pathMatch[1]), lng: parseFloat(pathMatch[2]) };
    return null;
  }

  function getOrderCustomerLocation(order) {
    order = order || {};
    if (order.userLat != null && order.userLng != null) {
      return { lat: Number(order.userLat), lng: Number(order.userLng) };
    }
    return parseMapCoordinates(order.userMapLink || order.mapLink || "");
  }

  function isOrderCommunicationActive(order) {
    if (!order || isOrderClosed(order.status)) return false;
    if (!hasAssignedDriver(order)) return false;
    var status = normalizeOrderStatus(order.status);
    return status === "on-the-way" || status === "arrived";
  }

  function isCustomerChatActive(order) {
    if (!order || isOrderClosed(order.status)) return false;
    return true;
  }

  function isDeliveryChatActive(order) {
    if (!order || isOrderClosed(order.status)) return false;
    if (!hasAssignedDriver(order)) return false;
    var status = normalizeOrderStatus(order.status);
    return status === "preparing" || status === "on-the-way" || status === "arrived";
  }

  function archiveOrderConversation(db, orderId, order, reason) {
    order = order || {};
    reason = String(reason || "archived");
    return orderChatCollection(db, orderId).orderBy("createdAt", "asc").get().then(function (snapshot) {
      var messages = snapshot.docs.map(function (entry) {
        return Object.assign({ id: entry.id }, entry.data());
      });
      if (!messages.length) return null;
      var now = new Date().toISOString();
      return db.collection("orderConversations").doc(String(orderId || "")).set({
        orderId: String(orderId || ""),
        orderNumber: order.orderNumber != null ? order.orderNumber : "",
        userId: String(order.userId || ""),
        userName: String(order.userName || ""),
        userEmail: String(order.userEmail || ""),
        marketId: String(order.marketId || ""),
        marketName: String(order.marketName || ""),
        driverName: String(order.driver && order.driver.name || ""),
        messages: messages,
        messageCount: messages.length,
        archivedAt: now,
        archiveReason: reason,
        updatedAt: now,
      }, { merge: true });
    });
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

  function orderCallDoc(db, orderId) {
    return db.collection("orderCalls").doc(String(orderId || ""));
  }

  function writeCallHistory(db, entry) {
    var now = new Date().toISOString();
    return db.collection("orderCallHistory").add({
      orderId: String(entry.orderId || ""),
      orderNumber: entry.orderNumber != null ? entry.orderNumber : "",
      marketId: String(entry.marketId || ""),
      marketName: String(entry.marketName || ""),
      driverName: String(entry.driverName || ""),
      customerName: String(entry.customerName || ""),
      callerName: String(entry.callerName || ""),
      callerRole: String(entry.callerRole || ""),
      mode: String(entry.mode || "voice"),
      startedAt: String(entry.startedAt || now),
      endedAt: String(entry.endedAt || now),
      createdAt: now,
    });
  }

  function isUserProfileComplete(profile) {
    profile = profile || {};
    var address = String(profile.address || "").trim();
    var name = String(profile.name || "").trim();
    return name.length >= 2 && address.length >= 8;
  }

  function computeOrderTotal(items) {
    return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
      if (item && item.available === false) return sum;
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);
  }

  function chatRoleClass(role) {
    var key = String(role || "").trim().toLowerCase();
    if (key === "driver") return "driver";
    if (key === "market") return "market";
    if (key === "admin") return "admin";
    return "customer";
  }

  function resolveChatSenderDisplayName(msg, order, options) {
    options = options || {};
    var getMarketLabel = options.getMarketLabel || function (key) {
      var raw = String(key || "").trim();
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown";
    };
    var role = String(msg && msg.senderRole || "").trim().toLowerCase();
    if (role === "admin") {
      return options.adminLabel || "Admin";
    }
    if (role === "market") {
      return getMarketLabel(msg.marketId || (order && (order.marketId || order.marketName)) || "");
    }
    if (role === "driver") {
      return (order && order.driver && order.driver.name) || (msg && msg.senderName) || options.driverLabel || "Driver";
    }
    return (msg && msg.senderName) || options.unknownLabel || "Unknown";
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
    PAYMENT_TIMEOUT_MS: PAYMENT_TIMEOUT_MS,
    allItemsAvailable: allItemsAvailable,
    isAwaitingPayment: isAwaitingPayment,
    isOrderPaid: isOrderPaid,
    paymentDeadlinePassed: paymentDeadlinePassed,
    parseMapCoordinates: parseMapCoordinates,
    getOrderCustomerLocation: getOrderCustomerLocation,
    isCustomerChatActive: isCustomerChatActive,
    isDeliveryChatActive: isDeliveryChatActive,
    archiveOrderConversation: archiveOrderConversation,
    normalizeOrderStatus: normalizeOrderStatus,
    formatOrderNumber: formatOrderNumber,
    orderNumberDisplay: orderNumberDisplay,
    statusIndex: statusIndex,
    allocateOrderNumber: allocateOrderNumber,
    normalizeMarketKey: normalizeMarketKey,
    orderMatchesMarket: orderMatchesMarket,
    normalizePhone: normalizePhone,
    phonesMatch: phonesMatch,
    normalizeDriverName: normalizeDriverName,
    driverNamesMatch: driverNamesMatch,
    orderAssignedToDriver: orderAssignedToDriver,
    orderAssignedToDriverIdentity: orderAssignedToDriverIdentity,
    chatRoleClass: chatRoleClass,
    resolveChatSenderDisplayName: resolveChatSenderDisplayName,
    groupItemsByCategory: groupItemsByCategory,
    isOrderClosed: isOrderClosed,
    hasAssignedDriver: hasAssignedDriver,
    isOrderCommunicationActive: isOrderCommunicationActive,
    formatTelHref: formatTelHref,
    getVideoCallRoom: getVideoCallRoom,
    getVideoCallUrl: getVideoCallUrl,
    orderChatCollection: orderChatCollection,
    orderCallDoc: orderCallDoc,
    writeCallHistory: writeCallHistory,
    isUserProfileComplete: isUserProfileComplete,
    computeOrderTotal: computeOrderTotal,
    writeOrderInboxNotifications: writeOrderInboxNotifications,
  };
})();
