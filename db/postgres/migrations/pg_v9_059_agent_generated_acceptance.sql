-- Optional generated complete-five optimize -> genuine055 configuration bridge.
-- No HTTP mounting, provider execution, default initializer or production GO.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole AND rolsuper)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_058')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_059')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('agentstudio.agent_opinion_body(uuid,text,text)') AND proowner=current_user::regrole)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE left(relname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE left(proname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE left(typname,16)='agent_generated_' OR left(typname,17)='_agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE left(conname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE left(tgname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE left(polname,16)='agent_generated_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
  THEN RAISE EXCEPTION 'agent_generated_installation_refused'; END IF;
END $check$;

CREATE TABLE agentstudio.agent_generated_acceptances(
  owner_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  review_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  target_run_id uuid NOT NULL,
  anchor_run_id uuid NOT NULL,
  anchor_feedback_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_protocol text NOT NULL,
  review_request_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  content_sha256 text NOT NULL,
  result_sha256 text NOT NULL,
  completion_sha256 text NOT NULL,
  source_owner_epoch bigint NOT NULL,
  acceptance_owner_epoch bigint NOT NULL,
  before_spec_revision bigint NOT NULL,
  after_spec_revision bigint NOT NULL,
  before_spec_sha256 text NOT NULL,
  after_spec_sha256 text NOT NULL,
  before_revision_id uuid NOT NULL,
  after_revision_id uuid NOT NULL,
  candidate_sha256 text NOT NULL,
  preview_sha256 text NOT NULL,
  request_sha256 text NOT NULL,
  feedback_sources_sha256 text NOT NULL,
  changed_keys jsonb NOT NULL,
  receipt_sha256 text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT agent_generated_acceptances_pkey PRIMARY KEY(owner_user_id,request_id),
  CONSTRAINT agent_generated_acceptances_review_key UNIQUE(owner_user_id,review_id),
  CONSTRAINT agent_generated_acceptances_kind_ck CHECK(source_kind = 'generated_opinion'),
  CONSTRAINT agent_generated_acceptances_protocol_ck CHECK(source_protocol = 'employee_statement_anchor_v1'),
  CONSTRAINT agent_generated_acceptances_hashes_ck CHECK(review_request_sha256 ~ '^[a-f0-9]{64}$' AND input_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256 ~ '^[a-f0-9]{64}$' AND result_sha256 ~ '^[a-f0-9]{64}$' AND completion_sha256 ~ '^[a-f0-9]{64}$' AND before_spec_sha256 ~ '^[a-f0-9]{64}$' AND after_spec_sha256 ~ '^[a-f0-9]{64}$' AND candidate_sha256 ~ '^[a-f0-9]{64}$' AND preview_sha256 ~ '^[a-f0-9]{64}$' AND request_sha256 ~ '^[a-f0-9]{64}$' AND feedback_sources_sha256 ~ '^[a-f0-9]{64}$' AND receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT agent_generated_acceptances_epochs_ck CHECK(source_owner_epoch BETWEEN 1 AND 9007199254740989 AND acceptance_owner_epoch = source_owner_epoch),
  CONSTRAINT agent_generated_acceptances_revisions_ck CHECK(before_spec_revision BETWEEN 1 AND 9007199254740989 AND after_spec_revision = before_spec_revision+1),
  CONSTRAINT agent_generated_acceptances_ids_ck CHECK(request_id <> review_id AND request_id <> anchor_feedback_id AND before_revision_id <> after_revision_id),
  CONSTRAINT agent_generated_acceptances_keys_ck CHECK(CASE WHEN jsonb_typeof(changed_keys)='array' THEN jsonb_array_length(changed_keys) BETWEEN 1 AND 5 AND changed_keys <@ '["goal","task_scope","deliverables","task_plan","done_criteria"]'::jsonb ELSE false END),
  CONSTRAINT agent_generated_acceptances_link_fk FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_optimization_links(owner_user_id,request_id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT agent_generated_acceptances_review_fk FOREIGN KEY(owner_user_id,review_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT agent_generated_acceptances_outcome_fk FOREIGN KEY(owner_user_id,review_id) REFERENCES agentstudio.agent_assessment_outcomes(owner_user_id,request_id) ON UPDATE NO ACTION ON DELETE RESTRICT
);
ALTER TABLE agentstudio.agent_generated_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_generated_acceptances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_generated_acceptances FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_collaboration;

CREATE TABLE agentstudio.agent_generated_feedback_refs(
  owner_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  source_ordinal integer NOT NULL,
  run_id uuid NOT NULL,
  feedback_id uuid NOT NULL,
  feedback_sha256 text NOT NULL,
  feedback_revision bigint NOT NULL,
  feedback_source_sha256 text NOT NULL,
  statement_sha256 text NOT NULL,
  CONSTRAINT agent_generated_feedback_refs_pkey PRIMARY KEY(owner_user_id,request_id,source_ordinal),
  CONSTRAINT agent_generated_feedback_refs_feedback_key UNIQUE(owner_user_id,request_id,feedback_id),
  CONSTRAINT agent_generated_feedback_refs_run_key UNIQUE(owner_user_id,request_id,run_id),
  CONSTRAINT agent_generated_feedback_refs_ordinal_ck CHECK(source_ordinal BETWEEN 1 AND 8),
  CONSTRAINT agent_generated_feedback_refs_revision_ck CHECK(feedback_revision BETWEEN 1 AND 9007199254740989),
  CONSTRAINT agent_generated_feedback_refs_hashes_ck CHECK(feedback_sha256 ~ '^[a-f0-9]{64}$' AND feedback_source_sha256 ~ '^[a-f0-9]{64}$' AND statement_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT agent_generated_feedback_refs_acceptance_fk FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_generated_acceptances(owner_user_id,request_id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT agent_generated_feedback_refs_feedback_fk FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT agent_generated_feedback_refs_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE NO ACTION ON DELETE RESTRICT
);
ALTER TABLE agentstudio.agent_generated_feedback_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_generated_feedback_refs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_generated_feedback_refs FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_collaboration;

CREATE FUNCTION agentstudio.agent_generated_receipt(uuid,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; epoch bigint; w record; link_row record; intent_row record; paid record; outcome record;
  before_history record; after_history record; ref record; refs jsonb:='[]'::jsonb; anchor jsonb;
  source jsonb; before_description jsonb; after_description jsonb; preview jsonb; core jsonb; digest text;
  keys jsonb:='[]'::jsonb; field_name text; previous_run uuid; previous_feedback uuid; ordinal integer:=0;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'native_employee_identity_required'; END IF;
  BEGIN owner:=agentstudio.actor_id();epoch:=agentstudio.agent_memory_outcome_epoch();
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'native_employee_identity_required'; END;
  IF owner IS NULL OR epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'native_employee_identity_required'; END IF;
  IF $1 IS NULL OR $2 IS NULL OR $2 NOT IN('request','review') THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  IF $2='request' THEN
    SELECT * INTO w FROM agentstudio.agent_generated_acceptances WHERE owner_user_id=owner AND request_id=$1;
  ELSE
    SELECT * INTO w FROM agentstudio.agent_generated_acceptances WHERE owner_user_id=owner AND review_id=$1;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Immutable receipt verification only: no current role/source/body/epoch
  -- equality, no input/output/feedback-body read and no request mutex.
  SELECT * INTO link_row FROM agentstudio.agent_optimization_links WHERE owner_user_id=owner AND request_id=w.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  SELECT * INTO intent_row FROM agentstudio.agent_optimization_intents WHERE owner_user_id=owner AND request_id=w.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  IF w.source_kind<>'generated_opinion' OR w.source_protocol<>'employee_statement_anchor_v1'
    OR w.source_owner_epoch NOT BETWEEN 1 AND 9007199254740989 OR w.acceptance_owner_epoch<>w.source_owner_epoch
    OR w.before_spec_revision NOT BETWEEN 1 AND 9007199254740989 OR w.after_spec_revision<>w.before_spec_revision+1
    OR link_row.spec_id<>w.spec_id OR link_row.run_id<>w.anchor_run_id OR link_row.feedback_id<>w.anchor_feedback_id
    OR link_row.before_spec_revision<>w.before_spec_revision OR link_row.after_spec_revision<>w.after_spec_revision
    OR link_row.before_spec_sha256<>w.before_spec_sha256 OR link_row.after_spec_sha256<>w.after_spec_sha256
    OR link_row.before_revision_id<>w.before_revision_id OR link_row.after_revision_id<>w.after_revision_id
    OR link_row.candidate_sha256<>w.candidate_sha256 OR link_row.request_sha256<>w.request_sha256
    OR link_row.owner_epoch<>w.acceptance_owner_epoch OR link_row.changed_keys IS DISTINCT FROM w.changed_keys
    OR intent_row.spec_id<>w.spec_id OR intent_row.run_id<>w.anchor_run_id OR intent_row.feedback_id<>w.anchor_feedback_id
    OR intent_row.feedback_sha256<>link_row.feedback_sha256 OR intent_row.feedback_revision<>link_row.feedback_revision
    OR intent_row.feedback_source_sha256<>link_row.feedback_source_sha256 OR intent_row.owner_epoch<>w.acceptance_owner_epoch
    OR intent_row.before_spec_revision<>w.before_spec_revision OR intent_row.before_spec_sha256<>w.before_spec_sha256
    OR intent_row.candidate_sha256<>w.candidate_sha256 OR intent_row.request_sha256<>w.request_sha256
    OR intent_row.transaction_id !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  SELECT * INTO paid FROM agentstudio.agent_review_requests WHERE owner_user_id=owner AND request_id=w.review_id;
  IF NOT FOUND OR paid.purpose<>'optimize' OR paid.spec_id<>w.spec_id OR paid.run_id<>w.target_run_id
    OR paid.request_sha256<>w.review_request_sha256 OR paid.input_sha256<>w.input_sha256 OR paid.content_sha256<>w.content_sha256
    OR paid.owner_epoch<>w.source_owner_epoch OR paid.source_protocol<>w.source_protocol THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  SELECT * INTO outcome FROM agentstudio.agent_assessment_outcomes WHERE owner_user_id=owner AND request_id=w.review_id;
  IF NOT FOUND OR outcome.status<>'succeeded' OR outcome.failure_code IS NOT NULL
    OR outcome.result_sha256 IS DISTINCT FROM w.result_sha256 OR outcome.completion_sha256<>w.completion_sha256
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  SELECT * INTO before_history FROM agentstudio.agent_collaboration_revisions WHERE id=w.before_revision_id;
  IF NOT FOUND OR before_history.owner_user_id<>owner OR before_history.actor_user_id<>owner OR before_history.spec_id<>w.spec_id
    OR before_history.kind<>'before_edit' OR before_history.spec_revision<>w.before_spec_revision OR before_history.source_sha256<>w.before_spec_sha256
    OR before_history.source_revision_id IS NOT NULL OR before_history.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  SELECT * INTO after_history FROM agentstudio.agent_collaboration_revisions WHERE id=w.after_revision_id;
  IF NOT FOUND OR after_history.owner_user_id<>owner OR after_history.actor_user_id<>owner OR after_history.spec_id<>w.spec_id
    OR after_history.kind<>'edited' OR after_history.spec_revision<>w.after_spec_revision OR after_history.source_sha256<>w.after_spec_sha256
    OR after_history.source_revision_id IS NOT NULL OR after_history.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  before_description:=before_history.safe_spec;after_description:=after_history.safe_spec;
  IF jsonb_typeof(before_description) IS DISTINCT FROM 'object' OR jsonb_typeof(after_description) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  IF (jsonb_typeof(before_description)='object' AND jsonb_typeof(after_description)='object'
    AND (SELECT count(*) FROM jsonb_object_keys(before_description))=5 AND (SELECT count(*) FROM jsonb_object_keys(after_description))=5
    AND before_description-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']='{}'::jsonb
    AND after_description-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']='{}'::jsonb
    AND agentstudio.agent_assessment_result_valid('optimize',jsonb_build_object('descriptive',before_description,'tools_note','','rationale','Descriptor validation'))
    AND agentstudio.agent_assessment_result_valid('optimize',jsonb_build_object('descriptive',after_description,'tools_note','','rationale','Descriptor validation'))) IS NOT TRUE
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  FOREACH field_name IN ARRAY ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'] LOOP
    IF before_description->field_name IS DISTINCT FROM after_description->field_name THEN keys:=keys||jsonb_build_array(field_name); END IF;
  END LOOP;
  IF jsonb_array_length(keys)=0 OR keys IS DISTINCT FROM w.changed_keys THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  FOR ref IN SELECT f.*,r.spec_id AS actual_spec,r.run_id AS actual_run,r.action AS actual_action,
      r.feedback_sha256 AS actual_hash,r.revision AS actual_revision,r.source_sha256 AS actual_source,r.statement_sha256 AS actual_statement
    FROM agentstudio.agent_generated_feedback_refs f LEFT JOIN agentstudio.agent_feedback_receipts r
      ON r.owner_user_id=f.owner_user_id AND r.request_id=f.feedback_id
    WHERE f.owner_user_id=owner AND f.request_id=w.request_id ORDER BY f.source_ordinal LOOP
    ordinal:=ordinal+1;
    IF ordinal>8 OR ref.source_ordinal<>ordinal OR ref.actual_spec IS DISTINCT FROM w.spec_id OR ref.actual_run IS DISTINCT FROM ref.run_id
      OR ref.actual_action IS DISTINCT FROM 'submit' OR ref.actual_hash IS DISTINCT FROM ref.feedback_sha256
      OR ref.actual_revision IS DISTINCT FROM ref.feedback_revision OR ref.actual_source IS DISTINCT FROM ref.feedback_source_sha256
      OR ref.actual_statement IS DISTINCT FROM ref.statement_sha256 OR ref.feedback_revision NOT BETWEEN 1 AND 9007199254740989
      OR ref.feedback_id=w.request_id OR previous_run IS NOT NULL AND (ref.run_id,ref.feedback_id)<=(previous_run,previous_feedback)
    THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
    IF ordinal=1 THEN
      anchor:=jsonb_build_object('run_id',ref.run_id,'feedback_id',ref.feedback_id);
      IF ref.run_id<>w.anchor_run_id OR ref.feedback_id<>w.anchor_feedback_id OR ref.feedback_sha256<>link_row.feedback_sha256
        OR ref.feedback_revision<>link_row.feedback_revision OR ref.feedback_source_sha256<>link_row.feedback_source_sha256
      THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
    END IF;
    refs:=refs||jsonb_build_array(jsonb_build_object('run_id',ref.run_id,'feedback_id',ref.feedback_id,'feedback_sha256',ref.feedback_sha256,
      'feedback_revision',ref.feedback_revision,'feedback_source_sha256',ref.feedback_source_sha256,'statement_sha256',ref.statement_sha256));
    previous_run:=ref.run_id;previous_feedback:=ref.feedback_id;
  END LOOP;
  IF ordinal=0 OR (SELECT count(DISTINCT value->>'run_id') FROM jsonb_array_elements(refs))<>ordinal
    OR (SELECT count(DISTINCT value->>'feedback_id') FROM jsonb_array_elements(refs))<>ordinal
    OR agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_generated_feedback_set_v1','sources',refs))<>w.feedback_sources_sha256
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  source:=jsonb_build_object('review_id',w.review_id,'spec_id',w.spec_id,'target_run_id',w.target_run_id,'review_request_sha256',w.review_request_sha256,
    'input_sha256',w.input_sha256,'content_sha256',w.content_sha256,'result_sha256',w.result_sha256,'completion_sha256',w.completion_sha256,
    'source_owner_epoch',w.source_owner_epoch,'source_protocol',w.source_protocol);
  preview:=jsonb_build_object('protocol','agent_generated_preview_binding_v1','source',source,'feedback_sources',refs,
    'feedback_sources_sha256',w.feedback_sources_sha256,'anchor',anchor,
    'before',jsonb_build_object('revision',w.before_spec_revision,'source_sha256',w.before_spec_sha256,'descriptive',before_description),
    'candidate',jsonb_build_object('descriptive',after_description,'candidate_sha256',w.candidate_sha256),'changed_keys',keys);
  IF agentstudio.agent_review_digest(preview)<>w.preview_sha256 THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  -- Reconstruct original immutable14 only to verify its NEW digest, never to
  -- submit/retry it or reconstruct any paid review input/body.
  digest:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_generated_accept_intent_v1','action','accept','request_id',w.request_id,
    'review_id',w.review_id,'spec_id',w.spec_id,'target_run_id',w.target_run_id,'anchor_run_id',w.anchor_run_id,'anchor_feedback_id',w.anchor_feedback_id,
    'expected_preview_sha256',w.preview_sha256,'expected_result_sha256',w.result_sha256,'expected_spec_revision',w.before_spec_revision,
    'expected_spec_sha256',w.before_spec_sha256,'expected_candidate_sha256',w.candidate_sha256,'confirm',true,
    'acceptance_acknowledgement','APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'));
  IF digest<>w.request_sha256 THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  core:=jsonb_build_object('protocol','agent_generated_acceptance_receipt_v1','source_kind','generated_opinion','request_id',w.request_id,
    'request_sha256',w.request_sha256,'source',source,'feedback_sources',refs,'feedback_sources_sha256',w.feedback_sources_sha256,'anchor',anchor,
    'before',jsonb_build_object('revision',w.before_spec_revision,'source_sha256',w.before_spec_sha256,'revision_id',w.before_revision_id),
    'after',jsonb_build_object('revision',w.after_spec_revision,'source_sha256',w.after_spec_sha256,'revision_id',w.after_revision_id),
    'candidate_sha256',w.candidate_sha256,'changed_keys',keys,'preview_sha256',w.preview_sha256,'acceptance_owner_epoch',w.acceptance_owner_epoch,
    'created_at',to_char(w.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  IF agentstudio.agent_review_digest(core)<>w.receipt_sha256 THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  RETURN core||jsonb_build_object('receipt_sha256',w.receipt_sha256,'recorded',true,'replayed',true);
END $fn$;

CREATE FUNCTION agentstudio.agent_generated_accept(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; epoch bigint; v jsonb; rid uuid; review_id uuid; sid uuid; target_run uuid; anchor_run uuid; anchor_feedback uuid;
  request_hash text; old jsonb; a jsonb; choice jsonb; binding jsonb; task record; role_row record; model record; fb record; link_row record; intent_row record;
  source_ref jsonb; locked_run uuid; refs jsonb:='[]'::jsonb; anchor jsonb; source jsonb; body jsonb; result jsonb;
  before_description jsonb; candidate jsonb; changed jsonb:='[]'::jsonb; field_name text; candidate_hash text; feedback_hash text; preview_hash text;
  before_hash text; core jsonb; receipt_hash text; stamp timestamptz; got jsonb; updated record; prior_kind text; prior_reference text; prior_note text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'native_employee_identity_required'; END IF;
  BEGIN owner:=agentstudio.actor_id();epoch:=agentstudio.agent_memory_outcome_epoch();
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'native_employee_identity_required'; END;
  v:=$1;
  IF owner IS NULL OR epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'native_employee_identity_required'; END IF;
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  IF (jsonb_typeof(v)='object' AND (SELECT count(*) FROM jsonb_object_keys(v))=14
    AND v-ARRAY['action','request_id','review_id','spec_id','target_run_id','anchor_run_id','anchor_feedback_id','expected_preview_sha256','expected_result_sha256','expected_spec_revision','expected_spec_sha256','expected_candidate_sha256','confirm','acceptance_acknowledgement']='{}'::jsonb
    AND v->>'action'='accept' AND v->'confirm'='true'::jsonb AND v->>'acceptance_acknowledgement'='APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'
    AND jsonb_typeof(v->'expected_spec_revision')='number' AND v->>'expected_spec_revision' ~ '^[1-9][0-9]*$'
    AND (v->>'expected_spec_revision')::numeric BETWEEN 1 AND 9007199254740989) IS NOT TRUE
  THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  FOREACH field_name IN ARRAY ARRAY['request_id','review_id','spec_id','target_run_id','anchor_run_id','anchor_feedback_id'] LOOP
    IF (jsonb_typeof(v->field_name)='string' AND v->>field_name ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  END LOOP;
  FOREACH field_name IN ARRAY ARRAY['expected_preview_sha256','expected_result_sha256','expected_spec_sha256','expected_candidate_sha256'] LOOP
    IF (jsonb_typeof(v->field_name)='string' AND v->>field_name ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  END LOOP;
  rid:=(v->>'request_id')::uuid;review_id:=(v->>'review_id')::uuid;sid:=(v->>'spec_id')::uuid;
  target_run:=(v->>'target_run_id')::uuid;anchor_run:=(v->>'anchor_run_id')::uuid;anchor_feedback:=(v->>'anchor_feedback_id')::uuid;
  IF rid=review_id OR rid=anchor_feedback THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
  request_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_generated_accept_intent_v1')||v);
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||rid::text,551));
  old:=agentstudio.agent_generated_receipt(rid,'request');
  IF old IS NOT NULL THEN
    IF old->>'request_sha256'<>request_hash THEN RAISE EXCEPTION 'agent_generated_request_conflict'; END IF;
    RETURN old;
  END IF;
  IF EXISTS(SELECT 1 FROM agentstudio.agent_optimization_intents WHERE owner_user_id=owner AND request_id=rid)
    OR EXISTS(SELECT 1 FROM agentstudio.agent_optimization_links WHERE owner_user_id=owner AND request_id=rid)
  THEN RAISE EXCEPTION 'agent_generated_request_conflict'; END IF;
  IF agentstudio.agent_generated_receipt(review_id,'review') IS NOT NULL THEN RAISE EXCEPTION 'agent_generated_review_already_accepted'; END IF;
  a:=agentstudio.agent_opinion_anchor(review_id);choice:=a->'choice';
  IF a->>'spec_id'<>sid::text OR a->>'run_id'<>target_run::text OR a->>'purpose'<>'optimize' THEN RAISE EXCEPTION 'agent_generated_review_not_found'; END IF;
  IF a->'owner_epoch' IS DISTINCT FROM to_jsonb(epoch) OR a->>'job_state'<>'pending' OR a->'body_erased'<>'false'::jsonb
    OR a->>'lease_state'<>'succeeded' OR a->'outcome'->>'status'<>'succeeded' OR jsonb_typeof(choice) IS DISTINCT FROM 'object'
    OR choice->'evaluation_sources'<>'[]'::jsonb OR jsonb_array_length(choice->'feedback_sources') NOT BETWEEN 1 AND 8
    OR a->'outcome'->>'result_sha256'<>v->>'expected_result_sha256'
  THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  -- Direct SQL callers establish exactly the same ordering as the real Node
  -- same-client kernel. No request/input/output lock precedes complete540.
  FOR locked_run IN SELECT DISTINCT id FROM (SELECT target_run AS id UNION ALL
      SELECT (value->>'run_id')::uuid FROM jsonb_array_elements(choice->'feedback_sources')) s ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||locked_run::text,540));
  END LOOP;
  IF agentstudio.agent_generated_receipt(review_id,'review') IS NOT NULL THEN RAISE EXCEPTION 'agent_generated_review_already_accepted'; END IF;
  SELECT * INTO task FROM agentstudio.runs WHERE id=target_run AND owner_user_id=owner AND agent_spec_id=sid AND kind='agent'
    AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  SELECT * INTO role_row FROM agentstudio.agent_specs WHERE id=sid AND owner_user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_role_changed'; END IF;
  before_hash:=agentstudio.agent_optimization_role_sha(sid,owner,role_row.name,role_row.revision,role_row.spec);
  IF role_row.revision<>(v->>'expected_spec_revision')::bigint OR before_hash<>v->>'expected_spec_sha256'
    OR role_row.revision<>(choice->>'expected_spec_revision')::bigint OR before_hash<>choice->>'expected_spec_sha256'
    OR role_row.requires_approval IS DISTINCT FROM true OR role_row.spec->'require_approval' IS DISTINCT FROM 'true'::jsonb
  THEN RAISE EXCEPTION 'agent_generated_role_changed'; END IF;
  IF a->>'source_protocol'<>'employee_statement_anchor_v1' OR choice->>'expected_source_sha256' IS DISTINCT FROM
    agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_review_statement_anchor_v1','owner',owner,'spec_id',sid,'run_id',target_run,
      'status',task.status,'finished_at',to_char(task.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  binding:=choice->'model_binding';
  SELECT * INTO model FROM agentstudio.model_connections WHERE id=(binding->>'connection_id')::uuid AND owner_user_id=owner FOR SHARE;
  IF NOT FOUND OR model.enabled IS DISTINCT FROM true OR model.status<>'ok' OR model.revision<>(binding->>'connection_revision')::bigint
    OR NOT model.models ? (binding->>'model_id') OR model.base_url IS DISTINCT FROM CASE model.provider
      WHEN 'openai' THEN 'https://api.openai.com/v1' WHEN 'anthropic' THEN 'https://api.anthropic.com/v1'
      WHEN 'gemini' THEN 'https://generativelanguage.googleapis.com/v1beta' ELSE NULL END
  THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  FOR source_ref IN SELECT value FROM jsonb_array_elements(choice->'feedback_sources')
      ORDER BY (value->>'run_id')::uuid,(value->>'feedback_id')::uuid LOOP
    IF source_ref->>'feedback_id'=rid::text THEN RAISE EXCEPTION 'invalid_agent_generated_request'; END IF;
    -- All source540 locks already pin feedback writers. Match the actual
    -- terminal task as frozen Source/055 do, without adding a new row lock
    -- below a Node kernel's already-held protected body locks.
    PERFORM 1 FROM agentstudio.runs WHERE id=(source_ref->>'run_id')::uuid AND owner_user_id=owner AND agent_spec_id=sid AND kind='agent'
      AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_feedback_changed'; END IF;
    SELECT r.* INTO fb FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b
      ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id
      WHERE r.owner_user_id=owner AND r.request_id=(source_ref->>'feedback_id')::uuid AND r.spec_id=sid
        AND r.run_id=(source_ref->>'run_id')::uuid AND r.action='submit' AND r.feedback_sha256=source_ref->>'feedback_sha256'
        AND r.revision BETWEEN 1 AND 9007199254740989
        AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256
        AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=owner AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision);
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_generated_feedback_changed'; END IF;
    refs:=refs||jsonb_build_array(jsonb_build_object('run_id',fb.run_id,'feedback_id',fb.request_id,'feedback_sha256',fb.feedback_sha256,
      'feedback_revision',fb.revision,'feedback_source_sha256',fb.source_sha256,'statement_sha256',fb.statement_sha256));
  END LOOP;
  anchor:=jsonb_build_object('run_id',refs->0->'run_id','feedback_id',refs->0->'feedback_id');
  IF refs->0->>'run_id'<>anchor_run::text OR refs->0->>'feedback_id'<>anchor_feedback::text THEN RAISE EXCEPTION 'agent_generated_feedback_changed'; END IF;
  body:=agentstudio.agent_opinion_body(review_id,a->>'input_sha256',v->>'expected_result_sha256');result:=body->'result';
  IF body->>'purpose'<>'optimize' OR jsonb_typeof(result->'descriptive') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(result->'descriptive'))<>5
    OR result->'descriptive'-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']<>'{}'::jsonb
  THEN RAISE EXCEPTION 'agent_generated_complete_output_required'; END IF;
  before_description:=agentstudio.collaboration_safe_text(role_row.spec);
  candidate:=(role_row.spec-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'])||(result->'descriptive');
  IF before_description IS NULL OR agentstudio.collaboration_safe_text(candidate) IS DISTINCT FROM result->'descriptive'
    OR candidate-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'] IS DISTINCT FROM role_row.spec-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']
  THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  FOREACH field_name IN ARRAY ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'] LOOP
    IF before_description->field_name IS DISTINCT FROM result->'descriptive'->field_name THEN changed:=changed||jsonb_build_array(field_name); END IF;
  END LOOP;
  IF jsonb_array_length(changed)=0 THEN RAISE EXCEPTION 'agent_generated_change_required'; END IF;
  candidate_hash:=agentstudio.agent_optimization_candidate_sha(role_row.name,candidate);
  feedback_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_generated_feedback_set_v1','sources',refs));
  source:=jsonb_build_object('review_id',review_id,'spec_id',sid,'target_run_id',target_run,'review_request_sha256',a->'request_sha256',
    'input_sha256',a->'input_sha256','content_sha256',a->'content_sha256','result_sha256',v->'expected_result_sha256',
    'completion_sha256',a->'outcome'->'completion_sha256','source_owner_epoch',epoch,'source_protocol','employee_statement_anchor_v1');
  preview_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_generated_preview_binding_v1','source',source,'feedback_sources',refs,
    'feedback_sources_sha256',feedback_hash,'anchor',anchor,
    'before',jsonb_build_object('revision',role_row.revision,'source_sha256',before_hash,'descriptive',before_description),
    'candidate',jsonb_build_object('descriptive',result->'descriptive','candidate_sha256',candidate_hash),'changed_keys',changed));
  IF candidate_hash<>v->>'expected_candidate_sha256' OR preview_hash<>v->>'expected_preview_sha256' THEN RAISE EXCEPTION 'agent_generated_source_unavailable'; END IF;
  INSERT INTO agentstudio.agent_optimization_intents(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,
      before_spec_revision,before_spec_sha256,candidate_sha256,request_sha256)
    VALUES(owner,rid,sid,anchor_run,anchor_feedback,refs->0->>'feedback_sha256',role_row.revision,before_hash,candidate_hash,request_hash);
  SELECT * INTO intent_row FROM agentstudio.agent_optimization_intents WHERE owner_user_id=owner AND request_id=rid;
  IF NOT FOUND OR intent_row.transaction_id<>pg_current_xact_id()::text OR intent_row.owner_epoch<>epoch
    OR intent_row.feedback_revision<>(refs->0->>'feedback_revision')::bigint OR intent_row.feedback_source_sha256<>refs->0->>'feedback_source_sha256'
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  prior_kind:=current_setting('agentstudio.collaboration_kind',true);prior_reference:=current_setting('agentstudio.collaboration_reference',true);prior_note:=current_setting('agentstudio.collaboration_note',true);
  PERFORM set_config('agentstudio.collaboration_kind','',true),set_config('agentstudio.collaboration_reference','',true),set_config('agentstudio.collaboration_note','',true);
  UPDATE agentstudio.agent_specs SET spec=candidate,revision=revision+1,updated_at=clock_timestamp()
    WHERE id=sid AND owner_user_id=owner AND revision=role_row.revision RETURNING * INTO updated;
  IF NOT FOUND OR updated.name IS DISTINCT FROM role_row.name OR updated.requires_approval IS DISTINCT FROM role_row.requires_approval
    OR updated.spec IS DISTINCT FROM candidate THEN RAISE EXCEPTION 'agent_generated_role_changed'; END IF;
  PERFORM set_config('agentstudio.collaboration_kind',coalesce(prior_kind,''),true),set_config('agentstudio.collaboration_reference',coalesce(prior_reference,''),true),set_config('agentstudio.collaboration_note',coalesce(prior_note,''),true);
  SELECT * INTO link_row FROM agentstudio.agent_optimization_links WHERE owner_user_id=owner AND request_id=rid;
  IF NOT FOUND OR link_row.spec_id<>sid OR link_row.run_id<>anchor_run OR link_row.feedback_id<>anchor_feedback
    OR link_row.before_spec_revision<>role_row.revision OR link_row.after_spec_revision<>role_row.revision+1
    OR link_row.before_spec_sha256<>before_hash OR link_row.after_spec_sha256<>agentstudio.agent_optimization_role_sha(sid,owner,updated.name,updated.revision,updated.spec)
    OR link_row.request_sha256<>request_hash OR link_row.candidate_sha256<>candidate_hash OR link_row.changed_keys IS DISTINCT FROM changed
    OR link_row.owner_epoch<>epoch OR link_row.feedback_sha256<>refs->0->>'feedback_sha256'
    OR link_row.feedback_revision<>(refs->0->>'feedback_revision')::bigint OR link_row.feedback_source_sha256<>refs->0->>'feedback_source_sha256'
  THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  stamp:=clock_timestamp();
  core:=jsonb_build_object('protocol','agent_generated_acceptance_receipt_v1','source_kind','generated_opinion','request_id',rid,'request_sha256',request_hash,
    'source',source,'feedback_sources',refs,'feedback_sources_sha256',feedback_hash,'anchor',anchor,
    'before',jsonb_build_object('revision',link_row.before_spec_revision,'source_sha256',link_row.before_spec_sha256,'revision_id',link_row.before_revision_id),
    'after',jsonb_build_object('revision',link_row.after_spec_revision,'source_sha256',link_row.after_spec_sha256,'revision_id',link_row.after_revision_id),
    'candidate_sha256',candidate_hash,'changed_keys',changed,'preview_sha256',preview_hash,'acceptance_owner_epoch',epoch,
    'created_at',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  receipt_hash:=agentstudio.agent_review_digest(core);
  INSERT INTO agentstudio.agent_generated_acceptances(owner_user_id,request_id,review_id,spec_id,target_run_id,anchor_run_id,anchor_feedback_id,
    source_kind,source_protocol,review_request_sha256,input_sha256,content_sha256,result_sha256,completion_sha256,source_owner_epoch,acceptance_owner_epoch,
    before_spec_revision,after_spec_revision,before_spec_sha256,after_spec_sha256,before_revision_id,after_revision_id,candidate_sha256,preview_sha256,
    request_sha256,feedback_sources_sha256,changed_keys,receipt_sha256,created_at)
  VALUES(owner,rid,review_id,sid,target_run,anchor_run,anchor_feedback,'generated_opinion','employee_statement_anchor_v1',a->>'request_sha256',
    a->>'input_sha256',a->>'content_sha256',v->>'expected_result_sha256',a->'outcome'->>'completion_sha256',epoch,epoch,
    link_row.before_spec_revision,link_row.after_spec_revision,link_row.before_spec_sha256,link_row.after_spec_sha256,link_row.before_revision_id,
    link_row.after_revision_id,candidate_hash,preview_hash,request_hash,feedback_hash,changed,receipt_hash,stamp);
  INSERT INTO agentstudio.agent_generated_feedback_refs(owner_user_id,request_id,source_ordinal,run_id,feedback_id,feedback_sha256,
    feedback_revision,feedback_source_sha256,statement_sha256)
  SELECT owner,rid,ordinal::integer,(value->>'run_id')::uuid,(value->>'feedback_id')::uuid,value->>'feedback_sha256',
    (value->>'feedback_revision')::bigint,value->>'feedback_source_sha256',value->>'statement_sha256'
    FROM jsonb_array_elements(refs) WITH ORDINALITY AS r(value,ordinal);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,target_run,'agent.generated_acceptance','agent_spec',sid::text,'succeeded',
      jsonb_build_object('request_id',rid,'review_id',review_id,'target_run_id',target_run,'anchor_run_id',anchor_run,'anchor_feedback_id',anchor_feedback,
        'request_sha256',request_hash,'receipt_sha256',receipt_hash,'result_sha256',v->'expected_result_sha256','completion_sha256',a->'outcome'->'completion_sha256',
        'candidate_sha256',candidate_hash,'before_revision_id',link_row.before_revision_id,'after_revision_id',link_row.after_revision_id,'changed_keys',changed));
  got:=agentstudio.agent_generated_receipt(rid,'request');
  IF got IS NULL OR got->>'receipt_sha256'<>receipt_hash THEN RAISE EXCEPTION 'agent_generated_unavailable'; END IF;
  RETURN got||jsonb_build_object('replayed',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'invalid_agent_generated_request';
  WHEN unique_violation THEN RAISE EXCEPTION 'agent_generated_request_conflict';
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IN('agent_opinion_not_found') THEN RAISE EXCEPTION 'agent_generated_review_not_found';
    ELSIF SQLERRM IN('agent_opinion_source_unavailable','agent_optimization_feedback_changed') THEN RAISE EXCEPTION 'agent_generated_source_unavailable';
    ELSIF SQLERRM IN('agent_opinion_native_employee_required') THEN RAISE EXCEPTION 'native_employee_identity_required';
    ELSE RAISE; END IF;
END $fn$;

REVOKE ALL ON FUNCTION agentstudio.agent_generated_accept(jsonb),agentstudio.agent_generated_receipt(uuid,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,
    agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_collaboration;
GRANT EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb),agentstudio.agent_generated_receipt(uuid,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v9_059','Optional complete-five generated optimization accepted as genuine055 owner configuration with permanent hash-only provenance; no provider or mounting');
COMMIT;
