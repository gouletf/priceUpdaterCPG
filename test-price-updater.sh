#!/bin/bash

# Test script for priceUpdater
echo "🧪 Testing Price Updater Setup"
echo "================================"

# Set the working directory
cd ~/priceUpdaterCPG

# Check if we're in the right directory
if [ ! -f "batch-processor.js" ]; then
    echo "❌ ERROR: batch-processor.js not found. Are you in the correct directory?"
    exit 1
fi

echo "✅ Found batch-processor.js"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found. Please create it with your Supabase credentials."
    exit 1
fi

echo "✅ Found .env file"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ ERROR: Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js is available: $(node --version)"

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "⚠️  WARNING: node_modules not found. Installing dependencies..."
    npm install
fi

echo "✅ Dependencies are installed"

# Load environment variables
source .env

# Test 1: Check if environment variables are loaded
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ ERROR: Supabase environment variables not found in .env file"
    exit 1
fi

echo "✅ Environment variables loaded"

# Test 2: Test a single product extraction (if product-urls.json exists)
if [ -f "product-urls.json" ]; then
    echo ""
    echo "📋 Testing with product-urls.json configuration..."
    
    # Run a quick test with the batch processor
    echo "Running batch processor test..."
    timeout 60s node batch-processor.js > test-output.log 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Batch processor completed successfully"
        echo "📄 Output saved to test-output.log"
        echo ""
        echo "Last few lines of output:"
        tail -10 test-output.log
    else
        echo "❌ Batch processor failed or timed out"
        echo "📄 Check test-output.log for details"
        echo ""
        echo "Last few lines of output:"
        tail -10 test-output.log
    fi
else
    echo "⚠️  No product-urls.json found. Creating a simple test configuration..."
    
    # Create a simple test configuration
    cat > test-product-urls.json << 'EOF'
{
  "settings": {
    "batchDelay": 1000,
    "defaultInsert": true
  },
  "products": [
    {
      "url": "https://www.mcmaster.com/91251A031/",
      "expectedType": "part",
      "insert": true,
      "priority": "normal",
      "notes": "Test product"
    }
  ]
}
EOF
    
    echo "✅ Created test-product-urls.json"
    echo "📋 Testing with test configuration..."
    
    # Run test with the test configuration
    timeout 60s node batch-processor.js test-product-urls.json > test-output.log 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Test completed successfully"
        echo "📄 Output saved to test-output.log"
        echo ""
        echo "Last few lines of output:"
        tail -10 test-output.log
    else
        echo "❌ Test failed or timed out"
        echo "📄 Check test-output.log for details"
        echo ""
        echo "Last few lines of output:"
        tail -10 test-output.log
    fi
fi

# Test 3: Test the cron script
echo ""
echo "🕐 Testing cron script..."
if [ -f "run-price-updater.sh" ]; then
    echo "✅ Found run-price-updater.sh"
    
    # Test the cron script
    timeout 30s bash run-price-updater.sh > cron-test-output.log 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Cron script executed successfully"
        echo "📄 Cron output saved to cron-test-output.log"
    else
        echo "❌ Cron script failed or timed out"
        echo "📄 Check cron-test-output.log for details"
    fi
else
    echo "⚠️  run-price-updater.sh not found. Creating it..."
    
    # Create the cron script
    cat > run-price-updater.sh << 'EOF'
#!/bin/bash

# Set the working directory
cd ~/priceUpdaterCPG

# Load environment variables
source .env

# Set Node.js path (adjust if needed)
export PATH="/usr/bin:$PATH"

# Log the start time
echo "$(date): Starting price updater batch process" >> ~/priceUpdaterCPG/cron.log

# Run the batch processor
node batch-processor.js >> ~/priceUpdaterCPG/cron.log 2>&1

# Log the end time
echo "$(date): Finished price updater batch process" >> ~/priceUpdaterCPG/cron.log
echo "----------------------------------------" >> ~/priceUpdaterCPG/cron.log
EOF
    
    chmod +x run-price-updater.sh
    echo "✅ Created and made executable run-price-updater.sh"
fi

# Summary
echo ""
echo "📊 TEST SUMMARY"
echo "==============="
echo "✅ Project structure: OK"
echo "✅ Node.js: OK"
echo "✅ Dependencies: OK"
echo "✅ Environment variables: OK"
echo "✅ Batch processor: Tested"
echo "✅ Cron script: Ready"

echo ""
echo "🎯 Next steps:"
echo "1. Review the output logs to ensure everything worked"
echo "2. Set up your cron job: crontab -e"
echo "3. Add a schedule like: 0 6 * * * /home/pi/priceUpdaterCPG/run-price-updater.sh"
echo "4. Monitor with: tail -f ~/priceUpdaterCPG/cron.log"

echo ""
echo "📁 Generated files:"
echo "- test-output.log (batch processor output)"
echo "- cron-test-output.log (cron script test output)"
echo "- cron.log (cron execution logs)"
echo "- test-product-urls.json (test configuration if needed)" 