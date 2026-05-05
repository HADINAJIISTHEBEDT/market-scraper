const SEARCH_TIMEOUT_S = Number(
  process.env.SEARCH_TIMEOUT_S ??
    (process.env.SEARCH_TIMEOUT_MS
      ? Number(process.env.SEARCH_TIMEOUT_MS) / 1000
      : 30),
);
const SEARCH_TIMEOUT_MS = Math.round(SEARCH_TIMEOUT_S * 1000);

const JINA_TIMEOUT_S = Number(
  process.env.JINA_TIMEOUT_S ??
    (process.env.JINA_TIMEOUT_MS
      ? Number(process.env.JINA_TIMEOUT_MS) / 1000
      : 15),
);
const JINA_TIMEOUT_MS = Math.round(JINA_TIMEOUT_S * 1000);
// Remove limit to get all items - set to a high number
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 500);

// Import MarketFiyati scraper
let scrapeMarketFiyati = null;
try {
  const marketFiyatiModule = require('./scraper_marketfiyati');
  scrapeMarketFiyati = marketFiyatiModule.scrapeMarketFiyati;
} catch (error) {
  console.log('[Scraper] MarketFiyati module not available:', error.message);
}

// Dependencies for direct web scraping (Sok)
const axios = require('axios');
const cheerio = require('cheerio');

const TAHTAKALE_CATEGORY_URLS = [
  "https://www.tahtakalespot.com/uzun-omurlu-sutler-1175",
  "https://www.tahtakalespot.com/gunluk-sutler-1176",
  "https://www.tahtakalespot.com/organik-sut-1177",
  "https://www.tahtakalespot.com/ozellikli-aromali-sut-1178",
  "https://www.tahtakalespot.com/peynirler-1036",
  "https://www.tahtakalespot.com/yogurtlar-1037",
  "https://www.tahtakalespot.com/yumurta-1039",
  "https://www.tahtakalespot.com/kahvaltiliklar-1041",
  "https://www.tahtakalespot.com/ayran-kefirler-1042",
  "https://www.tahtakalespot.com/meyve-sebze-1004",
  "https://www.tahtakalespot.com/temel-gida-1008",
  "https://www.tahtakalespot.com/atistirmalik-1010",
];

const TAHTAKALE_QUERY_HINTS = [
  {
    tokens: ["sut", "milk", "organik", "organic"],
    urls: [
      "https://www.tahtakalespot.com/uzun-omurlu-sutler-1175",
      "https://www.tahtakalespot.com/gunluk-sutler-1176",
      "https://www.tahtakalespot.com/organik-sut-1177",
      "https://www.tahtakalespot.com/ozellikli-aromali-sut-1178",
    ],
  },
  {
    tokens: ["peynir", "cheese", "kasar"],
    urls: ["https://www.tahtakalespot.com/peynirler-1036"],
  },
  {
    tokens: ["yogurt", "kefir", "ayran"],
    urls: [
      "https://www.tahtakalespot.com/yogurtlar-1037",
      "https://www.tahtakalespot.com/ayran-kefirler-1042",
    ],
  },
  {
    tokens: ["yumurta", "egg"],
    urls: ["https://www.tahtakalespot.com/yumurta-1039"],
  },
  {
    tokens: ["domates", "salatalik", "meyve", "sebze", "elma", "muz"],
    urls: ["https://www.tahtakalespot.com/meyve-sebze-1004"],
  },
];

const TAHTAKALE_DEFAULT_URLS = [
  "https://www.tahtakalespot.com/uzun-omurlu-sutler-1175",
  "https://www.tahtakalespot.com/gunluk-sutler-1176",
  "https://www.tahtakalespot.com/organik-sut-1177",
  "https://www.tahtakalespot.com/peynirler-1036",
  "https://www.tahtakalespot.com/yogurtlar-1037",
  "https://www.tahtakalespot.com/meyve-sebze-1004",
];

const MARKET_ORDER = ["marketfiyati", "tahtakale", "sok"];

const MARKET_LABELS = {
  marketfiyati: "Market Fiyat─▒",
  sok: "Sok",
};

MARKET_LABELS.tahtakale = "Tahtakale";

