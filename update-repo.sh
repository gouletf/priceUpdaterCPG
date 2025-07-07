#!/bin/bash

# Update script for priceUpdaterCPG on Raspberry Pi 4

echo "🔄 Updating priceUpdaterCPG repository..."

# Navigate to project directory
cd ~/priceUpdaterCPG

# Check if we're in the right directory
if [ ! -f "priceUpdater.js" ]; then
    echo "❌ Error: priceUpdater.js not found. Are you in the correct directory?"
    exit 1
fi

# Stash any local changes (optional - uncomment if needed)
# git stash

# Pull latest changes
echo "📥 Pulling latest changes from repository..."
git pull origin main

# Install any new dependencies
echo "📦 Installing dependencies..."
npm install

# Check if update was successful
if [ $? -eq 0 ]; then
    echo "✅ Repository updated successfully!"
    echo "📊 Current status:"
    git status --porcelain
    echo ""
    echo "🎯 Next steps:"
    echo "1. Test the price updater: npm run price-updater-once"
    echo "2. Restart cron job if needed"
    echo "3. Check logs: tail -f cron.log"
else
    echo "❌ Update failed. Check the error messages above."
    exit 1
fi 