#!/bin/bash

# Smart deployment script that checks current setup and handles transitions
# This script analyzes what's currently running (Docker, PM2, or nothing) and deploys accordingly

set -e

echo "🔍 Analyzing current deployment state..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root or with sudo"
    exit 1
fi

# Function to check what's currently running
check_current_state() {
    local docker_running=false
    local pm2_running=false
    local port_3000_used=false
    
    print_status "Checking current deployment state..."
    
    # Check Docker
    if command -v docker &> /dev/null; then
        if docker ps | grep -q "html-to-image\|3000->3000"; then
            docker_running=true
            print_warning "🐳 Docker container found running on port 3000"
            docker ps | grep -E "html-to-image|3000->3000"
        fi
    fi
    
    # Check PM2
    if command -v pm2 &> /dev/null; then
        if pm2 list 2>/dev/null | grep -q "html-to-image\|online"; then
            pm2_running=true
            print_warning "🚀 PM2 process found running"
            pm2 list 2>/dev/null | grep -E "html-to-image|online" || true
        fi
        
        # Also check as www-data user
        if sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 list 2>/dev/null | grep -q "html-to-image\|online"; then
            pm2_running=true
            print_warning "🚀 PM2 process found running as www-data user"
            sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 list 2>/dev/null | grep -E "html-to-image|online" || true
        fi
    fi
    
    # Check port 3000
    if netstat -tlnp 2>/dev/null | grep -q ":3000 " || lsof -i :3000 2>/dev/null; then
        port_3000_used=true
        print_warning "🔌 Port 3000 is currently in use:"
        netstat -tlnp 2>/dev/null | grep ":3000 " || lsof -i :3000 2>/dev/null || true
    fi
    
    # Summary
    echo ""
    print_status "=== CURRENT STATE SUMMARY ==="
    echo "Docker running: $docker_running"
    echo "PM2 running: $pm2_running" 
    echo "Port 3000 in use: $port_3000_used"
    echo ""
    
    # Determine deployment strategy
    if [ "$docker_running" = true ] && [ "$pm2_running" = true ]; then
        print_error "⚠️  CONFLICT: Both Docker and PM2 are running!"
        print_status "You need to choose which one to keep."
        ask_deployment_preference
    elif [ "$docker_running" = true ]; then
        print_status "🐳 Docker deployment detected"
        handle_docker_deployment
    elif [ "$pm2_running" = true ]; then
        print_status "🚀 PM2 deployment detected" 
        handle_pm2_deployment
    else
        print_status "🆕 No existing deployment found"
        ask_deployment_preference
    fi
}

ask_deployment_preference() {
    echo ""
    print_status "Choose deployment method:"
    echo "1) PM2 (recommended for VPS)"
    echo "2) Docker" 
    echo "3) Cancel"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            print_status "Setting up PM2 deployment..."
            setup_pm2_deployment
            ;;
        2)
            print_status "Setting up Docker deployment..."
            setup_docker_deployment
            ;;
        3)
            print_status "Deployment cancelled"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            ask_deployment_preference
            ;;
    esac
}

handle_docker_deployment() {
    print_warning "Existing Docker deployment found"
    echo ""
    print_status "Options:"
    echo "1) Update Docker deployment (rebuild & restart containers)"
    echo "2) Switch to PM2 (stop Docker, start PM2)" 
    echo "3) Cancel"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            update_docker_deployment
            ;;
        2)
            migrate_docker_to_pm2
            ;;
        3)
            print_status "Deployment cancelled"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            handle_docker_deployment
            ;;
    esac
}

handle_pm2_deployment() {
    print_warning "Existing PM2 deployment found"
    echo ""
    print_status "Options:"
    echo "1) Update PM2 deployment (restart with new code + HTTPS)"
    echo "2) Switch to Docker (stop PM2, start Docker)"
    echo "3) Cancel"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            update_pm2_deployment
            ;;
        2)
            migrate_pm2_to_docker
            ;;
        3)
            print_status "Deployment cancelled"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            handle_pm2_deployment
            ;;
    esac
}

