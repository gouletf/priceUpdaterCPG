#!/bin/bash

# Simple cron script for price updater
cd ~/priceUpdaterCPG
source .env
node priceUpdater.js --once >> cron.log 2>&1 