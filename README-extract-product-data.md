# Product Data Extraction Edge Function

This Deno edge function extracts product information from supplier URLs to help you populate material or part entries in your database.

## Purpose

- **Scrapes product details** from supplier websites
- **Suggests database fields** for parts and materials tables
- **Automatically detects** whether a product is likely a part or material
- **Extracts dimensions, prices, specs** and other relevant data

## Usage

### Deploy as Supabase Edge Function

1. Deploy to Supabase:
```bash
supabase functions deploy extract-product-data
```

2. Set environment variables:
```bash
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
```

### API Usage

**Endpoint:** `POST /functions/v1/extract-product-data`

**Request Body:**
```json
{
  "url": "https://www.supplier.com/product-page",
  "type": "part"
}
```

**Parameters:**
- `url` (required): The supplier's product page URL
- `type` (optional): Specify "part" or "material" if you know the type. This improves classification accuracy.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://www.supplier.com/product-page",
    "name": "M6 x 20mm Hex Bolt",
    "description": "Stainless steel hex head bolt with metric threading",
    "price": 0.75,
    "currency": "USD",
    "brand": "Fastenal",
    "sku": "11142565",
    "availability": "In Stock",
    "dimensions": {
      "length": 20,
      "diameter": 6,
      "unit": "mm"
    },
    "material_type": "Stainless Steel",
    "suggested_type": "part",
    "confidence": 85,
    "classification_reasons": [
      "User specified as part",
      "Part keyword: \"bolt\" (high confidence)",
      "Manufacturing/precision terms (part indicator)"
    ],
    "extracted_at": "2025-06-07T18:15:00.000Z"
  },
  "suggestions": {
    "parts": {
      "name": "M6 x 20mm Hex Bolt",
      "description": "Stainless steel hex head bolt with metric threading",
      "cost": 0.75,
      "supplier": "Fastenal",
      "part_number": "11142565",
      "notes": "Extracted from: https://www.supplier.com/product-page"
    },
    "materials": {
      "name": "M6 x 20mm Hex Bolt",
      "description": "Stainless steel hex head bolt with metric threading", 
      "price_per_unit": 0.75,
      "supplier": "Fastenal",
      "link": "https://www.supplier.com/product-page",
      "size_mm": 20,
      "material_type": "Stainless Steel"
    }
  },
  "usage": {
    "note": "Use the 'suggestions' field to populate your parts or materials tables",
    "parts_table": "Use suggestions.parts for inserting into the 'parts' table",
    "materials_table": "Use suggestions.materials for inserting into the 'materials' table",
    "manual_review": "Always review extracted data before inserting into database"
  }
}
```

## What It Extracts

### Basic Information
- **Name/Title** - Product name from title, h1, or meta tags
- **Description** - Product description from meta tags or content
- **Price** - Current price with currency detection
- **Brand/Supplier** - Manufacturer or supplier name
- **SKU/Part Number** - Product identifier

### Technical Details
- **Dimensions** - Length, width, height with units (mm, cm, inches)
- **Material Type** - Material composition (aluminum, steel, etc.)
- **Availability** - Stock status
- **Images** - Product image URLs

### Smart Detection
- **Enhanced Classification** - Uses 100+ keywords and patterns to determine part vs material
- **Confidence Scoring** - Provides confidence percentage (0-95%) for the classification
- **User Override** - Specify type manually for 100% accuracy
- **Reasoning** - Shows exactly why it classified as part or material
- **Database Mapping** - Provides ready-to-use field mappings for your database schema

## Integration Examples

### JavaScript/Frontend
```javascript
async function extractProductData(url, type = null) {
  const response = await fetch('/functions/v1/extract-product-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({ url, type })
  });
  
  const result = await response.json();
  return result;
}

// Usage Examples:

// Auto-detect type
const autoData = await extractProductData('https://supplier.com/product');
console.log(`Detected as: ${autoData.data.suggested_type} (${autoData.data.confidence}% confidence)`);
console.log('Reasons:', autoData.data.classification_reasons);

// Specify type for accuracy
const partData = await extractProductData('https://supplier.com/bolt', 'part');
const materialData = await extractProductData('https://supplier.com/sheet', 'material');

// Use appropriate suggestion
if (autoData.data.suggested_type === 'part') {
  console.log(autoData.suggestions.parts); // Ready for parts table
} else {
  console.log(autoData.suggestions.materials); // Ready for materials table
}
```

### Python
```python
import requests

def extract_product_data(url):
    response = requests.post(
        'https://your-project.supabase.co/functions/v1/extract-product-data',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {anon_key}'
        },
        json={'url': url}
    )
    return response.json()

# Usage
data = extract_product_data('https://supplier.com/product')
parts_data = data['suggestions']['parts']
materials_data = data['suggestions']['materials']
```

### cURL
```bash
# Auto-detect type
curl -X POST \
  https://your-project.supabase.co/functions/v1/extract-product-data \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your_anon_key' \
  -d '{"url": "https://supplier.com/product-page"}'

# Specify as part
curl -X POST \
  https://your-project.supabase.co/functions/v1/extract-product-data \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your_anon_key' \
  -d '{"url": "https://supplier.com/bolt-page", "type": "part"}'

# Specify as material
curl -X POST \
  https://your-project.supabase.co/functions/v1/extract-product-data \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your_anon_key' \
  -d '{"url": "https://supplier.com/sheet-page", "type": "material"}'
```

## Workflow Integration

### 1. Extract Data
```javascript
// Method 1: Auto-detect (recommended for unknown products)
const extracted = await extractProductData(supplierUrl);
console.log(`Classified as: ${extracted.data.suggested_type} (${extracted.data.confidence}% confidence)`);

// Method 2: Specify type (recommended when you know it's a part or material)
const partExtracted = await extractProductData(supplierUrl, 'part');
const materialExtracted = await extractProductData(supplierUrl, 'material');
```

### 2. Review & Modify
```javascript
// Review the suggestions
const partData = extracted.suggestions.parts;
partData.category = "Fasteners"; // Add custom fields
partData.cost = 1.25; // Override extracted price
```

### 3. Insert to Database
```javascript
// Insert as part
const { data, error } = await supabase
  .from('parts')
  .insert([partData]);

// Or insert as material
const materialData = extracted.suggestions.materials;
materialData.unit_type = "each"; // Customize unit
const { data: matData, error: matError } = await supabase
  .from('materials')
  .insert([materialData]);
```

## Supported Websites

The function works best with:
- **E-commerce sites** (Amazon, eBay, etc.)
- **Industrial suppliers** (McMaster-Carr, Fastenal, etc.)
- **Manufacturer websites** with product pages
- **Any site** with structured product data

## Notes

- **Always review** extracted data before database insertion
- **Customize fields** as needed for your specific requirements
- **Handle errors** gracefully when extraction fails
- **Rate limit** requests to be respectful to supplier websites

## Error Handling

```javascript
const result = await extractProductData(url);

if (!result.success) {
  console.error('Extraction failed:', result.error);
  // Handle extraction failure
} else {
  console.log('Extracted:', result.data);
  // Process successful extraction
}
```

This edge function complements your price updater by helping you quickly add new products to your inventory management system! 