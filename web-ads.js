(function () {
  "use strict";

  const ADS_CONFIG = {
    client: "ca-pub-1598347178644013",
    slot: "2034855132",
  };

  function isAndroidAppWebView() {
    return typeof window.AndroidApp !== "undefined";
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
    hideBanner(host);
    return host;
  }

  function showBanner(host) {
    host.hidden = false;
    host.style.visibility = "visible";
    host.style.pointerEvents = "";
    document.body.classList.add("has-web-ad-banner");
  }

  function hideBanner(host) {
    host.hidden = true;
    host.innerHTML = "";
    host.style.visibility = "";
    host.style.pointerEvents = "";
    document.body.classList.remove("has-web-ad-banner");
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
      script.onerror = () => reject(new Error("Failed to load AdSense script"));
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
    ins.setAttribute("data-ad-client", ADS_CONFIG.client);
    ins.setAttribute("data-ad-slot", ADS_CONFIG.slot);
    ins.setAttribute("data-ad-format", "horizontal");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);

    // Load off-screen/invisible so AdSense can measure, without a blank gap.
    host.hidden = false;
    host.style.visibility = "hidden";
    host.style.pointerEvents = "none";
    document.body.classList.remove("has-web-ad-banner");

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("[WebAds] adsbygoogle.push failed", error);
      hideBanner(host);
      return;
    }

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const status = ins.getAttribute("data-ad-status");

      if (status === "filled") {
        clearInterval(timer);
        showBanner(host);
        console.info("[WebAds] Ad filled — showing small banner");
        return;
      }

      if (status === "unfilled" || tries >= 15) {
        clearInterval(timer);
        hideBanner(host);
        console.warn("[WebAds] No ad fill — blank banner removed");
      }
    }, 1000);
  }

  async function initWebAds() {
    if (!ADS_CONFIG.client || isAndroidAppWebView()) return;

    const host = ensureBannerHost();

    try {
      await loadAdsScript();
      mountDisplayBanner(host);
    } catch (error) {
      hideBanner(host);
      console.warn("[WebAds]", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWebAds);
  } else {
    initWebAds();
  }
})();
