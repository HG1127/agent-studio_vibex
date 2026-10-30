// A distinct hosted purpose. Synthetic inventory transport, real Native/SQL
// component composition; this does NOT attest to real provider DNS/TLS traffic.
import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
import {originalLoginReviewedSources} from './pg-original-login-reviewed-sources.mjs'
export const originalModelDraftSyntheticPurpose='YES_DISPOSABLE_ORIGINAL_MODEL_DRAFT_DISCOVERY_ONLY'
export function requireOriginalModelDraftSyntheticCi(env=process.env,platform=process.platform,uid=typeof process.getuid==='function'?process.getuid():-1){
 const target=requireAgentDesignGenuineCi(env,platform,uid),refuse=()=>{throw Error('original_model_draft_synthetic_ci_refused')}
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_CI!==originalModelDraftSyntheticPurpose||env.AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_STORY!=='original-model-draft-discovery'||env.AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))refuse()
 for(const key of ['AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI'])if(Object.hasOwn(env,key))refuse()
 return{target,head:env.GITHUB_SHA,origin:'https://localhost:17443',profile:'original-model-draft-synthetic-inventory',actual_provider_network:false,production_GO:false}
}
async function reviewedSource(permit){
 const [fs,path,url,crypto,child]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process')]),repo=fs.realpathSync(url.fileURLToPath(new URL('../../',import.meta.url)))
 const required=['shared/model-draft-probe-contract.ts','services/pg-api/src/model-draft-discovery-provider.ts','services/pg-api/src/model-draft-probe-repository.ts','services/pg-api/src/model-draft-probe-http.ts','services/pg-api/src/native-server.ts','services/pg-api/src/native-auth-http.mjs','services/pg-api/src/native-config-uat-policy.ts','src/lib/originalModelConnectionsApi.ts','src/lib/originalModelConnections.ts','src/pages/ModelConnections/useModelConnections.ts','src/pages/ModelConnections/usePgModelConnections.ts','src/pages/ModelConnections/ModelConnectionsPage.tsx','src/components/model-connections/ConnectionFormCard.tsx','tests/helpers/original-model-draft-synthetic-host-source.mjs','tests/helpers/original-model-draft-browser-scenario.mjs']
 for(const file of required)if(!/^[a-f0-9]{64}$/.test(originalLoginReviewedSources[file]??''))throw Error('Root_draft_probe_reviewed_source_closure_required')
 const check=()=>{if(child.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()!==permit.head||child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:repo,encoding:'utf8'}).trim()!=='')throw Error('draft_probe_exact_clean_head_required');for(const[file,expected]of Object.entries(originalLoginReviewedSources)){if(!/^[a-zA-Z0-9._/-]+$/.test(file)||file.split('/').some(p=>p==='..'||p==='.'||p===''))throw Error('draft_probe_review_path_refused');let at=repo;for(const part of file.split('/')){if(fs.lstatSync(at).isSymbolicLink())throw Error('draft_probe_review_symlink_refused');at=path.join(at,part)}const stat=fs.lstatSync(at);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16*1024*1024||!fs.realpathSync(at).startsWith(repo+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(at)).digest('hex')!==expected)throw Error('draft_probe_review_source_changed')}}
 check();return check
}
export async function createOriginalModelDraftSyntheticHostSource(fixture,env=process.env){
 const permit=requireOriginalModelDraftSyntheticCi(env),checkSources=await reviewedSource(permit)
 const [{EventEmitter},{PassThrough},{ModelDraftProbeRepository},{createModelDraftDiscoveryProvider},{createModelDraftProbeHttp}]=await Promise.all([import('node:events'),import('node:stream'),import('../../services/pg-api/src/model-draft-probe-repository.ts'),import('../../services/pg-api/src/model-draft-discovery-provider.ts'),import('../../services/pg-api/src/model-draft-probe-http.ts')])
 let calls=0,overflow=false;const observations=[]
 const resolver={resolve4:async()=>['8.8.8.8'],resolve6:async()=>[]}
 const request=(options,callback)=>{
  if(options.protocol!=='https:'||options.method!=='GET'||options.hostname!=='api.openai.com'||options.path!=='/v1/models'||options.rejectUnauthorized!==true||options.agent!==false)throw Error('synthetic_inventory_transport_scope_refused')
  if(calls>=128){overflow=true;throw Error('synthetic_inventory_observation_capacity')};calls++;observations.push({method:'GET',path:'/v1/models',synthetic:true})
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit('error',Error('synthetic_inventory_closed'))
  req.end=()=>queueMicrotask(()=>{const res=new PassThrough();res.statusCode=200;res.headers={'content-type':'application/json'};callback(res);res.end(JSON.stringify({data:[{id:'synthetic-discovered-model-alpha'},{id:'synthetic-discovered-model-beta'}]}))});return req
 }
 const repository=new ModelDraftProbeRepository(fixture.pool,fixture.secretPool,fixture.key,{configurationWrites:true,modelProbeUat:true,transport:createModelDraftDiscoveryProvider(resolver,request)})
 if(repository.protocol!=='native_model_draft_discovery_v1'||repository.enabled!==true)throw Error('synthetic_inventory_component_missing')
 return{permit,repository,
  nativeOptions:{allowConfigurationWrites:true,allowModelProbe:true,originalModelDraftProbeProtocol:repository.protocol},
  createHandler:authenticateRequest=>createModelDraftProbeHttp({repository,allowedOrigin:permit.origin,authenticateRequest}),checkSources,
  inventoryCalls:()=>calls,observations:()=>observations.map(v=>({...v})),
  evidence:()=>({actual_repository:true,actual_original_provider_factory:true,synthetic_DNS_and_request_stream_ports:true,observation_overflow:overflow,provider_DNS_TLS_or_network_acceptance:false,provider_socket_calls:0,paid_external_provider_calls:0,production_GO:false}),
 }
}
