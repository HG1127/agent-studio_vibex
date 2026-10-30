import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import {createHash,randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createServer} from 'node:http'
import {setTimeout as sleep} from 'node:timers/promises'
import {createWorkbenchControl,REVIEW_SCRIPT,confirmNative} from '../local-executor/workbench-control.mjs'
import {runConnection} from '../local-executor/run.mjs'

const revision='a'.repeat(24),changedRevision='b'.repeat(24)
const owner='owner-one',device='D'.repeat(24),claim='c'.repeat(48)
const hash=value=>createHash('sha256').update(value).digest('hex')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const summary=(rev=revision)=>({protocol:'permissions-v2',version:'0.1.0-preview.8',revision:rev,applied_revision:rev,sites:[],grants:[],state:'online'})

async function fileFixture(){
 const base=path.join(process.cwd(),'.tmp','control-recovery-tests')
 await fs.mkdir(base,{recursive:true})
 const home=await fs.mkdtemp(path.join(base,'home-')),configFile=path.join(home,'computer.local.json')
 const config={server:'http://127.0.0.1:8090',deviceName:'Isolated recovery fixture',credentialsFile:'credentials.json',permissionRevision:revision,permissionManagementRevision:revision,files:{enabled:false},browser:{enabled:false,allowedOrigins:[]},roots:[]}
 await fs.writeFile(configFile,JSON.stringify(config,null,2))
 return {home,configFile,config,close:()=>fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}

// Real SQLite executes the original PocketBase module; only its host bindings are adapted.
async function backendFixture(){
 const db=new DatabaseSync(':memory:')
 db.exec([
  "CREATE TABLE studio_local_controls(id TEXT PRIMARY KEY,owner TEXT NOT NULL,device_id TEXT NOT NULL,request_id TEXT UNIQUE NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,claim_hash TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL,deadline_ms INTEGER NOT NULL);",
  'CREATE TABLE studio_local_control_state(device_id TEXT PRIMARY KEY,owner TEXT NOT NULL,info TEXT NOT NULL,seen_ms INTEGER NOT NULL);',
  'CREATE TABLE studio_local_jobs(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,status TEXT NOT NULL,deadline_ms INTEGER NOT NULL);',
 ].join('\n'))
 db.exec('CREATE TABLE studio_local_devices(id TEXT PRIMARY KEY,owner TEXT NOT NULL,revoked INTEGER NOT NULL,seen_ms INTEGER NOT NULL)')
 db.prepare('INSERT INTO studio_local_devices VALUES(?,?,0,0)').run(device,owner)
 const app={
  db:()=>({newQuery(sql){
   let params={}
   const stmt=db.prepare(sql.replace(/\{:(\w+)\}/g,':$1'))
   return {
    bind(value){params=value;return this},
    execute(){return stmt.run(params)},
    all(rows){rows.push(...stmt.all(params))},
    one(value){const row=stmt.get(params);if(!row)throw Error('record_not_found');Object.assign(value,row)}
   }
  }}),
  runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}}
 }
 const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
 const local={
  device(_app,id,user){if(id!==device||user!==owner)throw Error('device_not_found');return {id,owner:user}},
  canonical,
  row(_app,sql,params,shape){const value={...shape};_app.db().newQuery(sql).bind(params).one(value);return value}
 }
 const module={exports:{}}
 vm.runInNewContext(await fs.readFile(new URL('../pocketbase/pb_hooks/modules/workbench_controls.js',import.meta.url),'utf8'),{
  module,__hooks:'/hooks',require:()=>local,DynamicModel:function(shape){Object.assign(this,shape)},arrayOf:()=>[],
  $security:{sha256:hash,randomString:n=>randomBytes(n).toString('hex').slice(0,n)}
 })
 const updateSummary=(value=summary())=>db.prepare('INSERT INTO studio_local_control_state(device_id,owner,info,seen_ms) VALUES(?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET info=excluded.info,seen_ms=excluded.seen_ms').run(device,owner,JSON.stringify(value),Date.now())
 updateSummary()
 const request={action:'sites-save',request_id:'request-original-0001',permission_revision:revision,confirm:true,origins:[]}
 return {db,app,m:module.exports,request,updateSummary,close:()=>db.close()}
}
function seedReceipt(f,status='committing'){
 const id=f.m.enqueue(f.app,owner,device,f.request).id
 f.db.prepare('UPDATE studio_local_controls SET status=?,claim_hash=?,deadline_ms=? WHERE id=?').run(status,hash(claim),Date.now()+30000,id)
 return {id,claim,ok:true,cancelled:false,result:JSON.stringify({revision:changedRevision,saved:true,notice:'Saved locally'})}
}

