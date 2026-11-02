'use strict'
// Electron virtualizes .asar as a directory. Installation manifests describe
// actual disk files; the main-process preflight must inspect original-fs.
const diskFs=require(process.versions.electron?'original-fs':'node:fs'),fs=diskFs.promises,path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto')
const {verifyManifest,hashFile}=require('./update-core.cjs')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function managedPath(root,value){
 if(typeof value!=='string'||value.length>1000)throw Error('invalid_managed_file')
 const parts=value.replaceAll('\\','/').split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[:\x00-\x1f]/.test(p)||/[. ]$/.test(p))||['temp','web-cache'].includes(parts[0]))throw Error('invalid_managed_file')
 const target=path.resolve(root,...parts);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('invalid_managed_file');return target
}
async function regular(root,file,directories=new Set()){
 const rel=path.relative(root,file);let current=root
 const parts=rel.split(path.sep)
 for(let i=0;i<parts.length;i++){
  current=path.join(current,parts[i]);if(i<parts.length-1&&directories.has(current))continue
  const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('managed_link_refused')
  if(i===parts.length-1){if(!stat.isFile())throw Error('managed_file_required')}else{if(!stat.isDirectory())throw Error('managed_directory_required');directories.add(current)}
 }
}
async function inventory(root){
 if((await fs.lstat(root)).isSymbolicLink())throw Error('install_root_link_refused')
 const record=JSON.parse(await fs.readFile(path.join(root,'.studio-files.json'),'utf8'))
 if(!Array.isArray(record.files)||record.files.length<1||record.files.length>20000)throw Error('invalid_install_inventory')
 const names=new Set(),directories=new Set();for(const row of record.files){const file=managedPath(root,row.path),key=file.toLowerCase();if(names.has(key)||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<0)throw Error('invalid_install_inventory');names.add(key);await regular(root,file,directories)}
 return record
}
async function copy(root,backup,names){
 const directories=new Set(),created=new Map();let cursor=0,failure
 // Bound disk work, reuse directory creation, and drain in-flight copies
 // before returning an error so recovery cannot race an unfinished backup.
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<names.length&&!failure){
   const name=names[cursor++]
   try{
    const source=managedPath(root,name);await regular(root,source,directories)
    const target=managedPath(backup,name),parent=path.dirname(target)
    if(!created.has(parent))created.set(parent,fs.mkdir(parent,{recursive:true}))
    await created.get(parent);await fs.copyFile(source,target)
   }catch(error){failure||=error}
  }
 }));if(failure)throw failure
}
async function verifyInstalled(root,record){
 // Runs in the external updater after Electron exits. A reused bounded buffer
 // avoids creating thousands of asynchronous streams for small bundled files.
 const buffer=Buffer.allocUnsafe(1024*1024)
 for(const row of record.files){
  const fd=diskFs.openSync(managedPath(root,row.path),'r')
  try{
   const stat=diskFs.fstatSync(fd);if(!stat.isFile()||stat.size!==row.bytes)throw Error('installed_file_verification_failed')
   const hash=createHash('sha256');let count,total=0
   while((count=diskFs.readSync(fd,buffer,0,buffer.length,null))>0){hash.update(buffer.subarray(0,count));total+=count}
   if(total!==row.bytes||hash.digest('hex')!==row.sha256)throw Error('installed_file_verification_failed')
  }finally{diskFs.closeSync(fd)}
 }
}
async function waitExit(pid,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){try{process.kill(pid,0)}catch(e){if(e.code==='ESRCH')return;throw e}await sleep(200)}throw Error('旧程序仍在运行，更新已停止')}
async function execute(file,args){
 // NSIS consumes /D as the literal final remainder, including spaces. libuv's
 // normal whole-argument quoting hides /D from NSIS. Quote argv[0] explicitly;
 // no shell is involved and every other argument is a fixed flag or UUID.
 const verbatim=process.platform==='win32'&&args.some(arg=>arg.startsWith('/D='))
 const child=spawn(file,args,{windowsHide:true,stdio:'ignore',windowsVerbatimArguments:verbatim,...(verbatim?{argv0:'"'+file+'"'}:{})});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});if(code!==0)throw Error('更新安装未完成（'+code+'）')
}
function launch(root,args){const child=spawn(path.join(root,'Agent Studio.exe'),args,{cwd:root,detached:true,windowsHide:true,stdio:'ignore'});return new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',()=>{child.unref();resolve(child.pid)})})}
async function stop(pid){if(!pid)return;if(process.platform==='win32')await execute(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(pid),'/T','/F']).catch(()=>{});else try{process.kill(pid)}catch{}await waitExit(pid,10000)}
async function performUpdate(job,{runInstaller=execute,startApp=launch,waitForExit=waitExit,stopApp=stop,healthTimeout=60000}={}){
 const root=path.resolve(job.root),directory=path.resolve(job.directory),expected=path.join(root,'temp','desktop-updates',job.id)
 if(!/^[a-f0-9-]{36}$/.test(job.id)||directory!==expected||!Number.isSafeInteger(job.parentPid)||job.parentPid<1||job.parentPid===process.pid||!Array.isArray(job.args)||job.args.some(a=>typeof a!=='string'||!/^--desktop-test-(home|server)=/.test(a))||job.args.length>2)throw Error('invalid_update_job')
 const manifest=verifyManifest(job.envelope,job.publicKey)
 const report=async data=>{await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({...data,helperPid:process.pid},null,2))}
 await waitForExit(job.parentPid)
 let old,names;const backup=path.join(directory,'backup')
 try{
  if((await fs.stat(job.installer)).size!==manifest.size||await hashFile(job.installer)!==manifest.sha256)throw Error('更新包校验失败')
  old=await inventory(root);await verifyInstalled(root,old)
  names=[...old.files.map(row=>row.path),'.studio-files.json','.studio-verify.cjs','.studio-install-complete']
  await fs.mkdir(backup,{recursive:false});await report({phase:'backup',version:manifest.version});await copy(root,backup,names)
 }catch(error){
  // No program file has been changed yet. Reopen the existing client instead
  // of leaving it closed after a failed verification or backup.
  const result={phase:'failed',version:old?.version,error:error.message,unchanged:true};await report(result)
  const pid=await startApp(root,[...job.args,'--desktop-update-failed='+job.id]);await report({...result,pid});return
 }
 let newPid
 try{
  await report({phase:'installing',version:manifest.version})
  // FileFunc GetOptions treats '-' as an option delimiter unless the UUID
  // value is quoted; preserve its hyphens as well as NSIS's literal /D tail.
  await runInstaller(job.installer,['/S','--desktop-update','--desktop-update-id="'+job.id+'"','/D='+root])
  const next=await inventory(root);if(next.version!==manifest.version)throw Error('安装后的版本与签名清单不一致');await verifyInstalled(root,next)
  const keep=new Set(next.files.map(row=>managedPath(root,row.path).toLowerCase()))
  for(const row of old.files)if(!keep.has(managedPath(root,row.path).toLowerCase()))await fs.unlink(managedPath(root,row.path))
  newPid=await startApp(root,[...job.args,'--desktop-updated='+job.id]);await report({phase:'starting',version:manifest.version,pid:newPid})
  const end=Date.now()+healthTimeout;let healthy=false
  while(Date.now()<end){try{const health=JSON.parse(await fs.readFile(path.join(directory,'health.json'),'utf8'));if(health.version===manifest.version&&health.id===job.id&&health.pid===newPid){healthy=true;break}}catch{}await sleep(200)}
  if(!healthy)throw Error('新版未确认启动，正在恢复旧版本')
  await report({phase:'succeeded',version:manifest.version,pid:newPid,previousVersion:old.version})
 }catch(error){
  await stopApp(newPid)
  // Remove only newly installed managed files; user caches and credentials are
  // never in the managed inventory and never enter this operation.
  let current;try{current=await inventory(root)}catch{}
  const original=new Set(old.files.map(row=>managedPath(root,row.path).toLowerCase()))
  for(const row of current?.files||[])if(!original.has(managedPath(root,row.path).toLowerCase()))await fs.unlink(managedPath(root,row.path)).catch(()=>{})
  await copy(backup,root,names);await verifyInstalled(root,old)
  await report({phase:'rolled_back',version:old.version,error:error.message})
  const pid=await startApp(root,[...job.args,'--desktop-update-failed='+job.id]);await report({phase:'rolled_back',version:old.version,pid,error:error.message});return
 }
 // Keep only transaction receipts after successful verification. The exact
 // backup directory was created by this helper under its verified job root.
 await fs.rm(backup,{recursive:true,force:true}).catch(()=>{})
}
async function cleanupCompletedUpdates(root,{now=Date.now(),isRunning=pid=>{try{process.kill(pid,0);return true}catch(e){return e.code!=='ESRCH'}}}={}){
 const base=path.join(root,'temp/desktop-updates');let rows;try{rows=await fs.readdir(base,{withFileTypes:true})}catch{return}
 for(const row of rows.slice(0,1000)){
  if(!row.isDirectory()||row.isSymbolicLink()||!/^[a-f0-9-]{36}$/.test(row.name))continue
  const directory=path.join(base,row.name)
  try{
   const resultPath=path.join(directory,'result.json'),result=JSON.parse(await fs.readFile(resultPath,'utf8')),job=JSON.parse(await fs.readFile(path.join(directory,'job.json'),'utf8'))
   if(result.phase!=='succeeded'||!Number.isSafeInteger(result.helperPid)||result.helperPid<1||isRunning(result.helperPid)||now-(await fs.stat(resultPath)).mtimeMs<60000||job.root!==root||job.directory!==directory||job.id!==row.name)continue
   const cache=path.join(root,'temp/desktop-update-cache'),installer=path.resolve(job.installer)
   if(path.dirname(installer)===cache&&/^download-[a-f0-9-]{36}\.exe$/.test(path.basename(installer)))await fs.unlink(installer).catch(()=>{})
   // Verified helper-owned transaction directory; never traverse a link or
   // remove user caches, login data, connection profiles or failed backups.
   await fs.rm(directory,{recursive:true,force:true})
  }catch{}
 }
}
module.exports={performUpdate,inventory,managedPath,verifyInstalled,waitExit,cleanupCompletedUpdates}
if(require.main===module){const jobFile=path.join(__dirname,'job.json');fs.readFile(jobFile,'utf8').then(JSON.parse).then(job=>performUpdate(job)).catch(async error=>{await fs.writeFile(path.join(__dirname,'result.json'),JSON.stringify({phase:'failed',error:error.message})).catch(()=>{});process.exitCode=1})}
