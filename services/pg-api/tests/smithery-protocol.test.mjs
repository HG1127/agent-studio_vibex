import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {parseSmitherySelection,smitheryRemoteId,smitheryGateway,parseSmitheryNamespaces,parseSmitheryCatalog,parseSmitheryRemoteState,safeSmitherySetupUrl} from "../src/smithery-contracts.ts"
import {prepareSmitheryRequest,createSmitheryNetwork,smitheryCatalogPath,smitheryConnectionPath} from "../src/smithery-network.ts"
const key="SyntheticSmitheryKeyNeverSent012345",proof="a".repeat(64),id=smitheryRemoteId("11111111-1111-4111-8111-111111111111"),path=smitheryConnectionPath("own-workspace",id)
const selection={namespace:"own-workspace",server:"vendor/lookup",name:"Owner lookup",description:"Synthetic evidence"}
const body={transport:"http",server:selection.server,name:selection.name,metadata:{agent_studio_binding:proof}}

test("Smithery management contracts pin a deterministic remote ID and accept only closed selections and trusted setup links",()=>{
  assert.deepEqual(parseSmitherySelection(selection),selection);assert.equal(smitheryRemoteId("11111111-1111-4111-8111-111111111111"),id)
  assert.equal(smitheryGateway(selection.namespace,id),"https://smithery.run/own-workspace/"+id)
  for(const invalid of [{...selection,url:"https://foreign.example"},{...selection,namespace:"../foreign"},{...selection,server:"vendor/name/extra"}])assert.throws(()=>parseSmitherySelection(invalid))
  for(const url of ["https://evil.example/authorize","https://smithery.ai.evil.example/setup","https://user@smithery.ai/setup","https://smithery.ai:8443/setup","https://smithery.ai/setup#token","javascript:alert(1)"])
    assert.equal(safeSmitherySetupUrl(url),"")
  assert.equal(safeSmitherySetupUrl("https://auth.smithery.ai/setup?state=opaque"),"https://auth.smithery.ai/setup?state=opaque")
})

test("Smithery response parsing never adopts a foreign remote identity, mock session, secrets or arbitrary setup host",()=>{
  const raw={connectionId:id,transport:"http",metadata:body.metadata,status:{state:"auth_required",setupUrl:"https://auth.smithery.ai/setup?state=opaque",missing:["scope"]}}
  assert.deepEqual(parseSmitheryRemoteState(raw,id,proof,key),{state:"auth_required",setup_url:raw.status.setupUrl,missing:["scope"]})
  for(const invalid of [{...raw,connectionId:"foreign"},{...raw,metadata:{agent_studio_binding:"b".repeat(64)}},{...raw,transport:"uplink"},{...raw,mock:{enabled:true}},{...raw,status:{state:"unexpected"}}])
    assert.throws(()=>parseSmitheryRemoteState(invalid,id,proof,key))
  assert.throws(()=>parseSmitheryRemoteState({...raw,status:{...raw.status,setupUrl:"https://auth.smithery.ai/setup?key="+key}},id,proof,key))
  assert.equal(parseSmitheryRemoteState({...raw,status:{...raw.status,setupUrl:"https://evil.example/setup"}},id,proof,key).setup_url,"")
  assert.deepEqual(parseSmitheryNamespaces({namespaces:["own",{name:"second"},"own","../foreign"]}),["own","second"])
  assert.deepEqual(parseSmitheryNamespaces({data:[{name:"own"}]}),["own"])
  const catalog=parseSmitheryCatalog({servers:[{qualifiedName:"vendor/lookup",displayName:"<script>untrusted</script>",description:"Evidence",isDeployed:true,verified:true,api_key:key,url:"https://evil.example"}],pagination:{totalPages:2}},1)
  assert.equal(catalog.items[0].server,selection.server);assert.equal(catalog.next_page,2);assert.equal(JSON.stringify(catalog).includes(key),false);assert.equal(JSON.stringify(catalog).includes("evil.example"),false)
})

test("Smithery management transport accepts no arbitrary origin, tool calls, namespace search, credential query or override headers",()=>{
  const ready=prepareSmitheryRequest(key,{method:"PUT",path,body})
  assert.equal(ready.headers.authorization,"Bearer "+key);assert.equal(ready.path.includes(key),false)
  assert.deepEqual(JSON.parse(ready.body),body)
  assert.equal(prepareSmitheryRequest(key,{method:"GET",path:smitheryCatalogPath("owner test",2)}).path,"/servers?page=2&pageSize=24&q=owner+test")
  assert.equal(prepareSmitheryRequest(key,{method:"GET",path:"/namespaces"}).path,"/namespaces")
  for(const wire of [{method:"GET",path:"https://evil.example/namespaces"},{method:"GET",path:"/namespaces?q=public"},
    {method:"GET",path:path+"?api_key="+key},{method:"GET",path:path+"/.tools"},{method:"POST",path:path+"/rpc"},
    {method:"GET",path:smitheryCatalogPath(key,1)},
    {method:"GET",path:"/servers?page=1&page=2&pageSize=24"},{method:"PUT",path,body:{...body,headers:{authorization:key}}},
    {method:"GET",path,headers:{host:"evil.example"}},{method:"PUT",path:"/namespaces",body}])assert.throws(()=>prepareSmitheryRequest(key,wire))
})

const resolver={async resolve4(){return ["93.184.216.34"]},async resolve6(){return []}}
function socket(spec,seen){return (options,callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit("error",Error("destroyed"));req.end=body=>{
    seen.push({options,body});queueMicrotask(()=>{if(spec.error){req.emit("error",Error(key));return}
      const res=new EventEmitter();res.statusCode=spec.status??200;res.headers=spec.headers??{};res.destroy=()=>{}
      callback(res);if(spec.aborted){res.emit("aborted");return};res.emit("data",spec.body??Buffer.from('{"namespaces":["own"]}'));res.emit("end")
    })};return req
}}
test("Smithery management pins public DNS and verified TLS, bounds bodies and never repeats a failed mutation",async()=>{
  const seen=[],wire={method:"PUT",path,body}
  const result=await createSmitheryNetwork(resolver,socket({},seen))(key,wire,AbortSignal.timeout(1000))
  assert.equal(result.status,200);assert.equal(seen[0].options.hostname,"api.smithery.ai");assert.equal(seen[0].options.rejectUnauthorized,true);assert.equal(seen[0].options.agent,false)
  let address;seen[0].options.lookup("api.smithery.ai",{},(_error,ip)=>{address=ip});assert.equal(address,"93.184.216.34")
  for(const spec of [{status:302},{headers:{"content-encoding":"gzip"}},{body:Buffer.alloc(262145)},{body:Buffer.from("not JSON")},{aborted:true},{error:true}]){
    const events=[];await assert.rejects(createSmitheryNetwork(resolver,socket(spec,events))(key,wire,AbortSignal.timeout(1000)));assert.equal(events.length,1)
  }
  const none=[];await assert.rejects(createSmitheryNetwork({async resolve4(){return ["127.0.0.1"]},async resolve6(){return []}},socket({},none))(key,wire,AbortSignal.timeout(1000)))
  assert.equal(none.length,0)
})
