// Batch processor for extracting multiple product URLs from JSON configuration
const fs = require('fs').promises;
const path = require('path');
const { processProductUrl, extractProductData, extractSupplierInfo, findOrCreateMaterial, createMaterialSupplierRelationship, createMaterialPriceHistoryDirect, ensureSupplierExists } = require('./extract-product-data-node.js');

/**
 * Loads product URLs from JSON configuration file
 */
async function loadProductConfig(filePath = './product-urls.json') {
  try {
    const configData = await fs.readFile(filePath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`Error loading config file: ${error.message}`);
    return null;
  }
}

/**
 * Processes a single product from the configuration
 */
async function processSingleProduct(product, settings) {
  try {
    console.log(`\n=== Processing: ${product.url} ===`);
    console.log(`Type: ${product.expectedType || 'auto-detect'}, Insert: ${product.insert}, Priority: ${product.priority || 'normal'}`);
    if (product.notes) console.log(`Notes: ${product.notes}`);
    
    const result = await processProductUrl(
      product.url, 
      product.expectedType || null, 
      product.insert !== false && (product.insert || settings.defaultInsert)
    );
    
    if (result.success) {
      console.log(`✅ SUCCESS: ${result.data?.name || 'Product'}`);
      if (result.insertResult?.success) {
        console.log(`📦 Inserted into: ${result.insertResult.tableName}`);
        if (result.insertResult.supplierData?.data) {
          console.log(`🏢 Supplier: ${result.insertResult.supplierData.supplier_info?.name}`);
        }
        if (result.insertResult.supplierData?.priceHistory) {
          console.log(`💰 Price history created`);
        }
      }
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ ERROR processing ${product.url}: ${error.message}`);
    return { success: false, error: error.message, url: product.url };
  }
}

/**
 * Processes products by category
 */
async function processCategory(categoryName, categoryConfig, settings) {
  console.log(`\n🏷️  Processing category: ${categoryName}`);
  console.log(`Default type: ${categoryConfig.defaultType}, Auto-insert: ${categoryConfig.autoInsert}`);
  
  const results = [];
  
  for (const url of categoryConfig.urls) {
    const product = {
      url: url,
      expectedType: categoryConfig.defaultType,
      insert: categoryConfig.autoInsert,
      priority: 'normal',
      notes: `Category: ${categoryName}`
    };
    
    const result = await processSingleProduct(product, settings);
    results.push(result);
    
    // Delay between requests to avoid being rate-limited
    if (settings.batchDelay > 0) {
      console.log(`⏳ Waiting ${settings.batchDelay}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, settings.batchDelay));
    }
  }
  
  return results;
}

/**
 * Processes materials with multiple suppliers
 */
