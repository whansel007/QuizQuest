-- ============================================================
-- class_join_codes: the columns every QuizQuest table has
-- ------------------------------------------------------------
-- The app's store (src/db/supabase-store.js) reads each table ordered by
-- `seq` and writes fields it doesn't map into `extra`. Without these, the
-- first join code a professor creates can't be saved, and the store keeps
-- retrying it (which also holds back "progress saved" for other requests).
-- Safe to run more than once.
-- ============================================================

ALTER TABLE class_join_codes
  ADD COLUMN IF NOT EXISTS seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra jsonb;
