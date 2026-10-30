// Actual isolated PG18/TCP + Native HTTPS source. Ordinary hosts refuse BEFORE
// pg, business fixtures, filesystem, SQL, sockets or Worker imports/effects.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireNativeMonitor073Ci} from './helpers/native-monitor073-ci-guard.mjs'
const permit=requireNativeMonitor073Ci()
const fs=await import('node:fs'),path=await import('node:path'),url=await import('node:url'),crypto=await import('node:crypto'),child=await import('node:child_process')
const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const {nativeMonitor073ReviewedSources}=await import('./helpers/native-monitor073-reviewed-sources.mjs')
function assertSources(){
 assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',maxBuffer:4096}).trim(),permit.head)
 assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8',maxBuffer:65536}).trim(),'')
 for(const[file,expected]of Object.entries(nativeMonitor073ReviewedSources)){let at=root;for(const part of file.split('/')){assert.equal(fs.lstatSync(at).isSymbolicLink(),false);at=path.join(at,part)}const st=fs.lstatSync(at);assert(st.isFile()&&!st.isSymbolicLink()&&st.size<=16*1024*1024);assert.equal(sha(fs.readFileSync(at)),expected,'reviewed source '+file)}
}
assertSources()
const {agentDesignGenuineFixture}=await import('./helpers/agent-design-genuine-fixture.mjs')
const {prepareNativeMonitorMetadata}=await import('../src/native-monitor-inbox-import-plan.ts')
const {inspectOptionalNativeMonitorInbox}=await import('../src/native-monitor-inbox-audit.ts')
const {prepareNativeMonitorInbox}=await import('../src/native-monitor-inbox-runtime.ts')
const {createNativeAuthHttpHandler}=await import('../src/native-auth-http.mjs')
const https=await import('node:https')
const old=n=>String(n).padStart(20,'0'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
function metadata(owner,now){
 const monitors=[{id:old(2),case_id:old(1),revision:2,enabled:true,current_check_id:old(3),created_ms:now-1000},{id:old(4),case_id:old(1),revision:2,enabled:false,current_check_id:old(5),created_ms:now-1000}]
 const checks=[{id:old(3),monitor_id:old(2),case_id:old(1),monitor_revision:2,status:'needs_review',created_ms:now-500},{id:old(5),monitor_id:old(4),case_id:old(1),monitor_revision:1,status:'incomplete',created_ms:now-500}]
 const events=Array.from({length:28},(_,i)=>({id:old(100+i),monitor_id:old(i%2?4:2),check_id:old(i%2?5:3),dedup_hash:sha('synthetic-event-'+i),kind:'additional_role',notify:i!==27,read_ms:i===26?now-100:0,created_ms:now-400+Math.floor(i/3)}))
 return{format:'legacy_monitor_metadata_export_v1',source_snapshot_sha256:sha('synthetic frozen metadata export '+owner),owner_user_id:owner,exported_ms:now,cases:[{id:old(1)}],monitors,checks,events}
}
async function insertPlan(f,plan){
 // Test-only administrator ingress, never an employee or product import API.
 // Real deployment import requires its separately approved snapshot/crosswalk.
 const db=await f.adminPool.connect()
 try{await db.query('BEGIN');try{for(const row of plan.rows){assert.match(row.table,/^native_monitor_(imports|cases|monitors|checks|events)$/);const keys=Object.keys(row.value);assert(keys.every(k=>/^[a-z_]+$/.test(k)));await db.query('INSERT INTO agentstudio.'+row.table+'('+keys.join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row.value))}await db.query('COMMIT')}
 catch(error){await db.query('ROLLBACK');throw error}}finally{db.release()}
}
async function ledger(f){const result={};for(const table of ['native_monitor_imports','native_monitor_cases','native_monitor_monitors','native_monitor_checks','native_monitor_events','native_monitor_reads','audit_events']){result[table]=(await f.db.query('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),\'[]\'::jsonb) AS rows FROM agentstudio.'+table+' r')).rows[0].rows}return result}
test('073 real owner rows, keyset union, Native read receipts, replay and fail-closed catalog; metadata stage only',async t=>{
 let f,server,primary;const cleanup=[];let handler,dropRead=false;const cookies=new Map()
 try{
  f=await agentDesignGenuineFixture();assertSources();assert.equal(await inspectOptionalNativeMonitorInbox(f.pool),'absent')
  await f.db.exec(fs.readFileSync(path.join(root,'db/postgres/migrations/pg_v9_073_monitor_inbox.sql'),'utf8'))
  assert.equal(await inspectOptionalNativeMonitorInbox(f.pool),'installed')
  const now=Date.now(),plans={};for(const who of ['alice','bob']){plans[who]=prepareNativeMonitorMetadata(metadata(f.users[who],now));await insertPlan(f,plans[who])}
  server=https.createServer({...f.serverTls,minVersion:'TLSv1.2'},(req,res)=>{void handler(req,res).catch(()=>res.destroy())})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const origin='https://localhost:'+server.address().port
  const actual=await prepareNativeMonitorInbox({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},listen:true,allowedOrigin:origin})
  assert(actual)
  const native=createNativeAuthHttpHandler({auth:f.auth,allowedOrigin:origin,businessHandler:async(req,res)=>{const read=actual.createHandler(native.authenticateRequest);if(dropRead&&req.method==='POST'&&req.url.endsWith('/read')){dropRead=false;const end=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this}return end.apply(this,args)}}if(await read(req,res))return;res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"not_found"}')}});handler=native.handler
  const request=(route,{who='alice',method='GET',body,headers={},cookie,csrf=true}={})=>new Promise((resolve,reject)=>{const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:route,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(8000),headers:{Origin:origin,Accept:'application/json',...(method==='POST'&&csrf?{'X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':f.users[who]}:{}),...(cookie===null?{}:{Cookie:cookie??cookies.get(who)??''}),...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{}),...headers}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>1048576){res.destroy();return}chunks.push(b)});res.once('error',reject);res.once('aborted',()=>reject(Error('synthetic_read_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch(error){reject(error)}})});req.once('error',reject);req.end(bytes)})
  for(const who of ['alice','bob']){const signed=await request('/api/native-auth/login',{who,method:'POST',cookie:null,body:f.credentials[who]});assert.equal(signed.status,200);const full=signed.headers['set-cookie'].find(s=>s.startsWith('__Host-agentstudio_session='));assert.match(full,/Secure/);assert.match(full,/HttpOnly/);cookies.set(who,full.split(';')[0])}
  await t.test('actual rows and READ ONLY hashes; pending check plus historical event on disabled monitor',async()=>{
   const before=await ledger(f),seen=[];let cursor=null
   do{const p=new URLSearchParams({limit:'10',...(cursor?{after_ms:String(cursor.after_ms),after_id:cursor.after_id}:{})}),result=await request('/api/v2/original-ui/monitor-inbox?'+p);assert.equal(result.status,200);assert.equal(result.body.employee_id,f.users.alice);assert.equal(result.body.protocol,'native_original_monitor_inbox_v1');assert.equal(result.headers['cache-control'],'no-store');seen.push(...result.body.items);cursor=result.body.next_cursor;assert.equal(result.body.has_more,Boolean(cursor))}while(cursor)
   const actualIds=seen.map(r=>r.item_id),expected=plans.alice.rows.filter(r=>r.table==='native_monitor_events'&&r.value.notify&&!r.value.read_ms).map(r=>'event:'+r.value.id)
   expected.push('check:'+plans.alice.rows.find(r=>r.table==='native_monitor_checks'&&r.value.status==='needs_review').value.id)
   assert.deepEqual([...actualIds].sort(),expected.sort());assert.equal(new Set(actualIds).size,actualIds.length);assert(actualIds.length>20)
   assert(seen.every(r=>r.kind==='source_unavailable'&&r.title==='监测来源不可用'));assert.doesNotMatch(JSON.stringify(seen),/payload|definition|instruction|token|password/)
   const bobIds=new Set(plans.bob.rows.map(r=>r.value.id));assert(seen.every(r=>!bobIds.has(r.item_id.slice(6))));assert.deepEqual(await ledger(f),before)
   const foreign=await request('/api/v2/original-ui/monitor-inbox?owner_id='+f.users.bob);assert.equal(foreign.status,400);assert.deepEqual(await ledger(f),before)
  })
  const event=plans.alice.rows.find(r=>r.table==='native_monitor_events'&&r.value.notify&&!r.value.read_ms).value.id,read='/api/v2/original-ui/monitor-events/'+event+'/read'
  await t.test('foreign Cookie and changed expected employee cannot mutate/read-ack another owner',async()=>{
   const before=await ledger(f);assert.equal((await request(read,{who:'bob',method:'POST',body:{}})).status,404)
   assert.equal((await request(read,{method:'POST',body:{},headers:{'X-AgentStudio-Expected-Employee':f.users.bob}})).status,409)
   assert.equal((await request(read,{method:'POST',body:{},csrf:false})).status,403)
   assert.equal((await request(read,{method:'POST',body:{},cookie:null})).status,401);assert.deepEqual(await ledger(f),before)
  })
  await t.test('actual lost response after commit and concurrent replays keep one timestamp/audit',async()=>{
   dropRead=true;await assert.rejects(()=>request(read,{method:'POST',body:{}}));const saved=(await f.db.query('SELECT read_ms::text FROM agentstudio.native_monitor_events WHERE id=$1',[event])).rows[0].read_ms;assert(Number(saved)>0)
   const results=await Promise.all(Array.from({length:8},()=>request(read,{method:'POST',body:{}})));assert(results.every(r=>r.status===200&&r.body.ok===true))
   const receipts=(await f.db.query('SELECT read_ms::text,governance_revision::text FROM agentstudio.native_monitor_reads WHERE event_id=$1',[event])).rows;assert.equal(receipts.length,1);assert.equal(receipts[0].read_ms,saved);assert(Number(receipts[0].governance_revision)>0)
   assert.equal((await f.db.query('SELECT read_ms::text FROM agentstudio.native_monitor_events WHERE id=$1',[event])).rows[0].read_ms,saved)
  })
  await t.test('real unique/FK/role protection and unsafe catalog mutation refuse',async()=>{
   const value=plans.alice.rows.find(r=>r.table==='native_monitor_events').value,keys=Object.keys(value)
   await assert.rejects(()=>f.db.query('INSERT INTO agentstudio.native_monitor_events('+keys.join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>k==='id'?id(999):value[k])),error=>error.code==='23505')
   const db=await f.pool.connect();try{await db.query('BEGIN');await db.query('SET LOCAL ROLE agentstudio_api');await assert.rejects(()=>db.query('UPDATE agentstudio.native_monitor_events SET read_ms=1'),error=>error.code==='42501')}finally{await db.query('ROLLBACK');db.release()}
   await f.db.exec('ALTER TABLE agentstudio.native_monitor_events DISABLE ROW LEVEL SECURITY');try{await assert.rejects(()=>inspectOptionalNativeMonitorInbox(f.pool),/unsafe_native_monitor/)}finally{await f.db.exec('ALTER TABLE agentstudio.native_monitor_events ENABLE ROW LEVEL SECURITY')}
   assert.equal(await inspectOptionalNativeMonitorInbox(f.pool),'installed')
  })
  assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors();assertSources()
  // Intentionally no source ACL/producer/review/baseline acceptance claim.
 }catch(error){primary=error}
 finally{if(server){server.closeAllConnections();try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}catch(error){cleanup.push(error)}}if(f)try{await f.close()}catch(error){cleanup.push(error)}}
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup],'monitor073_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup,'monitor073_cleanup_failed')
})
