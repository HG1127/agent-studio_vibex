import {validateConnectionTicket} from '../src/lib/localConnectionSetup.ts'
export async function prepareDesktopPairing(input,{serverOrigin,manager,fetchImpl=fetch}) {
  const ticket=validateConnectionTicket(input)
  if(ticket.server!==serverOrigin+'/__pb')throw Error('配对服务器与当前工作台不一致，请重新打开连接向导。')
  const response=await fetchImpl(manager.origin+'/api/prepare',{method:'POST',headers:{'Content-Type':'application/json',Origin:manager.origin,'X-Connector-Session':manager.token},body:JSON.stringify({ticket}),signal:AbortSignal.timeout(15000)})
  if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error||'本机授权准备失败，请核查原设备状态。')}
  // Preparation only; the existing manager still requires explicit local consent.
  return {ok:true}
}
