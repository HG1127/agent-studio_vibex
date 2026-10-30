import test from 'node:test'
import assert from 'node:assert/strict'
import {originalMonitor073HostPolicy as policy} from './helpers/pg-original-monitor073-host-policy.mjs'
import {requireOriginalMonitor073BrowserCi} from './helpers/pg-original-monitor073-browser-guard.mjs'
const event='00000000-0000-4000-8000-000000000001',path='/__pg_native/api/v2/original-ui/monitor-events/'+event+'/read'
test('073 host extends only exact owned read acknowledgement and preserves legacy/model-write denials',()=>{
 assert.deepEqual(policy('POST',path),{kind:'native',pathname:path})
 for(const [method,raw]of [['POST',path+'?owner_id=x'],['POST',path.replace('/read','/%72ead')],['POST',path.replace('00000000-','ABCDEF00-')],['POST','/__pg_native/api/v2/agent-design/submit'],['POST','/__pg_native/api/v2/agent-runs'],['DELETE',path],['POST','/__pb/api/agent-runs']])assert.notEqual(policy(method,raw).kind,'native')
 assert.equal(policy('GET','/__pg_native/api/v2/original-ui/monitor-inbox?limit=10').kind,'native')
})
test('073 browser never grants an ordinary process or old profile alone a runtime permit',()=>{
 for(const [env,platform,uid]of [[{},'win32',0],[{},'linux',0],[{AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY'},'linux',1001],[{AGENT_STUDIO_ORIGINAL_MONITOR073_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY'},'linux',1001]])assert.throws(()=>requireOriginalMonitor073BrowserCi(env,platform,uid))
})

