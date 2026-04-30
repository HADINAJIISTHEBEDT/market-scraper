const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini with the API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAkpcDkbnzS1WpWnbQxCvybGUC5cw7H3eU';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Get the Gemini model - use the correct model name for v1beta API
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

function logGemini(stage, message) {
  console.log(`[Gemini][${stage}] ${message}`);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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
  const normalizedName = name.toLowerCase();
  
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

async function searchWithGemini(query, market = null) {
  logGemini("Search", `Starting Gemini search for "${query}"${market ? ` in ${market}` : ''}`);
  
  try {
    // Create a comprehensive prompt for Gemini - remove limit to get all items
    const prompt = market ? 
      `Search for ALL grocery products related to "${query}" specifically from ${market} market in Turkey. 
      Return as many products as possible with their names, prices in Turkish Lira, and image URLs.
      Focus on actual grocery items like milk, bread, cheese, vegetables, fruits, etc.
      Exclude non-food items, tickets, catalogs, or company information.
      Format as JSON array with objects containing: name, price, image, market.
      Prices should be realistic Turkish grocery prices (1-500 TL range).
      Do not limit the number of results - return ALL available products.` :
      
      `Search for ALL grocery products related to "${query}" from Turkish markets like Bim, Fille, Sok, Migros, Metro, Tahtakale, Carrefour.
      Return as many products as possible with their names, prices in Turkish Lira, image URLs, and which market they're from.
      Focus on actual grocery items like milk, bread, cheese, vegetables, fruits, etc.
      Exclude non-food items, tickets, catalogs, or company information.
      Format as JSON array with objects containing: name, price, image, market.
      Prices should be realistic Turkish grocery prices (1-500 TL range).
      Do not limit the number of results - return ALL available products.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    logGemini("Response", `Got response: ${text.substring(0, 200)}...`);
    
    // Try to parse the JSON response
    let products = [];
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        products = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, try to parse the entire response
        products = JSON.parse(text);
      }
    } catch (parseError) {
      logGemini("Parse Error", `Failed to parse JSON: ${parseError.message}`);
      
      // Fallback: try to extract products manually
      products = extractProductsManually(text, market);
    }
    
    // Validate and filter products - no limit on number of items
    const validProducts = products.filter(product => {
      const name = normalizeText(product.name);
      const price = Number(product.price);
      const image = normalizeText(product.image);
      const productMarket = normalizeText(product.market || market || 'Gemini AI');
      
      return name && 
             price && 
             price > 0 && 
             price < 1000 && 
             isGroceryProduct(name, price) &&
             image && 
             image.startsWith('http');
    }); // Remove slice() to get all items
    
    logGemini("Results", `Found ${validProducts.length} valid products`);
    
    return validProducts.map(product => ({
      market: normalizeText(product.market || market || 'Gemini AI'),
      name: normalizeText(product.name),
      price: Number(product.price),
      image: normalizeText(product.image)
    }));
    
  } catch (error) {
    logGemini("Error", `Gemini search failed: ${error.message}`);
    return [];
  }
}

function extractProductsManually(text, market) {
  logGemini("Manual Extract", "Attempting manual product extraction");
  
  const products = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for patterns that might indicate products
    const productPatterns = [
      /(.+?)\s*[:\-]\s*([\d.,]+)\s*(?:TL|₺)/i,
      /(.+?)\s*\(([\d.,]+)\s*(?:TL|₺)\)/i,
      /(.+?)\s*([\d.,]+)\s*(?:TL|₺)/i
    ];
    
    for (const pattern of productPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = normalizeText(match[1]);
        const price = parsePriceValue(match[2]);
        
        if (name && price && isGroceryProduct(name, price)) {
          products.push({
            market: market || 'Gemini AI',
            name,
            price,
            image: `https://via.placeholder.com/80x80?text=${encodeURIComponent(name.substring(0, 10))}`
          });
        }
      }
    }
  }
  
  return products; // Remove slice() to get all items
}

async function searchMultipleWithGemini(query) {
  logGemini("Multi Search", `Starting multi-market search for "${query}"`);
  
  const results = {};
  const markets = ['Bim', 'Fille', 'Sok', 'Migros', 'Metro', 'Tahtakale', 'Carrefour'];
  
  // Search each market
  for (const market of markets) {
    try {
      const products = await searchWithGemini(query, market);
      if (products.length > 0) {
        results[market.toLowerCase()] = products;
      }
    } catch (error) {
      logGemini("Market Error", `Error searching ${market}: ${error.message}`);
    }
  }
  
  // Also do a general search without market restriction
  try {
    const generalProducts = await searchWithGemini(query);
    if (generalProducts.length > 0) {
      results.gemini = generalProducts;
    }
  } catch (error) {
    logGemini("General Error", `Error in general search: ${error.message}`);
  }
  
  return results;
}

module.exports = {
  searchWithGemini,
  searchMultipleWithGemini
};
