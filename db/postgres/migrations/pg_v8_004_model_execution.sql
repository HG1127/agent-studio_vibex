-- For an existing disposable agentstudio_stage only. NEVER apply to
-- production/PocketBase databases. Upgrade after backup and operator review.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' THEN
    RAISE EXCEPTION 'wrong_stage_database';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
    WHERE version='pg_v8_001') THEN
    RAISE EXCEPTION 'unknown_schema_baseline';
  END IF;
END
$guard$;
ALTER TABLE agentstudio.runs
  ADD COLUMN IF NOT EXISTS result_text text NOT NULL DEFAULT '';
DO $constraint$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint
     WHERE conname='ck_runs_result_text_size'
     AND conrelid='agentstudio.runs'::regclass) THEN
    ALTER TABLE agentstudio.runs
      ADD CONSTRAINT ck_runs_result_text_size
      CHECK (length(result_text)<=20000);
  END IF;
END
$constraint$;
INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v8_004','Isolated owner-only model result storage')
  ON CONFLICT(version) DO NOTHING;
COMMIT;
