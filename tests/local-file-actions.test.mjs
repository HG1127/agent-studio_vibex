import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {createHash} from 'node:crypto'
import {createRuntime} from '../local-executor/runtime.mjs'
import {fileCapabilities} from '../local-executor/file-capabilities.mjs'
import {DIGEST_LIMIT,VAULT,invokeFileApplication,fileScopeLock} from '../local-executor/file-actions.mjs'

const all={edit:true,move:true,delete:true,open:true}
const revision='e'.repeat(24)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
async function fixture(options={}){
 const base=path.join(process.cwd(),'.tmp','file-action-tests');await fs.mkdir(base,{recursive:true})
 const root=await fs.mkdtemp(path.join(base,'disposable-'))
 await fs.writeFile(path.join(root,'source.txt'),'original 原文')
 await fs.writeFile(path.join(root,'neighbour.txt'),'neighbour')
 const invocations=[]
 const config={roots:[{name:'work',path:root,...options}],permissionRevision:revision,files:{enabled:true}}
 const runtime=await createRuntime(config,{invokeFileApplication:async(...args)=>invocations.push(args)})
 return {root,runtime,config,invocations,
  call:(tool,args={},signal)=>runtime.execute({tool:'files.'+tool,arguments:{root:'work',...args},permission_revision:revision},signal),
  close:async()=>{await runtime.close();assert.ok(path.resolve(root).startsWith(path.resolve(base)+path.sep));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}}
}
const source={path:'source.txt',expected_sha256:hash('original 原文')}

test('legacy roots retain read/create and new capabilities default off; schemas are scoped and revisioned',async()=>{
 const f=await fixture();try{
  assert.deepEqual(fileCapabilities(),{edit:false,move:false,delete:false,open:false})
  const names=f.runtime.tools.map(t=>t.name)
  for(const n of ['list','read','write','stat','mkdir','copy'])assert.ok(names.includes('files.'+n))
  for(const n of ['update','move','trash','restore','trash_list','open','reveal'])assert.ok(!names.includes('files.'+n))
  assert.ok(names.length<=50);assert.ok(names.every(n=>!n.includes('permission')))
  assert.ok(f.runtime.tools.every(t=>t.inputSchema['x-studio-permission-revision']===revision))
  await f.call('write',{path:'new.txt',text:'legacy create'})
  assert.equal(await f.call('read',{path:'new.txt'}),'legacy create')
  await assert.rejects(f.call('write',{path:'source.txt',text:'overwrite'}),/EEXIST/)
  await assert.rejects(f.runtime.execute({tool:'files.stat',arguments:{root:'work',path:'source.txt'},permission_revision:'d'.repeat(24)}),/permission_scope_changed/)
 }finally{await f.close()}
})

test('readOnly and exact file grants cannot mutate; file open never expands to the parent',async()=>{
 const f=await fixture({readOnly:true,allowedFiles:['source.txt'],capabilities:{...fileCapabilities(),open:true}})
 try{
  assert.ok(!f.runtime.tools.some(t=>['files.write','files.copy','files.mkdir','files.update','files.move','files.trash','files.restore'].includes(t.name)))
  assert.equal(JSON.parse(await f.call('stat',{path:'source.txt'})).sha256,source.expected_sha256)
  await assert.rejects(f.call('stat',{path:'.'}),/file_not_authorized/)
  await assert.rejects(f.call('open',{path:'neighbour.txt'}),/file_not_authorized/)
  await f.call('open',{path:'source.txt'});assert.equal(f.invocations[0][0],path.join(f.root,'source.txt'))
  assert.deepEqual(JSON.parse(await f.call('list',{path:'.'})).entries,[{name:'source.txt',directory:false}])
  await assert.rejects(createRuntime({...f.config,roots:[{name:'bad',path:f.root,readOnly:true,capabilities:all}]}),/readonly_capabilities_denied/)
  await assert.rejects(createRuntime({...f.config,roots:[{name:'bad',path:f.root,capabilities:{...all,edit:'yes'}}]}),/invalid_file_capabilities/)
  await assert.rejects(createRuntime({...f.config,roots:[{name:'bad',path:f.root,capabilities:{...all,execute:true}}]}),/invalid_file_capabilities/)
 }finally{await f.close()}
})

