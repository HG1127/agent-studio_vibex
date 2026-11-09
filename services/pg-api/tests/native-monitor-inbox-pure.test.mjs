import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseMonitorQueryUrl,parseMonitorQuery,parseMonitorPage} from '../src/native-monitor-inbox-contract.ts'
import {nativeMonitorInboxSql,NativeMonitorInboxRepository} from '../src/native-monitor-inbox-repository.ts'
import {nativeMonitorPresenceSql,nativeMonitorExpectedPresence,inspectOptionalNativeMonitorInbox,verifyNativeMonitorInboxSchema} from '../src/native-monitor-inbox-audit.ts'
import {nativeMonitorTables,nativeMonitorFunctions} from '../src/native-monitor-inbox-schema.ts'
import {prepareNativeMonitorMetadata} from '../src/native-monitor-inbox-import-plan.ts'
import {createNativeMonitorInboxHttp} from '../src/native-monitor-inbox-http.ts'
import {selectNativeMonitorInbox,prepareNativeMonitorInbox} from '../src/native-monitor-inbox-runtime.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(100),identity={issuer:'urn:agentstudio:local:v1',subject:'real-cookie-mapped-by-server'},at='2026-10-30T01:02:03.123Z',ms=1793310000000
const item=(n=1,time=ms)=>({item_id:'event:'+id(n),monitor_id:id(20),case_id:id(30),check_id:id(40),kind:'source_unavailable',title:'监测来源不可用',created_ms:time})
const query={limit:10,cursor:null},page=(extra={})=>({protocol:'native_original_monitor_inbox_v1',scope:'current_user',employee_id:owner,as_of:at,items:[item()],has_more:false,next_cursor:null,...extra})
const legacy=n=>String(n).padStart(20,'0')
const exported=(extra={})=>({format:'legacy_monitor_metadata_export_v1',source_snapshot_sha256:'a'.repeat(64),owner_user_id:owner,exported_ms:ms,cases:[{id:legacy(1)}],monitors:[{id:legacy(2),case_id:legacy(1),revision:2,enabled:true,current_check_id:legacy(3),created_ms:ms-10}],checks:[{id:legacy(3),monitor_id:legacy(2),case_id:legacy(1),monitor_revision:2,status:'needs_review',created_ms:ms-9}],events:[{id:legacy(4),monitor_id:legacy(2),check_id:legacy(3),dedup_hash:'b'.repeat(64),kind:'additional_role',notify:true,read_ms:0,created_ms:ms-5}],...extra})
test('strict cursor is paired, canonical and closed; no owner filter or alias normalization',()=>{
 assert.deepEqual(parseMonitorQueryUrl('/api/v2/original-ui/monitor-inbox?limit=10'),query)
 const cursor={after_ms:ms,after_id:'check:'+id(1)};assert.deepEqual(parseMonitorQueryUrl('/api/v2/original-ui/monitor-inbox?after_ms='+ms+'&after_id='+cursor.after_id),{limit:10,cursor})
 for(const suffix of ['?owner_id='+owner,'?limit=20','?limit=10&limit=10','?after_ms=1','?after_id=event:'+id(1),'?after_ms=01&after_id=event:'+id(1),'#fragment'])assert.throws(()=>parseMonitorQueryUrl('/api/v2/original-ui/monitor-inbox'+suffix))
 for(const q of [{...query,owner_id:owner},{limit:10,cursor:{after_ms:0,after_id:'event:'+id(1)}},{limit:11,cursor:null}])assert.throws(()=>parseMonitorQuery(q))
})
test('keyset pages require strict descending complete tuple, last cursor and no private content',()=>{
 const items=Array.from({length:10},(_,i)=>item(10-i)),cursor={after_ms:ms,after_id:items.at(-1).item_id}
 assert.equal(parseMonitorPage(page({items,has_more:true,next_cursor:cursor}),query).items.length,10)
 for(const extra of [{items:[item(),item()]},{items:items.toReversed()},{items:[{...item(),title:'private old title'}]},{items:[{...item(),payload:{private:true}}]},{items:Array(1)},{items:[item()],has_more:true,next_cursor:cursor},{items,has_more:true,next_cursor:{...cursor,after_ms:ms-1}}])assert.throws(()=>parseMonitorPage(page(extra),query))
 assert.throws(()=>parseMonitorPage(page(),{limit:10,cursor:{after_ms:ms,after_id:item().item_id}}))
 assert.throws(()=>parseMonitorPage(page({items:[{...item(),item_id:'check:'+id(2)}]}),query))
})
test('SQL selects actual current pending checks plus unread notify events without disabling historical events',()=>{
 assert.match(nativeMonitorInboxSql,/m\.enabled AND m\.revision=c\.monitor_revision AND c\.status IN\('needs_review','incomplete'\)/)
 const events=nativeMonitorInboxSql.split('UNION ALL')[1];assert.match(events,/e\.owner_user_id=\$1::uuid AND e\.notify AND e\.read_ms=0/);assert.doesNotMatch(events,/m\.enabled|monitor_revision/)
 assert.match(nativeMonitorInboxSql,/ORDER BY created_ms DESC,item_id COLLATE "C" DESC LIMIT 11/)
 assert.doesNotMatch(nativeMonitorInboxSql,/payload|definition|SELECT \*|company|rh_user/)
})
test('import preparation is deterministic, owner-separated and contains metadata/provenance only',()=>{
 const plan=prepareNativeMonitorMetadata(exported()),again=prepareNativeMonitorMetadata(exported());assert.deepEqual(plan,again);assert.equal(plan.rows.length,5)
 const other=prepareNativeMonitorMetadata(exported({owner_user_id:id(200)}));assert.notEqual(other.rows[2].value.id,plan.rows[2].value.id)
 assert.equal(plan.rows[0].value.source_snapshot_sha256,'a'.repeat(64));assert.equal(plan.rows.at(-1).value.read_ms,0)
 assert.doesNotMatch(JSON.stringify(plan),/private|payload|definition|url|api_key|password/)
})
test('import refuses malformed/mixed owners and monitor/check/case relationships or dedup conflicts',()=>{
 for(const mutate of [v=>{v.title='private'},v=>{v.events.push({...v.events[0],id:legacy(5)})},v=>{v.checks[0].case_id=legacy(99)},v=>{v.monitors[0].current_check_id=legacy(99)},v=>{v.events[0].check_id=legacy(99)},v=>{v.events[0].payload='private'},v=>{v.events[0].read_ms=ms-20},v=>{v.owner_user_id='PB-uid'},v=>{v.source_snapshot_sha256='x'}]){const v=exported();mutate(v);assert.throws(()=>prepareNativeMonitorMetadata(v))}
})
function req(path,{method='GET',body='',headers={}}={}){const stream=Readable.from(body?[Buffer.from(body)]:[]);return Object.assign(stream,{url:path,method,headers:{origin:'https://localhost:7443',cookie:'__Host-agentstudio_session='+'a'.repeat(43),'sec-fetch-site':'same-origin',...(method==='POST'?{'x-agentstudio-request':'1','x-agentstudio-expected-employee':owner,'content-type':'application/json','content-length':String(Buffer.byteLength(body))}:{}),...headers}})}
const res=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}})
test('Native HTTP reads and real acknowledgement contract use Cookie identity, no owner authentication headers',async()=>{
 const calls=[],handler=createNativeMonitorInboxHttp({allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>identity,repository:{list:async(who,q)=>{calls.push({who,q});return page()},ack:async(who,event,expected)=>{calls.push({who,event,expected});return{ok:true}}}})
 const one=res();assert.equal(await handler(req('/api/v2/original-ui/monitor-inbox?limit=10'),one),true);assert.equal(one.status,200);assert.equal(one.headers['Cache-Control'],'no-store')
 const two=res();await handler(req('/api/v2/original-ui/monitor-events/'+id(1)+'/read',{method:'POST',body:'{}'}),two);assert.equal(two.status,200);assert.deepEqual(calls[1],{who:identity,event:id(1),expected:owner})
 for(const [request,status]of [[req('/api/v2/original-ui/monitor-inbox',{headers:{cookie:undefined,'x-rh-user-id':owner}}),401],[req('/api/v2/original-ui/monitor-inbox?owner_id='+owner),400],[req('/api/v2/original-ui/monitor-inbox',{method:'POST',body:'{}'}),405],[req('/api/v2/original-ui/monitor-events/'+id(1)+'/read',{method:'POST',body:'{"owner_id":"x"}'}),400],[req('/api/v2/original-ui/monitor-events/'+id(1)+'/read',{method:'POST',body:'{}',headers:{'x-agentstudio-expected-employee':undefined}}),400],[req('/api/v2/original-ui/monitor-events/'+id(1)+'/read',{method:'POST',body:'{}',headers:{'x-agentstudio-request':undefined}}),403]]){const out=res();await handler(request,out);assert.equal(out.status,status)}
 assert.equal(calls.length,2);assert.equal(await handler(req('/api/v2/original-ui/monitor-events/x/read'),res()),false)
})
test('expired verification is401; arbitrary errors are bounded503 and never leak SQL/source details',async()=>{
 for(const [error,status]of [[Object.assign(Error('private session'),{status:401}),401],[Error('private SQL password'),503]]){const handler=createNativeMonitorInboxHttp({allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>{throw error},repository:{}}),out=res();await handler(req('/api/v2/original-ui/monitor-inbox'),out);assert.equal(out.status,status);assert.doesNotMatch(JSON.stringify(out.body),/private|SQL|password/)}
})
test('read acknowledgement rechecks a revoked Cookie after the body, before mutation',async()=>{
 let verified=0,acks=0;const handler=createNativeMonitorInboxHttp({allowedOrigin:'https://localhost:7443',authenticateRequest:async()=>{if(++verified===1)return identity;throw Object.assign(Error('revoked'),{status:401})},repository:{ack:async()=>{acks++;return{ok:true}}}}),out=res()
 await handler(req('/api/v2/original-ui/monitor-events/'+id(1)+'/read',{method:'POST',body:'{}'}),out);assert.equal(out.status,401);assert.equal(verified,2);assert.equal(acks,0)
})
test('runtime is default-off and optional absence never becomes installed through a flag',async()=>{
 assert.equal(selectNativeMonitorInbox({},true,'https://localhost:7443'),false)
 for(const [env,listen,origin]of [[{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'false'},true,'https://localhost'],[{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},false,'https://localhost'],[{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},true,'http://localhost']])assert.throws(()=>selectNativeMonitorInbox(env,listen,origin))
 const pool={connect:async()=>({query:async()=>({rows:[]}),release(){}})};assert.equal(await prepareNativeMonitorInbox({pool,env:{},listen:true,allowedOrigin:'https://localhost'}),null)
 await assert.rejects(()=>prepareNativeMonitorInbox({pool,env:{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},listen:true,allowedOrigin:'https://localhost'}),/schema_required/)
})
test('optional audit rejects orphan/partial presence and releases/discards failed rollbacks',async()=>{
 assert.equal(new Set(nativeMonitorExpectedPresence).size,nativeMonitorExpectedPresence.length)
 let release;const pool={connect:async()=>({query:async sql=>{if(sql===nativeMonitorPresenceSql)return{rows:[{kind:'migration',name:'pg_v9_073'}]};return{rows:[]}},release(...args){release=args}})}
 await assert.rejects(()=>inspectOptionalNativeMonitorInbox(pool),/unsafe_native_monitor/);assert.deepEqual(release,[])
 const broken={connect:async()=>({query:async sql=>{if(sql==='ROLLBACK')throw Error('rollback');return{rows:[]}},release(...args){release=args}})}
 await assert.rejects(()=>inspectOptionalNativeMonitorInbox(broken),/rollback_required/);assert.deepEqual(release,[true])
})
test('authored SQL pins seal actual function bodies, preserve optional predecessor and prevent raw writes',()=>{
 const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_073_monitor_inbox.sql',import.meta.url),'utf8')
 for(const fn of nativeMonitorFunctions){const escaped=fn.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=new RegExp('CREATE FUNCTION agentstudio\\.'+escaped+'\\([^;]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;').exec(sql);assert(m,fn.name);assert.equal(createHash('sha256').update(m[1]).digest('hex'),fn.sha256)}
 assert.match(sql,/version='pg_v9_052'/);assert.doesNotMatch(sql,/version='pg_v9_072'|CREATE ROLE|GRANT (INSERT|UPDATE|DELETE)/)
 assert.match(sql,/PRIMARY KEY\(event_id\)/);assert.match(sql,/UNIQUE\(monitor_id,dedup_hash\)/)
 const ack=sql.slice(sql.indexOf('CREATE FUNCTION agentstudio.native_monitor_ack('));assert.ok(ack.indexOf('INSERT INTO agentstudio.native_monitor_reads')<ack.indexOf('UPDATE agentstudio.native_monitor_events SET read_ms'))
 assert.match(ack,/IF event_row.read_ms>0 THEN RETURN true/);assert.match(ack,/FOR SHARE OF a,u/)
})


