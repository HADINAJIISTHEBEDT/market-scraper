"use strict";

let SCRAPER_API_BASE = "";
let currentLang = "tr";

const MARKETS = [
  { key: "bim", label: "BIM" },
  { key: "a101", label: "A101" },
  { key: "fille", label: "Fille" },
  { key: "sok", label: "SOK" },
  { key: "migros", label: "Migros" },
  { key: "metro", label: "Metro" },
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
    title: "Market Urun Arama",
    subtitle: "Kayitli urun yok. Sadece urun adini yazip ara.",
    placeholder: "Urun adi yazin...",
    search: "Ara",
    statusSearching: "Araniyor...",
    statusDone: "Arama tamamlandi.",
    statusWriteProduct: "Lutfen urun adi yazin.",
    statusError: "Hata",
    noResults: "Sonuc bulunamadi.",
    filterAllMarkets: "Tum Marketler",
    filterSort: "Sirala",
    filterSortAsc: "Fiyat: Dusuk > Yuksek",
    filterSortDesc: "Fiyat: Yuksek > Dusuk",
    filterMinPrice: "Min fiyat",
    filterMaxPrice: "Max fiyat",
    filterItemLimit: "Urun adedi",
  },
  en: {
    title: "Market Product Search",
    subtitle: "No saved items. Just type a product and search.",
    placeholder: "Type product name...",
    search: "Search",
    statusSearching: "Searching...",
    statusDone: "Search completed.",
    statusWriteProduct: "Please enter a product name.",
    statusError: "Error",
    noResults: "No results found.",
    filterAllMarkets: "All Markets",
    filterSort: "Sort",
    filterSortAsc: "Price: Low > High",
    filterSortDesc: "Price: High > Low",
    filterMinPrice: "Min price",
    filterMaxPrice: "Max price",
    filterItemLimit: "Item limit",
  },
  ar: {
    title: "بحث منتجات السوق",
    subtitle: "لا توجد عناصر محفوظة. فقط اكتب منتج وابحث.",
    placeholder: "اكتب اسم المنتج...",
    search: "ابحث",
    statusSearching: "جار البحث...",
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
  },
};

function t(key) {
  return I18N[currentLang] && I18N[currentLang][key]
    ? I18N[currentLang][key]
    : I18N.tr[key]
    || key;
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
  if (subtitle) subtitle.textContent = t("subtitle");
  if (input) input.placeholder = t("placeholder");
  if (button) button.textContent = t("search");
  
  // Update filter options
  if (marketFilter) {
    marketFilter.options[0].textContent = t("filterAllMarkets");
  }
  if (sortFilter) {
    sortFilter.options[0].textContent = t("filterSort");
    if (sortFilter.options[1]) sortFilter.options[1].textContent = t("filterSortAsc");
    if (sortFilter.options[2]) sortFilter.options[2].textContent = t("filterSortDesc");
  }
  if (minPrice) minPrice.placeholder = t("filterMinPrice");
  if (maxPrice) maxPrice.placeholder = t("filterMaxPrice");
  if (itemLimit) itemLimit.placeholder = t("filterItemLimit");
}

function getFilters() {
  return {
    market: document.getElementById("marketFilter")?.value || "",
    sort: document.getElementById("sortFilter")?.value || "",
    minPrice: parseFloat(document.getElementById("minPrice")?.value) || null,
    maxPrice: parseFloat(document.getElementById("maxPrice")?.value) || null,
    itemLimit: parseInt(document.getElementById("itemLimit")?.value) || null
  };
}