test('eligible root enums are per-tool and enforced at runtime',async()=>{
 const f=await fixture();let runtime
 try{
  runtime=await createRuntime({roots:[{name:'legacy',path:f.root},{name:'editor',path:f.root,capabilities:{...fileCapabilities(),edit:true}},{name:'reader',path:f.root,readOnly:true}]})
  assert.deepEqual(runtime.tools.find(t=>t.name==='files.update').inputSchema.properties.root.enum,['editor'])
  assert.deepEqual(runtime.tools.find(t=>t.name==='files.copy').inputSchema.properties.root.enum,['legacy','editor'])
  await assert.rejects(runtime.execute({tool:'files.update',arguments:{root:'legacy',...source,text:'bad'}}),/invalid_file_arguments/)
  await assert.rejects(runtime.execute({tool:'files.mkdir',arguments:{root:'reader',path:'bad'}}),/invalid_file_arguments/)
 }finally{await runtime?.close();await f.close()}
})

test('traversal, private files, vault paths, root effects and extra arguments are rejected',async()=>{
 const f=await fixture({capabilities:all});try{
  for(const p of ['../outside','a/../../outside','C:\\outside','/absolute','.env','.git/config','credentials.json','secret.sqlite-wal',VAULT+'/anything','sub/.agent-studio-trash/data','x.','x ','NUL.txt','a\u0000']){
   await assert.rejects(f.call('mkdir',{path:p}),undefined,p)
  }
  for(const tool of ['mkdir','trash','move','update'])await assert.rejects(f.call(tool,{...source,path:'.',...(tool==='update'?{text:'x'}:tool==='move'?{destination:'moved'}:{})}),undefined,tool)
  await assert.rejects(f.call('stat',{path:'source.txt',extra:true}),/invalid_file_arguments/)
  await assert.rejects(f.call('restore',{trash_id:'../escape'}),/invalid_file_arguments/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
 }finally{await f.close()}
})

test('digest, editing, text and copying limits are bounded',async()=>{
 const f=await fixture({capabilities:all});try{
  const h=await fs.open(path.join(f.root,'large.txt'),'wx');await h.truncate(DIGEST_LIMIT+1);await h.close()
  assert.equal(JSON.parse(await f.call('stat',{path:'large.txt'})).sha256,null)
  assert.equal(JSON.parse(await f.call('stat',{path:'.'})).directory,true)
  await assert.rejects(f.call('copy',{path:'large.txt',destination:'copy.txt'}),/file_size_or_type_denied/)
  await assert.rejects(f.call('update',{...source,text:'中'.repeat(22000)}),/text_too_large_or_invalid/)
  await assert.rejects(f.call('update',{...source,text:'bad\u0000text'}),/file_not_plain_text/)
  await fs.writeFile(path.join(f.root,'binary.txt'),Buffer.from([0xff,0xff]))
  await assert.rejects(f.call('update',{path:'binary.txt',expected_sha256:hash(Buffer.from([0xff,0xff])),text:'no'}),/file_not_plain_text/)
 }finally{await f.close()}
})

test('hash conflicts do not change sources or create recovery records',async()=>{
 const f=await fixture({capabilities:all});try{
  for(const tool of ['update','move','trash'])await assert.rejects(f.call(tool,{...source,expected_sha256:'0'.repeat(64),...(tool==='update'?{text:'bad'}:tool==='move'?{destination:'moved.txt'}:{})}),/file_hash_conflict/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  await assert.rejects(fs.stat(path.join(f.root,VAULT)),{code:'ENOENT'})
 }finally{await f.close()}
})

test('update retains exact original, verifies post-effect digest, hides recovery vault',async()=>{
 const f=await fixture({capabilities:all});try{
  const value='new 内容',result=JSON.parse(await f.call('update',{...source,text:value}))
  assert.equal(result.updated,true);assert.equal(result.sha256,hash(value));assert.equal(result.size,Buffer.byteLength(value))
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),value)
  assert.equal(await fs.readFile(path.join(f.root,VAULT,result.recovery_id,'data'),'utf8'),'original 原文')
  assert.deepEqual(JSON.parse(await f.call('trash_list')).entries,[])
  assert.ok(!JSON.parse(await f.call('list',{path:'.'})).entries.some(e=>e.name===VAULT))
  for(const tool of ['read','stat','open','reveal'])await assert.rejects(f.call(tool,{path:VAULT+'/'+result.recovery_id+'/data'}),/path_denied/)
 }finally{await f.close()}
})

