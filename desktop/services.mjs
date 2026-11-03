import {createGateway} from './gateway.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {createDesktopComputer} from './computer.mjs'
// Electron fork injects this after policy.childEnvironment() has run. Services
// are already running in the bundled Node binary; descendants must be GUI apps.
for(const key of Object.keys(process.env))if(/^ELECTRON_RUN_AS_NODE$/i.test(key))delete process.env[key]
const config = JSON.parse(process.argv[2] || '{}')
let gateway, manager, computer, closing = false
const send = value => {if(process.connected)process.send(value)}
async function close() {
  if(closing)return;closing=true
  await Promise.allSettled([manager?.close(),gateway?.close()])
  if(process.connected)process.disconnect()
}
process.on('message',m=>{
  if(m?.type==='stop')void close()
  if(m?.type==='computer-request'&&typeof m.requestId==='string'&&computer&&!closing){
    void computer.request(m.action,m.input)
      .then(value=>send({type:'computer-result',requestId:m.requestId,ok:true,value}))
      .catch(error=>send({type:'computer-result',requestId:m.requestId,ok:false,error:/[\u4e00-\u9fff]/.test(String(error.message))?String(error.message).slice(0,240):'本机操作未确认，请检查连接状态后重试。'}))
  }
})
try {
  gateway = await createGateway(config)
  manager = await createConnectorManager({home:config.profileHome,openWindow:async url=>{const hash=new URLSearchParams(new URL(url).hash.slice(1));send({type:'computer-attention',deviceId:hash.get('device'),panel:hash.get('panel')})},confirmReview:(review,signal)=>computer?.confirmReview(review,signal)??false})
  computer=createDesktopComputer({serverOrigin:config.serverOrigin,manager,desktopVersion:config.desktopVersion,preferencesFile:config.preferencesFile,attention:value=>send({type:'computer-attention',...value})})
  send({type:'ready',origin:gateway.origin,port:gateway.port,managerOrigin:manager.origin,managerUrl:manager.origin+'/#'+manager.token})
} catch(error) {send({type:'error',message:error.code === 'EADDRINUSE' ? '本机端口被占用，请在设置中选择“重建本机入口”后重启。' : '本机组件启动失败，请检查安装文件和配置。'});await close();process.exitCode=1}
process.once('disconnect',()=>void close())
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void close())
