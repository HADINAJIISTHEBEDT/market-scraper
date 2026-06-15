(function () {
  "use strict";

  const MARKETS = [
    { key: "bim", label: "BIM", color: "#c8102e" },
    { key: "a101", label: "A101", color: "#0054a6" },
    { key: "sok", label: "SOK", color: "#f9b000" },
    { key: "migros", label: "Migros", color: "#f58220" },
    { key: "tahtakale", label: "Tahtakale", color: "#2d6a4f" },
    { key: "carrefour", label: "Carrefour", color: "#004e9a" },
  ];

  function normalizeMarketKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  function getMarketByKey(key) {
    const normalized = normalizeMarketKey(key);
    return MARKETS.find((market) => market.key === normalized) || null;
  }

  function getMarketLabel(key) {
    const market = getMarketByKey(key);
    if (market) return market.label;
    const raw = String(key || "").trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown";
  }

  function resolveOrderMarketId(cartItems) {
    const items = Array.isArray(cartItems) ? cartItems : [];
    const counts = new Map();
    for (const item of items) {
      const key = normalizeMarketKey(item.market);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + (item.qty || 1));
    }
    let topKey = "";
    let topCount = 0;
    for (const [key, count] of counts.entries()) {
      if (count > topCount) {
        topKey = key;
        topCount = count;
      }
    }
    if (topKey) return topKey;
    const first = items.find((item) => normalizeMarketKey(item.market));
    return first ? normalizeMarketKey(first.market) : "unknown";
  }

  function orderMatchesMarket(order, marketId) {
    const target = normalizeMarketKey(marketId);
    if (!target) return true;
    const orderMarket = normalizeMarketKey(order.marketId || order.marketName);
    if (orderMarket && orderMarket === target) return true;
    const items = Array.isArray(order.items) ? order.items : [];
    return items.some((item) => normalizeMarketKey(item.market) === target);
  }

  window.MarketsConfig = {
    MARKETS,
    normalizeMarketKey,
    getMarketByKey,
    getMarketLabel,
    resolveOrderMarketId,
    orderMatchesMarket,
  };
})();
