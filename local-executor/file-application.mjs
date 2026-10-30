import path from 'node:path'
import {execFile} from 'node:child_process'

export const OPEN_EXTENSIONS=new Set(['.txt','.md','.csv','.tsv','.json','.log','.pdf','.png','.jpg','.jpeg','.gif','.bmp','.webp','.docx','.xlsx','.pptx','.odt','.ods','.odp'])
const textExtensions=new Set(['.txt','.md','.csv','.tsv','.json','.log'])
export const FILE_APPLICATION_ERRORS={
 file_application_no_association:'此文件类型没有可用的默认软件。请先安装或配置相应软件，也可使用“在电脑中定位”手动打开。',
 file_application_access_denied:'Windows 拒绝打开或定位这个文件。请检查该文件和软件的访问权限。',
 file_application_not_found:'Windows 未找到文件或对应的打开软件，请刷新目录并核查默认软件。',
 file_application_cancelled:'Windows 已取消本次打开请求。',
 file_application_timeout:'等待 Windows 打开或定位的回执超时。请先查看任务栏和实际窗口，不要直接重复点击。',
 file_application_unavailable:'Windows 文件调度组件未能运行，请检查本机桌面会话及系统组件。',
 file_application_failed:'Windows 未接受本次打开或定位请求，请检查本机桌面会话、默认软件及文件状态。',
 file_application_receipt_invalid:'未收到可核实的 Windows 调度回执。请先查看本机实际窗口，不要直接重复操作。',
}

// Fixed application code only; the filename is UTF-8 JSON data in the child
// environment. It is never interpolated into PowerShell, a command or Explorer
// arguments. Only the short-lived helper is hidden, not the document window.
export const FILE_APPLICATION_SCRIPT=String.raw`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class StudioFileApplication {
 public static bool UsedNotepad=false;
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct ExecuteInfo {
  public int cbSize; public uint fMask; public IntPtr hwnd;
  public string lpVerb,lpFile,lpParameters,lpDirectory; public int nShow;
  public IntPtr hInstApp,lpIDList; public string lpClass; public IntPtr hkeyClass;
  public uint dwHotKey; public IntPtr hIcon,hProcess;
 }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 [return:MarshalAs(UnmanagedType.Bool)] static extern bool ShellExecuteExW(ref ExecuteInfo info);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHParseDisplayName(string name,IntPtr context,out IntPtr item,uint attributes,out uint found);
 [DllImport("shell32.dll")] static extern int SHOpenFolderAndSelectItems(IntPtr item,uint count,IntPtr children,uint flags);
 [DllImport("ole32.dll")] static extern int CoInitializeEx(IntPtr reserved,uint flags);
 [DllImport("ole32.dll")] static extern void CoUninitialize();
 public static int Execute(string file,string parameters) {
  var info=new ExecuteInfo();info.cbSize=Marshal.SizeOf(typeof(ExecuteInfo));
  info.fMask=0x100|0x400; // NOASYNC: finish dispatch; NO_UI: report errors ourselves.
  info.lpVerb="open";info.lpFile=file;info.lpParameters=parameters;
  info.lpDirectory=Path.GetDirectoryName(file);info.nShow=1; // SW_SHOWNORMAL
  if(ShellExecuteExW(ref info))return 0;
  int error=Marshal.GetLastWin32Error();return error==0?31:error;
 }
 public static int Dispatch(string file,bool reveal,bool fallback,bool notepad,string windows) {
  int initialized=CoInitializeEx(IntPtr.Zero,6);
  if(initialized<0)return initialized;
  try {
   if(reveal) {
    IntPtr item=IntPtr.Zero;uint found;
    try {int hr=SHParseDisplayName(file,IntPtr.Zero,out item,0,out found);
     if(hr<0)return hr;
     if(item==IntPtr.Zero)return 2;
     return SHOpenFolderAndSelectItems(item,0,IntPtr.Zero,0);
    }finally{if(item!=IntPtr.Zero)Marshal.FreeCoTaskMem(item);}
   }
   if(notepad){int direct=Execute(Path.Combine(windows,"System32","notepad.exe"),"\""+file+"\"");UsedNotepad=(direct==0);return direct;}
   int result=Execute(file,null);
   if((result==1155||result==31)&&fallback) {
    result=Execute(Path.Combine(windows,"System32","notepad.exe"),"\""+file+"\"");
    UsedNotepad=(result==0);return result;
   }
   return result;
  }finally{CoUninitialize();}
 }
}
'@
$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_FILE_APPLICATION)) | ConvertFrom-Json
$code=[StudioFileApplication]::Dispatch([string]$v.file,[bool]$v.reveal,[bool]$v.textFallback,[bool]$v.notepad,[string]$env:SystemRoot)
$accepted=($code -eq 0)
$handler=if($v.reveal){'explorer'}elseif([StudioFileApplication]::UsedNotepad){'notepad'}else{'default'}
[Console]::Write((@{format='agent-studio-file-application-v1';accepted=$accepted;handler=$handler;code=$code} | ConvertTo-Json -Compress))
if(!$accepted){exit 1}
}catch{[Console]::Write('{"format":"agent-studio-file-application-v1","accepted":false,"code":-1}');exit 1}`

