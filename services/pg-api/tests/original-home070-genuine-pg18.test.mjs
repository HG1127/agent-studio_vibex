// Genuine hosted PG18 only. No skip, local fallback, PGlite or forged permits.
import assert from 'node:assert/strict'
import test from 'node:test'
import {requireOriginalHome070Ci} from './helpers/original-home070-ci-guard.mjs'
requireOriginalHome070Ci()
test('original Home070: actual PG18 catalog, Native employee HTTPS, atomic full saves and isolation',{timeout:900000},async t=>{
 const [{originalHome070GenuineFixture},{parseOriginalHomeAuthoring}]=await Promise.all([import('./helpers/original-home070-genuine-fixture.mjs'),import('../../../shared/original-home-authoring.ts')])
 const f=await originalHome070GenuineFixture()
 const prefix='/api/v2/original-ui/agent-specs'
 const spec={goal:'完整目标 😀',task_scope:'完整任务范围',deliverables:['成果一','成果二'],task_plan:['步骤一','步骤二'],done_criteria:['完成一','完成二'],tools:[],knowledge_base_ids:[]}
 const authoring={format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:[' 未连接的工具 😀 ','重复需求','重复需求']}
 const execution=row=>{const {require_approval,...value}=row.spec;assert.equal(require_approval,true);return value}
 const write=(name='Synthetic original Home070',overrides={})=>({name,spec,authoring,...overrides})
 const create=async(body=write())=>{const r=await f.raw(prefix,{method:'POST',body});assert.equal(r.status,201);return r.body.item}
 const get=async(id,who='alice')=>{const r=await f.raw(prefix+'/'+id,{who});assert.equal(r.status,200);return r.body.item}
 const snapshot=async()=>({agents:(await f.db.query('SELECT to_jsonb(s) AS row FROM agentstudio.agent_specs s ORDER BY id')).rows,metadata:(await f.db.query('SELECT to_jsonb(s) AS row FROM agentstudio.agent_spec_authoring s ORDER BY agent_spec_id')).rows,audits:(await f.db.query("SELECT to_jsonb(a) AS row FROM agentstudio.audit_events a WHERE action LIKE 'agent.original_home.%' ORDER BY id")).rows})
 const rejectInstalled=async()=>{await assert.rejects(f.inspect(),/unsafe_original_home_authoring_schema/);await assert.rejects(f.prepare(),/unsafe_original_home_authoring_schema/)}
 let saved
 try{
  await t.test('01 actual independently authenticated069 predecessor audit precedes070',async()=>{
   assert.equal(f.baseline.predecessor_source_and_catalog_verified,true);assert.equal(f.baseline.complete069_original_initializer_verified,false)
   assert(!f.baseline.versions.includes('pg_v9_070'));assert(!f.baseline.tables.includes('agentstudio.agent_spec_authoring'))
   await f.withApi(async db=>{const actual=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];assert.equal(actual.login,'synthetic_assessment_api');assert.equal(actual.actor,'agentstudio_api')})
   assert.equal(f.providerRequests.length,0)
  })
  await t.test('02 absent/off is safe; enabled without070 rejects actual startup',async()=>{
   assert.equal(await f.inspect(),'absent');assert.equal(await f.prepare(),null)
   await assert.rejects(f.prepare({enabled:true}),/original_home_authoring_schema_required/)
  })
  await t.test('03 ledger-only and helper-only partial070 reject even with flag off',async()=>{
   await f.catalogMutation("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_070','synthetic partial only')","DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_070'",rejectInstalled)
   await f.catalogMutation('CREATE FUNCTION agentstudio.home_authoring_synthetic_partial() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT true$$; REVOKE ALL ON FUNCTION agentstudio.home_authoring_synthetic_partial() FROM PUBLIC','DROP FUNCTION agentstudio.home_authoring_synthetic_partial()',rejectInstalled)
   assert.equal(await f.inspect(),'absent')
  })
  await t.test('04 exact original transaction070 installs one table with no new role/login',async()=>{
   await f.install070();const observed=await f.inventory()
   assert.deepEqual(observed.tables,[...f.baseline.tables,'agentstudio.agent_spec_authoring'].sort());assert.deepEqual(observed.versions,[...f.baseline.versions,'pg_v9_070'].sort());assert.deepEqual(observed.roles,f.baseline.roles)
   assert.equal(await f.inspect(),'installed')
   const actual=(await f.db.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'home_authoring_')")).rows[0];assert.equal(actual.n,2)
   const nn=(await f.db.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_spec_authoring'::regclass AND contype='n'")).rows[0];assert.equal(nn.n,5)
    // A NULL column ACL means no explicit column grant. Effective SELECT still
    // comes from the audited table ACL; never replace NULL with a SQL '{}' ACL.
    await f.withApi(async db=>{const column=(await db.query("SELECT a.attacl IS NULL AS implicit_acl,(SELECT count(*)::integer FROM pg_catalog.aclexplode(a.attacl)) AS explicit_privileges,has_column_privilege('agentstudio_api',a.attrelid,a.attnum,'SELECT') AS readable FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.agent_spec_authoring'::regclass AND a.attname='created_at'")).rows[0];assert.deepEqual(column,{implicit_acl:true,explicit_privileges:0,readable:true})})
  })
  await t.test('05 complete/off audits and configurationWrites false blocks genuine writes',async()=>{
   assert.equal(await f.prepare(),null);await f.prepare({enabled:true,writes:false})
   const before=await snapshot(),response=await f.raw(prefix,{method:'POST',body:write()});assert.equal(response.status,405);assert.equal(response.body.error,'pilot_business_writes_disabled');assert.deepEqual(await snapshot(),before)
   await f.prepare({enabled:true})
  })
  await t.test('06 missing ledger, table or owner policy rejects the real catalog',async()=>{
   await f.catalogMutation("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_070'","INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_070','Original employee Home authoring metadata; display/requirements only')",rejectInstalled)
   await f.catalogMutation('ALTER TABLE agentstudio.agent_spec_authoring RENAME TO synthetic_home070_missing_table','ALTER TABLE agentstudio.synthetic_home070_missing_table RENAME TO agent_spec_authoring',rejectInstalled)
   await f.catalogMutation('DROP POLICY agent_spec_authoring_owner ON agentstudio.agent_spec_authoring','CREATE POLICY agent_spec_authoring_owner ON agentstudio.agent_spec_authoring TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id())',rejectInstalled)
  })
  await t.test('07 extra index/trigger, changed helper, PUBLIC ACL and disabled FORCE RLS reject',async()=>{
   const changes=[
    ['CREATE INDEX synthetic_home070_extra ON agentstudio.agent_spec_authoring(owner_user_id)','DROP INDEX agentstudio.synthetic_home070_extra'],
    ["CREATE FUNCTION agentstudio.synthetic_home070_noop() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_home070_noop() FROM PUBLIC; CREATE TRIGGER synthetic_home070_extra BEFORE INSERT ON agentstudio.agent_spec_authoring FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_home070_noop()",'DROP TRIGGER synthetic_home070_extra ON agentstudio.agent_spec_authoring; DROP FUNCTION agentstudio.synthetic_home070_noop()'],
    ['ALTER FUNCTION agentstudio.home_authoring_valid(jsonb) VOLATILE','ALTER FUNCTION agentstudio.home_authoring_valid(jsonb) IMMUTABLE'],
    ['GRANT EXECUTE ON FUNCTION agentstudio.home_authoring_valid(jsonb) TO PUBLIC','REVOKE ALL ON FUNCTION agentstudio.home_authoring_valid(jsonb) FROM PUBLIC'],
    ['GRANT SELECT ON agentstudio.agent_spec_authoring TO PUBLIC','REVOKE ALL ON agentstudio.agent_spec_authoring FROM PUBLIC'],
    ['GRANT SELECT ON agentstudio.agent_spec_authoring TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR SELECT ON agentstudio.agent_spec_authoring FROM agentstudio_api'],
    ['GRANT UPDATE(authoring) ON agentstudio.agent_spec_authoring TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR UPDATE(authoring) ON agentstudio.agent_spec_authoring FROM agentstudio_api'],
    ['GRANT EXECUTE ON FUNCTION agentstudio.home_authoring_valid(jsonb) TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION agentstudio.home_authoring_valid(jsonb) FROM agentstudio_api'],
    ['ALTER TABLE agentstudio.agent_spec_authoring ALTER COLUMN authoring DROP NOT NULL','ALTER TABLE agentstudio.agent_spec_authoring ALTER COLUMN authoring SET NOT NULL'],
    ['ALTER TABLE agentstudio.agent_spec_authoring NO FORCE ROW LEVEL SECURITY','ALTER TABLE agentstudio.agent_spec_authoring FORCE ROW LEVEL SECURITY'],
   ]
   for(const [change,restore]of changes)await f.catalogMutation(change,restore,rejectInstalled)
   const original=(await f.db.query("SELECT pg_get_functiondef('agentstudio.home_authoring_valid(jsonb)'::regprocedure) AS definition")).rows[0].definition
   await f.catalogMutation('CREATE OR REPLACE FUNCTION agentstudio.home_authoring_valid(p_value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$BEGIN RETURN true; END$$',original,rejectInstalled)
  })
  await t.test('08 genuine Cookie create saves full spec and preserves duplicate free-form requirements',async()=>{
   saved=await create();assert.match(saved.id,/^[a-f0-9-]{36}$/);assert.equal(saved.owner_user_id,f.users.alice);assert.equal(saved.revision,1)
   assert.deepEqual(execution(saved),spec);assert.deepEqual(saved.authoring,authoring);assert.equal(typeof saved.created_at,'string');assert.equal(typeof saved.updated_at,'string')
   assert.deepEqual(Object.keys(saved).sort(),['id','owner_user_id','name','spec','revision','created_at','updated_at','authoring'].sort())
   const actual=(await f.db.query('SELECT authoring FROM agentstudio.agent_spec_authoring WHERE agent_spec_id=$1',[saved.id])).rows[0];assert.deepEqual(actual.authoring,authoring)
  })
  await t.test('09 original list/reopen/full edit retains all fields and actual revisions',async()=>{
   const list=await f.raw(prefix+'?limit=50');assert.equal(list.status,200);assert(list.body.items.some(row=>row.id===saved.id))
   assert.deepEqual(await get(saved.id),saved)
   const next={goal:'修改目标',task_scope:'修改范围',deliverables:['修改成果'],task_plan:['修改计划'],done_criteria:['修改完成'],tools:['calculate'],knowledge_base_ids:[]},meta={...authoring,source:'create',template_key:'',tool_requirements:['下一条需求']}
   const r=await f.raw(prefix+'/'+saved.id,{method:'PATCH',body:{name:'Synthetic full edit',spec:next,authoring:meta,expected_revision:saved.revision}});assert.equal(r.status,200)
   assert.equal(r.body.item.revision,saved.revision+1);assert.deepEqual(execution(r.body.item),next);assert.deepEqual(r.body.item.authoring,meta);saved=r.body.item;assert.deepEqual(await get(saved.id),saved)
  })
  await t.test('10 Bob cannot read/update Alice; body/header injection cannot become identity',async()=>{
   const before=await snapshot(),bob=await f.raw(prefix,{who:'bob'});assert.equal(bob.status,200);assert(!bob.body.items.some(row=>row.id===saved.id))
   const switched=await f.raw(prefix,{who:'bob',method:'POST',body:write('Synthetic switched employee'),expectedEmployee:f.users.alice});assert.equal(switched.status,409);assert.equal(switched.body.error,'employee_session_changed');assert.deepEqual(await snapshot(),before)
   assert.equal((await f.raw(prefix+'/'+saved.id,{who:'bob'})).status,404)
   assert.equal((await f.raw(prefix+'/'+saved.id,{who:'bob',headers:{'X-Rh-User-Id':f.users.alice}})).status,404)
   assert.equal((await f.raw(prefix+'/'+saved.id,{who:'bob',method:'PATCH',body:{name:'foreign',spec,authoring,expected_revision:saved.revision}})).status,404)
   assert.equal((await f.raw(prefix,{method:'POST',body:{...write(),owner_user_id:f.users.bob}})).status,400)
   const noCookie=await f.raw(prefix,{cookie:null,headers:{'X-Rh-User-Id':f.users.alice}});assert.equal(noCookie.status,401)
   await f.withEmployee('bob',async db=>{assert.equal((await db.query('SELECT agent_spec_id FROM agentstudio.agent_spec_authoring WHERE agent_spec_id=$1',[saved.id])).rows.length,0)})
   await assert.rejects(f.withEmployee('bob',db=>db.query('INSERT INTO agentstudio.agent_spec_authoring(agent_spec_id,owner_user_id,authoring) VALUES($1,$2,$3::jsonb)',[saved.id,f.users.alice,JSON.stringify(authoring)]),{readOnly:false}),error=>error.code==='42501')
   assert.deepEqual(await snapshot(),before)
  })
  await t.test('11 actual concurrent CAS permits exactly one revision, metadata and audit',async()=>{
   const before=await snapshot(),expected=saved.revision
   const replies=await Promise.all(['one','two'].map(label=>f.raw(prefix+'/'+saved.id,{method:'PATCH',body:{name:'Synthetic CAS '+label,spec,authoring:{...authoring,tool_requirements:[label]},expected_revision:expected}})))
   assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal(replies.find(r=>r.status===409).body.error,'revision_conflict')
   saved=await get(saved.id);assert.equal(saved.revision,expected+1);const after=await snapshot();assert.equal(after.audits.length,before.audits.length+1);assert.deepEqual(saved.authoring,replies.find(r=>r.status===200).body.item.authoring)
  })
  await t.test('12 actual metadata trigger failure rolls back Agent+metadata+audit for create and update',async()=>{
   await f.catalogMutation("CREATE FUNCTION agentstudio.synthetic_home070_reject_metadata() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_home070_metadata_failure'; END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_home070_reject_metadata() FROM PUBLIC; CREATE TRIGGER synthetic_home070_reject BEFORE INSERT OR UPDATE ON agentstudio.agent_spec_authoring FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_home070_reject_metadata()",'DROP TRIGGER synthetic_home070_reject ON agentstudio.agent_spec_authoring; DROP FUNCTION agentstudio.synthetic_home070_reject_metadata()',async()=>{
    const before=await snapshot();assert.equal((await f.raw(prefix,{method:'POST',body:write()})).status,503);assert.equal((await f.raw(prefix+'/'+saved.id,{method:'PATCH',body:{...write(),expected_revision:saved.revision}})).status,503);assert.deepEqual(await snapshot(),before)
   })
  })
  await t.test('13 actual audit trigger failure rolls back both saves and audits contain digest only',async()=>{
   await f.catalogMutation("CREATE FUNCTION agentstudio.synthetic_home070_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action LIKE 'agent.original_home.%' THEN RAISE EXCEPTION 'synthetic_home070_audit_failure'; END IF; RETURN NEW; END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_home070_reject_audit() FROM PUBLIC; CREATE TRIGGER synthetic_home070_reject BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_home070_reject_audit()",'DROP TRIGGER synthetic_home070_reject ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_home070_reject_audit()',async()=>{
    const before=await snapshot();assert.equal((await f.raw(prefix,{method:'POST',body:write()})).status,503);assert.equal((await f.raw(prefix+'/'+saved.id,{method:'PATCH',body:{...write(),expected_revision:saved.revision}})).status,503);assert.deepEqual(await snapshot(),before)
   })
   const rows=(await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE action LIKE 'agent.original_home.%'")).rows;assert(rows.length>0)
   for(const row of rows){assert.match(row.metadata.authoring_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(row.metadata).sort(),['format','spec_revision','authoring_sha256','tool_requirement_count'].sort());assert(!JSON.stringify(row.metadata).includes('需求'))}
  })
  await t.test('14 both omitted facade metadata and old generic PATCH preserve authoring; old rows show null',async()=>{
   const meta=saved.authoring
   for(const route of [prefix,'/api/v2/agent-specs']){const r=await f.raw(route+'/'+saved.id,{method:'PATCH',body:{name:'Synthetic old client',spec,expected_revision:saved.revision}});assert.equal(r.status,200);saved=await get(saved.id);assert.deepEqual(saved.authoring,meta)}
   const previous=await get(f.resources.alice.spec.id);assert.equal(previous.authoring,null)
  })
  await t.test('15 resource ownership and approval gates retain execution authority',async()=>{
   const before=await snapshot()
   await assert.rejects(f.withEmployee('alice',db=>db.query('INSERT INTO agentstudio.agent_spec_authoring(agent_spec_id,owner_user_id,authoring) VALUES($1,$2,$3::jsonb)',[f.resources.bob.spec.id,f.users.alice,JSON.stringify(authoring)]),{readOnly:false}),error=>error.code==='23503')
   for(const column of ['agent_spec_id','owner_user_id'])await assert.rejects(f.withEmployee('alice',db=>db.query('UPDATE agentstudio.agent_spec_authoring SET '+column+'=$1 WHERE agent_spec_id=$2',[f.users.bob,saved.id]),{readOnly:false}),error=>error.code==='42501')
   await f.withApi(async db=>{for(const role of ['agentstudio_worker','agentstudio_model_broker','agentstudio_native_auth','agentstudio_design_worker','agentstudio_design_dispatch']){const actual=(await db.query("SELECT has_table_privilege($1,'agentstudio.agent_spec_authoring','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,has_any_column_privilege($1,'agentstudio.agent_spec_authoring','SELECT,INSERT,UPDATE,REFERENCES') AS column_access,has_function_privilege($1,'agentstudio.home_authoring_valid(jsonb)','EXECUTE') AS helper_access",[role])).rows[0];assert.equal(actual.table_access,false);assert.equal(actual.column_access,false);assert.equal(actual.helper_access,false)}})
   for(const body of [write('foreign model',{spec:{...spec,model_binding:f.resources.bob.binding}}),write('foreign KB',{spec:{...spec,tools:['knowledge_search'],knowledge_base_ids:['00000000-0000-4000-8000-000000000001']}}),write('approval injection',{spec:{...spec,require_approval:false}}),write('advice injection',{spec:{...spec,tools:['Unconnected descriptive tool']}})]){const r=await f.raw(prefix,{method:'POST',body});assert(r.status>=400&&r.status<500)}
   assert.deepEqual(await snapshot(),before)
   const created=await create(write('bound model',{spec:{...spec,model_binding:f.resources.alice.binding}}));assert.equal(created.spec.require_approval,true);assert.deepEqual(created.spec.model_binding,f.resources.alice.binding);assert.deepEqual(created.spec.tools,[])
  })
  await t.test('16 PostgreSQL JSONB validation matches Root parser UTF16, trim and duplicate rules',async()=>{
   const values=[authoring,{...authoring,template_key:'😀'.repeat(60)},{...authoring,template_key:'😀'.repeat(61)},{...authoring,template_key:'\u00a0research'},{...authoring,template_key:'research\ufeff'},{...authoring,tool_requirements:['😀'.repeat(150),' duplicate ',' duplicate ']},{...authoring,tool_requirements:['😀'.repeat(151)]},{...authoring,tool_requirements:['\u3000']},{...authoring,tool_requirements:['a\u007fb']},{...authoring,tool_requirements:['a\nb']},{...authoring,source:'create',template_key:''},{...authoring,extra:true},null,[]]
   await f.withApi(async db=>{for(const value of values){let accepted=true;try{parseOriginalHomeAuthoring(value)}catch{accepted=false}const actual=(await db.query('SELECT agentstudio.home_authoring_valid($1::jsonb) AS ok',[JSON.stringify(value)])).rows[0].ok;assert.equal(actual,accepted)}})
   for(const who of ['alice','bob'])await assert.rejects(f.withEmployee(who,db=>db.query('DELETE FROM agentstudio.agent_spec_authoring WHERE agent_spec_id=$1',[saved.id]),{readOnly:false}),error=>error.code==='42501')
  })
  await t.test('17 actual session, Origin/CSRF, logout revocation and unsupported DELETE',async()=>{
   const before=await snapshot()
   assert.equal((await f.raw(prefix,{cookie:null})).status,401)
   for(const expectedEmployee of [null,'not-a-uuid']){const r=await f.raw(prefix,{method:'POST',body:write(),expectedEmployee});assert.equal(r.status,400)}
   assert.equal((await f.raw(prefix,{headers:{Authorization:'Bearer synthetic'}})).status,401)
   assert.equal((await f.raw(prefix,{method:'POST',body:write(),headers:{Origin:'https://foreign.example.test'}})).status,403)
   assert.equal((await f.raw(prefix,{method:'POST',body:write(),csrf:false})).status,403)
   assert.equal((await f.raw(prefix,{method:'POST',body:write(),sendOrigin:false})).status,403)
   assert.equal((await f.raw(prefix,{method:'POST',body:write(),csrf:false,sendOrigin:false})).status,403)
   assert.equal((await f.raw(prefix+'/'+saved.id,{method:'DELETE'})).status,405)
   const cookie=await f.login('bob'),logout=await f.raw('/api/native-auth/logout',{who:'bob',method:'POST',body:{}});assert.equal(logout.status,200)
   assert.equal((await f.raw(prefix,{who:'bob',cookie})).status,401);await f.login('bob');assert.deepEqual(await snapshot(),before)
  })
  await t.test('18 committed create with lost HTTPS acknowledgement has one actual write attempt',async()=>{
   const before=await snapshot(),attempts=f.transport.attempts,losses=f.transport.lostReplies
   f.dropNextSuccessfulCreateReply();await assert.rejects(f.raw(prefix,{method:'POST',body:write('Synthetic lost acknowledgement')}))
   assert.equal(f.transport.attempts,attempts+1);assert.equal(f.transport.lostReplies,losses+1)
   const after=await snapshot();assert.equal(after.agents.length,before.agents.length+1);assert.equal(after.metadata.length,before.metadata.length+1);assert.equal(after.audits.length,before.audits.length+1)
   assert.equal(await f.inspect(),'installed');assert.equal(f.providerRequests.length,0)
  })
  await t.test('19 actual owned Home resources expose real counts and keep untested connections unready',async()=>{
   const {verifyOriginalHomeOwnedResources}=await import('./helpers/original-home-owned-resources-case.mjs');await verifyOriginalHomeOwnedResources(f)
  })
 }finally{await f.close()}
})
