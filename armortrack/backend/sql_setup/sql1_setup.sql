-- SQL_1: Operational Database Setup Script
-- Run this in your Supabase SQL_1 project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('MANUFACTURER', 'TRANSPORTER', 'WAREHOUSE', 'ADMIN', 'AUDITOR')),
    rfid_tag TEXT UNIQUE,
    device_fingerprint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_name TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    encrypted_payload TEXT,
    status TEXT NOT NULL DEFAULT 'WAREHOUSE' CHECK (status IN ('WAREHOUSE', 'IN_TRANSIT', 'DEPLOYED', 'MAINTENANCE', 'CHECKED_OUT')),
    current_custodian UUID REFERENCES users(id),
    last_serviced_at TIMESTAMPTZ,
    service_interval_days INTEGER DEFAULT 90,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table (operational events)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID REFERENCES assets(id),
    batch_id UUID,
    user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    location_lat FLOAT,
    location_lng FLOAT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batches table
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transporter_id UUID REFERENCES users(id),
    destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
    expected_delivery TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batch-Assets relationship
CREATE TABLE IF NOT EXISTS batch_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id),
    scanned_at_dispatch BOOLEAN DEFAULT FALSE,
    scanned_at_delivery BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(batch_id, asset_id)
);

-- GPS Tracking table
CREATE TABLE IF NOT EXISTS gps_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ALERT', 'CRITICAL')),
    message TEXT NOT NULL,
    batch_id UUID REFERENCES batches(id),
    asset_id UUID REFERENCES assets(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    dismissed BOOLEAN DEFAULT FALSE,
    dismissed_by UUID REFERENCES users(id),
    dismissed_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_custodian ON assets(current_custodian);
CREATE INDEX IF NOT EXISTS idx_events_asset_id ON events(asset_id);
CREATE INDEX IF NOT EXISTS idx_events_batch_id ON events(batch_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batch_assets_batch_id ON batch_assets(batch_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_batch_id ON gps_tracking(batch_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_timestamp ON gps_tracking(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);

-- Row Level Security (RLS) - Enable on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Insert sample admin user (password: admin123)
-- Note: In production, change this password immediately!
INSERT INTO users (name, email, password_hash, role) 
VALUES (
    'Admin User',
    'admin@armortrack.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzS3K5K5K5',
    'ADMIN'
) ON CONFLICT (email) DO NOTHING;

-- Sample data for testing (optional)
INSERT INTO assets (asset_name, asset_type, status) VALUES
('Rifle M4A1-001', 'Weapon', 'WAREHOUSE'),
('Radio RT-1523', 'Communication', 'WAREHOUSE'),
('Night Vision NVG-07', 'Optics', 'WAREHOUSE')
ON CONFLICT DO NOTHING;
