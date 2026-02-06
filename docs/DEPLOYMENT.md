# Deployment Guide: Local Development → GitHub → Server

## Development workflow options

**Same-machine (SSH):** Development and the running app are on the same server. You edit, commit, and push from that host; after backend changes, restart the process (e.g. `pm2 restart remote-support-backend`). No separate deploy or pull step. Helper builds (EXE/DMG) still run on GitHub Actions when you push to `main`.

**Separate local + server:** Use the phases below (develop locally, then deploy to server).

---

## Development Workflow (separate local + server)

### Phase 1: Local Development
1. ✅ Develop on your local machine
2. ✅ Test locally
3. ✅ Commit to Git
4. ✅ Push to GitHub

### Phase 2: Server Deployment
1. ✅ Pull from GitHub on server
2. ✅ Install dependencies
3. ✅ Configure environment
4. ✅ Start services

---

## Step-by-Step Deployment Process

### 1. Local Development Setup

```bash
# Clone/create repository
git init
git remote add origin https://github.com/yourusername/remote-support-platform.git

# Create project structure
mkdir -p backend frontend browser-extension
```

### 2. Development Workflow

```bash
# Work on features locally
git add .
git commit -m "Feature: Add websockify bridge"
git push origin main
```

### 3. Server Deployment

**Option A: Manual Deployment**
```bash
# SSH into your Contabo VPS
ssh user@your-server-ip

# Navigate to project directory
cd /var/www/remote-support

# Pull latest code
git pull origin main

# Install/update dependencies
npm install

# Restart services
pm2 restart remote-support
```

**Option B: Automated Deployment (GitHub Actions)**
```bash
# Push to GitHub triggers automatic deployment
git push origin main
# → GitHub Actions runs
# → Deploys to server automatically
```

---

## GitHub Repository Setup

### Repository Structure

```
remote-support-platform/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment
├── backend/                    # Node.js backend
├── frontend/                   # React frontend
├── browser-extension/          # Browser extension
├── docs/                       # Documentation
├── .gitignore
├── .env.example
└── README.md
```

### .gitignore

```gitignore
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment variables
.env
.env.local
.env.production

# Build outputs
dist/
build/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Server files
uploads/
packages/
*.pid
```

---

## GitHub Actions Deployment

### Automated Deployment Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Server

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
    
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SERVER_SSH_KEY }}
        script: |
          cd /var/www/remote-support
          git pull origin main
          npm install --production
          pm2 restart remote-support
          sudo systemctl reload nginx
```

### GitHub Secrets Setup

In GitHub repository → Settings → Secrets:

1. **SERVER_HOST**: Your Contabo VPS IP address
2. **SERVER_USER**: SSH username (e.g., `root` or `ubuntu`)
3. **SERVER_SSH_KEY**: Private SSH key for server access

---

## Server Setup (Contabo VPS)

### Initial Server Configuration

```bash
# 1. SSH into server
ssh user@your-server-ip

# 2. Update system
sudo apt update && sudo apt upgrade -y

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 5. Install Redis (optional)
sudo apt install -y redis-server

# 6. Install Nginx
sudo apt install -y nginx

# 7. Install PM2 (process manager)
sudo npm install -g pm2

# 8. Install websockify
sudo npm install -g websockify

# 9. Create project directory
sudo mkdir -p /var/www/remote-support
sudo chown $USER:$USER /var/www/remote-support
cd /var/www/remote-support

# 10. Clone repository
git clone https://github.com/yourusername/remote-support-platform.git .

# 11. Install dependencies
npm install --production

# 12. Set up environment variables
cp .env.example .env
nano .env  # Edit with your configuration
```

### Environment Variables (.env)

```env
# Server Configuration
NODE_ENV=production
PORT=3000
SERVER_URL=https://your-domain.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=remote_support
DB_USER=remote_support_user
DB_PASSWORD=your_secure_password

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# Session
SESSION_SECRET=your_random_secret_key
JWT_SECRET=your_jwt_secret_key

# VNC Bridge
VNC_LISTENER_PORT=5500
WEBSOCKET_PORT=6080

# File Upload
UPLOAD_DIR=/var/www/remote-support/uploads
MAX_FILE_SIZE=104857600  # 100MB

# SSL/TLS
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

---

## PM2 Process Management

