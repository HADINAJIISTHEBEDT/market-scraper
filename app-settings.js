(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyA4ZmYg5sTs4gU1Nm25s7of6oqJ4xGpR28",
    authDomain: "st-business-86a9b.firebaseapp.com",
    projectId: "st-business-86a9b",
    storageBucket: "st-business-86a9b.firebasestorage.app",
    messagingSenderId: "472603409840",
    appId: "1:472603409840:web:30127c81e74c3b3c4e2a75"
  };

  const DEFAULT_HOMEPAGE_TILES = [
    { id: "tile-1", label: "Fresh vegetables", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-2", label: "Bread and bakery", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-3", label: "Daily groceries", imageUrl: "https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-4", label: "Fruit", imageUrl: "https://images.unsplash.com/photo-1519996529931-28324d5a630e?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-5", label: "Rice and grains", imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-6", label: "Desserts", imageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-7", label: "Potatoes", imageUrl: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-8", label: "Dairy", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-9", label: "Vegetables", imageUrl: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80" },
    { id: "tile-10", label: "Bananas", imageUrl: "https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=600&q=80" },
  ];

  const DEFAULT_SETTINGS = {
    featuresUnlocked: false,
    announcement: "",
    appPaused: false,
    commandMessage: "",
    heroTitle: "",
    heroSubtitle: "",
    homepageTiles: DEFAULT_HOMEPAGE_TILES,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let hasReady = false;

  function normalizeSettings(data = {}) {
    const tiles = Array.isArray(data.homepageTiles) && data.homepageTiles.length
      ? data.homepageTiles
      : DEFAULT_SETTINGS.homepageTiles;

    return {
      ...DEFAULT_SETTINGS,
      ...data,
      featuresUnlocked: Boolean(data.featuresUnlocked),
      announcement: String(data.announcement || ""),
      appPaused: Boolean(data.appPaused),
      commandMessage: String(data.commandMessage || ""),
      heroTitle: String(data.heroTitle || ""),
      heroSubtitle: String(data.heroSubtitle || ""),
      homepageTiles: tiles.map((tile, index) => ({
        id: String(tile.id || `tile-${index + 1}`),
        label: String(tile.label || ""),
        imageUrl: String(tile.imageUrl || ""),
      })),
    };
  }

  function publishSettings(nextSettings) {
    settings = normalizeSettings(nextSettings);
    localStorage.setItem("app_features_unlocked", settings.featuresUnlocked ? "true" : "false");
    if (!hasReady) {
      hasReady = true;
      resolveReady();
    }
    window.dispatchEvent(new CustomEvent("app-settings-changed", { detail: settings }));
  }

  function publishLocalFallbackSettings() {
    publishSettings({
      featuresUnlocked: localStorage.getItem("app_features_unlocked") === "true",
    });
  }

  function fromFirestoreValue(field) {
    if (!field || typeof field !== "object") return undefined;
    if ("booleanValue" in field) return Boolean(field.booleanValue);
    if ("stringValue" in field) return String(field.stringValue || "");
    if ("doubleValue" in field) return Number(field.doubleValue);
    if ("integerValue" in field) return Number(field.integerValue);
    if ("nullValue" in field) return null;
    if ("arrayValue" in field) {
      return (field.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ("mapValue" in field) {
      const output = {};
      Object.entries(field.mapValue.fields || {}).forEach(([key, value]) => {
        output[key] = fromFirestoreValue(value);
      });
      return output;
    }
    return undefined;
  }

  async function loadSettingsWithRest() {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/appSettings/global?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`REST ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const settingsData = {};
    Object.entries(data.fields || {}).forEach(([key, value]) => {
      settingsData[key] = fromFirestoreValue(value);
    });
    publishSettings(settingsData);
  }

  async function subscribeToSettings() {
    try {
      const [{ initializeApp, getApp, getApps }, { doc, initializeFirestore, getFirestore, onSnapshot }] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
      ]);
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      let db;
      try {
        db = initializeFirestore(app, {
          experimentalForceLongPolling: true,
          useFetchStreams: false,
        });
      } catch {
        db = getFirestore(app);
      }

      onSnapshot(
        doc(db, "appSettings", "global"),
        (snapshot) => {
          publishSettings(snapshot.exists() ? snapshot.data() : {});
        },
        (error) => {
          console.error("[AppSettings] Failed to load settings:", error);
          loadSettingsWithRest().catch((restError) => {
            console.error("[AppSettings] REST settings load failed:", restError);
            publishLocalFallbackSettings();
          });
        },
      );
    } catch (error) {
      console.error("[AppSettings] Failed to start settings listener:", error);
      loadSettingsWithRest().catch((restError) => {
        console.error("[AppSettings] REST settings load failed:", restError);
        publishLocalFallbackSettings();
      });
    }
  }

  window.AppSettings = {
    ready: () => readyPromise,
    get: () => settings,
    getDefaultTiles: () => DEFAULT_HOMEPAGE_TILES.map((tile) => ({ ...tile })),
    areFeaturesUnlocked: () => settings.featuresUnlocked === true,
  };

  subscribeToSettings();
  setTimeout(() => {
    if (!hasReady) {
      loadSettingsWithRest().catch(() => publishLocalFallbackSettings());
    }
  }, 5000);
})();
