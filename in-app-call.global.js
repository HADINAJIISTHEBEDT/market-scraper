(function () {
  "use strict";

  var activeFrame = null;
  var db = null;
  var watchState = { orderIds: [], localId: "", localRole: "", displayName: "" };
  var orderUnsubs = new Map();
  var ringTimer = null;
  var ringAudioCtx = null;
  var outgoingOrderId = "";

  var CALL_I18N = {
    tr: {
      voice: "Sesli arama", video: "Goruntulu arama", close: "Kapat", frameTitle: "Uygulama ici arama",
      incoming: "Gelen arama", from: "Arayan", accept: "Kabul et", decline: "Reddet",
      calling: "Araniyor...", waitingAnswer: "Yanit bekleniyor",
    },
    en: {
      voice: "Voice call", video: "Video call", close: "Close", frameTitle: "In-app call",
      incoming: "Incoming call", from: "From", accept: "Accept", decline: "Decline",
      calling: "Calling...", waitingAnswer: "Waiting for answer",
    },
    ar: {
      voice: "مكالمة صوتية", video: "مكالمة فيديو", close: "إغلاق", frameTitle: "مكالمة داخل التطبيق",
      incoming: "مكالمة واردة", from: "من", accept: "قبول", decline: "رفض",
      calling: "جاري الاتصال...", waitingAnswer: "في انتظار الرد",
    },
  };

  function callT(key) {
    var lang = localStorage.getItem("app_lang") || "tr";
    return (CALL_I18N[lang] && CALL_I18N[lang][key]) || CALL_I18N.tr[key] || key;
  }

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

  function getDb() {
    if (db) return db;
    if (typeof firebase === "undefined" || !window.FIREBASE_CONFIG) return null;
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    return db;
  }

  function callRef(orderId) {
    var firestore = getDb();
    return firestore ? firestore.collection("orderCalls").doc(String(orderId || "")) : null;
  }

  function stopRing() {
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    if (ringAudioCtx) {
      try { ringAudioCtx.close(); } catch (e) {}
      ringAudioCtx = null;
    }
  }

  function playRingPattern() {
    stopRing();
    try {
      ringAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ringTimer = setInterval(function () {
        if (!ringAudioCtx) return;
        var osc = ringAudioCtx.createOscillator();
        var gain = ringAudioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ringAudioCtx.destination);
        osc.start();
        osc.stop(ringAudioCtx.currentTime + 0.45);
      }, 1200);
    } catch (e) {
      console.warn("Ring tone unavailable", e);
    }
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
      '<iframe id="inAppCallFrame" allow="camera; microphone; fullscreen; display-capture"></iframe>' +
      "</div>";

    var incoming = document.createElement("div");
    incoming.id = "inAppIncomingCall";
    incoming.hidden = true;
    incoming.innerHTML =
      '<div class="in-app-call-backdrop"></div>' +
      '<div class="in-app-incoming-panel" role="dialog" aria-modal="true">' +
      '<div class="in-app-incoming-title" id="inAppIncomingTitle"></div>' +
      '<div class="in-app-incoming-meta" id="inAppIncomingMeta"></div>' +
      '<div class="in-app-incoming-actions">' +
      '<button type="button" class="btn-call-decline" id="inAppIncomingDecline"></button>' +
      '<button type="button" class="btn-call-accept" id="inAppIncomingAccept"></button>' +
      "</div></div>";

    var style = document.createElement("style");
    style.textContent =
      "#inAppCallModal,#inAppIncomingCall{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px}" +
      "#inAppCallModal[hidden],#inAppIncomingCall[hidden]{display:none!important}" +
      ".in-app-call-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.72)}" +
      ".in-app-call-panel{position:relative;width:min(960px,100%);height:min(640px,92vh);background:#0f172a;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
      ".in-app-call-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#f8fafc;font-weight:700}" +
      ".in-app-call-close{border:none;background:transparent;color:#f8fafc;font-size:28px;line-height:1;cursor:pointer;padding:0 4px}" +
      "#inAppCallFrame{border:0;flex:1;width:100%;background:#000}" +
      ".in-app-incoming-panel{position:relative;width:min(360px,100%);background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
      ".in-app-incoming-title{font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px}" +
      ".in-app-incoming-meta{font-size:14px;color:#64748b;margin-bottom:20px}" +
      ".in-app-incoming-actions{display:flex;gap:12px;justify-content:center}" +
      ".btn-call-accept,.btn-call-decline{border:none;border-radius:999px;padding:12px 20px;font:inherit;font-weight:700;cursor:pointer;min-width:110px}" +
      ".btn-call-accept{background:#16a34a;color:#fff}" +
      ".btn-call-decline{background:#fee2e2;color:#b91c1c}";

    document.head.appendChild(style);
    document.body.appendChild(modal);
    document.body.appendChild(incoming);

    modal.querySelectorAll("[data-in-app-call-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });

    document.getElementById("inAppIncomingAccept").addEventListener("click", acceptIncoming);
    document.getElementById("inAppIncomingDecline").addEventListener("click", declineIncoming);

    return modal;
  }

  function hideIncoming() {
    stopRing();
    var incoming = document.getElementById("inAppIncomingCall");
    if (incoming) incoming.hidden = true;
    if (incoming) incoming.dataset.orderId = "";
  }

  var pendingIncoming = null;

  function showIncoming(orderId, data) {
    pendingIncoming = { orderId: orderId, data: data };
    ensureModal();
    var incoming = document.getElementById("inAppIncomingCall");
    var title = document.getElementById("inAppIncomingTitle");
    var meta = document.getElementById("inAppIncomingMeta");
    var accept = document.getElementById("inAppIncomingAccept");
    var decline = document.getElementById("inAppIncomingDecline");
    var modeLabel = data.mode === "voice" ? callT("voice") : callT("video");
    if (title) title.textContent = callT("incoming");
    if (meta) meta.textContent = callT("from") + ": " + String(data.callerName || callT("waitingAnswer")) + " · " + modeLabel;
    if (accept) accept.textContent = callT("accept");
    if (decline) decline.textContent = callT("decline");
    if (incoming) {
      incoming.dataset.orderId = orderId;
      incoming.hidden = false;
    }
    playRingPattern();
  }

  function joinCall(orderId, displayName, mode) {
    ensureModal();
    var modal = document.getElementById("inAppCallModal");
    var frame = document.getElementById("inAppCallFrame");
    var title = document.getElementById("inAppCallTitle");
    var callMode = mode === "voice" ? "voice" : "video";
    if (title) title.textContent = callMode === "voice" ? callT("voice") : callT("video");
    if (frame) {
      frame.title = callT("frameTitle");
      frame.src = buildEmbedUrl(orderId, displayName, callMode);
      activeFrame = frame;
    }
    if (modal) modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function acceptIncoming() {
    if (!pendingIncoming) return;
    var orderId = pendingIncoming.orderId;
    var data = pendingIncoming.data || {};
    hideIncoming();
    var ref = callRef(orderId);
    if (ref) {
      ref.set({
        status: "active",
        answeredBy: watchState.localId || "",
        answeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(function (error) {
        console.error("Accept call failed", error);
      });
    }
    joinCall(orderId, watchState.displayName || "Guest", data.mode || "voice");
    pendingIncoming = null;
  }

  function declineIncoming() {
    var orderId = pendingIncoming && pendingIncoming.orderId;
    hideIncoming();
    pendingIncoming = null;
    if (!orderId) return;
    var ref = callRef(orderId);
    if (ref) {
      ref.set({
        status: "declined",
        declinedBy: watchState.localId || "",
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(function (error) {
        console.error("Decline call failed", error);
      });
    }
  }

  function handleCallSnapshot(orderId, snap) {
    if (!snap.exists) return;
    var data = snap.data() || {};
    var status = String(data.status || "").toLowerCase();
    var callerId = String(data.callerId || "");
    var localId = String(watchState.localId || "");

    if (status === "ringing" && callerId && callerId !== localId) {
      if (document.getElementById("inAppIncomingCall") && !document.getElementById("inAppIncomingCall").hidden) return;
      showIncoming(orderId, data);
      return;
    }

    if (status === "active" && callerId === localId && outgoingOrderId === orderId) {
      stopRing();
      joinCall(orderId, data.callerName || watchState.displayName || "Guest", data.mode || "voice");
      outgoingOrderId = "";
      return;
    }

    if (status === "active" && callerId !== localId) {
      hideIncoming();
    }

    if (status === "declined" || status === "ended") {
      if (outgoingOrderId === orderId) {
        outgoingOrderId = "";
        stopRing();
      }
      hideIncoming();
    }
  }

  function clearWatch() {
    orderUnsubs.forEach(function (unsub) { unsub(); });
    orderUnsubs.clear();
  }

  function syncWatch(options) {
    options = options || {};
    watchState = {
      orderIds: Array.isArray(options.orderIds) ? options.orderIds.slice() : [],
      localId: String(options.localId || localStorage.getItem("user_uid") || ""),
      localRole: String(options.localRole || "customer"),
      displayName: String(options.displayName || localStorage.getItem("user_name") || "Guest"),
    };
    if (!getDb()) return;
    clearWatch();
    watchState.orderIds.forEach(function (orderId) {
      if (!orderId) return;
      var ref = callRef(orderId);
      if (!ref) return;
      var unsub = ref.onSnapshot(function (snap) {
        handleCallSnapshot(orderId, snap);
      }, function (error) {
        console.error("Call watch failed", orderId, error);
      });
      orderUnsubs.set(orderId, unsub);
    });
  }

  function open(orderIdOrOptions, displayName, mode) {
    var orderId = orderIdOrOptions;
    var name = displayName;
    var callMode = mode;
    var callerRole = "customer";
    var localId = "";
    if (orderIdOrOptions && typeof orderIdOrOptions === "object") {
      orderId = orderIdOrOptions.orderId || orderIdOrOptions.order_id;
      name = orderIdOrOptions.displayName;
      callMode = orderIdOrOptions.mode;
      callerRole = orderIdOrOptions.callerRole || callerRole;
      localId = orderIdOrOptions.localId || "";
    }
    if (!orderId) return Promise.resolve();
    localId = localId || watchState.localId || localStorage.getItem("user_uid") || ("caller-" + Date.now());
    name = name || watchState.displayName || "Guest";
    callMode = callMode === "voice" ? "voice" : "video";
    outgoingOrderId = String(orderId);

    var payload = {
      status: "ringing",
      callerId: localId,
      callerName: name,
      callerRole: callerRole,
      mode: callMode,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    var ref = callRef(orderId);
    if (ref) {
      return ref.set(payload, { merge: true }).then(function () {
        ensureModal();
        var title = document.getElementById("inAppCallTitle");
        if (title) title.textContent = callT("calling");
        playRingPattern();
        setTimeout(function () {
          if (outgoingOrderId !== String(orderId)) return;
          ref.get().then(function (snap) {
            var status = snap.exists ? String(snap.data().status || "").toLowerCase() : "";
            if (status === "ringing" && outgoingOrderId === String(orderId)) {
              ref.set({ status: "active", autoConnected: true, updatedAt: new Date().toISOString() }, { merge: true });
              stopRing();
              joinCall(orderId, name, callMode);
              outgoingOrderId = "";
            }
          });
        }, 45000);
      }).catch(function (error) {
        stopRing();
        outgoingOrderId = "";
        joinCall(orderId, name, callMode);
        return Promise.reject(error);
      });
    }

    joinCall(orderId, name, callMode);
    return Promise.resolve();
  }

  function close() {
    stopRing();
    outgoingOrderId = "";
    hideIncoming();
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
    syncWatch: syncWatch,
    buildEmbedUrl: buildEmbedUrl,
  };
})();
