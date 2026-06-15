import { doc, runTransaction, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const ORDER_STATUSES = ["waiting", "on-the-way", "arrived"];

const LEGACY_STATUS_MAP = {
  pending: "waiting",
  preparing: "waiting",
  waiting: "waiting",
  "on-the-way": "on-the-way",
  delivered: "arrived",
  arrived: "arrived",
  closed: "closed",
};

export function normalizeOrderStatus(status) {
  const key = String(status || "waiting").trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] || "waiting";
}

export function isOrderClosed(status) {
  return String(status || "").trim().toLowerCase() === "closed";
}

export async function writeOrderInboxNotifications(db, entry) {
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
  const adminWrite = addDoc(collection(db, "adminInbox"), { ...base, scope: "admin" });
  const marketWrite = base.marketId
    ? addDoc(collection(db, "marketInbox"), { ...base, scope: "market" })
    : Promise.resolve();
  return Promise.all([adminWrite, marketWrite]);
}

export function formatOrderNumber(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function orderNumberDisplay(order) {
  if (!order) return "";
  return formatOrderNumber(order.orderNumber ?? order.orderNo ?? "");
}

export async function allocateOrderNumber(db) {
  return runTransaction(db, async (transaction) => {
    const counterRef = doc(db, "counters", "orders");
    const snap = await transaction.get(counterRef);
    const num = snap.exists() ? Number(snap.data().next) || 1001 : 1001;
    transaction.set(counterRef, { next: num + 1 }, { merge: true });
    return num;
  });
}

export function statusIndex(status) {
  return ORDER_STATUSES.indexOf(normalizeOrderStatus(status));
}

export function normalizeMarketKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function orderMatchesMarket(order, marketId) {
  const target = normalizeMarketKey(marketId);
  if (!target || !order) return false;
  if (normalizeMarketKey(order.marketId || order.marketName) === target) return true;
  return (Array.isArray(order.items) ? order.items : []).some((item) => normalizeMarketKey(item.market) === target);
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function orderAssignedToDriver(order, driverPhone) {
  const phone = normalizePhone(driverPhone);
  if (!phone) return false;
  return normalizePhone(order.driver?.phone) === phone;
}

export function groupItemsByCategory(items) {
  const groups = [];
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const category = String(item.category || item._searchTerm || "General").trim() || "General";
    if (!map.has(category)) {
      const group = { category, entries: [] };
      map.set(category, group);
      groups.push(group);
    }
    map.get(category).entries.push({ item, index });
  });
  return groups;
}

export function computeOrderTotal(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    if (item && item.available === false) return sum;
    return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
  }, 0);
}
