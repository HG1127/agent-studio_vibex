import {request as httpsRequest} from 'node:https'
import {request as httpRequest} from 'node:http'
import {nativeRequestPlan,readNativeResponse} from './native-connection.mjs'
import {guidedPair,guidedExecutorRoute,guidedServer} from '../shared/native-guided-contract.mjs'
export function guidedRequestPlan(server,operation,body,signal){if(!['pair','pair-confirm'].includes(operation))throw Error('native_guided_operation_refused');const plan=nativeRequestPlan(guidedServer(server),'pair',guidedPair(body),undefined,signal);plan.url=new URL(guidedServer(server)+guidedExecutorRoute+'/'+operation);return plan}
export function guidedConnection(server){return async(operation,body,signal)=>{const plan=guidedRequestPlan(server,operation,body,signal),request=plan.url.protocol==='https:'?httpsRequest:httpRequest;return new Promise((resolve,reject)=>{const req=request(plan.url,plan.options,response=>{void readNativeResponse(response).then(resolve,reject)});req.once('error',reject);req.end(plan.bytes)})}}
