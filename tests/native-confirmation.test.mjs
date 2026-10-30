import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {confirmNative,REVIEW_SCRIPT} from '../local-executor/native-confirmation.mjs'

function fake(code,delay=0,inspect=()=>{}){
 return (exe,args,options,callback)=>{
  inspect(exe,args,options)
  const child=new EventEmitter();child.pid=9876
  setImmediate(()=>{child.emit('spawn');callback(code===0?null:Object.assign(Error('fixture'),{code}));setTimeout(()=>child.emit('close',code),delay)})
  return child
 }
}
test('only the explicit approval exit code grants permission',async()=>{
 assert.equal(await confirmNative({message:'isolated review'},undefined,{platform:'win32',execute:fake(0)}),true)
 assert.equal(await confirmNative({message:'isolated review'},undefined,{platform:'win32',execute:fake(2)}),false)
 await assert.rejects(confirmNative({message:'isolated review'},undefined,{platform:'win32',execute:fake(3)}),/permission_confirmation_timeout/)
 await assert.rejects(confirmNative({message:'isolated review'},undefined,{platform:'win32',execute:fake(1)}),/permission_confirmation_unavailable/)
})
test('launch failure is not silently reported as a user refusal',async()=>{
 await assert.rejects(confirmNative({message:'isolated'},undefined,{platform:'win32',execute:()=>{throw Error('ENOENT')}}),/permission_confirmation_unavailable/)
})
test('review data never becomes executable PowerShell source',async()=>{
 const message='evil\"; $(Get-Content secrets);\nhttps://literal.example'
 await confirmNative({message},undefined,{platform:'win32',execute:fake(2,0,(exe,args,options)=>{
  assert.equal(exe,'powershell.exe');assert.equal(args[args.length-2],'-EncodedCommand')
  assert.equal(Buffer.from(args.at(-1),'base64').toString('utf16le'),REVIEW_SCRIPT)
  assert.ok(!REVIEW_SCRIPT.includes(message))
  assert.deepEqual(JSON.parse(Buffer.from(options.env.STUDIO_PERMISSION_REVIEW,'base64').toString('utf8')),{message,timeoutMs:90000})
  assert.equal(options.windowsHide,true)
 })})
})
test('abort before launch never creates a confirmation process',async()=>{
 const c=new AbortController();c.abort();let calls=0
 await assert.rejects(confirmNative({message:'isolated'},c.signal,{platform:'win32',execute:()=>{calls++}}),{name:'AbortError'})
 assert.equal(calls,0)
})
test('wait for child close before releasing the next operation',async()=>{
 let done=false
 const promise=confirmNative({message:'isolated'},undefined,{platform:'win32',execute:fake(2,50)}).then(v=>{done=true;return v})
 await new Promise(r=>setTimeout(r,10));assert.equal(done,false);assert.equal(await promise,false)
})
test('the default button and initial focus are refusal, while timeout closes without consent',()=>{
 assert.match(REVIEW_SCRIPT,/\$form\.AcceptButton=\$no/)
 assert.match(REVIEW_SCRIPT,/\$form\.ActiveControl=\$no/)
 assert.match(REVIEW_SCRIPT,/\$form\.TopMost=\$true/)
 assert.match(REVIEW_SCRIPT,/\$form\.ShowInTaskbar=\$true/)
 assert.match(REVIEW_SCRIPT,/if\(\$state\.expired\)\{exit 3\}/)
})
