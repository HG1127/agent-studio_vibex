import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {applicationNative,APPLICATION_NATIVE_CODE,APPLICATION_ACTION_EXECUTABLE_CODE} from '../local-executor/application-native.mjs'
import {buildApplicationWindowProbe} from '../ops/build-application-window-probe.mjs'

test('explicit approved foreground observer uses only pinned compiled helper and offers focused editor keyboard action',async()=>{
 const observer='C:\\packaged\\native\\application-observer.exe';
 const input={action:'activate_observe',path:'C:\\Apps\\safe.exe',window:'123',images:false};
 const result=await applicationNative(input,{platform:'win32',observer,execute:(exe,args,options,done)=>{
  assert.equal(exe,observer);
  assert.deepEqual(args,[]);
  assert.equal(options.shell,false);
  assert.equal(options.env.STUDIO_APPLICATION_CODE,undefined);
  assert.deepEqual(JSON.parse(Buffer.from(options.env.STUDIO_APPLICATION_INPUT,'base64').toString()),input);
  done(null,'{"ok":true,"value":{"window":{"foreground":true},"controls":[]}}')
 }});
 assert.equal(result.window.foreground,true);
 assert.match(APPLICATION_NATIVE_CODE,/ControlType\.Edit\|\|e\.ControlType==ControlType\.Document/);
 assert.match(APPLICATION_NATIVE_CODE,/actions\.Contains\("type"\)&&!actions\.Contains\("key"\)/);
})
test('editor focus is restored to the approved application after the native confirmation dialog closes',()=>{
 const focus=APPLICATION_NATIVE_CODE.split('public static void Act(')[0].split('static void FocusTarget(').at(-1);
 assert.match(APPLICATION_NATIVE_CODE,/if\(target\.Current\.HasKeyboardFocus\)return true/);
 assert.ok(focus&&focus.length>0); assert.match(focus,/RequireForeground\(h,epoch\);\s*if\(TargetFocused\(e\)\)return/);
 assert.match(focus,/if\(!ForegroundMatches\(h\)\)RequireForeground\(h,epoch\)/);
 assert.match(focus,/if\(TargetFocused\(e\)&&ForegroundMatches\(h\)\)return/);
 assert.match(focus,/ClickTarget\(h,w,e,c,epoch\);[\s\S]*?if\(!ForegroundMatches\(h\)\|\|!TargetFocused\(e\)\)throw new Exception\("application_focus_changed"\)/);
 assert.doesNotMatch(focus,/if\(InputEpoch\(\)!=epoch\)/);})
test('approved native application actions receive a bounded 60-second UIA budget',async()=>{
 let seen;
 const input={action:'act',path:'C:\\\\Apps\\\\safe.exe',window:'123',title:'Safe',kind:'type',element:1,name:'Editor',runtime:'1.2.3',text:'acceptance'};
 await applicationNative(input,{platform:'win32',execute:(exe,args,options,done)=>{seen={timeout:options.timeout,shell:options.shell,windowsHide:options.windowsHide};done(null,'{\"ok\":true,\"value\":{\"accepted\":true}}')}});
 assert.deepEqual(seen,{timeout:60000,shell:false,windowsHide:true});
})
test('approved application actions use a pinned compiled helper and data-only input',async()=>{
 const actionExecutable='C:\\\\packaged\\\\native\\\\application-action.exe'
 const input={action:'act',path:'C:\\\\Apps\\\\safe.exe',window:'123',title:'Safe',kind:'type',element:1,name:'Editor',runtime:'1.2.3',text:'acceptance',key:''}
 let seen
 const result=await applicationNative(input,{platform:'win32',actionExecutable,execute:(exe,args,options,done)=>{seen={exe,args,timeout:options.timeout,shell:options.shell,windowsHide:options.windowsHide,code:options.env.STUDIO_APPLICATION_CODE,input:JSON.parse(Buffer.from(options.env.STUDIO_APPLICATION_INPUT,'base64').toString())};done(null,'{\"ok\":true,\"value\":{\"accepted\":true}}')}})
 assert.deepEqual(result,{accepted:true});assert.equal(seen.exe,actionExecutable);assert.deepEqual(seen.args,[]);assert.equal(seen.timeout,60000);assert.equal(seen.shell,false);assert.equal(seen.windowsHide,true);assert.equal(seen.code,undefined);assert.deepEqual(seen.input,input)
 assert.ok(APPLICATION_ACTION_EXECUTABLE_CODE.includes('StudioApplications.Act(window,expected,title,kind,element,name,runtime,text,key)'))
})
test('compiled window queries use a fixed executable with data-only input; actions retain their protected controller',async()=>{
 const probe='C:\\packaged\\native\\application-window-probe.exe',input={action:'windows',path:'C:\\Apps\\Literal $(not a command).exe',reveal:true}
 const result=await applicationNative(input,{platform:'win32',windowProbe:probe,execute:(exe,args,options,done)=>{
  assert.equal(exe,probe);assert.deepEqual(args,[]);assert.equal(options.shell,false);assert.equal(options.windowsHide,true)
  assert.deepEqual(JSON.parse(Buffer.from(options.env.STUDIO_APPLICATION_INPUT,'base64').toString()),input)
  done(null,'{"ok":true,"value":[]}')
 }})
 assert.deepEqual(result,[])
 const observer='C:\\packaged\\native\\application-observer.exe'
 await applicationNative({action:'observe',path:'C:\\Apps\\safe.exe',window:'123',images:true},{platform:'win32',observer,execute:(exe,args,options,done)=>{assert.equal(exe,observer);assert.deepEqual(args,[]);assert.equal(options.env.STUDIO_APPLICATION_CODE,undefined);done(null,'{"ok":true,"value":{"controls":[]}}')}})
 await applicationNative({action:'act'},{platform:'win32',windowProbe:probe,execute:(exe,args,options,done)=>{assert.match(exe,/WindowsPowerShell/);done(null,'{"ok":true,"value":{"accepted":true}}')}})
 const abort=new AbortController();abort.abort();let executed=false
 assert.throws(()=>applicationNative(input,{platform:'win32',windowProbe:probe,signal:abort.signal,execute:()=>{executed=true}}));assert.equal(executed,false)
})

