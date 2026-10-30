import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {validateConnectionTicket} from '../src/lib/localConnectionSetup.ts'

const ID=/^[A-Za-z0-9]{24}$/
const routes={prepare:'/api/prepare',discard:'/api/discard',folder:'/api/folder',file:'/api/file',access:'/api/access',connect:'/api/connect',resume:'/api/resume',stop:'/api/stop','picker.cancel':'/api/picker/cancel',
 'permissions.open':'/api/permissions/open','permissions.sites':'/api/permissions/sites','permissions.pick':'/api/permissions/pick','permissions.grant':'/api/permissions/grant','permissions.save':'/api/permissions/save','permissions.discard':'/api/permissions/discard'}
/** Private desktop broker. The renderer never receives the manager capability,
 * device credentials, executable configuration, arbitrary paths or URLs. */
export function createDesktopComputer({serverOrigin,manager,preferencesFile,fetchImpl=fetch,attention=()=>{}}){
 let session=null,epoch=0,syncing=null,syncRevision=0,preferences={},loaded=false,draftDevice=null
 const confirmations=new Map(),restored=new Set()
 let writing=Promise.resolve()
 const key=owner=>createHash('sha256').update(serverOrigin+'\n'+owner).digest('hex')
 async function remember(owner,value){preferences[key(owner)]=value;if(preferencesFile){const text=JSON.stringify(preferences);const write=writing.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(preferencesFile),{recursive:true});await fs.writeFile(preferencesFile+'.tmp',text,{mode:0o600});await fs.rename(preferencesFile+'.tmp',preferencesFile)});writing=write;await write}}
 async function authenticate(token){
  if(typeof token!=='string'||token.length<20||token.length>16000||/[\r\n]/.test(token))throw Error('请先登录工作台。')
  const get=async route=>{const r=await fetchImpl(serverOrigin+'/__pb'+route,{headers:{Authorization:token},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Object.assign(Error(r.status===401||r.status===403?'员工登录已失效，请重新登录。':'暂时无法验证账号与设备，请稍后重试。'),{status:r.status});return r.json()}
  const me=await get('/api/studio/me')
  if(typeof me.user?.id!=='string'||me.user.active!==true)throw Error('员工身份未验证。')
  const inventory=await get('/api/local-devices')
  if(!Array.isArray(inventory.items)||inventory.items.length>100||inventory.items.some(d=>!d||!ID.test(d.id||'')||typeof d.revoked!=='boolean'))throw Error('无法核实当前账号设备清单。')
  return {owner:me.user.id,token,devices:inventory.items.filter(d=>!d.revoked)}
 }
 async function current(){const s=session,n=epoch;if(!s)throw Error('请先登录工作台，等待本机组件就绪。');let verified;try{verified=await authenticate(s.token)}catch(error){if([401,403].includes(error.status)&&session===s)await clear();throw error}if(epoch!==n||session!==s||verified.owner!==s.owner)throw Error('账号发生变化，请刷新后重试。');session.devices=verified.devices;return {session:s,epoch:n}}
 const check=ctx=>{if(ctx.epoch!==epoch||ctx.session!==session)throw Error('账号发生变化，本次操作已取消。')}
 async function raw(action,input={}){const response=await fetchImpl(manager.origin+routes[action],{method:'POST',headers:{'Content-Type':'application/json',Origin:manager.origin,'X-Connector-Session':manager.token},body:JSON.stringify(input),signal:AbortSignal.timeout(['folder','file','permissions.pick'].includes(action)?245000:25000)});const data=await response.json();if(!response.ok)throw Error(data.error||'本机操作未确认，请核对连接状态。');return data}
 const matching=(snapshot,s)=>snapshot.profiles.filter(p=>p.server===serverOrigin+'/__pb'&&s.devices.some(d=>d.id===p.id))
 async function snapshot(ctx){check(ctx);const data=await manager.state();check(ctx);const profiles=matching(data,ctx.session);return {engine:'ready',owner:ctx.session.owner,version:data.version,profiles,review:draftDevice&&ctx.session.devices.some(d=>d.id===draftDevice)?data.review:null,permissions:profiles.some(p=>p.id===data.permissions?.id)?data.permissions:null,selection:data.selection,busy:data.busy,confirmations:[...confirmations.values()].filter(c=>profiles.some(p=>p.id===c.deviceId)).map(({id,deviceId,message,expiresAt})=>({id,deviceId,message,expiresAt}))}}
 async function clear(){epoch++;const old=session;session=null;draftDevice=null;restored.clear();for(const review of confirmations.values())review.finish(false);await manager.clearDesktopDrafts();if(old){const data=await manager.state();await Promise.allSettled(matching(data,old).map(p=>manager.stopSaved(p.id)))}}
 async function sync(token){
  if(!token){syncRevision++;syncing=null;await clear();return {engine:'ready',owner:null,profiles:[],review:null,permissions:null,selection:null,busy:false,confirmations:[]}}
  if(syncing?.token===token)return syncing.promise
  const sequence=++syncRevision
  const promise=(async()=>{
   const verified=await authenticate(token);if(sequence!==syncRevision)throw Error('账号状态已变化，请重试。')
   if(session?.owner!==verified.owner){await clear();if(sequence!==syncRevision)throw Error('账号状态已变化，请重试。');session=verified}
   else {session.token=verified.token;session.devices=verified.devices}
   const ctx={session,epoch}
   if(!loaded){loaded=true;try{preferences=JSON.parse(await fs.readFile(preferencesFile,'utf8'))}catch{preferences={}}}
   const data=await manager.state();check(ctx)
   const profiles=matching(data,session),preferred=preferences[key(session.owner)]
   const target=preferred?.id?profiles.find(p=>p.id===preferred.id):profiles.length===1?profiles[0]:null
   if(target&&!preferred?.paused&&!restored.has(target.id)&&!target.running){restored.add(target.id);await manager.resumeSaved(target.id,target.fingerprint).catch(()=>{});check(ctx)}
   return snapshot(ctx)
  })().finally(()=>{if(syncing?.promise===promise)syncing=null})
  syncing={token,promise};return promise
 }
 async function request(action,input={}){
  if(action==='session')return sync(input.token)
  if(!['state','confirm',...Object.keys(routes)].includes(action))throw Error('不支持的本机操作。')
  const ctx=await current();if(action==='state')return snapshot(ctx)
  if(action==='confirm'){
   if(Object.keys(input).some(k=>!['id','consent'].includes(k))||typeof input.consent!=='boolean')throw Error('授权确认无效。')
   const review=confirmations.get(input.id);if(!review||review.expiresAt<=Date.now()||!ctx.session.devices.some(d=>d.id===review.deviceId))throw Error('此确认已结束，请核对授权状态。')
   review.finish(input.consent);return snapshot(ctx)
  }
  const before=await manager.state();check(ctx)
  if(action==='prepare'){
   const ticket=validateConnectionTicket(input.ticket)
   if(ticket.server!==serverOrigin+'/__pb'||!ctx.session.devices.some(d=>d.id===ticket.pairing.id&&d.paired===false))throw Error('配对凭证不属于当前账号或工作台。')
   draftDevice=ticket.pairing.id
  }else if(['discard','folder','file','access','connect'].includes(action)){
   if(!draftDevice||!ctx.session.devices.some(d=>d.id===draftDevice&&d.paired===false))throw Error('这条设备准备已结束，请核实原设备。')
   if(action==='folder'&&input.scope!=='connect'||input.id||input.fingerprint)throw Error('本机授权目标无效。')
  }else if(action==='picker.cancel'){
   if(before.selection?.id!==input.id)throw Error('此选择已经结束。')
  }else {
   if(!matching(before,ctx.session).some(p=>p.id===input.id))throw Error('此本机连接不属于当前账号。')
  }
  const connectedId=action==='connect'?draftDevice:null
  const data=await raw(action,input);check(ctx)
  if(action==='resume'||connectedId){await remember(ctx.session.owner,{id:connectedId||input.id,paused:false});restored.add(connectedId||input.id)}
  if(action==='stop')await remember(ctx.session.owner,{id:input.id,paused:true})
  if(action==='connect'||action==='discard')draftDevice=null
  return {...await snapshot(ctx),notice:data.notice}
 }
 async function confirmReview({deviceId,review,expiresAt},signal){
  if(signal.aborted||!session||!session.devices.some(d=>d.id===deviceId))return false
  const id=randomBytes(16).toString('hex'),n=epoch
  return new Promise(resolve=>{
   const abort=()=>finish(false)
   const finish=ok=>{clearTimeout(timer);signal.removeEventListener('abort',abort);confirmations.delete(id);resolve(ok===true&&epoch===n&&session?.devices.some(d=>d.id===deviceId)===true)}
   const timer=setTimeout(abort,Math.max(1,expiresAt-Date.now()))
   confirmations.set(id,{id,deviceId,message:review.message,expiresAt,finish});signal.addEventListener('abort',abort,{once:true});attention({deviceId,panel:'confirmation'})
  })
 }
 return {request,confirmReview,clear}
}
