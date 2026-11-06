'use strict'
const {createUpdater,safeUrl}=require('./update-core.cjs'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process')
const trust=require('./update-trust.json')
const {createCompanyFetch}=require('./company-https.cjs')
function updateWindowSize(area={}){const valid=(value,fallback)=>Number.isFinite(value)&&value>0?Math.floor(value):fallback,w=valid(area.width,1100),h=valid(area.height,900),width=Math.min(1000,Math.max(Math.min(320,w),w-48)),height=Math.min(780,Math.max(Math.min(420,h),h-48));return {width,height,minWidth:Math.min(780,width),minHeight:Math.min(620,height)}}
function installUpdates({app,BrowserWindow,Menu,ipcMain,net,dialog,info,runtimeRoot,testHome,getSettings,saveSettings,stopServices,getComputerState,hasPendingCalls,onQuit,getWorkArea=()=>({width:1100,height:900})}){
 let window,applying=false
 const ui=require('node:url').pathToFileURL(path.join(__dirname,'ui/updates.html')).href
 const core=createUpdater({currentVersion:info.version,publicKey:trust.publicKey,history:require('./release-history.json'),directory:path.join(runtimeRoot||app.getPath('temp'),'temp/desktop-update-cache'),feed:()=>getSettings().updateFeed||new URL('/desktop-updates/stable/latest.json',getSettings().server).href,fetcher:createCompanyFetch({fallback:(url,options)=>net.fetch(url,options)}),onChange:state=>{if(window&&!window.isDestroyed())window.webContents.send('desktop:update-state',state)}})
 function guard(event){if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame?.url!==ui)throw Error('invalid_update_sender')}
 async function open(){
  if(window&&!window.isDestroyed()){window.show();window.focus();return}
  window=new BrowserWindow({...updateWindowSize(getWorkArea()),backgroundColor:'#ffffff',title:'Agent Studio · 版本更新',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,preload:path.join(__dirname,'ui/update-preload.cjs')}})
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==ui)event.preventDefault()});window.on('closed',()=>{window=null});await window.loadURL(ui)
 }
 ipcMain.handle('desktop:update',async(event,action,input)=>{
  guard(event);if(applying)throw Error('正在重启更新')
  if(action==='state')return {...core.state(),feed:getSettings().updateFeed||new URL('/desktop-updates/stable/latest.json',getSettings().server).href}
  if(action==='feed'){
   if(!['idle','current','available','error'].includes(core.state().phase))throw Error('请等待当前更新操作结束')
   if(typeof input!=='string'||input.length>2000)throw Error('更新地址无效');const value=safeUrl(input.trim());await saveSettings({...getSettings(),updateFeed:value});return core.check()
  }
  if(action==='check')return core.check()
  if(action==='download')return core.download()
  if(action==='install'){
   applying=true
   try{
   if(!runtimeRoot||!app.isPackaged)throw Error('请在安装后的桌面版中执行更新')
   await require('./update-helper.cjs').inventory(runtimeRoot)
   const ready=await core.ready();guard(event)
   if(hasPendingCalls())throw Error('本机请求尚未完成，请完成或取消后再更新')
   const state=await getComputerState().catch(()=>null)
   if(state&&(state.busy||state.confirmations?.length))throw Error('请先完成或取消本机操作和授权确认，再更新')
   const answer=await dialog.showMessageBox(window,{type:'question',title:'重启更新',message:'安装 '+ready.manifest.version+' 并重启软件？',detail:'请先保存工作并结束运行中的 Agent 任务。软件将停止本机连接并关闭窗口，备份和更新可能需要几分钟，请勿重复启动。完成后自动打开，保留原账号、安装目录和授权；失败会恢复旧版。',buttons:['取消','重启更新'],defaultId:0,cancelId:0})
   if(answer.response!==1)return core.state()
   guard(event)
    const id=randomUUID(),directory=path.join(runtimeRoot,'temp/desktop-updates',id);await fs.mkdir(directory,{recursive:true})
    for(const name of ['update-helper.cjs','update-core.cjs'])await fs.writeFile(path.join(directory,name),await fs.readFile(path.join(__dirname,name)))
    for(const name of ['update-guard.exe','update-guard.json'])await fs.copyFile(path.join(process.resourcesPath,'update-guard',name),path.join(directory,name))
    await fs.copyFile(path.join(process.resourcesPath,'connector/runtime/node.exe'),path.join(directory,'node.exe'))
    const args=testHome?process.argv.filter(a=>/^--desktop-test-(home|server)=/.test(a)):[]
    await fs.writeFile(path.join(directory,'job.json'),JSON.stringify({root:runtimeRoot,directory,id,parentPid:process.pid,args,installer:ready.installer,envelope:ready.envelope,publicKey:trust.publicKey}),{mode:0o600})
    await stopServices()
    const child=spawn(path.join(directory,'node.exe'),[path.join(directory,'update-helper.cjs')],{cwd:directory,detached:true,windowsHide:true,stdio:'ignore',env:require('./policy.cjs').childEnvironment()})
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve)});child.unref();onQuit();app.exit(0)
   }finally{applying=false}
  }
  throw Error('invalid_update_action')
 })
 // Metadata only: downloading and installing always require an explicit click.
 const timer=setInterval(()=>{if(!applying&&!['ready','checking','downloading'].includes(core.state().phase))void core.check().catch(()=>{})},6*60*60*1000);timer.unref()
 if(!testHome)setTimeout(()=>void core.check().catch(()=>{}),20000).unref()
 return {open}
}
module.exports={installUpdates,updateWindowSize}
