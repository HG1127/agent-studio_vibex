-- Staging-only forward migration for V8 knowledge metadata & dedupe.
-- For an existing *separate* agentstudio_stage database initialized with an
-- earlier V8 draft. NEVER apply directly to BaoTa company databases.
-- Requires a verified backup and explicit operations approval.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'agentstudio_stage' THEN
    RAISE EXCEPTION 'wrong_stage_database';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_001'
  ) THEN
    RAISE EXCEPTION 'unknown_schema_baseline';
  END IF;
END
$guard$;

ALTER TABLE agentstudio.knowledge_bases
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

DO $check_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='agentstudio.knowledge_bases'::regclass
      AND conname='chk_knowledge_revision_positive'
  ) THEN
    ALTER TABLE agentstudio.knowledge_bases
      ADD CONSTRAINT chk_knowledge_revision_positive CHECK (revision>0);
  END IF;
END
$check_constraint$;

-- Any duplicate active hashes must be investigated and reconciled before
-- this migration; failure is deliberate and must not be bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_document_active_hash
  ON agentstudio.knowledge_documents(owner_user_id,base_id,sha256)
  WHERE status <> 'deleted';

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES (
  'pg_v8_002',
  'Add knowledge base revision and active document hash uniqueness'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
