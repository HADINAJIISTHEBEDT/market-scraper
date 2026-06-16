(function () {
  "use strict";

  var MODE_KEY = "active_portal_mode";
  var MARKET_KEY = "active_portal_market";

  function getPortalMode() {
    return String(sessionStorage.getItem(MODE_KEY) || "").trim();
  }

  function getPortalMarket() {
    return String(sessionStorage.getItem(MARKET_KEY) || "").trim();
  }

  function setPortal(mode, marketId) {
    sessionStorage.setItem(MODE_KEY, String(mode || ""));
    if (marketId) sessionStorage.setItem(MARKET_KEY, String(marketId || ""));
  }

  function clearPortal() {
    sessionStorage.removeItem(MODE_KEY);
    sessionStorage.removeItem(MARKET_KEY);
  }

  function guardMarketPanel(marketId) {
    if (getPortalMode() === "driver") {
      return { ok: false, redirect: (marketId || getPortalMarket()) + "-delivery.html" };
    }
    setPortal("market", marketId);
    return { ok: true };
  }

  function guardDriverPanel(marketId) {
    if (getPortalMode() === "market") {
      return { ok: false, redirect: (marketId || getPortalMarket()) + ".html" };
    }
    setPortal("driver", marketId);
    return { ok: true };
  }

  window.PortalAccess = {
    getPortalMode: getPortalMode,
    getPortalMarket: getPortalMarket,
    setPortal: setPortal,
    clearPortal: clearPortal,
    guardMarketPanel: guardMarketPanel,
    guardDriverPanel: guardDriverPanel,
  };
})();
