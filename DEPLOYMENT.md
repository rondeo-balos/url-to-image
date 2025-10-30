# Deployment Guide 🚀

This guide will help you deploy the HTML to Image server on your VPS.

## Quick Deploy (Automated)

The easiest way to deploy is using the automated deployment script:

```bash
# On your VPS, clone the repository
git clone https://github.com/your-username/html-to-image.git
cd html-to-image

# Run the deployment script as root
sudo ./deploy/deploy.sh production
```

## Manual Deployment

If you prefer to deploy manually or need more control:

### 1. Prerequisites

Update your VPS and install required packages:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install additional dependencies for Playwright
sudo apt install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libgtk-3-0 libxss1 libasound2
```

### 2. Deploy Application

```bash
# Create application directory
sudo mkdir -p /var/www/html-to-image
cd /var/www/html-to-image

# Clone your repository (replace with your repo URL)
sudo git clone https://github.com/your-username/html-to-image.git .

# Install dependencies
sudo npm ci --only=production

# Install Playwright browsers
sudo npx playwright install chromium
sudo npx playwright install-deps

# Set proper permissions
sudo chown -R www-data:www-data /var/www/html-to-image
sudo chmod -R 755 /var/www/html-to-image
```

### 3. Configure Environment

```bash
# Create environment file
sudo cp .env.example .env
sudo nano .env
```

Edit `.env` with your settings:
```env
NODE_ENV=production
PORT=3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Setup PM2

```bash
# Start application with PM2
sudo -u www-data pm2 start deploy/ecosystem.config.js --env production

# Save PM2 configuration
sudo -u www-data pm2 save

# Setup PM2 startup script
sudo -u www-data pm2 startup
# Follow the instructions shown by the command above
```

### 5. Configure Nginx

```bash
# Copy Nginx configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/html-to-image

# Enable the site
sudo ln -s /etc/nginx/sites-available/html-to-image /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Edit the configuration with your domain
sudo nano /etc/nginx/sites-available/html-to-image
# Replace 'your-domain.com' with your actual domain

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 6. Configure Firewall

```bash
# Setup UFW firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## SSL Certificate Setup (Recommended)

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

### Manual SSL Certificate

If you have your own SSL certificate:

```bash
# Copy your certificates to
sudo cp your-cert.pem /etc/ssl/certs/html-to-image.pem
sudo cp your-private.key /etc/ssl/private/html-to-image.key

# Update Nginx configuration to use HTTPS
sudo nano /etc/nginx/sites-available/html-to-image
# Uncomment and configure the HTTPS server block

sudo nginx -t && sudo systemctl reload nginx
```

## Monitoring & Maintenance

### Check Application Status

```bash
# PM2 status
pm2 status
pm2 logs html-to-image

# System resources
htop
df -h
free -h

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Common Commands

```bash
# Restart application
pm2 restart html-to-image

# Update application
cd /var/www/html-to-image
sudo git pull
sudo npm ci --only=production
pm2 restart html-to-image

# Restart Nginx
sudo systemctl restart nginx

# Check port usage
sudo netstat -tlnp | grep :3000
sudo netstat -tlnp | grep :80
```

## Performance Optimization

### 1. Increase File Limits

```bash
# Edit limits.conf
sudo nano /etc/security/limits.conf

# Add these lines:
www-data soft nofile 65536
www-data hard nofile 65536
```

### 2. Optimize PM2 Configuration

Edit `deploy/ecosystem.config.js`:

```javascript
{
  instances: 2, // Number of CPU cores
  exec_mode: 'cluster', // Enable cluster mode
  max_memory_restart: '1G'
}
```

### 3. Enable Nginx Caching

Add to your Nginx configuration:

```nginx
# Cache static assets
location ~* \.(jpg|jpeg|png|webp|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Cache API responses briefly
location /health {
    proxy_cache_valid 200 1m;
}
```

## Troubleshooting

### Common Issues

1. **Port 3000 already in use**
   ```bash
   sudo lsof -i :3000
   sudo kill -9 PID
   ```

2. **Permission denied errors**
   ```bash
   sudo chown -R www-data:www-data /var/www/html-to-image
   ```

3. **Nginx configuration errors**
   ```bash
   sudo nginx -t
   sudo tail -f /var/log/nginx/error.log
   ```

4. **Playwright browser issues**
   ```bash
   sudo npx playwright install-deps
   sudo npx playwright install chromium
   ```

5. **Memory issues**
   ```bash
   # Increase swap space
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

### Health Checks

Test your deployment:

```bash
# Local test
curl http://localhost:3000/health

# External test
curl http://your-domain.com/health

# Screenshot test
curl "http://your-domain.com/screenshot?url=https://example.com&width=800&height=600" -o test.webp
```

## Scaling & High Availability

### Load Balancing with Multiple Instances

Update `ecosystem.config.js`:

```javascript
{
  instances: 'max', // Use all CPU cores
  exec_mode: 'cluster'
}
```

### Database for Analytics (Optional)

```bash
# Install Redis for caching/analytics
sudo apt install -y redis-server
sudo systemctl enable redis-server
```

### Monitoring Setup

```bash
# Install monitoring tools
sudo npm install -g pm2-logrotate
pm2 install pm2-server-monit
```

## Security Best Practices

1. **Regular Updates**
   ```bash
   sudo apt update && sudo apt upgrade -y
   npm audit && npm audit fix
   ```

2. **Firewall Rules**
   ```bash
   # Only allow necessary ports
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   ```

3. **Rate Limiting**
   - Configured in Nginx
   - Application-level limiting in server.js

4. **Security Headers**
   - Already configured in Nginx config
   - Additional headers in Express app

## Backup Strategy

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf /backup/html-to-image_$DATE.tar.gz /var/www/html-to-image
find /backup -name "html-to-image_*.tar.gz" -mtime +7 -delete
```

## Support

If you encounter issues:

1. Check the logs: `pm2 logs html-to-image`
2. Verify Nginx: `sudo nginx -t`
3. Test the API: `curl http://localhost:3000/health`
4. Check system resources: `htop`, `df -h`, `free -h`

Your API will be available at:
- **HTTP**: `http://your-domain.com/screenshot?url=https://example.com&width=800&height=600`
- **HTTPS**: `https://your-domain.com/screenshot?url=https://example.com&width=800&height=600`