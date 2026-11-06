import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import {execFileSync} from 'node:child_process'
import {X509Certificate,createHash,generateKeyPairSync,sign} from 'node:crypto'
import {createRequire} from 'node:module'
import companyHttps from '../desktop/company-https.cjs'
const require=createRequire(import.meta.url),{createUpdater}=require('../desktop/update-core.cjs')

test('app-scoped company CA validates real TLS, signed updates, boundaries and cancellation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-company-tls-'))
 const openssl=process.platform==='win32'?path.join(process.env.ProgramFiles||'C:/Program Files','Git/usr/bin/openssl.exe'):'openssl'
 await fs.writeFile(path.join(dir,'openssl.cnf'),'')
 const run=args=>execFileSync(openssl,args,{cwd:dir,windowsHide:true,stdio:'pipe',env:{...process.env,OPENSSL_CONF:path.join(dir,'openssl.cnf')}})
 const servers=[]
 t.after(async()=>{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await fs.rm(dir,{recursive:true,force:true})})
 run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=Isolated Agent Studio test CA','-addext','basicConstraints=critical,CA:TRUE'])
 await fs.writeFile(path.join(dir,'ext.cnf'),'subjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n')
 run(['req','-newkey','rsa:2048','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=127.0.0.1'])
 run(['x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','leaf.pem','-days','2','-extfile','ext.cnf'])
 const key=await fs.readFile(path.join(dir,'leaf.key')),cert=await fs.readFile(path.join(dir,'leaf.pem')),ca=await fs.readFile(path.join(dir,'ca.pem'))
 const fixture=new X509Certificate(ca),fingerprint=createHash('sha256').update(fixture.raw).digest('hex')
 const trustDirectory=path.join(dir,'trust');await fs.mkdir(trustDirectory);await fs.copyFile(path.join(dir,'ca.pem'),path.join(trustDirectory,'ca.pem'))
 let envelope,downloaded=0
 const bytes=Buffer.from('ISOLATED-UPDATE-PACKAGE-NOT-AN-EXECUTABLE')
 const server=https.createServer({key,cert},(req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/health'});res.end();return}
  if(req.url==='/wait'){return}
  if(req.url==='/latest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(envelope));return}
  if(req.url==='/update.exe'){downloaded++;res.setHeader('Content-Length',bytes.length);res.end(bytes);return}
  if(req.url==='/echo'){const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>res.end(Buffer.concat(chunks)));return}
  res.setHeader('Content-Type','application/json');res.end('{"healthy":true}')
 })
 servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const origin='https://127.0.0.1:'+server.address().port
 const config={schema:1,authorities:[{file:'ca.pem',sha256:fingerprint,origins:[origin]}]}
 await fs.writeFile(path.join(trustDirectory,'company-ca.json'),JSON.stringify(config))
 const trust=companyHttps.loadCompanyTrust(trustDirectory),fetcher=companyHttps.createCompanyFetch({trust})
 await assert.rejects(fetch(origin+'/health'),/fetch failed/,'fresh process has no trust in synthetic company CA')
 assert.deepEqual(await(await fetcher(origin+'/health')).json(),{healthy:true})
 assert.equal(await(await fetcher(origin+'/echo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"fixture":true}'})).text(),'{"fixture":true}')
 await assert.rejects(fetcher(origin+'/redirect',{redirect:'error'}),/不允许重定向/)
 assert.equal((await fetcher(origin+'/redirect',{redirect:'manual'})).status,302)
 await assert.rejects(fetcher(origin+'/wait',{signal:AbortSignal.timeout(50)}))
 const other=https.createServer({key,cert},(_req,res)=>res.end('must not trust another origin'))
 servers.push(other);await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve))
 await assert.rejects(fetcher('https://127.0.0.1:'+other.address().port),/fetch failed/,'same company CA is not applied to another port')
 const wrongHost='https://localhost:'+server.address().port
 const wrongHostTrust={options:()=>trust.options(origin)}
 await assert.rejects(companyHttps.createCompanyFetch({trust:wrongHostTrust})(wrongHost),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID')
 const previousNow=Date.now;try{Date.now=()=>Date.parse(fixture.validTo)+1000;assert.throws(()=>trust.options(origin),/有效期/)}finally{Date.now=previousNow}
 await fs.writeFile(path.join(trustDirectory,'company-ca.json'),JSON.stringify({...config,authorities:[{...config.authorities[0],sha256:'0'.repeat(64)}]}))
 assert.throws(()=>companyHttps.loadCompanyTrust(trustDirectory),/指纹/)
 await fs.writeFile(path.join(trustDirectory,'company-ca.json'),JSON.stringify(config))
 await fs.writeFile(path.join(trustDirectory,'unexpected.key'),'not shipped')
 assert.throws(()=>companyHttps.loadCompanyTrust(trustDirectory),/未声明/)
 await fs.unlink(path.join(trustDirectory,'unexpected.key'))
 const {privateKey,publicKey}=generateKeyPairSync('ed25519')
 const metadata={schema:1,channel:'stable',platform:'win32-x64',version:'0.1.0-preview.29',minimumVersion:'0.1.0-preview.10',url:origin+'/update.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),notes:'isolated fixture',publishedAt:new Date().toISOString()}
 const payload=Buffer.from(JSON.stringify(metadata))
 envelope={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')}
 const updater=createUpdater({currentVersion:'0.1.0-preview.28',publicKey,directory:path.join(dir,'download'),feed:()=>origin+'/latest.json',fetcher})
 assert.equal((await updater.check()).phase,'available');assert.equal((await updater.download()).phase,'ready')
 assert.equal(await fs.readFile((await updater.ready()).installer,'utf8'),bytes.toString());assert.equal(downloaded,1)
 envelope={...envelope,payload:Buffer.from('{}').toString('base64')}
 await assert.rejects(updater.check(),/签名/);assert.equal(downloaded,1)
 assert.deepEqual(trust.options('https://other-company.example'),{})
})

test('release certificate matches the fixed company server and is present in both packaging manifests',async()=>{
 const trust=companyHttps.companyTrust()
 assert.ok(trust.options('https://192.168.1.133:8443/__pb/api/health').ca)
 for(const address of ['http://192.168.1.133:8443','https://192.168.1.133:443','https://192.168.1.133.evil.test:8443'])assert.deepEqual(trust.options(address),{})
 assert.equal(trust.summary[0].sha256,'ac95db954c5f166dd23b032b058320b0fd20c447782e396439a508b893f03b42')
 const packaging=JSON.parse(await fs.readFile(new URL('../desktop/package.json',import.meta.url),'utf8')).build.files
 assert.ok(packaging.includes('trust/**'));assert.ok(packaging.includes('company-https.cjs'))
 const connector=await fs.readFile(new URL('../ops/build-connector.mjs',import.meta.url),'utf8')
 assert.ok(connector.includes('companyHttps.companyTrust().files'))
})
