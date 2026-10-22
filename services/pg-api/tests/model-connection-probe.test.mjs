import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {createProviderConnectivityProbe,publicProviderAddress,exactProviderEndpoint}
  from "../src/model-connection-probe.ts"

const fakeKey="synthetic-model-key-abcdef123456"
const inputs={
  openai:{provider:"openai",base_url:"https://api.openai.com/v1",api_key:fakeKey},
  anthropic:{provider:"anthropic",base_url:"https://api.anthropic.com/v1",api_key:fakeKey},
  gemini:{provider:"gemini",base_url:"https://generativelanguage.googleapis.com/v1beta",api_key:fakeKey},
}
function resolver(ip="8.8.8.8",v6=[]){
  let calls=0
  return {resolve4:async()=>{calls++;return [ip]},
    resolve6:async()=>{calls++;return v6},
    get calls(){return calls}}
}
function fakeRequester({statusCode=200,body='{"data":[]}',contentType="application/json",
  errorCode="",onOptions=()=>{}}={}){
  return (options,onResponse)=>{
    onOptions(options)
    const req=new EventEmitter()
    req.destroy=()=>{}
    req.setTimeout=()=>{}
    req.end=()=>{
      if(errorCode){
        queueMicrotask(()=>req.emit("error",{code:errorCode,name:errorCode==="ABORT"?"AbortError":"Error"}))
      }else{
        const response=new EventEmitter()
        response.statusCode=statusCode
        response.headers={"content-type":contentType}
        response.destroy=()=>{}
        onResponse(response)
        queueMicrotask(()=>{
          response.emit("data",Buffer.from(body))
          response.emit("end")
        })
      }
    }
    return req
  }
}
test("endpoint URLs must be exact provider-owned HTTPS origin with no redirects or arbitrary targets",()=>{
  for(const item of Object.values(inputs))assert.ok(exactProviderEndpoint(item).host)
  for(const invalid of [
    {...inputs.openai,base_url:"http://api.openai.com/v1"},
    {...inputs.openai,base_url:"https://api.openai.com/v1/"},
    {...inputs.openai,base_url:"https://api.openai.com:8443/v1"},
    {...inputs.openai,base_url:"https://127.0.0.1/v1"},
    {...inputs.openai,base_url:"https://api.openai.com/v1?key=abc"},
    {...inputs.openai,base_url:"https://example.org/v1"},
    {...inputs.openai,base_url:inputs.anthropic.base_url},
    {...inputs.gemini,base_url:"https://generativelanguage.googleapis.com/v1beta#x"},
  ])assert.throws(()=>exactProviderEndpoint(invalid),/provider_endpoint_not_allowlisted/)
})
test("public IP classifier rejects private/reserved/mapped IPv4 and IPv6",()=>{
  for(const address of [
    "0.1.2.3","10.0.0.1","100.64.0.1","127.0.0.1","169.254.1.1",
    "172.30.1.1","192.0.2.1","192.168.2.3","198.18.0.4",
    "198.51.100.9","203.0.113.1","224.0.0.1","255.255.255.255",
    "::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1",
    "2002::1","64:ff9b::a00:1","2001::1","garbage"
  ])assert.equal(publicProviderAddress(address),false,address)
  assert.equal(publicProviderAddress("8.8.8.8"),true)
  assert.equal(publicProviderAddress("2606:4700:4700::1111"),true)
})
test("read-only fixed /models uses pinned TLS, provider-specific header and bounded JSON",async()=>{
  for(const kind of ["openai","anthropic","gemini"]){
    const opts=[]
    const probe=createProviderConnectivityProbe(
      resolver("8.8.8.8",["2606:4700:4700::1111"]),
      fakeRequester({body:kind==="gemini"?'{"models":[]}':'{"data":[]}',
        onOptions:o=>opts.push(o)}))
    const result=await probe(inputs[kind])
    assert.equal(result.status,"ok",kind)
    assert.equal(result.error_code,"")
    assert.equal(opts.length,1)
    const o=opts[0]
    assert.equal(o.protocol,"https:")
    assert.equal(o.method,"GET")
    assert.equal(o.port,443)
    assert.equal(o.servername,o.hostname)
    assert.equal(o.agent,false)
    assert.equal(o.rejectUnauthorized,true)
    assert.equal(o.family,4)
    assert.equal(o.path,kind==="gemini"?"/v1beta/models":"/v1/models")
    assert.equal(o.signal.aborted,false)
    assert.equal(o.headers.Authorization,kind==="openai"?"Bearer "+fakeKey:undefined)
    assert.equal(o.headers["x-api-key"],kind==="anthropic"?fakeKey:undefined)
    assert.equal(o.headers["x-goog-api-key"],kind==="gemini"?fakeKey:undefined)
    await new Promise((resolve,reject)=>o.lookup(o.hostname,{family:4},(err,ip,family)=>{
      if(err)reject(err)
      else{assert.equal(ip,"8.8.8.8");assert.equal(family,4);resolve()}
    }))
  }
})
test("any private resolved A or AAAA address rejects before network",async()=>{
  for(const [ip,v6] of [
    ["127.0.0.1",[]],["8.8.8.8",["::1"]],["10.1.0.2",["2606:4700::1111"]],
  ]){
    let connected=0
    const probe=createProviderConnectivityProbe(
      resolver(ip,v6),
      fakeRequester({onOptions:()=>connected++}))
    const result=await probe(inputs.openai)
    assert.deepEqual([result.status,result.error_code],["error","provider_dns_unsafe"])
    assert.equal(connected,0)
  }
})
test("no network or credential leaks on unsupported target or DNS outage",async()=>{
  let connected=0
  const probe=createProviderConnectivityProbe({
    resolve4:async()=>{throw Object.assign(Error("internal private data"),{code:"SERVFAIL"})},
    resolve6:async()=>[]},fakeRequester({onOptions:()=>connected++}))
  assert.equal((await probe(inputs.openai)).error_code,"provider_dns_unavailable")
  assert.equal((await probe({...inputs.openai,base_url:"https://example.com/v1"}))
    .error_code,"provider_endpoint_not_allowlisted")
  assert.equal(connected,0)
})
test("response is never followed/echoed, and errors are strictly sanitized",async()=>{
  for(const [params,code] of [
    [{statusCode:302},"provider_response_rejected"],
    [{statusCode:401},"provider_credential_rejected"],
    [{statusCode:429},"provider_rate_limited"],
    [{statusCode:200,body:"internal secrets"},"provider_response_invalid"],
    [{statusCode:200,body:'{"private":"metadata"}'},"provider_response_invalid"],
    [{statusCode:200,body:JSON.stringify({data:["A".repeat(131073)]})},
      "provider_response_too_large"],
    [{errorCode:"ABORT"},"provider_probe_timeout"],
    [{errorCode:"ECONNRESET"},"provider_transport_failed"],
  ]){
    const probe=createProviderConnectivityProbe(resolver(),fakeRequester(params))
    const result=await probe(inputs.openai)
    assert.deepEqual([result.status,result.error_code],["error",code])
    assert.equal(JSON.stringify(result).includes(fakeKey),false)
    assert.equal("api_key" in result,false)
  }
})
