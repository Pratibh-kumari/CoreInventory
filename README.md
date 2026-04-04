# ArmourTrack
### Defence-Grade Equipment Accountability System
> PS9 — DefenceTech | Crafthon 2025

---

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Our Solution](#our-solution)
3. [Revised Workflow](#revised-workflow)
4. [System Architecture](#system-architecture)
5. [Core Features](#core-features)
6. [Security Design](#security-design)
7. [Tech Stack](#tech-stack)
8. [Hardware Components](#hardware-components)
9. [Database Schema](#database-schema)
10. [API Endpoints](#api-endpoints)
11. [Roles & Access Control](#roles--access-control)
12. [Audit Chain Design](#audit-chain-design)
13. [Timeline (36 hrs)](#timeline-36-hrs)
14. [Team](#team)
15. [Setup & Run](#setup--run)
16. [Known Limitations](#known-limitations)

---

## Problem Statement

Defence operations involve frequent movement and shared usage of sensitive equipment across personnel, locations, and missions. Existing accountability mechanisms rely on manual logs or isolated digital systems that lack real-time updates and auditability. This results in unclear responsibility, delayed detection of losses, and inefficient maintenance cycles.

---

## Our Solution

**ArmourTrack** is a hardware-backed, cryptographically auditable equipment accountability system built for defence environments. It combines physical RFID/QR scanning with live GPS tracking and a tamper-proof hash-chained audit log — giving commanders real-time visibility of every weapon, device, or critical asset from manufacture to deployment.

The core thesis: **if the audit trail is mathematically unbreakable, accountability becomes automatic.**

---

## Revised Workflow

### Phase 1 — Manufacturing & Registration

1. A weapon/equipment is manufactured and registered in the system.
2. The factory server generates a unique **Asset ID** (e.g., `Asset_001`) and stores the full asset metadata encrypted (AES-256) in `SQL_1`.
3. The factory server **signs the Asset ID using its RSA Private Key**, producing a Digital Signature.
4. The QR code contains: `Asset_ID + Digital Signature` — **not the asset payload**. The signature proves origin (factory) and proves the QR hasn't been altered since it was generated.
5. When the transporter scans the QR, their app uses the **factory's Public Key** (pre-distributed, stored in the app) to verify the signature. If verification fails → QR is forged or tampered → scan rejected.
6. The asset is also tagged with an RFID chip (for armoury gate use).
7. The manufacturing system logs the registration event. The hash chain in `SQL_2` starts here.

> **Why asymmetric cryptography here?** A plain Asset ID in a QR can be forged — anyone can print a fake QR with a made-up ID. A digitally signed QR cannot be forged without the factory's Private Key, which never leaves the factory server. The Public Key is safe to distribute — it can only verify, never sign.

---

### Phase 2 — Warehouse Dispatch

1. The warehouse admin initiates a dispatch request for a batch (e.g., 5 units) via the admin dashboard.
2. The system assigns a **specific transporter** and sets an expected dispatch time and delivery window.
3. An authorised delivery person arrives. Their **mobile app is device-bound** — JWT token tied to device fingerprint + OTP verification. No other device can initiate this batch.
4. The transporter scans each asset's QR code one by one using the mobile app.
5. The scanned Asset IDs are sent as a signed batch request to `SQL_1`.
6. `SQL_1` verifies the batch: correct count, correct assets, correct transporter identity.
7. Only after full verification does the system mark the batch as **IN_TRANSIT** and unlock delivery mode.

---

### Phase 3 — Transit Tracking

1. Once **IN_TRANSIT**, the ESP32 in the vehicle compartment begins streaming GPS coordinates every 30 seconds to the backend via HTTPS POST.
2. The system tracks:
   - Live location on the dashboard map
   - Route deviation beyond a geofence radius → **TAMPER ALERT**
   - Unscheduled stops beyond 10 minutes → **ALERT**
   - GPS signal loss beyond 5 minutes → **CONNECTIVITY ALERT** (not a false tamper — grace period applied)
3. The transporter cannot mark delivery complete until GPS coordinates match the pre-registered destination within a 100m radius.

> **GPS-denied areas:** A 10-minute grace period applies before connectivity alerts fire. Last known coordinates are logged. This prevents false positives in tunnels or RF-shielded zones.

---

### Phase 4 — Delivery & Unloading

1. On arrival at the destination, the transporter scans each asset again to confirm unloading — one scan per item.
2. The system compares loaded count vs unloaded count. **If any mismatch → CRITICAL ALERT.** Delivery cannot be marked complete until count matches exactly.
3. On successful verification, the asset status changes to **WAREHOUSE_RECEIVED**.
4. Custody record is updated: transporter relinquishes custody, destination warehouse assumes it.

---

### Phase 5 — Armoury Checkout (Library-Style)

1. An army personnel approaches the armoury. They scan their **RFID identity card** at the entry reader.
2. System verifies role (`PERSONNEL`) and grants access.
3. They select and physically pick up the weapon.
4. At the **RFID exit gate**: the weapon's RFID tag is scanned automatically as they exit.
5. If the weapon was **checked out** to this person → gate opens, custody log updated.
6. If the weapon was **not checked out** → gate triggers alarm, access is denied. (Same principle as a library EAS system.)
7. Return follows the reverse: scan weapon at return point, custody transferred back to warehouse.

---

### Phase 6 — Maintenance Scheduling

1. Every asset has a `last_serviced_at` and `service_interval_days` field in `SQL_1`.
2. A background scheduler (APScheduler in FastAPI) runs daily checks.
3. Assets due for maintenance within 7 days are flagged in the admin dashboard.
4. Maintenance completion is logged as an event, resetting the service clock.
5. Audit log records every maintenance event with timestamp and technician identity.

---

### Audit Design (SQL_1 → SQL_2 Hash Chain)

```
Event happens (scan, dispatch, transit, delivery, checkout)
        ↓
FastAPI writes event to SQL_1 (operational DB)
        ↓
Hash chain engine computes:
  entry_hash = SHA256(event_data + previous_entry_hash)
        ↓
Writes (event_data, entry_hash, timestamp) to SQL_2 (write-only audit DB)
        ↓
SQL_2 is NOT accessible by any API endpoint — only the hash engine can write to it
        ↓
Audit verification: scan SQL_2 chain, recompute all hashes, compare
  → All match: OK
  → Any mismatch: tampered entry identified and flagged
```

> **Why SHA-256 hash chain, not AES?** AES is for encryption (confidentiality). SHA-256 hash chaining is for tamper detection (integrity). Changing any single audit record breaks the hash of every subsequent entry — making tampering mathematically detectable without a central authority.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HARDWARE LAYER                        │
│  RFID Scanner │ GPS (NEO-6M) │ QR Scanner │ RFID Gate   │
│                    ESP32 Edge Node                       │
│              WiFi → HTTPS POST to backend                │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  TRANSPORT LAYER                         │
│  Mobile App (device-bound) │ GPS Tracker │ Tamper Alert  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   BACKEND LAYER                          │
│  FastAPI (REST + JWT) │ Auth Service (RBAC, 4 roles)     │
│             SQL_1 — Supabase (operational DB)            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    AUDIT LAYER                           │
│  Hash Chain Engine (SHA-256) │ SQL_2 (write-only store)  │
│             Audit Verifier (chain integrity check)       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   CLIENT LAYER                           │
│  Admin Dashboard │ Live Map View │ Custody Timeline      │
└─────────────────────────────────────────────────────────┘
```

---

## Core Features

| Feature | Implementation | Status |
|---|---|---|
| RFID check-in / check-out | ESP32 + RC522 RFID + FastAPI | Core demo |
| Signed QR asset registration | RSA Digital Signature + Asset ID in QR | Core demo |
| Live GPS tracking | NEO-6M → ESP32 → map dashboard | Core demo |
| Tamper & geofence alerts | Route deviation + stop detection | Core demo |
| Role-based access control | 5 roles (incl. AUDITOR), JWT + device binding | Core demo |
| SHA-256 hash-chain audit log | SQL_1 → engine → SQL_2 append-only ledger | Core demo |
| Armoury RFID exit gate | EAS-style checkout verification | Core demo |
| Maintenance scheduling | APScheduler + dashboard flags | Mockup |
| Full custody history | Timeline UI, all events logged | Core demo |

---

## Security Design

### Asymmetric Cryptography — QR Signing

Every QR code is cryptographically bound to the factory server. The flow:

```
Factory Server (Private Key kept secret)
  → generates Asset_ID
  → computes: Signature = RSA_Sign(Asset_ID, Private_Key)
  → encodes QR: base64(Asset_ID + "." + Signature)

Transporter App (Public Key pre-distributed)
  → scans QR, decodes Asset_ID and Signature
  → verifies: RSA_Verify(Asset_ID, Signature, Public_Key)
  → if valid → proceed with scan
  → if invalid → REJECT: QR forged or tampered
```

This means a forged QR printed by an adversary will fail signature verification without the factory's Private Key — which never leaves the factory server.

### Data at Rest
- All asset payloads encrypted with **AES-256** in `SQL_1`.
- `SQL_2` (audit store) is a **dedicated Supabase project** with a separate service role. The only credential that can INSERT into `SQL_2` is the internal hash chain engine. No UPDATE or DELETE permissions exist on any table in `SQL_2`.

### Data in Transit
- All communication over **TLS 1.3**.
- ESP32 uses HTTPS (not plain HTTP) for all posts to backend.
- Mobile app JWT tokens are **device-fingerprint bound** — token from device A cannot be used on device B.

### Audit Integrity
- Every event generates a `SHA256(event_json + prev_hash)` chain entry.
- Any modification to any historical record breaks the chain from that point forward.
- Audit verification is a read-only scan — no event can be deleted or updated.

### Access Control
Four roles, strictly enforced via JWT claims:

| Role | Permissions |
|---|---|
| `MANUFACTURER` | Register assets, sign + generate QR, log manufacture events |
| `TRANSPORTER` | Initiate dispatch scan, update transit GPS, confirm delivery |
| `WAREHOUSE` | Receive deliveries, manage armoury checkout/return |
| `ADMIN` | Full dashboard access, maintenance management. Cannot access SQL_2 directly |
| `AUDITOR` | **Separate credentials, separate Supabase project access.** Read-only on SQL_2. Runs chain integrity verification. No access to SQL_1 operational data |

The AUDITOR role is deliberately isolated — they hold the only credential that can READ `SQL_2`, but they cannot write to it. The hash chain engine holds the only credential that can WRITE to `SQL_2`. No single role can both write and read the audit ledger.

### Defence Protocol Compliance
- RSA Digital Signatures on all QR codes (origin proof + tamper detection)
- AES-256 encryption at rest for asset payloads
- TLS 1.3 for all data in transit
- Zero plaintext in QR codes — Asset ID + Signature only
- SQL_2 is an append-only ledger: INSERT only, no UPDATE, no DELETE, ever
- Separate Supabase projects for SQL_1 and SQL_2 (different service role keys)
- Device-bound JWT tokens (fingerprint-tied)
- SHA-256 hash-chained immutable audit log

---

## Tech Stack

| Layer | Technology |
|---|---|
| Hardware | ESP32, RC522 RFID, NEO-6M GPS, QR scanner |
| Firmware | Arduino / MicroPython on ESP32 |
| Backend | FastAPI (Python) |
| Crypto | `cryptography` lib (RSA signing/verify) + `pycryptodome` (AES-256) |
| Database | Supabase (PostgreSQL) — SQL_1 (ops) + SQL_2 (audit, separate project) |
| Auth | JWT + device fingerprint |
| Scheduler | APScheduler (maintenance checks) |
| Frontend | React (Next.js) + ShadCN/UI |
| Map | Leaflet.js (live GPS map) |
| IDE | Qoder (frontend development) |
| Hosting | Vercel (frontend) + Railway/Render (FastAPI) |

---

## Hardware Components

| Component | Role |
|---|---|
| ESP32 | Edge node — reads RFID/GPS, sends HTTPS POST to backend |
| RC522 RFID module | Read asset tags at check-in/check-out and exit gate |
| GY-GPS6MV2 (NEO-6M) | Live location tracking during transit |
| QR code scanner | Asset ID lookup at dispatch and delivery |
| RFID cards/tags | Asset identity tags + personnel identity cards |

**Wiring summary:**
- RC522 → ESP32 SPI (MOSI/MISO/SCK/SS)
- NEO-6M → ESP32 Serial (TX → GPIO16, RX → GPIO17)
- QR scanner → ESP32 Serial2 or USB serial bridge

---

## Database Schema

### SQL_1 — Operational (Supabase)

```sql
-- Assets table
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  encrypted_payload TEXT,          -- AES-256 encrypted metadata
  status TEXT DEFAULT 'WAREHOUSE', -- WAREHOUSE | IN_TRANSIT | DEPLOYED | MAINTENANCE
  current_custodian UUID REFERENCES users(id),
  last_serviced_at TIMESTAMPTZ,
  service_interval_days INT DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users / personnel
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,              -- MANUFACTURER | TRANSPORTER | WAREHOUSE | ADMIN
  rfid_tag TEXT UNIQUE,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events (every scan, dispatch, transit update, delivery, checkout)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,        -- REGISTERED | DISPATCHED | IN_TRANSIT | DELIVERED | CHECKED_OUT | RETURNED | MAINTAINED
  location_lat FLOAT,
  location_lng FLOAT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Batches (grouped dispatch operations)
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transporter_id UUID REFERENCES users(id),
  destination TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  expected_delivery TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE batch_assets (
  batch_id UUID REFERENCES batches(id),
  asset_id UUID REFERENCES assets(id),
  scanned_at_dispatch BOOLEAN DEFAULT false,
  scanned_at_delivery BOOLEAN DEFAULT false
);
```

### SQL_2 — Audit (Supabase, separate project)

```sql
-- Append-only audit log with hash chain
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,          -- references events.id in SQL_1
  event_data JSONB NOT NULL,       -- full snapshot at time of event
  entry_hash TEXT NOT NULL,        -- SHA256(event_data + prev_entry_hash)
  prev_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- NO UPDATE, NO DELETE permissions granted on this table.
-- Only the hash chain engine service role has INSERT access.
```

---

## API Endpoints

```
POST   /auth/login              → JWT token (device-fingerprinted)

POST   /assets/register         → Register new asset (MANUFACTURER)
GET    /assets/{id}             → Get asset details + current status
GET    /assets                  → List all assets (ADMIN/WAREHOUSE)

POST   /batches/create          → Create dispatch batch (ADMIN)
POST   /batches/{id}/scan       → Scan asset into batch (TRANSPORTER)
POST   /batches/{id}/confirm    → Confirm full batch scan + initiate dispatch
POST   /batches/{id}/deliver    → Confirm delivery (all items scanned at destination)

POST   /gps/update              → ESP32 posts live location (TRANSPORTER)
GET    /gps/track/{batch_id}    → Live GPS feed for a batch

POST   /armoury/checkout        → RFID checkout (WAREHOUSE/PERSONNEL)
POST   /armoury/return          → RFID return

GET    /audit/verify            → Run chain integrity check (ADMIN only)
GET    /audit/log               → Read audit entries (ADMIN only)

GET    /maintenance/due         → Assets due for service (ADMIN)
POST   /maintenance/complete    → Log maintenance completion
```

## Setup & Run

### Prerequisites
- Node.js 18+
- Python 3.10+
- Git

### 1. Clone Repository
```bash
git clone git@github.com:NirmalyaASinha/ArmorTrack.git
cd ArmorTrack
```

### 2. Frontend Setup
```bash
npm install
```

Create `.env.local` in the project root:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Start frontend:
```bash
npm run dev
# Runs on http://localhost:3000
```

### 3. Backend Setup
```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```
SUPABASE_URL_SQL1=<your_sql1_url>
SUPABASE_KEY_SQL1=<your_sql1_service_role_key>
SUPABASE_URL_SQL2=<your_sql2_url>
SUPABASE_KEY_SQL2=<your_sql2_service_role_key>
JWT_SECRET=<random_secret>
AES_KEY=<64_char_hex_key>
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

> **Note:** Supabase keys must be the `service_role` JWT keys (starting with `eyJ...`), not publishable keys.

Start backend:
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Runs on http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### 4. Database Migration
Run the following SQL in your **Supabase SQL_1** editor to add role-based workflow support:
```sql
-- Add new batch status values to enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PENDING_PICKUP'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status'))
  THEN ALTER TYPE batch_status ADD VALUE 'PENDING_PICKUP'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ACCEPTED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status'))
  THEN ALTER TYPE batch_status ADD VALUE 'ACCEPTED'; END IF;
END $$;

-- Add workflow columns
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS qr_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'FACTORY';

ALTER TABLE batches ALTER COLUMN transporter_id DROP NOT NULL;
```

---

## Test Credentials

The following accounts are pre-seeded in the system:

| Role | Email | Password | Dashboard Access |
|---|---|---|---|
| **ADMIN** | `admin@armortrack.com` | `Admin@123` | All pages — full control |
| **MANUFACTURER** | `manufacturer@armortrack.com` | `Mfr@1234` | Assets (register) + Batches (initiate + QR) |
| **TRANSPORTER** | `transporter@armortrack.com` | `Trp@1234` | Batches (accept requests + assign driver) |
| **WAREHOUSE** | `warehouse@armortrack.com` | `Whs@1234` | Batches (read-only delivery view) |
| **AUDITOR** | `auditor@armortrack.com` | `Aud@1234` | Audit chain verification only |

### Role-Based Workflow
```
MANUFACTURER  →  Initiate Batch + Generate QR Codes
     ↓
MANUFACTURER  →  Request Delivery  (status: PENDING_PICKUP)
     ↓
TRANSPORTER   →  Accept + Assign Driver  (status: ACCEPTED)
     ↓
TRANSPORTER   →  Scan QR at dispatch  (status: IN_TRANSIT)
     ↓
WAREHOUSE     →  Monitor incoming delivery
     ↓
TRANSPORTER   →  Confirm delivery  (status: DELIVERED)
     ↓
AUDITOR       →  Verify SHA-256 hash chain integrity
```

---

## Known Limitations

1. **GPS-denied zones:** 10-minute grace period before connectivity alert fires. Last known coordinates preserved. This is intentional — not a bug.
2. **Biometric auth not implemented:** Device fingerprint + OTP is used instead of true biometric. Biometric would require native mobile SDK integration beyond hackathon scope.
3. **ISP-level access restriction:** Not implemented. Out of scope for this problem statement.
4. **Offline mode:** ESP32 will buffer GPS events locally and retry on reconnection. Full offline-first architecture is post-hackathon work.
5. **SQL_2 separation:** In production, SQL_2 should be on a physically separate server with network isolation. For the hackathon, it is a separate Supabase project.

---

## What Makes This Different

Most teams will build a CRUD asset tracker. ArmourTrack has three things they won't:

1. **Real physical hardware** — RFID scan triggers live dashboard updates. Not simulated.
2. **Cryptographic audit trail** — SHA-256 hash chain means tampering is mathematically detectable, not just policy-restricted.
3. **End-to-end workflow** — manufacture → dispatch → transit → delivery → armoury checkout is a complete chain, not isolated features.

---

*Built at Crafthon 2025 | PS9 DefenceTech | ArmourTrack*
