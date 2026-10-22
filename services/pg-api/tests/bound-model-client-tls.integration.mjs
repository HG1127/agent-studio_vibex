// Real loopback TLS, disposable certificates, synthetic responses only.
// No database, employee credentials, paid providers or persistent services.
import test from "node:test"
import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {mkdtempSync,writeFileSync,readFileSync,existsSync,realpathSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {X509Certificate} from "node:crypto"
import {createServer} from "node:https"
import {createBoundModelMutualTlsClient} from "../src/bound-model-client.ts"
import {createIsolatedBoundModelInternalHandler} from "../src/bound-model-internal-handler.ts"
import {assertBoundDispatchTlsMaterial} from "../src/bound-dispatch-server.ts"

const openssl=process.platform==="win32"&&
  existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
  ?"C:/Program Files/Git/usr/bin/openssl.exe":"openssl"
const claim={run_id:"c135230a-8e5f-453a-918a-3a483a86b80c",
  job_id:"21845290-0b9c-4e9e-b82b-c9c7807724a6",
  lease_token:"81e2c16c-8e9b-4e32-a6c1-67a758e3a79e",
  lease_version:1,lease_owner:"loopback-only-worker"}
const input={goal:"Local TLS verification",instruction:"Synthetic response only",
  taskScope:"No model or database",deliverables:[],doneCriteria:[]}

test("real private mTLS client verifies CA, hostname and server pin; Broker verifies Worker pin",async()=>{
  const tempParent=realpathSync(tmpdir())
  const temp=mkdtempSync(path.join(tempParent,"agentstudio-bound-tls-"))
  // Recursive cleanup is restricted to this newly allocated direct temp child.
  assert.equal(path.dirname(realpathSync(temp)),tempParent)
  assert.ok(path.basename(temp).startsWith("agentstudio-bound-tls-"))
  let server
  try{
    const command=args=>execFileSync(openssl,args,{
      cwd:temp,stdio:"ignore",timeout:20000,windowsHide:true,
    })
    command(["req","-x509","-newkey","rsa:2048","-nodes","-sha256",
      "-keyout","ca.key","-out","ca.pem","-days","1","-subj","/CN=Disposable TLS Test CA",
      "-addext","basicConstraints=critical,CA:TRUE",
      "-addext","keyUsage=critical,keyCertSign,cRLSign"])
    for(const name of ["server","worker","other-worker"]){
      command(["req","-new","-newkey","rsa:2048","-nodes","-keyout",name+".key",
        "-out",name+".csr","-subj","/CN="+name])
      writeFileSync(path.join(temp,name+".ext"),[
        "basicConstraints=CA:FALSE","keyUsage=digitalSignature,keyEncipherment",
        "extendedKeyUsage="+(name==="server"?"serverAuth":"clientAuth"),
        ...(name==="server"?["subjectAltName=DNS:localhost,IP:127.0.0.1"]:[]),
      ].join("\n"),{mode:0o600})
      command(["x509","-req","-in",name+".csr","-CA","ca.pem","-CAkey","ca.key",
        "-CAcreateserial","-out",name+".pem","-days","1","-sha256","-extfile",name+".ext"])
    }
    const read=name=>readFileSync(path.join(temp,name))
    const ca=read("ca.pem"),workerCert=read("worker.pem")
    const serverCert=read("server.pem")
    assertBoundDispatchTlsMaterial(ca,serverCert,read("server.key"))
    assert.throws(()=>assertBoundDispatchTlsMaterial(ca,serverCert,read("worker.key")))
    assert.throws(()=>assertBoundDispatchTlsMaterial(ca,serverCert,read("server.key"),Date.now()+172800000))
    let calls=0,unknown=false
    const handler=createIsolatedBoundModelInternalHandler({
      approvedForIsolatedUat:true,
      reviewedClientFingerprint256:new X509Certificate(workerCert).fingerprint256,
      async dispatch(receivedClaim,receivedInput){
        calls++
        assert.deepEqual(receivedClaim,claim)
        assert.deepEqual(receivedInput,input)
        if(unknown)throw Error("private provider detail must not escape")
        return {status:"succeeded",text:"Verified synthetic TLS response"}
      },
    })
    server=createServer({key:read("server.key"),cert:serverCert,ca,
      requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2"},(req,res)=>{
      void handler(req,res).catch(()=>res.destroy())
    })
    await new Promise((resolve,reject)=>{
      server.once("error",reject);server.listen(0,"127.0.0.1",resolve)
    })
    const address=server.address()
    assert.ok(address&&typeof address!=="string")
    const settings={approvedForIsolatedUat:true,origin:"https://127.0.0.1:"+address.port,
      ca,cert:workerCert,key:read("worker.key"),
      reviewedServerFingerprint256:new X509Certificate(serverCert).fingerprint256}
    const client=createBoundModelMutualTlsClient(settings)
    assert.deepEqual(await client(claim,input),{
      status:"succeeded",text:"Verified synthetic TLS response"})
    assert.equal(calls,1)
    const wrongServer=createBoundModelMutualTlsClient({...settings,
      reviewedServerFingerprint256:"AB".repeat(32)})
    await assert.rejects(wrongServer(claim,input),{message:"bound_dispatch_transport_failed"})
    const wrongWorker=createBoundModelMutualTlsClient({...settings,
      cert:read("other-worker.pem"),key:read("other-worker.key")})
    await assert.rejects(wrongWorker(claim,input),{message:"bound_dispatch_transport_failed"})
    assert.equal(calls,1,"wrong server/Worker certificates cannot dispatch")
    unknown=true
    await assert.rejects(client(claim,input),{message:"bound_dispatch_transport_failed"})
    assert.equal(calls,2,"a single ambiguous response is never retried")
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    rmSync(temp,{recursive:true,force:true})
  }
})