update_pm2_deployment() {
    print_status "🔄 Updating PM2 deployment with HTTPS support..."
    
    # Stop existing PM2 processes
    print_status "Stopping existing PM2 processes..."
    pm2 stop html-to-image 2>/dev/null || true
    sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 stop html-to-image 2>/dev/null || true
    
    # Run the HTTPS deployment
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    bash "$PROJECT_DIR/deploy/deploy-https.sh"
}

update_docker_deployment() {
    print_status "🐳 Updating Docker deployment..."
    
    # Navigate to project directory
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    cd "$PROJECT_DIR"
    
    # Stop and remove existing containers
    print_status "Stopping existing containers..."
    docker-compose -f deploy/docker-compose.production.yml down 2>/dev/null || true
    
    # Rebuild and start
    print_status "Building and starting updated containers..."
    docker-compose -f deploy/docker-compose.production.yml up -d --build
    
    print_success "Docker deployment updated!"
    print_status "Check status: docker-compose -f deploy/docker-compose.production.yml logs -f"
}

migrate_docker_to_pm2() {
    print_status "🔄 Migrating from Docker to PM2..."
    
    # Stop Docker containers
    print_status "Stopping Docker containers..."
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    cd "$PROJECT_DIR"
    docker-compose -f deploy/docker-compose.production.yml down 2>/dev/null || true
    
    # Wait a bit for port to be freed
    sleep 3
    
    # Setup PM2
    setup_pm2_deployment
}

migrate_pm2_to_docker() {
    print_status "🔄 Migrating from PM2 to Docker..."
    
    # Stop PM2 processes
    print_status "Stopping PM2 processes..."
    pm2 stop html-to-image 2>/dev/null || true
    pm2 delete html-to-image 2>/dev/null || true
    sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 stop html-to-image 2>/dev/null || true
    sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 delete html-to-image 2>/dev/null || true
    
    # Wait a bit for port to be freed
    sleep 3
    
    # Setup Docker
    setup_docker_deployment
}

setup_pm2_deployment() {
    print_status "🚀 Setting up PM2 deployment with HTTPS..."
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    bash "$PROJECT_DIR/deploy/deploy-https.sh"
}

setup_docker_deployment() {
    print_status "🐳 Setting up Docker deployment..."
    
    # Navigate to project directory
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    cd "$PROJECT_DIR"
    
    # Build and start
    print_status "Building and starting containers..."
    docker-compose -f deploy/docker-compose.production.yml up -d --build
    
    print_success "Docker deployment complete!"
    print_status "Check status: docker-compose -f deploy/docker-compose.production.yml logs -f"
    print_status "Access: http://your-domain.com or https://your-domain.com (if using Traefik)"
}

# Main execution
print_status "🚀 Smart HTML-to-Image Deployment Script"
echo ""
check_current_state

print_success "✅ Deployment process completed!"
echo ""
print_status "Useful commands:"
if command -v pm2 &> /dev/null && (pm2 list 2>/dev/null | grep -q "html-to-image" || sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 list 2>/dev/null | grep -q "html-to-image"); then
    echo "• Check PM2 status: sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 status"
    echo "• View PM2 logs: sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 logs html-to-image"
    echo "• Restart PM2 app: sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 restart html-to-image"
fi
if command -v docker &> /dev/null && docker ps | grep -q "html-to-image"; then
    echo "• Check Docker status: docker-compose -f deploy/docker-compose.production.yml ps"
    echo "• View Docker logs: docker-compose -f deploy/docker-compose.production.yml logs -f"
    echo "• Restart Docker: docker-compose -f deploy/docker-compose.production.yml restart"
fi
echo "• Test API: curl http://localhost:3000/health"
if [ -f "/root/cert/n8n.gotobizpro.com.pem" ]; then
    echo "• Test HTTPS: curl -k https://localhost:3000/health"
fi