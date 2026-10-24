-- Native collaboration preparation. Installation grants no execution rights.
-- Source preparation still requires full independent-login/browser acceptance
-- and target sign-off before any formal migration.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_044') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_collaboration') THEN
    RAISE EXCEPTION 'agent_collaboration_requires_reviewed_044_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_collaboration NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_collaboration;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_collaboration;
CREATE TABLE agentstudio.agent_collaboration_grants(
  spec_id uuid NOT NULL,owner_user_id uuid NOT NULL,recipient_id uuid NOT NULL REFERENCES agentstudio.users(id),
  role text NOT NULL CHECK(role IN('viewer','editor')),active boolean NOT NULL,revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(spec_id,recipient_id),CHECK(owner_user_id<>recipient_id),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE TABLE agentstudio.agent_collaboration_proposals(
  id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,author_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  grant_revision bigint NOT NULL,base_revision bigint NOT NULL,base_sha256 text NOT NULL CHECK(base_sha256~'^[a-f0-9]{64}$'),
  proposed jsonb NOT NULL,comment text NOT NULL,status text NOT NULL CHECK(status IN('pending','accepted','rejected','invalidated')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz,reviewer_user_id uuid REFERENCES agentstudio.users(id),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE UNIQUE INDEX ux_agent_collaboration_pending ON agentstudio.agent_collaboration_proposals(spec_id,author_user_id) WHERE status='pending';
CREATE TABLE agentstudio.agent_collaboration_revisions(
  id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  kind text NOT NULL CHECK(kind IN('before_edit','edited','before_accept','accepted','before_restore','restored')),
  source_revision_id uuid,proposal_id uuid,spec_revision bigint NOT NULL,source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
  safe_spec jsonb NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE TABLE agentstudio.agent_collaboration_receipts(
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),request_id uuid NOT NULL,spec_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
  input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_user_id,request_id)
);
DO $tables$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['agent_collaboration_grants','agent_collaboration_proposals','agent_collaboration_revisions','agent_collaboration_receipts'] LOOP
    EXECUTE 'REVOKE ALL ON agentstudio.'||t||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT,INSERT ON agentstudio.'||t||' TO agentstudio_collaboration';
    EXECUTE 'CREATE POLICY collaboration_private ON agentstudio.'||t||' TO agentstudio_collaboration USING(true) WITH CHECK(true)';
  END LOOP;
END $tables$;
GRANT UPDATE(role,active,revision,updated_at) ON agentstudio.agent_collaboration_grants TO agentstudio_collaboration;
GRANT UPDATE(status,reviewed_at,reviewer_user_id) ON agentstudio.agent_collaboration_proposals TO agentstudio_collaboration;
GRANT SELECT(id,owner_user_id,name,spec,revision) ON agentstudio.agent_specs TO agentstudio_collaboration;
GRANT UPDATE(spec,revision,updated_at) ON agentstudio.agent_specs TO agentstudio_collaboration;
GRANT SELECT(id,external_issuer,external_subject,status,display_name) ON agentstudio.users TO agentstudio_collaboration;
GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_collaboration;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_collaboration;
CREATE POLICY collaboration_specs ON agentstudio.agent_specs TO agentstudio_collaboration USING(true) WITH CHECK(true);
CREATE POLICY collaboration_users ON agentstudio.users TO agentstudio_collaboration USING(true);
CREATE POLICY collaboration_accounts ON agentstudio_auth.accounts TO agentstudio_collaboration USING(true);
CREATE POLICY collaboration_audit ON agentstudio.audit_events TO agentstudio_collaboration WITH CHECK(true);

CREATE FUNCTION agentstudio.collaboration_native_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT EXISTS(SELECT 1 FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id
    WHERE u.id=p_user AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled)
$fn$;
CREATE FUNCTION agentstudio.collaboration_utf16_length(p_value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(p_value,'') c WHERE c<>''
$fn$;
CREATE FUNCTION agentstudio.collaboration_safe_text(p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb; key text; value jsonb;
BEGIN
  IF jsonb_typeof(p_spec) IS DISTINCT FROM 'object' OR jsonb_typeof(p_spec->'goal') IS DISTINCT FROM 'string' OR
    btrim(p_spec->>'goal')='' OR agentstudio.collaboration_utf16_length(p_spec->>'goal')>3000 THEN RETURN NULL; END IF;
  IF p_spec ? 'task_scope' AND (jsonb_typeof(p_spec->'task_scope') IS DISTINCT FROM 'string' OR agentstudio.collaboration_utf16_length(p_spec->>'task_scope')>4000) THEN RETURN NULL; END IF;
  result=jsonb_build_object('goal',p_spec->'goal','task_scope',coalesce(p_spec->'task_scope','""'::jsonb));
  FOREACH key IN ARRAY ARRAY['deliverables','task_plan','done_criteria'] LOOP
    value=coalesce(p_spec->key,'[]'::jsonb);
    IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
    IF jsonb_array_length(value)>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(value) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR agentstudio.collaboration_utf16_length(item#>>'{}')>500) THEN RETURN NULL; END IF;
    result=result||jsonb_build_object(key,value);
  END LOOP;
  RETURN result;
END $fn$;
CREATE FUNCTION agentstudio.collaboration_source_sha(p_spec uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',id,'owner',owner_user_id,'name',name,'revision',revision,'spec',spec)::text,'UTF8')),'hex')
  FROM agentstudio.agent_specs WHERE id=p_spec
$fn$;
CREATE FUNCTION agentstudio.collaboration_compact_json(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN RETURN (SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||agentstudio.collaboration_compact_json(value),',' ORDER BY key),'')||'}' FROM jsonb_each(p_value));
    WHEN 'array' THEN RETURN (SELECT '['||coalesce(string_agg(agentstudio.collaboration_compact_json(value),',' ORDER BY ordinal),'')||']' FROM jsonb_array_elements(p_value) WITH ORDINALITY a(value,ordinal));
    ELSE RETURN p_value::text;
  END CASE;
END $fn$;
CREATE FUNCTION agentstudio.collaboration_proposal_sha(p_proposal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',id,'owner',owner_user_id,'spec',spec_id,'author',author_user_id,'grant_revision',grant_revision,
    'base_revision',base_revision,'base_sha256',base_sha256,'proposed',proposed,'comment',comment)::text,'UTF8')),'hex')
  FROM agentstudio.agent_collaboration_proposals WHERE id=p_proposal
$fn$;
CREATE FUNCTION agentstudio.collaboration_role(p_spec uuid,p_actor uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT CASE WHEN s.owner_user_id=p_actor THEN 'owner' ELSE g.role END FROM agentstudio.agent_specs s
  LEFT JOIN agentstudio.agent_collaboration_grants g ON g.spec_id=s.id AND g.owner_user_id=s.owner_user_id AND g.recipient_id=p_actor AND g.active
  WHERE s.id=p_spec AND agentstudio.collaboration_native_active(s.owner_user_id) AND agentstudio.collaboration_native_active(p_actor)
$fn$;
CREATE FUNCTION agentstudio.agent_collaboration_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(jsonb_agg(item ORDER BY item->>'name',item->>'id'),'[]'::jsonb) FROM
    (SELECT jsonb_build_object('id',s.id,'name',s.name,'revision',s.revision,'role',agentstudio.collaboration_role(s.id,agentstudio.actor_id()),
      'owner_name',u.display_name) item FROM agentstudio.agent_specs s JOIN agentstudio.users u ON u.id=s.owner_user_id
    WHERE agentstudio.collaboration_role(s.id,agentstudio.actor_id()) IS NOT NULL ORDER BY s.name,s.id LIMIT 200) entries
$fn$;
CREATE FUNCTION agentstudio.agent_collaboration_detail(p_spec uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); access text; s record; safe jsonb;
BEGIN
  access=agentstudio.collaboration_role(p_spec,actor);
  IF access IS NULL THEN RETURN NULL; END IF;
  SELECT id,owner_user_id,name,revision,spec INTO s FROM agentstudio.agent_specs WHERE id=p_spec;
  safe=agentstudio.collaboration_safe_text(s.spec);
  IF safe IS NULL THEN RAISE EXCEPTION 'agent_collaboration_text_unavailable'; END IF;
  RETURN jsonb_build_object('id',s.id,'name',s.name,'revision',s.revision,'role',access,'safe',safe,'source_sha256',agentstudio.collaboration_source_sha(s.id),
    'grants',CASE WHEN access='owner' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('recipient_id',g.recipient_id,'name',u.display_name,'role',g.role,'active',g.active,
      'recipient_active',agentstudio.collaboration_native_active(g.recipient_id),'revision',g.revision) ORDER BY g.active DESC,g.updated_at DESC,g.recipient_id),'[]'::jsonb)
      FROM (SELECT * FROM agentstudio.agent_collaboration_grants WHERE spec_id=s.id AND owner_user_id=s.owner_user_id ORDER BY active DESC,updated_at DESC,recipient_id LIMIT 100) g
      JOIN agentstudio.users u ON u.id=g.recipient_id) ELSE '[]'::jsonb END,
    'proposals',CASE WHEN access='viewer' THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) FROM
      (SELECT p.id,p.created_at,jsonb_build_object('id',p.id,'author_user_id',p.author_user_id,'base_revision',p.base_revision,'base_sha256',p.base_sha256,
        'proposal_sha256',agentstudio.collaboration_proposal_sha(p.id),'proposed',p.proposed,'comment',p.comment,'status',p.status,'created_at',p.created_at,'reviewed_at',p.reviewed_at) item
       FROM agentstudio.agent_collaboration_proposals p WHERE p.spec_id=s.id AND p.owner_user_id=s.owner_user_id AND (access='owner' OR p.author_user_id=actor)
       ORDER BY p.created_at DESC,p.id LIMIT 40) visible) END);
