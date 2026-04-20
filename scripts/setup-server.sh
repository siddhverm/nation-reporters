#!/bin/bash
# Run once on a fresh Hostinger VPS to set up Nation Reporters
# Shares the same nginx as Talent Setu — just adds a new vhost config
# Usage: bash setup-server.sh

set -e

echo "=== Nation Reporters Server Setup ==="

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$USER"
fi

# Install Docker Compose plugin if missing
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
fi

# Create deployment directory
mkdir -p /opt/nation-reporters
cd /opt/nation-reporters

# Clone or pull repo
if [ -d ".git" ]; then
  git pull origin main
else
  git clone https://github.com/YOUR_ORG/nation-reporters.git .
fi

# Copy nginx vhost config (shares nginx with Talent Setu)
cp infrastructure/nginx/nationreporters.conf /etc/nginx/conf.d/nationreporters.conf
nginx -t && systemctl reload nginx

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "1. Copy .env.template to .env and fill in secrets:"
echo "   cp /opt/nation-reporters/.env.template /opt/nation-reporters/.env"
echo ""
echo "2. Get SSL certificate (stop nginx briefly if port 80 is in use):"
echo "   systemctl stop nginx"
echo "   certbot certonly --standalone -d nationreporters.com -d www.nationreporters.com"
echo "   systemctl start nginx"
echo ""
echo "3. Pull and start production stack:"
echo "   cd /opt/nation-reporters"
echo "   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "4. Add GitHub Secrets (same as Talent Setu):"
echo "   HOSTINGER_HOST    = VPS IP"
echo "   HOSTINGER_USER    = root"
echo "   HOSTINGER_SSH_KEY = SSH private key"
