#!/usr/bin/env node
// Read-only, opt-in identity-boundary probe against a specified origin.
// No browser, no admin UI, no credentials, no state changes.
// Verify a gateway rejects both anonymous requests and forged RH identity headers.
import { randomBytes } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

function parseOrigin(raw,allowLoopback=false) {
  const u=new URL(raw)
  if (u.username || u.password || u.search || u.hash || u.pathname!=="/")
    throw new Error("gateway_origin_must_have_no_credentials_path_or_query")
  const local=["127.0.0.1","[::1]","localhost"].includes(u.hostname)
  if (u.protocol!=="https:" && !(allowLoopback && local && u.protocol==="http:"))
    throw new Error("gateway_probe_requires_https_or_explicit_loopback")
  return u.origin
}
function unauthenticated(status) {return status===401 || status===403}
async function verifyGateway(origin,options={}) {
  const normalized=parseOrigin(origin,options.allowLoopback===true)
  const tracer="probe-"+randomBytes(9).toString("hex")
  const headers=[
    {"Accept":"application/json"},
    {"Accept":"application/json","X-Rh-User-Id":tracer},
  ]
  const probes=[]
  for(let i=0;i<headers.length;i++) {
    try {
      const fetcher=options.fetchImpl || fetch
      const res=await fetcher(normalized+"/api/agent_specs?perPage=1",{
        method:"GET",headers:headers[i],redirect:"manual",
        signal:AbortSignal.timeout(options.timeoutMs||5000),
      })
      probes.push({kind:i===0?"anonymous":"spoofed_identity",
        accepted:false,status:res.status,
        blocked:unauthenticated(res.status)})
    }catch{
      probes.push({kind:i===0?"anonymous":"spoofed_identity",
        accepted:false,status:null,blocked:false})
    }
  }
  return {
    tool:"agent-studio-gateway-readonly-probe",
    scope:"read_only_get",origin:normalized,
    result:probes.every(x=>x.blocked)?"PASS":"FAIL",
    checks:probes,
    note:"Tests unsigned requests only. Valid employee login and bypass network restrictions need separate real-environment verification.",
  }
}
function args(argv) {
  let origin,allowLoopback=false
  for(let i=0;i<argv.length;i++){
    if(argv[i]==="--allow-loopback")allowLoopback=true
    else if(argv[i]==="--origin" && argv[i+1] && !origin)origin=argv[++i]
    else throw Error("invalid_arguments")
  }
  if(!origin)throw Error("provide --origin explicitly")
  return {origin,allowLoopback}
}
async function main(){
  const opts=args(process.argv.slice(2))
  const result=await verifyGateway(opts.origin,opts)
  process.stdout.write(JSON.stringify(result,null,2)+"\n")
  if(result.result!=="PASS")process.exitCode=1
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    process.stderr.write("gateway_probe_error: "+String(e.message||e).slice(0,180)+"\n")
    process.exitCode=2
  })
}
export {parseOrigin,verifyGateway}
