-- Explicit owner consent preparation only. No paid transport or Worker grants.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_035')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_036')
    THEN RAISE EXCEPTION 'knowledge_embedding_consent_requires_reviewed_pg_v9_035'; END IF;
END
$guard$;
-- A fresh epoch also prevents an old consent becoming valid after deletion,
-- recreation or rotating a configuration away and back to the same values.
ALTER TABLE agentstudio.knowledge_embedding_profiles ADD COLUMN configuration_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE agentstudio.knowledge_embedding_profiles ADD CONSTRAINT knowledge_embedding_profile_epoch_unique UNIQUE(configuration_id);
CREATE FUNCTION agentstudio.knowledge_embedding_profile_epoch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN NEW.configuration_id:=gen_random_uuid();
  ELSIF ROW(NEW.connection_id,NEW.connection_revision,NEW.model_name,NEW.base_url,NEW.revision,NEW.enabled)
    IS DISTINCT FROM ROW(OLD.connection_id,OLD.connection_revision,OLD.model_name,OLD.base_url,OLD.revision,OLD.enabled)
    THEN NEW.configuration_id:=gen_random_uuid();
  ELSE NEW.configuration_id:=OLD.configuration_id;
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER knowledge_embedding_profile_epoch BEFORE INSERT OR UPDATE ON agentstudio.knowledge_embedding_profiles
  FOR EACH ROW EXECUTE FUNCTION agentstudio.knowledge_embedding_profile_epoch();
-- Consent revision and receipts survive profile deletion. No settings-only
-- profile is backfilled as approved, and an obsolete epoch is never effective.
CREATE TABLE agentstudio.knowledge_embedding_consents(
  owner_user_id uuid PRIMARY KEY REFERENCES agentstudio.users(id),
  revision bigint NOT NULL CHECK(revision>0),
  profile_id uuid,
  profile_revision bigint,
  index_enabled boolean NOT NULL,
  query_enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((profile_id IS NOT NULL AND profile_revision IS NOT NULL AND profile_revision>0) OR
    (profile_id IS NULL AND profile_revision IS NULL AND NOT index_enabled AND NOT query_enabled))
);
CREATE TABLE agentstudio.knowledge_embedding_consent_receipts(
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,request_id)
);
DO $tables$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['knowledge_embedding_consents','knowledge_embedding_consent_receipts'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch',name);
    EXECUTE format('GRANT SELECT,INSERT ON agentstudio.%I TO agentstudio_knowledge_embedding',name);
    EXECUTE format('CREATE POLICY knowledge_embedding_private ON agentstudio.%I TO agentstudio_knowledge_embedding USING(true) WITH CHECK(true)',name);
  END LOOP;
END
$tables$;
GRANT UPDATE ON agentstudio.knowledge_embedding_consents TO agentstudio_knowledge_embedding;
CREATE FUNCTION agentstudio.knowledge_embedding_consent_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF current_setting('agentstudio.knowledge_embedding_consent_enabled',true) IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'knowledge_embedding_consent_disabled' USING ERRCODE='P0403'; END IF;
  RETURN agentstudio.knowledge_embedding_actor();
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_consent() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); p agentstudio.knowledge_embedding_profiles%ROWTYPE;
  e agentstudio.knowledge_embedding_consents%ROWTYPE; valid boolean:=false; matching boolean:=false;
BEGIN
  SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor;
  SELECT * INTO e FROM agentstudio.knowledge_embedding_consents WHERE owner_user_id=actor;
  valid:=coalesce(p.enabled,false) AND EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=p.connection_id
    AND c.owner_user_id=actor AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name);
  matching:=valid AND e.profile_id IS NOT DISTINCT FROM p.configuration_id AND e.profile_revision IS NOT DISTINCT FROM p.revision;
  RETURN jsonb_build_object('revision',coalesce(e.revision,0),'profile_id',p.configuration_id,'profile_revision',coalesce(p.revision,0),
    'profile_valid',valid,'index_enabled',coalesce(matching AND e.index_enabled,false),'query_enabled',coalesce(matching AND e.query_enabled,false));
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_consent_receipt(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); answer jsonb;
BEGIN
  IF p_request IS NULL THEN RAISE EXCEPTION 'invalid_embedding_consent_request' USING ERRCODE='P0400'; END IF;
  SELECT result INTO answer FROM agentstudio.knowledge_embedding_consent_receipts WHERE actor_user_id=actor AND request_id=p_request;
  RETURN answer;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_consent_change(p_request uuid,p_expected bigint,p_action text,p_profile uuid,p_profile_revision bigint,p_index boolean,p_query boolean,p_ack text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); p agentstudio.knowledge_embedding_profiles%ROWTYPE;
  version bigint; digest text; old_digest text; answer jsonb;
