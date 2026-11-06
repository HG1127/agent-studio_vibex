// Read-only LAN qualification using the actual packaged Node and CA resources.
// Run with --no-use-system-ca and no NODE_EXTRA_CA_CERTS to model a fresh PC.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url),{verifyManifest}=require('../update-core.cjs'),signingTrust=require('../update-trust.json')
const resources=path.resolve(process.argv[2]||'.tmp/desktop-output/win-unpacked/resources')
const app=path.join(resources,'connector/app'),origin='https://192.168.1.133:8443'
const companyHttps=require(path.join(app,'desktop/company-https.cjs'))
const fetcher=companyHttps.createCompanyFetch(),checks=[]
const noCaError=await new Promise(resolve=>{
 const request=https.get(origin+'/__pb/api/health',{agent:false},response=>{response.resume();resolve(null)})
 request.once('error',resolve);request.setTimeout(10000,()=>request.destroy(Error('plain_tls_timeout')))
})
assert.match(noCaError?.code||'',/CERT|ISSUER|VERIFY/,'baseline must prove no pre-existing CA trust')
checks.push('ordinary Node HTTPS rejects the company certificate without app trust')
assert.equal((await fetcher(origin+'/__pb/api/health')).status,200)
checks.push('bundled CA connects to company health with chain and hostname checks')
const {connection}=await import(pathToFileURL(path.join(app,'local-executor/connection.mjs')))
await assert.rejects(connection(origin+'/__pb')('/poll'),error=>[401,403].includes(error.status),'unauthenticated connector reaches real TLS but remains unauthorized')
checks.push('packaged connector reaches API over HTTPS; missing device token is still rejected')
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-company-gateway-'))
let gateway
try{
 await fs.writeFile(path.join(directory,'index.html'),'<html><head></head><body>isolated TLS fixture</body></html>')
 const {createGateway}=await import(pathToFileURL(path.join(app,'desktop/gateway.mjs')))
 gateway=await createGateway({serverOrigin:origin,webRoot:directory})
 assert.equal((await fetch(gateway.origin+'/__pb/api/health')).status,200)
 checks.push('packaged employee gateway reaches real company HTTPS without system CA trust')
}finally{await gateway?.close();await fs.rm(directory,{recursive:true,force:true})}
const manifest=verifyManifest(await(await fetcher(origin+'/desktop-updates/stable/latest.json',{redirect:'manual'})).json(),signingTrust.publicKey)
checks.push('packaged HTTPS fetch verifies existing signed LAN update manifest')
let downloaded=0
if(process.argv.includes('--download')){
 const response=await fetcher(manifest.url,{redirect:'manual',signal:AbortSignal.timeout(180000)})
 assert.equal(response.status,200)
 const hash=createHash('sha256')
 for await(const chunk of response.body){downloaded+=chunk.length;assert.ok(downloaded<=manifest.size);hash.update(chunk)}
 assert.equal(downloaded,manifest.size);assert.equal(hash.digest('hex'),manifest.sha256)
 checks.push('real signed LAN package streams and matches its exact length and SHA-256; nothing is installed')
}
console.log('COMPANY_HTTPS_PACKAGED_LIVE '+JSON.stringify({status:'PASS',checks,feedVersion:manifest.version,downloaded,systemCaDisabled:true,productionWrites:false,trust:companyHttps.companyTrust().summary}))
