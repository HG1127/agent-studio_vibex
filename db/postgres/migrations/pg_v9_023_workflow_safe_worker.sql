-- Add a dedicated, no-external-effects Start/End Workflow queue kind.
-- Candidate upgrade only. Do not apply to production or the BaoTa database
-- without a verified backup and explicit operator approval.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF to_regclass('agentstudio.jobs') IS NULL OR
     to_regclass('agentstudio.runs') IS NULL OR
     to_regclass('agentstudio.workflows') IS NULL OR
     to_regclass('agentstudio.run_steps') IS NULL OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_022') OR
     EXISTS(SELECT 1 FROM agentstudio.jobs
       WHERE kind='workflow_tick' AND
         (payload->>'phase' IS DISTINCT FROM 'workflow_safe_v1')) THEN
    RAISE EXCEPTION 'workflow_safe_worker_requires_reviewed_pg_v9_022_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;
ALTER TABLE agentstudio.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE agentstudio.jobs DROP CONSTRAINT IF EXISTS ck_jobs_kind;
ALTER TABLE agentstudio.jobs ADD CONSTRAINT ck_jobs_kind
  CHECK(kind IN ('run_tick','schedule_dispatch','knowledge_ingest','workflow_tick'));
DO $verify$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO definition
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='agentstudio' AND t.relname='jobs'
    AND c.conname='ck_jobs_kind' AND c.contype='c';
  IF definition IS NULL OR position('workflow_tick' in definition)=0 OR
     position('run_tick' in definition)=0 THEN
    RAISE EXCEPTION 'workflow_safe_job_kind_constraint_mismatch'
      USING ERRCODE='P0001';
  END IF;
END
$verify$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_023','Isolated Start/End Workflow worker queue kind; no external effects')
ON CONFLICT(version) DO NOTHING;
COMMIT;
