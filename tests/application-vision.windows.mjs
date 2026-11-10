// Characterizes real native foreground restoration against owned WinForms windows.
// The approval fixture remains open after consent; no employee app, account,
// model call, production service or actual permission window is involved.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {inspectApplication,registerApplications} from '../local-executor/applications.mjs'
import {applicationNative} from '../local-executor/application-native.mjs'
import {applicationVisionNative} from '../local-executor/application-vision-native.mjs'
import {buildApplicationWindowProbe} from '../ops/build-application-window-probe.mjs'

const root=await fs.realpath(process.cwd()),base=path.join(root,'.tmp'),evidence=path.join(base,'visual-input-loop')
await fs.mkdir(base,{recursive:true})
assert.equal((await fs.lstat(base)).isSymbolicLink(),false,'temporary parent must not be a directory link')
const run=await fs.mkdtemp(path.join(base,'vision-native-')),exe=path.join(run,'VisionFixture.exe'),codeFile=path.join(run,'fixture.cs')
const priorTemp=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(key=>[key,process.env[key]]))
let child,runtime,childError,failure,lastImage,sequence=0,approvals=0,processStopped=true,runRemoved=false,evidenceSafe=false
const summary={status:'FAIL',productionData:false,ownedApprovalWindow:true},cleanupErrors=[]
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const source=String.raw`using System;using System.IO;using System.Drawing;using System.Windows.Forms;using System.Web.Script.Serialization;using System.Runtime.InteropServices;using System.Collections.Generic;
class Fixture {
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")]static extern bool IsProcessDPIAware();
 [STAThread]static void Main(){
  if(!SetProcessDPIAware()&&!IsProcessDPIAware())throw new Exception("fixture_dpi_awareness_unavailable");
  Application.EnableVisualStyles();var home=AppDomain.CurrentDomain.BaseDirectory;var json=new JavaScriptSerializer();
  var f=new Form{Text="Synthetic visual acceptance fixture",Width=640,Height=420,StartPosition=FormStartPosition.CenterScreen};
  var input=new TextBox{Name="target-editor",Left=30,Top=45,Width=510,Text="已有草稿："};
  var button=new Button{Left=30,Top=105,Width=230,Text="Save synthetic receipt"};
  var password=new TextBox{Left=30,Top=170,Width=230,UseSystemPasswordChar=true};
  f.Controls.AddRange(new Control[]{input,button,password});
  // This is a separate unowned top-level window. Do not close/hide it on consent:
  // an OS restoration caused by dismissing a dialog would not test the native code.
  var approval=new Form{Text="Synthetic visual approval fixture",Width=300,Height=170,StartPosition=FormStartPosition.Manual,Location=new Point(10,10)};
  var approvalInput=new TextBox{Name="approval-editor",Left=15,Top=35,Width=250};approval.Controls.Add(approvalInput);
  int count=0,last=0;var timer=new Timer{Interval=50};
  button.Click+=(s,e)=>File.WriteAllText(Path.Combine(home,"receipt.json"),json.Serialize(new{text=input.Text,count=++count}));
  Func<int,object> state=n=>new{sequence=n,target=f.Handle.ToInt64().ToString(),approval=approval.Handle.ToInt64().ToString(),foreground=GetForegroundWindow().ToInt64().ToString(),targetText=input.Text,approvalText=approvalInput.Text,passwordEmpty=password.Text.Length==0,count=count,approvalVisible=approval.Visible,targetEditorFocused=input.Focused};
  timer.Tick+=(s,e)=>{
   try{
    var command=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(home,"command.json")));
    int n=Convert.ToInt32(command["sequence"]);if(n<=last)return;string action=(string)command["action"];
    if(action=="close"){last=n;f.Close();return;}
    if(action=="approval"){
     approval.Show();approval.Activate();approval.BringToFront();approvalInput.Focus();SetForegroundWindow(approval.Handle);
    }else if(action!="snapshot")throw new Exception("unknown_fixture_command");
    File.WriteAllText(Path.Combine(home,"state.json"),json.Serialize(state(n)));last=n;
   }catch(IOException){}catch(ArgumentException){}catch(InvalidOperationException){}
  };
  f.Shown+=(s,e)=>{
   Func<Control,int[]> point=c=>{var p=c.PointToScreen(new Point(c.Width/2,c.Height/2));return new[]{p.X-f.Left,p.Y-f.Top};};
   f.Activate();SetForegroundWindow(f.Handle);
   File.WriteAllText(Path.Combine(home,"window.json"),json.Serialize(new{id=f.Handle.ToInt64().ToString(),approval=approval.Handle.ToInt64().ToString(),input=point(input),button=point(button),password=point(password)}));timer.Start();
  };
  try{Application.Run(f);}finally{timer.Stop();timer.Dispose();approval.Close();approval.Dispose();f.Dispose();}
 }
}
`

