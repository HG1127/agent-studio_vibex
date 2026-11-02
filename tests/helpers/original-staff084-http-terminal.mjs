// Terminal SqlClient query/result script only: no SQL parser/evaluation, driver,
// pg.Pool, TCP listener, fake Actor or injected authorization callback.
// The actual startup auditor mints its actual private handle from these literal
// metadata rows, then constructs the real HTTP factory and repository.
import assert from 'node:assert/strict'
import {staff084Catalog} from './original-staff084-catalog-frame.mjs'
import {originalStaffCatalog084SQL} from '../../services/pg-api/src/original-staff-audit084.mjs'
import {staffSelectTargetSQL,staffReceiptSQL} from '../../services/pg-api/src/original-staff-operations.mjs'
import {prepareOriginalStaffRuntime} from '../../services/pg-api/src/original-staff-runtime.mjs'
import {hashEmployeePassword} from '../../services/pg-api/src/native-employee-auth.mjs'
export const httpOwner='11111111-1111-4111-8111-111111111111',httpTarget='22222222-2222-4222-8222-222222222222',httpRequestId='33333333-3333-4333-8333-333333333333',httpStamp='2026-11-03T00:00:00.123456Z',httpLater='2026-11-03T00:00:00.123457Z',httpToken=Buffer.alloc(32,9).toString('base64url'),httpPassword='Synthetic 员工密码😀 123!'
const profile=(id,after,action)=>({id,email:'employee@example.com',display_name:action==='update'&&after?'员工甲😀':'Employee',is_admin:false,enabled:true,status:'active',share_enabled:false,staff_revision:after?2:1,governance_revision:1,created:httpStamp,updated:after?httpLater:httpStamp})
export function httpMutationBody(action){const common={request_id:httpRequestId,confirm:true};return action==='create'?{...common,display_name:'员工甲😀',email:'employee@example.com',role:'employee',share_enabled:false,password:httpPassword}:action==='update'?{...common,expected_revision:1,expected_governance_revision:1,expected_updated:httpStamp,display_name:'员工甲😀',email:'employee@example.com',role:'employee',active:true,share_enabled:false}:{...common,expected_revision:1,expected_governance_revision:1,expected_updated:httpStamp,new_password:httpPassword}}
export async function staffHttpTerminal(action){
 const trace=[],transactions=[],releases=[];let transaction=0,connected=0,targetReads=0,receiptRow=null,allocatedId=null,passwordUpdate=null,passwordProof=null;const oldPassword=action==='reset'?await hashEmployeePassword('Old synthetic staff password 123!'):null
 const client={async query(sql,params=[]){
  trace.push({kind:'query',sql,params,transaction})
  if(sql.startsWith('BEGIN')){transactions.push({id:transaction,sql});return{rows:[]}}
  if(sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL '))return{rows:[]}
  if(sql===originalStaffCatalog084SQL)return{rows:[{value:staff084Catalog()}]}
  if(sql.startsWith('/* original-staff:session */'))return{rows:[{user_id:httpOwner,is_admin:true}]}
  if(sql==='SELECT pg_advisory_xact_lock(61824,20261048)')return{rows:[]}
  if(sql===staffReceiptSQL)return{rows:receiptRow?[receiptRow]:[]}
  if(sql===staffSelectTargetSQL){
   const id=action==='create'?allocatedId:httpTarget;assert.equal(params[0],id)
   if(action==='create')return{rows:[{...profile(id,false,action),display_name:'员工甲😀'}]}
   return{rows:[profile(id,targetReads++>0,action)]}
  }
  if(sql.startsWith('/* original-staff:create-user */')){assert.equal(action,'create');allocatedId=params[0];assert.match(allocatedId,/^[a-f0-9-]{36}$/);assert.equal(params[3],'员工甲😀');return{rows:[]}}
  if(sql.startsWith('/* original-staff:create-account */')){assert.equal(params[0],allocatedId);passwordUpdate=params[2];return{rows:[]}}
  if(sql.startsWith('/* original-staff:update-account */')){assert.equal(action,'update');assert.deepEqual(params.slice(5),[1,1,httpStamp,false]);return{rows:[{user_id:httpTarget}]}}
  if(sql.startsWith('/* original-staff:update-user */')){assert.equal(params[1],'员工甲😀');return{rows:[{id:httpTarget}]}}
  if(sql.startsWith('/* original-staff:password-current */'))return{rows:[{password_record:oldPassword}]}
  if(sql.startsWith('/* original-staff:reset */')){assert.equal(action,'reset');assert.deepEqual(params.slice(2),[1,1,httpStamp]);assert(!sql.split(' WHERE ')[0].includes('governance_revision='));passwordUpdate=params[1];return{rows:[{user_id:httpTarget}]}}
  if(sql.startsWith('/* original-staff:revoke */'))return{rows:[]}
  if(sql.startsWith('/* original-staff:record */')){
   assert.equal(params[0],httpOwner);assert.equal(params[1],httpRequestId);assert.equal(params[2],action);assert.equal(params[16],1)
   // Record the parameter/result DATA at this transport boundary. No SQL is
   // interpreted and no database side effect is being asserted or emulated.
   receiptRow={actor_user_id:httpOwner,request_id:httpRequestId,action,target_user_id:action==='create'?allocatedId:httpTarget,request_sha256:params[4],email:'employee@example.com',display_name:action==='reset'?'Employee':'员工甲😀',is_admin:false,enabled:true,status:'active',share_enabled:false,revision:action==='create'?1:2,governance_revision:1,created:httpStamp,updated:action==='create'?httpStamp:httpLater,revoked_sessions:action==='reset'}
   if(action==='create')assert.deepEqual(JSON.parse(params[15]),{});else assert.equal(JSON.parse(params[15]).revision,1)
   return{rows:[]}
  }
  if(sql.startsWith('/* original-staff:private-password-request */')){passwordProof=params[2];return{rows:[]}}
  throw Error('unexpected_staff_http_terminal_statement')
 },release(destroy){releases.push({transaction,destroy:destroy===true})}}
 const connectionPort=Object.freeze({async connect(){transaction=++connected;trace.push({kind:'connect',transaction});return client}})
 const component=await prepareOriginalStaffRuntime({pool:connectionPort,env:{AGENT_STUDIO_PG18_ORIGINAL_STAFF_PROFILE:'native047-original-staff084',AGENT_STUDIO_PG18_ORIGINAL_STAFF_APPROVED:'APPROVE_DISPOSABLE_ORIGINAL_STAFF_084_ONLY'},allowedOrigin:'https://staff.invalid',configurationWrites:true,employeeProvisioning:true,listen:true})
 assert(component);assert.equal(component.protocol,'native_original_staff_owner_cas_v1')
 async function request(bytes,{method=action==='update'?'PATCH':'POST',url=action==='create'?'/api/native-auth/original-staff/users':'/api/native-auth/original-staff/users/'+httpTarget+(action==='reset'?'/reset-password':''),headers={}}={}){
  const req={url,method,headers:{cookie:'__Host-agentstudio_session='+httpToken,origin:'https://staff.invalid','x-agentstudio-request':'1','x-agentstudio-expected-owner':httpOwner,...(bytes===undefined?{}:{'content-type':'application/json; charset=utf-8','content-length':String(bytes.length)}),...headers},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){trace.push({kind:'body',transaction});for(let i=0;i<(bytes?.length??0);i++)yield bytes.subarray(i,i+1)}}
  let status=null,text=null,responseHeaders;const res={writeHead(code,values){status=code;responseHeaders=values},end(value){text=value}}
  assert.equal(await component.handler(req,res),true);return{status,text,headers:responseHeaders}
 }
 return{component,trace,transactions,releases,request,receipt:()=>receiptRow,allocatedId:()=>allocatedId,passwordRecords:()=>({updated:passwordUpdate,proof:passwordProof})}
}
