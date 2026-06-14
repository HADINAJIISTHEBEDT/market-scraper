const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 35000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 30000);
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 7);
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const MARKET_ORDER = [
  "bim",
  "sok",  
  "tahtakale",
  "migros",
  "metro",
  "carrefour",
];
const MARKET_LABELS = {
  bim: "Bim",
  sok: "Sok",
  migros: "Migros",
  metro: "Metro",
  tahtakale: "Tahtakale",
  carrefour: "Carrefour",
};

const MARKET_SOURCES = {
  sok: "https://www.sokmarket.com.tr/arama?q=",
  migros: "https://www.migros.com.tr/arama?q=",
  carrefour: "https://www.carrefoursa.com/arama?q=",
  cimri: "https://www.cimri.com/arama?q=",
  tahtakaleMilkCategory: "https://www.tahtakalespot.com/sut-ve-sut-urunleri-1175",
};

const CIMRI_MARKETS = new Set(["bim", "metro", "tahtakale"]);

function toBaseUnit(value, unit) {
  const amount = Number(value);
  const normalizedUnit = String(unit || "")
    .trim()
    .toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (normalizedUnit === "g") return { type: "mass", value: amount };
  if (normalizedUnit === "kg") return { type: "mass", value: amount * 1000 };
  if (normalizedUnit === "ml") return { type: "volume", value: amount };
  if (normalizedUnit === "l") return { type: "volume", value: amount * 1000 };
  if (normalizedUnit === "piece") return { type: "count", value: amount };
  return null;
}

function calculateNeededRatio(
  quantity,
  quantityUnit,
  packageSize,
  packageUnit,
) {
  const wanted = toBaseUnit(quantity, quantityUnit);
  const pack = toBaseUnit(packageSize, packageUnit);
  if (!wanted || !pack || wanted.type !== pack.type) {
    const fallback = Number(quantity);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  }
  return Math.max(wanted.value / pack.value, 0.01);
}

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