import fs from 'node:fs'
test('actual login callback starts reading both real response bodies before navigation can retire them',async()=>{
 const {default:ts}=await import('typescript'),text=fs.readFileSync(new URL('./pg-original-monitor073-genuine.spec.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('story.mjs',text,ts.ScriptTarget.Latest,true),matches=[]
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='login')matches.push(n.initializer);ts.forEachChild(n,visit)}visit(tree);assert.equal(matches.length,1)
 let retired=false;const calls=[],listeners=new Map(),wire=path=>new Promise(resolve=>listeners.set(path,resolve)),body=(name,value)=>({json(){assert.equal(retired,false,'a navigation retired the actual response body');calls.push(name);return Promise.resolve(value)}})
 const monitorPath='/__pg_native/api/v2/original-ui/monitor-inbox',page={goto:async()=>{},getByLabel:()=>({fill:async()=>{}}),getByRole:(_,options)=>({fill:async()=>{},click:async()=>{assert(listeners.has('/__pg_native/api/native-auth/me')&&listeners.has(monitorPath));listeners.get('/__pg_native/api/native-auth/me')(body('me',{user:{id:'alice'}}));listeners.get(monitorPath)(body('inbox',{employee_id:'alice',items:[{}]}));await Promise.resolve();retired=true}})},f={origin:'https://localhost:17443',credentials:{alice:{email:'synthetic@example.invalid',password:'synthetic'}},users:{alice:'alice'},syntheticMonitorIds:{alice:['owned'],bob:['foreign']}}
 const expect=value=>({toBe:expected=>assert.equal(value,expected),toBeGreaterThan:n=>assert(value>n),toBeVisible:async()=>{},toHaveCount:async()=>{}}),section=()=>({getByRole:()=>({evaluateAll:async()=>['/?check=owned']})})
 const login=Function('page','wire','f','expect','section','monitorPath','return ('+matches[0].getText(tree)+')')(page,wire,f,expect,section,monitorPath)
 assert.deepEqual(await login('alice'),{id:'alice'});assert.deepEqual(calls,['me','inbox']);assert.equal(retired,true)
})
test('monitor success images require completed story, final cleanup zero gates and fixed bounded buffers',()=>{
 const text=fs.readFileSync(new URL('./pg-original-monitor073-genuine.spec.mjs',import.meta.url),'utf8')
 const zero=text.indexOf("await clean('final_zero_after_cleanup'"),gate=text.indexOf('if(stepsCompleted&&!primary&&!testInfo.errors.length&&!cleanup.length)',zero),write=text.indexOf("await clean('fixed_success_image_write'",gate)
 assert(zero>0&&gate>zero&&write>gate);assert(text.includes('bytes.length<=8388608'));assert(text.includes('image.bytes.fill(0)'));assert(text.includes('bytes.length>1048576'));assert(!text.includes("synthetic_failure_image"));assert(!text.includes('screenshot({path:'))
})
const purpose=Object.freeze({
 GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',
 GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
 GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-browser',
 GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-test',
 AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',
 AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_HOME071_ONLY',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_PROFILE:'original-login-home071',AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_STORY:'original-login',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD:'a'.repeat(40),
 AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
 AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',
 AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',
 AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123',
})
const read=relative=>fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8')
const markers={AGENT_STUDIO_ORIGINAL_MONITOR073_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY',AGENT_STUDIO_ORIGINAL_MONITOR073_PROFILE:'original-home-monitor073-metadata',AGENT_STUDIO_ORIGINAL_MONITOR073_STORY:'original-login',AGENT_STUDIO_ORIGINAL_MONITOR073_EXPECTED_HEAD:'a'.repeat(40)}
test('actual old071 purpose alone and every missing or wrong073 marker are refused for both stories',()=>{
 assert.throws(()=>requireOriginalMonitor073BrowserCi(purpose,'linux',1001),/original_monitor073_browser_admission_refused/)
 for(const story of ['original-login','monitor073'])for(const key of Object.keys(markers)){
  const input={...purpose,...markers,AGENT_STUDIO_ORIGINAL_MONITOR073_STORY:story};delete input[key]
  assert.throws(()=>requireOriginalMonitor073BrowserCi(input,'linux',1001),/original_monitor073_browser_admission_refused/,story+' missing '+key)
  assert.throws(()=>requireOriginalMonitor073BrowserCi({...input,[key]:'wrong'},'linux',1001),/original_monitor073_browser_admission_refused/,story+' wrong '+key)
 }
})
test('073 markers cannot forge host/job/head, relax identity or skip the genuine071 predecessor',()=>{
 for(const [key,value]of [['GITHUB_JOB','pg18-agent-design-genuine'],['GITHUB_SHA','b'.repeat(40)],['RUNNER_ENVIRONMENT','self-hosted'],['AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI',undefined],['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI',undefined],['AGENT_STUDIO_F01_GENUINE_CI',undefined],['AGENT_STUDIO_PG18_CI_DATABASE','company'],['NODE_OPTIONS',''],['DATABASE_URL','postgres://example.invalid/company']])assert.throws(()=>requireOriginalMonitor073BrowserCi({...purpose,...markers,[key]:value},'linux',1001),/refus/)
 for(const [platform,uid]of [['win32',1001],['linux',0]])assert.throws(()=>requireOriginalMonitor073BrowserCi({...purpose,...markers},platform,uid),/refus/)
})
test('073 composition actually installs and audits immutable SQL and nonempty owner rows before top receipt',()=>{
 const body=read('tests/helpers/pg-original-monitor073-backend-fixture.mjs'),guard=read('tests/helpers/pg-original-monitor073-browser-guard.mjs')
 assert(body.indexOf('requireOriginalMonitor073BrowserCi(env)')<body.indexOf("import('node:fs')"))
 for(const text of ["await baseModule.originalLoginHome071GenuineFixture(env)","await f.db.exec(sql073.toString('utf8'))","await audit.inspectOptionalNativeMonitorInbox(f.pool)!=='installed'","monitor073_nonempty_owner_seed_required","AbortSignal.timeout(8000)","format:'agentstudio.original-home-monitor073.metadata.fixture.v1'","predecessor:f.browserHomeProfile","monitor073_source_sha256:sha(sql073)","full_monitor_pipeline_complete:false"])assert(body.includes(text),text)
 assert(body.indexOf('monitor073_nonempty_owner_seed_required')<body.indexOf('browserHomeProfile:Object.freeze('))
 assert.doesNotMatch(guard,/\.\.\.base|GITHUB_JOB\s*[:=]/)
 assert(guard.includes('predecessor:base'));assert(guard.includes("profile:'original-home-monitor073-metadata'"))
 assert.doesNotMatch(body,/rejectUnauthorized:\s*false/)
})
test('both stories use independent073 receipt and original Login keeps all existing error zero gates',()=>{
 for(const file of ['tests/helpers/pg-original-login-genuine-browser-fixture.mjs','tests/helpers/pg-original-monitor073-genuine-browser-fixture.mjs']){
  const body=read(file);assert(body.indexOf('requireOriginalMonitor073BrowserCi(env)')<body.indexOf("import('node:fs')"))
  for(const text of ['actualProfile?.format',"agentstudio.original-home-monitor073.metadata.fixture.v1",'actualProfile.monitor073_catalog_verified!==true','actualProfile.monitor073_seeded_nonempty!==true','actualProfile.predecessor.head','homeBackend.originalMonitor073BackendFixture(env)','if(!(isMe&&status===401))'])assert(body.includes(text),file+' '+text)
 }
 const story=read('tests/pg-original-login-genuine.spec.mjs')
 assert(story.indexOf('requireOriginalMonitor073BrowserCi()')<story.indexOf("await import('node:fs/promises')"))
 assert(story.includes('expect(f.backendProfile.predecessor).toMatchObject('))
 for(const text of ['auth_steps_completed:authStepsCompleted','actual_backend:f.backendProfile',"f.observations.unexpected_api_failures","f.observations.legacy_backend_requests","f.observations.blocked_requests",'home_business_complete:false','production_GO:false'])assert(story.includes(text),text)
 const workflow=read('.github/workflows/pg18-agent-design-genuine-ci.yml')
 for(const marker of ['CI','PROFILE','STORY','EXPECTED_HEAD'])assert.equal(workflow.split('AGENT_STUDIO_ORIGINAL_MONITOR073_'+marker+':').length,3)
 assert(workflow.includes('AGENT_STUDIO_ORIGINAL_MONITOR073_STORY: original-login'));assert(workflow.includes('AGENT_STUDIO_ORIGINAL_MONITOR073_STORY: monitor073'))
 assert.doesNotMatch(workflow,/GITHUB_JOB\s*[:=]/)
})


import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {prepareNativeMonitorMetadata} from '../services/pg-api/src/native-monitor-inbox-import-plan.ts'
import {nativeMonitorTables} from '../services/pg-api/src/native-monitor-inbox-schema.ts'
import {nativeMonitor073SeedStatement} from '../services/pg-api/tests/helpers/native-monitor073-seed-statement.mjs'
const seedId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),seedOld=n=>String(n).padStart(20,'0'),seedNow=1793310000000
const seedSha=value=>createHash('sha256').update(value).digest('hex')
function actualFixturePlan(kind,who){
 const users={alice:seedId(100),bob:seedId(200)}
 let exported
 if(kind==='tcp'){
  const source=read('services/pg-api/tests/native-monitor073-genuine-pg18.test.mjs'),start=source.indexOf('function metadata(owner,now){'),end=source.indexOf('\nasync function insertPlan',start)
  assert(start>=0&&end>start)
  exported=runInNewContext('('+source.slice(start,end)+')('+JSON.stringify(users[who])+','+seedNow+')',{old:seedOld,sha:seedSha})
 }else{
  const source=read('tests/helpers/pg-original-monitor073-backend-fixture.mjs'),marker='   const source=',start=source.indexOf(marker),end=source.indexOf('\n   const plan=',start)
  assert(start>=0&&end>start);assert.equal(source.split(marker).length,2)
  exported=runInNewContext('('+source.slice(start+marker.length,end).trim()+')',{old:seedOld,sha:seedSha,who,now:seedNow,f:{users}})
 }
 // The reviewed pure literal builder runs in a VM realm. Reconstitute plain
 // data for the real import preparer's exact Object.prototype check.
 return prepareNativeMonitorMetadata(JSON.parse(JSON.stringify(exported)))
}
test('both actual fixture metadata builders produce parameterized statements for every reviewed plan column, including sha256',()=>{
 const tables=new Map(nativeMonitorTables.map(t=>[t.name,t])),seen=new Set();let rows=0
 for(const kind of ['tcp','browser'])for(const who of ['alice','bob']){
  const plan=actualFixturePlan(kind,who)
  for(const row of plan.rows){
   const query=nativeMonitor073SeedStatement(row),columns=tables.get(row.table).columns.map(c=>c.name)
   assert.equal(query.text,'INSERT INTO agentstudio.'+row.table+'('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')')
   assert.deepEqual(query.values,columns.map(k=>row.value[k]));assert.equal(query.values.length,columns.length)
   assert.equal(row.value.owner_user_id,who==='alice'?seedId(100):seedId(200))
   if(row.table==='native_monitor_imports'){assert(columns.includes('source_snapshot_sha256'));assert.equal(/^[a-z_]+$/.test('source_snapshot_sha256'),false)}
   seen.add(row.table);rows++
  }
 }
 assert.deepEqual([...seen].sort(),['native_monitor_cases','native_monitor_checks','native_monitor_events','native_monitor_imports','native_monitor_monitors'])
 assert.equal(rows,93)
})
test('seed statement requires the exact full column set and accepts no otherwise legal arbitrary identifier',()=>{
 const row=actualFixturePlan('browser','alice').rows[0]
 for(const value of [{...row.value,arbitrary_column2:1},{...row.value,source_snapshot_sha256_suffix:'x'},Object.fromEntries(Object.entries(row.value).filter(([k])=>k!=='source_snapshot_sha256'))]){
  assert.throws(()=>nativeMonitor073SeedStatement({...row,value}),/monitor073_seed_column/)
 }
 const reordered={table:row.table,value:Object.fromEntries(Object.entries(row.value).reverse())}
 assert.deepEqual(nativeMonitor073SeedStatement(reordered),nativeMonitor073SeedStatement(row))
 const monitor=actualFixturePlan('browser','alice').rows.find(r=>r.table==='native_monitor_monitors'),{current_check_id,...missingNullable}=monitor.value
 assert.throws(()=>nativeMonitor073SeedStatement({...monitor,value:missingNullable}),/monitor073_seed_column/)
})
test('seed table whitelist excludes receipts, unrelated tables and SQL/schema injection',()=>{
 const row=actualFixturePlan('browser','alice').rows[0]
 for(const table of ['native_monitor_reads','users','agentstudio.native_monitor_imports','native_monitor_imports;DROP TABLE users','Native_monitor_imports','native_monitor_imports2'])
  assert.throws(()=>nativeMonitor073SeedStatement({...row,table}),/monitor073_seed_table/)
 const attack="'); DROP TABLE agentstudio.users; --",query=nativeMonitor073SeedStatement({...row,value:{...row.value,source_snapshot_sha256:attack}})
 assert(!query.text.includes(attack));assert(query.values.includes(attack))
})
test('seed validation never invokes accessors or accepts inherited/symbol columns',()=>{
 const row=actualFixturePlan('browser','alice').rows[0];let invoked=false
 const value={...row.value};Object.defineProperty(value,'id',{get(){invoked=true;throw Error('must not run')},enumerable:true})
 assert.throws(()=>nativeMonitor073SeedStatement({...row,value}),/monitor073_seed_column/);assert.equal(invoked,false)
 assert.throws(()=>nativeMonitor073SeedStatement({...row,value:Object.assign(Object.create({hidden:1}),row.value)}),/monitor073_seed_column/)
 assert.throws(()=>nativeMonitor073SeedStatement({...row,value:{...row.value,[Symbol('hidden')]:1}}),/monitor073_seed_column/)
})
test('both real ingress paths use the shared whitelist after purpose guards and retain real transactions',()=>{
 for(const [file,guard] of [['services/pg-api/tests/native-monitor073-genuine-pg18.test.mjs','const permit=requireNativeMonitor073Ci()'],['tests/helpers/pg-original-monitor073-backend-fixture.mjs','const permit=requireOriginalMonitor073BrowserCi(env)']]){
  const body=read(file)
  assert(body.indexOf(guard)<body.indexOf("await import("+(file.startsWith('tests/')?"'../../services/pg-api/tests/helpers/native-monitor073-seed-statement.mjs'":"'./helpers/native-monitor073-seed-statement.mjs'")))
  assert(body.includes('const statement=nativeMonitor073SeedStatement(row);await db.query(statement.text,statement.values)'))
  assert(!body.includes('keys.every(k=>/^[a-z_]+$/.test(k))'))
  for(const literal of ["f.adminPool.connect()","db.query('BEGIN')","db.query('COMMIT')","db.query('ROLLBACK')",'db.release()'])assert(body.includes(literal),file+' '+literal)
 }
})
