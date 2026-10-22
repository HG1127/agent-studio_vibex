import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {prepareWorkflowTool,evaluateWorkflowArithmetic,safeWorkflowToolArguments} from "../src/workflow-v2-tool-plan.ts"
import {createWorkflowToolNetwork,prepareWorkflowToolHttp,parseWorkflowSearchHtml,redactWorkflowToolResponse} from "../src/workflow-v2-tool-network.ts"
import {WorkflowKnownEffectFailure} from "../src/workflow-v2-effect-failure.ts"
const resolver={async resolve4(){return ["93.184.216.34"]},async resolve6(){return []}}
function fake(responses,events=[]){let index=0;return (options,callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit("error",Error("synthetic timeout"))
  req.end=body=>{events.push({options,body});const spec=responses[Math.min(index++,responses.length-1)]
    queueMicrotask(()=>{
      if(spec.error){req.emit("error",Error("synthetic private exception"));return}
      const res=new EventEmitter();res.statusCode=spec.status??200;res.headers={"content-type":"text/plain",...spec.headers};res.destroy=()=>{}
      callback(res)
      queueMicrotask(()=>{if(spec.aborted){res.emit("aborted");return};res.emit("data",Buffer.isBuffer(spec.body)?spec.body:Buffer.from(spec.body??"synthetic"));res.emit("end")})
    })};return req
}}
const signal=()=>new AbortController().signal
const material={url:"https://tools.example.com/lookup/{{query}}",method:"POST",body_template:'{"data":{{input}},"encoded":"{{query}}"}',timeout_s:60,
  headers:[{key:"Authorization",value:"Bearer synthetic-tool-token-123456"}]}
