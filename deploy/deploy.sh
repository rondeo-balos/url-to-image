#!/bin/bash

# HTML to Image Server Deployment Script
# Usage: ./deploy.sh [production|staging]

set -e

ENVIRONMENT=${1:-production}
PROJECT_NAME="url-to-image"
PROJECT_DIR="/var/www/$PROJECT_NAME"
NGINX_CONFIG="/etc/nginx/sites-available/$PROJECT_NAME"
SERVICE_USER="www-data"

echo "🚀 Deploying HTML to Image Server - Environment: $ENVIRONMENT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root or with sudo"
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js (if not already installed)
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 globally (if not already installed)
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
fi

# Install Nginx (if not already installed)
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    apt install -y nginx
fi

# Create project directory
print_status "Creating project directory..."
mkdir -p $PROJECT_DIR
mkdir -p $PROJECT_DIR/logs

# Copy application files
print_status "Copying application files..."
cp -r . $PROJECT_DIR/
cd $PROJECT_DIR

# Install dependencies
print_status "Installing Node.js dependencies..."
npm ci --only=production

# Install Playwright browsers
print_status "Installing Playwright browsers..."
npx playwright install chromium
npx playwright install-deps

# Set proper permissions
print_status "Setting file permissions..."
chown -R $SERVICE_USER:$SERVICE_USER $PROJECT_DIR
chmod -R 755 $PROJECT_DIR

# Create PM2 directory for www-data user
print_status "Setting up PM2 directories..."
mkdir -p /var/www/.pm2/logs
mkdir -p /var/www/.pm2/pids
mkdir -p /var/www/.pm2/modules
chown -R $SERVICE_USER:$SERVICE_USER /var/www/.pm2
chmod -R 755 /var/www/.pm2

# Create environment file
print_status "Creating environment file..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env
    print_warning "Please edit $PROJECT_DIR/.env with your configuration"
fi

# Setup PM2
print_status "Setting up PM2..."
# Set PM2_HOME for www-data user
export PM2_HOME=/var/www/.pm2
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 delete $PROJECT_NAME 2>/dev/null || true
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 start $PROJECT_DIR/deploy/ecosystem.config.js --env $ENVIRONMENT

# Save PM2 configuration
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 save

# Setup PM2 startup - this needs to be run as root to setup systemd
print_status "Setting up PM2 startup script..."
sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 startup systemd -u $SERVICE_USER --hp /var/www

# Setup Nginx
print_status "Configuring Nginx..."
cp $PROJECT_DIR/deploy/nginx.conf $NGINX_CONFIG

# Enable site
ln -sf $NGINX_CONFIG /etc/nginx/sites-enabled/$PROJECT_NAME

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if nginx -t; then
    print_status "Nginx configuration is valid"
    systemctl restart nginx
    systemctl enable nginx
else
    print_error "Nginx configuration is invalid"
    exit 1
fi

# Setup firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall..."
    ufw allow 22/tcp
    ufw allow 3000/tcp
    ufw allow 443/tcp
    ufw --force enable
fi

# Create systemd service for PM2 (backup)
print_status "Creating systemd service..."
cat > /etc/systemd/system/$PROJECT_NAME.service << EOF
[Unit]
Description=HTML to Image Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment=PM2_HOME=/var/www/.pm2
Environment=NODE_ENV=$ENVIRONMENT
ExecStart=/usr/bin/pm2 start ecosystem.config.js --no-daemon --env $ENVIRONMENT
ExecReload=/bin/kill -USR2 \$MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $PROJECT_NAME

# Final checks
print_status "Performing final checks..."

# Check if PM2 process is running
if sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 list | grep -q $PROJECT_NAME; then
    print_status "PM2 process is running ✓"
else
    print_error "PM2 process is not running ✗"
fi

# Check if Nginx is running
if systemctl is-active --quiet nginx; then
    print_status "Nginx is running ✓"
else
    print_error "Nginx is not running ✗"
fi

# Check if port 3000 is listening
if netstat -tlnp | grep -q ":3000 "; then
    print_status "Application is listening on port 3000 ✓"
else
    print_error "Application is not listening on port 3000 ✗"
fi

echo ""
print_status "🎉 Deployment completed!"
echo ""
print_status "Next steps:"
echo "1. Edit $PROJECT_DIR/.env with your configuration"
echo "2. Update the domain in $NGINX_CONFIG"
echo "3. Restart services: systemctl restart nginx && pm2 restart $PROJECT_NAME"
echo "4. Setup SSL certificate (recommended)"
echo "5. Configure monitoring and backups"
echo ""
print_status "Useful commands:"
echo "• Check logs: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 logs $PROJECT_NAME"
echo "• Restart app: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 restart $PROJECT_NAME"
echo "• Check status: sudo -u $SERVICE_USER PM2_HOME=/var/www/.pm2 pm2 status"
echo "• Nginx logs: tail -f /var/log/nginx/error.log"
echo ""
print_status "Your API should be available at: http://your-domain.com:3000"