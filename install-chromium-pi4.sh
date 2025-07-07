#!/bin/bash

# Install Chromium and ChromeDriver for Selenium on Raspberry Pi 4 (Recommended)

echo "🔄 Installing Chromium and ChromeDriver for Selenium..."

# Update package list
sudo apt update

# Install Chromium and dependencies
echo "📦 Installing Chromium..."
sudo apt install -y chromium-browser chromium-chromedriver

# Test the installation
echo "🧪 Testing Chromium installation..."
chromium-browser --version

echo "🧪 Testing ChromeDriver installation..."
chromedriver --version

echo ""
echo "✅ Chromium and ChromeDriver installed successfully!"
echo ""
echo "🎯 Next steps:"
echo "1. Restart your price updater: pm2 restart price-updater"
echo "2. Test the price updater: npm run price-updater-once"
echo "3. Check logs: pm2 logs price-updater" 