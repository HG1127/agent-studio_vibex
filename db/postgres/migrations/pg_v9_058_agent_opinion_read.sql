-- Optional owner-only opinion reads. No new relation, trigger, membership,
-- provider effect, submission, default initializer or public route.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole::oid,'MEMBER'))
    OR pg_is_in_recovery() OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_057')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_058')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='agentstudio' AND p.proname='agent_assessment_finish' AND oidvectortypes(p.proargtypes)='uuid, uuid, bigint, uuid, jsonb' AND p.proowner=current_user::regrole)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND left(p.proname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (left(t.typname,14)='agent_opinion_' OR left(t.typname,15)='_agent_opinion_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE left(tgname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace WHERE n.nspname='agentstudio' AND left(x.conname,14)='agent_opinion_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(p.polname,14)='agent_opinion_')
  THEN RAISE EXCEPTION 'agent_opinion_installation_refused'; END IF;
END $check$;

CREATE FUNCTION agentstudio.agent_opinion_anchor(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; epoch bigint; review record; choice jsonb; binding jsonb; source jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END IF;
  BEGIN
    owner:=agentstudio.actor_id();epoch:=agentstudio.agent_memory_outcome_epoch();
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END;
  IF owner IS NULL OR epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END IF;
  IF $1 IS NULL THEN RAISE EXCEPTION 'agent_opinion_invalid_read'; END IF;
  -- One snapshot, with no request/input/output row locks and no540 wait. The
  -- caller must next acquire sorted source540 mutexes and resource rows before
  -- invoking body() on this same verified owner transaction.
  SELECT r.*,j.state AS job_state,l.state AS lease_state,
    CASE WHEN o.request_id IS NULL THEN NULL ELSE jsonb_build_object('status',o.status,'completion_sha256',o.completion_sha256,
      'result_sha256',o.result_sha256,'failure_code',o.failure_code,'created_at',o.created_at) END AS execution_outcome,
    EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones t WHERE t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id) AS body_erased,
    CASE WHEN r.owner_epoch=epoch AND j.state='pending' AND i.request_id IS NOT NULL AND p.request_id IS NOT NULL
      AND o.status='succeeded' AND l.state='succeeded' AND p.effect_id=o.effect_id AND o.effect_id=e.effect_id AND p.result_sha256=o.result_sha256
      AND e.worker_id=l.worker_id AND e.lease_token=l.lease_token AND e.lease_version=l.lease_version
      AND e.request_sha256=r.request_sha256 AND e.input_sha256=r.input_sha256 AND e.content_sha256=r.content_sha256
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones t WHERE t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id)
      THEN i.body->'choice' END AS offered_choice
    INTO review FROM agentstudio.agent_review_requests r
    LEFT JOIN agentstudio.agent_review_jobs j USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_review_inputs i USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_assessment_leases l USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_assessment_effects e USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_assessment_outcomes o USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_assessment_outputs p USING(owner_user_id,request_id)
    WHERE r.owner_user_id=owner AND r.request_id=$1;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_opinion_not_found'; END IF;
  IF review.job_state IS NULL OR review.job_state NOT IN('pending','cancelled','erased')
    OR review.lease_state IS NOT NULL AND review.lease_state NOT IN('claimed','reserved','paused','succeeded','failed','unknown') THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  IF review.execution_outcome IS NOT NULL AND (review.execution_outcome->>'status' IN('succeeded','failed','unknown')
    AND review.execution_outcome->>'completion_sha256' ~ '^[a-f0-9]{64}$'
    AND CASE WHEN review.execution_outcome->>'status'='succeeded' THEN review.execution_outcome->>'result_sha256' ~ '^[a-f0-9]{64}$' AND review.execution_outcome->'failure_code'='null'::jsonb
      ELSE review.execution_outcome->'result_sha256'='null'::jsonb AND review.execution_outcome->>'failure_code' ~ '^[a-z][a-z0-9_]{0,63}$' END) IS NOT TRUE
  THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  choice:=review.offered_choice;
  IF choice IS NOT NULL THEN
    BEGIN
    -- Only the stored, closed preview choice may cross this private boundary.
    -- In particular no messages, arbitrary nested keys or prior opinion body.
    IF (jsonb_typeof(choice)='object' AND choice-ARRAY['action','purpose','spec_id','run_id','expected_source_sha256','expected_spec_revision','expected_spec_sha256','model_binding','output_token_limit','feedback_sources','evaluation_sources']='{}'::jsonb
      AND (SELECT count(*) FROM jsonb_object_keys(choice))=11 AND choice->>'action'='preview' AND choice->>'purpose'=review.purpose
      AND choice->>'spec_id'=review.spec_id::text AND choice->>'run_id'=review.run_id::text
      AND jsonb_typeof(choice->'expected_source_sha256')='string' AND choice->>'expected_source_sha256' ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof(choice->'expected_spec_sha256')='string' AND choice->>'expected_spec_sha256' ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof(choice->'expected_spec_revision')='number' AND choice->>'expected_spec_revision' ~ '^[1-9][0-9]*$'
      AND (choice->>'expected_spec_revision')::numeric BETWEEN 1 AND 9007199254740989
      AND choice->'output_token_limit' IN('2048'::jsonb,'4096'::jsonb,'8192'::jsonb,'16384'::jsonb)
      AND jsonb_typeof(choice->'feedback_sources')='array' AND jsonb_array_length(choice->'feedback_sources')<=8
      AND jsonb_typeof(choice->'evaluation_sources')='array' AND jsonb_array_length(choice->'evaluation_sources')=0
      AND (review.purpose='evaluate' AND jsonb_array_length(choice->'feedback_sources')=0 OR review.purpose='optimize' AND jsonb_array_length(choice->'feedback_sources')>0)) IS NOT TRUE
    THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
    binding:=choice->'model_binding';
    IF (jsonb_typeof(binding)='object' AND binding-ARRAY['connection_id','connection_revision','model_id']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(binding))=3
      AND jsonb_typeof(binding->'connection_id')='string' AND binding->>'connection_id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      AND jsonb_typeof(binding->'connection_revision')='number' AND binding->>'connection_revision' ~ '^[1-9][0-9]*$'
      AND (binding->>'connection_revision')::numeric BETWEEN 1 AND 9007199254740989 AND jsonb_typeof(binding->'model_id')='string' AND binding->>'model_id' ~ '^[A-Za-z0-9._:/-]{1,120}$') IS NOT TRUE
    THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
    FOR source IN SELECT value FROM jsonb_array_elements(choice->'feedback_sources') LOOP
      IF (jsonb_typeof(source)='object' AND source-ARRAY['run_id','feedback_id','feedback_sha256']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(source))=3
        AND jsonb_typeof(source->'run_id')='string' AND source->>'run_id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        AND jsonb_typeof(source->'feedback_id')='string' AND source->>'feedback_id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        AND jsonb_typeof(source->'feedback_sha256')='string' AND source->>'feedback_sha256' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'feedback_id') FROM jsonb_array_elements(choice->'feedback_sources'))<>jsonb_array_length(choice->'feedback_sources')
      OR (SELECT count(DISTINCT value->>'run_id') FROM jsonb_array_elements(choice->'feedback_sources'))<>jsonb_array_length(choice->'feedback_sources') THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END;
  END IF;
  RETURN jsonb_build_object('protocol','agent_paid_review_read_anchor_v1','request_id',review.request_id,'spec_id',review.spec_id,'run_id',review.run_id,'purpose',review.purpose,
    'request_sha256',review.request_sha256,'input_sha256',review.input_sha256,'content_sha256',review.content_sha256,'owner_epoch',review.owner_epoch,'source_protocol',review.source_protocol,
    'created_at',review.created_at,'job_state',review.job_state,'lease_state',review.lease_state,'outcome',review.execution_outcome,'body_erased',review.body_erased,'choice',choice);
