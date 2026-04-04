# Connecting Frontend to Backend

## Overview

The ArmorTrack dashboard is now connected to a FastAPI backend. This guide shows how to make the frontend use real backend APIs instead of mock data.

## Steps to Connect

### 1. Install Backend Dependencies

```bash
cd /home/nirmalya/Desktop/ArmorTrack/backend
pip install -r requirements.txt
```

### 2. Set Up Supabase Databases

You need **TWO separate Supabase projects**:

#### SQL_1 - Operational Database
1. Create a new Supabase project
2. Go to SQL Editor
3. Run the script: `backend/sql_setup/sql1_setup.sql`
4. Copy your project URL and service role key

#### SQL_2 - Audit Database (Separate Project)
1. Create another Supabase project
2. Go to SQL Editor
3. Run the script: `backend/sql_setup/sql2_setup.sql`
4. Copy your project URL and service role key

### 3. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your actual values:

```env
SUPABASE_URL_SQL1=https://your-sql1-project.supabase.co
SUPABASE_KEY_SQL1=your-sql1-service-role-key
SUPABASE_URL_SQL2=https://your-sql2-project.supabase.co
SUPABASE_KEY_SQL2=your-sql2-service-role-key

JWT_SECRET=generate-a-strong-random-secret-key-here
AES_KEY=generate-a-32-byte-aes-key-here

BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

### 4. Start the Backend Server

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at:
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs

### 5. Update Frontend API Calls

The frontend currently uses mock Next.js API routes in `/src/app/api/`. You need to update them to call the FastAPI backend.

#### Option A: Update Each API Route (Recommended)

Replace the mock implementations in each `/src/app/api/*/route.ts` file to call the FastAPI backend.

Example - Update `/src/app/api/auth/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Login failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### Option B: Direct Backend Calls (Alternative)

Update the frontend components to call the backend directly instead of using Next.js API routes.

Example in `/src/lib/auth.ts`:

```typescript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function login(email: string, password: string) {
  const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  if (!response.ok) throw new Error('Login failed');
  
  const data = await response.json();
  setToken(data.access_token);
  setUserRole(data.role);
  return data;
}
```

### 6. Create a Frontend .env File

Create `/home/nirmalya/Desktop/ArmorTrack/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### 7. Test the Integration

1. **Start Backend**: `cd backend && uvicorn main:app --reload`
2. **Start Frontend**: `npm run dev`
3. **Test Login**:
   - Go to http://localhost:3000
   - Use credentials from database (or create via `/api/auth/register`)
   - Default admin: `admin@armortrack.com` / `admin123`

## API Endpoints Mapping

| Frontend Page | Backend Endpoint | Method |
|---------------|------------------|--------|
| Login | `/api/auth/login` | POST |
| Assets List | `/api/assets` | GET |
| Register Asset | `/api/assets/register` | POST |
| Batches List | `/api/batches` | GET |
| Create Batch | `/api/batches/create` | POST |
| Live GPS | `/api/gps/active` | GET |
| GPS Track | `/api/gps/track/{batch_id}` | GET |
| Custody History | `/api/armoury/custody/{asset_id}` | GET |
| Audit Verify | `/api/audit/verify` | GET |
| Maintenance Due | `/api/maintenance/due` | GET |
| Alerts | `/api/alerts/active` | GET |
| Health Check | `/api/health` | GET |

## Testing with cURL

### Register a User
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@armortrack.com",
    "password": "test123",
    "role": "ADMIN"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@armortrack.com",
    "password": "test123"
  }'
```

### Get Assets (requires token)
```bash
curl http://localhost:8000/api/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Register Asset
```bash
curl -X POST http://localhost:8000/api/assets/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset_name": "Rifle M4A1-001",
    "asset_type": "Weapon",
    "metadata": {"serial": "12345"}
  }'
```

## Common Issues

### 1. CORS Errors
- Check `FRONTEND_URL` in backend `.env`
- Ensure backend CORS middleware allows your frontend URL

### 2. Authentication Errors
- Verify JWT_SECRET is set in `.env`
- Check token is being sent in Authorization header
- Ensure token hasn't expired (default: 24 hours)

### 3. Database Connection Errors
- Verify Supabase URLs and keys in `.env`
- Ensure SQL scripts have been run successfully
- Check Supabase project is active

### 4. Import Errors
- Make sure all Python dependencies are installed
- Run: `pip install -r requirements.txt`

## Production Deployment

### Backend (Railway/Render)
1. Create `Procfile`: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`
2. Set environment variables in platform dashboard
3. Deploy from GitHub repository

### Frontend (Vercel)
1. Set `NEXT_PUBLIC_BACKEND_URL` to production backend URL
2. Deploy to Vercel
3. Update backend CORS to include production frontend URL

## Next Steps

1. ✅ Backend fully implemented
2. ⏳ Connect frontend to backend
3. ⏳ Test all API endpoints
4. ⏳ Deploy to production
5. ⏳ Integrate ESP32 hardware
6. ⏳ Implement RSA QR signing
7. ⏳ Add AES-256 encryption

## Support

For help, check:
- Backend API Docs: http://localhost:8000/docs
- Main README: `/home/nirmalya/Desktop/ArmorTrack/README.md`
