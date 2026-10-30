// Real native dialog test. Only this test's child PID and a sentinel-only review
// may be automated. No connection configuration, user permission or API is used.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {confirmNative} from '../local-executor/native-confirmation.mjs'
if(process.platform!=='win32')throw Error('windows_desktop_required')
const probe=String.raw`$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class ReviewWin32{[DllImport("user32.dll")]public static extern int GetWindowLong(IntPtr h,int i);[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);}'
$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_NATIVE_PROBE)) | ConvertFrom-Json
$root=[System.Windows.Automation.AutomationElement]::RootElement
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$v.pid)
$window=$null
for($i=0;$i -lt 80;$i++){
 $list=$root.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
 foreach($item in $list){if($item.Current.Name -eq 'Agent Studio · 本机授权确认'){$window=$item;break}}
 if($window){break};Start-Sleep -Milliseconds 100
}
if(!$window){throw 'fixture_window_not_visible'}
$body=$null;$value=''
$edits=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($candidate in $edits){
 $text=[string]$candidate.Current.Name
 if($text.Contains('NATIVE-PERMISSION-FIXTURE-ONLY')){if($body){throw 'ambiguous_fixture_scope'};$body=$candidate;$value=$text}
}
if(!$body){throw 'fixture_scope_missing'}
if(!$value.Contains('NATIVE-PERMISSION-FIXTURE-ONLY')){throw 'not_an_isolated_review'}
$focused=[System.Windows.Automation.AutomationElement]::FocusedElement
$handle=[IntPtr]$window.Current.NativeWindowHandle
$topmost=([ReviewWin32]::GetWindowLong($handle,-20) -band 8) -ne 0
$foreground=[ReviewWin32]::GetForegroundWindow() -eq $handle
$result=@{action=[string]$v.action;visible=(!$window.Current.IsOffscreen);topmost=$topmost;foreground=$foreground;focused=[string]$focused.Current.Name;width=$window.Current.BoundingRectangle.Width;height=$window.Current.BoundingRectangle.Height}
if($v.action -eq 'close'){[void][ReviewWin32]::SendMessage($handle,16,[IntPtr]::Zero,[IntPtr]::Zero)}
elseif($v.action -eq 'approve' -or $v.action -eq 'decline'){
 $name=if($v.action -eq 'approve'){'确认并保存'}else{'拒绝 / 取消'}
 $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))
 if(!$button){throw 'fixture_button_missing'}
 if($button.Current.ProcessId -ne [int]$v.pid){throw 'fixture_button_owner_mismatch'}
 [void][ReviewWin32]::SendMessage([IntPtr]$button.Current.NativeWindowHandle,245,[IntPtr]::Zero,[IntPtr]::Zero)
}
$result | ConvertTo-Json -Compress`
const inspect=values=>new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-STA','-EncodedCommand',Buffer.from(probe,'utf16le').toString('base64')],{env:{...process.env,STUDIO_NATIVE_PROBE:Buffer.from(JSON.stringify(values)).toString('base64')},encoding:'utf8',windowsHide:true,timeout:18000,maxBuffer:12000},(error,stdout,stderr)=>error?reject(Error('native_probe_failed '+String(stderr).slice(-1200))):resolve(JSON.parse(stdout.trim()))))
const results=[]
for(const action of ['approve','decline','close','abort']){
 const abort=new AbortController();let resolvePid
 const spawned=new Promise(r=>resolvePid=r)
 const operation=confirmNative({message:'NATIVE-PERMISSION-FIXTURE-ONLY\r\n自动化窗口测试：此操作不保存任何授权。\r\nhttps://isolated.example'},abort.signal,{onReady:resolvePid,timeoutMs:45000})
 const observed=operation.then(value=>({value}),error=>({error:error.name,message:error.message}))
 try{
  const pid=await Promise.race([spawned,observed.then(result=>{throw Error('native_review_ended_before_visible:'+JSON.stringify(result))})]),window=await inspect({pid,action:action==='abort'?'inspect':action})
  assert.equal(window.visible,true);assert.equal(window.topmost,true)
  assert.equal(window.focused,'拒绝 / 取消','default focus must not grant permissions')
  if(action==='abort')abort.abort()
  const result=await observed
  if(action==='approve')assert.equal(result.value,true)
  else if(action==='abort')assert.equal(result.error,'AbortError')
  else assert.equal(result.value,false)
  results.push({...window,result});console.log('PASS native '+action+' '+JSON.stringify(window))
 }finally{abort.abort();await observed}
}
await assert.rejects(confirmNative({message:'NATIVE-PERMISSION-FIXTURE-ONLY\r\n超时自动关闭测试，不保存授权。'},undefined,{timeoutMs:1500}),/permission_confirmation_timeout/)
results.push({action:'timeout',closedWithoutConsent:true})
const out=path.join(process.cwd(),'.tmp/permission14-closeout');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'native-confirmation.json'),JSON.stringify({checks:results.length,results,realWindows:true,userPermissionsChanged:false},null,2))
console.log('NATIVE_CONFIRMATION_WINDOWS_PASS '+JSON.stringify({checks:results.length,realWindows:true,userPermissionsChanged:false}))
