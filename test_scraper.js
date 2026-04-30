const scraper = require('./scraper');

async function test() {
  const queries = ['süt', 'yogurt', 'ekmek', 'un', 'zeytin'];
  
  for (const query of queries) {
    console.log(`\n=== Testing query: "${query}" ===\n`);
    try {
      const result = await scraper.searchMultiple(query);
      
      console.log('Marketfiyati items:', result.marketfiyati ? result.marketfiyati.length : 0);
      console.log('Sok items:', result.sok ? result.sok.length : 0);
      
      if (result.sok && result.sok.length > 0) {
        console.log('First Sok item:', JSON.stringify(result.sok[0], null, 2));
      }
      
      // Show a few MarketFiyati items for comparison
      if (result.marketfiyati && result.marketfiyati.length > 0) {
        console.log('First Marketfiyati item:', JSON.stringify(result.marketfiyati[0], null, 2));
      }
      
    } catch (error) {
      console.error(`Error testing "${query}":`, error.message);
    }
  }
}

test().catch(console.error);