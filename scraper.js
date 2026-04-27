const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 20000);
const MIGROS_TIMEOUT_MS = Number(
  process.env.MIGROS_TIMEOUT_MS || Math.max(20000, SEARCH_TIMEOUT_MS),
);
const CIMRI_TIMEOUT_MS = Number(
  process.env.CIMRI_TIMEOUT_MS || Math.max(25000, SEARCH_TIMEOUT_MS),
);
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 20);
const MIGROS_RESULT_LIMIT = Number(
  process.env.MIGROS_RESULT_LIMIT || MARKET_RESULT_LIMIT,
);
const MIGROS_ACCEPT_LANGUAGE = String(
  process.env.MIGROS_ACCEPT_LANGUAGE || "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
).trim();
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const MARKET_ORDER = ["sok", "migros", "carrefour"];
const MARKET_LABELS = {
  sok: "Sok",
  migros: "Migros",
  carrefour: "Carrefour",
};

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
    .replace(/\bcilek\b/g, "çilek");
}

function queryVariants(query) {
  const base = improveSearchQuery(query);
  const variants = new Set([base, transliterateTurkish(base)]);

  if (base.includes("süt")) variants.add(base.replaceAll("süt", "sut"));
  if (base.includes("yoğurt"))
    variants.add(base.replaceAll("yoğurt", "yogurt"));
  if (base.includes("çilek")) variants.add(base.replaceAll("çilek", "cilek"));
  if (base.includes("kaşar")) variants.add(base.replaceAll("kaşar", "kasar"));

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
    else if (
      itemTokens.some(
        (itemToken) => itemToken.includes(token) || token.includes(itemToken),
      )
    )
      score += 1;
  }

  if (transliterateTurkish(itemName).includes(transliterateTurkish(query)))
    score += 4;
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
  return dedupeItems(items)
    .map((item) => ({ item, score: itemMatchScore(query, item.name) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, limit)
    .map(({ item }) => item);
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

async function fetchJson(url, timeoutMs = SEARCH_TIMEOUT_MS, headers = {}) {
  return JSON.parse(await fetchText(url, timeoutMs, headers));
}

async function fetchViaJinaReader(url, timeoutMs = JINA_TIMEOUT_MS) {
  return await fetchText(`https://r.jina.ai/${url}`, timeoutMs, {
    Accept: "text/plain",
  });
}

function parseSokFromJinaText(text) {
  const items = [];
  const pattern =
    /\[!\[Image \d+: product-thumb\]\((https?:\/\/[^)]+)\)[^\]]*## ([^\]]+?)\s+(\d+,\d+)₺[^\]]*\]/g;

  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    items.push({
      market: MARKET_LABELS.sok,
      name: normalizeText(match[2]),
      price: Number.parseFloat(match[3].replace(",", ".")),
      image: normalizeText(match[1]),
    });
  }

  return dedupeItems(items);
}

function migrosApiHeaders(referer) {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": MIGROS_ACCEPT_LANGUAGE,
    Referer: referer,
    "X-Requested-With": "XMLHttpRequest",
  };
}

function mapMigrosApiItem(item) {
  const rawPrice = [
    item?.crmDiscountedSalePrice,
    item?.salePrice,
    item?.shownPrice,
    item?.regularPrice,
  ].find((value) => Number.isFinite(Number(value)) && Number(value) > 0);

  const price = Number.isFinite(Number(rawPrice))
    ? Number(rawPrice) / 100
    : null;
  if (!item?.name || !Number.isFinite(price) || price <= 0) return null;

  return {
    market: MARKET_LABELS.migros,
    name: normalizeText(item.name),
    price,
    image: normalizeText(
      item?.images?.[0]?.urls?.PRODUCT_LIST ||
        item?.images?.[0]?.urls?.PRODUCT_DETAIL ||
        item?.images?.[0]?.urls?.PRODUCT_HD ||
        "",
    ),
  };
}

async function fetchMigrosApiPage(query, page = 1) {
  const url =
    `https://www.migros.com.tr/rest/search/screens/products?q=${encodeURIComponent(query)}` +
    `&page=${page}`;
  const referer = `https://www.migros.com.tr/arama?q=${encodeURIComponent(query)}`;
  const payload = await fetchJson(
    url,
    MIGROS_TIMEOUT_MS,
    migrosApiHeaders(referer),
  );
  const searchInfo = payload?.data?.searchInfo || {};
  const items = dedupeItems(
    (Array.isArray(searchInfo.storeProductInfos)
      ? searchInfo.storeProductInfos
      : []
    )
      .map(mapMigrosApiItem)
      .filter(Boolean),
  );

  return {
    items,
    pageCount: Math.max(1, Number(searchInfo.pageCount || 1)),
  };
}

