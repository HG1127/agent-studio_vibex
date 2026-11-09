import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalSchedulesApi,prepareOriginalScheduleIntent,originalScheduleWriteRefused} from '../src/lib/originalSchedulesApi.ts'
import {OriginalSchedulesError} from '../shared/original-schedules-contract.ts'
import {E,OTHER,O,operation,json} from './helpers/original-schedules-terminal-data.mjs'
import {deferred} from './helpers/original-schedules-terminal-data.mjs'
async function capture(api,intent){try{await api.change(intent.operation,intent.pending)}catch(error){return error}assert.fail('expected actual typed API rejection')}
for(const [status,code]of [[401,'session_required'],[403,'native_request_origin_denied'],[403,'native_employee_identity_required'],[409,'original_schedule_source_changed']])test('complete actual POST '+status+'/'+code+' mints private proof bound to the full pending descriptor',async()=>{
 const intent=await prepareOriginalScheduleIntent(operation(),E),api=createOriginalSchedulesApi({employeeId:E,transport:async()=>json({error:code},status)}),error=await capture(api,intent)
 assert.equal(originalScheduleWriteRefused(error,intent.pending),true)
 assert.equal(originalScheduleWriteRefused(new OriginalSchedulesError(status,code),intent.pending),false)
 for(const update of [{employee_id:OTHER},{request_id:O},{request_sha256:'c'.repeat(64)},{before_source_sha256:'d'.repeat(64)},{created_at:intent.pending.created_at+1},{action:'delete'}])assert.equal(originalScheduleWriteRefused(error,{...intent.pending,...update}),false)
})
for(const [status,data]of [[403,{error:'intermediary_access_denied'}],[403,{error:'session_required'}],[401,{error:'native_request_origin_denied'}],[403,{error:'native_request_origin_denied',extra:true}],[503,{error:'native_request_origin_denied'}]])test('complete HTTP '+status+' '+JSON.stringify(data)+' does not mint definite-refusal proof',async()=>{
 const intent=await prepareOriginalScheduleIntent(operation(),E),api=createOriginalSchedulesApi({employeeId:E,transport:async()=>json(data,status)}),error=await capture(api,intent);assert.equal(originalScheduleWriteRefused(error,intent.pending),false)
})
test('transport rethrowing a genuine earlier refusal cannot bind it to a different request',async()=>{
 const first=await prepareOriginalScheduleIntent(operation(),E),later=await prepareOriginalScheduleIntent(operation({request_id:O}),E),api=createOriginalSchedulesApi({employeeId:E,transport:async()=>json({error:'native_request_origin_denied'},403)}),old=await capture(api,first),other=createOriginalSchedulesApi({employeeId:E,transport:async()=>{throw old}}),error=await capture(other,later);assert.equal(error,old);assert.equal(originalScheduleWriteRefused(error,later.pending),false)
})
test('GET error cannot mint a POST refusal even with an otherwise known code',async()=>{
 const intent=await prepareOriginalScheduleIntent(operation(),E),api=createOriginalSchedulesApi({employeeId:E,transport:async()=>json({error:'original_schedule_not_found'},404)});await assert.rejects(api.receipt(intent.pending),error=>!originalScheduleWriteRefused(error,intent.pending))
})
test('incomplete body with a known code cannot mint proof',async()=>{
 const intent=await prepareOriginalScheduleIntent(operation(),E),api=createOriginalSchedulesApi({employeeId:E,transport:async()=>new Response('{"error":"native_request_origin_denied"}',{status:403,headers:{'Content-Type':'application/json','Content-Length':'100'}})}),error=await capture(api,intent);assert.equal(error.outcomeUnknown,true);assert.equal(originalScheduleWriteRefused(error,intent.pending),false)
})
test('private refusal binding captures the exact descriptor before transport starts',async()=>{
 const intent=await prepareOriginalScheduleIntent(operation(),E),pending={...intent.pending},gate=deferred();let entered=false
 const api=createOriginalSchedulesApi({employeeId:E,transport:()=>{entered=true;return gate.promise}}),failure=capture(api,{...intent,pending})
 while(!entered)await new Promise(resolve=>setImmediate(resolve));pending.request_id=O;gate.resolve(json({error:'native_request_origin_denied'},403));const error=await failure
 assert.equal(originalScheduleWriteRefused(error,intent.pending),true);assert.equal(originalScheduleWriteRefused(error,pending),false)
})
