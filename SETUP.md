# Product Data Extractor - Node.js Setup

This is the Node.js version of the product data extractor that can run locally while still connecting to your Supabase database.

## Prerequisites

- Node.js 16 or higher
- NPM or Yarn package manager
- Supabase project with the appropriate database tables

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

For Node.js versions older than 18, you may need to install node-fetch:
```bash
npm install node-fetch
```

### 2. Environment Configuration

Create a `.env` file in the project root with your Supabase credentials:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

Get these values from your Supabase project settings:
- Go to your Supabase dashboard
- Navigate to Settings > API
- Copy the Project URL and anon/public key

### 3. Verify Database Tables

Make sure your Supabase database has the following tables:

- `parts` table with columns: `name`, `cost`, `description`, `supplier`, `sku`, `link`, `category`, `in_stock`
- `materials` table with columns: `name`, `size_mm`, `size_inches`, `supplier`, `link`, `price_per_unit`, `unit_type`, `description`, `size_x_mm`, `size_y_mm`, `size_z_mm`, `size_x_inches`, `size_y_inches`, `size_z_inches`, `in_stock`
- `part_suppliers` and `material_suppliers` tables for supplier relationships

## Usage

### Basic Usage

```javascript
const { processProductUrl } = require('./extract-product-data-node');

// Extract product data without inserting to database
const result = await processProductUrl('https://example.com/product', 'part', false);
console.log(result);
```

### Extract and Insert to Database

```javascript
const { processProductUrl } = require('./extract-product-data-node');

// Extract and automatically insert to database
const result = await processProductUrl('https://example.com/product', 'part', true);
console.log(result);
```

### Run Tests

```bash
# Run the test suite
npm test

# Or run directly
node test-extractor.js
```

### Run with Custom URL

Edit the `main()` function in `extract-product-data-node.js`:

```javascript
async function main() {
  const testUrl = "https://your-product-url-here.com";
  const expectedType = "part"; // or "material" or null for auto-classification
  const shouldInsert = true; // set to true to auto-insert to database
  
  const result = await processProductUrl(testUrl, expectedType, shouldInsert);
  console.log(JSON.stringify(result, null, 2));
}
```

Then run:
```bash
npm start
```

## Functions Available

- `extractProductData(url, expectedType)` - Core extraction function
- `processProductUrl(url, type, insert)` - Main processing function
- `suggestDatabaseFields(productData)` - Generate database field suggestions
- `insertToDatabase(productData, suggestions)` - Insert data to Supabase

## Features

- ✅ Extracts product name, price, description, dimensions, SKU, brand
- ✅ Auto-classifies products as parts or materials
- ✅ Supports multiple currency formats and decimal separators
- ✅ Generates database-ready field suggestions
- ✅ Optionally inserts directly to Supabase database
- ✅ Creates supplier relationship records automatically
- ✅ Handles various supplier websites (Amazon, McMaster-Carr, etc.)

## Troubleshooting

### Node.js Version Issues
- Ensure you're using Node.js 16 or higher
- For older versions, install `node-fetch` manually

### Supabase Connection Issues
- Verify your `.env` file has the correct credentials
- Check that your Supabase project is active and accessible
- Ensure RLS (Row Level Security) policies allow inserts if enabled

### Extraction Issues
- Some websites may block automated requests
- Try different User-Agent strings if needed
- Some sites require authentication or have anti-bot measures

## Example Output

```json
{
  "success": true,
  "data": {
    "name": "1/4-20 x 1 Hex Head Cap Screw",
    "price": 0.25,
    "currency": "USD",
    "brand": "McMaster-Carr",
    "sku": "91251A031",
    "suggested_type": "part",
    "confidence": 95
  },
  "suggestions": {
    "parts": {
      "name": "1/4-20 x 1 Hex Head Cap Screw",
      "cost": 0.25,
      "supplier": "McMaster-Carr",
      "sku": "91251A031",
      "link": "https://www.mcmaster.com/91251A031/"
    }
  }
}
``` 