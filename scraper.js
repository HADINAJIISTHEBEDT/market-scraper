const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 20000);
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 7);
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const MARKET_ORDER = [
  "bim",
  "fille", 
  "sok",
  "migros",
  "metro",
  "tahtakale",
  "carrefour",
];

const MARKET_LABELS = {
  bim: "Bim",
  fille: "Fille",
  sok: "Sok",
  migros: "Migros",
  metro: "Metro",
  tahtakale: "Tahtakale",
  carrefour: "Carrefour",
};

// Direct market sources - no comparison sites
const MARKET_SOURCES = {
  sok: "https://www.sokmarket.com.tr/arama?q=",
  migros: "https://www.migros.com.tr/arama?q=",
  carrefour: "https://www.carrefoursa.com/arama?q=",
  // These markets will use direct search or category pages
  bim: "https://www.bim.com.tr/Arama?q=",
  fille: "https://www.file.com.tr/Arama?q=",
  metro: "https://www.metro.com.tr/Arama?q=",
  tahtakale: "https://www.tahtakalespot.com/Arama?q=",
};

function logScrape(stage, message) {
  console.log(`[Scraper][${stage}] ${message}`);
}

async function withTimeout(label, promise, timeoutMs = SEARCH_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateTurkish(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[\u0300-\u036f]/g, "");
}

function improveSearchQuery(query) {
  return normalizeText(String(query || ""))
    .toLowerCase()
    .replace(/\bmilk\b/g, "süt")
    .replace(/\bcheese\b/g, "peynir")
    .replace(/\byogurt\b/g, "yoğurt")
    .replace(/\bsut\b/g, "süt")
    .replace(/\bkasar\b/g, "kaşar")
    .replace(/\bcilek\b/g, "çilek")
    .replace(/\bbread\b/g, "ekmek")
    .replace(/\bwater\b/g, "su")
    .replace(/\begg\b/g, "yumurta")
    .replace(/\b oil\b/g, "yağ")
    .replace(/\bsugar\b/g, "şeker")
    .replace(/\bsalt\b/g, "tuz");
}

function queryVariants(query) {
  const base = improveSearchQuery(query);
  const variants = new Set([base, transliterateTurkish(base)]);
  
  // Add common Turkish variations
  if (base.includes("süt")) {
    variants.add(base.replaceAll("süt", "sut"));
    variants.add(`${base} içme`);
    variants.add(`${base} ayran`);
  }
  if (base.includes("yoğurt")) {
    variants.add(base.replaceAll("yoğurt", "yogurt"));
    variants.add(`${base} meyve`);
  }
  if (base.includes("çilek")) {
    variants.add(base.replaceAll("çilek", "cilek"));
    variants.add(`${base} taze`);
  }
  if (base.includes("kaşar")) {
    variants.add(base.replaceAll("kaşar", "kasar"));
    variants.add(`${base} taze`);
    variants.add(`${base} eski`);
  }
  if (base.includes("ekmek")) {
    variants.add(`${base} beyaz`);
    variants.add(`${base} tam buğday`);
  }
  
  return [...variants].map(normalizeText).filter(Boolean);
}

