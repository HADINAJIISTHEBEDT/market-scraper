(function () {
  "use strict";

  // Same IDs as your AdSense "Web Banner" unit.
  const ADS_CONFIG = {
    client: "ca-pub-1598347178644013",
    slot: "2034855132",
  };

  function isAndroidAppWebView() {
    // Only skip inside our Android WebView bridge (AdMob shows there instead).
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
      script.onerror = () => reject(new Error("Failed to load AdSense script (blocked or network)"));
      document.head.appendChild(script);
    });
  }

  function diagnoseFill(ins) {
    // AdSense sets data-ad-status after attempting to fill.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const status = ins.getAttribute("data-ad-status");
      if (status === "filled") {
        clearInterval(timer);
        console.info("[WebAds] Ad filled OK");
        return;
      }
      if (status === "unfilled" || tries >= 12) {
        clearInterval(timer);
        console.warn(
          "[WebAds] No ad fill. status=" +
            (status || "pending") +
            ". Common causes: site still under AdSense review, ad blocker/tracking prevention, or no inventory yet."
        );
      }
    }, 1000);
  }

  function mountDisplayBanner(host) {
    if (!ADS_CONFIG.slot) return;

    host.innerHTML = "";
    // Match AdSense-generated snippet closely (forced 50px height often prevents fill).
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", ADS_CONFIG.client);
    ins.setAttribute("data-ad-slot", ADS_CONFIG.slot);
    ins.setAttribute("data-ad-format", "horizontal");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("[WebAds] adsbygoogle.push failed", error);
    }
    diagnoseFill(ins);
  }

  async function initWebAds() {
    if (!ADS_CONFIG.client || isAndroidAppWebView()) {
      console.info("[WebAds] Skipped (Android app WebView uses AdMob)");
      return;
    }

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
