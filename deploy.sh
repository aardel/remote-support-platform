#!/bin/bash

echo "🚀 Deploying Remote Support Platform..."

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install --production

# Run database migrations
echo "🗄️ Running database migrations..."
npm run migrate || echo "⚠️ Migration failed or already run"

# Restart services (if PM2 is available)
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting PM2 processes..."
    pm2 restart remote-support-backend || pm2 start backend/server.js --name remote-support-backend
    pm2 save
else
    echo "⚠️ PM2 not found. Please start the server manually:"
    echo "   npm start"
fi

# Reload Nginx (if available)
if command -v nginx &> /dev/null && [ -f /etc/nginx/sites-available/remote-support ]; then
    echo "🌐 Reloading Nginx..."
    sudo nginx -t && sudo systemctl reload nginx
fi

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check server status: pm2 status"
echo "2. View logs: pm2 logs remote-support-backend"
echo "3. Access your app at: http://your-server-ip:3000"
