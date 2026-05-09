"use strict";

let SCRAPER_API_BASE = "";
let currentLang = "tr";
let currentResultsData = null;

const MARKETS = [
  { key: "bim", label: "BIM" },
  { key: "a101", label: "A101" },
  { key: "sok", label: "SOK" },
  { key: "migros", label: "Migros" },
  { key: "tahtakale", label: "Tahtakale" },
  { key: "carrefour", label: "Carrefour" },
];

// Comprehensive English to Turkish product name translation
const PRODUCT_TRANSLATIONS = {
  // Dairy
  "milk": "sut",
  "yogurt": "yogurt",
  "cheese": "peynir",
  "butter": "tereyag",
  "cream": "krem",
  
  // Fruits
  "apple": "elma",
  "orange": "portakal",
  "banana": "muz",
  "strawberry": "ciliek",
  "watermelon": "karpu",
  "grape": "uzum",
  "lemon": "limon",
  "mango": "mango",
  "pear": "armut",
  "peach": "seftali",
  
  // Vegetables
  "tomato": "domates",
  "cucumber": "salatalik",
  "onion": "sogan",
  "garlic": "sarimsak",
  "pepper": "biber",
  "carrot": "havuc",
  "lettuce": "marul",
  "spinach": "ispanak",
  "broccoli": "brokoli",
  "potato": "patates",
  
  // Meat & Fish
  "chicken": "tavuk",
  "beef": "sigi eti",
  "fish": "balik",
  "shrimp": "karides",
  "lamb": "kuzueti",
  "turkey": "hindi",
  
  // Grains & Bread
  "bread": "ekmek",
  "rice": "pirinc",
  "pasta": "makarna",
  "flour": "un",
  "oats": "yulaf",
  
  // Beverages
  "tea": "cay",
  "coffee": "kahve",
  "juice": "meyve suyu",
  "water": "su",
  "wine": "sarap",
  "beer": "bira",
  "soda": "gazli icecek",
  "cola": "kola",
  
  // Oils & Condiments
  "oil": "yag",
  "olive oil": "zeytin yagi",
  "salt": "tuz",
  "sugar": "seker",
  "honey": "bal",
  "ketchup": "ketcap",
  "mayonnaise": "mayonez",
  "vinegar": "sirke",
  "soy sauce": "soya sosu",
  
  // Snacks
  "chocolate": "cokolata",
  "candy": "seker",
  "biscuit": "bisküvi",
  "chips": "cipis",
  "nuts": "kuruyemis",
  "popcorn": "patlamis misir",
  
  // Breakfast Items
  "egg": "yumurta",
  "jam": "receli",
  "honey": "bal",
  "cereal": "tahil cereali",
  
  // Spices & Seasonings
  "pepper": "karabiber",
  "cinnamon": "tarçin",
  "turmeric": "kurkumin",
  "paprika": "toz biber",
  
  // Frozen Foods
  "frozen vegetables": "donmus sebzeler",
  "frozen pizza": "donmus pizza",
  "ice cream": "dondurma",
  
  // Canned Foods
  "canned tomato": "konserve domates",
  "canned beans": "konserve fasulye",
  "canned fish": "konserve balik",
  
  // Cleaning & Personal Care
  "soap": "sabun",
  "shampoo": "sampuan",
  "toothpaste": "dis macunu",
  "toilet paper": "tuvalet kagidi",
  "detergent": "deterjan",
  "dish soap": "bulaşık deterjanı",
  "hand sanitizer": "el dezenfektanı"
};