test('mkdir/copy/move refuse existing destinations and directory move/delete',async()=>{
 const f=await fixture({capabilities:all});try{
  await f.call('mkdir',{path:'sub'})
  await assert.rejects(f.call('mkdir',{path:'sub'}),/EEXIST/)
  await f.call('copy',{path:'source.txt',destination:'sub/copy.txt'})
  for(const tool of ['copy','move'])await assert.rejects(f.call(tool,{path:source.path,...(tool==='move'?{expected_sha256:source.expected_sha256}:{}),destination:'sub/copy.txt'}),/EEXIST|destination_exists/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  assert.equal(await fs.readFile(path.join(f.root,'sub/copy.txt'),'utf8'),'original 原文')
  for(const tool of ['trash','move'])await assert.rejects(f.call(tool,{path:'sub',expected_sha256:'0'.repeat(64),...(tool==='move'?{destination:'other'}:{})}),/file_size_or_type_denied/)
  const moved=JSON.parse(await f.call('move',{...source,destination:'sub/moved.txt'}))
  assert.equal(moved.moved,true);assert.equal(moved.sha256,source.expected_sha256)
  await assert.rejects(fs.stat(path.join(f.root,'source.txt')),{code:'ENOENT'})
  assert.equal(await fs.readFile(path.join(f.root,'sub/moved.txt'),'utf8'),'original 原文')
 }finally{await f.close()}
})

test('trash and restore are root-scoped, recoverable and never overwrite',async()=>{
 const f=await fixture({capabilities:all});try{
  assert.deepEqual(JSON.parse(await f.call('trash_list')),{entries:[],truncated:false})
  const trashed=JSON.parse(await f.call('trash',source));assert.match(trashed.trash_id,/^[a-f0-9]{32}$/)
  assert.equal(trashed.trashed,true);await assert.rejects(fs.stat(path.join(f.root,'source.txt')),{code:'ENOENT'})
  const entries=JSON.parse(await f.call('trash_list')).entries;assert.equal(entries[0].path,'source.txt');assert.equal(entries[0].sha256,source.expected_sha256)
  await fs.writeFile(path.join(f.root,'source.txt'),'new owner file',{flag:'wx'})
  await assert.rejects(f.call('restore',{trash_id:trashed.trash_id}),/EEXIST/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'new owner file')
  await fs.unlink(path.join(f.root,'source.txt'))
  const restored=JSON.parse(await f.call('restore',{trash_id:trashed.trash_id}));assert.equal(restored.restored,true)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  assert.deepEqual(JSON.parse(await f.call('trash_list')).entries,[])
  await assert.rejects(f.call('restore',{trash_id:trashed.trash_id}),/trash_not_restorable/)
 }finally{await f.close()}
})

test('cancellation before effect and while waiting for scope lock leaves source unchanged',async()=>{
 const f=await fixture({capabilities:all});let release,holding
 try{
  const c=new AbortController();c.abort()
  for(const tool of ['update','move','trash','copy','mkdir','open'])await assert.rejects(f.call(tool,{...source,...(tool==='update'?{text:'bad'}:tool==='move'||tool==='copy'?{destination:'dest.txt'}:{})},c.signal),{name:'AbortError'})
  let started;const ready=new Promise(r=>{started=r})
  holding=fileScopeLock(f.root,undefined,async()=>{started();await new Promise(r=>{release=r})});await ready
  const waiting=new AbortController(),call=f.call('trash',source,waiting.signal);waiting.abort();release();await holding
  await assert.rejects(call,{name:'AbortError'})
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  assert.equal(f.invocations.length,0)
 }finally{release?.();await holding;await f.close()}
})

test('concurrent same-hash updates serialize and only one succeeds',async()=>{
 const f=await fixture({capabilities:all});try{
  const results=await Promise.allSettled([f.call('update',{...source,text:'first'}),f.call('update',{...source,text:'second'})])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
  assert.match(results.find(r=>r.status==='rejected').reason.message,/file_hash_conflict/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'first')
 }finally{await f.close()}
})

test('hardlinks and linked parents/vaults cannot be used for file effects',async()=>{
 const f=await fixture({capabilities:all});try{
  await fs.link(path.join(f.root,'source.txt'),path.join(f.root,'hard.txt'))
  for(const tool of ['stat','read','trash'])await assert.rejects(f.call(tool,{path:'hard.txt',...(tool==='trash'?{expected_sha256:source.expected_sha256}:{})}),/linked_path_denied/)
  await fs.unlink(path.join(f.root,'hard.txt'))
  await fs.mkdir(path.join(f.root,'actual'))
  await fs.symlink(path.join(f.root,'actual'),path.join(f.root,'linked'),'junction')
  await assert.rejects(f.call('mkdir',{path:'linked/escape'}),/linked_path_denied/)
  await fs.symlink(path.join(f.root,'actual'),path.join(f.root,VAULT),'junction')
  await assert.rejects(f.call('trash',source),/invalid_recovery_vault/)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
 }finally{await f.close()}
})

test('malformed, tampered or hardlinked vault metadata/data fails closed',async()=>{
 const f=await fixture({capabilities:all});try{
  const deleted=JSON.parse(await f.call('trash',source)),dir=path.join(f.root,VAULT,deleted.trash_id),metaFile=path.join(dir,'metadata.json'),original=await fs.readFile(metaFile,'utf8'),meta=JSON.parse(original)
  for(const bad of [{...meta,path:'../outside.txt'},{...meta,path:VAULT+'/hidden'},{...meta,path:'sub/../source.txt'},{...meta,path:'C:\\outside'},{...meta,extra:true}]){
   await fs.writeFile(metaFile,JSON.stringify(bad));await assert.rejects(f.call('restore',{trash_id:deleted.trash_id}));await assert.rejects(f.call('trash_list'))
  }
  await fs.writeFile(metaFile,original)
  await fs.link(metaFile,path.join(f.root,'linked-meta.json'));await assert.rejects(f.call('restore',{trash_id:deleted.trash_id}),/file_size_or_type_denied/)
  await fs.unlink(path.join(f.root,'linked-meta.json'))
  await fs.writeFile(path.join(dir,'data'),'tampered');await assert.rejects(f.call('restore',{trash_id:deleted.trash_id}),/invalid_recovery_data/)
  await assert.rejects(fs.stat(path.join(f.root,'source.txt')),{code:'ENOENT'})
 }finally{await f.close()}
})

test('open allowlist denies active types and uses a fixed literal Windows adapter',async()=>{
 const f=await fixture({capabilities:all});try{
  for(const ext of ['exe','lnk','url','html','svg','bat','cmd','ps1','js','py','docm','xlsm','hta']){
   await fs.writeFile(path.join(f.root,'unsafe.'+ext),'inert disposable fixture')
   await assert.rejects(f.call('open',{path:'unsafe.'+ext}),/file_open_type_denied/)
  }
  await f.call('open',{path:'source.txt'});await f.call('reveal',{path:'source.txt'});assert.equal(f.invocations.length,2)
  let called=0
  const launch=(command,args,options)=>{
   called++;assert.equal(command,'C:\\Windows\\explorer.exe');assert.equal(options.shell,false)
   assert.deepEqual(args,[called===1?'C:\\fixtures\\literal & $name.txt':'/select,C:\\fixtures\\literal & $name.txt'])
   const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child
  }
  for(const reveal of [false,true])await invokeFileApplication('C:\\fixtures\\literal & $name.txt',reveal,undefined,{platform:'win32',launch,windows:'C:\\Windows'})
  await assert.rejects(invokeFileApplication('C:\\fixtures\\bad",/root.txt',false,undefined,{platform:'win32',launch}),/file_open_platform_or_path_denied/)
  await assert.rejects(invokeFileApplication('C:\\fixtures\\script.exe',false,undefined,{platform:'win32',launch}),/file_open_platform_or_path_denied/)
  const c=new AbortController();c.abort();await assert.rejects(invokeFileApplication('C:\\fixtures\\x.txt',false,c.signal,{platform:'win32',launch}),{name:'AbortError'})
  assert.equal(called,2)
 }finally{await f.close()}
})

test('a partial move reports uncertainty with a retained recovery receipt and never retries',async t=>{
 const f=await fixture({capabilities:all}),unlink=fs.unlink.bind(fs);let attempts=0
 try{
  t.mock.method(fs,'unlink',async file=>{
   if(file===path.join(f.root,'source.txt')){attempts++;throw Object.assign(Error('fixture simulated interrupted unlink'),{code:'EPERM'})}
   return unlink(file)
  })
  let message=''
  await assert.rejects(f.call('move',{...source,destination:'partial.txt'}),e=>{message=e.message;return /file_effect_uncertain.*do_not_retry/.test(message)})
  assert.equal(attempts,1)
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  assert.equal(await fs.readFile(path.join(f.root,'partial.txt'),'utf8'),'original 原文')
  const id=/recovery_id=([a-f0-9]{32})/.exec(message)[1]
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,VAULT,id,'receipt.json'),'utf8')),{state:'uncertain'})
  assert.equal(await fs.readFile(path.join(f.root,VAULT,id,'data'),'utf8'),'original 原文')
  assert.deepEqual(JSON.parse(await f.call('trash_list')).entries,[])
  await assert.rejects(f.call('restore',{trash_id:id}),/trash_not_restorable/)
 }finally{t.mock.restoreAll();await f.close()}
})

