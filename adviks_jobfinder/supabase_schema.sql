-- ============================================================================
-- Supabase Schema for InternMatch AI
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin TEXT,
    github TEXT,
    personal_info JSONB DEFAULT '{}'::jsonb,
    skills JSONB DEFAULT '[]'::jsonb,
    work_experience JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Resumes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Roadmaps ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmaps (
    id BIGSERIAL PRIMARY KEY,
    resume_id TEXT REFERENCES resumes(id) ON DELETE CASCADE,
    job_title TEXT,
    company TEXT,
    job_description TEXT,
    job_url TEXT,
    roadmap_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Polished Data (Tailored Resumes) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polished_data (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
    job_title TEXT,
    company TEXT,
    job_url TEXT,
    tailored_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Applications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    polished_data_id BIGINT REFERENCES polished_data(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'submitted',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security (RLS) ────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE polished_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role bypass (for the backend using service key)
-- The service key bypasses RLS by default, so the backend can access all data.

-- ── Updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_resume ON roadmaps(resume_id);
CREATE INDEX IF NOT EXISTS idx_polished_user ON polished_data(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);

-- ── Resume Build Sessions (AI wizard) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS build_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    step INTEGER DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE build_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own build sessions" ON build_sessions
    FOR ALL USING (true);  -- service key bypasses RLS

CREATE INDEX IF NOT EXISTS idx_build_sessions_user ON build_sessions(user_id);

CREATE TRIGGER build_sessions_updated_at
    BEFORE UPDATE ON build_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Application Packages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS application_packages (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
    job_title TEXT,
    company TEXT,
    job_url TEXT,
    cover_letter TEXT,
    professional_bio TEXT,
    linkedin_summary TEXT,
    recruiter_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE application_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own packages" ON application_packages
    FOR ALL USING (true);  -- service key bypasses RLS

CREATE INDEX IF NOT EXISTS idx_packages_user ON application_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_packages_resume ON application_packages(resume_id);
