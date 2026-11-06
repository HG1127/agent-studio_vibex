-- Isolated F08 candidate. Existing employee sharing governance and063 snapshot
-- primitives are reused unchanged. No login, Worker, provider or activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole AND rolsuper) OR current_user<>session_user OR pg_is_in_recovery()
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_064') OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_065')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE starts_with(proname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,'agent_internal_share_') OR starts_with(typname,'_agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE starts_with(conname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE starts_with(tgname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE starts_with(nspname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE starts_with(collname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE starts_with(conname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE starts_with(opcname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE starts_with(opfname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server WHERE starts_with(srvname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper WHERE starts_with(fdwname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_statistic_ext WHERE starts_with(stxname,'agent_internal_share_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
  THEN RAISE EXCEPTION 'agent_internal_share_installation_refused';END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_internal_share_invites(
  id uuid NOT NULL PRIMARY KEY,owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,source_revision bigint NOT NULL CHECK(source_revision BETWEEN 1 AND 9007199254740991),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  owner_epoch bigint NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740989),invite_epoch uuid NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  token_sha256 text NOT NULL UNIQUE CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>created_at)
);
CREATE INDEX agent_internal_share_invites_owner ON agentstudio.agent_internal_share_invites(owner_user_id,created_at,id);
CREATE TABLE agentstudio.agent_internal_share_snapshots(
  invite_id uuid NOT NULL PRIMARY KEY,snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=600000),
  FOREIGN KEY(invite_id) REFERENCES agentstudio.agent_internal_share_invites(id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_internal_share_states(
  invite_id uuid NOT NULL PRIMARY KEY,revoked boolean NOT NULL DEFAULT false,used_at timestamptz,used_by uuid,copied_spec_id uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(invite_id) REFERENCES agentstudio.agent_internal_share_invites(id) ON DELETE RESTRICT,
  CHECK((used_at IS NULL AND used_by IS NULL AND copied_spec_id IS NULL) OR (used_at IS NOT NULL AND used_by IS NOT NULL AND copied_spec_id IS NOT NULL))
);
CREATE TABLE agentstudio.agent_internal_share_consumptions(
  invite_id uuid NOT NULL PRIMARY KEY,recipient_user_id uuid NOT NULL,request_id uuid NOT NULL,copied_spec_id uuid NOT NULL UNIQUE,
  snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),copy_sha256 text NOT NULL CHECK(copy_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(invite_id) REFERENCES agentstudio.agent_internal_share_invites(id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_internal_share_receipts(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,invite_id uuid NOT NULL,action text NOT NULL CHECK(action IN('create','redeem','revoke')),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(invite_id) REFERENCES agentstudio.agent_internal_share_invites(id) ON DELETE RESTRICT
);
DO $private$ DECLARE v_name text;BEGIN
  FOREACH v_name IN ARRAY ARRAY['invites','snapshots','states','consumptions','receipts'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY','agent_internal_share_'||v_name);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY','agent_internal_share_'||v_name);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch','agent_internal_share_'||v_name);
  END LOOP;
END $private$;
CREATE FUNCTION agentstudio.agent_internal_share_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'agent_internal_share_immutable_evidence';END $fn$;
DO $immutable$ DECLARE v_name text;BEGIN
  FOREACH v_name IN ARRAY ARRAY['invites','snapshots','consumptions','receipts'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON agentstudio.%I FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_internal_share_immutable()','agent_internal_share_'||v_name||'_immutable','agent_internal_share_'||v_name);
  END LOOP;
END $immutable$;
CREATE FUNCTION agentstudio.agent_internal_share_monotone() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND NEW.updated_at>=OLD.updated_at THEN
    IF NOT OLD.revoked AND NEW.revoked AND (to_jsonb(NEW)-ARRAY['revoked','updated_at'])=(to_jsonb(OLD)-ARRAY['revoked','updated_at']) THEN RETURN NEW;END IF;
    IF NOT OLD.revoked AND NOT NEW.revoked AND OLD.used_at IS NULL AND NEW.used_at IS NOT NULL AND NEW.used_by IS NOT NULL AND NEW.copied_spec_id IS NOT NULL AND NEW.invite_id=OLD.invite_id THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'agent_internal_share_state_monotone_required';
END $fn$;
CREATE TRIGGER agent_internal_share_states_monotone BEFORE UPDATE OR DELETE ON agentstudio.agent_internal_share_states FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_internal_share_monotone();
CREATE FUNCTION agentstudio.agent_internal_share_ms(timestamp with time zone) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT floor(extract(epoch FROM $1)*1000)::bigint
$fn$;
CREATE FUNCTION agentstudio.agent_internal_share_member(uuid,boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_native jsonb;v_share boolean;
BEGIN
  IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'agent_internal_share_member_required';END IF;
  v_native:=agentstudio.agent_design_native($1);
  SELECT a.share_enabled INTO v_share FROM agentstudio_auth.accounts AS a WHERE a.user_id=$1 FOR SHARE;
  IF NOT FOUND OR ($2 AND v_share IS DISTINCT FROM true) THEN RAISE EXCEPTION 'agent_internal_share_member_required';END IF;
  RETURN v_native-'identity';
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_context(boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  PERFORM agentstudio.agent_design_session('agentstudio_api');
  RETURN agentstudio.agent_internal_share_member(agentstudio.actor_id(),$1);
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_code_hash(text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF $1 !~ '^[A-Za-z0-9]{48}$' THEN RAISE EXCEPTION 'agent_internal_share_invalid_code';END IF;
  RETURN encode(sha256(convert_to('agentstudio-internal-share-v1:'||$1,'UTF8')),'hex');
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_copy_name(text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_text text:='';v_char text;v_length integer:=0;v_next integer;
BEGIN
  FOR v_next IN 1..length($1) LOOP
    v_char:=substr($1,v_next,1);v_length:=v_length+CASE WHEN ascii(v_char)>65535 THEN 2 ELSE 1 END;
    EXIT WHEN v_length>110;v_text:=v_text||v_char;
  END LOOP;
  RETURN v_text||'（内部共享副本）';
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_preview_private(uuid,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' SET bytea_output='hex' AS $fn$
DECLARE v_member jsonb;v_source jsonb;v_snapshot jsonb;v_hash text;v_review jsonb;
BEGIN
  v_member:=agentstudio.agent_internal_share_member($1,true);
  v_source:=agentstudio.agent_template_market_private_source($1,$2);v_snapshot:=agentstudio.agent_template_market_safe_snapshot(v_source->'snapshot');v_hash:=agentstudio.agent_design_digest(v_snapshot);
  v_review:=jsonb_build_object('protocol','agent_internal_share_review_v1','source',v_source->'source','name',v_source->'name','snapshot',v_snapshot,'snapshot_sha256',v_hash,'owner_epoch',v_member->'epoch');
  RETURN jsonb_build_object('protocol','agent_internal_share_preview_v1','purpose','internal_agent_template_share','source',v_source->'source','name',v_source->'name','snapshot',v_snapshot,'snapshot_sha256',v_hash,'owner_epoch',v_member->'epoch','preview_hash',agentstudio.agent_design_digest(v_review),'removed',v_source->'removed','review_required',true,'one_time',true,'expires_in_seconds',604800,'authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_preview(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_member jsonb;
BEGIN
  v_member:=agentstudio.agent_internal_share_context(true);
  IF $1 IS NULL THEN RAISE EXCEPTION 'agent_internal_share_invalid_source';END IF;
  RETURN agentstudio.agent_internal_share_preview_private((v_member->>'owner_user_id')::uuid,$1);
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_list() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_member jsonb;v_owner uuid;v_specs jsonb;v_invites jsonb;v_now timestamptz:=clock_timestamp();
BEGIN
  v_member:=agentstudio.agent_internal_share_context(true);v_owner:=(v_member->>'owner_user_id')::uuid;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) ORDER BY q.updated_at DESC,q.id),'[]') INTO v_specs FROM
    (SELECT a.id,a.name,a.updated_at FROM agentstudio.agent_specs AS a WHERE a.owner_user_id=v_owner AND a.visibility='private' AND a.requires_approval ORDER BY a.updated_at DESC,a.id LIMIT 100) AS q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'spec_id',q.spec_id,'created_ms',agentstudio.agent_internal_share_ms(q.created_at),'expires_ms',agentstudio.agent_internal_share_ms(q.expires_at),'used_ms',coalesce(agentstudio.agent_internal_share_ms(q.used_at),0),'revoked',q.revoked,'status',CASE WHEN q.revoked THEN 'revoked' WHEN q.used_at IS NOT NULL THEN 'used' WHEN q.expires_at<=v_now THEN 'expired' WHEN q.owner_epoch<>(v_member->>'epoch')::bigint THEN 'inactive' ELSE 'active' END) ORDER BY q.created_at DESC,q.id),'[]') INTO v_invites FROM
    (SELECT i.id,i.name,i.spec_id,i.created_at,i.expires_at,i.owner_epoch,s.used_at,s.revoked FROM agentstudio.agent_internal_share_invites AS i JOIN agentstudio.agent_internal_share_states AS s ON s.invite_id=i.id WHERE i.owner_user_id=v_owner ORDER BY i.created_at DESC,i.id LIMIT 50) AS q;
  RETURN jsonb_build_object('protocol','agent_internal_share_list_v1','ok',true,'scope','current_user','specs',v_specs,'invites',v_invites);
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_intent(jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF jsonb_typeof($1) IS DISTINCT FROM 'object' OR agentstudio.agent_design_uuid($1->'request_id') IS NOT TRUE THEN RETURN false;END IF;
  IF $1->>'action'='create' THEN
    RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','source','preview_hash','confirm_safe','acknowledgement']) IS TRUE AND agentstudio.agent_template_market_source_pin($1->'source') IS TRUE AND agentstudio.agent_plan_workflow_sha($1->'preview_hash') IS TRUE AND $1->'confirm_safe'='true'::jsonb AND $1->>'acknowledgement'='SHARE_REVIEWED_AGENT_TEMPLATE_ONCE';
  ELSIF $1->>'action'='redeem' THEN
    RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','share_code','confirm']) IS TRUE AND $1->'confirm'='true'::jsonb AND jsonb_typeof($1->'share_code')='string' AND $1->>'share_code' ~ '^[A-Za-z0-9]{48}$';
  ELSIF $1->>'action'='revoke' THEN
    RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','id','confirm']) IS TRUE AND $1->'confirm'='true'::jsonb AND agentstudio.agent_design_uuid($1->'id') IS TRUE;
  END IF;
  RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_receipt(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_member jsonb;v_receipt jsonb;
BEGIN
  v_member:=agentstudio.agent_internal_share_context(false);
  IF $1 IS NULL THEN RAISE EXCEPTION 'agent_internal_share_invalid_request';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((v_member->>'owner_user_id')||':internal-share-request:'||$1::text,651));
  SELECT r.receipt INTO v_receipt FROM agentstudio.agent_internal_share_receipts AS r WHERE r.owner_user_id=(v_member->>'owner_user_id')::uuid AND r.request_id=$1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_recorded','request_id',$1);END IF;
  RETURN jsonb_build_object('status','recorded','receipt',v_receipt);
END $fn$;
CREATE FUNCTION agentstudio.agent_internal_share_record(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE v_member jsonb;v_owner uuid;v_id uuid;v_rid uuid;v_action text;v_hash text;v_prior record;v_fresh jsonb;v_preview jsonb;v_invite record;v_state record;v_publisher jsonb;v_snapshot jsonb;v_copy jsonb;v_agent record;v_code text;v_token_hash text;v_receipt jsonb;v_now timestamptz;v_sid uuid;v_history_sha text;v_count integer;
BEGIN
  v_member:=agentstudio.agent_internal_share_context(false);v_owner:=(v_member->>'owner_user_id')::uuid;
  IF agentstudio.agent_internal_share_intent($1) IS NOT TRUE THEN RAISE EXCEPTION 'agent_internal_share_invalid_intent';END IF;
  v_action:=$1->>'action';v_rid:=($1->>'request_id')::uuid;v_hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_internal_share_intent_v1','purpose','internal_agent_template_share','intent',$1));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text||':internal-share-request:'||v_rid::text,651));
  SELECT r.* INTO v_prior FROM agentstudio.agent_internal_share_receipts AS r WHERE r.owner_user_id=v_owner AND r.request_id=v_rid;
  IF FOUND THEN
    IF v_prior.action IS DISTINCT FROM v_action OR v_prior.request_sha256 IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'agent_internal_share_request_conflict';END IF;
    RETURN jsonb_build_object('protocol','agent_internal_share_reply_v1','receipt',v_prior.receipt,'share_code',NULL,'replayed',true);
  END IF;
  v_member:=agentstudio.agent_internal_share_member(v_owner,true);
  IF v_action='create' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text||':internal-share-active',652));
    v_preview:=agentstudio.agent_internal_share_preview_private(v_owner,($1->'source'->>'spec_id')::uuid);
    IF v_preview->'source' IS DISTINCT FROM $1->'source' OR v_preview->>'preview_hash' IS DISTINCT FROM $1->>'preview_hash' THEN RAISE EXCEPTION 'agent_internal_share_review_required';END IF;
    SELECT count(*) INTO v_count FROM agentstudio.agent_internal_share_invites AS i JOIN agentstudio.agent_internal_share_states AS s ON s.invite_id=i.id WHERE i.owner_user_id=v_owner AND i.owner_epoch=(v_member->>'epoch')::bigint AND NOT s.revoked AND s.used_at IS NULL AND i.expires_at>clock_timestamp();
    IF v_count>=25 THEN RAISE EXCEPTION 'agent_internal_share_invite_limit';END IF;
    v_now:=clock_timestamp();v_id:=gen_random_uuid();
    -- Four independent first48 random UUID bits; fixed48 alphanumeric hex,
    -- 192 CSPRNG bits, no plaintext token persistence or extra crypto grants.
    v_code:=left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12);
    v_token_hash:=agentstudio.agent_internal_share_code_hash(v_code);
    INSERT INTO agentstudio.agent_internal_share_invites(id,owner_user_id,spec_id,source_revision,source_sha256,snapshot_sha256,owner_epoch,invite_epoch,name,token_sha256,created_at,expires_at)
      VALUES(v_id,v_owner,($1->'source'->>'spec_id')::uuid,($1->'source'->>'revision')::bigint,$1->'source'->>'source_sha256',v_preview->>'snapshot_sha256',(v_member->>'epoch')::bigint,gen_random_uuid(),v_preview->>'name',v_token_hash,v_now,v_now+interval '168 hours');
    INSERT INTO agentstudio.agent_internal_share_snapshots(invite_id,snapshot) VALUES(v_id,v_preview->'snapshot');
    INSERT INTO agentstudio.agent_internal_share_states(invite_id) VALUES(v_id);
    v_receipt:=jsonb_build_object('protocol','agent_internal_share_receipt_v1','action',v_action,'request_id',v_rid,'request_sha256',v_hash,'id',v_id,'name',v_preview->'name','spec_id',$1->'source'->'spec_id','created_ms',agentstudio.agent_internal_share_ms(v_now),'expires_ms',agentstudio.agent_internal_share_ms(v_now+interval '168 hours'),'one_time',true);
  ELSE
    IF v_action='redeem' THEN
      v_token_hash:=agentstudio.agent_internal_share_code_hash($1->>'share_code');
      SELECT i.* INTO v_invite FROM agentstudio.agent_internal_share_invites AS i WHERE i.token_sha256=v_token_hash;
      IF NOT FOUND OR v_invite.owner_user_id=v_owner THEN RAISE EXCEPTION 'agent_internal_share_code_unavailable';END IF;
      BEGIN v_publisher:=agentstudio.agent_internal_share_member(v_invite.owner_user_id,true);
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM IN('agent_internal_share_member_required','agent_design_native_owner_required') THEN RAISE EXCEPTION 'agent_internal_share_code_unavailable';ELSE RAISE;END IF;
      END;
      IF (v_publisher->>'epoch')::bigint IS DISTINCT FROM v_invite.owner_epoch THEN RAISE EXCEPTION 'agent_internal_share_code_unavailable';END IF;
      v_id:=v_invite.id;
    ELSE v_id:=($1->>'id')::uuid;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('internal-share:'||v_id::text,650));
    SELECT i.* INTO v_invite FROM agentstudio.agent_internal_share_invites AS i WHERE i.id=v_id FOR SHARE;
    SELECT s.* INTO v_state FROM agentstudio.agent_internal_share_states AS s WHERE s.invite_id=v_id FOR UPDATE;
    v_now:=clock_timestamp();
    IF v_invite.id IS NULL OR v_state.invite_id IS NULL THEN RAISE EXCEPTION 'agent_internal_share_code_unavailable';END IF;
    IF v_action='redeem' THEN
      IF v_invite.token_sha256 IS DISTINCT FROM v_token_hash OR v_invite.owner_user_id=v_owner OR v_state.revoked OR v_state.used_at IS NOT NULL OR v_invite.expires_at<=v_now OR EXISTS(SELECT 1 FROM agentstudio.agent_internal_share_consumptions AS c WHERE c.invite_id=v_id) THEN RAISE EXCEPTION 'agent_internal_share_code_unavailable';END IF;
      SELECT s.snapshot INTO v_snapshot FROM agentstudio.agent_internal_share_snapshots AS s WHERE s.invite_id=v_id FOR SHARE;
      v_snapshot:=agentstudio.agent_template_market_safe_snapshot(v_snapshot);
      IF v_snapshot IS NULL OR agentstudio.agent_design_digest(v_snapshot) IS DISTINCT FROM v_invite.snapshot_sha256 THEN RAISE EXCEPTION 'agent_internal_share_corrupt_snapshot';END IF;
      v_copy:=agentstudio.agent_template_market_copy(v_snapshot,v_invite.name,agentstudio.agent_internal_share_copy_name(v_invite.name));v_sid:=gen_random_uuid();
      INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec,requires_approval,revision) VALUES(v_sid,v_owner,v_copy->>'name',v_copy->'spec',true,1) RETURNING * INTO v_agent;
      IF v_agent.id IS DISTINCT FROM v_sid OR v_agent.owner_user_id IS DISTINCT FROM v_owner OR v_agent.name IS DISTINCT FROM v_copy->>'name' OR v_agent.spec IS DISTINCT FROM v_copy->'spec' OR v_agent.revision<>1 OR v_agent.requires_approval IS DISTINCT FROM true OR v_agent.visibility IS DISTINCT FROM 'private' OR v_agent.team_id IS NOT NULL THEN RAISE EXCEPTION 'agent_internal_share_unsafe_copy';END IF;
      v_history_sha:=agentstudio.agent_optimization_role_sha(v_sid,v_owner,v_agent.name,1,v_agent.spec);
      INSERT INTO agentstudio.agent_collaboration_revisions(id,owner_user_id,spec_id,actor_user_id,kind,spec_revision,source_sha256,safe_spec,note) VALUES(gen_random_uuid(),v_owner,v_sid,v_owner,'edited',1,v_history_sha,agentstudio.collaboration_safe_text(v_agent.spec),'Owner redeemed one-use internal template');
      IF (SELECT count(*) FROM agentstudio.agent_collaboration_revisions AS r WHERE r.spec_id=v_sid)<>1 OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_collaboration_revisions AS r WHERE r.spec_id=v_sid AND r.owner_user_id=v_owner AND r.actor_user_id=v_owner AND r.kind='edited' AND r.spec_revision=1 AND r.source_sha256=v_history_sha AND r.safe_spec=agentstudio.collaboration_safe_text(v_agent.spec) AND r.source_revision_id IS NULL AND r.proposal_id IS NULL) THEN RAISE EXCEPTION 'agent_internal_share_history_required';END IF;
      INSERT INTO agentstudio.agent_internal_share_consumptions(invite_id,recipient_user_id,request_id,copied_spec_id,snapshot_sha256,copy_sha256) VALUES(v_id,v_owner,v_rid,v_sid,v_invite.snapshot_sha256,v_copy->>'copy_sha256');
      UPDATE agentstudio.agent_internal_share_states AS s SET used_at=v_now,used_by=v_owner,copied_spec_id=v_sid,updated_at=v_now WHERE s.invite_id=v_id;
      v_receipt:=jsonb_build_object('protocol','agent_internal_share_receipt_v1','action',v_action,'request_id',v_rid,'request_sha256',v_hash,'id',v_id,'spec_id',v_sid,'spec_revision',1,'name',v_copy->'name','used_ms',agentstudio.agent_internal_share_ms(v_now),'resource_selection_required',true,'starts_run',false);
    ELSE
      IF v_invite.owner_user_id IS DISTINCT FROM v_owner OR v_state.revoked THEN RAISE EXCEPTION 'agent_internal_share_invite_not_found';END IF;
      UPDATE agentstudio.agent_internal_share_states AS s SET revoked=true,updated_at=v_now WHERE s.invite_id=v_id;
      v_receipt:=jsonb_build_object('protocol','agent_internal_share_receipt_v1','action',v_action,'request_id',v_rid,'request_sha256',v_hash,'id',v_id,'revoked',true,'revoked_ms',agentstudio.agent_internal_share_ms(v_now));
    END IF;
  END IF;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(v_owner,v_owner,'agent.internal_share.'||v_action,'agent_internal_share',v_id::text,'succeeded',jsonb_build_object('request_id',v_rid,'request_sha256',v_hash,'copied_spec_id',v_sid,'provider_called',false));
  INSERT INTO agentstudio.agent_internal_share_receipts(owner_user_id,request_id,invite_id,action,request_sha256,receipt) VALUES(v_owner,v_rid,v_id,v_action,v_hash,v_receipt);
  RETURN jsonb_build_object('protocol','agent_internal_share_reply_v1','receipt',v_receipt,'share_code',v_code,'replayed',false);
END $fn$;
DO $acl$ DECLARE v_routine regprocedure;BEGIN
  FOR v_routine IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'agent_internal_share_') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch',v_routine);
  END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_internal_share_list(),agentstudio.agent_internal_share_preview(uuid),agentstudio.agent_internal_share_record(jsonb),agentstudio.agent_internal_share_receipt(uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_065','Optional Native-owner seven-day one-use internal Agent template invitations, once-only raw code, immutable safe snapshot and owner receipts; no production activation');
COMMIT;
