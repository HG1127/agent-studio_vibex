export type NativeRunControlAction='pause'|'resume'
export type NativeRunControlRequest=Readonly<{operation_id:string;expected_state_sha256:string}>
export type NativeRunControlView={state_sha256:string;manually_paused:boolean;in_flight:boolean;outcome_unknown:boolean;can_pause:boolean;can_resume:boolean}
export type NativeRunControlReceipt={operation_id:string;action:NativeRunControlAction;run_id:string;request_sha256:string;outcome_status:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hex=/^[a-f0-9]{64}$/
export function nativeRunControlRequest(raw:NativeRunControlRequest):NativeRunControlRequest{
 if(!raw||Object.keys(raw).sort().join(',')!=='expected_state_sha256,operation_id'||!uuid.test(raw.operation_id)||!hex.test(raw.expected_state_sha256))throw Error('invalid_agent_run_control')
 return Object.freeze({operation_id:raw.operation_id.toLowerCase(),expected_state_sha256:raw.expected_state_sha256})
}
export function nativeRunControlView(raw:unknown):NativeRunControlView{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('unconfirmed_agent_run_control')
 const v=raw as NativeRunControlView
 if(Object.keys(v).sort().join(',')!=='can_pause,can_resume,in_flight,manually_paused,outcome_unknown,state_sha256'||!hex.test(v.state_sha256)||['manually_paused','in_flight','outcome_unknown','can_pause','can_resume'].some(key=>typeof v[key as keyof NativeRunControlView]!=='boolean')||v.can_resume&&(!v.manually_paused||v.in_flight||v.outcome_unknown))throw Error('unconfirmed_agent_run_control')
 return v
}
export async function nativeRunControlConfirmed(raw:{control_confirmed?:boolean;run_control_confirmation?:NativeRunControlReceipt|null},runId:string,action:NativeRunControlAction,body:NativeRunControlRequest,confirmOnly=false):Promise<boolean>{
 if(confirmOnly&&raw.control_confirmed===false&&raw.run_control_confirmation===null)return false
 const value=raw.run_control_confirmation,bytes=new TextEncoder().encode(JSON.stringify([runId,action,body.operation_id,body.expected_state_sha256])),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')
 if(raw.control_confirmed!==true||!value||Object.keys(value).sort().join(',')!=='action,operation_id,outcome_status,request_sha256,run_id'||value.operation_id!==body.operation_id||value.action!==action||value.run_id!==runId||value.request_sha256!==hash||!['paused','queued','awaiting_approval','awaiting_input'].includes(value.outcome_status))throw Error('unconfirmed_agent_run_control')
 return true
}