test('native permission review is a foreground, topmost, explicit yes/no window with safe default refusal',()=>{
 assert.match(REVIEW_SCRIPT,/\$form\.TopMost=\$true/)
 assert.match(REVIEW_SCRIPT,/\$form\.StartPosition='CenterScreen'/)
 assert.match(REVIEW_SCRIPT,/\$form\.ShowInTaskbar=\$true/)
 assert.match(REVIEW_SCRIPT,/确认并保存/)
 assert.match(REVIEW_SCRIPT,/拒绝 \/ 取消/)
 assert.match(REVIEW_SCRIPT,/\$form\.CancelButton=\$no/)
 assert.match(REVIEW_SCRIPT,/\$form\.AcceptButton=\$no/)
 assert.match(REVIEW_SCRIPT,/\$form\.ActiveControl=\$no/)
 assert.match(REVIEW_SCRIPT,/\$state\.expired/)
 assert.match(REVIEW_SCRIPT,/exit 3/)
 assert.match(REVIEW_SCRIPT,/FromBase64String\(\$env:STUDIO_PERMISSION_REVIEW\)/)
 assert.doesNotMatch(REVIEW_SCRIPT,/\$v\.message.*\+.*-Command/)
})
test('native permission review fails closed outside Windows',async()=>{
 await assert.rejects(confirmNative({message:'fixture'},undefined,{platform:'linux'}),/permission_confirmation_unavailable/)
})
test('commit waits for an in-flight activity check before writing permissions',{timeout:8000},async()=>{
 const f=await fileFixture(),started=deferred(),release=deferred();let checks=0,commits=0,operation
 try{
  await fs.writeFile(f.configFile+'.run.lock',JSON.stringify({pid:process.pid}))
  const controls=createWorkbenchControl({configFile:f.configFile,home:f.home,
   api:async route=>{
    if(route==='/control-check'){if(++checks===2){started.resolve();await release.promise}return {active:true}}
    if(route==='/control-commit'){commits++;return {ok:true}}return {}
   },
   confirm:async()=>{await started.promise;return true}
  })
  await controls.markApplied()
  operation=controls.execute({id:'I'.repeat(24),claim,action:'sites-save',payload:{permission_revision:revision,origins:[]},deadline_ms:Date.now()+6000})
  await started.promise;await sleep(30)
  assert.equal(commits,0,'a pending check must settle before the commit fence is requested')
  release.resolve();const result=await operation
  assert.equal(result.changed,true);assert.equal(commits,1)
  assert.notEqual(JSON.parse(await fs.readFile(f.configFile,'utf8')).permissionRevision,revision)
 }finally{release.resolve();await operation?.catch(()=>{});await f.close()}
})
test('a cancelled in-flight check prevents commit and leaves the file unchanged',{timeout:8000},async()=>{
 const f=await fileFixture(),started=deferred(),release=deferred();let checks=0,commits=0,operation
 try{
  const original=await fs.readFile(f.configFile,'utf8')
  await fs.writeFile(f.configFile+'.run.lock',JSON.stringify({pid:process.pid}))
  const controls=createWorkbenchControl({configFile:f.configFile,home:f.home,
   api:async route=>{
    if(route==='/control-check'){if(++checks===2){started.resolve();await release.promise;return {active:false}}return {active:true}}
    if(route==='/control-commit'){commits++;return {ok:true}}return {}
   },
   confirm:async()=>{await started.promise;return true}
  })
  await controls.markApplied()
  operation=controls.execute({id:'J'.repeat(24),claim,action:'sites-save',payload:{permission_revision:revision,origins:[]},deadline_ms:Date.now()+6000})
  const rejected=assert.rejects(operation,{name:'AbortError'})
  await started.promise;await sleep(30);release.resolve();await rejected
  assert.equal(commits,0);assert.equal(await fs.readFile(f.configFile,'utf8'),original)
 }finally{release.resolve();await operation?.catch(()=>{});await f.close()}
})
test('same owner request replays before offline, changed revision and busy checks',async()=>{
 const f=await backendFixture()
 try{
  const first=f.m.enqueue(f.app,owner,device,f.request)
  f.updateSummary(summary(changedRevision));f.db.prepare('UPDATE studio_local_control_state SET seen_ms=0').run()
  f.db.prepare('INSERT INTO studio_local_jobs VALUES(?,?,?,?)').run('busy',device,'running',Date.now()+30000)
  assert.equal(f.m.enqueue(f.app,owner,device,f.request).id,first.id)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM studio_local_controls').get().n,1)
  assert.throws(()=>f.m.enqueue(f.app,owner,device,{...f.request,origins:['https://changed.example']}),/request_identity_conflict/)
  assert.throws(()=>f.m.enqueue(f.app,'other-owner',device,f.request),/device_not_found/)
 }finally{f.close()}
})
test('verified control heartbeat keeps only the owning device online without permitting task execution',async()=>{
 const f=await backendFixture()
 try{
  const r=f.m.enqueue(f.app,owner,device,f.request)
  const heartbeat=f.m.poll(f.app,{id:device,owner},{summary:summary(),heartbeat_only:true})
  assert.equal(heartbeat.control,null)
  assert.equal(f.m.row(f.app,r.id,owner).status,'queued')
  assert.ok(f.db.prepare('SELECT seen_ms FROM studio_local_devices WHERE id=?').get(device).seen_ms>Date.now()-1000)
  f.db.prepare('UPDATE studio_local_devices SET seen_ms=0').run()
  f.m.poll(f.app,{id:device,owner},{summary:{...summary(),state:'needs-check'},heartbeat_only:true})
  assert.equal(f.db.prepare('SELECT seen_ms FROM studio_local_devices WHERE id=?').get(device).seen_ms,0)
  assert.throws(()=>f.m.poll(f.app,{id:device,owner:'other'},{summary:summary(),heartbeat_only:true}),/device_not_found/)
 }finally{f.close()}
})
test('completion replay is idempotent and cannot replace a terminal result, owner or claim',async()=>{
 const f=await backendFixture()
 try{
  const receipt=seedReceipt(f),d={id:device,owner}
  assert.equal(f.m.complete(f.app,d,receipt).ok,true);assert.equal(f.m.complete(f.app,d,receipt).ok,true)
  assert.throws(()=>f.m.complete(f.app,d,{...receipt,result:'different'}),/control_result_conflict/)
  assert.throws(()=>f.m.complete(f.app,{id:device,owner:'other-owner'},receipt),/device_not_found/)
  assert.throws(()=>f.m.complete(f.app,d,{...receipt,claim:'z'.repeat(48)}),/control_claim_denied/)
  const saved=f.db.prepare('SELECT status,result FROM studio_local_controls').get()
  assert.equal(saved.status,'succeeded');assert.equal(saved.result,receipt.result)
 }finally{f.close()}
})
test('expired commit accepts only the same claimed saved revision reported by the connector',async()=>{
 const f=await backendFixture()
 try{
  const receipt=seedReceipt(f),d={id:device,owner}
  f.db.prepare('UPDATE studio_local_controls SET deadline_ms=?').run(Date.now()-1000)
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_saved_revision_unverified/)
  f.updateSummary(summary(changedRevision))
  assert.equal(f.m.complete(f.app,d,receipt).ok,true)
  assert.equal(f.db.prepare('SELECT status FROM studio_local_controls').get().status,'succeeded')
 }finally{f.close()}
})
test('late results cannot revive cancelled or expired requests or invent saved revisions',async()=>{
 const f=await backendFixture()
 try{
  const receipt=seedReceipt(f,'unknown'),d={id:device,owner}
  f.updateSummary(summary(changedRevision))
  assert.throws(()=>f.m.complete(f.app,d,{...receipt,result:JSON.stringify({saved:true,revision:'d'.repeat(24)})}),/control_saved_revision_unverified/)
  assert.throws(()=>f.m.complete(f.app,d,{...receipt,result:JSON.stringify({saved:true,revision})}),/invalid_control_result/)
  assert.throws(()=>f.m.complete(f.app,d,{...receipt,ok:false,cancelled:true}),/control_no_longer_active/)
  f.db.prepare("UPDATE studio_local_controls SET status='cancelled'").run()
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_result_conflict/)
  assert.equal(f.db.prepare('SELECT status FROM studio_local_controls').get().status,'cancelled')
  f.db.prepare("UPDATE studio_local_controls SET status='expired'").run()
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_no_longer_active/)
  assert.equal(f.db.prepare('SELECT status FROM studio_local_controls').get().status,'expired')
 }finally{f.close()}
})

