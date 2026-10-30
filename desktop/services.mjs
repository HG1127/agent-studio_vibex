import {createGateway} from './gateway.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {listGuidedProfiles} from '../local-executor/profiles.mjs'
import {prepareDesktopPairing} from './pairing.mjs'
const config = JSON.parse(process.argv[2] || '{}')
let gateway, manager, closing = false
const send = value => {if(process.connected)process.send(value)}
async function close() {
  if(closing)return;closing=true
  await Promise.allSettled([manager?.close(),gateway?.close()])
  if(process.connected)process.disconnect()
}
process.on('message',m=>{
  if(m?.type==='stop')void close()
  if(m?.type==='prepare-pairing'&&typeof m.requestId==='string'&&manager&&!closing){
    void prepareDesktopPairing(m.ticket,{serverOrigin:config.serverOrigin,manager})
      .then(()=>send({type:'pairing-result',requestId:m.requestId,ok:true}))
      .catch(error=>send({type:'pairing-result',requestId:m.requestId,ok:false,error:String(error.message).slice(0,240)}))
  }
})
try {
  gateway = await createGateway(config)
  manager = await createConnectorManager({home:config.profileHome,openWindow:async url=>send({type:'permissions',url})})
  send({type:'ready',origin:gateway.origin,port:gateway.port,managerOrigin:manager.origin,managerUrl:manager.origin+'/#'+manager.token})
  const saved = await listGuidedProfiles(config.profileHome ? {home:config.profileHome} : undefined)
  if (saved.profiles.length === 1 && !saved.unavailable && !saved.truncated && new URL(saved.profiles[0].server).origin === config.serverOrigin) {
    const profile=saved.profiles[0]
    await manager.resumeSaved(profile.id,profile.fingerprint).catch(()=>{})
  }
} catch(error) {send({type:'error',message:error.code === 'EADDRINUSE' ? '本机端口被占用，请在设置中选择“重建本机入口”后重启。' : '本机组件启动失败，请检查安装文件和配置。'});await close();process.exitCode=1}
process.once('disconnect',()=>void close())
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void close())
