import {pb} from './pb'
import {ORIGINAL_PG_UI_ENABLED} from './studioBackend'
import {decodeRhToken,verifyStudioSession} from './studioAuth'
import {subscribeStudioSessionPrivacy,invalidateStudioSessionPrivacy} from './studioSessionPrivacy'
import {getLocalDeviceSessionScope,sameLocalDeviceSessionScope,type LocalDeviceSessionScope} from './nativeLocalEmployeeApi'
import {desktopConnectionBridge,type DesktopComputerState} from './desktopConnectionBridge'
let token:string|undefined,pending:Promise<DesktopComputerState>|null=null,nativePending:{scope:LocalDeviceSessionScope;promise:Promise<DesktopComputerState>}|null=null,lastNativeOwner=''
export const desktopEmployeeAvailable=()=>ORIGINAL_PG_UI_ENABLED?!!decodeRhToken():pb.authStore.isValid
export const subscribeDesktopEmployee=(listener:()=>void)=>ORIGINAL_PG_UI_ENABLED?subscribeStudioSessionPrivacy(listener):pb.authStore.onChange(listener)
subscribeStudioSessionPrivacy(()=>{if(!ORIGINAL_PG_UI_ENABLED)return;const priorOwner=lastNativeOwner;nativePending=null;void Promise.resolve().then(()=>{if(!priorOwner||lastNativeOwner!==priorOwner||getLocalDeviceSessionScope().owner===priorOwner)return;lastNativeOwner='';return desktopConnectionBridge()?.computer('session',{backend:'native_pg',active:false,expected_owner:priorOwner}).catch(()=>{})})})
function nativeSessionError(error:unknown,expected:LocalDeviceSessionScope){
 if(ORIGINAL_PG_UI_ENABLED&&sameLocalDeviceSessionScope(expected)&&error instanceof Error&&error.message.includes('[studio_native_session_changed]')){invalidateStudioSessionPrivacy();void verifyStudioSession().catch(()=>{})}
 if(ORIGINAL_PG_UI_ENABLED&&error instanceof Error&&error.message.includes('[studio_native_session_changed]'))return Error('登录或连接状态需要重新核实，请重新读取本人设备。')
 return error
}
/** Native identity stays in the original Electron Cookie partition. */
export function syncDesktopSession(expected=getLocalDeviceSessionScope()){
 const bridge=desktopConnectionBridge();if(!bridge)return Promise.reject(Error('本机组件尚未就绪。'))
 if(ORIGINAL_PG_UI_ENABLED){
  if(!sameLocalDeviceSessionScope(expected))return Promise.reject(Error('请先核实当前登录账号。'))
  if(nativePending?.scope.owner===expected.owner&&nativePending.scope.epoch===expected.epoch)return nativePending.promise
  lastNativeOwner=expected.owner
  const promise=Promise.resolve().then(()=>{if(!sameLocalDeviceSessionScope(expected))throw Error('账号状态已变化，请重新读取本机连接。');return bridge.computer('session',{backend:'native_pg',active:true,expected_owner:expected.owner})}).then(value=>{if(!sameLocalDeviceSessionScope(expected)||value.owner!==expected.owner)throw Error('账号状态已变化，请重新读取本机连接。');return value}).catch(error=>{throw nativeSessionError(error,expected)}),request={scope:expected,promise};nativePending=request
  void promise.then(()=>{if(nativePending===request)nativePending=null},()=>{if(nativePending===request)nativePending=null});return promise
 }
 const next=pb.authStore.isValid?pb.authStore.token:''
 if(token===next&&pending)return pending
 token=next;const request=bridge.computer('session',{token:next||null});pending=request
 void request.catch(()=>{if(pending===request){pending=null;token=undefined}});return request
}
export async function desktopComputerRequest(action:string,input?:Record<string,unknown>,expected=getLocalDeviceSessionScope()){
 await syncDesktopSession(expected)
 const bridge=desktopConnectionBridge();if(!bridge)throw Error('本机组件尚未就绪。')
 if(ORIGINAL_PG_UI_ENABLED&&!sameLocalDeviceSessionScope(expected))throw Error('账号状态已变化，请重新读取本机连接。')
 let value:DesktopComputerState
 try{value=await bridge.computer(action,ORIGINAL_PG_UI_ENABLED?{...input,expected_owner:expected.owner}:input)}catch(error){throw nativeSessionError(error,expected)}
 if(ORIGINAL_PG_UI_ENABLED&&(!sameLocalDeviceSessionScope(expected)||value.owner!==expected.owner))throw Error('账号状态已变化，请重新读取本机连接。')
 return value
}