for(const failure of ['lost_reply','unknown_409'])test('worker recovers '+failure+' with identical completion and one confirmation',{timeout:10000},async()=>{
 const f=await fileFixture(),b=await backendFixture(),done=deferred(),stop=new AbortController()
 let worker,confirmations=0,reloads=0,completions=0,receiptText='',serverError
 const server=createServer(async(req,res)=>{
  try{
   let raw='';for await(const chunk of req)raw+=chunk
   const body=JSON.parse(raw||'{}'),route=new URL(req.url,'http://127.0.0.1').pathname.split('/').pop(),d={id:device,owner}
   let result
   if(route==='control-poll')result=b.m.poll(b.app,d,body)
   else if(route==='control-check')result=b.m.check(b.app,d,body)
   else if(route==='control-commit')result=b.m.commit(b.app,d,body)
   else if(route==='control-complete'){
    completions++
    if(completions===1)receiptText=raw
    else assert.equal(raw,receiptText,'retry must reuse the exact completion body')
    if(completions===1&&failure==='unknown_409'){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'unclassified_control_error'}));return}
    result=b.m.complete(b.app,d,body)
    if(completions===1){res.destroy();return}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));done.resolve();return
   }else if(route==='poll')result={job:null}
   else throw Error('unexpected route '+route)
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result))
  }catch(error){serverError=error;res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));done.resolve()}
 })
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const origin='http://127.0.0.1:'+server.address().port
  await fs.writeFile(f.configFile,JSON.stringify({...f.config,server:origin},null,2))
  await fs.writeFile(path.join(f.home,'credentials.json'),JSON.stringify({server:origin,token:'t'.repeat(64)}))
  const created=b.m.enqueue(b.app,owner,device,b.request)
  worker=runConnection(f.configFile,{
   signal:stop.signal,adapters:{home:f.home,confirm:async()=>{confirmations++;return true}},
   runtimeFactory:async()=>{reloads++;return {tools:[],close:async()=>{}}}
  })
  await Promise.race([done.promise,sleep(5000,undefined,{ref:false}).then(()=>{throw Error('completion receipt was not recovered')})])
  if(serverError)throw serverError
  assert.equal(completions,2);assert.equal(confirmations,1);assert.equal(reloads,2)
  assert.equal(b.m.row(b.app,created.id,owner).status,'succeeded')
 }finally{
  stop.abort();await worker?.catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));b.close();await f.close()
 }
})
test('an unchanged-scope receipt needs fresh matching saved and applied revisions',async()=>{
 const f=await backendFixture()
 try{
  const original=seedReceipt(f,'unknown'),d={id:device,owner}
  const receipt={...original,ok:false,result:JSON.stringify({saved:false,revision,notice:'No permission write occurred'})}
  f.updateSummary(summary(changedRevision))
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_saved_revision_unverified/)
  f.updateSummary({...summary(),applied_revision:changedRevision})
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_saved_revision_unverified/)
  f.updateSummary({...summary(),state:'needs-check'})
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_saved_revision_unverified/)
  f.updateSummary();f.db.prepare('UPDATE studio_local_control_state SET seen_ms=0').run()
  assert.throws(()=>f.m.complete(f.app,d,receipt),/control_saved_revision_unverified/)
  f.updateSummary()
  assert.equal(f.m.complete(f.app,d,receipt).ok,true)
  assert.equal(f.m.complete(f.app,d,receipt).ok,true)
  assert.equal(f.m.row(f.app,receipt.id,owner).status,'failed')
 }finally{f.close()}
})

