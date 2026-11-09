// Stream/repository fixtures only; no listener, real session, DB or ACL positive.
import test from "node:test"
import assert from "node:assert/strict"
import {Readable} from "node:stream"
import {createAgentTemplateMarketHttpHandler} from "../src/agent-template-market-http.ts"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {NATIVE_SESSION_COOKIE} from "../src/native-employee-auth.mjs"
import {HttpError} from "../src/contracts.ts"
import {deriveAgentTemplateMarketSnapshot,deriveAgentTemplateMarketPublishPreview} from "../src/agent-template-market-result.ts"
import {agentTemplateMarketDigest} from "../src/agent-template-market-contract.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const origin="https://localhost:7458",identity={issuer:"urn:agentstudio:local:v1",subject:"employee"},id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),hash="a".repeat(64)
const {snapshot}=deriveAgentTemplateMarketSnapshot({goal:"完整目标",task_scope:"范围",deliverables:["交付"],task_plan:["计划"],done_criteria:["条件"],tools:["web_search"]}),sha=await agentTemplateMarketDigest(snapshot)
const row={id:id(2),name:"模板",description:"用途",category:"research",source_spec_id:"",built_in:false,public:true,use_count:0,created:"2026-10-29T00:00:00.000Z",revision:1,snapshot_sha256:sha,spec:snapshot.spec,is_mine:false,author_tail:"0001"}
const source={spec_id:id(1),revision:2,source_sha256:hash},pin={template_id:id(2),revision:1,snapshot_sha256:sha}
const use=()=>({action:"use",request_id:id(8),template:pin,copy_name:"我的副本",expected_copy_sha256:hash,confirm:true})
const receipt=()=>({operation:"use",request_id:id(8),template_id:id(2),revision:1,snapshot_sha256:sha,spec_id:id(9),spec_revision:1,use_count:1})
function request(path,method="GET",body,extra={}){
 const text=body===undefined?"":typeof body==="string"?body:JSON.stringify(body),r=Readable.from(text?[Buffer.from(text)]:[])
 Object.assign(r,{url:path,method,headers:{origin,cookie:NATIVE_SESSION_COOKIE+"="+"a".repeat(43),...(method!=="GET"?{"x-agentstudio-request":"1","content-type":"application/json","content-length":String(Buffer.byteLength(text))}:{}),...extra}});return r
}
const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}})
const handler=(repository,auth=async()=>identity)=>createAgentTemplateMarketHttpHandler({repository,authenticateRequest:auth,allowedOrigin:origin})
const base="/api/v2/template-market"

test("Native metadata needs explicit server read gate and configuration consent for writes",async()=>{
 const unused=async()=>{throw Error("unused_native_auth_method")}
 for(const [available,writes,configuration] of [[false,false,false],[true,true,false],[true,true,true]]){
  const native=createNativeAuthHttpHandler({allowedOrigin:origin,businessHandler:async()=>{throw Error("unused")},
   allowAgentTemplateMarket:available,allowAgentTemplateMarketWrites:writes,allowConfigurationWrites:configuration,
   auth:{login:unused,verifySession:unused,revokeSession:unused,provisionEmployee:unused,getSessionProfile:async()=>({id:id(1),is_admin:false})}})
  const out=response();await native.handler(request("/api/native-auth/capabilities"),out);assert.equal(out.status,200)
  if(available){assert.equal(out.body.agent_template_market_available,true);assert.equal(out.body.agent_template_market_writes_enabled,configuration)}
  else{assert.equal(Object.hasOwn(out.body,"agent_template_market_available"),false);assert.equal(Object.hasOwn(out.body,"agent_template_market_writes_enabled"),false)}
 }
})

