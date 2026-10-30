import type {LocalConnectionTicket} from './localConnectionSetup'
export type DesktopConnectionBridge={readonly version:2;prepareConnection:(ticket:LocalConnectionTicket)=>Promise<{ok:true}>;openConnection:()=>Promise<{ok:true}>;computer:(action:string,input?:Record<string,unknown>)=>Promise<DesktopComputerState>;onConnectionRequested:(callback:(intent:{deviceId?:string;panel?:string})=>void)=>()=>void}
export type DesktopGrant={key:string;kind:'file'|'folder';path:string;label:string;readOnly:boolean;capabilities:Record<'edit'|'move'|'delete'|'open',boolean>}
export type DesktopProfile={id:string;name:string;server:string;fingerprint:string;running:boolean;state:string;message?:string;roots:{path:string;readOnly:boolean;label:string}[];origins:string[]}
export type DesktopComputerState={engine:'ready';owner:string|null;version?:string;profiles:DesktopProfile[];review:{reviewId:string;name:string;server:string;mode:string;origins:string[];folder:string;kind:'file'|'folder';readOnly:boolean;expired:boolean;expiresAt:number}|null;permissions:{id:string;name:string;server:string;fingerprint:string;reviewId:string;origins:string[];grants:DesktopGrant[];dirty:boolean}|null;selection:{id:string;kind:string}|null;busy:boolean;notice?:string;confirmations:{id:string;deviceId:string;message:string;expiresAt:number}[]}
export function desktopConnectionBridge():DesktopConnectionBridge|null {
  const bridge=(window as Window&{studioDesktop?:DesktopConnectionBridge}).studioDesktop
  return bridge?.version===2&&typeof bridge.computer==='function'&&typeof bridge.prepareConnection==='function'&&typeof bridge.openConnection==='function'?bridge:null
}
