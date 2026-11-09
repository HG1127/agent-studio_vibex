import {createOriginalVersionReleaseController} from '../../src/lib/originalVersionRelease.ts'
import {createOriginalVersionReleaseApi} from '../../src/lib/originalVersionReleaseApi.ts'
import {prepareReleaseIntent} from '../../src/lib/originalVersionReleaseData.ts'
import {createPgEmployeeSession} from '../../src/lib/pgNativeSession.ts'
import {createStudioPgAuthAdapter} from '../../src/lib/studioPgAuthAdapter.ts'
import {createOriginalVersionReleaseIdentity} from '../../src/lib/originalVersionReleaseIdentity.ts'
import {E,OTHER,S,V,V2,M,R,Q,A,D,agent,model,workspace,detail,acceptance,envelope,workspaceEnvelope,deferred} from './original-version-release-terminal-data.mjs'
export {E,OTHER,S,V,V2,M,R,Q,A,D,agent,model,workspace,detail,acceptance,envelope,workspaceEnvelope,deferred,createOriginalVersionReleaseController}
export const O='60000000-0000-4000-8000-000000000002'
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8'}})
export const prefixLoss=status=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));controller.error(Error('terminal actual response prefix lost'))}}),{status,headers:{'Content-Type':'application/json'}})
export const cap={mode:'native_pg18',config_writes_enabled:true,agent_releases_available:true,agent_release_acceptance_enabled:true,autonomous_agent_submission_enabled:true}
export const choice=(over={})=>({action:'snapshot',request_id:Q,expected_spec_revision:3,source_sha256:A,note:'PRIVATE NOTE MUST NEVER PERSIST',test_run_id:null,...over})
export function result(op){const common={spec_id:S,request_id:op.request_id,replayed:false};if(op.action==='acceptance')return{...common,run_id:R,status:'queued',source_sha256:op.source_sha256,spec_revision:op.expected_spec_revision};if(op.action==='restore')return{...common,version_id:op.version_id,version_sha256:op.version_sha256,restored:true,spec_revision:op.expected_spec_revision+1,source_sha256:A};return{...common,version_id:op.version_id??V2,version_sha256:op.version_sha256??D,version_no:13,version_revision:op.action==='snapshot'?1:op.expected_version_revision+1,release_revision:op.action==='publish'?op.expected_release_revision+1:2,status:op.action==='snapshot'?'draft':op.action==='publish'?'published':'deleted',...(op.action==='snapshot'?{source_sha256:op.source_sha256,test_passed:op.test_run_id!==null}:op.action==='publish'?{source_sha256:op.source_sha256,already_published:false}:{})}}
export async function setup(options={}){
 let mode='ok',who=E,stored=null,view,controller,pendingMe=null,pendingCap=null,removeFails=false,receipt=null,capValue={...cap},work=workspace()
 const business=[],authRequests=[],apiFailures=[],apiAcknowledgements=[],writtenMarkers=[],ids=[Q,O]
 const auth=createStudioPgAuthAdapter(createPgEmployeeSession(async(route,init)=>{
  authRequests.push({route,method:init.method})
  if(route.endsWith('/login')){mode='ok';return json({authenticated:true})}
  if(route.endsWith('/logout')){mode='signed_out';return json({ok:true})}
  if(pendingMe&&stored){const handler=pendingMe;pendingMe=null;return await handler()}
  if(mode==='unavailable')throw Error('terminal native auth unavailable')
  if(mode==='signed_out')return json({error:'session_required'},401)
  return json({authenticated:true,user:{id:who,email:'employee@example.test',display_name:'Employee',is_admin:false}})
 }))
 await auth.verify();const identity=createOriginalVersionReleaseIdentity({account:auth.account,verify:auth.verify})
 const commit=async op=>{const intent=await prepareReleaseIntent(E,S,op);receipt={mode:'read_only_exact_agent_release_receipt',request_sha256:intent.request_sha256,result:result(op)};return result(op)}
 const actualApi=createOriginalVersionReleaseApi({employeeId:E,transport:async(url,init)=>{
  const route=url.replace('/__pg_native','');business.push({route,method:init.method,body:init.body})
  if(options.transport){const value=await options.transport(route,init);if(value!==undefined)return value}
  if(route.endsWith('/capabilities')){if(pendingCap&&stored){const handler=pendingCap;pendingCap=null;return await handler()}return json(capValue)}
  if(route.includes('/receipts/'))return receipt?json(envelope(receipt)):json({error:'agent_release_receipt_not_found'},404)
  if(init.method==='POST'){const op=JSON.parse(init.body);if(options.change){const value=await options.change(op,{commit,setMode:value=>{mode=value},setPendingMe:handler=>{pendingMe=handler}});if(value!==undefined)return value}return json(envelope(await commit(op)))}
  if(route.includes('/versions/'))return json(envelope(detail()))
  if(route.includes('/acceptance/'))return json(envelope(acceptance()))
  if(route.endsWith('/'+S))return json(workspaceEnvelope(work))
  throw Error('unexpected actual API terminal route '+route)
 }})
 const api=Object.freeze({...actualApi,async change(...args){try{const value=await actualApi.change(...args);apiAcknowledgements.push({request_id:args[1].request_id,status:value.status});return value}catch(error){apiFailures.push({request_id:args[1].request_id,error});throw error}}})
 const storage={read:()=>stored,write:value=>{writtenMarkers.push(value);stored=value},remove:()=>{if(removeFails)throw Error('terminal storage remove failed');stored=null}}
 const ports={employeeId:E,api,...identity,catalog:async page=>({items:[agent()],totalItems:1,totalPages:1,page,perPage:50}),getAgent:async()=>({...agent(),name:work.name,revision:work.spec_revision}),models:async()=>({items:[model()],complete:true}),storage,onChange:value=>{view=value},requestId:()=>ids.shift()??crypto.randomUUID()}
 controller=createOriginalVersionReleaseController(ports);await controller.start(S)
 const reLogin=async()=>{await auth.signOut();await auth.signIn('employee@example.test','SyntheticPassword#2026');await auth.verify()}
 const fresh=async(dispose=true)=>{if(dispose)controller.dispose();const next=createOriginalVersionReleaseController(ports);await next.start(S);return next}
 return{controller,ports,api,actualApi,auth,business,authRequests,apiFailures,apiAcknowledgements,writtenMarkers,commit,reLogin,fresh,get stored(){return stored},get view(){return view},setStored:value=>{stored=value},setMode:value=>{mode=value},setWho:value=>{who=value},setPendingMe:handler=>{pendingMe=handler},setPendingCap:handler=>{pendingCap=handler},setRemoveFailure:value=>{removeFails=value},setReceipt:value=>{receipt=value},setCap:value=>{capValue=value},setWorkspace:value=>{work=value}}
}
export const posts=x=>x.business.filter(row=>row.method==='POST')
export const marker=x=>x.stored===null?null:JSON.parse(x.stored)
