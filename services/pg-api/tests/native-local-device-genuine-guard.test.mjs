import test from 'node:test'
import assert from 'node:assert/strict'
import {sanitizeNativeChainDiagnostic,combineNativeChainFailure,nativeChainDispatchFailureCode,nativeChainLocalStatusCounts} from './helpers/native-local-device-chain-fixture.mjs'
import {requireNativeLocalDeviceGenuineCi,nativeLocalDeviceGenuineWorkflow,nativeLocalDeviceEmployeeBrowserWorkflow} from './helpers/native-local-device-genuine-guard.mjs'
const env={GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:nativeLocalDeviceGenuineWorkflow,GITHUB_RUN_ID:'987654',GITHUB_JOB:'pg18-local-device-genuine',AGENT_STUDIO_F20_F21_GENUINE_CI:'YES_DISPOSABLE_F20_F21_ONLY',AGENT_STUDIO_F20_F21_GENUINE_SUITE:'database',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-987654'}
test('pure guard accepts only declared purpose/job/suite data, without constructing a driver or pool',()=>{for(const [job,suite]of[['pg18-local-device-genuine','database'],['pg18-local-device-genuine','flow'],['pg18-local-device-executor','executor'],['pg18-local-device-browser','browser']]){const target=requireNativeLocalDeviceGenuineCi({...env,GITHUB_JOB:job,AGENT_STUDIO_F20_F21_GENUINE_SUITE:suite},'linux',1001);assert.equal(target.host,'127.0.0.1');assert.equal(target.port,5432);assert.equal(target.database,'agentstudio_pg18_ci')}})
test('ordinary hosts, root, wrong jobs/suites/repos/workflows and real database alternatives are refused',()=>{assert.throws(()=>requireNativeLocalDeviceGenuineCi({},'win32',1001));assert.throws(()=>requireNativeLocalDeviceGenuineCi(env,'linux',0));for(const patch of [{GITHUB_JOB:'other'},{AGENT_STUDIO_F20_F21_GENUINE_SUITE:'browser'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_WORKFLOW:'Other purpose'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{DATABASE_URL:'postgresql://production.invalid'}])assert.throws(()=>requireNativeLocalDeviceGenuineCi({...env,...patch},'linux',1001))})
test('injected transport/process authority is rejected by presence even when apparently benign',()=>{for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','PGHOST','PGPASSWORD'])assert.throws(()=>requireNativeLocalDeviceGenuineCi({...env,[key]:'1'},'linux',1001))})

test('separate employee workflow admits only the exact browser job/suite while retaining all original contexts',()=>{
 const browser={...env,GITHUB_WORKFLOW:nativeLocalDeviceEmployeeBrowserWorkflow,GITHUB_JOB:'pg18-local-device-browser',AGENT_STUDIO_F20_F21_GENUINE_SUITE:'browser'}
 assert.equal(requireNativeLocalDeviceGenuineCi(browser,'linux',1001).database,'agentstudio_pg18_ci')
 for(const patch of [{GITHUB_JOB:'pg18-local-device-executor',AGENT_STUDIO_F20_F21_GENUINE_SUITE:'executor'},{GITHUB_JOB:'pg18-local-device-genuine',AGENT_STUDIO_F20_F21_GENUINE_SUITE:'flow'},{AGENT_STUDIO_F20_F21_GENUINE_SUITE:'database'},{NODE_EXTRA_CA_CERTS:'untrusted'},{DATABASE_URL:'postgresql://production.invalid'}])assert.throws(()=>requireNativeLocalDeviceGenuineCi({...browser,...patch},'linux',1001))
})

test('chain diagnostics discard every unlisted value and never inspect error messages, bodies or getters',()=>{
 const secret='SYNTHETIC_PRIVATE_KEY_SQL_BODY_PROMPT_ARGS_UUID_TOKEN_SENTINEL',raw={provider:secret,phase:secret.repeat(10000),failure_phase:secret,sql:secret,message:secret,key:secret,body:secret,prompt:secret,args:[secret],uuid:secret,token:secret,counts:{[secret]:999999}};let accessed=0
 Object.defineProperty(raw,'error',{get(){accessed++;throw Error(secret)}});Object.defineProperty(raw.counts,'provider_peer',{get(){accessed++;throw Error(secret)}})
 const clean=sanitizeNativeChainDiagnostic(raw),encoded=JSON.stringify(clean);assert.equal(accessed,0);assert.equal(encoded.includes(secret),false);assert.equal(clean.provider,'unobserved');assert.equal(clean.phase,'unobserved');assert.equal(clean.failure_phase,'unobserved');assert.equal(clean.counts.provider_peer,0);assert.ok(Buffer.byteLength(encoded)<=2048)
})
test('chain diagnostic enums remain exact and finite counters are truncated within a fixed2048-byte schema',()=>{
 const names=Object.keys(sanitizeNativeChainDiagnostic(null).counts),counts=Object.fromEntries(names.map(name=>[name,Number.MAX_VALUE]));Object.assign(counts,{credential_proof:-1,provider_decode:Infinity,request_error:NaN,private_model_enter:3.9,provider_key:'9999'})
 const clean=sanitizeNativeChainDiagnostic({provider:'openai',phase:'private_model_returned',failure_phase:'provider_decode',counts});assert.equal(clean.provider,'openai');assert.equal(clean.phase,'private_model_returned');assert.equal(clean.failure_phase,'provider_decode');assert.equal(clean.counts.credential_proof,0);assert.equal(clean.counts.provider_decode,0);assert.equal(clean.counts.request_error,0);assert.equal(clean.counts.private_model_enter,3);assert.equal(clean.counts.provider_key,0);assert.equal(clean.counts.provider_images,9999);assert.ok(Buffer.byteLength(JSON.stringify(clean))<=2048);assert.deepEqual(sanitizeNativeChainDiagnostic(clean),clean)
})
test('chain cleanup failure preserves primary and cleanup identities and the original cause',()=>{
 const primary=Error('synthetic-primary'),cleanup=new AggregateError([Error('synthetic-cleanup')],'synthetic-cleanup-group'),result=combineNativeChainFailure(primary,cleanup)
 assert.ok(result instanceof AggregateError);assert.equal(result.message,'native_chain_primary_and_cleanup_failed');assert.equal(result.cause,primary);assert.deepEqual(result.errors,[primary,cleanup]);assert.equal(combineNativeChainFailure(undefined,cleanup).errors[0],undefined)
})

test('dispatch diagnostic reads only a closed own code and cannot expose messages or getter values',()=>{
 const secret='SYNTHETIC_BODY_KEY_SQL_TOKEN_SENTINEL';let accessed=0
 for(const code of ['invalid_native_local_device_value','workflow_tool_outcome_unknown','42702'])assert.equal(nativeChainDispatchFailureCode({code,message:secret}),code)
 assert.equal(nativeChainDispatchFailureCode({code:secret,message:secret}),'unobserved');assert.equal(nativeChainDispatchFailureCode(Object.create({code:'42702'})),'unobserved')
 const error={};Object.defineProperty(error,'code',{get(){accessed++;return '42702'}});Object.defineProperty(error,'message',{get(){accessed++;throw Error(secret)}});assert.equal(nativeChainDispatchFailureCode(error),'unobserved');assert.equal(accessed,0)
 const clean=sanitizeNativeChainDiagnostic({dispatch_code:secret,local_statuses:{queued:Infinity,succeeded:999999,message:secret}});assert.equal(clean.dispatch_code,'unobserved');assert.equal(clean.local_statuses.queued,0);assert.equal(clean.local_statuses.succeeded,9999);assert.equal(JSON.stringify(clean).includes(secret),false);assert.ok(Buffer.byteLength(JSON.stringify(clean))<=2048)
})
test('existing Owner task replies provide only bounded local status counts without IDs, values or extra reads',()=>{
 const tasks=[{status:'succeeded',id:'PRIVATE_ID',input:'PRIVATE_INPUT'},{status:'succeeded'},{status:'queued'},{status:'unknown'},{status:'PRIVATE_TOKEN'}];let accessed=0
 Object.defineProperty(tasks,'5',{get(){accessed++;throw Error('PRIVATE_GETTER')}})
 const counts=nativeChainLocalStatusCounts(tasks);assert.deepEqual(counts,{queued:1,running:0,succeeded:2,cancelled:0,expired:0,unknown:1});assert.equal(accessed,0);assert.equal(JSON.stringify(counts).includes('PRIVATE'),false)
 assert.deepEqual(nativeChainLocalStatusCounts(new Array(31).fill({status:'queued'})),{queued:0,running:0,succeeded:0,cancelled:0,expired:0,unknown:0})
})
