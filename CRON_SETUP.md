# Setting up priceUpdater as a Cron Job on Raspberry Pi 4

This guide will help you set up the priceUpdater to run automatically on a schedule using cron jobs on your Raspberry Pi 4.

## Prerequisites

- Raspberry Pi 4 with Raspberry Pi OS (or any Linux distribution)
- Node.js 16 or higher installed
- Git installed
- Internet connection for the Pi

## Step 1: Install Node.js on Raspberry Pi 4

```bash
# Update package list
sudo apt update

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

## Step 2: Clone and Setup the Project

```bash
# Navigate to your home directory
cd ~

# Clone the repository (replace with your actual repository URL)
git clone https://github.com/yourusername/priceUpdaterCPG.git
cd priceUpdaterCPG

# Install dependencies
npm install
```

## Step 3: Configure Environment Variables

```bash
# Create the .env file
nano .env
```

Add your Supabase credentials to the `.env` file:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 4: Test the Setup

```bash
# Test that everything works
node batch-processor.js

# Or test with a single product
node extract-product-data-node.js
```

## Step 5: Create a Shell Script Wrapper

Create a shell script that will be executed by cron:

```bash
# Create the script
nano ~/priceUpdaterCPG/run-price-updater.sh
```

Add the following content to the script:

```bash
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
```

Make the script executable:

```bash
chmod +x ~/priceUpdaterCPG/run-price-updater.sh
```

## Step 6: Set Up the Cron Job

Open the crontab editor:

```bash
crontab -e
```

Add one of the following cron job entries based on your desired schedule:

### Daily at 6:00 AM
```bash
0 6 * * * /home/pi/priceUpdaterCPG/run-price-updater.sh
```

### Every 6 hours
```bash
0 */6 * * * /home/pi/priceUpdaterCPG/run-price-updater.sh
```

### Every 12 hours (6 AM and 6 PM)
```bash
0 6,18 * * * /home/pi/priceUpdaterCPG/run-price-updater.sh
```

### Every Monday at 9:00 AM
```bash
0 9 * * 1 /home/pi/priceUpdaterCPG/run-price-updater.sh
```

### Every hour during business hours (9 AM to 5 PM, Monday to Friday)
```bash
0 9-17 * * 1-5 /home/pi/priceUpdaterCPG/run-price-updater.sh
```

## Step 7: Verify Cron Job Setup

```bash
# List current cron jobs
crontab -l

# Check cron service status
sudo systemctl status cron
```

## Step 8: Monitor the Cron Job

### Check the logs:
```bash
# View the cron log
tail -f ~/priceUpdaterCPG/cron.log

# View system cron logs
sudo tail -f /var/log/syslog | grep CRON
```

### Test the cron job manually:
```bash
# Run the script manually to test
~/priceUpdaterCPG/run-price-updater.sh

# Check if it worked
tail ~/priceUpdaterCPG/cron.log
```

## Step 9: Additional Configuration (Optional)

### Create a more detailed logging script:

```bash
nano ~/priceUpdaterCPG/run-price-updater-detailed.sh
```

```bash
#!/bin/bash

# Set the working directory
cd ~/priceUpdaterCPG

# Load environment variables
source .env

# Set Node.js path
export PATH="/usr/bin:$PATH"

# Create timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log the start
echo "[$TIMESTAMP] ===== STARTING PRICE UPDATER =====" >> ~/priceUpdaterCPG/detailed-cron.log

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "[$TIMESTAMP] ERROR: Node.js not found" >> ~/priceUpdaterCPG/detailed-cron.log
    exit 1
fi

# Check if the script exists
if [ ! -f "batch-processor.js" ]; then
    echo "[$TIMESTAMP] ERROR: batch-processor.js not found" >> ~/priceUpdaterCPG/detailed-cron.log
    exit 1
fi

# Run the batch processor with detailed output
node batch-processor.js 2>&1 | while IFS= read -r line; do
    echo "[$TIMESTAMP] $line" >> ~/priceUpdaterCPG/detailed-cron.log
done

# Log the end
echo "[$TIMESTAMP] ===== FINISHED PRICE UPDATER =====" >> ~/priceUpdaterCPG/detailed-cron.log
echo "" >> ~/priceUpdaterCPG/detailed-cron.log
```

Make it executable:
```bash
chmod +x ~/priceUpdaterCPG/run-price-updater-detailed.sh
```

## Step 10: Troubleshooting

### Common Issues:

1. **Permission denied**: Make sure the script is executable
   ```bash
   chmod +x ~/priceUpdaterCPG/run-price-updater.sh
   ```

2. **Node.js not found**: Add the full path to Node.js in the script
   ```bash
   # Find Node.js path
   which node
   # Update the script with the full path
   ```

3. **Environment variables not loaded**: Ensure the `.env` file exists and has correct permissions
   ```bash
   ls -la ~/priceUpdaterCPG/.env
   ```

4. **Cron job not running**: Check if cron service is running
   ```bash
   sudo systemctl status cron
   sudo systemctl enable cron
   sudo systemctl start cron
   ```

### Debug cron jobs:
```bash
# Check cron logs
sudo tail -f /var/log/syslog | grep CRON

# Check your specific log file
tail -f ~/priceUpdaterCPG/cron.log
```

## Step 11: Maintenance

### Update the project:
```bash
cd ~/priceUpdaterCPG
git pull
npm install
```

### Rotate logs (optional):
Create a log rotation script:

```bash
nano ~/priceUpdaterCPG/rotate-logs.sh
```

```bash
#!/bin/bash
# Rotate logs older than 30 days
find ~/priceUpdaterCPG -name "*.log" -mtime +30 -delete
find ~/priceUpdaterCPG -name "batch-results-*.json" -mtime +30 -delete
```

Make it executable and add to crontab:
```bash
chmod +x ~/priceUpdaterCPG/rotate-logs.sh
# Add to crontab to run weekly
# 0 2 * * 0 /home/pi/priceUpdaterCPG/rotate-logs.sh
```

## Cron Schedule Examples

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Daily at 6 AM | `0 6 * * *` | Run once per day |
| Every 6 hours | `0 */6 * * *` | Run 4 times per day |
| Every 12 hours | `0 6,18 * * *` | Run twice per day |
| Weekdays only | `0 9 * * 1-5` | Run weekdays at 9 AM |
| Weekly | `0 9 * * 1` | Run every Monday at 9 AM |
| Monthly | `0 9 1 * *` | Run first day of month at 9 AM |

## Security Considerations

1. **File permissions**: Ensure sensitive files are not world-readable
   ```bash
   chmod 600 ~/priceUpdaterCPG/.env
   ```

2. **Network security**: Ensure your Pi is on a secure network

3. **Updates**: Keep your Pi and Node.js updated regularly

## Monitoring and Alerts

Consider setting up email notifications for job failures:

```bash
# Add to your cron script
if [ $? -ne 0 ]; then
    echo "Price updater failed at $(date)" | mail -s "Price Updater Alert" your-email@example.com
fi
```

This setup will allow your priceUpdater to run automatically on your Raspberry Pi 4 according to your specified schedule. 