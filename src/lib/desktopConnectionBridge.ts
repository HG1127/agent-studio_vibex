import type {LocalConnectionTicket} from './localConnectionSetup'
import type {LocalDevice} from './localDevices'
import type {GuidedPublicTicket} from '../../shared/native-guided-contract.mjs'
export type DesktopConnectionBridge={readonly version:2;prepareConnection:(ticket:LocalConnectionTicket,expectedOwner?:string)=>Promise<{ok:true}>;openConnection:()=>Promise<{ok:true}>;openUpdates?:()=>Promise<{ok:true}>;openSettings?:()=>Promise<{ok:true}>;computer:(action:string,input?:Record<string,unknown>)=>Promise<DesktopComputerState>;onConnectionRequested:(callback:(intent:{deviceId?:string;panel?:string})=>void)=>()=>void}
export type DesktopGrant={key:string;kind:'file'|'folder';path:string;label:string;readOnly:boolean;capabilities:Record<'edit'|'move'|'delete'|'open',boolean>}
export type DesktopApplication={id:string;name:string;path:string;sha256?:string;windowPath?:string;windowSha256?:string;accessibility?:'electron';adapter:'desktop'|'codex';control:boolean;allowWrite:boolean}
export type DesktopApplicationPermissions={id:string;name:string;fingerprint:string;reviewId:string;enabled:boolean;images:boolean;grants:DesktopApplication[];candidates:DesktopApplication[]}
export type DesktopProfile={id:string;name:string;server:string;fingerprint:string;running:boolean;state:string;message?:string;roots:{path:string;readOnly:boolean;label:string}[];origins:string[];applications?:{enabled:boolean;images:boolean;grants:DesktopApplication[]}}
export type DesktopComputerState={engine:'ready';owner:string|null;version?:string;appVersion?:string;profiles:DesktopProfile[];devices:LocalDevice[];selectedId:string;review:{reviewId:string;name:string;server:string;mode:string;origins:string[];folder:string;kind:'file'|'folder';readOnly:boolean;expired:boolean;expiresAt:number}|null;permissions:{id:string;name:string;server:string;fingerprint:string;reviewId:string;origins:string[];grants:DesktopGrant[];dirty:boolean}|null;applicationPermissions?:DesktopApplicationPermissions|null;selection:{id:string;kind:string}|null;busy:boolean;pairingTicket?:GuidedPublicTicket;notice?:string;confirmations:{id:string;deviceId:string;message:string;kind?:'application'|'permission';expiresAt:number}[]}
export function desktopConnectionBridge():DesktopConnectionBridge|null {
  const bridge=(window as Window&{studioDesktop?:DesktopConnectionBridge}).studioDesktop
  return bridge?.version===2&&typeof bridge.computer==='function'&&typeof bridge.prepareConnection==='function'&&typeof bridge.openConnection==='function'?bridge:null
}
export async function openDesktopUpdates(bridge=desktopConnectionBridge()):Promise<void>{
 if(!bridge?.openUpdates)throw Error('请从左上角「Agent Studio → 版本更新」打开；当前桌面程序尚不支持主界面更新入口。')
 await bridge.openUpdates()
}
export async function openDesktopSettings(bridge=desktopConnectionBridge()):Promise<void>{
 if(!bridge?.openSettings)throw Error('请从左上角「Agent Studio → 服务器设置」打开；当前桌面程序尚不支持此设置入口。')
 await bridge.openSettings()
}