const TERM_ALIASES = {
  milk: ["sut", "süt"],
  sut: ["sut", "süt"],
  süt: ["sut", "süt"],
  organic: ["organic", "organik"],
  organik: ["organic", "organik"],
  icim: ["icim", "içim"],
  içim: ["icim", "içim"],
};

const BROAD_PRODUCT_TERMS = new Set([
  "sut",
  "süt",
  "milk",
  "yogurt",
  "yoğurt",
  "peynir",
  "cheese",
  "ekmek",
  "bread",
  "yumurta",
  "egg",
  "cay",
  "çay",
  "tea",
  "kahve",
  "coffee",
  "su",
  "water",
]);

function logScrape(stage, message) {
  console.log(`[Scraper][${stage}] ${message}`);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function expandToken(token) {
  const normalized = normalizeSearchText(token);
  const aliases = TERM_ALIASES[token] || TERM_ALIASES[normalized] || [token];
  return uniqueValues([token, normalized, ...aliases, ...aliases.map(normalizeSearchText)]);
}

function expandQueryTerms(query) {
  return String(query || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(expandToken);
}

function buildSearchQueries(query) {
  const rawTokens = String(query || "").split(/\s+/).filter(Boolean);
  const expandedTerms = expandQueryTerms(query);
  const normalizedFull = expandedTerms.map((terms) => terms[0]).join(" ");
  const turkishFull = expandedTerms.map((terms) => terms[terms.length - 1]).join(" ");
  const broadTerms = expandedTerms
    .flat()
    .map(normalizeSearchText)
    .filter((term) => BROAD_PRODUCT_TERMS.has(term));

  return uniqueValues([
    query,
    normalizedFull,
    turkishFull,
    ...broadTerms,
    rawTokens.length > 2 ? rawTokens.slice(0, 2).join(" ") : "",
    rawTokens.length > 2 ? rawTokens.slice(1).join(" ") : "",
  ]).slice(0, 5);
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}

function termMatchesSearchText(termAliases, searchableTokens, searchableText) {
  return termAliases.some((alias) => {
    const normalizedAlias = normalizeSearchText(alias);
    if (!normalizedAlias) return false;
    if (searchableText.includes(normalizedAlias)) return true;
    return searchableTokens.some((token) => {
      if (token.includes(normalizedAlias) || normalizedAlias.includes(token)) return true;
      return normalizedAlias.length >= 4 && levenshteinDistance(token, normalizedAlias) <= 1;
    });
  });
}

function scoreItemForQuery(query, item) {
  const expandedTerms = expandQueryTerms(query).filter((terms) => terms.length);
  if (!expandedTerms.length) return 1;

  const searchableText = normalizeSearchText(
    `${item?.brand || ""} ${item?.name || ""} ${item?.market || ""}`,
  );
  const searchableTokens = searchableText.split(/\s+/).filter(Boolean);
  let score = 0;
  let matchedTerms = 0;

  for (const termAliases of expandedTerms) {
    if (termMatchesSearchText(termAliases, searchableTokens, searchableText)) {
      matchedTerms += 1;
      score += 10;
    }
  }

  const brandText = normalizeSearchText(item?.brand);
  if (brandText && termMatchesSearchText(expandedTerms.flat(), brandText.split(/\s+/), brandText)) {
    score += 8;
  }
  if (Number.isFinite(Number(item?.price))) score += 1;

  return matchedTerms === expandedTerms.length ? score : 0;
}

function dedupeAndRankItems(query, items) {
  const bestByKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const score = scoreItemForQuery(query, item);
    if (score <= 0) continue;
    const key = [
      normalizeSearchText(item.market),
      normalizeSearchText(item.brand),
      normalizeSearchText(item.name),
      Number(item.price || 0).toFixed(2),
    ].join("|");
    const existing = bestByKey.get(key);
    if (!existing || score > existing._score) {
      bestByKey.set(key, { ...item, _score: score });
    }
  }
  return [...bestByKey.values()]
    .sort((a, b) => b._score - a._score || Number(a.price || Infinity) - Number(b.price || Infinity))
    .map(({ _score, ...item }) => item);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parsePriceValue(text) {
  const str = String(text || "");
  const match =
    str.match(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})\s*(?:TL|₺)/i) ||
    str.match(/(?:TL|₺)\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})/i) ||
    str.match(/([\d]+[.,]\d{2})/);
  if (!match) return null;
  const parsed = Number.parseFloat(
    String(match[1]).replace(/\./g, "").replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupeBasicItems(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const name = normalizeText(item?.name);
    const price = Number(item?.price);
    const image = normalizeText(item?.image);
    if (!name || !Number.isFinite(price) || price <= 0 || price > 50000) continue;
    const key = `${name.toLowerCase()}|${price.toFixed(2)}`;
    if (!map.has(key)) map.set(key, { ...item, name, price, image });
    else if (!map.get(key).image && image) map.set(key, { ...item, name, price, image });
  }
  return [...map.values()];
}

