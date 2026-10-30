'use strict'
const {app,BrowserWindow,Menu,Tray,nativeImage,dialog,shell,ipcMain,session} = require('electron')
const {fork} = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs/promises')
const {pathToFileURL} = require('node:url')
const {serverOrigin,ownUrl,webUrl,childEnvironment,readSettings,saveSettings,rendererPermission} = require('./policy.cjs')
const info = require('./build-info.json')
const option = name => process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1)
const testHome = option('--desktop-test-home')
if(testHome)app.setPath('userData',path.resolve(testHome))
let main,settingsWindow,connectionWindow,tray,child,services,settings,quitting=false,starting
const settingsUrl=pathToFileURL(path.join(__dirname,'ui','settings.html')).href
const webPreferences={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:agent-studio'}
const lock=app.requestSingleInstanceLock()
if(!lock)app.quit()
else {
app.on('second-instance',()=>{if(main){main.show();main.focus()}else showSettings()})
app.on('window-all-closed',()=>{})
app.on('before-quit',event=>{if(!quitting){event.preventDefault();quitting=true;void stopServices().finally(()=>app.exit())}})
app.whenReady().then(async()=>{
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
  else showSettings()
}).catch(error=>{dialog.showErrorBox('Agent Studio 启动失败',String(error.message).slice(0,500));app.exit(1)})
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
  if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return}
  settingsWindow=new BrowserWindow({width:640,height:610,minWidth:560,minHeight:540,title:'Agent Studio · 连接设置',autoHideMenuBar:true,webPreferences:{...webPreferences,preload:path.join(__dirname,'ui','preload.cjs')}})
  guardWindow(settingsWindow,url=>url===settingsUrl)
  const window=settingsWindow
  void window.loadURL(settingsUrl).then(()=>{if(!window.isDestroyed()){window.show();window.focus()}})
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
    if(connectionWindow&&!connectionWindow.isDestroyed())connectionWindow.destroy();connectionWindow=null
    await stopServices()
    await session.fromPartition('persist:agent-studio').clearStorageData()
    settings={server:next,port:0}
  }
  await saveSettings(app.getPath('userData'),settings)
  await showStudio()
  settingsWindow?.close()
  return {ok:true}
})
async function startServices() {
  if(services)return services
  if(starting)return starting
  starting=(async()=>{
    const base=app.isPackaged?process.resourcesPath:path.join(__dirname,'..','.tmp','desktop-dev-resources')
    const root=path.join(base,'connector')
    const config={serverOrigin:settings.server,port:settings.port,webRoot:path.join(base,'web'),...(testHome?{profileHome:path.join(testHome,'isolated-connections')}: {})}
    child=fork(path.join(root,'app','desktop','services.mjs'),[JSON.stringify(config)],{execPath:path.join(root,'runtime','node.exe'),execArgv:['--use-system-ca'],env:childEnvironment(),silent:true,windowsHide:true})
    child.stdout?.resume();child.stderr?.resume()
    services=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('本机组件启动超时，请检查安装目录或服务器设置。')),20000)
      child.once('error',()=>{clearTimeout(timeout);reject(Error('无法启动本机运行时，请重新解压或安装完整程序。'))})
      child.on('message',m=>{
        if(m?.type==='ready'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.origin)&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.managerOrigin)&&m.managerUrl?.startsWith(m.managerOrigin+'/#')){clearTimeout(timeout);resolve(m)}
        if(m?.type==='error'){clearTimeout(timeout);reject(Error(m.message))}
        if(m?.type==='permissions'&&services&&ownUrl(m.url,services.managerOrigin))void showConnection(m.url)
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
    if(main&&!main.isDestroyed()){main.show();main.focus();return}
    main=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'Agent Studio',backgroundColor:'#f8fafc',webPreferences})
    guardWindow(main,url=>ownUrl(url,local.origin))
    main.on('close',event=>{if(!quitting){event.preventDefault();main.hide()}})
    await main.loadURL(local.origin)
    main.show();main.focus()
    main.webContents.setZoomFactor(0.9)
    const report=option('--desktop-smoke-report')
    if(report&&testHome)await fs.writeFile(path.resolve(report),JSON.stringify({started:true,sourceCommit:info.sourceCommit,version:info.version,origin:local.origin,managerOrigin:local.managerOrigin,title:main.webContents.getTitle(),nodeIntegration:false,contextIsolation:true,sandbox:true},null,2))
  } catch(error){await stopServices();await dialog.showMessageBox({type:'error',title:'工作台暂未打开',message:String(error.message).slice(0,500)});showSettings();throw error}
}
async function showConnection(url) {
  const local=await startServices()
  if(connectionWindow&&!connectionWindow.isDestroyed()){if(url)await connectionWindow.loadURL(url);connectionWindow.show();connectionWindow.focus();return}
  connectionWindow=new BrowserWindow({width:1120,height:850,minWidth:780,minHeight:600,title:'Agent Studio · 本机电脑与权限',webPreferences})
  guardWindow(connectionWindow,value=>ownUrl(value,local.managerOrigin))
  connectionWindow.on('closed',()=>{connectionWindow=null})
  await connectionWindow.loadURL(url||local.managerUrl)
  connectionWindow.show();connectionWindow.focus()
}
async function stopServices() {
  const running=child;child=null;services=null
  if(!running||running.exitCode!==null)return
  await new Promise(resolve=>{
    const timeout=setTimeout(()=>{running.kill();resolve()},10000)
    running.once('exit',()=>{clearTimeout(timeout);resolve()})
    try{running.send({type:'stop'})}catch{clearTimeout(timeout);running.kill();resolve()}
  })
}
