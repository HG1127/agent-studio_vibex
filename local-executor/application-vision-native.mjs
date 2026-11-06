import {execFile} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {APPLICATION_NATIVE_CODE} from './application-native.mjs'

// Fixed product code, compiled at build time. Coordinates are relative to the
// authorized window, never an unrestricted desktop or a model-provided script.
const methods=String.raw`
 delegate IntPtr InputHook(int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int kind,InputHook callback,IntPtr module,uint thread);
 [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string name);
 [StructLayout(LayoutKind.Sequential)]struct HookKey{public uint key,scan,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct HookMouse{public Point point;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct NativeMessage{public IntPtr window;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public Point point;public uint extra;}
 [DllImport("user32.dll")]static extern int GetMessage(out NativeMessage message,IntPtr window,uint min,uint max);
 [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
 sealed class PhysicalInputGuard:IDisposable{
  readonly System.Threading.ManualResetEvent ready=new System.Threading.ManualResetEvent(false);readonly System.Threading.Thread thread;
  InputHook keyboard,mouse;IntPtr kh,mh;uint threadId;int physical;bool started;
  public PhysicalInputGuard(){thread=new System.Threading.Thread(Run);thread.IsBackground=true;thread.Start();if(!ready.WaitOne(2000)||!started){Dispose();throw new Exception("application_desktop_unavailable");}}
  void Run(){threadId=GetCurrentThreadId();keyboard=(code,msg,data)=>{if(code>=0&&(((HookKey)Marshal.PtrToStructure(data,typeof(HookKey))).flags&0x10)==0)System.Threading.Interlocked.Exchange(ref physical,1);return CallNextHookEx(IntPtr.Zero,code,msg,data);};mouse=(code,msg,data)=>{if(code>=0&&(((HookMouse)Marshal.PtrToStructure(data,typeof(HookMouse))).flags&1)==0)System.Threading.Interlocked.Exchange(ref physical,1);return CallNextHookEx(IntPtr.Zero,code,msg,data);};
   try{kh=SetWindowsHookEx(13,keyboard,GetModuleHandle(null),0);mh=SetWindowsHookEx(14,mouse,GetModuleHandle(null),0);started=kh!=IntPtr.Zero&&mh!=IntPtr.Zero;ready.Set();if(started){NativeMessage message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){}}}
   finally{if(kh!=IntPtr.Zero)UnhookWindowsHookEx(kh);if(mh!=IntPtr.Zero)UnhookWindowsHookEx(mh);ready.Set();}
  }
  public void Check(){if(System.Threading.Interlocked.CompareExchange(ref physical,0,0)!=0)throw new Exception("application_user_takeover");}
  public void Dispose(){if(threadId!=0)PostThreadMessage(threadId,0x0012,UIntPtr.Zero,IntPtr.Zero);if(thread!=null&&thread.IsAlive)thread.Join(600);}
 }
 [StructLayout(LayoutKind.Sequential)]struct GuiInfo{public uint size,flags;public IntPtr active,focus,capture,menu,move,caret;public Rect caretRect;}
 [DllImport("user32.dll")]static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,System.Text.StringBuilder value,int max);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr WindowStyle(IntPtr h,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessage(IntPtr h,uint message,IntPtr wParam,IntPtr lParam);
 static void VisualFocus(IntPtr h){uint pid;var thread=GetWindowThreadProcessId(h,out pid);var info=new GuiInfo();info.size=(uint)Marshal.SizeOf(typeof(GuiInfo));
  if(!GetGUIThreadInfo(thread,ref info)||info.focus==IntPtr.Zero||GetAncestor(info.focus,2)!=h)throw new Exception("application_focus_changed");
  var name=new System.Text.StringBuilder(256);GetClassName(info.focus,name,256);string cls=name.ToString();
  bool editor=System.Text.RegularExpressions.Regex.IsMatch(cls,@"(^|\.)Edit(\.|$)|RichEdit",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  if(System.Text.RegularExpressions.Regex.IsMatch(cls,@"password|credential|terminal|xterm",System.Text.RegularExpressions.RegexOptions.IgnoreCase)||editor&&((WindowStyle(info.focus,-16).ToInt64()&0x20)!=0||SendMessage(info.focus,0x00D2,IntPtr.Zero,IntPtr.Zero)!=IntPtr.Zero))throw new Exception("application_sensitive_control");
 }
 public static View ObserveVisual(string id,string exe,bool activate){
  SetProcessDPIAware();if(activate)Reveal(id,exe);
  var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);
  var view=new View{window=w,input=InputEpoch(),controls=new List<Control>()};
  if(IsIconic(h))throw new Exception("application_foreground_unavailable");
  Capture(view,h,w);var after=Get(h,exe);if(after.pid!=w.pid||after.title!=w.title||after.x!=w.x||after.y!=w.y||after.width!=w.width||after.height!=w.height)throw new Exception("application_window_changed");return view;
 }
 static void VisualPoint(IntPtr h,Win w,int x,int y){
  if(x<0||y<0||x>=w.width||y>=w.height)throw new Exception("application_coordinate_denied");
  var owner=GetAncestor(WindowFromPoint(new Point(w.x+x,w.y+y)),2);
  if(owner!=h)throw new Exception("application_point_covered");
 }
 public static void ActVisual(string id,string exe,string title,int pid,int wx,int wy,int width,int height,int x,int y,string kind,string text,string key,int scrollY){
  using(var takeover=new PhysicalInputGuard()){
  SetProcessDPIAware();var h=new IntPtr(Int64.Parse(id));var w=Get(h,exe);
  if(w.title!=title||w.pid!=pid||w.x!=wx||w.y!=wy||w.width!=width||w.height!=height)throw new Exception("application_window_changed");
  uint epoch=InputEpoch();RequireForeground(h,epoch);w=Get(h,exe);
  if(w.title!=title||w.pid!=pid||w.x!=wx||w.y!=wy||w.width!=width||w.height!=height)throw new Exception("application_window_changed");
  VisualPoint(h,w,x,y);takeover.Check();if(InputEpoch()!=epoch)throw new Exception("application_user_takeover");
  // UIA is not used for locating or focusing the target. Keyboard operations
  // preserve the focus established by the preceding separately observed click.
  if(!SetCursorPos(w.x+x,w.y+y))throw new Exception("application_input_failed");
  if(kind=="scroll"){
   if(scrollY==0||Math.Abs(scrollY)>10)throw new Exception("application_action_denied");
   for(int n=0;n<Math.Abs(scrollY);n++){takeover.Check();if(!ForegroundMatches(h))throw new Exception("application_focus_changed");VisualPoint(h,w,x,y);var i=new Input();i.type=0;i.data.mouse.flags=0x0800;i.data.mouse.data=unchecked((uint)(scrollY>0?-120:120));if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("application_input_failed");}return;
  }
  if(kind=="click"){takeover.Check();MouseInput(2);MouseInput(4);return;}
  if(!ForegroundMatches(h))throw new Exception("application_focus_changed");
  VisualFocus(h);
  var now=Get(h,exe);if(now.pid!=pid||now.width!=width||now.height!=height)throw new Exception("application_window_changed");
  if(kind=="type"){if(text.Length==0)throw new Exception("application_action_denied");foreach(char c in text){takeover.Check();if(!ForegroundMatches(h))throw new Exception("application_focus_changed");VisualFocus(h);Text(c.ToString());}}
  else if(kind=="key"){
   var keys=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"Up",38},{"Down",40},{"Left",37},{"Right",39},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34}};
   if(!keys.ContainsKey(key))throw new Exception("application_key_denied");takeover.Check();Key(keys[key],false);Key(keys[key],true);
  }else throw new Exception("application_action_denied");
  }
 }
`
const shared=APPLICATION_NATIVE_CODE.slice(0,APPLICATION_NATIVE_CODE.lastIndexOf('\n}'))+methods+'\n}\n'
export const APPLICATION_VISION_EXECUTABLE_CODE=shared+String.raw`
public static class StudioVisionEntry {
 static string Text(Dictionary<string,object> v,string key,int max){object value;if(!v.TryGetValue(key,out value)||!(value is string)||((string)value).Length>max)throw new Exception("application_action_denied");return (string)value;}
 static int Number(Dictionary<string,object> v,string key){object value;if(!v.TryGetValue(key,out value)||!(value is int))throw new Exception("application_action_denied");return (int)value;}
 [STAThread]public static int Main(){var json=new System.Web.Script.Serialization.JavaScriptSerializer();json.MaxJsonLength=3*1024*1024;
  try{string encoded=Environment.GetEnvironmentVariable("STUDIO_APPLICATION_INPUT");if(encoded==null||encoded.Length>65536)throw new Exception("application_action_denied");
   var input=json.Deserialize<Dictionary<string,object>>(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
   string action=Text(input,"action",20),exe=Text(input,"path",2000),window=Text(input,"window",20);long handle;
   if(!System.Text.RegularExpressions.Regex.IsMatch(exe,@"^[a-zA-Z]:\\")||System.Text.RegularExpressions.Regex.IsMatch(exe,@"[\x00-\x1f\x7f]")||!Int64.TryParse(window,out handle)||handle<=0)throw new Exception("application_action_denied");
   if(action=="observe"){
    if(input.Count!=4||!input.ContainsKey("activate")||!(input["activate"] is bool))throw new Exception("application_action_denied");
    Console.Write(json.Serialize(new {ok=true,value=StudioApplications.ObserveVisual(window,exe,(bool)input["activate"])}));return 0;
   }
   string[] fields={"action","path","window","title","pid","windowX","windowY","width","height","x","y","kind","text","key","scrollY"};
   if(action!="act"||input.Count!=fields.Length)throw new Exception("application_action_denied");foreach(string k in input.Keys)if(Array.IndexOf(fields,k)<0)throw new Exception("application_action_denied");
   string kind=Text(input,"kind",12),text=Text(input,"text",4000),key=Text(input,"key",20);
   if(Array.IndexOf(new string[]{"click","type","key","scroll"},kind)<0||System.Text.RegularExpressions.Regex.IsMatch(text,@"[\x00-\x1f\x7f]"))throw new Exception("application_action_denied");
   if(kind!="type"&&text.Length!=0||kind!="key"&&key.Length!=0||kind!="scroll"&&Number(input,"scrollY")!=0)throw new Exception("application_action_denied");
   StudioApplications.ActVisual(window,exe,Text(input,"title",512),Number(input,"pid"),Number(input,"windowX"),Number(input,"windowY"),Number(input,"width"),Number(input,"height"),Number(input,"x"),Number(input,"y"),kind,text,key,Number(input,"scrollY"));
   Console.Write(json.Serialize(new {ok=true,value=new {accepted=true}}));return 0;
  }catch(Exception error){var code=System.Text.RegularExpressions.Regex.IsMatch(error.Message,@"^application_[a-z_]+$")?error.Message:"application_native_unavailable";Console.Write(json.Serialize(new {ok=false,error=code}));return 1;}
 }
}
`
const directory=path.dirname(fileURLToPath(import.meta.url))
const bundled=path.basename(path.dirname(directory))==='app'?path.resolve(directory,'../../native/application-vision.exe'):null
export function applicationVisionNative(input,{execute=execFile,signal,binary=bundled,platform=process.platform}={}){
 if(platform!=='win32')return Promise.reject(Error('application_windows_required'))
 if(!binary)return Promise.reject(Error('application_vision_unavailable'))
 signal?.throwIfAborted()
 return new Promise((resolve,reject)=>execute(binary,[],{windowsHide:true,shell:false,encoding:'utf8',maxBuffer:3*1024*1024,timeout:15000,signal,env:{...process.env,STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify(input)).toString('base64')}},(error,out)=>{
  if(signal?.aborted)return reject(signal.reason)
  let result;try{result=JSON.parse(String(out).trim())}catch{return reject(Error('application_native_unavailable'))}
  if(result.ok!==true)return reject(Error(/^application_[a-z_]+$/.test(result.error)?result.error:'application_native_unavailable'))
  if(error)return reject(Error('application_native_unavailable'));resolve(result.value)
 }))
}
