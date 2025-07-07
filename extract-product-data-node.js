// Node.js version for extracting product data from supplier URLs
// This helps populate material or part entries by scraping product information

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// For Node.js versions < 18, uncomment the line below and run: npm install node-fetch
// const fetch = require('node-fetch');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Extracts product information from a supplier's website
 */
async function extractProductData(url, expectedType = null) {
  if (!url) {
    return { error: "No URL provided" };
  }

  try {
    console.log(`Extracting product data from: ${url}`);
    
    // Add random delay to avoid being detected as bot
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    // Fetch the page HTML with enhanced headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Check for Amazon CAPTCHA or robot detection
    if (html.includes('Enter the characters you see below') || 
        html.includes('Sorry, we just need to make sure you\'re not a robot') ||
        html.includes('Type the characters you see in this image')) {
      throw new Error('Amazon CAPTCHA detected - the website is blocking automated requests. Try accessing the URL manually in a browser first, or use a different approach.');
    }
    
    // Initialize extracted data object
    const productData = {
      url: url,
      name: null,
      description: null,
      price: null,
      currency: null,
      specifications: {},
      images: [],
      brand: null,
      model: null,
      sku: null,
      availability: null,
      category: null,
      dimensions: {},
      material_type: null,
      extracted_at: new Date().toISOString()
    };

    // Extract title/name
    const titlePatterns = [
      /<title[^>]*>([^<]+)<\/title>/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="title"[^>]*content="([^"]+)"/i
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.name = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    // Extract description
    const descriptionPatterns = [
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/i
    ];

    for (const pattern of descriptionPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.description = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    // Extract price (handles both comma and period decimal separators)
    const pricePatterns = [
      /[\$£€¥](\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?)/g,
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>.*?[\$£€¥]?(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?).*?<\/span>/gi,
      /<div[^>]*class="[^"]*price[^"]*"[^>]*>.*?[\$£€¥]?(\d+(?:[,\.]\d{1,3})*(?:[,\.]\d{1,2})?).*?<\/div>/gi
    ];

    for (const pattern of pricePatterns) {
      try {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          if (match && match[1]) {
            const priceValue = safeParseFloat(match[1]);
            if (priceValue && priceValue > 0) {
              productData.price = priceValue;
              // Determine currency from the original match
              const currencyMatch = match[0].match(/[\$£€¥]/);
              if (currencyMatch) {
                const currencyMap = { '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY' };
                productData.currency = currencyMap[currencyMatch[0]] || 'USD';
              }
              break;
            }
          }
        }
        if (productData.price) break;
      } catch (e) {
        // Skip patterns that don't have global flag
        console.warn(`Price pattern matching failed: ${e.message}`);
      }
    }

    // Extract brand
    const brandPatterns = [
      /<meta[^>]*property="product:brand"[^>]*content="([^"]+)"/i,
      /<span[^>]*class="[^"]*brand[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class="[^"]*brand[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<span[^>]*id="[^"]*brand[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<a[^>]*id="bylineInfo"[^>]*>([^<]+)<\/a>/i, // Amazon brand link
      /by\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s|$|<)/i, // "by BrandName" pattern
      /Brand[:\s]*([A-Za-z0-9\s&\-]+?)(?:\s|$|<)/i
    ];

    for (const pattern of brandPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let brandName = match[1].trim();
        // Clean up common junk text
        if (brandName.length > 3 && 
            !brandName.toLowerCase().includes('logo') &&
            !brandName.toLowerCase().includes('byline') &&
            !brandName.toLowerCase().includes('regardless') &&
            !brandName.toLowerCase().includes('weblab') &&
            !brandName.toLowerCase().includes('treatment') &&
            brandName.length < 50) {
          productData.brand = brandName;
          break;
        }
      }
    }

    // Extract model/SKU
    const skuPatterns = [
      /SKU[:\s]*([A-Za-z0-9\-_]+)/i,
      /Model[:\s]*([A-Za-z0-9\-_\s]+)/i,
      /Part\s*Number[:\s]*([A-Za-z0-9\-_]+)/i,
      /<span[^>]*class="[^"]*sku[^"]*"[^>]*>([^<]+)<\/span>/i
    ];

    for (const pattern of skuPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.sku = match[1].trim();
        break;
      }
    }

    // Extract dimensions (handles both comma and period decimal separators)
    // First check the product title/name for dimensions since they're often there
    const titleText = productData.name || '';
    
    const dimensionPatterns = [
      /(\d+(?:[,\.]\d+)?)\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /(\d+(?:[,\.]\d+)?)\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /Length[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /Width[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /Height[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /Diameter[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches?|ft|feet)/gi,
      /(\d+(?:[,\.]\d+)?)\s*["″]\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*["″]/gi, // Handle inches with quote marks
      /(\d+(?:[,\.]\d+)?)\s*'\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*'/gi, // Handle feet with apostrophes
      /(\d+(?:\/\d+)?)\s*(?:x|×)\s*(\d+(?:\/\d+)?)\s*(?:x|×)?\s*(\d+(?:\/\d+)?)?\s*(in|inch|inches|ft|feet)/gi // Handle fractions
    ];

    // Search in both title and full HTML content
    const searchTexts = [titleText, html];
    
    for (const searchText of searchTexts) {
      for (const pattern of dimensionPatterns) {
        try {
          const matches = searchText.matchAll(pattern);
          for (const match of matches) {
            if (match && match.length >= 3) {
              if (match.length >= 5 && match[3]) {
                // 3D dimensions (L x W x H)
                const length = parseDimensionValue(match[1]);
                const width = parseDimensionValue(match[2]);
                const height = parseDimensionValue(match[3]);
                
                if (length && width && height) {
                  productData.dimensions = {
                    length: length,
                    width: width,
                    height: height,
                    unit: normalizeUnit(match[4])
                  };
                  break;
                }
              } else if (match.length >= 4 && match[2]) {
                // 2D dimensions (L x W)
                const length = parseDimensionValue(match[1]);
                const width = parseDimensionValue(match[2]);
                
                if (length && width) {
                  productData.dimensions = {
                    length: length,
                    width: width,
                    unit: normalizeUnit(match[3])
                  };
                  break;
                }
              } else if (match.length >= 3) {
                // Single dimension with label
                const dimensionValue = parseDimensionValue(match[1]);
                if (dimensionValue) {
                  const dimensionType = match[0].toLowerCase().includes('length') ? 'length' :
                                      match[0].toLowerCase().includes('width') ? 'width' :
                                      match[0].toLowerCase().includes('height') ? 'height' :
                                      match[0].toLowerCase().includes('diameter') ? 'diameter' : 'length';
                  
                  if (!productData.dimensions || !productData.dimensions[dimensionType]) {
                    if (!productData.dimensions) productData.dimensions = {};
                    productData.dimensions[dimensionType] = dimensionValue;
                    productData.dimensions.unit = normalizeUnit(match[2]);
                  }
                }
              }
            }
          }
          // If we found dimensions, stop searching
          if (productData.dimensions && Object.keys(productData.dimensions).length > 1) {
            break;
          }
        } catch (e) {
          // Skip patterns that don't have global flag
          console.warn(`Dimension pattern matching failed: ${e.message}`);
        }
      }
      // If we found dimensions in title, don't need to search HTML
      if (productData.dimensions && Object.keys(productData.dimensions).length > 1) {
        break;
      }
    }

    // Extract material type
    const materialPatterns = [
      /Material[:\s]*([A-Za-z0-9\s\-_]+)/i,
      /(Aluminum|Aluminium|Steel|Stainless Steel|Plastic|Copper|Brass|Bronze|Iron|Wood|Glass|Carbon Fiber|Titanium)/i
    ];

    for (const pattern of materialPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.material_type = match[1].trim();
        break;
      }
    }

    // Extract availability
    const availabilityPatterns = [
      /(In Stock|Out of Stock|Available|Unavailable|Limited Stock)/i,
      /<span[^>]*class="[^"]*stock[^"]*"[^>]*>([^<]+)<\/span>/i
    ];

    for (const pattern of availabilityPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.availability = match[1].trim();
        break;
      }
    }

    // Extract lead time / delivery information
    const leadTimePatterns = [
      /(?:delivery|shipping|arrives?|ships?)[^\.]*?(\d+)(?:-(\d+))?\s*(?:business\s+)?days?/gi,
      /(?:delivery|shipping|arrives?|ships?)[^\.]*?(\d+)(?:-(\d+))?\s*(?:to\s+)?(\d+)\s*(?:business\s+)?days?/gi,
      /(\d+)(?:-(\d+))?\s*(?:business\s+)?days?\s*(?:delivery|shipping|to\s+arrive|to\s+ship)/gi,
      /(?:estimated\s+)?(?:delivery|shipping|arrival).*?(\d+)(?:-(\d+))?\s*(?:business\s+)?days?/gi,
      /(?:ships?\s+in|ready\s+in|dispatches?\s+in|available\s+in)\s*(\d+)(?:-(\d+))?\s*(?:business\s+)?days?/gi,
      /(?:lead\s+time|processing\s+time|handling\s+time).*?(\d+)(?:-(\d+))?\s*(?:business\s+)?days?/gi
    ];

    let leadTimeDays = null;
    for (const pattern of leadTimePatterns) {
      try {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          if (match && match[1]) {
            const minDays = parseInt(match[1]);
            const maxDays = match[2] ? parseInt(match[2]) : null;
            
            // Use the maximum days if range is provided, otherwise use the single value
            const extractedDays = maxDays ? maxDays : minDays;
            
            // Reasonable lead time validation (1-90 days)
            if (extractedDays >= 1 && extractedDays <= 90) {
              leadTimeDays = extractedDays;
              console.log(`Extracted lead time: ${leadTimeDays} days from "${match[0]}"`);
              break;
            }
          }
        }
        if (leadTimeDays) break;
      } catch (e) {
        // Skip patterns that don't have global flag
        console.warn(`Lead time pattern matching failed: ${e.message}`);
      }
    }
    
    productData.lead_time_days = leadTimeDays;

    // Extract images
    const imagePatterns = [
      /<img[^>]*src="([^"]*product[^"]*\.(?:jpg|jpeg|png|webp))"[^>]*>/gi,
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/gi
    ];

    for (const pattern of imagePatterns) {
      try {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          if (match && match[1] && !productData.images.includes(match[1])) {
            productData.images.push(match[1]);
          }
        }
      } catch (e) {
        // Skip patterns that don't have global flag
        console.warn(`Image pattern matching failed: ${e.message}`);
      }
    }

    // Enhanced classification system
    const classification = classifyProduct(productData, expectedType);
    productData.suggested_type = classification.type;
    productData.confidence = classification.confidence;
    productData.classification_reasons = classification.reasons;

    // Clean up extracted data
    if (productData.name) {
      productData.name = productData.name.replace(/[^\w\s\-\.]/g, '').trim();
    }
    if (productData.description) {
      productData.description = productData.description.replace(/[^\w\s\-\.,]/g, '').trim();
      productData.description = productData.description.substring(0, 500); // Limit length
    }

    return {
      success: true,
      data: productData,
      message: "Product data extracted successfully"
    };

  } catch (error) {
    console.error(`Error extracting product data: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Normalizes decimal separators (converts comma to period for parseFloat)
 */
function normalizeDecimal(value) {
  if (typeof value !== 'string') return value;
  
  // Handle cases like "30,5" (European decimal) vs "1,234.56" (US thousands separator)
  // If there's both comma and period, assume US format (comma = thousands, period = decimal)
  if (value.includes(',') && value.includes('.')) {
    // US format: 1,234.56 - remove commas, keep period
    return value.replace(/,/g, '');
  } else if (value.includes(',')) {
    // Check if comma is likely a decimal separator
    const commaIndex = value.lastIndexOf(',');
    const afterComma = value.substring(commaIndex + 1);
    
    // If 1-3 digits after comma, likely decimal separator
    // If more than 3 digits, likely thousands separator
    if (afterComma.length <= 3 && !/\d{4,}/.test(afterComma)) {
      return value.replace(',', '.');
    } else {
      // Thousands separator, remove it
      return value.replace(/,/g, '');
    }
  }
  
  return value;
}

/**
 * Safe parseFloat that handles different decimal separators
 */
function safeParseFloat(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;
  
  const normalized = normalizeDecimal(value.toString());
  const parsed = parseFloat(normalized);
  
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse dimension values including fractions and decimals
 */
function parseDimensionValue(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;

  const valueStr = value.toString().trim();
  
  // Handle fractions like "1/4", "3/8", etc.
  if (valueStr.includes('/')) {
    const parts = valueStr.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
  }
  
  // Handle regular decimal numbers
  return safeParseFloat(valueStr);
}

/**
 * Normalize unit names to standard format
 */
function normalizeUnit(unit) {
  if (!unit) return 'mm';
  
  const unitStr = unit.toLowerCase().trim();
  
  // Map various unit formats to standard ones
  const unitMap = {
    'mm': 'mm',
    'millimeter': 'mm',
    'millimeters': 'mm',
    'cm': 'cm', 
    'centimeter': 'cm',
    'centimeters': 'cm',
    'in': 'in',
    'inch': 'in',
    'inches': 'in',
    '"': 'in',
    '″': 'in',
    'ft': 'ft',
    'feet': 'ft',
    'foot': 'ft',
    "'": 'ft'
  };
  
  return unitMap[unitStr] || unitStr;
}

/**
 * Enhanced product classification system
 */
function classifyProduct(productData, expectedType = null) {
  const content = ((productData.name || '') + ' ' + (productData.description || '')).toLowerCase();
  const url = (productData.url || '').toLowerCase();
  
  let scores = { part: 0, material: 0 };
  let reasons = [];

  // If user specified the type, give it high confidence
  if (expectedType === 'part' || expectedType === 'material') {
    scores[expectedType] += 50;
    reasons.push(`User specified as ${expectedType}`);
  }

  // Strong part indicators
  const partKeywords = {
    // Fasteners
    high: ['bolt', 'screw', 'fastener', 'washer', 'nut', 'rivet', 'pin', 'clip'],
    // Mechanical components
    medium: ['bearing', 'gear', 'spring', 'valve', 'fitting', 'connector', 'switch', 'sensor'],
    // Electronics
    low: ['resistor', 'capacitor', 'chip', 'module', 'component', 'assembly']
  };

  // Strong material indicators  
  const materialKeywords = {
    // Raw materials
    high: ['sheet', 'plate', 'bar', 'tube', 'pipe', 'rod', 'wire', 'strip', 'foil', 'mesh'],
    // Bulk materials
    medium: ['lumber', 'plywood', 'fabric', 'leather', 'rubber', 'foam', 'insulation'],
    // Processed materials
    low: ['stock', 'blank', 'raw', 'material', 'supply']
  };

  // Score based on keywords
  Object.entries(partKeywords).forEach(([weight, keywords]) => {
    const multiplier = weight === 'high' ? 10 : weight === 'medium' ? 5 : 2;
    keywords.forEach(keyword => {
      if (content.includes(keyword)) {
        scores.part += multiplier;
        reasons.push(`Part keyword: "${keyword}" (${weight} confidence)`);
      }
    });
  });

  Object.entries(materialKeywords).forEach(([weight, keywords]) => {
    const multiplier = weight === 'high' ? 10 : weight === 'medium' ? 5 : 2;
    keywords.forEach(keyword => {
      if (content.includes(keyword)) {
        scores.material += multiplier;
        reasons.push(`Material keyword: "${keyword}" (${weight} confidence)`);
      }
    });
  });

  // Analyze dimensions for materials (materials often have dimensional specs)
  if (productData.dimensions && Object.keys(productData.dimensions).length > 1) {
    scores.material += 5;
    reasons.push('Has dimensional specifications (material indicator)');
  }

  // Check for quantity/bulk indicators
  const bulkIndicators = ['per foot', 'per meter', 'per yard', 'per sheet', 'per roll', 'bulk', 'wholesale'];
  if (bulkIndicators.some(indicator => content.includes(indicator))) {
    scores.material += 8;
    reasons.push('Bulk/quantity selling (material indicator)');
  }

  // Check for assembly/manufactured indicators
  const assemblyIndicators = ['assembled', 'manufactured', 'machined', 'precision', 'tolerance', 'specification'];
  if (assemblyIndicators.some(indicator => content.includes(indicator))) {
    scores.part += 6;
    reasons.push('Manufacturing/precision terms (part indicator)');
  }

  // URL analysis
  const urlIndicators = {
    part: ['parts', 'components', 'fasteners', 'hardware'],
    material: ['materials', 'supplies', 'stock', 'raw', 'sheets', 'bars']
  };

  Object.entries(urlIndicators).forEach(([type, indicators]) => {
    indicators.forEach(indicator => {
      if (url.includes(indicator)) {
        scores[type] += 3;
        reasons.push(`URL contains "${indicator}" (${type} indicator)`);
      }
    });
  });

  // Material type analysis
  if (productData.material_type) {
    const materialTypes = ['aluminum', 'steel', 'plastic', 'wood', 'copper', 'brass', 'titanium'];
    if (materialTypes.some(mat => productData.material_type.toLowerCase().includes(mat))) {
      // Could be either, but slight material bias
      scores.material += 2;
      reasons.push('Specific material type mentioned');
    }
  }

  // Size/dimension patterns typical of materials
  if (productData.name) {
    // Pattern like "1/4 inch x 12 inch" or "25mm x 50mm"
    const sizePattern = /\d+\s*(?:mm|cm|inch|in|ft|'|")\s*[x×]\s*\d+/i;
    if (sizePattern.test(productData.name)) {
      scores.material += 7;
      reasons.push('Dimensional sizing in name (material indicator)');
    }
  }

  // Determine final classification
  const totalScore = scores.part + scores.material;
  let finalType, confidence;

  if (totalScore === 0) {
    finalType = 'unknown';
    confidence = 0;
    reasons.push('No clear indicators found');
  } else if (scores.part > scores.material) {
    finalType = 'part';
    confidence = Math.min(95, Math.round((scores.part / totalScore) * 100));
  } else if (scores.material > scores.part) {
    finalType = 'material';
    confidence = Math.min(95, Math.round((scores.material / totalScore) * 100));
  } else {
    // Tie - default to expected type or unknown
    finalType = expectedType || 'unknown';
    confidence = 50;
    reasons.push('Equal indicators for both types');
  }

  return {
    type: finalType,
    confidence: confidence,
    reasons: reasons,
    scores: scores
  };
}

/**
 * Prepares dimension strings for the TEXT dimension fields in materials table
 */
function prepareDimensionStrings(dimensions) {
  const result = {
    size_x_mm: null,
    size_y_mm: null, 
    size_z_mm: null,
    size_x_inches: null,
    size_y_inches: null,
    size_z_inches: null
  };

  if (!dimensions || Object.keys(dimensions).length === 0) {
    return result;
  }

  // Convert all dimensions to strings for the TEXT fields
  if (dimensions.length !== undefined) {
    const lengthValue = safeParseFloat(dimensions.length);
    if (lengthValue) {
      if (dimensions.unit === 'mm') {
        result.size_x_mm = lengthValue.toString();
        result.size_x_inches = (lengthValue / 25.4).toFixed(3);
      } else if (dimensions.unit === 'cm') {
        result.size_x_mm = (lengthValue * 10).toFixed(1);
        result.size_x_inches = (lengthValue / 2.54).toFixed(3);
      } else if (dimensions.unit === 'in' || dimensions.unit === 'inches') {
        result.size_x_inches = lengthValue.toString();
        result.size_x_mm = (lengthValue * 25.4).toFixed(1);
      }
    }
  }

  if (dimensions.width !== undefined) {
    const widthValue = safeParseFloat(dimensions.width);
    if (widthValue) {
      if (dimensions.unit === 'mm') {
        result.size_y_mm = widthValue.toString();
        result.size_y_inches = (widthValue / 25.4).toFixed(3);
      } else if (dimensions.unit === 'cm') {
        result.size_y_mm = (widthValue * 10).toFixed(1);
        result.size_y_inches = (widthValue / 2.54).toFixed(3);
      } else if (dimensions.unit === 'in' || dimensions.unit === 'inches') {
        result.size_y_inches = widthValue.toString();
        result.size_y_mm = (widthValue * 25.4).toFixed(1);
      }
    }
  }

  if (dimensions.height !== undefined) {
    const heightValue = safeParseFloat(dimensions.height);
    if (heightValue) {
      if (dimensions.unit === 'mm') {
        result.size_z_mm = heightValue.toString();
        result.size_z_inches = (heightValue / 25.4).toFixed(3);
      } else if (dimensions.unit === 'cm') {
        result.size_z_mm = (heightValue * 10).toFixed(1);
        result.size_z_inches = (heightValue / 2.54).toFixed(3);
      } else if (dimensions.unit === 'in' || dimensions.unit === 'inches') {
        result.size_z_inches = heightValue.toString();
        result.size_z_mm = (heightValue * 25.4).toFixed(1);
      }
    }
  }

  // Handle diameter for round materials
  if (dimensions.diameter !== undefined) {
    if (dimensions.unit === 'mm') {
      result.size_x_mm = dimensions.diameter.toString();
      result.size_x_inches = (dimensions.diameter / 25.4).toFixed(3);
    } else if (dimensions.unit === 'cm') {
      result.size_x_mm = (dimensions.diameter * 10).toFixed(1);
      result.size_x_inches = (dimensions.diameter / 2.54).toFixed(3);
    } else if (dimensions.unit === 'in' || dimensions.unit === 'inches') {
      result.size_x_inches = dimensions.diameter.toString();
      result.size_x_mm = (dimensions.diameter * 25.4).toFixed(1);
    }
  }

  return result;
}

/**
 * Suggests database fields for part or material based on extracted data
 */
function suggestDatabaseFields(productData) {
  const suggestions = {
    parts: {},
    materials: {}
  };

  if (productData.suggested_type === 'part' || productData.suggested_type === 'unknown') {
    suggestions.parts = {
      name: productData.name || '',
      cost: productData.price || 0,
      description: productData.description || '',
      supplier: productData.brand || '',
      sku: productData.sku || '',
      link: productData.url,
      category: productData.category || '',
      in_stock: 0 // Default, user should update
    };
  }

  if (productData.suggested_type === 'material' || productData.suggested_type === 'unknown') {
    // Prepare dimension strings for the TEXT fields
    const dimensionStrings = prepareDimensionStrings(productData.dimensions);
    
    suggestions.materials = {
      name: productData.name || '',
      size_mm: productData.dimensions.length || null,
      size_inches: productData.dimensions.unit === 'mm' && productData.dimensions.length ? 
        (productData.dimensions.length / 25.4).toFixed(3) : 
        (productData.dimensions.unit === 'in' || productData.dimensions.unit === 'inches') ? 
        productData.dimensions.length : null,
      supplier: productData.brand || '',
      link: productData.url,
      price_per_unit: productData.price || 0,
      unit_type: 'piece', // Default, user should adjust
      description: productData.description || '',
      size_x_mm: dimensionStrings.size_x_mm,
      size_y_mm: dimensionStrings.size_y_mm,
      size_z_mm: dimensionStrings.size_z_mm,
      size_x_inches: dimensionStrings.size_x_inches,
      size_y_inches: dimensionStrings.size_y_inches,
      size_z_inches: dimensionStrings.size_z_inches,
      in_stock: 0 // Default, user should update
    };
  }

  return suggestions;
}

/**
 * Extract supplier information from URL and product data
 */
function extractSupplierInfo(url, productData = null) {
  const hostname = new URL(url).hostname.toLowerCase();
  
  // Check if this is an Amazon URL
  const isAmazon = hostname.includes('amazon.');
  
  // For Amazon, use the extracted brand as the supplier, not Amazon itself
  if (isAmazon && productData && productData.brand) {
    return {
      name: productData.brand,
      website: url, // Link to the actual product page
      contact_info: `Available on Amazon (${hostname})`,
      marketplace: 'Amazon'
    };
  }
  
  // Map of common suppliers (names and suggested IDs, but actual IDs will be determined from database)
  const supplierMap = {
    'amazon.com': { name: 'Amazon', website: 'https://amazon.com', contact_info: 'Amazon.com' },
    'amazon.ca': { name: 'Amazon Canada', website: 'https://amazon.ca', contact_info: 'Amazon.ca' },
    'amazon.co.uk': { name: 'Amazon UK', website: 'https://amazon.co.uk', contact_info: 'Amazon.co.uk' },
    'amazon.de': { name: 'Amazon DE', website: 'https://amazon.de', contact_info: 'Amazon.de' },
    'ebay.com': { name: 'eBay', website: 'https://ebay.com', contact_info: 'eBay.com' },
    'alibaba.com': { name: 'Alibaba', website: 'https://alibaba.com', contact_info: 'Alibaba.com' },
    'aliexpress.com': { name: 'AliExpress', website: 'https://aliexpress.com', contact_info: 'AliExpress.com' },
    'mcmaster.com': { name: 'McMaster-Carr', website: 'https://mcmaster.com', contact_info: 'McMaster-Carr' },
    'digikey.com': { name: 'Digi-Key', website: 'https://digikey.com', contact_info: 'Digi-Key Electronics' },
    'mouser.com': { name: 'Mouser Electronics', website: 'https://mouser.com', contact_info: 'Mouser Electronics' },
    'grainger.com': { name: 'Grainger', website: 'https://grainger.com', contact_info: 'W.W. Grainger, Inc.' }
  };

  // Find matching supplier (fallback for when brand is not available)
  for (const [domain, supplier] of Object.entries(supplierMap)) {
    if (hostname.includes(domain.replace('.com', '').replace('.ca', '').replace('.co.uk', '').replace('.de', '')) || hostname.includes(domain)) {
      return supplier;
    }
  }

  // Default supplier for unknown suppliers
  return { 
    name: 'Unknown Supplier', 
    website: new URL(url).origin, 
    contact_info: `Auto-detected from ${hostname}` 
  };
}

/**
 * Ensures supplier exists in database, creates if it doesn't, returns supplier ID
 */
async function ensureSupplierExists(supplierInfo) {
  try {
    console.log('=== ENSURE SUPPLIER EXISTS DEBUG ===');
    console.log('Looking for supplier:', supplierInfo.name);
    
    // First, check if supplier already exists by name
    const { data: existingSuppliers, error: searchError } = await supabase
      .from('suppliers')
      .select('id, name')
      .ilike('name', supplierInfo.name);

    console.log('Search result:', existingSuppliers);
    console.log('Search error:', searchError);

    if (searchError) {
      console.warn(`Error searching for supplier: ${searchError.message}`);
    }

    // If supplier exists, return its ID
    if (existingSuppliers && existingSuppliers.length > 0) {
      console.log(`Found existing supplier: ${supplierInfo.name} (ID: ${existingSuppliers[0].id})`);
      return existingSuppliers[0].id;
    }

    // Supplier doesn't exist, create it
    console.log(`Creating new supplier: ${supplierInfo.name}`);
    const newSupplierData = {
      name: supplierInfo.name,
      website: supplierInfo.website,
      contact: supplierInfo.contact_info,
      notes: 'Auto-created by product extractor'
    };

    console.log('New supplier data:', newSupplierData);

    const { data: newSupplier, error: createError } = await supabase
      .from('suppliers')
      .insert([newSupplierData])
      .select('id, name');

    console.log('Create result:', newSupplier);
    console.log('Create error:', createError);

    if (createError) {
      console.error(`Failed to create supplier: ${createError.message}`);
      // Return null to indicate failure, but don't throw
      return null;
    }

    if (newSupplier && newSupplier.length > 0) {
      console.log(`Successfully created supplier: ${newSupplier[0].name} (ID: ${newSupplier[0].id})`);
      return newSupplier[0].id;
    }

    console.log('No supplier data returned after creation');
    return null;
  } catch (error) {
    console.error(`Error in ensureSupplierExists: ${error.message}`);
    console.error('Stack trace:', error.stack);
    return null;
  }
}

/**
 * Inserts the extracted data into the appropriate database table and creates supplier record
 */
async function insertToDatabase(productData, suggestions) {
  try {
    const suggestedType = productData.suggested_type;
    let insertData, tableName, result;

    if (suggestedType === 'part' && suggestions.parts && Object.keys(suggestions.parts).length > 0) {
      // Insert as part
      tableName = 'parts';
      insertData = suggestions.parts;
      
      const { data, error } = await supabase
        .from('parts')
        .insert([insertData])
        .select();
      
      if (error) throw error;
      result = { data, tableName: 'parts' };
      
    } else if (suggestedType === 'material' && suggestions.materials && Object.keys(suggestions.materials).length > 0) {
      // Insert as material
      tableName = 'materials';
      insertData = suggestions.materials;
      
      const { data, error } = await supabase
        .from('materials')
        .insert([insertData])
        .select();
      
      if (error) throw error;
      result = { data, tableName: 'materials' };
      
    } else if (suggestedType === 'unknown') {
      // Low confidence - don't auto-insert
      return {
        success: false,
        error: "Cannot auto-insert: Product type is unknown. Please specify 'type' parameter or review manually.",
        confidence: productData.confidence
      };
      
    } else {
      return {
        success: false,
        error: `Cannot auto-insert: No data available for suggested type '${suggestedType}'`
      };
    }

    // Create supplier record after successful main record insertion
    let supplierResult = null;
    if (result.data && result.data[0] && productData.url) {
      try {
        console.log('=== SUPPLIER CREATION DEBUG ===');
        console.log('Main record inserted:', result.data[0]);
        console.log('Table name:', tableName);
        console.log('Product URL:', productData.url);
        
        const supplierInfo = extractSupplierInfo(productData.url, productData);
        console.log('Extracted supplier info:', supplierInfo);
        
        // First, check if supplier exists, if not create it
        let actualSupplierId = await ensureSupplierExists(supplierInfo);
        console.log('Supplier ID result:', actualSupplierId);
        
        // If supplier creation/lookup failed, skip supplier relationship creation
        if (!actualSupplierId) {
          console.log('ERROR: Failed to get supplier ID');
          supplierResult = { error: 'Failed to create or find supplier in database' };
        } else {
          const supplierTableName = tableName === 'parts' ? 'part_suppliers' : 'material_suppliers';
          const foreignKeyField = tableName === 'parts' ? 'part_id' : 'material_id';
          const priceField = tableName === 'parts' ? 'unit_cost' : 'price_per_unit';
          
          console.log('Supplier relationship table:', supplierTableName);
          console.log('Foreign key field:', foreignKeyField);
          console.log('Price field:', priceField);
          
          const supplierData = {
            [foreignKeyField]: result.data[0].id,
            supplier_id: actualSupplierId,
            link: productData.url,
            sku: productData.sku || insertData.sku,
            [priceField]: productData.price || insertData.cost || insertData.price_per_unit,
            min_order_quantity: 1,
            lead_time_days: productData.lead_time_days,
            notes: `Auto-created${supplierInfo.marketplace ? ` via ${supplierInfo.marketplace}` : ''}${productData.lead_time_days ? ` | Lead time: ${productData.lead_time_days} days` : ''}`
          };

          console.log('Supplier data before cleanup:', supplierData);
          console.log('Main record ID type:', typeof result.data[0].id);
          console.log('Main record ID value:', result.data[0].id);
          console.log('Supplier ID type:', typeof actualSupplierId);
          console.log('Supplier ID value:', actualSupplierId);
          console.log('Price data:', {
            productDataPrice: productData.price,
            insertDataCost: insertData.cost,
            insertDataPricePerUnit: insertData.price_per_unit,
            finalPriceValue: productData.price || insertData.cost || insertData.price_per_unit
          });

          // Remove null/undefined values BUT keep required foreign keys and lead_time_days
          Object.keys(supplierData).forEach(key => {
            // Don't remove foreign key fields or lead_time_days even if they're null/undefined
            if (key === foreignKeyField || key === 'supplier_id' || key === 'lead_time_days') {
              return; // Keep these fields
            }
            if (supplierData[key] === null || supplierData[key] === undefined || supplierData[key] === '') {
              delete supplierData[key];
            }
          });

          console.log('Supplier data after cleanup:', supplierData);

          const { data: supplierData_result, error: supplierError } = await supabase
            .from(supplierTableName)
            .insert([supplierData])
            .select();

          console.log('Supplier insertion result:', supplierData_result);
          console.log('Supplier insertion error:', supplierError);

          if (supplierError) {
            console.warn(`Supplier record creation failed: ${supplierError.message}`);
            supplierResult = { error: supplierError.message };
          } else {
            console.log('SUCCESS: Supplier record created');
            supplierResult = { data: supplierData_result[0], supplier_info: supplierInfo };
            
            // Create price history record if we have a price AND supplier record was created successfully
            const price = productData.price || insertData.cost || insertData.price_per_unit || 0;
            if (supplierData_result && supplierData_result[0] && supplierData_result[0].id) {
              console.log('Creating price history record...');
              console.log('Using supplier junction record ID:', supplierData_result[0].id);
              console.log('Price value:', price);
              let priceHistoryResult;
              let stockHistoryResult;
              
              if (tableName === 'materials') {
                // Use the material_suppliers ID that was just created
                priceHistoryResult = await createMaterialPriceHistoryDirect(
                  result.data[0].id, // Use the material_id directly
                  actualSupplierId,
                  price, 
                  productData
                );
                
                // Also create stock history
                stockHistoryResult = await createMaterialStockHistoryDirect(
                  result.data[0].id, // Use the material_id directly
                  actualSupplierId,
                  0, // Default stock level
                  price, // Pass the price
                  productData
                );
              } else if (tableName === 'parts') {
                // Use the part_suppliers ID that was just created
                priceHistoryResult = await createPartPriceHistoryDirect(
                  result.data[0].id, // Use the part_id directly
                  actualSupplierId,
                  price, 
                  productData
                );
                
                // Also create stock history
                stockHistoryResult = await createPartStockHistoryDirect(
                  result.data[0].id, // Use the part_id directly
                  actualSupplierId,
                  0, // Default stock level
                  price, // Pass the price
                  productData
                );
              }
              
              if (priceHistoryResult?.success) {
                console.log('Price history record created successfully');
                supplierResult.priceHistory = priceHistoryResult.data;
              } else {
                console.warn('Price history creation failed:', priceHistoryResult?.error);
                supplierResult.priceHistoryError = priceHistoryResult?.error;
              }
              
              if (stockHistoryResult?.success) {
                console.log('Stock history record created successfully');
                supplierResult.stockHistory = stockHistoryResult.data;
              } else {
                console.warn('Stock history creation failed:', stockHistoryResult?.error);
                supplierResult.stockHistoryError = stockHistoryResult?.error;
              }
            } else {
              console.log('Skipping price history creation:', {
                hasSupplierData: !!(supplierData_result && supplierData_result[0]),
                hasSupplierID: !!(supplierData_result && supplierData_result[0] && supplierData_result[0].id),
                priceValue: price
              });
            }
          }
        }
      } catch (supplierErr) {
        console.error(`Supplier creation exception: ${supplierErr.message}`);
        console.error('Stack trace:', supplierErr.stack);
        supplierResult = { error: supplierErr.message };
      }
    } else {
      console.log('Skipping supplier creation - missing data:', {
        hasResult: !!result.data,
        hasRecord: !!(result.data && result.data[0]),
        hasUrl: !!productData.url
      });
    }

    return {
      success: true,
      message: `Successfully inserted into ${tableName} table${supplierResult?.data ? ' with supplier record' : ''}`,
      insertedData: result.data[0],
      supplierData: supplierResult,
      tableName: result.tableName,
      recordId: result.data[0]?.id,
      confidence: productData.confidence,
      classification_reasons: productData.classification_reasons
    };

  } catch (error) {
    console.error('Database insertion error:', error.message);
    return {
      success: false,
      error: `Database insertion failed: ${error.message}`,
      details: error
    };
  }
}

/**
 * Main function to extract product data and optionally insert to database
 */
async function processProductUrl(url, type = null, insert = false) {
  try {
    console.log(`Processing URL: ${url}`);
    
    // Validate inputs
    if (!url) {
      throw new Error("URL is required");
    }

    if (type && !['part', 'material'].includes(type)) {
      throw new Error("Type must be either 'part' or 'material' if specified");
    }

    // Extract product data
    const result = await extractProductData(url, type);

    if (!result.success) {
      return result;
    }

    // Generate database field suggestions
    const suggestions = suggestDatabaseFields(result.data);
    
    let insertResult = null;
    
    // Optionally insert directly into database
    if (insert === true) {
      insertResult = await insertToDatabase(result.data, suggestions);
    }

    return {
      ...result,
      suggestions: suggestions,
      insertResult: insertResult,
      usage: {
        note: insert ? "Data was automatically inserted into database" : "Use the 'suggestions' field to populate your parts or materials tables",
        parts_table: "Use suggestions.parts for inserting into the 'parts' table",
        materials_table: "Use suggestions.materials for inserting into the 'materials' table",
        manual_review: "Always review extracted data before inserting into database"
      }
    };

  } catch (error) {
    console.error(`Error processing URL: ${error.message}`);
    return {
      error: error.message,
      success: false
    };
  }
}

/**
 * Creates price history record for materials using the current schema
 */
async function createMaterialPriceHistoryDirect(materialId, supplierId, price, productData = null) {
  try {
    console.log('Creating material price history:');
    console.log('- Material ID:', materialId);
    console.log('- Supplier ID:', supplierId);
    console.log('- Price:', price);
    
    // Check if supplier ID is valid
    if (!supplierId) {
      console.error('Cannot create price history: supplierId is null or undefined');
      return { success: false, error: 'Supplier ID is required' };
    }
    
    // Ensure price is a valid number, default to 0 if not
    const validPrice = (typeof price === 'number' && !isNaN(price)) ? price : 0;
    console.log('Using price value:', validPrice);
    
    // Check if a price history record already exists for today
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const { data: existingRecords, error: checkError } = await supabase
      .from('material_price_history')
      .select('id, price, recorded_at')
      .eq('material_id', materialId)
      .eq('supplier_id', supplierId)
      .gte('recorded_at', today + 'T00:00:00.000Z')
      .lt('recorded_at', today + 'T23:59:59.999Z');
    
    if (checkError) {
      console.warn('Error checking for existing price history:', checkError.message);
    } else if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      console.log(`Price history already exists for today: ID ${existingRecord.id}, Price: ${existingRecord.price}`);
      
      // If the price is the same, skip creating a new record
      if (Math.abs(existingRecord.price - validPrice) < 0.01) {
        console.log('Price unchanged - skipping duplicate record creation');
        return { success: true, data: existingRecord, skipped: true, reason: 'Same price already recorded today' };
      } else {
        console.log(`Price changed from ${existingRecord.price} to ${validPrice} - creating new record`);
      }
    }
    
    // Create price history record using material_id and supplier_id
    const priceHistoryData = {
      material_id: materialId,
      supplier_id: supplierId,
      price: validPrice,
      recorded_at: new Date().toISOString(),
      note: validPrice > 0 ? 'Auto-recorded from product extraction' : 'Initial record - no price found during extraction',
      is_on_sale: false,
      original_price: null,
      discount_percentage: null
    };

    // Try to detect if this might be a sale price (only if we have a valid price)
    if (validPrice > 0 && productData && productData.name) {
      const nameText = productData.name.toLowerCase();
      const isSale = nameText.includes('sale') || nameText.includes('discount') || 
                     nameText.includes('clearance') || nameText.includes('reduced');
      if (isSale) {
        priceHistoryData.is_on_sale = true;
        priceHistoryData.note += ' - Potential sale detected from product name';
      }
    }

    console.log('Inserting price history data:', priceHistoryData);

    const { data: priceHistory, error: historyError } = await supabase
      .from('material_price_history')
      .insert([priceHistoryData])
      .select();

    if (historyError) {
      console.error('Failed to create material price history:', historyError.message);
      return { error: historyError.message };
    }

    console.log('Material price history created:', priceHistory[0]);
    return { success: true, data: priceHistory[0] };

  } catch (error) {
    console.error('Error creating material price history:', error.message);
    return { error: error.message };
  }
}

/**
 * Creates stock history record for materials using the current schema
 */
async function createMaterialStockHistoryDirect(materialId, supplierId, stockLevel = 0, price = null, productData = null) {
  try {
    console.log('Creating material stock history:');
    console.log('- Material ID:', materialId);
    console.log('- Supplier ID:', supplierId);
    console.log('- Stock Level:', stockLevel);
    console.log('- Price:', price);
    
    // Check if supplier ID is valid
    if (!supplierId) {
      console.error('Cannot create stock history: supplierId is null or undefined');
      return { success: false, error: 'Supplier ID is required' };
    }
    
    // Ensure stock level is a valid number, default to 0 if not
    const validStockLevel = (typeof stockLevel === 'number' && !isNaN(stockLevel)) ? stockLevel : 0;
    console.log('Using stock level:', validStockLevel);
    
    // Check if a stock history record already exists for today
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const { data: existingRecords, error: checkError } = await supabase
      .from('material_stock_history')
      .select('id, stock_level, recorded_at')
      .eq('material_id', materialId)
      .eq('supplier_id', supplierId)
      .gte('recorded_at', today + 'T00:00:00.000Z')
      .lt('recorded_at', today + 'T23:59:59.999Z');
    
    if (checkError) {
      console.warn('Error checking for existing stock history:', checkError.message);
    } else if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      console.log(`Stock history already exists for today: ID ${existingRecord.id}, Stock: ${existingRecord.stock_level}`);
      
      // If the stock level is the same, skip creating a new record
      if (existingRecord.stock_level === validStockLevel) {
        console.log('Stock level unchanged - skipping duplicate record creation');
        return { success: true, data: existingRecord, skipped: true, reason: 'Same stock level already recorded today' };
      } else {
        console.log(`Stock level changed from ${existingRecord.stock_level} to ${validStockLevel} - creating new record`);
      }
    }
    
    // For batch processing, always use stock level 0
    let finalStockLevel = 0;
    let stockNote = 'Initial stock level set to 0 (batch processed)';
    
    // Only analyze availability if a specific non-zero stock level was provided
    if (stockLevel > 0) {
      finalStockLevel = validStockLevel;
      stockNote = 'Manually set stock level';
    }
    
    // Ensure price is a valid number, default to 0 if not provided
    const validPrice = (typeof price === 'number' && !isNaN(price)) ? price : 0;
    
    // Create stock history record
    const stockHistoryData = {
      material_id: materialId,
      supplier_id: supplierId,
      stock_level: finalStockLevel,
      price: validPrice,
      recorded_at: new Date().toISOString(),
      notes: stockNote
    };
    
    console.log('Inserting stock history data:', stockHistoryData);

    const { data: stockHistory, error: historyError } = await supabase
      .from('material_stock_history')
      .insert([stockHistoryData])
      .select();

    if (historyError) {
      console.error('Failed to create material stock history:', historyError.message);
      return { error: historyError.message };
    }

    console.log('Material stock history created:', stockHistory[0]);
    return { success: true, data: stockHistory[0] };

  } catch (error) {
    console.error('Error creating material stock history:', error.message);
    return { error: error.message };
  }
}

/**
 * Creates stock history record for parts using the current schema
 */
async function createPartStockHistoryDirect(partId, supplierId, stockLevel = 0, price = null, productData = null) {
  try {
    console.log('Creating part stock history:');
    console.log('- Part ID:', partId);
    console.log('- Supplier ID:', supplierId);
    console.log('- Stock Level:', stockLevel);
    console.log('- Price:', price);
    
    // Check if supplier ID is valid
    if (!supplierId) {
      console.error('Cannot create stock history: supplierId is null or undefined');
      return { success: false, error: 'Supplier ID is required' };
    }
    
    // Ensure stock level is a valid number, default to 0 if not
    const validStockLevel = (typeof stockLevel === 'number' && !isNaN(stockLevel)) ? stockLevel : 0;
    console.log('Using stock level:', validStockLevel);
    
    // Check if a stock history record already exists for today
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const { data: existingRecords, error: checkError } = await supabase
      .from('part_stock_history')
      .select('id, stock_level, recorded_at')
      .eq('part_id', partId)
      .eq('supplier_id', supplierId)
      .gte('recorded_at', today + 'T00:00:00.000Z')
      .lt('recorded_at', today + 'T23:59:59.999Z');
    
    if (checkError) {
      console.warn('Error checking for existing stock history:', checkError.message);
    } else if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      console.log(`Stock history already exists for today: ID ${existingRecord.id}, Stock: ${existingRecord.stock_level}`);
      
      // If the stock level is the same, skip creating a new record
      if (existingRecord.stock_level === validStockLevel) {
        console.log('Stock level unchanged - skipping duplicate record creation');
        return { success: true, data: existingRecord, skipped: true, reason: 'Same stock level already recorded today' };
      } else {
        console.log(`Stock level changed from ${existingRecord.stock_level} to ${validStockLevel} - creating new record`);
      }
    }
    
    // For batch processing, always use stock level 0
    let finalStockLevel = 0;
    let stockNote = 'Initial stock level set to 0 (batch processed)';
    
    // Only analyze availability if a specific non-zero stock level was provided
    if (stockLevel > 0) {
      finalStockLevel = validStockLevel;
      stockNote = 'Manually set stock level';
    }
    
    // Ensure price is a valid number, default to 0 if not provided
    const validPrice = (typeof price === 'number' && !isNaN(price)) ? price : 0;
    
    // Create stock history record
    const stockHistoryData = {
      part_id: partId,
      supplier_id: supplierId,
      stock_level: finalStockLevel,
      price: validPrice,
      recorded_at: new Date().toISOString(),
      notes: stockNote
    };
    
    console.log('Inserting stock history data:', stockHistoryData);

    const { data: stockHistory, error: historyError } = await supabase
      .from('part_stock_history')
      .insert([stockHistoryData])
      .select();

    if (historyError) {
      console.error('Failed to create part stock history:', historyError.message);
      return { error: historyError.message };
    }

    console.log('Part stock history created:', stockHistory[0]);
    return { success: true, data: stockHistory[0] };

  } catch (error) {
    console.error('Error creating part stock history:', error.message);
    return { error: error.message };
  }
}

/**
 * Creates price history record for parts using the current schema
 */
async function createPartPriceHistoryDirect(partId, supplierId, price, productData = null) {
  try {
    console.log('Creating part price history:');
    console.log('- Part ID:', partId);
    console.log('- Supplier ID:', supplierId);
    console.log('- Price:', price);
    
    // Check if supplier ID is valid
    if (!supplierId) {
      console.error('Cannot create price history: supplierId is null or undefined');
      return { success: false, error: 'Supplier ID is required' };
    }
    
    // Ensure price is a valid number, default to 0 if not
    const validPrice = (typeof price === 'number' && !isNaN(price)) ? price : 0;
    console.log('Using price value:', validPrice);
    
    // Check if a price history record already exists for today
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const { data: existingRecords, error: checkError } = await supabase
      .from('part_price_history')
      .select('id, price, recorded_at')
      .eq('part_id', partId)
      .eq('supplier_id', supplierId)
      .gte('recorded_at', today + 'T00:00:00.000Z')
      .lt('recorded_at', today + 'T23:59:59.999Z');
    
    if (checkError) {
      console.warn('Error checking for existing price history:', checkError.message);
    } else if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      console.log(`Price history already exists for today: ID ${existingRecord.id}, Price: ${existingRecord.price}`);
      
      // If the price is the same, skip creating a new record
      if (Math.abs(existingRecord.price - validPrice) < 0.01) {
        console.log('Price unchanged - skipping duplicate record creation');
        return { success: true, data: existingRecord, skipped: true, reason: 'Same price already recorded today' };
      } else {
        console.log(`Price changed from ${existingRecord.price} to ${validPrice} - creating new record`);
      }
    }
    
    // Create price history record using part_id and supplier_id
    const priceHistoryData = {
      part_id: partId,
      supplier_id: supplierId,
      price: validPrice,
      recorded_at: new Date().toISOString(),
      note: validPrice > 0 ? 'Auto-recorded from product extraction' : 'Initial record - no price found during extraction',
      is_on_sale: false,
      original_price: null,
      discount_percentage: null
    };

    // Try to detect if this might be a sale price (only if we have a valid price)
    if (validPrice > 0 && productData && productData.name) {
      const nameText = productData.name.toLowerCase();
      const isSale = nameText.includes('sale') || nameText.includes('discount') || 
                     nameText.includes('clearance') || nameText.includes('reduced');
      if (isSale) {
        priceHistoryData.is_on_sale = true;
        priceHistoryData.note += ' - Potential sale detected from product name';
      }
    }

    console.log('Inserting price history data:', priceHistoryData);

    const { data: priceHistory, error: historyError } = await supabase
      .from('part_price_history')
      .insert([priceHistoryData])
      .select();

    if (historyError) {
      console.error('Failed to create part price history:', historyError.message);
      return { error: historyError.message };
    }

    console.log('Part price history created:', priceHistory[0]);
    return { success: true, data: priceHistory[0] };

  } catch (error) {
    console.error('Error creating part price history:', error.message);
    return { error: error.message };
  }
}

/**
 * Finds existing material by specifications or creates a new one
 */
async function findOrCreateMaterial(materialSpecs, extractedData) {
  try {
    console.log('=== FIND OR CREATE MATERIAL ===');
    console.log('Looking for material with specs:', materialSpecs);
    
    // Try to find existing material by name and key specifications
    const { data: existingMaterials, error: searchError } = await supabase
      .from('materials')
      .select('id, name, size_x_mm, size_y_mm, size_z_mm')
      .ilike('name', `%${materialSpecs.material_type || ''}%`)
      .limit(10);

    if (searchError) {
      console.warn(`Error searching for materials: ${searchError.message}`);
    } else {
      console.log(`Found ${existingMaterials?.length || 0} potential matches`);
      
      // Check for close matches based on dimensions
      if (existingMaterials && existingMaterials.length > 0) {
        for (const material of existingMaterials) {
          console.log(`Checking material: ${material.name} (ID: ${material.id})`);
          
          // Simple dimension matching - could be enhanced with better logic
          const dimensionsMatch = (
            material.size_x_mm && extractedData.dimensions?.length &&
            Math.abs(parseFloat(material.size_x_mm) - extractedData.dimensions.length * 25.4) < 1
          );
          
          if (dimensionsMatch) {
            console.log(`✅ Found matching material: ${material.name} (ID: ${material.id})`);
            return { id: material.id, isNew: false, data: material };
          }
        }
      }
    }
    
    // No match found, create new material
    console.log('No matching material found, creating new one...');
    
    // Use the extracted data to create material
    const suggestions = suggestDatabaseFields(extractedData);
    if (!suggestions.materials || Object.keys(suggestions.materials).length === 0) {
      throw new Error('No material data to insert');
    }
    
    // Override with specification data if provided
    if (materialSpecs.name) {
      suggestions.materials.name = materialSpecs.name;
    }
    if (materialSpecs.thickness) {
      suggestions.materials.description = `${suggestions.materials.description || ''} | Thickness: ${materialSpecs.thickness}`.trim();
    }
    
    const { data: newMaterial, error: createError } = await supabase
      .from('materials')
      .insert([suggestions.materials])
      .select();
    
    if (createError) {
      console.error(`Failed to create material: ${createError.message}`);
      throw createError;
    }
    
    if (newMaterial && newMaterial.length > 0) {
      console.log(`✅ Created new material: ${newMaterial[0].name} (ID: ${newMaterial[0].id})`);
      return { id: newMaterial[0].id, isNew: true, data: newMaterial[0] };
    }
    
    throw new Error('Failed to create material - no data returned');
    
  } catch (error) {
    console.error(`Error in findOrCreateMaterial: ${error.message}`);
    throw error;
  }
}

/**
 * Creates supplier relationship for existing material
 */
async function createMaterialSupplierRelationship(materialId, extractedData, supplierInfo) {
  try {
    console.log('=== CREATE MATERIAL SUPPLIER RELATIONSHIP ===');
    console.log(`Material ID: ${materialId}`);
    console.log(`Supplier Info:`, supplierInfo);
    
    // First, ensure supplier exists
    const actualSupplierId = await ensureSupplierExists(supplierInfo);
    if (!actualSupplierId) {
      throw new Error('Failed to create or find supplier');
    }
    
    // Check if relationship already exists
    const { data: existingRelation, error: checkError } = await supabase
      .from('material_suppliers')
      .select('id')
      .eq('material_id', materialId)
      .eq('supplier_id', actualSupplierId)
      .single();
    
    if (existingRelation) {
      console.log(`Relationship already exists: ${existingRelation.id}`);
      
      // Still create price history for existing relationship if we have a new price
      const price = extractedData.price || 0;
      console.log(`Creating price history for existing relationship with price: ${price}`);
      
      const priceHistoryResult = await createMaterialPriceHistoryDirect(
        materialId,
        actualSupplierId,
        price,
        extractedData
      );
      
      // Also create stock history for existing relationship
      const stockLevel = 0; // Default to 0, will be determined from availability
      console.log(`Creating stock history for existing relationship with stock level: ${stockLevel}`);
      
      const stockHistoryResult = await createMaterialStockHistoryDirect(
        materialId,
        actualSupplierId,
        stockLevel,
        price, // Pass the price from extracted data
        extractedData
      );
      
      return { 
        id: existingRelation.id, 
        isNew: false, 
        priceHistory: priceHistoryResult,
        stockHistory: stockHistoryResult
      };
    }
    
    // Create new supplier relationship
    const supplierData = {
      material_id: materialId,
      supplier_id: actualSupplierId,
      link: extractedData.url,
      sku: extractedData.sku,
      price_per_unit: extractedData.price || 0,
      min_order_quantity: 1,
      lead_time_days: extractedData.lead_time_days,
      notes: `Auto-created${supplierInfo.marketplace ? ` via ${supplierInfo.marketplace}` : ''}${extractedData.lead_time_days ? ` | Lead time: ${extractedData.lead_time_days} days` : ''}`
    };
    
    // Remove null/undefined values but keep foreign keys, price, and lead_time_days
    Object.keys(supplierData).forEach(key => {
      if (key !== 'material_id' && key !== 'supplier_id' && key !== 'price_per_unit' && key !== 'lead_time_days') {
        if (supplierData[key] === null || supplierData[key] === undefined || supplierData[key] === '') {
          delete supplierData[key];
        }
      }
    });
    
    console.log('Creating supplier relationship:', supplierData);
    
    const { data: supplierRelation, error: relationError } = await supabase
      .from('material_suppliers')
      .insert([supplierData])
      .select();
    
    if (relationError) {
      console.error(`Failed to create supplier relationship: ${relationError.message}`);
      throw relationError;
    }
    
    console.log(`✅ Created supplier relationship: ${supplierRelation[0].id}`);
    
    // ALWAYS create price history record for new supplier relationship
    const price = extractedData.price || 0;
    console.log(`Creating initial price history with price: ${price}`);
    
    const priceHistoryResult = await createMaterialPriceHistoryDirect(
      materialId,
      actualSupplierId,
      price,
      extractedData
    );
    
    if (!priceHistoryResult?.success) {
      console.warn(`Price history creation failed: ${priceHistoryResult?.error}`);
    } else {
      console.log(`✅ Price history created: ${priceHistoryResult.data.id}`);
    }
    
    // ALWAYS create stock history record for new supplier relationship
    const stockLevel = 0; // Default to 0, will be determined from availability
    console.log(`Creating initial stock history with stock level: ${stockLevel}`);
    
    const stockHistoryResult = await createMaterialStockHistoryDirect(
      materialId,
      actualSupplierId,
      stockLevel,
      price, // Pass the price from extracted data
      extractedData
    );
    
    if (!stockHistoryResult?.success) {
      console.warn(`Stock history creation failed: ${stockHistoryResult?.error}`);
    } else {
      console.log(`✅ Stock history created: ${stockHistoryResult.data.id}`);
    }
    
    return { 
      id: supplierRelation[0].id, 
      isNew: true, 
      data: supplierRelation[0],
      priceHistory: priceHistoryResult,
      stockHistory: stockHistoryResult
    };
    
  } catch (error) {
    console.error(`Error creating material supplier relationship: ${error.message}`);
    throw error;
  }
}

// Example usage function
async function main() {
  // Example usage - modify these parameters
  const testUrl = "https://example.com/product-url";
  const expectedType = null; // or 'part' or 'material'
  const shouldInsert = false; // set to true to auto-insert to database
  
  try {
    const result = await processProductUrl(testUrl, expectedType, shouldInsert);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export functions for use in other modules
module.exports = {
  extractProductData,
  processProductUrl,
  suggestDatabaseFields,
  insertToDatabase,
  createMaterialPriceHistoryDirect,
  createPartPriceHistoryDirect,
  createMaterialStockHistoryDirect,
  createPartStockHistoryDirect,
  extractSupplierInfo,
  findOrCreateMaterial,
  createMaterialSupplierRelationship,
  ensureSupplierExists
};

// Run main function if this file is executed directly
if (require.main === module) {
  main();
} 