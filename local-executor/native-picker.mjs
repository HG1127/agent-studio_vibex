import {execFile} from 'node:child_process'

const dialogs={
 folder:{create:"$d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='选择允许 Agent Studio 访问的工作文件夹，不要选择整盘'; $d.ShowNewFolderButton=$true;",result:'SelectedPath',error:'folder_picker_unavailable'},
 file:{create:"$d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='选择只允许 Agent Studio 读取的一个文件'; $d.Filter='所有文件 (*.*)|*.*'; $d.Multiselect=$false; $d.CheckFileExists=$true;",result:'FileName',error:'file_picker_unavailable'},
 connection:{create:"$d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='选择刚下载的 Agent Studio 连接文件'; $d.Filter='Agent Studio 连接文件 (*.json)|*.json'; $d.Multiselect=$false; $d.CheckFileExists=$true;",result:'FileName',error:'connection_picker_unavailable'}
}
/** Only fixed application-owned scripts. No selected path, ticket or remote
 * value is interpolated into PowerShell. The temporary owner belongs only to
 * this chooser, so a browser cannot cover the waiting selection dialog. */
export function nativePickerScript(kind){
 const d=dialogs[kind];if(!d)throw Error('invalid_picker_kind')
 return "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; $owner=New-Object System.Windows.Forms.Form; $owner.Text='Agent Studio · 本机选择'; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.StartPosition='CenterScreen'; $owner.Size=New-Object System.Drawing.Size(1,1); $owner.Opacity=0; $d=$null; try{[void]$owner.Show(); [void]$owner.Activate(); "+d.create+" $result=$d.ShowDialog($owner); if($result -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($d."+d.result+")}}finally{if($d){$d.Dispose()}; $owner.Close(); $owner.Dispose()}"
}
const aborted=()=>Object.assign(Error('picker_cancelled'),{name:'AbortError'})
export function pickNative(kind,{platform=process.platform,execute=execFile,signal,onStarted=()=>{}}={}){
 const d=dialogs[kind];if(!d)return Promise.reject(Error('invalid_picker_kind'))
 if(platform!=='win32')return Promise.reject(Error(d.error))
 if(signal?.aborted)return Promise.reject(aborted())
 return new Promise((resolve,reject)=>{
  let child,returned=false,closed=false,callbackDone=false,finished=false,failure,output=''
  const finish=()=>{
   if(finished||!callbackDone||child?.once&&!closed)return
   finished=true
   if(signal?.aborted)return reject(aborted())
   if(failure)return reject(Error(failure.killed?'picker_timeout':d.error))
   resolve(String(output).trim())
  }
  try{
   child=execute('powershell.exe',['-NoLogo','-NoProfile','-STA','-Command',nativePickerScript(kind)],{windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8192,signal},(error,stdout)=>{
    failure=error;output=stdout;callbackDone=true
    if(returned)finish()
   })
   returned=true
   if(child?.once){
    child.once('spawn',()=>{try{onStarted()}catch{}})
    child.once('close',()=>{closed=true;finish()})
   }else finish()
  }catch(error){finished=true;reject(signal?.aborted?aborted():Error(d.error))}
 })
}
