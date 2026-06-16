(function () {
  "use strict";

  var db = null;
  var watchState = { orderIds: [], localId: "", localRole: "", displayName: "" };
  var orderUnsubs = new Map();
  var candidateUnsubs = new Map();
  var ringTimer = null;
  var ringAudioCtx = null;
  var outgoingOrderId = "";
  var pendingIncoming = null;
  var activeCall = null;

  var CALL_I18N = {
    tr: {
      voice: "Sesli arama", video: "Goruntulu arama", close: "Kapat",
      incoming: "Gelen arama", from: "Arayan", accept: "Kabul et", decline: "Reddet",
      calling: "Araniyor...", connected: "Baglandi", ended: "Arama bitti",
    },
    en: {
      voice: "Voice call", video: "Video call", close: "Close",
      incoming: "Incoming call", from: "From", accept: "Accept", decline: "Decline",
      calling: "Calling...", connected: "Connected", ended: "Call ended",
    },
    ar: {
      voice: "مكالمة صوتية", video: "مكالمة فيديو", close: "إغلاق",
      incoming: "مكالمة واردة", from: "من", accept: "قبول", decline: "رفض",
      calling: "جاري الاتصال...", connected: "متصل", ended: "انتهت المكالمة",
    },
  };

  function callT(key) {
    var lang = localStorage.getItem("app_lang") || "tr";
    return (CALL_I18N[lang] && CALL_I18N[lang][key]) || CALL_I18N.tr[key] || key;
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

  function ensureUi() {
    if (document.getElementById("inAppCallModal")) return;

    var modal = document.createElement("div");
    modal.id = "inAppCallModal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="in-app-call-backdrop" data-in-app-call-close></div>' +
      '<div class="in-app-call-panel" role="dialog" aria-modal="true">' +
      '<div class="in-app-call-header">' +
      '<span id="inAppCallTitle">Call</span>' +
      '<button type="button" class="in-app-call-close" data-in-app-call-close aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="in-app-call-body">' +
      '<div id="inAppCallStatus" class="in-app-call-status"></div>' +
      '<video id="inAppRemoteVideo" autoplay playsinline hidden></video>' +
      '<audio id="inAppRemoteAudio" autoplay></audio>' +
      "</div></div>";

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
      ".in-app-call-panel{position:relative;width:min(420px,100%);background:#0f172a;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
      ".in-app-call-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#f8fafc;font-weight:700}" +
      ".in-app-call-close{border:none;background:transparent;color:#f8fafc;font-size:28px;line-height:1;cursor:pointer;padding:0 4px}" +
      ".in-app-call-body{padding:24px;text-align:center;color:#e2e8f0;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}" +
      ".in-app-call-status{font-size:16px;font-weight:700}" +
      "#inAppRemoteVideo{width:100%;max-height:240px;background:#000;border-radius:10px}" +
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
  }

  function setCallStatus(text) {
    var el = document.getElementById("inAppCallStatus");
    if (el) el.textContent = text || "";
  }

  function showCallModal(title) {
    ensureUi();
    var modal = document.getElementById("inAppCallModal");
    var titleEl = document.getElementById("inAppCallTitle");
    if (titleEl) titleEl.textContent = title || callT("voice");
    if (modal) modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hideIncoming() {
    stopRing();
    var incoming = document.getElementById("inAppIncomingCall");
    if (incoming) incoming.hidden = true;
  }

  function showIncoming(orderId, data) {
    pendingIncoming = { orderId: orderId, data: data };
    ensureUi();
    var incoming = document.getElementById("inAppIncomingCall");
    var title = document.getElementById("inAppIncomingTitle");
    var meta = document.getElementById("inAppIncomingMeta");
    var accept = document.getElementById("inAppIncomingAccept");
    var decline = document.getElementById("inAppIncomingDecline");
    var modeLabel = data.mode === "video" ? callT("video") : callT("voice");
    if (title) title.textContent = callT("incoming");
    if (meta) meta.textContent = callT("from") + ": " + String(data.callerName || callT("calling")) + " · " + modeLabel;
    if (accept) accept.textContent = callT("accept");
    if (decline) decline.textContent = callT("decline");
    if (incoming) incoming.hidden = false;
    playRingPattern();
  }

  function cleanupPeer() {
    if (activeCall && activeCall.pc) {
      try { activeCall.pc.close(); } catch (e) {}
    }
    if (activeCall && activeCall.localStream) {
      activeCall.localStream.getTracks().forEach(function (track) { track.stop(); });
    }
    var remoteVideo = document.getElementById("inAppRemoteVideo");
    var remoteAudio = document.getElementById("inAppRemoteAudio");
    if (remoteVideo) {
      remoteVideo.srcObject = null;
      remoteVideo.hidden = true;
    }
    if (remoteAudio) remoteAudio.srcObject = null;
    activeCall = null;
  }

  function bindRemoteStream(stream, mode) {
    var remoteVideo = document.getElementById("inAppRemoteVideo");
    var remoteAudio = document.getElementById("inAppRemoteAudio");
    if (mode === "video" && remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.hidden = false;
    }
    if (remoteAudio) remoteAudio.srcObject = stream;
  }

  function createPeerConnection(orderId, mode, isCaller) {
    var pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    });
    pc.ontrack = function (event) {
      bindRemoteStream(event.streams[0], mode);
      setCallStatus(callT("connected"));
      stopRing();
    };
    pc.onicecandidate = function (event) {
      if (!event.candidate || !callRef(orderId)) return;
      callRef(orderId).collection("candidates").add({
        candidate: event.candidate.toJSON(),
        from: watchState.localId || "",
        createdAt: new Date().toISOString(),
      }).catch(function (error) {
        console.error("ICE publish failed", error);
      });
    };
    return pc;
  }

  function watchCandidates(orderId, pc) {
    if (candidateUnsubs.has(orderId)) return;
    var ref = callRef(orderId);
    if (!ref) return;
    var seen = new Set();
    var unsub = ref.collection("candidates").orderBy("createdAt", "asc").onSnapshot(function (snapshot) {
      snapshot.docChanges().forEach(function (change) {
        if (change.type !== "added") return;
        var data = change.doc.data() || {};
        if (String(data.from || "") === String(watchState.localId || "")) return;
        var key = change.doc.id;
        if (seen.has(key)) return;
        seen.add(key);
        if (!data.candidate || !pc) return;
        pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function (error) {
          console.warn("addIceCandidate failed", error);
        });
      });
    });
    candidateUnsubs.set(orderId, unsub);
  }

  function unwatchCandidates(orderId) {
    var unsub = candidateUnsubs.get(orderId);
    if (unsub) unsub();
    candidateUnsubs.delete(orderId);
  }

  async function startLocalMedia(mode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone not available in this browser");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video",
    });
  }

  async function saveCallHistory(orderId, meta) {
    var firestore = getDb();
    if (!firestore || !window.OrderLifecycle || !window.OrderLifecycle.writeCallHistory) return;
    var now = new Date().toISOString();
    await window.OrderLifecycle.writeCallHistory(firestore, Object.assign({
      orderId: orderId,
      endedAt: now,
    }, meta || {}));
  }

  async function beginCall(orderId, mode, isCaller, remoteMeta) {
    cleanupPeer();
    var stream = await startLocalMedia(mode);
    var pc = createPeerConnection(orderId, mode, isCaller);
    stream.getTracks().forEach(function (track) {
      pc.addTrack(track, stream);
    });
    activeCall = {
      orderId: orderId,
      mode: mode,
      pc: pc,
      localStream: stream,
      startedAt: new Date().toISOString(),
      meta: remoteMeta || {},
    };
    watchCandidates(orderId, pc);
    showCallModal(mode === "video" ? callT("video") : callT("voice"));
    setCallStatus(isCaller ? callT("calling") : callT("connected"));
    return pc;
  }

  async function acceptIncoming() {
    if (!pendingIncoming) return;
    var orderId = pendingIncoming.orderId;
    var data = pendingIncoming.data || {};
    hideIncoming();
    pendingIncoming = null;
    try {
      var pc = await beginCall(orderId, data.mode || "voice", false, data);
      var ref = callRef(orderId);
      if (!ref || !data.offer) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await ref.set({
        status: "active",
        answer: { type: answer.type, sdp: answer.sdp },
        answeredBy: watchState.localId || "",
        answeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      console.error("Accept call failed", error);
      close();
    }
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

  async function handleCallSnapshot(orderId, snap) {
    if (!snap.exists) return;
    var data = snap.data() || {};
    var status = String(data.status || "").toLowerCase();
    var callerId = String(data.callerId || "");
    var localId = String(watchState.localId || "");

    if (status === "ringing" && callerId && callerId !== localId) {
      var incomingEl = document.getElementById("inAppIncomingCall");
      if (incomingEl && !incomingEl.hidden) return;
      showIncoming(orderId, data);
      return;
    }

    if (status === "active" && callerId === localId && outgoingOrderId === orderId) {
      try {
        if (activeCall && activeCall.pc && data.answer) {
          await activeCall.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (!activeCall) {
          var pc = await beginCall(orderId, data.mode || "voice", true, data);
          if (data.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        }
        stopRing();
        setCallStatus(callT("connected"));
        outgoingOrderId = "";
      } catch (error) {
        console.error("Caller connect failed", error);
      }
      return;
    }

    if (status === "declined" || status === "ended") {
      if (outgoingOrderId === orderId) outgoingOrderId = "";
      hideIncoming();
      stopRing();
    }
  }

  function clearWatch() {
    orderUnsubs.forEach(function (unsub) { unsub(); });
    orderUnsubs.clear();
    candidateUnsubs.forEach(function (unsub) { unsub(); });
    candidateUnsubs.clear();
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

  async function open(orderIdOrOptions, displayName, mode) {
    var orderId = orderIdOrOptions;
    var name = displayName;
    var callMode = mode;
    var callerRole = "customer";
    var localId = "";
    var callMeta = {};
    if (orderIdOrOptions && typeof orderIdOrOptions === "object") {
      orderId = orderIdOrOptions.orderId || orderIdOrOptions.order_id;
      name = orderIdOrOptions.displayName;
      callMode = orderIdOrOptions.mode;
      callerRole = orderIdOrOptions.callerRole || callerRole;
      localId = orderIdOrOptions.localId || "";
      callMeta = orderIdOrOptions.meta || {};
    }
    if (!orderId) return Promise.resolve();
    localId = localId || watchState.localId || localStorage.getItem("user_uid") || ("caller-" + Date.now());
    name = name || watchState.displayName || "Guest";
    callMode = callMode === "video" ? "video" : "voice";
    outgoingOrderId = String(orderId);

    var ref = callRef(orderId);
    if (!ref) return Promise.resolve();

    try {
      await ref.collection("candidates").get().then(function (snap) {
        var batch = getDb().batch();
        snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
        return batch.commit();
      }).catch(function () {});

      var pc = await beginCall(orderId, callMode, true, callMeta);
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await ref.set({
        status: "ringing",
        callerId: localId,
        callerName: name,
        callerRole: callerRole,
        mode: callMode,
        offer: { type: offer.type, sdp: offer.sdp },
        orderNumber: callMeta.orderNumber || "",
        marketId: callMeta.marketId || "",
        marketName: callMeta.marketName || "",
        driverName: callMeta.driverName || "",
        customerName: callMeta.customerName || name,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      playRingPattern();
    } catch (error) {
      console.error("Call start failed", error);
      close();
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  function close() {
    var endedOrderId = activeCall && activeCall.orderId;
    var endedMeta = activeCall && activeCall.meta;
    var startedAt = activeCall && activeCall.startedAt;
    stopRing();
    outgoingOrderId = "";
    hideIncoming();
    pendingIncoming = null;
    if (endedOrderId) {
      unwatchCandidates(endedOrderId);
      var ref = callRef(endedOrderId);
      if (ref) {
        ref.set({ status: "ended", updatedAt: new Date().toISOString() }, { merge: true }).catch(function () {});
        if (startedAt && window.OrderLifecycle && window.OrderLifecycle.writeCallHistory) {
          saveCallHistory(endedOrderId, Object.assign({}, endedMeta || {}, {
            startedAt: startedAt,
            callerName: watchState.displayName || "",
            callerRole: watchState.localRole || "",
            mode: activeCall.mode || "voice",
          }));
        }
      }
    }
    cleanupPeer();
    var modal = document.getElementById("inAppCallModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
  }

  window.InAppCall = {
    open: open,
    close: close,
    syncWatch: syncWatch,
  };
})();
