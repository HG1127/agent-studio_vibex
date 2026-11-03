import {decodeRhToken,verifyStudioSession} from './studioAuth'
import {ORIGINAL_PG_UI_ENABLED} from './studioBackend'
import {invalidateStudioSessionPrivacy,subscribeStudioSessionPrivacy} from './studioSessionPrivacy'
import {createNativeEmployeeInventoryReader,NativeEmployeeInventoryError,type NativeEmployeeInventoryScope} from '../../shared/native-employee-inventory.mjs'
export type LocalDeviceSessionScope=NativeEmployeeInventoryScope
let epoch=0
const pending=new Set<AbortController>()
subscribeStudioSessionPrivacy(()=>{epoch++;for(const controller of pending)controller.abort();pending.clear()})
export function getLocalDeviceSessionScope():LocalDeviceSessionScope{return {owner:decodeRhToken()?.sub||'',epoch:ORIGINAL_PG_UI_ENABLED?epoch:0}}
export function sameLocalDeviceSessionScope(expected:LocalDeviceSessionScope):boolean{const current=getLocalDeviceSessionScope();return !!expected.owner&&current.owner===expected.owner&&current.epoch===expected.epoch}
export const subscribeLocalDeviceSessionPrivacy=subscribeStudioSessionPrivacy
const reader=createNativeEmployeeInventoryReader({getContext:getLocalDeviceSessionScope,transport:(route,init)=>fetch(route,init)})
/** Read facts through the genuine Cookie session. Other original-page actions
 * retain their own receipt contracts; discovery never writes or selects. */
export async function nativeLocalEmployeeApi<T>(route:string,body?:unknown,signal?:AbortSignal,expected=getLocalDeviceSessionScope()):Promise<T>{
 if(route!=='/api/local-devices'||body!==undefined)throw Error('此项设备操作尚未确认，请保留原请求并核对连接状态。')
 if(!ORIGINAL_PG_UI_ENABLED||!expected.owner||!sameLocalDeviceSessionScope(expected))throw new NativeEmployeeInventoryError(401,'native_local_inventory_session_changed')
 const controller=new AbortController();pending.add(controller)
 try{return await reader.read(AbortSignal.any([controller.signal,...(signal?[signal]:[])]),expected) as T}
 catch(error){
  if(!sameLocalDeviceSessionScope(expected))throw new NativeEmployeeInventoryError(401,'native_local_inventory_session_changed')
  if(error instanceof NativeEmployeeInventoryError){
   if(['native_local_inventory_session_changed','native_local_inventory_session_required','session_required','employee_not_provisioned'].includes(error.code)){invalidateStudioSessionPrivacy();void verifyStudioSession().catch(()=>{})}
   error.message=error.code==='native_local_inventory_changed'?'设备状态正在更新，请刷新后重试。':error.status===401?'登录状态已变化，请重新核实当前账号。':'暂时无法核实本人设备，请刷新重试；不会将未知状态标为已连接。'
  }
  throw error
 }finally{pending.delete(controller)}
}
