import fs from 'node:fs/promises'
import path from 'node:path'

// A real Electron GUI, deliberately launched by the packaged desktop's IPC
// connector. WinForms mocks cannot expose ELECTRON_RUN_AS_NODE propagation.
export async function createElectronApplicationFixture(base,electronDirectory){
 const directory=await fs.mkdtemp(path.join(base,'electron-app-'))
 for(const entry of await fs.readdir(electronDirectory,{withFileTypes:true})){
  if(entry.name==='resources')continue
  const source=path.join(electronDirectory,entry.name),target=path.join(directory,entry.name==='electron.exe'?'ApplicationElectronFixture.exe':entry.name)
  if(entry.isFile())await fs.link(source,target).catch(error=>{if(error.code==='EXDEV')return fs.copyFile(source,target);throw error})
  else if(entry.isDirectory())await fs.symlink(source,target,'junction')
 }
 const app=path.join(directory,'resources','app'),receipt=path.join(directory,'fixture-receipt.json')
 await fs.mkdir(app,{recursive:true});await fs.writeFile(path.join(directory,'LICENSE.electron.txt'),'Electron fixture marker')
 await fs.writeFile(path.join(app,'package.json'),JSON.stringify({name:'electron-launch-fixture',version:'1.0.0',main:'main.cjs'}))
 await fs.writeFile(path.join(app,'main.cjs'),`const {app,BrowserWindow}=require('electron'),fs=require('node:fs');let window;
 app.whenReady().then(()=>{window=new BrowserWindow({show:false,width:620,height:420,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});window.setTitle('Electron cold start fixture');window.loadURL('data:text/html,<title>Electron cold start fixture</title><p>Isolated application launch verification</p>');window.once('ready-to-show',()=>{window.show();fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({pid:process.pid,type:process.type,nodeMode:process.env.ELECTRON_RUN_AS_NODE||null,visible:window.isVisible()}))})});app.on('window-all-closed',()=>app.quit());`)
 return {exe:path.join(directory,'ApplicationElectronFixture.exe'),receipt,directory}
}
