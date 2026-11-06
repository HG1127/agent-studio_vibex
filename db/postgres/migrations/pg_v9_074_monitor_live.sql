-- OPTIONAL074 private source proposal: live owned monitor ledgers and fenced capture RPCs.
-- No producer/Worker/API route is enabled by installation. No company data import.
-- This source is NOT a complete monitor delivery; independent SQL/UAT approval required.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery() OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_073') OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069') OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_074')
 OR to_regprocedure('agentstudio.agent_memory_outcome_epoch()') IS NULL OR to_regprocedure('agentstudio.knowledge_query_execution_validate_run(uuid,text)') IS NULL OR to_regprocedure('agentstudio.schedule_run_current(uuid,uuid)') IS NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'monitor_live_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (starts_with(t.typname,'monitor_live_') OR starts_with(t.typname,'_monitor_live_')))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'monitor_live_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND starts_with(c.conname,'monitor_live_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'monitor_live_')) OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND starts_with(tgname,'monitor_live_')) OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'monitor_live_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN RAISE EXCEPTION 'monitor_live_preflight_refused'; END IF;
END $preflight$;
CREATE ROLE agentstudio_monitor_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_monitor_worker;
CREATE ROLE agentstudio_monitor_dispatch NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_monitor_dispatch;
CREATE FUNCTION agentstudio.monitor_live_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 BETWEEN 1 AND 9007199254740991
$fn$;
CREATE FUNCTION agentstudio.monitor_live_sha_valid(text) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 ~ '^[a-f0-9]{64}$'
$fn$;
CREATE FUNCTION agentstudio.monitor_live_json_valid(jsonb,text,text,integer) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof($1)='object' AND octet_length($2)<=$4 AND $2::jsonb=$1 AND agentstudio.monitor_live_sha_valid($3) AND encode(sha256(convert_to($2,'UTF8')),'hex')=$3,false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_cases_value_valid(text,text,jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((length($1) BETWEEN 1 AND 300 AND $2 IN('LIVE','DEMO') AND jsonb_typeof($3)='array' AND jsonb_array_length($3) BETWEEN 1 AND 20),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_cases_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_monitors_value_valid(bigint,jsonb,text,text,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 BETWEEN 1 AND 9007199254740990 AND jsonb_typeof($2)='object' AND octet_length($2::text)<=100000 AND agentstudio.monitor_live_sha_valid($3) AND agentstudio.monitor_live_sha_valid($5) AND length($4) BETWEEN 1 AND 120),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_monitors_time_valid(bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1) AND $2>=$1 AND agentstudio.monitor_live_time_valid($2)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_versions_value_valid(bigint,jsonb,text,text,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 BETWEEN 1 AND 9007199254740990 AND jsonb_typeof($2)='object' AND octet_length($2::text)<=100000 AND agentstudio.monitor_live_sha_valid($3) AND agentstudio.monitor_live_sha_valid($4) AND length($5) BETWEEN 1 AND 120),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_versions_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_checks_value_valid(bigint,bigint,text,text,text,jsonb,jsonb,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1>0 AND $2>0 AND agentstudio.monitor_live_sha_valid($3) AND agentstudio.monitor_live_sha_valid($4) AND $5 IN('collecting','freezing','analyzing','needs_review','incomplete','complete','cancelled') AND jsonb_typeof($6)='array' AND jsonb_array_length($6)<=10 AND jsonb_typeof($7)='object' AND octet_length($7::text)<=1000000 AND length($8)<=160),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_checks_lease_valid(text,uuid,bigint,bigint,bigint,bigint,bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($3 BETWEEN 0 AND 9007199254740990 AND $4 BETWEEN 0 AND 9007199254740991 AND $5 BETWEEN 0 AND 200 AND $6 BETWEEN 0 AND 200 AND $7 BETWEEN 0 AND 500 AND agentstudio.monitor_live_time_valid($8) AND (($2 IS NULL AND $1 IS NULL AND $4=0) OR ($2 IS NOT NULL AND length($1) BETWEEN 1 AND 120 AND $4>0))),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_checks_time_valid(bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1) AND $2>=$1 AND agentstudio.monitor_live_time_valid($2)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_requests_value_valid(text,text,jsonb,bigint,text,text,bigint,bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 ~ '^[A-Za-z0-9_-]{1,60}$' AND agentstudio.monitor_live_sha_valid($2) AND jsonb_typeof($3)='object' AND octet_length($3::text)<=16000 AND $4>0 AND $5 IN('started','captured','failed','ambiguous') AND length($6)<=160 AND agentstudio.monitor_live_time_valid($7) AND ($8=0 OR $8>=$7 AND agentstudio.monitor_live_time_valid($8)) AND ($9=0 OR $9>=$7 AND agentstudio.monitor_live_time_valid($9))),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_receipts_value_valid(text,text,text,jsonb,text,text,text,text,jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 ~ '^[A-Za-z0-9_:-]{1,160}$' AND $2 ~ '^[A-Za-z0-9_-]{1,60}$' AND agentstudio.monitor_live_sha_valid($3) AND agentstudio.monitor_live_json_valid($4,$5,$6,2000000) AND agentstudio.monitor_live_sha_valid($7) AND octet_length($8)<=2000000 AND encode(sha256(convert_to($8,'UTF8')),'hex')=$7 AND jsonb_typeof($9)='object'),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_receipts_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_records_value_valid(bigint,text,jsonb,jsonb,jsonb,text,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 BETWEEN 1 AND 9007199254740990 AND $2 IN('research.entity.v1','research.claim.v1','research.answer.v1','research.relation.v1') AND jsonb_typeof($3)='object' AND octet_length($3::text)<=100000 AND jsonb_typeof($4)='array' AND jsonb_array_length($4)<=50 AND jsonb_typeof($5)='array' AND jsonb_array_length($5)<=50 AND length($6) BETWEEN 1 AND 120 AND agentstudio.monitor_live_sha_valid($7)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_records_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_fact_sets_value_valid(jsonb,text,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_json_valid($1,$2,$3,16777216) AND jsonb_typeof($1->'records')='array' AND jsonb_array_length($1->'records')<=600 AND jsonb_typeof($1->'reference_records')='array' AND jsonb_array_length($1->'reference_records')<=1200),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_fact_sets_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_freeze_jobs_value_valid(jsonb,text,bigint,jsonb,jsonb,text,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((jsonb_typeof($1)='array' AND jsonb_array_length($1)<=600 AND agentstudio.monitor_live_sha_valid($2) AND $3 BETWEEN 0 AND 600 AND jsonb_typeof($4)='array' AND jsonb_array_length($4)<=600 AND jsonb_typeof($5)='array' AND jsonb_array_length($5)<=1200 AND $6 IN('pending','running','complete','failed','cancelled') AND length($7)<=160),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_freeze_jobs_time_valid(bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1) AND $2>=$1 AND agentstudio.monitor_live_time_valid($2)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_record_reviews_value_valid(bigint,text,text,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 BETWEEN 1 AND 9007199254740990 AND $2 IN('accepted','rejected') AND length($3) BETWEEN 1 AND 4000 AND $4 BETWEEN 1 AND 9007199254740991),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_record_reviews_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_reviews_value_valid(text,text,bigint,text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_sha_valid($1) AND length($2) BETWEEN 1 AND 4000 AND $3 BETWEEN 1 AND 9007199254740991 AND $4 IN('accepted','discarded')),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_reviews_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_events_value_valid(text,text,jsonb,boolean,bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_sha_valid($1) AND $2 IN('additional_role','role_started','role_ended','conflict','source_invalidated','fact_corrected') AND jsonb_typeof($3)='object' AND octet_length($3::text)<=100000 AND $4 AND ($5=0 OR $5>=$6 AND agentstudio.monitor_live_time_valid($5))),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_events_time_valid(bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1)),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_reads_value_valid(bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce((agentstudio.monitor_live_time_valid($1) AND $2 BETWEEN 1 AND 9007199254740991),false)
$fn$;
CREATE FUNCTION agentstudio.monitor_live_capture_valid(jsonb,jsonb,text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT coalesce($2->'coverage'->'stored_complete'='true'::jsonb AND $2->'redacted'='false'::jsonb AND $2->'usable_as_evidence'='true'::jsonb AND coalesce($2->'validation'->>'status','')<>'invalid'
 AND ($2->'http_response'->>'status')::integer BETWEEN 200 AND 299 AND $2->'http_response'->'complete'='true'::jsonb AND $2->'http_response'->'empty'='false'::jsonb,false) THEN RETURN false; END IF;
 IF $1->>'adapter_id'='web.text.v1' THEN
  RETURN coalesce(jsonb_typeof($2->'text')='string' AND length($2->>'text')>=40 AND $2->'http_response'->>'media_type' ~* '^text/(html|plain)(;|$)' AND jsonb_typeof($1->'required_markers')='array' AND jsonb_array_length($1->'required_markers') BETWEEN 1 AND 10
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text($1->'required_markers') marker WHERE position(marker IN $2->>'text')=0) AND $3::jsonb=$2->'text',false);
 ELSIF $1->>'adapter_id'='http.json-items.v1' THEN
  RETURN coalesce($2->'structuredContent'->>'scope_key'=$1->>'scope_key' AND $2->'structuredContent'->'complete'='true'::jsonb AND $2->'structuredContent'->'has_more'='false'::jsonb AND $2->'structuredContent'->'next_cursor'='null'::jsonb
   AND jsonb_typeof($2->'structuredContent'->'items')='array' AND jsonb_array_length($2->'structuredContent'->'items')<=1000 AND $3::jsonb=$2->'structuredContent'->'items',false);
 END IF;
 RETURN false;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_semantic_rows(jsonb,jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('from_id',r->'payload'->'from_id','to_id',r->'payload'->'to_id','relation_type',r->'payload'->'relation_type','valid_from',r->'payload'->'valid_from','valid_to',r->'payload'->'valid_to','status',r->'payload'->'status') ORDER BY (r->'payload'->>'from_id') COLLATE "C",(r->'payload'->>'to_id') COLLATE "C",(r->'payload'->>'relation_type') COLLATE "C",(r->'payload'->>'valid_from') COLLATE "C",(r->'payload'->>'valid_to') COLLATE "C",(r->'payload'->>'status') COLLATE "C"),'[]'::jsonb)
 FROM jsonb_array_elements($1->'records') r WHERE r->>'schema_id'='research.relation.v1' AND $2->'target_entity_ids' ? (r->'payload'->>'from_id') AND $2->'relation_types' ? (r->'payload'->>'relation_type')
$fn$;
CREATE FUNCTION agentstudio.monitor_live_effect_slots_value_valid(text,text,text,text,text,jsonb,text,jsonb,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(($1 ~ '^[A-Za-z0-9_:-]{1,160}$' AND agentstudio.monitor_live_sha_valid($2) AND length($3) BETWEEN 1 AND 160 AND $4 IN('model','source','business') AND (($4='source' AND $5 ~ '^[A-Za-z0-9_-]{1,60}$') OR ($4<>'source' AND $5 IS NULL)) AND jsonb_typeof($6)='object' AND octet_length($7)<=100000 AND $7::jsonb=$6 AND jsonb_typeof($8)='object' AND agentstudio.monitor_live_time_valid($9)),false)
$fn$;
CREATE TABLE agentstudio.monitor_live_cases(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 title text NOT NULL,
 data_space text NOT NULL,
 questions jsonb NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_cases_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_cases_owner_uq UNIQUE(id,owner_user_id),
 CONSTRAINT monitor_live_cases_user_fk FOREIGN KEY(owner_user_id) REFERENCES agentstudio.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_cases_value_ck CHECK(agentstudio.monitor_live_cases_value_valid(title,data_space,questions)),
 CONSTRAINT monitor_live_cases_time_ck CHECK(agentstudio.monitor_live_cases_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_monitors(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 schedule_id uuid NOT NULL,
 revision bigint NOT NULL,
 enabled boolean NOT NULL,
 definition jsonb NOT NULL,
 definition_hash text NOT NULL,
 baseline_check_id uuid,
 current_check_id uuid,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 created_ms bigint NOT NULL,
 updated_ms bigint NOT NULL,
 CONSTRAINT monitor_live_monitors_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_monitors_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_monitors_schedule_uq UNIQUE(schedule_id),
 CONSTRAINT monitor_live_monitors_idempotency_uq UNIQUE(owner_user_id,idempotency_key),
 CONSTRAINT monitor_live_monitors_schedule_fk FOREIGN KEY(schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_monitors_value_ck CHECK(agentstudio.monitor_live_monitors_value_valid(revision,definition,definition_hash,idempotency_key,request_hash)),
 CONSTRAINT monitor_live_monitors_time_ck CHECK(agentstudio.monitor_live_monitors_time_valid(created_ms,updated_ms))
);
CREATE TABLE agentstudio.monitor_live_versions(
 monitor_id uuid NOT NULL,
 revision bigint NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 definition jsonb NOT NULL,
 definition_hash text NOT NULL,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_versions_pkey PRIMARY KEY(monitor_id,revision),
 CONSTRAINT monitor_live_versions_owner_case_uq UNIQUE(monitor_id,revision,owner_user_id,case_id),
 CONSTRAINT monitor_live_versions_idempotency_uq UNIQUE(monitor_id,idempotency_key),
 CONSTRAINT monitor_live_versions_value_ck CHECK(agentstudio.monitor_live_versions_value_valid(revision,definition,definition_hash,request_hash,idempotency_key)),
 CONSTRAINT monitor_live_versions_time_ck CHECK(agentstudio.monitor_live_versions_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_checks(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 monitor_id uuid NOT NULL,
 case_id uuid NOT NULL,
 monitor_revision bigint NOT NULL,
 schedule_revision bigint NOT NULL,
 occurrence_id uuid NOT NULL,
 run_id uuid,
 definition_hash text NOT NULL,
 resource_hash text NOT NULL,
 status text NOT NULL,
 fact_set_id uuid,
 freeze_job_id uuid,
 baseline_check_id uuid,
 receipts jsonb NOT NULL,
 assessment jsonb NOT NULL,
 error text NOT NULL,
 lease_owner text,
 lease_token uuid,
 lease_version bigint NOT NULL,
 lease_until_ms bigint NOT NULL,
 tool_calls bigint NOT NULL,
 read_calls bigint NOT NULL,
 model_calls bigint NOT NULL,
 wall_deadline_ms bigint NOT NULL,
 created_ms bigint NOT NULL,
 updated_ms bigint NOT NULL,
 CONSTRAINT monitor_live_checks_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_checks_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_checks_owner_monitor_uq UNIQUE(id,owner_user_id,monitor_id),
 CONSTRAINT monitor_live_checks_occurrence_uq UNIQUE(occurrence_id),
 CONSTRAINT monitor_live_checks_run_uq UNIQUE(run_id),
 CONSTRAINT monitor_live_checks_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_checks_occurrence_fk FOREIGN KEY(occurrence_id) REFERENCES agentstudio.schedule_occurrences(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_checks_value_ck CHECK(agentstudio.monitor_live_checks_value_valid(monitor_revision,schedule_revision,definition_hash,resource_hash,status,receipts,assessment,error)),
 CONSTRAINT monitor_live_checks_lease_ck CHECK(agentstudio.monitor_live_checks_lease_valid(lease_owner,lease_token,lease_version,lease_until_ms,tool_calls,read_calls,model_calls,wall_deadline_ms)),
 CONSTRAINT monitor_live_checks_time_ck CHECK(agentstudio.monitor_live_checks_time_valid(created_ms,updated_ms))
);
CREATE TABLE agentstudio.monitor_live_requests(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 check_id uuid NOT NULL,
 run_id uuid NOT NULL,
 auth_slot_id uuid NOT NULL,
 source_id text NOT NULL,
 request_hash text NOT NULL,
 source_definition jsonb NOT NULL,
 lease_token uuid NOT NULL,
 lease_version bigint NOT NULL,
 state text NOT NULL,
 result_id uuid,
 error text NOT NULL,
 started_ms bigint NOT NULL,
 finished_ms bigint NOT NULL,
 material_read_ms bigint NOT NULL,
 CONSTRAINT monitor_live_requests_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_requests_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_requests_source_uq UNIQUE(check_id,source_id),
 CONSTRAINT monitor_live_requests_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_requests_value_ck CHECK(agentstudio.monitor_live_requests_value_valid(source_id,request_hash,source_definition,lease_version,state,error,started_ms,finished_ms,material_read_ms))
);
CREATE TABLE agentstudio.monitor_live_receipts(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 run_id uuid NOT NULL,
 step_key text NOT NULL,
 monitor_check_id uuid NOT NULL,
 source_id text NOT NULL,
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 payload jsonb NOT NULL,
 canonical_payload text NOT NULL,
 source_scope jsonb NOT NULL,
 content_hash text NOT NULL,
 projection_hash text NOT NULL,
 projection_canonical text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_receipts_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_receipts_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_receipts_request_uq UNIQUE(request_id),
 CONSTRAINT monitor_live_receipts_check_source_uq UNIQUE(monitor_check_id,source_id),
 CONSTRAINT monitor_live_receipts_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_receipts_value_ck CHECK(agentstudio.monitor_live_receipts_value_valid(step_key,source_id,request_hash,payload,canonical_payload,content_hash,projection_hash,projection_canonical,source_scope)),
 CONSTRAINT monitor_live_receipts_time_ck CHECK(agentstudio.monitor_live_receipts_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_records(
 record_id uuid NOT NULL,
 version bigint NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 schema_id text NOT NULL,
 payload jsonb NOT NULL,
 source_refs jsonb NOT NULL,
 relation_versions jsonb NOT NULL,
 run_id uuid,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_records_pkey PRIMARY KEY(record_id,version),
 CONSTRAINT monitor_live_records_owner_case_uq UNIQUE(record_id,version,owner_user_id,case_id),
 CONSTRAINT monitor_live_records_idempotency_uq UNIQUE(owner_user_id,case_id,idempotency_key),
 CONSTRAINT monitor_live_records_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_records_value_ck CHECK(agentstudio.monitor_live_records_value_valid(version,schema_id,payload,source_refs,relation_versions,idempotency_key,request_hash)),
 CONSTRAINT monitor_live_records_time_ck CHECK(agentstudio.monitor_live_records_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_fact_sets(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 check_id uuid NOT NULL,
 run_id uuid NOT NULL,
 payload jsonb NOT NULL,
 canonical_payload text NOT NULL,
 content_hash text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_fact_sets_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_fact_sets_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_fact_sets_check_uq UNIQUE(check_id),
 CONSTRAINT monitor_live_fact_sets_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_fact_sets_value_ck CHECK(agentstudio.monitor_live_fact_sets_value_valid(payload,canonical_payload,content_hash)),
 CONSTRAINT monitor_live_fact_sets_time_ck CHECK(agentstudio.monitor_live_fact_sets_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_freeze_jobs(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 check_id uuid NOT NULL,
 run_id uuid NOT NULL,
 manifest jsonb NOT NULL,
 manifest_hash text NOT NULL,
 next_index bigint NOT NULL,
 records jsonb NOT NULL,
 reference_records jsonb NOT NULL,
 status text NOT NULL,
 error text NOT NULL,
 created_ms bigint NOT NULL,
 updated_ms bigint NOT NULL,
 CONSTRAINT monitor_live_freeze_jobs_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_freeze_jobs_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_freeze_jobs_check_uq UNIQUE(check_id),
 CONSTRAINT monitor_live_freeze_jobs_run_fk FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT monitor_live_freeze_jobs_value_ck CHECK(agentstudio.monitor_live_freeze_jobs_value_valid(manifest,manifest_hash,next_index,records,reference_records,status,error)),
 CONSTRAINT monitor_live_freeze_jobs_time_ck CHECK(agentstudio.monitor_live_freeze_jobs_time_valid(created_ms,updated_ms))
);
CREATE TABLE agentstudio.monitor_live_record_reviews(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 record_id uuid NOT NULL,
 record_version bigint NOT NULL,
 revision bigint NOT NULL,
 decision text NOT NULL,
 rationale text NOT NULL,
 governance_revision bigint NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_record_reviews_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_record_reviews_revision_uq UNIQUE(record_id,record_version,revision),
 CONSTRAINT monitor_live_record_reviews_value_ck CHECK(agentstudio.monitor_live_record_reviews_value_valid(revision,decision,rationale,governance_revision)),
 CONSTRAINT monitor_live_record_reviews_time_ck CHECK(agentstudio.monitor_live_record_reviews_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_reviews(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 monitor_id uuid NOT NULL,
 check_id uuid NOT NULL,
 preview_hash text NOT NULL,
 rationale text NOT NULL,
 governance_revision bigint NOT NULL,
 decision text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_reviews_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_reviews_value_ck CHECK(agentstudio.monitor_live_reviews_value_valid(preview_hash,rationale,governance_revision,decision)),
 CONSTRAINT monitor_live_reviews_time_ck CHECK(agentstudio.monitor_live_reviews_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_events(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 monitor_id uuid NOT NULL,
 check_id uuid NOT NULL,
 dedup_hash text NOT NULL,
 kind text NOT NULL,
 payload jsonb NOT NULL,
 notify boolean NOT NULL,
 read_ms bigint NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_events_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_events_owner_uq UNIQUE(id,owner_user_id),
 CONSTRAINT monitor_live_events_dedup_uq UNIQUE(monitor_id,dedup_hash),
 CONSTRAINT monitor_live_events_value_ck CHECK(agentstudio.monitor_live_events_value_valid(dedup_hash,kind,payload,notify,read_ms,created_ms)),
 CONSTRAINT monitor_live_events_time_ck CHECK(agentstudio.monitor_live_events_time_valid(created_ms))
);
CREATE TABLE agentstudio.monitor_live_reads(
 event_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 read_ms bigint NOT NULL,
 governance_revision bigint NOT NULL,
 CONSTRAINT monitor_live_reads_pkey PRIMARY KEY(event_id),
 CONSTRAINT monitor_live_reads_value_ck CHECK(agentstudio.monitor_live_reads_value_valid(read_ms,governance_revision))
);
CREATE TABLE agentstudio.monitor_live_effect_slots(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 check_id uuid NOT NULL,
 run_id uuid NOT NULL,
 step_key text NOT NULL,
 input_sha256 text NOT NULL,
 tool text NOT NULL,
 kind text NOT NULL,
 source_id text,
 arguments jsonb NOT NULL,
 arguments_canonical text NOT NULL,
 claim jsonb NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT monitor_live_effect_slots_pkey PRIMARY KEY(id),
 CONSTRAINT monitor_live_effect_slots_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT monitor_live_effect_slots_step_uq UNIQUE(run_id,step_key),
 CONSTRAINT monitor_live_effect_slots_source_uq UNIQUE(check_id,source_id),
 CONSTRAINT monitor_live_effect_slots_value_ck CHECK(agentstudio.monitor_live_effect_slots_value_valid(step_key,input_sha256,tool,kind,source_id,arguments,arguments_canonical,claim,created_ms))
);
ALTER TABLE agentstudio.monitor_live_monitors ADD CONSTRAINT monitor_live_monitors_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_monitors ADD CONSTRAINT monitor_live_monitors_version_fk FOREIGN KEY(id,revision,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_versions(monitor_id,revision,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_monitors ADD CONSTRAINT monitor_live_monitors_current_fk FOREIGN KEY(current_check_id,owner_user_id,id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_monitors ADD CONSTRAINT monitor_live_monitors_baseline_fk FOREIGN KEY(baseline_check_id,owner_user_id,id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_versions ADD CONSTRAINT monitor_live_versions_monitor_fk FOREIGN KEY(monitor_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_monitors(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_checks ADD CONSTRAINT monitor_live_checks_version_fk FOREIGN KEY(monitor_id,monitor_revision,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_versions(monitor_id,revision,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_checks ADD CONSTRAINT monitor_live_checks_baseline_fk FOREIGN KEY(baseline_check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_checks ADD CONSTRAINT monitor_live_checks_fact_fk FOREIGN KEY(fact_set_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_fact_sets(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_checks ADD CONSTRAINT monitor_live_checks_freeze_fk FOREIGN KEY(freeze_job_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_freeze_jobs(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_requests ADD CONSTRAINT monitor_live_requests_check_fk FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_requests ADD CONSTRAINT monitor_live_requests_result_fk FOREIGN KEY(result_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_receipts(id,owner_user_id,case_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agentstudio.monitor_live_requests ADD CONSTRAINT monitor_live_requests_authority_fk FOREIGN KEY(auth_slot_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_effect_slots(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_receipts ADD CONSTRAINT monitor_live_receipts_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_receipts ADD CONSTRAINT monitor_live_receipts_check_fk FOREIGN KEY(monitor_check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_receipts ADD CONSTRAINT monitor_live_receipts_request_fk FOREIGN KEY(request_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_requests(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_records ADD CONSTRAINT monitor_live_records_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_fact_sets ADD CONSTRAINT monitor_live_fact_sets_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_fact_sets ADD CONSTRAINT monitor_live_fact_sets_check_fk FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_freeze_jobs ADD CONSTRAINT monitor_live_freeze_jobs_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_freeze_jobs ADD CONSTRAINT monitor_live_freeze_jobs_check_fk FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_record_reviews ADD CONSTRAINT monitor_live_record_reviews_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_record_reviews ADD CONSTRAINT monitor_live_record_reviews_record_fk FOREIGN KEY(record_id,record_version,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_records(record_id,version,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_reviews ADD CONSTRAINT monitor_live_reviews_check_fk FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_events ADD CONSTRAINT monitor_live_events_check_fk FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_reads ADD CONSTRAINT monitor_live_reads_event_fk FOREIGN KEY(event_id,owner_user_id) REFERENCES agentstudio.monitor_live_events(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE agentstudio.monitor_live_effect_slots ADD CONSTRAINT monitor_live_effect_slots_check_fk FOREIGN KEY(check_id,owner_user_id,case_id) REFERENCES agentstudio.monitor_live_checks(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE FUNCTION agentstudio.monitor_live_immutable() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'monitor_live_immutable'; END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_state_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP<>'UPDATE' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE c.oid=TG_RELID AND r.rolname=current_user AND r.rolsuper) THEN RAISE EXCEPTION 'monitor_live_state_rpc_required'; END IF;
 RETURN NULL;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_employee(uuid) RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result bigint;
BEGIN
 IF agentstudio.actor_id() IS DISTINCT FROM $1 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolname ~ '^agentstudio_.*(worker|dispatch|broker)$') AND pg_has_role(session_user,r.oid,'MEMBER')) THEN RAISE EXCEPTION 'monitor_employee_review_required'; END IF;
 SELECT a.governance_revision INTO result FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=$1 AND a.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.governance_revision=agentstudio.agent_memory_outcome_epoch() FOR SHARE OF a,u;
 IF result IS NULL THEN RAISE EXCEPTION 'monitor_live_session_required'; END IF;
 RETURN result;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_read_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF to_jsonb(NEW)-'read_ms' IS DISTINCT FROM to_jsonb(OLD)-'read_ms' OR OLD.read_ms<>0 OR NEW.read_ms<1 OR NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_reads r WHERE r.event_id=OLD.id AND r.owner_user_id=OLD.owner_user_id AND r.read_ms=NEW.read_ms) THEN RAISE EXCEPTION 'monitor_live_read_audit_required'; END IF;
 RETURN NEW;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_ack(uuid,uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id(); epoch bigint; event_row agentstudio.monitor_live_events; stamp bigint;
BEGIN
 epoch=agentstudio.monitor_live_employee(owner_id);
 IF owner_id IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'monitor_live_employee_changed'; END IF;
 SELECT * INTO event_row FROM agentstudio.monitor_live_events e WHERE e.id=$1 AND e.owner_user_id=owner_id AND e.notify FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_live_event_not_found'; END IF;
 IF event_row.read_ms>0 THEN RETURN true; END IF;
 stamp=greatest(event_row.created_ms,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO agentstudio.monitor_live_reads(event_id,owner_user_id,read_ms,governance_revision) VALUES(event_row.id,owner_id,stamp,epoch);
 UPDATE agentstudio.monitor_live_events SET read_ms=stamp WHERE id=event_row.id AND owner_user_id=owner_id AND read_ms=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_live_read_changed'; END IF;
 RETURN true;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_lease(uuid,uuid,bigint) RETURNS agentstudio.monitor_live_checks LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; m agentstudio.monitor_live_monitors; s agentstudio.schedules; prior_actor text; current_hash text; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 SELECT * INTO c FROM agentstudio.monitor_live_checks WHERE id=$1;
 IF c.id IS NULL THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=c.case_id AND owner_user_id=c.owner_user_id FOR SHARE;
 PERFORM 1 FROM agentstudio.monitor_live_monitors WHERE id=c.monitor_id AND owner_user_id=c.owner_user_id FOR SHARE;
 SELECT * INTO c FROM agentstudio.monitor_live_checks WHERE id=$1 FOR UPDATE;
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF c.id IS NULL OR c.lease_token IS DISTINCT FROM $2 OR c.lease_version<>$3 OR c.lease_until_ms<=stamp OR c.wall_deadline_ms<=stamp OR c.status NOT IN('collecting','freezing','analyzing') THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=c.monitor_id AND owner_user_id=c.owner_user_id AND case_id=c.case_id FOR SHARE;
 SELECT * INTO s FROM agentstudio.schedules WHERE id=m.schedule_id AND owner_user_id=c.owner_user_id AND deleted_at IS NULL FOR SHARE;
 PERFORM 1 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=c.owner_user_id AND a.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' FOR SHARE OF a,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_live_owner_disabled'; END IF;
 IF m.id IS NULL OR NOT m.enabled OR m.current_check_id IS DISTINCT FROM c.id OR m.revision<>c.monitor_revision OR m.definition_hash<>c.definition_hash OR s.id IS NULL OR s.revision<>c.schedule_revision OR s.kind<>'agent'
 OR NOT EXISTS(SELECT 1 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=c.owner_user_id AND a.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences o JOIN agentstudio.schedule_execution_origins x ON x.occurrence_id=o.id AND x.owner_user_id=o.owner_user_id AND x.run_id=c.run_id WHERE o.id=c.occurrence_id AND o.owner_user_id=c.owner_user_id AND o.schedule_id=s.id AND o.schedule_revision=c.schedule_revision AND o.planned_run_id=c.run_id AND agentstudio.schedule_authority_current(x.authority_id))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=c.run_id AND r.owner_user_id=c.owner_user_id AND r.agent_spec_id=s.agent_spec_id AND r.kind='agent')
 OR NOT agentstudio.schedule_run_current(c.owner_user_id,c.run_id) THEN RAISE EXCEPTION 'monitor_live_execution_scope_changed'; END IF;
 prior_actor=current_setting('agentstudio.actor_id',true);
 PERFORM set_config('agentstudio.actor_id',c.owner_user_id::text,true);
 current_hash=agentstudio.schedule_resource_fingerprint(s.id,s.execution->'model_binding');
 IF current_hash IS DISTINCT FROM c.resource_hash OR current_hash IS DISTINCT FROM m.definition->>'schedule_resource_hash' OR NOT agentstudio.knowledge_query_execution_validate_run(c.run_id,'') THEN RAISE EXCEPTION 'monitor_live_source_scope_changed'; END IF;
 PERFORM set_config('agentstudio.actor_id',coalesce(prior_actor,''),true);
 IF c.lease_until_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint OR c.wall_deadline_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 RETURN c;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_claim(text,bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR length($1) NOT BETWEEN 1 AND 120 OR $2 NOT BETWEEN 1000 AND 30000 THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 SELECT c0.* INTO c FROM agentstudio.monitor_live_checks c0 JOIN agentstudio.monitor_live_monitors m ON m.id=c0.monitor_id AND m.owner_user_id=c0.owner_user_id AND m.case_id=c0.case_id WHERE c0.status IN('collecting','freezing','analyzing') AND c0.wall_deadline_ms>stamp AND c0.lease_until_ms<=stamp AND m.enabled AND m.current_check_id=c0.id AND m.revision=c0.monitor_revision ORDER BY c0.updated_ms,c0.id LIMIT 1 FOR UPDATE OF c0 SKIP LOCKED;
 IF c.id IS NULL THEN RETURN NULL; END IF;
 UPDATE agentstudio.monitor_live_checks SET lease_owner=$1,lease_token=gen_random_uuid(),lease_version=lease_version+1,lease_until_ms=least(stamp+$2,wall_deadline_ms),updated_ms=greatest(created_ms,stamp) WHERE id=c.id RETURNING * INTO c;
 RETURN jsonb_build_object('check_id',c.id,'owner_user_id',c.owner_user_id,'case_id',c.case_id,'run_id',c.run_id,'lease_token',c.lease_token,'lease_version',c.lease_version,'lease_until_ms',c.lease_until_ms,'wall_deadline_ms',c.wall_deadline_ms,'status',c.status);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_renew(uuid,uuid,bigint,bigint) RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR $4 NOT BETWEEN 1000 AND 30000 THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 c=agentstudio.monitor_live_lease($1,$2,$3);
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 UPDATE agentstudio.monitor_live_checks SET lease_until_ms=least(stamp+$4,wall_deadline_ms),updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
 RETURN true;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_begin_request(uuid,uuid,bigint,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; req agentstudio.monitor_live_requests; source jsonb; def jsonb; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; matches integer; authority agentstudio.monitor_live_effect_slots;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR $4 !~ '^[A-Za-z0-9_-]{1,60}$' THEN RAISE EXCEPTION 'monitor_live_dispatch_required'; END IF;
 c=agentstudio.monitor_live_lease($1,$2,$3);
 IF c.status<>'collecting' OR NOT EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=c.run_id AND owner_user_id=c.owner_user_id AND status='running') THEN RAISE EXCEPTION 'monitor_live_collection_not_running'; END IF;
 SELECT definition INTO def FROM agentstudio.monitor_live_versions WHERE monitor_id=c.monitor_id AND revision=c.monitor_revision AND owner_user_id=c.owner_user_id AND case_id=c.case_id;
 SELECT count(*) INTO matches FROM jsonb_array_elements(def->'sources') s WHERE s->>'source_id'=$4;
 IF matches<>1 THEN RAISE EXCEPTION 'monitor_live_undeclared_request'; END IF;
 SELECT s INTO source FROM jsonb_array_elements(def->'sources') s WHERE s->>'source_id'=$4;
 IF source->>'adapter_id' NOT IN('web.text.v1','http.json-items.v1') OR NOT agentstudio.monitor_live_sha_valid(source->>'request_hash') THEN RAISE EXCEPTION 'monitor_live_source_adapter_required'; END IF;
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE check_id=c.id AND source_id=$4 FOR UPDATE;
 IF req.id IS NOT NULL THEN
  IF req.state='started' THEN
   UPDATE agentstudio.monitor_live_requests SET state='ambiguous',error='source_request_outcome_unknown',finished_ms=greatest(started_ms,stamp) WHERE id=req.id;
   UPDATE agentstudio.monitor_live_checks SET status='incomplete',error='source_request_outcome_unknown',assessment=jsonb_build_object('collection_complete',false,'semantic_state','collection_incomplete','baseline_advanced',false),lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
   RETURN jsonb_build_object('state','ambiguous','request_id',req.id,'error','source_request_outcome_unknown');
  END IF;
  RETURN jsonb_build_object('state',req.state,'request_id',req.id,'result_id',req.result_id,'error',req.error);
 END IF;
 SELECT * INTO authority FROM agentstudio.monitor_live_effect_slots WHERE check_id=c.id AND run_id=c.run_id AND owner_user_id=c.owner_user_id AND case_id=c.case_id AND source_id=$4 AND kind='source' AND arguments=source->'input';
 IF authority.id IS NULL OR NOT agentstudio.monitor_live_effect_current(authority.id) OR NOT EXISTS(SELECT 1 FROM agentstudio.jobs j WHERE j.id=(authority.claim->>'job_id')::uuid AND j.run_id=c.run_id AND j.owner_user_id=c.owner_user_id AND j.status='leased' AND j.lease_token=(authority.claim->>'lease_token')::uuid AND j.lease_version=(authority.claim->>'lease_version')::bigint AND j.lease_owner=authority.claim->>'lease_owner' AND j.lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'monitor_effect_approval_changed'; END IF;
 IF c.tool_calls>=coalesce((def->'execution_budget'->>'tool_calls')::bigint,0) OR c.read_calls>=coalesce((def->'execution_budget'->>'read_calls')::bigint,0) THEN RAISE EXCEPTION 'monitor_live_request_budget_exhausted'; END IF;
 INSERT INTO agentstudio.monitor_live_requests(id,owner_user_id,case_id,check_id,run_id,auth_slot_id,source_id,request_hash,source_definition,lease_token,lease_version,state,result_id,error,started_ms,finished_ms,material_read_ms)
 VALUES(gen_random_uuid(),c.owner_user_id,c.case_id,c.id,c.run_id,authority.id,$4,source->>'request_hash',source,$2,$3,'started',NULL,'',stamp,0,0) RETURNING * INTO req;
 UPDATE agentstudio.monitor_live_checks SET tool_calls=tool_calls+1,read_calls=read_calls+1,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
 RETURN jsonb_build_object('state','started','request_id',req.id,'owner_user_id',c.owner_user_id,'case_id',c.case_id,'run_id',c.run_id,'source',source,'wall_deadline_ms',c.wall_deadline_ms,'data_space',(SELECT data_space FROM agentstudio.monitor_live_cases WHERE id=c.case_id AND owner_user_id=c.owner_user_id));
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_finish_request(uuid,uuid,bigint,jsonb,text,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE req agentstudio.monitor_live_requests; c agentstudio.monitor_live_checks; receipt_id uuid; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; content_sha text=encode(sha256(convert_to($5,'UTF8')),'hex'); projection_sha text=encode(sha256(convert_to($6,'UTF8')),'hex');
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') THEN RAISE EXCEPTION 'monitor_live_dispatch_required'; END IF;
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1;
 IF req.id IS NULL THEN RAISE EXCEPTION 'monitor_live_request_not_found'; END IF;
 c=agentstudio.monitor_live_lease(req.check_id,$2,$3);
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1 FOR UPDATE;
 IF req.state='captured' THEN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_receipts r WHERE r.id=req.result_id AND r.request_id=req.id AND r.content_hash=content_sha AND r.projection_hash=projection_sha) THEN RAISE EXCEPTION 'monitor_live_capture_conflict'; END IF;
  RETURN jsonb_build_object('result_id',req.result_id,'content_hash',content_sha,'projection_hash',projection_sha,'source_id',req.source_id,'run_id',c.run_id);
 END IF;
 IF req.state<>'started' OR req.material_read_ms=0 OR req.lease_token IS DISTINCT FROM $2 OR req.lease_version<>$3 OR c.status<>'collecting' THEN RAISE EXCEPTION 'monitor_live_capture_not_replayable'; END IF;
 IF NOT agentstudio.monitor_live_json_valid($4,$5,content_sha,2000000) OR NOT agentstudio.monitor_live_capture_valid(req.source_definition,$4,$6) OR NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_cases x WHERE x.id=c.case_id AND x.owner_user_id=c.owner_user_id AND x.data_space=$4->>'data_space') THEN RAISE EXCEPTION 'monitor_live_capture_incomplete'; END IF;
 receipt_id=gen_random_uuid();
 INSERT INTO agentstudio.monitor_live_receipts(id,owner_user_id,case_id,run_id,step_key,monitor_check_id,source_id,request_id,request_hash,payload,canonical_payload,source_scope,content_hash,projection_hash,projection_canonical,created_ms)
 VALUES(receipt_id,c.owner_user_id,c.case_id,c.run_id,(SELECT step_key FROM agentstudio.monitor_live_effect_slots WHERE id=req.auth_slot_id),c.id,req.source_id,req.id,req.request_hash,$4,$5,'{"knowledge_base_ids":[],"documents":[],"semantic_used":false,"dependency_runs":[]}'::jsonb,content_sha,projection_sha,$6,stamp);
 UPDATE agentstudio.monitor_live_requests SET state='captured',result_id=receipt_id,finished_ms=greatest(started_ms,stamp) WHERE id=req.id;
 RETURN jsonb_build_object('result_id',receipt_id,'content_hash',content_sha,'projection_hash',projection_sha,'source_id',req.source_id,'run_id',c.run_id);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_fail_request(uuid,uuid,bigint,text) RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE req agentstudio.monitor_live_requests; c agentstudio.monitor_live_checks; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR $4 !~ '^[a-z0-9_]{1,160}$' THEN RAISE EXCEPTION 'monitor_live_dispatch_required'; END IF;
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1;
 IF req.id IS NULL THEN RAISE EXCEPTION 'monitor_live_request_not_found'; END IF;
 c=agentstudio.monitor_live_lease(req.check_id,$2,$3);
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1 FOR UPDATE;
 IF req.state<>'started' OR req.lease_token IS DISTINCT FROM $2 OR req.lease_version<>$3 THEN RAISE EXCEPTION 'monitor_live_capture_not_replayable'; END IF;
 UPDATE agentstudio.monitor_live_requests SET state='failed',error=$4,finished_ms=greatest(started_ms,stamp) WHERE id=req.id;
 UPDATE agentstudio.monitor_live_checks SET status='incomplete',error=$4,assessment=jsonb_build_object('collection_complete',false,'semantic_state','collection_incomplete','baseline_advanced',false),lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
 RETURN true;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_expire_checks() RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; affected integer=0;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 FOR c IN SELECT * FROM agentstudio.monitor_live_checks WHERE status IN('collecting','freezing','analyzing') AND wall_deadline_ms<=stamp ORDER BY wall_deadline_ms,id LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
  UPDATE agentstudio.monitor_live_requests SET state='ambiguous',error='source_request_outcome_unknown',finished_ms=greatest(started_ms,stamp) WHERE check_id=c.id AND state='started';
  UPDATE agentstudio.monitor_live_checks SET status='incomplete',error='monitor_collection_time_exhausted',assessment=jsonb_build_object('collection_complete',false,'semantic_state','collection_incomplete','baseline_advanced',false),lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
  affected=affected+1;
 END LOOP;
 RETURN affected;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_connection_fingerprint(uuid) RETURNS text LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(jsonb_build_object('owner',t.owner_user_id,'connection_id',t.id,'revision',t.revision,'enabled',t.enabled,'url',t.url,'method',t.method,'body_template',t.body_template,'timeout_s',t.timeout_s,'headers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'name',h.header_name,'cipher',encode(h.value_ciphertext,'hex'),'nonce',encode(h.value_nonce,'hex'),'tag',encode(h.value_tag,'hex')) ORDER BY h.header_name,h.id) FROM agentstudio.tool_connection_headers h WHERE h.tool_connection_id=t.id AND h.owner_user_id=t.owner_user_id),'[]'::jsonb))::text,'UTF8')),'hex')
 FROM agentstudio.tool_connections t WHERE t.id=$1 AND t.owner_user_id=agentstudio.actor_id() AND t.enabled AND t.status='ok' AND t.method='GET'
$fn$;
CREATE FUNCTION agentstudio.monitor_live_transport_material(uuid,uuid,bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE req agentstudio.monitor_live_requests; c agentstudio.monitor_live_checks; connection agentstudio.tool_connections; prior_actor text; config_sha text; headers jsonb; material jsonb; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') THEN RAISE EXCEPTION 'monitor_live_dispatch_required'; END IF;
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1;
 IF req.id IS NULL THEN RAISE EXCEPTION 'monitor_live_request_not_found'; END IF;
 c=agentstudio.monitor_live_lease(req.check_id,$2,$3);
 SELECT * INTO req FROM agentstudio.monitor_live_requests WHERE id=$1 FOR UPDATE;
 IF NOT agentstudio.monitor_live_effect_current(req.auth_slot_id) OR c.lease_until_ms<floor(extract(epoch FROM clock_timestamp())*1000)::bigint+9000 OR c.wall_deadline_ms<floor(extract(epoch FROM clock_timestamp())*1000)::bigint+9000 THEN RAISE EXCEPTION 'monitor_effect_approval_changed'; END IF;
 IF req.state<>'started' OR req.lease_token IS DISTINCT FROM $2 OR req.lease_version<>$3 OR req.material_read_ms<>0 OR c.status<>'collecting' THEN RAISE EXCEPTION 'monitor_live_material_not_replayable'; END IF;
 IF req.source_definition->>'adapter_id'='web.text.v1' THEN
  IF req.source_definition->>'tool'<>'web_fetch' OR jsonb_typeof(req.source_definition->'input'->'url') IS DISTINCT FROM 'string' OR (SELECT count(*) FROM jsonb_object_keys(req.source_definition->'input'))<>1 THEN RAISE EXCEPTION 'monitor_live_source_binding_changed'; END IF;
  material=jsonb_build_object('kind','web','url',req.source_definition->'input'->>'url','request_hash',req.request_hash);
 ELSIF req.source_definition->>'adapter_id'='http.json-items.v1' THEN
  SELECT * INTO connection FROM agentstudio.tool_connections t WHERE t.id=(req.source_definition->>'connection_id')::uuid AND t.owner_user_id=c.owner_user_id AND t.enabled AND t.status='ok' AND t.method='GET' FOR SHARE;
  IF connection.id IS NULL THEN RAISE EXCEPTION 'monitor_live_source_binding_changed'; END IF;
  prior_actor=current_setting('agentstudio.actor_id',true);
  PERFORM set_config('agentstudio.actor_id',c.owner_user_id::text,true);
  config_sha=agentstudio.monitor_live_connection_fingerprint(connection.id);
  PERFORM set_config('agentstudio.actor_id',coalesce(prior_actor,''),true);
  IF config_sha IS DISTINCT FROM req.source_definition->>'config_hash' THEN RAISE EXCEPTION 'monitor_live_source_binding_changed'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.header_name,'ciphertext',encode(h.value_ciphertext,'hex'),'nonce',encode(h.value_nonce,'hex'),'tag',encode(h.value_tag,'hex')) ORDER BY h.header_name,h.id),'[]'::jsonb) INTO headers FROM agentstudio.tool_connection_headers h WHERE h.tool_connection_id=connection.id AND h.owner_user_id=c.owner_user_id;
  IF jsonb_array_length(headers)>20 THEN RAISE EXCEPTION 'monitor_live_source_binding_changed'; END IF;
  material=jsonb_build_object('kind','http','url',connection.url,'method',connection.method,'body_template',connection.body_template,'timeout_s',connection.timeout_s,'headers',headers,'connection_id',connection.id,'config_hash',config_sha,'request_hash',req.request_hash);
 ELSE RAISE EXCEPTION 'monitor_live_source_adapter_required';
 END IF;
 UPDATE agentstudio.monitor_live_requests SET material_read_ms=greatest(started_ms,stamp) WHERE id=req.id AND state='started' AND material_read_ms=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_live_material_not_replayable'; END IF;
 RETURN material;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_run_context(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_check agentstudio.monitor_live_checks; v_monitor agentstudio.monitor_live_monitors; v_schedule agentstudio.schedules; v_prior text; v_hash text; v_epoch bigint;
BEGIN
 SELECT * INTO v_check FROM agentstudio.monitor_live_checks WHERE run_id=$2 AND owner_user_id=$1;
 IF v_check.id IS NULL THEN RAISE EXCEPTION 'monitor_run_binding_missing'; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=v_check.case_id AND owner_user_id=$1 FOR SHARE;
 SELECT * INTO v_monitor FROM agentstudio.monitor_live_monitors WHERE id=v_check.monitor_id AND owner_user_id=$1 AND case_id=v_check.case_id FOR SHARE;
 SELECT * INTO v_check FROM agentstudio.monitor_live_checks WHERE id=v_check.id AND owner_user_id=$1 FOR SHARE;
 SELECT * INTO v_schedule FROM agentstudio.schedules WHERE id=v_monitor.schedule_id AND owner_user_id=$1 AND deleted_at IS NULL FOR SHARE;
 SELECT a.governance_revision INTO v_epoch FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=$1 AND a.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' FOR SHARE OF a,u;
 IF v_epoch IS NULL OR v_monitor.id IS NULL OR NOT v_monitor.enabled OR v_monitor.current_check_id IS DISTINCT FROM v_check.id OR v_monitor.revision<>v_check.monitor_revision OR v_monitor.definition_hash<>v_check.definition_hash OR v_check.status<>'collecting' OR v_check.wall_deadline_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint OR v_schedule.id IS NULL OR v_schedule.revision<>v_check.schedule_revision
 OR NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=$2 AND r.owner_user_id=$1 AND r.status='running' AND r.kind='agent' AND r.agent_spec_id=v_schedule.agent_spec_id)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schedule_execution_origins x JOIN agentstudio.schedule_occurrences o ON o.id=x.occurrence_id AND o.owner_user_id=x.owner_user_id WHERE x.run_id=$2 AND x.owner_user_id=$1 AND o.id=v_check.occurrence_id AND o.schedule_id=v_schedule.id AND o.schedule_revision=v_check.schedule_revision AND o.planned_run_id=$2 AND agentstudio.schedule_authority_current(x.authority_id))
 OR NOT agentstudio.schedule_run_current($1,$2) THEN RAISE EXCEPTION 'monitor_execution_scope_changed'; END IF;
 v_prior=current_setting('agentstudio.actor_id',true);PERFORM set_config('agentstudio.actor_id',$1::text,true);
 v_hash=agentstudio.schedule_resource_fingerprint(v_schedule.id,v_schedule.execution->'model_binding');
 IF v_hash IS DISTINCT FROM v_check.resource_hash OR v_hash IS DISTINCT FROM v_monitor.definition->>'schedule_resource_hash' OR NOT agentstudio.knowledge_query_execution_validate_run($2,'') THEN RAISE EXCEPTION 'monitor_source_unavailable'; END IF;
 PERFORM set_config('agentstudio.actor_id',coalesce(v_prior,''),true);
 RETURN jsonb_build_object('owner_user_id',$1,'run_id',$2,'case_id',v_check.case_id,'monitor_id',v_monitor.id,'check_id',v_check.id,'revision',v_monitor.revision,'definition',v_monitor.definition,'definition_hash',v_monitor.definition_hash,'governance_revision',v_epoch);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_worker_binding(jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_job agentstudio.jobs; v_login record;
BEGIN
 IF jsonb_typeof($1) IS DISTINCT FROM 'object' OR NOT $1 ?& ARRAY['job_id','run_id','lease_token','lease_version','lease_owner'] OR (SELECT count(*) FROM jsonb_object_keys($1))<>5 THEN RAISE EXCEPTION 'monitor_worker_claim_required'; END IF;
 SELECT * INTO v_login FROM pg_catalog.pg_roles WHERE rolname=session_user;
 IF current_setting('role')<>'agentstudio_worker' OR NOT v_login.rolcanlogin OR v_login.rolinherit OR v_login.rolsuper OR v_login.rolcreaterole OR v_login.rolcreatedb OR v_login.rolreplication OR v_login.rolbypassrls
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles g WHERE g.oid<>v_login.oid AND pg_has_role(v_login.oid,g.oid,'MEMBER') AND g.rolname NOT IN('agentstudio_api','agentstudio_worker'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=v_login.oid AND (admin_option OR inherit_option OR NOT set_option)) OR NOT pg_has_role(v_login.oid,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'monitor_original_worker_login_required'; END IF;
 SELECT * INTO v_job FROM agentstudio.jobs WHERE id=($1->>'job_id')::uuid AND run_id=($1->>'run_id')::uuid AND status='leased' AND lease_token=($1->>'lease_token')::uuid AND lease_version=($1->>'lease_version')::bigint AND lease_owner=$1->>'lease_owner' AND lease_until>clock_timestamp() AND kind='run_tick' AND payload->>'phase'='agent_native_v2' FOR SHARE;
 IF v_job.id IS NULL THEN RAISE EXCEPTION 'monitor_worker_lease_denied'; END IF;
 RETURN agentstudio.monitor_live_run_context(v_job.owner_user_id,v_job.run_id);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_case_create(jsonb) RETURNS uuid LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid=agentstudio.actor_id(); v_epoch bigint; v_id uuid; v_question jsonb; v_stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 v_epoch=agentstudio.monitor_live_employee(v_owner);
 IF jsonb_typeof($1) IS DISTINCT FROM 'object' OR NOT $1 ?& ARRAY['case_id','title','data_space','questions'] OR (SELECT count(*) FROM jsonb_object_keys($1))<>4 OR jsonb_typeof($1->'title') IS DISTINCT FROM 'string' OR length($1->>'title') NOT BETWEEN 1 AND 300 OR $1->>'data_space' NOT IN('LIVE','DEMO') OR jsonb_typeof($1->'questions') IS DISTINCT FROM 'array' OR jsonb_array_length($1->'questions') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_monitor_case'; END IF;
 FOR v_question IN SELECT * FROM jsonb_array_elements($1->'questions') LOOP
  IF jsonb_typeof(v_question) IS DISTINCT FROM 'object' OR NOT v_question ?& ARRAY['question_id','question'] OR (SELECT count(*) FROM jsonb_object_keys(v_question))<>2 OR jsonb_typeof(v_question->'question') IS DISTINCT FROM 'string' OR length(v_question->>'question') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_monitor_case'; END IF;
  PERFORM (v_question->>'question_id')::uuid;
 END LOOP;
 IF (SELECT count(DISTINCT q->>'question_id') FROM jsonb_array_elements($1->'questions') q)<>jsonb_array_length($1->'questions') THEN RAISE EXCEPTION 'invalid_monitor_case'; END IF;
 v_id=($1->>'case_id')::uuid;
 INSERT INTO agentstudio.monitor_live_cases(id,owner_user_id,title,data_space,questions,created_ms) VALUES(v_id,v_owner,$1->>'title',$1->>'data_space',$1->'questions',v_stamp);
 RETURN v_id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_record_review(uuid,uuid,bigint,text,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid=agentstudio.actor_id(); v_epoch bigint; v_record agentstudio.monitor_live_records; v_revision bigint; v_id uuid=gen_random_uuid(); v_stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 v_epoch=agentstudio.monitor_live_employee(v_owner);
 IF $4 NOT IN('accepted','rejected') OR length($5) NOT BETWEEN 1 AND 4000 OR length(btrim($5))=0 OR $3<1 THEN RAISE EXCEPTION 'invalid_monitor_record_review'; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=$1 AND owner_user_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'business_case_not_found'; END IF;
 SELECT * INTO v_record FROM agentstudio.monitor_live_records WHERE record_id=$2 AND case_id=$1 AND owner_user_id=v_owner ORDER BY version DESC LIMIT 1 FOR SHARE;
 IF v_record.record_id IS NULL OR v_record.version<>$3 THEN RAISE EXCEPTION 'review_version_stale'; END IF;
 IF v_record.schema_id NOT IN('research.claim.v1','research.relation.v1') OR v_record.payload->>'status'<>'SOURCE_SUPPORTED' OR jsonb_array_length(v_record.source_refs)=0 THEN RAISE EXCEPTION 'supported_claim_required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_record.source_refs) ref WHERE NOT agentstudio.knowledge_query_execution_validate_run((ref->>'run_id')::uuid,'')) THEN RAISE EXCEPTION 'monitor_source_unavailable'; END IF;
 SELECT coalesce(max(revision),0)+1 INTO v_revision FROM agentstudio.monitor_live_record_reviews WHERE owner_user_id=v_owner AND case_id=$1 AND record_id=$2 AND record_version=$3;
 INSERT INTO agentstudio.monitor_live_record_reviews(id,owner_user_id,case_id,record_id,record_version,revision,decision,rationale,governance_revision,created_ms) VALUES(v_id,v_owner,$1,$2,$3,v_revision,$4,$5,v_epoch,v_stamp);
 RETURN jsonb_build_object('review_id',v_id,'record_id',$2,'record_version',$3,'decision',$4,'review_method','human','actor_uid',v_owner,'created_ms',v_stamp,'revision',v_revision,'governance_revision',v_epoch);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_record_write(uuid,jsonb,jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid; v_binding jsonb; v_context jsonb; v_original jsonb; v_id uuid; v_run uuid; v_expected bigint; v_current agentstudio.monitor_live_records; v_prior agentstudio.monitor_live_records; v_stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF jsonb_typeof($2) IS DISTINCT FROM 'object' OR NOT $2 ?& ARRAY['record_id','expected_version','schema_id','payload','source_refs','relation_versions','run_id','idempotency_key','request_hash','request_canonical'] OR (SELECT count(*) FROM jsonb_object_keys($2))<>10 OR NOT agentstudio.monitor_live_json_valid(($2->>'request_canonical')::jsonb,$2->>'request_canonical',$2->>'request_hash',100000) THEN RAISE EXCEPTION 'invalid_monitor_record_write'; END IF;
 v_original=($2->>'request_canonical')::jsonb;v_id=($2->>'record_id')::uuid;v_expected=($2->>'expected_version')::bigint;v_run=($2->>'run_id')::uuid;
 IF v_expected<0 OR v_original->'expected_version' IS DISTINCT FROM $2->'expected_version' OR v_original->'schema_id' IS DISTINCT FROM $2->'schema_id' OR v_original->'payload' IS DISTINCT FROM $2->'payload' OR v_original->'idempotency_key' IS DISTINCT FROM $2->'idempotency_key' OR (v_original ? 'record_id' AND (v_original->>'record_id')::uuid<>v_id) THEN RAISE EXCEPTION 'invalid_monitor_record_write'; END IF;
 IF $3 IS NULL THEN
  v_owner=agentstudio.actor_id();PERFORM agentstudio.monitor_live_employee(v_owner);
  IF v_run IS NOT NULL THEN RAISE EXCEPTION 'monitor_worker_claim_required'; END IF;
 ELSE
  v_context=agentstudio.monitor_live_worker_binding($3);v_owner=(v_context->>'owner_user_id')::uuid;
  IF v_run IS DISTINCT FROM (v_context->>'run_id')::uuid OR $1 IS DISTINCT FROM (v_context->>'case_id')::uuid THEN RAISE EXCEPTION 'monitor_write_outside_scope'; END IF;
 END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=$1 AND owner_user_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'business_case_not_found'; END IF;
 SELECT * INTO v_prior FROM agentstudio.monitor_live_records WHERE owner_user_id=v_owner AND case_id=$1 AND idempotency_key=$2->>'idempotency_key';
 IF v_prior.record_id IS NOT NULL THEN
  IF v_prior.request_hash<>$2->>'request_hash' THEN RAISE EXCEPTION 'business_idempotency_conflict'; END IF;
  RETURN jsonb_build_object('record_id',v_prior.record_id,'version',v_prior.version);
 END IF;
 SELECT * INTO v_current FROM agentstudio.monitor_live_records WHERE record_id=v_id AND owner_user_id=v_owner AND case_id=$1 ORDER BY version DESC LIMIT 1 FOR SHARE;
 IF coalesce(v_current.version,0)<>v_expected OR (v_current.record_id IS NOT NULL AND v_current.schema_id<>$2->>'schema_id') THEN RAISE EXCEPTION 'business_version_conflict'; END IF;
 IF v_context IS NOT NULL THEN
  IF $2->>'schema_id'='research.entity.v1' THEN
   IF v_expected<>0 OR $2->'payload'->>'entity_type'='PERSON' THEN RAISE EXCEPTION 'monitor_identity_edit_requires_revision'; END IF;
  ELSIF $2->>'schema_id'='research.relation.v1' THEN
   IF NOT (v_context->'definition'->'target_entity_ids' ? ($2->'payload'->>'from_id')) OR NOT (v_context->'definition'->'relation_types' ? ($2->'payload'->>'relation_type')) OR (v_current.record_id IS NOT NULL AND (v_current.payload->>'from_id' IS DISTINCT FROM $2->'payload'->>'from_id' OR v_current.payload->>'to_id' IS DISTINCT FROM $2->'payload'->>'to_id' OR v_current.payload->>'relation_type' IS DISTINCT FROM $2->'payload'->>'relation_type')) THEN RAISE EXCEPTION 'monitor_write_outside_scope'; END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2->'source_refs') ref JOIN agentstudio.monitor_live_receipts receipt ON receipt.id=(ref->>'result_id')::uuid AND receipt.run_id=(ref->>'run_id')::uuid WHERE receipt.owner_user_id=v_owner AND receipt.case_id=$1 AND receipt.monitor_check_id=(v_context->>'check_id')::uuid AND receipt.run_id=v_run) THEN RAISE EXCEPTION 'monitor_fact_without_fresh_source'; END IF;
  ELSE RAISE EXCEPTION 'monitor_write_schema_not_allowed'; END IF;
 END IF;
 INSERT INTO agentstudio.monitor_live_records(record_id,version,owner_user_id,case_id,schema_id,payload,source_refs,relation_versions,run_id,idempotency_key,request_hash,created_ms) VALUES(v_id,v_expected+1,v_owner,$1,$2->>'schema_id',$2->'payload',$2->'source_refs',$2->'relation_versions',v_run,$2->>'idempotency_key',$2->>'request_hash',v_stamp);
 RETURN jsonb_build_object('record_id',v_id,'version',v_expected+1);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_analysis_context(uuid,uuid,bigint) RETURNS agentstudio.monitor_live_checks LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_check agentstudio.monitor_live_checks; v_owner uuid;
BEGIN
 IF $2 IS NOT NULL THEN
  IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
  RETURN agentstudio.monitor_live_lease($1,$2,$3);
 END IF;
 v_owner=agentstudio.actor_id();PERFORM agentstudio.monitor_live_employee(v_owner);
 SELECT * INTO v_check FROM agentstudio.monitor_live_checks WHERE id=$1 AND owner_user_id=v_owner;
 IF v_check.id IS NULL THEN RAISE EXCEPTION 'monitor_check_not_found'; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=v_check.case_id AND owner_user_id=v_owner FOR UPDATE;
 PERFORM 1 FROM agentstudio.monitor_live_monitors WHERE id=v_check.monitor_id AND owner_user_id=v_owner FOR UPDATE;
 SELECT * INTO v_check FROM agentstudio.monitor_live_checks WHERE id=$1 AND owner_user_id=v_owner FOR UPDATE;
 RETURN v_check;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_check_review(uuid,text,text,text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_check agentstudio.monitor_live_checks; v_epoch bigint; v_id uuid=gen_random_uuid(); v_stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 v_epoch=agentstudio.monitor_live_employee(agentstudio.actor_id());
 v_check=agentstudio.monitor_live_analysis_context($1,NULL,NULL);
 IF NOT agentstudio.monitor_live_sha_valid($2) OR length($3) NOT BETWEEN 1 AND 4000 OR length(btrim($3))=0 OR $4 NOT IN('accepted','discarded') OR ($4='discarded' AND v_check.status<>'needs_review') OR ($4='accepted' AND v_check.status NOT IN('freezing','analyzing','needs_review')) THEN RAISE EXCEPTION 'monitor_check_not_reviewable'; END IF;
 INSERT INTO agentstudio.monitor_live_reviews(id,owner_user_id,monitor_id,check_id,preview_hash,rationale,governance_revision,decision,created_ms) VALUES(v_id,v_check.owner_user_id,v_check.monitor_id,v_check.id,$2,$3,v_epoch,$4,v_stamp);
 RETURN v_id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_check_state(uuid,uuid,bigint,text,text,text,jsonb) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_check agentstudio.monitor_live_checks;
BEGIN
 v_check=agentstudio.monitor_live_analysis_context($1,$2,$3);
 IF v_check.status<>$4 OR $5 NOT IN('needs_review','incomplete','cancelled') OR length($6)>160 OR jsonb_typeof($7) IS DISTINCT FROM 'object' OR $7->'baseline_advanced' IS DISTINCT FROM 'false'::jsonb OR octet_length($7::text)>1000000 THEN RAISE EXCEPTION 'monitor_check_changed'; END IF;
 IF $5='cancelled' AND ($2 IS NOT NULL OR v_check.status<>'needs_review' OR NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_reviews r WHERE r.check_id=v_check.id AND r.owner_user_id=v_check.owner_user_id AND r.decision='discarded')) THEN RAISE EXCEPTION 'monitor_employee_discard_required'; END IF;
 UPDATE agentstudio.monitor_live_checks SET status=$5,error=$6,assessment=$7,updated_ms=greatest(created_ms,floor(extract(epoch FROM clock_timestamp())*1000)::bigint),lease_owner=NULL,lease_token=NULL,lease_until_ms=0 WHERE id=v_check.id AND status=$4;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_check_changed'; END IF;
 RETURN v_check.id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_assessment_commit(uuid,uuid,bigint,text,text,jsonb) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_check agentstudio.monitor_live_checks; v_monitor agentstudio.monitor_live_monitors; v_base agentstudio.monitor_live_checks; v_snapshot jsonb; v_before jsonb; v_reviewed boolean; v_unchanged boolean=false; v_accepted boolean; v_event jsonb; v_dedup jsonb; v_hash text; v_event_id uuid; v_observed bigint; v_stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; v_status text; v_assessment jsonb;
BEGIN
 v_check=agentstudio.monitor_live_analysis_context($1,$2,$3);
 SELECT * INTO v_monitor FROM agentstudio.monitor_live_monitors WHERE id=v_check.monitor_id AND owner_user_id=v_check.owner_user_id FOR UPDATE;
 IF v_check.status<>$4 OR v_check.status NOT IN('freezing','analyzing','needs_review') OR NOT v_monitor.enabled OR v_monitor.current_check_id IS DISTINCT FROM v_check.id OR v_monitor.revision<>v_check.monitor_revision OR v_monitor.definition_hash<>v_check.definition_hash OR v_monitor.baseline_check_id IS DISTINCT FROM v_check.baseline_check_id OR NOT agentstudio.monitor_live_sha_valid($5) OR jsonb_typeof($6) IS DISTINCT FROM 'object' OR NOT $6 ?& ARRAY['assessment','events','can_advance','observed_ms'] OR (SELECT count(*) FROM jsonb_object_keys($6))<>4 OR jsonb_typeof($6->'assessment') IS DISTINCT FROM 'object' OR jsonb_typeof($6->'events') IS DISTINCT FROM 'array' OR jsonb_array_length($6->'events')>600 OR jsonb_typeof($6->'can_advance') IS DISTINCT FROM 'boolean' OR octet_length($6::text)>2000000 THEN RAISE EXCEPTION 'monitor_assessment_changed'; END IF;
 SELECT payload INTO v_snapshot FROM agentstudio.monitor_live_fact_sets WHERE id=v_check.fact_set_id AND owner_user_id=v_check.owner_user_id AND case_id=v_check.case_id AND check_id=v_check.id AND run_id=v_check.run_id;
 IF v_snapshot IS NULL OR ($6->>'observed_ms')::bigint IS DISTINCT FROM (v_snapshot->>'created_ms')::bigint THEN RAISE EXCEPTION 'monitor_snapshot_not_ready'; END IF;
 v_observed=($6->>'observed_ms')::bigint;
 SELECT EXISTS(SELECT 1 FROM agentstudio.monitor_live_reviews WHERE check_id=v_check.id AND owner_user_id=v_check.owner_user_id AND preview_hash=$5 AND decision='accepted') INTO v_reviewed;
 IF v_check.baseline_check_id IS NOT NULL THEN
  SELECT * INTO v_base FROM agentstudio.monitor_live_checks WHERE id=v_check.baseline_check_id AND owner_user_id=v_check.owner_user_id AND case_id=v_check.case_id AND monitor_id=v_check.monitor_id AND status='complete' AND monitor_revision=v_check.monitor_revision AND definition_hash=v_check.definition_hash;
  IF v_base.id IS NOT NULL THEN
   SELECT payload INTO v_before FROM agentstudio.monitor_live_fact_sets WHERE id=v_base.fact_set_id AND owner_user_id=v_check.owner_user_id AND case_id=v_check.case_id;
   v_unchanged=coalesce(v_before IS NOT NULL AND agentstudio.monitor_live_semantic_rows(v_before,v_monitor.definition)=agentstudio.monitor_live_semantic_rows(v_snapshot,v_monitor.definition)
    AND (SELECT coalesce(jsonb_agg(jsonb_build_array(r->'source_id',r->'projection_hash') ORDER BY r->>'source_id'),'[]'::jsonb) FROM jsonb_array_elements(v_base.receipts) r)=(SELECT coalesce(jsonb_agg(jsonb_build_array(r->'source_id',r->'projection_hash') ORDER BY r->>'source_id'),'[]'::jsonb) FROM jsonb_array_elements(v_check.receipts) r),false);
  END IF;
 END IF;
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_snapshot->'records') r WHERE r->>'schema_id'='research.relation.v1' AND r->'payload'->>'status'='SOURCE_SUPPORTED' AND v_monitor.definition->'target_entity_ids' ? (r->'payload'->>'from_id') AND v_monitor.definition->'relation_types' ? (r->'payload'->>'relation_type') AND coalesce((SELECT decision FROM agentstudio.monitor_live_record_reviews rr WHERE rr.owner_user_id=v_check.owner_user_id AND rr.case_id=v_check.case_id AND rr.record_id=(r->>'record_id')::uuid AND rr.record_version=(r->>'version')::bigint ORDER BY revision DESC LIMIT 1),'unreviewed')<>'accepted') INTO v_accepted;
 IF NOT v_accepted OR NOT (v_reviewed OR v_unchanged) THEN
  UPDATE agentstudio.monitor_live_checks SET status='needs_review',error='monitor_semantic_review_required',assessment=jsonb_build_object('collection_complete',true,'semantic_state','needs_review','baseline_advanced',false,'preview_hash',$5),lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,v_stamp) WHERE id=v_check.id;
  RETURN v_check.id;
 END IF;
 FOR v_event IN SELECT * FROM jsonb_array_elements($6->'events') LOOP
  IF NOT v_event ?& ARRAY['id','dedup_hash','dedup_canonical','kind','payload'] OR (SELECT count(*) FROM jsonb_object_keys(v_event))<>5 THEN RAISE EXCEPTION 'invalid_monitor_event'; END IF;
  v_dedup=(v_event->>'dedup_canonical')::jsonb;v_hash=encode(sha256(convert_to(v_event->>'dedup_canonical','UTF8')),'hex');
  IF v_hash IS DISTINCT FROM v_event->>'dedup_hash' OR v_dedup->>'monitor_id' IS DISTINCT FROM v_monitor.id::text OR (v_dedup->>'revision')::bigint IS DISTINCT FROM v_monitor.revision OR v_dedup->>'baseline' IS DISTINCT FROM coalesce(v_check.baseline_check_id::text,'') OR v_dedup->>'kind' IS DISTINCT FROM v_event->>'kind' OR v_dedup->'fact' IS DISTINCT FROM v_event->'payload'->'fact' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_snapshot->'records') r WHERE r->>'schema_id'='research.relation.v1' AND r->>'record_id'=v_event->'payload'->>'record_id' AND r->'version'=v_event->'payload'->'record_version' AND jsonb_build_object('from_id',r->'payload'->'from_id','to_id',r->'payload'->'to_id','relation_type',r->'payload'->'relation_type','valid_from',r->'payload'->'valid_from','valid_to',r->'payload'->'valid_to','status',r->'payload'->'status')=v_dedup->'fact') THEN RAISE EXCEPTION 'invalid_monitor_event'; END IF;
  v_event_id=(substr(v_hash,1,8)||'-'||substr(v_hash,9,4)||'-8'||substr(v_hash,14,3)||'-8'||substr(v_hash,18,3)||'-'||substr(v_hash,21,12))::uuid;
  IF v_event_id IS DISTINCT FROM (v_event->>'id')::uuid OR v_event->'payload'->'notify' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'invalid_monitor_event'; END IF;
  INSERT INTO agentstudio.monitor_live_events(id,owner_user_id,monitor_id,check_id,dedup_hash,kind,payload,notify,read_ms,created_ms) VALUES(v_event_id,v_check.owner_user_id,v_monitor.id,v_check.id,v_hash,v_event->>'kind',v_event->'payload',true,0,v_stamp) ON CONFLICT(monitor_id,dedup_hash) DO NOTHING;
 END LOOP;
 IF ($6->>'can_advance')::boolean THEN
  UPDATE agentstudio.monitor_live_monitors SET baseline_check_id=v_check.id,updated_ms=greatest(created_ms,v_stamp) WHERE id=v_monitor.id AND owner_user_id=v_check.owner_user_id AND revision=v_check.monitor_revision AND baseline_check_id IS NOT DISTINCT FROM v_check.baseline_check_id AND enabled AND current_check_id=v_check.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'monitor_baseline_changed'; END IF;
  v_status='complete';v_assessment=($6->'assessment')||jsonb_build_object('collection_complete',true,'baseline_advanced',true,'observed_ms',v_observed,'approval_hash',$5);
 ELSE
  v_status='needs_review';v_assessment=($6->'assessment')||jsonb_build_object('collection_complete',true,'semantic_state','needs_resolution','baseline_advanced',false);
 END IF;
 UPDATE agentstudio.monitor_live_checks SET status=v_status,error=CASE WHEN v_status='complete' THEN '' ELSE 'monitor_fact_resolution_required' END,assessment=v_assessment,lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,v_stamp) WHERE id=v_check.id AND status=$4;
 IF NOT FOUND THEN RAISE EXCEPTION 'monitor_check_changed'; END IF;
 RETURN v_check.id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_manifest(uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('record_id',r.record_id,'version',r.version) ORDER BY r.record_id),'[]'::jsonb)
 FROM(SELECT DISTINCT ON(record_id) record_id,version FROM agentstudio.monitor_live_records WHERE owner_user_id=$1 AND case_id=$2 ORDER BY record_id,version DESC LIMIT 601) r
$fn$;
CREATE FUNCTION agentstudio.monitor_live_record_dto(uuid,bigint,uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('record_id',record_id,'version',version,'schema_id',schema_id,'payload',payload,'source_refs',source_refs,'relation_versions',relation_versions,'run_id',coalesce(run_id::text,''),'created_ms',created_ms)
 FROM agentstudio.monitor_live_records WHERE record_id=$1 AND version=$2 AND owner_user_id=$3 AND case_id=$4
$fn$;
CREATE FUNCTION agentstudio.monitor_live_freeze_begin(uuid,uuid,bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; m agentstudio.monitor_live_monitors; j agentstudio.monitor_live_freeze_jobs; manifest_value jsonb; manifest_text text; receipt_pins jsonb; stamp bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 c=agentstudio.monitor_live_lease($1,$2,$3);
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=c.monitor_id;
 IF c.run_id IS NULL OR NOT EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=c.run_id AND owner_user_id=c.owner_user_id AND status='succeeded') THEN RAISE EXCEPTION 'monitor_live_collection_not_finished'; END IF;
 IF c.status='freezing' AND c.freeze_job_id IS NOT NULL THEN
  SELECT * INTO j FROM agentstudio.monitor_live_freeze_jobs WHERE id=c.freeze_job_id AND check_id=c.id AND owner_user_id=c.owner_user_id AND case_id=c.case_id AND run_id=c.run_id FOR UPDATE;
  IF j.id IS NULL OR j.status NOT IN('pending','running') THEN RAISE EXCEPTION 'monitor_live_freeze_changed'; END IF;
  RETURN to_jsonb(j);
 END IF;
 IF c.status<>'collecting' OR c.freeze_job_id IS NOT NULL OR c.fact_set_id IS NOT NULL THEN RAISE EXCEPTION 'monitor_live_freeze_changed'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source_id',s.value->>'source_id','run_id',r.run_id,'result_id',r.id,'content_hash',r.content_hash,'projection_hash',r.projection_hash) ORDER BY s.ordinality),'[]'::jsonb) INTO receipt_pins
 FROM jsonb_array_elements(m.definition->'sources') WITH ORDINALITY s(value,ordinality)
 JOIN agentstudio.monitor_live_requests q ON q.check_id=c.id AND q.source_id=s.value->>'source_id' AND q.owner_user_id=c.owner_user_id AND q.case_id=c.case_id AND q.run_id=c.run_id AND q.state='captured' AND q.source_definition=s.value AND q.request_hash=s.value->>'request_hash'
 JOIN agentstudio.monitor_live_receipts r ON r.id=q.result_id AND r.request_id=q.id AND r.monitor_check_id=c.id AND r.owner_user_id=c.owner_user_id AND r.case_id=c.case_id AND r.run_id=c.run_id AND r.source_id=q.source_id AND r.request_hash=q.request_hash;
 IF jsonb_array_length(receipt_pins)<>jsonb_array_length(m.definition->'sources') OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_requests WHERE check_id=c.id AND state<>'captured') THEN RAISE EXCEPTION 'monitor_live_declared_source_missing'; END IF;
 manifest_value=agentstudio.monitor_live_manifest(c.owner_user_id,c.case_id);
 IF jsonb_array_length(manifest_value)>600 THEN RAISE EXCEPTION 'monitor_live_snapshot_limit'; END IF;
 SELECT '['||coalesce(string_agg('{"record_id":'||to_json(v.value->>'record_id')::text||',"version":'||(v.value->>'version')||'}',',' ORDER BY v.ordinality),'')||']' INTO manifest_text FROM jsonb_array_elements(manifest_value) WITH ORDINALITY v(value,ordinality);
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF c.lease_until_ms<=stamp OR c.wall_deadline_ms<=stamp THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 INSERT INTO agentstudio.monitor_live_freeze_jobs(id,owner_user_id,case_id,check_id,run_id,manifest,manifest_hash,next_index,records,reference_records,status,error,created_ms,updated_ms)
 VALUES(gen_random_uuid(),c.owner_user_id,c.case_id,c.id,c.run_id,manifest_value,encode(sha256(convert_to(manifest_text,'UTF8')),'hex'),0,'[]','[]','running','',stamp,stamp) RETURNING * INTO j;
 UPDATE agentstudio.monitor_live_checks SET status='freezing',freeze_job_id=j.id,receipts=receipt_pins,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
 RETURN to_jsonb(j);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_freeze_append(uuid,uuid,bigint,bigint,jsonb,jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; j agentstudio.monitor_live_freeze_jobs; r jsonb; expected_pin jsonb; merged_refs jsonb; i bigint=0; stamp bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 c=agentstudio.monitor_live_lease($1,$2,$3);
 SELECT * INTO j FROM agentstudio.monitor_live_freeze_jobs WHERE id=c.freeze_job_id AND check_id=c.id AND owner_user_id=c.owner_user_id AND case_id=c.case_id AND run_id=c.run_id FOR UPDATE;
 IF c.status<>'freezing' OR j.id IS NULL OR j.status<>'running' OR j.next_index<>$4 OR jsonb_typeof($5)<>'array' OR jsonb_array_length($5) NOT BETWEEN 1 AND 20 OR j.next_index+jsonb_array_length($5)>jsonb_array_length(j.manifest) OR jsonb_typeof($6)<>'array' OR jsonb_array_length($6)>1200 THEN RAISE EXCEPTION 'monitor_live_freeze_changed'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements($5) LOOP
  expected_pin=j.manifest->(j.next_index+i)::integer;
  IF r IS DISTINCT FROM agentstudio.monitor_live_record_dto((expected_pin->>'record_id')::uuid,(expected_pin->>'version')::bigint,c.owner_user_id,c.case_id) THEN RAISE EXCEPTION 'monitor_live_snapshot_changed'; END IF;
  i=i+1;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements($6) LOOP
  IF r IS DISTINCT FROM agentstudio.monitor_live_record_dto((r->>'record_id')::uuid,(r->>'version')::bigint,c.owner_user_id,c.case_id) THEN RAISE EXCEPTION 'monitor_live_snapshot_changed'; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(v.value ORDER BY v.value->>'record_id',(v.value->>'version')::bigint),'[]'::jsonb) INTO merged_refs FROM(SELECT DISTINCT value FROM jsonb_array_elements(j.reference_records||$6)) v;
 IF jsonb_array_length(merged_refs)>1200 OR octet_length((j.records||$5)::text)+octet_length(merged_refs::text)>16777216 THEN RAISE EXCEPTION 'monitor_live_snapshot_limit'; END IF;
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF c.lease_until_ms<=stamp OR c.wall_deadline_ms<=stamp THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 UPDATE agentstudio.monitor_live_freeze_jobs SET next_index=next_index+i,records=records||$5,reference_records=merged_refs,updated_ms=greatest(created_ms,stamp) WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_freeze_finish(uuid,uuid,bigint,jsonb,text) RETURNS uuid LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c agentstudio.monitor_live_checks; j agentstudio.monitor_live_freeze_jobs; r jsonb; expected_refs jsonb; expected_payload jsonb; fact_id uuid=gen_random_uuid(); prior_actor text; source_run uuid; stamp bigint;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') OR pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') THEN RAISE EXCEPTION 'monitor_live_worker_required'; END IF;
 c=agentstudio.monitor_live_lease($1,$2,$3);
 SELECT * INTO j FROM agentstudio.monitor_live_freeze_jobs WHERE id=c.freeze_job_id AND check_id=c.id AND owner_user_id=c.owner_user_id AND case_id=c.case_id AND run_id=c.run_id FOR UPDATE;
 IF c.status<>'freezing' OR j.id IS NULL OR j.status<>'running' OR j.next_index<>jsonb_array_length(j.manifest) OR jsonb_array_length(j.records)<>j.next_index OR j.manifest IS DISTINCT FROM agentstudio.monitor_live_manifest(c.owner_user_id,c.case_id) THEN RAISE EXCEPTION 'monitor_live_snapshot_changed'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(j.records||j.reference_records) LOOP
  IF r IS DISTINCT FROM agentstudio.monitor_live_record_dto((r->>'record_id')::uuid,(r->>'version')::bigint,c.owner_user_id,c.case_id) THEN RAISE EXCEPTION 'monitor_live_snapshot_changed'; END IF;
 END LOOP;
 WITH RECURSIVE pins(record_id,version) AS(
  SELECT (p.value->>'record_id')::uuid,(p.value->>'version')::bigint FROM jsonb_array_elements(j.records) r(value) CROSS JOIN LATERAL jsonb_array_elements(r.value->'relation_versions') p(value)
  UNION
  SELECT (p.value->>'record_id')::uuid,(p.value->>'version')::bigint FROM pins x JOIN agentstudio.monitor_live_records r ON r.record_id=x.record_id AND r.version=x.version AND r.owner_user_id=c.owner_user_id AND r.case_id=c.case_id CROSS JOIN LATERAL jsonb_array_elements(r.relation_versions) p(value)
 )
 SELECT coalesce(jsonb_agg(agentstudio.monitor_live_record_dto(x.record_id,x.version,c.owner_user_id,c.case_id) ORDER BY x.record_id,x.version),'[]'::jsonb) INTO expected_refs FROM pins x
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.records) base(value) WHERE base.value->>'record_id'=x.record_id::text AND (base.value->>'version')::bigint=x.version);
 IF expected_refs IS DISTINCT FROM j.reference_records THEN RAISE EXCEPTION 'monitor_live_snapshot_dependencies_changed'; END IF;
 expected_payload=jsonb_build_object('records',j.records,'reference_records',j.reference_records,'created_ms',j.created_ms);
 IF $4 IS DISTINCT FROM expected_payload OR NOT agentstudio.monitor_live_json_valid($4,$5,encode(sha256(convert_to($5,'UTF8')),'hex'),16777216) THEN RAISE EXCEPTION 'monitor_live_snapshot_changed'; END IF;
 prior_actor=current_setting('agentstudio.actor_id',true); PERFORM set_config('agentstudio.actor_id',c.owner_user_id::text,true);
 FOR source_run IN SELECT DISTINCT value::uuid FROM(
  SELECT c.run_id::text AS value
  UNION ALL SELECT nullif(r.value->>'run_id','') FROM jsonb_array_elements(j.records||j.reference_records) r(value)
  UNION ALL SELECT p.value->>'run_id' FROM jsonb_array_elements(j.records||j.reference_records) r(value) CROSS JOIN LATERAL jsonb_array_elements(r.value->'source_refs') p(value)
 ) sources WHERE value IS NOT NULL LOOP
  IF NOT agentstudio.knowledge_query_execution_validate_run(source_run,'') THEN RAISE EXCEPTION 'monitor_live_source_scope_changed'; END IF;
 END LOOP;
 PERFORM set_config('agentstudio.actor_id',coalesce(prior_actor,''),true);
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF c.lease_until_ms<=stamp OR c.wall_deadline_ms<=stamp THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 INSERT INTO agentstudio.monitor_live_fact_sets(id,owner_user_id,case_id,check_id,run_id,payload,canonical_payload,content_hash,created_ms) VALUES(fact_id,c.owner_user_id,c.case_id,c.id,c.run_id,$4,$5,encode(sha256(convert_to($5,'UTF8')),'hex'),j.created_ms);
 UPDATE agentstudio.monitor_live_freeze_jobs SET status='complete',updated_ms=greatest(created_ms,stamp) WHERE id=j.id;
 UPDATE agentstudio.monitor_live_checks SET status='analyzing',fact_set_id=fact_id,updated_ms=greatest(created_ms,stamp) WHERE id=c.id;
 RETURN fact_id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_effect_authorize(jsonb,text,jsonb,text,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE binding jsonb; c agentstudio.monitor_live_checks; d jsonb; slot agentstudio.monitor_live_effect_slots; source jsonb; mode text; stamp bigint; claim_value jsonb=$1->'claim';
BEGIN
 binding=agentstudio.monitor_live_worker_binding(claim_value);
 SELECT * INTO c FROM agentstudio.monitor_live_checks WHERE id=(binding->>'check_id')::uuid;
 c=agentstudio.monitor_live_lease(c.id,c.lease_token,c.lease_version);
 d=binding->'definition';
 IF $1->>'execution_mode' IS DISTINCT FROM 'agent_native_v2' OR $1->>'parent_step_key' IS NULL OR $1->>'step_key' !~ '^wf2_' OR NOT agentstudio.monitor_live_sha_valid($1->>'input_sha256') OR jsonb_typeof($3) IS DISTINCT FROM 'object' OR octet_length($4)>100000 OR $4::jsonb IS DISTINCT FROM $3
 OR NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e JOIN agentstudio.approvals a ON a.run_id=e.run_id AND a.owner_user_id=e.owner_user_id AND a.step_key=e.step_key WHERE e.run_id=c.run_id AND e.owner_user_id=c.owner_user_id AND e.step_key=$1->>'step_key' AND e.status='started' AND e.arguments_sha256=$1->>'input_sha256' AND a.status='approved' AND a.reason_code='wf2:'||($1->>'input_sha256') AND e.tool_name=CASE WHEN $2='model' THEN 'workflow:model' ELSE 'workflow:tool' END)
 THEN RAISE EXCEPTION 'monitor_effect_approval_changed'; END IF;
 IF EXISTS(SELECT 1 FROM agentstudio.monitor_live_effect_slots WHERE run_id=c.run_id AND step_key=$1->>'step_key') THEN RAISE EXCEPTION 'monitor_effect_already_reserved'; END IF;
 IF $2='model' AND $5 IS NULL THEN mode='model';
 ELSIF $2 IN('business_case_get','business_record_query','business_record_write','result_read') AND $5 IS NULL THEN mode='business';
 ELSE
  SELECT value INTO source FROM jsonb_array_elements(d->'sources') WHERE value->>'source_id'=$5 AND value->>'tool'=$2 AND value->'input'=$3;
  IF source IS NULL THEN RAISE EXCEPTION 'monitor_live_undeclared_request'; END IF;
  mode='source';
 END IF;
 IF mode='model' THEN
  IF c.model_calls>=(d->'execution_budget'->>'model_calls')::bigint THEN RAISE EXCEPTION 'monitor_model_budget_exhausted'; END IF;
  UPDATE agentstudio.monitor_live_checks SET model_calls=model_calls+1 WHERE id=c.id;
 ELSIF mode='business' THEN
  IF c.tool_calls>=(d->'execution_budget'->>'tool_calls')::bigint OR ($2<>'business_record_write' AND c.read_calls>=(d->'execution_budget'->>'read_calls')::bigint) THEN RAISE EXCEPTION 'monitor_business_budget_exhausted'; END IF;
  UPDATE agentstudio.monitor_live_checks SET tool_calls=tool_calls+1,read_calls=read_calls+CASE WHEN $2='business_record_write' THEN 0 ELSE 1 END WHERE id=c.id;
 END IF;
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF c.lease_until_ms<=stamp OR c.wall_deadline_ms<=stamp THEN RAISE EXCEPTION 'monitor_live_lease_lost'; END IF;
 INSERT INTO agentstudio.monitor_live_effect_slots(id,owner_user_id,case_id,check_id,run_id,step_key,input_sha256,tool,kind,source_id,arguments,arguments_canonical,claim,created_ms)
 VALUES(gen_random_uuid(),c.owner_user_id,c.case_id,c.id,c.run_id,$1->>'step_key',$1->>'input_sha256',$2,mode,$5,$3,$4,claim_value,stamp) RETURNING * INTO slot;
 RETURN jsonb_build_object('slot_id',slot.id,'check_id',c.id,'owner_user_id',c.owner_user_id,'case_id',c.case_id,'run_id',c.run_id,'lease_token',c.lease_token,'lease_version',c.lease_version,'source_id',$5,'kind',mode);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_worker_probe(jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.jobs; login record;
BEGIN
 SELECT * INTO login FROM pg_catalog.pg_roles WHERE rolname=session_user;
 IF current_setting('role')<>'agentstudio_worker' OR NOT login.rolcanlogin OR login.rolinherit OR login.rolsuper OR login.rolbypassrls OR login.rolcreaterole OR login.rolcreatedb OR login.rolreplication
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles g WHERE g.oid<>login.oid AND pg_has_role(login.oid,g.oid,'MEMBER') AND g.rolname NOT IN('agentstudio_api','agentstudio_worker'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=login.oid AND (admin_option OR inherit_option OR NOT set_option)) THEN RAISE EXCEPTION 'monitor_original_worker_login_required'; END IF;
 SELECT * INTO j FROM agentstudio.jobs WHERE id=($1->>'job_id')::uuid AND run_id=($1->>'run_id')::uuid AND status='leased' AND lease_token=($1->>'lease_token')::uuid AND lease_version=($1->>'lease_version')::bigint AND lease_owner=$1->>'lease_owner' AND lease_until>clock_timestamp() AND kind='run_tick' AND payload->>'phase'='agent_native_v2' FOR SHARE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'monitor_worker_lease_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_checks WHERE run_id=j.run_id AND owner_user_id=j.owner_user_id) THEN RETURN NULL; END IF;
 RETURN agentstudio.monitor_live_worker_binding($1);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_author(uuid,uuid,bigint,jsonb,text,text,text,text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id(); m agentstudio.monitor_live_monitors; s agentstudio.schedules; stamp bigint; expected_revision bigint=coalesce($3,0); mid uuid;
BEGIN
 PERFORM agentstudio.monitor_live_employee(owner_id);
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=$1 AND owner_user_id=owner_id FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof($4) IS DISTINCT FROM 'object' OR $4->>'case_id' IS DISTINCT FROM $1::text OR NOT agentstudio.monitor_live_json_valid($4,$5,$6,100000) OR length($7) NOT BETWEEN 1 AND 120 OR NOT agentstudio.monitor_live_sha_valid($8) THEN RAISE EXCEPTION 'invalid_monitor_definition'; END IF;
 SELECT * INTO s FROM agentstudio.schedules WHERE id=($4->>'schedule_id')::uuid AND owner_user_id=owner_id AND deleted_at IS NULL FOR UPDATE;
 IF s.id IS NULL OR s.kind<>'agent' OR s.recurrence->>'config_format'<>'pg_schedule_execution_v3' OR s.execution->>'background_ack'<>'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1' OR s.agent_spec_id::text<>$4->>'spec_id' OR (s.execution->>'target_revision')::bigint<>($4->>'spec_revision')::bigint THEN RAISE EXCEPTION 'monitor_native_schedule_authorization_required'; END IF;
 IF $2 IS NULL THEN
  SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE owner_user_id=owner_id AND idempotency_key=$7;
  IF m.id IS NOT NULL THEN IF m.request_hash<>$8 THEN RAISE EXCEPTION 'monitor_idempotency_conflict'; END IF; RETURN m.id; END IF;
  IF expected_revision<>0 OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_monitors WHERE schedule_id=s.id) THEN RAISE EXCEPTION 'monitor_schedule_already_bound'; END IF;
  mid=gen_random_uuid();
 ELSE
  SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=$2 AND owner_user_id=owner_id AND case_id=$1 FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'monitor_not_found'; END IF;
  IF EXISTS(SELECT 1 FROM agentstudio.monitor_live_versions WHERE monitor_id=m.id AND idempotency_key=$7 AND request_hash=$8) THEN RETURN m.id; END IF;
  IF m.revision<>expected_revision OR m.schedule_id<>s.id OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_versions WHERE monitor_id=m.id AND idempotency_key=$7) THEN RAISE EXCEPTION 'monitor_definition_changed'; END IF;
  mid=m.id;
 END IF;
 IF NOT agentstudio.schedule_control(s.id,s.revision,'pause') THEN RAISE EXCEPTION 'monitor_schedule_changed'; END IF;
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF $2 IS NULL THEN
  INSERT INTO agentstudio.monitor_live_monitors(id,owner_user_id,case_id,schedule_id,revision,enabled,definition,definition_hash,baseline_check_id,current_check_id,idempotency_key,request_hash,created_ms,updated_ms)
  VALUES(mid,owner_id,$1,s.id,1,false,$4,$6,NULL,NULL,$7,$8,stamp,stamp);
 ELSE
  UPDATE agentstudio.monitor_live_checks SET status='cancelled',error='monitor_definition_changed',lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,stamp) WHERE monitor_id=mid AND owner_user_id=owner_id AND status IN('collecting','freezing','analyzing','needs_review');
  UPDATE agentstudio.monitor_live_monitors SET revision=revision+1,enabled=false,definition=$4,definition_hash=$6,baseline_check_id=NULL,current_check_id=NULL,updated_ms=greatest(created_ms,stamp) WHERE id=mid;
 END IF;
 INSERT INTO agentstudio.monitor_live_versions(monitor_id,revision,owner_user_id,case_id,definition,definition_hash,idempotency_key,request_hash,created_ms)
 VALUES(mid,expected_revision+1,owner_id,$1,$4,$6,$7,$8,stamp);
 RETURN mid;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_control(uuid,bigint,bigint,boolean,bigint) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id(); m agentstudio.monitor_live_monitors; s agentstudio.schedules; stamp bigint; prior_case uuid;
BEGIN
 PERFORM agentstudio.monitor_live_employee(owner_id);
 SELECT case_id INTO prior_case FROM agentstudio.monitor_live_monitors WHERE id=$1 AND owner_user_id=owner_id;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=prior_case AND owner_user_id=owner_id FOR UPDATE;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=$1 AND owner_user_id=owner_id FOR UPDATE;
 SELECT * INTO s FROM agentstudio.schedules WHERE id=m.schedule_id AND owner_user_id=owner_id AND deleted_at IS NULL FOR UPDATE;
 IF m.id IS NULL OR s.id IS NULL OR m.revision<>$2 OR s.revision<>$3 OR $4 IS NULL THEN RAISE EXCEPTION 'monitor_control_changed'; END IF;
 -- The original UI timestamp is a bounded start hint, not a new Native
 -- activation. Existing Native authority and next_at remain authoritative.
 IF $4 THEN
  IF NOT s.enabled OR NOT EXISTS(SELECT 1 FROM agentstudio.schedule_execution_authorities a WHERE a.schedule_id=s.id AND a.schedule_revision=s.revision AND a.owner_user_id=owner_id AND agentstudio.schedule_authority_current(a.id)) OR ($5 IS NOT NULL AND ($5<floor(extract(epoch FROM clock_timestamp())*1000)::bigint-90000 OR $5>floor(extract(epoch FROM clock_timestamp())*1000)::bigint+31708800000)) THEN RAISE EXCEPTION 'monitor_schedule_reauthorization_required'; END IF;
 ELSE
  IF NOT agentstudio.schedule_control(s.id,s.revision,'pause') THEN RAISE EXCEPTION 'monitor_schedule_changed'; END IF;
 END IF;
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF NOT $4 THEN
  UPDATE agentstudio.monitor_live_checks SET status='cancelled',error='monitor_paused',lease_owner=NULL,lease_token=NULL,lease_until_ms=0,updated_ms=greatest(created_ms,stamp) WHERE monitor_id=m.id AND owner_user_id=owner_id AND status IN('collecting','freezing','analyzing','needs_review');
 END IF;
 UPDATE agentstudio.monitor_live_monitors SET enabled=$4,current_check_id=CASE WHEN $4 THEN current_check_id ELSE NULL END,updated_ms=greatest(created_ms,stamp) WHERE id=m.id;
 RETURN m.id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_schedule_ready(uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE m agentstudio.monitor_live_monitors;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'monitor_original_worker_login_required'; END IF;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE schedule_id=$1;
 IF m.id IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=m.case_id AND owner_user_id=m.owner_user_id FOR UPDATE;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=m.id FOR UPDATE;
 IF NOT m.enabled OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_checks WHERE monitor_id=m.id AND owner_user_id=m.owner_user_id AND status IN('collecting','freezing','analyzing','needs_review')) THEN RAISE EXCEPTION 'previous_monitor_check_incomplete'; END IF;
 RETURN true;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_open_occurrence(uuid,uuid) RETURNS uuid LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o agentstudio.schedule_occurrences; x agentstudio.schedule_execution_origins; m agentstudio.monitor_live_monitors; c agentstudio.monitor_live_checks; s agentstudio.schedules; stamp bigint; prior_actor text; resource text;
BEGIN
 IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'monitor_original_worker_login_required'; END IF;
 SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE id=$1;
 SELECT * INTO x FROM agentstudio.schedule_execution_origins WHERE occurrence_id=o.id AND owner_user_id=o.owner_user_id AND run_id=$2;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE schedule_id=o.schedule_id AND owner_user_id=o.owner_user_id;
 IF m.id IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=m.case_id AND owner_user_id=m.owner_user_id FOR UPDATE;
 SELECT * INTO m FROM agentstudio.monitor_live_monitors WHERE id=m.id FOR UPDATE;
 SELECT * INTO s FROM agentstudio.schedules WHERE id=m.schedule_id AND owner_user_id=m.owner_user_id AND deleted_at IS NULL FOR SHARE;
 SELECT * INTO c FROM agentstudio.monitor_live_checks WHERE occurrence_id=o.id;
 IF c.id IS NOT NULL THEN IF c.run_id IS DISTINCT FROM $2 OR c.monitor_id<>m.id THEN RAISE EXCEPTION 'monitor_occurrence_changed'; END IF; RETURN c.id; END IF;
 IF x.run_id IS NULL OR o.planned_run_id<>$2 OR NOT m.enabled OR s.id IS NULL OR s.revision<>o.schedule_revision OR NOT agentstudio.schedule_authority_current(x.authority_id)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=$2 AND r.owner_user_id=m.owner_user_id AND r.kind='agent' AND r.agent_spec_id=s.agent_spec_id AND r.status='queued')
 OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_checks WHERE monitor_id=m.id AND owner_user_id=m.owner_user_id AND status IN('collecting','freezing','analyzing','needs_review')) THEN RAISE EXCEPTION 'monitor_occurrence_changed'; END IF;
 prior_actor=current_setting('agentstudio.actor_id',true);PERFORM set_config('agentstudio.actor_id',m.owner_user_id::text,true);
 resource=agentstudio.schedule_resource_fingerprint(s.id,s.execution->'model_binding');
 IF resource IS DISTINCT FROM m.definition->>'schedule_resource_hash' OR NOT agentstudio.knowledge_query_execution_validate_run($2,'') THEN RAISE EXCEPTION 'monitor_execution_scope_changed'; END IF;
 PERFORM set_config('agentstudio.actor_id',coalesce(prior_actor,''),true);
 stamp=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 INSERT INTO agentstudio.monitor_live_checks(id,owner_user_id,monitor_id,case_id,monitor_revision,schedule_revision,occurrence_id,run_id,definition_hash,resource_hash,status,fact_set_id,freeze_job_id,baseline_check_id,receipts,assessment,error,lease_owner,lease_token,lease_version,lease_until_ms,tool_calls,read_calls,model_calls,wall_deadline_ms,created_ms,updated_ms)
 VALUES(gen_random_uuid(),m.owner_user_id,m.id,m.case_id,m.revision,s.revision,o.id,$2,m.definition_hash,resource,'collecting',NULL,NULL,m.baseline_check_id,'[]','{}','',NULL,NULL,0,0,0,0,0,stamp+(m.definition->'execution_budget'->>'wall_ms')::bigint,stamp,stamp) RETURNING * INTO c;
 UPDATE agentstudio.monitor_live_monitors SET current_check_id=c.id,updated_ms=greatest(created_ms,stamp) WHERE id=m.id;
 RETURN c.id;
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_effect_current(uuid) RETURNS boolean LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(
 SELECT 1 FROM agentstudio.monitor_live_effect_slots s
 JOIN agentstudio.jobs j ON j.id=(s.claim->>'job_id')::uuid AND j.run_id=s.run_id AND j.owner_user_id=s.owner_user_id AND j.status='leased' AND j.lease_token=(s.claim->>'lease_token')::uuid AND j.lease_version=(s.claim->>'lease_version')::bigint AND j.lease_owner=s.claim->>'lease_owner' AND j.lease_until>clock_timestamp()+interval '9 seconds'
 JOIN agentstudio.runs r ON r.id=s.run_id AND r.owner_user_id=s.owner_user_id AND r.status='running'
 JOIN agentstudio.approvals a ON a.run_id=s.run_id AND a.owner_user_id=s.owner_user_id AND a.step_key=s.step_key AND a.status='approved' AND a.reason_code='wf2:'||s.input_sha256
 JOIN agentstudio.external_effects e ON e.run_id=s.run_id AND e.owner_user_id=s.owner_user_id AND e.step_key=s.step_key AND e.status='started' AND e.arguments_sha256=s.input_sha256 AND e.tool_name='workflow:tool'
 JOIN agentstudio.external_effects dispatch ON dispatch.run_id=s.run_id AND dispatch.owner_user_id=s.owner_user_id AND dispatch.step_key='wf2_tool:'||s.step_key AND dispatch.status='started' AND dispatch.arguments_sha256=s.input_sha256 AND dispatch.tool_name='workflow.tool_bound_dispatch'
 WHERE s.id=$1 AND s.kind='source')
$fn$;
REVOKE ALL ON agentstudio.monitor_live_cases FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_cases_owner ON agentstudio.monitor_live_cases FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_cases TO agentstudio_api;
CREATE TRIGGER monitor_live_cases_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_cases FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_monitors FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_monitors FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_monitors_owner ON agentstudio.monitor_live_monitors FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_monitors TO agentstudio_api;
CREATE TRIGGER monitor_live_monitors_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_monitors FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_state_guard();
REVOKE ALL ON agentstudio.monitor_live_versions FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_versions_owner ON agentstudio.monitor_live_versions FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_versions TO agentstudio_api;
CREATE TRIGGER monitor_live_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_versions FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_checks FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_checks_owner ON agentstudio.monitor_live_checks FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_checks TO agentstudio_api;
CREATE TRIGGER monitor_live_checks_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_checks FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_state_guard();
REVOKE ALL ON agentstudio.monitor_live_requests FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_requests_owner ON agentstudio.monitor_live_requests FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_requests TO agentstudio_api;
CREATE TRIGGER monitor_live_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_requests FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_state_guard();
REVOKE ALL ON agentstudio.monitor_live_receipts FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_receipts_owner ON agentstudio.monitor_live_receipts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_receipts TO agentstudio_api;
CREATE TRIGGER monitor_live_receipts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_receipts FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_records FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_records FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_records_owner ON agentstudio.monitor_live_records FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_records TO agentstudio_api;
CREATE TRIGGER monitor_live_records_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_records FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_fact_sets FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_fact_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_fact_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_fact_sets_owner ON agentstudio.monitor_live_fact_sets FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_fact_sets TO agentstudio_api;
CREATE TRIGGER monitor_live_fact_sets_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_fact_sets FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_freeze_jobs FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_freeze_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_freeze_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_freeze_jobs_owner ON agentstudio.monitor_live_freeze_jobs FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_freeze_jobs TO agentstudio_api;
CREATE TRIGGER monitor_live_freeze_jobs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_freeze_jobs FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_state_guard();
REVOKE ALL ON agentstudio.monitor_live_record_reviews FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_record_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_record_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_record_reviews_owner ON agentstudio.monitor_live_record_reviews FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_record_reviews TO agentstudio_api;
CREATE TRIGGER monitor_live_record_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_record_reviews FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_reviews FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_reviews_owner ON agentstudio.monitor_live_reviews FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_reviews TO agentstudio_api;
CREATE TRIGGER monitor_live_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_reviews FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_events FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_events FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_events_owner ON agentstudio.monitor_live_events FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_events TO agentstudio_api;
CREATE TRIGGER monitor_live_events_immutable BEFORE DELETE OR TRUNCATE ON agentstudio.monitor_live_events FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
CREATE TRIGGER monitor_live_events_read_guard BEFORE UPDATE ON agentstudio.monitor_live_events FOR EACH ROW EXECUTE FUNCTION agentstudio.monitor_live_read_guard();
REVOKE ALL ON agentstudio.monitor_live_reads FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_reads_owner ON agentstudio.monitor_live_reads FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_reads TO agentstudio_api;
CREATE TRIGGER monitor_live_reads_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_reads FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
REVOKE ALL ON agentstudio.monitor_live_effect_slots FROM PUBLIC;
ALTER TABLE agentstudio.monitor_live_effect_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.monitor_live_effect_slots FORCE ROW LEVEL SECURITY;
CREATE POLICY monitor_live_effect_slots_owner ON agentstudio.monitor_live_effect_slots FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.monitor_live_effect_slots TO agentstudio_api;
CREATE TRIGGER monitor_live_effect_slots_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.monitor_live_effect_slots FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.monitor_live_immutable();
-- Read locks run as the reviewed migration owner. API table ACLs remain SELECT-only.
-- These three closed DTO readers grant no mutation, lease or approval authority.
CREATE FUNCTION agentstudio.monitor_live_case_read_lock(uuid,uuid,boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid=agentstudio.actor_id(); v_case agentstudio.monitor_live_cases;
BEGIN
 IF current_setting('role') IS DISTINCT FROM 'agentstudio_api' OR v_owner IS NULL OR v_owner IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'owned_admission_context_required'; END IF;
 -- Existing API and leased Worker-to-API paths both require an active local employee Actor.
 -- Employee-only review checks and Worker lease/CAS RPCs remain separate and unchanged.
 IF agentstudio.agent_memory_outcome_epoch() IS NULL THEN RAISE EXCEPTION 'monitor_live_session_required'; END IF;
 IF $3 THEN
  SELECT r.* INTO v_case FROM agentstudio.monitor_live_cases r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR UPDATE;
 ELSE
  SELECT r.* INTO v_case FROM agentstudio.monitor_live_cases r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR SHARE;
 END IF;
 IF v_case.id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_case.id,'title',v_case.title,'data_space',v_case.data_space,'questions',v_case.questions,'created_ms',v_case.created_ms::text);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_monitor_read_lock(uuid,uuid,boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid=agentstudio.actor_id(); v_monitor agentstudio.monitor_live_monitors;
BEGIN
 IF current_setting('role') IS DISTINCT FROM 'agentstudio_api' OR v_owner IS NULL OR v_owner IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'owned_admission_context_required'; END IF;
 -- Existing API and leased Worker-to-API paths both require an active local employee Actor.
 -- Employee-only review checks and Worker lease/CAS RPCs remain separate and unchanged.
 IF agentstudio.agent_memory_outcome_epoch() IS NULL THEN RAISE EXCEPTION 'monitor_live_session_required'; END IF;
 IF $3 THEN
  SELECT r.* INTO v_monitor FROM agentstudio.monitor_live_monitors r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR UPDATE;
 ELSE
  SELECT r.* INTO v_monitor FROM agentstudio.monitor_live_monitors r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR SHARE;
 END IF;
 IF v_monitor.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_cases c WHERE c.id=v_monitor.case_id AND c.owner_user_id=v_owner) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_monitor.id,'owner_user_id',v_monitor.owner_user_id,'case_id',v_monitor.case_id,'revision',v_monitor.revision::text,'enabled',v_monitor.enabled,'definition_hash',v_monitor.definition_hash,'definition',v_monitor.definition,'baseline_check_id',v_monitor.baseline_check_id,'current_check_id',v_monitor.current_check_id);
END
$fn$;
CREATE FUNCTION agentstudio.monitor_live_check_read_lock(uuid,uuid,boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_owner uuid=agentstudio.actor_id(); v_check agentstudio.monitor_live_checks;
BEGIN
 IF current_setting('role') IS DISTINCT FROM 'agentstudio_api' OR v_owner IS NULL OR v_owner IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'owned_admission_context_required'; END IF;
 -- Existing API and leased Worker-to-API paths both require an active local employee Actor.
 -- Employee-only review checks and Worker lease/CAS RPCs remain separate and unchanged.
 IF agentstudio.agent_memory_outcome_epoch() IS NULL THEN RAISE EXCEPTION 'monitor_live_session_required'; END IF;
 IF $3 THEN
  SELECT r.* INTO v_check FROM agentstudio.monitor_live_checks r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR UPDATE;
 ELSE
  SELECT r.* INTO v_check FROM agentstudio.monitor_live_checks r WHERE r.id=$1 AND r.owner_user_id=v_owner FOR SHARE;
 END IF;
 IF v_check.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.monitor_live_cases c WHERE c.id=v_check.case_id AND c.owner_user_id=v_owner) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_check.id,'owner_user_id',v_check.owner_user_id,'monitor_id',v_check.monitor_id,'case_id',v_check.case_id,'monitor_revision',v_check.monitor_revision::text,'definition_hash',v_check.definition_hash,'run_id',v_check.run_id,'status',v_check.status,'fact_set_id',v_check.fact_set_id,'baseline_check_id',v_check.baseline_check_id,'receipts',v_check.receipts,'assessment',v_check.assessment,'error',v_check.error,'created_ms',v_check.created_ms::text);
END
$fn$;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_sha_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_json_valid(jsonb,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_state_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_employee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_read_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_ack(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_ack(uuid,uuid) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_cases_value_valid(text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_cases_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_monitors_value_valid(bigint,jsonb,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_monitors_time_valid(bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_versions_value_valid(bigint,jsonb,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_versions_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_checks_value_valid(bigint,bigint,text,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_checks_lease_valid(text,uuid,bigint,bigint,bigint,bigint,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_checks_time_valid(bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_requests_value_valid(text,text,jsonb,bigint,text,text,bigint,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_receipts_value_valid(text,text,text,jsonb,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_receipts_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_records_value_valid(bigint,text,jsonb,jsonb,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_records_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_fact_sets_value_valid(jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_fact_sets_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_freeze_jobs_value_valid(jsonb,text,bigint,jsonb,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_freeze_jobs_time_valid(bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_record_reviews_value_valid(bigint,text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_record_reviews_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_reviews_value_valid(text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_reviews_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_events_value_valid(text,text,jsonb,boolean,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_events_time_valid(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_reads_value_valid(bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_lease(uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_claim(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_claim(text,bigint) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_renew(uuid,uuid,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_renew(uuid,uuid,bigint,bigint) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_begin_request(uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_begin_request(uuid,uuid,bigint,text) TO agentstudio_monitor_dispatch;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_capture_valid(jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_finish_request(uuid,uuid,bigint,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_finish_request(uuid,uuid,bigint,jsonb,text,text) TO agentstudio_monitor_dispatch;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_fail_request(uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_fail_request(uuid,uuid,bigint,text) TO agentstudio_monitor_dispatch;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_expire_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_expire_checks() TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_connection_fingerprint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_connection_fingerprint(uuid) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_transport_material(uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_transport_material(uuid,uuid,bigint) TO agentstudio_monitor_dispatch;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_run_context(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_worker_binding(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_worker_binding(jsonb) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_case_create(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_case_create(jsonb) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_record_review(uuid,uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_record_review(uuid,uuid,bigint,text,text) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_record_write(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_record_write(uuid,jsonb,jsonb) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_record_write(uuid,jsonb,jsonb) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_analysis_context(uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_semantic_rows(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_check_review(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_check_review(uuid,text,text,text) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_check_state(uuid,uuid,bigint,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_check_state(uuid,uuid,bigint,text,text,text,jsonb) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_check_state(uuid,uuid,bigint,text,text,text,jsonb) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_assessment_commit(uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_assessment_commit(uuid,uuid,bigint,text,text,jsonb) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_assessment_commit(uuid,uuid,bigint,text,text,jsonb) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_manifest(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_record_dto(uuid,bigint,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_freeze_begin(uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_freeze_begin(uuid,uuid,bigint) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_freeze_append(uuid,uuid,bigint,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_freeze_append(uuid,uuid,bigint,bigint,jsonb,jsonb) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_freeze_finish(uuid,uuid,bigint,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_freeze_finish(uuid,uuid,bigint,jsonb,text) TO agentstudio_monitor_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_effect_slots_value_valid(text,text,text,text,text,jsonb,text,jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_effect_authorize(jsonb,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_effect_authorize(jsonb,text,jsonb,text,text) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_worker_probe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_worker_probe(jsonb) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_author(uuid,uuid,bigint,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_author(uuid,uuid,bigint,jsonb,text,text,text,text) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_control(uuid,bigint,bigint,boolean,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_control(uuid,bigint,bigint,boolean,bigint) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_schedule_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_schedule_ready(uuid) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_open_occurrence(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_open_occurrence(uuid,uuid) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_effect_current(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_case_read_lock(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_case_read_lock(uuid,uuid,boolean) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_monitor_read_lock(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_monitor_read_lock(uuid,uuid,boolean) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.monitor_live_check_read_lock(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_check_read_lock(uuid,uuid,boolean) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_074','Owned monitor live ledger and fenced capture source; no Worker or route enabled');
COMMIT;