function tokenize(text) {
  return transliterateTurkish(normalizeText(text).toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function itemMatchScore(query, itemName) {
  const queryTokens = tokenize(query);
  const itemTokens = tokenize(itemName);
  if (!queryTokens.length || !itemTokens.length) return 0;
  const itemSet = new Set(itemTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (itemSet.has(token)) score += 3;
    else if (itemTokens.some((t) => t.includes(token) || token.includes(t)))
      score += 1;
  }
  const normalizedQuery = transliterateTurkish(query).toLowerCase();
  const normalizedName = transliterateTurkish(itemName).toLowerCase();
  if (normalizedName.includes(normalizedQuery))
    score += 4;

  // Filter out websites, catalogs, and non-product content
  const websitePatterns = [
    'anasayfa', 'www', 'com', 'net', 'tr', 'org', 'gov', 'edu',
    'https', 'http', 'site', 'web', 'sayfa', 'page', 'homepage'
  ];
  const catalogPatterns = [
    'katalog', 'broşür', 'indirim', 'kampanya', 'fırsat', 'aktüel', 
    'hafta', 'bu hafta', 'catalog', 'brochure', 'discount', 'campaign'
  ];
  const nonProductPatterns = [
    'bileti', 'bilet', 'kart', 'fiyat listesi', 'tarifesi', 'ücret', 'giysi', 
    'kıyafet', 'ayakkabı', 'çanta', 'aksesuar', 'elektronik', 'telefon', 
    'bilgisayar', 'fiyatı', 'hakkında', 'hakkında bilgi', 'ürünlerimiz',
    'mağazacılık', 'perakende', 'şirket', 'kurumsal', 'hizmet', 'destek',
    'anonim kart', 'öğrenci kartı', 'istanbulkart', 'otobüs bileti', 'metro turizm',
    'ürün çeşitliliği', 'markalı ürünler', 'toptancı market', 'fiyat arşivi'
  ];
  const babyProductPatterns = [
    'devam', 'bebek', 'aptamil', 'optipro', 'formula', 'anne', 'bebeği', 
    'mama', 'beslenme', 'bebek mamaları'
  ];

  // Heavy penalties for non-product content
  if (websitePatterns.some(pattern => normalizedName.includes(pattern)))
    score -= 15;
  if (catalogPatterns.some(pattern => normalizedName.includes(pattern)))
    score -= 12;
  if (nonProductPatterns.some(pattern => normalizedName.includes(pattern)))
    score -= 10;
  if (babyProductPatterns.some(pattern => normalizedName.includes(pattern)))
    score -= 8;

  // Additional filtering for specific queries
  if (/\b(sut|süt|milk)\b/i.test(normalizedQuery)) {
    // Exclude baby formula and related products
    if (babyProductPatterns.some(pattern => normalizedName.includes(pattern)))
      score -= 10;
    // Exclude non-food items
    if (/\b(bileti|kart|fiyat|tarifesi|ücret|giysi|kıyafet|ayakkabı|çanta|aksesuar)\b/i.test(normalizedName))
      score -= 8;
  }

  return score;
}

function dedupeItems(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const name = normalizeText(item?.name);
    const price = Number(item?.price);
    const image = normalizeText(item?.image);
    const market = normalizeText(item?.market);
    if (!name || !Number.isFinite(price) || price <= 0 || price > 50000)
      continue;
    const key = `${name.toLowerCase()}|${price.toFixed(2)}`;
    if (!map.has(key)) map.set(key, { market, name, price, image });
    else if (!map.get(key).image && image)
      map.set(key, { market, name, price, image });
  }
  return [...map.values()];
}

function rankItemsForQuery(query, items, limit = MARKET_RESULT_LIMIT) {
  const deduped = dedupeItems(items);
  const scored = deduped
    .map((item) => ({ item, score: itemMatchScore(query, item.name) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, limit)
    .map(({ item }) => item);
  if (scored.length) return scored;
  return deduped
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
    .slice(0, limit);
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

function parseLoosePriceValue(text) {
  const str = String(text || "");
  const contextual = /fiyat|price|tl|₺/i.test(str);
  if (!contextual) return null;
  const match = str.match(/(?:^|[^\d])(\d{1,4})(?:[^\d]|$)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 5 && value <= 2000 ? value : null;
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
// Format: [![Image N: product-thumb](image_url) ## Product Name Price₺](link)
function parseSokFromJinaText(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  // Primary pattern for Sok products
  const pattern =
    /\[!\[Image \d+: product-thumb\]\((https?:\/\/[^)]+)\)\s*##\s*([^\]]+?)\s+([\d]+[.,]\d+)\u20BA[^\]]*\]/g;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    items.push({
      market: MARKET_LABELS.sok,
      name: normalizeText(match[2]),
      price: Number.parseFloat(match[3].replace(",", ".")),
      image: normalizeText(match[1]),
    });
  }
  
  // Enhanced alternative parsing for different Sok formats
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for any image pattern
    const imageMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                        line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (imageMatch) {
      let name = normalizeText(imageMatch[1]);
      let price = null;
      
      // Look for price in the same line
      const priceMatch = line.match(/([\d]+[.,]\d+)\u20BA/);
      if (priceMatch) {
        price = Number.parseFloat(priceMatch[1].replace(",", "."));
      } else {
        // Check nearby lines for price (wider range)
        for (let j = i - 1; j < Math.min(i + 5, lines.length); j++) {
          if (j < 0) continue;
          const nearbyPrice = lines[j].match(/([\d]+[.,]\d+)\u20BA/);
          if (nearbyPrice) {
            price = Number.parseFloat(nearbyPrice[1].replace(",", "."));
            break;
          }
        }
      }
      
      // Also check for price patterns without TL symbol
      if (price === null) {
        const genericPriceMatch = line.match(/([\d]+[.,]\d{2})/);
        if (genericPriceMatch) {
          const potentialPrice = Number.parseFloat(genericPriceMatch[1].replace(",", "."));
          if (potentialPrice > 0 && potentialPrice < 1000) {
            price = potentialPrice;
          }
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.sok,
          name,
          price,
          image: normalizeText(imageMatch[2]),
        });
      }
    }
  }
  
  // Generic product extraction from markdown links
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    const mdLink = line.match(/\[([^\]]{3,})\]\((https?:\/\/[^)]+)\)/);
    if (mdLink) {
      const name = normalizeText(mdLink[1]);
      let price = parsePriceValue(line);
      
      // Look for price in nearby lines
      if (price === null) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          price = parsePriceValue(lines[j]);
          if (price !== null) break;
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.sok,
          name,
          price,
          image: normalizeText(mdLink[2]),
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
        fetchViaJinaReader(
          `${MARKET_SOURCES.sok}${encodeURIComponent(variant)}`,
        ),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseSokFromJinaText(text));
    } catch (error) {
      logScrape("Sok", `Error for "${variant}": ${error.message}`);
    }
  }
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- MIGROS PARSER ----
// Format from Jina: [![Image N: ProductName](image_url)](link)
// Price appears on subsequent lines
function parseMigrosFromSearchText(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  // Primary parsing for standard Migros format
  for (let i = 0; i < lines.length; i++) {
    const imageMatch = lines[i].match(
      /\[!\[Image \d+: ([^\]]+?)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/www\.migros\.com\.tr\/[^)\s]+)\)/i,
    );
    if (!imageMatch) continue;
    let name = normalizeText(imageMatch[1]);
    let price = null;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const line = normalizeText(lines[j]);
      if (!line) continue;
      const heading = line.match(/^# \[([^\]]+)\]/);
      if (heading) name = normalizeText(heading[1]);
      if (price === null) price = parsePriceValue(line);
    }
    if (!name || !price) continue;
    items.push({
      market: MARKET_LABELS.migros,
      name,
      price,
      image: normalizeText(imageMatch[2]),
    });
  }
  
  // Alternative parsing for different Migros formats
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for any image pattern
    const imageMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                        line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (imageMatch) {
      let name = normalizeText(imageMatch[1]);
      let price = null;
      
      // Look for price in nearby lines (wider range)
      for (let j = i - 2; j < Math.min(i + 10, lines.length); j++) {
        if (j < 0) continue;
        const nearbyLine = normalizeText(lines[j]);
        if (!nearbyLine) continue;
        const heading = nearbyLine.match(/^# \[([^\]]+)\]/) || nearbyLine.match(/^#+\s*(.+)$/);
        if (heading) name = normalizeText(heading[1]);
        price = parsePriceValue(nearbyLine);
        if (price !== null) break;
      }
      
      if (price && price > 0) {
        items.push({
          market: MARKET_LABELS.migros,
          name,
          price,
          image: normalizeText(imageMatch[2]),
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
        fetchViaJinaReader(
          `${MARKET_SOURCES.migros}${encodeURIComponent(variant)}`,
        ),
        JINA_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseMigrosFromSearchText(text));
    } catch (error) {
      logScrape("Migros", `Error for "${variant}": ${error.message}`);
    }
  }
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

// ---- CARREFOUR PARSER ----
// Use Jina reader extraction (same flow as Sok/Migros).
function parseCarrefourFromSearchText(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  // Primary pattern for Carrefour products
  for (let i = 0; i < lines.length; i++) {
    const imageMatch = lines[i].match(
      /\[!\[Image \d+: ([^\]]+?)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/(?:www\.)?carrefoursa\.com\/[^)\s]+)\)/i,
    );
    if (!imageMatch) continue;

    let name = normalizeText(imageMatch[1]);
    let price = null;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const line = normalizeText(lines[j]);
      if (!line) continue;
      const heading = line.match(/^# \[([^\]]+)\]/);
      if (heading) name = normalizeText(heading[1]);
      if (price === null) price = parsePriceValue(line);
    }

    if (name && price && price > 0 && price < 1000) {
      items.push({
        market: MARKET_LABELS.carrefour,
        name,
        price,
        image: normalizeText(imageMatch[2]),
      });
    }
  }
  
  // Enhanced alternative parsing for different Carrefour formats
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for any image pattern
    const imageMatch = line.match(/!\[Image \d+: ([^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
                        line.match(/\[!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (imageMatch) {
      let name = normalizeText(imageMatch[1]);
      let price = null;
      let image = normalizeText(imageMatch[2]);
      
      // Look for price in nearby lines (wider range)
      for (let j = i - 2; j < Math.min(i + 10, lines.length); j++) {
        if (j < 0) continue;
        const nearbyLine = normalizeText(lines[j]);
        if (!nearbyLine) continue;
        const heading = nearbyLine.match(/^# \[([^\]]+)\]/) || nearbyLine.match(/^#+\s*(.+)$/);
        if (heading) name = normalizeText(heading[1]);
        price = parsePriceValue(nearbyLine);
        if (price !== null) break;
      }
      
      // Also check for price in the same line
      if (price === null) {
        const priceMatch = line.match(/([\d]+[.,]\d{2})\s*(?:TL|₺)?/i);
        if (priceMatch) {
          const potentialPrice = Number.parseFloat(priceMatch[1].replace(",", "."));
          if (potentialPrice > 0 && potentialPrice < 1000) {
            price = potentialPrice;
          }
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.carrefour,
          name,
          price,
          image,
        });
      }
    }
  }
  
  // Generic product extraction from markdown links
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    const mdLink = line.match(/\[([^\]]{3,})\]\((https?:\/\/[^)]+)\)/);
    if (mdLink) {
      const name = normalizeText(mdLink[1]);
      let price = parsePriceValue(line);
      
      // Look for price in nearby lines
      if (price === null) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          price = parsePriceValue(lines[j]);
          if (price !== null) break;
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.carrefour,
          name,
          price,
          image: normalizeText(mdLink[2]),
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
        fetchViaJinaReader(
          `${MARKET_SOURCES.carrefour}${encodeURIComponent(variant)}`,
        ),
        JINA_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseCarrefourFromSearchText(text));
    } catch (error) {
      logScrape("Carrefour", `Error for "${variant}": ${error.message}`);
    }
  }

  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

function parseTahtakaleCategoryText(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  
  // Primary pattern for Tahtakale products
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    
    // Look for image patterns
    const imageMatch = line.match(/\[!\[Image \d+:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)/i) ||
                        line.match(/!\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
    
    if (imageMatch) {
      let name = normalizeText(imageMatch[1]);
      let price = null;
      let image = normalizeText(imageMatch[2]);
      
      // Look for price in nearby lines
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        price = parsePriceValue(lines[j]);
        if (price !== null) break;
      }
      
      // Also check for price in the same line
      if (price === null) {
        const priceMatch = line.match(/([\d]+[.,]\d{2})\s*(?:TL|₺)?/i);
        if (priceMatch) {
          price = Number.parseFloat(priceMatch[1].replace(",", "."));
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.tahtakale,
          name,
          price,
          image,
        });
      }
    }
    
    // Alternative pattern for markdown links with images
    const linkMatch = line.match(
      /\[!\[Image \d+:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/www\.tahtakalespot\.com\/[^)\s]+)\s+"([^"]+)"\)/i,
    );
    if (linkMatch) {
      let price = null;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        price = parsePriceValue(lines[j]);
        if (price !== null) break;
      }
      if (price === null) continue;
      items.push({
        market: MARKET_LABELS.tahtakale,
        name: normalizeText(linkMatch[4] || linkMatch[1]),
        price,
        image: normalizeText(linkMatch[2]),
      });
    }
  }
  
  // Generic product extraction from markdown links
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    const mdLink = line.match(/\[([^\]]{3,})\]\((https?:\/\/[^)]+)\)/);
    if (mdLink) {
      const name = normalizeText(mdLink[1]);
      let price = parsePriceValue(line);
      
      // Look for price in nearby lines
      if (price === null) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          price = parsePriceValue(lines[j]);
          if (price !== null) break;
        }
      }
      
      if (price && price > 0 && price < 1000) {
        items.push({
          market: MARKET_LABELS.tahtakale,
          name,
          price,
          image: normalizeText(mdLink[2]),
        });
      }
    }
  }
  
  return dedupeItems(items);
}