END $fn$;

CREATE FUNCTION agentstudio.agent_collaboration_receipt(p_spec uuid,p_request uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('request_sha256',request_sha256,'result',result||jsonb_build_object('replayed',true))
  FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=agentstudio.actor_id() AND request_id=p_request AND spec_id=p_spec
    AND agentstudio.collaboration_role(p_spec,agentstudio.actor_id()) IS NOT NULL
$fn$;
CREATE FUNCTION agentstudio.agent_collaboration_grant(p_spec uuid,p_recipient uuid,p_role text,p_revision bigint,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; previous agentstudio.agent_collaboration_grants%ROWTYPE; receipt agentstudio.agent_collaboration_receipts%ROWTYPE;
  input_sha text; result jsonb; next_revision bigint;
BEGIN
  IF actor IS NULL OR NOT agentstudio.collaboration_native_active(actor) THEN RAISE EXCEPTION 'agent_collaboration_actor_unavailable'; END IF;
  IF p_request IS NULL OR p_recipient IS NULL OR p_recipient=actor OR p_revision IS NULL OR p_revision<0 OR p_revision>=9007199254740991 OR
    p_role IS NOT NULL AND p_role NOT IN('viewer','editor') OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_collaboration_grant'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,45));
  SELECT id,owner_user_id INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_not_found'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('spec_id',p_spec,'recipient_id',p_recipient,'role',p_role,'expected_revision',p_revision,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.spec_id<>p_spec OR receipt.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_collaboration_request_conflict'; END IF;
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO previous FROM agentstudio.agent_collaboration_grants WHERE spec_id=p_spec AND recipient_id=p_recipient FOR UPDATE;
  IF p_revision<>coalesce(previous.revision,0) OR p_role IS NULL AND (previous.spec_id IS NULL OR NOT previous.active) THEN RAISE EXCEPTION 'agent_collaboration_grant_changed'; END IF;
  IF p_role IS NOT NULL THEN
    IF NOT agentstudio.collaboration_native_active(p_recipient) THEN RAISE EXCEPTION 'agent_collaboration_recipient_unavailable'; END IF;
    IF NOT coalesce(previous.active,false) AND (SELECT count(*) FROM agentstudio.agent_collaboration_grants WHERE spec_id=p_spec AND active)>=30 THEN RAISE EXCEPTION 'agent_collaboration_grant_limit'; END IF;
  END IF;
  next_revision=coalesce(previous.revision,0)+1;
  INSERT INTO agentstudio.agent_collaboration_grants(spec_id,owner_user_id,recipient_id,role,active,revision)
    VALUES(p_spec,actor,p_recipient,coalesce(p_role,previous.role),p_role IS NOT NULL,next_revision)
    ON CONFLICT(spec_id,recipient_id) DO UPDATE SET role=excluded.role,active=excluded.active,revision=excluded.revision,updated_at=clock_timestamp();
  UPDATE agentstudio.agent_collaboration_proposals SET status='invalidated',reviewed_at=clock_timestamp(),reviewer_user_id=actor
    WHERE spec_id=p_spec AND owner_user_id=actor AND author_user_id=p_recipient AND status='pending';
  result=jsonb_build_object('spec_id',p_spec,'recipient_id',p_recipient,'role',coalesce(p_role,previous.role),'active',p_role IS NOT NULL,'revision',next_revision,'request_id',p_request);
  INSERT INTO agentstudio.agent_collaboration_receipts(actor_user_id,request_id,spec_id,request_sha256,input_sha256,result) VALUES(actor,p_request,p_spec,p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,CASE WHEN p_role IS NULL THEN 'agent.collaboration.revoke' ELSE 'agent.collaboration.grant' END,'agent_spec',p_spec::text,'succeeded',
      jsonb_build_object('recipient_id',p_recipient,'revision',next_revision,'role',p_role,'request_id',p_request));
  RETURN result||jsonb_build_object('replayed',false);
END $fn$;

CREATE FUNCTION agentstudio.agent_collaboration_edit(p_spec uuid,p_revision bigint,p_source_sha text,p_safe jsonb,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; safe jsonb; input_sha text; result jsonb; receipt agentstudio.agent_collaboration_receipts%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT agentstudio.collaboration_native_active(actor) THEN RAISE EXCEPTION 'agent_collaboration_actor_unavailable'; END IF;
  IF p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_safe) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_agent_collaboration_edit'; END IF;
  IF p_safe-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']<>'{}'::jsonb THEN RAISE EXCEPTION 'agent_collaboration_protected_field'; END IF;
  safe=agentstudio.collaboration_safe_text(p_safe);
  IF safe IS NULL OR agentstudio.collaboration_utf16_length(agentstudio.collaboration_compact_json(safe))>23000 THEN RAISE EXCEPTION 'invalid_agent_collaboration_edit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,45));
  SELECT id,owner_user_id,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_not_found'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('spec',p_spec,'revision',p_revision,'source',p_source_sha,'safe',safe,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.spec_id<>p_spec OR receipt.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_collaboration_request_conflict'; END IF;
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  IF s.revision<>p_revision OR p_source_sha IS DISTINCT FROM agentstudio.collaboration_source_sha(p_spec) THEN RAISE EXCEPTION 'agent_collaboration_source_changed'; END IF;
  UPDATE agentstudio.agent_specs SET spec=spec||safe,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_spec AND owner_user_id=actor RETURNING revision INTO s.revision;
  result=jsonb_build_object('spec_id',p_spec,'revision',s.revision,'source_sha256',agentstudio.collaboration_source_sha(p_spec),'request_id',p_request);
  INSERT INTO agentstudio.agent_collaboration_receipts(actor_user_id,request_id,spec_id,request_sha256,input_sha256,result) VALUES(actor,p_request,p_spec,p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.collaboration.edit','agent_spec',p_spec::text,'succeeded',jsonb_build_object('revision',s.revision,'request_id',p_request));
  RETURN result||jsonb_build_object('replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_collaboration_propose(p_spec uuid,p_revision bigint,p_source_sha text,p_proposed jsonb,p_comment text,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; access text; grant_revision bigint; proposed jsonb; input_sha text; result jsonb; proposal_id uuid=gen_random_uuid();
  receipt agentstudio.agent_collaboration_receipts%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT agentstudio.collaboration_native_active(actor) THEN RAISE EXCEPTION 'agent_collaboration_actor_unavailable'; END IF;
  IF p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' OR p_comment IS NULL OR agentstudio.collaboration_utf16_length(btrim(p_comment)) NOT BETWEEN 8 AND 600 OR
    jsonb_typeof(p_proposed) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_agent_collaboration_proposal'; END IF;
  IF p_proposed-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']<>'{}'::jsonb THEN RAISE EXCEPTION 'agent_collaboration_protected_field'; END IF;
  proposed=agentstudio.collaboration_safe_text(p_proposed);
  IF proposed IS NULL OR agentstudio.collaboration_utf16_length(agentstudio.collaboration_compact_json(proposed))>23000 THEN RAISE EXCEPTION 'invalid_agent_collaboration_proposal'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,45));
  SELECT id,owner_user_id,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec FOR UPDATE;
  access=agentstudio.collaboration_role(p_spec,actor);
  IF s.id IS NULL OR access IS NULL THEN RAISE EXCEPTION 'agent_collaboration_not_found'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('spec',p_spec,'revision',p_revision,'source',p_source_sha,'proposed',proposed,'comment',btrim(p_comment),'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.spec_id<>p_spec OR receipt.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_collaboration_request_conflict'; END IF;
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  IF access<>'editor' THEN RAISE EXCEPTION 'agent_collaboration_editor_required'; END IF;
  SELECT revision INTO grant_revision FROM agentstudio.agent_collaboration_grants WHERE spec_id=p_spec AND owner_user_id=s.owner_user_id AND recipient_id=actor AND active AND role='editor' FOR UPDATE;
  IF grant_revision IS NULL OR s.revision<>p_revision OR p_source_sha IS DISTINCT FROM agentstudio.collaboration_source_sha(p_spec) THEN RAISE EXCEPTION 'agent_collaboration_source_changed'; END IF;
  IF EXISTS(SELECT 1 FROM agentstudio.agent_collaboration_proposals WHERE spec_id=p_spec AND author_user_id=actor AND status='pending') THEN RAISE EXCEPTION 'agent_collaboration_pending_exists'; END IF;
  INSERT INTO agentstudio.agent_collaboration_proposals(id,owner_user_id,spec_id,author_user_id,grant_revision,base_revision,base_sha256,proposed,comment,status)
    VALUES(proposal_id,s.owner_user_id,p_spec,actor,grant_revision,p_revision,p_source_sha,proposed,btrim(p_comment),'pending');
  result=jsonb_build_object('spec_id',p_spec,'proposal_id',proposal_id,'status','pending','base_revision',p_revision,'request_id',p_request);
  INSERT INTO agentstudio.agent_collaboration_receipts(actor_user_id,request_id,spec_id,request_sha256,input_sha256,result) VALUES(actor,p_request,p_spec,p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(s.owner_user_id,actor,'agent.collaboration.propose','agent_spec',p_spec::text,'succeeded',jsonb_build_object('proposal_id',proposal_id,'base_revision',p_revision,'request_id',p_request));
  RETURN result||jsonb_build_object('replayed',false);
END $fn$;

CREATE FUNCTION agentstudio.collaboration_record_spec_edit() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); before_safe jsonb; after_safe jsonb; before_sha text; after_sha text;
  operation text=current_setting('agentstudio.collaboration_kind',true); reference text=current_setting('agentstudio.collaboration_reference',true);
  note text=current_setting('agentstudio.collaboration_note',true); proposal uuid; source_revision uuid; before_kind text; after_kind text;
BEGIN
  -- Ordinary API writes cannot reach a row without a verified actor because
  -- its owner RLS remains unchanged. Privileged offline administration has
  -- separate audit obligations and must not impersonate an employee here.
  IF actor IS NULL THEN RETURN NEW; END IF;
  IF actor<>OLD.owner_user_id OR actor<>NEW.owner_user_id OR NOT agentstudio.collaboration_native_active(actor) OR NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'agent_collaboration_unsafe_owner_edit'; END IF;
  before_safe=agentstudio.collaboration_safe_text(OLD.spec); after_safe=agentstudio.collaboration_safe_text(NEW.spec);
  IF before_safe IS NULL OR after_safe IS NULL THEN RAISE EXCEPTION 'agent_collaboration_text_unavailable'; END IF;
  IF operation IN('accept','restore') THEN
    IF reference IS NULL OR reference!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'invalid_agent_collaboration_history_context'; END IF;
    IF operation='accept' THEN proposal=reference::uuid; before_kind='before_accept'; after_kind='accepted';
    ELSE source_revision=reference::uuid; before_kind='before_restore'; after_kind='restored'; END IF;
  ELSE before_kind='before_edit'; after_kind='edited'; note='Owner configuration edit'; END IF;
  IF note IS NULL OR agentstudio.collaboration_utf16_length(note)>600 THEN RAISE EXCEPTION 'invalid_agent_collaboration_history_context'; END IF;
  before_sha=encode(sha256(convert_to(jsonb_build_object('id',OLD.id,'owner',OLD.owner_user_id,'name',OLD.name,'revision',OLD.revision,'spec',OLD.spec)::text,'UTF8')),'hex');
  after_sha=encode(sha256(convert_to(jsonb_build_object('id',NEW.id,'owner',NEW.owner_user_id,'name',NEW.name,'revision',NEW.revision,'spec',NEW.spec)::text,'UTF8')),'hex');
  INSERT INTO agentstudio.agent_collaboration_revisions(id,owner_user_id,spec_id,actor_user_id,kind,source_revision_id,proposal_id,spec_revision,source_sha256,safe_spec,note)
    VALUES(gen_random_uuid(),actor,NEW.id,actor,before_kind,source_revision,proposal,OLD.revision,before_sha,before_safe,note),
      (gen_random_uuid(),actor,NEW.id,actor,after_kind,source_revision,proposal,NEW.revision,after_sha,after_safe,note);
  UPDATE agentstudio.agent_collaboration_proposals SET status='invalidated',reviewed_at=clock_timestamp(),reviewer_user_id=actor
    WHERE spec_id=NEW.id AND owner_user_id=actor AND status='pending';
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.collaboration.snapshot','agent_spec',NEW.id::text,'succeeded',jsonb_build_object('revision',NEW.revision,'source_sha256',after_sha,'kind',after_kind));
  RETURN NEW;
END $fn$;
CREATE TRIGGER native_agent_collaboration_history AFTER UPDATE OF name,spec ON agentstudio.agent_specs
  FOR EACH ROW EXECUTE FUNCTION agentstudio.collaboration_record_spec_edit();

CREATE FUNCTION agentstudio.agent_collaboration_revisions(p_spec uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT CASE WHEN agentstudio.collaboration_role(p_spec,agentstudio.actor_id())='owner' THEN
    (SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) FROM
      (SELECT id,created_at,jsonb_build_object('id',id,'actor_user_id',actor_user_id,'kind',kind,'source_revision_id',source_revision_id,'proposal_id',proposal_id,
        'spec_revision',spec_revision,'source_sha256',source_sha256,'safe',safe_spec,'note',note,'created_at',created_at) item
       FROM agentstudio.agent_collaboration_revisions WHERE spec_id=p_spec AND owner_user_id=agentstudio.actor_id() ORDER BY created_at DESC,id LIMIT 80) versions)
  END
$fn$;
CREATE FUNCTION agentstudio.agent_collaboration_review(p_spec uuid,p_proposal uuid,p_revision bigint,p_source_sha text,p_proposal_sha text,p_decision text,p_confirm boolean,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; proposal agentstudio.agent_collaboration_proposals%ROWTYPE; receipt agentstudio.agent_collaboration_receipts%ROWTYPE;
  input_sha text; result jsonb; selected_grant bigint; prior_kind text; prior_reference text; prior_note text;
BEGIN
  IF actor IS NULL OR NOT agentstudio.collaboration_native_active(actor) THEN RAISE EXCEPTION 'agent_collaboration_actor_unavailable'; END IF;
  IF p_proposal IS NULL OR p_request IS NULL OR p_confirm IS DISTINCT FROM true OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR
    p_decision IS NULL OR p_decision NOT IN('accept','reject') OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_proposal_sha IS NULL OR p_proposal_sha!~'^[a-f0-9]{64}$' OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_collaboration_review'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,45));
  SELECT id,owner_user_id,revision,spec INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_not_found'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('spec',p_spec,'proposal',p_proposal,'revision',p_revision,'source',p_source_sha,'proposal_sha256',p_proposal_sha,
    'decision',p_decision,'confirm',p_confirm,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.spec_id<>p_spec OR receipt.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_collaboration_request_conflict'; END IF;
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  IF s.revision<>p_revision OR p_source_sha IS DISTINCT FROM agentstudio.collaboration_source_sha(p_spec) THEN RAISE EXCEPTION 'agent_collaboration_source_changed'; END IF;
  SELECT * INTO proposal FROM agentstudio.agent_collaboration_proposals WHERE id=p_proposal AND spec_id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF proposal.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_proposal_not_found'; END IF;
  IF proposal.status<>'pending' OR p_proposal_sha IS DISTINCT FROM agentstudio.collaboration_proposal_sha(p_proposal) THEN RAISE EXCEPTION 'agent_collaboration_proposal_changed'; END IF;
  IF p_decision='accept' THEN
    SELECT revision INTO selected_grant FROM agentstudio.agent_collaboration_grants WHERE spec_id=p_spec AND owner_user_id=actor AND recipient_id=proposal.author_user_id AND active AND role='editor' FOR UPDATE;
    IF selected_grant IS DISTINCT FROM proposal.grant_revision OR NOT agentstudio.collaboration_native_active(proposal.author_user_id) THEN RAISE EXCEPTION 'agent_collaboration_author_revoked'; END IF;
    IF proposal.base_revision<>s.revision OR proposal.base_sha256 IS DISTINCT FROM p_source_sha THEN RAISE EXCEPTION 'agent_collaboration_source_changed'; END IF;
    IF agentstudio.collaboration_safe_text(proposal.proposed) IS DISTINCT FROM proposal.proposed OR
      proposal.proposed-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_agent_collaboration_proposal'; END IF;
  END IF;
  UPDATE agentstudio.agent_collaboration_proposals SET status=CASE WHEN p_decision='accept' THEN 'accepted' ELSE 'rejected' END,reviewed_at=clock_timestamp(),reviewer_user_id=actor WHERE id=p_proposal;
  IF p_decision='accept' THEN
    prior_kind=current_setting('agentstudio.collaboration_kind',true);prior_reference=current_setting('agentstudio.collaboration_reference',true);prior_note=current_setting('agentstudio.collaboration_note',true);
    PERFORM set_config('agentstudio.collaboration_kind','accept',true),set_config('agentstudio.collaboration_reference',p_proposal::text,true),
      set_config('agentstudio.collaboration_note','Owner accepted a reviewed collaborative proposal',true);
    UPDATE agentstudio.agent_specs SET spec=spec||proposal.proposed,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_spec AND owner_user_id=actor RETURNING revision INTO s.revision;
    PERFORM set_config('agentstudio.collaboration_kind',coalesce(prior_kind,''),true),set_config('agentstudio.collaboration_reference',coalesce(prior_reference,''),true),set_config('agentstudio.collaboration_note',coalesce(prior_note,''),true);
  END IF;
  result=jsonb_build_object('spec_id',p_spec,'proposal_id',p_proposal,'status',CASE WHEN p_decision='accept' THEN 'accepted' ELSE 'rejected' END,'revision',s.revision,
    'source_sha256',agentstudio.collaboration_source_sha(p_spec),'request_id',p_request);
  INSERT INTO agentstudio.agent_collaboration_receipts(actor_user_id,request_id,spec_id,request_sha256,input_sha256,result) VALUES(actor,p_request,p_spec,p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.collaboration.'||p_decision,'agent_spec',p_spec::text,'succeeded',jsonb_build_object('proposal_id',p_proposal,'revision',s.revision,'request_id',p_request));
  RETURN result||jsonb_build_object('replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_collaboration_restore(p_spec uuid,p_version uuid,p_revision bigint,p_source_sha text,p_reason text,p_confirm boolean,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; version agentstudio.agent_collaboration_revisions%ROWTYPE; receipt agentstudio.agent_collaboration_receipts%ROWTYPE;
  input_sha text; result jsonb; prior_kind text; prior_reference text; prior_note text;
BEGIN
  IF actor IS NULL OR NOT agentstudio.collaboration_native_active(actor) THEN RAISE EXCEPTION 'agent_collaboration_actor_unavailable'; END IF;
  IF p_version IS NULL OR p_request IS NULL OR p_confirm IS DISTINCT FROM true OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR
    p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR
    agentstudio.collaboration_utf16_length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'invalid_agent_collaboration_restore'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,45));
  SELECT id,owner_user_id,revision,spec INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_not_found'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('spec',p_spec,'version',p_version,'revision',p_revision,'source',p_source_sha,'reason',btrim(p_reason),'confirm',p_confirm,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM agentstudio.agent_collaboration_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.spec_id<>p_spec OR receipt.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_collaboration_request_conflict'; END IF;
    RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
  IF s.revision<>p_revision OR p_source_sha IS DISTINCT FROM agentstudio.collaboration_source_sha(p_spec) THEN RAISE EXCEPTION 'agent_collaboration_source_changed'; END IF;
  SELECT * INTO version FROM agentstudio.agent_collaboration_revisions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor;
  IF version.id IS NULL THEN RAISE EXCEPTION 'agent_collaboration_revision_not_found'; END IF;
  IF agentstudio.collaboration_safe_text(version.safe_spec) IS DISTINCT FROM version.safe_spec OR
    version.safe_spec-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_agent_collaboration_revision'; END IF;
  prior_kind=current_setting('agentstudio.collaboration_kind',true);prior_reference=current_setting('agentstudio.collaboration_reference',true);prior_note=current_setting('agentstudio.collaboration_note',true);
  PERFORM set_config('agentstudio.collaboration_kind','restore',true),set_config('agentstudio.collaboration_reference',p_version::text,true),set_config('agentstudio.collaboration_note',btrim(p_reason),true);
  UPDATE agentstudio.agent_specs SET spec=spec||version.safe_spec,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_spec AND owner_user_id=actor RETURNING revision INTO s.revision;
  PERFORM set_config('agentstudio.collaboration_kind',coalesce(prior_kind,''),true),set_config('agentstudio.collaboration_reference',coalesce(prior_reference,''),true),set_config('agentstudio.collaboration_note',coalesce(prior_note,''),true);
  result=jsonb_build_object('spec_id',p_spec,'source_revision_id',p_version,'revision',s.revision,'source_sha256',agentstudio.collaboration_source_sha(p_spec),'request_id',p_request);
  INSERT INTO agentstudio.agent_collaboration_receipts(actor_user_id,request_id,spec_id,request_sha256,input_sha256,result) VALUES(actor,p_request,p_spec,p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.collaboration.restore','agent_spec',p_spec::text,'succeeded',jsonb_build_object('source_revision_id',p_version,'revision',s.revision,'request_id',p_request));
  RETURN result||jsonb_build_object('replayed',false);
END $fn$;
ALTER TABLE agentstudio.agent_collaboration_proposals ADD CONSTRAINT ck_agent_collaboration_proposed_text CHECK(coalesce(
  agentstudio.collaboration_safe_text(proposed)=proposed AND proposed-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']='{}'::jsonb AND
  agentstudio.collaboration_utf16_length(agentstudio.collaboration_compact_json(proposed))<=23000,false));
ALTER TABLE agentstudio.agent_collaboration_revisions ADD CONSTRAINT ck_agent_collaboration_revision_text CHECK(coalesce(
  agentstudio.collaboration_safe_text(safe_spec)=safe_spec AND safe_spec-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']='{}'::jsonb,false));

-- Exact ownership and execute grants; the startup audit also runs with
-- collaboration writes disabled.
DO $functions$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'agentstudio.collaboration_native_active(uuid)','agentstudio.collaboration_utf16_length(text)','agentstudio.collaboration_safe_text(jsonb)',
    'agentstudio.collaboration_source_sha(uuid)','agentstudio.collaboration_role(uuid,uuid)',
    'agentstudio.collaboration_compact_json(jsonb)','agentstudio.collaboration_proposal_sha(uuid)',
    'agentstudio.collaboration_record_spec_edit()','agentstudio.agent_collaboration_revisions(uuid)',
    'agentstudio.agent_collaboration_review(uuid,uuid,bigint,text,text,text,boolean,uuid,text)',
    'agentstudio.agent_collaboration_restore(uuid,uuid,bigint,text,text,boolean,uuid,text)',
    'agentstudio.agent_collaboration_list()','agentstudio.agent_collaboration_detail(uuid)',
    'agentstudio.agent_collaboration_grant(uuid,uuid,text,bigint,uuid,text)','agentstudio.agent_collaboration_receipt(uuid,uuid)',
    'agentstudio.agent_collaboration_propose(uuid,bigint,text,jsonb,text,uuid,text)',
    'agentstudio.agent_collaboration_edit(uuid,bigint,text,jsonb,uuid,text)'] LOOP
    EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO agentstudio_collaboration';
    EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_collaboration_list(),agentstudio.agent_collaboration_detail(uuid),agentstudio.agent_collaboration_grant(uuid,uuid,text,bigint,uuid,text),agentstudio.agent_collaboration_receipt(uuid,uuid) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.agent_collaboration_propose(uuid,bigint,text,jsonb,text,uuid,text) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.agent_collaboration_revisions(uuid) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.agent_collaboration_edit(uuid,bigint,text,jsonb,uuid,text) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.agent_collaboration_review(uuid,uuid,bigint,text,text,text,boolean,uuid,text),
  agentstudio.agent_collaboration_restore(uuid,uuid,bigint,text,text,boolean,uuid,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_045','Native Agent collaboration safe-text foundation; no execution delegation');
COMMIT;
