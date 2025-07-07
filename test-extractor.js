// Test script for the product data extractor
require('dotenv').config();
const { processProductUrl } = require('./extract-product-data-node');

// Test URLs - Amazon.ca aluminum sheet products
const testUrls = [
  {
    url: "https://www.amazon.ca/Aluminum-Protective-Crafting-Polished-Deburred/dp/B0B4DSK5H4/ref=sr_1_15?crid=1N171X9L0W921&dib=eyJ2IjoiMSJ9.6hVw1pMtHhwLlexHBKqr69aT3NJc5ooWm71Sax2y9mxPklEhqWAWuYEthco9RdZCX4VOxNvte7tydOZBCvk-TOe4FlzXxadF5t2w6-Pc56XNdt5ixbJwSF0EsOZPl96I06CECrNdMJe088G8J4LTO0ZWZVqDTHgernRoT8JQUNXnFL2XNpltuQC3LrKjRUwuFEUqhf1O52oSjuIK4EUi9ib3wN-zVzMz9O0DoNNdkOWsAfRfZzWCccsfah8-_ud5tYCrPMUxVeoNDAlUl9sn0FUGRpyaAEGsJNbFh6goj7w.cpJ1Dw8fvS_42Rmag6CiMxS-iCzB1kWG5FvnGYp_ryM&dib_tag=se&keywords=aluminium+sheet+t6&qid=1716944356&sprefix=aluminium+sheet+t6%2Caps%2C65&sr=8-15",
    type: "material", // Aluminum sheet - should be classified as material
    description: "Amazon.ca Aluminum T6 Sheet - Polished/Deburred"
  },
  {
    url: "https://www.amazon.ca/Aluminum-Protective-Treatable-Rectangle-Crafting/dp/B0B8NLBZLZ/ref=sr_1_8?crid=17967GX975C9J&dib=eyJ2IjoiMSJ9.4Jlk7lPB5AWbAzxdNf-nUD8pzvduAsvEmzr3UIVcxFEPUP0I3dmvXAd4I6emzqru61HecOmIyqZDtBO235nVtHY72ny9csv9REoib0N0Zira_eCgJhs3YrdAOnZTxbiUykk1Af4rL3PzZAwcpUnwGHhr4n9cIndObWFBUibW810U73Ths_AoNJwL0X4rIOkqMK0V_4FDBtVkEHKkkN2RGdR-0uJbXMvZ1ev7EMXMmeyQD-oQxCymFDi3gXMA0mtUg-CiquOu9iW4_wkknIHlNT2IMqstG7HMwVejCmer2yo.G7RWYp_a9c82X0KixpSd47qXEg5lBuRHDuWr-y2KpLQ&dib_tag=se&keywords=aluminium+sheet&qid=1716944301&sprefix=aluminium+sheet%2Caps%2C78&sr=8-9",
    type: "material", // Aluminum sheet - should be classified as material
    description: "Amazon.ca Aluminum Sheet - Heat Treatable Rectangle"
  },
  {
    url: "https://www.amazon.ca/Aluminium-Metal-Sheet-Thickness-Sheets/dp/B09ZNS571Y/ref=sr_1_18?crid=1N171X9L0W921&dib=eyJ2IjoiMSJ9.6hVw1pMtHhwLlexHBKqr69aT3NJc5ooWm71Sax2y9mxPklEhqWAWuYEthco9RdZCX4VOxNvte7tydOZBCvk-TOe4FlzXxadF5t2w6-Pc56XNdt5ixbJwSF0EsOZPl96I06CECrNdMJe088G8J4LTO0ZWZVqDTHgernRoT8JQUNXnFL2XNpltuQC3LrKjRUwuFEUqhf1O52oSjuIK4EUi9ib3wN-zVzMz9O0DoNNdkOWsAfRfZzWCccsfah8-_ud5tYCrPMUxVeoNDAlUl9sn0FUGRpyaAEGsJNbFh6goj7w.cpJ1Dw8fvS_42Rmag6CiMxS-iCzB1kWG5FvnGYp_ryM&dib_tag=se&keywords=aluminium+sheet+t6&qid=1716944356&sprefix=aluminium+sheet+t6%2Caps%2C65&sr=8-18",
    type: "material", // Aluminum sheet - should be classified as material
    description: "Amazon.ca Aluminium Metal Sheet - Various Thickness"
  },
  {
    url: "https://www.amazon.ca/dp/B0CHJ8DRFJ/ref=twister_B0CP3BH4X7?_encoding=UTF8&th=1",
    type: null, // Let the system auto-classify
    description: "Amazon.ca Product - Auto-classify"
  }
];

