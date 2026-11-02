// Full packaged app update in an isolated installation. No production server,
// real credentials, model provider or existing employee install is touched.
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {_electron as electron,expect} from 'playwright/test'
import {publishDesktopUpdate} from '../../ops/publish-desktop-update.mjs'
const require=createRequire(import.meta.url),{verifyManifest}=require('../update-core.cjs'),trust=require('../update-trust.json')
const root=process.cwd(),base=process.argv.find(a=>a.startsWith('--reuse='))?.slice(8)||await fs.mkdtemp(path.join(root,'.tmp/update acceptance ')),installation=path.join(base,'Agent Studio'),home=path.join(base,'account'),output=path.join(base,'feed')
assert.equal(path.dirname(base),path.join(root,'.tmp'));assert.ok(path.basename(base).startsWith('update acceptance '))
const oldInstaller=process.argv[2],newInstaller=process.argv[3];assert.ok(oldInstaller&&newInstaller,'Pass bootstrap and newer installer paths')
await fs.mkdir(installation,{recursive:true});await fs.mkdir(home,{recursive:true});await fs.mkdir(output,{recursive:true})
const privateKey=await fs.readFile(path.join(root,'.tmp/update-signing/private.pem'),'utf8'),checks=[],sockets=new Set()
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(output,u.pathname.slice(1));if(!file.startsWith(output+path.sep))throw Error();const stat=await fs.stat(file);res.setHeader('Content-Length',stat.size);createReadStream(file).pipe(res)}catch{res.writeHead(404);res.end()}})
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const run=(file,args)=>new Promise((resolve,reject)=>{const verbatim=process.platform==='win32'&&args.some(arg=>arg.startsWith('/D=')),child=spawn(file,args,{windowsHide:true,stdio:'ignore',windowsVerbatimArguments:verbatim,...(verbatim?{argv0:'"'+file+'"'}:{})});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('process exit '+code)))})
const wait=async(fn,label,attempts=2400)=>{for(let n=0;n<attempts;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,250))}throw Error('timeout '+label)}
const readVersion=async()=>JSON.parse(await fs.readFile(path.join(installation,'.studio-files.json'),'utf8')).version
const portProbe=http.createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const desktopPort=portProbe.address().port;await new Promise(r=>portProbe.close(r))
let client,launchedPid
async function open(){
 client=await electron.launch({executablePath:path.join(installation,'Agent Studio.exe'),args:['--desktop-test-home='+home],timeout:60000})
 client.on('window',page=>page.on('pageerror',error=>console.log('PAGE_ERROR '+error.message)))
 await expect.poll(()=>client.evaluate(({Menu})=>!!Menu.getApplicationMenu()?.items[0]?.submenu?.items.some(i=>i.label==='版本更新')).catch(()=>false),{timeout:20000}).toBe(true)
 await client.evaluate(({Menu,dialog})=>{dialog.showMessageBox=async()=>({response:1});const item=Menu.getApplicationMenu().items[0].submenu.items.find(i=>i.label==='版本更新');item.click()})
 const page=await wait(async()=>{for(const page of client.windows())if(await page.title()==='Agent Studio · 版本更新')return page},'update window')
 await expect(page.locator('#current')).toContainText('preview.10');return page
}
try{
 // /S + the installer's private update mode never opens the directory picker,
 // creates a desktop shortcut, or starts the client on behalf of this harness.
 const bootstrapId=randomUUID();await fs.mkdir(path.join(installation,'temp/desktop-updates',bootstrapId),{recursive:true});await fs.writeFile(path.join(installation,'temp/desktop-updates',bootstrapId,'job.json'),'{}')
 if(!process.argv.some(a=>a.startsWith('--reuse=')))await run(path.resolve(oldInstaller),['/S','--desktop-update','--desktop-update-id="'+bootstrapId+'"','/D='+installation]);assert.equal(await readVersion(),'0.1.0-preview.10');console.log('UPDATE_BOOTSTRAP_INSTALLED')
 await fs.writeFile(path.join(home,'desktop.json'),JSON.stringify({server:origin,port:desktopPort,updateFeed:origin+'/stable/latest.json'}));await fs.writeFile(path.join(home,'employee-sentinel'),'EMPLOYEE_AND_DEVICE_SETTINGS_PRESERVED')
 await publishDesktopUpdate({installer:newInstaller,baseUrl:origin,output,key:privateKey,releaseVersion:'0.1.0-preview.11',notes:'专用测试新版，不发布到公司服务器'})
 const page=await open(),manifestFile=path.join(output,'stable/latest.json'),original=await fs.readFile(manifestFile,'utf8'),tampered=JSON.parse(original)
 tampered.payload=Buffer.from('{"version":"999.0.0"}').toString('base64');await fs.writeFile(manifestFile,JSON.stringify(tampered))
 await page.locator('#check').click();await expect(page.locator('#status')).toContainText('签名验证失败',{timeout:30000});await expect(page.locator('#download')).toBeHidden();checks.push('packaged update UI refuses a tampered manifest without downloading')
 await fs.writeFile(manifestFile,original);await page.locator('#check').click();await expect(page.locator('#status')).toContainText('发现新版本 0.1.0-preview.11',{timeout:30000})
 await page.locator('#download').click();await expect(page.locator('#install')).toBeVisible({timeout:120000});await page.screenshot({path:path.join(base,'ready.png')})
 checks.push('signed manifest, real package download, UI progress and install readiness')
 if(process.argv.includes('--prepare-only')){console.log('PACKAGED_UPDATE_UI_PREPARATION_PASS '+base)}else{
 const priorJobs=await fs.readdir(path.join(installation,'temp/desktop-updates'))
 const oldPid=await client.evaluate(()=>process.pid)
 // The app intentionally exits during the click. Observe the private helper
 // transaction instead of waiting for a response on a destroyed CDP channel.
 void page.locator('#install').click({noWaitAfter:true,timeout:15000}).catch(()=>{})
 const transactionRoot=path.join(installation,'temp/desktop-updates'),job=await wait(async()=>{const names=await fs.readdir(transactionRoot);return names.find(name=>!priorJobs.includes(name))},'transaction created')
 let phase;const startedAt=Date.now()
 const resultFile=path.join(transactionRoot,job,'result.json'),result=await wait(async()=>{try{const result=JSON.parse(await fs.readFile(resultFile,'utf8'));if(result.phase!==phase){phase=result.phase;console.log('UPDATE_PHASE '+phase+' '+Math.round((Date.now()-startedAt)/1000)+'s')}return ['succeeded','rolled_back','failed'].includes(result.phase)?result:null}catch{}},'upgrade result',4800)
 launchedPid=result.pid;assert.equal(result.phase,'succeeded',JSON.stringify(result));assert.equal(await readVersion(),'0.1.0-preview.11')
 const jobRecord=JSON.parse(await fs.readFile(path.join(transactionRoot,job,'job.json'),'utf8'));assert.equal(jobRecord.parentPid,oldPid)
 client.process().kill();client=null
 const health=JSON.parse(await fs.readFile(path.join(transactionRoot,job,'health.json'),'utf8'));assert.equal(health.version,'0.1.0-preview.11');assert.equal(health.pid,result.pid)
 assert.equal(await fs.readFile(path.join(home,'employee-sentinel'),'utf8'),'EMPLOYEE_AND_DEVICE_SETTINGS_PRESERVED')
 assert.equal(JSON.parse(await fs.readFile(path.join(home,'desktop.json'),'utf8')).updateFeed,origin+'/stable/latest.json')
 checks.push('old Electron exits, real silent installer replaces same directory with spaces, new Electron confirms health, account configuration unchanged')
 await fs.writeFile(path.join(base,'acceptance.json'),JSON.stringify({status:'PASS',checks,versionBefore:'0.1.0-preview.10',versionAfter:health.version,productionData:false,installation,health},null,2));console.log('PACKAGED_UPDATE_ACCEPTANCE '+base)
 }
}catch(error){console.error(error);process.exitCode=1}finally{
 if(client){client.process().kill();await Promise.race([client.close().catch(()=>{}),new Promise(r=>setTimeout(r,2000))])}
 if(launchedPid)await run(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(launchedPid),'/T','/F']).catch(()=>{})
 for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));console.log('UPDATE_TEST_DATA '+base)
}
process.exit(process.exitCode||0)
