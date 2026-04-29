"use strict";

/**
 * MarketFiyati scraper — uses the official REST API directly.
 *
 * API base: https://api.marketfiyati.org.tr
 *
 * Flow:
 *  1. POST /api/v2/nearest  → get depot IDs near the given coordinates
 *  2. POST /api/v2/search   → search products in those depots
 *
 * Each product in the response contains a `productDepotInfoList` array with
 * one entry per market that sells it (BIM, A101, Migros, SOK, CarrefourSA, …).
 * We expand these so the caller gets one flat result per market listing.
 */

const https = require("https");

const API_BASE = "https://api.marketfiyati.org.tr";
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 30000);
// Remove limit to get all items - set to a high number
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 50000);

// Default Istanbul coordinates (Kadıköy) — covers most chains nationwide.
// Override via env vars if you need a different region.
const DEFAULT_LAT = Number(process.env.MF_LATITUDE || 41.0082);
const DEFAULT_LON = Number(process.env.MF_LONGITUDE || 28.9784);
const DEFAULT_DISTANCE = Number(process.env.MF_DISTANCE || 300); // Increased radius to 300km

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://marketfiyati.org.tr",
  Referer: "https://marketfiyati.org.tr/",
};

function logScrape(stage, message) {
  console.log(`[MarketFiyati][${stage}] ${message}`);
}

/**
 * Minimal JSON POST/GET helper (no external deps).
 */
function apiRequest(method, path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(API_BASE + path);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        ...HEADERS,
        ...(payload
          ? { "Content-Length": Buffer.byteLength(payload) }
          : {}),
      },
    };

    const timer = setTimeout(
      () => reject(new Error(`Request to ${path} timed out`)),
      timeoutMs,
    );

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        clearTimeout(timer);
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            new Error(
              `HTTP ${res.statusCode} from ${path}: ${raw.slice(0, 200)}`,
            ),
          );
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`JSON parse error from ${path}: ${e.message}`));
        }
      });
    });

    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Step 1 — get nearest depot IDs.
 * Returns an array of depot id strings.
 */
async function getNearestDepotIds(lat, lon, distance) {
  logScrape("Depots", `Fetching depots near (${lat}, ${lon}) within ${distance} km`);
  const data = await apiRequest(
    "POST",
    "/api/v2/nearest",
    { latitude: lat, longitude: lon, distance },
    SEARCH_TIMEOUT_MS,
  );

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected nearest response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const ids = data.map((d) => d.id).filter(Boolean);
  logScrape("Depots", `Got ${ids.length} depot IDs`);
  return ids;
}

/**
 * Step 2 — search products.
 * Returns the raw SearchResponse object from the API.
 */
async function searchProducts(keywords, depotIds, lat, lon, distance, page, size) {
  logScrape("Search", `Searching "${keywords}" (page ${page}, size ${size})`);
  const data = await apiRequest(
    "POST",
    "/api/v2/search",
    {
      keywords,
      pages: page,
      size,
      latitude: lat,
      longitude: lon,
      distance,
      depots: depotIds,
    },
    SEARCH_TIMEOUT_MS,
  );

  return data;
}

/**
 * Flatten API product list into the shape the rest of the app expects:
 *   { name, price, market, image, unitPrice, brand, url }
 *
 * One product can appear in multiple markets — we emit one result per market.
 */
function flattenProducts(apiProducts) {
  const results = [];

  for (const product of apiProducts) {
    const title = String(product.title || "").trim();
    const brand = String(product.brand || "").trim();
    const imageUrl = String(product.imageUrl || "").trim();
    const depotInfoList = Array.isArray(product.productDepotInfoList)
      ? product.productDepotInfoList
      : [];

    if (depotInfoList.length === 0) {
      // No market info — emit a placeholder entry
      results.push({
        name: title,
        brand,
        price: null,
        market: "Market Fiyatı",
        image: imageUrl,
        unitPrice: null,
      });
      continue;
    }

    for (const depot of depotInfoList) {
      const marketName = String(depot.marketAdi || depot.depotName || "").trim();
      const price =
        typeof depot.price === "number" && depot.price > 0 ? depot.price : null;
      const unitPrice = String(depot.unitPrice || "").trim() || null;

      results.push({
        name: title,
        brand,
        price,
        market: marketName || "Market Fiyatı",
        image: imageUrl,
        unitPrice,
      });
    }
  }

  return results;
}

/**
 * Main entry point — mirrors the signature used by scraper.js.
 *
 * Returns an array of product objects:
 *   { name, brand, price, market, image, unitPrice }
 */
async function scrapeMarketFiyati(query) {
  logScrape("Search", `Starting search for "${query}"`);

  const lat = DEFAULT_LAT;
  const lon = DEFAULT_LON;
  const distance = DEFAULT_DISTANCE;

  // Step 1: get depots
  const depotIds = await getNearestDepotIds(lat, lon, distance);

  if (depotIds.length === 0) {
    logScrape("Search", "No depots found — returning empty results");
    return [];
  }

  // Step 2: search — fetch up to 5 pages (page 0, 1, 2, 3, 4) with 200 items each
  // to maximise coverage across all markets.
  const PAGE_SIZE = 200;
  const MAX_PAGES = 5;

  let allProducts = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    let response;
    try {
      response = await searchProducts(
        query,
        depotIds,
        lat,
        lon,
        distance,
        page,
        PAGE_SIZE,
      );
    } catch (err) {
      logScrape("Search", `Page ${page} failed: ${err.message}`);
      break;
    }

    const content = Array.isArray(response.content) ? response.content : [];
    logScrape(
      "Search",
      `Page ${page}: ${content.length} products (total found: ${response.numberOfFound ?? "?"})`,
    );

    allProducts = allProducts.concat(flattenProducts(content));

    // Stop early if we have enough or there are no more results
    if (
      content.length < PAGE_SIZE ||
      allProducts.length >= MARKET_RESULT_LIMIT
    ) {
      break;
    }
  }

  const limited = allProducts.slice(0, MARKET_RESULT_LIMIT);
  logScrape("Results", `Returning ${limited.length} product-market entries`);
  return limited;
}

module.exports = { scrapeMarketFiyati };

// ---- CLI test ----
if (require.main === module) {
  const testQuery = process.argv[2] || "süt";
  console.log(`\nTesting MarketFiyati API scraper with query: "${testQuery}"\n`);

  scrapeMarketFiyati(testQuery)
    .then((results) => {
      console.log("\n=== RESULTS ===");
      console.log(`Found ${results.length} product-market entries:\n`);
      results.slice(0, 20).forEach((p, i) => {
        console.log(
          `${i + 1}. [${p.market}] ${p.name}${p.brand ? ` (${p.brand})` : ""}`,
        );
        console.log(
          `   Price: ${p.price != null ? p.price + " ₺" : "N/A"}  Unit: ${p.unitPrice || "N/A"}`,
        );
        if (p.image) console.log(`   Image: ${p.image.slice(0, 80)}...`);
      });
      if (results.length > 20) {
        console.log(`\n... and ${results.length - 20} more entries.`);
      }
    })
    .catch((err) => {
      console.error("Test failed:", err);
    })
    .finally(() => process.exit(0));
}