async function processMaterialSuppliers(materialKey, materialConfig, settings) {
  console.log(`\n🔧 Processing material: ${materialKey}`);
  console.log(`Material: ${materialConfig.name}`);
  console.log(`Specifications:`, materialConfig.specifications);
  console.log(`Number of suppliers: ${materialConfig.suppliers.length}`);
  
  const results = [];
  let sharedMaterialId = null;
  let materialRecord = null;
  
  for (let i = 0; i < materialConfig.suppliers.length; i++) {
    const supplier = materialConfig.suppliers[i];
    console.log(`\n--- Supplier ${i + 1}/${materialConfig.suppliers.length} ---`);
    
    try {
      // Extract product data from this supplier
      console.log(`Extracting data from: ${supplier.url}`);
      const extractionResult = await extractProductData(supplier.url, supplier.expectedType || 'material');
      
      if (!extractionResult.success) {
        console.log(`❌ FAILED extraction: ${extractionResult.error}`);
        results.push({
          success: false,
          error: extractionResult.error,
          url: supplier.url,
          supplierIndex: i + 1
        });
        continue;
      }
      
      // For the first supplier, find or create the material
      if (i === 0) {
        console.log('🔍 First supplier - finding or creating material...');
        try {
          // Include the material name from JSON config in the specifications
          const materialSpecsWithName = {
            ...materialConfig.specifications,
            name: materialConfig.name  // Use the name from JSON config
          };
          const materialResult = await findOrCreateMaterial(materialSpecsWithName, extractionResult.data);
          sharedMaterialId = materialResult.id;
          materialRecord = materialResult.data;
          console.log(`Using material ID: ${sharedMaterialId} (${materialResult.isNew ? 'new' : 'existing'})`);
        } catch (error) {
          console.error(`Failed to find/create material: ${error.message}`);
          results.push({
            success: false,
            error: `Material creation failed: ${error.message}`,
            url: supplier.url,
            supplierIndex: i + 1
          });
          continue;
        }
      } else {
        console.log(`🔗 Using existing material ID: ${sharedMaterialId}`);
      }
      
      // Create supplier relationship for this supplier
      console.log('🏢 Creating supplier relationship...');
      try {
        const supplierInfo = extractSupplierInfo(supplier.url, extractionResult.data);
        const relationshipResult = await createMaterialSupplierRelationship(
          sharedMaterialId,
          extractionResult.data,
          supplierInfo
        );
        
        // Price history record is already created by createMaterialSupplierRelationship
        const priceHistoryResult = relationshipResult.priceHistory;
        
        const result = {
          success: true,
          url: supplier.url,
          supplierIndex: i + 1,
          data: extractionResult.data,
          materialId: sharedMaterialId,
          materialIsNew: i === 0 && materialRecord,
          supplierRelationship: relationshipResult,
          priceHistory: priceHistoryResult,
          insertResult: {
            success: true,
            message: `Successfully linked to material ${sharedMaterialId}`,
            tableName: 'materials',
            supplierData: {
              data: relationshipResult.data,
              priceHistory: priceHistoryResult?.data
            }
          }
        };
        
        console.log(`✅ SUCCESS: ${extractionResult.data?.name || 'Product'}`);
        console.log(`🔗 Linked to material: ${sharedMaterialId}`);
        console.log(`🏢 Supplier relationship: ${relationshipResult.id}`);
        if (priceHistoryResult?.success) {
          console.log(`💰 Price history created`);
        }
        
        results.push(result);
        
      } catch (error) {
        console.error(`Failed to create supplier relationship: ${error.message}`);
        results.push({
          success: false,
          error: `Supplier relationship failed: ${error.message}`,
          url: supplier.url,
          supplierIndex: i + 1,
          data: extractionResult.data
        });
      }
      
    } catch (error) {
      console.error(`Error processing supplier ${i + 1}: ${error.message}`);
      results.push({
        success: false,
        error: error.message,
        url: supplier.url,
        supplierIndex: i + 1
      });
    }
    
    // Delay between supplier requests
    if (settings.batchDelay > 0 && i < materialConfig.suppliers.length - 1) {
      console.log(`⏳ Waiting ${settings.batchDelay}ms before next supplier...`);
      await new Promise(resolve => setTimeout(resolve, settings.batchDelay));
    }
  }
  
  // Summary for this material
  const successful = results.filter(r => r.success).length;
  const inserted = results.filter(r => r.insertResult?.success).length;
  console.log(`\n📊 Material Summary: ${successful}/${results.length} successful, ${inserted} supplier relationships created`);
  
  return results;
}

/**
 * Main batch processor function
 */