function parsePriceValue(text) {
  const str = String(text || "");
  const match =
    str.match(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})\s*(?:₺|TL)/i) ||
    str.match(/(?:₺|TL)\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})/i) ||
    str.match(/([\d]+[.,]\d{2})/);
  if (!match) return null;
  const parsed = Number.parseFloat(
    String(match[1]).replace(/\./g, "").replace(",", "."),
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isGroceryProduct(name, price) {
  const normalizedName = transliterateTurkish(name).toLowerCase();
  
  // Exclude non-grocery items
  const excludePatterns = [
    'bileti', 'bilet', 'kart', 'fiyat listesi', 'tarifesi', 'ücret',
    'giysi', 'kıyafet', 'ayakkabı', 'çanta', 'aksesuar', 'elektronik',
    'telefon', 'bilgisayar', 'hakkında', 'hakkında bilgi', 'ürünlerimiz',
    'mağazacılık', 'perakende', 'şirket', 'kurumsal', 'hizmet', 'destek',
    'anonim kart', 'öğrenci kartı', 'istanbulkart', 'otobüs bileti',
    'metro turizm', 'ürün çeşitliliği', 'markalı ürünler', 'toptancı market',
    'katalog', 'broşür', 'indirim', 'kampanya', 'fırsat', 'aktüel',
    'anasayfa', 'www', 'com', 'net', 'tr', 'https', 'http', 'site', 'web'
  ];
  
  // Check if any exclude pattern matches
  for (const pattern of excludePatterns) {
    if (normalizedName.includes(pattern)) return false;
  }
  
  // Price validation - must be reasonable for grocery
  if (!price || price <= 0 || price > 1000) return false;
  
  // Must contain some grocery-related keywords or be a reasonable product name
  const groceryKeywords = [
    'süt', 'sut', 'milk', 'peynir', 'cheese', 'yoğurt', 'yogurt', 'ekmek', 'bread',
    'su', 'water', 'yumurta', 'egg', 'yağ', 'oil', 'şeker', 'sugar', 'tuz', 'salt',
    'çilek', 'cilek', 'strawberry', 'muz', 'banana', 'elma', 'apple', 'portakal',
    'domates', 'salatalık', 'soğan', 'sarısak', 'patates', 'havuç', 'pirinç',
    'makarna', 'pasta', 'un', 'flour', 'zeytin', 'olive', 'bal', 'honey',
    'rek', 'çay', 'kahve', 'coffee', 'meyve', 'sebze', 'et', 'tavuk', 'balık'
  ];
  
  // Check if it contains grocery keywords or has a reasonable length
  const hasGroceryKeyword = groceryKeywords.some(keyword => normalizedName.includes(keyword));
  const reasonableLength = normalizedName.length >= 3 && normalizedName.length <= 100;
  
  return hasGroceryKeyword || reasonableLength;
}

function dedupeItems(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const name = normalizeText(item?.name);
    const price = Number(item?.price);
    const image = normalizeText(item?.image);
    const market = normalizeText(item?.market);
    
    if (!name || !Number.isFinite(price) || price <= 0 || price > 50000) continue;
    if (!isGroceryProduct(name, price)) continue;
    
    const key = `${name.toLowerCase()}|${price.toFixed(2)}`;
    if (!map.has(key)) {
      map.set(key, { market, name, price, image });
    }
  }
  return [...map.values()];
}

