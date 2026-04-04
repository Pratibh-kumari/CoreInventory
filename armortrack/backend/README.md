# ArmorTrack Backend - FastAPI

Defence-Grade Equipment Accountability System Backend

## 📋 Prerequisites

- Python 3.10+
- Supabase account (2 projects: SQL_1 for operations, SQL_2 for audit)
- Environment variables configured

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials and secrets
```

### 3. Set Up Databases

1. Create two Supabase projects (SQL_1 and SQL_2)
2. Run SQL setup scripts in Supabase SQL Editor:
   - `sql_setup/sql1_setup.sql` → SQL_1 project
   - `sql_setup/sql2_setup.sql` → SQL_2 project

### 4. Run the Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server will start at: `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

## 📁 Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── app/
│   ├── __init__.py
│   ├── api/               # API route handlers
│   │   ├── auth.py        # Authentication endpoints
│   │   ├── assets.py      # Asset management
│   │   ├── batches.py     # Batch/dispatch management
│   │   ├── gps.py         # GPS tracking
│   │   ├── armoury.py     # RFID checkout/return
│   │   ├── audit.py       # Hash chain audit verification
│   │   ├── maintenance.py # Maintenance scheduling
│   │   ├── alerts.py      # Alert system
│   │   └── health.py      # Health check
│   ├── core/              # Core utilities
│   │   ├── config.py      # Configuration settings
│   │   ├── database.py    # Supabase clients
│   │   ├── security.py    # JWT & password hashing
│   │   ├── dependencies.py# Auth dependencies
│   │   └── scheduler.py   # Background tasks
│   └── models/
│       └── schemas.py     # Pydantic models
└── sql_setup/
    ├── sql1_setup.sql     # Operational DB schema
    └── sql2_setup.sql     # Audit DB schema
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

### Assets
- `POST /api/assets/register` - Register new asset (MANUFACTURER/ADMIN)
- `GET /api/assets` - List all assets (ADMIN/WAREHOUSE)
- `GET /api/assets/{id}` - Get asset details
- `PUT /api/assets/{id}` - Update asset

### Batches
- `POST /api/batches/create` - Create dispatch batch (ADMIN)
- `GET /api/batches` - List all batches
- `GET /api/batches/{id}` - Get batch details
- `POST /api/batches/{id}/scan` - Scan asset into batch (TRANSPORTER)
- `POST /api/batches/{id}/confirm` - Confirm dispatch (TRANSPORTER)

### GPS Tracking
- `POST /api/gps/update` - Update GPS location (TRANSPORTER/ESP32)
- `GET /api/gps/track/{batch_id}` - Get GPS history
- `GET /api/gps/active` - Get active batches GPS (ADMIN)

### Armoury
- `POST /api/armoury/checkout` - Checkout asset (WAREHOUSE)
- `POST /api/armoury/return` - Return asset (WAREHOUSE)
- `GET /api/armoury/custody/{asset_id}` - Custody history

### Audit
- `GET /api/audit/verify` - Verify audit chain (AUDITOR/ADMIN)
- `GET /api/audit/log` - Get audit log (AUDITOR/ADMIN)

### Maintenance
- `GET /api/maintenance/due` - Get assets due for service (ADMIN)
- `POST /api/maintenance/complete` - Mark maintenance complete (ADMIN)
- `GET /api/maintenance/schedule` - Full maintenance schedule (ADMIN)

### Alerts
- `GET /api/alerts/active` - Get active alerts (ADMIN/WAREHOUSE)
- `POST /api/alerts/{id}/dismiss` - Dismiss alert (ADMIN/WAREHOUSE)

### Health
- `GET /api/health` - System health check

## 🔐 Role-Based Access Control

| Role | Permissions |
|------|-------------|
| MANUFACTURER | Register assets, sign QR codes |
| TRANSPORTER | Initiate dispatch, update GPS, confirm delivery |
| WAREHOUSE | Receive deliveries, manage armoury checkout/return |
| ADMIN | Full dashboard access, maintenance management |
| AUDITOR | Read-only access to SQL_2 audit log, chain verification |

## 🔒 Security Features

- **JWT Authentication** - Token-based auth with role claims
- **Password Hashing** - bcrypt for secure password storage
- **Role-Based Access** - Granular permissions per endpoint
- **Hash Chain Audit** - SHA-256 chained immutable audit log
- **AES-256 Encryption** - Asset payload encryption (ready for implementation)
- **CORS Protection** - Configured for frontend domain

## 📊 Database Architecture

### SQL_1 (Operational)
- Users, Assets, Events, Batches
- GPS tracking, Alerts
- Full CRUD operations

### SQL_2 (Audit)
- Append-only audit_log table
- SHA-256 hash chain for tamper detection
- Write-only for hash chain engine
- Read-only for AUDITOR role

## 🔄 Background Tasks

The scheduler runs automatically:

1. **Maintenance Check** - Daily at midnight
   - Scans all assets for upcoming maintenance
   - Creates alerts for assets due within 7 days

2. **Alert Monitoring** - Every 5 minutes
   - Checks for GPS signal loss
   - Monitors active batches
   - Generates alerts for anomalies

## 🧪 Testing

### Create Test User

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Admin",
    "email": "admin@armortrack.com",
    "password": "admin123",
    "role": "ADMIN"
  }'
```

### Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@armortrack.com",
    "password": "admin123"
  }'
```

### Test Assets Endpoint

```bash
curl http://localhost:8000/api/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🚨 Environment Variables

```env
# Supabase Configuration
SUPABASE_URL_SQL1=your_sql1_url
SUPABASE_KEY_SQL1=your_sql1_service_key
SUPABASE_URL_SQL2=your_sql2_url
SUPABASE_KEY_SQL2=your_sql2_service_key

# JWT Configuration
JWT_SECRET=your_secret_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AES Encryption
AES_KEY=your_32_byte_aes_key

# Backend Configuration
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Geofence Settings
GEOFENCE_RADIUS_METERS=5000
MAX_STOP_DURATION_MINUTES=10
GPS_SIGNAL_LOSS_MINUTES=5
DELIVERY_RADIUS_METERS=100

# Maintenance
MAINTENANCE_WARNING_DAYS=7
```

## 📝 Next Steps

1. ✅ Backend API structure created
2. ✅ Database schemas defined
3. ✅ Authentication implemented
4. ✅ All CRUD endpoints ready
5. ⏳ Connect frontend to backend APIs
6. ⏳ Deploy to production server
7. ⏳ Integrate ESP32 hardware
8. ⏳ Implement RSA QR signing
9. ⏳ Add AES-256 payload encryption

##  Support

For issues or questions, refer to the main project README.
