param([string]$PackageRoot='')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PickerProbeWindows {
 public delegate bool EnumProc(IntPtr hwnd, IntPtr state);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr state);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder name,int length);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint flag);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
 public static IntPtr VisibleWindow(int pid){IntPtr found=IntPtr.Zero;EnumWindows(delegate(IntPtr h,IntPtr s){uint p;GetWindowThreadProcessId(h,out p);var name=new System.Text.StringBuilder(100);GetClassName(h,name,100);if(p==pid&&IsWindowVisible(h)&&name.ToString()=="#32770"){found=h;return false;}return true;},IntPtr.Zero);return found;}
}
'@

$root=(Get-Location).Path
$module=Join-Path $root 'local-executor/native-picker.mjs'
$node=(Get-Command node -ErrorAction Stop).Source
if($PackageRoot){$module=Join-Path $PackageRoot 'app/local-executor/native-picker.mjs';$node=Join-Path $PackageRoot 'runtime/node.exe'}
$driver=Join-Path $root 'tests/helpers/native-picker-driver.mjs'
$base=Join-Path $root '.tmp/picker-progress'
[void](New-Item -ItemType Directory -Path $base -Force)
$results=@()
foreach($case in @(@{kind='folder';cancel='window'},@{kind='folder';cancel='abort'},@{kind='file';cancel='window'})){
 $marker=Join-Path $base ('native-'+[Guid]::NewGuid().ToString('N')+'.json')
 $p=New-Object Diagnostics.Process
 $p.StartInfo.FileName=$node
 [void]$p.StartInfo.ArgumentList.Add($driver)
 [void]$p.StartInfo.ArgumentList.Add($marker)
 [void]$p.StartInfo.ArgumentList.Add($module)
 [void]$p.StartInfo.ArgumentList.Add($case.kind)
 $p.StartInfo.UseShellExecute=$false;$p.StartInfo.CreateNoWindow=$true
 $p.StartInfo.RedirectStandardOutput=$true;$p.StartInfo.RedirectStandardError=$true;$p.StartInfo.RedirectStandardInput=$true
 $watch=[Diagnostics.Stopwatch]::StartNew();$didStart=$false;$pickerPid=0;$window=[IntPtr]::Zero
 try{
  [void]$p.Start();$didStart=$true
  while(!$p.HasExited -and $watch.ElapsedMilliseconds -lt 20000){
   if(!$pickerPid -and (Test-Path $marker)){try{$pickerPid=[int](Get-Content -Raw $marker|ConvertFrom-Json).pid}catch{}}
   if($pickerPid){$window=[PickerProbeWindows]::VisibleWindow($pickerPid)}
   if($window -ne [IntPtr]::Zero){break}
   Start-Sleep -Milliseconds 100
  }
  $visibleMs=$watch.ElapsedMilliseconds
  if($window -eq [IntPtr]::Zero){throw 'actual_native_dialog_not_visible'}
  $topMost=([PickerProbeWindows]::GetWindowLongPtr($window,-20).ToInt64() -band 8) -ne 0
  $ownerTopMost=([PickerProbeWindows]::GetWindowLongPtr([PickerProbeWindows]::GetWindow($window,4),-20).ToInt64() -band 8) -ne 0
  $front=[PickerProbeWindows]::GetForegroundWindow() -eq $window
  if(!$topMost -or !$ownerTopMost){throw 'native_dialog_not_above_browser'}
  if($case.cancel -eq 'abort'){$p.StandardInput.WriteLine('cancel');$p.StandardInput.Flush()}
  else{[void][PickerProbeWindows]::PostMessage($window,16,[IntPtr]::Zero,[IntPtr]::Zero)}
  if(!$p.WaitForExit(6000)){throw 'native_cancel_did_not_complete'}
  $output=$p.StandardOutput.ReadToEnd().Trim();$err=$p.StandardError.ReadToEnd()
  if($p.ExitCode -ne 0){throw ('native_driver_failed: '+$err.Substring(0,[Math]::Min(300,$err.Length)))}
  $out=$output|ConvertFrom-Json
  if(!$out.cancelled -or $out.pathReturned){throw 'native_cancel_result_invalid'}
  $residual=$false
  try{$left=[Diagnostics.Process]::GetProcessById($pickerPid);$residual=!$left.HasExited;$left.Dispose()}catch{}
  if($residual){throw 'native_picker_process_residual'}
  $results+=@{kind=$case.kind;cancel=$case.cancel;visibleMs=$visibleMs;visible=$true;topMost=$topMost;ownerTopMost=$ownerTopMost;foreground=$front;cancelled=$true;processResidual=$false;userSelectionMade=$false}
 }finally{
  if($didStart -and !$p.HasExited){$p.Kill($true);$p.WaitForExit()}
  $p.Dispose();Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
 }
}
$result=@{passed=$true;packaged=[bool]$PackageRoot;cases=$results}
$result|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 -LiteralPath (Join-Path $base $(if($PackageRoot){'native-package-result.json'}else{'native-source-result.json'}))
$result|ConvertTo-Json -Depth 5 -Compress