function rankItemsForQuery(query, items, limit = MARKET_RESULT_LIMIT) {
  const deduped = dedupeItems(items);
  
  // Simple relevance scoring
  const scored = deduped
    .map((item) => {
      const queryTokens = transliterateTurkish(query).toLowerCase().split(/\s+/);
      const itemTokens = transliterateTurkish(item.name).toLowerCase().split(/\s+/);
      
      let score = 0;
      for (const queryToken of queryTokens) {
        for (const itemToken of itemTokens) {
          if (itemToken.includes(queryToken) || queryToken.includes(itemToken)) {
            score += queryToken === itemToken ? 3 : 1;
          }
        }
      }
      
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, limit)
    .map(({ item }) => item);
    
  if (scored.length) return scored;
  
  // Fallback: return cheapest items
  return deduped
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

async function fetchText(url, timeoutMs = SEARCH_TIMEOUT_MS, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": CHROME_USER_AGENT,
        Accept: "text/html,application/json,text/plain,*/*",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaJinaReader(url, timeoutMs = JINA_TIMEOUT_MS) {
  return await fetchText(`https://r.jina.ai/${url}`, timeoutMs, {
    Accept: "text/plain",
  });
}

// ---- SOK PARSER ----
function parseSokProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in the same line
      const priceMatch = line.match(/([\d]+[.,]\d+)\s*(?:₺|TL|TL)/i);
      if (priceMatch) {
        price = Number.parseFloat(priceMatch[1].replace(",", "."));
      }
      
      // Look for price in nearby lines
      if (!price) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nearbyPrice = parsePriceValue(lines[j]);
          if (nearbyPrice) {
            price = nearbyPrice;
            break;
          }
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.sok,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeSok(query) {
  logScrape("Sok", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Sok Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.sok}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseSokProducts(text));
    } catch (error) {
      logScrape("Sok", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- MIGROS PARSER ----
function parseMigrosProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.migros,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeMigros(query) {
  logScrape("Migros", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Migros Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.migros}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseMigrosProducts(text));
    } catch (error) {
      logScrape("Migros", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- CARREFOUR PARSER ----
function parseCarrefourProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.carrefour,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeCarrefour(query) {
  logScrape("Carrefour", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Carrefour Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.carrefour}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseCarrefourProducts(text));
    } catch (error) {
      logScrape("Carrefour", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- BIM PARSER ----
function parseBimProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.bim,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeBim(query) {
  logScrape("Bim", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Bim Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.bim}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseBimProducts(text));
    } catch (error) {
      logScrape("Bim", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- FILLE PARSER ----
function parseFilleProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.fille,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeFille(query) {
  logScrape("Fille", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Fille Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.fille}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseFilleProducts(text));
    } catch (error) {
      logScrape("Fille", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- METRO PARSER ----
function parseMetroProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.metro,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeMetro(query) {
  logScrape("Metro", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Metro Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.metro}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseMetroProducts(text));
    } catch (error) {
      logScrape("Metro", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- TAHTAKALE PARSER ----
function parseTahtakaleProducts(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for product patterns
    const productMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                         line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    
    if (productMatch) {
      let name = normalizeText(productMatch[1]);
      let image = normalizeText(productMatch[2]);
      let price = null;
      
      // Look for price in nearby lines
      for (let j = i - 2; j < Math.min(i + 8, lines.length); j++) {
        if (j < 0) continue;
        const nearbyPrice = parsePriceValue(lines[j]);
        if (nearbyPrice) {
          price = nearbyPrice;
          break;
        }
      }
      
      if (price && isGroceryProduct(name, price)) {
        items.push({
          market: MARKET_LABELS.tahtakale,
          name,
          price,
          image,
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeTahtakale(query) {
  logScrape("Tahtakale", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];
  
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Tahtakale Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.tahtakale}${encodeURIComponent(variant)}`),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseTahtakaleProducts(text));
    } catch (error) {
      logScrape("Tahtakale", `Error for "${variant}": ${error.message}`);
    }
  }
  
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// Market handlers
const MARKET_HANDLERS = {
  bim: scrapeBim,
  fille: scrapeFille,
  sok: scrapeSok,
  migros: scrapeMigros,
  metro: scrapeMetro,
  tahtakale: scrapeTahtakale,
  carrefour: scrapeCarrefour,
};

async function searchProduct(product, market) {
  const normalizedMarket = String(market || "")
    .trim()
    .toLowerCase();
  const handler = MARKET_HANDLERS[normalizedMarket];
  if (!handler) return [];
  return await withTimeout(
    `searchProduct ${normalizedMarket}:${product}`,
    handler(product),
    SEARCH_TIMEOUT_MS,
  );
}

async function searchMultiple(product) {
  const entries = [];
  const errors = {};
  
  for (const market of MARKET_ORDER) {
    let items = await searchProduct(product, market).catch((error) => {
      const message = String(error?.message || "unknown error");
      logScrape(MARKET_LABELS[market], message);
      errors[market] = message;
      return [];
    });
    
    entries.push([market, Array.isArray(items) ? items : []]);
    if (!errors[market] && (!Array.isArray(items) || items.length === 0)) {
      errors[market] = "No matched products from source";
    }
  }
  
  const payload = Object.fromEntries(entries);
  payload._errors = errors;
  return payload;
}

// Legacy functions for compatibility
async function compareIngredients(ingredients) {
  // Simplified version - just search for each ingredient
  const results = {};
  for (const ingredient of Array.isArray(ingredients) ? ingredients : []) {
    const name = normalizeText(ingredient?.name);
    if (name) {
      results[name] = await searchMultiple(name);
    }
  }
  return results;
}

module.exports = {
  compareIngredients,
  searchProduct,
  searchMultiple,
};
