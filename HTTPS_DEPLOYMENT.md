# HTTPS Deployment Guide

## Overview
Your HTML to Image server has been rebuilt with native HTTPS support. The server now runs directly on port 3000 with SSL certificates integrated into the Node.js application.

## What's New 
🔒 **Built-in HTTPS Support**: The server now natively supports HTTPS using your existing SSL certificates  
📁 **SSL Certificate Management**: Automatic detection and loading of SSL certificates  
🛡️ **Fallback Mode**: If SSL certificates aren't found, the server automatically falls back to HTTP  
🔧 **Environment Configuration**: SSL paths can be configured via environment variables  

## SSL Certificate Paths
- **Certificate**: `/root/cert/n8n.gotobizpro.com.pem`
- **Private Key**: `/root/cert/n8n.gotobizpro.com.key`

## Deployment Instructions

### 1. Upload Files to VPS
```bash
# Upload the entire project to your VPS
scp -r . user@your-vps:/tmp/html-to-image-update/
```

### 2. Run the HTTPS Deployment Script
```bash
# On your VPS, run as root:
cd /tmp/html-to-image-update
sudo bash deploy/deploy-https.sh
```

### 3. Verify HTTPS is Working
```bash
# Check if the server is running with HTTPS
sudo -u www-data pm2 logs html-to-image

# Test the HTTPS endpoint
curl -k https://your-domain:3000/health
```

## Key Features

### HTTPS Configuration
- Automatic SSL certificate detection
- Environment variable configuration
- Graceful fallback to HTTP if certificates are missing
- Proper error handling for certificate issues

### API Endpoints (HTTPS)
- **Health Check**: `https://your-domain:3000/health`
- **Screenshot**: `https://your-domain:3000/screenshot?url=https://example.com&width=1200&height=800`
- **API Documentation**: `https://your-domain:3000/api/docs`

### Environment Variables
```bash
# In .env file:
PORT=3000
SSL_CERT_PATH=/var/www/html-to-image/cert/n8n.gotobizpro.com.pem
SSL_KEY_PATH=/var/www/html-to-image/cert/n8n.gotobizpro.com.key
NODE_ENV=production
```

## Troubleshooting

### SSL Certificate Issues
If you see "SSL certificates not found" in the logs:
1. Verify certificate files exist at `/root/cert/`
2. Check file permissions (cert should be 644, key should be 600)
3. Ensure the deployment script copied certificates to `/var/www/html-to-image/cert/`

### Browser Permission Issues
If Playwright fails with "Executable doesn't exist":
```bash
# Re-install Playwright browsers for www-data user
sudo -u www-data npx playwright install chromium
sudo npx playwright install-deps chromium
```

### Port 3000 Access
Make sure your firewall allows port 3000:
```bash
sudo ufw allow 3000
sudo ufw status
```

## Management Commands

```bash
# Check status
sudo -u www-data pm2 status

# View logs
sudo -u www-data pm2 logs html-to-image

# Restart application
sudo -u www-data pm2 restart html-to-image

# Stop application
sudo -u www-data pm2 stop html-to-image
```

## Testing the HTTPS API

```bash
# Health check
curl -k https://your-domain:3000/health

# Screenshot with custom dimensions
curl -k "https://your-domain:3000/screenshot?url=https://example.com&width=1200&height=800" -o screenshot.webp

# POST request with JSON
curl -k -X POST https://your-domain:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","width":1200,"height":800}' \
  -o screenshot.webp
```

## Security Notes
- The server uses your existing SSL certificates from `/root/cert/`
- Certificates are copied to the application directory with proper permissions
- The server automatically handles HTTPS termination
- Rate limiting is enabled (100 requests per 15 minutes per IP)
- Security headers are applied via Helmet.js