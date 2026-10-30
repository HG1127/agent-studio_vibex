import {execFile} from 'node:child_process'

// Fixed program only. Device/site/path text is transported as JSON data, not code.
export const REVIEW_SCRIPT=String.raw`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class NativeReviewWindow{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int command);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);}'
$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_PERMISSION_REVIEW)) | ConvertFrom-Json
$form=New-Object System.Windows.Forms.Form
$form.Text='Agent Studio · 本机授权确认'
$form.Name='studio-permission-confirmation'
$form.TopMost=$true
$form.StartPosition='CenterScreen'
$form.Size=New-Object System.Drawing.Size(680,520)
$form.MinimumSize=New-Object System.Drawing.Size(580,380)
$form.MaximizeBox=$false
$form.MinimizeBox=$false
$form.ShowInTaskbar=$true
$form.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::Font
$form.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',10)
$layout=New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock='Fill'
$layout.Padding=New-Object System.Windows.Forms.Padding(16)
$layout.ColumnCount=1
$layout.RowCount=3
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent,100)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute,42)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute,48)))
$body=New-Object System.Windows.Forms.TextBox
$body.Name='permission-scope'
$body.Dock='Fill'
$body.Multiline=$true
$body.ReadOnly=$true
$body.WordWrap=$true
$body.ScrollBars='Vertical'
$body.Text=[string]$v.message
$remaining=New-Object System.Windows.Forms.Label
$remaining.Dock='Fill'
$remaining.TextAlign='MiddleLeft'
$buttons=New-Object System.Windows.Forms.FlowLayoutPanel
$buttons.Dock='Fill'
$buttons.FlowDirection='RightToLeft'
$yes=New-Object System.Windows.Forms.Button
$yes.Name='permission-approve'
$yes.Text='确认并保存'
$yes.Size=New-Object System.Drawing.Size(132,38)
$yes.DialogResult=[System.Windows.Forms.DialogResult]::Yes
$no=New-Object System.Windows.Forms.Button
$no.Name='permission-decline'
$no.Text='拒绝 / 取消'
$no.Size=New-Object System.Drawing.Size(132,38)
$no.DialogResult=[System.Windows.Forms.DialogResult]::No
[void]$buttons.Controls.Add($yes)
[void]$buttons.Controls.Add($no)
[void]$layout.Controls.Add($body,0,0)
[void]$layout.Controls.Add($remaining,0,1)
[void]$layout.Controls.Add($buttons,0,2)
[void]$form.Controls.Add($layout)
$form.AcceptButton=$no
$form.CancelButton=$no
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=200
$state=@{expired=$false;deadline=[DateTime]::UtcNow.AddMilliseconds([int]$v.timeoutMs)}
$timer.Add_Tick({
 $seconds=[Math]::Max(0,[Math]::Ceiling(($state.deadline-[DateTime]::UtcNow).TotalSeconds))
 $remaining.Text='剩余确认时间：'+$seconds+' 秒。超时或关闭窗口均不会保存。'
 if($seconds -le 0){$state.expired=$true;$form.DialogResult=[System.Windows.Forms.DialogResult]::Abort;$form.Close()}
})
# The hidden console's STARTUPINFO may hide the first GUI ShowWindow as well.
# Defer a second explicit show until WinForms finishes its initial display call.
$form.Add_Shown({[void]$form.BeginInvoke([Action]{[void][NativeReviewWindow]::ShowWindow($form.Handle,5);$form.Activate();$form.TopMost=$true;$form.BringToFront();[void][NativeReviewWindow]::SetForegroundWindow($form.Handle);$no.Select();$form.ActiveControl=$no;$state.deadline=[DateTime]::UtcNow.AddMilliseconds([int]$v.timeoutMs);$timer.Start();[Console]::WriteLine('STUDIO_NATIVE_REVIEW_READY')})})
try{$result=$form.ShowDialog()}finally{$timer.Stop();$timer.Dispose();$form.Dispose()}
if($state.expired){exit 3}
if($result -eq [System.Windows.Forms.DialogResult]::Yes){exit 0}else{exit 2}`

const aborted=()=>Object.assign(Error('permission_confirmation_cancelled'),{name:'AbortError'})
/** Test adapters are import-only; configuration and remote requests cannot inject them. */
export function confirmNative(review,signal,{execute=execFile,platform=process.platform,timeoutMs=90000,onStarted=()=>{},onReady=()=>{}}={}){
 if(platform!=='win32')return Promise.reject(Error('permission_confirmation_unavailable'))
 if(signal?.aborted)return Promise.reject(aborted())
 if(typeof review?.message!=='string'||review.message.length>24000||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>90000)return Promise.reject(Error('invalid_control_review'))
 const encoded=Buffer.from(JSON.stringify({message:review.message,timeoutMs}),'utf8').toString('base64')
 return new Promise((resolve,reject)=>{
  let child,returned=false,closed=false,callbackDone=false,finished=false,failure
  const finish=()=>{
   if(finished||!callbackDone||child?.once&&!closed)return
   finished=true
   if(signal?.aborted)return reject(aborted())
   if(!failure)return resolve(true)
   if(failure.code===2)return resolve(false)
   if(failure.code===3||failure.killed)return reject(Error('permission_confirmation_timeout'))
   reject(Error('permission_confirmation_unavailable'))
  }
  try{
   child=execute('powershell.exe',['-NoLogo','-NoProfile','-STA','-EncodedCommand',Buffer.from(REVIEW_SCRIPT,'utf16le').toString('base64')],{env:{...process.env,STUDIO_PERMISSION_REVIEW:encoded},windowsHide:true,encoding:'utf8',timeout:timeoutMs+15000,maxBuffer:4096,signal},error=>{failure=error;callbackDone=true;if(returned)finish()})
   returned=true
   let readyText='',notified=false
   child?.stdout?.on('data',chunk=>{readyText=(readyText+String(chunk)).slice(-100);if(!notified&&readyText.includes('STUDIO_NATIVE_REVIEW_READY')){notified=true;try{onReady(child.pid)}catch{}}})
   if(child?.once){child.once('spawn',()=>{try{onStarted(child.pid)}catch{}});child.once('close',()=>{closed=true;finish()})}else finish()
  }catch{finished=true;reject(signal?.aborted?aborted():Error('permission_confirmation_unavailable'))}
 })
}
