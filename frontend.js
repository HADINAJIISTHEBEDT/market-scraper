let SCRAPER_API_BASE = "";

const MARKETS = [
  { key: "bim", label: "BIM" },
  { key: "sok", label: "Sok" },
  { key: "migros", label: "Migros" },
  { key: "file", label: "File" },
  { key: "metro", label: "Metro" },
  { key: "tahtakale", label: "Tahtakale" },
  { key: "carrefour", label: "Carrefour" },
];

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

function renderResults(data) {
  const root = document.getElementById("results");
  if (!root) return;

  let html = "";
  for (const market of MARKETS) {
    const items = Array.isArray(data?.[market.key]) ? data[market.key] : [];
    html += `<section class="panel"><h3>${market.label}</h3>`;
    if (!items.length) {
      html += `<p>Sonuç bulunamadı.</p></section>`;
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
    setStatus("Lütfen ürün adı yazın.", true);
    return;
  }

  setStatus("Aranıyor...");
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
    setStatus("Arama tamamlandı.");
  } catch (error) {
    setStatus(`Hata: ${error.message}`, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = "tr";
  const button = document.getElementById("searchBtn");
  const input = document.getElementById("searchInput");
  if (button) button.addEventListener("click", runSearch);
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
    });
  }
});
