let SCRAPER_API_BASE = "";
let currentLang = "tr";

const MARKETS = [
  { key: "bim", label: "BIM" },
  { key: "fille", label: "Fille" },
  { key: "sok", label: "Sok" },
  { key: "migros", label: "Migros" },
  { key: "metro", label: "Metro" },
  { key: "tahtakale", label: "Tahtakale" },
  { key: "carrefour", label: "Carrefour" },
];

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
  },
  ar: {
    title: "بحث منتجات المتاجر",
    subtitle: "لا توجد عناصر محفوظة. اكتب اسم المنتج فقط وابحث.",
    placeholder: "اكتب اسم المنتج...",
    search: "بحث",
    statusSearching: "جاري البحث...",
    statusDone: "اكتمل البحث.",
    statusWriteProduct: "يرجى كتابة اسم المنتج.",
    statusError: "خطأ",
    noResults: "لا توجد نتائج.",
  },
};

function t(key) {
  return I18N[currentLang]?.[key] || I18N.tr[key] || key;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} TL`;
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
  if (title) title.textContent = t("title");
  if (subtitle) subtitle.textContent = t("subtitle");
  if (input) input.placeholder = t("placeholder");
  if (button) button.textContent = t("search");
}

function renderResults(data) {
  const root = document.getElementById("results");
  if (!root) return;
  const errors =
    data && typeof data._errors === "object" && data._errors ? data._errors : {};

  let html = "";
  for (const market of MARKETS) {
    const items = Array.isArray(data?.[market.key]) ? data[market.key] : [];
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
      html += `<article class="item-card">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-price">${formatPrice(item.price)}</div>
      </article>`;
    }
    html += `</div></section>`;
  }
  root.innerHTML = html;
}

async function runSearch() {
  const input = document.getElementById("searchInput");
  const query = String(input?.value || "").trim();
  if (!query) {
    setStatus(t("statusWriteProduct"), true);
    return;
  }

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