function parseMigrosFromSearchText(text) {
  const items = [];
  const lines = String(text || "").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const imageMatch = lines[index].match(
      /\[!\[Image \d+: ([^\]]+?)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/www\.migros\.com\.tr\/[^)\s]+)\)/i,
    );
    if (!imageMatch) continue;

    let name = normalizeText(imageMatch[1]);
    let price = null;
    for (
      let lookAhead = index + 1;
      lookAhead < Math.min(index + 12, lines.length);
      lookAhead += 1
    ) {
      const line = normalizeText(lines[lookAhead]);
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

  return dedupeItems(items);
}

async function scrapeSok(query) {
  logScrape("Sok", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const items = [];

  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Sok Jina fetch ${variant}`,
        fetchViaJinaReader(
          `https://www.sokmarket.com.tr/arama?q=${encodeURIComponent(variant)}`,
        ),
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseSokFromJinaText(text));
    } catch (error) {
      logScrape("Sok", `Jina error for "${variant}": ${error.message}`);
    }
  }

  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

async function scrapeMigros(query) {
  logScrape("Migros", `Starting scrape for "${query}"`);
  const variants = queryVariants(query);
  const combined = [];
  const seen = new Set();

  for (const variant of variants) {
    try {
      let page = 1;
      let pageCount = 1;
      while (page <= pageCount && combined.length < MIGROS_RESULT_LIMIT) {
        const response = await fetchMigrosApiPage(variant, page);
        pageCount = response.pageCount;
        for (const item of response.items) {
          const key = `${item.name.toLowerCase()}|${item.price.toFixed(2)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push(item);
          if (combined.length >= MIGROS_RESULT_LIMIT) break;
        }
        page += 1;
      }
    } catch (error) {
      logScrape("Migros", `API error for "${variant}": ${error.message}`);
    }
  }

  if (combined.length) {
    return rankItemsForQuery(query, combined, MIGROS_RESULT_LIMIT);
  }

  const fallback = [];
  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Migros Jina fetch ${variant}`,
        fetchViaJinaReader(
          `https://www.migros.com.tr/arama?q=${encodeURIComponent(variant)}`,
        ),
        MIGROS_TIMEOUT_MS,
      );
      fallback.push(...parseMigrosFromSearchText(text));
    } catch (error) {
      logScrape("Migros", `Jina error for "${variant}": ${error.message}`);
    }
  }

  return rankItemsForQuery(query, fallback, MIGROS_RESULT_LIMIT);
}

// Market name mappings for cimri.com
const CIMRI_MARKET_NAMES = {
  sok: ["Şok", "Sok"],
  migros: ["Migros"],
  carrefour: ["CarrefourSA", "Carrefour", "Carrefoursa"],
};

function parseMarketFromName(marketName) {
  const normalized = normalizeText(marketName).toLowerCase();
  for (const [marketKey, names] of Object.entries(CIMRI_MARKET_NAMES)) {
    for (const name of names) {
      if (normalized.includes(name.toLowerCase())) {
        return marketKey;
      }
    }
  }
  return null;
}

function parsePriceFromText(text) {
  const str = String(text || "");
  // Match Turkish price formats: 12,50 ₺ or 12.50 TL or ₺12,50
  const match =
    str.match(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})\s*(?:₺|TL|TL₺)/i) ||
    str.match(/(?:₺|TL)\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{1,2})/i) ||
    str.match(/([\d]+[.,]\d{2})/);

  if (!match) return null;
  const parsed = Number.parseFloat(
    String(match[1]).replace(/\./g, "").replace(",", "."),
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseItemsFromJinaText(text, targetMarket) {
  const items = [];
  const lines = String(text || "").split("\n");

  let currentProductName = null;
  let currentPrice = null;
  let currentImage = null;
  let currentMarket = null;

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    if (!line) continue;

    // Detect market name
    const detectedMarket = parseMarketFromName(line);
    if (detectedMarket) {
      currentMarket = detectedMarket;
    }

    // Detect product name (usually in headings or image alt text)
    const productMatch = line.match(
      /(?:Image \d+|product|ürün)[:\]]\s*(.+?)(?:\]|$)/i,
    );
    if (productMatch && !line.match(/price|fiyat|₺|TL/i)) {
      currentProductName = normalizeText(productMatch[1]);
    }

    // Detect price
    const price = parsePriceFromText(line);
    if (price !== null) {
      currentPrice = price;
    }

    // Detect image URL
    const imageMatch = line.match(
      /\((https?:\/\/[^)]+\.(?:jpg|jpeg|png|webp)[^)]*)\)/i,
    );
    if (imageMatch) {
      currentImage = normalizeText(imageMatch[1]);
    }

    // If we have a complete item and it matches our target market
    if (currentProductName && currentPrice && currentMarket === targetMarket) {
      items.push({
        market: MARKET_LABELS[targetMarket],
        name: currentProductName,
        price: currentPrice,
        image: currentImage || "",
      });
      // Reset for next item
      currentProductName = null;
      currentPrice = null;
      currentImage = null;
    }
  }

  return dedupeItems(items);
}