const readerCache = new Map();

async function fetchViaJinaReader(url, timeoutMs = JINA_TIMEOUT_MS) {
  if (readerCache.has(url)) return readerCache.get(url);
  const response = await axios.get(`https://r.jina.ai/${url}`, {
    timeout: timeoutMs,
    headers: {
      Accept: "text/plain",
      "User-Agent": "Mozilla/5.0",
    },
    responseType: "text",
  });
  const text = String(response.data || "");
  readerCache.set(url, text);
  return text;
}

function getTahtakaleCategoryUrls(query) {
  const normalizedQuery = normalizeSearchText(query);
  const matched = new Set();
  for (const hint of TAHTAKALE_QUERY_HINTS) {
    if (hint.tokens.some((token) => normalizedQuery.includes(normalizeSearchText(token)))) {
      for (const url of hint.urls) matched.add(url);
    }
  }
  if (matched.size) return [...matched];
  return [...TAHTAKALE_DEFAULT_URLS];
}

function parseTahtakaleCategoryText(text) {
  const items = [];
  const lines = String(text || "").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    const imageMatch = line.match(/\[!\[Image \d+:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)/i)
      || line.match(/!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);

    if (imageMatch) {
      let name = normalizeText(imageMatch[1]);
      let price = null;
      const image = normalizeText(imageMatch[2]);

      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        price = parsePriceValue(lines[j]);
        if (price !== null) break;
      }

      if (price === null) {
        const priceMatch = line.match(/([\d]+[.,]\d{2})\s*(?:TL|₺)?/i);
        if (priceMatch) price = Number.parseFloat(priceMatch[1].replace(",", "."));
      }

      if (price && price > 0 && price < 100000) {
        items.push({
          market: "tahtakale",
          name,
          price,
          image,
          brand: null,
          unitPrice: null,
        });
      }
    }
  }

  return dedupeBasicItems(items);
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

// ---- MARKETFIYATI HANDLER ----
async function scrapeMarketFiyatiWrapper(query) {
  if (!scrapeMarketFiyati) {
    logScrape("MarketFiyati", "MarketFiyati scraper not available");
    return [];
  }
  logScrape("MarketFiyati", `Starting search for "${query}"`);
  try {
    const products = await scrapeMarketFiyati(query);
    return products;
  } catch (error) {
    logScrape("MarketFiyati", `Error: ${error.message}`);
    return [];
  }
}

