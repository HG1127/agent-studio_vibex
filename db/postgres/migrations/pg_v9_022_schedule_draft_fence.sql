-- PostgreSQL inert schedule-draft constraint. Candidate stage ONLY.
-- This does NOT create a scheduler, run a job, enable any plan, or touch BaoTa.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF to_regclass('agentstudio.schedules') IS NULL OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_021') OR
     EXISTS(SELECT 1 FROM agentstudio.schedules
       WHERE recurrence->>'config_format'='pg_schedule_draft_v1'
         AND (enabled=true OR next_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'schedule_draft_fence_requires_reviewed_disabled_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;
DO $constraint$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
     JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='agentstudio' AND t.relname='schedules'
       AND c.conname='ck_schedule_draft_inert') THEN
    ALTER TABLE agentstudio.schedules
      ADD CONSTRAINT ck_schedule_draft_inert CHECK(
        recurrence->>'config_format' IS DISTINCT FROM 'pg_schedule_draft_v1'
        OR (enabled=false AND next_at IS NULL));
  END IF;
END
$constraint$;
DO $verify$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO definition
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='agentstudio' AND t.relname='schedules'
    AND c.conname='ck_schedule_draft_inert' AND c.contype='c';
  IF definition IS NULL OR
     position('pg_schedule_draft_v1' in definition)=0 OR
     position('next_at IS NULL' in definition)=0 OR
     position('enabled' in definition)=0 THEN
    RAISE EXCEPTION 'schedule_draft_fence_constraint_incompatible'
      USING ERRCODE='P0001';
  END IF;
END
$verify$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_022','Inert-only owner schedule configuration drafts; no scheduler execution')
ON CONFLICT(version) DO NOTHING;
COMMIT;