BEGIN
  IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_action IS NULL OR p_action NOT IN ('grant','revoke')
    OR (p_action='grant' AND (p_profile IS NULL OR p_profile_revision IS NULL OR p_profile_revision<1 OR p_index IS NULL OR p_query IS NULL
      OR NOT(p_index OR p_query) OR p_ack IS DISTINCT FROM 'APPROVE_EMBEDDING_PROVIDER_CHARGES_FOR_THIS_PROFILE'))
    OR (p_action='revoke' AND (p_profile IS NOT NULL OR p_profile_revision IS NOT NULL OR p_index IS NOT NULL OR p_query IS NOT NULL OR p_ack IS NOT NULL))
    THEN RAISE EXCEPTION 'invalid_embedding_consent_request' USING ERRCODE='P0400'; END IF;
  digest:=encode(sha256(convert_to(jsonb_build_object('expected_revision',p_expected,'action',p_action,'profile_id',p_profile,
    'profile_revision',p_profile_revision,'index_enabled',p_index,'query_enabled',p_query,'acknowledgement',p_ack)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6635));
  SELECT request_sha256,result INTO old_digest,answer FROM agentstudio.knowledge_embedding_consent_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF old_digest<>digest THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',answer,'replayed',true);
  END IF;
  IF p_action='grant' THEN
    SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor FOR UPDATE;
    IF p.configuration_id IS DISTINCT FROM p_profile OR p.revision IS DISTINCT FROM p_profile_revision OR NOT coalesce(p.enabled,false)
      THEN RAISE EXCEPTION 'embedding_profile_changed' USING ERRCODE='P0409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=p.connection_id AND c.owner_user_id=actor AND c.enabled
      AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name)
      THEN RAISE EXCEPTION 'embedding_connection_unavailable' USING ERRCODE='P0409'; END IF;
  END IF;
  SELECT revision INTO version FROM agentstudio.knowledge_embedding_consents WHERE owner_user_id=actor FOR UPDATE;
  version:=coalesce(version,0);
  IF version<>p_expected THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='P0409'; END IF;
  version:=version+1;
  INSERT INTO agentstudio.knowledge_embedding_consents(owner_user_id,revision,profile_id,profile_revision,index_enabled,query_enabled)
    VALUES(actor,version,p_profile,p_profile_revision,coalesce(p_index,false),coalesce(p_query,false))
    ON CONFLICT(owner_user_id) DO UPDATE SET revision=excluded.revision,profile_id=excluded.profile_id,profile_revision=excluded.profile_revision,
      index_enabled=excluded.index_enabled,query_enabled=excluded.query_enabled,updated_at=now();
  answer:=jsonb_build_object('request_id',p_request,'action',p_action,'revision',version,'profile_id',p_profile,'profile_revision',p_profile_revision,
    'index_enabled',coalesce(p_index,false),'query_enabled',coalesce(p_query,false));
  INSERT INTO agentstudio.knowledge_embedding_consent_receipts(actor_user_id,request_id,request_sha256,result) VALUES(actor,p_request,digest,answer);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'knowledge_embedding_consent_'||p_action,'knowledge_embedding_profile',actor::text,'succeeded',
      jsonb_build_object('revision',version,'profile_id',p_profile,'profile_revision',p_profile_revision,'request_id',p_request,
        'index_enabled',coalesce(p_index,false),'query_enabled',coalesce(p_query,false)));
  RETURN jsonb_build_object('item',answer,'replayed',false);
END
$fn$;
DO $functions$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['knowledge_embedding_profile_epoch()','knowledge_embedding_consent_actor()',
    'knowledge_embedding_consent()','knowledge_embedding_consent_receipt(uuid)',
    'knowledge_embedding_consent_change(uuid,bigint,text,uuid,bigint,boolean,boolean,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_knowledge_embedding';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch';
  END LOOP;
END
$functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_consent(),agentstudio.knowledge_embedding_consent_receipt(uuid),
  agentstudio.knowledge_embedding_consent_change(uuid,bigint,text,uuid,bigint,boolean,boolean,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_036','Explicit owner embedding consent preparation; no paid dispatch');
COMMIT;
