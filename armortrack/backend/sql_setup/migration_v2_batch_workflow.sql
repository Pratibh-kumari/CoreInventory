-- ============================================================
-- Migration v2: Role-based batch workflow
-- Run this in Supabase SQL Editor for SQL_1
-- ============================================================

-- 1. Extend the batch_status enum with new values
--    (IF NOT EXISTS supported in PostgreSQL 9.3+)
DO $$
BEGIN
  -- Add PENDING_PICKUP if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'PENDING_PICKUP'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status')
  ) THEN
    ALTER TYPE batch_status ADD VALUE 'PENDING_PICKUP';
  END IF;

  -- Add ACCEPTED if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ACCEPTED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status')
  ) THEN
    ALTER TYPE batch_status ADD VALUE 'ACCEPTED';
  END IF;
END
$$;

-- 2. If status column is TEXT (not enum), update CHECK constraint instead
--    This handles both cases (enum and text+check)
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check1;

-- Only add CHECK if the column is TEXT type (not enum)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'batches' AND column_name = 'status') = 'text' THEN
    ALTER TABLE batches ADD CONSTRAINT batches_status_check
      CHECK (status IN ('PENDING','PENDING_PICKUP','ACCEPTED','IN_TRANSIT','DELIVERED','CANCELLED'));
  END IF;
END
$$;

-- 3. Add new columns to batches table
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS qr_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'FACTORY';

-- 4. Make transporter_id nullable
ALTER TABLE batches ALTER COLUMN transporter_id DROP NOT NULL;

-- 5. Auto-generate batch_code for existing rows
UPDATE batches
SET batch_code = 'BCH-' || UPPER(SUBSTRING(id::TEXT, 1, 8))
WHERE batch_code IS NULL;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'batches'
ORDER BY ordinal_position;
