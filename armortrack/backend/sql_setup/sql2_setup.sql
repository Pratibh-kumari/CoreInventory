-- SQL_2: Audit Database Setup Script
-- Run this in your Supabase SQL_2 project (SEPARATE from SQL_1)
-- This database is WRITE-ONLY for the hash chain engine

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Audit log table (append-only, immutable)
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL,
    event_data JSONB NOT NULL,
    entry_hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_log_id ON audit_log(id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_id ON audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- IMPORTANT: Disable all UPDATE and DELETE permissions
-- Only INSERT is allowed (append-only ledger)

-- Revoke all permissions from public
REVOKE ALL ON audit_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE audit_log_id_seq FROM PUBLIC;

-- Grant only INSERT permission to service role
GRANT INSERT ON audit_log TO service_role;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO service_role;

-- Grant SELECT permission to auditor role (read-only access)
GRANT SELECT ON audit_log TO auditor_role;

-- Row Level Security - DISABLED for this table (hash chain engine needs full access)
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;

-- Add a comment explaining the purpose
COMMENT ON TABLE audit_log IS 'Immutable audit log with SHA-256 hash chain. No UPDATE or DELETE operations allowed.';
COMMENT ON COLUMN audit_log.entry_hash IS 'SHA256(event_data + prev_hash)';
COMMENT ON COLUMN audit_log.prev_hash IS 'Hash of the previous entry in the chain';
