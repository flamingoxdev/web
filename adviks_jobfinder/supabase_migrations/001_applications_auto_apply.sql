-- Migration: extend applications table for auto-apply tracking
-- Run in Supabase SQL Editor

ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_url TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_method TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_match_score REAL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_reason TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fail_reason TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_source TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(user_id, status);