test('restore cannot borrow another root or follow a replaced parent; vault data hardlinks fail closed',async()=>{
 const f=await fixture({capabilities:all}),other=await fixture({capabilities:all})
 try{
  await f.call('mkdir',{path:'nested'});await f.call('copy',{path:'source.txt',destination:'nested/item.txt'})
  const trashed=JSON.parse(await f.call('trash',{path:'nested/item.txt',expected_sha256:source.expected_sha256}))
  await assert.rejects(other.call('restore',{trash_id:trashed.trash_id}),/trash_not_found|ENOENT/)
  await fs.rmdir(path.join(f.root,'nested'))
  await fs.symlink(other.root,path.join(f.root,'nested'),'junction')
  await assert.rejects(f.call('restore',{trash_id:trashed.trash_id}),/linked_path_denied/)
  await assert.rejects(fs.stat(path.join(other.root,'item.txt')),{code:'ENOENT'})
  await fs.rmdir(path.join(f.root,'nested'));await fs.mkdir(path.join(f.root,'nested'))
  await fs.link(path.join(f.root,VAULT,trashed.trash_id,'data'),path.join(f.root,'hard-data.txt'))
  await assert.rejects(f.call('restore',{trash_id:trashed.trash_id}),/file_size_or_type_denied/)
 }finally{await f.close();await other.close()}
})