async function scrapeTahtakale(query) {
  logScrape("Tahtakale", `Starting scrape for "${query}"`);
  
  // Try multiple category URLs for better coverage
  const categoryUrls = [
    "https://www.tahtakalespot.com/sut-ve-sut-urunleri-1175",
    "https://www.tahtakalespot.com/sutler-1175",
    "https://www.tahtakalespot.com/kahvaltilik-1175"
  ];
  
  for (const url of categoryUrls) {
    try {
      const text = await withTimeout(
        `Tahtakale category fetch: ${url}`,
        fetchViaJinaReader(url),
        JINA_TIMEOUT_MS,
      );
      if (!/attention required|cloudflare|blocked/i.test(text)) {
        const categoryItems = parseTahtakaleCategoryText(text);
        if (categoryItems.length > 0) {
          logScrape("Tahtakale", `Found ${categoryItems.length} items from category: ${url}`);
          return rankItemsForQuery(query, categoryItems, MARKET_RESULT_LIMIT);
        }
      }
    } catch (error) {
      logScrape("Tahtakale", `Category search failed for ${url}: ${error.message}`);
    }
  }
  
  // Fallback to Cimri search with more variants
  try {
    return await scrapeCimriMarket(query, "tahtakale", ["tahtakale spot", "tahtakale market", "tahtakale toptan"]);
  } catch (error) {
    logScrape("Tahtakale", `Cimri fallback failed: ${error.message}`);
    return [];
  }
}

