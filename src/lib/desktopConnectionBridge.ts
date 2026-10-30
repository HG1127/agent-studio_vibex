import type {LocalConnectionTicket} from './localConnectionSetup'
export type DesktopConnectionBridge={readonly version:1;prepareConnection:(ticket:LocalConnectionTicket)=>Promise<{ok:true}>;openConnection:()=>Promise<{ok:true}>}
export function desktopConnectionBridge():DesktopConnectionBridge|null {
  const bridge=(window as Window&{studioDesktop?:DesktopConnectionBridge}).studioDesktop
  return bridge?.version===1&&typeof bridge.prepareConnection==='function'&&typeof bridge.openConnection==='function'?bridge:null
}
