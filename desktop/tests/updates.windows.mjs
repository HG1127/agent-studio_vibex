// Exercise the unmodified old packaged updater with a real bundled connector.
// All installs, profiles and HTTP traffic belong to this disposable test directory.
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {_electron as electron,expect} from 'playwright/test'
import {publishDesktopUpdate} from '../../ops/publish-desktop-update.mjs'

const require=createRequire(import.meta.url),execFileAsync=promisify(execFile)
const root=process.cwd(),reuse=process.argv.find(a=>a.startsWith('--reuse='))?.slice(8)
const base=reuse||await fs.mkdtemp(path.join(root,'.tmp/update acceptance '))
assert.equal(path.dirname(base),path.join(root,'.tmp'))
assert.ok(path.basename(base).startsWith('update acceptance '))
const installation=path.join(base,'Agent Studio'),home=path.join(base,'account'),output=path.join(base,'feed-'+randomUUID())
const oldInstaller=path.resolve(process.argv[2]||''),newInstaller=path.resolve(process.argv[3]||'')
assert.ok(process.argv[2]&&process.argv[3],'Pass bootstrap and newer installer paths')
const fromVersion=process.argv.find(a=>a.startsWith('--from='))?.slice(7)||'0.1.0-preview.10'
const toVersion=process.argv.find(a=>a.startsWith('--to='))?.slice(5)||require('../build-info.json').version
assert.equal(require('../update-core.cjs').compare(toVersion,fromVersion),1,'target must be a newer version')
await fs.mkdir(installation,{recursive:true});await fs.mkdir(home,{recursive:true});await fs.mkdir(output,{recursive:true})
const privateKey=await fs.readFile(path.join(root,'.tmp/update-signing/private.pem'),'utf8')
const checks=[],sockets=new Set(),startedAt=Date.now()
const log=(stage,details={})=>console.log(JSON.stringify({stage,elapsedSeconds:Math.round((Date.now()-startedAt)/1000),...details}))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout '+label)),ms)})])}finally{clearTimeout(timer)}}
async function wait(fn,label,timeout=60000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(300)}throw Error('timeout '+label)}
const readVersion=async()=>JSON.parse(await fs.readFile(path.join(installation,'.studio-files.json'),'utf8')).version
async function sha256(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')}
async function json(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error}}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1')
  if(u.pathname.startsWith('/__pb/')){res.writeHead(u.pathname.endsWith('/api/health')?200:401,{'Content-Type':'application/json'});res.end(JSON.stringify({code:401,message:'Isolated update fixture: no employee session'}));return}
  const file=path.resolve(output,'.'+decodeURIComponent(u.pathname))
  if(!file.startsWith(output+path.sep))throw Error('outside_feed')
  const stat=await fs.stat(file);if(!stat.isFile())throw Error('not_file')
  res.writeHead(200,{'Content-Length':stat.size,'Cache-Control':'no-store'})
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res)
 }catch{res.writeHead(404);res.end()}
})
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin='http://127.0.0.1:'+server.address().port
function run(file,args,timeout=600000){return new Promise((resolve,reject)=>{
 const verbatim=process.platform==='win32'&&args.some(arg=>arg.startsWith('/D='))
 const child=spawn(file,args,{windowsHide:true,stdio:'ignore',windowsVerbatimArguments:verbatim,...(verbatim?{argv0:'"'+file+'"'}:{})})
 const timer=setTimeout(()=>{child.kill();reject(Error('process timeout '+path.basename(file)))},timeout)
 child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('process exit '+code))})
})}
let client,page,clientProcess,oldPid,launchedPid,transactionId,diagnosticLog='',beforeSettings,acceptance
function retainLog(buffer){diagnosticLog=(diagnosticLog+buffer.toString()).slice(-24000)}
async function clickMenu(label){await bounded(client.evaluate(({Menu},label)=>{
 const visit=items=>{for(const item of items||[]){if(item.label===label)return item;const found=visit(item.submenu?.items);if(found)return found}return null}
 const item=visit(Menu.getApplicationMenu()?.items);if(!item)throw Error('menu_missing:'+label);item.click()
},label),10000,'menu '+label)}
async function uiState(){if(!page||page.isClosed())return null;return bounded(page.evaluate(()=>({status:document.querySelector('#status')?.textContent,phase:document.querySelector('#update-card')?.dataset.phase,installDisabled:document.querySelector('#install')?.disabled})),3000,'update UI state')}
async function stopOwnedDesktop(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return
 // PID reuse must not turn test cleanup into an unrelated process termination.
 const quote=value=>"'"+value.replaceAll("'","''")+"'"
 const script='$p=Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+'"; if($p -and [string]::Equals($p.ExecutablePath,'+quote(path.join(installation,'Agent Studio.exe'))+',[System.StringComparison]::OrdinalIgnoreCase) -and $p.CommandLine.Contains('+quote('--desktop-test-home='+home)+')) { & "$env:SystemRoot\\System32\\taskkill.exe" /PID '+pid+' /T /F | Out-Null }'
 await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:20000,windowsHide:true}).catch(error=>log('CLEANUP_WARNING',{message:error.message.slice(0,200)}))
}
try{
 const bootstrapId=randomUUID(),bootstrapDir=path.join(installation,'temp/desktop-updates',bootstrapId)
 await fs.mkdir(bootstrapDir,{recursive:true})
 await fs.writeFile(path.join(bootstrapDir,'job.json'),JSON.stringify({id:bootstrapId,root:installation}))
 await fs.writeFile(path.join(bootstrapDir,'result.json'),JSON.stringify({phase:'starting',version:fromVersion}))
 if(!reuse)await run(oldInstaller,['/S','--desktop-update','--desktop-update-id="'+bootstrapId+'"','/D='+installation])
 assert.equal(await readVersion(),fromVersion);log('BOOTSTRAP_INSTALLED',{version:fromVersion,base})
 await fs.writeFile(path.join(home,'desktop.json'),JSON.stringify({server:origin,port:0,updateFeed:origin+'/stable/latest.json'}))
 await fs.writeFile(path.join(home,'employee-sentinel'),'EMPLOYEE_AND_DEVICE_SETTINGS_PRESERVED')
 await publishDesktopUpdate({installer:newInstaller,baseUrl:origin,output,key:privateKey,releaseVersion:toVersion,notes:'专用隔离更新验收，不发布到公司服务器'})
 client=await electron.launch({executablePath:path.join(installation,'Agent Studio.exe'),args:['--desktop-test-home='+home,'--desktop-updated='+bootstrapId],timeout:60000})
 clientProcess=client.process();clientProcess.stdout?.on('data',retainLog);clientProcess.stderr?.on('data',retainLog)
 oldPid=await bounded(client.evaluate(()=>process.pid),10000,'old process identity')
 await wait(()=>bounded(client.evaluate(({Menu})=>!!Menu.getApplicationMenu()),5000,'application menu'),'application menu')
 // Starting only the update window leaves the private service absent. Use the
 // same workbench menu action as an employee; do not mock or bypass its service.
 await clickMenu('打开工作台')
 const workbench=await wait(async()=>{for(const candidate of client.windows())if(/^http:\/\/127\.0\.0\.1:\d+/.test(candidate.url()))return candidate},'rendered local workbench')
 await expect(workbench.locator('#root')).not.toBeEmpty({timeout:45000})
 const localSettings=await wait(async()=>{const value=await json(path.join(home,'desktop.json'));return value?.port>0?value:null},'bundled connector port')
 assert.equal(localSettings.updateFeed,origin+'/stable/latest.json')
 beforeSettings=await fs.readFile(path.join(home,'desktop.json'),'utf8')
 checks.push('old unmodified package starts its actual bundled connector and renders the workbench')
 log('WORKBENCH_READY',{version:fromVersion,port:localSettings.port,oldPid})
 // Explicit test-only response in this disposable process. Authorization and
 // pending-operation gates in the shipped updater itself remain unchanged.
 await bounded(client.evaluate(({dialog})=>{dialog.showMessageBox=async(_parent,options)=>{if(options?.title==='重启更新')return {response:1};throw Error('unexpected_test_dialog:'+String(options?.title))}}),10000,'test confirmation fixture')
 await clickMenu('版本更新')
 page=await wait(async()=>{for(const candidate of client.windows())if(candidate.url().endsWith('/ui/updates.html'))return candidate},'update window')
 await expect(page.locator('#current')).toContainText(fromVersion,{timeout:15000})
 const manifestFile=path.join(output,'stable/latest.json'),original=await fs.readFile(manifestFile,'utf8'),tampered=JSON.parse(original)
 tampered.payload=Buffer.from('{"version":"999.0.0"}').toString('base64')
 await fs.writeFile(manifestFile,JSON.stringify(tampered));await page.locator('#check').click()
 await expect(page.locator('#status')).toContainText('签名验证失败',{timeout:30000});await expect(page.locator('#download')).toBeHidden()
 checks.push('packaged update UI refuses a tampered signed manifest without downloading');log('TAMPER_REJECTED')
 await fs.writeFile(manifestFile,original);await page.locator('#check').click()
 await expect(page.locator('#status')).toContainText('发现新版本 '+toVersion,{timeout:30000})
 await page.locator('#download').click();await expect(page.locator('#install')).toBeVisible({timeout:120000});await expect(page.locator('#install')).toBeEnabled({timeout:15000})
 await page.screenshot({path:path.join(base,'ready.png'),timeout:15000})
 checks.push('signed manifest, real package download, integrity verification and enabled restart action');log('DOWNLOAD_VERIFIED')
 if(process.argv.includes('--prepare-only')){
  acceptance={status:'PREPARATION_ONLY',checks,versionBefore:fromVersion,productionData:false};log('PREPARATION_PASS')
 }else{
  const transactionRoot=path.join(installation,'temp/desktop-updates'),priorJobs=new Set(await fs.readdir(transactionRoot)),beforeStatus=(await uiState()).status
  let clickError
  void page.locator('#install').click({noWaitAfter:true,timeout:15000}).catch(error=>{clickError=error})
  transactionId=await wait(async()=>{
   const names=await fs.readdir(transactionRoot),next=names.find(name=>!priorJobs.has(name));if(next)return next
   if(page.isClosed())throw Error('update_window_closed_before_transaction')
   if(clickError)throw clickError
   const state=await uiState();if(state&&!state.installDisabled&&state.status!==beforeStatus)throw Error('updater_rejected_install:'+state.status)
   return null
  },'transaction created',120000)
  log('TRANSACTION_CREATED',{transactionId})
  let phase
  const resultFile=path.join(transactionRoot,transactionId,'result.json')
  const result=await wait(async()=>{const value=await json(resultFile);if(value?.phase!==phase){phase=value?.phase;if(phase)log('UPDATE_PHASE',{phase})}return ['succeeded','rolled_back','failed'].includes(value?.phase)?value:null},'upgrade result',1200000)
  launchedPid=result.pid;assert.equal(result.phase,'succeeded',JSON.stringify(result));assert.equal(await readVersion(),toVersion)
  const record=await json(path.join(transactionRoot,transactionId,'job.json'));assert.equal(record.parentPid,oldPid)
  const health=await json(path.join(transactionRoot,transactionId,'health.json'));assert.equal(health.version,toVersion);assert.equal(health.pid,result.pid)
  assert.equal(await fs.readFile(path.join(home,'employee-sentinel'),'utf8'),'EMPLOYEE_AND_DEVICE_SETTINGS_PRESERVED')
  assert.equal(await fs.readFile(path.join(home,'desktop.json'),'utf8'),beforeSettings)
  checks.push('old updater exits, same-directory installer with spaces runs, new app renders and acknowledges health')
  checks.push('isolated account marker and entire desktop configuration remain byte-for-byte unchanged')
  acceptance={status:'PASS',checks,versionBefore:fromVersion,versionAfter:health.version,productionData:false,installation,health,transactionId,installerSha256:await sha256(newInstaller)}
  log('PACKAGED_UPDATE_ACCEPTANCE',{versionAfter:health.version,base})
 }
 await fs.writeFile(path.join(base,'acceptance.json'),JSON.stringify(acceptance,null,2))
}catch(error){
 process.exitCode=1;const state=await uiState().catch(()=>null)
 await fs.writeFile(path.join(base,'failure.json'),JSON.stringify({status:'FAIL',message:error.message,checks,state,transactionId,productionData:false},null,2))
 if(page&&!page.isClosed())await page.screenshot({path:path.join(base,'failure.png'),timeout:5000}).catch(()=>{})
 log('ACCEPTANCE_FAILED',{message:error.message,state,base})
}finally{
 await fs.writeFile(path.join(base,'electron.log'),diagnosticLog)
 if(client)await bounded(client.close(),10000,'test client close').catch(()=>{})
 await stopOwnedDesktop(oldPid);await stopOwnedDesktop(launchedPid)
 for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))
 log('UPDATE_TEST_DATA',{base})
}
process.exit(process.exitCode||0)