test("bounded tool parser preserves arithmetic/summary semantics and rejects unsafe or forged arguments",()=>{
  assert.equal(evaluateWorkflowArithmetic("-(2+3)*4 + 9%4"),-19)
  assert.equal(evaluateWorkflowArithmetic(".5 + 1."),1.5)
  for(const value of ["1..2","1/0","globalThis.x=1","(".repeat(40)+"1"+")".repeat(40),"9".repeat(400)])
    assert.throws(()=>evaluateWorkflowArithmetic(value),WorkflowKnownEffectFailure)
  for(const value of ['[]','{"__proto__":{}}','{"a":{"constructor":"x"}}','{"a":'+"[".repeat(20)+"1"+"]".repeat(20)+'}'])
    assert.throws(()=>safeWorkflowToolArguments(value),WorkflowKnownEffectFailure)
  const request={kind:"tool",input:'{"expression":"2+2"}',configuration:{tool:"calculate"}}
  assert.equal(prepareWorkflowTool(request).output,"2+2 = 4")
  assert.throws(()=>prepareWorkflowTool({...request,input:'{"expression":"2+2","url":"https://forged.example.com"}'}))
  assert.throws(()=>prepareWorkflowTool({kind:"tool",input:'{"text":"text"}',configuration:{tool:"summarize"}}),/model_binding_missing/)
  const binding={connection_id:"11111111-1111-4111-8111-111111111111",connection_revision:2,model_id:"synthetic"}
  assert.match(prepareWorkflowTool({kind:"tool",input:'{"text":"private text","focus":"focus"}',configuration:{tool:"summarize",model_binding:binding}}).prompt,/focus.*private text/s)
})
test("HTTP templates retain fixed origins and copied secret headers; echoed credentials are redacted before return",async()=>{
  const events=[],spec=prepareWorkflowToolHttp(material,{query:'a"/b',url:"https://forged.example.com"})
  assert.equal(new URL(spec.url).hostname,"tools.example.com");assert.match(spec.url,/a%22%2Fb/)
  assert.equal(JSON.parse(spec.body).data.url,"https://forged.example.com")
  const network=createWorkflowToolNetwork(resolver,fake([{body:'Bearer synthetic-tool-token-123456 token=synthetic-tool-token-123456 ?api_key=private'}],events))
  const result=await network.http(material,{query:"hello"},signal())
  assert.equal(result.includes("synthetic-tool-token"),false);assert.equal(result.includes("api_key=private"),false)
  assert.equal(events.length,1);assert.equal(events[0].options.rejectUnauthorized,true);assert.equal(events[0].options.agent,false)
  let address;events[0].options.lookup("tools.example.com",{},(_error,ip)=>{address=ip});assert.equal(address,"93.184.216.34")
  assert.equal(events[0].options.headers.authorization,material.headers[0].value)
  assert.equal(events[0].options.timeout,24000)
  for(const key of ["Host","Content-Length","Transfer-Encoding","X-Rh-User-Id","Proxy-Authorization","X-Forwarded-Host","Accept-Encoding"])
    assert.throws(()=>prepareWorkflowToolHttp({...material,headers:[{key,value:"forged"}]},{}))
  const short=redactWorkflowToolResponse("x".repeat(1000),[..."[redacted]x"])
  assert.equal(short.length,10000)
})
test("public DNS pinning blocks private/mixed addresses and redirects before reaching unsafe targets",async()=>{
  const events=[]
  const network=createWorkflowToolNetwork({async resolve4(){return ["93.184.216.34"]},async resolve6(){return ["::1"]}},fake([{body:"unexpected"}],events))
  await assert.rejects(network.webFetch("https://public.example.com/page",signal()));assert.equal(events.length,0)
  for(const url of ["http://127.0.0.1","https://user:password@public.example.com","https://intranet.local/x","https://public.example.com:5333"])
    await assert.rejects(createWorkflowToolNetwork(resolver,fake([{body:"no"}],events)).webFetch(url,signal()))
  assert.equal(events.length,0)
  const redirects=[]
  const safe=createWorkflowToolNetwork(resolver,fake([{status:302,headers:{location:"https://second.example.com/page"}},
    {body:"<script>private code</script><p>Hello &amp; world</p>"}],redirects))
  assert.equal(await safe.webFetch("https://first.example.com/page",signal()),"Hello & world");assert.equal(redirects.length,2)
  const blocked=[]
  await assert.rejects(createWorkflowToolNetwork(resolver,fake([{status:302,headers:{location:"http://127.0.0.1/private"}}],blocked))
    .webFetch("https://public.example.com/page",signal()));assert.equal(blocked.length,1)
  const downgraded=[]
  await assert.rejects(createWorkflowToolNetwork(resolver,fake([{status:302,headers:{location:"http://public.example.com/page"}}],downgraded))
    .webFetch("https://public.example.com/page",signal()));assert.equal(downgraded.length,1)
})
test("POST errors, redirects, compressed/oversized/truncated responses are never replayed or leaked",async()=>{
  for(const response of [{status:302,headers:{location:"https://other.example.com"}},{status:503},{error:true},{aborted:true},
    {headers:{"content-encoding":"gzip"}},{headers:{"content-type":"application/octet-stream"}},{body:Buffer.alloc(131073)},
    {body:Buffer.from([0xc3,0x28])}]){
    const events=[],network=createWorkflowToolNetwork(resolver,fake([response],events))
    await assert.rejects(network.http(material,{query:"test"},signal()),/workflow_tool_transport_unknown/);assert.equal(events.length,1)
  }
})
test("search parsing bounds and validates citations without fetching result URLs",async()=>{
  const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fpublic.example.com%2Fstory">A &amp; B</a>'+
    '<a class="result__snippet">Synthetic snippet</a><a class="result__a" href="http://127.0.0.1/private">Private</a>'
  assert.deepEqual(JSON.parse(parseWorkflowSearchHtml(html,10)),[{title:"A & B",url:"https://public.example.com/story",snippet:"Synthetic snippet"}])
  const events=[],network=createWorkflowToolNetwork(resolver,fake([{headers:{"content-type":"text/html"},body:html}],events))
  const found=await network.webSearch("synthetic query",5,signal());assert.equal(JSON.parse(found).length,1)
  assert.equal(events.length,1);assert.equal(events[0].options.hostname,"html.duckduckgo.com");assert.equal(events[0].options.method,"POST")
})