async function runTests() {
  console.log("🧪 Testing Product Data Extractor\n");
  console.log("Environment Check:");
  console.log("- SUPABASE_URL:", process.env.SUPABASE_URL ? "✅ Set" : "❌ Not set");
  console.log("- SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? "✅ Set" : "❌ Not set");
  console.log();

  for (let i = 0; i < testUrls.length; i++) {
    const test = testUrls[i];
    console.log(`🔍 Test ${i + 1}: ${test.description}`);
    console.log(`URL: ${test.url}`);
    console.log(`Expected Type: ${test.type || 'auto-classify'}`);
    console.log();

         try {
       // Extract and insert to database
       const result = await processProductUrl(test.url, test.type, true);
      
      if (result.success) {
        console.log("✅ Extraction successful!");
        console.log(`📝 Product Name: ${result.data.name || 'Not found'}`);
        console.log(`💰 Price: ${result.data.price ? `${result.data.currency || '$'}${result.data.price}` : 'Not found'}`);
        console.log(`🏷️  Brand: ${result.data.brand || 'Not found'}`);
        console.log(`📦 SKU: ${result.data.sku || 'Not found'}`);
        console.log(`🎯 Classification: ${result.data.suggested_type} (${result.data.confidence}% confidence)`);
        console.log(`📏 Dimensions: ${Object.keys(result.data.dimensions).length > 0 ? 'Found' : 'Not found'}`);
        
        if (result.suggestions.parts && Object.keys(result.suggestions.parts).length > 0) {
          console.log("\n📋 Parts Table Suggestion:");
          console.log(JSON.stringify(result.suggestions.parts, null, 2));
        }
        
        if (result.suggestions.materials && Object.keys(result.suggestions.materials).length > 0) {
          console.log("\n📋 Materials Table Suggestion:");
          console.log(JSON.stringify(result.suggestions.materials, null, 2));
        }
        
        // Show database insertion results
        if (result.insertResult) {
          if (result.insertResult.success) {
            console.log("\n🗄️ Database Insertion:");
            console.log(`✅ Successfully inserted into ${result.insertResult.tableName} table`);
            console.log(`📍 Record ID: ${result.insertResult.recordId}`);
            console.log(`🏢 Supplier record: ${result.insertResult.supplierData?.data ? 'Created' : 'Failed'}`);
            console.log(`🎯 Confidence: ${result.insertResult.confidence}%`);
          } else {
            console.log("\n🗄️ Database Insertion:");
            console.log(`❌ Failed to insert: ${result.insertResult.error}`);
          }
        }
        
      } else {
        console.log("❌ Extraction failed:");
        console.log(`Error: ${result.error}`);
      }
      
    } catch (error) {
      console.log("💥 Test failed with exception:");
      console.log(`Error: ${error.message}`);
    }
    
    console.log("\n" + "─".repeat(60) + "\n");
  }
}

// Example of how to use with database insertion (uncomment to test)
async function testDatabaseInsertion() {
  console.log("🗄️ Testing Database Insertion\n");
  
  const testUrl = "https://example.com/product";
  const result = await processProductUrl(testUrl, 'part', true); // true = insert to database
  
  if (result.success && result.insertResult) {
    console.log("✅ Successfully inserted to database!");
    console.log(`Table: ${result.insertResult.tableName}`);
    console.log(`Record ID: ${result.insertResult.recordId}`);
  } else {
    console.log("❌ Database insertion failed");
    console.log(result.insertResult?.error || result.error);
  }
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
  
  // Uncomment the line below to test database insertion
  // testDatabaseInsertion().catch(console.error);
} 