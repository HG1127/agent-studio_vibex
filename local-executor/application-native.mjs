import {execFile} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// Product runtime, not an arbitrary script endpoint. Every input is JSON data;
// only this fixed, shipped C# implementation can be executed by this helper.
export const APPLICATION_NATIVE_CODE=String.raw`
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;using System.Windows.Automation;
public static class StudioApplications {
 public class Win {public string id,title,path;public int pid,x,y,width,height;public bool minimized;}
 public class Control {public int id;public string name,type,runtime;public bool password,enabled;public double[] rect;public List<string> actions;public string value;}
 public class View {public Win window;public uint input;public List<Control> controls;public string image,imageError;public int imageWidth,imageHeight;public bool controlsTruncated;}
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
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageName(IntPtr process,uint flags,System.Text.StringBuilder name,ref uint size);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
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
 public static List<Win> Windows(string expected){var list=new List<Win>();EnumWindows(delegate(IntPtr h,IntPtr s){if(list.Count>=100)return false;try{if(!IsWindowVisible(h))return true;var w=Get(h,expected);if(w.title.Length>0&&(IsIconic(h)||w.width>=40&&w.height>=40))list.Add(w);}catch{}return true;},IntPtr.Zero);return list;}
 // PROCESS_QUERY_LIMITED_INFORMATION avoids enumerating modules while Electron
 // holds its loader lock during startup. It does not require reading process
 // memory, and the resulting executable path is still matched exactly.
 static string Executable(uint pid){var process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)throw new Exception("application_window_changed");try{uint size=32768;var name=new System.Text.StringBuilder((int)size);if(!QueryFullProcessImageName(process,0,name,ref size))throw new Exception("application_window_changed");return name.ToString();}finally{CloseHandle(process);}}
 static Win Get(IntPtr h,string expected){uint pid;GetWindowThreadProcessId(h,out pid);string exe=Executable(pid);if(expected!=null&&!String.Equals(Path.GetFullPath(exe),Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase))throw new Exception("application_window_changed");var b=new System.Text.StringBuilder(512);GetWindowText(h,b,512);var title=b.ToString();if(System.Text.RegularExpressions.Regex.IsMatch(title,@"Agent Studio|ChatGPT|Codex|Windows Terminal|Windows PowerShell|命令提示符|Windows Security|Windows 安全|用户帐户控制|User Account Control|Credential|密码管理|password manager",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception("application_sensitive_window");Rect r;if(!GetWindowRect(h,out r))throw new Exception("application_window_changed");return new Win{id=h.ToInt64().ToString(),title=title,path=exe,pid=(int)pid,x=r.left,y=r.top,width=r.right-r.left,height=r.bottom-r.top,minimized=IsIconic(h)};}
 public static Win Reveal(string id,string expected){var h=new IntPtr(long.Parse(id));Get(h,expected);if(IsIconic(h))ShowWindow(h,9);SetForegroundWindow(h);return Get(h,expected);}
 static List<AutomationElement> Elements(IntPtr h){bool truncated;return Elements(h,out truncated);}
 static List<AutomationElement> Elements(IntPtr h,out bool truncated){
  var output=new List<AutomationElement>();var pending=new Stack<AutomationElement>();var walker=TreeWalker.ControlViewWalker;var clock=Stopwatch.StartNew();
  truncated=false;try{var element=walker.GetFirstChild(AutomationElement.FromHandle(h));
   while(element!=null&&output.Count<500&&clock.ElapsedMilliseconds<12000){
    output.Add(element);var child=walker.GetFirstChild(element);
    if(child!=null){var sibling=walker.GetNextSibling(element);if(sibling!=null)pending.Push(sibling);element=child;}
    else{element=walker.GetNextSibling(element);if(element==null&&pending.Count>0)element=pending.Pop();}
   }truncated=element!=null||pending.Count>0;
  }catch(ElementNotAvailableException){throw new Exception("application_window_changed");}
  return output;
 }
 static string Runtime(AutomationElement e){return String.Join(".",e.GetRuntimeId());}
 public static double[] SafeControlBounds(double x,double y,double width,double height){if(Double.IsNaN(x)||Double.IsNaN(y)||Double.IsNaN(width)||Double.IsNaN(height)||Double.IsInfinity(x)||Double.IsInfinity(y)||Double.IsInfinity(width)||Double.IsInfinity(height)||width<=0||height<=0)return new double[]{0,0,0,0};return new double[]{x,y,width,height};}
 static bool Sensitive(AutomationElement e){var c=e.Current;return c.IsPassword||System.Text.RegularExpressions.Regex.IsMatch((c.ClassName??"")+" "+(c.AutomationId??"")+" "+(c.Name??""),@"password|credential|xterm|terminal|powershell|命令提示|终端",System.Text.RegularExpressions.RegexOptions.IgnoreCase);}
 static List<Control> Controls(IntPtr h,out bool truncated){
  var output=new List<Control>();var all=Elements(h,out truncated);var clock=Stopwatch.StartNew();int i=0;
  for(;i<Math.Min(all.Count,500)&&clock.ElapsedMilliseconds<10000;i++){try{
   var element=all[i];var e=element.Current;if(e.IsOffscreen)continue;var r=e.BoundingRectangle;var bounds=SafeControlBounds(r.X,r.Y,r.Width,r.Height);bool spatial=bounds[2]>0&&bounds[3]>0;bool sensitive=Sensitive(element);var actions=new List<string>();string text="";object pattern;
   if(!sensitive&&e.IsEnabled){
    if(spatial)actions.Add("click");
    if(element.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)){var v=(ValuePattern)pattern;text=v.Current.Value??"";if(spatial&&!v.Current.IsReadOnly)actions.Add("type");}
    else if(element.TryGetCurrentPattern(TextPattern.Pattern,out pattern))text=((TextPattern)pattern).DocumentRange.GetText(1001);
    if(spatial&&e.IsKeyboardFocusable){actions.Add("key");if((e.ControlType==ControlType.Edit||e.ControlType==ControlType.Document)&&!actions.Contains("type"))actions.Add("type");}
   }
   if(text.Length>1000)text=text.Substring(0,1000)+"…[truncated]";
   string name=e.Name??"";if(name.Length>1000)name=name.Substring(0,1000);output.Add(new Control{id=i,name=sensitive?"[protected]":name,type=e.ControlType.ProgrammaticName,runtime=Runtime(element),password=sensitive,enabled=e.IsEnabled,rect=bounds,actions=actions,value=sensitive?null:text});
  }catch{}}
  if(i<all.Count)truncated=true;return output;
 }
 static void Capture(View result,IntPtr h,Win w){
  if(w.width<40||w.height<40||w.width>8192||w.height>8192||(long)w.width*w.height>16777216){result.imageError="application_window_size_denied";return;}
  var captured=new View();var thread=new System.Threading.Thread(delegate(){
   try{using(var bitmap=new Bitmap(w.width,w.height)){
    using(var g=Graphics.FromImage(bitmap)){var dc=g.GetHdc();bool ok;try{ok=PrintWindow(h,dc,2);}finally{g.ReleaseHdc(dc);}if(!ok)throw new Exception("application_capture_failed");}
    foreach(int limit in new int[]{1600,1200,900,640}){double ratio=Math.Min(1.0,Math.Min((double)limit/w.width,(limit*9.0/16.0)/w.height));
    using(var scaled=new Bitmap(Math.Max(1,(int)(w.width*ratio)),Math.Max(1,(int)(w.height*ratio)))){
     using(var graphics=Graphics.FromImage(scaled)){graphics.DrawImage(bitmap,0,0,scaled.Width,scaled.Height);}
     using(var stream=new MemoryStream()){scaled.Save(stream,ImageFormat.Png);if(stream.Length<=1048576){captured.image=Convert.ToBase64String(stream.ToArray());captured.imageWidth=scaled.Width;captured.imageHeight=scaled.Height;break;}}
    }
    }if(captured.image==null)throw new Exception("application_capture_too_large");
   }}catch(Exception error){captured.imageError=error.Message.StartsWith("application_capture_")?error.Message:"application_capture_failed";}
  });thread.IsBackground=true;thread.SetApartmentState(System.Threading.ApartmentState.STA);thread.Start();
  if(!thread.Join(2500)){result.imageError="application_capture_timeout";return;}
  result.image=captured.image;result.imageError=captured.imageError;result.imageWidth=captured.imageWidth;result.imageHeight=captured.imageHeight;
 }
 public static View Observe(string id,string exe,bool image){SetProcessDPIAware();var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);if(IsIconic(h))ShowWindow(h,9);System.Threading.Thread.Sleep(150);w=Get(h,exe);try{Process.GetProcessById(w.pid).WaitForInputIdle(3000);}catch{}bool truncated;var controls=Controls(h,out truncated);var result=new View{window=w,input=InputEpoch(),controls=controls,controlsTruncated=truncated};if(image)Capture(result,h,w);return result;}
 static void Key(ushort key,bool up){var i=new Input();i.type=1;i.data.keyboard.key=key;i.data.keyboard.flags=up?2u:0u;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");}
 static void Text(string text){foreach(char c in text){if(c<' '||c==127)throw new Exception("application_control_character_denied");var i=new Input();i.type=1;i.data.keyboard.scan=c;i.data.keyboard.flags=4;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");i.data.keyboard.flags=6;SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)));}}
 static void MouseInput(uint flags){var i=new Input();i.type=0;i.data.mouse.flags=flags;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");}
 public static void Act(string id,string exe,string title,string action,int element,string name,string runtime,string text,string key){
  SetProcessDPIAware();var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);if(w.title!=title)throw new Exception("application_window_changed");if(IsIconic(h))ShowWindow(h,9);uint epoch=InputEpoch();System.Threading.Thread.Sleep(350);if(InputEpoch()!=epoch)throw new Exception("application_user_takeover");
  var all=Elements(h);if(element<0||element>=all.Count)throw new Exception("application_element_changed");var e=all[element];if(Runtime(e)!=runtime){e=null;for(int i=0;i<all.Count;i++){try{if(Runtime(all[i])==runtime){e=all[i];break;}}catch{}}if(e==null)throw new Exception("application_element_changed");}var c=e.Current;if(c.IsPassword||c.IsOffscreen||!c.IsEnabled||c.Name!=name||Runtime(e)!=runtime)throw new Exception("application_element_changed");if(Sensitive(e))throw new Exception("application_sensitive_control");
  if(action=="click"){object value;if(e.TryGetCurrentPattern(InvokePattern.Pattern,out value)){((InvokePattern)value).Invoke();return;}SetForegroundWindow(h);if(GetForegroundWindow()!=h)throw new Exception("application_foreground_unavailable");var r=c.BoundingRectangle;int x=(int)(r.X+r.Width/2),y=(int)(r.Y+r.Height/2);if(x<w.x||y<w.y||x>=w.x+w.width||y>=w.y+w.height||GetAncestor(WindowFromPoint(new Point(x,y)),2)!=h)throw new Exception("application_point_covered");SetCursorPos(x,y);MouseInput(2);MouseInput(4);}
  else if(action=="type"){object value;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out value)){var p=(ValuePattern)value;if(p.Current.IsReadOnly)throw new Exception("application_read_only");p.SetValue(text);}else{SetForegroundWindow(h);e.SetFocus();if(GetForegroundWindow()!=h)throw new Exception("application_foreground_unavailable");if(InputEpoch()!=epoch)throw new Exception("application_user_takeover");var focused=AutomationElement.FocusedElement;if(!e.Equals(focused)||focused.Current.IsPassword)throw new Exception("application_focus_changed");Text(text);}}
  else if(action=="key"){SetForegroundWindow(h);e.SetFocus();var keys=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"Up",38},{"Down",40},{"Left",37},{"Right",39},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34}};if(!keys.ContainsKey(key))throw new Exception("application_key_denied");if(GetForegroundWindow()!=h)throw new Exception("application_foreground_unavailable");if(InputEpoch()!=epoch)throw new Exception("application_user_takeover");Key(keys[key],false);Key(keys[key],true);}
  else throw new Exception("application_action_denied");
 }
}
`
// Enumeration reuses the observer's exact identity/filter methods without
// loading UI Automation, drawing or input support on every startup probe.
export const APPLICATION_WINDOW_CODE='using System;using System.Collections.Generic;using System.IO;using System.Runtime.InteropServices;public static class StudioApplications {\n'+APPLICATION_NATIVE_CODE.split('\n').filter(line=>
 /^ public class Win |^ \[StructLayout\(LayoutKind.Sequential\)\]public struct Rect|^ delegate bool EnumProc|^ public static List<Win> Windows\(|^ static string Executable\(|^ static Win Get\(|^ public static Win Reveal\(/.test(line)||
 line.includes('[DllImport')&&/\b(?:EnumWindows|IsWindowVisible|IsIconic|GetWindowThreadProcessId|OpenProcess|QueryFullProcessImageName|CloseHandle|GetWindowText|GetWindowRect|ShowWindow|SetForegroundWindow)\(/.test(line)
).join('\n')+'\n}'

// Compile the same window policy at release time. This entry point only lists
// or reveals a verified window; it has no UIA, input, script or shell endpoint.
export const APPLICATION_WINDOW_EXECUTABLE_CODE=APPLICATION_WINDOW_CODE+String.raw`
public static class StudioWindowProbe {
 [STAThread]public static int Main(){
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);
  var json=new System.Web.Script.Serialization.JavaScriptSerializer();json.MaxJsonLength=2097152;
  try{
   string encoded=Environment.GetEnvironmentVariable("STUDIO_APPLICATION_INPUT");
   if(encoded==null||encoded.Length>8192)throw new Exception("application_action_denied");
   var input=json.Deserialize<Dictionary<string,object>>(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
   foreach(string key in input.Keys)if(key!="action"&&key!="path"&&key!="reveal")throw new Exception("application_action_denied");
   if(!input.ContainsKey("action")||!Object.Equals(input["action"],"windows")||!input.ContainsKey("path")||!(input["path"] is string))throw new Exception("application_action_denied");
   string expected=(string)input["path"];
   if(expected.Length>2000||!System.Text.RegularExpressions.Regex.IsMatch(expected,@"^[a-zA-Z]:\\")||System.Text.RegularExpressions.Regex.IsMatch(expected,@"[\x00-\x1f\x7f]"))throw new Exception("application_path_denied");
   object reveal;input.TryGetValue("reveal",out reveal);if(reveal!=null&&!(reveal is bool))throw new Exception("application_action_denied");
   var result=StudioApplications.Windows(expected);
   if(Object.Equals(reveal,true)&&result.Count>0)result[0]=StudioApplications.Reveal(result[0].id,expected);
   Console.Write(json.Serialize(new {ok=true,value=result}));return 0;
  }catch(Exception error){
   string code=System.Text.RegularExpressions.Regex.IsMatch(error.Message,@"^application_[a-z_]+$")?error.Message:"application_native_unavailable";
   Console.Write(json.Serialize(new {ok=false,error=code}));return 1;
  }
 }
}`
// The observation executable has no input/action endpoint. It shares the exact
// authorization and control-reading policy, without runtime PowerShell compile.
export const APPLICATION_OBSERVER_EXECUTABLE_CODE=APPLICATION_NATIVE_CODE.split(' static void Key(')[0]+'\n}\n'+String.raw`
public static class StudioObserver {
 [STAThread]public static int Main(){
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);
  var json=new System.Web.Script.Serialization.JavaScriptSerializer();json.MaxJsonLength=4194304;
  try{
   string encoded=Environment.GetEnvironmentVariable("STUDIO_APPLICATION_INPUT");
   if(encoded==null||encoded.Length>8192)throw new Exception("application_action_denied");
   var input=json.Deserialize<Dictionary<string,object>>(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
   foreach(string key in input.Keys)if(key!="action"&&key!="path"&&key!="window"&&key!="images")throw new Exception("application_action_denied");
   if(!input.ContainsKey("action")||!Object.Equals(input["action"],"observe")||!input.ContainsKey("path")||!(input["path"] is string)||!input.ContainsKey("window")||!(input["window"] is string))throw new Exception("application_action_denied");
   string expected=(string)input["path"],window=(string)input["window"];long handle;
   if(expected.Length>2000||!System.Text.RegularExpressions.Regex.IsMatch(expected,@"^[a-zA-Z]:\\")||System.Text.RegularExpressions.Regex.IsMatch(expected,@"[\x00-\x1f\x7f]"))throw new Exception("application_path_denied");
   if(!System.Text.RegularExpressions.Regex.IsMatch(window,@"^\d{1,19}$")||!Int64.TryParse(window,out handle)||handle<=0)throw new Exception("application_window_changed");
   object images;input.TryGetValue("images",out images);if(images!=null&&!(images is bool))throw new Exception("application_action_denied");
   var result=StudioApplications.Observe(window,expected,Object.Equals(images,true));
   Console.Write(json.Serialize(new {ok=true,value=result}));return 0;
  }catch(Exception error){string code=System.Text.RegularExpressions.Regex.IsMatch(error.Message,@"^application_[a-z_]+$")?error.Message:"application_native_unavailable";Console.Write(json.Serialize(new {ok=false,error=code}));return 1;}
 }
}`
const moduleDirectory=path.dirname(fileURLToPath(import.meta.url))
const bundledWindowProbe=path.basename(path.dirname(moduleDirectory))==='app'?path.resolve(moduleDirectory,'../../native/application-window-probe.exe'):null
const bundledObserver=path.basename(path.dirname(moduleDirectory))==='app'?path.resolve(moduleDirectory,'../../native/application-observer.exe'):null

const wrapper=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try{
 $v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_APPLICATION_INPUT))|ConvertFrom-Json
 $result=$null
 if($v.action -eq 'discover'){
  $rows=New-Object Collections.Generic.List[object];$shell=New-Object -ComObject WScript.Shell
  foreach($reg in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')){foreach($entry in @(Get-ChildItem -LiteralPath $reg -ErrorAction SilentlyContinue|Select-Object -First 600)){try{$meta=Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction Stop;if($meta.DisplayName -and $meta.DisplayIcon -is [string]){$rows.Add(@{name=[string]$meta.DisplayName;icon=[Environment]::ExpandEnvironmentVariables($meta.DisplayIcon)})}}catch{}}}
  foreach($folder in @([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'),[Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('CommonDesktopDirectory'))){if($folder){foreach($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue|Select-Object -First 300)){try{$link=$shell.CreateShortcut($file.FullName);$p=[string]$link.TargetPath;if($p -match '^[a-z]:\\' -and $p.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){$rows.Add(@{name=$file.BaseName;path=$p;workingDirectory=[string]$link.WorkingDirectory})}}catch{}}}}
  foreach($p in @(Get-Process -ErrorAction SilentlyContinue|Where-Object {$_.MainWindowHandle -ne 0}|Select-Object -First 100)){try{if($p.Path){$rows.Add(@{name=$p.ProcessName;path=$p.Path})}}catch{}}
  foreach($reg in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths')){foreach($entry in @(Get-ChildItem -LiteralPath $reg -ErrorAction SilentlyContinue)){$p=(Get-ItemProperty -LiteralPath $entry.PSPath).'(default)';if($p -is [string]){$rows.Add(@{name=$entry.PSChildName;path=$p.Trim('"')})}}}
  $cli=Get-Command codex.exe -ErrorAction SilentlyContinue;if($cli){$rows.Add(@{name='Codex CLI';path=$cli.Source;adapter='codex'})}
  # The Codex desktop installer keeps its CLI below this per-user directory;
  # Explorer-launched apps do not inherit the coding session's augmented PATH.
  $codexBin=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  if(Test-Path -LiteralPath $codexBin -PathType Container){foreach($version in @(Get-ChildItem -LiteralPath $codexBin -Directory -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 3)){$candidate=Join-Path $version.FullName 'codex.exe';if(Test-Path -LiteralPath $candidate -PathType Leaf){$rows.Add(@{name='Codex CLI';path=$candidate;adapter='codex'})}}}
  $result=@($rows|Select-Object -First 3000)
 }elseif($v.action -eq 'windows'){
 $code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_APPLICATION_CODE))
 Add-Type -TypeDefinition $code
 $result=@([StudioApplications]::Windows([string]$v.path))
 if($v.reveal -eq $true -and $result.Count -gt 0){$result[0]=[StudioApplications]::Reveal([string]$result[0].id,[string]$v.path)}
 }else{
 Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase,System.Drawing
 $code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:STUDIO_APPLICATION_CODE))
 Add-Type -TypeDefinition $code -ReferencedAssemblies @([Windows.Automation.AutomationElement].Assembly.Location,[Windows.Automation.ControlType].Assembly.Location,[Windows.Rect].Assembly.Location,[Drawing.Bitmap].Assembly.Location)
 if($v.action -eq 'observe'){$result=[StudioApplications]::Observe([string]$v.window,[string]$v.path,[bool]$v.images)}
 elseif($v.action -eq 'act'){[StudioApplications]::Act([string]$v.window,[string]$v.path,[string]$v.title,[string]$v.kind,[int]$v.element,[string]$v.name,[string]$v.runtime,[string]$v.text,[string]$v.key);$result=@{accepted=$true}}
 else{throw 'application_action_denied'}
 }
 [Console]::Write((@{ok=$true;value=$result}|ConvertTo-Json -Depth 8 -Compress))
}catch{$errorCode=[string]$_.Exception.Message;$match=[regex]::Match($errorCode,'application_[a-z_]+');if($match.Success){$errorCode=$match.Value}else{$errorCode='application_native_unavailable'};[Console]::Write((@{ok=$false;error=$errorCode}|ConvertTo-Json -Compress));exit 1}`

export function applicationNative(input,{execute=execFile,signal,platform=process.platform,timeout=input.action==='observe'?35000:20000,windowProbe=bundledWindowProbe,observer=bundledObserver}={}){
 if(platform!=='win32')return Promise.reject(Error('application_windows_required'))
 signal?.throwIfAborted()
 const compiled=input.action==='windows'?windowProbe:input.action==='observe'?observer:null
 const command=compiled||path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
 const args=compiled?[]:['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(wrapper,'utf16le').toString('base64')]
 return new Promise((resolve,reject)=>execute(command,args,{windowsHide:true,shell:false,encoding:'utf8',maxBuffer:4*1024*1024,timeout,signal,env:{...process.env,...(!compiled?{STUDIO_APPLICATION_CODE:Buffer.from(input.action==='windows'?APPLICATION_WINDOW_CODE:APPLICATION_NATIVE_CODE).toString('base64')}:{}),STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify(input)).toString('base64')}},(error,out)=>{
  if(signal?.aborted)return reject(signal.reason)
  let v;try{v=JSON.parse(String(out).trim())}catch{return reject(Error(error?.killed?'application_native_timeout':'application_native_unavailable'))}
  if(v.ok!==true)return reject(Error(/^application_[a-z_]+$/.test(v.error)?v.error:'application_native_unavailable'))
  if(error)return reject(Error('application_native_unavailable'))
  resolve(v.value)
 }))
}