const I18N = {
  tr: {
    title: "PazarQuery",
    subtitle: "Gunluk ihtiyaclarini bul ve secimlerini karsilastir. Urun isimlerini Turkce yazmayi unutma.",
    placeholder: "Urun adi yazin...",
    search: "Ara",
    statusSearching: "Araniyor... Daha iyi sonuclar icin bitirmemiz yaklasik 1 dakika surebilir.",
    statusDone: "Arama tamamlandi.",
    statusWriteProduct: "Lutfen urun adi yazin.",
    statusError: "Hata",
    noResults: "Sonuc bulunamadi.",
    filterAllMarkets: "Tum Kaynaklar",
    filterSort: "Sirala",
    filterSortAsc: "Fiyat: Dusuk > Yuksek",
    filterSortDesc: "Fiyat: Yuksek > Dusuk",
    filterMinPrice: "Min fiyat",
    filterMaxPrice: "Max fiyat",
    filterItemLimit: "Urun adedi",
    markets: {
      bim: "BIM",
      a101: "A101",
      sok: "SOK",
      migros: "Migros",
      tahtakale: "Tahtakale",
      carrefour: "Carrefour",
    },
    contactPrompt: "Herhangi bir sorun icin ",
    contactButton: "bize ulasin",
    contactEmail: "E-posta",
    contactTitle: "Baslik",
    contactComponent: "Mesaj",
    contactSubmit: "Mesaj gonder",
    contactClose: "Kapat",
    navBrand: "PazarQuery",
    navCart: "Sepet",
    navOrders: "Siparisler",
    navProfile: "Profil",
    navLogin: "Giris",
    navLogout: "Cikis",
    addToCart: "Sepete ekle",
    addedToCart: "Eklendi!",
    backToSearch: "Aramaya don",
    featuredFreshVegetables: "Taze sebzeler",
    featuredBreadAndBakery: "Ekmek ve fırın ürünleri",
    featuredDailyGroceries: "Günlük temel gıdalar",
    featuredFruit: "Meyve",
    featuredRiceAndGrains: "Pirinç ve tahıllar",
    featuredDesserts: "Tatlılar",
    featuredPotatoes: "Patates",
    featuredDairy: "Süt ürünleri",
    featuredVegetables: "Sebzeler",
    featuredBananas: "Muz",
  },
  en: {
    title: "PazarQuery",
    subtitle: "Find everyday items, compare choices quietly. Make sure to write product names in Turkish.",
    placeholder: "Type product name...",
    search: "Search",
    statusSearching: "Searching... For better results we might take about 1 minute to finish.",
    statusDone: "Search completed.",
    statusWriteProduct: "Please enter a product name.",
    statusError: "Error",
    noResults: "No results found.",
    filterAllMarkets: "All Sources",
    filterSort: "Sort",
    filterSortAsc: "Price: Low > High",
    filterSortDesc: "Price: High > Low",
    filterMinPrice: "Min price",
    filterMaxPrice: "Max price",
    filterItemLimit: "Item limit",
    markets: {
      bim: "BIM",
      a101: "A101",
      sok: "SOK",
      migros: "Migros",
      tahtakale: "Tahtakale",
      carrefour: "Carrefour",
    },
    contactPrompt: "For any problem ",
    contactButton: "contact us",
    contactEmail: "Email",
    contactTitle: "Title",
    contactComponent: "Message",
    contactSubmit: "Send message",
    contactClose: "Close",
    navBrand: "PazarQuery",
    navCart: "Cart",
    navOrders: "Orders",
    navProfile: "Profile",
    navLogin: "Login",
    navLogout: "Logout",
    addToCart: "Add to Cart",
    addedToCart: "Added!",
    backToSearch: "Back to search",
    featuredFreshVegetables: "Fresh vegetables",
    featuredBreadAndBakery: "Bread and bakery",
    featuredDailyGroceries: "Daily groceries",
    featuredFruit: "Fruit",
    featuredRiceAndGrains: "Rice and grains",
    featuredDesserts: "Desserts",
    featuredPotatoes: "Potatoes",
    featuredDairy: "Dairy",
    featuredVegetables: "Vegetables",
    featuredBananas: "Bananas",
  },
  ar: {
    title: "PazarQuery",
    subtitle: "لا توجد عناصر محفوظة. فقط اكتب منتج وابحث. تأكد من كتابة أسماء المنتجات باللغة التركية.",
    placeholder: "\u0627\u0643\u062a\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062a\u062c...",
    search: "ابحث",
    statusSearching: "\u062c\u0627\u0631 \u0627\u0644\u0628\u062d\u062b... \u0644\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0646\u062a\u0627\u0626\u062c \u0623\u0641\u0636\u0644 \u0642\u062f \u0646\u062d\u062a\u0627\u062c \u062d\u0648\u0627\u0644\u064a \u062f\u0642\u064a\u0642\u0629 \u0648\u0627\u062d\u062f\u0629 \u0644\u0644\u0627\u0646\u062a\u0647\u0627\u0621.",
    statusDone: "اكتمل البحث.",
    statusWriteProduct: "يرجى إدخال اسم المنتج.",
    statusError: "خطأ",
    noResults: "لم يتم العثور على نتائج.",
    filterAllMarkets: "جميع الأسواق",
    filterSort: "ترتيب",
    filterSortAsc: "السعر: منخفض > مرتفع",
    filterSortDesc: "السعر: مرتفع > منخفض",
    filterMinPrice: "السعر الأدنى",
    filterMaxPrice: "السعر الأقصى",
    filterItemLimit: "حد الأصناف",
    markets: {
      bim: "BIM",
      a101: "A101",
      sok: "SOK",
      migros: "Migros",
      tahtakale: "Tahtakale",
      carrefour: "Carrefour",
    },
    contactPrompt: "لأي مشكلة ",
    contactButton: "تواصل معنا",
    contactEmail: "البريد الإلكتروني",
    contactTitle: "العنوان",
    contactComponent: "الرسالة",
    contactSubmit: "إرسال الرسالة",
    contactClose: "إغلاق",
    navBrand: "PazarQuery",
    navCart: "السلة",
    navOrders: "الطلبات",
    navProfile: "الملف الشخصي",
    navLogin: "تسجيل الدخول",
    navLogout: "تسجيل الخروج",
    addToCart: "أضف إلى السلة",
    backToSearch: "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0628\u062d\u062b",
    addedToCart: "\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629!",
    featuredFreshVegetables: "\u062e\u0636\u0631\u0648\u0627\u062a \u0637\u0627\u0632\u062c\u0629",
    featuredBreadAndBakery: "\u0627\u0644\u062e\u0628\u0632 \u0648\u0627\u0644\u0645\u062e\u0628\u0632\u0627\u062a",
    featuredDailyGroceries: "\u0627\u0644\u0628\u0642\u0627\u0644\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629",
    featuredFruit: "\u0627\u0644\u0641\u0627\u0643\u0647\u0629",
    featuredRiceAndGrains: "\u0627\u0644\u0623\u0631\u0632 \u0648\u0627\u0644\u062d\u0628\u0648\u0628",
    featuredDesserts: "\u0627\u0644\u062d\u0644\u0648\u064a\u0627\u062a",
    featuredPotatoes: "\u0627\u0644\u0628\u0637\u0637\u0633",
    featuredDairy: "\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0623\u0644\u0628\u0627\u0646",
    featuredVegetables: "\u0627\u0644\u062e\u0636\u0631\u0648\u0627\u062a",
    featuredBananas: "\u0627\u0644\u0645\u0648\u0632",
  },
};