test("browser metadata rejects malformed or unpaired market write hints",async()=>{
 const common={mode:"native_pg18",config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false}
 const read=patch=>createPgNativePilotApi(async()=>new Response(JSON.stringify({...common,...patch}),{status:200})).getConfigCapabilities()
 assert.equal((await read({agent_template_market_available:true})).agent_template_market_available,true)
 assert.equal((await read({agent_template_market_available:true,agent_template_market_writes_enabled:true,config_writes_enabled:true})).agent_template_market_writes_enabled,true)
 for(const patch of [{agent_template_market_available:"true"},{agent_template_market_writes_enabled:1},{agent_template_market_writes_enabled:true},{agent_template_market_available:false,agent_template_market_writes_enabled:true},{agent_template_market_available:true,agent_template_market_writes_enabled:true}])await assert.rejects(read(patch),e=>e.code==="invalid_native_capabilities")
})
test("unrelated family is untouched and all read routes preserve exact DTO and two live identity checks",async()=>{
 let auth=0;const calls=[],repo={market:async(_i,q)=>{calls.push(q);return{ok:true,items:[row]}},mine:async()=>({ok:true,items:[]}),sources:async()=>({ok:true,items:[{spec_id:id(1),name:"选项",revision:2}]}),source:async()=>({source,name:"原助手"}),detail:async()=>({item:Object.fromEntries(Object.entries(row).filter(([k])=>!["spec","is_mine","author_tail"].includes(k))),snapshot,is_mine:false,author_tail:"0001"}),recover:async()=>({status:"recorded",receipt:receipt()})}
 const run=handler(repo,async()=>{auth++;return identity});assert.equal(await run(request("/api/other"),response()),false);assert.equal(auth,0)
 for(const path of["/market?category=research&search=%E7%9B%AE%E6%A0%87","/mine","/sources","/sources/"+id(1),"/"+id(2),"/requests/"+id(8)]){const out=response();assert.equal(await run(request(base+path),out),true);assert.equal(out.status,200);assert.equal(out.headers["Cache-Control"],"no-store")}
 assert.equal(auth,12);assert.deepEqual(calls,[{category:"research",search:"目标"}])
})
test("Origin/CSRF, Cookie, untrusted identity headers and path/query aliases never call repository",async()=>{
 let calls=0;const run=handler({record:async()=>{calls++}})
 for(const [path,headers]of[[base+"/"+id(2)+"/use",{"x-rh-user-id":"fake"}],[base+"/"+id(2)+"/use",{"x-agentstudio-request":undefined}],
 [base+"/"+id(2)+"/use",{origin:"https://outside.invalid"}],[base+"/"+id(2)+"/use",{authorization:"Bearer fake"}],
 [base+"/%70ublish",{}],[base+"/publish?alias=1",{}]]){const out=response();await run(request(path,"POST",use(),headers),out);assert.ok([400,401,403].includes(out.status))}
 for(const suffix of["/market?category=all&category=research","/market?owner_id=fake","/sources?search=x"]){const out=response();await run(request(base+suffix),out);assert.equal(out.status,400)}
 assert.equal(calls,0)
})
test("closed intents, duplicate keys and URL/body target disagreement are refused before recording",async()=>{
 let calls=0;const run=handler({record:async()=>{calls++}})
 for(const body of[{...use(),owner_id:id(5)},{...use(),template:{...pin,template_id:id(3)}},JSON.stringify(use()).replace('"confirm":true','"confirm":true,"confirm":true')]){const out=response();await run(request(base+"/"+id(2)+"/use","POST",body),out);assert.equal(out.status,400)}
 assert.equal(calls,0)
})
test("all confirmed actions map exact POST/DELETE route to repository record and immutable result",async()=>{
 const pub={action:"publish",request_id:id(8),source,name:"模板",description:"用途",category:"research",expected_snapshot_sha256:sha,confirm:true,acknowledgement:"PUBLISH_REVIEWED_AGENT_TEMPLATE"},calls=[]
 const run=handler({record:async(_identity,intent)=>{calls.push(intent);return intent.action==="publish"?{operation:"publish",request_id:id(8),item:{...Object.fromEntries(Object.entries(row).filter(([k])=>!["spec","is_mine","author_tail"].includes(k))),source_spec_id:id(1)}}:intent.action==="use"?receipt():{operation:intent.action,request_id:id(8),template_id:id(2),revision:2,snapshot_sha256:sha,public:intent.action==="republish",deleted:intent.action==="delete"}}})
 for(const intent of[pub,use(),...["unpublish","republish","delete"].map(action=>({action,request_id:id(8),template:pin,confirm:true}))]){const suffix=intent.action==="publish"?"/publish":"/"+id(2)+(intent.action==="delete"?"":"/"+intent.action),out=response();await run(request(base+suffix,intent.action==="delete"?"DELETE":"POST",intent),out);assert.equal(out.status,200);assert.equal(out.body.operation,intent.action)}
 assert.equal(calls.length,5)
})
test("known pre-commit refusal remains400/409; fulfilled malformed write and unknown backend failure remain500",async()=>{
 for(const status of[400,409]){const out=response();await handler({record:async()=>{throw new HttpError(status,"agent_template_market_request_conflict")}})(request(base+"/"+id(2)+"/use","POST",use()),out);assert.equal(out.status,status)}
 for(const record of[async()=>({...receipt(),owner_id:id(1)}),async()=>{throw Object.assign(Error("private_backend_failure"),{status:400})}]){const out=response();await handler({record})(request(base+"/"+id(2)+"/use","POST",use()),out);assert.equal(out.status,500);assert.deepEqual(out.body,{error:"internal_error"})}
})
test("actual Native wrapper denies expired test Cookie and post-work identity change releases no old result",async()=>{
 let checks=0,reads=0
 const unused=async()=>{throw Error("unused")},native=createNativeAuthHttpHandler({allowedOrigin:origin,businessHandler:unused,auth:{login:unused,getSessionProfile:unused,revokeSession:unused,provisionEmployee:unused,verifySession:async()=>{checks++;return checks===1?identity:null}}})
 const out=response();await handler({market:async()=>{reads++;return{ok:true,items:[row]}}},native.authenticateRequest)(request(base+"/market"),out)
 assert.equal(checks,2);assert.equal(reads,1);assert.equal(out.status,401);assert.deepEqual(out.body,{error:"session_required"});assert.doesNotMatch(JSON.stringify(out.body),/完整目标/)
 let turn=0;const changed=response();await handler({record:async()=>receipt()},async()=>({...identity,subject:++turn===1?"first":"replacement"}))(request(base+"/"+id(2)+"/use","POST",use()),changed);assert.equal(changed.status,401);assert.equal(Object.hasOwn(changed.body,"spec_id"),false)
 const mutable={...identity},reused=response();await handler({market:async()=>{mutable.subject="replacement";return{ok:true,items:[row]}}},async()=>mutable)(request(base+"/market"),reused);assert.equal(reused.status,401)
})
test("previews retain safe full fields and opaque source proofs without exposing DB-only projection fields",async()=>{
 const choice={action:"preview_publish",source,name:"模板",description:"用途",category:"research"},preview=await deriveAgentTemplateMarketPublishPreview(choice,"原助手",{goal:"完整目标",task_scope:"范围",deliverables:["交付"],task_plan:["计划"],done_criteria:["条件"],tools:["web_search"]})
 const out=response();await handler({previewPublish:async()=>preview})(request(base+"/preview-publish","POST",choice),out)
 assert.equal(out.status,200);assert.equal(out.body.snapshot.spec.goal,"完整目标");assert.deepEqual(out.body.source,source)
})