function failure(code){
 const win32=code<0?(code&0xffff):code
 return ({2:'file_application_not_found',3:'file_application_not_found',5:'file_application_access_denied',31:'file_application_no_association',1155:'file_application_no_association',1223:'file_application_cancelled'})[win32]||'file_application_failed'
}
export async function invokeFileApplication(file,reveal,signal,{platform=process.platform,execute=execFile,windows=process.env.SystemRoot||'C:\\Windows',timeoutMs=20000,application='default'}={}){
 signal?.throwIfAborted()
 if(platform!=='win32'||typeof reveal!=='boolean'||typeof file!=='string'||file.length>32000||!/^[a-z]:\\/i.test(file)||/[\x00-\x1f\x7f"<>|?*]/.test(file)||file.slice(3).includes(':')||!reveal&&!OPEN_EXTENSIONS.has(path.win32.extname(file).toLowerCase())||!/^[a-z]:\\windows$/i.test(windows))throw Error('file_open_platform_or_path_denied')
 if(!['default','notepad'].includes(application)||application==='notepad'&&(reveal||!textExtensions.has(path.win32.extname(file).toLowerCase())))throw Error('file_open_type_denied')
 const command=path.win32.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe')
 const payload=Buffer.from(JSON.stringify({file,reveal,textFallback:!reveal&&textExtensions.has(path.win32.extname(file).toLowerCase()),notepad:application==='notepad'})).toString('base64')
 return new Promise((resolve,reject)=>{
  execute(command,['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(FILE_APPLICATION_SCRIPT,'utf16le').toString('base64')],{shell:false,windowsHide:true,encoding:'utf8',timeout:timeoutMs,maxBuffer:8192,signal,env:{...process.env,SystemRoot:windows,STUDIO_FILE_APPLICATION:payload}},(error,stdout)=>{
   if(signal?.aborted)return reject(signal.reason||Object.assign(Error('aborted'),{name:'AbortError'}))
   let result;try{result=JSON.parse(String(stdout).trim())}catch{return reject(Error(error?.killed?'file_application_timeout':error?'file_application_unavailable':'file_application_receipt_invalid'))}
   if(result?.format!=='agent-studio-file-application-v1'||typeof result.accepted!=='boolean'||!Number.isInteger(result.code))return reject(Error('file_application_receipt_invalid'))
   if(!result.accepted)return reject(Error(failure(result.code)))
   if(error||!['default','notepad','explorer'].includes(result.handler)||reveal!==(result.handler==='explorer')||result.code!==0)return reject(Error('file_application_receipt_invalid'))
   resolve({format:result.format,action:reveal?'reveal':'open',accepted:true,handler:result.handler})
  })
 })
}
