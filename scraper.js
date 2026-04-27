const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 20000);
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 20);
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const MARKET_ORDER = ["sok", "migros", "carrefour"];
const MARKET_LABELS = {
  sok: "Sok",
  migros: "Migros",
  carrefour: "Carrefour",
};

const MARKET_SOURCES = {
  sok: "https://www.sokmarket.com.tr/arama?q=",
  migros: "https://www.migros.com.tr/arama?q=",
  carrefour: "https://www.carrefoursa.com/arama?q=",
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
    else if (itemTokens.some((t) => t.includes(token) || token.includes(t)))
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

async function fetchViaJinaReader(url, timeoutMs = JINA_TIMEOUT_MS) {
  return await fetchText(`https://r.jina.ai/${url}`, timeoutMs, {
    Accept: "text/plain",
  });
}

// ---- SOK PARSER ----
// Format: [![Image N: product-thumb](image_url) ## Product Name Price₺](link)
function parseSokFromJinaText(text) {
  const items = [];
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
// CarrefourSA is blocked by Cloudflare via Jina, so we try alternative sources
// Try carrefoursa.com first, then fall back to trying to find prices via alternative means
function parseCarrefourFromJinaText(text) {
  const items = [];
  // Same general pattern as other markets: look for product-name + price pairs
  // CarrefourSA Jina output format (when not blocked): similar to Sok
  const pattern =
    /\[!\[Image \d+: product-thumb\]\((https?:\/\/[^)]+)\)\s*##\s*([^\]]+?)\s+([\d]+[.,]\d+)\u20BA[^\]]*\]/g;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    items.push({
      market: MARKET_LABELS.carrefour,
      name: normalizeText(match[2]),
      price: Number.parseFloat(match[3].replace(",", ".")),
      image: normalizeText(match[1]),
    });
  }

  // Also try generic pattern: heading with price
  if (items.length === 0) {
    const lines = String(text || "").split("\n");
    let currentName = null;
    let currentImage = null;
    for (const line of lines) {
      const normalized = normalizeText(line);
      const imgMatch = normalized.match(/\!\[.*?\]\((https?:\/\/[^)]+)\)/);
      if (imgMatch) currentImage = normalizeText(imgMatch[1]);

      const headingMatch = normalized.match(/^##\s+(.+)$/);
      if (headingMatch) currentName = normalizeText(headingMatch[1]);

      if (currentName) {
        const price = parsePriceValue(normalized);
        if (price !== null && price < 50000) {
          items.push({
            market: MARKET_LABELS.carrefour,
            name: currentName,
            price,
            image: currentImage || "",
          });
          currentName = null;
          currentImage = null;
        }
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
        `CarrefourSA Jina fetch`,
        fetchViaJinaReader(
          `${MARKET_SOURCES.carrefour}${encodeURIComponent(variant)}`,
        ),
        JINA_TIMEOUT_MS,
      );
      if (/attention required|cloudflare|blocked/i.test(text)) continue;
      items.push(...parseCarrefourFromJinaText(text));
    } catch (error) {
      logScrape("Carrefour", `Error for "${variant}": ${error.message}`);
    }
  }

  return rankItemsForQuery(query, items, MARKET_RESULT_LIMIT);
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
    SEARCH_TIMEOUT_MS,
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