async function scrapeFromCimri(query, targetMarket) {
  logScrape("Cimri", `Scraping ${targetMarket} prices for "${query}"`);
  const variants = queryVariants(query);
  const items = [];

  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `Cimri fetch ${variant}`,
        fetchViaJinaReader(
          `https://www.cimri.com/market?q=${encodeURIComponent(variant)}`,
        ),
        CIMRI_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseItemsFromJinaText(text, targetMarket));
    } catch (error) {
      logScrape("Cimri", `Error for "${variant}": ${error.message}`);
    }
  }

  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
}

async function scrapeCarrefour(query) {
  logScrape("Carrefour", `Starting scrape for "${query}"`);

  // Try direct CarrefourSA website first
  const variants = queryVariants(query);
  const directItems = [];

  for (const variant of variants) {
    try {
      const text = await withTimeout(
        `CarrefourSA Jina fetch ${variant}`,
        fetchViaJinaReader(
          `https://www.carrefoursa.com/arama?q=${encodeURIComponent(variant)}`,
        ),
        CIMRI_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;

      // Parse CarrefourSA items
      const parsed = parseCarrefourFromJinaText(text);
      directItems.push(...parsed);
    } catch (error) {
      logScrape("Carrefour", `Direct error for "${variant}": ${error.message}`);
    }
  }

  if (directItems.length > 0) {
    return rankItemsForQuery(query, directItems, MARKET_RESULT_LIMIT);
  }

  // Fallback to cimri.com
  return await scrapeFromCimri(query, "carrefour");
}

function parseCarrefourFromJinaText(text) {
  const items = [];
  const lines = String(text || "").split("\n");
  let currentName = null;
  let currentPrice = null;
  let currentImage = null;

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized) continue;

    // Product name
    const nameMatch = normalized.match(/^(?:!\[.*\]\(.*\)\s*)?\[([^\]]+)\]/);
    if (nameMatch && !normalized.match(/price|fiyat|₺|TL|$/)) {
      currentName = normalizeText(nameMatch[1]);
    }

    // Price
    const price = parsePriceFromText(normalized);
    if (price !== null) {
      currentPrice = price;
    }

    // Image
    const imgMatch = normalized.match(/\!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (imgMatch) {
      currentImage = normalizeText(imgMatch[1]);
    }

    // Complete item
    if (currentName && currentPrice) {
      items.push({
        market: MARKET_LABELS.carrefour,
        name: currentName,
        price: currentPrice,
        image: currentImage || "",
      });
      currentName = null;
      currentPrice = null;
      currentImage = null;
    }
  }

  return dedupeItems(items);
}

async function scrapeSokFromCimri(query) {
  return await scrapeFromCimri(query, "sok");
}

async function scrapeMigrosFromCimri(query) {
  return await scrapeFromCimri(query, "migros");
}

const MARKET_HANDLERS = {
  sok: scrapeSok,
  migros: scrapeMigros,
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
    normalizedMarket === "migros"
      ? Math.max(MIGROS_TIMEOUT_MS, SEARCH_TIMEOUT_MS)
      : SEARCH_TIMEOUT_MS,
  );
}

async function searchMultiple(product) {
  const entries = await Promise.all(
    MARKET_ORDER.map(async (market) => {
      const items = await searchProduct(product, market).catch((error) => {
        logScrape(MARKET_LABELS[market], error.message);
        return [];
      });
      return [market, Array.isArray(items) ? items : []];
    }),
  );

  return Object.fromEntries(entries);
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
    const sokQuantityRatio = hasCachedSokPrice
      ? calculateNeededRatio(
          quantity,
          quantityUnit,
          cachedSelections?.sok?.packageSize,
          cachedSelections?.sok?.packageUnit,
        )
      : Number.isFinite(quantityRatio) && quantityRatio > 0
        ? quantityRatio
        : quantity;
    const migrosQuantityRatio = hasCachedMigrosPrice
      ? calculateNeededRatio(
          quantity,
          quantityUnit,
          cachedSelections?.migros?.packageSize,
          cachedSelections?.migros?.packageUnit,
        )
      : Number.isFinite(quantityRatio) && quantityRatio > 0
        ? quantityRatio
        : quantity;
    const carrefourQuantityRatio = hasCachedCarrefourPrice
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
        ? sokUnitPrice * sokQuantityRatio
        : null;
    const migrosCost = hasCachedMigrosPrice
      ? migrosUnitPrice
      : migrosUnitPrice !== null && Number.isFinite(migrosUnitPrice)
        ? migrosUnitPrice * migrosQuantityRatio
        : null;
    const carrefourCost = hasCachedCarrefourPrice
      ? carrefourUnitPrice
      : carrefourUnitPrice !== null && Number.isFinite(carrefourUnitPrice)
        ? carrefourUnitPrice * carrefourQuantityRatio
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
  if (rows.some((row) => row.sok?.unitPrice !== null))
    markets.push({ name: "Sok", total: totals.sok });
  if (rows.some((row) => row.migros?.unitPrice !== null))
    markets.push({ name: "Migros", total: totals.migros });
  if (rows.some((row) => row.carrefour?.unitPrice !== null))
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