function parseCimriByMarket(text, marketKey, aliases = []) {
  const items = [];
  const lines = String(text || "").split("\n");
  const marketTokens = [marketKey, ...aliases]
    .map((value) => transliterateTurkish(String(value || "").toLowerCase()))
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    if (!line) continue;
    const normalizedLine = transliterateTurkish(line.toLowerCase());
    if (!marketTokens.some((token) => normalizedLine.includes(token))) continue;

    let price = parsePriceValue(line);
    if (price === null) {
      for (let j = i - 2; j <= i + 2; j++) {
        if (j < 0 || j >= lines.length) continue;
        price = parsePriceValue(lines[j]);
        if (price !== null) break;
      }
    }
    if (price === null) continue;

    let name = "";
    let image = "";
    for (let j = i - 5; j <= i + 2; j++) {
      if (j < 0 || j >= lines.length) continue;
      const candidate = normalizeText(lines[j]);
      const heading = candidate.match(/^#+\s*(.+)$/);
      if (heading && heading[1]) {
        name = normalizeText(heading[1]);
      }
      const mdLink = candidate.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      if (mdLink && mdLink[1] && mdLink[1].length > 3) {
        if (!name) name = normalizeText(mdLink[1]);
      }
      // Extract image from markdown image syntax
      const imageMatch = candidate.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
      if (imageMatch && imageMatch[1]) {
        image = normalizeText(imageMatch[1]);
      }
    }
    if (!name) name = normalizeText(line.replace(/\s*[-|].*$/, ""));
    if (!name) continue;

    items.push({
      market: MARKET_LABELS[marketKey] || marketKey,
      name,
      price,
      image,
    });
  }
  return dedupeItems(items);
}

