import type {IncomingMessage} from 'node:http'
import {X509Certificate,timingSafeEqual} from 'node:crypto'
import type {Identity,SqlPool} from './contracts.ts'
import {selectBoundGenerationUat} from './model-connection-executor.ts'
import {skillAbExecutionApproval,skillAbExecutionEnabled} from './original-skill-ab-provider.ts'
import {prepareSkillAbPool} from './original-skill-ab-runtime.ts'
import {readSkillAbCredential,assertSkillAbClientMaterial} from './original-skill-ab-credentials.ts'
import {createSkillAbMutualTlsClient,type SkillAbMutualTlsClient} from './original-skill-ab-client.ts'
import {OriginalSkillAbRepository} from './original-skill-ab-repository.ts'
import {createOriginalSkillAbHttp} from './original-skill-ab-http.ts'
import {boundCertificateFingerprint} from './bound-worker-mtls.ts'
export const skillAbNativeApproval='APPROVE_DISPOSABLE_ORIGINAL_SKILL_AB_V1_ONLY' as const
export function selectSkillAbNative(input:{env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string;configurationWrites:boolean;uid?:number}){
 const e=input.env,available=e.AGENT_STUDIO_ORIGINAL_SKILL_AB_AVAILABLE,submissions=e.AGENT_STUDIO_ORIGINAL_SKILL_AB_SUBMISSIONS_ENABLED,approved=e.AGENT_STUDIO_ORIGINAL_SKILL_AB_APPROVED
 if(available===undefined&&submissions===undefined&&approved===undefined)return {available:false,submissions:false}
 let origin=false;try{const u=new URL(input.allowedOrigin);origin=u.protocol==='https:'&&u.origin===input.allowedOrigin}catch{}
 if(available!=='true'||submissions!==undefined&&submissions!=='true'||approved!==skillAbNativeApproval||!input.listen||!origin||!Number.isSafeInteger(input.uid)||input.uid===undefined||input.uid<=0)throw Error('original_skill_ab_native_not_approved')
 if(submissions==='true'){
  if(!input.configurationWrites||e.AGENT_STUDIO_ORIGINAL_SKILL_AB_EXECUTION_ENABLED!=='true'||!skillAbExecutionEnabled({executionEnabled:true,executionApproval:e.AGENT_STUDIO_ORIGINAL_SKILL_AB_EXECUTION_APPROVED}))throw Error('original_skill_ab_execution_not_approved')
  // Retain the existing Native paid-model/config/run-approval gates as well
  // as the additional A/B-specific operator opt-in and employee fee receipt.
  selectBoundGenerationUat(e,input.listen,input.allowedOrigin,input.uid)
 }
 return {available:true,submissions:submissions==='true'}
}
export async function prepareOriginalSkillAbNativeRuntime(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string;configurationWrites:boolean;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;uid?:number}){
 const uid=input.uid??process.getuid?.(),cap=selectSkillAbNative({...input,uid});if(!cap.available)return null
 await prepareSkillAbPool(input.pool,'agentstudio_api')
 let client:SkillAbMutualTlsClient|undefined
 if(cap.submissions){const loaded:Buffer[]=[]
  try{for(const name of ['skill-ab-ca.pem','skill-ab-api.pem','skill-ab-api.key'])loaded.push(readSkillAbCredential('api',name,input.env,uid));const ca=loaded[0]!,cert=loaded[1]!,key=loaded[2]!;assertSkillAbClientMaterial(ca,cert,key)
   const serverFingerprint=input.env.AGENT_STUDIO_ORIGINAL_SKILL_AB_SERVER_FINGERPRINT256??''
   if(timingSafeEqual(boundCertificateFingerprint(serverFingerprint),boundCertificateFingerprint(new X509Certificate(cert).fingerprint256)))throw Error('original_skill_ab_independent_certificates_required')
   client=createSkillAbMutualTlsClient({executionEnabled:true,executionApproval:skillAbExecutionApproval,origin:'https://127.0.0.1:7461',reviewedServerFingerprint256:serverFingerprint,ca,cert,key})
  }finally{for(const b of loaded)b.fill(0)}
 }
 try{const repository=new OriginalSkillAbRepository(input.pool,{allowSubmissions:cap.submissions,client}),handler=createOriginalSkillAbHttp({repository,authenticateRequest:input.authenticateRequest,allowedOrigin:input.allowedOrigin});return Object.freeze({repository,handler,...(client?{close:client.close}:{})})}catch(e){client?.close();throw e}
}
