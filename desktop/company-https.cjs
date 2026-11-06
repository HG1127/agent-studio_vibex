'use strict'
// App-private CA trust. Never changes Windows/Chromium trust or TLS verification.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),tls=require('node:tls')
const {X509Certificate,createHash}=require('node:crypto'),{Readable}=require('node:stream')
function loadCompanyTrust(directory=path.join(__dirname,'trust')){
 const config=JSON.parse(fs.readFileSync(path.join(directory,'company-ca.json'),'utf8'))
 if(config.schema!==1||!Array.isArray(config.authorities)||!config.authorities.length||config.authorities.length>4)throw Error('公司证书配置无效')
 const entries=config.authorities.map(entry=>{
  if(!/^[a-z0-9-]+\.pem$/.test(entry.file)||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Array.isArray(entry.origins)||!entry.origins.length)throw Error('公司证书配置无效')
  const file=path.join(directory,entry.file),stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('公司证书必须是随包发布的普通文件')
  const pem=fs.readFileSync(file,'utf8')
  if(!/^\s*-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----\s*$/.test(pem)||pem.includes('PRIVATE KEY')||(pem.match(/BEGIN CERTIFICATE/g)||[]).length!==1)throw Error('公司证书文件无效')
  const cert=new X509Certificate(pem)
  if(!cert.ca||createHash('sha256').update(cert.raw).digest('hex')!==entry.sha256)throw Error('公司证书指纹不匹配')
  const origins=entry.origins.map(value=>{const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value)throw Error('公司证书地址范围无效');return value})
  return {pem,origins,cert}
 })
 const files=['company-ca.json',...new Set(config.authorities.map(entry=>entry.file))]
 if(fs.readdirSync(directory).some(file=>!files.includes(file)))throw Error('公司证书目录包含未声明的文件')
 return {files,options(value){
  const url=new URL(value),matching=entries.filter(entry=>entry.origins.includes(url.origin))
  if(!matching.length)return {}
  const now=Date.now()
  for(const {cert} of matching)if(now<Date.parse(cert.validFrom)||now>=Date.parse(cert.validTo))throw Error('公司 HTTPS 证书不在有效期内，请联系管理员更新证书')
  return {ca:[...(tls.getCACertificates?tls.getCACertificates('default'):tls.rootCertificates),...matching.map(entry=>entry.pem)],rejectUnauthorized:true,minVersion:'TLSv1.2'}
 },summary:entries.map(({cert,origins})=>({subject:cert.subject,validTo:cert.validTo,sha256:createHash('sha256').update(cert.raw).digest('hex'),origins}))}
}
let bundled
function companyTrust(){return bundled||=(loadCompanyTrust())}
function companyTlsOptions(url){return companyTrust().options(url)}
function createCompanyFetch({fallback=(...args)=>globalThis.fetch(...args),trust=companyTrust()}={}){
 return async function companyFetch(value,options={}){
  const url=new URL(value),tlsOptions=trust.options(url)
  if(!tlsOptions.ca)return fallback(value,options)
  if(url.username||url.password)throw Error('HTTPS 地址不能包含账号或密码')
  if(options.body!==undefined&&typeof options.body!=='string'&&!Buffer.isBuffer(options.body))throw Error('不支持的 HTTPS 请求正文')
  const method=(options.method||'GET').toUpperCase(),redirect=options.redirect||'error'
  if(!['manual','error'].includes(redirect))throw Error('公司 HTTPS 请求必须明确处理重定向')
  options.signal?.throwIfAborted()
  return new Promise((resolve,reject)=>{
   // Each request owns its socket. No CA settings or pooled sessions leak to
   // another origin; the standard chain, hostname and expiry checks still run.
   const req=https.request(url,{...tlsOptions,agent:false,method,headers:Object.fromEntries(new Headers(options.headers)),signal:options.signal},response=>{
    if(redirect==='error'&&response.statusCode>=300&&response.statusCode<400){response.destroy();reject(Error('公司 HTTPS 请求不允许重定向'));return}
    const headers=new Headers()
    for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1])
    const body=method==='HEAD'||[204,205,304].includes(response.statusCode)?null:Readable.toWeb(response)
    if(!body)response.resume()
    resolve(new Response(body,{status:response.statusCode,statusText:response.statusMessage,headers}))
   })
   req.once('error',reject)
   if(options.body!==undefined)req.write(options.body)
   req.end()
  })
 }
}
module.exports={loadCompanyTrust,companyTrust,companyTlsOptions,createCompanyFetch}
