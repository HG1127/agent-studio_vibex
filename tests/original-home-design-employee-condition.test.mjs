// Execute actual header/actor function source with terminal transaction DATA
// ports. No HTTP listener, SQL client, Worker or provider is constructed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {designId} from '../src/lib/pgNativeAgentDesign.ts'
import {employee,other} from './helpers/original-home-design-unit-data.mjs'
import {binding,preview,receipt,requestId} from './helpers/original-home-design-unit-data.mjs'
import {agentDesignSubmitBody} from '../src/lib/pgNativeAgentDesign.ts'
import {parseAgentDesignSubmission,parseAgentDesignControl,parseAgentDesignSaveIntent,parseAgentDesignSavePreviewInput} from '../services/pg-api/src/agent-design-contract.ts'
import {randomUUID} from 'node:crypto'
const read=p=>fs.readFileSync(new URL('../services/pg-api/src/'+p,import.meta.url),'utf8'),http=read('agent-design-http.ts'),ledger=read('agent-design-ledger.ts')
const begin=http.indexOf('function expectedDesignEmployee('),end=http.indexOf('/** false means',begin),header=Function('invalid','parseInput','designId',stripTypeScriptTypes(http.slice(begin,end))+';return expectedDesignEmployee')(()=>{throw Error('invalid')},fn=>{try{return fn()}catch{throw Error('invalid')}},designId)
const req=(value=employee,raw=['X-AgentStudio-Expected-Employee',value])=>({headers:{'x-agentstudio-expected-employee':value},rawHeaders:raw})

test('actual optional concurrency header accepts only one exact lowercase UUID raw value',()=>{
 assert.equal(header({headers:{}}),undefined);assert.equal(header(req()),employee)
 for(const value of [null,[],[employee],'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','invalid',employee+','+employee])assert.throws(()=>header(req(value)))
 for(const raw of [[],['X-AgentStudio-Expected-Employee'],['X-AgentStudio-Expected-Employee',other],['X-AgentStudio-Expected-Employee',employee,'x-agentstudio-expected-employee',employee]])assert.throws(()=>header(req(employee,raw)))
})
test('actual HTTP condition is parsed only after verified Native identity and only reaches six write/confirm endpoints',()=>{
 const actual=http.indexOf('const expectedEmployee = expectedDesignEmployee(req)');assert(actual>http.indexOf('requireAgentDesignNative(identity)',http.indexOf('let identity: Identity')))
 assert(http.includes('if (expectedEmployee !== undefined && (item || !["submit", "confirm", "control", "confirm-control", "save", "confirm-save"].includes(action![1]!))) return invalid()'))
 for(const exact of ['r[name](identity, intent, expectedEmployee)','r.control(identity, intent, name === "confirm-control", expectedEmployee)','r.save(identity, intent, wrapper.preview, name === "confirm-save", expectedEmployee)'])assert(http.includes(exact))
 assert(http.includes('nativeSessionToken(req)'));assert(http.includes('req.headers["x-rh-user-id"] !== undefined'));assert(http.includes('req.headers.authorization !== undefined'))
})
const actorStart=ledger.indexOf('  private async actor<T>'),actorEnd=ledger.indexOf('  private async lock',actorStart),actorClass=stripTypeScriptTypes('class Ledger {\n'+ledger.slice(actorStart,actorEnd)+'\n}')
class HttpError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
function actor(owner,{native=true}={}){
 const order=[],make=Function('requireAgentDesignNative','withActor','agentDesignId','HttpError',actorClass+';return Ledger'),Class=make(()=>{order.push('native');if(!native)throw new HttpError(401,'native_required')},async(pool,identity,work)=>{order.push('begin');try{const result=await work({},owner);order.push('commit');return result}catch(error){order.push('rollback');throw error}},designId,HttpError),instance=new Class()
 instance.pool={};instance.source={async contextOnClient(){order.push('admission')}}
 return{order,run:expected=>instance.actor({},async()=>{order.push('business');return'kept'},expected)}
}
test('actual actor checks the condition after actual owner admission and before any business callback',async()=>{
 const actual=actor(other);await assert.rejects(actual.run(employee),error=>error.status===409&&error.code==='agent_design_employee_changed');assert.deepEqual(actual.order,['native','begin','admission','rollback'])
})
test('matching condition and old no-header callers retain original verified actor/commit behavior',async()=>{
 for(const expected of [employee,undefined]){const actual=actor(employee);assert.equal(await actual.run(expected),'kept');assert.deepEqual(actual.order,['native','begin','admission','business','commit'])}
})
test('an expected employee cannot create Native authority or bypass original identity refusal',async()=>{
 const actual=actor(employee,{native:false});await assert.rejects(actual.run(employee),error=>error.status===401);assert.deepEqual(actual.order,['native'])
})
test('all original ledger mutations and confirmations pass the same condition into their original transaction',()=>{
 for(const [startName,nextName]of [['async confirm(','async submit('],['async submit(','private async result('],['async control(','private async savePreviewOnClient('],['async save(','\n}']]){
  const start=ledger.indexOf(startName),end=ledger.indexOf(nextName,start+startName.length),body=ledger.slice(start,end<0?undefined:end);assert(start>=0);assert(body.includes('expectedEmployee?: string'));assert(body.includes('}, expectedEmployee)')||body.includes('}, expectedEmployee)'))
 }
 assert(!ledger.includes('X-Rh-User-Id'));assert(ledger.includes('await this.source.contextOnClient(identity, db, owner)'))
})
test('authored genuine negative case passes actual six body parsers and fixed header projection before actor refusal',async()=>{
 const source=fs.readFileSync(new URL('../services/pg-api/tests/agent-design-genuine-pg18.test.mjs',import.meta.url),'utf8'),marker="await runCase('actual CookieBob plus original-Home expectedAlice refuses six write and confirmation paths before any ledger change',async()=>{",start=source.indexOf(marker)+marker.length,end=source.indexOf('\n    })',start);assert(start>=marker.length&&end>start)
 const choice={action:'preview',purpose:'generate',instruction:'negative only',model_binding:binding,output_token_limit:4096,source:null},body=agentDesignSubmitBody(preview(choice),requestId),routes=[],baseline={requests:0,reservations:0,outcomes:0,outputs:0,saves:0,history:0,agents:2,runs:0,old_effects:0},f={users:{alice:employee,bob:other},providerRequests:[],credentialReads:()=>0,counts:async()=>({...baseline}),createDesign:async who=>{assert.equal(who,'bob');return{body,request_id:requestId}},request:async(who,path,raw,options)=>{
  assert.equal(who,'bob');assert.deepEqual(options,{headers:{'X-AgentStudio-Expected-Employee':employee}});const route=path.split('/').at(-1);routes.push(route)
  if(['submit','confirm'].includes(route))parseAgentDesignSubmission(raw)
  else if(['control','confirm-control'].includes(route))parseAgentDesignControl(raw)
  else if(route==='save'){parseAgentDesignSaveIntent(raw.intent);parseAgentDesignSavePreviewInput(raw.preview)}
  else if(route==='confirm-save')parseAgentDesignSaveIntent(raw)
  else assert.fail('unexpected route')
  return{status:409,body:{error:'agent_design_employee_changed'}}
 }}
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;await AsyncFunction('f','randomUUID','assert',source.slice(start,end))(f,randomUUID,assert);assert.deepEqual(routes,['submit','confirm','control','confirm-control','save','confirm-save'])
 // This terminal parser test is not an actual Cookie/PG409 acceptance result.
})