async function processBatch(configFile = './product-urls.json') {
  try {
    console.log('🚀 Starting batch processing...');
    
    // Load configuration
    const config = await loadProductConfig(configFile);
    if (!config) {
      throw new Error('Failed to load configuration file');
    }
    
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      inserted: 0,
      materials: {},
      details: []
    };
    
    // Process materials with multiple suppliers
    if (config.materials) {
      console.log(`\n🔧 Processing ${Object.keys(config.materials).length} material specifications...`);
      
      for (const [materialKey, materialConfig] of Object.entries(config.materials)) {
        const materialResults = await processMaterialSuppliers(materialKey, materialConfig, config.settings);
        
        // Store material-specific results
        results.materials[materialKey] = {
          name: materialConfig.name,
          specifications: materialConfig.specifications,
          suppliers: materialResults,
          summary: {
            total: materialResults.length,
            successful: materialResults.filter(r => r.success).length,
            inserted: materialResults.filter(r => r.insertResult?.success).length
          }
        };
        
        // Add to overall results
        for (const result of materialResults) {
          results.details.push(result);
          results.processed++;
          
          if (result.success) {
            results.successful++;
            if (result.insertResult?.success) {
              results.inserted++;
            }
          } else {
            results.failed++;
          }
        }
        
        // Delay between materials
        if (config.settings.batchDelay > 0) {
          console.log(`⏳ Waiting ${config.settings.batchDelay}ms before next material...`);
          await new Promise(resolve => setTimeout(resolve, config.settings.batchDelay));
        }
      }
    }
    
    // Process individual products
    if (config.products && config.products.length > 0) {
      console.log(`\n📋 Processing ${config.products.length} individual products...`);
      
      for (const product of config.products) {
        const result = await processSingleProduct(product, config.settings);
        results.details.push(result);
        results.processed++;
        
        if (result.success) {
          results.successful++;
          if (result.insertResult?.success) {
            results.inserted++;
          }
        } else {
          results.failed++;
        }
        
        // Delay between requests
        if (config.settings.batchDelay > 0) {
          console.log(`⏳ Waiting ${config.settings.batchDelay}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, config.settings.batchDelay));
        }
      }
    }
    
    // Process categories
    if (config.categories) {
      for (const [categoryName, categoryConfig] of Object.entries(config.categories)) {
        const categoryResults = await processCategory(categoryName, categoryConfig, config.settings);
        
        for (const result of categoryResults) {
          results.details.push(result);
          results.processed++;
          
          if (result.success) {
            results.successful++;
            if (result.insertResult?.success) {
              results.inserted++;
            }
          } else {
            results.failed++;
          }
        }
        
        // Delay between categories
        if (config.settings.batchDelay > 0) {
          console.log(`⏳ Waiting ${config.settings.batchDelay}ms before next category...`);
          await new Promise(resolve => setTimeout(resolve, config.settings.batchDelay));
        }
      }
    }
    
    // Summary
    console.log('\n📊 BATCH PROCESSING SUMMARY');
    console.log('=' * 40);
    console.log(`Total processed: ${results.processed}`);
    console.log(`Successful extractions: ${results.successful}`);
    console.log(`Failed extractions: ${results.failed}`);
    console.log(`Successfully inserted: ${results.inserted}`);
    console.log(`Success rate: ${((results.successful / results.processed) * 100).toFixed(1)}%`);
    
    // Material-specific summary
    if (Object.keys(results.materials).length > 0) {
      console.log('\n🔧 MATERIALS SUMMARY:');
      for (const [materialKey, materialData] of Object.entries(results.materials)) {
        console.log(`  ${materialKey}: ${materialData.summary.successful}/${materialData.summary.total} suppliers successful`);
      }
    }
    
    // Save detailed results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `batch-results-${timestamp}.json`;
    await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${outputFile}`);
    
    return results;
    
  } catch (error) {
    console.error(`❌ Batch processing failed: ${error.message}`);
    return null;
  }
}

/**
 * CLI interface
 */
async function main() {
  const configFile = process.argv[2] || './product-urls.json';
  console.log(`Using config file: ${configFile}`);
  
  await processBatch(configFile);
}

// Export functions
module.exports = {
  loadProductConfig,
  processSingleProduct,
  processCategory,
  processMaterialSuppliers,
  processBatch
};

// Run if called directly
if (require.main === module) {
  main();
} 