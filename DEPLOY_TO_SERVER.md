# Quick Deployment Guide to Contabo VPS20

## Prerequisites

- Contabo VPS20 server with SSH access
- Domain name (optional, can use IP address)
- Basic Linux knowledge

---

## Step 1: Prepare Your Code

### Option A: Using Git (Recommended)

```bash
# On your local machine
cd "/Users/aarondelia/Remote Desktop Server"

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - ready for deployment"

# Create GitHub repository, then:
git remote add origin https://github.com/YOUR_USERNAME/remote-support-platform.git
git push -u origin main
```

### Option B: Direct Upload (Quick Test)

Use SCP or SFTP to upload the entire project folder to your server.

---

## Step 2: Server Setup (SSH into your Contabo VPS)

```bash
# SSH into server
ssh root@YOUR_SERVER_IP
# or
ssh ubuntu@YOUR_SERVER_IP
```

### Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (LTS version)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Install websockify (for VNC bridge)
sudo npm install -g websockify
```

---

## Step 3: Clone/Upload Your Code

### If using Git:
```bash
cd /var/www
sudo mkdir -p remote-support
sudo chown $USER:$USER remote-support
cd remote-support
git clone https://github.com/YOUR_USERNAME/remote-support-platform.git .
```

### If uploading directly:
```bash
# Upload your project folder to /var/www/remote-support
# Then:
cd /var/www/remote-support
```

---

## Step 4: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Update `.env` with your server details:**

```env
NODE_ENV=production
PORT=3000
SERVER_URL=http://YOUR_SERVER_IP:3000
# OR if you have a domain:
# SERVER_URL=https://your-domain.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=remote_support
DB_USER=remote_support_user
DB_PASSWORD=YOUR_SECURE_PASSWORD

# JWT Secret (generate a random string)
JWT_SECRET=your-random-secret-key-here

# VNC Bridge
VNC_LISTENER_PORT=5500
WEBSOCKET_PORT=6080

# File Upload
UPLOAD_DIR=/var/www/remote-support/uploads
MAX_FILE_SIZE=104857600
```

---

## Step 5: Set Up Database

```bash
# Create database and user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE remote_support;
CREATE USER remote_support_user WITH PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE remote_support TO remote_support_user;
\q

# Run migrations
npm run migrate
```

---

## Step 6: Install Dependencies and Build

```bash
# Install backend dependencies
npm install --production

# Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..
```

---

## Step 7: Start Services with PM2

```bash
# Start backend server
pm2 start backend/server.js --name remote-support-backend

# Start websockify bridge (for VNC)
pm2 start websockify --name websockify-bridge -- 6080 localhost:5500

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
# Follow the instructions it prints
```

---

## Step 8: Configure Nginx (Optional but Recommended)

Create `/etc/nginx/sites-available/remote-support`:

```bash
sudo nano /etc/nginx/sites-available/remote-support
```

**Paste this configuration:**

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;  # or your-domain.com
    
    # Backend API
    location /api {
        proxy_pass https://your-domain.example/remote;
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
    
    # Socket.io
    location /socket.io {
        proxy_pass https://your-domain.example/remote;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # Static files (frontend)
    location / {
        root /var/www/remote-support/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Customer support pages
    location ~ ^/support/ {
        root /var/www/remote-support/frontend/public;
        try_files $uri /support.html;
    }
    
    # File uploads
    client_max_body_size 100M;
}
```

**Enable the site:**

```bash
sudo ln -s /etc/nginx/sites-available/remote-support /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## Step 9: Configure Firewall

```bash
# Allow HTTP, HTTPS, SSH, and VNC ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 3000/tcp   # Backend (if not using Nginx)
sudo ufw allow 5500/tcp   # VNC listener
sudo ufw allow 6080/tcp   # WebSocket
sudo ufw enable
```

---

## Step 10: Create Test Technician Account

```bash
npm run create-test-user
```

**Default credentials:**
- Username: `admin`
- Password: `admin123`

**Change this password immediately in production!**

---

## Step 11: Test Your Deployment

1. **Check PM2 status:**
   ```bash
   pm2 status
   pm2 logs remote-support-backend
   ```

2. **Access your application:**
   - With Nginx: `http://YOUR_SERVER_IP`
   - Direct: `http://YOUR_SERVER_IP:3000`

3. **Test package generation:**
   - Login to dashboard
   - Generate a support package
   - Check that the download link works

---

## Troubleshooting

### Check Logs
```bash
# PM2 logs
pm2 logs remote-support-backend

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

### Restart Services
```bash
pm2 restart remote-support-backend
sudo systemctl restart nginx
```

### Check Ports
```bash
sudo netstat -tulpn | grep -E '3000|5500|6080'
```

---

## Quick Deployment Script

After initial setup, you can use the included `deploy.sh`:

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build frontend
- Install dependencies
- Run migrations
- Restart PM2 processes
- Reload Nginx

---

## Next Steps

1. **Set up SSL (Let's Encrypt):**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

2. **Update SERVER_URL in .env** to use HTTPS

3. **Change default technician password**

4. **Set up regular backups**

---

## Production Checklist

- [ ] Server configured
- [ ] Database created and migrated
- [ ] Environment variables set
- [ ] PM2 processes running
- [ ] Nginx configured
- [ ] Firewall configured
- [ ] SSL certificate installed (optional)
- [ ] Default password changed
- [ ] Test package generation works
- [ ] Test client connection works

---

**You're ready to deploy!** 🚀
