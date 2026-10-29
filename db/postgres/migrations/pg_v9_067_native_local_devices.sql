-- Optional isolated Native F20/F21. No accounts, LOGIN credentials, activation,
-- executor process, company-data copy or production runtime switch is created.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_user<>session_user OR pg_is_in_recovery() OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=current_user::regrole AND rolsuper)
 OR EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_065')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_067')
 OR EXISTS(SELECT 1 FROM pg_class WHERE starts_with(relname,'native_local_'))
 OR EXISTS(SELECT 1 FROM pg_proc WHERE starts_with(proname,'native_local_'))
 OR EXISTS(SELECT 1 FROM pg_type WHERE starts_with(typname,'native_local_') OR starts_with(typname,'_native_local_'))
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_local_executor')
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE starts_with(conname,'native_local_'))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE starts_with(tgname,'native_local_'))
 OR EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclnamespace='agentstudio'::regnamespace)
 THEN RAISE EXCEPTION 'native_local_installation_refused';END IF;
END $preflight$;
CREATE ROLE agentstudio_local_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_local_executor;
CREATE TABLE agentstudio.native_local_devices(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 owner_epoch bigint NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740989),version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740989),
 revoked boolean NOT NULL DEFAULT false,pair_hash text UNIQUE CHECK(pair_hash ~ '^[a-f0-9]{64}$'),pair_until timestamptz NOT NULL,
 token_hash text UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),pair_request_id uuid,pair_request_hash text CHECK(pair_request_hash ~ '^[a-f0-9]{64}$'),
 seen_at timestamptz,catalog jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(catalog)='array' AND octet_length(catalog::text)<=65000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(NOT revoked OR pair_hash IS NULL AND token_hash IS NULL)
);
CREATE TABLE agentstudio.native_local_receipts(
 owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=1024),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id)
);
CREATE TABLE agentstudio.native_local_run_devices(
 run_id uuid PRIMARY KEY REFERENCES agentstudio.runs(id),owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
 device_id uuid NOT NULL REFERENCES agentstudio.native_local_devices(id),device_version bigint NOT NULL,owner_epoch bigint NOT NULL,
 catalog jsonb NOT NULL CHECK(jsonb_typeof(catalog)='array' AND octet_length(catalog::text)<=65000),catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE agentstudio.native_local_jobs(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),device_id uuid NOT NULL REFERENCES agentstudio.native_local_devices(id),device_version bigint NOT NULL,
 run_id uuid REFERENCES agentstudio.runs(id),step_key text NOT NULL DEFAULT '' CHECK(length(step_key)<=160),input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 input jsonb NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=26000),
 created_at timestamptz NOT NULL,deadline_at timestamptz NOT NULL CHECK(deadline_at=created_at+interval '120 seconds'),
 status text NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled','expired','unknown')),
 claim_hash text CHECK(claim_hash ~ '^[a-f0-9]{64}$'),result jsonb CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=1450000),error text NOT NULL DEFAULT '' CHECK(length(error)<=120),
 completion_id uuid,completion_hash text CHECK(completion_hash ~ '^[a-f0-9]{64}$'),bound_request jsonb,
 CHECK((status IN('succeeded','failed'))=(result IS NOT NULL)),CHECK((run_id IS NULL)=(step_key='')),UNIQUE(run_id,step_key)
);
CREATE INDEX native_local_jobs_device ON agentstudio.native_local_jobs(device_id,status,created_at);
DO $sealed$
DECLARE t text;
BEGIN FOREACH t IN ARRAY ARRAY['native_local_devices','native_local_receipts','native_local_run_devices','native_local_jobs'] LOOP
 EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_local_executor',t);
