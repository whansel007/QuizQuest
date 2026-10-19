-- ============================================================
-- QuizQuest: Auth and Class Management additions
-- Task 1 (Marxel): User accounts and class management
-- ============================================================
-- Apply this via the Supabase dashboard SQL editor or supabase CLI.
-- Coordinate with Zhi Yang (DB owner) before applying to production.
-- ============================================================

-- Add authentication fields to existing users table
-- auth_id: links to auth.users UUID (Supabase Auth)
-- email: for real login (unique per user)
-- created_at: when the account was created
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email text UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS users_auth_id_idx ON users (auth_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- Add soft-delete and metadata columns to classes
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_by text REFERENCES users (id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Add soft-delete to passages (preserves question source provenance)
ALTER TABLE passages
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ============================================================
-- class_join_codes: unpredictable codes for student enrolment
-- Codes are stored as hashes (SHA-256) so the raw code is never
-- recoverable from the database. The server generates a random
-- code, sends it to the professor, and stores only the hash.
-- ============================================================
CREATE TABLE IF NOT EXISTS class_join_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    text        NOT NULL REFERENCES classes (id),
  code_hash   text        NOT NULL,           -- SHA-256 of the raw code
  expires_at  timestamptz,                    -- NULL = never expires
  usage_limit integer,                        -- NULL = unlimited
  usage_count integer     NOT NULL DEFAULT 0,
  revoked     boolean     NOT NULL DEFAULT false,
  created_by  text        REFERENCES users (id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_join_codes_class_id_idx ON class_join_codes (class_id);
ALTER TABLE class_join_codes ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only accessible via Node server with secret key (matches all other tables)
