// Dedicated model Worker transport configuration. No DB login, provider key,
// credential reads or network calls occur when this module is imported.
import {selectBoundGenerationUat} from "./model-connection-executor.ts"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {createBoundModelMutualTlsClient} from "./bound-model-client.ts"
import {selectPgRuntimeTarget} from "./pg-runtime-target.ts"
import {boundCredentialDirectory,readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import type {request as httpsRequest} from "node:https"

const directory=boundCredentialDirectory("model")
const origin="https://127.0.0.1:7453"
function refuse():never{throw Error("unsafe_bound_worker_transport")}
export function selectBoundModelWorkerMode(
  env:NodeJS.ProcessEnv,uid=process.getuid?.(),platform=process.platform,
):"fixed"|"bound"{
  const enabled=env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED
  const endpoint=env.AGENT_STUDIO_PG_BOUND_DISPATCH_ORIGIN
  const pin=env.AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT
  if(enabled===undefined&&endpoint===undefined&&pin===undefined)return "fixed"
  try{selectBoundGenerationUat(env,true,origin,uid)}catch{refuse()}
  try{if(selectPgRuntimeTarget(env,"worker",platform).mode!=="baota_pg18")refuse()}
  catch{refuse()}
  if(env.AGENT_STUDIO_PG_BAOTA18_ENABLED!=="true"||
     env.CREDENTIALS_DIRECTORY!==directory||endpoint!==origin||
     env.AGENT_STUDIO_PG_WORKER_PASSWORD_FILE!==directory+"/worker.secret")refuse()
  try{boundCertificateFingerprint(pin)}catch{refuse()}
  return "bound"
}
export function createApprovedBoundModelWorkerDispatch(
  env:NodeJS.ProcessEnv,
  dependencies:{uid?:number;platform?:NodeJS.Platform;readCredential?:(name:string)=>Buffer;
    request?:typeof httpsRequest}={},
){
  const uid=dependencies.uid??process.getuid?.()
  if(selectBoundModelWorkerMode(env,uid,dependencies.platform)!=="bound")refuse()
  const read=dependencies.readCredential??(name=>readBoundRuntimeCredential("model",name,env,uid))
  return createBoundModelMutualTlsClient({
    approvedForIsolatedUat:true,origin,
    reviewedServerFingerprint256:env.AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT!,
    ca:read("dispatch-ca.pem"),cert:read("dispatch-worker.pem"),key:read("dispatch-worker.key"),
  },dependencies.request)
}
