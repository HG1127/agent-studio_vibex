// Outbound model-inventory probe for isolated, explicitly approved PG18 UAT.
// No user-supplied URL, redirects, proxy, or model generation. Connection
// requires DNS validation and pins the vetted address to the actual TLS dial.
import {resolve4,resolve6} from "node:dns/promises"
import {request as httpsRequest,type RequestOptions} from "node:https"
import {BlockList,isIP} from "node:net"
import type {ModelProvider} from "./model-connection-repository.ts"

export type ProviderProbeInput={provider:ModelProvider;base_url:string;api_key:string}
export type ProviderProbeResult={
  status:"ok"|"error";latency_ms:number;error_code:string
}
export type ProviderResolver={
  resolve4(host:string):Promise<string[]>
  resolve6(host:string):Promise<string[]>
}
type Requester=typeof httpsRequest
const endpoints={
  openai:{origin:"https://api.openai.com/v1",host:"api.openai.com",path:"/v1/models"},
  anthropic:{origin:"https://api.anthropic.com/v1",host:"api.anthropic.com",path:"/v1/models"},
  gemini:{origin:"https://generativelanguage.googleapis.com/v1beta",
    host:"generativelanguage.googleapis.com",path:"/v1beta/models"},
} as const
const maxBody=131072
const timeoutMs=6000
// Keep separate families: Node's BlockList interprets IPv4 as IPv4-mapped
// IPv6, so a mapped-address IPv6 deny rule would also reject all IPv4.
const blacklist4=new BlockList()
const blacklist6=new BlockList()
for(const [cidr,bits] of [
  ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],
  ["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],
  ["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],
  ["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],
  ["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4],
] as const)blacklist4.addSubnet(cidr,bits,"ipv4")
for(const [cidr,bits] of [
  ["::",128],["::1",128],["::ffff:0:0",96],
  ["64:ff9b::",96],["64:ff9b:1::",48],["100::",64],
  ["2001::",23],["2001:db8::",32],["2002::",16],
  ["fc00::",7],["fe80::",10],["ff00::",8],
] as const)blacklist6.addSubnet(cidr,bits,"ipv6")

export function publicProviderAddress(address:string):boolean{
  const type=isIP(address)
  if(type===4){
    const octets=address.split(".").map(Number)
    return octets.length===4&&octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&
      !blacklist4.check(address,"ipv4")
  }
  if(type===6){
    // Public global-unicast (2000::/3) only; no transitional or reserved ranges.
    const first=parseInt(address.split(":")[0]||"0",16)
    // Expanded IPv6 starts with a 2xxx or 3xxx hextet for 2000::/3.
    return first>=0x2000&&first<0x4000&&!blacklist6.check(address,"ipv6")
  }
  return false
}
export function exactProviderEndpoint(input:Pick<ProviderProbeInput,"provider"|"base_url">){
  const expected=endpoints[input.provider]
  if(!expected||input.base_url!==expected.origin)
    throw Error("provider_endpoint_not_allowlisted")
  return expected
}
export async function resolveSafeProviderAddress(
  resolver:ProviderResolver,host:string,
):Promise<{address:string;family:4|6}>{
  const lookup=async(family:4|6)=>{
    try{return await(family===4?resolver.resolve4(host):resolver.resolve6(host))}
    catch(error){
      if(["ENODATA","ENOTFOUND","ENODOMAIN"].includes(
        String((error as {code?:unknown})?.code??"")))return []
      throw Error("provider_dns_unavailable")
    }
  }
  let four:string[],six:string[]
  try{[four,six]=await Promise.all([lookup(4),lookup(6)])}
  catch{throw Error("provider_dns_unavailable")}
  const results=[...four.map(address=>({address,family:4 as const})),
    ...six.map(address=>({address,family:6 as const}))]
  if(results.length===0||results.length>30||
     results.some(row=>!publicProviderAddress(row.address)))
    throw Error("provider_dns_unsafe")
  // Pin this address to the real connection. No second DNS lookup is allowed.
  return results[0]!
}
function safeCode(error:unknown):string{
  const code=error instanceof Error?error.message:""
  if(["provider_endpoint_not_allowlisted","provider_dns_unsafe",
    "provider_dns_unavailable","provider_response_too_large",
    "provider_response_invalid","provider_credential_rejected",
    "provider_rate_limited","provider_response_rejected",
    "provider_probe_timeout"].includes(code))return code
  return "provider_transport_failed"
}
export function createProviderConnectivityProbe(
  resolver:ProviderResolver={resolve4,resolve6},
  request:Requester=httpsRequest,
  now:()=>number=()=>Date.now(),
):(input:ProviderProbeInput)=>Promise<ProviderProbeResult>{
  return async input=>{
    const started=now()
    let status:"ok"|"error"="error",error_code=""
    try{
      const endpoint=exactProviderEndpoint(input)
      if(typeof input.api_key!=="string"||input.api_key.length<8||
         input.api_key.length>4096||/[\r\n\x00-\x1f\x7f]/.test(input.api_key))
        throw Error("provider_credentials_invalid")
      const pinned=await resolveSafeProviderAddress(resolver,endpoint.host)
      const headers:Record<string,string>={
        Accept:"application/json",
        "User-Agent":"agentstudio-pg18-connection-uat/1",
      }
      if(input.provider==="openai")headers.Authorization="Bearer "+input.api_key
      else if(input.provider==="anthropic"){
        headers["x-api-key"]=input.api_key
        headers["anthropic-version"]="2023-06-01"
      }else headers["x-goog-api-key"]=input.api_key
      await new Promise<void>((resolve,reject)=>{
        let settled=false
        const finish=(error?:Error)=>{
          if(settled)return
          settled=true
          if(error)reject(error)
          else resolve()
        }
        const options:RequestOptions={
          protocol:"https:",hostname:endpoint.host,port:443,
          servername:endpoint.host,method:"GET",path:endpoint.path,
          agent:false,rejectUnauthorized:true,
          // Prevent Node's newer multi-address resolver from re-resolving
          // to an unvalidated address after the pinned DNS preflight.
          family:pinned.family,
          lookup:(_hostname,_options,cb)=>cb(null,pinned.address,pinned.family),
          headers,timeout:timeoutMs,signal:AbortSignal.timeout(timeoutMs),
        }
        const req=request(options,response=>{
          const code=response.statusCode||0
          if(code===401||code===403){
            response.destroy()
            finish(Error("provider_credential_rejected"));return
          }
          if(code===429){
            response.destroy()
            finish(Error("provider_rate_limited"));return
          }
          // 3xx is never followed. HTTP errors and content-type mismatches
          // do not expose any provider-returned diagnostics.
          if(code!==200){
            response.destroy()
            finish(Error("provider_response_rejected"));return
          }
          const type=String(response.headers["content-type"]??"")
          if(!/^application\/json(?:;|$)/i.test(type)){
            response.destroy()
            finish(Error("provider_response_invalid"));return
          }
          let length=0
          const chunks:Buffer[]=[]
          response.on("data",(data:Buffer|string)=>{
            const part=Buffer.isBuffer(data)?data:Buffer.from(data)
            length+=part.length
            if(length>maxBody){
              response.destroy()
              finish(Error("provider_response_too_large"));return
            }
            chunks.push(part)
          })
          response.on("end",()=>{
            if(settled)return
            try{
              const data:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"))
              const obj=data as {data?:unknown;models?:unknown}
              const records=input.provider==="gemini"?obj?.models:obj?.data
              if(!Array.isArray(records))throw Error()
              finish()
            }catch{finish(Error("provider_response_invalid"))}
          })
          response.on("error",()=>finish(Error("provider_transport_failed")))
          response.on("aborted",()=>finish(Error("provider_transport_failed")))
        })
        req.once("error",error=>{
          const e=error as {name?:string;code?:string}
          finish(Error(e?.name==="AbortError"||e?.code==="ETIMEDOUT"
            ?"provider_probe_timeout":"provider_transport_failed"))
        })
        req.setTimeout(timeoutMs,()=>req.destroy(Error("provider_probe_timeout")))
        req.end()
      })
      status="ok"
    }catch(error){error_code=safeCode(error)}
    const duration=now()-started
    return {status,latency_ms:Math.max(0,Math.min(600000,
      Number.isFinite(duration)?Math.round(duration):0)),error_code}
  }
}
