// Independent fresh071 hosted matrix leg. No local/070-purpose fallback.
import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import {requireOriginalHome071Ci} from './helpers/original-home071-ci-guard.mjs'
requireOriginalHome071Ci()
test('original catalog071: actual fresh PG18, Native Cookies, paging, favorites and owned resources',{timeout:900000},async t=>{
 const {originalHome071GenuineFixture}=await import('./helpers/original-home071-genuine-fixture.mjs'),f=await originalHome071GenuineFixture()
 const base='/api/v2/original-ui/agent-catalog',home='/api/v2/original-ui/agent-specs',created=[]
 const spec={goal:'Synthetic catalog fixture goal',task_scope:'Synthetic isolated scope',deliverables:['Full saved evidence'],task_plan:['No model invocation'],done_criteria:['Actual owner-scoped reads'],tools:[],knowledge_base_ids:[]}
 const authoring=(template=false)=>({format:'agentstudio.home-authoring.v1',source:template?'template':'create',template_key:template?'research':'',tool_requirements:['Descriptive advice only']})
 const create=async(name,who='alice',template=false)=>{const response=await f.raw(home,{who,method:'POST',body:{name,spec,authoring:authoring(template)}});assert.equal(response.status,201);assert.equal(response.body.item.owner_user_id,f.users[who]);return response.body.item}
 const list=async(query='',who='alice')=>{const response=await f.raw(base+(query?'?'+query:''),{who});assert.equal(response.status,200);assert(response.body.items.every(row=>row.owner_user_id===f.users[who]));return response.body}
 const favorite=async(row,value,who='alice',revision=row.revision)=>f.raw(base+'/'+row.id+'/favorite',{who,method:'POST',headers:{'X-AgentStudio-Expected-Employee':f.users[who]},body:{favorite:value,expected_revision:revision}})
 const snapshot=async()=>({specs:(await f.db.query('SELECT to_jsonb(s) AS row FROM agentstudio.agent_specs s ORDER BY id')).rows,authoring:(await f.db.query('SELECT to_jsonb(a) AS row FROM agentstudio.agent_spec_authoring a ORDER BY agent_spec_id')).rows,favorites:(await f.db.query('SELECT to_jsonb(f) AS row FROM agentstudio.agent_spec_favorites f ORDER BY agent_spec_id')).rows,audits:(await f.db.query("SELECT to_jsonb(a) AS row FROM agentstudio.audit_events a WHERE action='agent.catalog.favorite' ORDER BY id")).rows})
 const rejectCatalog=async()=>{await assert.rejects(f.inspectCatalog(),/unsafe_original_agent_catalog_schema/);await assert.rejects(f.prepareCatalog(),/unsafe_original_agent_catalog_schema/)}
 let before071,bob
 try{
  await t.test('01 independently admitted071 purpose owns its fresh069 service and real API session',async()=>{
   assert.equal(f.sourceManifest.profile,'original-agent-catalog071');assert.equal(f.baseline.target.profile,'original-agent-catalog071');assert.equal(f.baseline.fresh_F01_service_required,true);assert.equal(f.baseline.predecessor_source_and_catalog_verified,true);assert.equal(f.baseline.complete069_original_initializer_verified,false)
   assert(!f.baseline.versions.includes('pg_v9_070'));assert(!f.baseline.versions.includes('pg_v9_071'));assert.equal(f.providerRequests.length,0)
   await f.withApi(async db=>{const row=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];assert.equal(row.login,'synthetic_assessment_api');assert.equal(row.actor,'agentstudio_api')})
  })
  await t.test('02 install actual070 predecessor, then require absent071 and enabled-missing refusal',async()=>{
   await f.install070();assert.equal(await f.inspect(),'installed');assert.equal(await f.inspectCatalog(),'absent');assert.equal(await f.prepareCatalog(),null)
   await assert.rejects(f.prepareCatalog({enabled:true}),/original_agent_catalog_schema_required/);before071=await f.inventory()
  })
  await t.test('03 ledger-only or helper-only071 is unsafe even with admission off',async()=>{
   await f.catalogMutation("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_071','synthetic partial')","DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_071'",rejectCatalog)
   await f.catalogMutation('CREATE FUNCTION agentstudio.agent_catalog_synthetic_partial() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT true$$; REVOKE ALL ON FUNCTION agentstudio.agent_catalog_synthetic_partial() FROM PUBLIC','DROP FUNCTION agentstudio.agent_catalog_synthetic_partial()',rejectCatalog)
  })
  await t.test('04 exact original071 transaction adds one table and one ledger, with complete070 and071 audits',async()=>{
   const functions=(await f.db.query("SELECT p.oid::text,p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' ORDER BY p.oid")).rows
   await f.install071();assert.equal(await f.inspect(),'installed');assert.equal(await f.inspectCatalog(),'installed')
   const after=await f.inventory();assert.deepEqual(after.tables,[...before071.tables,'agentstudio.agent_spec_favorites'].sort());assert.deepEqual(after.versions,[...f.baseline.versions,'pg_v9_070','pg_v9_071'].sort());assert.deepEqual(after.roles,before071.roles)
   assert.deepEqual((await f.db.query("SELECT p.oid::text,p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' ORDER BY p.oid")).rows,functions)
   const nn=(await f.db.query("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_spec_favorites'::regclass AND contype='n' ORDER BY conname")).rows;assert.equal(nn.length,5)
  })
  await t.test('05 actual partial, grantability, RLS, extra index and PG18 NOT NULL corruption reject',async()=>{
   const changes=[
    ["DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_071'","INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_071','Original employee owner-scoped Agent catalog favorites')"],
    ['GRANT SELECT ON agentstudio.agent_spec_favorites TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR SELECT ON agentstudio.agent_spec_favorites FROM agentstudio_api'],
    ['GRANT UPDATE(favorite) ON agentstudio.agent_spec_favorites TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR UPDATE(favorite) ON agentstudio.agent_spec_favorites FROM agentstudio_api'],
    ['GRANT SELECT ON agentstudio.agent_spec_favorites TO PUBLIC','REVOKE ALL ON agentstudio.agent_spec_favorites FROM PUBLIC'],
    ['ALTER TABLE agentstudio.agent_spec_favorites NO FORCE ROW LEVEL SECURITY','ALTER TABLE agentstudio.agent_spec_favorites FORCE ROW LEVEL SECURITY'],
    ['CREATE INDEX synthetic_home071_extra ON agentstudio.agent_spec_favorites(owner_user_id)','DROP INDEX agentstudio.synthetic_home071_extra'],
    ['ALTER TABLE agentstudio.agent_spec_favorites ALTER COLUMN favorite DROP NOT NULL','ALTER TABLE agentstudio.agent_spec_favorites ALTER COLUMN favorite SET NOT NULL'],
    ['DROP POLICY agent_spec_favorites_owner ON agentstudio.agent_spec_favorites','CREATE POLICY agent_spec_favorites_owner ON agentstudio.agent_spec_favorites TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id())'],
    ['ALTER TABLE agentstudio.agent_spec_favorites RENAME TO synthetic_home071_missing','ALTER TABLE agentstudio.synthetic_home071_missing RENAME TO agent_spec_favorites'],
   ]
   for(const [change,restore]of changes)await f.catalogMutation(change,restore,rejectCatalog)
  })
  await t.test('06 actual Native070 saves seed more than50 owner records and an independent Bob record',async()=>{
   for(let i=0;i<60;i++)created.push(await create('Home071 '+String(i===11?10:i).padStart(3,'0'),'alice',i%2===1))
   created.push(await create('Home071 literal %_ Case'));bob=await create('Bob catalog actual owned Agent','bob')
   assert.equal(created.length,61);assert(new Set(created.map(row=>row.id)).size===61);assert(created.every(row=>row.revision===1&&row.spec.require_approval===true))
  })
  await t.test('07 real SQL pages/counts include all61 rows with exact beyond-last metadata',async()=>{
   const first=await list('q=Home071&perPage=50&page=1'),second=await list('q=Home071&perPage=50&page=2'),third=await list('q=Home071&perPage=50&page=3')
   for(const page of [first,second,third]){assert.equal(page.totalItems,61);assert.equal(page.totalPages,2);assert.equal(page.perPage,50)}
   assert.equal(first.items.length,50);assert.equal(second.items.length,11);assert.equal(third.items.length,0);assert.equal(third.page,3)
   assert.deepEqual(new Set([...first.items,...second.items].map(row=>row.id)),new Set(created.map(row=>row.id)))
  })
  await t.test('08 source/null provenance and literal wildcard search use accurate actual counts',async()=>{
   assert.equal((await list('q=Home071&source=create&perPage=50')).totalItems,31);assert.equal((await list('q=Home071&source=template&perPage=50')).totalItems,30)
   const oldId=f.resources.alice.spec.id,oldQuery='q='+encodeURIComponent(f.resources.alice.spec.name)+'&perPage=50',oldCatalog=await list(oldQuery);assert.equal(oldCatalog.totalItems,1);assert.equal(oldCatalog.items[0].id,oldId);assert.equal(oldCatalog.items[0].authoring,null)
   for(const source of ['create','template'])assert.equal((await list(oldQuery+'&source='+source)).totalItems,0)
   const oldExact=await f.raw(home+'/'+oldId);assert.equal(oldExact.status,200);assert.equal(oldExact.body.item.authoring,null)
   const query=await list('q='+encodeURIComponent('%_')+'&perPage=50');assert.equal(query.totalItems,1);assert.equal(query.items[0].id,created.at(-1).id)
   const unknown=await list('q='+encodeURIComponent('absent071-query'));assert.equal(unknown.totalItems,0);assert.equal(unknown.totalPages,0);assert.deepEqual(unknown.items,[])
  })
  await t.test('09 C-collation names and deterministic id tie ordering apply to actual SQL pages',async()=>{
   for(const direction of ['asc','desc']){
    const expected=[...created].sort((a,b)=>a.name===b.name?(a.id<b.id?-1:a.id>b.id?1:0):(a.name<b.name?-1:1)*(direction==='asc'?1:-1))
    const pages=[await list('q=Home071&perPage=50&page=1&sort=name_'+direction),await list('q=Home071&perPage=50&page=2&sort=name_'+direction)]
    assert.deepEqual(pages.flatMap(page=>page.items.map(row=>row.id)),expected.map(row=>row.id))
   }
  })
  await t.test('10 default-off and independent write gate retain real read-only behavior',async()=>{
   assert.equal(await f.prepareCatalog(),null);await f.prepareCatalog({enabled:true,writes:false});const before=await snapshot(),response=await favorite(created[0],true);assert.equal(response.status,405);assert.equal(response.body.error,'pilot_business_writes_disabled');assert.deepEqual(await snapshot(),before);assert.equal((await list('q=Home071')).totalItems,61);await f.prepareCatalog({enabled:true})
  })
  await t.test('11 favorite is absolute, audited, owner-scoped and bound to actual master revision',async()=>{
   const chosen=created[0],before=await snapshot()
   for(let i=0;i<2;i++){const response=await favorite(chosen,true);assert.equal(response.status,200);assert.deepEqual(response.body,{agent_spec_id:chosen.id,favorite:true,revision:chosen.revision})}
   const after=await snapshot();assert.deepEqual(after.specs,before.specs);assert.deepEqual(after.authoring,before.authoring);assert.equal(after.audits.length,before.audits.length+2)
   const filtered=await list('q=Home071&favorite=1');assert.equal(filtered.totalItems,1);assert.equal(filtered.items[0].id,chosen.id);assert.equal(filtered.items[0].favorite,true);assert.equal((await list('q=Home071&sort=favorite_desc')).items[0].id,chosen.id)
   assert.equal((await favorite(chosen,false,'bob')).status,404)
   const updated=await f.raw(home+'/'+chosen.id,{method:'PATCH',body:{name:chosen.name,spec:{...spec,goal:'Actual new master revision'},expected_revision:chosen.revision}});assert.equal(updated.status,200)
   const staleBefore=await snapshot(),stale=await favorite(chosen,false);assert.equal(stale.status,409);assert.equal(stale.body.error,'revision_conflict');assert.deepEqual(await snapshot(),staleBefore);Object.assign(chosen,updated.body.item)
  })
  await t.test('12 A conformance helper uses actual Cookie A/B, real me UUIDs and real audit counts',async()=>{
   const {verifyNativeCatalogCookieSwitchCase}=await import('./helpers/native-agent-catalog-cookie-switch-case.mjs'),a=await f.profileFor('alice'),b=await f.profileFor('bob'),before=await snapshot()
   await verifyNativeCatalogCookieSwitchCase({employeeA:{profile:a},employeeB:{profile:b},agentB:bob,requestAs:async(actor,request)=>{const who=actor.profile.id===a.id?'alice':actor.profile.id===b.id?'bob':null;assert(who);const response=await f.raw(request.path,{who,method:request.method,body:request.body,headers:request.headers});return{status:response.status,json:async()=>response.body}},auditCount:async(owner,id)=>(await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE owner_user_id=$1 AND target_id=$2 AND action='agent.catalog.favorite'",[owner,id])).rows[0].n})
   assert.deepEqual(await snapshot(),before)
  })
  await t.test('13 actual side-table and audit failures roll back favorite state and keep Agent revision',async()=>{
   for(const target of ['agent_spec_favorites','audit_events']){
    const condition=target==='audit_events'?"IF NEW.action='agent.catalog.favorite' THEN RAISE EXCEPTION 'synthetic071_audit_fault'; END IF; RETURN NEW;":"RAISE EXCEPTION 'synthetic071_favorite_fault';"
    await f.catalogMutation('CREATE FUNCTION agentstudio.synthetic_home071_reject() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+condition+' END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_home071_reject() FROM PUBLIC; CREATE TRIGGER synthetic_home071_reject BEFORE INSERT OR UPDATE ON agentstudio.'+target+' FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_home071_reject()','DROP TRIGGER synthetic_home071_reject ON agentstudio.'+target+'; DROP FUNCTION agentstudio.synthetic_home071_reject()',async()=>{const before=await snapshot(),response=await favorite(created[0],false);assert.equal(response.status,503);assert.deepEqual(await snapshot(),before)})
   }
  })
  await t.test('14 real068 hidden-source relation is omitted and missing original helper fails closed',async()=>{
   const hidden=await create('Home071 HIDDEN internal source'),invocation=randomUUID()
   // Real isolated fixture table data only: no published run is submitted.
   await f.db.query('INSERT INTO agentstudio.agent_caller_execution_sources(source_id,invocation_id,owner_user_id,credential_id,generation,budget_epoch,owner_epoch,version_id,version_sha256,head_revision,copy_sha256,copy_xmin) VALUES($1,$2,$3,$4,1,1,1,$5,$6,1,$6,$7)',[hidden.id,invocation,f.users.alice,randomUUID(),randomUUID(),'a'.repeat(64),'1'])
   const ids=await f.withEmployee('alice',async db=>(await db.query('SELECT agentstudio.agent_caller_internal_sources() AS ids')).rows[0].ids,{readOnly:false});assert(ids.includes(hidden.id))
   assert.equal((await list('q='+encodeURIComponent('HIDDEN internal source'))).totalItems,0);assert.equal((await f.raw(home+'/'+hidden.id)).status,404)
   const before=await snapshot();assert.equal((await favorite(hidden,true)).status,404);assert.deepEqual(await snapshot(),before)
    await f.catalogMutation('ALTER FUNCTION agentstudio.agent_caller_internal_sources() RENAME TO synthetic_home071_missing_helper','ALTER FUNCTION agentstudio.synthetic_home071_missing_helper() RENAME TO agent_caller_internal_sources',async()=>{
     const response=await f.raw(base);assert.equal(response.status,503);assert.equal(response.body.error,'original_agent_catalog_unavailable')
     for(const path of [home+'?limit=50',home+'/'+hidden.id]){const r=await f.raw(path);assert.equal(r.status,503);assert.equal(r.body.error,'original_home_source_unavailable')}
     const update=await f.raw(home+'/'+hidden.id,{method:'PATCH',body:{name:hidden.name,spec,expected_revision:hidden.revision}})
     assert.equal(update.status,503);assert.equal(update.body.error,'original_home_source_unavailable');assert.deepEqual(await snapshot(),before)
    })
  })
  await t.test('15 actual HTTP count/page retain one RR snapshot during a concurrent real save',async()=>{
   const gate=f.holdNextCatalogCount(),pending=f.raw(base+'?q=SNAP071&perPage=50')
   try{await Promise.race([gate.counted,pending.then(response=>{throw Error('catalog_reply_before_count_observation_'+response.status)})]);await create('SNAP071 concurrent actual save')}finally{gate.release()}
   const first=await pending;assert.equal(first.status,200);assert.equal(first.body.totalItems,0);assert.deepEqual(first.body.items,[]);assert.equal((await list('q=SNAP071&perPage=50')).totalItems,1)
  })
  await t.test('16 strict query/body/Origin/CSRF and expected-owner headers are genuine HTTP negatives',async()=>{
   const before=await snapshot()
   for(const query of ['page=1&page=2','perPage=51','owner_user_id='+f.users.bob,'q='+encodeURIComponent('\n')])assert.equal((await f.raw(base+'?'+query)).status,400)
   assert.equal((await f.raw(base,{cookie:null})).status,401);assert.equal((await f.raw(base,{headers:{Authorization:'Bearer synthetic'}})).status,401)
   assert.equal((await f.raw(base+'/'+created[0].id+'/favorite',{method:'POST',headers:{Origin:'https://foreign.example','X-AgentStudio-Expected-Employee':f.users.alice},body:{favorite:false,expected_revision:created[0].revision}})).status,403)
   assert.equal((await f.raw(base+'/'+created[0].id+'/favorite',{method:'POST',csrf:false,headers:{'X-AgentStudio-Expected-Employee':f.users.alice},body:{favorite:false,expected_revision:created[0].revision}})).status,403)
   assert.equal((await f.raw(base+'/'+created[0].id,{method:'DELETE'})).status,405);assert.deepEqual(await snapshot(),before)
  })
  await t.test('17 direct API RLS/FK/column privileges retain ownership and no delete/re-grant path',async()=>{
   const before=await snapshot()
   await assert.rejects(f.withEmployee('bob',db=>db.query('INSERT INTO agentstudio.agent_spec_favorites(agent_spec_id,owner_user_id,favorite) VALUES($1,$2,true)',[created[0].id,f.users.alice]),{readOnly:false}),error=>error.code==='42501')
   await assert.rejects(f.withEmployee('alice',db=>db.query('INSERT INTO agentstudio.agent_spec_favorites(agent_spec_id,owner_user_id,favorite) VALUES($1,$2,true)',[bob.id,f.users.alice]),{readOnly:false}),error=>error.code==='23503')
   for(const query of ['DELETE FROM agentstudio.agent_spec_favorites','UPDATE agentstudio.agent_spec_favorites SET owner_user_id=$1::uuid'])await assert.rejects(f.withEmployee('alice',db=>db.query(query,query.startsWith('UPDATE')?[f.users.bob]:[]),{readOnly:false}),error=>error.code==='42501')
   await f.withEmployee('bob',async db=>assert.equal((await db.query('SELECT agent_spec_id FROM agentstudio.agent_spec_favorites WHERE agent_spec_id=$1',[created[0].id])).rows.length,0))
   assert.deepEqual(await snapshot(),before);assert.equal(await f.inspectCatalog(),'installed')
  })
  await t.test('18 owned metadata resources use real document/chunk totals and untested connector status',async()=>{
   const {verifyOriginalHomeOwnedResources}=await import('./helpers/original-home-owned-resources-case.mjs');await verifyOriginalHomeOwnedResources(f);assert.equal(f.providerRequests.length,0)
  })
 }finally{await f.close()}
})
