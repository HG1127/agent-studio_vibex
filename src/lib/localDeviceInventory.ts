import type {LocalDevice} from './localDevices'
import {deviceConnectionState} from './localConnectionSetup.ts'
import {setupProgressStages} from './localConnectionProgress.ts'

/** Treat malformed/inaccessible inventory as unknown, never as an empty account. */
export function parseLocalDeviceInventory(value:unknown):LocalDevice[]{
  if(!value||typeof value!=='object'||!Array.isArray((value as {items?:unknown}).items))throw Error('设备清单格式异常，请刷新重试')
  const rows=(value as {items:unknown[]}).items
  const ids=new Set<string>()
  if(rows.length>100)throw Error('设备清单超出可核验范围')
  return rows.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('设备清单格式异常')
    const d=item as LocalDevice
    if(typeof d.id!=='string'||!/^[A-Za-z0-9]{24}$/.test(d.id)||ids.has(d.id)||
      typeof d.name!=='string'||typeof d.revoked!=='boolean'||
      !Number.isSafeInteger(d.seen_ms)||d.seen_ms<0||typeof d.catalog!=='string')throw Error('设备清单格式异常')
    if(d.paired!==undefined&&typeof d.paired!=='boolean'||
      d.pairing_expires_ms!==undefined&&(!Number.isSafeInteger(d.pairing_expires_ms)||d.pairing_expires_ms<0))
      throw Error('设备配对状态格式异常，请重新读取')
    if(d.setup_stage!==undefined&&(typeof d.setup_stage!=='string'||d.setup_stage!==''&&!Object.hasOwn(setupProgressStages,d.setup_stage))||
      d.setup_seen_ms!==undefined&&(!Number.isSafeInteger(d.setup_seen_ms)||d.setup_seen_ms<0))throw Error('设备准备状态格式异常，请重新读取')
    ids.add(d.id)
    return {id:d.id,name:d.name,revoked:d.revoked,seen_ms:d.seen_ms,catalog:d.catalog,
      ...(d.paired===undefined?{}:{paired:d.paired}),
      ...(d.pairing_expires_ms===undefined?{}:{pairing_expires_ms:d.pairing_expires_ms}),
      ...(d.setup_stage===undefined?{}:{setup_stage:d.setup_stage}),
      ...(d.setup_seen_ms===undefined?{}:{setup_seen_ms:d.setup_seen_ms})}
  })
}
export function visibleLocalDevices(devices:readonly LocalDevice[],query='',showRevoked=false,now=Date.now()):LocalDevice[]{
  const term=query.trim().replace(/^#/,'').toLocaleLowerCase()
  const rank={online:0,waiting:1,offline:2,revoked:3}
  return devices.filter(d=>(showRevoked||!d.revoked)&&(!term||d.name.toLocaleLowerCase().includes(term)||d.id.toLocaleLowerCase().includes(term)))
    .slice().sort((a,b)=>rank[deviceConnectionState(a,now)]-rank[deviceConnectionState(b,now)]||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id))
}
export function deviceResumeCommand(id:string):string{
  return /^[A-Za-z0-9]{24}$/.test(id)?'pnpm local:connect --resume '+id:''
}

/** Pairing and heartbeat are independent facts. No credentials are read and no
 * connection is selected, renewed or started by this presentation helper. */
export function deviceConnectionGuidance(device:LocalDevice,now=Date.now()){
  const state=deviceConnectionState(device,now)
  if(state==='revoked')return {phase:'revoked' as const,label:'已撤销',action:'不可使用',canResume:false,canContinue:false}
  if(state==='online')return {phase:'online' as const,label:'在线',action:'检查连接',canResume:false,canContinue:false}
  if(device.paired===true||device.seen_ms>0)return {
    phase:'resume' as const,label:device.seen_ms>0?'离线':'已配对，等待本机启动',action:'查看恢复步骤',canResume:true,canContinue:false}
  if(device.paired===false){
    const expired=typeof device.pairing_expires_ms==='number'&&device.pairing_expires_ms>0&&now>=device.pairing_expires_ms
    return {phase:expired?'expired' as const:'pairing' as const,label:expired?'连接文件已过期':'待完成配对',action:'查看连接步骤',canResume:false,canContinue:true}
  }
  return {phase:'unknown' as const,label:'等待本机确认',action:'检查连接状态',canResume:false,canContinue:false}
}
