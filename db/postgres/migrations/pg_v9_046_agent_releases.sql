-- DRAFT foundation: not in the fresh source sequence and no046 receipt yet.
-- Mutation functions, provenance, privilege audit and UI must be completed
-- before this file can become a reviewed migration. No service is enabled.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_045') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_releases') THEN
    RAISE EXCEPTION 'agent_releases_require_reviewed_045_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_releases NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_releases;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_releases;
CREATE FUNCTION agentstudio.release_utf16_length(p_text text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(p_text,'')c WHERE c<>''
$fn$;
CREATE TABLE agentstudio.agent_release_heads(
  spec_id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,
  next_version_no bigint NOT NULL DEFAULT 1 CHECK(next_version_no BETWEEN 1 AND 9007199254740991),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  active_version_id uuid,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE TABLE agentstudio.agent_release_versions(
  id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,
  version_no bigint NOT NULL CHECK(version_no BETWEEN 1 AND 9007199254740990),
  spec_revision bigint NOT NULL CHECK(spec_revision BETWEEN 1 AND 9007199254740990),
  source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
  name_snapshot text NOT NULL CHECK(btrim(name_snapshot)<>'' AND agentstudio.release_utf16_length(name_snapshot)<=120),
  spec_snapshot jsonb NOT NULL CHECK(octet_length(spec_snapshot::text)<=524288),
  note text NOT NULL CHECK(agentstudio.release_utf16_length(note)<=500),
  test_run_id uuid,test_passed boolean NOT NULL DEFAULT false,test_model_binding jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived','deleted')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),published_at timestamptz,deleted_at timestamptz,
  UNIQUE(id,spec_id,owner_user_id),UNIQUE(spec_id,version_no),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id),
  FOREIGN KEY(test_run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
  CHECK(NOT test_passed OR test_run_id IS NOT NULL),
  CHECK((status IN('published','archived'))=(published_at IS NOT NULL)),CHECK((status='deleted')=(deleted_at IS NOT NULL)),
  CHECK(coalesce(jsonb_typeof(spec_snapshot)='object' AND spec_snapshot->'require_approval'='true'::jsonb AND jsonb_typeof(spec_snapshot->'goal')='string' AND
    spec_snapshot-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria','tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval']='{}'::jsonb,false)),
  CHECK(test_model_binding IS NULL OR coalesce(jsonb_typeof(test_model_binding)='object' AND
    test_model_binding-ARRAY['connection_id','connection_revision','model_id']='{}'::jsonb AND
    jsonb_typeof(test_model_binding->'connection_id')='string' AND (test_model_binding->>'connection_id')~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
    jsonb_typeof(test_model_binding->'connection_revision')='number' AND (test_model_binding->>'connection_revision')~'^[1-9][0-9]{0,15}$' AND
    (test_model_binding->>'connection_revision')::numeric<9007199254740991 AND jsonb_typeof(test_model_binding->'model_id')='string' AND
    (test_model_binding->>'model_id')~'^[A-Za-z0-9._:/-]{1,120}$',false))
);
CREATE UNIQUE INDEX ux_agent_release_published ON agentstudio.agent_release_versions(spec_id) WHERE status='published';
ALTER TABLE agentstudio.agent_release_heads ADD CONSTRAINT fk_agent_release_active FOREIGN KEY(active_version_id,spec_id,owner_user_id)
  REFERENCES agentstudio.agent_release_versions(id,spec_id,owner_user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE agentstudio.agent_release_acceptance_runs(
  run_id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,request_id uuid NOT NULL,
  spec_revision bigint NOT NULL CHECK(spec_revision BETWEEN 1 AND 9007199254740990),
  source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
  instruction_sha256 text NOT NULL CHECK(instruction_sha256~'^[a-f0-9]{64}$'),
  max_steps integer NOT NULL CHECK(max_steps BETWEEN 1 AND 30),selected_model_binding jsonb NOT NULL CHECK(coalesce(jsonb_typeof(selected_model_binding)='object' AND
    selected_model_binding-ARRAY['connection_id','connection_revision','model_id']='{}'::jsonb AND jsonb_typeof(selected_model_binding->'connection_id')='string' AND
    (selected_model_binding->>'connection_id')~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
    jsonb_typeof(selected_model_binding->'connection_revision')='number' AND (selected_model_binding->>'connection_revision')~'^[1-9][0-9]{0,15}$' AND
    (selected_model_binding->>'connection_revision')::numeric<9007199254740991 AND jsonb_typeof(selected_model_binding->'model_id')='string' AND
    (selected_model_binding->>'model_id')~'^[A-Za-z0-9._:/-]{1,120}$',false)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(owner_user_id,request_id),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE TABLE agentstudio.agent_release_receipts(
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),request_id uuid NOT NULL,spec_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('snapshot','publish','restore','delete_draft','acceptance')),
  request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),
  result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_user_id,request_id)
);
DO $tables$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['agent_release_heads','agent_release_versions','agent_release_acceptance_runs','agent_release_receipts'] LOOP
    EXECUTE 'REVOKE ALL ON agentstudio.'||t||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT ON agentstudio.'||t||' TO agentstudio_releases';
    EXECUTE 'CREATE POLICY release_private ON agentstudio.'||t||' TO agentstudio_releases USING(true) WITH CHECK(true)';
  END LOOP;
END $tables$;
GRANT SELECT(id,owner_user_id,name,spec,revision) ON agentstudio.agent_specs TO agentstudio_releases;
GRANT SELECT(id,owner_user_id,kind,agent_spec_id,status,instruction,checkpoint) ON agentstudio.runs TO agentstudio_releases;
GRANT SELECT(id,status,external_issuer,external_subject) ON agentstudio.users TO agentstudio_releases;
GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_releases;
CREATE POLICY release_specs ON agentstudio.agent_specs TO agentstudio_releases USING(true);
CREATE POLICY release_runs ON agentstudio.runs TO agentstudio_releases USING(true);
CREATE POLICY release_users ON agentstudio.users TO agentstudio_releases USING(true);
CREATE POLICY release_accounts ON agentstudio_auth.accounts TO agentstudio_releases USING(true);
GRANT INSERT(spec_id,owner_user_id) ON agentstudio.agent_release_heads TO agentstudio_releases;
GRANT UPDATE(next_version_no,updated_at) ON agentstudio.agent_release_heads TO agentstudio_releases;
GRANT UPDATE(active_version_id,revision) ON agentstudio.agent_release_heads TO agentstudio_releases;
GRANT UPDATE(status,revision,updated_at,published_at) ON agentstudio.agent_release_versions TO agentstudio_releases;
GRANT UPDATE(deleted_at) ON agentstudio.agent_release_versions TO agentstudio_releases;
GRANT INSERT(id,owner_user_id,spec_id,version_no,spec_revision,source_sha256,name_snapshot,spec_snapshot,note) ON agentstudio.agent_release_versions TO agentstudio_releases;
GRANT INSERT(test_run_id,test_passed,test_model_binding) ON agentstudio.agent_release_versions TO agentstudio_releases;
GRANT INSERT(run_id,owner_user_id,spec_id,request_id,spec_revision,source_sha256,instruction_sha256,max_steps,selected_model_binding) ON agentstudio.agent_release_acceptance_runs TO agentstudio_releases;
GRANT INSERT(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result) ON agentstudio.agent_release_receipts TO agentstudio_releases;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_releases;
CREATE POLICY release_audit ON agentstudio.audit_events FOR INSERT TO agentstudio_releases WITH CHECK(true);
CREATE FUNCTION agentstudio.release_native_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT EXISTS(SELECT 1 FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id
    WHERE u.id=p_user AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled)
$fn$;
CREATE FUNCTION agentstudio.release_source_seal(p_id uuid,p_owner uuid,p_name text,p_revision bigint,p_spec jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',p_id,'owner',p_owner,'name',p_name,'revision',p_revision,'spec',p_spec)::text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION agentstudio.release_source_sha(p_spec uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.release_source_seal(id,owner_user_id,name,revision,spec) FROM agentstudio.agent_specs WHERE id=p_spec
$fn$;
CREATE FUNCTION agentstudio.release_version_sha(p_version uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',id,'owner',owner_user_id,'spec_id',spec_id,'version_no',version_no,'spec_revision',spec_revision,
    'source_sha256',source_sha256,'name',name_snapshot,'spec',spec_snapshot,'note',note,'test_run_id',test_run_id,'test_passed',test_passed,'test_model_binding',test_model_binding,
    'created_epoch',extract(epoch FROM created_at))::text,'UTF8')),'hex') FROM agentstudio.agent_release_versions WHERE id=p_version
$fn$;
CREATE FUNCTION agentstudio.release_version_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); mutable text[]=ARRAY['status','revision','updated_at','published_at','deleted_at'];
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'agent_release_version_retained'; END IF;
  IF to_jsonb(NEW)-mutable IS DISTINCT FROM to_jsonb(OLD)-mutable THEN RAISE EXCEPTION 'agent_release_snapshot_immutable'; END IF;
  IF to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF actor IS DISTINCT FROM OLD.owner_user_id OR NOT agentstudio.release_native_active(actor) OR NEW.revision<>OLD.revision+1 OR NOT
    (OLD.status='draft' AND NEW.status IN('published','deleted') OR OLD.status='published' AND NEW.status='archived' OR OLD.status='archived' AND NEW.status='published') THEN
    RAISE EXCEPTION 'agent_release_unsafe_status_change'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER native_agent_release_immutable BEFORE UPDATE OR DELETE ON agentstudio.agent_release_versions FOR EACH ROW EXECUTE FUNCTION agentstudio.release_version_immutable();
