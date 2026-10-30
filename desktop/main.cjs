'use strict'
const {app,BrowserWindow,Menu,Tray,nativeImage,dialog,shell,ipcMain,session} = require('electron')
const {fork} = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs/promises')
const {pathToFileURL} = require('node:url')
const {serverOrigin,ownUrl,webUrl,childEnvironment,readSettings,saveSettings,rendererPermission,workbenchSender,embeddedManagerUrl} = require('./policy.cjs')
const {randomUUID}=require('node:crypto')
const info = require('./build-info.json')
const option = name => process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1)
const testHome = option('--desktop-test-home')
if(testHome)app.setPath('userData',path.resolve(testHome))
const runtimeRoot=app.isPackaged?path.dirname(process.execPath):null
let storageError
if(runtimeRoot){
  try{
    const temp=path.join(runtimeRoot,'temp');require('node:fs').mkdirSync(temp,{recursive:true})
    for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=temp
    app.setPath('temp',temp);app.commandLine.appendSwitch('disk-cache-dir',path.join(runtimeRoot,'web-cache'))
  }catch{storageError=Error('程序目录不可写，请重新安装到自己可写的文件夹。')}
}
let main,settingsWindow,tray,child,services,settings,quitting=false,starting
const pairingRequests=new Map()
function reveal(window){if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus()}
const settingsUrl=pathToFileURL(path.join(__dirname,'ui','settings.html')).href
const webPreferences={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:agent-studio'}
const lock=app.requestSingleInstanceLock()
if(!lock)void app.whenReady().then(()=>dialog.showMessageBox({type:'info',title:'Agent Studio 已在运行',message:'已有工作台正在运行，请查看任务栏或托盘。',detail:'如果刚换了新版 EXE，请先从旧版菜单选择“退出并停止本机连接”，再打开新版。关闭工作台窗口会保留托盘进程。'})).finally(()=>app.quit())
else {
app.on('second-instance',()=>{void app.whenReady().then(()=>{if(main&&!main.isDestroyed())reveal(main);else showSettings()})})
app.on('window-all-closed',()=>{})
app.on('before-quit',event=>{if(!quitting){event.preventDefault();quitting=true;void stopServices().finally(()=>app.exit())}})
app.whenReady().then(async()=>{
  if(storageError)throw storageError
  settings=await readSettings(app.getPath('userData'))
  const ses=session.fromPartition('persist:agent-studio')
  const origins=()=>services?[services.origin,services.managerOrigin]:[]
  ses.setPermissionRequestHandler((contents,permission,callback,details)=>callback(rendererPermission(permission,details.requestingUrl||contents.getURL(),origins(),details.isMainFrame)))
  ses.setPermissionCheckHandler((_contents,permission,requestingOrigin,details)=>rendererPermission(permission,details.requestingUrl||requestingOrigin,origins(),details.isMainFrame))
  ses.on('will-download',(_event,item)=>{
    item.setSaveDialogOptions({defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))})
  })
  const image=nativeImage.createFromPath(path.join(__dirname,'ui','icon.png')).resize({width:20,height:20})
  tray=new Tray(image);tray.setToolTip('Agent Studio · 本机连接与工作台')
  tray.on('double-click',()=>void showStudio())
  const actions=[{label:'打开工作台',click:()=>void showStudio()},{label:'本机电脑与权限',click:()=>void showConnection()},{label:'服务器设置',click:showSettings},{type:'separator'},{label:'退出并停止本机连接',click:()=>app.quit()}]
  tray.setContextMenu(Menu.buildFromTemplate(actions))
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Agent Studio',submenu:actions},{label:'查看',submenu:[{role:'reload'},{role:'forceReload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'帮助',submenu:[{label:'版本信息',click:()=>dialog.showMessageBox({type:'info',title:'Agent Studio',message:'Agent Studio '+info.version,detail:'网页源码：'+info.sourceCommit+'\n服务器：'+settings.server+'\nWindows x64 预览版，尚未代码签名。\n退出会停止本机连接；账号、模型和团队数据由服务器管理。'})}]}]))
  const testServer=option('--desktop-test-server')
  if(testServer){if(!testHome||!/^http:\/\/127\.0\.0\.1:\d+$/.test(testServer))throw Error('isolated_test_configuration_required');settings={server:serverOrigin(testServer),port:0};await showStudio()}
  else if(settings.port){try{await showStudio()}catch{/* Keep settings available for a recoverable startup failure. */}}
  else showSettings()
}).catch(async error=>{
  const report=option('--desktop-smoke-report')
  if(testHome&&report){await fs.writeFile(path.resolve(report),JSON.stringify({started:false,error:String(error.message).slice(0,500)}));await stopServices();app.exit(1)}
  else {dialog.showErrorBox('Agent Studio 启动失败',String(error.message).slice(0,500));app.exit(1)}
})
}
function guardWindow(win,allowed) {
  win.webContents.on('will-navigate',(event,url)=>{if(!allowed(url)){event.preventDefault();void openExternal(url)}})
  win.webContents.setWindowOpenHandler(({url})=>{
    if(allowed(url)||services&&url.startsWith('blob:'+services.origin+'/'))return {action:'allow',overrideBrowserWindowOptions:{width:1100,height:800,webPreferences}}
    void openExternal(url);return {action:'deny'}
  })
  win.webContents.on('did-create-window',popup=>guardWindow(popup,allowed))
}
async function openExternal(url) {
  if(!webUrl(url))return
  if(services&&ownUrl(url,settings.server)){await showStudio();const destination=new URL(url);await main.loadURL(services.origin+destination.pathname+destination.search+destination.hash);return}
  const answer=await dialog.showMessageBox({type:'question',title:'打开外部网站',message:'使用系统浏览器打开此网站？',detail:new URL(url).origin,buttons:['取消','打开'],defaultId:0,cancelId:0})
  if(answer.response===1)await shell.openExternal(url)
}
function showSettings() {
  if(settingsWindow&&!settingsWindow.isDestroyed()){reveal(settingsWindow);return}
  settingsWindow=new BrowserWindow({width:640,height:610,minWidth:560,minHeight:540,title:'Agent Studio · 连接设置',autoHideMenuBar:true,webPreferences:{...webPreferences,preload:path.join(__dirname,'ui','preload.cjs')}})
  guardWindow(settingsWindow,url=>url===settingsUrl)
  const window=settingsWindow
  void window.loadURL(settingsUrl).then(()=>reveal(window))
  settingsWindow.on('closed',()=>{settingsWindow=null})
}
ipcMain.handle('desktop:settings',event=>{
  if(event.senderFrame?.url!==settingsUrl)throw Error('invalid_sender')
  return {...settings,...info,running:!!services}
})
ipcMain.handle('desktop:connect',async(event,input)=>{
  if(event.senderFrame?.url!==settingsUrl)throw Error('invalid_sender')
  if(typeof input?.server!=='string'||input.server.length>2000)throw Error('地址无效')
  const next=serverOrigin(input.server)
  if(next!==settings.server||input.resetPort===true){
    if(main&&!main.isDestroyed())main.destroy();main=null
    await stopServices()
    await session.fromPartition('persist:agent-studio').clearStorageData()
    settings={server:next,port:0}
  }
  await saveSettings(app.getPath('userData'),settings)
  await showStudio()
  settingsWindow?.close()
  return {ok:true}
})
function trustedWorkbench(event){if(!services||!workbenchSender(event,main?.webContents,services.origin))throw Error('invalid_workbench_sender')}
ipcMain.handle('desktop:open-connection',async event=>{trustedWorkbench(event);await showConnection();return {ok:true}})
ipcMain.handle('desktop:prepare-pairing',async(event,ticket)=>{
  trustedWorkbench(event)
  if(Buffer.byteLength(JSON.stringify(ticket) || '')>20000)throw Error('配对凭证过大')
  await computerRequest('prepare',{ticket})
  trustedWorkbench(event)
  return {ok:true}
})
ipcMain.handle('desktop:computer',async(event,action,input)=>{
  trustedWorkbench(event)
  if(typeof action!=='string'||action.length>40||Buffer.byteLength(JSON.stringify(input)||'')>30000)throw Error('invalid_computer_request')
  const value=await computerRequest(action,input)
  trustedWorkbench(event)
  return value
})
function computerRequest(action,input){
  if(!child?.connected)throw Error('本机连接组件已停止，请退出并重新打开软件。')
  const requestId=randomUUID()
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pairingRequests.delete(requestId);reject(Error('本机处理尚未确认，请核查当前状态，不要重复提交。'))},['folder','file','permissions.pick'].includes(action)?250000:35000)
    pairingRequests.set(requestId,{resolve,reject,timeout})
    child.send({type:'computer-request',requestId,action,input},error=>{if(error){clearTimeout(timeout);pairingRequests.delete(requestId);reject(Error('本机连接组件已停止'))}})
  })
}
async function startServices() {
  if(services)return services
  if(starting)return starting
  starting=(async()=>{
    const base=app.isPackaged?process.resourcesPath:path.join(__dirname,'..','.tmp','desktop-dev-resources-'+info.version)
    const root=path.join(base,'connector')
    const config={serverOrigin:settings.server,port:settings.port,webRoot:path.join(base,'web'),preferencesFile:path.join(app.getPath('userData'),'local-computer.json'),...(testHome?{profileHome:path.join(testHome,'isolated-connections')}: {})}
    child=fork(path.join(root,'app','desktop','services.mjs'),[JSON.stringify(config)],{execPath:path.join(root,'runtime','node.exe'),execArgv:['--use-system-ca'],env:childEnvironment(),silent:true,windowsHide:true})
    child.stdout?.resume();child.stderr?.resume()
    services=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('本机组件启动超时，请检查安装目录或服务器设置。')),20000)
      child.once('error',()=>{clearTimeout(timeout);reject(Error('无法启动本机运行时，请重新解压或安装完整程序。'))})
      child.on('message',m=>{
        if(m?.type==='computer-result'&&pairingRequests.has(m.requestId)){
          const request=pairingRequests.get(m.requestId);pairingRequests.delete(m.requestId);clearTimeout(request.timeout)
          if(m.ok)request.resolve(m.value);else request.reject(Error(m.error||'本机准备失败'))
        }
        if(m?.type==='ready'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.origin)&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.managerOrigin)&&m.managerUrl?.startsWith(m.managerOrigin+'/#')){clearTimeout(timeout);resolve(m)}
        if(m?.type==='error'){clearTimeout(timeout);reject(Error(m.message))}
        if(m?.type==='computer-attention'&&services)void showConnection({deviceId:m.deviceId,panel:m.panel}).then(()=>{if(m.panel==='confirmation')void reportConfirmationSmoke()})
      })
      child.once('exit',()=>{clearTimeout(timeout);reject(Error('本机组件已停止'));services=null})
    })
    settings.port=services.port;await saveSettings(app.getPath('userData'),settings)
    return services
  })().finally(()=>{starting=null})
  return starting
}
async function showStudio() {
  try {
    const local=await startServices()
    if(main&&!main.isDestroyed()){reveal(main);return}
    main=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'Agent Studio',backgroundColor:'#f8fafc',webPreferences:{...webPreferences,preload:path.join(__dirname,'ui','workbench-preload.cjs')}})
    guardWindow(main,url=>ownUrl(url,local.origin))
    main.on('close',event=>{if(!quitting){event.preventDefault();main.hide()}})
    await main.loadURL(local.origin)
    reveal(main)
    main.webContents.setZoomFactor(0.9)
    const report=option('--desktop-smoke-report')
    if(report&&testHome){
      // Disposable fixture only: the production server and real employee
      // accounts are excluded from this packaged-app test hook.
      let fixture
      try{fixture=JSON.parse(await fs.readFile(path.join(testHome,'smoke-auth.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
      if(fixture){
        if(!option('--desktop-test-server')||!/^http:\/\/127\.0\.0\.1:\d+$/.test(settings.server)||fixture.record?.email!=='desktop-smoke@example.test')throw Error('isolated_fixture_required')
        await main.webContents.executeJavaScript('sessionStorage.setItem("agent_studio_employee_auth",'+JSON.stringify(JSON.stringify(fixture))+')')
        await main.loadURL(local.origin+'/tool-hub')
      }
      const nativePairingAvailable=await main.webContents.executeJavaScript("window.studioDesktop?.version===2 && typeof window.studioDesktop.computer==='function' && typeof window.studioDesktop.openConnection==='function'")
      if(!nativePairingAvailable)throw Error('native_pairing_preload_missing')
      const opened=await main.webContents.executeJavaScript("window.studioDesktop.openConnection().then(value=>({ok:value.ok}),error=>({ok:false,error:String(error.message)}))")
      if(!opened.ok)throw Error('native_manager_open: '+opened.error)
      const nativeManagerOpened=opened.ok
      let embeddedManager=false
      for(let i=0;i<50;i++){embeddedManager=await main.webContents.executeJavaScript("!!document.querySelector('[data-desktop-computer-center]')");if(embeddedManager)break;await new Promise(r=>setTimeout(r,100))}
      const singleWindow=BrowserWindow.getAllWindows().length===1
      let nativeConnected=false,nativeStatusVisible=false
      if(fixture){
        for(let i=0;i<100;i++){
          nativeConnected=await main.webContents.executeJavaScript("window.studioDesktop.computer('state').then(s=>s.profiles.some(p=>p.state==='online'&&p.running)).catch(()=>false)")
          if(nativeConnected)break;await new Promise(r=>setTimeout(r,300))
        }
        for(let i=0;i<25;i++){
          nativeStatusVisible=await main.webContents.executeJavaScript("(()=>{const text=document.querySelector('[data-desktop-computer-center]')?.textContent||'';return text.includes('桌面内置验收电脑')&&text.includes('已在线')})()")
          if(nativeStatusVisible)break;await new Promise(r=>setTimeout(r,300))
        }
      }
      await fs.writeFile(path.resolve(report),JSON.stringify({started:true,sourceCommit:info.sourceCommit,version:info.version,origin:local.origin,managerOrigin:local.managerOrigin,title:main.webContents.getTitle(),nativePairingAvailable,nativeManagerOpened,embeddedManager,singleWindow,nativeConnected,nativeStatusVisible,tempDirectory:app.getPath('temp'),runtimeRoot:runtimeRoot||null,resourcesDirectory:process.resourcesPath,nodeIntegration:false,contextIsolation:true,sandbox:true},null,2))
    }
  } catch(error){await stopServices();if(testHome)throw error;await dialog.showMessageBox({type:'error',title:'工作台暂未打开',message:String(error.message).slice(0,500)});showSettings();throw error}
}
async function showConnection(intent={}) {
  await showStudio()
  main.webContents.send('desktop:connection-requested',intent)
  reveal(main)
}
async function reportConfirmationSmoke(){
  if(!testHome||!option('--desktop-smoke-report')||!/^http:\/\/127\.0\.0\.1:\d+$/.test(option('--desktop-test-server')||''))return
  let inMainWindow=false
  for(let i=0;i<30;i++){
    if(!main||main.isDestroyed())return
    inMainWindow=await main.webContents.executeJavaScript("document.querySelector('[data-desktop-computer-center]')?.textContent.includes('请确认本机授权变更')===true")
    if(inMainWindow)break;await new Promise(r=>setTimeout(r,200))
  }
  await fs.writeFile(path.join(testHome,'confirmation-smoke.json'),JSON.stringify({inMainWindow,singleWindow:BrowserWindow.getAllWindows().length===1}))
}
async function stopServices() {
  for(const request of pairingRequests.values()){clearTimeout(request.timeout);request.reject(Error('本机组件已停止'))}pairingRequests.clear()
  const running=child;child=null;services=null
  if(!running||running.exitCode!==null)return
  await new Promise(resolve=>{
    const timeout=setTimeout(()=>{running.kill();resolve()},10000)
    running.once('exit',()=>{clearTimeout(timeout);resolve()})
    try{running.send({type:'stop'})}catch{clearTimeout(timeout);running.kill();resolve()}
  })
}
