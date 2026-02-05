# Pre-Testing Checklist

## ✅ What's Ready

- ✅ All code files created
- ✅ Project structure complete
- ✅ Backend dependencies installed
- ✅ Configuration files ready

---

## ⏭️ What You Need to Do Before Testing

### 1. Install Frontend Dependencies ⚠️ REQUIRED

```bash
cd frontend
npm install
cd ..
```

**Why:** React, Vite, and frontend dependencies are needed for the technician dashboard.

---

### 2. Create .env File (Optional but Recommended)

```bash
cp .env.example .env
```

**Why:** Sets up environment variables. The app will work without it (uses defaults), but it's better to have it.

**Minimum .env content:**
```env
NODE_ENV=development
PORT=3000
SERVER_URL=http://localhost:3000
```

---

### 3. Database Setup (Optional - Has Fallback)

**Option A: Use PostgreSQL (Recommended)**
```bash
# Create database
createdb remote_support

# Run migrations
npm run migrate
```

**Option B: Skip Database (Works Fine)**
- App will use in-memory storage
- All features work
- Data lost on restart (fine for testing)

**Why:** Database is optional - the app has in-memory fallback built-in.

---

### 4. Create Test Technician Account (Optional)

**Via API:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@test.com",
    "password": "password123"
  }'
```

**Or skip:** You can test without authentication by using technicianId directly in API calls.

---

## 🚀 Quick Test Steps

### Step 1: Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### Step 2: Start Backend
```bash
npm run dev
```

**Expected output:**
```
🚀 Server running on port 3000
📝 Environment: development
✅ Database connected (or fallback message)
✅ VNC listener started on port 5500
✅ WebSocket server started on port 6080
🧹 Cleanup service started
```

### Step 3: Start Frontend (New Terminal)
```bash
cd frontend
npm run dev
```

**Expected output:**
```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```

### Step 4: Test

**Test Backend API:**
```bash
# Health check
curl http://localhost:3000/api/health

# Create session
curl -X POST http://localhost:3000/api/packages/generate \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "test-tech"}'
```

**Test Frontend:**
- Open: http://localhost:3001 (Technician Dashboard)
- Open: http://localhost:3000/support/ABC-123-XYZ (Customer UI - replace with actual session ID)

---

## ⚠️ Common Issues & Fixes

### Issue: "Cannot find module"
**Fix:**
```bash
npm install
cd frontend && npm install && cd ..
```

### Issue: Port Already in Use
**Fix:** Change port in `.env`:
```env
PORT=3001
```

### Issue: Frontend Won't Start
**Fix:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: Database Connection Error
**Fix:** 
- App will use in-memory storage automatically
- Or set up PostgreSQL (see above)

### Issue: VNC Bridge Ports in Use
**Fix:** Change ports in `.env`:
```env
VNC_LISTENER_PORT=5501
WEBSOCKET_PORT=6081
```

---

## ✅ Minimum Requirements to Test

**Absolute Minimum (Will Work):**
1. ✅ Backend dependencies installed (`npm install`)
2. ✅ Frontend dependencies installed (`cd frontend && npm install`)
3. ✅ Start backend (`npm run dev`)
4. ✅ Start frontend (`cd frontend && npm run dev`)

**That's it!** Everything else is optional.

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Health check works: `curl http://localhost:3000/api/health`
- [ ] Create session works
- [ ] Package generation works
- [ ] File upload works
- [ ] WebSocket connects

### Frontend Tests
- [ ] Technician dashboard loads (http://localhost:3001)
- [ ] Login page displays
- [ ] Customer UI loads (http://localhost:3000/support/SESSION-ID)
- [ ] Session ID displays correctly
- [ ] Checkboxes work

### Integration Tests
- [ ] Generate package from dashboard
- [ ] Customer UI receives session ID
- [ ] Connection approval works
- [ ] File transfer works

---

## 📝 Summary

### Required Before Testing:
1. ⚠️ **Install frontend dependencies** (`cd frontend && npm install`)
2. ✅ Backend dependencies (already installed)
3. ✅ Start both servers

### Optional:
- Database setup (has fallback)
- .env file (uses defaults)
- Test technician account (can use API directly)

---

## 🎯 Quick Start Command

```bash
# One command to get ready:
cd frontend && npm install && cd .. && echo "✅ Ready! Run 'npm run dev' in root and 'npm run dev' in frontend/"
```

---

## ✅ You're Almost Ready!

**Just install frontend dependencies and you can start testing!**

```bash
cd frontend
npm install
cd ..
```

Then start both servers and test! 🚀