END LOOP;END $sealed$;
CREATE FUNCTION agentstudio.native_local_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'native_local_immutable';END $fn$;
CREATE TRIGGER native_local_receipts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_local_receipts FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_local_immutable();
CREATE TRIGGER native_local_run_devices_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_local_run_devices FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_local_immutable();
CREATE FUNCTION agentstudio.native_local_monotone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'native_local_monotone';END IF;
 IF TG_TABLE_NAME='native_local_devices' THEN
  IF (to_jsonb(NEW)-ARRAY['revoked','version','pair_hash','token_hash','pair_request_id','pair_request_hash','seen_at','catalog']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revoked','version','pair_hash','token_hash','pair_request_id','pair_request_hash','seen_at','catalog'])
  OR OLD.revoked OR NEW.version<OLD.version OR NEW.version>OLD.version+1 OR OLD.token_hash IS NOT NULL AND NEW.token_hash IS DISTINCT FROM OLD.token_hash AND NOT NEW.revoked
  OR OLD.pair_hash IS NULL AND NEW.pair_hash IS NOT NULL THEN RAISE EXCEPTION 'native_local_monotone';END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','claim_hash','result','error','completion_id','completion_hash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','claim_hash','result','error','completion_id','completion_hash'])
  OR NOT (OLD.status='queued' AND NEW.status IN('running','cancelled','expired') OR OLD.status='running' AND NEW.status IN('succeeded','failed','cancelled','unknown'))
  THEN RAISE EXCEPTION 'native_local_monotone';END IF;
 END IF;RETURN NEW;
END $fn$;
CREATE TRIGGER native_local_devices_monotone BEFORE UPDATE OR DELETE ON agentstudio.native_local_devices FOR EACH ROW EXECUTE FUNCTION agentstudio.native_local_monotone();
CREATE TRIGGER native_local_jobs_monotone BEFORE UPDATE OR DELETE ON agentstudio.native_local_jobs FOR EACH ROW EXECUTE FUNCTION agentstudio.native_local_monotone();
CREATE TRIGGER native_local_devices_no_truncate BEFORE TRUNCATE ON agentstudio.native_local_devices FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_local_immutable();
CREATE TRIGGER native_local_jobs_no_truncate BEFORE TRUNCATE ON agentstudio.native_local_jobs FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_local_immutable();
CREATE FUNCTION agentstudio.native_local_session(p_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r record;g oid;
BEGIN
 IF p_role NOT IN('agentstudio_api','agentstudio_local_executor') OR current_setting('role')<>p_role THEN RAISE EXCEPTION 'native_local_original_login_required';END IF;
 SELECT * INTO r FROM pg_roles WHERE rolname=session_user;SELECT oid INTO g FROM pg_roles WHERE rolname=p_role;
 IF NOT r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR r.rolconfig IS NOT NULL OR r.rolvaliduntil IS NOT NULL
 OR (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid AND roleid=g AND NOT admin_option AND NOT inherit_option AND set_option)
 OR EXISTS(SELECT 1 FROM pg_roles q WHERE q.oid<>r.oid AND q.oid<>g AND pg_has_role(r.oid,q.oid,'MEMBER'))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=g OR roleid=r.oid)
 THEN RAISE EXCEPTION 'native_local_original_login_required';END IF;
 IF p_role='agentstudio_local_executor' AND (has_schema_privilege(r.oid,'agentstudio_auth','USAGE') OR has_schema_privilege(g,'agentstudio_auth','USAGE') OR EXISTS(
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','v','m','p') AND (
 has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege(g,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') OR has_table_privilege(g,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN')))) THEN RAISE EXCEPTION 'native_local_original_login_required';END IF;
