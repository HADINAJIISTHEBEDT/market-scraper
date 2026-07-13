(function () {
  "use strict";

  // Google AdSense (web only). Publisher number matches your AdMob account.
  // Create a Display ad unit in AdSense and paste its ID into `slot`.
  const ADS_CONFIG = {
    client: "ca-pub-1598347178644013",
    slot: "2034855132",
    enableAutoAnchor: true,
  };

  function isAndroidAppWebView() {
    if (typeof window.AndroidApp !== "undefined") return true;
    const ua = navigator.userAgent || "";
    return /; wv\)/i.test(ua) || /\bwv\b/i.test(ua);
  }

  function ensureBannerHost() {
    let host = document.getElementById("webAdBanner");
    if (!host) {
      host = document.createElement("div");
      host.id = "webAdBanner";
      host.className = "web-ad-banner";
      host.setAttribute("aria-label", "Advertisement");
      document.body.appendChild(host);
    }
    host.hidden = false;
    document.body.classList.add("has-web-ad-banner");
    return host;
  }

  function loadAdsScript(options = {}) {
    const existing = document.querySelector('script[src*="adsbygoogle.js"]');
    if (existing) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(ADS_CONFIG.client);
      script.crossOrigin = "anonymous";
      if (options.overlays) {
        script.setAttribute("data-overlays", options.overlays);
      }
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load AdSense"));
      document.head.appendChild(script);
    });
  }

  function mountDisplayBanner(host) {
    if (!ADS_CONFIG.slot) return;

    host.innerHTML = "";
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.style.minHeight = "50px";
    ins.setAttribute("data-ad-client", ADS_CONFIG.client);
    ins.setAttribute("data-ad-slot", ADS_CONFIG.slot);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({});
  }

  async function initWebAds() {
    if (!ADS_CONFIG.client || isAndroidAppWebView()) return;

    const host = ensureBannerHost();

    try {
      await loadAdsScript(
        ADS_CONFIG.enableAutoAnchor ? { overlays: "bottom" } : {}
      );
      mountDisplayBanner(host);
    } catch (error) {
      console.warn("[WebAds]", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWebAds);
  } else {
    initWebAds();
  }
})();
