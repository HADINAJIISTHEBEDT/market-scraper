(function () {
  "use strict";

  // Fixed small bottom banner (not auto/multiplex — those expand huge when empty).
  const ADS_CONFIG = {
    client: "ca-pub-1598347178644013",
    slot: "2034855132",
  };

  const BANNER_HEIGHT_PX = 50;

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

  function loadAdsScript() {
    const existing = document.querySelector('script[src*="adsbygoogle.js"]');
    if (existing) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(ADS_CONFIG.client);
      script.crossOrigin = "anonymous";
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
    ins.style.width = "100%";
    ins.style.height = BANNER_HEIGHT_PX + "px";
    ins.style.maxHeight = BANNER_HEIGHT_PX + "px";
    ins.style.overflow = "hidden";
    ins.setAttribute("data-ad-client", ADS_CONFIG.client);
    ins.setAttribute("data-ad-slot", ADS_CONFIG.slot);
    // Force a slim banner shape (avoid "auto", which can grow huge when blank).
    ins.setAttribute("data-ad-format", "horizontal");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({});
  }

  async function initWebAds() {
    if (!ADS_CONFIG.client || isAndroidAppWebView()) return;

    const host = ensureBannerHost();

    try {
      await loadAdsScript();
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
