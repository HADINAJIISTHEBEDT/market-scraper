const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 20000);
// Remove limit to get all items - set to a high number
const MARKET_RESULT_LIMIT = Number(process.env.MARKET_RESULT_LIMIT || 1000);

// Import MarketFiyati scraper
let scrapeMarketFiyati = null;
try {
  const marketFiyatiModule = require('./scraper_marketfiyati');
  scrapeMarketFiyati = marketFiyatiModule.scrapeMarketFiyati;
} catch (error) {
  console.log('[Scraper] MarketFiyati module not available:', error.message);
}

// Dependencies for direct web scraping (Sok, Metro via Cimri)
const axios = require('axios');
const cheerio = require('cheerio');

const MARKET_ORDER = [
  "marketfiyati",
  "sok",
  "metro",
];

const MARKET_LABELS = {
  marketfiyati: "Market Fiyatı",
  sok: "Sok",
  metro: "Metro",
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
    
    // Based on analysis, Sok uses specific class names for product cards
    const productContainers = $('.CProductCard-module_productCardWrapper__okAmT.CProductCard-module_PLPCard__rB4tw, .CProductCard-module_productCardWrapper__okAmT');
    
    // Fallback to more general selectors if the specific ones don't work
    if (productContainers.length === 0) {
      const fallbackSelectors = [
        '.product-item',
        '.product-card', 
        '.product',
        '[data-test-id="product-card"]',
        '.plp-product-item',
        '.item-box',
        '.product-item-wrapper',
        '.product-list-item',
        '.product-tile',
        'article'
      ];
      
      for (const selector of fallbackSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          productContainers.add(elements);
          break;
        }
      }
    }

    logScrape("Sok", `Found ${productContainers.length} product containers`);
    
    productContainers.each((index, element) => {
      const $element = $(element);
      
      // Extract product name and price from text content
      // Based on observed format: "Mis Uht Süt Yarım Yağlı 1 L37,50₺"
      let fullText = $element.text().trim();
      
      // Extract price (look for Turkish Lira format)
      let price = null;
      const priceMatch = fullText.match(/(\d+[.,]\d{2})\s*(?:₺|TL)/i);
      if (priceMatch) {
        const priceValue = parseFloat(priceMatch[1].replace(',', '.'));
        if (!isNaN(priceValue) && priceValue > 0) {
          price = priceValue;
        }
      }
      
      // Extract product name (remove price from text)
      let name = fullText;
      if (priceMatch) {
        // Remove the price part to get clean product name
        name = fullText.replace(priceMatch[0], '').trim();
      }
      
      // Clean up extra whitespace
      name = name.replace(/\s+/g, ' ').trim();
      
      // Extract image URL
      let image = null;
      const imgElement = $element.find('img').first();
      if (imgElement.length) {
        image = imgElement.attr('src') || imgElement.attr('data-src') || imgElement.attr('data-lazy') || imgElement.attr('data-original');
        if (image && !image.startsWith('http')) {
          try {
            image = new URL(image, searchUrl).toString();
          } catch (e) {
            // If URL construction fails, keep as is
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
          try {
            url = new URL(href, 'https://www.sokmarket.com.tr').toString();
          } catch (e) {
            url = `https://www.sokmarket.com.tr${href}`;
          }
        } else {
          url = href;
        }
      }
      
      // Only add product if we have at least a name
      if (name && name.length > 0) {
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

// ---- METRO HANDLER ----
// Since direct Metro scraping requires authentication, use Cimri as fallback
async function scrapeMetro(query) {
  logScrape("Metro", `Starting search for "${query}" via Cimri`);
  try {
    // Use Cimri to get Metro prices
    const cimriUrl = `https://www.cimri.com/arama?q=${encodeURIComponent(query)}+metro`;

    const response = await axios.get(cimriUrl, {
      timeout: JINA_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const $ = cheerio.load(response.data);
    const products = [];

    // Cimri uses various selectors for products
    const selectors = [
      '.product-item',
      '.s1wytvda',
      '[data-product-id]',
      '.z7ntrt-0',
    ];

    let productContainers = $();

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        productContainers = productContainers.add(elements);
      }
    }

    logScrape("Metro", `Found ${productContainers.length} product containers on Cimri`);

    productContainers.each((index, element) => {
      const $element = $(element);

      // Check if this is a Metro product
      const merchantText = $element.text().toLowerCase();
      if (!merchantText.includes('metro') && !merchantText.includes('grossmarket')) {
        return; // Skip non-Metro products
      }

      // Extract product name
      let name = null;
      const titleSelectors = ['.product-title', '.link-detail', 'h3', '.product-name', 'a[title]'];
      for (const selector of titleSelectors) {
        const titleElement = $element.find(selector).first();
        if (titleElement.length) {
          name = titleElement.text().trim() || titleElement.attr('title');
          if (name) break;
        }
      }

      // Extract price
      let price = null;
      const priceSelectors = ['.price', '.product-price', '[class*="price"]'];
      for (const selector of priceSelectors) {
        const priceElement = $element.find(selector).first();
        if (priceElement.length) {
          const priceText = priceElement.text().trim();
          const priceMatch = priceText.match(/(\d+[.,]\d{2})\s*(?:₺|TL|tl)/i);
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(',', '.'));
            break;
          }
        }
      }

      // Extract image URL
      let image = null;
      const imgElement = $element.find('img').first();
      if (imgElement.length) {
        image = imgElement.attr('src') || imgElement.attr('data-src') || imgElement.attr('data-lazy');
        if (image && !image.startsWith('http') && !image.startsWith('//')) {
          try {
            image = new URL(image, 'https://www.cimri.com').toString();
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
          url = `https://www.cimri.com${href}`;
        }
      }

      // Only add product if we have at least a name and price
      if (name && name.length > 0 && price && price > 0) {
        products.push({
          name,
          price,
          image: image || null,
          market: 'metro',
          unitPrice: null,
          brand: null,
          url: url || cimriUrl
        });
      }
    });

    logScrape("Metro", `Extracted ${products.length} Metro products from Cimri`);
    return products.slice(0, MARKET_RESULT_LIMIT); // Limit results
  } catch (error) {
    logScrape("Metro", `Error: ${error.message}`);
    return [];
  }
}

// Market handlers
const MARKET_HANDLERS = {
  marketfiyati: scrapeMarketFiyatiWrapper,
  sok: scrapeSok,
  metro: scrapeMetro,
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
  
  // Search all configured markets
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
