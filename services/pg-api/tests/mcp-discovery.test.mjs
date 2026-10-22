import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {createMcpDiscovery,mcpResponse} from "../src/mcp-discovery.ts"
import {createMcpNetwork} from "../src/mcp-network.ts"
import {parseMcpCatalog} from "../src/mcp-catalog.ts"
const secret="synthetic-mcp-secret-never-network",material={url:"https://mcp.example.com/server?mode=test",headers:[{key:"authorization",value:"Bearer "+secret}]}
const definition={name:"lookup",description:"Lookup evidence",inputSchema:{type:"object",properties:{query:{type:"string"}}},annotations:{readOnlyHint:true,destructiveHint:false}}
const reply=(id,result,extra={})=>({status:200,content_type:"application/json",session:"",text:JSON.stringify({jsonrpc:"2.0",id,result}),...extra})
const error=(id,code,data)=>({status:400,content_type:"application/json",session:"",text:JSON.stringify({jsonrpc:"2.0",id,error:{code,message:"Synthetic",data}})})
test("modern discovery carries per-request metadata, paginates and rejects reflected credentials and invalid header schemas",async()=>{
  const seen=[]
  const run=createMcpDiscovery(async(_material,wire)=>{
    seen.push(wire);assert.equal(wire.body.method,"tools/list");assert.equal(wire.headers["mcp-method"],"tools/list")
    assert.equal(wire.body.params._meta["io.modelcontextprotocol/protocolVersion"],"2026-07-28")
    assert.equal(wire.body.params._meta["io.modelcontextprotocol/clientCapabilities"].sampling,undefined)
    if(!wire.body.params.cursor)return reply(wire.body.id,{tools:[definition,{...definition,name:"credential",description:secret},
      {...definition,name:"bad_header",inputSchema:{type:"object",properties:{n:{type:"number","x-mcp-header":"Count"}}}}],nextCursor:"page-2"})
    assert.equal(wire.body.params.cursor,"page-2")
    return reply(wire.body.id,{tools:[{...definition,name:"second",execution:{taskSupport:"required"}}]})
  })
  const catalog=await run(material,AbortSignal.timeout(1000))
  assert.equal(seen.length,2);assert.deepEqual(catalog.tools.map(tool=>tool.name),["lookup","second"])
  assert.equal(catalog.tools[0].read_only,true);assert.equal(catalog.tools[1].requires_tasks,true)
  assert.deepEqual(parseMcpCatalog(catalog),catalog);assert.equal(JSON.stringify(catalog).includes(secret),false)
})
test("legacy HTTP 400 initiates a supported session and pins negotiated version without any tools/call",async()=>{
  const seen=[]
  const discover=createMcpDiscovery(async(_material,wire)=>{
    seen.push(wire)
    if(seen.length===1)return {status:400,content_type:"text/plain",session:"",text:"Session required"}
    if(wire.body.method==="initialize")return reply(wire.body.id,{protocolVersion:"2025-03-26",capabilities:{tools:{}}},{session:"synthetic-session"})
    assert.equal(wire.headers["mcp-session-id"],"synthetic-session");assert.equal(wire.headers["mcp-protocol-version"],"2025-03-26")
    if(wire.body.method==="notifications/initialized")return {status:202,text:"",content_type:"",session:""}
    assert.equal(wire.body.params._meta,undefined)
    return reply(wire.body.id,{tools:[definition]})
  })
  assert.equal((await discover(material,AbortSignal.timeout(1000))).version,"2025-03-26")
  assert.deepEqual(seen.map(wire=>wire.body.method),["tools/list","initialize","notifications/initialized","tools/list"])
  for(const response of [error(1,-32020,{}),error(1,-32022,{supported:["2099-01-01"]})]){
    let calls=0;await assert.rejects(createMcpDiscovery(async()=>{calls++;return response})(material,AbortSignal.timeout(1000)));assert.equal(calls,1)
  }
})
test("JSON/SSE require one matching response and never execute server-initiated requests",()=>{
  const body=': heartbeat\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'+
    'data: {"jsonrpc":"2.0",\r\ndata: "id":3,"result":{"tools":[]}}\r\n\r\n'
  assert.deepEqual(mcpResponse({status:200,content_type:"text/event-stream",text:body,session:""},3).result,{tools:[]})
  for(const text of ['data: {"jsonrpc":"2.0","id":4,"result":{}}\n\n',
    'data: {"jsonrpc":"2.0","method":"sampling/createMessage","id":1}\n\n',
    'data: {"jsonrpc":"2.0","id":3,"result":{}}\n\ndata: {"jsonrpc":"2.0","id":3,"result":{}}\n\n'])
    assert.throws(()=>mcpResponse({status:200,content_type:"text/event-stream",text,session:""},3))
})
test("discovery rejects duplicate tools, repeated cursors, unbounded results and never retries a broken connection",async()=>{
  for(const result of [{tools:[definition,definition]},{tools:[],nextCursor:"repeat"},{tools:Array(51).fill(definition)}]){
    let calls=0;await assert.rejects(createMcpDiscovery(async(_material,wire)=>{calls++;return reply(wire.body.id,result)})(material,AbortSignal.timeout(1000)))
    assert.ok(calls<=2)
  }
  let calls=0;await assert.rejects(createMcpDiscovery(async()=>{calls++;throw Error("synthetic reset")})(material,AbortSignal.timeout(1000)));assert.equal(calls,1)
})
const resolver={async resolve4(){return ["93.184.216.34"]},async resolve6(){return []}}
function socket(spec,events){return (options,callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit("error",Error("synthetic reset"))
  req.end=body=>{events.push({options,body});queueMicrotask(()=>{
    if(spec.error){req.emit("error",Error("synthetic reset"));return}
    const res=new EventEmitter();res.statusCode=spec.status??200;res.headers={"content-type":"application/json",...spec.headers};res.destroy=()=>{}
    callback(res);queueMicrotask(()=>{if(spec.aborted){res.emit("aborted");return};res.emit("data",spec.body??Buffer.from('{}'));res.emit("end")})
  })};return req
}}
test("MCP network pins public DNS/TLS and refuses redirects, compression, truncation and unsafe headers without replay",async()=>{
  const events=[],wire={body:{jsonrpc:"2.0",id:1,method:"tools/list",params:{}},headers:{"mcp-protocol-version":"2026-07-28","mcp-method":"tools/list"}}
  await createMcpNetwork(resolver,socket({body:Buffer.from('{}')},events))(material,wire,AbortSignal.timeout(1000))
  assert.equal(events[0].options.rejectUnauthorized,true);assert.equal(events[0].options.agent,false)
  assert.equal(events[0].options.headers.authorization,"Bearer "+secret);assert.equal(events[0].options.path,"/server?mode=test")
  let ip;events[0].options.lookup("mcp.example.com",{},(_error,address)=>{ip=address});assert.equal(ip,"93.184.216.34")
  for(const spec of [{status:302,headers:{location:"https://other.example.com"}},{headers:{"content-encoding":"gzip"}},{aborted:true},{body:Buffer.alloc(262145)},{error:true}]){
    const seen=[];await assert.rejects(createMcpNetwork(resolver,socket(spec,seen))(material,wire,AbortSignal.timeout(1000)));assert.equal(seen.length,1)
  }
  const none=[];await assert.rejects(createMcpNetwork({async resolve4(){return ["127.0.0.1"]},async resolve6(){return []}},socket({},none))(material,wire,AbortSignal.timeout(1000)))
  await assert.rejects(createMcpNetwork(resolver,socket({},none))(material,{...wire,headers:{host:"foreign.example.com"}},AbortSignal.timeout(1000)))
  assert.equal(none.length,0)
})
