import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {createHash,randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {permissionDraft,savePermissions} from '../local-executor/permissions.mjs'
import {createWorkbenchControl} from '../local-executor/workbench-control.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {normalizeWebsite} from '../src/lib/permissionEditor.ts'

const id='f'.repeat(24),revision='a'.repeat(24),owner='fixture-owner'
const none={edit:false,move:false,delete:false,open:false},all={edit:true,move:true,delete:true,open:true}
const hash=value=>createHash('sha256').update(value).digest('hex')
async function fixture(rootOptions={}){
 const base=path.join(process.cwd(),'.tmp','file-permission-tests');await fs.mkdir(base,{recursive:true})
 const home=await fs.mkdtemp(path.join(base,'home-')),directory=path.join(home,'.agent-studio','connections',id),folder=path.join(home,'reports')
 await fs.mkdir(directory,{recursive:true});await fs.mkdir(folder)
 await fs.writeFile(path.join(folder,'selected.txt'),'fixture file')
 await fs.writeFile(path.join(directory,'.local-device-credentials.json'),JSON.stringify({device_id:id,token:'fixture-token-only-'.repeat(4)}))
 const configFile=path.join(directory,'computer.local.json')
 const config={server:'https://fixture.invalid',credentialsFile:'.local-device-credentials.json',deviceName:'Disposable permission fixture',permissionRevision:revision,permissionManagementRevision:revision,roots:[{name:'work',path:folder,label:'reports',...rootOptions}],files:{enabled:true},browser:{enabled:false,allowedOrigins:[]},office:{enabled:false}}
 await fs.writeFile(configFile,JSON.stringify(config,null,2))
 return {home,folder,directory,config,configFile,close:async()=>{assert.ok(path.resolve(home).startsWith(path.resolve(base)+path.sep));await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}}
}
async function localControl(f,confirm){
 await fs.writeFile(f.configFile+'.run.lock',JSON.stringify({pid:process.pid}))
 const c=createWorkbenchControl({configFile:f.configFile,home:f.home,confirm,api:async route=>route==='/control-check'?{active:true}:{ok:true},pickFile:async()=>path.join(f.folder,'selected.txt'),pickFolder:async()=>f.folder})
 await c.markApplied();return c
}
const control=(action,payload,rev=revision)=>({id:randomBytes(12).toString('hex'),claim:'c'.repeat(48),action,payload:{permission_revision:rev,...payload},deadline_ms:Date.now()+20000})

test('draft/local manager save preserves explicit capabilities; old drafts cannot erase them',async()=>{
 const f=await fixture({capabilities:all});try{
  const d=await permissionDraft(id,{home:f.home});assert.deepEqual(d.grants[0].capabilities,all)
  const before=await fs.readFile(f.configFile,'utf8'),legacy=structuredClone(d);delete legacy.grants[0].capabilities
  await assert.rejects(savePermissions(legacy,{home:f.home,confirm:async()=>true}),/file_capabilities_required/)
  assert.equal(await fs.readFile(f.configFile,'utf8'),before)
  const result=await savePermissions(d,{home:f.home,confirm:async review=>{assert.deepEqual(review.grants[0].capabilities,all);return true}})
  const after=JSON.parse(await fs.readFile(f.configFile,'utf8'));assert.deepEqual(after.roots[0].capabilities,all);assert.notEqual(result.permissionRevision,revision)
  const runtime=await createRuntime(after)
  try{await assert.rejects(runtime.execute({tool:'files.stat',arguments:{root:after.roots[0].name,path:'selected.txt'},permission_revision:revision}),/permission_scope_changed/)}finally{await runtime.close()}
 }finally{await f.close()}
})

test('file-only open survives draft/save with read-only and exact filename',async()=>{
 const f=await fixture({readOnly:true,allowedFiles:['selected.txt'],capabilities:{...none,open:true}});try{
  const d=await permissionDraft(id,{home:f.home});assert.equal(d.grants[0].kind,'file');assert.equal(d.grants[0].readOnly,true);assert.deepEqual(d.grants[0].capabilities,{...none,open:true})
  await savePermissions(d,{home:f.home,confirm:async()=>true})
  const r=JSON.parse(await fs.readFile(f.configFile,'utf8')).roots[0]
  assert.deepEqual(r.allowedFiles,['selected.txt']);assert.equal(r.readOnly,true);assert.equal(r.path,f.folder);assert.deepEqual(r.capabilities,{...none,open:true})
 }finally{await f.close()}
})

test('workbench control requires native confirmation, validates all flags, and applies an exact revision',async()=>{
 const f=await fixture({capabilities:all});let confirmations=0
 try{
  const c=await localControl(f,async review=>{confirmations++;assert.match(review.message,/编辑已有文件.*关闭/);assert.match(review.message,/移动.*允许/);assert.match(review.message,/可恢复删除/);assert.match(review.message,/连接电脑打开/);return false})
  assert.deepEqual((await c.summary()).grants[0].capabilities,all)
  const before=await fs.readFile(f.configFile,'utf8'),desired={...all,edit:false}
  await assert.rejects(c.execute(control('grant-edit',{root_id:'work',read_only:false})),/file_capabilities_required/)
  for(const bad of [{...all,open:'yes'},{...all,shell:true},{edit:true}])await assert.rejects(c.execute(control('grant-edit',{root_id:'work',read_only:false,capabilities:bad})),/invalid_file_capabilities/)
  await assert.rejects(c.execute(control('grant-edit',{root_id:'work',read_only:true,capabilities:all})),/readonly_capabilities_denied/)
  assert.equal(confirmations,0)
  assert.equal((await c.execute(control('grant-edit',{root_id:'work',read_only:false,capabilities:desired}))).cancelled,true)
  assert.equal(confirmations,1);assert.equal(await fs.readFile(f.configFile,'utf8'),before)
  const accepted=await localControl(f,async()=>true)
  const result=await accepted.execute(control('grant-edit',{root_id:'work',read_only:false,capabilities:desired}))
  assert.equal(result.changed,true);assert.deepEqual(JSON.parse(await fs.readFile(f.configFile,'utf8')).roots[0].capabilities,desired)
  assert.notEqual(result.revision,revision)
  await assert.rejects(accepted.execute(control('grant-edit',{root_id:'work',read_only:false,capabilities:all})),/local_config_changed/)
 }finally{await f.close()}
})

test('grant-save carries open on an explicitly selected file without parent authorization; expired selections fail',async()=>{
 const f=await fixture();try{
  const c=await localControl(f,async review=>{assert.match(review.message,/在连接电脑打开\/定位：允许/);return true})
  const selected=JSON.parse((await c.execute(control('file-pick',{kind:'file'}))).result)
  assert.equal('path' in selected,false)
  const saved=await c.execute(control('grant-save',{grant_id:selected.grant_id,read_only:true,capabilities:{...none,open:true}}))
  assert.equal(saved.changed,true)
  const roots=JSON.parse(await fs.readFile(f.configFile,'utf8')).roots,r=roots.find(r=>r.allowedFiles)
  assert.equal(r.path,f.folder);assert.deepEqual(r.allowedFiles,['selected.txt']);assert.equal(r.readOnly,true);assert.deepEqual(r.capabilities,{...none,open:true})
  const expired=control('grant-save',{grant_id:selected.grant_id,read_only:true,capabilities:none},saved.revision);expired.deadline_ms=Date.now()-1
  await assert.rejects(c.execute(expired),/invalid_control_request/)
 }finally{await f.close()}
})

test('local manager accepts granular drafts and rejects unknown/read-only mutation flags',async()=>{
 const f=await fixture();let manager
 try{
  manager=await createConnectorManager({home:f.home,checkBrowser:async()=>true})
  const api=async(route,body)=>{const r=await fetch(manager.origin+route,{method:body?'POST':'GET',headers:{'X-Connector-Session':manager.token,Origin:manager.origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
  const p=(await api('/api/state')).data.profiles[0]
  let d=(await api('/api/permissions/open',{id,fingerprint:p.fingerprint})).data.permissions
  const input=()=>({id,fingerprint:d.fingerprint,reviewId:d.reviewId,key:d.grants[0].key})
  assert.equal((await api('/api/permissions/grant',{...input(),readOnly:true,capabilities:all})).status,400)
  assert.equal((await api('/api/permissions/grant',{...input(),readOnly:false,capabilities:{...all,execute:true}})).status,400)
  d=(await api('/api/permissions/grant',{...input(),readOnly:false,capabilities:all})).data.permissions
  assert.deepEqual(d.grants[0].capabilities,all)
  assert.equal((await api('/api/permissions/grant',{...input(),readOnly:false})).status,400)
  assert.equal((await api('/api/permissions/save',{id,fingerprint:d.fingerprint,reviewId:d.reviewId,consent:true})).status,200)
  assert.deepEqual(JSON.parse(await fs.readFile(f.configFile,'utf8')).roots[0].capabilities,all)
 }finally{await manager?.close();await f.close()}
})

async function backendFixture(catalog){
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE studio_local_devices(id TEXT PRIMARY KEY,owner TEXT,name TEXT,revoked INTEGER,seen_ms INTEGER,catalog TEXT);
 CREATE TABLE studio_local_jobs(id TEXT PRIMARY KEY,owner TEXT,device_id TEXT,run_id TEXT,job_key TEXT UNIQUE,args_hash TEXT,payload TEXT,status TEXT,created_ms INTEGER,deadline_ms INTEGER);
 CREATE TABLE studio_local_controls(id TEXT PRIMARY KEY,owner TEXT,device_id TEXT,request_id TEXT UNIQUE,action TEXT,payload TEXT,status TEXT,claim_hash TEXT DEFAULT '',result TEXT DEFAULT '',error TEXT DEFAULT '',created_ms INTEGER,deadline_ms INTEGER);
 CREATE TABLE studio_local_control_state(device_id TEXT PRIMARY KEY,owner TEXT,info TEXT,seen_ms INTEGER);`)
 db.prepare('INSERT INTO studio_local_devices VALUES(?,?,?,?,?,?)').run(id,owner,'fixture',0,Date.now(),JSON.stringify(catalog))
 const app={findRecordById:(name,user)=>({getBool:()=>name==='studio_users'&&user===owner}),db:()=>({newQuery(sql){let params={};const stmt=db.prepare(sql.replace(/\{:(\w+)\}/g,':$1'));return {bind(v){params=v;return this},execute(){return stmt.run(params)},all(rows){rows.push(...stmt.all(params))},one(row){const v=stmt.get(params);if(!v)throw Error('record_not_found');Object.assign(row,v)}}}}),runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}
 const context={__hooks:'/hooks',DynamicModel:function(v){Object.assign(this,v)},arrayOf:()=>[],$security:{sha256:hash,randomString:n=>randomBytes(n).toString('hex').slice(0,n)}}
 const localModule={exports:{}}
 vm.runInNewContext(await fs.readFile(new URL('../pocketbase/pb_hooks/modules/local_devices.js',import.meta.url),'utf8'),{...context,module:localModule})
 const controlModule={exports:{}}
 vm.runInNewContext(await fs.readFile(new URL('../pocketbase/pb_hooks/modules/workbench_controls.js',import.meta.url),'utf8'),{...context,module:controlModule,require:()=>localModule.exports})
 return {app,db,local:localModule.exports,controls:controlModule.exports,close:()=>db.close()}
}

test('server enforces exact file inputs, scoped root enums, bounded UTF8, owner and open allowlist',async()=>{
 const f=await fixture({capabilities:all}),runtime=await createRuntime(f.config),b=await backendFixture(runtime.tools)
 try{
  const enqueue=(tool,args,user=owner)=>b.local.enqueue(b.app,user,id,{tool:'files.'+tool,arguments:{root:'work',...args}},'fixture:'+randomBytes(12).toString('hex'),'')
  for(const args of [{path:'selected.txt',extra:true},{path:'../escape'},{path:'.agent-studio-trash/data'},{path:'.env'},{path:'selected.txt',root:'wrong'}])assert.throws(()=>enqueue('stat',args))
  assert.throws(()=>enqueue('stat',{path:'selected.txt'},'another-owner'))
  assert.throws(()=>enqueue('update',{path:'selected.txt',text:'中'.repeat(22000),expected_sha256:'a'.repeat(64)}),/input_too_large/)
  assert.throws(()=>enqueue('update',{path:'selected.txt',text:'ok',expected_sha256:'wrong'}),/invalid_arguments/)
  assert.throws(()=>enqueue('open',{path:'run.ps1'}),/invalid_arguments/)
  assert.throws(()=>enqueue('restore',{trash_id:'../bad'}),/invalid_arguments/)
  const job=enqueue('update',{path:'selected.txt',text:'x'.repeat(65536),expected_sha256:hash('fixture file')})
  const payload=JSON.parse(b.db.prepare('SELECT payload FROM studio_local_jobs WHERE id=?').get(job).payload)
  assert.equal(payload.arguments.text.length,65536);assert.equal(payload.permission_revision,revision)
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM studio_local_jobs').get().n,1)
 }finally{b.close();await runtime.close();await f.close()}
})

test('server control summaries and queued payloads preserve capability booleans and reject unknown keys',async()=>{
 const f=await fixture({capabilities:all}),runtime=await createRuntime(f.config),b=await backendFixture(runtime.tools)
 try{
  const native=await localControl(f,async()=>false),summary=await native.summary()
  b.controls.poll(b.app,{id,owner},{summary,heartbeat_only:true})
  const state=b.controls.getState(b.app,id,owner)
  assert.deepEqual(JSON.parse(JSON.stringify(state.grants[0].capabilities)),all)
  const enqueue=change=>b.controls.enqueue(b.app,owner,id,{action:'grant-edit',request_id:randomBytes(12).toString('hex'),permission_revision:revision,confirm:true,root_id:'work',read_only:false,capabilities:none,...change})
  for(const change of [{capabilities:{...all,open:1}},{capabilities:{...all,execute:true}},{read_only:true,capabilities:all},{actor:'other'},{confirm:false},{root_id:'unknown'}])assert.throws(()=>enqueue(change))
  assert.throws(()=>enqueue({capabilities:undefined}),/file_capabilities_required/)
  const job=enqueue({capabilities:{...none,open:true}}),row=b.db.prepare('SELECT payload FROM studio_local_controls WHERE id=?').get(job.id)
  assert.deepEqual(JSON.parse(row.payload).capabilities,{...none,open:true})
  assert.throws(()=>b.controls.getState(b.app,id,'other-owner'))
  const bad=structuredClone(summary);bad.grants[0].capabilities.extra=true
  assert.throws(()=>b.controls.poll(b.app,{id,owner},{summary:bad,heartbeat_only:true}),/invalid_control_request/)
 }finally{b.close();await runtime.close();await f.close()}
})

test('lost grant-edit replies reconcile every capability exactly, with read-only and root ID',async()=>{
 const source=await fs.readFile(new URL('../src/lib/workbenchPermissions.ts',import.meta.url),'utf8'),context={normalizeWebsite,localApi:()=>{throw Error('no network in fixture')}}
 vm.createContext(context)
 const compiled=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*$/gm,'').replace(/^export /gm,'')
 vm.runInContext(compiled+'\nglobalThis.helpers={matchesGrantEdit,parsePermissions,parseFileCapabilities};',context)
 const {matchesGrantEdit,parsePermissions,parseFileCapabilities}=context.helpers
 const grant={id:'work',label:'fixture',kind:'folder',read_only:false,capabilities:all},payload={root_id:'work',read_only:false,capabilities:all}
 assert.equal(matchesGrantEdit([grant],payload),true)
 for(const k of Object.keys(all))assert.equal(matchesGrantEdit([grant],{...payload,capabilities:{...all,[k]:false}}),false,k)
 assert.equal(matchesGrantEdit([grant],{root_id:'work',read_only:false}),false)
 assert.equal(matchesGrantEdit([grant],{...payload,root_id:'other'}),false)
 assert.equal(matchesGrantEdit([grant],{...payload,read_only:true}),false)
 assert.throws(()=>parseFileCapabilities({...all,open:'yes'}));assert.throws(()=>parseFileCapabilities(all,true))
 const parsed=parsePermissions({available:true,device_id:id,protocol:'permissions-v2',revision,applied_revision:revision,sites:[],grants:[{...grant,capabilities:undefined}],seen_ms:Date.now(),state:'online'},id)
 assert.deepEqual(JSON.parse(JSON.stringify(parsed.grants[0].capabilities)),none)
})