function applyFilters(items, filters) {
  if (!filters || !Array.isArray(items)) return items;
  
  let filtered = items;
  
  // Filter by market
  if (filters.market) {
    filtered = filtered.filter(item => 
      (item.market || "").toLowerCase() === filters.market.toLowerCase()
    );
  }
  
  // Filter by price range
  if (filters.minPrice !== null) {
    filtered = filtered.filter(item => item.price >= filters.minPrice);
  }
  if (filters.maxPrice !== null) {
    filtered = filtered.filter(item => item.price <= filters.maxPrice);
  }
  
  // Sort by price
  if (filters.sort === "asc") {
    filtered = filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (filters.sort === "desc") {
    filtered = filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
  }
  
  // Limit number of items
  if (filters.itemLimit !== null && filters.itemLimit > 0) {
    filtered = filtered.slice(0, filters.itemLimit);
  }
  
  return filtered;
}

function renderResults(data) {
  const root = document.getElementById("results");
  if (!root) return;
  
  const filters = getFilters();
  const errors =
    data && typeof data._errors === "object" && data._errors ? data._errors : {};

  // Get all items from all markets
  const allItems = [];
  for (const key in data) {
    if (key === '_errors') continue;
    if (Array.isArray(data[key])) {
      allItems.push(...data[key]);
    }
  }

  // Group items by market
  const groupedItems = {};
  allItems.forEach(item => {
    const market = item.market || "unknown";
    if (!groupedItems[market]) {
      groupedItems[market] = [];
    }
    groupedItems[market].push(item);
  });

  let html = "";
  
  // If a specific market is filtered, only show that market
  if (filters.market) {
    const marketKey = filters.market;
    const marketObj = MARKETS.find(m => m.key === marketKey);
    if (marketObj) {
      let items = groupedItems[marketKey] || [];
      
      // Apply filters to items
      items = applyFilters(items, filters);
      
      html += `<section class="panel"><h3>${marketObj.label}</h3>`;
      if (!items.length) {
        const errorText = escapeHtml(errors[marketKey] || "");
        if (errorText) {
          html += `<p>${t("noResults")} (${errorText})</p></section>`;
        } else {
          html += `<p>${t("noResults")}</p></section>`;
        }
      } else {
        html += `<div class="result-grid">`;
        for (const item of items) {
          const imageHtml = item.image ? 
            `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="item-image" onerror="this.style.display='none'">` : 
            '';
          html += `<article class="item-card">
            ${imageHtml}
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-price">${formatPrice(item.price)}</div>
            ${item.unitPrice ? `<div class="item-unit">${escapeHtml(item.unitPrice)}</div>` : ''}
          </article>`;
        }
        html += `</div></section>`;
      }
    }
  } else {
    // Show all markets
    for (const market of MARKETS) {
      let items = groupedItems[market.key] || [];
      
      // Apply filters to items
      items = applyFilters(items, filters);
      
      html += `<section class="panel"><h3>${market.label}</h3>`;
      if (!items.length) {
        const errorText = escapeHtml(errors[market.key] || "");
        if (errorText) {
          html += `<p>${t("noResults")} (${errorText})</p></section>`;
        } else {
          html += `<p>${t("noResults")}</p></section>`;
        }
        continue;
      }
      html += `<div class="result-grid">`;
      for (const item of items) {
        const imageHtml = item.image ? 
          `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="item-image" onerror="this.style.display='none'">` : 
          '';
        html += `<article class="item-card">
          ${imageHtml}
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-price">${formatPrice(item.price)}</div>
          ${item.unitPrice ? `<div class="item-unit">${escapeHtml(item.unitPrice)}</div>` : ''}
        </article>`;
      }
      html += `</div></section>`;
    }
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
    renderResults(data);
    setStatus(t("statusDone"));
  } catch (error) {
    setStatus(`${t("statusError")}: ${error.message}`, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  currentLang = localStorage.getItem("app_lang") || "tr";
  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener("change", (event) => {
      currentLang = String(event.target.value || "tr");
      localStorage.setItem("app_lang", currentLang);
      applyLanguage();
    });
  }
  applyLanguage();
  const button = document.getElementById("searchBtn");
  const input = document.getElementById("searchInput");
  if (button) button.addEventListener("click", runSearch);
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
    });
  }
});