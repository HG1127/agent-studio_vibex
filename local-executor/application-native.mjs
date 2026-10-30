import {execFile} from 'node:child_process'
import path from 'node:path'

// Product runtime, not an arbitrary script endpoint. Every input is JSON data;
// only this fixed, shipped C# implementation can be executed by this helper.
export const APPLICATION_NATIVE_CODE=String.raw`
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;using System.Windows.Automation;
public static class StudioApplications {
 public class Win {public string id,title,path;public int pid,x,y,width,height;}
 public class Control {public int id;public string name,type,runtime;public bool password,enabled;public double[] rect;}
 public class View {public Win window;public uint input;public List<Control> controls;public string image;}
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential)]public struct LastInput{public uint size,time;}
 [StructLayout(LayoutKind.Sequential)]struct Input{public uint type;public InputData data;}
 [StructLayout(LayoutKind.Explicit)]struct InputData{[FieldOffset(0)]public Mouse mouse;[FieldOffset(0)]public Keyboard keyboard;}
 [StructLayout(LayoutKind.Sequential)]struct Mouse{public int x,y;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct Keyboard{public ushort key,scan;public uint flags,time;public UIntPtr extra;}
 delegate bool EnumProc(IntPtr h,IntPtr state);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc p,IntPtr state);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,System.Text.StringBuilder text,int max);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")]static extern bool GetLastInputInfo(ref LastInput i);
 [DllImport("user32.dll")]static extern uint SendInput(uint n,Input[] inputs,int size);
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
 public static uint InputEpoch(){var i=new LastInput();i.size=(uint)Marshal.SizeOf(i);if(!GetLastInputInfo(ref i))throw new Exception("application_desktop_unavailable");return i.time;}
 public static List<Win> Windows(string expected){var list=new List<Win>();EnumWindows(delegate(IntPtr h,IntPtr s){if(list.Count>=100)return false;try{if(!IsWindowVisible(h))return true;var w=Get(h,expected);if(w.title.Length>0&&w.width>=40&&w.height>=40)list.Add(w);}catch{}return true;},IntPtr.Zero);return list;}
 static Win Get(IntPtr h,string expected){uint pid;GetWindowThreadProcessId(h,out pid);var p=Process.GetProcessById((int)pid);string exe=p.MainModule.FileName;if(expected!=null&&!String.Equals(Path.GetFullPath(exe),Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase))throw new Exception("application_window_changed");var b=new System.Text.StringBuilder(512);GetWindowText(h,b,512);var title=b.ToString();if(System.Text.RegularExpressions.Regex.IsMatch(title,@"Agent Studio|ChatGPT|Codex|Windows Terminal|Windows PowerShell|命令提示符|Windows Security|Windows 安全|用户帐户控制|User Account Control|Credential|密码管理|password manager",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception("application_sensitive_window");Rect r;if(!GetWindowRect(h,out r))throw new Exception("application_window_changed");return new Win{id=h.ToInt64().ToString(),title=title,path=exe,pid=(int)pid,x=r.left,y=r.top,width=r.right-r.left,height=r.bottom-r.top};}
 static AutomationElementCollection Elements(IntPtr h){return AutomationElement.FromHandle(h).FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.IsControlElementProperty,true));}
 static string Runtime(AutomationElement e){return String.Join(".",e.GetRuntimeId());}
 static bool Sensitive(AutomationElement e){var c=e.Current;return c.IsPassword||System.Text.RegularExpressions.Regex.IsMatch((c.ClassName??"")+" "+(c.AutomationId??"")+" "+(c.Name??""),@"password|credential|xterm|terminal|powershell|命令提示|终端",System.Text.RegularExpressions.RegexOptions.IgnoreCase);}
 static List<Control> Controls(IntPtr h){var output=new List<Control>();var all=Elements(h);for(int i=0;i<Math.Min(all.Count,500);i++){try{var element=all[i];var e=element.Current;if(e.IsOffscreen)continue;var r=e.BoundingRectangle;output.Add(new Control{id=i,name=Sensitive(element)?"[protected]":(e.Name??""),type=e.ControlType.ProgrammaticName,runtime=Runtime(element),password=Sensitive(element),enabled=e.IsEnabled,rect=new double[]{r.X,r.Y,r.Width,r.Height}});}catch{}}return output;}
 public static View Observe(string id,string exe,bool image){SetProcessDPIAware();var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);if(IsIconic(h))ShowWindow(h,9);SetForegroundWindow(h);System.Threading.Thread.Sleep(150);w=Get(h,exe);if(GetForegroundWindow()!=h)throw new Exception("application_foreground_unavailable");var result=new View{window=w,input=InputEpoch(),controls=Controls(h)};if(image){if(w.width>1920||w.height>1080||w.width<40||w.height<40)throw new Exception("application_window_size_denied");using(var bitmap=new Bitmap(w.width,w.height)){using(var g=Graphics.FromImage(bitmap)){var dc=g.GetHdc();bool ok;try{ok=PrintWindow(h,dc,2);}finally{g.ReleaseHdc(dc);}if(!ok)throw new Exception("application_capture_failed");}using(var stream=new MemoryStream()){bitmap.Save(stream,ImageFormat.Png);if(stream.Length>1048576)throw new Exception("application_capture_too_large");result.image=Convert.ToBase64String(stream.ToArray());}}}return result;}
 static void Key(ushort key,bool up){var i=new Input();i.type=1;i.data.keyboard.key=key;i.data.keyboard.flags=up?2u:0u;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");}
 static void Text(string text){foreach(char c in text){if(c<' '||c==127)throw new Exception("application_control_character_denied");var i=new Input();i.type=1;i.data.keyboard.scan=c;i.data.keyboard.flags=4;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");i.data.keyboard.flags=6;SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)));}}
 static void MouseInput(uint flags){var i=new Input();i.type=0;i.data.mouse.flags=flags;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");}
 public static void Act(string id,string exe,string title,string action,int element,string name,string runtime,string text,string key){
  SetProcessDPIAware();var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);if(w.title!=title)throw new Exception("application_window_changed");if(IsIconic(h))ShowWindow(h,9);SetForegroundWindow(h);uint epoch=InputEpoch();System.Threading.Thread.Sleep(350);if(GetForegroundWindow()!=h)throw new Exception("application_foreground_unavailable");if(InputEpoch()!=epoch)throw new Exception("application_user_takeover");
  var all=Elements(h);if(element<0||element>=all.Count)throw new Exception("application_element_changed");var e=all[element];var c=e.Current;if(c.IsPassword||c.IsOffscreen||!c.IsEnabled||c.Name!=name||Runtime(e)!=runtime)throw new Exception("application_element_changed");if(Sensitive(e))throw new Exception("application_sensitive_control");
  if(action=="click"){object value;if(e.TryGetCurrentPattern(InvokePattern.Pattern,out value)){((InvokePattern)value).Invoke();return;}var r=c.BoundingRectangle;int x=(int)(r.X+r.Width/2),y=(int)(r.Y+r.Height/2);if(x<w.x||y<w.y||x>=w.x+w.width||y>=w.y+w.height||GetAncestor(WindowFromPoint(new Point(x,y)),2)!=h)throw new Exception("application_point_covered");SetCursorPos(x,y);MouseInput(2);MouseInput(4);}
  else if(action=="type"){object value;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out value)){var p=(ValuePattern)value;if(p.Current.IsReadOnly)throw new Exception("application_read_only");p.SetValue(text);}else{e.SetFocus();if(GetForegroundWindow()!=h||InputEpoch()!=epoch)throw new Exception("application_user_takeover");var focused=AutomationElement.FocusedElement;if(!e.Equals(focused)||focused.Current.IsPassword)throw new Exception("application_focus_changed");Text(text);}}
  else if(action=="key"){e.SetFocus();var keys=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"Up",38},{"Down",40},{"Left",37},{"Right",39},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34}};if(!keys.ContainsKey(key))throw new Exception("application_key_denied");if(GetForegroundWindow()!=h||InputEpoch()!=epoch)throw new Exception("application_user_takeover");Key(keys[key],false);Key(keys[key],true);}
  else throw new Exception("application_action_denied");
 }
}
`
const wrapper=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try{
 Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase,System.Drawing
 $code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_APPLICATION_CODE))
 Add-Type -TypeDefinition $code -ReferencedAssemblies @([Windows.Automation.AutomationElement].Assembly.Location,[Windows.Automation.ControlType].Assembly.Location,[Windows.Rect].Assembly.Location,[Drawing.Bitmap].Assembly.Location)
 $v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_APPLICATION_INPUT))|ConvertFrom-Json
 $result=$null
 if($v.action -eq 'discover'){
  $rows=New-Object Collections.Generic.List[object];$shell=New-Object -ComObject WScript.Shell
  foreach($folder in @([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'))){if($folder){foreach($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue|Select-Object -First 300)){try{$link=$shell.CreateShortcut($file.FullName);$p=[string]$link.TargetPath;if($p -match '^[a-z]:\\' -and $p.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){$rows.Add(@{name=$file.BaseName;path=$p})}}catch{}}}}
  foreach($w in [StudioApplications]::Windows($null)){$rows.Add(@{name=[IO.Path]::GetFileNameWithoutExtension($w.path);path=$w.path})}
  foreach($reg in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths')){foreach($entry in @(Get-ChildItem -LiteralPath $reg -ErrorAction SilentlyContinue)){$p=(Get-ItemProperty -LiteralPath $entry.PSPath).'(default)';if($p -is [string]){$rows.Add(@{name=$entry.PSChildName;path=$p.Trim('"')})}}}
  $cli=Get-Command codex.exe -ErrorAction SilentlyContinue;if($cli){$rows.Add(@{name='Codex CLI';path=$cli.Source;adapter='codex'})}
  # The Codex desktop installer keeps its CLI below this per-user directory;
  # Explorer-launched apps do not inherit the coding session's augmented PATH.
  $codexBin=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  if(Test-Path -LiteralPath $codexBin -PathType Container){foreach($version in @(Get-ChildItem -LiteralPath $codexBin -Directory -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 3)){$candidate=Join-Path $version.FullName 'codex.exe';if(Test-Path -LiteralPath $candidate -PathType Leaf){$rows.Add(@{name='Codex CLI';path=$candidate;adapter='codex'})}}}
  $result=@($rows|Select-Object -First 700)
 }elseif($v.action -eq 'windows'){$result=@([StudioApplications]::Windows([string]$v.path))}
 elseif($v.action -eq 'observe'){$result=[StudioApplications]::Observe([string]$v.window,[string]$v.path,[bool]$v.images)}
 elseif($v.action -eq 'act'){[StudioApplications]::Act([string]$v.window,[string]$v.path,[string]$v.title,[string]$v.kind,[int]$v.element,[string]$v.name,[string]$v.runtime,[string]$v.text,[string]$v.key);$result=@{accepted=$true}}
 else{throw 'application_action_denied'}
 [Console]::Write((@{ok=$true;value=$result}|ConvertTo-Json -Depth 8 -Compress))
}catch{$errorCode=[string]$_.Exception.Message;$match=[regex]::Match($errorCode,'application_[a-z_]+');if($match.Success){$errorCode=$match.Value}else{$errorCode='application_native_unavailable'};[Console]::Write((@{ok=$false;error=$errorCode}|ConvertTo-Json -Compress));exit 1}`

export function applicationNative(input,{execute=execFile,signal,platform=process.platform,timeout=20000}={}){
 if(platform!=='win32')return Promise.reject(Error('application_windows_required'))
 signal?.throwIfAborted()
 const command=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
 return new Promise((resolve,reject)=>execute(command,['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(wrapper,'utf16le').toString('base64')],{windowsHide:true,shell:false,encoding:'utf8',maxBuffer:2*1024*1024,timeout,signal,env:{...process.env,STUDIO_APPLICATION_CODE:Buffer.from(APPLICATION_NATIVE_CODE).toString('base64'),STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify(input)).toString('base64')}},(error,out)=>{
  if(signal?.aborted)return reject(signal.reason)
  let v;try{v=JSON.parse(String(out).trim())}catch{return reject(Error(error?.killed?'application_native_timeout':'application_native_unavailable'))}
  if(v.ok!==true)return reject(Error(/^application_[a-z_]+$/.test(v.error)?v.error:'application_native_unavailable'))
  if(error)return reject(Error('application_native_unavailable'))
  resolve(v.value)
 }))
}