### Start Application

```bash
# Start backend
pm2 start backend/server.js --name remote-support-backend

# Start websockify bridge
pm2 start websockify --name websockify-bridge -- 5500 localhost:5900

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs remote-support-backend

# Restart
pm2 restart remote-support-backend

# Stop
pm2 stop remote-support-backend

# Monitor
pm2 monit
```

---

## Nginx Configuration

### Reverse Proxy Setup

Create `/etc/nginx/sites-available/remote-support`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket for noVNC
    location /websockify {
        proxy_pass http://localhost:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
    
    # Static files (frontend)
    location / {
        root /var/www/remote-support/frontend/build;
        try_files $uri $uri/ /index.html;
    }
    
    # File uploads
    client_max_body_size 100M;
}
```

### Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/remote-support /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## SSL Certificate (Let's Encrypt)

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate

```bash
sudo certbot --nginx -d your-domain.com
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot auto-renews certificates
```

---

## Database Setup

### PostgreSQL Configuration

```bash
# Create database
sudo -u postgres psql
CREATE DATABASE remote_support;
CREATE USER remote_support_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE remote_support TO remote_support_user;
\q

# Run migrations
cd /var/www/remote-support/backend
npm run migrate
```

---

## Deployment Checklist

### Initial Setup
- [ ] Server provisioned (Contabo VPS)
- [ ] Domain name configured
- [ ] DNS records set up
- [ ] SSH access configured
- [ ] GitHub repository created
- [ ] SSH key added to GitHub secrets

### Server Configuration
- [ ] Node.js installed
- [ ] PostgreSQL installed and configured
- [ ] Redis installed (optional)
- [ ] Nginx installed and configured
- [ ] PM2 installed
- [ ] websockify installed
- [ ] SSL certificate obtained

### Application Deployment
- [ ] Repository cloned on server
- [ ] Dependencies installed
- [ ] Environment variables configured
- [ ] Database created and migrated
- [ ] PM2 processes started
- [ ] Nginx configured and reloaded
- [ ] Firewall rules configured

### Testing
- [ ] Backend API accessible
- [ ] WebSocket connections working
- [ ] File uploads working
- [ ] Database connections working
- [ ] SSL certificate valid
- [ ] All services running

---

## Manual Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying Remote Support Platform..."

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Run database migrations
echo "🗄️ Running database migrations..."
npm run migrate

# Restart services
echo "🔄 Restarting services..."
pm2 restart remote-support-backend
pm2 restart websockify-bridge

# Reload Nginx
echo "🌐 Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy.sh
```

Run:
```bash
./deploy.sh
```

---

## Development → Production Workflow

### Daily Development

```bash
# 1. Develop locally
npm run dev

# 2. Test locally
npm test

# 3. Commit changes
git add .
git commit -m "Feature: Add monitor switching"

# 4. Push to GitHub
git push origin main

# 5. GitHub Actions deploys automatically
# OR manually deploy:
ssh user@server "./deploy.sh"
```

---

## Rollback Procedure

### If Deployment Fails

```bash
# SSH into server
ssh user@your-server-ip
cd /var/www/remote-support

# Rollback to previous version
git log --oneline  # Find previous commit
git checkout <previous-commit-hash>

# Restart services
pm2 restart remote-support-backend
pm2 restart websockify-bridge
```

---

## Monitoring & Logs

### View Logs

```bash
# Application logs
pm2 logs remote-support-backend

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

### Monitoring

```bash
# PM2 monitoring
pm2 monit

# System resources
htop

# Disk usage
df -h
```

---

## Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSH key-only authentication
- [ ] SSL certificate installed
- [ ] Environment variables secured
- [ ] Database passwords strong
- [ ] File permissions correct
- [ ] Regular backups configured
- [ ] Logs monitored

---

## Summary

### ✅ **Yes, You Can Develop Locally and Deploy Later!**

**Workflow:**
1. Develop locally → Test → Commit → Push to GitHub
2. Server pulls from GitHub → Installs → Deploys
3. Automated via GitHub Actions OR manual deployment

**Benefits:**
- ✅ Test locally before deploying
- ✅ Version control via GitHub
- ✅ Easy rollback if needed
- ✅ Automated deployment possible
- ✅ Multiple developers can collaborate

**Ready to start building!** 🚀
