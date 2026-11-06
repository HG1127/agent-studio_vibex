// Pure selection first; credential I/O is explicit and occurs only after all
// independent review/operator gates. Import/plan/help never touch files.
import {lstatSync,realpathSync,accessSync,openSync,fstatSync,readFileSync,closeSync,constants} from "node:fs"
import {X509Certificate,createPrivateKey,timingSafeEqual} from "node:crypto"
import {selectAgentDesignServiceOptIn} from "./agent-design-runtime-policy.ts"
import {agentAssessmentApproval} from "./agent-assessment-contract.ts"
import {selectPgRuntimeTarget} from "./pg-runtime-target.ts"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {assertBoundDispatchTlsMaterial} from "./bound-tls-material.ts"
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {selectKnowledgeToolRuntime} from "./knowledge-tool-policy.ts"

export type AgentAssessmentServiceKind="worker"|"broker"
export const agentAssessmentServiceOrigin="https://127.0.0.1:7459"
const names={worker:["worker.secret","review-ca.pem","review-worker.pem","review-worker.key"],broker:["api.secret","dispatch.secret","broker.secret","model-encryption.secret","review-ca.pem","review-server.pem","review-server.key"]} as const
const refuse=():never=>{throw Error("unsafe_agent_assessment_service_config")}
export function agentAssessmentCredentialDirectory(kind:AgentAssessmentServiceKind):string{
  if(kind!=="worker"&&kind!=="broker")return refuse()
  return "/run/credentials/agentstudio-pg18-review-"+kind+".service"
}
export function parseAgentAssessmentServiceArgs(args:string[]):{mode:"plan"|"help"}|{mode:"preflight"|"serve";kind:AgentAssessmentServiceKind}{
  if(args.length===1&&(args[0]==="--plan"||args[0]==="--help"))return {mode:args[0]==="--plan"?"plan":"help"}
  if(args.length===2&&(args[0]==="--preflight"||args[0]==="--serve")&&(args[1]==="worker"||args[1]==="broker"))return {mode:args[0]==="--serve"?"serve":"preflight",kind:args[1]}
  throw Error("agent_assessment_explicit_mode_required")
}
export function agentAssessmentServiceOfflinePlan(){return {mode:"plan",services:["review-worker","review-broker"],bind:"127.0.0.1",port:7459,default_enabled:false,requires_independent_review_approval:true,requires_mutual_tls:true,worker_new_login_groups:1,broker_independent_database_pools:3,network_used:false,credentials_read:false,db_writes_performed:false,workers_started:false,external_model_calls:false,production_cutover_allowed:false}}
export function agentAssessmentServiceHelp(){return {usage:["node --experimental-strip-types src/agent-assessment-service.ts --plan","node --experimental-strip-types src/agent-assessment-service.ts --help","node --experimental-strip-types src/agent-assessment-service.ts --preflight worker|broker","node --experimental-strip-types src/agent-assessment-service.ts --serve worker|broker"],default_enabled:false,preflight_requires_separate_review_approval:true,preflight_read_only:true,production_cutover_allowed:false}}
function loginName(raw:unknown,fallback:string):string{
  const name=raw===undefined?fallback:raw
  if(typeof name!=="string"||!/^[a-z][a-z0-9_]{0,62}$/.test(name)||["postgres","agentstudio_stage_login","agentstudio_stage_worker","agentstudio_worker_login","agentstudio_prepare_worker_login","agentstudio_model_worker_login","agentstudio_native_auth_login","agentstudio_model_broker_login","agentstudio_bound_dispatch_login","agentstudio_api","agentstudio_review_worker","agentstudio_review_dispatch"].includes(name))return refuse()
  return name
}
export function agentAssessmentServiceConfig(env:NodeJS.ProcessEnv,kind:AgentAssessmentServiceKind,mode:"preflight"|"serve",platform=process.platform,uid=process.getuid?.()){
  // Even preflight must refuse before opening a credential, importing pg,
  // constructing a Pool/executor or creating a listener without exact consent.
  if(env.AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED!=="true"||env.AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED!==agentAssessmentApproval)throw Error("agent_assessment_service_not_approved")
  if(kind!=="worker"&&kind!=="broker"||mode!=="preflight"&&mode!=="serve"||platform!=="linux"||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||env.AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED!=="true"||env.CREDENTIALS_DIRECTORY!==agentAssessmentCredentialDirectory(kind)||env.AGENT_STUDIO_PG_REVIEW_ORIGIN!==agentAssessmentServiceOrigin||env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined||env.NODE_EXTRA_CA_CERTS!==undefined)return refuse()
  const design=selectAgentDesignServiceOptIn(env)
  const target=selectPgRuntimeTarget(env,"api",platform)
  if(target.mode!=="baota_pg18")return refuse()
  let server:Buffer,client:Buffer
  try{server=boundCertificateFingerprint(env.AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT);client=boundCertificateFingerprint(env.AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT)}catch{return refuse()}
  if(timingSafeEqual(server,client))return refuse()
  const workerLogin=loginName(env.AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN,"agentstudio_review_worker_login"),dispatchLogin=loginName(env.AGENT_STUDIO_PG_REVIEW_DISPATCH_LOGIN,"agentstudio_review_dispatch_login")
  if(workerLogin===dispatchLogin)return refuse()
  const designWorkerLogin="agentstudio_design_worker_login",designDispatchLogin="agentstudio_design_dispatch_login"
  if(design&&[workerLogin,dispatchLogin].some(login=>login===designWorkerLogin||login===designDispatchLogin))return refuse()
  return {kind,mode,target,design,designWorkerLogin,designDispatchLogin,directory:agentAssessmentCredentialDirectory(kind),uid,origin:agentAssessmentServiceOrigin,port:7459 as const,workerLogin,dispatchLogin,serverFingerprint:server.toString("hex"),clientFingerprint:client.toString("hex"),knowledgeSharing:selectKnowledgeSharing(env),knowledgeTools:selectKnowledgeToolRuntime(env)}
}
export type AgentAssessmentServiceConfig=ReturnType<typeof agentAssessmentServiceConfig>
export type AgentAssessmentCredentialFileSystem=Pick<typeof import("node:fs"),"lstatSync"|"realpathSync"|"accessSync"|"openSync"|"fstatSync"|"readFileSync"|"closeSync">
const credentialFiles:AgentAssessmentCredentialFileSystem={lstatSync,realpathSync,accessSync,openSync,fstatSync,readFileSync,closeSync}
export function inspectAgentAssessmentCredential(config:AgentAssessmentServiceConfig,name:string,files:AgentAssessmentCredentialFileSystem=credentialFiles){
  const allowed:readonly string[]=[...names[config.kind],...(config.design?[config.kind==="worker"?"design-worker.secret":"design-dispatch.secret"]:[])]
  if(!allowed.includes(name)||config.directory!==agentAssessmentCredentialDirectory(config.kind)||config.uid<=0)return refuse()
  const file=config.directory+"/"+name
  try{
    const folder=files.lstatSync(config.directory),stat=files.lstatSync(file),mode=stat.mode&0o7777
    if(!folder.isDirectory()||folder.isSymbolicLink()||(folder.mode&0o022)!==0||![0,config.uid].includes(folder.uid)||files.realpathSync(file)!==file||!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>65536||
      !(stat.uid===config.uid&&(mode===0o400||mode===0o600))&&!(stat.uid===0&&stat.gid===0&&mode===0o440))throw Error()
    files.accessSync(file,constants.R_OK);return {file,stat}
  }catch{throw Error("unsafe_agent_assessment_credential")}
}
export function readAgentAssessmentCredential(config:AgentAssessmentServiceConfig,name:string,files:AgentAssessmentCredentialFileSystem=credentialFiles):Buffer{
  const {file,stat}=inspectAgentAssessmentCredential(config,name,files);let fd:number|undefined,data:Buffer|undefined
  try{
    fd=files.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW)
    const opened=files.fstatSync(fd)
    if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size||opened.mode!==stat.mode||opened.uid!==stat.uid||opened.gid!==stat.gid)throw Error()
    data=files.readFileSync(fd)
    const after=files.fstatSync(fd),current=files.lstatSync(file)
    if(data.length!==stat.size||after.dev!==stat.dev||after.ino!==stat.ino||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.mode!==stat.mode||after.uid!==stat.uid||after.gid!==stat.gid||current.dev!==stat.dev||current.ino!==stat.ino||current.size!==stat.size||current.mtimeMs!==stat.mtimeMs||current.mode!==stat.mode||current.uid!==stat.uid||current.gid!==stat.gid||current.isSymbolicLink())throw Error()
    return data
  }catch{data?.fill(0);throw Error("unsafe_agent_assessment_credential")}finally{if(fd!==undefined)try{files.closeSync(fd)}catch{data?.fill(0);throw Error("unsafe_agent_assessment_credential")}}
}
export function agentAssessmentDatabasePassword(bytes:Buffer):string{
  const value=bytes.toString("utf8").replace(/\r?\n$/,"")
  if(value.length<32||value.length>512||/[\u0000-\u0020\u007f]/u.test(value)||/^(.)\1+$/u.test(value))throw Error("unsafe_agent_assessment_credential")
  return value
}
export function assertAgentAssessmentServiceTls(config:AgentAssessmentServiceConfig,ca:Buffer,cert:Buffer,key:Buffer,now=Date.now()):void{
  try{
    const leaf=new X509Certificate(cert),expected=boundCertificateFingerprint(config.kind==="worker"?config.clientFingerprint:config.serverFingerprint)
    if(!timingSafeEqual(expected,boundCertificateFingerprint(leaf.fingerprint256)))throw Error()
    if(config.kind==="broker"){assertBoundDispatchTlsMaterial(ca,cert,key,now);return}
    const pem=ca.toString("utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    if(!pem?.length)throw Error()
    const roots=pem.map(value=>new X509Certificate(value))
    for(const item of [...roots,leaf])if(!Number.isFinite(Date.parse(item.validFrom))||!Number.isFinite(Date.parse(item.validTo))||Date.parse(item.validFrom)>now||Date.parse(item.validTo)<=now)throw Error()
    if(roots.some(root=>!root.ca)||leaf.ca||!leaf.keyUsage?.includes("1.3.6.1.5.5.7.3.2")||!leaf.checkPrivateKey(createPrivateKey(key))||!roots.some(root=>leaf.verify(root.publicKey)))throw Error()
  }catch{throw Error("unsafe_agent_assessment_tls_material")}
}
