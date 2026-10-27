-- Optional private execution foundation. No existing login memberships,
-- production activation, HTTP route, provider transport or default init change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper)
    OR pg_is_in_recovery() OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_056')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_057')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_review_worker','agentstudio_review_dispatch'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,17)='agent_assessment_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND left(p.proname,17)='agent_assessment_')
  THEN RAISE EXCEPTION 'agent_assessment_installation_refused'; END IF;
END $check$;
CREATE ROLE agentstudio_review_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE agentstudio_review_dispatch NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_review_worker,agentstudio_review_dispatch;
-- Required by the readonly predecessor audit; never grants private data.
GRANT SELECT(version) ON agentstudio.schema_migrations TO agentstudio_review_worker,agentstudio_review_dispatch;

CREATE TABLE agentstudio.agent_assessment_leases(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,worker_id uuid NOT NULL,lease_token uuid NOT NULL,lease_version bigint NOT NULL,
  lease_expires_at timestamptz NOT NULL,state text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),UNIQUE(lease_token),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_assessment_effects(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,effect_id uuid NOT NULL,worker_id uuid NOT NULL,lease_token uuid NOT NULL,lease_version bigint NOT NULL,
  request_sha256 text NOT NULL,input_sha256 text NOT NULL,content_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),UNIQUE(effect_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_assessment_leases(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_assessment_outcomes(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,effect_id uuid NOT NULL,status text NOT NULL,completion_sha256 text NOT NULL,
  result_sha256 text,failure_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_assessment_effects(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(effect_id) REFERENCES agentstudio.agent_assessment_effects(effect_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_assessment_outputs(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,effect_id uuid NOT NULL,result jsonb NOT NULL,result_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_inputs(owner_user_id,request_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_assessment_outcomes(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(effect_id) REFERENCES agentstudio.agent_assessment_effects(effect_id) ON DELETE RESTRICT
);

-- Input is already normalized by the existing strict JS parser. Check the
-- same UTF-16 limits/trim/masking here; never truncate or silently coerce it.
CREATE FUNCTION agentstudio.agent_assessment_text_valid(text,integer,boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE size integer; normalized text;
BEGIN
  SELECT (char_length($1)+count(*) FILTER(WHERE ascii(c)>65535))::integer INTO size FROM regexp_split_to_table($1,'') c;
  IF size>$2 OR $1 ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]' THEN RETURN false; END IF;
  normalized:=btrim($1,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  normalized:=regexp_replace(normalized,'sk-[A-Za-z0-9_-]{8,}','***','g');
  normalized:=regexp_replace(normalized,'Bearer\s+\S+','Bearer ***','g');
  normalized:=regexp_replace(normalized,'token=\S+','token=***','g');
  normalized:=regexp_replace(normalized,'api_key=\S+','api_key=***','g');
  RETURN normalized=$1 AND (NOT $3 OR size>0);
END $fn$;
CREATE FUNCTION agentstudio.agent_assessment_result_valid(text,jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE item jsonb; field record; position integer:=0; dimensions text[]:=ARRAY['目标达成','过程效率','工具使用','输出质量','指令遵循'];
BEGIN
  IF jsonb_typeof($2)<>'object' OR octet_length(agentstudio.agent_optimization_compact($2))>262144 THEN RETURN false; END IF;
  IF $1='evaluate' THEN
    IF ($2-ARRAY['score','dimensions','suggestions']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($2))=3
      AND jsonb_typeof($2->'score')='number' AND $2->>'score' ~ '^(0|[1-9][0-9]?|100)$'
      AND jsonb_typeof($2->'dimensions')='array' AND jsonb_array_length($2->'dimensions')=5
      AND jsonb_typeof($2->'suggestions')='array' AND jsonb_array_length($2->'suggestions')<=5) IS NOT TRUE THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements($2->'dimensions') LOOP
      position:=position+1;
      IF (jsonb_typeof(item)='object' AND item-ARRAY['name','score','comment']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(item))=3
        AND item->>'name'=dimensions[position] AND jsonb_typeof(item->'score')='number' AND item->>'score' ~ '^(0|[1-9][0-9]?|100)$'
        AND jsonb_typeof(item->'comment')='string' AND agentstudio.agent_assessment_text_valid(item->>'comment',120,true)) IS NOT TRUE THEN RETURN false; END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements($2->'suggestions') LOOP
      IF (jsonb_typeof(item)='string' AND agentstudio.agent_assessment_text_valid(item#>>'{}',200,true)) IS NOT TRUE THEN RETURN false; END IF;
    END LOOP;
  ELSIF $1='optimize' THEN
    IF ($2-ARRAY['descriptive','tools_note','rationale']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($2))=3
      AND jsonb_typeof($2->'descriptive')='object' AND (SELECT count(*) FROM jsonb_object_keys($2->'descriptive')) BETWEEN 1 AND 5
      AND ($2->'descriptive')-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria']='{}'::jsonb
      AND jsonb_typeof($2->'tools_note')='string' AND agentstudio.agent_assessment_text_valid($2->>'tools_note',400,false)
      AND jsonb_typeof($2->'rationale')='string' AND agentstudio.agent_assessment_text_valid($2->>'rationale',400,true)) IS NOT TRUE THEN RETURN false; END IF;
    FOR field IN SELECT * FROM jsonb_each($2->'descriptive') LOOP
      IF field.key IN('goal','task_scope') THEN
        IF (jsonb_typeof(field.value)='string' AND agentstudio.agent_assessment_text_valid(field.value#>>'{}',CASE field.key WHEN 'goal' THEN 3000 ELSE 4000 END,field.key='goal')) IS NOT TRUE THEN RETURN false; END IF;
      ELSE
        IF (jsonb_typeof(field.value)='array' AND jsonb_array_length(field.value)<=30) IS NOT TRUE THEN RETURN false; END IF;
        FOR item IN SELECT value FROM jsonb_array_elements(field.value) LOOP
          IF (jsonb_typeof(item)='string' AND agentstudio.agent_assessment_text_valid(item#>>'{}',500,false)) IS NOT TRUE THEN RETURN false; END IF;
        END LOOP;
      END IF;
    END LOOP;
  ELSE RETURN false;
  END IF;
  RETURN true;
END $fn$;

CREATE FUNCTION agentstudio.agent_assessment_claim(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE candidate record; prior record; epoch bigint; version bigint; token uuid; expires timestamptz;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_review_worker' OR $1 IS NULL THEN RAISE EXCEPTION 'agent_assessment_worker_required'; END IF;
  -- No540 acquisition anywhere in this routine. Epoch -> request -> lease;
  -- claim commits before the Broker begins its separate API source transaction.
  FOR candidate IN SELECT r.owner_user_id,r.request_id,r.run_id,r.owner_epoch FROM agentstudio.agent_review_requests r
    JOIN agentstudio.agent_review_jobs j USING(owner_user_id,request_id) JOIN agentstudio.agent_review_inputs i USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_assessment_leases l USING(owner_user_id,request_id)
    JOIN agentstudio_auth.accounts a ON a.user_id=r.owner_user_id AND a.enabled AND a.governance_revision=r.owner_epoch
    JOIN agentstudio.users u ON u.id=r.owner_user_id AND u.external_issuer='urn:agentstudio:local:v1' AND u.status='active'
    WHERE j.state='pending' AND (l.request_id IS NULL OR l.state='claimed' AND l.lease_expires_at<=clock_timestamp() AND l.lease_version<9007199254740989)
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones t WHERE t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id)
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_assessment_effects e WHERE e.owner_user_id=r.owner_user_id AND e.request_id=r.request_id)
    ORDER BY r.created_at,r.owner_user_id,r.request_id LIMIT 16 LOOP
    SELECT governance_revision INTO epoch FROM agentstudio_auth.accounts WHERE user_id=candidate.owner_user_id AND enabled FOR SHARE;
    IF NOT FOUND OR epoch<>candidate.owner_epoch OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN CONTINUE; END IF;
    PERFORM 1 FROM agentstudio.users WHERE id=candidate.owner_user_id AND external_issuer='urn:agentstudio:local:v1' AND status='active' FOR SHARE;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM 1 FROM agentstudio.agent_review_requests WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_review_jobs WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id AND state='pending')
      OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_review_inputs WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id)
      OR EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id)
      OR EXISTS(SELECT 1 FROM agentstudio.agent_assessment_effects WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id) THEN CONTINUE; END IF;
    SELECT * INTO prior FROM agentstudio.agent_assessment_leases WHERE owner_user_id=candidate.owner_user_id AND request_id=candidate.request_id FOR UPDATE;
    IF FOUND THEN
      IF prior.state<>'claimed' OR prior.lease_expires_at>clock_timestamp() OR prior.lease_version>=9007199254740989 THEN CONTINUE; END IF;
      version:=prior.lease_version+1;
    ELSE version:=1;
    END IF;
    token:=gen_random_uuid();expires:=clock_timestamp()+interval '90 seconds';
    INSERT INTO agentstudio.agent_assessment_leases(owner_user_id,request_id,worker_id,lease_token,lease_version,lease_expires_at,state)
      VALUES(candidate.owner_user_id,candidate.request_id,$1,token,version,expires,'claimed')
      ON CONFLICT(owner_user_id,request_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,lease_token=EXCLUDED.lease_token,lease_version=EXCLUDED.lease_version,lease_expires_at=EXCLUDED.lease_expires_at,state='claimed';
    INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
      VALUES(candidate.owner_user_id,candidate.owner_user_id,candidate.run_id,'agent_assessment.claimed','agent_review',candidate.request_id::text,'succeeded',jsonb_build_object('worker_id',$1,'lease_version',version));
    RETURN jsonb_build_object('request_id',candidate.request_id,'lease_token',token,'lease_version',version,'worker_id',$1,'lease_expires_at',expires);
  END LOOP;
  RETURN NULL;
END $fn$;

CREATE FUNCTION agentstudio.agent_assessment_context(uuid,uuid,bigint,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE lease record; review record; private_body jsonb; epoch bigint; subject text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_review_dispatch' THEN RAISE EXCEPTION 'agent_assessment_dispatch_required'; END IF;
  IF $1 IS NULL OR $2 IS NULL OR $4 IS NULL OR $3 IS NULL OR $3 NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  SELECT * INTO lease FROM agentstudio.agent_assessment_leases WHERE request_id=$1 AND lease_token=$2 AND lease_version=$3 AND worker_id=$4;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  -- Epoch rows precede request/lease rows; never wait for540 while holding them.
  SELECT governance_revision INTO epoch FROM agentstudio_auth.accounts WHERE user_id=lease.owner_user_id AND enabled FOR SHARE;
  IF NOT FOUND OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_assessment_native_epoch_changed'; END IF;
  SELECT external_subject INTO subject FROM agentstudio.users WHERE id=lease.owner_user_id AND external_issuer='urn:agentstudio:local:v1' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_native_epoch_changed'; END IF;
  SELECT * INTO review FROM agentstudio.agent_review_requests WHERE owner_user_id=lease.owner_user_id AND request_id=$1 FOR UPDATE;
  IF NOT FOUND OR review.owner_epoch<>epoch THEN RAISE EXCEPTION 'agent_assessment_native_epoch_changed'; END IF;
  SELECT * INTO lease FROM agentstudio.agent_assessment_leases WHERE owner_user_id=review.owner_user_id AND request_id=$1 AND lease_token=$2 AND lease_version=$3 AND worker_id=$4 FOR UPDATE;
  IF NOT FOUND OR lease.state NOT IN('claimed','reserved') OR lease.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  SELECT body INTO private_body FROM agentstudio.agent_review_inputs WHERE owner_user_id=review.owner_user_id AND request_id=$1;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM agentstudio.agent_review_tombstones WHERE owner_user_id=review.owner_user_id AND request_id=$1)
    OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_review_jobs WHERE owner_user_id=review.owner_user_id AND request_id=$1 AND state='pending') THEN RAISE EXCEPTION 'agent_assessment_input_unavailable'; END IF;
  -- Full current resource/source verification is mandatory in the Broker's
  -- verified API prepareOnClient transaction, not a substitute for this gate.
  RETURN jsonb_build_object('identity',jsonb_build_object('issuer','urn:agentstudio:local:v1','subject',subject),'owner_user_id',review.owner_user_id,'request_id',$1,
    'purpose',review.purpose,'request_sha256',review.request_sha256,'input_sha256',review.input_sha256,'content_sha256',review.content_sha256,'owner_epoch',epoch,
    'source_protocol',review.source_protocol,'choice',private_body->'choice','messages',private_body->'messages');
END $fn$;

CREATE FUNCTION agentstudio.agent_assessment_reserve(uuid,uuid,bigint,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; owner uuid; effect uuid:=gen_random_uuid(); runid uuid;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_review_dispatch' THEN RAISE EXCEPTION 'agent_assessment_dispatch_required'; END IF;
  context:=agentstudio.agent_assessment_context($1,$2,$3,$4);owner:=(context->>'owner_user_id')::uuid;
  IF EXISTS(SELECT 1 FROM agentstudio.agent_assessment_effects WHERE owner_user_id=owner AND request_id=$1) THEN RAISE EXCEPTION 'agent_assessment_effect_already_reserved'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_assessment_leases WHERE owner_user_id=owner AND request_id=$1 AND state='claimed') THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  INSERT INTO agentstudio.agent_assessment_effects(owner_user_id,request_id,effect_id,worker_id,lease_token,lease_version,request_sha256,input_sha256,content_sha256)
    VALUES(owner,$1,effect,$4,$2,$3,context->>'request_sha256',context->>'input_sha256',context->>'content_sha256');
  UPDATE agentstudio.agent_assessment_leases SET state='reserved' WHERE owner_user_id=owner AND request_id=$1;
  SELECT run_id INTO runid FROM agentstudio.agent_review_requests WHERE owner_user_id=owner AND request_id=$1;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,runid,'agent_assessment.reserved','agent_review',$1::text,'succeeded',jsonb_build_object('effect_id',effect,'lease_version',$3,'input_sha256',context->>'input_sha256'));
  -- Caller MUST commit before key load/POST. Any repeat raises, never grants a
  -- replay-send flag, regardless of whether a prior response was lost.
  RETURN jsonb_build_object('request_id',$1,'effect_id',effect,'state','reserved','request_sha256',context->>'request_sha256','input_sha256',context->>'input_sha256','content_sha256',context->>'content_sha256');
END $fn$;

CREATE FUNCTION agentstudio.agent_assessment_finish(uuid,uuid,bigint,uuid,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE effect record; original record; context jsonb; completion_hash text; output_hash text; runid uuid; status text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_review_dispatch' THEN RAISE EXCEPTION 'agent_assessment_dispatch_required'; END IF;
  IF $1 IS NULL OR $2 IS NULL OR $4 IS NULL OR $3 IS NULL OR $3 NOT BETWEEN 1 AND 9007199254740989 OR jsonb_typeof($5) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'agent_assessment_invalid_completion'; END IF;
  SELECT * INTO effect FROM agentstudio.agent_assessment_effects WHERE request_id=$1 AND lease_token=$2 AND lease_version=$3 AND worker_id=$4;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  status:=$5->>'status';
  IF status='succeeded' THEN
    IF ($5-ARRAY['status','result']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($5))=2
      AND agentstudio.agent_assessment_result_valid((SELECT purpose FROM agentstudio.agent_review_requests WHERE owner_user_id=effect.owner_user_id AND request_id=$1),$5->'result')) IS NOT TRUE THEN RAISE EXCEPTION 'agent_assessment_invalid_completion'; END IF;
  ELSIF status IN('failed','unknown') THEN
    IF ($5-ARRAY['status','failure_code']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($5))=2 AND jsonb_typeof($5->'failure_code')='string'
      AND $5->>'failure_code' ~ '^[a-z][a-z0-9_]{0,63}$') IS NOT TRUE THEN RAISE EXCEPTION 'agent_assessment_invalid_completion'; END IF;
  ELSE RAISE EXCEPTION 'agent_assessment_invalid_completion';
  END IF;
  completion_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_completion_v1','request_id',$1,'effect_id',effect.effect_id,'completion',$5));
  -- Only finish takes573. Serialize exact concurrent completion replay before
  -- epoch/request locking, without a reverse dependency on540 or lease rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(effect.owner_user_id::text||':'||$1::text,573));
  SELECT * INTO original FROM agentstudio.agent_assessment_outcomes WHERE owner_user_id=effect.owner_user_id AND request_id=$1;
  IF FOUND THEN
    IF original.completion_sha256<>completion_hash THEN RAISE EXCEPTION 'agent_assessment_completion_conflict'; END IF;
    RETURN jsonb_build_object('request_id',$1,'state',original.status,'completion_sha256',original.completion_sha256,'result_sha256',original.result_sha256);
  END IF;
  context:=agentstudio.agent_assessment_context($1,$2,$3,$4);
  -- Another finisher can commit while this caller waits for the context locks.
  SELECT * INTO original FROM agentstudio.agent_assessment_outcomes WHERE owner_user_id=effect.owner_user_id AND request_id=$1;
  IF FOUND THEN
    IF original.completion_sha256<>completion_hash THEN RAISE EXCEPTION 'agent_assessment_completion_conflict'; END IF;
    RETURN jsonb_build_object('request_id',$1,'state',original.status,'completion_sha256',original.completion_sha256,'result_sha256',original.result_sha256);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_assessment_leases WHERE owner_user_id=effect.owner_user_id AND request_id=$1 AND state='reserved')
    OR context->>'input_sha256' IS DISTINCT FROM effect.input_sha256 OR context->>'content_sha256' IS DISTINCT FROM effect.content_sha256 OR context->>'request_sha256' IS DISTINCT FROM effect.request_sha256 THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  IF status='succeeded' THEN
    output_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_output_v1','request_id',$1,'purpose',context->>'purpose','input_sha256',effect.input_sha256,'result',$5->'result'));
  END IF;
  INSERT INTO agentstudio.agent_assessment_outcomes(owner_user_id,request_id,effect_id,status,completion_sha256,result_sha256,failure_code)
    VALUES(effect.owner_user_id,$1,effect.effect_id,status,completion_hash,output_hash,$5->>'failure_code');
  IF status='succeeded' THEN
    INSERT INTO agentstudio.agent_assessment_outputs(owner_user_id,request_id,effect_id,result,result_sha256) VALUES(effect.owner_user_id,$1,effect.effect_id,$5->'result',output_hash);
  END IF;
  UPDATE agentstudio.agent_assessment_leases SET state=status WHERE owner_user_id=effect.owner_user_id AND request_id=$1;
  SELECT run_id INTO runid FROM agentstudio.agent_review_requests WHERE owner_user_id=effect.owner_user_id AND request_id=$1;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(effect.owner_user_id,effect.owner_user_id,runid,'agent_assessment.finished','agent_review',$1::text,'succeeded',jsonb_build_object('effect_id',effect.effect_id,'status',status,'completion_sha256',completion_hash,'result_sha256',output_hash));
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_assessment_leases WHERE owner_user_id=effect.owner_user_id AND request_id=$1 AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  RETURN jsonb_build_object('request_id',$1,'state',status,'completion_sha256',completion_hash,'result_sha256',output_hash);
END $fn$;

CREATE FUNCTION agentstudio.agent_assessment_pause(uuid,uuid,bigint,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE lease record; outcome record; runid uuid;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_review_worker' THEN RAISE EXCEPTION 'agent_assessment_worker_required'; END IF;
  IF $1 IS NULL OR $2 IS NULL OR $4 IS NULL OR $3 IS NULL OR $3 NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  SELECT * INTO lease FROM agentstudio.agent_assessment_leases WHERE request_id=$1 AND lease_token=$2 AND lease_version=$3 AND worker_id=$4;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  -- No epoch or540 waits after lease/request locking. Pause publishes no body
  -- or provider outcome, and remains possible after expiry/governance changes.
  PERFORM 1 FROM agentstudio.agent_review_requests WHERE owner_user_id=lease.owner_user_id AND request_id=$1 FOR UPDATE;
  SELECT * INTO lease FROM agentstudio.agent_assessment_leases WHERE owner_user_id=lease.owner_user_id AND request_id=$1 AND lease_token=$2 AND lease_version=$3 AND worker_id=$4 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  IF lease.state='paused' THEN RETURN jsonb_build_object('request_id',$1,'state','paused'); END IF;
  IF lease.state IN('succeeded','failed','unknown') THEN
    -- Return only an already committed outcome's hashes; pause never creates
    -- a provider disposition or turns an uncertain transport into success.
    SELECT * INTO outcome FROM agentstudio.agent_assessment_outcomes WHERE owner_user_id=lease.owner_user_id AND request_id=$1;
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
    RETURN jsonb_build_object('request_id',$1,'state',outcome.status,'completion_sha256',outcome.completion_sha256,'result_sha256',outcome.result_sha256);
  END IF;
  IF lease.state NOT IN('claimed','reserved') THEN RAISE EXCEPTION 'agent_assessment_invalid_lease'; END IF;
  UPDATE agentstudio.agent_assessment_leases SET state='paused' WHERE owner_user_id=lease.owner_user_id AND request_id=$1;
  SELECT run_id INTO runid FROM agentstudio.agent_review_requests WHERE owner_user_id=lease.owner_user_id AND request_id=$1;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(lease.owner_user_id,lease.owner_user_id,runid,'agent_assessment.paused','agent_review',$1::text,'succeeded',jsonb_build_object('worker_id',$4,'lease_version',$3,'provider_outcome_asserted',false));
  RETURN jsonb_build_object('request_id',$1,'state','paused');
END $fn$;

REVOKE ALL ON FUNCTION agentstudio.agent_assessment_text_valid(text,integer,boolean),agentstudio.agent_assessment_result_valid(text,jsonb),
  agentstudio.agent_assessment_claim(uuid),agentstudio.agent_assessment_context(uuid,uuid,bigint,uuid),agentstudio.agent_assessment_reserve(uuid,uuid,bigint,uuid),
  agentstudio.agent_assessment_finish(uuid,uuid,bigint,uuid,jsonb),agentstudio.agent_assessment_pause(uuid,uuid,bigint,uuid)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_assessment_claim(uuid),agentstudio.agent_assessment_pause(uuid,uuid,bigint,uuid) TO agentstudio_review_worker;
GRANT EXECUTE ON FUNCTION agentstudio.agent_assessment_context(uuid,uuid,bigint,uuid),agentstudio.agent_assessment_reserve(uuid,uuid,bigint,uuid),agentstudio.agent_assessment_finish(uuid,uuid,bigint,uuid,jsonb) TO agentstudio_review_dispatch;
DO $acl$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch',item);
  END LOOP;
END $acl$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_057','Optional private review execution lease/reservation/outcome/output; no existing login memberships or production activation');
COMMIT;
