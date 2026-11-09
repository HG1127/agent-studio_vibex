-- SOURCE-ONLY isolated extension. No existing migration, trigger, timeout,
-- credential, application selection or real company row is changed here.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_user<>session_user OR pg_is_in_recovery() OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=current_user::regrole AND rolsuper)
 OR EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_067')
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='agentstudio_desktop')
 OR (SELECT proowner FROM pg_proc WHERE oid='agentstudio.native_local_record(jsonb)'::regprocedure)<>current_user::regrole
 THEN RAISE EXCEPTION 'native_guided_installation_refused';END IF;
END $preflight$;
CREATE SCHEMA agentstudio_desktop;
REVOKE ALL ON SCHEMA agentstudio_desktop FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_local_executor;
GRANT USAGE ON SCHEMA agentstudio_desktop TO agentstudio_api,agentstudio_local_executor;
-- No FK points into the sealed 067 profile: its exact FK closure stays intact.
-- Every reference is checked against native_local_live in the same transaction.
CREATE TABLE agentstudio_desktop.guided_tickets(
 owner_user_id uuid NOT NULL,request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 action text NOT NULL CHECK(action IN('create','renew')),device_id uuid NOT NULL,owner_epoch bigint NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740989),
 code_hash text NOT NULL UNIQUE CHECK(code_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(owner_user_id,request_id),CHECK(expires_at=created_at+interval '5 minutes')
);
ALTER TABLE agentstudio_desktop.guided_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_desktop.guided_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE agentstudio_desktop.guided_tickets FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_local_executor;
CREATE FUNCTION agentstudio_desktop.guided_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'native_guided_immutable';END $fn$;
CREATE TRIGGER guided_tickets_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio_desktop.guided_tickets FOR EACH STATEMENT EXECUTE FUNCTION agentstudio_desktop.guided_immutable();
CREATE FUNCTION agentstudio_desktop.guided_live(p_id uuid,p_owner uuid) RETURNS agentstudio.native_local_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;
BEGIN
 -- The same native owner predicates as 062/067, in one read snapshot. Their
 -- FOR SHARE/FOR UPDATE functions cannot run inside BEGIN READ ONLY. This
 -- projection confers no execution authority; poll/check retain original locks.
 PERFORM pg_advisory_xact_lock_shared(61824,20261048);
 SELECT x.* INTO d FROM agentstudio.native_local_devices x JOIN agentstudio_auth.accounts a ON a.user_id=x.owner_user_id JOIN agentstudio.users u ON u.id=x.owner_user_id
 WHERE x.id=p_id AND x.owner_user_id=p_owner AND NOT x.revoked AND a.enabled IS TRUE AND u.external_issuer='urn:agentstudio:local:v1' AND u.status='active'
 AND a.governance_revision BETWEEN 1 AND 9007199254740989 AND x.owner_epoch=a.governance_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'native_local_device_unavailable';END IF;RETURN d;
END $fn$;
CREATE FUNCTION agentstudio_desktop.guided_receipt(v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();r agentstudio_desktop.guided_tickets;
BEGIN
 SELECT * INTO r FROM agentstudio_desktop.guided_tickets WHERE owner_user_id=o AND request_id=(v->>'request_id')::uuid;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF r.request_sha256<>agentstudio.native_local_digest(v) THEN RAISE EXCEPTION 'native_local_request_conflict';END IF;
 PERFORM agentstudio_desktop.guided_live(r.device_id,o);
 RETURN jsonb_build_object('receipt',jsonb_build_object('request_id',r.request_id,'request_sha256',r.request_sha256,'action',r.action,'id',r.device_id,'expires_ms',floor(extract(epoch FROM r.expires_at)*1000)::bigint),'replayed',true);
END $fn$;
CREATE FUNCTION agentstudio_desktop.guided_record(v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();rid uuid:=(v->>'request_id')::uuid;h text:=agentstudio.native_local_digest(v);prior jsonb;d agentstudio.native_local_devices;r jsonb;t timestamptz:=clock_timestamp();a text:=v->>'action';
BEGIN
 IF rid IS NULL OR jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR length(v->>'name') NOT BETWEEN 1 AND 120
 OR jsonb_typeof(v->'pairing_code') IS DISTINCT FROM 'string' OR v->>'pairing_code' !~ '^[a-f0-9]{48}$'
 OR a NOT IN('create','renew') OR a IS NULL OR agentstudio.native_local_object_size(v)<>(CASE WHEN a='create' THEN 4 ELSE 5 END)
 THEN RAISE EXCEPTION 'native_guided_invalid_intent';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':guided:'||rid::text,0));
 prior:=agentstudio_desktop.guided_receipt(v);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF a='create' THEN
  r:=agentstudio.native_local_record(jsonb_build_object('action','create','request_id',rid,'name',v->>'name'));
  SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=(r->'receipt'->>'id')::uuid AND owner_user_id=o FOR UPDATE;
 ELSE
  SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=(v->>'id')::uuid AND owner_user_id=o FOR UPDATE;
 END IF;
 IF d.id IS NULL OR d.revoked OR d.token_hash IS NOT NULL OR d.pair_hash IS NULL OR d.seen_at IS NOT NULL OR d.name<>v->>'name' THEN RAISE EXCEPTION 'native_guided_pairing_not_renewable';END IF;
 d:=agentstudio.native_local_live(d.id,o);
 -- pair_until remains untouched; 067's monotone trigger and audit are unchanged.
 UPDATE agentstudio.native_local_devices SET pair_hash=agentstudio.native_local_secret(v->>'pairing_code') WHERE id=d.id;
 INSERT INTO agentstudio_desktop.guided_tickets(owner_user_id,request_id,request_sha256,action,device_id,owner_epoch,code_hash,expires_at,created_at)
 VALUES(o,rid,h,a,d.id,d.owner_epoch,agentstudio.native_local_secret(v->>'pairing_code'),t+interval '5 minutes',t);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(o,o,'local.guided.'||a,'local_device',d.id::text,'succeeded',jsonb_build_object('request_id',rid));
 RETURN agentstudio_desktop.guided_receipt(v)||jsonb_build_object('replayed',false);
