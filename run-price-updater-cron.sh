#!/bin/bash

# Cron script for the main price updater
# This script runs the priceUpdater.js which monitors existing products in the database

# Set the working directory
cd ~/priceUpdaterCPG

# Load environment variables
source .env

# Set Node.js path (adjust if needed)
export PATH="/usr/bin:$PATH"

# Create timestamp for logging
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log the start time
echo "[$TIMESTAMP] ===== STARTING PRICE UPDATER CRON JOB =====" >> ~/priceUpdaterCPG/cron.log

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "[$TIMESTAMP] ERROR: Node.js not found" >> ~/priceUpdaterCPG/cron.log
    exit 1
fi

# Check if the price updater script exists
if [ ! -f "priceUpdater.js" ]; then
    echo "[$TIMESTAMP] ERROR: priceUpdater.js not found" >> ~/priceUpdaterCPG/cron.log
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "[$TIMESTAMP] ERROR: .env file not found" >> ~/priceUpdaterCPG/cron.log
    exit 1
fi

# Run the price updater once (not continuous mode for cron)
echo "[$TIMESTAMP] Running price updater..." >> ~/priceUpdaterCPG/cron.log

# Run the price updater with --once flag to run once and exit
node priceUpdater.js --once >> ~/priceUpdaterCPG/cron.log 2>&1

# Capture the exit code
EXIT_CODE=$?

# Log the end time and status
if [ $EXIT_CODE -eq 0 ]; then
    echo "[$TIMESTAMP] ===== PRICE UPDATER COMPLETED SUCCESSFULLY =====" >> ~/priceUpdaterCPG/cron.log
else
    echo "[$TIMESTAMP] ===== PRICE UPDATER FAILED (Exit code: $EXIT_CODE) =====" >> ~/priceUpdaterCPG/cron.log
fi

echo "[$TIMESTAMP] ================================================" >> ~/priceUpdaterCPG/cron.log
echo "" >> ~/priceUpdaterCPG/cron.log

# Exit with the same code as the price updater
exit $EXIT_CODE 