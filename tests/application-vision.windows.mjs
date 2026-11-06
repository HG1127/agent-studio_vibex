// Real input into an exclusively owned synthetic window. No employee apps,
// credentials, communications, model calls or production server are used.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {inspectApplication,registerApplications} from '../local-executor/applications.mjs'
import {applicationNative} from '../local-executor/application-native.mjs'
import {applicationVisionNative} from '../local-executor/application-vision-native.mjs'
import {buildApplicationWindowProbe} from '../ops/build-application-window-probe.mjs'
const root=process.cwd(),run=await fs.mkdtemp(path.join(root,'.tmp/vision-native-')),exe=path.join(run,'VisionFixture.exe'),codeFile=path.join(run,'fixture.cs')
const source=String.raw`using System;using System.IO;using System.Drawing;using System.Windows.Forms;using System.Web.Script.Serialization;
class Fixture{[STAThread]static void Main(){Application.EnableVisualStyles();var home=AppDomain.CurrentDomain.BaseDirectory;var f=new Form{Text="Synthetic visual acceptance fixture",Width=640,Height=420,StartPosition=FormStartPosition.CenterScreen};var input=new TextBox{Left=30,Top=45,Width=510};var button=new Button{Left=30,Top=105,Width=230,Text="Save synthetic receipt"};var password=new TextBox{Left=30,Top=170,Width=230,UseSystemPasswordChar=true};f.Controls.AddRange(new Control[]{input,button,password});int count=0;button.Click+=(s,e)=>File.WriteAllText(Path.Combine(home,"receipt.json"),new JavaScriptSerializer().Serialize(new{text=input.Text,count=++count}));Action metadata=()=>{Func<Control,int[]> point=c=>{var p=c.PointToScreen(new Point(c.Width/2,c.Height/2));return new[]{p.X-f.Left,p.Y-f.Top};};File.WriteAllText(Path.Combine(home,"window.json"),new JavaScriptSerializer().Serialize(new{id=f.Handle.ToInt64().ToString(),input=point(input),button=point(button),password=point(password)}));};f.Shown+=(s,e)=>metadata();Application.Run(f);}}
`
await fs.writeFile(codeFile,source)
const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
await promisify(execFile)(compiler,['/nologo','/codepage:65001','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+exe,codeFile],{windowsHide:true,timeout:30000})
await buildApplicationWindowProbe(path.join(run,'helpers'))
const child=spawn(exe,[],{windowsHide:false,stdio:'ignore',shell:false});let runtime
try{
 let metadata;for(let n=0;n<100;n++){try{metadata=JSON.parse(await fs.readFile(path.join(run,'window.json'),'utf8'));break}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(metadata,'fixture window opened')
 const grant=await inspectApplication(exe,{name:'Synthetic visual acceptance fixture',control:true}),tools=new Map()
 runtime=registerApplications({config:{roots:[{name:'work',path:run}],applications:{format:'agent-studio-applications-v1',enabled:true,images:true,grants:[grant]}},add:(name,_description,_schema,fn)=>tools.set(name,fn),native:(input,options)=>applicationNative(input,{...options,windowProbe:path.join(run,'helpers/native/application-window-probe.exe')}),nativeVision:(input,options)=>applicationVisionNative(input,{...options,binary:path.join(run,'helpers/native/application-vision.exe')}),confirm:async review=>{assert.ok(review.message.includes(grant.name));return true}})
 const call=async(name,args)=>{const result=await tools.get(name)({app:grant.id,...args});if(typeof result==='string')return JSON.parse(result);await fs.writeFile(path.join(run,'latest.png'),Buffer.from(result.images[0].data,'base64'));return JSON.parse(result.text)}
 await call('apps.launch',{})
 let observed=await call('apps.observe_visual',{window:metadata.id})
 const point=name=>({x:Math.floor(metadata[name][0]*observed.imageSize.width/observed.window.width),y:Math.floor(metadata[name][1]*observed.imageSize.height/observed.window.height)})
 observed=await call('apps.act_visual',{observation:observed.observation,...point('input'),action:'click'})
 observed=await call('apps.act_visual',{observation:observed.observation,...point('input'),action:'type',text:'VISUAL_WITHOUT_CONTROL_TREE_OK'})
 const spent=observed.observation
 observed=await call('apps.act_visual',{observation:spent,...point('button'),action:'click'})
 const receipt=JSON.parse(await fs.readFile(path.join(run,'receipt.json'),'utf8'));assert.equal(receipt.text,'VISUAL_WITHOUT_CONTROL_TREE_OK');assert.equal(receipt.count,1)
 await assert.rejects(call('apps.act_visual',{observation:spent,...point('button'),action:'click'}),/observation_expired/)
 observed=await call('apps.observe_visual',{window:metadata.id});observed=await call('apps.act_visual',{observation:observed.observation,...point('password'),action:'click'})
 await assert.rejects(call('apps.act_visual',{observation:observed.observation,...point('password'),action:'type',text:'MUST_NOT_ENTER'}),/sensitive_control/)
 assert.equal(JSON.parse(await fs.readFile(path.join(run,'receipt.json'),'utf8')).count,1)
 await fs.writeFile(path.join(run,'acceptance.json'),JSON.stringify({status:'PASS',realNativeClick:true,realNativeTyping:true,controlTreeRequired:false,oneUseToken:true,passwordInputDenied:true,receipt,productionData:false},null,2));console.log('NATIVE_VISION_ACCEPTANCE '+run)
}finally{await runtime?.close();child.kill();await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r)})}