async function waitFor(read,label,timeoutMs=6000){
 const deadline=Date.now()+timeoutMs
 while(Date.now()<deadline){
  if(childError)throw childError
  if(child&&(child.exitCode!==null||child.signalCode!==null))throw Error('owned_fixture_exited_before_'+label)
  const value=await read();if(value)return value
  await pause(50)
 }
 throw Error('owned_fixture_timeout:'+label)
}
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error}}
async function command(action){
 const n=++sequence
 await fs.writeFile(path.join(run,'command.json'),JSON.stringify({sequence:n,action}))
 return waitFor(async()=>{const state=await readJson(path.join(run,'state.json'));return state?.sequence===n?state:null},action)
}
async function waitForExit(timeoutMs){
 if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return true
 return new Promise(resolve=>{
  const done=()=>{clearTimeout(timer);resolve(true)},timer=setTimeout(()=>{child.off('exit',done);resolve(false)},timeoutMs)
  child.once('exit',done)
 })
}
async function removeOwnedRun(){
 const actual=await fs.realpath(run),parent=await fs.realpath(base)
 assert.equal(parent,base,'temporary parent must still resolve inside this workspace')
 assert.equal(path.dirname(actual),parent,'cleanup must stay in the owned temporary parent')
 assert.ok(path.basename(actual).startsWith('vision-native-'))
 assert.equal((await fs.lstat(run)).isSymbolicLink(),false)
 const rejectLinks=async directory=>{for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('unexpected_fixture_directory_link');if(entry.isDirectory())await rejectLinks(path.join(directory,entry.name))}}
 await rejectLinks(actual)
 await fs.rm(actual,{recursive:true,force:true,maxRetries:8,retryDelay:250})
 runRemoved=true
}
async function regularEvidence(file){
 try{const stat=await fs.lstat(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'existing evidence must be an unlinked regular file')}
 catch(error){if(error.code!=='ENOENT')throw error}
}
function safeError(error){return String(error?.message||error).replace(/[a-f0-9]{24,}/gi,'[redacted]').slice(0,500)}