// ---- SOK HANDLER ----
// Improved SOK scraper with better selector detection and fallback parsing
async function scrapeSok(query) {
  logScrape("Sok", `Starting search for "${query}"`);
  try {
    const searchUrl = `https://www.sokmarket.com.tr/arama?q=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      timeout: JINA_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    
    const $ = cheerio.load(response.data);
    const products = [];
    
    // Use multiple stable selectors - try class patterns that don't change
    // Look for any div/li/article that contains both image and price
    const allDivs = $('div[class*="wrap"]');
    logScrape("Sok", `Analyzing ${allDivs.length} potential product containers`);
    
    // More robust approach: iterate all elements and find ones with product-like content
    const productCandidates = [];
    
    // Try to find any elements that might be products
    $('div, li, article, section').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      // Must have reasonable text length for a product
      if (text.length < 10 || text.length > 400) return;
      
      // Must have a price-like pattern (number with decimal)
      const hasPrice = /(\d+[.,]\d{2})/.test(text);
      if (!hasPrice) return;
      
      // Must have an image
      const hasImg = $el.find('img').length > 0;
      if (!hasImg) return;
      
      productCandidates.push($el);
    });
    
    logScrape("Sok", `Found ${productCandidates.length} product candidates`);
    
    productCandidates.slice(0, 50).forEach(($element) => {
      const fullText = $element.text().trim();
      
      // Extract first price found (should be the actual price)
      let price = null;
      const priceMatches = fullText.match(/(\d+[.,]\d{2})/g);
      if (priceMatches && priceMatches.length > 0) {
        // Try to find the most likely price (often first large number)
        for (const priceStr of priceMatches) {
          const priceValue = parseFloat(priceStr.replace(',', '.'));
          if (!isNaN(priceValue) && priceValue > 5 && priceValue < 10000) {
            price = priceValue;
            break;
          }
        }
      }
      
      // Extract product name - remove price and clean up
      let name = fullText
        .replace(/(\d+[.,]\d{2})/g, '')
        .replace(/,(?:\s*)?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Clean up common suffix patterns
      name = name.replace(/\s+(tl|₺|tl\.)$/i, '').trim();
      
      // Extract image URL
      let image = null;
      const imgElement = $element.find('img').first();
      if (imgElement.length) {
        image = imgElement.attr('src') || imgElement.attr('data-src') || imgElement.attr('data-lazy') || imgElement.attr('data-original');
        if (image && !image.startsWith('http')) {
          try {
            image = new URL(image, searchUrl).toString();
          } catch (e) {
            // Keep as is
          }
        }
      }
      
      // Extract product URL
      let url = null;
      const linkElement = $element.find('a').first();
      if (linkElement.length && linkElement.attr('href')) {
        const href = linkElement.attr('href');
        if (href.startsWith('http')) {
          url = href;
        } else if (href.startsWith('/')) {
          url = `https://www.sokmarket.com.tr${href}`;
        }
      }
      
      // Only add if we have meaningful product info
      if (name && name.length > 2 && price) {
        products.push({
          name,
          price,
          image: image || null,
          market: 'sok',
          unitPrice: null,
          brand: null,
          url: url || searchUrl
        });
      }
    });
    
    logScrape("Sok", `Extracted ${products.length} products`);
    return products;
  } catch (error) {
    logScrape("Sok", `Error: ${error.message}`);
    return [];
  }
}

async function scrapeTahtakale(query) {
  logScrape("Tahtakale", `Starting search for "${query}"`);
  const categoryUrls = getTahtakaleCategoryUrls(query);
  const items = [];

  for (const url of categoryUrls) {
    try {
      const text = await withTimeout(
        `Tahtakale category fetch: ${url}`,
        fetchViaJinaReader(url),
        JINA_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      const categoryItems = parseTahtakaleCategoryText(text);
      if (categoryItems.length) {
        logScrape("Tahtakale", `Found ${categoryItems.length} items from ${url}`);
        items.push(...categoryItems);
      }
    } catch (error) {
      logScrape("Tahtakale", `Category fetch failed for ${url}: ${error.message}`);
    }
  }

  return dedupeAndRankItems(query, items).slice(0, MARKET_RESULT_LIMIT);
}



// Market handlers
const MARKET_HANDLERS = {
  marketfiyati: scrapeMarketFiyatiWrapper,
  tahtakale: scrapeTahtakale,
  sok: scrapeSok,
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
  const searchQueries = buildSearchQueries(product);
  logScrape("Smart Search", `Using queries: ${searchQueries.join(" | ")}`);
  
  // Search all configured markets
  for (const market of MARKET_ORDER) {
    const allMarketItems = [];
    for (const searchQuery of searchQueries) {
      const items = await searchProduct(searchQuery, market).catch((error) => {
        const message = String(error?.message || "unknown error");
        logScrape(MARKET_LABELS[market], `${searchQuery}: ${message}`);
        errors[market] = message;
        return [];
      });
      if (Array.isArray(items) && items.length) {
        allMarketItems.push(...items);
      }
    }
    const items = dedupeAndRankItems(product, allMarketItems).slice(0, MARKET_RESULT_LIMIT);
    
    entries.push([market, items]);
    if (!errors[market] && items.length === 0) {
      errors[market] = "No matched products from source";
    }
  }
  
  const payload = Object.fromEntries(entries);
  payload._errors = errors;
  return payload;
}

// Legacy functions for compatibility
async function compareIngredients(ingredients) {
  const results = {};
  for (const ingredient of Array.isArray(ingredients) ? ingredients : []) {
    const name = String(ingredient?.name || "").trim();
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
