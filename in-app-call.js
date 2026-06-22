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
  var useFrontCamera = true;
  var speakerEnabled = true;
  var mediaRecorder = null;
  var recordedChunks = [];
  var recordingMime = "audio/webm";

  var CALL_I18N = {
    tr: {
      voice: "Sesli arama", video: "Goruntulu arama", close: "Kapat",
      incoming: "Gelen arama", from: "Arayan", accept: "Kabul et", decline: "Reddet",
      calling: "Araniyor...", connected: "Baglandi", ended: "Arama bitti",
      flipCamera: "Kamerayi cevir", speakerOn: "Hoparlor acik", speakerOff: "Hoparlor kapali",
    },
    en: {
      voice: "Voice call", video: "Video call", close: "Close",
      incoming: "Incoming call", from: "From", accept: "Accept", decline: "Decline",
      calling: "Calling...", connected: "Connected", ended: "Call ended",
      flipCamera: "Flip camera", speakerOn: "Speaker on", speakerOff: "Speaker off",
    },
    ar: {
      voice: "مكالمة صوتية", video: "مكالمة فيديو", close: "إغلاق",
      incoming: "مكالمة واردة", from: "من", accept: "قبول", decline: "رفض",
      calling: "جاري الاتصال...", connected: "متصل", ended: "انتهت المكالمة",
      flipCamera: "قلب الكاميرا", speakerOn: "مكبر الصوت", speakerOff: "كتم مكبر الصوت",
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
      '<div id="inAppCallVideoStage" class="in-app-video-stage" hidden>' +
      '<video id="inAppRemoteVideo" autoplay playsinline></video>' +
      '<video id="inAppLocalVideo" autoplay playsinline muted></video>' +
      '<div class="in-app-call-avatars">' +
      '<img id="inAppRemoteAvatar" class="in-app-call-avatar" alt="" hidden />' +
      '<img id="inAppLocalAvatar" class="in-app-call-avatar local" alt="" hidden />' +
      "</div></div>" +
      '<div id="inAppCallVoiceStage" class="in-app-voice-stage" hidden>' +
      '<img id="inAppVoiceAvatar" class="in-app-voice-avatar" alt="" hidden />' +
      '<div id="inAppVoiceInitials" class="in-app-voice-initials"></div>' +
      '<div id="inAppVoiceName" class="in-app-voice-name"></div>' +
      "</div>" +
      '<audio id="inAppRemoteAudio" autoplay></audio>' +
      '<div id="inAppCallControls" class="in-app-call-controls">' +
      '<button type="button" id="inAppFlipCamera" class="in-app-call-btn" hidden></button>' +
      '<button type="button" id="inAppSpeakerToggle" class="in-app-call-btn"></button>' +
      '<button type="button" id="inAppEndCallBtn" class="in-app-end-call" data-in-app-call-close aria-label="End call"></button>' +
      "</div></div></div>";

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
      ".in-app-call-body{padding:24px;text-align:center;color:#e2e8f0;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}" +
      ".in-app-call-status{font-size:16px;font-weight:700}" +
      ".in-app-video-stage{position:relative;width:100%;max-width:360px}" +
      "#inAppRemoteVideo{width:100%;max-height:280px;background:#000;border-radius:12px;display:block}" +
      "#inAppLocalVideo{position:absolute;right:10px;bottom:10px;width:92px;height:122px;object-fit:cover;border-radius:10px;border:2px solid #fff;background:#111;box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
      ".in-app-call-avatars{display:flex;justify-content:center;gap:12px;margin-top:10px;flex-wrap:wrap}" +
      ".in-app-call-avatar{width:56px;height:56px;border-radius:999px;object-fit:cover;border:2px solid #94a3b8;background:#334155}" +
      ".in-app-call-avatar.local{border-color:#38bdf8}" +
      ".in-app-voice-stage{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}" +
      ".in-app-voice-avatar{width:96px;height:96px;border-radius:999px;object-fit:cover;border:3px solid #38bdf8;background:#334155}" +
      ".in-app-voice-initials{width:96px;height:96px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#334155;color:#f8fafc;font-size:32px;font-weight:800}" +
      ".in-app-voice-name{font-size:20px;font-weight:800;color:#f8fafc}" +
      ".in-app-call-controls{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:4px}" +
      ".in-app-call-btn{border:none;border-radius:999px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;background:#334155;color:#f8fafc}" +
      ".in-app-end-call{width:64px;height:64px;border:none;border-radius:999px;background:#dc2626;color:#fff;font-size:28px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(220,38,38,.35)}" +
      ".in-app-end-call::before{content:'\\2716';font-weight:700}" +
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
      el.addEventListener("click", function () { close(false); });
    });
    document.getElementById("inAppIncomingAccept").addEventListener("click", acceptIncoming);
    document.getElementById("inAppIncomingDecline").addEventListener("click", declineIncoming);
    document.getElementById("inAppFlipCamera").addEventListener("click", flipCamera);
    document.getElementById("inAppSpeakerToggle").addEventListener("click", toggleSpeaker);
    var endBtn = document.getElementById("inAppEndCallBtn");
    if (endBtn) {
      endBtn.title = callT("close");
      endBtn.addEventListener("click", function () { close(false); });
    }
  }

  function initialsFromName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return parts.slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join("");
  }

  function setAvatarImage(imgEl, photoUrl, fallbackName) {
    if (!imgEl) return false;
    if (photoUrl) {
      imgEl.src = photoUrl;
      imgEl.hidden = false;
      imgEl.onerror = function () {
        imgEl.hidden = true;
      };
      return true;
    }
    imgEl.hidden = true;
    return false;
  }

  function resolveCallPeople(meta, role) {
    meta = meta || {};
    role = String(role || watchState.localRole || "customer");
    var customerName = meta.customerName || meta.remoteName || "Customer";
    var driverName = meta.driverName || "Driver";
    var customerPhoto = meta.customerPhoto || "";
    var driverPhoto = meta.driverPhoto || "";
    if (role === "driver") {
      return {
        localName: driverName,
        localPhoto: driverPhoto,
        remoteName: customerName,
        remotePhoto: customerPhoto,
      };
    }
    return {
      localName: customerName,
      localPhoto: customerPhoto || localStorage.getItem("user_photo") || "",
      remoteName: driverName,
      remotePhoto: driverPhoto,
    };
  }

  function updateCallLayout(mode, meta) {
    var videoStage = document.getElementById("inAppCallVideoStage");
    var voiceStage = document.getElementById("inAppCallVoiceStage");
    var flipBtn = document.getElementById("inAppFlipCamera");
    var speakerBtn = document.getElementById("inAppSpeakerToggle");
    var people = resolveCallPeople(meta, watchState.localRole);
    if (flipBtn) {
      flipBtn.textContent = callT("flipCamera");
      flipBtn.hidden = mode !== "video";
    }
    if (speakerBtn) speakerBtn.textContent = speakerEnabled ? callT("speakerOn") : callT("speakerOff");
    if (mode === "video") {
      if (videoStage) videoStage.hidden = false;
      if (voiceStage) voiceStage.hidden = true;
      setAvatarImage(document.getElementById("inAppRemoteAvatar"), people.remotePhoto, people.remoteName);
      setAvatarImage(document.getElementById("inAppLocalAvatar"), people.localPhoto, people.localName);
    } else {
      if (videoStage) videoStage.hidden = true;
      if (voiceStage) voiceStage.hidden = false;
      var voiceAvatar = document.getElementById("inAppVoiceAvatar");
      var voiceInitials = document.getElementById("inAppVoiceInitials");
      var voiceName = document.getElementById("inAppVoiceName");
      if (voiceName) voiceName.textContent = people.remoteName;
      if (!setAvatarImage(voiceAvatar, people.remotePhoto, people.remoteName) && voiceInitials) {
        voiceInitials.textContent = initialsFromName(people.remoteName);
        voiceInitials.hidden = false;
      } else if (voiceInitials) {
        voiceInitials.hidden = true;
      }
    }
  }

  function bindLocalPreview(stream) {
    var localVideo = document.getElementById("inAppLocalVideo");
    var videoStage = document.getElementById("inAppCallVideoStage");
    if (videoStage) videoStage.hidden = false;
    if (localVideo && stream) {
      localVideo.srcObject = stream;
      localVideo.hidden = false;
      localVideo.muted = true;
      var playPromise = localVideo.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function (error) {
          console.warn("Local video preview play failed", error);
        });
      }
    }
  }

  async function flipCamera() {
    if (!activeCall || activeCall.mode !== "video" || !activeCall.pc) return;
    var nextFront = !useFrontCamera;
    try {
      var stream = await startLocalMedia("video", nextFront ? "user" : "environment", true);
      var newVideoTrack = stream.getVideoTracks()[0];
      if (!newVideoTrack) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      var sender = activeCall.pc.getSenders().find(function (entry) {
        return entry.track && entry.track.kind === "video";
      });
      if (sender) await sender.replaceTrack(newVideoTrack);
      if (activeCall.localStream) {
        activeCall.localStream.getVideoTracks().forEach(function (track) { track.stop(); });
        activeCall.localStream.addTrack(newVideoTrack);
      } else {
        activeCall.localStream = stream;
      }
      stream.getTracks().forEach(function (track) {
        if (track !== newVideoTrack) track.stop();
      });
      useFrontCamera = nextFront;
      bindLocalPreview(activeCall.localStream);
    } catch (error) {
      console.error("Camera flip failed", error);
    }
  }

  function toggleSpeaker() {
    speakerEnabled = !speakerEnabled;
    var remoteAudio = document.getElementById("inAppRemoteAudio");
    if (remoteAudio) remoteAudio.muted = !speakerEnabled;
    var speakerBtn = document.getElementById("inAppSpeakerToggle");
    if (speakerBtn) speakerBtn.textContent = speakerEnabled ? callT("speakerOn") : callT("speakerOff");
  }

  function setCallStatus(text) {
    var el = document.getElementById("inAppCallStatus");
    if (el) el.textContent = text || "";
  }

  function showCallModal(title, mode) {
    ensureUi();
    var modal = document.getElementById("inAppCallModal");
    var titleEl = document.getElementById("inAppCallTitle");
    if (titleEl) titleEl.textContent = title || callT("voice");
    if (modal) modal.hidden = false;
    document.body.style.overflow = "hidden";
    var videoStage = document.getElementById("inAppCallVideoStage");
    var voiceStage = document.getElementById("inAppCallVoiceStage");
    if (mode === "video") {
      if (videoStage) videoStage.hidden = false;
      if (voiceStage) voiceStage.hidden = true;
    } else {
      if (videoStage) videoStage.hidden = true;
      if (voiceStage) voiceStage.hidden = false;
    }
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
    var localVideo = document.getElementById("inAppLocalVideo");
    var remoteAudio = document.getElementById("inAppRemoteAudio");
    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) {
      localVideo.srcObject = null;
      localVideo.hidden = true;
    }
    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.muted = false;
    }
    speakerEnabled = true;
    activeCall = null;
  }

  function bindRemoteStream(stream, mode) {
    var remoteVideo = document.getElementById("inAppRemoteVideo");
    var remoteAudio = document.getElementById("inAppRemoteAudio");
    var videoStage = document.getElementById("inAppCallVideoStage");
    if (mode === "video" && remoteVideo) {
      if (videoStage) videoStage.hidden = false;
      remoteVideo.srcObject = stream;
      remoteVideo.hidden = false;
      var playPromise = remoteVideo.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function (error) {
          console.warn("Remote video play failed", error);
        });
      }
    }
    if (remoteAudio) {
      remoteAudio.srcObject = stream;
      remoteAudio.muted = !speakerEnabled;
    }
    if (activeCall) {
      activeCall.remoteStream = stream;
      if (!activeCall.recordingActive) startCallRecording(activeCall);
    }
  }

  function buildRecordingStream(call) {
    if (!call || !call.localStream) return null;
    var combined = new MediaStream();
    call.localStream.getAudioTracks().forEach(function (track) { combined.addTrack(track); });
    if (call.mode === "video") {
      call.localStream.getVideoTracks().forEach(function (track) { combined.addTrack(track); });
      if (call.remoteStream) {
        call.remoteStream.getAudioTracks().forEach(function (track) { combined.addTrack(track); });
      }
    }
    return combined;
  }

  function startCallRecording(call) {
    if (!call || call.recordingActive || !window.MediaRecorder) return;
    try {
      var stream = buildRecordingStream(call);
      if (!stream || !stream.getTracks().length) return;
      recordedChunks = [];
      recordingMime = call.mode === "video" ? "video/webm" : "audio/webm";
      if (!MediaRecorder.isTypeSupported(recordingMime)) {
        recordingMime = call.mode === "video" ? "video/webm;codecs=vp8,opus" : "audio/webm;codecs=opus";
      }
      if (!MediaRecorder.isTypeSupported(recordingMime)) recordingMime = "";
      mediaRecorder = recordingMime
        ? new MediaRecorder(stream, { mimeType: recordingMime })
        : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (event) {
        if (event.data && event.data.size) recordedChunks.push(event.data);
      };
      mediaRecorder.start(1000);
      call.recordingActive = true;
    } catch (error) {
      console.warn("Call recording unavailable", error);
    }
  }

  function stopCallRecording() {
    return new Promise(function (resolve) {
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        mediaRecorder = null;
        return resolve(null);
      }
      mediaRecorder.onstop = function () {
        var mime = recordingMime || mediaRecorder.mimeType || "application/octet-stream";
        var blob = recordedChunks.length ? new Blob(recordedChunks, { type: mime }) : null;
        recordedChunks = [];
        mediaRecorder = null;
        resolve(blob ? { blob: blob, mime: mime } : null);
      };
      try { mediaRecorder.stop(); } catch (error) { resolve(null); }
    });
  }

  function getStorageBucket() {
    if (typeof firebase === "undefined" || !window.FIREBASE_CONFIG) return null;
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    if (!firebase.storage) return null;
    return firebase.storage();
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, ms);
      }),
    ]);
  }

  async function uploadCallRecording(orderId, blob, mime) {
    var storage = getStorageBucket();
    if (!storage || !blob) return "";
    var ext = mime.indexOf("video") >= 0 ? "webm" : "webm";
    var path = "callRecordings/" + String(orderId || "unknown") + "/" + Date.now() + "." + ext;
    var ref = storage.ref().child(path);
    await ref.put(blob, { contentType: mime || "application/octet-stream" });
    return ref.getDownloadURL();
  }

  function createPeerConnection(orderId, mode, isCaller) {
    var pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    });
    pc.ontrack = function (event) {
      var stream = event.streams && event.streams[0];
      if (!stream && event.track) {
        if (!pc._remoteMediaStream) pc._remoteMediaStream = new MediaStream();
        var hasTrack = pc._remoteMediaStream.getTracks().some(function (track) {
          return track.id === event.track.id;
        });
        if (!hasTrack) pc._remoteMediaStream.addTrack(event.track);
        stream = pc._remoteMediaStream;
      }
      if (stream) bindRemoteStream(stream, mode);
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

  async function startLocalMedia(mode, facingMode, videoOnly) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone not available in this browser");
    }
    var constraints = videoOnly ? {} : { audio: true };
    if (mode === "video") {
      constraints.video = facingMode ? { facingMode: facingMode } : true;
    }
    return navigator.mediaDevices.getUserMedia(constraints);
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

  async function persistCallHistoryIfNeeded(outcome) {
    if (!activeCall || activeCall.historySaved) return;
    activeCall.historySaved = true;
    var call = activeCall;
    var meta = call.meta || {};
    var recordingUrl = "";
    var recordingMimeType = "";
    try {
      var recording = await stopCallRecording();
      if (recording && recording.blob) {
        recordingMimeType = recording.mime || "";
        try {
          recordingUrl = await withTimeout(
            uploadCallRecording(call.orderId, recording.blob, recording.mime),
            8000
          );
        } catch (uploadError) {
          console.warn("Call recording upload skipped", uploadError);
        }
      }
    } catch (error) {
      console.warn("Call recording stop failed", error);
    }
    try {
      await saveCallHistory(call.orderId, {
        orderNumber: meta.orderNumber || "",
        marketId: meta.marketId || "",
        marketName: meta.marketName || "",
        driverName: meta.driverName || "",
        customerName: meta.customerName || "",
        callerName: meta.callerName || watchState.displayName || "",
        callerRole: meta.callerRole || watchState.localRole || "",
        mode: call.mode || "voice",
        startedAt: call.startedAt || new Date().toISOString(),
        outcome: outcome || "completed",
        recordingUrl: recordingUrl,
        recordingMime: recordingMimeType,
      });
    } catch (error) {
      console.error("Call history save failed", error);
      activeCall.historySaved = false;
    }
  }

  async function beginCall(orderId, mode, isCaller, remoteMeta) {
    cleanupPeer();
    useFrontCamera = true;
    speakerEnabled = true;
    var stream = await startLocalMedia(mode, mode === "video" ? "user" : undefined);
    var pc = createPeerConnection(orderId, mode, isCaller);
    stream.getTracks().forEach(function (track) {
      pc.addTrack(track, stream);
    });
    var meta = Object.assign({}, remoteMeta || {});
    if (!meta.callerName) {
      meta.callerName = isCaller
        ? (watchState.displayName || meta.customerName || "Guest")
        : (meta.callerName || "Guest");
    }
    if (!meta.callerRole) {
      meta.callerRole = isCaller
        ? (watchState.localRole || "customer")
        : (meta.callerRole || "customer");
    }
    activeCall = {
      orderId: orderId,
      mode: mode,
      pc: pc,
      localStream: stream,
      startedAt: new Date().toISOString(),
      meta: meta,
      historySaved: false,
    };
    watchCandidates(orderId, pc);
    showCallModal(mode === "video" ? callT("video") : callT("voice"), mode);
    updateCallLayout(mode, remoteMeta);
    if (mode === "video") bindLocalPreview(stream);
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
      var answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: (data.mode || "voice") === "video",
      });
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
      close(false);
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
        if (activeCall) {
          updateCallLayout(activeCall.mode, activeCall.meta);
          if (activeCall.mode === "video" && activeCall.localStream) {
            bindLocalPreview(activeCall.localStream);
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

    if (status === "active" && callerId !== localId && activeCall && activeCall.orderId === orderId && data.answer && !activeCall.remoteDescriptionSet) {
      try {
        await activeCall.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        activeCall.remoteDescriptionSet = true;
        stopRing();
        setCallStatus(callT("connected"));
      } catch (error) {
        console.error("Callee connect failed", error);
      }
      return;
    }

    if (status === "declined" || status === "ended") {
      if (outgoingOrderId === orderId) outgoingOrderId = "";
      hideIncoming();
      stopRing();
      pendingIncoming = null;
      if (activeCall && activeCall.orderId === orderId) {
        close(true);
      } else {
        var modal = document.getElementById("inAppCallModal");
        if (modal && !modal.hidden) close(true);
      }
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
      var offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callMode === "video",
      });
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
      setCallStatus(String(error.message || "Call failed"));
      close(false);
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  function close(fromRemote) {
    var remoteEnd = fromRemote === true;
    var endedOrderId = activeCall && activeCall.orderId;
    var endedOutcome = remoteEnd ? "remote-ended" : "ended";
    stopRing();
    outgoingOrderId = "";
    hideIncoming();
    pendingIncoming = null;
    var finalize = async function () {
      if (activeCall) {
        await persistCallHistoryIfNeeded(endedOutcome);
      }
      if (endedOrderId && !remoteEnd) {
        unwatchCandidates(endedOrderId);
        var ref = callRef(endedOrderId);
        if (ref) {
          ref.set({ status: "ended", updatedAt: new Date().toISOString() }, { merge: true }).catch(function () {});
        }
      } else if (endedOrderId && remoteEnd) {
        unwatchCandidates(endedOrderId);
        setCallStatus(callT("ended"));
      }
      cleanupPeer();
      var modal = document.getElementById("inAppCallModal");
      if (modal) modal.hidden = true;
      document.body.style.overflow = "";
    };
    void finalize();
  }

  window.InAppCall = {
    open: open,
    close: close,
    syncWatch: syncWatch,
  };
})();
