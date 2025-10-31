module.exports = {
  apps: [{
    name: 'html-to-image',
    script: './server.js',
    instances: 1, // You can increase this for load balancing
    exec_mode: 'fork', // Use 'cluster' for multiple instances
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      SSL_CERT_PATH: '/var/lib/docker/volumes/n8n_caddy_data/_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/n8n.gotobizpro.com/n8n.gotobizpro.com.crt',
      SSL_KEY_PATH: '/var/lib/docker/volumes/n8n_caddy_data/_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/n8n.gotobizpro.com/n8n.gotobizpro.com.key'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      SSL_CERT_PATH: '/var/lib/docker/volumes/n8n_caddy_data/_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/n8n.gotobizpro.com/n8n.gotobizpro.com.crt',
      SSL_KEY_PATH: '/var/lib/docker/volumes/n8n_caddy_data/_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/n8n.gotobizpro.com/n8n.gotobizpro.com.key'
    },
    // PM2 configuration
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Auto restart on crash
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Exponential backoff restart delay
    restart_delay: 4000
  }]
};