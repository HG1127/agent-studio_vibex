import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {applicationNative,APPLICATION_NATIVE_CODE} from '../local-executor/application-native.mjs'
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
 const boundsSource=path.join(directory,'bounds.cs'),boundsBinary=path.join(directory,'bounds.exe'),framework=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319')
 await fs.writeFile(boundsSource,'using System;class BoundsTest{static void Main(){var json=new System.Web.Script.Serialization.JavaScriptSerializer();Console.Write(json.Serialize(new {empty=StudioApplications.SafeControlBounds(Double.PositiveInfinity,Double.PositiveInfinity,Double.NegativeInfinity,Double.NegativeInfinity),nan=StudioApplications.SafeControlBounds(0,Double.NaN,10,10),normal=StudioApplications.SafeControlBounds(10,20,30,40)}));}}')
 await promisify(execFile)(path.join(framework,'csc.exe'),['/nologo','/target:exe','/platform:x64','/main:BoundsTest','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...['UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll'].map(name=>'/reference:'+path.join(framework,'WPF',name)),'/out:'+boundsBinary,path.join(directory,'native/application-observer.cs'),boundsSource],{windowsHide:true})
 const bounds=JSON.parse((await promisify(execFile)(boundsBinary,[],{windowsHide:true})).stdout);assert.deepEqual(bounds.empty,[0,0,0,0]);assert.deepEqual(bounds.nan,[0,0,0,0]);assert.deepEqual(bounds.normal,[10,20,30,40])
 assert.deepEqual(await applicationNative({action:'windows',path:'C:\\StudioIsolatedFixtureMissing\\NotRunning.exe'},{windowProbe}),[])
 await assert.rejects(applicationNative({action:'windows',path:'\\\\server\\share\\app.exe'},{windowProbe}),/application_path_denied/)
 await assert.rejects(applicationNative({action:'windows',path:'C:\\Apps\\safe.exe',reveal:'true'},{windowProbe}),/application_action_denied/)
 await assert.rejects(promisify(execFile)(windowProbe,[],{windowsHide:true,env:{...process.env,STUDIO_APPLICATION_INPUT:Buffer.from(JSON.stringify({action:'act',path:'C:\\Apps\\safe.exe'})).toString('base64')}}),error=>JSON.parse(error.stdout).error==='application_action_denied')
})
