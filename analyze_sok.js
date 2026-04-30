const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://www.sokmarket.com.tr/arama?q=süt', {
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
})
.then(res => {
  const html = res.data;
  console.log('SUCCESS: Got Sok search page, length:', html.length);
  
  // Load with cheerio
  const $ = cheerio.load(html);
  
  // Look for common product container patterns
  const selectors = [
    '.product-item',
    '.product-card',
    '.product',
    '[data-test-id="product-card"]',
    '.plp-product-item',
    '.item-box',
    '.product-item-wrapper',
    '.product-list-item',
    '.product-tile',
    'article',
    '.product-container'
  ];
  
  let foundContainers = [];
  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      foundContainers.push({selector, count: elements.length});
      console.log(`Selector '${selector}' found ${elements.length} elements`);
      
      // Show first element's HTML sample
      if (elements.length > 0) {
        const firstHtml = elements.first().html() || '';
        console.log(`  Sample HTML (first 200 chars): ${firstHtml.substring(0, 200)}`);
      }
    }
  }
  
  if (foundContainers.length === 0) {
    console.log('No product containers found with standard selectors');
    
    // Try to find any elements with price-like patterns
    const pricePattern = /(\d+[.,]\d{2})\s*(?:₺|TL)/gi;
    const priceMatches = html.match(pricePattern);
    console.log('Price-like patterns found:', priceMatches ? priceMatches.length : 0);
    if (priceMatches) {
      console.log('Sample prices:', priceMatches.slice(0, 5).map(p => p.trim()));
    }
    
    // Look for common class names that might contain products
    const classMatches = html.match(/class="([^"]*)"/g);
    if (classMatches) {
      const productRelated = classMatches
        .map(m => m.match(/class="([^"]*)"/)[1])
        .filter(className => 
          className.toLowerCase().includes('product') || 
          className.toLowerCase().includes('item') ||
          className.toLowerCase().includes('card')
        );
      
      console.log(`Found ${productRelated.length} product/item/card related class names`);
      const uniqueClasses = [...new Set(productRelated)];
      console.log('Unique product-related classes:', uniqueClasses.slice(0, 10));
    }
  }
  
  // Look for image tags
  const imgMatches = html.match(/<img[^>]*>/gi);
  console.log('IMG tags found:', imgMatches ? imgMatches.length : 0);
  
  // Look for links that might be product links
  const linkMatches = html.match(/<a[^>]*href="[^"]*"[^>]*>/gi);
  console.log('Anchor tags found:', linkMatches ? linkMatches.length : 0);
  
})
.catch(err => console.error('ERROR:', err.message));