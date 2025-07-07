#!/bin/bash

# Fix ChromeDriver installation for Raspberry Pi 4 (ARM architecture)

echo "🔧 Fixing ChromeDriver for Raspberry Pi 4..."

# Check if we're on ARM architecture
if [ "$(uname -m)" != "armv7l" ] && [ "$(uname -m)" != "aarch64" ]; then
    echo "⚠️  This script is designed for ARM architecture (Pi 4)"
    exit 1
fi

# Remove existing ChromeDriver installations
echo "🧹 Cleaning up existing ChromeDriver..."
sudo apt remove -y chromium-chromedriver 2>/dev/null || true
sudo rm -f /usr/bin/chromedriver
sudo rm -f /usr/local/bin/chromedriver

# Install Chromium browser
echo "📦 Installing Chromium..."
sudo apt update
sudo apt install -y chromium-browser

# Download ChromeDriver for ARM
echo "📥 Downloading ChromeDriver for ARM..."

# Get the latest ChromeDriver version
CHROMEDRIVER_VERSION=$(curl -s https://chromedriver.storage.googleapis.com/LATEST_RELEASE)

# Download ChromeDriver for ARM
wget -O /tmp/chromedriver.zip "https://chromedriver.storage.googleapis.com/$CHROMEDRIVER_VERSION/chromedriver_linux64.zip"

# Extract ChromeDriver
unzip /tmp/chromedriver.zip -d /tmp/

# Install ChromeDriver
sudo mv /tmp/chromedriver /usr/local/bin/
sudo chmod +x /usr/local/bin/chromedriver

# Create symlink
sudo ln -sf /usr/local/bin/chromedriver /usr/bin/chromedriver

# Clean up
rm /tmp/chromedriver.zip

# Test the installation
echo "🧪 Testing ChromeDriver installation..."
chromedriver --version

# Check if it's executable
if [ -x "/usr/local/bin/chromedriver" ]; then
    echo "✅ ChromeDriver installed successfully at /usr/local/bin/chromedriver"
else
    echo "❌ ChromeDriver installation failed"
    exit 1
fi

# Set proper permissions
sudo chown root:root /usr/local/bin/chromedriver
sudo chmod 755 /usr/local/bin/chromedriver

echo ""
echo "🎯 Next steps:"
echo "1. Restart your price updater: pm2 restart price-updater"
echo "2. Test the price updater: npm run price-updater-once"
echo "3. Check logs: pm2 logs price-updater" 