-- W16: inert DBA archive, independent of W2/W6 runtime base import.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage'
    OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
    OR session_user<>'agentstudio_admin' OR current_user<>'agentstudio_admin'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'embedding_archive_pg17_stage_dba_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_005') THEN
    RAISE EXCEPTION 'embedding_archive_schema_version';
  END IF;
END $guard$;
LOCK TABLE agentstudio.jobs IN SHARE ROW EXCLUSIVE MODE;
DO $jobs$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.jobs WHERE status IN ('queued','leased')) THEN
    RAISE EXCEPTION 'embedding_archive_active_jobs';
  END IF;
END $jobs$;

CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_embedding_snapshots (
  source_snapshot_sha256 text PRIMARY KEY CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
  inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_sha256 text NOT NULL CHECK(mapping_sha256 ~ '^[0-9a-f]{64}$'),
  approved_mapping text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Only source identity references. No target base, connection or executable job.
CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_embedding_base_refs (
  source_snapshot_sha256 text NOT NULL REFERENCES agentstudio.legacy_kb_embedding_snapshots,
  legacy_base_id text NOT NULL CHECK(legacy_base_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  legacy_owner_id text NOT NULL CHECK(legacy_owner_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users,
  PRIMARY KEY(source_snapshot_sha256,legacy_base_id),
  UNIQUE(source_snapshot_sha256,legacy_base_id,legacy_owner_id,owner_user_id)
);
CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_embedding_state_archive (
  source_snapshot_sha256 text NOT NULL REFERENCES agentstudio.legacy_kb_embedding_snapshots,
  source_table text NOT NULL CHECK(source_table IN ('agent_studio_kb_embedding_settings','agent_studio_kb_embedding_queue')),
  legacy_row_id text NOT NULL, -- JSON array of the actual source primary key(s).
  legacy_owner_id text NOT NULL CHECK(legacy_owner_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users,
  legacy_base_id text,
  raw_payload text NOT NULL CHECK(jsonb_typeof(raw_payload::jsonb)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  historical_attempts text GENERATED ALWAYS AS (raw_payload::jsonb->>'attempts') STORED,
  historical_next_attempt_ms text GENERATED ALWAYS AS (raw_payload::jsonb->>'next_attempt_ms') STORED,
  historical_lease_until_ms text GENERATED ALWAYS AS (raw_payload::jsonb->>'lease_until_ms') STORED,
  PRIMARY KEY(source_snapshot_sha256,source_table,legacy_row_id),
  CHECK((source_table='agent_studio_kb_embedding_settings' AND legacy_base_id IS NULL)
     OR (source_table='agent_studio_kb_embedding_queue' AND legacy_base_id IS NOT NULL)),
  FOREIGN KEY(source_snapshot_sha256,legacy_base_id,legacy_owner_id,owner_user_id)
    REFERENCES agentstudio.legacy_kb_embedding_base_refs(source_snapshot_sha256,legacy_base_id,legacy_owner_id,owner_user_id)
);
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_kb_embedding_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,agentstudio AS $body$
DECLARE m jsonb; p jsonb; r jsonb; k text; expected text[];
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'immutable_embedding_archive'; END IF;
  IF session_user<>'agentstudio_admin' OR current_user<>'agentstudio_admin'
     OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'embedding_archive_DBA_only';
  END IF;
  IF TG_TABLE_NAME='legacy_kb_embedding_snapshots' THEN
    m:=NEW.approved_mapping::jsonb;
    IF encode(sha256(convert_to(NEW.approved_mapping,'UTF8')),'hex')<>NEW.mapping_sha256
      OR jsonb_typeof(m) IS DISTINCT FROM 'object'
      OR m->>'schema_version' IS DISTINCT FROM 'studio-approved-identity-map-v2'
      OR m->>'source_sha256' IS DISTINCT FROM NEW.source_snapshot_sha256
      OR jsonb_typeof(m->'records') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'embedding_archive_mapping';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(m))<>3 THEN RAISE EXCEPTION 'embedding_archive_mapping_columns'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(m->'records') LOOP
      IF jsonb_typeof(r) IS DISTINCT FROM 'object'
        OR NOT coalesce(r->>'old_id' ~ '^[A-Za-z0-9_-]{1,120}$',false)
        OR length(trim(coalesce(r->>'verified_by','')))<2
        OR NOT coalesce(r->>'approved_at' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$',false)
        OR NOT EXISTS(SELECT 1 FROM agentstudio.users WHERE id=(r->>'new_studio_user_id')::uuid) THEN
        RAISE EXCEPTION 'embedding_archive_unapproved_owner';
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(r))<>4
        OR jsonb_typeof(r->'old_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(r->'new_studio_user_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(r->'verified_by') IS DISTINCT FROM 'string'
        OR jsonb_typeof(r->'approved_at') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'embedding_archive_mapping_columns';
      END IF;
      PERFORM (r->>'approved_at')::timestamptz;
    END LOOP;
    IF (SELECT count(*)<>count(DISTINCT value->>'old_id') OR count(*)<>count(DISTINCT (value->>'new_studio_user_id')::uuid)
      FROM jsonb_array_elements(m->'records')) THEN RAISE EXCEPTION 'embedding_archive_ambiguous_owner'; END IF;
  ELSE
    SELECT approved_mapping::jsonb INTO m FROM agentstudio.legacy_kb_embedding_snapshots
      WHERE source_snapshot_sha256=NEW.source_snapshot_sha256;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m->'records') AS approved(value)
      WHERE approved.value->>'old_id'=NEW.legacy_owner_id AND (approved.value->>'new_studio_user_id')::uuid=NEW.owner_user_id) THEN
      RAISE EXCEPTION 'embedding_archive_owner_mapping';
    END IF;
    IF TG_TABLE_NAME='legacy_kb_embedding_state_archive' THEN
      p:=NEW.raw_payload::jsonb;
      IF encode(sha256(convert_to(NEW.raw_payload,'UTF8')),'hex')<>NEW.payload_sha256
        OR p->>'rh_user_id' IS DISTINCT FROM NEW.legacy_owner_id THEN RAISE EXCEPTION 'embedding_archive_payload'; END IF;
      IF NEW.source_table='agent_studio_kb_embedding_settings' THEN
        expected:=ARRAY['rh_user_id','connection_id','model_name','updated_ms'];
        IF NEW.legacy_row_id::jsonb<>jsonb_build_array(NEW.legacy_owner_id)
          OR NOT coalesce(p->>'connection_id' ~ '^[A-Za-z0-9_-]{1,120}$',false) THEN RAISE EXCEPTION 'embedding_archive_source_key'; END IF;
      ELSE
        expected:=ARRAY['rh_user_id','base_id','attempts','next_attempt_ms','lease_until_ms','last_error','updated_ms'];
        IF NEW.legacy_row_id::jsonb<>jsonb_build_array(NEW.legacy_owner_id,NEW.legacy_base_id)
          OR p->>'base_id' IS DISTINCT FROM NEW.legacy_base_id THEN RAISE EXCEPTION 'embedding_archive_source_key'; END IF;
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(p))<>cardinality(expected) THEN RAISE EXCEPTION 'embedding_archive_columns'; END IF;
      FOREACH k IN ARRAY expected LOOP
        IF NOT p ? k THEN RAISE EXCEPTION 'embedding_archive_columns'; END IF;
        IF k IN ('updated_ms','attempts','next_attempt_ms','lease_until_ms') THEN
          IF jsonb_typeof(p->k)<>'number' OR (p->>k)::numeric<0 OR (p->>k)::numeric>9007199254740991
            OR trunc((p->>k)::numeric)<>(p->>k)::numeric THEN RAISE EXCEPTION 'embedding_archive_integer'; END IF;
        ELSE
          IF jsonb_typeof(p->k)<>'string' OR length(p->>k)>1000000
            OR p->>k ~* '([a-z][a-z0-9+.-]*://|www\.|\mBearer\s|\msk-[A-Za-z0-9_-]{8,}|api[_ -]?key\s*[:=]|authorization\s*:|password\s*[:=])' THEN
            RAISE EXCEPTION 'embedding_archive_unsafe_text';
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_kb_embedding_archive() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DO $protect$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legacy_kb_embedding_snapshots','legacy_kb_embedding_base_refs','legacy_kb_embedding_state_archive'] LOOP
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker',t);
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_embedding_row ON agentstudio.%I',t);
    EXECUTE format('CREATE TRIGGER guard_embedding_row BEFORE INSERT OR UPDATE OR DELETE ON agentstudio.%I FOR EACH ROW EXECUTE FUNCTION agentstudio.guard_legacy_kb_embedding_archive()',t);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_embedding_truncate ON agentstudio.%I',t);
    EXECUTE format('CREATE TRIGGER guard_embedding_truncate BEFORE TRUNCATE ON agentstudio.%I FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.guard_legacy_kb_embedding_archive()',t);
  END LOOP;
END $protect$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_013','W16 DBA immutable legacy embedding state archive; no execution') ON CONFLICT(version) DO NOTHING;
COMMIT;