CREATE FUNCTION agentstudio.agent_release_workspace(p_spec uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; h record;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RETURN NULL; END IF;
  SELECT id,name,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  SELECT revision,next_version_no,active_version_id INTO h FROM agentstudio.agent_release_heads WHERE spec_id=p_spec AND owner_user_id=actor;
  RETURN jsonb_build_object('spec_id',s.id,'name',s.name,'spec_revision',s.revision,'source_sha256',agentstudio.release_source_sha(p_spec),
    'release_revision',coalesce(h.revision,1),'next_version_no',coalesce(h.next_version_no,1),'active_version_id',h.active_version_id,
    'acceptance_runs',coalesce((SELECT jsonb_agg(a.value ORDER BY a.created_at DESC) FROM (SELECT a.created_at,jsonb_build_object('run_id',a.run_id,'spec_revision',a.spec_revision,
      'source_sha256',a.source_sha256,'max_steps',a.max_steps,'status',r.status,'created_at',a.created_at) AS value FROM agentstudio.agent_release_acceptance_runs a
      JOIN agentstudio.runs r ON r.id=a.run_id AND r.owner_user_id=a.owner_user_id WHERE a.spec_id=p_spec AND a.owner_user_id=actor ORDER BY a.created_at DESC LIMIT 10)a),'[]'::jsonb),
    'versions',coalesce((SELECT jsonb_agg(v.value ORDER BY v.version_no DESC) FROM (SELECT version_no,jsonb_build_object('id',id,'version_no',version_no,'spec_revision',spec_revision,
      'source_sha256',source_sha256,'version_sha256',agentstudio.release_version_sha(id),'name',name_snapshot,'note',note,'test_run_id',test_run_id,'test_passed',test_passed,
      'status',status,'revision',revision,'created_at',created_at,'published_at',published_at) AS value FROM agentstudio.agent_release_versions
      WHERE spec_id=p_spec AND owner_user_id=actor AND status<>'deleted' ORDER BY version_no DESC LIMIT 100)v),'[]'::jsonb));
END $fn$;
CREATE FUNCTION agentstudio.agent_release_detail(p_spec uuid,p_version uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('id',v.id,'spec_id',v.spec_id,'version_no',v.version_no,'spec_revision',v.spec_revision,'source_sha256',v.source_sha256,
    'version_sha256',agentstudio.release_version_sha(v.id),'name',v.name_snapshot,'spec_snapshot',v.spec_snapshot,'note',v.note,'test_run_id',v.test_run_id,
    'test_passed',v.test_passed,'test_model_binding',v.test_model_binding,'status',v.status,'revision',v.revision,'created_at',v.created_at,'published_at',v.published_at)
  FROM agentstudio.agent_release_versions v JOIN agentstudio.agent_specs s ON s.id=v.spec_id AND s.owner_user_id=v.owner_user_id
  WHERE v.id=p_version AND v.spec_id=p_spec AND v.owner_user_id=agentstudio.actor_id() AND v.status<>'deleted' AND agentstudio.release_native_active(v.owner_user_id)
$fn$;
CREATE FUNCTION agentstudio.agent_release_receipt(p_spec uuid,p_request uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('request_sha256',request_sha256,'result',result||jsonb_build_object('replayed',true)) FROM agentstudio.agent_release_receipts
  WHERE actor_user_id=agentstudio.actor_id() AND request_id=p_request AND spec_id=p_spec AND agentstudio.release_native_active(actor_user_id)
$fn$;
-- Knowledge evidence is validated under the API actor immediately before the
-- metadata helper. No release helper receives private observation access or
-- extra EXECUTE grants on the separately audited knowledge helpers.
CREATE FUNCTION agentstudio.release_test_checked(p_spec uuid,p_run uuid,p_source_sha text,p_kind text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(t->>'actor'=agentstudio.actor_id()::text AND t->>'spec'=p_spec::text AND t->>'run'=p_run::text AND
    t->>'source_sha256'=p_source_sha AND t->>'kind'=p_kind AND t->>'transaction'=txid_current()::text,false)
  FROM (SELECT nullif(current_setting('agentstudio.release_checked_test',true),'')::jsonb AS t)q
$fn$;
CREATE FUNCTION agentstudio.agent_release_acceptance_status(p_spec uuid,p_run uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('spec_id',a.spec_id,'run_id',a.run_id,'spec_revision',a.spec_revision,'source_sha256',a.source_sha256,
    'instruction_sha256',a.instruction_sha256,'max_steps',a.max_steps,'model_binding',a.selected_model_binding,'status',r.status,'created_at',a.created_at)
  FROM agentstudio.agent_release_acceptance_runs a JOIN agentstudio.runs r ON r.id=a.run_id AND r.owner_user_id=a.owner_user_id
    JOIN agentstudio.agent_specs s ON s.id=a.spec_id AND s.owner_user_id=a.owner_user_id
  WHERE a.spec_id=p_spec AND a.run_id=p_run AND a.owner_user_id=agentstudio.actor_id() AND agentstudio.release_native_active(a.owner_user_id)
$fn$;
CREATE FUNCTION agentstudio.agent_release_acceptance(p_spec uuid,p_run uuid,p_revision bigint,p_source_sha text,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; r record; previous agentstudio.agent_release_receipts%ROWTYPE; input_sha text; binding jsonb; rounds integer; result jsonb;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  IF p_spec IS NULL OR p_run IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_release_acceptance'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('action','acceptance','spec',p_spec,'run',p_run,'spec_revision',p_revision,'source_sha256',p_source_sha,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,46));
  SELECT * INTO previous FROM agentstudio.agent_release_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF previous.request_id IS NOT NULL THEN
    IF previous.spec_id<>p_spec OR previous.action<>'acceptance' OR previous.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_release_request_conflict'; END IF;
    RETURN previous.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_release_not_found'; END IF;
  IF s.revision<>p_revision OR agentstudio.release_source_seal(s.id,s.owner_user_id,s.name,s.revision,s.spec) IS DISTINCT FROM p_source_sha THEN RAISE EXCEPTION 'agent_release_source_changed'; END IF;
  SELECT id,kind,agent_spec_id,status,instruction,checkpoint INTO r FROM agentstudio.runs WHERE id=p_run AND owner_user_id=actor;
  IF r.id IS NULL OR r.kind<>'agent' OR r.agent_spec_id IS DISTINCT FROM p_spec OR r.status<>'queued' OR
    r.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2' OR r.checkpoint->>'stage' IS DISTINCT FROM 'agent_v2_queued' OR
    r.checkpoint->>'spec_revision' IS DISTINCT FROM p_revision::text OR
    r.checkpoint#>'{graph,nodes,1,data,agent_binding}' IS DISTINCT FROM jsonb_build_object('spec_id',p_spec,'spec_revision',p_revision) OR
    jsonb_typeof(r.checkpoint#>'{graph,nodes,1,data,model_binding}') IS DISTINCT FROM 'object' OR
    NOT coalesce((r.checkpoint#>>'{graph,nodes,1,data,max_steps}')~'^[1-9][0-9]?$',false) THEN RAISE EXCEPTION 'agent_release_acceptance_unavailable'; END IF;
  rounds=(r.checkpoint#>>'{graph,nodes,1,data,max_steps}')::integer;binding=r.checkpoint#>'{graph,nodes,1,data,model_binding}';
  IF rounds NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'agent_release_acceptance_unavailable'; END IF;
  INSERT INTO agentstudio.agent_release_acceptance_runs(run_id,owner_user_id,spec_id,request_id,spec_revision,source_sha256,instruction_sha256,max_steps,selected_model_binding)
    VALUES(p_run,actor,p_spec,p_request,p_revision,p_source_sha,encode(sha256(convert_to(r.instruction,'UTF8')),'hex'),rounds,binding);
  result=jsonb_build_object('spec_id',p_spec,'request_id',p_request,'run_id',p_run,'spec_revision',p_revision,'source_sha256',p_source_sha,'status','queued','replayed',false);
  INSERT INTO agentstudio.agent_release_receipts(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result)
    VALUES(actor,p_request,p_spec,'acceptance',p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.release.acceptance','agent_spec',p_spec::text,'succeeded',jsonb_build_object('run_id',p_run,'spec_revision',p_revision,'source_sha256',p_source_sha,'max_steps',rounds));
  RETURN result;
END $fn$;
CREATE FUNCTION agentstudio.agent_release_snapshot(p_spec uuid,p_revision bigint,p_source_sha text,p_note text,p_test_run uuid,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; h record; acceptance record; previous agentstudio.agent_release_receipts%ROWTYPE; input_sha text; version_id uuid; result jsonb; tested boolean=false; test_binding jsonb;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  IF p_spec IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_note IS NULL OR agentstudio.release_utf16_length(p_note)>500 OR p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_agent_release_snapshot'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('action','snapshot','spec',p_spec,'revision',p_revision,'source_sha256',p_source_sha,'note',p_note,'test_run_id',p_test_run,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,46));
  SELECT * INTO previous FROM agentstudio.agent_release_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF previous.request_id IS NOT NULL THEN
    IF previous.spec_id<>p_spec OR previous.action<>'snapshot' OR previous.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_release_request_conflict'; END IF;
    RETURN previous.result||jsonb_build_object('replayed',true);
  END IF;
  -- Freeze payload and seal from ONE MVCC tuple. Snapshotting does not mutate
  -- the live role and must not gain UPDATE merely to take a source row lock.
  SELECT id,owner_user_id,name,spec,revision,agentstudio.release_source_seal(id,owner_user_id,name,revision,spec) AS sha INTO s
    FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_release_not_found'; END IF;
  IF s.revision<>p_revision OR s.sha IS DISTINCT FROM p_source_sha THEN RAISE EXCEPTION 'agent_release_source_changed'; END IF;
  IF p_test_run IS NOT NULL THEN
    SELECT a.spec_revision,a.source_sha256,a.selected_model_binding,r.status INTO acceptance FROM agentstudio.agent_release_acceptance_runs a
      JOIN agentstudio.runs r ON r.id=a.run_id AND r.owner_user_id=a.owner_user_id WHERE a.run_id=p_test_run AND a.spec_id=p_spec AND a.owner_user_id=actor;
    IF acceptance.spec_revision IS NULL OR acceptance.spec_revision<>s.revision OR acceptance.source_sha256 IS DISTINCT FROM s.sha OR acceptance.status<>'succeeded' OR
      NOT agentstudio.release_test_checked(p_spec,p_test_run,s.sha,'snapshot') THEN RAISE EXCEPTION 'agent_release_acceptance_unavailable'; END IF;
    tested=true;test_binding=acceptance.selected_model_binding;
  END IF;
  INSERT INTO agentstudio.agent_release_heads(spec_id,owner_user_id) VALUES(p_spec,actor) ON CONFLICT(spec_id) DO NOTHING;
  SELECT * INTO h FROM agentstudio.agent_release_heads WHERE spec_id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF h.spec_id IS NULL THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  IF h.next_version_no>=9007199254740991 THEN RAISE EXCEPTION 'agent_release_counter_exhausted'; END IF;
  version_id=gen_random_uuid();
  INSERT INTO agentstudio.agent_release_versions(id,owner_user_id,spec_id,version_no,spec_revision,source_sha256,name_snapshot,spec_snapshot,note,test_run_id,test_passed,test_model_binding)
    VALUES(version_id,actor,p_spec,h.next_version_no,s.revision,s.sha,s.name,s.spec,p_note,p_test_run,tested,test_binding);
  UPDATE agentstudio.agent_release_heads SET next_version_no=next_version_no+1,updated_at=clock_timestamp() WHERE spec_id=p_spec AND owner_user_id=actor;
  result=jsonb_build_object('spec_id',p_spec,'request_id',p_request,'version_id',version_id,'version_no',h.next_version_no,'version_revision',1,
    'version_sha256',agentstudio.release_version_sha(version_id),'release_revision',h.revision,'source_sha256',s.sha,'status','draft','test_passed',tested,'replayed',false);
  INSERT INTO agentstudio.agent_release_receipts(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result)
    VALUES(actor,p_request,p_spec,'snapshot',p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.release.snapshot','agent_spec',p_spec::text,'succeeded',jsonb_build_object('version_id',version_id,'version_no',h.next_version_no,'spec_revision',s.revision,'source_sha256',s.sha,'test_passed',tested));
  RETURN result;
END $fn$;
CREATE FUNCTION agentstudio.agent_release_publish(p_spec uuid,p_version uuid,p_spec_revision bigint,p_source_sha text,p_version_sha text,p_version_revision bigint,
  p_release_revision bigint,p_confirm boolean,p_ack_untested boolean,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; h record; v record; current_id uuid; previous agentstudio.agent_release_receipts%ROWTYPE; input_sha text; result jsonb; already boolean;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  IF p_spec IS NULL OR p_version IS NULL OR p_spec_revision IS NULL OR p_spec_revision<1 OR p_spec_revision>=9007199254740991 OR p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR
    p_version_sha IS NULL OR p_version_sha!~'^[a-f0-9]{64}$' OR p_version_revision IS NULL OR p_version_revision<1 OR p_version_revision>=9007199254740991 OR
    p_release_revision IS NULL OR p_release_revision<1 OR p_release_revision>=9007199254740991 OR p_confirm IS DISTINCT FROM true OR p_ack_untested IS NULL OR
    p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_release_publish'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('action','publish','spec',p_spec,'version',p_version,'spec_revision',p_spec_revision,'source_sha256',p_source_sha,
    'version_sha256',p_version_sha,'version_revision',p_version_revision,'release_revision',p_release_revision,'confirm',p_confirm,'acknowledge_untested',p_ack_untested,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,46));
  SELECT * INTO previous FROM agentstudio.agent_release_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF previous.request_id IS NOT NULL THEN
    IF previous.spec_id<>p_spec OR previous.action<>'publish' OR previous.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_release_request_conflict'; END IF;
    RETURN previous.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT id,revision,agentstudio.release_source_seal(id,owner_user_id,name,revision,spec) AS sha INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_release_not_found'; END IF;
  IF s.revision<>p_spec_revision OR s.sha IS DISTINCT FROM p_source_sha THEN RAISE EXCEPTION 'agent_release_source_changed'; END IF;
  SELECT * INTO h FROM agentstudio.agent_release_heads WHERE spec_id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF h.spec_id IS NULL OR h.revision<>p_release_revision THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor AND status<>'deleted' FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'agent_release_version_not_found'; END IF;
  IF v.revision<>p_version_revision OR agentstudio.release_version_sha(v.id) IS DISTINCT FROM p_version_sha THEN RAISE EXCEPTION 'agent_release_version_changed'; END IF;
  IF NOT p_ack_untested AND (NOT v.test_passed OR NOT agentstudio.release_test_checked(p_spec,v.test_run_id,v.source_sha256,'publish')) THEN RAISE EXCEPTION 'agent_release_untested_ack_required'; END IF;
  SELECT id INTO current_id FROM agentstudio.agent_release_versions WHERE spec_id=p_spec AND owner_user_id=actor AND status='published' FOR UPDATE;
  IF h.active_version_id IS DISTINCT FROM current_id THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  already=v.status='published';
  IF NOT already THEN
    IF current_id IS NOT NULL THEN
      UPDATE agentstudio.agent_release_versions SET status='archived',revision=revision+1,updated_at=clock_timestamp() WHERE id=current_id AND owner_user_id=actor;
    END IF;
    UPDATE agentstudio.agent_release_versions SET status='published',revision=revision+1,published_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=p_version AND owner_user_id=actor RETURNING revision INTO v.revision;
    UPDATE agentstudio.agent_release_heads SET active_version_id=p_version,revision=revision+1,updated_at=clock_timestamp()
      WHERE spec_id=p_spec AND owner_user_id=actor RETURNING revision INTO h.revision;
  END IF;
  result=jsonb_build_object('spec_id',p_spec,'request_id',p_request,'version_id',p_version,'version_no',v.version_no,'version_revision',v.revision,
    'version_sha256',p_version_sha,'release_revision',h.revision,'source_sha256',s.sha,'status','published','already_published',already,'replayed',false);
  INSERT INTO agentstudio.agent_release_receipts(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result)
    VALUES(actor,p_request,p_spec,'publish',p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,CASE WHEN already THEN 'agent.release.publish_confirmed' ELSE 'agent.release.publish' END,'agent_spec',p_spec::text,'succeeded',
      jsonb_build_object('version_id',p_version,'previous_version_id',current_id,'release_revision',h.revision,'version_sha256',p_version_sha,'test_passed_at_save',v.test_passed,'acknowledge_untested',p_ack_untested));
  RETURN result;
END $fn$;
CREATE FUNCTION agentstudio.agent_release_delete_draft(p_spec uuid,p_version uuid,p_version_sha text,p_version_revision bigint,p_confirm boolean,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); h record; v record; previous agentstudio.agent_release_receipts%ROWTYPE; input_sha text; result jsonb;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  IF p_spec IS NULL OR p_version IS NULL OR p_version_sha IS NULL OR p_version_sha!~'^[a-f0-9]{64}$' OR p_version_revision IS NULL OR p_version_revision<1 OR
    p_version_revision>=9007199254740991 OR p_confirm IS DISTINCT FROM true OR p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_release_delete'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('action','delete_draft','spec',p_spec,'version',p_version,'version_sha256',p_version_sha,
    'version_revision',p_version_revision,'confirm',p_confirm,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,46));
  SELECT * INTO previous FROM agentstudio.agent_release_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF previous.request_id IS NOT NULL THEN
    IF previous.spec_id<>p_spec OR previous.action<>'delete_draft' OR previous.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_release_request_conflict'; END IF;
    RETURN previous.result||jsonb_build_object('replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor) THEN RAISE EXCEPTION 'agent_release_not_found'; END IF;
  SELECT * INTO h FROM agentstudio.agent_release_heads WHERE spec_id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF h.spec_id IS NULL THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor AND status<>'deleted' FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'agent_release_version_not_found'; END IF;
  IF v.revision<>p_version_revision OR agentstudio.release_version_sha(v.id) IS DISTINCT FROM p_version_sha THEN RAISE EXCEPTION 'agent_release_version_changed'; END IF;
  IF v.status<>'draft' THEN RAISE EXCEPTION 'agent_release_version_not_draft'; END IF;
  IF h.active_version_id=p_version THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  UPDATE agentstudio.agent_release_versions SET status='deleted',revision=revision+1,deleted_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=p_version AND owner_user_id=actor RETURNING revision INTO v.revision;
  result=jsonb_build_object('spec_id',p_spec,'request_id',p_request,'version_id',p_version,'version_no',v.version_no,'version_revision',v.revision,
    'version_sha256',p_version_sha,'release_revision',h.revision,'status','deleted','replayed',false);
  INSERT INTO agentstudio.agent_release_receipts(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result)
    VALUES(actor,p_request,p_spec,'delete_draft',p_request_sha,input_sha,result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.release.delete_draft','agent_spec',p_spec::text,'succeeded',jsonb_build_object('version_id',p_version,'version_no',v.version_no,'version_sha256',p_version_sha));
  RETURN result;
END $fn$;
-- The API validates current owned resources before locking the live role.
-- These helpers never receive or obtain UPDATE permission on agent_specs.
-- A transaction-local ticket binds the reviewed immutable version to the
-- exact API write; completion and its receipt roll back together on failure.
CREATE FUNCTION agentstudio.agent_release_restore_prepare(p_spec uuid,p_version uuid,p_revision bigint,p_source_sha text,p_version_sha text,
  p_version_revision bigint,p_confirm boolean,p_reason text,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); s record; h record; v record; previous agentstudio.agent_release_receipts%ROWTYPE; input_sha text; ticket jsonb;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  IF p_spec IS NULL OR p_version IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740991 OR
    p_source_sha IS NULL OR p_source_sha!~'^[a-f0-9]{64}$' OR p_version_sha IS NULL OR p_version_sha!~'^[a-f0-9]{64}$' OR
    p_version_revision IS NULL OR p_version_revision<1 OR p_version_revision>=9007199254740991 OR p_confirm IS DISTINCT FROM true OR
    p_reason IS NULL OR agentstudio.release_utf16_length(btrim(p_reason))<8 OR agentstudio.release_utf16_length(p_reason)>500 OR
    p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_agent_release_restore'; END IF;
  input_sha=encode(sha256(convert_to(jsonb_build_object('action','restore','spec',p_spec,'version',p_version,'spec_revision',p_revision,'source_sha256',p_source_sha,
    'version_sha256',p_version_sha,'version_revision',p_version_revision,'confirm',p_confirm,'reason',p_reason,'request_sha256',p_request_sha)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,46));
  SELECT * INTO previous FROM agentstudio.agent_release_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF previous.request_id IS NOT NULL THEN
    IF previous.spec_id<>p_spec OR previous.action<>'restore' OR previous.input_sha256<>input_sha THEN RAISE EXCEPTION 'agent_release_request_conflict'; END IF;
    RETURN jsonb_build_object('replayed',true,'result',previous.result||jsonb_build_object('replayed',true));
  END IF;
  SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL THEN RAISE EXCEPTION 'agent_release_not_found'; END IF;
  IF s.revision<>p_revision OR agentstudio.release_source_seal(s.id,s.owner_user_id,s.name,s.revision,s.spec) IS DISTINCT FROM p_source_sha THEN RAISE EXCEPTION 'agent_release_source_changed'; END IF;
  SELECT * INTO h FROM agentstudio.agent_release_heads WHERE spec_id=p_spec AND owner_user_id=actor FOR UPDATE;
  IF h.spec_id IS NULL THEN RAISE EXCEPTION 'agent_release_head_changed'; END IF;
  SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor AND status<>'deleted' FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'agent_release_version_not_found'; END IF;
  IF v.revision<>p_version_revision OR agentstudio.release_version_sha(v.id) IS DISTINCT FROM p_version_sha THEN RAISE EXCEPTION 'agent_release_version_changed'; END IF;
  ticket=jsonb_build_object('actor',actor,'spec',p_spec,'version',p_version,'request',p_request,'request_sha256',p_request_sha,'input_sha256',input_sha,
    'version_sha256',p_version_sha,'revision',p_revision+1,'after_sha256',agentstudio.release_source_seal(s.id,actor,v.name_snapshot,p_revision+1,v.spec_snapshot),
    'reason',p_reason,'transaction',txid_current()::text);
  PERFORM set_config('agentstudio.release_restore_ticket',ticket::text,true);
  RETURN jsonb_build_object('replayed',false,'name',v.name_snapshot,'spec_snapshot',v.spec_snapshot);
END $fn$;
CREATE FUNCTION agentstudio.agent_release_restore_finish(p_spec uuid,p_request uuid,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id(); ticket jsonb; s record; result jsonb;
BEGIN
  IF actor IS NULL OR NOT agentstudio.release_native_active(actor) THEN RAISE EXCEPTION 'agent_release_actor_unavailable'; END IF;
  ticket=nullif(current_setting('agentstudio.release_restore_ticket',true),'')::jsonb;
  IF ticket IS NULL OR p_spec IS NULL OR p_request IS NULL OR p_request_sha IS NULL OR ticket->>'actor' IS DISTINCT FROM actor::text OR
    ticket->>'spec' IS DISTINCT FROM p_spec::text OR ticket->>'request' IS DISTINCT FROM p_request::text OR ticket->>'request_sha256' IS DISTINCT FROM p_request_sha OR
    ticket->>'transaction' IS DISTINCT FROM txid_current()::text THEN RAISE EXCEPTION 'agent_release_restore_not_prepared'; END IF;
  SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
  IF s.id IS NULL OR s.revision::text IS DISTINCT FROM ticket->>'revision' OR
    agentstudio.release_source_seal(s.id,s.owner_user_id,s.name,s.revision,s.spec) IS DISTINCT FROM ticket->>'after_sha256' OR
    agentstudio.release_version_sha((ticket->>'version')::uuid) IS DISTINCT FROM ticket->>'version_sha256' THEN RAISE EXCEPTION 'agent_release_restore_write_changed'; END IF;
  result=jsonb_build_object('spec_id',p_spec,'request_id',p_request,'version_id',ticket->>'version','version_sha256',ticket->>'version_sha256',
    'spec_revision',s.revision,'source_sha256',ticket->>'after_sha256','restored',true,'replayed',false);
  INSERT INTO agentstudio.agent_release_receipts(actor_user_id,request_id,spec_id,action,request_sha256,input_sha256,result)
    VALUES(actor,p_request,p_spec,'restore',p_request_sha,ticket->>'input_sha256',result);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'agent.release.restore','agent_spec',p_spec::text,'succeeded',jsonb_build_object('version_id',ticket->>'version','version_sha256',ticket->>'version_sha256',
      'spec_revision',s.revision,'source_sha256',ticket->>'after_sha256','reason',ticket->>'reason'));
  PERFORM set_config('agentstudio.release_restore_ticket','',true);
  RETURN result;
END $fn$;
DO $functions$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY['release_utf16_length(text)','release_native_active(uuid)','release_source_seal(uuid,uuid,text,bigint,jsonb)','release_source_sha(uuid)','release_version_sha(uuid)',
    'release_version_immutable()','release_test_checked(uuid,uuid,text,text)','agent_release_workspace(uuid)','agent_release_detail(uuid,uuid)','agent_release_receipt(uuid,uuid)',
    'agent_release_acceptance(uuid,uuid,bigint,text,uuid,text)','agent_release_acceptance_status(uuid,uuid)',
    'agent_release_snapshot(uuid,bigint,text,text,uuid,uuid,text)',
    'agent_release_publish(uuid,uuid,bigint,text,text,bigint,bigint,boolean,boolean,uuid,text)',
    'agent_release_delete_draft(uuid,uuid,text,bigint,boolean,uuid,text)',
    'agent_release_restore_prepare(uuid,uuid,bigint,text,text,bigint,boolean,text,uuid,text)','agent_release_restore_finish(uuid,uuid,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_releases';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_release_workspace(uuid),agentstudio.agent_release_detail(uuid,uuid),agentstudio.agent_release_receipt(uuid,uuid),
  agentstudio.agent_release_acceptance(uuid,uuid,bigint,text,uuid,text),agentstudio.agent_release_acceptance_status(uuid,uuid),
  agentstudio.agent_release_snapshot(uuid,bigint,text,text,uuid,uuid,text),
  agentstudio.agent_release_publish(uuid,uuid,bigint,text,text,bigint,bigint,boolean,boolean,uuid,text),
  agentstudio.agent_release_delete_draft(uuid,uuid,text,bigint,boolean,uuid,text),
  agentstudio.agent_release_restore_prepare(uuid,uuid,bigint,text,text,bigint,boolean,text,uuid,text),agentstudio.agent_release_restore_finish(uuid,uuid,text) TO agentstudio_api;
-- Intentionally no pg_v9_046 receipt or HTTP/initialization entry in this draft.
COMMIT;
