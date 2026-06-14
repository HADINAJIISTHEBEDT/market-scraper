(function () {
  "use strict";

  const OWNER_EMAIL = "hadi.naji145@gmail.com";

  const LOCK_COPY = {
    tr: {
      modalTitle: "Yakinda acilacak",
      modalBody: "Bu ozellikler en kisa surede herkese acilacak. Simdilik sadece admin erisebilir.",
      modalClose: "Tamam",
      comingSoonTitle: "Yakinda",
      comingSoonBody: "Asagidaki ozellikler en kisa surede acilacak.",
      featureLogin: "Google ile giris",
      featureCart: "Sepet",
      featureProfile: "Profil",
      featureOrders: "Siparisler",
      featureDeleteAccount: "Hesap silme",
      lockedBadge: "Kilitli",
      pageLockTitle: "Bu sayfa simdilik kilitli",
      pageLockBody: "Bu ozellik en kisa surede herkese acilacak. Simdilik sadece admin kullanabilir.",
      pageLockBack: "Ana sayfaya don",
      blockedTitle: "Erisim engellendi",
      blockedAccountBody: `Admin tarafindan engellendiniz. Bunun bir yanlis anlama oldugunu dusunuyorsaniz ${OWNER_EMAIL} hesabina e-posta gonderin.`,
    },
    en: {
      modalTitle: "Coming soon",
      modalBody: "These features will be unlocked as soon as possible. Only the admin can use them for now.",
      modalClose: "OK",
      comingSoonTitle: "Coming soon",
      comingSoonBody: "These features will be unlocked as soon as possible.",
      featureLogin: "Sign in with Google",
      featureCart: "Cart",
      featureProfile: "Profile",
      featureOrders: "Orders",
      featureDeleteAccount: "Delete account",
      lockedBadge: "Locked",
      pageLockTitle: "This page is locked for now",
      pageLockBody: "This feature will be unlocked as soon as possible. Only the admin can use it for now.",
      pageLockBack: "Back to home",
      blockedTitle: "Access blocked",
      blockedAccountBody: `You were blocked by the admin. If you think this is a misunderstanding, send an email to ${OWNER_EMAIL}.`,
    },
    ar: {
      modalTitle: "قريباً",
      modalBody: "سيتم فتح هذه الميزات في أقرب وقت ممكن. يمكن للمسؤول فقط استخدامها الآن.",
      modalClose: "حسناً",
      comingSoonTitle: "قريباً",
      comingSoonBody: "سيتم فتح هذه الميزات في أقرب وقت ممكن.",
      featureLogin: "تسجيل الدخول عبر Google",
      featureCart: "السلة",
      featureProfile: "الملف الشخصي",
      featureOrders: "الطلبات",
      featureDeleteAccount: "حذف الحساب",
      lockedBadge: "مقفل",
      pageLockTitle: "هذه الصفحة مقفلة حالياً",
      pageLockBody: "سيتم فتح هذه الميزة في أقرب وقت ممكن. يمكن للمسؤول فقط استخدامها الآن.",
      pageLockBack: "العودة إلى الرئيسية",
      blockedTitle: "تم حظر الوصول",
      blockedAccountBody: `تم حظرك من قبل المسؤول. إذا كنت تعتقد أن هذا سوء فهم، أرسل بريداً إلكترونياً إلى ${OWNER_EMAIL}.`,
    },
  };

  function currentLang() {
    return localStorage.getItem("app_lang") || "tr";
  }

  function t(key) {
    const lang = currentLang();
    return (LOCK_COPY[lang] && LOCK_COPY[lang][key]) || LOCK_COPY.tr[key] || key;
  }

  function normalizeGmail(email) {
    const value = String(email || "").trim().toLowerCase();
    const [local, domain] = value.split("@");
    if (domain === "gmail.com" || domain === "googlemail.com") {
      return `${local.replace(/\./g, "")}@gmail.com`;
    }
    return value;
  }

  function getDeviceId() {
    let deviceId = localStorage.getItem("app_device_id");
    if (deviceId) return deviceId;
    if (window.crypto?.randomUUID) {
      deviceId = window.crypto.randomUUID();
    } else {
      deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    localStorage.setItem("app_device_id", deviceId);
    return deviceId;
  }

  function isAdminUser() {
    const userEmail = normalizeGmail(localStorage.getItem("user_email"));
    const role = localStorage.getItem("user_role");
    const userUid = localStorage.getItem("user_uid");
    const ownerMatch = normalizeGmail(OWNER_EMAIL);

    if (userUid && role === "admin" && userEmail === ownerMatch) return true;
    return false;
  }

  function areFeaturesUnlockedForAll() {
    return localStorage.getItem("app_features_unlocked") === "true";
  }

  function canUseFeatures() {
    return isAdminUser() || areFeaturesUnlockedForAll();
  }

  function ensureModal() {
    let modal = document.getElementById("featureLockModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "featureLockModal";
    modal.className = "feature-lock-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="feature-lock-modal__backdrop" data-close-lock-modal></div>
      <div class="feature-lock-modal__panel" role="dialog" aria-modal="true" aria-labelledby="featureLockModalTitle">
        <h3 id="featureLockModalTitle"></h3>
        <p id="featureLockModalBody"></p>
        <button type="button" id="featureLockModalClose"></button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("[data-close-lock-modal]")?.addEventListener("click", hideLockedModal);
    modal.querySelector("#featureLockModalClose")?.addEventListener("click", hideLockedModal);
    return modal;
  }

  function showLockedModal() {
    const modal = ensureModal();
    document.getElementById("featureLockModalTitle").textContent = t("modalTitle");
    document.getElementById("featureLockModalBody").textContent = t("modalBody");
    document.getElementById("featureLockModalClose").textContent = t("modalClose");
    modal.hidden = false;
  }

  function hideLockedModal() {
    const modal = document.getElementById("featureLockModal");
    if (modal) modal.hidden = true;
  }

  function bindLockedTrigger(element) {
    if (!element || element.dataset.lockBound === "true") return;
    element.dataset.lockBound = "true";
    element.addEventListener("click", (event) => {
      if (canUseFeatures()) return;
      event.preventDefault();
      showLockedModal();
    });
  }

  function showPageLock() {
    const overlay = document.createElement("div");
    overlay.className = "feature-page-lock";
    overlay.innerHTML = `
      <div class="feature-page-lock__panel">
        <div class="feature-page-lock__badge">${t("lockedBadge")}</div>
        <h1>${t("pageLockTitle")}</h1>
        <p>${t("pageLockBody")}</p>
        <a href="index.html">${t("pageLockBack")}</a>
      </div>
    `;
    document.body.prepend(overlay);
    document.body.classList.add("feature-page-locked");
  }

  function showBlockedPage(message = t("blockedAccountBody")) {
    if (document.getElementById("blockedAccountLock")) return;
    const overlay = document.createElement("div");
    overlay.id = "blockedAccountLock";
    overlay.className = "feature-page-lock";
    overlay.innerHTML = `
      <div class="feature-page-lock__panel">
        <div class="feature-page-lock__badge">${t("lockedBadge")}</div>
        <h1>${t("blockedTitle")}</h1>
        <p>${message}</p>
        <a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a>
      </div>
    `;
    document.body.prepend(overlay);
    document.body.classList.add("feature-page-locked");
  }

  function guardPage() {
    if (canUseFeatures()) return true;
    showPageLock();
    return false;
  }

  function updateDeleteAccountLink() {
    const link = document.getElementById("deleteAccountLink");
    if (!link) return;
    if (canUseFeatures()) {
      link.hidden = false;
      link.removeAttribute("aria-disabled");
      link.classList.remove("locked-feature-link");
      return;
    }
    link.hidden = false;
    link.setAttribute("aria-disabled", "true");
    link.classList.add("locked-feature-link");
    bindLockedTrigger(link);
  }

  function initComingSoonPanel() {
    const panel = document.getElementById("comingSoonPanel");
    if (!panel) return;

    if (canUseFeatures()) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const title = document.getElementById("comingSoonTitle");
    const body = document.getElementById("comingSoonBody");
    if (title) title.textContent = t("comingSoonTitle");
    if (body) body.textContent = t("comingSoonBody");

    const featureMap = {
      login: "featureLogin",
      cart: "featureCart",
      profile: "featureProfile",
      orders: "featureOrders",
      delete: "featureDeleteAccount",
    };

    panel.querySelectorAll("[data-feature]").forEach((card) => {
      const key = featureMap[card.dataset.feature];
      const label = card.querySelector("[data-feature-label]");
      const badge = card.querySelector("[data-feature-badge]");
      if (label && key) label.textContent = t(key);
      if (badge) badge.textContent = t("lockedBadge");
      bindLockedTrigger(card);
    });
  }

  function initLockedFooterLinks() {
    document.querySelectorAll(".locked-feature-link").forEach(bindLockedTrigger);
    updateDeleteAccountLink();
  }

  function initLoginNotice() {
    if (canUseFeatures()) return;
    const status = document.getElementById("authStatus");
    if (status && !status.textContent.trim()) {
      status.textContent = t("modalBody");
      status.className = "status-box";
    }
  }

  function clearLocalUser() {
    [
      "user_name",
      "user_uid",
      "user_email",
      "user_phone",
      "user_address",
      "user_photo",
      "user_role",
      "owner_access",
      "owner_email",
    ].forEach((key) => localStorage.removeItem(key));
  }

  function showBlockedAccountNotice() {
    const message = sessionStorage.getItem("blocked_account_notice");
    if (!message) return;
    const status = document.getElementById("authStatus");
    if (status) {
      status.textContent = message;
      status.className = "status-box error";
    } else {
      alert(message);
    }
    sessionStorage.removeItem("blocked_account_notice");
  }

  function handleBlockedAccess() {
    const message = t("blockedAccountBody");
    sessionStorage.setItem("blocked_account_notice", message);
    clearLocalUser();
    if (location.pathname.endsWith("/login.html")) {
      showBlockedAccountNotice();
    } else {
      showBlockedPage(message);
    }
  }

  function startDeletedAccountWatcher() {
    const uid = localStorage.getItem("user_uid");
    if (!uid || window.__deletedAccountWatcherStarted) return;
    window.__deletedAccountWatcherStarted = true;

    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js")
      .then(({ getApps, initializeApp }) => Promise.all([
        Promise.resolve(getApps()[0] || initializeApp({
          apiKey: "AIzaSyA4ZmYg5sTs4gU1Nm25s7of6oqJ4xGpR28",
          authDomain: "st-business-86a9b.firebaseapp.com",
          projectId: "st-business-86a9b",
          storageBucket: "st-business-86a9b.firebasestorage.app",
          messagingSenderId: "472603409840",
          appId: "1:472603409840:web:30127c81e74c3b3c4e2a75",
        })),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
      ]))
      .then(([app, firestore]) => {
        let db;
        try {
          db = firestore.initializeFirestore(app, {
            experimentalForceLongPolling: true,
            useFetchStreams: false,
          });
        } catch {
          db = firestore.getFirestore(app);
        }
        firestore.onSnapshot(firestore.doc(db, "users", uid), (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          if (data && !data.blocked) return;
          if (data?.blocked) {
            handleBlockedAccess();
          } else {
            clearLocalUser();
            if (!location.pathname.endsWith("/login.html")) {
              window.location.href = "login.html";
            }
          }
        });
      })
      .catch((error) => {
        console.error("[FeatureAccess] Deleted account watcher failed:", error);
      });
  }

  function startBlockedDeviceWatcher() {
    const deviceId = getDeviceId();
    if (!deviceId || window.__blockedDeviceWatcherStarted) return;
    window.__blockedDeviceWatcherStarted = true;

    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js")
      .then(({ getApps, initializeApp }) => Promise.all([
        Promise.resolve(getApps()[0] || initializeApp({
          apiKey: "AIzaSyA4ZmYg5sTs4gU1Nm25s7of6oqJ4xGpR28",
          authDomain: "st-business-86a9b.firebaseapp.com",
          projectId: "st-business-86a9b",
          storageBucket: "st-business-86a9b.firebasestorage.app",
          messagingSenderId: "472603409840",
          appId: "1:472603409840:web:30127c81e74c3b3c4e2a75",
        })),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
      ]))
      .then(([app, firestore]) => {
        let db;
        try {
          db = firestore.initializeFirestore(app, {
            experimentalForceLongPolling: true,
            useFetchStreams: false,
          });
        } catch {
          db = firestore.getFirestore(app);
        }
        firestore.onSnapshot(firestore.doc(db, "blockedDevices", deviceId), (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          if (!data?.blocked) return;
          handleBlockedAccess();
        });
      })
      .catch((error) => {
        console.error("[FeatureAccess] Blocked device watcher failed:", error);
      });
  }

  window.FeatureAccess = {
    OWNER_EMAIL,
    getDeviceId,
    isAdminUser,
    canUseFeatures,
    areFeaturesUnlockedForAll,
    showLockedModal,
    hideLockedModal,
    showPageLock,
    showBlockedPage,
    guardPage,
    initComingSoonPanel,
    initLockedFooterLinks,
    initLoginNotice,
    clearLocalUser,
    showBlockedAccountNotice,
    startDeletedAccountWatcher,
    updateDeleteAccountLink,
    bindLockedTrigger,
    t,
  };

  getDeviceId();
  startDeletedAccountWatcher();
  startBlockedDeviceWatcher();
})();
