// Pure data/refusal/source tests only. No positive trust, SQL, CLI or process.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {full069WorkerLiveTrustFailureData as format,openFull069WorkerLiveTrust} from '../src/pg18-full069-worker-live-trust.mjs'
import {WorkerHeartbeatControlError,controlErrorCodes} from '../src/worker-heartbeat-activation-control-contract.ts'
const source=()=>fs.readFileSync(new URL('../src/pg18-full069-worker-live-trust.mjs',import.meta.url),'utf8'),secret='private-password-cert-SQL-/etc/secret',keys=['event','phase','credential_key','error_class','error_code','observed_data_only','qualifies_run','production_cutover_allowed'],credentials=['admin','api','native_auth','worker','identity','broker','index_worker','index_broker','review_worker','employee_profile','employee_password','tls_ca','tls_certificate','tls_key','executor']
test('formatter returns only the frozen closed observation record without authority',()=>{
 const v=format('source_capture',new Error(secret));assert.deepEqual(Object.keys(v),keys);assert.equal(v.event,'full069_worker_live_trust_failure');assert.equal(v.phase,'source_capture');assert.equal(v.error_class,'Error');assert.equal(v.error_code,null);assert.equal(v.credential_key,null);assert.equal(v.observed_data_only,true);assert.equal(v.qualifies_run,false);assert.equal(v.production_cutover_allowed,false);assert.ok(Object.isFrozen(v));assert.ok(!JSON.stringify(v).includes(secret))
})
test('messages, stacks, cause, paths, SQL and custom fields never enter output',()=>{
 const error=Object.assign(new Error(secret),{stack:secret,cause:secret,path:secret,sql:secret,password:secret,certificate:secret,code:secret});assert.ok(!JSON.stringify(format('C_records',error)).includes(secret));assert.equal(format('C_records',error).error_code,null)
})
test('every original control error code is accepted only with its exact native class',()=>{
 for(const code of controlErrorCodes){const v=format('telemetry_root_profile',new WorkerHeartbeatControlError(code));assert.equal(v.error_class,'WorkerHeartbeatControlError');assert.equal(v.error_code,code);assert.equal(format('telemetry_root_profile',Object.assign(new Error(secret),{code})).error_code,null)}
 assert.equal(format('telemetry_root_profile',new WorkerHeartbeatControlError(secret)).error_code,null)
})
test('allowed built-in classes and fixed Node codes have constant class labels',()=>{
 for(const [Type,name]of [[Error,'Error'],[TypeError,'TypeError'],[RangeError,'RangeError'],[SyntaxError,'SyntaxError']]){const error=Object.assign(new Type(secret),{name:secret,code:'EACCES'}),v=format('credential_read',error,'admin');assert.equal(v.error_class,name);assert.equal(v.error_code,'EACCES');assert.ok(!JSON.stringify(v).includes(secret))}
})
test('unknown Node codes, SQLSTATE and nonstring codes are not coerced or printed',()=>{
 let conversions=0;for(const code of [secret,'28P01','42P01',123,null,{toString(){conversions++;throw Error(secret)}}])assert.equal(format('host_runtime',Object.assign(new Error(secret),{code})).error_code,null);assert.equal(conversions,0)
})
test('own error accessors are never invoked, including name and code',()=>{
 let reads=0;const error=new Error();for(const name of ['message','name','stack','code'])Object.defineProperty(error,name,{configurable:true,get(){reads++;throw Error(secret)}});const v=format('signed_profile',error);assert.equal(v.error_class,'Error');assert.equal(v.error_code,null);assert.equal(reads,0);assert.ok(!JSON.stringify(v).includes(secret))
})
test('inherited code and custom error subclass with spoofed name stay unreported',()=>{
 let reads=0;class Custom extends Error{};Object.defineProperty(Custom.prototype,'code',{get(){reads++;throw Error(secret)}});const error=new Custom(secret);error.name='WorkerHeartbeatControlError';assert.equal(format('source_verify',error).error_class,null);assert.equal(format('source_verify',error).error_code,null);assert.equal(reads,0)
 const native=new Error(secret);Object.setPrototypeOf(native,Object.create(Error.prototype,{code:{value:'ENOENT'}}));assert.equal(format('source_verify',native).error_code,null)
})
test('fake error DTOs and all primitives cannot supply error class or code',()=>{
 for(const error of [null,undefined,true,1,secret,Symbol(secret),{},Object.create(Error.prototype),{name:'Error',code:'ENOENT',message:secret}]){const v=format('configuration',error);assert.equal(v.error_class,null);assert.equal(v.error_code,null);assert.ok(!JSON.stringify(v).includes(secret))}
})
test('Proxy and revoked Proxy errors are rejected without invoking traps',()=>{
 let traps=0;const proxy=new Proxy(new Error(secret),{get(){traps++;throw Error(secret)},getPrototypeOf(){traps++;throw Error(secret)},getOwnPropertyDescriptor(){traps++;throw Error(secret)}}),revocable=Proxy.revocable(new Error(secret),{});revocable.revoke();for(const error of [proxy,revocable.proxy]){const v=format('source_capture',error);assert.equal(v.error_class,null);assert.equal(v.error_code,null)}assert.equal(traps,0)
})
test('phase and credential labels are closed constants without conversion',()=>{
 let conversions=0;const object={toString(){conversions++;throw Error(secret)}};for(const phase of [secret,undefined,null,object,Symbol(secret)])assert.equal(format(phase,new Error(secret)),null)
 for(const key of [secret,undefined,object,Symbol(secret)])assert.equal(format('credential_read',new Error(secret),key).credential_key,null);assert.equal(conversions,0)
})
test('only fixed credential key names are shown at the read boundary',()=>{
 for(const key of credentials){assert.equal(format('credential_read',new Error(secret),key).credential_key,key);assert.equal(format('C_records',new Error(secret),key).credential_key,null)}
})
test('default disabled host refusal emits no diagnostic and never reaches trust files',async()=>{
 const names=['AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED','AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED'],saved=names.map(k=>process.env[k]),write=process.stderr.write,writeSync=fs.writeSync;let writes=0
 try{for(const name of names)delete process.env[name];process.stderr.write=()=>{writes++;return true};fs.writeSync=()=>{writes++;return 0};await assert.rejects(openFull069WorkerLiveTrust(true));assert.equal(writes,0)}finally{process.stderr.write=write;fs.writeSync=writeSync;names.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i]})}
})
test('emitter is gated by Linux Root and both exact original LIVE flags; original error is rethrown',()=>{
 const text=source(),start=text.indexOf('export async function openFull069WorkerLiveTrust'),end=text.indexOf('function checkedState(',start),body=text.slice(start,end)
 assert.ok(body.includes("if(process.platform==='linux'&&process.getuid?.()===0&&process.getgid?.()===0&&process.env.AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED==='true'&&process.env.AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED==='RUN_DISPOSABLE_FULL069_WORKER_QUALIFICATION_ONLY')"));assert.ok(body.includes('if(data)fs.writeSync(2,JSON.stringify(data)'));assert.match(body,/catch\{\}\s+throw error\s+\}/);assert.ok(body.indexOf('assertLiveHost(write)')<body.indexOf('trustedAncestors('));assert.doesNotMatch(body,/console\.|error\.(?:message|stack|cause|path|sql)|new Error|\.query\(|new Pool|setTimeout|process\.(?:stdout|stderr)/)
 for(const check of ["liveFail('configuration_directory')","liveFail('operator_key')","liveFail('complete_source_changed')","liveFail('host_runtime_changed')","liveFail('telemetry_profile_changed')","liveFail('telemetry_binding')","liveFail('uid_pool')","liveFail('writer_group')","liveFail('native_writer_group')",'freeze(cRecords(profile))','contexts.set(handle,'])assert.ok(body.includes(check),check)
})
test('actual parsed catch shell keeps the original error when fixed FD2 write fails synchronously',()=>{
 // Execute only the diagnostic catch shell with an in-memory sink. This never
 // opens trust, calls an auditor, writes a real FD or claims Linux authority.
 const ts=createRequire(import.meta.url)('typescript'),text=source(),ast=ts.createSourceFile('trust.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='openFull069WorkerLiveTrust'),shell=fn.body.statements.find(ts.isTryStatement).catchClause.block.getText(ast),original=Object.assign(new Error(secret),{code:'ENOENT'}),pipeError=Object.assign(new Error('synthetic sink refusal'),{code:'EPIPE'}),calls=[],memoryProcess={platform:'linux',getuid:()=>0,getgid:()=>0,env:{AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED:'true',AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED:'RUN_DISPOSABLE_FULL069_WORKER_QUALIFICATION_ONLY'},get stderr(){throw Error('async stream must never be accessed')}}
 const execute=Function('fs','process','full069WorkerLiveTrustFailureData','failurePhase','credentialKey','error',shell),sink={writeSync(fd,record){calls.push({fd,record});throw pipeError}}
 assert.throws(()=>execute(sink,memoryProcess,format,'credential_read','admin',original),error=>error===original);assert.equal(calls.length,1);assert.equal(calls[0].fd,2);const record=JSON.parse(calls[0].record);assert.deepEqual(Object.keys(record),keys);assert.equal(record.phase,'credential_read');assert.equal(record.credential_key,'admin');assert.equal(record.error_code,'ENOENT');assert.ok(!calls[0].record.includes(secret));assert.ok(!calls[0].record.includes(pipeError.message))
})
test('candidate and this test parse using the actual pinned TypeScript AST only',()=>{
 const ts=createRequire(import.meta.url)('typescript');assert.equal(ts.version,'5.9.3');for(const url of [new URL('../src/pg18-full069-worker-live-trust.mjs',import.meta.url),new URL(import.meta.url)])assert.equal(ts.createSourceFile(url.pathname,fs.readFileSync(url,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0)
})
