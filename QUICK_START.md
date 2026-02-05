# Quick Start Guide

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your configuration (optional for local dev)
```

### 3. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### 4. Test the Application

**Create a Session:**
```bash
curl -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "tech123"}'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "ABC-123-XYZ",
  "link": "http://localhost:3000/support/ABC-123-XYZ",
  "expiresAt": "2026-02-05T18:00:00.000Z"
}
```

**Open Support Page:**
- Visit: `http://localhost:3000/support/ABC-123-XYZ`
- You'll see the simple customer UI
- Session ID is auto-generated or from URL

**Generate Package:**
```bash
curl -X POST http://localhost:3000/api/packages/generate \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "tech123"}'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "ABC-123-XYZ",
  "downloadUrl": "/api/packages/download/ABC-123-XYZ",
  "directLink": "http://localhost:3000/support/ABC-123-XYZ"
}
```

---

## 📁 Project Structure

```
Remote Desktop Server/
├── backend/
│   ├── routes/          # API routes
│   │   ├── sessions.js
│   │   ├── packages.js
│   │   ├── files.js
│   │   └── monitors.js
│   ├── services/        # Business logic
│   │   ├── sessionService.js
│   │   └── packageBuilder.js
│   └── server.js        # Main server file
├── frontend/
│   └── public/         # Customer UI
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── packages/           # Generated packages (created automatically)
├── uploads/            # File uploads (created automatically)
└── docs/               # Documentation
```

---

## 🔌 API Endpoints

### Sessions
- `POST /api/sessions/create` - Create new session
- `GET /api/sessions/:sessionId` - Get session info
- `POST /api/sessions/register` - Register user connection
- `POST /api/sessions/:sessionId/connect` - Request connection approval
- `POST /api/sessions/:sessionId/approval` - Handle approval response

### Packages
- `POST /api/packages/generate` - Generate support package
- `GET /api/packages/download/:sessionId` - Download package

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files/download/:fileId` - Download file
- `GET /api/files/session/:sessionId` - List session files

### Monitors
- `GET /api/monitors/session/:sessionId` - Get monitors
- `POST /api/monitors/session/:sessionId/switch` - Switch monitor

---

## 🧪 Testing

### Test Session Creation
```bash
# Create session
curl -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "test-tech"}'

# Get session
curl http://localhost:3000/api/sessions/ABC-123-XYZ
```

### Test Package Generation
```bash
curl -X POST http://localhost:3000/api/packages/generate \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "test-tech"}'
```

### Test File Upload
```bash
curl -X POST http://localhost:3000/api/files/upload \
  -F "file=@test.txt" \
  -F "sessionId=ABC-123-XYZ" \
  -F "direction=technician-to-user"
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=3001
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### CORS Issues
- Check `CLIENT_URL` in `.env`
- Default allows all origins (`*`)

---

## 📝 Next Steps

1. ✅ **Backend API** - Working
2. ✅ **Customer UI** - Working
3. ⏭️ **WebSocket Integration** - Add real-time features
4. ⏭️ **Database** - Replace in-memory storage
5. ⏭️ **Websockify Bridge** - VNC connection handling
6. ⏭️ **Technician Dashboard** - React app
7. ⏭️ **noVNC Integration** - Browser VNC client

---

## 🎉 You're Ready!

The basic structure is in place. Start building features!