function t(key) {
  return I18N[currentLang] && I18N[currentLang][key]
    ? I18N[currentLang][key]
    : I18N.tr[key]
    || key;
}

function tMarket(marketKey) {
  const langBlock = I18N[currentLang] || I18N.tr;
  const trBlock = I18N.tr;
  return (
    (langBlock.markets && langBlock.markets[marketKey]) ||
    (trBlock.markets && trBlock.markets[marketKey]) ||
    marketKey
  );
}

// Translate English product names to Turkish
function translateProductToTurkish(input) {
  const lower = String(input || "").toLowerCase().trim();
  return PRODUCT_TRANSLATIONS[lower] || input;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function normalizeFilterText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatPrice(price) {
  if (price === null || price === undefined) return "";
  return `${price.toFixed(2).replace('.', ',')} ₺`;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#b91c1c" : "#334155";
}

function applyLanguage() {
  const html = document.documentElement;
  html.lang = currentLang;
  html.dir = currentLang === "ar" ? "rtl" : "ltr";
  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const input = document.getElementById("searchInput");
  const button = document.getElementById("searchBtn");
  const marketFilter = document.getElementById("marketFilter");
  const sortFilter = document.getElementById("sortFilter");
  const minPrice = document.getElementById("minPrice");
  const maxPrice = document.getElementById("maxPrice");
  const itemLimit = document.getElementById("itemLimit");
  
  if (title) title.textContent = t("title");
  document.title = t("title");
  if (subtitle) {
    let sub = t("subtitle");
    if (currentLang !== "tr") {
      sub += " Make sure to write product names in Turkish.";
    }
    subtitle.textContent = sub;
  }
  if (input) input.placeholder = t("placeholder");
  if (button) button.textContent = t("search");
  
  // Update filter options
  if (marketFilter) {
    marketFilter.options[0].textContent = t("filterAllMarkets");
    for (let i = 1; i < marketFilter.options.length; i++) {
      const opt = marketFilter.options[i];
      const value = String(opt.value || "");
      if (!value) continue;
      opt.textContent = tMarket(value);
    }
  }
  if (sortFilter) {
    sortFilter.options[0].textContent = t("filterSort");
    if (sortFilter.options[1]) sortFilter.options[1].textContent = t("filterSortAsc");
    if (sortFilter.options[2]) sortFilter.options[2].textContent = t("filterSortDesc");
  }
  if (minPrice) minPrice.placeholder = t("filterMinPrice");
  if (maxPrice) maxPrice.placeholder = t("filterMaxPrice");
  if (itemLimit) itemLimit.placeholder = t("filterItemLimit");

  const contactPrompt = document.getElementById("contactPrompt");
  const contactToggle = document.getElementById("contactToggle");
  const contactEmailLabel = document.getElementById("contactEmailLabel");
  const contactTitleLabel = document.getElementById("contactTitleLabel");
  const contactComponentLabel = document.getElementById("contactComponentLabel");
  const contactSubmit = document.getElementById("contactSubmit");
  const contactClose = document.getElementById("contactClose");
  const navBrand = document.getElementById("navBrand");
  const navCartBtn = document.getElementById("navCartBtn");
  const navOrdersBtn = document.getElementById("navOrdersBtn");
  const navProfileBtn = document.getElementById("navProfileBtn");
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navLogoutBtn = document.getElementById("navLogoutBtn");

  if (contactPrompt) contactPrompt.textContent = t("contactPrompt");
  if (contactToggle) contactToggle.textContent = t("contactButton");
  if (contactEmailLabel) contactEmailLabel.textContent = t("contactEmail");
  if (contactTitleLabel) contactTitleLabel.textContent = t("contactTitle");
  if (contactComponentLabel) contactComponentLabel.textContent = t("contactComponent");
  if (contactSubmit) contactSubmit.textContent = t("contactSubmit");
  if (contactClose) contactClose.textContent = t("contactClose");
  if (navBrand) navBrand.textContent = t("navBrand");
  if (navCartBtn) navCartBtn.innerHTML = `${escapeHtml(t("navCart"))} (<span id="cartCount">${escapeHtml(document.getElementById("cartCount")?.textContent || "0")}</span>)`;
  if (navOrdersBtn) navOrdersBtn.textContent = t("navOrders");
  if (navProfileBtn) navProfileBtn.textContent = t("navProfile");
  if (navLoginBtn) navLoginBtn.textContent = t("navLogin");
  if (navLogoutBtn) navLogoutBtn.textContent = t("navLogout");
  const backToSearchBtn = document.getElementById("backToSearchBtn");
  if (backToSearchBtn) backToSearchBtn.textContent = t("backToSearch");

  const featuredItems = document.querySelectorAll(".ad-tile span");
  const featuredKeys = [
    "featuredFreshVegetables",
    "featuredBreadAndBakery",
    "featuredDailyGroceries",
    "featuredFruit",
    "featuredRiceAndGrains",
    "featuredDesserts",
    "featuredPotatoes",
    "featuredDairy",
    "featuredVegetables",
    "featuredBananas",
  ];
  featuredItems.forEach((span, index) => {
    if (span && featuredKeys[index]) {
      span.textContent = t(featuredKeys[index]);
    }
  });
}

function showResultsView() {
  const homeView = document.getElementById("homeView");
  const resultsView = document.getElementById("resultsView");
  if (homeView) homeView.hidden = true;
  if (resultsView) resultsView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSearchView() {
  const homeView = document.getElementById("homeView");
  const resultsView = document.getElementById("resultsView");
  const results = document.getElementById("results");
  if (homeView) homeView.hidden = false;
  if (resultsView) resultsView.hidden = true;
  if (results) results.innerHTML = "";
  currentResultsData = null;
  setStatus("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getFilters() {
  const minPriceValue = document.getElementById("minPrice")?.value;
  const maxPriceValue = document.getElementById("maxPrice")?.value;
  const itemLimitValue = document.getElementById("itemLimit")?.value;
  return {
    market: document.getElementById("marketFilter")?.value || "",
    sort: document.getElementById("sortFilter")?.value || "",
    minPrice: minPriceValue === "" ? null : Number(minPriceValue),
    maxPrice: maxPriceValue === "" ? null : Number(maxPriceValue),
    itemLimit: itemLimitValue === "" ? null : Number.parseInt(itemLimitValue, 10)
  };
}

function applyFilters(items, filters) {
  if (!filters || !Array.isArray(items)) return items;
  
  let filtered = [...items];
  
  // Filter by market
  if (filters.market) {
    filtered = filtered.filter(item => 
      (item.market || "").toLowerCase() === filters.market.toLowerCase()
    );
  }
  
  // Filter by price range
  if (Number.isFinite(filters.minPrice)) {
    filtered = filtered.filter(item => Number(item.price) >= filters.minPrice);
  }
  if (Number.isFinite(filters.maxPrice)) {
    filtered = filtered.filter(item => Number(item.price) <= filters.maxPrice);
  }
  
  // Sort by price
  if (filters.sort === "asc") {
    filtered = filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (filters.sort === "desc") {
    filtered = filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
  }
  
  // Limit number of items
  if (Number.isInteger(filters.itemLimit) && filters.itemLimit > 0) {
    filtered = filtered.slice(0, filters.itemLimit);
  }
  
  return filtered;
}

function normalizeMarketKey(value) {
  return String(value || "unknown").trim().toLowerCase();
}

function marketLabelForKey(marketKey) {
  const knownMarket = MARKETS.find((market) => market.key === marketKey);
  return knownMarket ? tMarket(knownMarket.key) : marketKey;
}

function getAllResultItems(data) {
  const allItems = [];
  for (const key in data || {}) {
    if (key === "_errors") continue;
    if (Array.isArray(data[key])) {
      allItems.push(...data[key]);
    }
  }
  return allItems;
}

function getMarketOptions(items) {
  const keys = new Set(MARKETS.map((market) => market.key));
  for (const item of items) {
    keys.add(normalizeMarketKey(item.market));
  }
  return [...keys].sort((a, b) => marketLabelForKey(a).localeCompare(marketLabelForKey(b)));
}

function updateMarketOptions(items) {
  const marketFilter = document.getElementById("marketFilter");
  if (!marketFilter) return;
  const selected = marketFilter.value;
  const marketKeys = getMarketOptions(items);
  marketFilter.innerHTML = `<option value="">${escapeHtml(t("filterAllMarkets"))}</option>`;
  for (const marketKey of marketKeys) {
    marketFilter.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(marketKey)}">${escapeHtml(marketLabelForKey(marketKey))}</option>`,
    );
  }
  marketFilter.value = marketKeys.includes(selected) ? selected : "";
}

function renderItemCard(item) {
  const imageHtml = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="item-image" onerror="this.style.display='none'">`
    : "";
  const brandHtml = item.brand
    ? `<div class="item-brand">${escapeHtml(item.brand)}</div>`
    : "";
  return `<article class="item-card">
    ${imageHtml}
    ${brandHtml}
    <div class="item-name">${escapeHtml(item.name)}</div>
    <div class="item-price">${formatPrice(item.price)}</div>
    ${item.unitPrice ? `<div class="item-unit">${escapeHtml(item.unitPrice)}</div>` : ""}
  </article>`;
}

// ── Cart helpers ──────────────────────────────────────────────
function getCart() {
  return JSON.parse(localStorage.getItem("cart") || "[]");
}
function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}
function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((sum, i) => sum + (i.qty || 1), 0);
  const el = document.getElementById("cartCount");
  if (el) el.textContent = total;
}

window.addToCart = function(item) {
  const cart = getCart();
  const existing = cart.find(
    c => c.name === item.name && c.market === item.market
  );
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }
  saveCart(cart);
  updateCartCount();
  // Brief visual feedback
  const btn = event && event.target;
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = t("addedToCart");
    btn.style.background = "#16a34a";
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = "#2563eb";
    }, 900);
  }
};

// ── Navbar auth helpers ───────────────────────────────────────
function updateNavbar() {
  const navUser = document.getElementById("navUser");
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navLogoutBtn = document.getElementById("navLogoutBtn");
  const navProfileBtn = document.getElementById("navProfileBtn");
  if (navUser) navUser.textContent = "";
  if (navLoginBtn) navLoginBtn.style.display = "none";
  if (navLogoutBtn) navLogoutBtn.style.display = "none";
  if (navProfileBtn) navProfileBtn.style.display = "none";
}

window.doLogout = function() {
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_uid");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_phone");
  localStorage.removeItem("user_address");
  localStorage.removeItem("user_photo");
  updateNavbar();
};

function renderResults(data) {
  const root = document.getElementById("results");
  if (!root) return;
  
  const errors =
    data && typeof data._errors === "object" && data._errors ? data._errors : {};

  const allItems = getAllResultItems(data);
  updateMarketOptions(allItems);
  const filters = getFilters();

  const groupedItems = {};
  allItems.forEach(item => {
    const market = normalizeMarketKey(item.market);
    if (!groupedItems[market]) {
      groupedItems[market] = [];
    }
    groupedItems[market].push(item);
  });

  let html = "";
  
  if (filters.market) {
    const marketKey = normalizeMarketKey(filters.market);
    const items = applyFilters(groupedItems[marketKey] || [], filters);
    html += `<section class="panel"><h3>${escapeHtml(marketLabelForKey(marketKey))} <span class="market-count">${items.length}</span></h3>`;
    if (!items.length) {
      const errorText = escapeHtml(errors[marketKey] || "");
      html += `<p>${t("noResults")}${errorText ? ` (${errorText})` : ""}</p></section>`;
    } else {
      html += `<div class="result-grid">${items.map(renderItemCard).join("")}</div></section>`;
    }
  } else {
    const marketKeys = [...new Set([
      ...MARKETS.map((market) => market.key),
      ...Object.keys(groupedItems),
    ])].sort((a, b) =>
      marketLabelForKey(a).localeCompare(marketLabelForKey(b)),
    );

    for (const marketKey of marketKeys) {
      const items = applyFilters(groupedItems[marketKey] || [], filters);
      html += `<section class="panel"><h3>${escapeHtml(marketLabelForKey(marketKey))} <span class="market-count">${items.length}</span></h3>`;
      if (!items.length) {
        const errorText = escapeHtml(errors[marketKey] || "");
        html += `<p>${t("noResults")}${errorText ? ` (${errorText})` : ""}</p></section>`;
      } else {
        html += `<div class="result-grid">${items.map(renderItemCard).join("")}</div></section>`;
      }
    }
  }

  if (!html) {
    html = `<section class="panel"><p>${t("noResults")}</p></section>`;
  }
  root.innerHTML = html;
}

async function runSearch() {
  const input = document.getElementById("searchInput");
  let query = String(input?.value || "").trim();
  if (!query) {
    setStatus(t("statusWriteProduct"), true);
    return;
  }

  // Translate product name from English to Turkish if needed
  query = translateProductToTurkish(query);

  setStatus(t("statusSearching"));
  const results = document.getElementById("results");
  if (results) results.innerHTML = "";

  try {
    const response = await fetch(`${SCRAPER_API_BASE}/search-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: query }),
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    currentResultsData = data;
    renderResults(data);
    setStatus(t("statusDone"));
    showResultsView();
  } catch (error) {
    setStatus(`${t("statusError")}: ${error.message}`, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  updateNavbar();
  updateCartCount();
  currentLang = localStorage.getItem("app_lang") || "tr";
  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener("change", (event) => {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
      if (currentResultsData) renderResults(currentResultsData);
    });
  }
  applyLanguage();
  const button = document.getElementById("searchBtn");
  const input = document.getElementById("searchInput");
  const backToSearchBtn = document.getElementById("backToSearchBtn");
  if (button) button.addEventListener("click", runSearch);
  if (backToSearchBtn) backToSearchBtn.addEventListener("click", showSearchView);
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
    });
  }
  for (const filterId of ["marketFilter", "sortFilter", "minPrice", "maxPrice", "itemLimit"]) {
    const filter = document.getElementById(filterId);
    if (!filter) continue;
    filter.addEventListener("input", () => {
      if (currentResultsData) renderResults(currentResultsData);
    });
    filter.addEventListener("change", () => {
      if (currentResultsData) renderResults(currentResultsData);
    });
  }

  const contactToggle = document.getElementById("contactToggle");
  const contactFormWrap = document.getElementById("contactFormWrap");
  const contactClose = document.getElementById("contactClose");
  if (contactToggle && contactFormWrap) {
    contactToggle.addEventListener("click", () => {
      const shouldOpen = contactFormWrap.hidden;
      contactFormWrap.hidden = !shouldOpen;
      if (shouldOpen) document.getElementById("contactTitleInput")?.focus();
    });
  }
  if (contactClose && contactFormWrap) {
    contactClose.addEventListener("click", () => {
      contactFormWrap.hidden = true;
    });
  }
});
