-- V8 stage-only upgrade: enable prepare-only Worker under minimal RLS.
-- For pre-existing disposable agentstudio_stage databases only. Backup first.
-- Does not create a login/password; 012_stage_worker_login.sql must be
-- separately approved when upgrading an existing initialized volume.
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
GRANT SELECT(id,status) ON agentstudio.users TO agentstudio_worker;
GRANT SELECT(id,owner_user_id,status) ON agentstudio.runs
  TO agentstudio_worker;
GRANT SELECT(run_id,owner_user_id,status)
  ON agentstudio.external_effects TO agentstudio_worker;

DO $policies$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname='agentstudio' AND tablename='users'
      AND policyname='worker_user_active'
  ) THEN
    CREATE POLICY worker_user_active ON agentstudio.users
      FOR SELECT TO agentstudio_worker USING(true);
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname='agentstudio' AND tablename='runs'
      AND policyname='worker_run_status'
  ) THEN
    CREATE POLICY worker_run_status ON agentstudio.runs
      FOR SELECT TO agentstudio_worker USING(true);
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname='agentstudio' AND tablename='external_effects'
      AND policyname='worker_effect_safety_read'
  ) THEN
    CREATE POLICY worker_effect_safety_read ON agentstudio.external_effects
      FOR SELECT TO agentstudio_worker USING(true);
  END IF;
END
$policies$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES ('pg_v8_003','Prepare Worker narrow status grants and RLS audit visibility')
ON CONFLICT (version) DO NOTHING;
COMMIT;
