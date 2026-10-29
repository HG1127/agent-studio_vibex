import {localDeviceApproval} from '../../../shared/native-local-device-contract.mjs'
export function selectNativeLocalDevices(env:Record<string,string|undefined>,listen:boolean,origin:string,writes:boolean){
 const a=env.AGENT_STUDIO_PG18_LOCAL_DEVICES_AVAILABLE,w=env.AGENT_STUDIO_PG18_LOCAL_DEVICES_WRITES_ENABLED,p=env.AGENT_STUDIO_PG18_LOCAL_DEVICES_APPROVED
 if(a===undefined&&w===undefined&&p===undefined)return{available:false,writes:false}
 let secure=false;try{const u=new URL(origin);secure=u.protocol==='https:'&&u.origin===origin}catch{}
 if(!listen||!secure||a!=='true'||w!==undefined&&w!=='true'||p!==localDeviceApproval||w==='true'&&!writes)throw Error('native_local_devices_opt_in_refused')
 return{available:true,writes:w==='true'}
}
export function selectNativeLocalDeviceExecution(env:Record<string,string|undefined>){
 const enabled=env.AGENT_STUDIO_PG18_LOCAL_DEVICE_EXECUTION_ENABLED,approval=env.AGENT_STUDIO_PG18_LOCAL_DEVICES_APPROVED
 if(enabled===undefined)return false
 if(enabled!=='true'||approval!==localDeviceApproval)throw Error('native_local_device_execution_not_approved');return true
}
