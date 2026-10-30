import {requireOriginalMonitor073BrowserCi} from './pg-original-monitor073-browser-guard.mjs'
import {nativeMonitor073ReviewedSources} from '../../services/pg-api/tests/helpers/native-monitor073-reviewed-sources.mjs'
// Test-only original069/070/071 base + independently audited073 + Native HTTPS
// monitor composition. No production/browser helper or source pin is modified.
export async function originalMonitor073BackendFixture(env=process.env){
 const permit=requireOriginalMonitor073BrowserCi(env)
 const [fs,path,url,crypto,https,baseModule,audit,runtime,authModule,importer]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:https'),import('../../services/pg-api/tests/helpers/original-login-home071-genuine-fixture.mjs'),import('../../services/pg-api/src/native-monitor-inbox-audit.ts'),import('../../services/pg-api/src/native-monitor-inbox-runtime.ts'),import('../../services/pg-api/src/native-auth-http.mjs'),import('../../services/pg-api/src/native-monitor-inbox-import-plan.ts')])
 const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
 const checkSources=()=>{for(const[file,expected]of Object.entries(nativeMonitor073ReviewedSources)){let at=root;for(const part of file.split('/')){if(fs.lstatSync(at).isSymbolicLink())throw Error('monitor073_source_symlink');at=path.join(at,part)}if(!fs.lstatSync(at).isFile()||sha(fs.readFileSync(at))!==expected)throw Error('monitor073_reviewed_source_changed:'+file)}}
 checkSources();let f,server,agent,closed=false;const counters={reads:0,acks:0,forwarded:0},plans={}
 const close=async()=>{if(closed)return;closed=true;const errors=[];try{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}catch(e){errors.push(e)}try{agent?.destroy()}catch(e){errors.push(e)}try{await f?.close()}catch(e){errors.push(e)}if(errors.length)throw new AggregateError(errors,'monitor073_backend_cleanup_failed')}
 try{
  f=await baseModule.originalLoginHome071GenuineFixture(env)
  if(f.browserHomeProfile?.profile!==permit.predecessor_profile||f.browserHomeProfile.head!==permit.head)throw Error('monitor073_actual_predecessor_mismatch')
  const before=await f.inventory();if(await audit.inspectOptionalNativeMonitorInbox(f.pool)!=='absent')throw Error('monitor073_fresh_absence_required')
  const sql073=fs.readFileSync(path.join(root,'db/postgres/migrations/pg_v9_073_monitor_inbox.sql'))
  await f.db.exec(sql073.toString('utf8'))
  if(await audit.inspectOptionalNativeMonitorInbox(f.pool)!=='installed')throw Error('monitor073_actual_catalog_required')
  const old=n=>String(n).padStart(20,'0'),now=Date.now()
  for(const who of ['alice','bob']){
   const source={format:'legacy_monitor_metadata_export_v1',source_snapshot_sha256:sha('synthetic '+who+' monitor export only'),owner_user_id:f.users[who],exported_ms:now,cases:[{id:old(1)}],monitors:[{id:old(2),case_id:old(1),revision:1,enabled:true,current_check_id:old(3),created_ms:now-100}],checks:[{id:old(3),monitor_id:old(2),case_id:old(1),monitor_revision:1,status:'needs_review',created_ms:now-5}],events:Array.from({length:who==='alice'?14:3},(_,i)=>({id:old(100+i),monitor_id:old(2),check_id:old(3),dedup_hash:sha(who+' declared historical synthetic fact '+i),kind:'additional_role',notify:true,read_ms:0,created_ms:now-20-i}))}
   const plan=importer.prepareNativeMonitorMetadata(source);plans[who]=plan
   const db=await f.adminPool.connect();try{await db.query('BEGIN');try{for(const row of plan.rows){if(!/^native_monitor_(imports|cases|monitors|checks|events)$/.test(row.table))throw Error('monitor073_seed_table');const keys=Object.keys(row.value);if(!keys.every(k=>/^[a-z_]+$/.test(k)))throw Error('monitor073_seed_column');await db.query('INSERT INTO agentstudio.'+row.table+'('+keys.join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row.value))}await db.query('COMMIT')}catch(e){await db.query('ROLLBACK');throw e}}finally{db.release()}
  }
  const current=await f.inventory(),added=['native_monitor_imports','native_monitor_cases','native_monitor_monitors','native_monitor_checks','native_monitor_events','native_monitor_reads'].map(t=>'agentstudio.'+t)
  if(JSON.stringify(current.tables)!==JSON.stringify([...before.tables,...added].sort())||JSON.stringify(current.versions)!==JSON.stringify([...before.versions,'pg_v9_073'].sort())||JSON.stringify(current.roles)!==JSON.stringify(before.roles))throw Error('monitor073_actual_delta_mismatch')
  for(const who of ['alice','bob']){const seeded=(await f.db.query('SELECT (SELECT count(*)::integer FROM agentstudio.native_monitor_events WHERE owner_user_id=$1::uuid AND notify AND read_ms=0) AS unread,(SELECT count(*)::integer FROM agentstudio.native_monitor_checks WHERE owner_user_id=$1::uuid AND status=$2::text) AS pending',[f.users[who],'needs_review'])).rows[0];if(seeded.unread!==(who==='alice'?14:3)||seeded.pending!==1)throw Error('monitor073_nonempty_owner_seed_required')}
  const component=await runtime.prepareNativeMonitorInbox({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},listen:true,allowedOrigin:permit.origin});if(!component)throw Error('monitor073_native_component_required')
  const auth=authModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin:permit.origin,businessHandler:async()=>{throw Error('monitor073_unknown_native_route')}}),monitor=component.createHandler(auth.authenticateRequest),upstream=new URL(f.nativeOrigin)
  if(upstream.protocol!=='https:'||upstream.hostname!=='localhost'||!upstream.port||f.allowedOrigin!==permit.origin)throw Error('monitor073_actual_base_origin_required')
  agent=new https.Agent({ca:f.serverTls.ca,rejectUnauthorized:true,servername:'localhost',maxSockets:8})
  const hop=new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer'])
  server=https.createServer({...f.serverTls,minVersion:'TLSv1.2'},(req,res)=>{void(async()=>{
   if((req.url??'').startsWith('/api/v2/original-ui/monitor-inbox')||/^\/api\/v2\/original-ui\/monitor-events\//.test(req.url??'')){if(req.method==='POST')counters.acks++;else counters.reads++;if(await monitor(req,res))return;res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"not_found"}');return}
   counters.forwarded++;const headers={};for(const[key,value]of Object.entries(req.headers))if(!hop.has(key)&&value!==undefined)headers[key]=value
   const outgoing=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:req.url,method:req.method,headers,agent,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal:AbortSignal.timeout(8000)},incoming=>{const returned={};for(const[key,value]of Object.entries(incoming.headers))if(!hop.has(key)&&value!==undefined)returned[key]=value;res.writeHead(incoming.statusCode??502,returned);incoming.pipe(res)});outgoing.once('error',()=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"monitor073_upstream_unavailable"}')}else res.destroy()});req.pipe(outgoing)
  })().catch(()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"monitor073_fixture_unavailable"}')}else res.destroy()})})
  server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  checkSources()
  const state=async()=>{const out={};for(const who of ['alice','bob']){const owner=f.users[who],value=(await f.db.query('SELECT (SELECT count(*)::integer FROM agentstudio.native_monitor_events WHERE owner_user_id=$1::uuid AND notify AND read_ms=0) AS unread,(SELECT count(*)::integer FROM agentstudio.native_monitor_reads WHERE owner_user_id=$1::uuid) AS receipts',[owner])).rows[0];out[who]=value}return out}
  return{...f,nativeOrigin:'https://localhost:'+server.address().port,allowedOrigin:permit.origin,
   browserHomeProfile:Object.freeze({format:'agentstudio.original-home-monitor073.metadata.fixture.v1',profile:permit.profile,story:permit.story,head:permit.head,
    predecessor_profile:permit.predecessor_profile,predecessor:f.browserHomeProfile,monitor073_version:'pg_v9_073',monitor073_source_sha256:sha(sql073),
    monitor073_catalog_verified:true,monitor073_seeded_nonempty:true,full_monitor_pipeline_complete:false,synthetic_only:true,production_GO:false}),
   monitorState:state,monitorCounters:counters,syntheticMonitorIds:Object.fromEntries(Object.entries(plans).map(([who,plan])=>[who,plan.rows.filter(r=>r.table==='native_monitor_events'||r.table==='native_monitor_checks').map(r=>r.value.id)])),close}
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'monitor073_start_and_cleanup_failed')}throw error}
}
