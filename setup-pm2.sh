#!/bin/bash

# PM2 Setup Script for Price Updater

echo "🚀 Setting up PM2 for Price Updater..."

# Navigate to project directory
cd ~/priceUpdaterCPG

# Check if we're in the right directory
if [ ! -f "priceUpdater.js" ]; then
    echo "❌ Error: priceUpdater.js not found. Are you in the correct directory?"
    exit 1
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Install project dependencies
echo "📦 Installing project dependencies..."
npm install

# Stop any existing PM2 processes for this app
echo "🛑 Stopping existing price-updater processes..."
pm2 stop price-updater price-updater-continuous 2>/dev/null || true
pm2 delete price-updater price-updater-continuous 2>/dev/null || true

# Start the price updater with PM2
echo "▶️  Starting price updater with PM2..."

# Option 1: Run once daily (recommended for price monitoring)
echo "📅 Setting up daily price updates..."
pm2 start ecosystem.config.js --only price-updater

# Option 2: Continuous mode (uncomment if you want continuous monitoring)
# echo "🔄 Setting up continuous monitoring..."
# pm2 start ecosystem.config.js --only price-updater-continuous

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup

echo ""
echo "✅ PM2 setup completed!"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "📋 Useful PM2 commands:"
echo "  pm2 status                    - Check status"
echo "  pm2 logs price-updater       - View logs"
echo "  pm2 restart price-updater    - Restart service"
echo "  pm2 stop price-updater       - Stop service"
echo "  pm2 start price-updater      - Start service"
echo "  pm2 monit                    - Monitor in real-time"
echo ""
echo "📁 Log files:"
echo "  ~/priceUpdaterCPG/logs/combined.log"
echo "  ~/priceUpdaterCPG/cron.log"
echo ""
echo "🎯 The price updater will now run daily at 9:00 AM" 