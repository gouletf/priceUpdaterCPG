// Quick test for supplier auto-creation
require('dotenv').config();
const { processProductUrl } = require('./extract-product-data-node');

async function testSingleProduct() {
  console.log('🧪 Testing Supplier Auto-Creation\n');
  
  const testUrl = 'https://www.amazon.ca/Aluminum-Protective-Crafting-Polished-Deburred/dp/B0B4DSK5H4/';
  
  try {
    const result = await processProductUrl(testUrl, 'material', true);
    
    console.log('=== EXTRACTION RESULT ===');
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('Product:', result.data.name?.substring(0, 60) + '...');
      console.log('Price:', '$' + result.data.price);
      console.log('Classification:', result.data.suggested_type, '(' + result.data.confidence + '% confidence)');
      
      if (result.insertResult) {
        console.log('\n=== DATABASE INSERTION ===');
        console.log('Insert Success:', result.insertResult.success);
        
        if (result.insertResult.success) {
          console.log('Table:', result.insertResult.tableName);
          console.log('Record ID:', result.insertResult.recordId);
          console.log('Supplier Record:', result.insertResult.supplierData?.data ? 
            'Created Successfully ✅' : 
            'Failed: ' + result.insertResult.supplierData?.error + ' ❌');
        } else {
          console.log('Insert Error:', result.insertResult.error);
        }
      }
    } else {
      console.log('Error:', result.error);
    }
    
  } catch (error) {
    console.error('Script Error:', error.message);
  }
}

testSingleProduct(); 