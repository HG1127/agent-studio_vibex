import {pb} from './pb'
import {desktopConnectionBridge,type DesktopComputerState} from './desktopConnectionBridge'
let token:string|undefined,pending:Promise<DesktopComputerState>|null=null
/** Employee JWT stays in memory and travels only over the isolated native IPC. */
export function syncDesktopSession(){
 const bridge=desktopConnectionBridge()
 if(!bridge)return Promise.reject(Error('本机组件尚未就绪。'))
 const next=pb.authStore.isValid?pb.authStore.token:''
 if(token===next&&pending)return pending
 token=next
 const request=bridge.computer('session',{token:next||null})
 pending=request
 void request.catch(()=>{if(pending===request){pending=null;token=undefined}})
 return request
}
export async function desktopComputerRequest(action:string,input?:Record<string,unknown>){
 await syncDesktopSession()
 const bridge=desktopConnectionBridge()
 if(!bridge)throw Error('本机组件尚未就绪。')
 return bridge.computer(action,input)
}
