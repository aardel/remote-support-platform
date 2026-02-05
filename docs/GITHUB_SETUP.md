# GitHub Setup Guide

## Quick Setup

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com)
2. Click "New repository"
3. Name: `remote-support-platform`
4. Description: "Browser-based remote support solution using VNC"
5. Choose: Public or Private
6. **Don't** initialize with README (we already have one)
7. Click "Create repository"

### 2. Initialize Local Git Repository

```bash
# Navigate to project directory
cd "/Users/aarondelia/Remote Desktop Server"

# Initialize git (if not already done)
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: Remote Support Platform"

# Add remote repository
git remote add origin https://github.com/yourusername/remote-support-platform.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. GitHub Repository Structure

Your repository will look like:

```
remote-support-platform/
├── .github/
│   └── workflows/
│       └── deploy.yml          # (Create later for auto-deployment)
├── backend/                    # (To be created)
├── frontend/                   # (To be created)
├── browser-extension/          # (To be created)
├── docs/                       # ✅ Documentation
├── .gitignore                  # ✅ Git ignore rules
├── .env.example                # ✅ Environment template
├── package.json                # ✅ Node.js dependencies
└── README.md                   # ✅ Project overview
```

---

## Daily Development Workflow

### Making Changes

```bash
# 1. Make your changes
# Edit files, add features, etc.

# 2. Check status
git status

# 3. Stage changes
git add .

# 4. Commit with descriptive message
git commit -m "Feature: Add websockify bridge implementation"

# 5. Push to GitHub
git push origin main
```

### Branching (Recommended)

```bash
# Create feature branch
git checkout -b feature/websockify-bridge

# Make changes
# ... edit files ...

# Commit
git add .
git commit -m "Add websockify bridge"

# Push branch
git push origin feature/websockify-bridge

# Create Pull Request on GitHub
# Merge to main after review
```

---

## GitHub Secrets (For Auto-Deployment)

When ready for automated deployment, add these secrets:

1. Go to repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add:

**SERVER_HOST**
- Name: `SERVER_HOST`
- Value: Your Contabo VPS IP address (e.g., `123.45.67.89`)

**SERVER_USER**
- Name: `SERVER_USER`
- Value: SSH username (e.g., `root` or `ubuntu`)

**SERVER_SSH_KEY**
- Name: `SERVER_SSH_KEY`
- Value: Your private SSH key (content of `~/.ssh/id_rsa`)

### Generate SSH Key (If Needed)

```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key to server
ssh-copy-id user@your-server-ip

# Copy private key content for GitHub secret
cat ~/.ssh/id_rsa
```

---

## GitHub Actions (Optional - For Later)

Create `.github/workflows/deploy.yml` when ready:

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
          pm2 restart remote-support-backend
          sudo systemctl reload nginx
```

---

## Server Deployment from GitHub

### First Time Setup on Server

```bash
# SSH into server
ssh user@your-server-ip

# Install Git (if not installed)
sudo apt update
sudo apt install -y git

# Clone repository
cd /var/www
sudo mkdir remote-support
sudo chown $USER:$USER remote-support
cd remote-support
git clone https://github.com/yourusername/remote-support-platform.git .

# Install dependencies
npm install --production

# Set up environment
cp .env.example .env
nano .env  # Edit with your configuration

# Start services (see DEPLOYMENT.md for details)
```

### Regular Updates

```bash
# SSH into server
ssh user@your-server-ip

# Navigate to project
cd /var/www/remote-support

# Pull latest changes
git pull origin main

# Install new dependencies (if any)
npm install --production

# Restart services
pm2 restart remote-support-backend
```

---

## Best Practices

### Commit Messages

Use descriptive commit messages:

```bash
✅ Good:
git commit -m "Feature: Add websockify bridge for VNC connections"
git commit -m "Fix: Resolve connection timeout issue"
git commit -m "Docs: Update deployment guide"

❌ Bad:
git commit -m "update"
git commit -m "fix"
git commit -m "changes"
```

### .gitignore

Already configured! Includes:
- `node_modules/`
- `.env` files
- Build outputs
- Logs
- IDE files

### Branching Strategy

- **main**: Production-ready code
- **develop**: Development branch
- **feature/***: Feature branches
- **fix/***: Bug fix branches

---

## Summary

### ✅ **Yes, You Can Develop Locally and Deploy via GitHub!**

**Workflow:**
1. Develop locally → Test → Commit → Push to GitHub
2. Server pulls from GitHub → Installs → Deploys
3. Automated deployment possible with GitHub Actions

**Benefits:**
- ✅ Version control
- ✅ Easy collaboration
- ✅ Rollback capability
- ✅ Automated deployment
- ✅ Code backup

**Ready to start coding!** 🚀
