// Genuine loopback mTLS handshake on a DISPOSABLE GitHub Actions CI Runner.
// The strict PG18 CI attestation is verified BEFORE generating certificates,
// opening a TCP socket or loading any business data. This does NOT connect to
// PostgreSQL, call paid models, use BaoTa, or start a persistent application.
// Do not run against a personal machine, local V7 PocketBase or production.
// No certificate or private key may be logged, uploaded or committed.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:https"
import {request as httpsRequest} from "node:https"
import {X509Certificate} from "node:crypto"
import {execFileSync} from "node:child_process"
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {createIsolatedBoundModelInternalHandler}
  from "../src/bound-model-internal-handler.ts"
import {requireEphemeralPg18Ci}
  from "../src/pg18-ephemeral-ci-guard.mjs"

const route="/__internal/v1/bound-model/dispatch"
const claim={
  run_id:"bad4c755-25de-4862-ab93-85ca2ab6137f",
  job_id:"3fa7bdba-4a45-4fa1-a311-4fb9ab3f75f3",
  lease_token:"d786e767-a950-4b2a-9d2c-1a27aa175b30",
  lease_version:1,lease_owner:"ci-mtls-synthetic"
}
const input={goal:"Synthetic validation",instruction:"Do not call a real model",
  taskScope:"Disposable GitHub Actions only",deliverables:["Synthetic result"],
  doneCriteria:["No external effects"]}
const exampleBody={claim,input}
function issue(temp,prefix,commonName,ca=false){
  const cmd=(args)=>execFileSync("openssl",args,{
    cwd:temp,stdio:"ignore",timeout:18000,windowsHide:true
  })
  cmd(["req",ca?"-x509":"-new","-newkey","rsa:2048","-nodes",
    "-keyout",prefix+".key","-out",prefix+(ca?".crt":".csr"),
    ...(ca?["-days","1","-sha256",
      "-addext","basicConstraints=critical,CA:TRUE",
      "-addext","keyUsage=critical,keyCertSign,cRLSign"]:[]),
    "-subj","/CN="+commonName])
  if(ca)return
  const server=prefix==="server"
  const extensions=server?[
    "basicConstraints=CA:FALSE","keyUsage=digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth","subjectAltName=DNS:localhost,IP:127.0.0.1"
  ]:[
    "basicConstraints=CA:FALSE","keyUsage=digitalSignature",
    "extendedKeyUsage=clientAuth"
  ]
  writeFileSync(path.join(temp,prefix+".ext"),extensions.join("\n")+"\n",{
    mode:0o600
  })
  cmd(["x509","-req","-in",prefix+".csr","-CA","ca.crt",
    "-CAkey","ca.key","-CAcreateserial","-out",prefix+".crt",
    "-days","1","-sha256","-extfile",prefix+".ext"])
}
async function submit(port,ca,credentials,body=exampleBody){
  const data=Buffer.from(JSON.stringify(body),"utf8")
  return await new Promise(resolve=>{
    const client=httpsRequest({
      hostname:"127.0.0.1",port,servername:"localhost",path:route,
      method:"POST",ca, ...(credentials||{}),
      rejectUnauthorized:true,agent:false,timeout:7000,
      headers:{"content-type":"application/json",
        "content-length":String(data.length)}
    },response=>{
      const pieces=[]
      response.on("data",piece=>pieces.push(Buffer.from(piece)))
      response.on("end",()=>{
        let value
        try{value=JSON.parse(Buffer.concat(pieces).toString("utf8"))}
        catch{value={error:"unexpected_response"}}
        resolve({status:response.statusCode,body:value,networkError:false})
      })
    })
    client.once("error",()=>resolve({status:0,body:null,networkError:true}))
    client.once("timeout",()=>client.destroy(new Error("ci_mtls_timeout")))
    client.end(data)
  })
}
test("strict CI-only mTLS: actual TLS handshake, certificate pin, wrong client and forged payload",async()=>{
  // This is deliberately the FIRST operation. The pure guard blocks every
  // local checkout and every non-exact synthetic PG18 Actions environment.
  requireEphemeralPg18Ci(process.env)
  const temp=mkdtempSync(path.join(tmpdir(),"pg18-mtls-ci-"))
  let server
  try{
    issue(temp,"ca","Agent Studio Disposable CI CA",true)
    issue(temp,"server","localhost")
    issue(temp,"worker","Agent Studio Synthetic Worker")
    issue(temp,"other-worker","Unauthorized Synthetic Worker")
    const ca=readFileSync(path.join(temp,"ca.crt"))
    const clientCredentials={
      cert:readFileSync(path.join(temp,"worker.crt")),
      key:readFileSync(path.join(temp,"worker.key"))
    }
    const otherCredentials={
      cert:readFileSync(path.join(temp,"other-worker.crt")),
      key:readFileSync(path.join(temp,"other-worker.key"))
    }
    const pinned=new X509Certificate(clientCredentials.cert).fingerprint256
    let dispatched=0
    const handler=createIsolatedBoundModelInternalHandler({
      approvedForIsolatedUat:true,
      reviewedClientFingerprint256:pinned,
      async dispatch(receivedClaim,receivedInput){
        dispatched++
        assert.deepEqual(receivedClaim,claim)
        assert.deepEqual(receivedInput,input)
        return {status:"succeeded",text:"Synthetic CI response only"}
      }
    })
    server=createServer({
      key:readFileSync(path.join(temp,"server.key")),
      cert:readFileSync(path.join(temp,"server.crt")),
      ca,requestCert:true,rejectUnauthorized:true,
      minVersion:"TLSv1.2",
    },(req,res)=>{
      void handler(req,res).catch(()=>{
        if(!res.headersSent){
          res.writeHead(503,{"Content-Type":"application/json",
            "Cache-Control":"no-store"})
          res.end('{"error":"internal_dispatch_unavailable"}')
        }else res.destroy()
      })
    })
    await new Promise((resolve,reject)=>{
      server.once("error",reject)
      server.listen(0,"127.0.0.1",resolve)
    })
    const address=server.address()
    assert.ok(address&&typeof address!=="string")
    const port=address.port
    const success=await submit(port,ca,clientCredentials)
    assert.deepEqual(success,{status:200,body:{
      status:"succeeded",text:"Synthetic CI response only"
    },networkError:false})
    assert.equal(dispatched,1)
    const missingCertificate=await submit(port,ca,null)
    assert.equal(missingCertificate.networkError,true,
      "server must reject TLS clients without an authorized certificate")
    const wrongClient=await submit(port,ca,otherCredentials)
    assert.equal(wrongClient.status,403,
      "a different, CA-trusted certificate must fail the explicit pin")
    const forged=await submit(port,ca,clientCredentials,{
      ...exampleBody,owner_user_id:"forged-employee"
    })
    assert.equal(forged.status,400)
    assert.equal(dispatched,1,"only the permitted synthetic request dispatches")
  }finally{
    if(server){
      server.closeAllConnections?.()
      await new Promise(resolve=>server.close(resolve))
    }
    rmSync(temp,{recursive:true,force:true})
  }
})
