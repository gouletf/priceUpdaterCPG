const { createClient } = require('@supabase/supabase-js');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const cron = require('node-cron');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Configuration
const isDryRun = process.argv.includes('--dry-run');
const runOnce = process.argv.includes('--once');

/**
 * Creates a Chrome WebDriver instance with optimized settings
 */
async function createWebDriver() {
  const options = new chrome.Options();
  options.addArguments('--headless'); // Run in background
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--disable-gpu');
  options.addArguments('--window-size=1920,1080');
  options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  return new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
}

/**
 * Fetches the current price from a supplier's website using Selenium
 */
async function fetchPriceFromSupplier(url, sku, supplierName = 'unknown') {
  if (!url) {
    console.log(`No link provided, skipping price fetch`);
    return null;
  }

  let driver = null;
  try {
    console.log(`Fetching price from: ${url} (SKU: ${sku})`);
    driver = await createWebDriver();
    
    // Navigate to the page
    await driver.get(url);
    
    // Wait for page to load
    await driver.sleep(2000);
    
    let priceInfo = null;
    
    // Site-specific price extraction logic
    if (url.includes('lasersupply.ca')) {
      priceInfo = await extractPriceFromLaserSupply(driver);
    } else if (url.includes('aliexpress.com')) {
      priceInfo = await extractPriceFromAliExpress(driver);
    } else if (url.includes('grainger.ca')) {
      priceInfo = await extractPriceFromGrainger(driver);
    } else if (url.includes('digikey.ca')) {
      priceInfo = await extractPriceFromDigikey(driver);
    } else if (url.includes('vevor.ca')) {
      priceInfo = await extractPriceFromVevor(driver);
    } else if (url.includes('alibaba.com')) {
      priceInfo = await extractPriceFromAlibaba(driver);
    } else {
      // Default price extraction for other sites
      const price = await extractPriceGeneric(driver);
      priceInfo = price ? { price, isOnSale: false, originalPrice: null } : null;
    }
    
    return priceInfo;
    
  } catch (error) {
    console.error(`Error fetching price from ${url}: ${error.message}`);
    return null;
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
}

/**
 * Extracts price from lasersupply.ca specifically
 */
async function extractPriceFromLaserSupply(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Look for sale price first (current price)
    const saleSelectors = [
      '.price',
      '[class*="price"]:not([class*="compare"])',
      'span[class*="money"]',
      '.product-price .money'
    ];

    for (const selector of saleSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          const priceMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
          if (priceMatch) {
            const foundPrice = parseFloat(priceMatch[1]);
            if (!price || foundPrice < price) { // Take the lower price (sale price)
              price = foundPrice;
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for original/compare price (crossed out)
    const compareSelectors = [
      '.compare-at-price',
      '[class*="compare"]',
      '.was-price',
      '[class*="original"]'
    ];

    for (const selector of compareSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        const priceMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
        if (priceMatch) {
          originalPrice = parseFloat(priceMatch[1]);
          isOnSale = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search
    if (!price) {
      const bodyText = await driver.findElement(By.tagName('body')).getText();
      // Look for pattern like "$115.00" but not crossed out prices
      const priceMatches = bodyText.match(/\$(\d+(?:\.\d{2})?)/g);
      if (priceMatches && priceMatches.length > 0) {
        // Filter out obviously high prices (likely original prices)
        const prices = priceMatches.map(p => parseFloat(p.replace('$', ''))).filter(p => p > 0);
        prices.sort((a, b) => a - b); // Sort ascending
        price = prices[0]; // Take the lowest price
      }
    }

    if (isOnSale && originalPrice) {
      console.log(`Found sale price: $${price} (was $${originalPrice}) - ${((originalPrice - price) / originalPrice * 100).toFixed(1)}% off`);
    } else if (price) {
      console.log(`Found price: $${price}`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from lasersupply.ca: ${error.message}`);
    return null;
  }
}

/**
 * Extracts price from AliExpress specifically
 */
async function extractPriceFromAliExpress(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Wait for page to fully load (AliExpress uses heavy JavaScript)
    await driver.sleep(3000);

    // AliExpress-specific price selectors
    const priceSelectors = [
      '.product-price-current .product-price-value',
      '.product-price .notranslate',
      '[data-testid="price-current"]',
      '.current-price .notranslate',
      '.price-current',
      '.product-price .price-current',
      '.product-price-current',
      '[class*="price"][class*="current"]',
      '[class*="current"][class*="price"]'
    ];

    // Try to find current price
    for (const selector of priceSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          // AliExpress often shows prices like "US $12.34", "C$ 15.67", "CAD 20.00"
          const priceMatch = text.match(/(?:US\s*\$|CAD?\s*\$?|C\$|\$)\s*(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?)/i);
          if (priceMatch) {
            const foundPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (!price || foundPrice < price) { // Take the lower price
              price = foundPrice;
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for original/compare price (crossed out prices on AliExpress)
    const compareSelectors = [
      '.product-price-original .product-price-value',
      '.price-original .notranslate',
      '[data-testid="price-original"]',
      '.original-price',
      '.price-del',
      '[class*="price"][class*="original"]',
      '[class*="original"][class*="price"]',
      '[class*="was"][class*="price"]'
    ];

    for (const selector of compareSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        const priceMatch = text.match(/(?:US\s*\$|CAD?\s*\$?|C\$|\$)\s*(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?)/i);
        if (priceMatch) {
          originalPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
          isOnSale = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        // Look for various currency patterns
        const priceMatches = bodyText.match(/(?:US\s*\$|CAD?\s*\$?|C\$|\$)\s*(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?)/gi);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(p => {
            const match = p.match(/(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?)/);
            return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
          }).filter(p => p > 0 && p < 10000); // Filter reasonable prices
          
          if (prices.length > 0) {
            prices.sort((a, b) => a - b);
            price = prices[0]; // Take the lowest reasonable price
          }
        }
      } catch (error) {
        console.log(`AliExpress text search failed: ${error.message}`);
      }
    }

    if (isOnSale && originalPrice) {
      console.log(`Found AliExpress sale price: $${price} (was $${originalPrice}) - ${((originalPrice - price) / originalPrice * 100).toFixed(1)}% off`);
    } else if (price) {
      console.log(`Found AliExpress price: $${price}`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from AliExpress: ${error.message}`);
    return null;
  }
}

/**
 * Extracts price from Grainger.ca specifically
 */
async function extractPriceFromGrainger(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Wait for page to load
    await driver.sleep(2000);

    // Grainger-specific price selectors
    const priceSelectors = [
      '[data-testid="price-each"]',
      '.price-each',
      '.product-price .price',
      '.pricing-table .price',
      '[class*="price-display"]',
      '.price-container .price',
      '[class*="current-price"]',
      '.price',
      '[class*="price"]'
    ];

    // Try to find current price
    for (const selector of priceSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          // Grainger typically shows prices like "$12.34", "CAD $15.67"
          const priceMatch = text.match(/(?:CAD\s*\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
          if (priceMatch) {
            const foundPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (foundPrice > 0 && (!price || foundPrice < price)) {
              price = foundPrice;
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for promotional/sale prices
    const saleSelectors = [
      '.promotional-price',
      '.sale-price',
      '.special-price',
      '[class*="promo"][class*="price"]',
      '[class*="sale"][class*="price"]',
      '.discount-price'
    ];

    for (const selector of saleSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        const priceMatch = text.match(/(?:CAD\s*\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
        if (priceMatch) {
          const salePrice = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (salePrice > 0 && salePrice < price) {
            originalPrice = price;
            price = salePrice;
            isOnSale = true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        const priceMatches = bodyText.match(/(?:CAD\s*\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(p => {
            const match = p.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
            return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
          }).filter(p => p > 0 && p < 100000); // Filter reasonable industrial prices
          
          if (prices.length > 0) {
            prices.sort((a, b) => a - b);
            price = prices[0];
          }
        }
      } catch (error) {
        console.log(`Grainger text search failed: ${error.message}`);
      }
    }

    if (isOnSale && originalPrice) {
      console.log(`Found Grainger sale price: $${price} (was $${originalPrice}) - ${((originalPrice - price) / originalPrice * 100).toFixed(1)}% off`);
    } else if (price) {
      console.log(`Found Grainger price: $${price}`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from Grainger: ${error.message}`);
    return null;
  }
}

/**
 * Extracts price from Digikey.ca specifically (electronics components)
 */
async function extractPriceFromDigikey(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Wait for page to load (Digikey has dynamic pricing)
    await driver.sleep(2000);

    // Digikey-specific price selectors
    const priceSelectors = [
      '[data-testid="price-breaks"] [data-testid="unit-price"]',
      '.product-dollars',
      '.pricing-table .unit-price',
      '.price-break-table .price',
      '[class*="unit-price"]',
      '[class*="product-price"]',
      '.price-each',
      '.unit-price'
    ];

    // Try to find current price (usually quantity 1 price)
    for (const selector of priceSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          // Digikey shows prices like "$12.34", "CAD $15.67"
          const priceMatch = text.match(/(?:CAD\s*\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2,4})?)/i);
          if (priceMatch) {
            const foundPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (foundPrice > 0 && (!price || foundPrice < price)) {
              price = foundPrice;
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for quantity break pricing (bulk discounts)
    const quantitySelectors = [
      '.price-break-table tr',
      '.pricing-table tr',
      '[data-testid="price-breaks"] tr'
    ];

    for (const selector of quantitySelectors) {
      try {
        const rows = await driver.findElements(By.css(selector));
        for (const row of rows) {
          const text = await row.getText();
          // Look for quantity 1 pricing vs bulk pricing
          if (text.includes('1 ') || text.includes('1\t')) {
            const priceMatch = text.match(/\$(\d+(?:\.\d{2,4})?)/);
            if (priceMatch) {
              const qty1Price = parseFloat(priceMatch[1]);
              if (qty1Price > 0) {
                price = qty1Price;
                break;
              }
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        const priceMatches = bodyText.match(/(?:CAD\s*\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2,4})?)/gi);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(p => {
            const match = p.match(/(\d+(?:,\d{3})*(?:\.\d{2,4})?)/);
            return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
          }).filter(p => p > 0 && p < 10000); // Filter reasonable component prices
          
          if (prices.length > 0) {
            prices.sort((a, b) => a - b);
            price = prices[0];
          }
        }
      } catch (error) {
        console.log(`Digikey text search failed: ${error.message}`);
      }
    }

    if (price) {
      console.log(`Found Digikey price: $${price}`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from Digikey: ${error.message}`);
    return null;
  }
}

/**
 * Extracts price from Vevor.ca specifically (industrial tools)
 */
async function extractPriceFromVevor(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Wait for page to load
    await driver.sleep(2000);

    // Vevor-specific price selectors
    const priceSelectors = [
      '.price-current',
      '.product-price .price',
      '[class*="price-now"]',
      '.now-price',
      '.price',
      '[class*="current-price"]'
    ];

    // Try to find current price
    for (const selector of priceSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          // Vevor shows prices like "C $ 119 22" (which means CAD $119.22)
          let priceMatch = text.match(/C\s*\$\s*(\d+)\s+(\d{2})/i);
          if (priceMatch) {
            const foundPrice = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
            if (foundPrice > 0 && (!price || foundPrice < price)) {
              price = foundPrice;
            }
          } else {
            // Standard format
            priceMatch = text.match(/(?:CAD\s*\$|C\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
            if (priceMatch) {
              const foundPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
              if (foundPrice > 0 && (!price || foundPrice < price)) {
                price = foundPrice;
              }
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for original/sale prices
    const compareSelectors = [
      '.price-original',
      '.was-price',
      '.compare-price',
      '[class*="original"][class*="price"]',
      '[class*="was"][class*="price"]'
    ];

    for (const selector of compareSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        const priceMatch = text.match(/(?:CAD\s*\$|C\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
        if (priceMatch) {
          originalPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
          isOnSale = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        // Look for the specific Vevor format "C $ 119 22"
        let priceMatch = bodyText.match(/C\s*\$\s*(\d+)\s+(\d{2})/i);
        if (priceMatch) {
          price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
        } else {
          // Standard format fallback
          const priceMatches = bodyText.match(/(?:CAD\s*\$|C\$|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi);
          if (priceMatches && priceMatches.length > 0) {
            const prices = priceMatches.map(p => {
              const match = p.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
              return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
            }).filter(p => p > 0 && p < 50000); // Filter reasonable tool prices
            
            if (prices.length > 0) {
              prices.sort((a, b) => a - b);
              price = prices[0];
            }
          }
        }
      } catch (error) {
        console.log(`Vevor text search failed: ${error.message}`);
      }
    }

    if (isOnSale && originalPrice) {
      console.log(`Found Vevor sale price: $${price} (was $${originalPrice}) - ${((originalPrice - price) / originalPrice * 100).toFixed(1)}% off`);
    } else if (price) {
      console.log(`Found Vevor price: $${price}`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from Vevor: ${error.message}`);
    return null;
  }
}

/**
 * Extracts price from Alibaba.com specifically (B2B marketplace)
 */
async function extractPriceFromAlibaba(driver) {
  try {
    let price = null;
    let isOnSale = false;
    let originalPrice = null;

    // Wait for page to fully load (Alibaba uses heavy JavaScript)
    await driver.sleep(3000);

    // Alibaba-specific price selectors
    const priceSelectors = [
      '.ma-spec-price .ma-spec-price-range-value',
      '.price-range-value',
      '.ma-reference-price .price',
      '.price-now',
      '[class*="price-range"]',
      '.reference-price',
      '.ma-price-range',
      '[class*="current-price"]'
    ];

    // Try to find current price
    for (const selector of priceSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const text = await element.getText();
          // Alibaba shows prices like "US $1.20-5.50", "$2.30 - $4.80"
          const priceMatch = text.match(/(?:US\s*\$|\$)\s*(\d+(?:\.\d{1,3})?)/i);
          if (priceMatch) {
            const foundPrice = parseFloat(priceMatch[1]);
            if (foundPrice > 0 && (!price || foundPrice < price)) {
              price = foundPrice;
            }
          }
        }
        if (price) break;
      } catch (error) {
        continue;
      }
    }

    // Look for MOQ (Minimum Order Quantity) pricing
    const moqSelectors = [
      '.ma-spec-moq',
      '.min-order',
      '[class*="moq"]',
      '.minimum-order'
    ];

    for (const selector of moqSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        // Extract minimum quantity for context
        const moqMatch = text.match(/(\d+)/);
        if (moqMatch) {
          console.log(`Found Alibaba MOQ: ${moqMatch[1]} pieces`);
        }
      } catch (error) {
        continue;
      }
    }

    // If still no price, try text-based search for price ranges
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        // Look for price ranges like "$1.20-5.50" or "US $2.30 - $4.80"
        const priceMatches = bodyText.match(/(?:US\s*\$|\$)\s*(\d+(?:\.\d{1,3})?)\s*[-–]\s*(?:\$)?(\d+(?:\.\d{1,3})?)/gi);
        if (priceMatches && priceMatches.length > 0) {
          const match = priceMatches[0].match(/(\d+(?:\.\d{1,3})?)/g);
          if (match && match.length >= 2) {
            const minPrice = parseFloat(match[0]);
            const maxPrice = parseFloat(match[1]);
            price = minPrice; // Take the lower price from the range
            console.log(`Found Alibaba price range: $${minPrice} - $${maxPrice}, using minimum price`);
          }
        } else {
          // Single price fallback
          const singlePriceMatches = bodyText.match(/(?:US\s*\$|\$)\s*(\d+(?:\.\d{1,3})?)/gi);
          if (singlePriceMatches && singlePriceMatches.length > 0) {
            const prices = singlePriceMatches.map(p => {
              const match = p.match(/(\d+(?:\.\d{1,3})?)/);
              return match ? parseFloat(match[1]) : 0;
            }).filter(p => p > 0 && p < 10000); // Filter reasonable B2B prices
            
            if (prices.length > 0) {
              prices.sort((a, b) => a - b);
              price = prices[0];
            }
          }
        }
      } catch (error) {
        console.log(`Alibaba text search failed: ${error.message}`);
      }
    }

    if (price) {
      console.log(`Found Alibaba price: $${price} (B2B pricing)`);
    }

    return price ? { price, isOnSale, originalPrice } : null;
  } catch (error) {
    console.error(`Error extracting price from Alibaba: ${error.message}`);
    return null;
  }
}

/**
 * Generic price extraction for other e-commerce sites
 */
async function extractPriceGeneric(driver) {
  try {
    // Common price selectors for different e-commerce sites
    const priceSelectors = [
      // General price patterns
      '[data-testid*="price"]',
      '[class*="price"]',
      '[id*="price"]',
      '.price',
      '#price',
      // Amazon specific
      '.a-price-whole',
      '.a-offscreen',
      // Other common patterns
      '[class*="cost"]',
      '[class*="amount"]',
      'span[class*="currency"]',
      'span[class*="money"]'
    ];

    let price = null;
    
    for (const selector of priceSelectors) {
      try {
        const element = await driver.findElement(By.css(selector));
        const text = await element.getText();
        
        // Extract price from text using regex
        const priceMatch = text.match(/[\$£€¥]?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        if (priceMatch) {
          // Remove commas and convert to number
          price = parseFloat(priceMatch[1].replace(/,/g, ''));
          console.log(`Found price: $${price} using selector: ${selector}`);
          break;
        }
      } catch (error) {
        // Continue to next selector
        continue;
      }
    }

    // If no price found with CSS selectors, try text search
    if (!price) {
      try {
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        const priceMatches = bodyText.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
        
        if (priceMatches && priceMatches.length > 0) {
          // Take the first price found
          const firstPrice = priceMatches[0].replace(/[\$,]/g, '');
          price = parseFloat(firstPrice);
          console.log(`Found price via text search: $${price}`);
        }
      } catch (error) {
        console.log(`Text search failed: ${error.message}`);
      }
    }

    return price;
  } catch (error) {
    console.error(`Error in generic price extraction: ${error.message}`);
    return null;
  }
}

/**
 * Records a price change in the part_price_history table
 */
async function recordPartPriceHistory(partId, price, note = 'Automated update', supplierId, isOnSale = false, originalPrice = null) {
  if (isDryRun) {
    console.log(`[DRY RUN] Would record price history for part ${partId}: $${price} (supplier: ${supplierId || 'unknown'})${isOnSale ? ` - ON SALE (was $${originalPrice})` : ''}`);
    return true;
  }

  try {
    const historyEntry = {
      part_id: partId,
      price: price,
      recorded_at: new Date().toISOString(),
      note: note,
      supplier_id: supplierId,
      is_on_sale: isOnSale,
      original_price: originalPrice,
      discount_percentage: isOnSale && originalPrice ? ((originalPrice - price) / originalPrice * 100).toFixed(2) : null
    };

    const { error } = await supabase
      .from('part_price_history')
      .insert([historyEntry]);

    if (error) {
      throw error;
    }

    const saleInfo = isOnSale ? ` - ON SALE (was $${originalPrice}, ${historyEntry.discount_percentage}% off)` : '';
    console.log(`Recorded price history for part ${partId}: $${price} (supplier: ${supplierId || 'unknown'})${saleInfo}`);
    return true;
  } catch (error) {
    console.error(`Failed to record price history for part ${partId}: ${error.message}`);
    return false;
  }
}

/**
 * Records a price change in the material_price_history table
 */
async function recordMaterialPriceHistory(materialId, price, note = 'Automated update', supplierId, isOnSale = false, originalPrice = null) {
  if (isDryRun) {
    console.log(`[DRY RUN] Would record price history for material ${materialId}: $${price} (supplier: ${supplierId || 'unknown'})${isOnSale ? ` - ON SALE (was $${originalPrice})` : ''}`);
    return true;
  }

  try {
    const historyEntry = {
      material_id: materialId,
      price: price,
      recorded_at: new Date().toISOString(),
      note: note,
      supplier_id: supplierId,
      is_on_sale: isOnSale,
      original_price: originalPrice,
      discount_percentage: isOnSale && originalPrice ? ((originalPrice - price) / originalPrice * 100).toFixed(2) : null
    };

    const { error } = await supabase
      .from('material_price_history')
      .insert([historyEntry]);

    if (error) {
      throw error;
    }

    const saleInfo = isOnSale ? ` - ON SALE (was $${originalPrice}, ${historyEntry.discount_percentage}% off)` : '';
    console.log(`Recorded price history for material ${materialId}: $${price} (supplier: ${supplierId || 'unknown'})${saleInfo}`);
    return true;
  } catch (error) {
    console.error(`Failed to record price history for material ${materialId}: ${error.message}`);
    return false;
  }
}

/**
 * Updates material prices in the database and records in history
 */
async function updateMaterialPrices(specificMaterialId) {
  try {
    // Get all material suppliers with links, optionally filtering by material_id
    let query = supabase
      .from('material_suppliers')
      .select(`
        id,
        material_id,
        supplier_id,
        link,
        sku,
        price_per_unit,
        materials:material_id(id, name, price_per_unit),
        suppliers:supplier_id(name)
      `)
      .not('link', 'is', null);

    if (specificMaterialId) {
      query = query.eq('material_id', specificMaterialId);
    }

    const { data: materialSuppliers, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${materialSuppliers.length} material suppliers with links to check`);

    // Process each material supplier
    const results = [];
    for (const supplier of materialSuppliers) {
      if (!supplier.link) continue;

      console.log(`\nProcessing material supplier ${supplier.id} for material: ${supplier.materials?.name || supplier.material_id}`);
      
      const priceInfo = await fetchPriceFromSupplier(
        supplier.link, 
        supplier.sku, 
        supplier.suppliers?.name
      );

      // Only update if we got a valid price and it's different from the current price
      if (priceInfo !== null && priceInfo.price !== supplier.price_per_unit) {
        const newPrice = priceInfo.price;
        const oldPrice = supplier.price_per_unit || 0;
        const percentChange = ((newPrice - oldPrice) / (oldPrice || 1)) * 100;
        
        let note = `Automated update: ${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        if (priceInfo.isOnSale) {
          const discount = ((priceInfo.originalPrice - newPrice) / priceInfo.originalPrice * 100).toFixed(1);
          note += ` - ON SALE (${discount}% off from $${priceInfo.originalPrice})`;
        }

        if (!isDryRun) {
          // Update the material_supplier price_per_unit
          const { error: updateError } = await supabase
            .from('material_suppliers')
            .update({ price_per_unit: newPrice })
            .eq('id', supplier.id);

          if (updateError) {
            console.error(`Error updating material supplier ${supplier.id}: ${updateError.message}`);
            continue;
          }

          // Also update the main material price if needed
          if (supplier.materials && supplier.materials.price_per_unit !== newPrice) {
            const { error: materialUpdateError } = await supabase
              .from('materials')
              .update({ price_per_unit: newPrice })
              .eq('id', supplier.material_id);

            if (materialUpdateError) {
              console.error(`Error updating material ${supplier.material_id}: ${materialUpdateError.message}`);
            }
          }
        }

        // Record the price change in history with sale information
        const recorded = await recordMaterialPriceHistory(
          supplier.material_id, 
          newPrice, 
          note, 
          supplier.supplier_id,
          priceInfo.isOnSale,
          priceInfo.originalPrice
        );

        results.push({
          material_id: supplier.material_id,
          name: supplier.materials?.name,
          supplier_name: supplier.suppliers?.name,
          supplier_id: supplier.supplier_id,
          oldPrice: oldPrice,
          newPrice,
          percentChange,
          isOnSale: priceInfo.isOnSale,
          originalPrice: priceInfo.originalPrice,
          recorded
        });

        const saleInfo = priceInfo.isOnSale ? ` (ON SALE - was $${priceInfo.originalPrice})` : '';
        console.log(`${isDryRun ? '[DRY RUN] ' : ''}Updated material price: ${supplier.materials?.name || supplier.material_id} - $${oldPrice} → $${newPrice} (${percentChange.toFixed(2)}%)${saleInfo}`);
      } else if (priceInfo === null) {
        console.log(`Skipping material supplier ${supplier.id}: No price fetched`);
      } else {
        console.log(`Skipping material supplier ${supplier.id}: Price unchanged ($${supplier.price_per_unit})`);
      }

      // Add delay between requests to be respectful to websites
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      success: true,
      message: `Processed ${materialSuppliers.length} material suppliers`,
      updatedCount: results.length,
      results
    };
  } catch (error) {
    console.error(`Error in updateMaterialPrices: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates part prices in the database and records in history
 */
async function updatePartPrices(specificPartId) {
  try {
    // Get all part suppliers with links, optionally filtering by part_id
    let query = supabase
      .from('part_suppliers')
      .select(`
        id,
        part_id,
        supplier_id,
        link,
        sku,
        unit_cost,
        parts:part_id(id, name, cost),
        suppliers:supplier_id(name)
      `)
      .not('link', 'is', null);

    if (specificPartId) {
      query = query.eq('part_id', specificPartId);
    }

    const { data: partSuppliers, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${partSuppliers.length} part suppliers with links to check`);

    // Process each part supplier
    const results = [];
    for (const supplier of partSuppliers) {
      if (!supplier.link) continue;

      console.log(`\nProcessing supplier ${supplier.id} for part: ${supplier.parts?.name || supplier.part_id}`);
      
      const priceInfo = await fetchPriceFromSupplier(
        supplier.link, 
        supplier.sku, 
        supplier.suppliers?.name
      );

      // Only update if we got a valid price and it's different from the current price
      if (priceInfo !== null && priceInfo.price !== supplier.unit_cost) {
        const newPrice = priceInfo.price;
        const oldPrice = supplier.unit_cost || 0;
        const percentChange = ((newPrice - oldPrice) / (oldPrice || 1)) * 100;
        
        let note = `Automated update: ${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        if (priceInfo.isOnSale) {
          const discount = ((priceInfo.originalPrice - newPrice) / priceInfo.originalPrice * 100).toFixed(1);
          note += ` - ON SALE (${discount}% off from $${priceInfo.originalPrice})`;
        }

        if (!isDryRun) {
          // Update the part_supplier unit_cost
          const { error: updateError } = await supabase
            .from('part_suppliers')
            .update({ unit_cost: newPrice })
            .eq('id', supplier.id);

          if (updateError) {
            console.error(`Error updating part supplier ${supplier.id}: ${updateError.message}`);
            continue;
          }

          // Also update the main part cost if needed
          if (supplier.parts && supplier.parts.cost !== newPrice) {
            const { error: partUpdateError } = await supabase
              .from('parts')
              .update({ cost: newPrice })
              .eq('id', supplier.part_id);

            if (partUpdateError) {
              console.error(`Error updating part ${supplier.part_id}: ${partUpdateError.message}`);
            }
          }
        }

        // Record the price change in history with sale information
        const recorded = await recordPartPriceHistory(
          supplier.part_id, 
          newPrice, 
          note, 
          supplier.supplier_id,
          priceInfo.isOnSale,
          priceInfo.originalPrice
        );

        results.push({
          part_id: supplier.part_id,
          name: supplier.parts?.name,
          supplier_name: supplier.suppliers?.name,
          supplier_id: supplier.supplier_id,
          oldPrice: oldPrice,
          newPrice,
          percentChange,
          isOnSale: priceInfo.isOnSale,
          originalPrice: priceInfo.originalPrice,
          recorded
        });

        const saleInfo = priceInfo.isOnSale ? ` (ON SALE - was $${priceInfo.originalPrice})` : '';
        console.log(`${isDryRun ? '[DRY RUN] ' : ''}Updated price: ${supplier.parts?.name || supplier.part_id} - $${oldPrice} → $${newPrice} (${percentChange.toFixed(2)}%)${saleInfo}`);
      } else if (priceInfo === null) {
        console.log(`Skipping part supplier ${supplier.id}: No price fetched`);
      } else {
        console.log(`Skipping part supplier ${supplier.id}: Price unchanged ($${supplier.unit_cost})`);
      }

      // Add delay between requests to be respectful to websites
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      success: true,
      message: `Processed ${partSuppliers.length} part suppliers`,
      updatedCount: results.length,
      results
    };
  } catch (error) {
    console.error(`Error in updatePartPrices: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function to run the price update process
 */
async function runPriceUpdate() {
  console.log(`\n=== Price Update Job Started at ${new Date().toISOString()} ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);
  
  try {
    // Update both parts and materials
    console.log('\n🔧 Starting PARTS price update...');
    const partResult = await updatePartPrices();
    
    console.log('\n🧱 Starting MATERIALS price update...');
    const materialResult = await updateMaterialPrices();
    
    // Combine results
    const totalUpdated = (partResult.updatedCount || 0) + (materialResult.updatedCount || 0);
    const totalProcessed = (partResult.results?.length || 0) + (materialResult.results?.length || 0);
    
    if (partResult.success && materialResult.success) {
      console.log(`\n✅ Price update completed successfully!`);
      console.log(`📊 Summary: ${totalUpdated} prices updated out of ${totalProcessed} checked`);
      
      // Show part updates
      if (partResult.results && partResult.results.length > 0) {
        console.log('\n🔧 Updated PART prices:');
        partResult.results.forEach(item => {
          const saleInfo = item.isOnSale ? ` 🔥 ON SALE (was $${item.originalPrice})` : '';
          console.log(`  • ${item.name || item.part_id}: $${item.oldPrice} → $${item.newPrice} (${item.percentChange.toFixed(2)}%)${saleInfo}`);
        });
      }
      
      // Show material updates
      if (materialResult.results && materialResult.results.length > 0) {
        console.log('\n🧱 Updated MATERIAL prices:');
        materialResult.results.forEach(item => {
          const saleInfo = item.isOnSale ? ` 🔥 ON SALE (was $${item.originalPrice})` : '';
          console.log(`  • ${item.name || item.material_id}: $${item.oldPrice} → $${item.newPrice} (${item.percentChange.toFixed(2)}%)${saleInfo}`);
        });
      }
    } else {
      if (!partResult.success) {
        console.error(`❌ Parts price update failed: ${partResult.error}`);
      }
      if (!materialResult.success) {
        console.error(`❌ Materials price update failed: ${materialResult.error}`);
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  
  console.log(`=== Price Update Job Ended at ${new Date().toISOString()} ===\n`);
}

// Main execution logic
if (runOnce || isDryRun) {
  // Run once and exit
  runPriceUpdate().then(() => {
    console.log('Single run completed. Exiting...');
    process.exit(0);
  }).catch(error => {
    console.error('Error during single run:', error);
    process.exit(1);
  });
} else {
  // Schedule as cron job
  console.log('🚀 Price Updater Cron Job Starting...');
  console.log('📅 Scheduled to run every day at 9:00 AM');
  
  // Schedule to run every day at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    runPriceUpdate();
  });

  // Also run immediately on startup
  console.log('▶️  Running initial price update...');
  runPriceUpdate();
  
  // Keep the process running
  console.log('✅ Cron job scheduled. Press Ctrl+C to stop.');
} 