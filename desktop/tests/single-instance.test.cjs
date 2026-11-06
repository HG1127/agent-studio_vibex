'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events')
const {instanceData,instanceConflict}=require('../single-instance.cjs')
const version='0.1.0-preview.29'
const windowsIdentity=(changes={})=>instanceData({version,platform:'win32',executablePath:'D:\\Agent Studio\\Agent Studio.exe',applicationPath:'D:\\Agent Studio\\resources\\app.asar',...changes},{realpath:value=>value})

test('same Windows installation and version tolerate path casing and extended-path prefixes',()=>{
 const running=windowsIdentity()
 assert.equal(instanceConflict(running,windowsIdentity()),null)
 assert.equal(instanceConflict(running,windowsIdentity({executablePath:'d:/AGENT STUDIO/Agent Studio.exe',applicationPath:'\\\\?\\D:\\Agent Studio\\resources\\app.asar'})),null)
 const share={executablePath:'\\\\server\\share\\Agent Studio.exe',applicationPath:'\\\\server\\share\\resources\\app.asar'}
 assert.equal(instanceConflict(windowsIdentity(share),windowsIdentity({executablePath:'\\\\?\\UNC\\SERVER\\SHARE\\Agent Studio.exe',applicationPath:'\\\\?\\unc\\SERVER\\SHARE\\resources\\app.asar'})),null)
})

test('identity resolves only its own known paths so a directory alias is the same installation',()=>{
 const lookups=[],canonical=new Map([['D:\\alias\\Agent Studio.exe','E:\\actual\\Agent Studio.exe'],['D:\\alias\\resources\\app.asar','E:\\actual\\resources\\app.asar']])
 const identity=instanceData({version,platform:'win32',executablePath:'D:\\alias\\Agent Studio.exe',applicationPath:'D:\\alias\\resources\\app.asar'},{realpath:value=>{lookups.push(value);return canonical.get(value)}})
 assert.deepEqual(lookups,[...canonical.keys()])
 assert.equal(instanceConflict(identity,windowsIdentity({executablePath:'E:\\actual\\Agent Studio.exe',applicationPath:'E:\\actual\\resources\\app.asar'})),null)
})

test('real version conflicts describe the running and requested versions without assuming which is newer',()=>{
 for(const requested of ['0.1.0-preview.28','0.1.0-preview.30']){
  const notice=instanceConflict(windowsIdentity(),windowsIdentity({version:requested}))
  assert.ok(notice);assert.ok(notice.message.includes(version));assert.ok(notice.detail.includes(requested))
  assert.doesNotMatch(notice.message+'\n'+notice.detail,/新版|旧工作台/)
  assert.match(notice.detail,/退出并停止本机连接/)
 }
})

test('same-version launches from another installation explain both executable locations',()=>{
 const requested=windowsIdentity({executablePath:'E:\\Agent Studio\\Agent Studio.exe',applicationPath:'E:\\Agent Studio\\resources\\app.asar'})
 const notice=instanceConflict(windowsIdentity(),requested)
 assert.ok(notice.detail.includes('D:\\Agent Studio\\Agent Studio.exe'))
 assert.ok(notice.detail.includes('E:\\Agent Studio\\Agent Studio.exe'))
 assert.ok(instanceConflict(windowsIdentity(),windowsIdentity({applicationPath:'E:\\development\\desktop'})))
})

test('legacy, malformed and unrelated metadata never claim that an old version is running',()=>{
 const running=windowsIdentity()
 for(const data of [undefined,null,{},[],{version:'0.1.0-preview.28'},{...running,protocol:'other-app'},{...running,version:'old'},{...running,executablePath:'relative.exe'},{...running,applicationPath:'D:\\bad\npath'},{...running,executablePath:'D:\\'+'a'.repeat(32769)},{...running,platform:'unknown'}])assert.equal(instanceConflict(running,data),null)
})