try{
 const temporary=path.join(run,'temp');await fs.mkdir(temporary)
 for(const key of Object.keys(priorTemp))process.env[key]=temporary
 await fs.writeFile(codeFile,source)
 const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
 await promisify(execFile)(compiler,['/nologo','/codepage:65001','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+exe,codeFile],{windowsHide:true,shell:false,timeout:30000})
 await buildApplicationWindowProbe(path.join(run,'helpers'))
 child=spawn(exe,[],{windowsHide:false,stdio:'ignore',shell:false,env:{...process.env}});processStopped=false
 child.once('error',error=>{childError=error})
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
 const readinessStarted=Date.now()
 const metadata=await waitFor(()=>readJson(path.join(run,'window.json')),'window_ready',30000)
 summary.windowReadyMs=Date.now()-readinessStarted
 const grant=await inspectApplication(exe,{name:'Synthetic visual acceptance fixture',control:true}),tools=new Map()
 runtime=registerApplications({
  config:{roots:[{name:'work',path:run}],applications:{format:'agent-studio-applications-v1',enabled:true,images:true,grants:[grant]}},
  add:(name,_description,_schema,fn)=>tools.set(name,fn),
  native:(input,options)=>applicationNative(input,{...options,windowProbe:path.join(run,'helpers/native/application-window-probe.exe')}),
  nativeVision:(input,options)=>applicationVisionNative(input,{...options,binary:path.join(run,'helpers/native/application-vision.exe')}),
  confirm:async review=>{
   assert.equal(review.kind,'application');assert.ok(review.message.includes(grant.name))
   const state=await command('approval')
   assert.equal(state.foreground,metadata.approval,'test setup must actually make the approval window foreground')
   assert.notEqual(state.foreground,metadata.id)
   assert.equal(state.approvalVisible,true);assert.equal(state.approvalText,'')
   approvals++;return true
  },
 })
 const call=async(name,args)=>{
  const result=await tools.get(name)({app:grant.id,...args})
  if(typeof result==='string')return JSON.parse(result)
  lastImage=Buffer.from(result.images[0].data,'base64');return JSON.parse(result.text)
 }
 const inspect=async({text,count,editor=false})=>{
  const state=await command('snapshot')
  assert.equal(state.foreground,metadata.id,'native action must restore the actual target, with the approval window still open')
  assert.equal(state.approvalVisible,true,'approval must not close itself to restore foreground')
  assert.equal(state.approvalText,'','approval window must never receive the target text')
  assert.equal(state.targetText,text);assert.equal(state.count,count);assert.equal(state.passwordEmpty,true)
  if(editor)assert.equal(state.targetEditorFocused,true,'typing must preserve the separately clicked editor')
  return state
 }
 await call('apps.launch',{})
 let observed=await call('apps.observe_visual',{window:metadata.id})
 assert.equal(observed.actionable,true)
 await assert.rejects(call('apps.act_visual',{observation:observed.observation,window:metadata.approval,x:1,y:1,action:'click'}),/application_window_changed/)
 assert.equal(approvals,0,'a mismatched window echo cannot request approval or target the approval fixture')
 observed=await call('apps.observe_visual',{window:metadata.id})
 const point=name=>({x:Math.floor(metadata[name][0]*observed.imageSize.width/observed.window.width),y:Math.floor(metadata[name][1]*observed.imageSize.height/observed.window.height)})
 const draft='已有草稿：',addition='审批后追加中文，保留原草稿',text=draft+addition
 observed=await call('apps.act_visual',{observation:observed.observation,window:metadata.id,...point('input'),action:'click'})
 assert.equal(observed.accepted,true);await inspect({text:draft,count:0,editor:true})
 observed=await call('apps.act_visual',{observation:observed.observation,window:metadata.id,...point('input'),action:'type',text:addition})
 assert.equal(observed.accepted,true);await inspect({text,count:0,editor:true})
 const spent=observed.observation
 observed=await call('apps.act_visual',{observation:spent,...point('button'),action:'click'})
 assert.equal(observed.accepted,true);await inspect({text,count:1})
 const receipt=await readJson(path.join(run,'receipt.json'));assert.deepEqual(receipt,{text,count:1})
 assert.equal(approvals,3,'click, append and save must each have a separate foreground-stealing approval')
 const expired=await call('apps.act_visual',{observation:spent,window:metadata.id,...point('button'),action:'click'})
 assert.equal(expired.status,'needs_observation');assert.equal(expired.effectState,'not_started');assert.equal(expired.accepted,false)
 assert.equal(approvals,3,'spent credentials cannot request approval or replay the save')
 await inspect({text,count:1});assert.deepEqual(await readJson(path.join(run,'receipt.json')),receipt)
 observed=await call('apps.observe_visual',{window:metadata.id})
 observed=await call('apps.act_visual',{observation:observed.observation,...point('password'),action:'click'})
 assert.equal(observed.accepted,true)
 await assert.rejects(call('apps.act_visual',{observation:observed.observation,...point('password'),action:'type',text:'MUST_NOT_ENTER'}),/sensitive_control/)
 await inspect({text,count:1});assert.deepEqual(await readJson(path.join(run,'receipt.json')),receipt)
 assert.equal(approvals,5)
 Object.assign(summary,{status:'PASS',matchingWindowEcho:true,mismatchedWindowDenied:true,legacyWindowOmission:true,realNativeClick:true,realNativeTyping:true,controlTreeRequired:false,foregroundRestoredAfterEachApproval:true,approvalRemainedVisible:true,approvalTextUnchanged:true,chineseAppendPreservedDraft:true,saveCount:1,oneUseToken:true,passwordInputDenied:true,approvals})
}catch(error){failure=error;summary.error=safeError(error)}finally{
 try{await runtime?.close()}catch(error){cleanupErrors.push('runtime:'+safeError(error))}
 if(child){
  try{
   if(child.pid&&child.exitCode===null&&child.signalCode===null){
    await fs.writeFile(path.join(run,'command.json'),JSON.stringify({sequence:++sequence,action:'close'})).catch(()=>{})
    if(!await waitForExit(2500)){child.kill();if(!await waitForExit(3000))throw Error('owned_fixture_process_did_not_exit')}
   }
   processStopped=!child.pid||child.exitCode!==null||child.signalCode!==null
  }catch(error){cleanupErrors.push('process:'+safeError(error));processStopped=false}
 }
 for(const [key,value] of Object.entries(priorTemp)){if(value===undefined)delete process.env[key];else process.env[key]=value}
 try{
  assert.equal((await fs.lstat(base)).isSymbolicLink(),false)
  assert.equal(await fs.realpath(base),base)
  await fs.mkdir(evidence,{recursive:true})
  assert.equal((await fs.lstat(evidence)).isSymbolicLink(),false,'evidence directory must not be linked')
  assert.equal(path.dirname(await fs.realpath(evidence)),await fs.realpath(base))
  evidenceSafe=true
  const image=path.join(evidence,'native-focus-failure.png');await regularEvidence(image)
  if(failure&&lastImage){
   await fs.writeFile(image,lastImage)
   summary.failureImage={file:image,purpose:'Latest owned-window observation for diagnosing this failed focus check.',cleanup:'Remove after diagnosis or the next passing native focus run.'}
  }
  else await fs.rm(image,{force:true})
 }catch(error){cleanupErrors.push('evidence:'+safeError(error))}
 if(processStopped){try{await removeOwnedRun()}catch(error){cleanupErrors.push('directory:'+safeError(error))}}
 if(!runRemoved){summary.retainedRun=run;summary.retentionReason='Remove this exclusively owned fixture after its process/handles or unsafe cleanup condition is resolved.'}
 summary.cleanup={processStopped,runRemoved,errors:cleanupErrors}
 if(cleanupErrors.length||!runRemoved)summary.status='FAIL'
 if(evidenceSafe){
  try{const file=path.join(evidence,'native-focus-summary.json');await regularEvidence(file);await fs.writeFile(file,JSON.stringify(summary,null,2))}
  catch(error){cleanupErrors.push('summary:'+safeError(error));summary.status='FAIL'}
 }
}
console.log('NATIVE_VISION_ACCEPTANCE '+JSON.stringify(summary))
if(failure)throw failure
if(cleanupErrors.length||!runRemoved)throw Error('owned_native_fixture_cleanup_failed')