test('lost commit reply and delayed failure receipt settle without writing or blocking later polls',{timeout:10000},async()=>{
 const f=await fileFixture(),b=await backendFixture(),done=deferred(),stop=new AbortController()
 let worker,confirmations=0,reloads=0,commits=0,completions=0,receiptText='',serverError,normalPolls=0
 const server=createServer(async(req,res)=>{
  try{
   let raw='';for await(const chunk of req)raw+=chunk
   const body=JSON.parse(raw||'{}'),route=new URL(req.url,'http://127.0.0.1').pathname.split('/').pop(),d={id:device,owner}
   let result
   if(route==='control-poll')result=b.m.poll(b.app,d,body)
   else if(route==='control-check')result=b.m.check(b.app,d,body)
   else if(route==='control-commit'){
    commits++;b.m.commit(b.app,d,body)
    // Only this isolated fixture's lease is advanced, simulating prolonged response loss.
    b.db.prepare('UPDATE studio_local_controls SET deadline_ms=? WHERE id=?').run(Date.now()-1000,body.id)
    res.destroy();return
   }else if(route==='control-complete'){
    completions++
    if(completions===1){
     receiptText=raw;assert.equal(body.ok,false)
     assert.deepEqual(JSON.parse(body.result),{saved:false,revision,notice:'本次授权未保存，电脑仍使用原授权范围。请检查连接后重试。'})
     res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');return
    }
    assert.equal(raw,receiptText,'a failed, unchanged result also keeps the exact receipt')
    result=b.m.complete(b.app,d,body)
   }else if(route==='poll'){
    normalPolls++;result={job:null};if(completions>=2)done.resolve()
   }else throw Error('unexpected route '+route)
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result))
  }catch(error){serverError=error;res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));done.resolve()}
 })
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const origin='http://127.0.0.1:'+server.address().port
  await fs.writeFile(f.configFile,JSON.stringify({...f.config,server:origin},null,2))
  await fs.writeFile(path.join(f.home,'credentials.json'),JSON.stringify({server:origin,token:'t'.repeat(64)}))
  const before=await fs.readFile(f.configFile,'utf8'),created=b.m.enqueue(b.app,owner,device,b.request)
  worker=runConnection(f.configFile,{
   signal:stop.signal,adapters:{home:f.home,confirm:async()=>{confirmations++;return true}},
   runtimeFactory:async()=>{reloads++;return {tools:[],close:async()=>{}}}
  })
  await Promise.race([done.promise,sleep(6000,undefined,{ref:false}).then(()=>{throw Error('unchanged completion blocked subsequent polling')})])
  if(serverError)throw serverError
  assert.equal(commits,1);assert.equal(completions,2);assert.equal(confirmations,1);assert.equal(reloads,1);assert.ok(normalPolls>0)
  assert.equal(await fs.readFile(f.configFile,'utf8'),before)
  assert.equal(b.m.row(b.app,created.id,owner).status,'failed')
 }finally{
  stop.abort();await worker?.catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));b.close();await f.close()
 }
})
