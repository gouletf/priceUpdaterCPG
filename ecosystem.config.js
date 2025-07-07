module.exports = {
  apps: [
    {
      name: 'price-updater',
      script: 'priceUpdater.js',
      cwd: '/home/pi/priceUpdaterCPG',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // Run once and exit (for cron-like behavior)
      args: '--once',
      // Restart every 24 hours to get fresh prices
      cron_restart: '0 9 * * *'
    },
    {
      name: 'price-updater-continuous',
      script: 'priceUpdater.js',
      cwd: '/home/pi/priceUpdaterCPG',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err-continuous.log',
      out_file: './logs/out-continuous.log',
      log_file: './logs/combined-continuous.log',
      time: true
      // No args - runs continuously with built-in cron
    }
  ]
}; 