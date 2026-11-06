import {createHash} from 'node:crypto'
export const originalRoleProfile='original-roles-v2'
const col=(name,type,def=null)=>({name,type,default:def,required:true})
const identity=[col('owner_user_id','uuid'),col('spec_id','uuid'),col('spec_revision','bigint')]
const clock=()=>col('created_at','timestamp with time zone','clock_timestamp()')
const fk=(keys,target,target_keys)=>({keys,target,target_keys})
export const originalRoleTables=[
 {name:'runtime_profile',columns:[col('protocol','text'),col('source_sha256','text'),clock()],keys:[['protocol']],checks:["protocol='original-roles-v2'","source_sha256 ~ '^[a-f0-9]{64}$'"],foreign:[],readOnly:true},
 {name:'original_skills',columns:[col('owner_user_id','uuid'),col('id','text'),col('name','text'),col('active','boolean','true'),col('latest_version','integer'),clock(),col('updated_at','timestamp with time zone','clock_timestamp()')],keys:[['owner_user_id','id'],['owner_user_id','name']],checks:["id ~ '^[A-Za-z0-9]{15}$'","length(name) BETWEEN 1 AND 64 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",'latest_version BETWEEN 1 AND 100'],foreign:[fk(['owner_user_id'],'agentstudio.users',['id'])],update:['active','latest_version','updated_at']},
 {name:'original_skill_versions',columns:[col('owner_user_id','uuid'),col('skill_id','text'),col('version','integer'),col('name','text'),col('description','text'),col('content','text'),col('content_sha256','text'),clock()],keys:[['owner_user_id','skill_id','version'],['owner_user_id','skill_id','version','content_sha256']],checks:['version BETWEEN 1 AND 100','length(name) BETWEEN 1 AND 64','length(description) BETWEEN 1 AND 1024','length(content) BETWEEN 15 AND 16000',"content_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256=encode(sha256(convert_to(content,'UTF8')),'hex')"],foreign:[fk(['owner_user_id','skill_id'],'agentstudio_roles.original_skills',['owner_user_id','id'])]},
 {name:'original_skill_reviews',columns:[col('owner_user_id','uuid'),col('skill_id','text'),col('version','integer'),col('content_sha256','text'),col('reviewed_by','uuid'),col('reviewed_at','timestamp with time zone','clock_timestamp()')],keys:[['owner_user_id','skill_id','version']],checks:['reviewed_by=owner_user_id'],foreign:[fk(['owner_user_id','skill_id','version','content_sha256'],'agentstudio_roles.original_skill_versions',['owner_user_id','skill_id','version','content_sha256'])]},
 {name:'original_role_specs',columns:[...identity,col('spec','jsonb'),col('spec_sha256','text'),clock()],keys:[['owner_user_id','spec_id','spec_revision']],checks:['spec_revision>0',"jsonb_typeof(spec)='object'","spec_sha256 ~ '^[a-f0-9]{64}$'"],foreign:[fk(['spec_id','owner_user_id'],'agentstudio.agent_specs',['id','owner_user_id'])]},
 {name:'original_role_extensions',columns:[...identity,col('base_spec_sha256','text'),col('extension','jsonb'),clock()],keys:[['owner_user_id','spec_id','spec_revision']],checks:["base_spec_sha256 ~ '^[a-f0-9]{64}$'","jsonb_typeof(extension)='object'"],foreign:[fk(['owner_user_id','spec_id','spec_revision'],'agentstudio_roles.original_role_specs',['owner_user_id','spec_id','spec_revision'])]},
 {name:'original_role_run_pins',columns:[col('owner_user_id','uuid'),col('run_id','uuid'),col('spec_id','uuid'),col('spec_revision','bigint'),col('payload','jsonb'),col('payload_sha256','text'),clock()],keys:[['owner_user_id','run_id']],checks:["jsonb_typeof(payload)='object'","payload_sha256 ~ '^[a-f0-9]{64}$'"],foreign:[fk(['run_id','owner_user_id'],'agentstudio.runs',['id','owner_user_id']),fk(['owner_user_id','spec_id','spec_revision'],'agentstudio_roles.original_role_specs',['owner_user_id','spec_id','spec_revision']),fk(['owner_user_id','spec_id','spec_revision'],'agentstudio_roles.original_role_extensions',['owner_user_id','spec_id','spec_revision'])]}
]
export const originalRoleFunctions=[
 {name:'immutable',signature:'()',args:[],returns:'trigger',definer:false,grants:[],source:"\nBEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='original_role_record_immutable'; END\n"},
 {name:'worker_pin',signature:'(uuid,uuid,uuid,bigint,text)',args:['uuid','uuid','uuid','bigint','text'],returns:'jsonb',definer:true,grants:['agentstudio_worker'],source:`
DECLARE result jsonb; admitted boolean; owner_id uuid;
BEGIN
 IF session_user <> 'agentstudio_stage_worker' THEN RAISE EXCEPTION 'original_role_worker_login_required'; END IF;
 SELECT j.owner_user_id INTO owner_id FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id JOIN agentstudio.users u ON u.id=j.owner_user_id
 WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5 AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp() AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active' AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256' FOR SHARE OF j,r,u;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;
 SELECT EXISTS(SELECT 1 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=owner_id AND run_id=$1) INTO admitted;
 IF NOT admitted THEN
  IF EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=$1 AND checkpoint->'role_run' IS NOT NULL) THEN RAISE EXCEPTION 'original_role_worker_pin_missing'; END IF;
  RETURN NULL;
 END IF;
 SELECT jsonb_build_object('payload',p.payload,'payload_sha256',p.payload_sha256,'spec',h.spec,'spec_sha256',h.spec_sha256) INTO result
 FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
 JOIN agentstudio_roles.original_role_run_pins p ON p.run_id=r.id AND p.owner_user_id=r.owner_user_id
 JOIN agentstudio_roles.original_role_specs h ON h.owner_user_id=p.owner_user_id AND h.spec_id=p.spec_id AND h.spec_revision=p.spec_revision
 JOIN agentstudio.users u ON u.id=j.owner_user_id
 WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5
 AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp()
 AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active'
 AND r.agent_spec_id=p.spec_id AND j.payload->>'agent_spec_id'=p.spec_id::text
 AND (j.payload->>'spec_revision')::bigint=p.spec_revision
 AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256'
 AND r.checkpoint->'role_run'->>'profile'='original-roles-v2'
 AND r.checkpoint->'role_run'->>'run_id'=r.id::text
 AND r.checkpoint->'role_run'->>'payload_sha256'=p.payload_sha256
 FOR SHARE OF j,r,p,h,u;
 IF result IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;
 RETURN result;
END
`}
]
export function originalRoleConstraints(t){return [...t.columns.map(c=>({name:t.name+'_'+c.name+'_nn',type:'n',keys:[c.name],expression:null})),...t.keys.map((keys,i)=>({name:t.name+(i?'_u'+i:'_pkey'),type:i?'u':'p',keys,expression:null})),...t.checks.map((expression,i)=>({name:t.name+'_ck'+i,type:'c',keys:[],expression})),...t.foreign.map((f,i)=>({name:t.name+'_fk'+i,type:'f',expression:null,...f}))]}
const originalRoleInstallTemplate=`-- Independent optional role profile. No 080/081 or auth-schema grants.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_database()<>'agent_studio'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5333
 OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR pg_is_in_recovery()
 OR current_setting('agentstudio.original_role_profile',true) IS DISTINCT FROM 'original-roles-v2'
 OR current_setting('agentstudio.original_role_approval',true) IS DISTINCT FROM 'APPROVE_DISPOSABLE_ORIGINAL_ROLES_V2_SCHEMA_ONLY'
 OR to_regnamespace('agentstudio_roles') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclnamespace=0) OR EXISTS(SELECT 1 FROM pg_event_trigger) THEN RAISE EXCEPTION 'original_role_schema_not_approved'; END IF;
 IF EXISTS(SELECT 1 FROM agentstudio.users) OR EXISTS(SELECT 1 FROM agentstudio.runs) OR EXISTS(SELECT 1 FROM agentstudio.agent_specs) THEN RAISE EXCEPTION 'original_role_fresh_target_required'; END IF;
 IF NOT pg_try_advisory_xact_lock(61824,20261103) THEN RAISE EXCEPTION 'original_role_schema_busy'; END IF;
END $guard$;
CREATE SCHEMA agentstudio_roles AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA agentstudio_roles FROM PUBLIC;
GRANT USAGE ON SCHEMA agentstudio_roles TO agentstudio_api,agentstudio_worker;
${originalRoleTables.map(t=>`CREATE TABLE agentstudio_roles.${t.name}(\n${t.columns.map(c=>`${c.name} ${c.type} CONSTRAINT ${t.name}_${c.name}_nn NOT NULL${c.default?' DEFAULT '+c.default:''}`).concat(originalRoleConstraints(t).filter(c=>c.type!=='n').map(c=>`CONSTRAINT ${c.name} `+(c.type==='p'?'PRIMARY KEY ('+c.keys.join(',')+')':c.type==='u'?'UNIQUE ('+c.keys.join(',')+')':c.type==='c'?'CHECK ('+c.expression+')':'FOREIGN KEY ('+c.keys.join(',')+') REFERENCES '+c.target+'('+c.target_keys.join(',')+') ON UPDATE NO ACTION ON DELETE NO ACTION'))).join(',\n')});
ALTER TABLE agentstudio_roles.${t.name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.${t.name} FORCE ROW LEVEL SECURITY;
CREATE POLICY ${t.name}_owner ON agentstudio_roles.${t.name} TO agentstudio_api USING(${t.readOnly?'true':"owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'"}) WITH CHECK(${t.readOnly?'false':"owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login'"});
REVOKE ALL ON agentstudio_roles.${t.name} FROM PUBLIC;
GRANT SELECT${t.readOnly?'':',INSERT'} ON agentstudio_roles.${t.name} TO agentstudio_api;
${t.update?'GRANT UPDATE('+t.update.join(',')+') ON agentstudio_roles.'+t.name+' TO agentstudio_api;':''}`).join('\n')}
${originalRoleFunctions.map(f=>`CREATE FUNCTION agentstudio_roles.${f.name}${f.signature} RETURNS ${f.returns} LANGUAGE plpgsql SECURITY ${f.definer?'DEFINER':'INVOKER'} SET search_path=pg_catalog AS $body$${f.source}$body$;
REVOKE ALL ON FUNCTION agentstudio_roles.${f.name}${f.signature} FROM PUBLIC;
${f.grants.length?'GRANT EXECUTE ON FUNCTION agentstudio_roles.'+f.name+f.signature+' TO '+f.grants.join(',')+';':''}`).join('\n')}
${originalRoleTables.filter(t=>!t.update).map(t=>'CREATE TRIGGER '+t.name+'_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.'+t.name+' FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();').join('\n')}
INSERT INTO agentstudio_roles.runtime_profile(protocol,source_sha256) VALUES('original-roles-v2','__ORIGINAL_ROLE_SCHEMA_SHA256__');
COMMIT;
`
export const originalRoleSchemaHash=createHash('sha256').update(originalRoleInstallTemplate).digest('hex')
export const originalRoleInstallSQL=originalRoleInstallTemplate.replaceAll('__ORIGINAL_ROLE_SCHEMA_SHA256__',originalRoleSchemaHash)
// Authored static registry; catalog observations never modify it.
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}freeze(originalRoleTables);freeze(originalRoleFunctions)
