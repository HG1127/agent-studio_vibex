import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {PassThrough} from "node:stream"
import {createKnowledgeEmbeddingTransport} from "../src/knowledge-embedding-transport.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
const material={base_url:"https://models.example.com/v1",model_name:"synthetic-embedding",api_key:"synthetic-never-network-key",input:["😀 exact private text"],dimensions:null}
const resolver={resolve4:async()=>["93.184.216.34"],resolve6:async()=>[]}
function mock(payload={data:[{index:0,embedding:[3,4]}]},status=200,headers={},bytes){
  const calls=[]
  const request=(options,callback)=>{
    const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit("error",Error("synthetic close"));
    req.end=body=>{calls.push({options,body:JSON.parse(body.toString())});const res=new PassThrough();res.statusCode=status;res.headers={"content-type":"application/json",...headers}
      queueMicrotask(()=>{callback(res);if(!res.destroyed)res.end(bytes??JSON.stringify(payload))})}
    return req
  }
  return {request,calls}
}
const policy=embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:"models.example.com"})
test("embeddings preserves the configured model/dimensions and exact text, pins public DNS and never sends a dimensions override",async()=>{
  for(const dimensions of [2,1536,3072]){
    const vector=Array.from({length:dimensions},(_,i)=>i===0?1:0),m=mock({data:[{index:0,embedding:vector}]})
    const transport=createKnowledgeEmbeddingTransport(policy,resolver,{http:()=>assert.fail("public endpoint cannot use HTTP"),https:m.request})
    assert.equal((await transport({...material,dimensions},new AbortController().signal))[0].length,dimensions)
    assert.equal(m.calls.length,1);const {options,body}=m.calls[0]
    assert.deepEqual(body,{model:material.model_name,input:material.input,encoding_format:"float"})
    assert.equal(options.agent,false);assert.equal(options.servername,"models.example.com");assert.equal(options.path,"/v1/embeddings");assert.equal(options.rejectUnauthorized,true)
    options.lookup("models.example.com",{},(_error,address,family)=>{assert.equal(address,"93.184.216.34");assert.equal(family,4)})
  }
})
test("loopback embeddings uses only the exact approved port and never consults DNS; unsafe DNS/URLs fail before a request",async()=>{
  const m=mock(),p=embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:"80,11434"})
  const network=createKnowledgeEmbeddingTransport(p,{resolve4:()=>assert.fail("loopback DNS forbidden"),resolve6:()=>assert.fail("loopback DNS forbidden")},{http:m.request,https:()=>assert.fail("HTTPS not expected")})
  await network({...material,base_url:"http://localhost:80/v1"},new AbortController().signal)
  assert.equal(m.calls[0].options.port,80);m.calls[0].options.lookup("localhost",{},(_error,address)=>assert.equal(address,"127.0.0.1"))
  for(const endpoint of ["http://localhost:9999/v1","http://169.254.169.254/v1","https://user:pass@api.openai.com/v1","https://models.example.com/v1?key=x"])
    await assert.rejects(network({...material,base_url:endpoint},new AbortController().signal))
  const blocked=createKnowledgeEmbeddingTransport(policy,{resolve4:async()=>["93.184.216.34","127.0.0.1"],resolve6:async()=>[]},{http:m.request,https:m.request})
  await assert.rejects(blocked(material,new AbortController().signal));assert.equal(m.calls.length,1)
})
test("provider redirects, rate limits, oversized/compressed/invalid vectors and duplicate indices never trigger replay",async()=>{
  for(const [payload,status,headers,bytes] of [
    [{},302,{location:"https://foreign.example"}],[{},429,{}],[{},200,{"content-encoding":"gzip"}],
    [{},200,{"content-length":"1572865"}],[{},200,{},Buffer.from([0xff])],
    [{data:[{index:0,embedding:[0,0]}]},200,{}],
    [{data:[{index:0,embedding:[1,"2"]}]},200,{}],
    [{data:[{index:0,embedding:[1,0]},{index:0,embedding:[1,0]}]},200,{}],
  ]){
    const m=mock(payload,status,headers,bytes),network=createKnowledgeEmbeddingTransport(policy,resolver,{http:m.request,https:m.request})
    await assert.rejects(network({...material,input:payload?.data?.length===2?["first","second"]:material.input},new AbortController().signal));assert.equal(m.calls.length,1)
  }
})
