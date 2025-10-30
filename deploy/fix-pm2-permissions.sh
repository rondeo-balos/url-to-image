#!/bin/bash

# Fix PM2 permissions for www-data user
# Run this script as root/sudo if you encounter PM2 permission issues

set -e

SERVICE_USER="www-data"
PROJECT_NAME="html-to-image"
PROJECT_DIR="/var/www/html-to-image"

echo "🔧 Fixing PM2 permissions for $SERVICE_USER user..."

# Create PM2 directories with proper permissions
echo "Creating PM2 directories..."
mkdir -p /var/www/.pm2/logs
mkdir -p /var/www/.pm2/pids  
mkdir -p /var/www/.pm2/modules
mkdir -p /var/www/.pm2/touch

# Set ownership
echo "Setting ownership..."
chown -R $SERVICE_USER:$SERVICE_USER /var/www/.pm2
chmod -R 755 /var/www/.pm2

# Kill any existing PM2 processes
echo "Stopping existing PM2 processes..."
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 kill || true

# Start PM2 with proper environment
echo "Starting PM2 with correct configuration..."
cd $PROJECT_DIR
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 start deploy/ecosystem.config.js --env production

# Save PM2 configuration
echo "Saving PM2 configuration..."
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 save

# Check status
echo "Checking PM2 status..."
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 status

echo "✅ PM2 permissions fixed!"
echo ""
echo "Useful commands:"
echo "• Check status: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 status"
echo "• Check logs: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 logs"
echo "• Restart app: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 restart $PROJECT_NAME"