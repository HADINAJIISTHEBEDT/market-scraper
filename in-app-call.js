(function () {
  "use strict";

  var activeFrame = null;

  function getRoom(orderId) {
    if (window.OrderLifecycle && window.OrderLifecycle.getVideoCallRoom) {
      return window.OrderLifecycle.getVideoCallRoom(orderId);
    }
    return "marketfiyati-" + String(orderId || "order").slice(0, 48);
  }

  function buildEmbedUrl(orderId, displayName, mode) {
    var room = getRoom(orderId);
    var name = encodeURIComponent(String(displayName || "Guest").slice(0, 40));
    var videoMuted = mode === "voice" ? "true" : "false";
    var hash = [
      "userInfo.displayName=" + name,
      "config.prejoinPageEnabled=false",
      "config.startWithVideoMuted=" + videoMuted,
      "config.startAudioOnly=" + (mode === "voice" ? "true" : "false"),
      "interfaceConfig.SHOW_JITSI_WATERMARK=false",
      "interfaceConfig.MOBILE_APP_PROMO=false",
    ].join("&");
    return "https://meet.jit.si/" + encodeURIComponent(room) + "#" + hash;
  }

  function ensureModal() {
    var modal = document.getElementById("inAppCallModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "inAppCallModal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="in-app-call-backdrop" data-in-app-call-close></div>' +
      '<div class="in-app-call-panel" role="dialog" aria-modal="true">' +
      '<div class="in-app-call-header">' +
      '<span id="inAppCallTitle">Call</span>' +
      '<button type="button" class="in-app-call-close" data-in-app-call-close aria-label="Close">&times;</button>' +
      "</div>" +
      '<iframe id="inAppCallFrame" allow="camera; microphone; fullscreen; display-capture" title="In-app call"></iframe>' +
      "</div>";

    var style = document.createElement("style");
    style.textContent =
      "#inAppCallModal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px}" +
      "#inAppCallModal[hidden]{display:none!important}" +
      ".in-app-call-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.72)}" +
      ".in-app-call-panel{position:relative;width:min(960px,100%);height:min(640px,92vh);background:#0f172a;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
      ".in-app-call-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#f8fafc;font-weight:700}" +
      ".in-app-call-close{border:none;background:transparent;color:#f8fafc;font-size:28px;line-height:1;cursor:pointer;padding:0 4px}" +
      "#inAppCallFrame{border:0;flex:1;width:100%;background:#000}";

    document.head.appendChild(style);
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-in-app-call-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });

    return modal;
  }

  function open(orderIdOrOptions, displayName, mode) {
    var orderId = orderIdOrOptions;
    var name = displayName;
    var callMode = mode;
    if (orderIdOrOptions && typeof orderIdOrOptions === "object") {
      orderId = orderIdOrOptions.orderId || orderIdOrOptions.order_id;
      name = orderIdOrOptions.displayName;
      callMode = orderIdOrOptions.mode;
    }
    if (!orderId) return Promise.resolve();
    try {
      var modal = ensureModal();
      var frame = document.getElementById("inAppCallFrame");
      var title = document.getElementById("inAppCallTitle");
      callMode = callMode === "voice" ? "voice" : "video";
      if (title) {
        title.textContent = callMode === "voice" ? "Voice call" : "Video call";
      }
      if (frame) {
        frame.src = buildEmbedUrl(orderId, name, callMode);
        activeFrame = frame;
      }
      modal.hidden = false;
      document.body.style.overflow = "hidden";
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  function close() {
    var modal = document.getElementById("inAppCallModal");
    var frame = document.getElementById("inAppCallFrame");
    if (frame) frame.src = "about:blank";
    if (modal) modal.hidden = true;
    document.body.style.overflow = String();
    activeFrame = null;
  }

  window.InAppCall = {
    open: open,
    close: close,
    buildEmbedUrl: buildEmbedUrl,
  };
})();