// SQL-shape catalog model. CHECK conkey follows REL_18_STABLE StoreRelCheck:
// walk expression Vars in order and keep the first occurrence, never sort.
// No SQL engine is loaded and these tests are not installed-catalog evidence.
function monitorCatalogModel(change=()=>{}){
 const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_073_monitor_inbox.sql',import.meta.url),'utf8'),trace=[]
 const bodies=new Map([...ddl.matchAll(/CREATE FUNCTION agentstudio\.([a-z_]+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>[m[1]+'('+m[2]+')',m[3]]))
 const constraint=(table,c)=>{
  const line=ddl.split('\n').find(line=>line.includes('CONSTRAINT '+c.name+' '))
  assert(line,'authored literal constraint '+c.name)
  const definition=line.slice(line.indexOf('CONSTRAINT '+c.name+' ')+('CONSTRAINT '+c.name+' ').length).replace(/[,;]$/,'')
  let names
  if(c.type==='c'){
   const expr=definition.slice('CHECK('.length,-1)
   names=[...new Set(expr.slice(expr.indexOf('(')+1,expr.lastIndexOf(')')).split(','))]
  }else names=definition.slice(definition.indexOf('(')+1,definition.indexOf(')')).split(',')
  const row={name:c.name,type:c.type,keys:names.map(name=>{const n=table.columns.findIndex(col=>col.name===name)+1;assert(n>0);return n}),valid:true,enforced:true,deferrable:definition.includes(' DEFERRABLE'),deferred:definition.includes(' INITIALLY DEFERRED'),local:true,ordinary:true,no_inherit:['p','u','f'].includes(c.type),definition:definition.replace(' ON UPDATE NO ACTION ON DELETE NO ACTION','')}
  change(table.name,row);return row
 }
 const db={async query(sql,p=[]){
  trace.push({sql,params:p})
  if(sql===nativeMonitorPresenceSql)return{rows:nativeMonitorExpectedPresence.map(value=>{const at=value.indexOf(':');return{kind:value.slice(0,at),name:value.slice(at+1)}})}
  const table=nativeMonitorTables.find(t=>'agentstudio.'+t.name===p[0])
  if(table){
   if(sql.startsWith("SELECT c.relkind='r'"))return{rows:[{ok:true,api_oid:123}]}
   if(sql.startsWith('SELECT a.attname AS name'))return{rows:table.columns.map(c=>({...c,safe:true}))}
   if(sql.startsWith('SELECT polname AS name'))return{rows:[{name:table.name+'_owner',command:'r',permissive:true,roles:[123],using_expr:'(owner_user_id = agentstudio.actor_id())',check_expr:null}]}
   if(sql.startsWith('SELECT conname AS name'))return{rows:[...table.constraints.map(c=>constraint(table,c)),...table.columns.flatMap((c,i)=>c.required?[{name:table.name+'_'+c.name+'_not_null',type:'n',keys:[i+1],valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:false,definition:'NOT NULL '+c.name}]:[])]}
   if(sql.startsWith('SELECT ci.relname AS name'))return{rows:table.constraints.filter(c=>['p','u'].includes(c.type)).map(c=>({name:c.name,keys:[...c.keys],safe:true}))}
   if(sql.startsWith('SELECT tgname AS name'))return{rows:[{name:table.name+'_immutable',type:table.name==='native_monitor_events'?42:58,function_name:'native_monitor_immutable',safe:true},...(table.name==='native_monitor_events'?[{name:'native_monitor_events_read_guard',type:19,function_name:'native_monitor_read_guard',safe:true}]:[])]}
  }
  if(sql.startsWith("SELECT p.prokind='f'")){const key=String(p[0]).replace(/^agentstudio\./,'');assert(bodies.has(key),key);return{rows:[{ok:true,source:bodies.get(key)}]}}
  throw Error('unrecognized pure catalog query')
 }}
 return{db,trace}
}
test('PG18 CHECK metadata uses expression-first conkey and the complete strict catalog walk succeeds',async()=>{
 const table=nativeMonitorTables.find(t=>t.name==='native_monitor_reads'),ck=table.constraints.find(c=>c.name==='native_monitor_reads_valid_ck')
 const seen=[],f=monitorCatalogModel((table,row)=>{if(row.name==='native_monitor_reads_valid_ck')seen.push(row.keys)})
 await verifyNativeMonitorInboxSchema(f.db)
 assert.deepEqual(ck.keys,['governance_revision','read_ms'])
 assert.deepEqual(seen,[[4,3]])
 assert(f.trace.some(q=>q.params[0]==='agentstudio.native_monitor_ack(uuid,uuid)'))
})
test('CHECK key order is exact: reversed, omitted and repeated columns remain refused',async()=>{
 for(const keys of [[3,4],[4],[4,3,3],[4,2]]){
  const f=monitorCatalogModel((_table,row)=>{if(row.name==='native_monitor_reads_valid_ck')row.keys=keys})
  await assert.rejects(()=>verifyNativeMonitorInboxSchema(f.db),/unsafe_native_monitor_inbox_schema/)
 }
})
test('constraint type, validation, enforcement, locality, inheritance, deferral and expression seals stay strict',async()=>{
 for(const patch of [{type:'f'},{valid:false},{enforced:false},{local:false},{ordinary:false},{no_inherit:true},{deferrable:true},{deferred:true},{definition:'CHECK (true)'}]){
  const f=monitorCatalogModel((_table,row)=>{if(row.name==='native_monitor_reads_valid_ck')Object.assign(row,patch)})
  await assert.rejects(()=>verifyNativeMonitorInboxSchema(f.db),/unsafe_native_monitor_inbox_schema/)
 }
})
