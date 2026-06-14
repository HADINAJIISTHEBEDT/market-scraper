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

  window.FeatureAccess = {
    OWNER_EMAIL,
    isAdminUser,
    canUseFeatures,
    areFeaturesUnlockedForAll,
    showLockedModal,
    hideLockedModal,
    showPageLock,
    guardPage,
    initComingSoonPanel,
    initLockedFooterLinks,
    initLoginNotice,
    updateDeleteAccountLink,
    bindLockedTrigger,
    t,
  };
})();