END $fn$;
CREATE FUNCTION agentstudio_desktop.guided_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'paired',d.token_hash IS NOT NULL,'pairing_expires_ms',coalesce(floor(extract(epoch FROM r.expires_at)*1000)::bigint,floor(extract(epoch FROM d.pair_until)*1000)::bigint)) ORDER BY d.id),'[]'::jsonb) INTO result
 FROM (SELECT * FROM agentstudio.native_local_devices WHERE owner_user_id=o ORDER BY created_at DESC LIMIT 100) d LEFT JOIN LATERAL(SELECT expires_at FROM agentstudio_desktop.guided_tickets WHERE device_id=d.id AND owner_user_id=o ORDER BY created_at DESC,request_id DESC LIMIT 1)r ON true WHERE d.owner_user_id=o;
 RETURN result;
END $fn$;
CREATE FUNCTION agentstudio_desktop.guided_pair(v jsonb,p_confirm boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;r agentstudio_desktop.guided_tickets;rid uuid:=(v->>'request_id')::uuid;h text:=agentstudio.native_local_digest(v);th text;
BEGIN
 PERFORM agentstudio.native_local_session('agentstudio_local_executor');
 IF p_confirm IS NULL OR rid IS NULL OR agentstudio.native_local_object_size(v)<>5 OR jsonb_typeof(v->'pairing_code') IS DISTINCT FROM 'string' OR v->>'pairing_code' !~ '^[a-f0-9]{48}$'
 OR jsonb_typeof(v->'device_token') IS DISTINCT FROM 'string' OR v->>'device_token' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 SELECT * INTO r FROM agentstudio_desktop.guided_tickets WHERE request_id=(v->>'owner_request_id')::uuid AND device_id=(v->>'id')::uuid AND code_hash=agentstudio.native_local_secret(v->>'pairing_code');
 IF NOT FOUND THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 IF p_confirm THEN SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=r.device_id;
 ELSE SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=r.device_id FOR UPDATE;END IF;
 IF p_confirm THEN d:=agentstudio_desktop.guided_live(d.id,r.owner_user_id);ELSE d:=agentstudio.native_local_live(d.id,r.owner_user_id);END IF;
 IF d.owner_epoch<>r.owner_epoch THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 th:=agentstudio.native_local_secret(v->>'device_token');
 IF d.token_hash=th AND d.pair_request_id=rid AND d.pair_request_hash=h THEN RETURN jsonb_build_object('id',d.id,'request_id',rid,'paired',true,'replayed',true);END IF;
 IF p_confirm THEN RAISE EXCEPTION 'native_local_receipt_not_found';END IF;
 IF d.token_hash IS NOT NULL OR d.pair_hash IS DISTINCT FROM r.code_hash OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 UPDATE agentstudio.native_local_devices SET token_hash=th,pair_hash=NULL,pair_request_id=rid,pair_request_hash=h WHERE id=d.id;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(r.owner_user_id,r.owner_user_id,'local.guided.paired','local_device',d.id::text,'succeeded',jsonb_build_object('request_id',rid));
 RETURN jsonb_build_object('id',d.id,'request_id',rid,'paired',true,'replayed',false);
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agentstudio_desktop FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_local_executor;
GRANT EXECUTE ON FUNCTION agentstudio_desktop.guided_record(jsonb),agentstudio_desktop.guided_receipt(jsonb),agentstudio_desktop.guided_status() TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio_desktop.guided_pair(jsonb,boolean) TO agentstudio_local_executor;
COMMIT;

