// Pure contracts and synthetic transport only: never dials a network or runs SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {safeToolTrialRequest,toolTrialGraph,TOOL_TRIAL_EFFECT_ACK,TOOL_TRIAL_FEE_ACK} from '../src/tool-trial-contract.ts'
import {createWorkflowV2Checkpoint,advanceWorkflowV2Checkpoint} from '../src/workflow-v2-machine.ts'
import {prepareWorkflowTool} from '../src/workflow-v2-tool-plan.ts'
import {publicRegistryList,publicRegistryDetail,publicRegistryPath,projectPublicRegistry} from '../src/public-mcp-registry.ts'
import {createPublicMcpRegistryNetwork,selectPublicMcpRegistryRead} from '../src/public-mcp-registry-network.ts'
const id='00000000-0000-4000-8000-000000000001',request=(target={kind:'builtin',tool:'calculate'},args={expression:'1+2'})=>({purpose:'tool',request_id:id,target,arguments_json:JSON.stringify(args),effect_consent:TOOL_TRIAL_EFFECT_ACK,...(target.kind==='builtin'&&target.tool==='calculate'?{}:{fee_consent:TOOL_TRIAL_FEE_ACK})})
function pending(input){const graph=toolTrialGraph(safeToolTrialRequest(input));let checkpoint=createWorkflowV2Checkpoint(graph,'本人独立工具试调',{finalDelivery:true});for(let i=0;i<5;i++){const next=advanceWorkflowV2Checkpoint(graph,checkpoint);checkpoint=next.checkpoint;if(next.view.pending)return {graph,pending:next.view.pending}}throw Error('original effect was not requested')}
const server=(extra={},official={})=>({server:{name:'io.github.example/weather',title:'Weather',description:'Public weather data',version:'1.0.0',remotes:[{type:'streamable-http',url:'https://weather.example.com/mcp'}],packages:[],...extra},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true,...official}}})
const list=items=>({servers:items,metadata:{count:items.length,nextCursor:''}})

