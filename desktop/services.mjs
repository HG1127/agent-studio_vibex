import {createGateway} from './gateway.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {createDesktopComputer} from './computer.mjs'
import {createNativeDesktopComputer} from './native-computer.mjs'
import {randomUUID} from 'node:crypto'
import {localId} from '../shared/native-local-device-contract.mjs'
const config = JSON.parse(process.argv[2] || '{}')
const backend=config.backend??'pocketbase';if(!['pocketbase','native_pg'].includes(backend))throw Error('invalid_desktop_backend')
const inventoryRequests=new Map()
function ownerInventory(){const requestId=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{inventoryRequests.delete(requestId);reject(Error('desktop_native_inventory_unknown'))},32000);inventoryRequests.set(requestId,{resolve,reject,timer});send({type:'native-owner-inventory',requestId})})}
function ownerCall(operation,input,expectedOwner){const requestId=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{inventoryRequests.delete(requestId);reject(Error('desktop_native_guided_unknown'))},32000);inventoryRequests.set(requestId,{resolve,reject,timer});send({type:'native-owner-guided',requestId,operation,input,expectedOwner})})}
let gateway, manager, computer, closing = false
const send = value => {if(process.connected)process.send(value)}
async function close() {
  if(closing)return;closing=true
  for(const p of inventoryRequests.values()){clearTimeout(p.timer);p.reject(Error('desktop_native_stopped'))}inventoryRequests.clear()
  await computer?.clear().catch(()=>{})
  await Promise.allSettled([manager?.close(),gateway?.close()])
  if(process.connected)process.disconnect()
}
// Every renderer command carries a matching owner, including preparation.
// The private ticket must independently prove its own owner and source.
async function requestComputer(action,input,expectedOwner){
 if(backend==='native_pg'){localId(expectedOwner);return computer.request(action,input,expectedOwner)}
 return computer.request(action,input)
}
function nativeSessionFailure(error){
 const message=error&&Object.getOwnPropertyDescriptor(error,'message')?.value,status=error&&Object.getOwnPropertyDescriptor(error,'status')?.value
 return backend==='native_pg'&&(status===401||['desktop_native_owner_changed','desktop_native_epoch_changed','desktop_native_session_required'].includes(message))
}
process.on('message',m=>{
  if(m?.type==='stop')void close()
  if(['native-owner-inventory-result','native-owner-guided-result'].includes(m?.type)&&inventoryRequests.has(m.requestId)){const p=inventoryRequests.get(m.requestId);inventoryRequests.delete(m.requestId);clearTimeout(p.timer);if(m.ok)p.resolve(m.value);else p.reject(Object.assign(Error('desktop_native_inventory_failed'),{status:m.status}))}
  if(m?.type==='computer-request'&&typeof m.requestId==='string'&&computer&&!closing){
    void requestComputer(m.action,m.input,m.expectedOwner)
      .then(value=>send({type:'computer-result',requestId:m.requestId,ok:true,value}))
      .catch(error=>send({type:'computer-result',requestId:m.requestId,ok:false,...(nativeSessionFailure(error)?{code:'desktop_native_session_changed',error:'登录或连接状态需要重新核实，请重新读取本人设备。'}:{error:/[\u4e00-\u9fff]/.test(String(error.message))?String(error.message).slice(0,240):'本机操作未确认，请检查连接状态后重试。'})}))
  }
})
try {
  gateway = await createGateway(config)
  manager = await createConnectorManager({backend,home:config.profileHome,nativePrepared:value=>computer?.nativePrepared(value),openWindow:async url=>{const hash=new URLSearchParams(new URL(url).hash.slice(1));send({type:'computer-attention',deviceId:hash.get('device'),panel:hash.get('panel')})},confirmReview:(review,signal)=>computer?.confirmReview(review,signal)??false})
  computer=backend==='native_pg'?createNativeDesktopComputer({serverOrigin:config.serverOrigin,manager,ownerInventory,ownerCall,home:config.profileHome,desktopVersion:config.desktopVersion}):createDesktopComputer({serverOrigin:config.serverOrigin,manager,desktopVersion:config.desktopVersion,preferencesFile:config.preferencesFile,attention:value=>send({type:'computer-attention',...value})})
  send({type:'ready',origin:gateway.origin,port:gateway.port,managerOrigin:manager.origin,managerUrl:manager.origin+'/#'+manager.token})
} catch(error) {send({type:'error',message:error.code === 'EADDRINUSE' ? '本机端口被占用，请在设置中选择“重建本机入口”后重启。' : '本机组件启动失败，请检查安装文件和配置。'});await close();process.exitCode=1}
process.once('disconnect',()=>void close())
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void close())
