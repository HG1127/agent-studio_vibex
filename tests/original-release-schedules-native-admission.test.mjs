import test from 'node:test'
import assert from 'node:assert/strict'
import {permitNativePg18BusinessUatRequest as permit} from '../services/pg-api/src/native-config-uat-policy.ts'
import {createNativeOwnOperationsBusinessHandler} from '../services/pg-api/src/own-operations-http.ts'
import {OriginalSchedulesRepository} from '../services/pg-api/src/original-schedules-repository.ts'
import {operation,auth,E,S,R,H} from './helpers/original-schedules-terminal-data.mjs'

const closed={configurationWrites:false,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}
const config={...closed,configurationWrites:true},execution={...config,autonomousAgentUat:true,scheduleRuntimeUat:true}
const release='/api/v2/original-ui/agent-releases/'+S,schedules='/api/v2/original-ui/schedules'

test('actual global Native policy admits original release metadata with all fresh-write gates closed',()=>{
 for(const path of [release,release+'/versions/'+R,release+'/acceptance/'+R])assert.equal(permit(path,'GET',closed),true,path)
})
test('original GET-only exact receipt recovery remains reachable after fresh admission closes',()=>{
 for(const path of [release+'/receipts/'+R,schedules+'/operations/'+R]){
  assert.equal(permit(path,'GET',closed),true,path)
  assert.equal(permit(path,'POST',execution),false,path)
 }
})
test('original release changes retain the actual configuration-write gate',()=>{
 assert.equal(permit(release+'/change','POST',closed),false)
 assert.equal(permit(release+'/change','POST',config),true)
 assert.equal(permit(release+'/change','GET',execution),false)
})
test('original acceptance still requires both independent configuration and autonomous execution scopes',()=>{
 assert.equal(permit(release+'/acceptance','POST',closed),false)
 assert.equal(permit(release+'/acceptance','POST',config),false)
 assert.equal(permit(release+'/acceptance','POST',{...closed,autonomousAgentUat:true}),false)
 assert.equal(permit(release+'/acceptance','POST',execution),true)
})
test('original schedules expose only exact metadata reads and keep the owned-pause operation reachable',()=>{
 for(const path of [schedules,schedules+'/capabilities',schedules+'/history',schedules+'/workflow-targets',schedules+'/workflow-targets/'+S,schedules+'/'+S])assert.equal(permit(path,'GET',closed),true,path)
 assert.equal(permit(schedules+'/operations','POST',closed),true)
 assert.equal(permit(schedules+'/operations','GET',execution),false)
})
test('reaching the shared schedule operation does not grant save or execution before the real repository checks',async()=>{
 let connects=0;const pool={connect:async()=>{connects++;throw Error('memory_pool_stop_before_any_SQL')}}
 const readonly=new OriginalSchedulesRepository(pool),identity={issuer:'urn:agentstudio:local:v1',subject:E}
 await assert.rejects(async()=>readonly.change(identity,E,operation()),e=>e.code==='original_schedules_writes_disabled')
 const configured=new OriginalSchedulesRepository(pool,{writes:true,execution:false})
 const common={id:S,expected_revision:5,expected_source_sha256:H,request_id:R,confirm:true}
 for(const input of [{...common,action:'enable',authorization:auth()},{...common,action:'run_now'},{...common,action:'retry_start',occurrence_id:R,expected_occurrence_sha256:H}])await assert.rejects(async()=>configured.change(identity,E,input),e=>e.code==='original_schedules_execution_disabled')
 assert.equal(connects,0)
 await assert.rejects(async()=>readonly.change(identity,E,{...common,action:'pause'}),/memory_pool_stop_before_any_SQL/)
 assert.equal(connects,1)
})
test('neighbor routes, malformed identifiers, encoded paths and wrong methods gain no Native admission',()=>{
 const paths=['/api/v2/original-ui/agent-releases',release+'/versions',release+'/receipts',release+'/change/'+R,release+'/acceptance/'+R+'/extra',release.replace(S,'-'.repeat(36)),release.replace(S,S.toUpperCase().replace('3','A')),schedules+'/unknown',schedules+'/operations/'+R+'/extra',schedules+'/workflow-targets/'+S+'/change',schedules+'/operations?x=1',schedules+'//history',schedules+'/%68istory',schedules+'/../schedules/history']
 for(const path of paths)for(const method of ['GET','POST','PATCH','DELETE','HEAD','OPTIONS'])assert.equal(permit(path,method,execution),false,path+' '+method)
 for(const path of [release,schedules,schedules+'/'+S])for(const method of ['PATCH','DELETE','HEAD','OPTIONS'])assert.equal(permit(path,method,execution),false,path+' '+method)
})
async function outer(url,method,policy){
 const requests=[],res={status:0,body:'',writeHead(status){this.status=status;return this},end(value=''){this.body+=value}}
 const req={url,method,headers:{},rawHeaders:[]}
 const handler=createNativeOwnOperationsBusinessHandler({available:false,policy,allowedOrigin:'https://example.test',authenticateRequest:async()=>{throw Error('no authentication proof supplied by this pure dispatch test')},businessHandler:async(actual,response)=>{requests.push(actual);response.writeHead(200);response.end('memory downstream reached')}})
 await handler(req,res);return{requests,req,res}
}
test('actual Native outer handler forwards the original facade request and canonical query without stripping or rewriting it',async()=>{
 for(const url of [release,schedules+'?filter=all&limit=50',schedules+'/history?limit=50',schedules+'/operations/'+R]){
  const result=await outer(url,'GET',closed);assert.equal(result.res.status,200,url);assert.equal(result.requests.length,1);assert.equal(result.requests[0],result.req);assert.equal(result.requests[0].url,url)
 }
})
test('actual Native outer handler keeps execution denial ahead of downstream dispatch',async()=>{
 const denied=await outer(release+'/acceptance','POST',config);assert.equal(denied.res.status,405);assert.equal(denied.requests.length,0)
 const admitted=await outer(release+'/acceptance','POST',execution);assert.equal(admitted.res.status,200);assert.equal(admitted.requests[0],admitted.req)
})