test('independent calculate trial still reaches an original awaiting-approval tool effect, never a direct executor',()=>{
 const value=pending(request());assert.equal(value.graph.nodes.length,3);assert.equal(value.pending.kind,'tool');assert.equal(prepareWorkflowTool(value.pending).output,'1+2 = 3');assert.equal(value.pending.missing.length,0)
})
test('literal trial JSON preserves braces, quotes, escapes and template-looking user strings without resolving any reference',()=>{
 for(const text of ['{{input}}','{{private.output}}','\\{{a}}','{{{{x}}}}','quote " and newline\n','汉字🙂']){
  const value=pending(request({kind:'mcp',binding:{connection_id:id,connection_revision:2,tool_name:'echo',catalog_sha256:'a'.repeat(64)}},{text,nested:{text}}))
  assert.deepEqual(JSON.parse(value.pending.input),{nested:{text},text});assert.deepEqual(value.pending.missing,[])
 }
})
test('all HTTP/MCP and non-calculation builtins require exact effect and fee consent; hints never supply consent',()=>{
 for(const target of [{kind:'builtin',tool:'web_fetch'},{kind:'http',binding:{connection_id:id,connection_revision:1}},{kind:'mcp',binding:{connection_id:id,connection_revision:1,tool_name:'read',catalog_sha256:'a'.repeat(64)}}]){
  const value=request(target,{url:'https://example.com/'});assert.doesNotThrow(()=>safeToolTrialRequest(value));for(const field of ['effect_consent','fee_consent']){const bad={...value};delete bad[field];assert.throws(()=>safeToolTrialRequest(bad));assert.throws(()=>safeToolTrialRequest({...value,[field]:true}))}
 }
})
test('closed request/source fields reject forged owner, raw URL/headers, inherited properties, symbols, accessor and stale-format bindings',()=>{
 const good=request();for(const value of [{...good,owner_user_id:id},{...good,url:'https://private/'},{...good,[Symbol('x')]:1},Object.create(good),{...good,target:{kind:'http',binding:{connection_id:id,connection_revision:0},headers:[{key:'authorization',value:'secret'}]}}])assert.throws(()=>safeToolTrialRequest(value))
 const getter={...good};Object.defineProperty(getter,'target',{enumerable:true,get(){throw Error('getter')}});assert.throws(()=>safeToolTrialRequest(getter),error=>error.code==='invalid_tool_trial')
 for(const arguments_json of ['[]','null','{"__proto__":{}}','{"x":{"constructor":1}}','{"x":"\\u0000"}'])assert.throws(()=>safeToolTrialRequest({...good,arguments_json}))
})
test('official list keeps latest/version filters and bounded opaque cursors; short Unicode search cannot turn into an unfiltered request',()=>{
 const query=publicRegistryList('  weather  ','io.example/weather:1.0.0'),url=new URL(publicRegistryPath(query),'https://registry.modelcontextprotocol.io');assert.equal(url.pathname,'/v0.1/servers');assert.equal(url.searchParams.get('search'),'weather');assert.equal(url.searchParams.get('version'),'latest');assert.equal(url.searchParams.get('limit'),'24')
 assert.doesNotThrow(()=>publicRegistryList('天气图'));for(const q of ['a','天气','🙂🙂','a\n',' '])assert.throws(()=>publicRegistryList(q));assert.equal(publicRegistryList('').query,'');assert.throws(()=>publicRegistryList('', 'bad\ncursor'))
})
test('exact detail safely encodes server identity and version without guessing first substring match',()=>{
 assert.equal(publicRegistryPath(publicRegistryDetail('io.github.example/weather')),'/v0.1/servers/io.github.example%2Fweather/versions/latest')
 for(const name of ['https://attacker.example/x','../weather','io.example/a/../../b','io.example/weather?x=1'])assert.throws(()=>publicRegistryDetail(name))
})
test('registry projection retains informational text and pins its content while dropping unsupported/private/query credentials and all arbitrary fields',()=>{
 const raw=server({remotes:[{type:'stdio',url:'file:///root/private'},{type:'streamable-http',url:'https://localhost/mcp'},{type:'streamable-http',url:'https://weather.example.com/mcp?key=secret'},{type:'streamable-http',url:'https://weather.example.com/mcp'}],environmentVariables:[{name:'SECRET'}],commands:['delete-all']})
 const page=projectPublicRegistry(list([raw]),publicRegistryList());assert.equal(page.is_execution_authority,false);assert.equal(page.items[0].remotes.length,1);assert.equal(page.items[0].source_sha256.length,64);assert.equal('commands'in page.items[0],false);assert.equal('environmentVariables'in page.items[0],false)
 assert.equal(projectPublicRegistry(list([server({}, {status:'deleted'})]),publicRegistryList()).items.length,0)
})
test('registry metadata refuses coercible status, duplicate/non-latest entries, mismatched detail and repeated cursor',()=>{
 for(const official of [{status:['active']},{status:{toString:()=> 'active'}},{isLatest:false},{isLatest:'true'}])assert.throws(()=>projectPublicRegistry(list([server({},official)]),publicRegistryList()))
 assert.throws(()=>projectPublicRegistry(list([server(),server()]),publicRegistryList()));assert.throws(()=>projectPublicRegistry(server({name:'io.example/other'}),publicRegistryDetail('io.github.example/weather')))
 assert.throws(()=>projectPublicRegistry({servers:[],metadata:{nextCursor:'same'}},publicRegistryList('','same')))
 assert.equal(projectPublicRegistry(server({version:'0.9.0'},{isLatest:false}),publicRegistryDetail('io.github.example/weather','0.9.0')).items[0].version,'0.9.0')
})
function transport({status=200,encoding,body=JSON.stringify(list([server()])),addresses=['93.184.216.34']}={}){
 const calls=[],resolver={resolve4:async host=>{assert.equal(host,'registry.modelcontextprotocol.io');return addresses},resolve6:async()=>[]},request=(options,callback)=>{calls.push(options);const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':'application/json',...(encoding?{'content-encoding':encoding}:{})};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(body));res.emit('end')});return req};return {calls,run:createPublicMcpRegistryNetwork(resolver,request)}
}
test('actual network adapter prepares only fixed HTTPS GET with original safe DNS pin, no auth/cookie/proxy/redirect/retry',async()=>{
 const t=transport(),page=await t.run(publicRegistryList('weather'),new AbortController().signal);assert.equal(page.items.length,1);assert.equal(t.calls.length,1);const wire=t.calls[0];assert.equal(wire.hostname,'registry.modelcontextprotocol.io');assert.equal(wire.servername,wire.hostname);assert.equal(wire.method,'GET');assert.equal(wire.agent,false);assert.equal(wire.rejectUnauthorized,true);assert.equal(wire.headers.authorization,undefined);assert.equal(wire.headers.cookie,undefined);let pinned;wire.lookup('ignored',{},(_error,address,family)=>{pinned={address,family}});assert.deepEqual(pinned,{address:'93.184.216.34',family:4})
})
test('real adapter refuses private DNS, redirects, compression, oversized or malformed content without issuing a second attempt',async()=>{
 for(const config of [{addresses:['127.0.0.1']},{status:302},{encoding:'gzip'},{body:'{"bad":true}'},{body:' '.repeat(262145)}]){const t=transport(config);await assert.rejects(t.run(publicRegistryList(),new AbortController().signal));assert.ok(t.calls.length<=1)}
})
test('registry admission remains separately default off and abort can end a stuck DNS lookup before any HTTPS request',async()=>{
 assert.equal(selectPublicMcpRegistryRead({}),false);assert.throws(()=>selectPublicMcpRegistryRead({AGENT_STUDIO_PG_PUBLIC_MCP_REGISTRY_ENABLED:'true'}));assert.equal(selectPublicMcpRegistryRead({AGENT_STUDIO_PG_PUBLIC_MCP_REGISTRY_ENABLED:'true',AGENT_STUDIO_PG_PUBLIC_MCP_REGISTRY_APPROVED:'APPROVE_DISPOSABLE_PG18_PUBLIC_REGISTRY_READ_ONLY'}),true)
 const abort=new AbortController(),run=createPublicMcpRegistryNetwork({resolve4:()=>new Promise(()=>{}),resolve6:()=>new Promise(()=>{})},()=>{throw Error('must not dial')});const work=run(publicRegistryList(),abort.signal);abort.abort();await assert.rejects(work)
})