test('cancellation after recovery capture still prevents the source effect',async t=>{
 const f=await fixture({capabilities:all}),writeFile=fs.writeFile.bind(fs),cancel=new AbortController()
 try{
  t.mock.method(fs,'writeFile',async(file,...args)=>{
   const result=await writeFile(file,...args)
   if(String(file).endsWith(path.sep+'receipt.json'))cancel.abort()
   return result
  })
  await assert.rejects(f.call('update',{...source,text:'cancelled edit'},cancel.signal),{name:'AbortError'})
  assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),'original 原文')
  const records=await fs.readdir(path.join(f.root,VAULT));assert.equal(records.length,1)
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root,VAULT,records[0],'receipt.json'),'utf8')).state,'prepared')
  assert.deepEqual(JSON.parse(await f.call('trash_list')).entries,[])
 }finally{t.mock.restoreAll();await f.close()}
})

test('long file listings return valid bounded JSON and declare truncation',async()=>{
 const f=await fixture();try{
  for(let n=0;n<60;n++)await fs.writeFile(path.join(f.root,String(n).padStart(3,'0')+'x'.repeat(220)+'.txt'),'fixture')
  const result=await f.call('list',{path:'.'}),listing=JSON.parse(result)
  assert.ok(result.length<=12000);assert.equal(listing.truncated,true);assert.ok(listing.entries.length<60)
 }finally{await f.close()}
})