END $fn$;

CREATE FUNCTION agentstudio.agent_opinion_body(uuid,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; epoch bigint; review record; private_body jsonb; lease record; effect record; outcome record; output record; content_hash text; input_hash text; output_hash text; completion_hash text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END IF;
  BEGIN
    owner:=agentstudio.actor_id();epoch:=agentstudio.agent_memory_outcome_epoch();
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END;
  IF owner IS NULL OR epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_opinion_native_employee_required'; END IF;
  IF $1 IS NULL OR $2 IS NULL OR $3 IS NULL OR $2 !~ '^[a-f0-9]{64}$' OR $3 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'agent_opinion_invalid_read'; END IF;
  -- Node must already hold its epoch, sorted540 and resource locks. Never
  -- acquire540 here. Request SHARE orders with every056 control/privacy writer;
  -- alive private input/output SHARE locks additionally pin bodies to COMMIT.
  SELECT * INTO review FROM agentstudio.agent_review_requests WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_opinion_not_found'; END IF;
  IF review.owner_epoch IS DISTINCT FROM epoch OR review.input_sha256 IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  PERFORM 1 FROM agentstudio.agent_review_jobs WHERE owner_user_id=owner AND request_id=$1 AND state='pending' FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones WHERE owner_user_id=owner AND request_id=$1) THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  SELECT body INTO private_body FROM agentstudio.agent_review_inputs WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  SELECT * INTO lease FROM agentstudio.agent_assessment_leases WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND OR lease.state<>'succeeded' THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  SELECT * INTO effect FROM agentstudio.agent_assessment_effects WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND OR effect.worker_id IS DISTINCT FROM lease.worker_id OR effect.lease_token IS DISTINCT FROM lease.lease_token OR effect.lease_version IS DISTINCT FROM lease.lease_version
    OR effect.request_sha256 IS DISTINCT FROM review.request_sha256 OR effect.input_sha256 IS DISTINCT FROM review.input_sha256 OR effect.content_sha256 IS DISTINCT FROM review.content_sha256 THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  SELECT * INTO outcome FROM agentstudio.agent_assessment_outcomes WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND OR outcome.status<>'succeeded' OR outcome.effect_id IS DISTINCT FROM effect.effect_id OR outcome.result_sha256 IS DISTINCT FROM $3 OR outcome.failure_code IS NOT NULL THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  SELECT * INTO output FROM agentstudio.agent_assessment_outputs WHERE owner_user_id=owner AND request_id=$1 FOR SHARE;
  IF NOT FOUND OR output.effect_id IS DISTINCT FROM effect.effect_id OR output.result_sha256 IS DISTINCT FROM $3 THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  BEGIN
    IF (jsonb_typeof(private_body)='object' AND private_body-ARRAY['choice','messages']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(private_body))=2
      AND jsonb_typeof(private_body->'choice')='object' AND jsonb_typeof(private_body->'messages')='array' AND jsonb_array_length(private_body->'messages')=2
      AND agentstudio.agent_assessment_result_valid(review.purpose,output.result)) IS NOT TRUE THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
    content_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_input_v1','choice',private_body->'choice','messages',private_body->'messages'));
    input_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_prepared_input_v1','owner',owner,'owner_epoch',epoch,'source_protocol',review.source_protocol,'content_sha256',content_hash));
    output_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_output_v1','request_id',$1,'purpose',review.purpose,'input_sha256',$2,'result',output.result));
    completion_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_completion_v1','request_id',$1,'effect_id',effect.effect_id,'completion',jsonb_build_object('status','succeeded','result',output.result)));
    IF content_hash IS DISTINCT FROM review.content_sha256 OR input_hash IS DISTINCT FROM $2 OR output_hash IS DISTINCT FROM $3 OR completion_hash IS DISTINCT FROM outcome.completion_sha256 THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'agent_opinion_source_unavailable'; END;
  -- No prompt, stored choice, model secret, owner or Worker proof is returned.
  RETURN jsonb_build_object('request_id',$1,'purpose',review.purpose,'input_sha256',$2,'result_sha256',$3,'result',output.result);
END $fn$;

REVOKE ALL ON FUNCTION agentstudio.agent_opinion_anchor(uuid),agentstudio.agent_opinion_body(uuid,text,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_anchor(uuid),agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_058','Optional Native-owner opinion anchor and current-source transaction body read; no grants to private tables or execution activation');
COMMIT;
