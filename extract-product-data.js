// Deno Edge Function for extracting product data from supplier URLs
// This helps populate material or part entries by scraping product information
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Extracts product information from a supplier's website
 */
async function extractProductData(url, expectedType = null) {
  if (!url) {
    return { error: "No URL provided" };
  }

  try {
    console.log(`Extracting product data from: ${url}`);
    
    // Fetch the page HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
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
      /Brand[:\s]*([A-Za-z0-9\s]+)/i
    ];

    for (const pattern of brandPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        productData.brand = match[1].trim();
        break;
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
    const dimensionPatterns = [
      /(\d+(?:[,\.]\d+)?)\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*(?:x|×)\s*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches)/gi,
      /Length[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches)/gi,
      /Width[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches)/gi,
      /Height[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches)/gi,
      /Diameter[:\s]*(\d+(?:[,\.]\d+)?)\s*(mm|cm|in|inches)/gi
    ];

    for (const pattern of dimensionPatterns) {
      try {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          if (match && match.length >= 3) {
            if (match.length >= 5) {
              // 3D dimensions
              const length = safeParseFloat(match[1]);
              const width = safeParseFloat(match[2]);
              const height = safeParseFloat(match[3]);
              
              if (length && width && height) {
                productData.dimensions = {
                  length: length,
                  width: width,
                  height: height,
                  unit: match[4]
                };
              }
            } else {
              // Single dimension
              const dimensionValue = safeParseFloat(match[1]);
              if (dimensionValue) {
                const dimensionType = match[0].toLowerCase().includes('length') ? 'length' :
                                    match[0].toLowerCase().includes('width') ? 'width' :
                                    match[0].toLowerCase().includes('height') ? 'height' :
                                    match[0].toLowerCase().includes('diameter') ? 'diameter' : 'value';
                
                if (!productData.dimensions[dimensionType]) {
                  productData.dimensions[dimensionType] = dimensionValue;
                  productData.dimensions.unit = match[2];
                }
              }
            }
          }
        }
      } catch (e) {
        // Skip patterns that don't have global flag
        console.warn(`Dimension pattern matching failed: ${e.message}`);
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
 * Extract supplier information from URL
 */
function extractSupplierInfo(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  
  // Map of common suppliers (you may need to adjust these IDs based on your suppliers table)
  const supplierMap = {
    'amazon.com': { name: 'Amazon', id: 1 },
    'amazon.co.uk': { name: 'Amazon UK', id: 1 },
    'amazon.de': { name: 'Amazon DE', id: 1 },
    'ebay.com': { name: 'eBay', id: 2 },
    'alibaba.com': { name: 'Alibaba', id: 3 },
    'aliexpress.com': { name: 'AliExpress', id: 4 },
    'mcmaster.com': { name: 'McMaster-Carr', id: 5 },
    'digikey.com': { name: 'Digi-Key', id: 6 },
    'mouser.com': { name: 'Mouser Electronics', id: 7 },
    'grainger.com': { name: 'Grainger', id: 8 }
  };

  // Find matching supplier
  for (const [domain, supplier] of Object.entries(supplierMap)) {
    if (hostname.includes(domain.replace('.com', '')) || hostname.includes(domain)) {
      return supplier;
    }
  }

  // Default supplier ID for unknown suppliers (adjust this ID as needed)
  return { name: 'Unknown Supplier', id: 99 };
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
        const supplierInfo = extractSupplierInfo(productData.url);
        const supplierTableName = tableName === 'parts' ? 'part_suppliers' : 'material_suppliers';
        const foreignKeyField = tableName === 'parts' ? 'part_id' : 'material_id';
        const priceField = tableName === 'parts' ? 'unit_cost' : 'price_per_unit';
        
        const supplierData = {
          [foreignKeyField]: result.data[0].id,
          supplier_id: supplierInfo.id,
          link: productData.url,
          sku: productData.sku || insertData.sku,
          [priceField]: productData.price || insertData.cost || insertData.price_per_unit,
          min_order_quantity: 1,
          notes: `Auto-created from ${supplierInfo.name}`
        };

        // Remove null/undefined values
        Object.keys(supplierData).forEach(key => {
          if (supplierData[key] === null || supplierData[key] === undefined || supplierData[key] === '') {
            delete supplierData[key];
          }
        });

        const { data: supplierData_result, error: supplierError } = await supabase
          .from(supplierTableName)
          .insert([supplierData])
          .select();

        if (supplierError) {
          console.warn(`Supplier record creation failed: ${supplierError.message}`);
          supplierResult = { error: supplierError.message };
        } else {
          supplierResult = { data: supplierData_result[0], supplier_info: supplierInfo };
        }
      } catch (supplierErr) {
        console.warn(`Supplier record creation failed: ${supplierErr.message}`);
        supplierResult = { error: supplierErr.message };
      }
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
 * Main handler for the edge function
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        error: "Method not allowed. Use POST with { \"url\": \"supplier_url\", \"type\": \"part|material\" (optional), \"insert\": true (optional) }"
      }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse request body
    const body = await req.json();
    const { url, type, insert } = body;

    if (!url) {
      return new Response(JSON.stringify({
        error: "URL is required. Send { \"url\": \"supplier_url\", \"type\": \"part|material\" (optional), \"insert\": true (optional) }"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Validate type if provided
    if (type && !['part', 'material'].includes(type)) {
      return new Response(JSON.stringify({
        error: "Type must be either 'part' or 'material' if specified"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Extract product data
    const result = await extractProductData(url, type);

    if (!result.success) {
      return new Response(JSON.stringify(result), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Generate database field suggestions
    const suggestions = suggestDatabaseFields(result.data);
    
    let insertResult = null;
    
    // Optionally insert directly into database
    if (insert === true) {
      insertResult = await insertToDatabase(result.data, suggestions);
    }

    return new Response(JSON.stringify({
      ...result,
      suggestions: suggestions,
      insertResult: insertResult,
      usage: {
        note: insert ? "Data was automatically inserted into database" : "Use the 'suggestions' field to populate your parts or materials tables",
        parts_table: "Use suggestions.parts for inserting into the 'parts' table",
        materials_table: "Use suggestions.materials for inserting into the 'materials' table",
        manual_review: "Always review extracted data before inserting into database",
        auto_insert: "Add 'insert: true' to automatically insert the record"
      }
    }), {
      status: insertResult?.error ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`Error in extract-product-data function: ${error.message}`);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}); 