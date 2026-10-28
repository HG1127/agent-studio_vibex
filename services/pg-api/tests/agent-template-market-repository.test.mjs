// Query-trace fixtures only. No SQL server, real catalog, identity or ACL proof.
import test from "node:test"
import assert from "node:assert/strict"
import {AgentTemplateMarketRepository, projectAgentTemplateMarketDetail, projectAgentTemplateMarketUsePreview} from "../src/agent-template-market-repository.ts"
import {HttpError} from "../src/contracts.ts"
import {deriveAgentTemplateMarketSnapshot, deriveAgentTemplateMarketPublishPreview, deriveAgentTemplateMarketCopy, agentTemplateMarketCopyDigest} from "../src/agent-template-market-result.ts"
import {agentTemplateMarketDigest, agentTemplateMarketPublishAcknowledgement} from "../src/agent-template-market-contract.ts"
import {parseTemplateMarketDetail, parseTemplateMarketUsePreview, parseTemplateMarketSourceOption} from "../../../src/lib/pgNativeTemplateMarket.ts"
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),hash="a".repeat(64),identity={issuer:"urn:agentstudio:local:v1",subject:"employee-subject"}
const spec={goal:"完整目标",task_scope:"范围",deliverables:["交付物"],task_plan:["步骤"],done_criteria:["条件"],tools:["web_search"],require_plan_review:true}
const {snapshot,removed}=deriveAgentTemplateMarketSnapshot(spec),snapshotSha=await agentTemplateMarketDigest(snapshot),source={spec_id:id(1),revision:2,source_sha256:hash}
const item=(extra={})=>({id:id(2),name:"模板",description:"用途",category:"research",source_spec_id:id(1),built_in:false,public:true,use_count:0,created:"2026-10-29T00:00:00.000Z",revision:1,snapshot_sha256:snapshotSha,...extra})
const row=(extra={})=>({...item(),spec:snapshot.spec,is_mine:true,author_tail:"0001",...extra})
const pin=()=>({template_id:id(2),revision:1,snapshot_sha256:snapshotSha})
const use=()=>({action:"use",request_id:id(8),template:pin(),copy_name:"我的副本",expected_copy_sha256:hash,confirm:true})
const receipt=intent=>intent.action==="publish"?{operation:"publish",request_id:intent.request_id,item:item({name:intent.name,description:intent.description,category:intent.category})}:intent.action==="use"?{operation:"use",request_id:intent.request_id,template_id:id(2),revision:1,snapshot_sha256:snapshotSha,spec_id:id(9),spec_revision:1,use_count:1}:{operation:intent.action,request_id:intent.request_id,template_id:id(2),revision:2,snapshot_sha256:snapshotSha,public:intent.action==="republish",deleted:intent.action==="delete"}
function fixture(options={}){
 const trace=[];let connects=0,releases=0,audits=0
 const db={release(){releases++;trace.push(["release"])},async query(sql,values=[]){
  trace.push([sql,structuredClone(values)])
  if(sql==="COMMIT"&&options.commitError)throw options.commitError
  if(sql.includes("identity_user_id"))return{rows:[{id:id(50)}]}
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:true}]}
  if(sql.startsWith("SELECT id AS spec_id"))return{rows:options.sourceRows??[{spec_id:id(1),name:"原助手",revision:"2"}]}
  const name=/SELECT agentstudio\.(agent_template_market_[a-z_]+)\(/.exec(sql)?.[1]
  if(name){if(options.rpcError){const failure=options.rpcError(name,values);if(failure)throw failure}let value
   if(name==="agent_template_market_receipt")value=options.old?{status:"recorded",receipt:options.old}:{status:"not_recorded",request_id:values[0]}
   else if(name==="agent_template_market_record")value=options.recordValue??receipt(JSON.parse(values[0]))
   else if(name==="agent_template_market_source")value={source,name:"原助手",snapshot,removed,authority:false}
   else if(name==="agent_template_market_market")value={ok:true,items:[row()]}
   else if(name==="agent_template_market_mine")value={ok:true,items:[item({public:false})]}
   else if(name==="agent_template_market_detail")value=options.detailValue??row()
   else if(name==="agent_template_market_publish_preview"){const c=JSON.parse(values[0]);value=await deriveAgentTemplateMarketPublishPreview(c,"原助手",spec)}
   else if(name==="agent_template_market_use_preview"){const c=JSON.parse(values[0]);value={template:c.template,...deriveAgentTemplateMarketCopy(snapshot,"模板",c.copy_name),copy_sha256:await agentTemplateMarketCopyDigest(snapshot,"模板",c.copy_name)};const{resource_selection_required,starts_run,authority,name,spec:copy}=value;value={template:c.template,name,spec:copy,copy_sha256:value.copy_sha256,resource_selection_required,starts_run,authority}}
   return{rows:[{value}]}
  }
  return{rows:[]}
 }}
 const pool={connect:async()=>{connects++;return db}}
 const verifier=async client=>{audits++;assert.equal(client,db);trace.push(["AUDIT_ORIGINAL_CLIENT_TRACE_ONLY"]);return options.auditFalse?false:true}
 const repo=new AgentTemplateMarketRepository(pool,{available:options.available??true,allowWrites:options.writes??true,verifyCredentials:verifier})
 return{repo,pool,db,trace,connects:()=>connects,releases:()=>releases,audits:()=>audits}
}
test("all RPC work uses original ordinary Actor transaction, live-verifier seam and no nested client",async()=>{
 const f=fixture();await f.repo.previewPublish(identity,{action:"preview_publish",source,name:"模板",description:"用途",category:"research"})
 assert.equal(f.connects(),1);assert.equal(f.releases(),1);assert.equal(f.audits(),1)
 assert.equal(f.trace[0][0],"BEGIN");assert.ok(f.trace.findIndex(x=>x[0]==="AUDIT_ORIGINAL_CLIENT_TRACE_ONLY")<f.trace.findIndex(x=>x[0].includes("agent_template_market_publish_preview")))
 assert.equal(f.trace.at(-2)[0],"COMMIT");assert.equal(f.trace.some(x=>x[0]==="BEGIN READ ONLY"),false)
})
test("sources are lightweight own existing inventory and never loop a source RPC or expose hashes",async()=>{
 const f=fixture();const page=await f.repo.sources(identity)
 assert.deepEqual(page,{ok:true,items:[{spec_id:id(1),name:"原助手",revision:2}]});assert.deepEqual(parseTemplateMarketSourceOption(page.items[0]),page.items[0])
 assert.equal(f.trace.filter(x=>x[0].includes("agent_template_market_source(")).length,0)
 const query=f.trace.find(x=>x[0].startsWith("SELECT id AS spec_id"));assert.deepEqual(query[1],[id(50)]);assert.match(query[0],/owner_user_id=\$1::uuid.*LIMIT 200/)
 assert.doesNotMatch(JSON.stringify(page),/source_sha256|snapshot|headers|owner_user_id/)
 const s=await f.repo.source(identity,id(1));assert.deepEqual(s,{source,name:"原助手"});assert.equal(Object.hasOwn(s,"snapshot"),false)
})
test("market/mine/detail/use projections match browser codecs including owner-only unlisted safe snapshot",async()=>{
 const f=fixture();assert.equal((await f.repo.market(identity,{category:"research",search:"目标"})).items.length,1);assert.equal((await f.repo.mine(identity)).items[0].public,false)
 const detail=await f.repo.detail(identity,id(2));assert.deepEqual(await parseTemplateMarketDetail(detail),detail)
 const own=await projectAgentTemplateMarketDetail(row({public:false}));assert.equal((await parseTemplateMarketDetail(own)).item.public,false)
 await assert.rejects(projectAgentTemplateMarketDetail(row({public:false,is_mine:false,source_spec_id:""})),e=>e.status===404)
 const p=await f.repo.previewUse(identity,{action:"preview_use",template:pin(),copy_name:"副本"});assert.deepEqual(await parseTemplateMarketUsePreview(p),p)
 assert.equal(p.snapshot.spec.require_approval,true);assert.deepEqual(p.snapshot.spec.knowledge_base_ids,[]);assert.equal(Object.hasOwn(p,"authority"),false)
 await assert.rejects(projectAgentTemplateMarketUsePreview({template:pin(),...deriveAgentTemplateMarketCopy(snapshot,"模板"),copy_sha256:hash}))
})
test("recorded recovery precedes write flag and re-enters record for full original intent comparison",async()=>{
 const intent=use(),old=receipt(intent),f=fixture({writes:false,old})
 assert.deepEqual(await f.repo.record(identity,intent),old)
 const rpc=f.trace.filter(x=>x[0].startsWith("SELECT agentstudio.agent_template_market_"))
 assert.equal(rpc.length,2);assert.match(rpc[0][0],/receipt/);assert.match(rpc[1][0],/record/);assert.deepEqual(JSON.parse(rpc[1][1][0]),intent)
 const lookup=fixture({writes:false,old});assert.deepEqual(await lookup.repo.recover(identity,intent.request_id),{status:"recorded",receipt:old});assert.equal(lookup.trace.filter(x=>x[0].includes("agent_template_market_record(")).length,0)
 const conflict=fixture({writes:false,old,rpcError:(name)=>{if(name.endsWith("_record"))return Object.assign(Error("agent_template_market_request_conflict"),{code:"P0001"});return null}})
 await assert.rejects(conflict.repo.record(identity,intent),e=>e.status===409&&e.code==="agent_template_market_request_conflict")
 assert.ok(conflict.trace.some(x=>x[0]==="ROLLBACK"))
})
test("new writes are gated only after receipt lookup; all five exact intents have one record call",async()=>{
 const disabled=fixture({writes:false});await assert.rejects(disabled.repo.record(identity,use()),e=>e.status===409&&e.code==="agent_template_market_writes_disabled")
 assert.equal(disabled.trace.filter(x=>x[0].includes("agent_template_market_record(")).length,0);assert.ok(disabled.trace.some(x=>x[0]==="ROLLBACK"))
 const pub={action:"publish",request_id:id(8),source,name:"模板",description:"用途",category:"research",expected_snapshot_sha256:snapshotSha,confirm:true,acknowledgement:agentTemplateMarketPublishAcknowledgement}
 for(const intent of[pub,use(),...["unpublish","republish","delete"].map(action=>({action,request_id:id(8),template:pin(),confirm:true}))]){const f=fixture();assert.equal((await f.repo.record(identity,intent)).operation,intent.action);assert.equal(f.trace.filter(x=>x[0].includes("agent_template_market_record(")).length,1)}
})
test("only fixed RPC business P0001 failures become known refusal; commit/projection/catalog remain uncertain",async()=>{
 for(const [code,status]of[["agent_template_market_invalid_intent",400],["agent_template_market_template_changed",409],["agent_template_market_owner_required",404]]){
  const f=fixture({rpcError:()=>Object.assign(Error(code),{code:"P0001"})});await assert.rejects(f.repo.record(identity,use()),e=>e instanceof HttpError&&e.status===status);assert.ok(f.trace.some(x=>x[0]==="ROLLBACK"))
 }
 const commit=Object.assign(Error("agent_template_market_template_changed"),{code:"P0001"}),f=fixture({commitError:commit});await assert.rejects(f.repo.record(identity,use()),e=>e===commit&&!(e instanceof HttpError))
 const malformed=fixture({recordValue:{...receipt(use()),owner_id:id(99)}});await assert.rejects(malformed.repo.record(identity,use()),e=>!(e instanceof HttpError));assert.ok(malformed.trace.some(x=>x[0]==="ROLLBACK"));assert.equal(malformed.trace.some(x=>x[0]==="COMMIT"),false)
 const audit=fixture({auditFalse:true});await assert.rejects(audit.repo.market(identity),e=>e.status===503);assert.equal(audit.trace.some(x=>x[0].includes("agent_template_market_market(")),false)
})
test("default-off, missing verifier, non-Native identities and extra grants never enter business RPC",async()=>{
 let connects=0;const pool={connect:async()=>{connects++;throw Error("unused")}}
 const off=new AgentTemplateMarketRepository(pool);await assert.rejects(off.market(identity),e=>e.status===503);assert.equal(connects,0)
 assert.throws(()=>new AgentTemplateMarketRepository(pool,{available:true}),/actual_auditor_required/)
 const f=fixture();await assert.rejects(f.repo.record({...identity,issuer:"arbitrary"},use()),e=>e.status===403);await assert.rejects(f.repo.record(identity,{...use(),owner_id:id(99)}));assert.equal(f.connects(),0)
})
