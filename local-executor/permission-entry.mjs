import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {verifyChromeInstalled} from './browser-settings.mjs'

export const PERMISSION_ENTRY_TOOL='connector.open_permissions'
export const permissionPanel=value=>value==='sites'||value==='files'
export function validPermissionEntry(message,now=Date.now()){
 return !!message&&message.type==='studio-open-permissions'&&/^[a-f0-9]{24}$/.test(message.requestId||'')&&permissionPanel(message.panel)&&Number.isSafeInteger(message.expiresAt)&&message.expiresAt>now&&message.expiresAt<=now+15000
}
/** Local-session URLs never enter a tool catalog, server response or log. */
export function permissionEntryUrl(origin,token,device,panel){
 const url=new URL(origin)
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!/^[a-f0-9]{64}$/.test(token)||!/^[A-Za-z0-9]{24}$/.test(device)||!permissionPanel(panel))throw Error('permission_editor_unavailable')
 return url.origin+'/#'+token+'&device='+encodeURIComponent(device)+'&panel='+panel
}
export async function launchPermissionWindow(url){
 const chrome=await verifyChromeInstalled()
 await new Promise((resolve,reject)=>{
  const child=spawn(chrome,['--new-window',url],{shell:false,windowsHide:true,stdio:'ignore',detached:true})
  child.once('error',()=>reject(Error('permission_editor_unavailable')))
  child.once('spawn',()=>{child.unref();resolve()})
 })
}
/** A bounded one-shot IPC request can only display the owning manager's editor.
 * No remote URL, path, credential, permission edit or command is accepted. */
export function requestPermissionWindow(panel,signal,channel=process){
 if(!permissionPanel(panel)||!channel.connected||typeof channel.send!=='function')return Promise.reject(Error('permission_editor_unavailable'))
 signal?.throwIfAborted()
 const requestId=randomBytes(12).toString('hex')
 return new Promise((resolve,reject)=>{
  let finished=false
  const finish=(error)=>{
   if(finished)return;finished=true;clearTimeout(timer)
   channel.off('message',received);signal?.removeEventListener('abort',aborted)
   error?reject(error):resolve('已向本机 Chrome 发送授权编辑窗口打开请求。请在本机窗口核对并修改；尚未停止连接、修改或保存任何权限。')
  }
  const received=message=>{if(message?.type==='studio-open-permissions-result'&&message.requestId===requestId)finish(message.ok===true?null:Error('permission_editor_unavailable'))}
  const aborted=()=>finish(Error('permission_editor_request_cancelled'))
  const timer=setTimeout(()=>finish(Error('permission_editor_request_timeout')),11000)
  channel.on('message',received);signal?.addEventListener('abort',aborted,{once:true})
  try{channel.send({type:'studio-open-permissions',requestId,panel,expiresAt:Date.now()+10000},error=>{if(error)finish(Error('permission_editor_unavailable'))})}catch{finish(Error('permission_editor_unavailable'))}
 })
}
