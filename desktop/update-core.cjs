'use strict'
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto')
const MAX_PACKAGE=1024*1024*1024
function version(value){
 const m=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-preview\.(0|[1-9]\d{0,5}))?$/.exec(value||'')
 if(!m)throw Error('版本号格式无效');return [+m[1],+m[2],+m[3],m[4]===undefined?Infinity:+m[4]]
}
function compare(a,b){const x=version(a),y=version(b);for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0}
function validateReleaseHistory(value){
 if(!Array.isArray(value)||value.length>12)throw Error('版本历史格式无效')
 const seen=new Set()
 return value.map(r=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['version','publishedAt','title','notes'].includes(k))||typeof r.version!=='string'||typeof r.publishedAt!=='string'||!Number.isFinite(Date.parse(r.publishedAt))||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||typeof r.notes!=='string'||r.notes.length>5000||seen.has(r.version))throw Error('版本历史格式无效')
  version(r.version);seen.add(r.version);return {version:r.version,publishedAt:r.publishedAt,title:r.title,notes:r.notes}
 })
}
function mergeReleaseHistory(...groups){const rows=new Map();for(const group of groups)for(const row of validateReleaseHistory(group))rows.set(row.version,row);return [...rows.values()].sort((a,b)=>compare(b.version,a.version)).slice(0,12)}
function fitReleaseHistory(metadata){
 const history=validateReleaseHistory(metadata.history)
 while(Buffer.byteLength(JSON.stringify({...metadata,history}))>36000&&history.length>1)history.pop()
 if(Buffer.byteLength(JSON.stringify({...metadata,history}))>36000)throw Error('版本说明过长，无法兼容已有更新器')
 return history
}
function safeUrl(value){
 const u=new URL(value);if(u.username||u.password||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('更新地址必须是 HTTPS，且不能包含账号或密码');return u.href
}
function verifyManifest(envelope,key){
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>50000||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('更新清单格式无效')
 const bytes=Buffer.from(envelope.payload,'base64');if(!crypto.verify(null,bytes,key,Buffer.from(envelope.signature,'base64')))throw Error('更新签名验证失败，未下载或运行')
 const m=JSON.parse(bytes.toString('utf8'));version(m.version);version(m.minimumVersion)
 if(m.schema!==1||m.channel!=='stable'||m.platform!=='win32-x64'||!Number.isSafeInteger(m.size)||m.size<1||m.size>MAX_PACKAGE||!/^[a-f0-9]{64}$/.test(m.sha256)||typeof m.notes!=='string'||m.notes.length>5000||!Number.isFinite(Date.parse(m.publishedAt)))throw Error('更新信息不受支持')
 if(m.title!==undefined&&(typeof m.title!=='string'||!m.title.trim()||m.title.length>120))throw Error('更新信息不受支持')
 if(m.history!==undefined)m.history=validateReleaseHistory(m.history)
 m.url=safeUrl(m.url);return m
}
async function request(url,fetcher,signal){
 for(let i=0;i<6;i++){
  const response=await fetcher(safeUrl(url),{redirect:'manual',credentials:'omit',cache:'no-store',signal})
  if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('更新地址重定向无效');url=new URL(next,url).href;continue}
  if(!response.ok){await response.body?.cancel();throw Error(response.status===404?'服务器尚未发布桌面更新':'更新服务器返回 '+response.status)}return response
 }throw Error('更新地址重定向次数过多')
}
async function smallBody(response,limit){let size=0,chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('更新清单过大');chunks.push(chunk)}return Buffer.concat(chunks)}
async function hashFile(file){const hash=crypto.createHash('sha256'),handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk)}finally{await handle.close()}return hash.digest('hex')}
function createUpdater({currentVersion,publicKey,directory,feed,fetcher=fetch,onChange=()=>{},history=[]}){
 const bundled=validateReleaseHistory(history)
 version(currentVersion);let state={phase:'idle',currentVersion,message:'点击检查更新',progress:0,releases:mergeReleaseHistory(bundled)},locked=false,manifest,envelope,installer
 const update=patch=>{state={...state,...patch};onChange({...state});return {...state}}
 const run=async fn=>{if(locked)throw Error('更新操作正在进行');locked=true;try{return await fn()}catch(error){update({phase:'error',message:error.message,progress:0});throw error}finally{locked=false}}
 return {
  state:()=>({...state}),
  check:()=>run(async()=>{
   manifest=null;envelope=null;installer=null;update({phase:'checking',message:'正在检查更新…',progress:0,downloaded:0})
   const response=await request(await feed(),fetcher,AbortSignal.timeout(20000));const text=(await smallBody(response,65536)).toString('utf8');try{envelope=JSON.parse(text)}catch{throw Error('服务器未发布有效的更新清单，请检查更新地址及静态目录配置')};manifest=verifyManifest(envelope,publicKey)
   const release={version:manifest.version,publishedAt:manifest.publishedAt,title:manifest.title||(manifest.history||bundled).find(r=>r.version===manifest.version)?.title||'版本更新',notes:manifest.notes}
   const metadata={version:manifest.version,notes:manifest.notes,publishedAt:manifest.publishedAt,size:manifest.size,checkedAt:new Date().toISOString(),releases:mergeReleaseHistory(bundled,manifest.history||[],[release])}
   if(compare(manifest.version,currentVersion)<=0)return update({...metadata,phase:'current',message:'当前已是最新版本'})
   if(compare(currentVersion,manifest.minimumVersion)<0)throw Error('此版本需要先安装一次基础版本 '+manifest.minimumVersion)
   return update({...metadata,phase:'available',message:'发现新版本 '+manifest.version})
  }),
  download:()=>run(async()=>{
   if(!manifest||!['available','error'].includes(state.phase))throw Error('请先检查更新')
   update({phase:'downloading',message:'正在下载并校验更新…',progress:0});await fs.mkdir(directory,{recursive:true})
   const free=await fs.statfs(directory);if(Number(free.bavail)*Number(free.bsize)<manifest.size*8+128*1024*1024)throw Error('更新目录所在磁盘空间不足，请至少预留 '+Math.ceil((manifest.size*8+128*1024*1024)/1024/1024)+' MB')
   const temp=path.join(directory,'download-'+crypto.randomUUID()+'.partial'),target=temp.replace('.partial','.exe'),hash=crypto.createHash('sha256');let size=0,handle
   try{
    const response=await request(manifest.url,fetcher,AbortSignal.timeout(15*60*1000));const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)!==manifest.size){await response.body?.cancel();throw Error('更新文件长度不一致')}
    handle=await fs.open(temp,'wx',0o600);for await(const chunk of response.body){size+=chunk.length;if(size>manifest.size)throw Error('更新文件超出清单长度');hash.update(chunk);await handle.writeFile(chunk);update({progress:Math.floor(size/manifest.size*100),downloaded:size})}
    await handle.close();handle=null;if(size!==manifest.size||hash.digest('hex')!==manifest.sha256)throw Error('更新文件校验失败，未运行');await fs.rename(temp,target);installer=target
    return update({phase:'ready',message:'更新已就绪，可以重启更新',progress:100})
   }catch(error){await handle?.close().catch(()=>{});await fs.rm(temp,{force:true});throw error}
  }),
  ready:async()=>{if(locked||state.phase!=='ready'||!installer)throw Error('请先下载更新');if(await hashFile(installer)!==manifest.sha256){installer=null;update({phase:'error',message:'已下载的更新发生变化，请重新下载',progress:0});throw Error('已下载的更新发生变化，请重新下载')}return {installer,envelope,manifest}},
 }
}
module.exports={createUpdater,verifyManifest,compare,safeUrl,hashFile,validateReleaseHistory,mergeReleaseHistory,fitReleaseHistory}
