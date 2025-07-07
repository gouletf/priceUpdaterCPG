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