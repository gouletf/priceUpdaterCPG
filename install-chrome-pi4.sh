#!/bin/bash

# Install Chrome and ChromeDriver for Selenium on Raspberry Pi 4

echo "🔄 Installing Chrome and ChromeDriver for Selenium..."

# Update package list
sudo apt update

# Install Chrome dependencies
echo "📦 Installing Chrome dependencies..."
sudo apt install -y wget gnupg2

# Add Google Chrome repository
echo "🌐 Adding Chrome repository..."
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list

# Update package list again
sudo apt update

# Install Google Chrome
echo "📦 Installing Google Chrome..."
sudo apt install -y google-chrome-stable

# Install ChromeDriver
echo "🔧 Installing ChromeDriver..."

# Get the Chrome version
CHROME_VERSION=$(google-chrome --version | awk '{print $3}' | awk -F'.' '{print $1}')

# Download ChromeDriver
echo "📥 Downloading ChromeDriver version $CHROME_VERSION..."
wget -O /tmp/chromedriver.zip https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$CHROME_VERSION

# Get the latest version for this Chrome version
LATEST_VERSION=$(cat /tmp/chromedriver.zip)
wget -O /tmp/chromedriver.zip https://chromedriver.storage.googleapis.com/$LATEST_VERSION/chromedriver_linux64.zip

# Extract and install ChromeDriver
unzip /tmp/chromedriver.zip -d /tmp/
sudo mv /tmp/chromedriver /usr/local/bin/
sudo chmod +x /usr/local/bin/chromedriver

# Clean up
rm /tmp/chromedriver.zip

# Test the installation
echo "🧪 Testing Chrome installation..."
google-chrome --version

echo "🧪 Testing ChromeDriver installation..."
chromedriver --version

echo ""
echo "✅ Chrome and ChromeDriver installed successfully!"
echo ""
echo "🎯 Next steps:"
echo "1. Restart your price updater: pm2 restart price-updater"
echo "2. Test the price updater: npm run price-updater-once"
echo "3. Check logs: pm2 logs price-updater" 