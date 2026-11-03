import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {applicationNative} from '../local-executor/application-native.mjs'
import {buildApplicationWindowProbe} from '../ops/build-application-window-probe.mjs'

test('compiled window queries use a fixed executable with data-only input; actions retain their protected controller',async()=>{
 const probe='C:\\packaged\\native\\application-window-probe.exe',input={action:'windows',path:'C:\\Apps\\Literal $(not a command).exe',reveal:true}
 const result=await applicationNative(input,{platform:'win32',windowProbe:probe,execute:(exe,args,options,done)=>{
  assert.equal(exe,probe);assert.deepEqual(args,[]);assert.equal(options.shell,false);assert.equal(options.windowsHide,true)
  assert.deepEqual(JSON.parse(Buffer.from(options.env.STUDIO_APPLICATION_INPUT,'base64').toString()),input)
  done(null,'{"ok":true,"value":[]}')
 }})
 assert.deepEqual(result,[])
 await applicationNative({action:'act'},{platform:'win32',windowProbe:probe,execute:(exe,args,options,done)=>{assert.match(exe,/WindowsPowerShell/);done(null,'{"ok":true,"value":{"accepted":true}}')}})
 const abort=new AbortController();abort.abort();let executed=false
 assert.throws(()=>applicationNative(input,{platform:'win32',windowProbe:probe,signal:abort.signal,execute:()=>{executed=true}}));assert.equal(executed,false)
})

test('real compiled probe rejects non-window requests and unsafe paths without a shell',{skip:process.platform!=='win32',timeout:150000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-window-probe-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}))
 const metadata=await buildApplicationWindowProbe(directory);assert.equal(metadata.sha256.length,64)
 const windowProbe=path.join(directory,'native/application-window-probe.exe')
 assert.deepEqual(await applicationNative({action:'windows',path:'C:\\StudioIsolatedFixtureMissing\\NotRunning.exe'},{windowProbe}),[])
 await assert.rejects(applicationNative({action:'windows',path:'\\\\server\\share\\app.exe'},{windowProbe}),/application_path_denied/)
 await assert.rejects(applicationNative({action:'windows',path:'C:\\Apps\\safe.exe',reveal:'true'},{windowProbe}),/application_action_denied/)
})
