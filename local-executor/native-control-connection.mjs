import {request as httpsRequest} from 'node:https'
import {request as httpRequest} from 'node:http'
import {nativeRequestPlan,readNativeResponse} from './native-connection.mjs'
import {guidedServer} from '../shared/native-guided-contract.mjs'
import {nativeControlExecutorRoute,controlDeviceInput} from '../shared/native-control-contract.mjs'
export function nativeControlRequestPlan(server,operation,raw,token,signal){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('native_control_device_token_required');const body=controlDeviceInput(operation,raw),base=guidedServer(server),plan=nativeRequestPlan(base,'poll',body,token,signal);plan.url=new URL(base+nativeControlExecutorRoute+'/'+operation);return plan}
export function nativeControlConnection(server,token){return async(operation,body,signal)=>{const plan=nativeControlRequestPlan(server,operation,body,token,signal),request=plan.url.protocol==='https:'?httpsRequest:httpRequest;return new Promise((resolve,reject)=>{const req=request(plan.url,plan.options,response=>{void readNativeResponse(response).then(resolve,reject)});req.once('error',reject);req.end(plan.bytes)})}}