function parseCimriGeneric(text, marketKey) {
  const items = [];
  const lines = String(text || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    if (!line) continue;
    const mdLink = line.match(/\[([^\]]{3,})\]\((https?:\/\/[^)]+)\)/);
    if (!mdLink) continue;
    const name = normalizeText(mdLink[1]);
    if (!name) continue;
    let price = parsePriceValue(line);
    if (price === null) {
      for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
        price = parsePriceValue(lines[j]);
        if (price !== null) break;
      }
    }
    if (price === null) continue;
    
    // Look for images in nearby lines
    let image = "";
    for (let j = i - 2; j <= i + 2; j++) {
      if (j < 0 || j >= lines.length) continue;
      const imageMatch = lines[j].match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
      if (imageMatch && imageMatch[1]) {
        image = normalizeText(imageMatch[1]);
        break;
      }
    }
    
    items.push({
      market: MARKET_LABELS[marketKey] || marketKey,
      name,
      price,
      image,
    });
  }
  return dedupeItems(items);
}

async function scrapeCimriMarket(query, marketKey, aliases = []) {
  logScrape(MARKET_LABELS[marketKey] || marketKey, `Starting scrape for "${query}"`);
  const baseVariants = queryVariants(query);
  const variants = baseVariants.flatMap((variant) => [
    `${variant} ${marketKey}`,
    `${variant} ${marketKey} fiyat`,
    `${variant} ${marketKey} aktüel`,
    ...aliases.slice(0, 2).map((alias) => `${variant} ${alias}`),
    ...aliases.slice(0, 2).map((alias) => `${variant} ${alias} fiyat`),
  ]);
  const uniqueVariants = [...new Set(variants.map(normalizeText).filter(Boolean))];
  const items = [];
  for (const variant of uniqueVariants) {
    try {
      const text = await withTimeout(
        `${marketKey} Cimri Jina fetch`,
        fetchViaJinaReader(`${MARKET_SOURCES.cimri}${encodeURIComponent(variant)}`),
        JINA_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      const strictItems = parseCimriByMarket(text, marketKey, aliases);
      if (strictItems.length) items.push(...strictItems);
      else items.push(...parseCimriGeneric(text, marketKey));
      if (items.length >= MARKET_RESULT_LIMIT) break;
    } catch (error) {
      logScrape(MARKET_LABELS[marketKey] || marketKey, `Error for "${variant}": ${error.message}`);
      if (/429/.test(String(error?.message || ""))) break;
    }
  }
  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseDuckDuckGoFallback(html, query, marketKey) {
  const items = [];
  const source = String(html || "");
  const titleMatches = [...source.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippetMatches = [
    ...source.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi),
  ];
  const count = Math.min(titleMatches.length, snippetMatches.length);
  for (let i = 0; i < count; i++) {
    const rawTitle = decodeHtmlEntities(
      String(titleMatches[i][1] || "").replace(/<[^>]+>/g, " "),
    );
    const rawSnippet = decodeHtmlEntities(
      String(snippetMatches[i][1] || "").replace(/<[^>]+>/g, " "),
    );
    const name = normalizeText(rawTitle);
    const snippet = normalizeText(rawSnippet);
    const price =
      parsePriceValue(snippet) ??
      parsePriceValue(name) ??
      parseLoosePriceValue(snippet);
    if (!name || price === null) continue;
    items.push({
      market: MARKET_LABELS[marketKey] || marketKey,
      name: `${name} ${snippet}`.slice(0, 180),
      price,
      image: "",
    });
  }
  return rankItemsForQuery(query, items, Math.min(8, MARKET_RESULT_LIMIT));
}

async function scrapeDuckDuckGoFallback(query, marketKey) {
  const search = `${MARKET_LABELS[marketKey] || marketKey} ${query} fiyat`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(search)}`;
  const html = await withTimeout(
    `${marketKey} duckduckgo fallback`,
    fetchText(url, JINA_TIMEOUT_MS, {
      Accept: "text/html,application/xhtml+xml",
    }),
    JINA_TIMEOUT_MS,
  );
  return parseDuckDuckGoFallback(html, query, marketKey);
}

const MARKET_HANDLERS = {
  bim: (query) => scrapeCimriMarket(query, "bim", ["bim a.s", "bim market", "bim aktüel"]),
  sok: scrapeSok,
  migros: scrapeMigros,
  metro: (query) =>
    scrapeCimriMarket(query, "metro", ["metro grossmarket", "metro market", "metro grosmarket"]),
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
    if (
      (!Array.isArray(items) || !items.length) &&
      ["bim", "metro", "carrefour"].includes(market)
    ) {
      const fallback = await scrapeDuckDuckGoFallback(product, market).catch(
        () => [],
      );
      if (fallback.length) {
        items = fallback;
        delete errors[market];
      }
    }
    entries.push([market, Array.isArray(items) ? items : []]);
    if (!errors[market] && (!Array.isArray(items) || items.length === 0)) {
      errors[market] = "No matched products from source";
    }
    if (CIMRI_MARKETS.has(market)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  const payload = Object.fromEntries(entries);
  payload._errors = errors;
  return payload;
}

async function compareIngredients(ingredients) {
  const rows = [];
  const totals = { sok: 0, migros: 0, carrefour: 0 };

  for (const ingredient of Array.isArray(ingredients) ? ingredients : []) {
    const name = normalizeText(ingredient?.name);
    const quantity = Number(ingredient?.quantity || 0);
    const quantityUnit = String(ingredient?.quantityUnit || "")
      .trim()
      .toLowerCase();
    const quantityRatio = Number(ingredient?.quantityRatio || 0);
    const displayQuantity = normalizeText(ingredient?.displayQuantity || "");
    const marketNames =
      ingredient?.marketNames && typeof ingredient.marketNames === "object"
        ? ingredient.marketNames
        : {};
    const cachedSelections =
      ingredient?.cachedSelections &&
      typeof ingredient.cachedSelections === "object"
        ? ingredient.cachedSelections
        : {};
    if (!name || quantity <= 0) continue;

    const sokQuery = normalizeText(marketNames.sok || name);
    const migrosQuery = normalizeText(marketNames.migros || name);
    const carrefourQuery = normalizeText(marketNames.carrefour || name);
    const hasCachedSokPrice = Number.isFinite(
      Number(cachedSelections?.sok?.price),
    );
    const hasCachedMigrosPrice = Number.isFinite(
      Number(cachedSelections?.migros?.price),
    );
    const hasCachedCarrefourPrice = Number.isFinite(
      Number(cachedSelections?.carrefour?.price),
    );

    const [sokResult, migrosResult, carrefourResult] = await Promise.all([
      hasCachedSokPrice
        ? Promise.resolve([])
        : searchProduct(sokQuery, "sok").catch(() => []),
      hasCachedMigrosPrice
        ? Promise.resolve([])
        : searchProduct(migrosQuery, "migros").catch(() => []),
      hasCachedCarrefourPrice
        ? Promise.resolve([])
        : searchProduct(carrefourQuery, "carrefour").catch(() => []),
    ]);

    const sokItem = hasCachedSokPrice
      ? {
          name: normalizeText(cachedSelections.sok?.name || sokQuery),
          price: Number(cachedSelections.sok.price),
        }
      : Array.isArray(sokResult) && sokResult.length
        ? sokResult[0]
        : null;
    const migrosItem = hasCachedMigrosPrice
      ? {
          name: normalizeText(cachedSelections.migros?.name || migrosQuery),
          price: Number(cachedSelections.migros.price),
        }
      : Array.isArray(migrosResult) && migrosResult.length
        ? migrosResult[0]
        : null;
    const carrefourItem = hasCachedCarrefourPrice
      ? {
          name: normalizeText(
            cachedSelections.carrefour?.name || carrefourQuery,
          ),
          price: Number(cachedSelections.carrefour.price),
        }
      : Array.isArray(carrefourResult) && carrefourResult.length
        ? carrefourResult[0]
        : null;

    const sokUnitPrice = sokItem ? Number(sokItem.price) : null;
    const migrosUnitPrice = migrosItem ? Number(migrosItem.price) : null;
    const carrefourUnitPrice = carrefourItem
      ? Number(carrefourItem.price)
      : null;

    const sokRatio = hasCachedSokPrice
      ? calculateNeededRatio(
          quantity,
          quantityUnit,
          cachedSelections?.sok?.packageSize,
          cachedSelections?.sok?.packageUnit,
        )
      : Number.isFinite(quantityRatio) && quantityRatio > 0
        ? quantityRatio
        : quantity;
    const migrosRatio = hasCachedMigrosPrice
      ? calculateNeededRatio(
          quantity,
          quantityUnit,
          cachedSelections?.migros?.packageSize,
          cachedSelections?.migros?.packageUnit,
        )
      : Number.isFinite(quantityRatio) && quantityRatio > 0
        ? quantityRatio
        : quantity;
    const carrefourRatio = hasCachedCarrefourPrice
      ? calculateNeededRatio(
          quantity,
          quantityUnit,
          cachedSelections?.carrefour?.packageSize,
          cachedSelections?.carrefour?.packageUnit,
        )
      : Number.isFinite(quantityRatio) && quantityRatio > 0
        ? quantityRatio
        : quantity;

    const sokCost = hasCachedSokPrice
      ? sokUnitPrice
      : sokUnitPrice !== null && Number.isFinite(sokUnitPrice)
        ? sokUnitPrice * sokRatio
        : null;
    const migrosCost = hasCachedMigrosPrice
      ? migrosUnitPrice
      : migrosUnitPrice !== null && Number.isFinite(migrosUnitPrice)
        ? migrosUnitPrice * migrosRatio
        : null;
    const carrefourCost = hasCachedCarrefourPrice
      ? carrefourUnitPrice
      : carrefourUnitPrice !== null && Number.isFinite(carrefourUnitPrice)
        ? carrefourUnitPrice * carrefourRatio
        : null;

    if (sokCost !== null) totals.sok += sokCost;
    if (migrosCost !== null) totals.migros += migrosCost;
    if (carrefourCost !== null) totals.carrefour += carrefourCost;

    rows.push({
      ingredient: name,
      quantity: displayQuantity || quantity,
      marketNames: {
        sok: sokQuery,
        migros: migrosQuery,
        carrefour: carrefourQuery,
      },
      sok: {
        name: sokItem?.name || sokQuery,
        unitPrice: hasCachedSokPrice ? sokCost : sokUnitPrice,
        cost: sokCost,
      },
      migros: {
        name: migrosItem?.name || migrosQuery,
        unitPrice: hasCachedMigrosPrice ? migrosCost : migrosUnitPrice,
        cost: migrosCost,
      },
      carrefour: {
        name: carrefourItem?.name || carrefourQuery,
        unitPrice: hasCachedCarrefourPrice ? carrefourCost : carrefourUnitPrice,
        cost: carrefourCost,
      },
    });
  }

  const markets = [];
  if (rows.some((r) => r.sok?.unitPrice !== null))
    markets.push({ name: "Sok", total: totals.sok });
  if (rows.some((r) => r.migros?.unitPrice !== null))
    markets.push({ name: "Migros", total: totals.migros });
  if (rows.some((r) => r.carrefour?.unitPrice !== null))
    markets.push({ name: "Carrefour", total: totals.carrefour });

  let cheapestMarket = "N/A";
  let cheapestTotal = null;
  if (markets.length) {
    markets.sort((a, b) => a.total - b.total);
    cheapestMarket = markets[0].name;
    cheapestTotal = markets[0].total;
  }

  return { rows, totals, cheapestMarket, cheapestTotal };
}

module.exports = {
  compareIngredients,
  searchProduct,
  searchMultiple,
};