function fixture(t,{primary=true,blocked=false}={}){
 const calls={locks:[],quit:0,exit:[],dialogs:[],fork:0,windows:0,reads:0,updates:0},pending=[]
 const app=new EventEmitter()
 Object.assign(app,{isPackaged:blocked,getAppPath:()=>path.resolve('isolated-instance-fixture/resources/app.asar'),getPath:()=>path.resolve('isolated-instance-fixture/profile'),setPath(){},commandLine:{appendSwitch(){}},requestSingleInstanceLock:data=>{calls.locks.push(data);return primary},quit:()=>{calls.quit++},exit:code=>calls.exit.push(code),whenReady:()=>new Promise(resolve=>pending.push(resolve))})
 class Window extends EventEmitter{
  constructor(){super();calls.windows++;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.minimized=false;this.shown=0;this.focused=0;this.restored=0}
  isDestroyed(){return false}isMinimized(){return this.minimized}restore(){this.restored++;this.minimized=false}show(){this.shown++}focus(){this.focused++}async loadURL(){}
 }
 const filename=path.join(__dirname,'../main.cjs'),context=vm.createContext({__dirname:path.dirname(filename),process:{argv:[],execPath:path.resolve('isolated-instance-fixture/Agent Studio.exe'),platform:process.platform,env:{}},console,setTimeout,clearTimeout,URL,Buffer})
 const localRequire=name=>{
  if(name==='electron')return {app,BrowserWindow:Window,ipcMain:{handle(){}},dialog:{showMessageBox:async options=>{calls.dialogs.push(options);return {response:0}}}}
  if(name==='node:child_process')return {fork:()=>{calls.fork++;throw Error('unexpected_service_start')}}
  if(name==='node:fs')return {mkdirSync(){}}
  if(name==='./build-info.json')return {version}
  if(name==='./single-instance.cjs')return {instanceData,instanceConflict}
  if(name==='./startup-health.cjs')return {blockedUpdate:()=>blocked}
  if(name==='./update-controller.cjs')return {installUpdates:()=>{calls.updates++;throw Error('unexpected_update_service_start')}}
  if(name==='./policy.cjs')return {readSettings:async()=>{calls.reads++;throw Error('unexpected_settings_read')}}
  return require(name)
 }
 context.require=localRequire
 vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename})
 t.after(()=>{app.removeAllListeners();pending.length=0})
 return {app,calls,pending,Window,setMain:window=>{context.fixtureWindow=window;vm.runInContext('main=fixtureWindow',context)},async activate(data){app.emit('second-instance',{},[],process.cwd(),data);const resolve=pending.pop();assert.ok(resolve);resolve();await new Promise(resolve=>setImmediate(resolve))},async ready(){const resolve=pending.shift();assert.ok(resolve);resolve();await new Promise(resolve=>setImmediate(resolve))}}
}

test('a secondary process exits immediately without a modal, readiness wait or duplicate services',t=>{
 const f=fixture(t,{primary:false})
 assert.equal(f.calls.locks.length,1);assert.equal(f.calls.locks[0].version,version)
 assert.equal(f.calls.quit,1);assert.equal(f.pending.length,0);assert.equal(f.app.listenerCount('second-instance'),0)
 assert.deepEqual({dialogs:f.calls.dialogs.length,fork:f.calls.fork,windows:f.calls.windows,reads:f.calls.reads,updates:f.calls.updates},{dialogs:0,fork:0,windows:0,reads:0,updates:0})
})

test('same-instance second launch restores and focuses the existing workbench without another window',async t=>{
 const f=fixture(t),window=new f.Window();window.minimized=true;f.setMain(window)
 await f.activate(f.calls.locks[0])
 assert.deepEqual({restored:window.restored,shown:window.shown,focused:window.focused},{restored:1,shown:1,focused:1})
 assert.equal(f.calls.windows,1);assert.equal(f.calls.dialogs.length,0);assert.equal(f.calls.fork,0);assert.equal(f.calls.locks.length,1)
})

test('legacy second-instance metadata still focuses the workbench silently',async t=>{
 const f=fixture(t),window=new f.Window();f.setMain(window)
 await f.activate(undefined);await f.activate({})
 assert.equal(window.focused,2);assert.equal(f.calls.dialogs.length,0);assert.equal(f.calls.windows,1)
})

test('a missing main window keeps the existing reusable settings-window fallback',async t=>{
 const f=fixture(t)
 await f.activate(f.calls.locks[0]);await f.activate(f.calls.locks[0])
 assert.equal(f.calls.windows,1);assert.equal(f.calls.dialogs.length,0);assert.equal(f.calls.fork,0)
})

test('the primary instance reveals the workbench and shows a notice only for a confirmed conflict',async t=>{
 const f=fixture(t),window=new f.Window();f.setMain(window)
 await f.activate({...f.calls.locks[0],version:'0.1.0-preview.30'})
 assert.equal(window.focused,1);assert.equal(f.calls.dialogs.length,1)
 assert.ok(f.calls.dialogs[0].message.includes(version));assert.ok(f.calls.dialogs[0].detail.includes('0.1.0-preview.30'))
 assert.equal(f.calls.fork,0);assert.equal(f.calls.windows,1)
})

test('the update startup barrier still prevents acquiring a lock or activating the running workbench',async t=>{
 const f=fixture(t,{blocked:true})
 assert.equal(f.calls.locks.length,0);assert.equal(f.app.listenerCount('second-instance'),0)
 await f.ready()
 assert.equal(f.calls.dialogs.length,1);assert.equal(f.calls.dialogs[0].title,'程序正在更新或恢复')
 assert.deepEqual(f.calls.exit,[0]);assert.equal(f.calls.fork,0);assert.equal(f.calls.windows,0);assert.equal(f.calls.reads,0)
})

test('the packaged application includes its single-instance helper',()=>{
 assert.ok(require('../package.json').build.files.includes('single-instance.cjs'))
})
