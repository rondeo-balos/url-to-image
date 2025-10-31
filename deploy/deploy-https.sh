#!/bin/bash

# HTML to Image Server Deployment Script with HTTPS Support
# This script deploys the server to a production environment with SSL certificates

set -e

echo "🚀 Starting HTML to Image Server Deployment with HTTPS..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root or with sudo privileges"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    print_success "Node.js is already installed ($(node --version))"
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
else
    print_success "PM2 is already installed"
fi

# Create application directory
APP_DIR="/var/www/html-to-image"
print_status "Creating application directory: $APP_DIR"
mkdir -p $APP_DIR

# Set proper ownership for the application directory
print_status "Setting up directory permissions..."
chown -R www-data:www-data $APP_DIR

# Navigate to project directory (assuming script is run from project root)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
print_status "Project directory: $PROJECT_DIR"

# Copy application files
print_status "Copying application files..."
cp -r $PROJECT_DIR/* $APP_DIR/
chown -R www-data:www-data $APP_DIR

# Check SSL certificates
print_status "Checking SSL certificates..."
SSL_CERT_PATH="/root/cert/n8n.gotobizpro.com.pem"
SSL_KEY_PATH="/root/cert/n8n.gotobizpro.com.key"

if [[ -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
    print_success "SSL certificates found at $SSL_CERT_PATH"
    # Create a copy accessible by www-data
    mkdir -p $APP_DIR/cert
    cp $SSL_CERT_PATH $APP_DIR/cert/
    cp $SSL_KEY_PATH $APP_DIR/cert/
    chown -R www-data:www-data $APP_DIR/cert
    chmod 644 $APP_DIR/cert/n8n.gotobizpro.com.pem
    chmod 600 $APP_DIR/cert/n8n.gotobizpro.com.key
    
    # Update environment to use local cert path
    sed -i 's|SSL_CERT_PATH=/root/cert/n8n.gotobizpro.com.pem|SSL_CERT_PATH='$APP_DIR'/cert/n8n.gotobizpro.com.pem|g' $APP_DIR/.env
    sed -i 's|SSL_KEY_PATH=/root/cert/n8n.gotobizpro.com.key|SSL_KEY_PATH='$APP_DIR'/cert/n8n.gotobizpro.com.key|g' $APP_DIR/.env
else
    print_warning "SSL certificates not found at expected location"
    print_warning "Server will run in HTTP mode"
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
cd $APP_DIR
sudo -u www-data npm install

# Install Playwright browsers with proper permissions
print_status "Installing Playwright browsers..."
sudo -u www-data npx playwright install chromium
print_status "Installing Playwright system dependencies..."
npx playwright install-deps chromium

# Fix browser permissions
print_status "Setting up browser permissions..."
# Ensure www-data can access playwright cache
mkdir -p /home/www-data/.cache
chown -R www-data:www-data /home/www-data/.cache
sudo -u www-data npx playwright install chromium --force

# Stop any existing PM2 processes
print_status "Stopping existing PM2 processes..."
sudo -u www-data pm2 stop html-to-image 2>/dev/null || true
sudo -u www-data pm2 delete html-to-image 2>/dev/null || true

# Update PM2 ecosystem config to use local cert paths
sed -i 's|SSL_CERT_PATH.*|SSL_CERT_PATH: "'$APP_DIR'/cert/n8n.gotobizpro.com.pem",|g' $APP_DIR/deploy/ecosystem.config.js
sed -i 's|SSL_KEY_PATH.*|SSL_KEY_PATH: "'$APP_DIR'/cert/n8n.gotobizpro.com.key"|g' $APP_DIR/deploy/ecosystem.config.js

# Setup PM2 ecosystem
print_status "Starting PM2 application..."
sudo -u www-data pm2 start $APP_DIR/deploy/ecosystem.config.js --env production

# Save PM2 processes
print_status "Saving PM2 processes..."
sudo -u www-data pm2 save

# Setup PM2 startup script
print_status "Setting up PM2 startup script..."
pm2 startup systemd -u www-data --hp /home/www-data

# Setup firewall
print_status "Configuring firewall..."
ufw allow 22
ufw allow 3000  # Allow direct access to Node.js HTTPS server
ufw --force enable

# Create logs directory
mkdir -p $APP_DIR/logs
chown -R www-data:www-data $APP_DIR/logs

# Final status check
print_status "Checking application status..."
sleep 5
sudo -u www-data pm2 status

print_success "Deployment completed successfully!"
if [[ -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
    print_success "🔒 HTTPS Server running at: https://your-domain:3000"
    print_status "📸 Screenshot API: https://your-domain:3000/screenshot?url=https://example.com"
    print_status "🩺 Health check: https://your-domain:3000/health"
else
    print_success "🌐 HTTP Server running at: http://your-server-ip:3000"
    print_status "📸 Screenshot API: http://your-server-ip:3000/screenshot?url=https://example.com"
    print_status "🩺 Health check: http://your-server-ip:3000/health"
fi
print_status "📊 To check status: sudo -u www-data pm2 status"
print_status "📋 To view logs: sudo -u www-data pm2 logs html-to-image"
print_status "🔄 To restart: sudo -u www-data pm2 restart html-to-image"