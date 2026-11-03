'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto')
const {createUpdater,verifyManifest,compare,safeUrl,validateReleaseHistory,mergeReleaseHistory,fitReleaseHistory}=require('../update-core.cjs')
const {performUpdate,managedPath}=require('../update-helper.cjs')
const {copyManagedFiles}=require('../update-helper.cjs')
test('completed update cleanup is confined to verified inactive successful transactions',async t=>{
 const {cleanupCompletedUpdates}=require('../update-helper.cjs'),root=await directory(t),base=path.join(root,'temp/desktop-updates'),cache=path.join(root,'temp/desktop-update-cache');await fs.mkdir(base,{recursive:true});await fs.mkdir(cache)
 const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()]
 for(const [index,id] of ids.entries()){const dir=path.join(base,id);await fs.mkdir(dir);const installer=path.join(cache,'download-'+id+'.exe');await fs.writeFile(installer,'fixture');await fs.writeFile(path.join(dir,'job.json'),JSON.stringify({root:index===2?root+'outside':root,directory:dir,id,installer}));await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({phase:index===1?'rolled_back':'succeeded',helperPid:98765}))}
 await cleanupCompletedUpdates(root,{now:Date.now()+120000,isRunning:()=>false});await assert.rejects(fs.access(path.join(base,ids[0])));await fs.access(path.join(base,ids[1]));await fs.access(path.join(base,ids[2]))
})
const pair=crypto.generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'pem'}),bytes=Buffer.from('MZ-SIGNED-UPDATE-FIXTURE')
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
function envelope(patch={}){const m={schema:1,channel:'stable',platform:'win32-x64',version:'0.1.0-preview.11',minimumVersion:'0.1.0-preview.10',size:bytes.length,sha256:hash(bytes),url:'http://127.0.0.1:12345/app.exe',notes:'更新说明',publishedAt:new Date().toISOString(),...patch},payload=Buffer.from(JSON.stringify(m));return {payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')}}
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir}
function updater(dir,{manifest=envelope(),body=bytes,fetcher}={}){return createUpdater({directory:dir,publicKey:key,currentVersion:'0.1.0-preview.10',feed:()=> 'http://127.0.0.1:12345/latest.json',fetcher:fetcher||(async url=>new Response(url.endsWith('.json')?JSON.stringify(manifest):body))})}

const release=(n,notes='[新增功能]\n- 真实版本说明')=>({version:'0.1.0-preview.'+n,publishedAt:'2026-11-02',title:'版本 '+n,notes})
test('release history is bounded, validated, deduplicated and ordered numerically',()=>{
 assert.deepEqual(mergeReleaseHistory([release(9),release(10)],[release(10,'new'),release(12)]).map(r=>r.version),['0.1.0-preview.12','0.1.0-preview.10','0.1.0-preview.9'])
 assert.equal(mergeReleaseHistory([release(10)],[release(10,'new')])[0].notes,'new')
 for(const value of [null,Array.from({length:13},(_,i)=>release(i)),[release(10),release(10)],[{...release(10),publishedAt:'invalid'}],[{...release(10),version:'bad'}],[{...release(10),notes:'a'.repeat(5001)}],[{...release(10),downloadUrl:'https://untrusted.test'}]])assert.throws(()=>validateReleaseHistory(value))
})
test('signed histories are checked before becoming UI data; legacy manifests remain compatible',()=>{
 assert.equal(verifyManifest(envelope(),key).history,undefined)
 assert.deepEqual(verifyManifest(envelope({history:[release(11),release(10)]}),key).history,[release(11),release(10)])
 assert.throws(()=>verifyManifest(envelope({history:[{...release(11),notes:42}]}),key),/版本历史/)
})
test('already-current clients still receive notes, dates and verified version history',async t=>{
 const dir=await directory(t),m=envelope({version:'0.1.0-preview.10',notes:'CURRENT_RELEASE_NOTES',history:[release(10),release(9)]}),u=updater(dir,{manifest:m})
 const state=await u.check();assert.equal(state.phase,'current');assert.equal(state.notes,'CURRENT_RELEASE_NOTES');assert.equal(state.version,'0.1.0-preview.10');assert.ok(state.checkedAt);assert.ok(state.publishedAt);assert.equal(state.releases[0].notes,'CURRENT_RELEASE_NOTES')
 await assert.rejects(u.download(),/请先检查/)
})
test('offline history survives a failed check without allowing a package to run',async t=>{
 const dir=await directory(t),u=createUpdater({directory:dir,publicKey:key,currentVersion:'0.1.0-preview.10',history:[release(10),release(9)],feed:()=> 'http://127.0.0.1:12345/latest.json',fetcher:async()=>new Response('',{status:500})})
 assert.equal(u.state().releases.length,2);await assert.rejects(u.check());assert.equal(u.state().phase,'error');assert.equal(u.state().releases.length,2);await assert.rejects(u.ready())
})
test('UTF-8 changelogs fit the old signed-manifest limit by trimming oldest history first',()=>{
 const metadata={notes:'说明'.repeat(2500),history:Array.from({length:12},(_,i)=>release(20-i,'更新'.repeat(2500)))}
 const history=fitReleaseHistory(metadata),json=JSON.stringify({...metadata,history});assert.ok(Buffer.byteLength(json)<=36000);assert.ok(Buffer.from(json).toString('base64').length<=50000);assert.equal(history[0].version,'0.1.0-preview.20');assert.ok(history.length<12);assert.equal(metadata.history.length,12)
 assert.throws(()=>fitReleaseHistory({notes:'大'.repeat(15000),history:[release(20)]}),/过长/)
})
test('version ordering is numeric, prerelease before stable, and unsafe URLs are refused',()=>{
 assert.equal(compare('0.1.0-preview.11','0.1.0-preview.9'),1);assert.equal(compare('0.1.0','0.1.0-preview.99'),1)
 for(const url of ['http://company.test/latest.json','file:///C:/app.exe','https://u:p@company.test/a','https://company.test/a#secret'])assert.throws(()=>safeUrl(url))
 assert.equal(safeUrl('https://company.test/updates/latest.json'),'https://company.test/updates/latest.json')
})
test('only the pinned signing key and supported bounded release metadata are accepted',()=>{
 assert.equal(verifyManifest(envelope(),key).version,'0.1.0-preview.11')
 const forged=envelope();forged.payload=Buffer.from(JSON.stringify({version:'999.0.0'})).toString('base64');assert.throws(()=>verifyManifest(forged,key),/签名/)
 const other=crypto.generateKeyPairSync('ed25519');assert.throws(()=>verifyManifest(envelope(),other.publicKey),/签名/)
 for(const patch of [{platform:'linux'},{size:2**32},{sha256:'no'},{notes:'a'.repeat(5001)},{url:'http://evil.test/app.exe'},{version:'1.0.0;exec'}])assert.throws(()=>verifyManifest(envelope(patch),key))
})
test('check, progress, download verification and tamper detection use real local files',async t=>{
 const dir=await directory(t),u=updater(dir);assert.equal((await u.check()).phase,'available');assert.equal((await u.download()).phase,'ready');const ready=await u.ready();assert.deepEqual(await fs.readFile(ready.installer),bytes)
 await fs.writeFile(ready.installer,'changed');await assert.rejects(u.ready(),/发生变化/)
 assert.equal(u.state().phase,'error');await assert.rejects(u.ready(),/请先下载/)
})
test('downgrades, same versions, unsupported baseline, unsigned and failed transport never become ready',async t=>{
 const dir=await directory(t)
 for(const value of ['0.1.0-preview.9','0.1.0-preview.10']){const u=updater(dir,{manifest:envelope({version:value})});assert.equal((await u.check()).phase,'current');await assert.rejects(u.ready())}
 await assert.rejects(updater(dir,{manifest:envelope({minimumVersion:'0.2.0'})}).check(),/基础版本/)
 await assert.rejects(updater(dir,{manifest:{}}).check())
 for(const status of [404,500])await assert.rejects(updater(dir,{fetcher:async()=>new Response('',{status})}).check())
})
test('corrupt and truncated downloads are discarded and never executable as an update',async t=>{
 const dir=await directory(t)
 for(const body of [bytes.subarray(1),Buffer.alloc(bytes.length),Buffer.alloc(bytes.length+1)]){const u=updater(dir,{body});await u.check();await assert.rejects(u.download());await assert.rejects(u.ready())}
 assert.deepEqual(await fs.readdir(dir),[])
})
test('oversized manifests, HTTPS downgrades and overlapping operations are refused',async t=>{
 const dir=await directory(t);await assert.rejects(updater(dir,{fetcher:async()=>new Response('x'.repeat(65537))}).check(),/过大/)
 await assert.rejects(updater(dir,{fetcher:async()=>new Response('',{status:302,headers:{location:'http://evil.test/a'}})}).check(),/HTTPS/)
 let release;const blocked=updater(dir,{fetcher:()=>new Promise(resolve=>{release=resolve})});const first=blocked.check();await new Promise(r=>setImmediate(r));await assert.rejects(blocked.check(),/正在进行/);release(new Response(JSON.stringify(envelope())));await first
})
test('managed paths cannot escape into user data, aliases or alternate streams',()=>{
 for(const file of ['../secret','/secret','C:/secret','temp/cache','web-cache/db','resources/../secret','resources/a:stream','resources/a.'])assert.throws(()=>managedPath('D:/fixture',file))
})
async function helperFixture(t){
 const root=await directory(t),id=crypto.randomUUID(),dir=path.join(root,'temp/desktop-updates',id);await fs.mkdir(dir,{recursive:true})
 await fs.writeFile(path.join(root,'Agent Studio.exe'),'OLD');await fs.writeFile(path.join(root,'.studio-verify.cjs'),'old verifier');await fs.writeFile(path.join(root,'.studio-install-complete'),'old');await fs.writeFile(path.join(root,'account-private.json'),'PRESERVE_USER_DATA')
 const writeInventory=async version=>{const b=await fs.readFile(path.join(root,'Agent Studio.exe'));await fs.writeFile(path.join(root,'.studio-files.json'),JSON.stringify({version,files:[{path:'Agent Studio.exe',bytes:b.length,sha256:hash(b)}]}))};await writeInventory('0.1.0-preview.10')
 const installer=path.join(dir,'package.exe');await fs.writeFile(installer,bytes)
 return {root,dir,id,job:{root,directory:dir,id,parentPid:12345,args:[],installer,envelope:envelope(),publicKey:key},writeInventory}
}
test('transaction applies verified files, waits for new process health and preserves user data',async t=>{
 const f=await helperFixture(t)
 await performUpdate(f.job,{ensureStopped:async()=>{},waitForExit:async()=>{},runInstaller:async(_file,args)=>{assert.equal(args.at(-1),'/D='+f.root);await fs.writeFile(path.join(f.root,'Agent Studio.exe'),'NEW');await f.writeInventory('0.1.0-preview.11')},startApp:async(_root,args)=>{assert.ok(args.includes('--desktop-updated='+f.id));await fs.writeFile(path.join(f.dir,'health.json'),JSON.stringify({version:'0.1.0-preview.11',id:f.id,pid:98765}));return 98765}})
 assert.equal(JSON.parse(await fs.readFile(path.join(f.dir,'result.json'),'utf8')).phase,'succeeded');assert.equal(await fs.readFile(path.join(f.root,'account-private.json'),'utf8'),'PRESERVE_USER_DATA');await assert.rejects(fs.access(path.join(f.dir,'backup')))
})

test('verification failure before install reopens the unchanged client without running the installer',async t=>{
 const f=await helperFixture(t);await fs.writeFile(f.job.installer,'TAMPERED');let launched=false
 await performUpdate(f.job,{ensureStopped:async()=>{},waitForExit:async()=>{},runInstaller:async()=>assert.fail('must not install'),startApp:async(_root,args)=>{assert.ok(args.includes('--desktop-update-failed='+f.id));launched=true;return 98765}})
 const result=JSON.parse(await fs.readFile(path.join(f.dir,'result.json'),'utf8'));assert.equal(result.phase,'failed');assert.equal(result.unchanged,true);assert.ok(launched)
 assert.equal(await fs.readFile(path.join(f.root,'Agent Studio.exe'),'utf8'),'OLD');assert.equal(await fs.readFile(path.join(f.root,'account-private.json'),'utf8'),'PRESERVE_USER_DATA')
})
for(const mode of ['installer-failed','wrong-version','unhealthy'])test('transaction recovers old files after '+mode,async t=>{
 const f=await helperFixture(t);let launches=0,stopped=false
 await performUpdate(f.job,{ensureStopped:async()=>{},waitForExit:async()=>{},healthTimeout:1,runInstaller:async()=>{await fs.writeFile(path.join(f.root,'Agent Studio.exe'),'NEW');if(mode==='installer-failed')throw Error('failed');await f.writeInventory(mode==='wrong-version'?'0.1.0-preview.12':'0.1.0-preview.11')},stopApp:async()=>{stopped=true},startApp:async()=>{launches++;return 98765}})
 assert.equal((JSON.parse(await fs.readFile(path.join(f.dir,'result.json'),'utf8'))).phase,'rolled_back');assert.equal(await fs.readFile(path.join(f.root,'Agent Studio.exe'),'utf8'),'OLD');assert.equal(await fs.readFile(path.join(f.root,'account-private.json'),'utf8'),'PRESERVE_USER_DATA');assert.ok(stopped);assert.ok(launches>=1)
})

test('temporary file sharing violations retry a bounded copy without losing the source',async t=>{
 const root=await directory(t),backup=path.join(root,'backup');await fs.mkdir(backup);await fs.writeFile(path.join(root,'file'),'ORIGINAL');let attempts=0
 await copyManagedFiles(root,backup,['file'],{wait:async()=>{},copyFile:async(from,to)=>{if(++attempts<3)throw Object.assign(Error('busy'),{code:'EBUSY'});await fs.copyFile(from,to)}})
 assert.equal(attempts,3);assert.equal(await fs.readFile(path.join(backup,'file'),'utf8'),'ORIGINAL')
})
test('a blocked restore keeps the new entry assets, complete backup and startup barrier',async t=>{
 const f=await helperFixture(t),web=path.join(f.root,'resources/web');await fs.mkdir(web,{recursive:true});await fs.writeFile(path.join(web,'index.html'),'<script src="old.js"></script>');await fs.writeFile(path.join(web,'old.js'),'OLD_JS')
 const inventory=async(version,names)=>{const files=[];for(const name of names){const b=await fs.readFile(path.join(f.root,name));files.push({path:name,bytes:b.length,sha256:hash(b)})}await fs.writeFile(path.join(f.root,'.studio-files.json'),JSON.stringify({version,files}))}
 await inventory('0.1.0-preview.10',['Agent Studio.exe','resources/web/index.html','resources/web/old.js']);let copies=0,launched=false
 await performUpdate(f.job,{waitForExit:async()=>{},ensureStopped:async()=>{},stopApp:async()=>{},copyFiles:async(...args)=>{if(++copies===2)throw Object.assign(Error('locked'),{code:'EBUSY'});await copyManagedFiles(...args)},runInstaller:async()=>{
  await fs.writeFile(path.join(f.root,'Agent Studio.exe'),'NEW');await fs.writeFile(path.join(web,'index.html'),'<script src="new.js"></script>');await fs.writeFile(path.join(web,'new.js'),'NEW_JS');await inventory('0.1.0-preview.11',['Agent Studio.exe','resources/web/index.html','resources/web/new.js']);throw Error('installer_failed')
 },startApp:async()=>{launched=true;return 98765}})
 const result=JSON.parse(await fs.readFile(path.join(f.dir,'result.json'),'utf8'));assert.equal(result.phase,'recovery_required');assert.equal(result.backupPreserved,true);assert.equal(launched,false)
 assert.equal(await fs.readFile(path.join(web,'new.js'),'utf8'),'NEW_JS');assert.match(await fs.readFile(path.join(web,'index.html'),'utf8'),/new.js/)
 assert.equal(await fs.readFile(path.join(f.dir,'backup/resources/web/old.js'),'utf8'),'OLD_JS');assert.equal(await fs.readFile(path.join(f.root,'.studio-update-in-progress'),'utf8'),f.id)
})
