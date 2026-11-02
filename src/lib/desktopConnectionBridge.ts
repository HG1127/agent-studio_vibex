import type {LocalConnectionTicket} from './localConnectionSetup'
import type {LocalDevice} from './localDevices'
export type DesktopConnectionBridge={readonly version:2;prepareConnection:(ticket:LocalConnectionTicket)=>Promise<{ok:true}>;openConnection:()=>Promise<{ok:true}>;computer:(action:string,input?:Record<string,unknown>)=>Promise<DesktopComputerState>;onConnectionRequested:(callback:(intent:{deviceId?:string;panel?:string})=>void)=>()=>void}
export type DesktopGrant={key:string;kind:'file'|'folder';path:string;label:string;readOnly:boolean;capabilities:Record<'edit'|'move'|'delete'|'open',boolean>}
export type DesktopApplication={id:string;name:string;path:string;sha256?:string;windowPath?:string;windowSha256?:string;accessibility?:'electron';adapter:'desktop'|'codex';control:boolean;allowWrite:boolean}
export type DesktopApplicationPermissions={id:string;name:string;fingerprint:string;reviewId:string;enabled:boolean;images:boolean;grants:DesktopApplication[];candidates:DesktopApplication[]}
export type DesktopProfile={id:string;name:string;server:string;fingerprint:string;running:boolean;state:string;message?:string;roots:{path:string;readOnly:boolean;label:string}[];origins:string[];applications?:{enabled:boolean;images:boolean;grants:DesktopApplication[]}}
export type DesktopComputerState={engine:'ready';owner:string|null;version?:string;appVersion?:string;profiles:DesktopProfile[];devices:LocalDevice[];selectedId:string;review:{reviewId:string;name:string;server:string;mode:string;origins:string[];folder:string;kind:'file'|'folder';readOnly:boolean;expired:boolean;expiresAt:number}|null;permissions:{id:string;name:string;server:string;fingerprint:string;reviewId:string;origins:string[];grants:DesktopGrant[];dirty:boolean}|null;applicationPermissions?:DesktopApplicationPermissions|null;selection:{id:string;kind:string}|null;busy:boolean;notice?:string;confirmations:{id:string;deviceId:string;message:string;kind?:'application'|'permission';expiresAt:number}[]}
export function desktopConnectionBridge():DesktopConnectionBridge|null {
  const bridge=(window as Window&{studioDesktop?:DesktopConnectionBridge}).studioDesktop
  return bridge?.version===2&&typeof bridge.computer==='function'&&typeof bridge.prepareConnection==='function'&&typeof bridge.openConnection==='function'?bridge:null
}
