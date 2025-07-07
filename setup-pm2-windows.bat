@echo off
echo 🚀 Setting up PM2 for Price Updater on Windows...

REM Check if we're in the right directory
if not exist "priceUpdater.js" (
    echo ❌ Error: priceUpdater.js not found. Are you in the correct directory?
    pause
    exit /b 1
)

REM Install PM2 globally if not already installed
echo 📦 Checking PM2 installation...
npm list -g pm2 >nul 2>&1
if errorlevel 1 (
    echo 📦 Installing PM2...
    npm install -g pm2
)

REM Create logs directory
if not exist "logs" mkdir logs

REM Install project dependencies
echo 📦 Installing project dependencies...
npm install

REM Stop any existing PM2 processes for this app
echo 🛑 Stopping existing price-updater processes...
pm2 stop price-updater price-updater-continuous 2>nul
pm2 delete price-updater price-updater-continuous 2>nul

REM Start the price updater with PM2
echo ▶️ Starting price updater with PM2...

REM Option 1: Run once daily (recommended for price monitoring)
echo 📅 Setting up daily price updates...
pm2 start ecosystem.config.js --only price-updater

REM Save PM2 configuration
pm2 save

echo.
echo ✅ PM2 setup completed!
echo.
echo 📊 PM2 Status:
pm2 status
echo.
echo 📋 Useful PM2 commands:
echo   pm2 status                    - Check status
echo   pm2 logs price-updater       - View logs
echo   pm2 restart price-updater    - Restart service
echo   pm2 stop price-updater       - Stop service
echo   pm2 start price-updater      - Start service
echo   pm2 monit                    - Monitor in real-time
echo.
echo 📁 Log files:
echo   logs\combined.log
echo   cron.log
echo.
echo 🎯 The price updater will now run daily at 9:00 AM
pause 