import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {verifyChromeInstalled,changeGuidedBrowser} from '../local-executor/browser-settings.mjs'
import {readGuidedProfile,chooseGuidedProfile} from '../local-executor/profiles.mjs'
import {acquireConnectionLock} from '../local-executor/workspace.mjs'
import {localConnectorLocation} from '../src/lib/localConnectorLocation.ts'

const id='h'.repeat(24)
const ticket=()=>({format:'agent-studio-connect-v1',server:'http://127.0.0.1:8188/__pb',name:'Chrome 连接测试',mode:'both',origins:['https://example.com'],pairing:{id,code:'c'.repeat(48),expiresAt:Date.now()+300000}})
const fakeRuntime=async()=>({tools:[{name:'files.list'},{name:'browser.browser_navigate'}],close:async()=>{}})
async function temp(){const base=path.join(process.cwd(),'.tmp','chrome-experience');await fs.mkdir(base,{recursive:true});return fs.mkdtemp(path.join(base,'case-'))}
async function saved(home){return prepareGuidedConnection(ticket(),{home,confirm:async()=>true,checkBrowser:async()=>{},runtimeFactory:fakeRuntime,pair:async()=>({device_id:id,token:'t'.repeat(64)})})}

test('default config is Chrome on Windows too; missing installation never consumes binding',async()=>{
 const home=await temp();let paired=0
 try{
  await assert.rejects(()=>prepareGuidedConnection(ticket(),{home,confirm:async()=>true,checkBrowser:async()=>{throw Error('chrome_not_installed')},runtimeFactory:fakeRuntime,pair:async()=>{paired++}}),/chrome_not_installed/)
  assert.equal(paired,0);assert.deepEqual(await fs.readdir(home),[])
  const result=await saved(home),config=JSON.parse(await fs.readFile(result.configFile,'utf8'))
  assert.equal(config.browser.channel,'chrome');assert.equal(config.browser.executablePath,undefined)
  assert.equal(config.desktop.enabled,false)
 }finally{await fs.rm(home,{recursive:true,force:true})}
})

test('Chrome installation detection never launches, installs or substitutes Edge',async()=>{
 const checked=[]
 const result=await verifyChromeInstalled({platform:'win32',env:{PROGRAMFILES:'C:\\Apps',LOCALAPPDATA:'C:\\Local'},isFile:async p=>{checked.push(p);return p==='C:\\Apps\\Google\\Chrome\\Application\\chrome.exe'}})
 assert.equal(result,'C:\\Apps\\Google\\Chrome\\Application\\chrome.exe')
 assert.ok(checked.every(p=>!p.toLowerCase().includes('edge')))
 await assert.rejects(()=>verifyChromeInstalled({platform:'win32',env:{},isFile:async()=>false}),/chrome_not_installed/)
})

test('switching an existing profile to Chrome is explicit and preserves device credentials and scope',async()=>{
 const home=await temp()
 try{
  const installed=await saved(home),file=installed.configFile
  const original=JSON.parse(await fs.readFile(file,'utf8'));original.browser.channel='msedge'
  await fs.writeFile(file,JSON.stringify(original))
  const credentials=path.join(path.dirname(file),'.local-device-credentials.json'),secretBefore=await fs.readFile(credentials,'utf8')
  assert.equal((await readGuidedProfile(id,{home})).browserChannel,'msedge')
  assert.equal((await changeGuidedBrowser(id,{home,confirm:async()=>false,checkBrowser:async()=>{throw Error('should_not_check')}})).cancelled,true)
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).browser.channel,'msedge')
  const lock=await acquireConnectionLock(file)
  await assert.rejects(()=>changeGuidedBrowser(id,{home,confirm:async()=>true,checkBrowser:async()=>{}}),/running_or_locked/)
  await lock()
  const result=await changeGuidedBrowser(id,{home,confirm:async s=>{assert.equal(s.from,'msedge');assert.deepEqual(s.origins,original.browser.allowedOrigins);return true},checkBrowser:async()=>{}})
  assert.equal(result.changed,true)
  const after=JSON.parse(await fs.readFile(file,'utf8'))
  assert.equal(after.browser.channel,'chrome')
  assert.deepEqual({...after,browser:{...after.browser,channel:'msedge'}},original)
  assert.equal(await fs.readFile(credentials,'utf8'),secretBefore)
  const answers=['1','3'];assert.equal((await chooseGuidedProfile({question:async()=>answers.shift()},{home,write:()=>{}})).kind,'chrome')
 }finally{await fs.rm(home,{recursive:true,force:true})}
})

test('Chrome migration fails closed for unavailable Chrome, disabled browser and changed local config',async()=>{
 const home=await temp()
 try{
  const installed=await saved(home),file=installed.configFile
  const config=JSON.parse(await fs.readFile(file,'utf8'));config.browser.channel='msedge'
  await fs.writeFile(file,JSON.stringify(config))
  await assert.rejects(()=>changeGuidedBrowser(id,{home,confirm:async()=>true,checkBrowser:async()=>{throw Error('chrome_not_installed')}}),/chrome_not_installed/)
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),config)
  await assert.rejects(()=>changeGuidedBrowser(id,{home,confirm:async()=>{await fs.writeFile(file,JSON.stringify({...config,deviceName:'other-local-edit'}));return true},checkBrowser:async()=>{}}),/local_config_changed/)
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).deviceName,'other-local-edit')
  await fs.writeFile(file,JSON.stringify({...config,browser:{...config.browser,enabled:false}}))
  await assert.rejects(()=>changeGuidedBrowser(id,{home,confirm:async()=>true,checkBrowser:async()=>{}}),/browser_not_enabled/)
 }finally{await fs.rm(home,{recursive:true,force:true})}
})

test('exact worktree path is only displayed in loopback development and clipboard quoting is literal',()=>{
 const directory="D:\\Preview's directory\\local-executor"
 const info=localConnectorLocation(directory,'127.0.0.1',true)
 assert.equal(info.directory,directory);assert.equal(info.command,"& 'D:\\Preview''s directory\\local-executor\\start-connect.cmd'")
 for(const [host,dev] of [['company.example',true],['127.0.0.1',false],['localhost',false]])assert.equal(localConnectorLocation(directory,host,dev),null)
 assert.equal(localConnectorLocation('','localhost',true),null)
 assert.equal(localConnectorLocation('D:\\bad\ncommand','localhost',true),null)
})

test('both launchers are present in the same checkout and the device page has no raw parameter or pairing editor',async()=>{
 for(const name of ['connect-computer.cmd','local-executor/start-connect.cmd','local-executor/connect.mjs','local-executor/setup.mjs','local-executor/profiles.mjs'])await fs.access(name)
 const source=await fs.readFile('src/components/tool-hub/LocalDevicesPanel.tsx','utf8')
 for(const raw of ['操作参数（JSON）','生成配对码','显示一次性配对码','开发者工具调试','setPairing','setArgs'])assert.equal(source.includes(raw),false,raw)
 const launcher=await fs.readFile('connect-computer.cmd','utf8')
 assert.match(launcher,/call "%~dp0local-executor\\start-connect.cmd"/)
 assert.doesNotMatch(launcher,/ExecutionPolicy|Invoke-WebRequest|curl|RunAs|schtasks/i)
})
