// Owned windows only: force PrintWindow failure/timeout and verify the bounded
// visible fallback, exact identity and occlusion refusal with real native APIs.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {APPLICATION_VISION_EXECUTABLE_CODE,applicationVisionNative} from '../local-executor/application-vision-native.mjs'
const root=process.cwd(),base=path.join(root,'.tmp');await fs.mkdir(base,{recursive:true})
const directory=await fs.mkdtemp(path.join(base,'bounded-capture-')),exe=path.join(directory,'CaptureFixture.exe')
const execute=promisify(execFile),compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),framework=path.dirname(compiler)
let child
const wait=async(fn,label)=>{for(let n=0;n<100;n++){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('fixture timeout: '+label)}
try{
 const source=String.raw`using System;using System.IO;using System.Drawing;using System.Windows.Forms;using System.Web.Script.Serialization;using System.Runtime.InteropServices;
class Cover:Form{protected override bool ShowWithoutActivation{get{return true;}}protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x08000080;return p;}}}
class Fixture{[DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);[STAThread]static void Main(string[] args){var home=AppDomain.CurrentDomain.BaseDirectory;var json=new JavaScriptSerializer();
 if(args.Length==1&&args[0]=="pixels"){using(var b=new Bitmap(Path.Combine(home,"image.png"))){var p=b.GetPixel(b.Width/2,b.Height/2);File.WriteAllText(Path.Combine(home,"pixels.json"),json.Serialize(new{r=p.R,g=p.G,b=p.B}));}return;}
 Application.EnableVisualStyles();var f=new Form{Text="Synthetic bounded capture fixture",Width=640,Height=420,BackColor=Color.Lime,TopMost=true,StartPosition=FormStartPosition.CenterScreen};
 var cover=new Cover{Text="Synthetic occluder",Width=120,Height=120,BackColor=Color.Magenta,TopMost=true,ShowInTaskbar=false,StartPosition=FormStartPosition.Manual};var other=new Form{Text="Synthetic background owner",Width=150,Height=100,StartPosition=FormStartPosition.Manual,Location=new Point(10,10)};string previous="";
 f.Shown+=(s,e)=>{f.Activate();File.WriteAllText(Path.Combine(home,"window.json"),json.Serialize(new{id=f.Handle.ToInt64().ToString()}));};
 var timer=new Timer{Interval=100};timer.Tick+=(s,e)=>{try{var mode=File.ReadAllText(Path.Combine(home,"mode.txt"));if(mode==previous)return;previous=mode;if(mode=="covered"){other.Hide();f.Activate();cover.Location=new Point(f.Left+200,f.Top+150);cover.Show();SetForegroundWindow(f.Handle);SetWindowPos(cover.Handle,new IntPtr(-1),f.Left+200,f.Top+150,120,120,0x0050);}else if(mode=="background"){cover.Hide();other.Show();other.Activate();SetForegroundWindow(other.Handle);}else{cover.Hide();other.Hide();f.Activate();}File.WriteAllText(Path.Combine(home,"phase.txt"),mode);}catch{}};timer.Start();Application.Run(f);}}
`
 const fixtureSource=path.join(directory,'fixture.cs');await fs.writeFile(fixtureSource,source)
 await execute(compiler,['/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+exe,fixtureSource],{windowsHide:true,timeout:30000})
 assert.ok(APPLICATION_VISION_EXECUTABLE_CODE.includes('ok=PrintWindow(h,dc,2);'))
 const helpers={}
 for(const [name,replacement] of [['failed','ok=false;'],['timeout','System.Threading.Thread.Sleep(3500);ok=false;']]){
  const cs=path.join(directory,name+'.cs'),binary=path.join(directory,name+'.exe')
  await fs.writeFile(cs,APPLICATION_VISION_EXECUTABLE_CODE.replace('ok=PrintWindow(h,dc,2);',replacement))
  await execute(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...['UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll'].map(file=>'/reference:'+path.join(framework,'WPF',file)),'/out:'+binary,cs],{windowsHide:true,timeout:30000})
  helpers[name]=binary
 }
 child=spawn(exe,[],{windowsHide:false,stdio:'ignore',shell:false})
 const metadata=await wait(async()=>JSON.parse(await fs.readFile(path.join(directory,'window.json'),'utf8').catch(()=>'null')),'window ready')
 const mode=async value=>{await fs.writeFile(path.join(directory,'mode.txt'),value);await wait(async()=>await fs.readFile(path.join(directory,'phase.txt'),'utf8').catch(()=>'')===value,value)}
 const observe=(name,extra={})=>applicationVisionNative({action:'observe',path:exe,window:metadata.id,activate:false,...extra},{binary:helpers[name]})
 await mode('clear');const visible=await observe('failed',{activate:true});assert.equal(visible.imageSource,'visible_window',JSON.stringify({error:visible.imageError,window:visible.window}));assert.ok(visible.image);assert.equal(visible.window.id,metadata.id)
 await fs.writeFile(path.join(directory,'image.png'),Buffer.from(visible.image,'base64'));await execute(exe,['pixels'],{windowsHide:true,timeout:10000})
 const pixel=JSON.parse(await fs.readFile(path.join(directory,'pixels.json'),'utf8'));assert.ok(pixel.g>=240&&pixel.r<=20&&pixel.b<=20,'fallback contains actual green fixture pixels')
 const timed=await observe('timeout');assert.equal(timed.imageSource,'visible_window');assert.ok(timed.image)
 await mode('covered');const covered=await observe('failed');assert.equal(covered.window.foreground,true,JSON.stringify({error:covered.imageError,foreground:covered.window.foreground}));assert.equal(covered.imageError,'application_window_occluded');assert.ok(!covered.image)
 await mode('background');const background=await observe('failed');assert.equal(background.imageError,'application_foreground_unavailable');assert.ok(!background.image)
 await assert.rejects(observe('failed',{path:path.join(directory,'not-the-authorized.exe')}),/window_changed/)
 console.log('BOUNDED_CAPTURE_ACCEPTANCE '+JSON.stringify({status:'PASS',actualFixturePixels:true,printWindowFailure:true,printWindowTimeout:true,occlusionDenied:true,backgroundDenied:true,wrongExecutableDenied:true,productionData:false}))
}finally{
 if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve)})}
 assert.equal(path.dirname(await fs.realpath(directory)),await fs.realpath(base));assert.equal((await fs.lstat(directory)).isSymbolicLink(),false)
 await fs.rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:250})
}