test('real compiled probe rejects non-window requests and unsafe paths without a shell',{skip:process.platform!=='win32',timeout:150000},async t=>{
 const temporaryRoot=await fs.realpath(os.tmpdir()),directory=await fs.mkdtemp(path.join(temporaryRoot,'studio-window-probe-'));t.after(async()=>{const resolved=await fs.realpath(directory);assert.equal(path.dirname(resolved).toLowerCase(),temporaryRoot.toLowerCase());assert.match(path.basename(resolved),/^studio-window-probe-[A-Za-z0-9_-]+$/);assert.equal((await fs.lstat(directory)).isSymbolicLink(),false);await fs.rm(resolved,{recursive:true,force:true})})
 const metadata=await buildApplicationWindowProbe(directory);assert.equal(metadata.sha256.length,64)
 const windowProbe=path.join(directory,'native/application-window-probe.exe')
 const observer=path.join(directory,'native/application-observer.exe')
 await assert.rejects(applicationNative({action:'observe',path:'C:\\Apps\\safe.exe',window:'123',images:'true'},{observer}),/application_action_denied/)
 await assert.rejects(promisify(execFile)(observer,[],{windowsHide:true,env:{...process.env,STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify({action:'act',path:'C:\\Apps\\safe.exe',window:'123'})).toString('base64')}}),error=>JSON.parse(error.stdout).error==='application_action_denied')
 const actionExecutable=path.join(directory,'native/application-action.exe')
 const actionMetadata=JSON.parse(await fs.readFile(path.join(directory,'native/application-action.json'),'utf8'));assert.equal(actionMetadata.format,'agent-studio-application-action-v1');assert.equal(actionMetadata.policySha256.length,64);assert.equal(actionMetadata.sha256.length,64)
 await assert.rejects(promisify(execFile)(actionExecutable,[],{windowsHide:true,env:{...process.env,STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify({action:'observe',path:'C:\\\\Apps\\\\safe.exe',window:'123'})).toString('base64')}}),error=>JSON.parse(error.stdout).error==='application_action_denied')
 await assert.rejects(applicationNative({action:'act',path:'\\\\server\\share\\app.exe',window:'123',title:'Safe',kind:'type',element:1,name:'Editor',runtime:'1.2.3',text:'acceptance',key:''},{actionExecutable}),/application_path_denied/)
 const boundsSource=path.join(directory,'bounds.cs'),boundsBinary=path.join(directory,'bounds.exe'),framework=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319')
 await fs.writeFile(boundsSource,'using System;class BoundsTest{static void Main(){var json=new System.Web.Script.Serialization.JavaScriptSerializer();Console.Write(json.Serialize(new {empty=StudioApplications.SafeControlBounds(Double.PositiveInfinity,Double.PositiveInfinity,Double.NegativeInfinity,Double.NegativeInfinity),nan=StudioApplications.SafeControlBounds(0,Double.NaN,10,10),normal=StudioApplications.SafeControlBounds(10,20,30,40)}));}}')
 await promisify(execFile)(path.join(framework,'csc.exe'),['/nologo','/target:exe','/platform:x64','/main:BoundsTest','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...['UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll'].map(name=>'/reference:'+path.join(framework,'WPF',name)),'/out:'+boundsBinary,path.join(directory,'native/application-observer.cs'),boundsSource],{windowsHide:true})
 const bounds=JSON.parse((await promisify(execFile)(boundsBinary,[],{windowsHide:true})).stdout);assert.deepEqual(bounds.empty,[0,0,0,0]);assert.deepEqual(bounds.nan,[0,0,0,0]);assert.deepEqual(bounds.normal,[10,20,30,40])
 assert.deepEqual(await applicationNative({action:'windows',path:'C:\\StudioIsolatedFixtureMissing\\NotRunning.exe'},{windowProbe}),[])
 await assert.rejects(applicationNative({action:'windows',path:'\\\\server\\share\\app.exe'},{windowProbe}),/application_path_denied/)
 await assert.rejects(applicationNative({action:'windows',path:'C:\\Apps\\safe.exe',reveal:'true'},{windowProbe}),/application_action_denied/)
 await assert.rejects(promisify(execFile)(windowProbe,[],{windowsHide:true,env:{...process.env,STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify({action:'act',path:'C:\\Apps\\safe.exe'})).toString('base64')}}),error=>JSON.parse(error.stdout).error==='application_action_denied')
})
