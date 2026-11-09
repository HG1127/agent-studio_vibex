-- OPTIONAL075 only. Source candidate, NOT installation/cutover authorization.
-- No default050/complete069 or optional070-074 object is changed.
BEGIN;
DO $guard$
BEGIN
 IF current_setting('server_version_num')::integer<180000 OR current_setting('server_version_num')::integer>=190000
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_075')
 OR to_regclass('agentstudio.model_config_write_receipts075') IS NOT NULL
 OR to_regprocedure('agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'optional075_requires_fresh_reviewed_pg18_baseline';END IF;
END
$guard$;
CREATE FUNCTION agentstudio.model_config_receipt_valid075(action text,before_revision bigint,after_revision bigint,outcome text,public_hash text,key_commitment text,intent_mac text,evidence_mac text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER CALLED ON NULL INPUT SET search_path=pg_catalog AS $valid075$
 SELECT COALESCE(public_hash ~ '^[a-f0-9]{64}$' AND intent_mac ~ '^[a-f0-9]{64}$' AND evidence_mac ~ '^[a-f0-9]{64}$'
 AND (key_commitment IS NULL OR key_commitment ~ '^[a-f0-9]{64}$') AND CASE
 WHEN action='create' THEN before_revision IS NULL AND after_revision=1 AND outcome='created' AND key_commitment IS NOT NULL
 WHEN action='update' THEN before_revision BETWEEN 1 AND 9007199254740989 AND after_revision=before_revision+1 AND outcome IN('updated','enabled','disabled')
 WHEN action='delete' THEN before_revision BETWEEN 1 AND 9007199254740989 AND after_revision IS NULL AND outcome='deleted' AND key_commitment IS NULL
 ELSE false END,false)
$valid075$;
REVOKE ALL ON FUNCTION agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text) FROM agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text) TO agentstudio_api;
CREATE TABLE agentstudio.model_config_write_receipts075 (
 owner_user_id uuid NOT NULL,
 request_id uuid NOT NULL,
 action text NOT NULL,
 target_id uuid NOT NULL,
 expected_revision bigint,
 after_revision bigint,
 outcome text NOT NULL,
 public_intent_sha256 text NOT NULL,
 key_commitment text,
 intent_hmac text NOT NULL,
 receipt_hmac text NOT NULL,
 audit_event_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT model_config_write_receipts075_pkey PRIMARY KEY(owner_user_id,request_id),
 CONSTRAINT model_config_write_receipts075_owner_fk FOREIGN KEY(owner_user_id) REFERENCES agentstudio.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT model_config_write_receipts075_audit_fk FOREIGN KEY(audit_event_id) REFERENCES agentstudio.audit_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT model_config_write_receipts075_audit_key UNIQUE(audit_event_id),
 CONSTRAINT model_config_write_receipts075_valid_ck CHECK(agentstudio.model_config_receipt_valid075(action,expected_revision,after_revision,outcome,public_intent_sha256,key_commitment,intent_hmac,receipt_hmac))
);
ALTER TABLE agentstudio.model_config_write_receipts075 ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.model_config_write_receipts075 FORCE ROW LEVEL SECURITY;
CREATE POLICY model_config_write_receipts075_owner ON agentstudio.model_config_write_receipts075 TO agentstudio_api
 USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
REVOKE ALL ON agentstudio.model_config_write_receipts075 FROM PUBLIC;
REVOKE ALL ON agentstudio.model_config_write_receipts075 FROM agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT SELECT ON agentstudio.model_config_write_receipts075 TO agentstudio_api;
GRANT INSERT(owner_user_id,request_id,action,target_id,expected_revision,after_revision,outcome,public_intent_sha256,key_commitment,intent_hmac,receipt_hmac,audit_event_id)
 ON agentstudio.model_config_write_receipts075 TO agentstudio_api;
-- API cannot edit/delete receipts or supply a caller-controlled recorded_at.
-- Never TTL-delete these request IDs: dropping deduplication evidence permits replay.
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_075','Optional owner model configuration write receipts; no provider outcome guarantee');
COMMIT;
