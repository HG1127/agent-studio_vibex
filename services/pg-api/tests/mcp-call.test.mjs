import test from "node:test"
import assert from "node:assert/strict"
import {selectNativePg18UatCapabilities} from "../src/native-config-uat-policy.ts"
import {createMcpToolExecutor,mcpToolCallHeaders,selectMcpExecution} from "../src/mcp-call.ts"
import {validateMcpArguments} from "../src/mcp-validation.ts"
import {parseMcpBinding,parseAgentMcpTools} from "../src/mcp-binding.ts"
const definition={name:"lookup",description:"Synthetic",input_schema:{type:"object",properties:{query:{type:"string"},nested:{type:"object",properties:{region:{type:"string","x-mcp-header":"Region"}}}},required:["query"],additionalProperties:false},read_only:true,destructive:false,requires_tasks:false}
const material={url:"https://mcp.example.com/server",headers:[{key:"authorization",value:"Bearer synthetic-mcp-secret-123456"}],version:"2026-07-28",definition}
const reply=(wire,result,extra={})=>({status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result}),...extra})
test("modern MCP call pins name/version, mirrors schema headers and returns only bounded redacted business content",async()=>{
  const seen=[],execute=createMcpToolExecutor(async(current,wire)=>{
    seen.push(wire);assert.equal(current.url,material.url);assert.equal(wire.body.method,"tools/call")
    assert.equal(wire.headers["mcp-method"],"tools/call");assert.equal(wire.headers["mcp-name"],"lookup")
    assert.equal(wire.headers["mcp-param-region"],"=?base64?"+Buffer.from(" 华东 ").toString("base64")+"?=")
    assert.equal(wire.body.params._meta["io.modelcontextprotocol/protocolVersion"],material.version)
    return reply(wire,{content:[{type:"text",text:"Business result / "+material.headers[0].value},{type:"resource",resource:{uri:"https://never-followed.example/file",text:"Embedded content"}}]})
  })
  const result=await execute(material,{query:"Synthetic",nested:{region:" 华东 "}},AbortSignal.timeout(2000))
  assert.equal(result.isError,false);assert.match(result.text,/Business result.*redacted/s);assert.match(result.text,/Embedded content/);assert.equal(seen.length,1)
  assert.equal(result.text.includes("synthetic-mcp-secret"),false)
  assert.equal(mcpToolCallHeaders({...definition,name:"=?base64?literal?="},{query:"X"})["mcp-name"],"=?base64?"+Buffer.from("=?base64?literal?=").toString("base64")+"?=")
})
test("legacy call uses exactly the pinned initialization/session and never falls back or resends tools/call",async()=>{
  const seen=[],version="2025-03-26"
  const execute=createMcpToolExecutor(async(_material,wire)=>{
    seen.push(wire)
    if(wire.body.method==="initialize")return reply(wire,{protocolVersion:version,capabilities:{tools:{}}},{session:"synthetic-session"})
    assert.equal(wire.headers["mcp-session-id"],"synthetic-session")
    if(wire.body.method==="notifications/initialized")return {status:202,text:"",content_type:"",session:""}
    assert.equal(wire.headers["mcp-protocol-version"],version);assert.equal(wire.body.params._meta,undefined)
    return reply(wire,{content:[],structuredContent:{result:4}})
  })
  assert.match((await execute({...material,version},{query:"X"},AbortSignal.timeout(2000))).text,/result.*4/)
  assert.deepEqual(seen.map(wire=>wire.body.method),["initialize","notifications/initialized","tools/call"])
  let calls=0
  await assert.rejects(createMcpToolExecutor(async()=>{calls++;throw Error("response lost after call")})(material,{query:"X"},AbortSignal.timeout(2000)))
  assert.equal(calls,1)
  await assert.rejects(createMcpToolExecutor(async(_material,wire)=>reply(wire,{protocolVersion:"2025-11-25",capabilities:{tools:{}}}))({...material,version},{query:"X"},AbortSignal.timeout(2000)))
})
test("MCP explicit business failure is distinguished from malformed, input-required and asynchronous responses",async()=>{
  const failed=await createMcpToolExecutor(async(_material,wire)=>reply(wire,{isError:true,content:[{type:"text",text:"Business rejected"}]}))(material,{query:"X"},AbortSignal.timeout(2000))
  assert.equal(failed.isError,true)
  for(const result of [{},{inputRequests:[{method:"sampling/createMessage"}]},{task:{taskId:"never-follow"}},{content:[],isError:"yes"}]){
    let calls=0;await assert.rejects(createMcpToolExecutor(async(_material,wire)=>{calls++;return reply(wire,result)})(material,{query:"X"},AbortSignal.timeout(2000)));assert.equal(calls,1)
  }
})
test("JSON Schema validation is isolated, supports local refs/composition and never coerces or resolves remote refs",async()=>{
  assert.equal(await validateMcpArguments(definition,{query:"Owner",nested:{region:"East"}}),true)
  for(const args of [{query:123},{query:"Owner",extra:true},{}])assert.equal(await validateMcpArguments(definition,args),false)
  const local={...definition,input_schema:{type:"object",$defs:{query:{type:"string",minLength:2}},properties:{query:{$ref:"#/$defs/query"}},required:["query"]}}
  assert.equal(await validateMcpArguments(local,{query:"Own"}),true);assert.equal(await validateMcpArguments(local,{query:"x"}),false)
  for(const schema of [{type:"object",properties:{query:{$ref:"https://never-followed.example/schema"}}},{type:"object",$async:true},{type:"object",$schema:"https://unknown.example/schema"}])
    assert.equal(await validateMcpArguments({...definition,input_schema:schema},{query:"X"}),false)
  const started=Date.now(),dangerous={...definition,input_schema:{type:"object",properties:{query:{type:"string",pattern:"^(a+)+$"}}}}
  assert.equal(await validateMcpArguments(dangerous,{query:"a".repeat(48)+"!"}),false);assert.ok(Date.now()-started<6000)
})
test("MCP bindings are closed pinned references and runtime activation is independent/default-off",()=>{
  const binding={connection_id:"11111111-1111-4111-8111-111111111111",connection_revision:2,tool_name:"lookup",catalog_sha256:"a".repeat(64)}
  assert.deepEqual(parseMcpBinding(binding),binding);assert.equal(parseAgentMcpTools([{name:"mcp_lookup",...binding}]).length,1)
  for(const raw of [{...binding,url:material.url},{...binding,version:"2026-07-28"},{...binding,catalog_sha256:"bad"},{...binding,connection_revision:0}])assert.throws(()=>parseMcpBinding(raw))
  assert.equal(selectMcpExecution({}),false)
  assert.throws(()=>selectMcpExecution({AGENT_STUDIO_PG_MCP_TOOLS_ENABLED:"true"}))
  assert.equal(selectMcpExecution({AGENT_STUDIO_PG_MCP_TOOLS_ENABLED:"true",AGENT_STUDIO_PG_MCP_TOOLS_APPROVED:"APPROVE_DISPOSABLE_PG18_MCP_TOOLS_ONLY"}),true)
  const grant={AGENT_STUDIO_PG_MCP_TOOLS_ENABLED:"true",AGENT_STUDIO_PG_MCP_TOOLS_APPROVED:"APPROVE_DISPOSABLE_PG18_MCP_TOOLS_ONLY"},
    config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"},
    workflow={AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED:"true",AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY"}
  for(const env of [grant,{...config,...grant}])assert.throws(()=>selectNativePg18UatCapabilities(env,true,"https://localhost:7443",1100))
  const env={...config,...workflow,...grant}
  assert.equal(selectNativePg18UatCapabilities(env,true,"https://localhost:7443",1100).mcpToolExecutionUat,true)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://localhost:7443",1100))
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"https://localhost:7443",0))
})
