# Supplier Website Support

The price updater now supports **7 major supplier websites** with specialized price extraction and sales detection.

## Supported Suppliers

### 🔶 **AliExpress** (`aliexpress.com`)
- **Features**: 
  - Multi-currency support (USD, CAD, C$)
  - Sale/discount detection
  - Quantity-based pricing awareness
  - Extended loading time for JavaScript-heavy pages
- **Price Range**: $0.01 - $10,000 (filtered for reasonable prices)
- **Example**: [AliExpress Item](https://www.aliexpress.com/item/1005005863455770.html?spm=a2g0o.order_detail.order_detail_item.3.6cabf19cbSD5ii)

### 🏭 **Grainger Canada** (`grainger.ca`)
- **Features**:
  - Industrial/commercial pricing
  - Promotional price detection
  - CAD currency support
  - Professional supplier format
- **Price Range**: $0.01 - $100,000 (industrial equipment range)
- **Example**: [Grainger Corner Brace](https://www.grainger.ca/en/product/FLAT-CORNER-BRACE-STEEL-6-IN-W/p/GGH1WDL1)

### 🇨🇦 **Laser Supply Canada** (`lasersupply.ca`)
- **Features**:
  - Sale price detection (crossed-out original prices)
  - Canadian supplier specializing in laser cutting materials
  - Discount percentage calculation
- **Specialty**: Acrylic sheets, laser cutting materials

### 🛒 **Amazon Canada** (`amazon.ca`)
- **Features**:
  - General e-commerce price extraction
  - Compatible with existing Amazon URLs
  - Standard pricing format
- **Note**: Uses fallback generic extraction

### 🔌 **Digikey Canada** (`digikey.ca`)
- **Features**:
  - Electronics component pricing
  - Quantity break pricing detection
  - High-precision pricing (up to 4 decimal places)
  - Professional electronics supplier format
- **Price Range**: $0.01 - $10,000 (component range)
- **Example**: [Digikey Wire Component](https://www.digikey.ca/en/products/detail/encore-wire/C1357-41-90/229528)

### 🔧 **Vevor Canada** (`vevor.ca`)
- **Features**:
  - Industrial tools and equipment
  - Unique price format handling ("C $ 119 22" = CAD $119.22)
  - Sale/promotional pricing detection
  - Tool storage and organization products
- **Price Range**: $0.01 - $50,000 (industrial tools range)
- **Example**: [Vevor Impact Socket Set](https://www.vevor.ca/impact-socket-set-c_10805/vevor-1-2-drive-impact-socket-set-34-piece-socket-set-metric-8-36mm-6-point-cr-mo-alloy-steel-for-auto-repair-easy-to-read-size-markings-rugged-construction-includes-storage-case-p_010475340266)

### 🏭 **Alibaba.com** (`alibaba.com`)
- **Features**:
  - B2B marketplace pricing
  - Price range detection ("$1.20-5.50")
  - Minimum Order Quantity (MOQ) awareness
  - Bulk/wholesale pricing
  - Multi-currency support (USD primary)
- **Price Range**: $0.01 - $10,000 (B2B pricing)
- **Example**: [Alibaba Woodworking Tools](https://www.alibaba.com/product-detail/15-40mm-Woodworking-Hole-Saw-Hinge_1600077963927.html?spm=a27aq.29438283.6890397120.103.24235725RHACxv)

## Sales Detection Features

All supported suppliers can detect:
- ✅ **Regular pricing**
- ✅ **Sale/promotional pricing** 
- ✅ **Original vs. current price**
- ✅ **Discount percentage calculation**
- ✅ **Enhanced logging** with 🔥 sale indicators

## Database Integration

### Price History Tracking
Enhanced tables now include:
```sql
-- New fields in part_price_history and material_price_history
is_on_sale BOOLEAN DEFAULT FALSE
original_price DECIMAL(10,2) 
discount_percentage DECIMAL(5,2)
```

### Example Usage

Add supplier records to test:

```sql
-- AliExpress material supplier
INSERT INTO material_suppliers (material_id, supplier_id, link, sku, price_per_unit)
VALUES (1, 2, 'https://www.aliexpress.com/item/1005005863455770.html', 'ALI-123456', 25.99);

-- Grainger part supplier  
INSERT INTO part_suppliers (part_id, supplier_id, link, sku, unit_cost)
VALUES (1, 3, 'https://www.grainger.ca/en/product/FLAT-CORNER-BRACE-STEEL-6-IN-W/p/GGH1WDL1', 'GGH1WDL1', 12.45);

-- Digikey electronics component
INSERT INTO part_suppliers (part_id, supplier_id, link, sku, unit_cost)
VALUES (2, 4, 'https://www.digikey.ca/en/products/detail/encore-wire/C1357-41-90/229528', 'C1357-41-90', 2.47);

-- Vevor industrial tool
INSERT INTO part_suppliers (part_id, supplier_id, link, sku, unit_cost)
VALUES (3, 5, 'https://www.vevor.ca/impact-socket-set-c_10805/vevor-1-2-drive-impact-socket-set-34-piece-socket-set-metric-8-36mm-6-point-cr-mo-alloy-steel-for-auto-repair-easy-to-read-size-markings-rugged-construction-includes-storage-case-p_010475340266', '010475340266', 119.22);

-- Alibaba B2B supplier
INSERT INTO material_suppliers (material_id, supplier_id, link, sku, price_per_unit)
VALUES (2, 6, 'https://www.alibaba.com/product-detail/15-40mm-Woodworking-Hole-Saw-Hinge_1600077963927.html', 'WHS-15-40', 3.50);
```

## Sample Output

```bash
🧱 Processing material supplier 1 for material: Aluminum Sheet
Fetching price from: https://www.aliexpress.com/item/1005005863455770.html
Found AliExpress sale price: $23.99 (was $29.99) - 20.0% off
✅ Updated material price: Aluminum Sheet - $25.99 → $23.99 (-7.69%) 🔥 ON SALE (was $29.99)
```

## Configuration

The price updater automatically detects the supplier based on URL and applies the appropriate extraction method:

1. **Site Detection**: URL pattern matching
2. **Specialized Extraction**: Site-specific CSS selectors and logic
3. **Fallback**: Generic extraction for unknown sites
4. **Sales Logic**: Automatic sale detection and discount calculation
5. **Error Handling**: Graceful fallback if extraction fails

## Testing

Run in dry-run mode to test new suppliers:
```bash
node priceUpdater.js --dry-run --once
``` 