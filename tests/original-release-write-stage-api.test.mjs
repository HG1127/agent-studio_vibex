import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalVersionReleaseApi,originalReleaseWriteFailure} from '../src/lib/originalVersionReleaseApi.ts'
import {prepareReleaseIntent} from '../src/lib/originalVersionReleaseData.ts'
import {OriginalVersionReleaseError} from '../shared/original-version-release-contract.ts'
import {E,OTHER,S,Q,O,V,V2,M,A,D,choice,json,cap} from './helpers/original-release-write-stage-data.mjs'
async function capture(api,op){try{await api.change(S,op)}catch(error){return error}assert.fail('expected actual typed failure')}
for(const [status,code]of [[401,'session_required'],[401,'invalid_identity'],[403,'native_request_origin_denied'],[403,'native_employee_identity_required'],[403,'employee_not_provisioned'],[409,'agent_release_source_changed']])test('Release actual complete POST '+status+'/'+code+' private refusal binds source/spec/action/request hash',async()=>{
 const op=choice(),intent=await prepareReleaseIntent(E,S,op),api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>init.method==='GET'?json(cap):json({error:code},status)}),error=await capture(api,op);assert.equal(originalReleaseWriteFailure(error,intent),'refused');assert.equal(originalReleaseWriteFailure(new OriginalVersionReleaseError(status,code),intent),null)
 for(const update of [{employee_id:OTHER},{spec_id:V},{request_id:O},{request_sha256:'c'.repeat(64)},{source_sha256:'d'.repeat(64)},{expected_spec_revision:4},{test_linked:true}])assert.equal(originalReleaseWriteFailure(error,{...intent,...update}),null)
 assert.equal(originalReleaseWriteFailure(error,{...intent,created_at:intent.created_at+1}),'refused','API proof binds the canonical body; controller separately compares exact persisted creation metadata')
})
for(const [status,data]of [[403,{error:'intermediary_access_denied'}],[401,{error:'native_request_origin_denied'}],[403,{error:'session_required'}],[403,{error:'native_request_origin_denied',extra:true}],[503,{error:'native_request_origin_denied'}]])test('Release unknown or malformed status/code '+status+' '+JSON.stringify(data)+' has no POST refusal proof',async()=>{
 const op=choice(),intent=await prepareReleaseIntent(E,S,op),api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>init.method==='GET'?json(cap):json(data,status)}),error=await capture(api,op);assert.equal(originalReleaseWriteFailure(error,intent),null)
})
test('Release stale genuine refusal rethrown after a different POST cannot bind to request O',async()=>{
 const first=choice(),later=choice({request_id:O}),intent=await prepareReleaseIntent(E,S,later),api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>init.method==='GET'?json(cap):json({error:'native_request_origin_denied'},403)}),old=await capture(api,first),other=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>{if(init.method==='GET')return json(cap);throw old}}),error=await capture(other,later);assert.equal(error,old);assert.equal(originalReleaseWriteFailure(error,intent),null)
})
test('Release capabilities failure is distinguishable from a dispatched POST failure',async()=>{
 const op=choice(),intent=await prepareReleaseIntent(E,S,op);let posts=0;const api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>{if(init.method==='POST')posts++;throw new OriginalVersionReleaseError(403,'native_request_origin_denied')}}),error=await capture(api,op);assert.equal(posts,0);assert.equal(originalReleaseWriteFailure(error,intent),'not_dispatched')
})
test('Release GET receipt errors never create write failure proof',async()=>{
 const intent=await prepareReleaseIntent(E,S,choice()),api=createOriginalVersionReleaseApi({employeeId:E,transport:async()=>json({error:'agent_release_not_found'},404)});await assert.rejects(api.query(intent),error=>originalReleaseWriteFailure(error,intent)===null)
})
test('Release incomplete body with a known POST code has no refusal proof',async()=>{
 const op=choice(),intent=await prepareReleaseIntent(E,S,op),api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>init.method==='GET'?json(cap):new Response('{"error":"native_request_origin_denied"}',{status:403,headers:{'Content-Type':'application/json','Content-Length':'100'}})}),error=await capture(api,op);assert.equal(error.outcomeUnknown,true);assert.equal(originalReleaseWriteFailure(error,intent),null)
})
const source={expected_spec_revision:3,source_sha256:A},version={version_id:V,version_sha256:D,expected_version_revision:1}
for(const op of [choice(),{action:'acceptance',request_id:Q,...source,instruction:'PRIVATE ACCEPTANCE',max_steps:8,model_binding:{connection_id:M,connection_revision:2,model_id:'owned-model'},confirm:true},{action:'publish',request_id:Q,...source,...version,expected_release_revision:2,confirm:true,acknowledge_untested:true},{action:'restore',request_id:Q,...source,...version,confirm:true,reason:'Reviewed original version restore'},{action:'delete_draft',request_id:Q,...version,confirm:true}])test('Release '+op.action+' refusal proof binds the actual action-specific canonical contract',async()=>{
 const intent=await prepareReleaseIntent(E,S,op),api=createOriginalVersionReleaseApi({employeeId:E,transport:async(_route,init)=>init.method==='GET'?json(cap):json({error:'native_request_origin_denied'},403)}),error=await capture(api,op);assert.equal(originalReleaseWriteFailure(error,intent),'refused')
 if(intent.version_id!==null)for(const update of [{version_id:V2},{version_sha256:'e'.repeat(64)},{expected_version_revision:2}])assert.equal(originalReleaseWriteFailure(error,{...intent,...update}),null)
 if(intent.expected_release_revision!==null)assert.equal(originalReleaseWriteFailure(error,{...intent,expected_release_revision:3}),null)
})
