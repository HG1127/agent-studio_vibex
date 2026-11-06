// Disposable loopback mTLS fixture; no database or provider is opened here.
import {execFileSync} from "node:child_process"
import {mkdtempSync,writeFileSync,readFileSync,existsSync,realpathSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {X509Certificate} from "node:crypto"
import {createServer} from "node:https"
import {createIsolatedBoundModelInternalHandler} from "../../src/bound-model-internal-handler.ts"
import {assertBoundDispatchTlsMaterial} from "../../src/bound-dispatch-server.ts"

export async function withDisposableBoundModelTls(dispatch,run,{handlerFactory=createIsolatedBoundModelInternalHandler,listenPort=0,includeServerTls=false}={}){
  // Optional F01 genuine fixture only; existing callers retain random port and
  // receive no server private material. Product TLS/client checks are unchanged.
  if(![0,7459].includes(listenPort)||typeof includeServerTls!=="boolean")throw Error("unsafe_disposable_tls_options")
  const parent=realpathSync(tmpdir())
  const temp=mkdtempSync(path.join(parent,"agentstudio-bound-flow-"))
  if(path.dirname(realpathSync(temp))!==parent||!path.basename(temp).startsWith("agentstudio-bound-flow-"))
    throw Error("unsafe_disposable_tls_directory")
  let server,serverTls
  try{
    const openssl=process.platform==="win32"&&existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
      ?"C:/Program Files/Git/usr/bin/openssl.exe":"openssl"
    const command=args=>execFileSync(openssl,args,{cwd:temp,stdio:"ignore",timeout:20000,windowsHide:true})
    command(["req","-x509","-newkey","rsa:2048","-nodes","-sha256","-keyout","ca.key",
      "-out","ca.pem","-days","1","-subj","/CN=Disposable Bound Flow CA",
      "-addext","basicConstraints=critical,CA:TRUE","-addext","keyUsage=critical,keyCertSign,cRLSign"])
    for(const name of ["server","worker"]){
      command(["req","-new","-newkey","rsa:2048","-nodes","-keyout",name+".key",
        "-out",name+".csr","-subj","/CN="+name])
      writeFileSync(path.join(temp,name+".ext"),["basicConstraints=CA:FALSE",
        "keyUsage=digitalSignature,keyEncipherment",
        "extendedKeyUsage="+(name==="server"?"serverAuth":"clientAuth"),
        ...(name==="server"?["subjectAltName=DNS:localhost,IP:127.0.0.1"]:[])].join("\n"),{mode:0o600})
      command(["x509","-req","-in",name+".csr","-CA","ca.pem","-CAkey","ca.key",
        "-CAcreateserial","-out",name+".pem","-days","1","-sha256","-extfile",name+".ext"])
    }
    const read=name=>readFileSync(path.join(temp,name))
    const ca=read("ca.pem"),cert=read("server.pem"),key=read("server.key")
    const workerCert=read("worker.pem")
    assertBoundDispatchTlsMaterial(ca,cert,key)
    const handler=handlerFactory({approvedForIsolatedUat:true,
      reviewedClientFingerprint256:new X509Certificate(workerCert).fingerprint256,dispatch})
    server=createServer({ca,cert,key,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2"},
      (req,res)=>{void handler(req,res).catch(()=>res.destroy())})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(listenPort,"127.0.0.1",resolve)})
    const address=server.address()
    if(!address||typeof address==="string")throw Error("loopback_tls_missing_port")
    if(includeServerTls)serverTls={ca:Buffer.from(ca),cert:Buffer.from(cert),key:Buffer.from(key)}
    return await run({...(serverTls?{serverTls}:{}),approvedForIsolatedUat:true,origin:"https://127.0.0.1:"+address.port,
      ca,cert:workerCert,key:read("worker.key"),
      reviewedServerFingerprint256:new X509Certificate(cert).fingerprint256})
  }finally{
    if(serverTls)for(const buffer of Object.values(serverTls))buffer.fill(0)
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    rmSync(temp,{recursive:true,force:true})
  }
}
