-- Owner-authored memory in the reviewed fresh050 source sequence.
-- Owner-authored instructions only. No extraction, execution or payment grant.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_048')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_049')
    OR to_regclass('agentstudio.agent_memory_entries') IS NOT NULL
    OR to_regclass('agentstudio.agent_memory_receipts') IS NOT NULL
  THEN RAISE EXCEPTION 'agent_memory_requires_reviewed_048'; END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_memory_receipts(
  owner_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('remember','forget')),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),
  UNIQUE(owner_user_id,memory_id,action),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT,
  CHECK(action<>'remember' OR memory_id=request_id)
);
CREATE TABLE agentstudio.agent_memory_entries(
  owner_user_id uuid NOT NULL,
  id uuid NOT NULL,
  spec_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind='user'),
  fact text NOT NULL CHECK(length(btrim(fact)) BETWEEN 1 AND 500 AND octet_length(fact)<=2000),
  content_sha256 text NOT NULL CHECK(content_sha256=encode(sha256(convert_to(fact,'UTF8')),'hex')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,id),
  FOREIGN KEY(owner_user_id,id) REFERENCES agentstudio.agent_memory_receipts(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX agent_memory_latest ON agentstudio.agent_memory_entries(owner_user_id,spec_id,created_at DESC,id DESC);
-- A forget receipt survives content erasure. The original creation receipt can
-- never be used to reinsert erased text, including by a stale recovery request.
CREATE FUNCTION agentstudio.agent_memory_entry_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO n
      FROM regexp_split_to_table(NEW.fact,'') c WHERE c<>'';
    IF n>500 OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts r WHERE r.owner_user_id=NEW.owner_user_id
      AND r.request_id=NEW.id AND r.memory_id=NEW.id AND r.spec_id=NEW.spec_id AND r.action='remember' AND r.content_sha256=NEW.content_sha256)
      OR EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts r WHERE r.owner_user_id=NEW.owner_user_id AND r.memory_id=NEW.id AND r.action='forget')
    THEN RAISE EXCEPTION 'agent_memory_entry_receipt_required'; END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts r WHERE r.owner_user_id=OLD.owner_user_id
    AND r.memory_id=OLD.id AND r.spec_id=OLD.spec_id AND r.action='forget' AND r.content_sha256=OLD.content_sha256)
  THEN RAISE EXCEPTION 'agent_memory_forget_receipt_required'; END IF;
  RETURN OLD;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_entry_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE TRIGGER agent_memory_entry_receipt BEFORE INSERT OR DELETE ON agentstudio.agent_memory_entries
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_entry_guard();
ALTER TABLE agentstudio.agent_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_memory_entries,agentstudio.agent_memory_receipts FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT SELECT,DELETE ON agentstudio.agent_memory_entries TO agentstudio_api;
GRANT INSERT(owner_user_id,id,spec_id,kind,fact,content_sha256) ON agentstudio.agent_memory_entries TO agentstudio_api;
GRANT SELECT ON agentstudio.agent_memory_receipts TO agentstudio_api;
GRANT INSERT(owner_user_id,request_id,memory_id,spec_id,action,content_sha256,request_sha256) ON agentstudio.agent_memory_receipts TO agentstudio_api;
CREATE POLICY agent_memory_entries_owner_read ON agentstudio.agent_memory_entries FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_entries_owner_insert ON agentstudio.agent_memory_entries FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_entries_owner_delete ON agentstudio.agent_memory_entries FOR DELETE TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_receipts_owner_read ON agentstudio.agent_memory_receipts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_receipts_owner_insert ON agentstudio.agent_memory_receipts FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_049',
  'Optional owner-authored memory with insert-only acknowledgements and irreversible content erasure; no extraction or execution grant');
COMMIT;
