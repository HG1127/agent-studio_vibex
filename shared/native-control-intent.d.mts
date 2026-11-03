import type {ControlIntent,ControlReceipt} from './native-control-contract.mjs'
export type NativeControlContext={owner:string;epoch:number;server:string}
export type NativeControlIntentRecord=NativeControlContext&{protocol:'native_control_intent_v1';pending:ControlIntent|null}
export function createNativeControlIntent(options:{
 storage:{load:(owner:string,server:string)=>Promise<unknown|null>;save:(record:NativeControlIntentRecord)=>Promise<void>};
 api:{record:(intent:ControlIntent,context:NativeControlContext)=>Promise<unknown>;confirm:(intent:ControlIntent,context:NativeControlContext)=>Promise<unknown>};
 getContext:()=>NativeControlContext;
}):{record:(raw:unknown)=>Promise<ControlReceipt>;recover:()=>Promise<ControlReceipt>}