END $fn$;
CREATE FUNCTION agentstudio.native_local_digest(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT agentstudio.agent_design_digest(v)
$fn$;
CREATE FUNCTION agentstudio.native_local_object_size(v jsonb) RETURNS bigint LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT CASE WHEN jsonb_typeof(v)='object' THEN (SELECT count(*) FROM jsonb_object_keys(v)) ELSE -1 END
$fn$;
CREATE FUNCTION agentstudio.native_local_secret(v text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT encode(sha256(convert_to('native-local-device-v1:'||v,'UTF8')),'hex')
$fn$;
CREATE FUNCTION agentstudio.native_local_ms(v timestamptz) RETURNS bigint LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT floor(extract(epoch FROM v)*1000)::bigint
$fn$;
CREATE FUNCTION agentstudio.native_local_device_view(d agentstudio.native_local_devices) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT jsonb_build_object('id',d.id,'name',d.name,'revoked',d.revoked,'seen_ms',coalesce(agentstudio.native_local_ms(d.seen_at),0),'catalog',d.catalog,'catalog_sha256',agentstudio.native_local_digest(d.catalog),'version',d.version)
$fn$;
CREATE FUNCTION agentstudio.native_local_job_view(j agentstudio.native_local_jobs) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT jsonb_build_object('id',j.id,'device_id',j.device_id,'run_id',j.run_id,'step_key',j.step_key,'status',j.status,'input',j.input,'input_sha256',j.input_sha256,'created_ms',agentstudio.native_local_ms(j.created_at),'deadline_ms',agentstudio.native_local_ms(j.deadline_at),'result',j.result,'error',j.error)
$fn$;
CREATE FUNCTION agentstudio.native_local_owner() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid;
BEGIN PERFORM agentstudio.native_local_session('agentstudio_api');o:=agentstudio.actor_id();PERFORM agentstudio.agent_design_native(o);RETURN o;END $fn$;
CREATE FUNCTION agentstudio.native_local_live(p_id uuid,p_owner uuid) RETURNS agentstudio.native_local_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;n jsonb;
BEGIN
 n:=agentstudio.agent_design_native(p_owner);SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=p_id AND owner_user_id=p_owner FOR UPDATE;
 IF NOT FOUND OR d.revoked OR d.owner_epoch<>(n->>'epoch')::bigint THEN RAISE EXCEPTION 'native_local_device_unavailable';END IF;RETURN d;
END $fn$;
CREATE FUNCTION agentstudio.native_local_expire(p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;n jsonb;
BEGIN
 SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=p_device;IF NOT FOUND THEN RETURN;END IF;n:=agentstudio.agent_design_native(d.owner_user_id);
 UPDATE agentstudio.native_local_jobs SET status='cancelled',error='owner_epoch_changed' WHERE device_id=p_device AND status IN('queued','running') AND d.owner_epoch<>(n->>'epoch')::bigint;
 UPDATE agentstudio.native_local_jobs j SET status='cancelled',error='catalog_changed' WHERE device_id=p_device AND status IN('queued','running') AND NOT EXISTS(SELECT 1 FROM agentstudio.native_local_devices d WHERE d.id=j.device_id AND d.version=j.device_version AND NOT d.revoked);
 UPDATE agentstudio.native_local_jobs j SET status=CASE WHEN status='queued' THEN 'expired' ELSE 'unknown' END,error='deadline_expired'
 WHERE device_id=p_device AND status IN('queued','running') AND deadline_at<=clock_timestamp();
 UPDATE agentstudio.native_local_jobs j SET status='cancelled',error='run_inactive' WHERE device_id=p_device AND status IN('queued','running') AND run_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=j.run_id AND r.owner_user_id=j.owner_user_id AND r.status='running');
END $fn$;
CREATE FUNCTION agentstudio.native_local_list() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();v jsonb;n jsonb:=agentstudio.agent_design_native(o);
BEGIN SELECT coalesce(jsonb_agg(agentstudio.native_local_device_view(d)||CASE WHEN d.owner_epoch<>(n->>'epoch')::bigint THEN jsonb_build_object('seen_ms',0,'catalog','[]'::jsonb,'catalog_sha256',agentstudio.native_local_digest('[]'::jsonb)) ELSE '{}'::jsonb END ORDER BY created_at DESC),'[]'::jsonb) INTO v FROM (SELECT * FROM agentstudio.native_local_devices WHERE owner_user_id=o ORDER BY created_at DESC LIMIT 100) d;RETURN v;END $fn$;
CREATE FUNCTION agentstudio.native_local_get(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();j agentstudio.native_local_jobs;d agentstudio.native_local_devices;
BEGIN
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE id=p_job AND owner_user_id=o;IF NOT FOUND THEN RAISE EXCEPTION 'native_local_job_not_found';END IF;
 SELECT * INTO d FROM agentstudio.native_local_devices WHERE id=j.device_id AND owner_user_id=o FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'native_local_job_not_found';END IF;PERFORM agentstudio.native_local_expire(j.device_id);
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE id=p_job AND owner_user_id=o;RETURN agentstudio.native_local_job_view(j);
END $fn$;
CREATE FUNCTION agentstudio.native_local_receipt(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();v jsonb;
BEGIN SELECT receipt INTO v FROM agentstudio.native_local_receipts WHERE owner_user_id=o AND request_id=p_id;RETURN v;END $fn$;
CREATE FUNCTION agentstudio.native_local_insert_job(o uuid,d agentstudio.native_local_devices,p_input jsonb,p_run uuid DEFAULT NULL,p_step text DEFAULT '',p_hash text DEFAULT NULL,p_bound jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();
BEGIN
 IF d.seen_at IS NULL OR d.seen_at<t-interval '45 seconds' OR d.seen_at>t+interval '5 seconds' OR jsonb_typeof(p_input)<>'object'
 OR agentstudio.native_local_object_size(p_input)<>2 OR jsonb_typeof(p_input->'arguments')<>'object' OR octet_length(p_input::text)>26000
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.catalog) x WHERE x->>'name'=p_input->>'tool') THEN RAISE EXCEPTION 'native_local_tool_unavailable';END IF;
 PERFORM agentstudio.native_local_expire(d.id);
 INSERT INTO agentstudio.native_local_jobs(id,owner_user_id,device_id,device_version,run_id,step_key,input_sha256,input,created_at,deadline_at,status,bound_request)
 VALUES(v,o,d.id,d.version,p_run,p_step,coalesce(p_hash,agentstudio.native_local_digest(p_input)),p_input,t,t+interval '120 seconds','queued',p_bound);RETURN v;
END $fn$;
CREATE FUNCTION agentstudio.native_local_record(v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();n jsonb;rid uuid;h text;prior agentstudio.native_local_receipts;d agentstudio.native_local_devices;j agentstudio.native_local_jobs;id uuid;a text;code text;receipt jsonb;t timestamptz;
BEGIN
 a:=v->>'action';rid:=(v->>'request_id')::uuid;h:=agentstudio.native_local_digest(v);
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':local:'||rid::text,0));
 SELECT * INTO prior FROM agentstudio.native_local_receipts WHERE owner_user_id=o AND request_id=rid;
 IF FOUND THEN IF prior.request_sha256<>h THEN RAISE EXCEPTION 'native_local_request_conflict';END IF;RETURN jsonb_build_object('receipt',prior.receipt,'pairing_code',NULL,'replayed',true);END IF;
 IF a='create' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':native-local-device-limit',0));
  IF agentstudio.native_local_object_size(v)<>3 OR jsonb_typeof(v->'name')<>'string' OR length(v->>'name') NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'native_local_invalid_intent';END IF;
  IF (SELECT count(*) FROM agentstudio.native_local_devices WHERE owner_user_id=o AND NOT revoked)>=50 THEN RAISE EXCEPTION 'native_local_device_limit';END IF;
  n:=agentstudio.agent_design_native(o);id:=gen_random_uuid();t:=clock_timestamp();
  code:=left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12)||left(replace(gen_random_uuid()::text,'-',''),12);
  INSERT INTO agentstudio.native_local_devices(id,owner_user_id,name,owner_epoch,pair_hash,pair_until) VALUES(id,o,v->>'name',(n->>'epoch')::bigint,agentstudio.native_local_secret(code),t+interval '5 minutes');
 ELSIF a='create_office' THEN
  IF agentstudio.native_local_object_size(v)<>3 OR jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR length(v->>'name') NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'native_local_invalid_intent';END IF;
  id:=gen_random_uuid();
  INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec,requires_approval) VALUES(id,o,v->>'name',
   '{"goal":"将授权本地台账汇总为可核对的 Excel 表格和 Word 报告，并按任务要求录入已授权网页。","task_scope":"仅使用本次选择的本地电脑及其目录与网站范围；处理 XLSX 和 UTF-8 CSV 的分组金额汇总。不改原表、不执行源公式。网页逐项核对后单独批准提交，成功必须有实际回执。","deliverables":["summary.xlsx 汇总表","report.docx 报告","summary.json 核对清单","如指定网页则提供实际提交回执"],"tools":["local_computer"],"task_plan":["读取源表并精确汇总","以源摘要校验后新建报告文件","回读清单核对","如指定网页则填表核对并逐次批准提交","根据真实结果交付"],"done_criteria":["汇总和报告的记录数、分组、金额一致","源文件 SHA256 与报告清单一致","保留原文件且不覆盖已有输出","网页提交有成功回执；不确定时不重试"],"knowledge_base_ids":[],"require_approval":true,"require_plan_review":true}'::jsonb,true);
 ELSIF a IN('revoke','enqueue') THEN
  IF v->'confirm' IS DISTINCT FROM 'true'::jsonb OR agentstudio.native_local_object_size(v)<>CASE WHEN a='enqueue' THEN 5 ELSE 4 END THEN RAISE EXCEPTION 'native_local_invalid_intent';END IF;
  IF a='revoke' THEN SELECT * INTO d FROM agentstudio.native_local_devices WHERE native_local_devices.id=(v->>'id')::uuid AND owner_user_id=o FOR UPDATE;IF NOT FOUND OR d.revoked THEN RAISE EXCEPTION 'native_local_device_unavailable';END IF;
  ELSE d:=agentstudio.native_local_live((v->>'id')::uuid,o);END IF;id:=d.id;
  IF a='revoke' THEN
   UPDATE agentstudio.native_local_devices SET revoked=true,version=version+1,pair_hash=NULL,token_hash=NULL WHERE native_local_devices.id=d.id;
   UPDATE agentstudio.native_local_jobs SET status='cancelled',error='device_revoked' WHERE device_id=d.id AND status IN('queued','running');
  ELSE id:=agentstudio.native_local_insert_job(o,d,v->'input');END IF;
 ELSIF a='cancel' THEN
  IF v->'confirm' IS DISTINCT FROM 'true'::jsonb OR agentstudio.native_local_object_size(v)<>4 THEN RAISE EXCEPTION 'native_local_invalid_intent';END IF;
  SELECT * INTO j FROM agentstudio.native_local_jobs WHERE native_local_jobs.id=(v->>'id')::uuid AND owner_user_id=o;
  IF NOT FOUND THEN RAISE EXCEPTION 'native_local_job_not_found';END IF;PERFORM agentstudio.native_local_live(j.device_id,o);id:=j.id;
  UPDATE agentstudio.native_local_jobs SET status='cancelled',error='user_cancelled' WHERE native_local_jobs.id=j.id AND status IN('queued','running');
 ELSE RAISE EXCEPTION 'native_local_invalid_intent';END IF;
 receipt:=jsonb_build_object('request_id',rid,'request_sha256',h,'action',a,'id',id);
 INSERT INTO agentstudio.native_local_receipts(owner_user_id,request_id,request_sha256,receipt) VALUES(o,rid,h,receipt);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(o,o,'local.device.'||a,'local_device',id::text,'succeeded',receipt);
 RETURN jsonb_build_object('receipt',receipt,'pairing_code',code,'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.native_local_pair(v jsonb,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;h text;token text;rid uuid;
BEGIN
 PERFORM agentstudio.native_local_session('agentstudio_local_executor');
 IF agentstudio.native_local_object_size(v)<>3 OR coalesce(v->>'pairing_code','') !~ '^[a-f0-9]{48}$' OR coalesce(v->>'device_token','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 rid:=(v->>'request_id')::uuid;h:=agentstudio.native_local_digest(v);token:=agentstudio.native_local_secret(v->>'device_token');
 -- A locally persisted token, created BEFORE this POST, permits exact original
 -- UUID recovery after ACK loss. No token is generated or returned by server.
 SELECT * INTO d FROM agentstudio.native_local_devices WHERE pair_hash=agentstudio.native_local_secret(v->>'pairing_code') OR token_hash=token ORDER BY id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;d:=agentstudio.native_local_live(d.id,d.owner_user_id);
 IF d.token_hash=token AND d.pair_request_id=rid AND d.pair_request_hash=h THEN RETURN jsonb_build_object('id',d.id,'request_id',rid,'paired',true,'replayed',true);END IF;
 IF p_confirm THEN RAISE EXCEPTION 'native_local_receipt_not_found';END IF;
 IF d.token_hash IS NOT NULL OR d.pair_until<=clock_timestamp() OR d.pair_hash IS DISTINCT FROM agentstudio.native_local_secret(v->>'pairing_code') THEN RAISE EXCEPTION 'native_local_pair_denied';END IF;
 UPDATE agentstudio.native_local_devices SET token_hash=token,pair_hash=NULL,pair_request_id=rid,pair_request_hash=h WHERE id=d.id;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(d.owner_user_id,d.owner_user_id,'local.device.pair','local_device',d.id::text,'succeeded',jsonb_build_object('request_id',rid));
 RETURN jsonb_build_object('id',d.id,'request_id',rid,'paired',true,'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.native_local_token(v text) RETURNS agentstudio.native_local_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;
BEGIN PERFORM agentstudio.native_local_session('agentstudio_local_executor');IF v !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'native_local_token_denied';END IF;
 SELECT * INTO d FROM agentstudio.native_local_devices WHERE token_hash=agentstudio.native_local_secret(v);IF NOT FOUND THEN RAISE EXCEPTION 'native_local_token_denied';END IF;
 RETURN agentstudio.native_local_live(d.id,d.owner_user_id);
END $fn$;
CREATE FUNCTION agentstudio.native_local_poll(p_token text,p_catalog jsonb,p_claim text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;j agentstudio.native_local_jobs;
BEGIN
 d:=agentstudio.native_local_token(p_token);
 IF jsonb_typeof(p_catalog)<>'array' OR jsonb_array_length(p_catalog)>50 OR octet_length(p_catalog::text)>65000 OR p_claim !~ '^[a-f0-9]{64}$'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_catalog) x WHERE jsonb_typeof(x)<>'object' OR x->>'name' !~ '^[A-Za-z0-9_.-]{1,100}$' OR jsonb_typeof(x->'inputSchema')<>'object')
 OR (SELECT count(*) FROM jsonb_array_elements(p_catalog))<>(SELECT count(DISTINCT x->>'name') FROM jsonb_array_elements(p_catalog) x) THEN RAISE EXCEPTION 'native_local_invalid_catalog';END IF;
 UPDATE agentstudio.native_local_devices SET seen_at=clock_timestamp(),catalog=p_catalog,version=version+CASE WHEN catalog=p_catalog OR catalog='[]'::jsonb THEN 0 ELSE 1 END WHERE id=d.id RETURNING * INTO d;
 PERFORM agentstudio.native_local_expire(d.id);
 -- A lost poll ACK recovers ONLY the original locally persisted claim. A new
 -- process/claim never acquires an already running task.
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE device_id=d.id AND status='running' ORDER BY created_at LIMIT 1;
 IF FOUND THEN
  IF j.claim_hash<>agentstudio.native_local_secret(p_claim) THEN RETURN jsonb_build_object('job',NULL);END IF;
 ELSE
  SELECT * INTO j FROM agentstudio.native_local_jobs WHERE device_id=d.id AND status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('job',NULL);END IF;
  IF j.device_version<>d.version THEN UPDATE agentstudio.native_local_jobs SET status='cancelled',error='catalog_changed' WHERE id=j.id;RETURN jsonb_build_object('job',NULL);END IF;
  UPDATE agentstudio.native_local_jobs SET status='running',claim_hash=agentstudio.native_local_secret(p_claim) WHERE id=j.id;
 END IF;
 RETURN jsonb_build_object('job',jsonb_build_object('id',j.id,'input',j.input,'deadline_ms',agentstudio.native_local_ms(j.deadline_at)));
END $fn$;
CREATE FUNCTION agentstudio.native_local_check(p_token text,p_job uuid,p_claim text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;ok boolean;
BEGIN d:=agentstudio.native_local_token(p_token);PERFORM agentstudio.native_local_expire(d.id);
 SELECT status='running' AND claim_hash=agentstudio.native_local_secret(p_claim) INTO ok FROM agentstudio.native_local_jobs WHERE id=p_job AND device_id=d.id AND owner_user_id=d.owner_user_id;
 RETURN jsonb_build_object('active',coalesce(ok,false));END $fn$;
CREATE FUNCTION agentstudio.native_local_result_safe(v jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE x jsonb;b bytea;s text;
BEGIN
 IF agentstudio.native_local_object_size(v)<>2 OR jsonb_typeof(v->'text') IS DISTINCT FROM 'string' OR length(v->>'text')>12000 OR jsonb_typeof(v->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'images')>1 OR octet_length(v::text)>1450000 THEN RAISE EXCEPTION 'native_local_invalid_result';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(v->'images') LOOP
  s:=x->>'data';IF agentstudio.native_local_object_size(x)<>2 OR coalesce(x->>'mimeType','') NOT IN('image/png','image/jpeg') OR coalesce(s,'') !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(s) NOT BETWEEN 16 AND 1398104 OR length(s)%4<>0 THEN RAISE EXCEPTION 'native_local_invalid_result';END IF;
  b:=decode(s,'base64');IF octet_length(b)>1048576 OR replace(encode(b,'base64'),E'\n','')<>s OR CASE WHEN x->>'mimeType'='image/png' THEN substring(b FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') ELSE substring(b FROM 1 FOR 3)<>decode('ffd8ff','hex') END THEN RAISE EXCEPTION 'native_local_invalid_result';END IF;
 END LOOP;
END $fn$;
CREATE FUNCTION agentstudio.native_local_complete(p_token text,v jsonb,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE d agentstudio.native_local_devices;j agentstudio.native_local_jobs;h text;
BEGIN
 d:=agentstudio.native_local_token(p_token);PERFORM agentstudio.native_local_expire(d.id);h:=agentstudio.native_local_digest(v);
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE id=(v->>'id')::uuid AND device_id=d.id AND owner_user_id=d.owner_user_id FOR UPDATE;
 IF NOT FOUND OR j.claim_hash IS DISTINCT FROM agentstudio.native_local_secret(v->>'claim') THEN RAISE EXCEPTION 'native_local_claim_denied';END IF;
 IF j.completion_id=(v->>'request_id')::uuid AND j.completion_hash=h THEN RETURN jsonb_build_object('id',j.id,'request_id',j.completion_id,'status',j.status,'replayed',true);END IF;
 IF p_confirm THEN RAISE EXCEPTION 'native_local_receipt_not_found';END IF;
 IF j.status<>'running' OR agentstudio.native_local_object_size(v)<>5 OR jsonb_typeof(v->'ok') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'native_local_completion_denied';END IF;
 PERFORM agentstudio.native_local_result_safe(v->'result');
 -- A thrown/aborted local operation can have produced a side effect. It is
 -- UNKNOWN, never a deterministic tool failure that invites model retry.
 UPDATE agentstudio.native_local_jobs SET status=CASE WHEN (v->>'ok')::boolean THEN 'succeeded' ELSE 'unknown' END,result=CASE WHEN (v->>'ok')::boolean THEN v->'result' ELSE NULL END,error=CASE WHEN (v->>'ok')::boolean THEN '' ELSE 'executor_outcome_unknown' END,completion_id=(v->>'request_id')::uuid,completion_hash=h WHERE id=j.id RETURNING * INTO j;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(d.owner_user_id,d.owner_user_id,'local.job.complete','local_job',j.id::text,'succeeded',jsonb_build_object('request_id',j.completion_id,'input_sha256',j.input_sha256,'result_sha256',agentstudio.native_local_digest(j.result),'status',j.status));
 RETURN jsonb_build_object('id',j.id,'request_id',j.completion_id,'status',j.status,'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.native_local_bind(p_run uuid,p_device uuid,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();d agentstudio.native_local_devices;b agentstudio.native_local_run_devices;
BEGIN
 SELECT * INTO b FROM agentstudio.native_local_run_devices WHERE run_id=p_run AND owner_user_id=o;
 IF FOUND THEN IF b.device_id IS DISTINCT FROM p_device THEN RAISE EXCEPTION 'native_local_request_conflict';END IF;RETURN jsonb_build_object('device_id',b.device_id,'version',b.device_version,'catalog',b.catalog,'catalog_sha256',b.catalog_sha256);END IF;
 IF p_confirm THEN IF p_device IS NOT NULL THEN RAISE EXCEPTION 'native_local_request_conflict';END IF;RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=p_run AND owner_user_id=o AND kind='agent' AND status='queued' AND checkpoint->>'execution_mode'='agent_native_v2') THEN RAISE EXCEPTION 'native_local_run_denied';END IF;
 d:=agentstudio.native_local_live(p_device,o);IF d.seen_at IS NULL OR d.seen_at<clock_timestamp()-interval '45 seconds' OR d.catalog='[]'::jsonb THEN RAISE EXCEPTION 'native_local_device_offline';END IF;
 INSERT INTO agentstudio.native_local_run_devices(run_id,owner_user_id,device_id,device_version,owner_epoch,catalog,catalog_sha256) VALUES(p_run,o,d.id,d.version,d.owner_epoch,d.catalog,agentstudio.native_local_digest(d.catalog));
 RETURN jsonb_build_object('device_id',d.id,'version',d.version,'catalog',d.catalog,'catalog_sha256',agentstudio.native_local_digest(d.catalog));
END $fn$;
CREATE FUNCTION agentstudio.native_local_agent_enqueue(v jsonb,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();r agentstudio.runs;q agentstudio.jobs;b agentstudio.native_local_run_devices;d agentstudio.native_local_devices;j agentstudio.native_local_jobs;id uuid;cfg jsonb;derived jsonb;round_no int;title text;
BEGIN
 IF v->>'execution_mode'<>'agent_native_v2' OR v->>'parent_step_key' IS NULL THEN RAISE EXCEPTION 'native_local_run_denied';END IF;
 SELECT * INTO q FROM agentstudio.jobs WHERE id=(v->'claim'->>'job_id')::uuid AND run_id=(v->'claim'->>'run_id')::uuid AND owner_user_id=o
 AND status='leased' AND lease_token=(v->'claim'->>'lease_token')::uuid AND lease_version=(v->'claim'->>'lease_version')::bigint AND lease_owner=v->'claim'->>'lease_owner' AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR q.kind<>'run_tick' OR q.payload->>'phase'<>'agent_native_v2' THEN RAISE EXCEPTION 'native_local_lease_denied';END IF;
 SELECT * INTO r FROM agentstudio.runs WHERE id=q.run_id AND owner_user_id=o AND status='running' AND kind='agent' AND checkpoint->>'stage'='agent_v2_effect_started' FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM agentstudio.approvals WHERE run_id=r.id AND owner_user_id=o AND step_key=v->>'step_key' AND status='approved' AND reason_code='wf2:'||(v->>'input_sha256'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=r.id AND owner_user_id=o AND step_key=v->>'step_key' AND status='started' AND arguments_sha256=v->>'input_sha256' AND tool_name='workflow:tool')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=r.id AND owner_user_id=o AND step_key='wf2_tool:'||(v->>'step_key') AND status='started' AND arguments_sha256=v->>'input_sha256' AND tool_name='workflow.tool_bound_dispatch')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.approvals WHERE run_id=r.id AND owner_user_id=o AND step_key=v->>'parent_step_key' AND status='approved' AND reason_code='wf2:'||(r.checkpoint->'agent_state'->>'parent_input_sha256'))
 THEN RAISE EXCEPTION 'native_local_approval_denied';END IF;
 -- Independently bind the actual input/configuration to the exact approved
 -- deterministic Agent request hash, rather than trusting a supplied payload.
 IF v->>'step_key' !~ ('^'||(v->>'parent_step_key')||'_a(0[1-9]|[12][0-9]|30)t$') OR r.checkpoint->'agent_state'->>'parent_step_key' IS DISTINCT FROM v->>'parent_step_key' THEN RAISE EXCEPTION 'native_local_approval_denied';END IF;
 round_no:=substring(v->>'step_key' FROM '_a([0-9]{2})t$')::int;
 SELECT x->'data'->>'title' INTO title FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') x WHERE x->>'id'='agent' AND x->>'type'='agent';
 cfg:=jsonb_build_object('title',title,'tool','local_computer','params_template',agentstudio.agent_design_compact(p_input));
 derived:=jsonb_build_object('parent_input_sha256',r.checkpoint->'agent_state'->'parent_input_sha256','snapshot_sha256',r.checkpoint->'agent_state'->'snapshot_sha256','step_key',v->'step_key','node_id','agent','kind','tool','input',agentstudio.agent_design_compact(p_input),'configuration',cfg,'agent_context',jsonb_build_object('parent_step_key',v->'parent_step_key','round',round_no,'phase','tool'));
 IF agentstudio.native_local_digest(derived) IS DISTINCT FROM v->>'input_sha256' THEN RAISE EXCEPTION 'native_local_approval_denied';END IF;
 SELECT * INTO b FROM agentstudio.native_local_run_devices WHERE run_id=r.id AND owner_user_id=o;IF NOT FOUND THEN RAISE EXCEPTION 'native_local_run_denied';END IF;
 d:=agentstudio.native_local_live(b.device_id,o);IF d.version<>b.device_version OR d.owner_epoch<>b.owner_epoch OR agentstudio.native_local_digest(d.catalog)<>b.catalog_sha256 THEN RAISE EXCEPTION 'native_local_catalog_changed';END IF;
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE run_id=r.id AND step_key=v->>'step_key';
 IF FOUND THEN IF j.input IS DISTINCT FROM p_input OR j.input_sha256<>v->>'input_sha256' OR j.bound_request IS DISTINCT FROM v THEN RAISE EXCEPTION 'native_local_request_conflict';END IF;RETURN agentstudio.native_local_job_view(j);END IF;
 id:=agentstudio.native_local_insert_job(o,d,p_input,r.id,v->>'step_key',v->>'input_sha256',v);
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE native_local_jobs.id=id;
 -- Extend only this current, already approved claim to the device deadline.
 -- No new claim or automatic replay can acquire a started effect after crash.
 UPDATE agentstudio.jobs SET lease_until=greatest(lease_until,j.deadline_at+interval '5 seconds') WHERE jobs.id=q.id;
 RETURN agentstudio.native_local_job_view(j);
END $fn$;
CREATE FUNCTION agentstudio.native_local_run_binding(p_run uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();b agentstudio.native_local_run_devices;d agentstudio.native_local_devices;
BEGIN SELECT * INTO b FROM agentstudio.native_local_run_devices WHERE run_id=p_run AND owner_user_id=o;IF NOT FOUND THEN RETURN NULL;END IF;
 d:=agentstudio.native_local_live(b.device_id,o);IF d.version<>b.device_version OR d.owner_epoch<>b.owner_epoch OR agentstudio.native_local_digest(d.catalog)<>b.catalog_sha256 THEN RAISE EXCEPTION 'native_local_catalog_changed';END IF;
 RETURN jsonb_build_object('device_id',b.device_id,'version',b.device_version,'catalog',b.catalog,'catalog_sha256',b.catalog_sha256);END $fn$;
CREATE FUNCTION agentstudio.native_local_admission_device(p_run uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();d uuid;
BEGIN SELECT device_id INTO d FROM agentstudio.native_local_run_devices WHERE run_id=p_run AND owner_user_id=o;RETURN d;END $fn$;
CREATE FUNCTION agentstudio.native_local_run_tasks(p_run uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();v jsonb;
BEGIN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'step_key',step_key,'status',status,'error',error) ORDER BY created_at,id),'[]'::jsonb) INTO v FROM agentstudio.native_local_jobs WHERE run_id=p_run AND owner_user_id=o;RETURN v;END $fn$;
CREATE FUNCTION agentstudio.native_local_worker_binding(v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE q agentstudio.jobs;b agentstudio.native_local_run_devices;d agentstudio.native_local_devices;r record;
BEGIN
 SELECT * INTO r FROM pg_roles WHERE rolname=session_user;
 IF current_setting('role')<>'agentstudio_worker' OR NOT r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
 OR EXISTS(SELECT 1 FROM pg_roles g WHERE g.oid<>r.oid AND pg_has_role(r.oid,g.oid,'MEMBER') AND g.rolname NOT IN('agentstudio_api','agentstudio_worker'))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid AND (admin_option OR inherit_option OR NOT set_option)) OR NOT pg_has_role(r.oid,'agentstudio_worker','MEMBER')
 THEN RAISE EXCEPTION 'native_local_original_login_required';END IF;
 SELECT * INTO q FROM agentstudio.jobs WHERE id=(v->>'job_id')::uuid AND run_id=(v->>'run_id')::uuid AND status='leased' AND lease_token=(v->>'lease_token')::uuid AND lease_version=(v->>'lease_version')::bigint AND lease_owner=v->>'lease_owner' AND lease_until>clock_timestamp() AND kind='run_tick' AND payload->>'phase'='agent_native_v2';
 IF NOT FOUND THEN RAISE EXCEPTION 'native_local_lease_denied';END IF;
 SELECT * INTO b FROM agentstudio.native_local_run_devices WHERE run_id=q.run_id AND owner_user_id=q.owner_user_id;IF NOT FOUND THEN RETURN NULL;END IF;
 d:=agentstudio.native_local_live(b.device_id,b.owner_user_id);IF d.version<>b.device_version OR d.owner_epoch<>b.owner_epoch OR agentstudio.native_local_digest(d.catalog)<>b.catalog_sha256 THEN RAISE EXCEPTION 'native_local_catalog_changed';END IF;
 RETURN jsonb_build_object('device_id',b.device_id,'version',b.device_version,'catalog',b.catalog,'catalog_sha256',b.catalog_sha256);
END $fn$;
CREATE FUNCTION agentstudio.native_local_images(p_run uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE o uuid:=agentstudio.native_local_owner();b jsonb;j agentstudio.native_local_jobs;
BEGIN
 b:=agentstudio.native_local_run_binding(p_run);IF b IS NULL OR NOT EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=p_run AND owner_user_id=o AND status='running') THEN RETURN '[]'::jsonb;END IF;
 SELECT * INTO j FROM agentstudio.native_local_jobs WHERE run_id=p_run AND owner_user_id=o AND device_id=(b->>'device_id')::uuid ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND OR j.status<>'succeeded' OR j.created_at<clock_timestamp()-interval '120 seconds' THEN RETURN '[]'::jsonb;END IF;
 PERFORM agentstudio.native_local_result_safe(j.result);RETURN j.result->'images';
END $fn$;
DO $grants$
DECLARE f record;
BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='agentstudio'::regnamespace AND starts_with(proname,'native_local_') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_local_executor',f.oid::regprocedure);
 IF f.proname IN('native_local_list','native_local_get','native_local_receipt','native_local_record','native_local_bind','native_local_agent_enqueue','native_local_run_binding','native_local_images','native_local_admission_device','native_local_run_tasks') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO agentstudio_api',f.oid::regprocedure);END IF;
 IF f.proname IN('native_local_pair','native_local_poll','native_local_check','native_local_complete') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO agentstudio_local_executor',f.oid::regprocedure);END IF;
 IF f.proname='native_local_worker_binding' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO agentstudio_worker',f.oid::regprocedure);END IF;
 END LOOP;
END $grants$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_067','Optional Native-owned local device pairing, once-only task lease and immutable request recovery for F20/F21; no production activation');
COMMIT;
