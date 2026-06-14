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
  
  // Look for elements with the specific hashed classes we found
  const hashedSelectors = [
    '.CProductCard-module_productCardWrapper__okAmT',
    '.CProductCard-module_productCardContainer__mwUl7',
    '.CProductCard-module_containerTop__35Ma3',
    '.PLPProductListing_PLPCardsWrapper__POow2',
    '.PLPProductListing_PLPCardParent__GC2qb'
  ];
  
  for (const selector of hashedSelectors) {
    const elements = $(selector);
    console.log(`Selector '${selector}' found ${elements.length} elements`);
    if (elements.length > 0) {
      // Show first element's structure
      const first = elements.first();
      console.log('  First element HTML sample:', first.html()?.substring(0, 300));
      console.log('  First element text sample:', first.text()?.substring(0, 200));
      
      // Look for price patterns within this element
      const elementText = first.text();
      const priceMatches = elementText.match(/(\d+[.,]\d{2})\s*(?:₺|TL)/gi);
      if (priceMatches && priceMatches.length > 0) {
        console.log('  Prices found in element:', priceMatches.slice(0, 3));
      }
      
      // Look for images within this element
      const imgs = first.find('img');
      console.log('  Images found in element:', imgs.length);
      if (imgs.length > 0) {
        const src = imgs.first().attr('src') || imgs.first().attr('data-src');
        console.log('  First image src:', src?.substring(0, 100));
      }
    }
  }
  
  // Try a more general approach: find elements that contain both images and text that looks like product names/prices
  console.log('\n=== Trying general approach ===');
  const allDivs = $('div');
  console.log('Total div elements:', allDivs.length);
  
  let candidateProducts = [];
  allDivs.each((index, element) => {
    const $elem = $(element);
    const text = $elem.text().trim();
    
    // Must have reasonable text length
    if (text.length < 10 || text.length > 500) return;
    
    // Must contain an image
    const hasImg = $elem.find('img').length > 0;
    if (!hasImg) return;
    
    // Must look like it has a price (Turkish lira format)
    const hasPrice = /(\d+[.,]\d{2})\s*(?:₺|TL)/i.test(text);
    if (!hasPrice) return;
    
    // Must look like it has a product name (not just price)
    // Remove price and see if there's meaningful text left
    const textWithoutPrice = text.replace(/(\d+[.,]\d{2})\s*(?:₺|TL)/gi, '').trim();
    if (textWithoutPrice.length < 3) return;
    
    candidateProducts.push($elem);
  });
  
  console.log('Candidate product elements found:', candidateProducts.length);
  
  if (candidateProducts.length > 0) {
    console.log('\n=== First few candidates ===');
    for (let i = 0; i < Math.min(3, candidateProducts.length); i++) {
      const elem = candidateProducts[i];
      console.log(`\nCandidate ${i+1}:`);
      console.log('  Text:', elem.text().substring(0, 200));
      console.log('  HTML:', elem.html()?.substring(0, 300));
      
      // Extract image
      const img = elem.find('img').first();
      if (img.length) {
        console.log('  Image:', img.attr('src') || img.attr('data-src') || 'no src');
      }
    }
  }
  
})
.catch(err => console.error('ERROR:', err.message));