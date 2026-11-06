// Fixed original application ABI. These definitions/data do not grant authority.
import {X509Certificate,timingSafeEqual} from 'node:crypto'
import {boundCertificateFingerprint} from './bound-worker-mtls.ts'
import {selectWorkflowV2ModelExecution,workflowV2ModelRoute} from './workflow-v2-model-contract.ts'
import {selectWorkflowV2ToolExecution,workflowV2ToolRoute} from './workflow-v2-tool-contract.ts'
import {selectAutonomousAgentExecution} from './durable-v2-root.ts'
export const finalCompanionFail=code=>{throw Error('full069_final_companion_'+code)}
export const finalCompanionFreeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))finalCompanionFreeze(x);Object.freeze(v)}return v}
export const finalCompanionDefinitions=finalCompanionFreeze([
 {id:'bound_broker',entry:'bound-dispatch-server.ts',args:['--serve'],preflight_args:['--preflight'],unit:'agentstudio-pg18-dispatch.service',origin:'https://127.0.0.1:7453',credential_keys:['api','identity','broker'],design_enabled:false,server_leaf:'dispatch-server.pem',client_worker:'model',client_leaves:['dispatch-ca.pem','dispatch-worker.pem','dispatch-worker.key'],pin_env:'AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT',preflight:{mode:'preflight',ready:true,verified_roles:3,tls_material_verified:true,writes_performed:false,port_opened:false,external_model_calls:false,production_cutover_allowed:false}},
 {id:'knowledge_broker',entry:'knowledge-index-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-knowledge-index-broker.service',origin:'https://127.0.0.1:7455',credential_keys:['index_broker','broker'],design_enabled:false,server_leaf:'dispatch-server.pem',client_worker:'knowledge',client_leaves:['dispatch-ca.pem','dispatch-worker.pem','dispatch-worker.key'],pin_env:'AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT',preflight:{mode:'preflight',kind:'broker',roles_verified:true,credentials_read:true,network_used:true,provider_calls:false,workers_started:false,production_cutover_allowed:false}},
 {id:'review_broker',entry:'agent-assessment-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-review-broker.service',origin:'https://127.0.0.1:7459',credential_keys:['api','review_dispatch','broker','design_dispatch'],design_enabled:true,server_leaf:'review-server.pem',client_worker:'assessment',client_leaves:['review-ca.pem','review-worker.pem','review-worker.key'],pin_env:'AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT',preflight:{mode:'preflight',service:'broker',ready:true,read_only:true,verified_roles:6,design_enabled:true,tls_material_verified:true,encryption_key_loaded:false,db_writes_performed:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}},
 {id:'plan_workflow_worker',entry:'agent-plan-workflow-service.ts',args:['--serve','worker'],preflight_args:['--preflight','worker'],unit:'agentstudio-pg18-plan-workflow-worker.service',origin:null,credential_keys:['plan_workflow_worker'],design_enabled:false,server_leaf:null,client_worker:null,client_leaves:[],pin_env:null,preflight:{mode:'preflight',service:'worker',ready:true,verified_roles:1,read_only:true,tls_material_verified:true,encryption_key_loaded:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}},
 {id:'plan_workflow_broker',entry:'agent-plan-workflow-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-plan-workflow-broker.service',origin:null,credential_keys:['api','plan_workflow_dispatch','broker'],design_enabled:false,server_leaf:'plan-workflow-server.pem',client_worker:'plan_workflow_worker',client_leaves:['plan-workflow-ca.pem','plan-workflow-worker.pem','plan-workflow-worker.key'],pin_env:'AGENT_STUDIO_PG_PLAN_WORKFLOW_CLIENT_FINGERPRINT',preflight:{mode:'preflight',service:'broker',ready:true,verified_roles:3,read_only:true,tls_material_verified:true,encryption_key_loaded:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}},
])
export const finalCompanionIdentities=finalCompanionFreeze(finalCompanionDefinitions.map((d,i)=>({id:d.id,uid:61021+i,gid:61021+i,groups:[]})))
export function finalCompanionIdentityMatches(s){const expected=finalCompanionIdentities.find(d=>d.id===s?.id);return !!expected&&s.uid===expected.uid&&s.gid===expected.gid&&Array.isArray(s.groups)&&s.groups.length===0}
export function finalCompanionFingerprint(raw){try{return boundCertificateFingerprint(raw)}catch{finalCompanionFail('transport_pin')}}
export const finalCompanionStartOrder=Object.freeze(['bound_broker','knowledge_broker','review_broker','plan_workflow_broker','plan_workflow_worker'])
export const finalCompanionStopOrder=Object.freeze([...finalCompanionStartOrder].reverse())
export const finalCompanionBudgets=Object.freeze({preflight_ms:45000,start_ms:45000,TLS_ms:4000,drain_ms:70000,force_ms:5000,max_output_bytes:65536})
const mountLeaves={bound_broker:['api.secret','identity.secret','broker.secret','model-encryption.secret','dispatch-ca.pem','dispatch-server.pem','dispatch-server.key'],knowledge_broker:['index.secret','broker.secret','model-encryption.secret','dispatch-ca.pem','dispatch-server.pem','dispatch-server.key'],review_broker:['api.secret','dispatch.secret','broker.secret','design-dispatch.secret','model-encryption.secret','review-ca.pem','review-server.pem','review-server.key'],plan_workflow_worker:['worker.secret','plan-workflow-ca.pem','plan-workflow-worker.pem','plan-workflow-worker.key'],plan_workflow_broker:['api.secret','dispatch.secret','broker.secret','model-encryption.secret','plan-workflow-ca.pem','plan-workflow-server.pem','plan-workflow-server.key']}
export function finalCompanionOwnData(raw,keys){if(!raw||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==keys.length)finalCompanionFail('closed_data');const d=Object.getOwnPropertyDescriptors(raw);for(const k of Reflect.ownKeys(raw))if(typeof k!=='string'||!keys.includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value'))finalCompanionFail('closed_data');return raw}
export function checkFinalCompanionOriginalPreflight(id,value){const d=finalCompanionDefinitions.find(x=>x.id===id)??finalCompanionFail('entry');finalCompanionOwnData(value,Object.keys(d.preflight));if(Object.entries(d.preflight).some(([k,v])=>value[k]!==v))finalCompanionFail('preflight_report');return true}
export function checkFinalCompanionSpecs(specs,base){
 if(!Array.isArray(specs)||specs.length!==5||!base?.profile||!Array.isArray(base.profile.workers))finalCompanionFail('spec_set')
 if(!Array.isArray(base.rootProfile?.writers?.boot_uids)||!Array.isArray(base.rootProfile.writers.groups))finalCompanionFail('writer_policy')
 const oldUids=new Set([0,base.profile.native.uid,...base.profile.workers.map(w=>w.uid),...base.rootProfile.writers.boot_uids]),forbiddenGroups=new Set([0,base.profile.native.gid,...(base.profile.native.groups??[]),...base.profile.workers.flatMap(w=>[w.gid,...(w.groups??[])]),...base.rootProfile.writers.groups.map(g=>g.gid)]),seen=new Set()
 for(const[s,d]of specs.map((s,i)=>[s,finalCompanionDefinitions[i]])){
  if(!s||s.id!==d.id||s.entry!==d.entry||s.unit!==d.unit||s.credential_directory!=='/run/credentials/'+d.unit||JSON.stringify(s.args)!==JSON.stringify(d.args)||JSON.stringify(s.preflight_args)!==JSON.stringify(d.preflight_args)||JSON.stringify(s.credential_keys)!==JSON.stringify(d.credential_keys)||s.design_enabled!==d.design_enabled||d.origin!==null&&s.origin!==d.origin||!finalCompanionIdentityMatches(s)||forbiddenGroups.has(s.gid)||oldUids.has(s.uid)||seen.has(s.uid)||!Array.isArray(s.mounts)||!s.environment)finalCompanionFail('fixed_spec')
  let u;try{u=new URL(s.origin)}catch{finalCompanionFail('origin')};if(u.origin!==s.origin||u.protocol!=='https:'||u.hostname!=='127.0.0.1'||u.username||u.password||!Number.isInteger(Number(u.port))||Number(u.port)<1024||Number(u.port)>65535||d.origin===null&&[5333,5432,7402,7403,7453,7455,7459,17403,17443].includes(Number(u.port)))finalCompanionFail('origin')
  if(s.id==='review_broker'&&(s.environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED!=='true'||s.environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_APPROVED!=='APPROVE_DISPOSABLE_PG18_AGENT_DESIGN_EXECUTION_ONLY'))finalCompanionFail('design_required')
  if(s.mounts.some(m=>!m||typeof m.source!=='string'||!m.source.startsWith('/')||!/^[-a-z0-9.]+$/.test(m.leaf)||!/^[a-f0-9]{64}$/.test(m.sha256))||new Set(s.mounts.map(m=>m.leaf)).size!==s.mounts.length||JSON.stringify(s.mounts.map(m=>m.leaf).sort())!==JSON.stringify([...mountLeaves[s.id]].sort()))finalCompanionFail('mount_spec')
  if(s.environment.AGENT_STUDIO_PG_HOST!=='127.0.0.1'||s.environment.AGENT_STUDIO_PG_PORT!=='5333'||s.environment.AGENT_STUDIO_PG_DATABASE!=='agent_studio'||s.environment.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED!==undefined)finalCompanionFail('environment_target')
  seen.add(s.uid)
 }
 if(specs[3].origin!==specs[4].origin)finalCompanionFail('F05_origin');finalCompanionTlsRoutes(specs,base);return true
}
// Effective original client transports, including optional Workflow/Agent
// clients that use different Bound peer pins. This is configuration data only.
export function finalCompanionTlsRoutes(specs,base){
 const rows=[],pin=raw=>finalCompanionFingerprint(raw).toString('hex'),broker=id=>{const found=specs.filter(s=>s.id===id);if(found.length!==1)finalCompanionFail('transport_profile');return found[0]},worker=id=>{const found=base.profile.workers.filter(s=>s.id===id);if(found.length!==1||!found[0].environment)finalCompanionFail('transport_profile');return found[0]},absent='/__full069_companion_readiness__'
 const add=(brokerId,clientId,source,leaves,serverEnv,peerEnv,clientOrigin,serverOwn=null,clientOwn=null,safePath=absent)=>{
  const b=broker(brokerId),c=source==='companion'?broker(clientId):worker(clientId),be=b.environment,ce=c.environment
  if(clientOrigin!==b.origin||!be||!ce)finalCompanionFail('transport_origin')
  const serverPin=pin(ce[serverEnv]),clientPin=pin(be[peerEnv]),serverSelf=serverOwn===null?null:pin(be[serverOwn]),clientSelf=clientOwn===null?null:pin(ce[clientOwn])
  if(serverSelf!==null&&serverSelf!==serverPin||clientSelf!==null&&clientSelf!==clientPin)finalCompanionFail('transport_cross_pin')
  rows.push({broker_id:brokerId,client_id:clientId,client_source:source,origin:b.origin,server_leaf:finalCompanionDefinitions.find(d=>d.id===brokerId).server_leaf,client_leaves:[...leaves],server_pin:serverPin,client_pin:clientPin,server_self_pin:serverSelf,client_self_pin:clientSelf,safe_path:safePath})
 }
 const model=worker('model');add('bound_broker','model','base',['dispatch-ca.pem','dispatch-worker.pem','dispatch-worker.key'],'AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT','AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT',model.environment.AGENT_STUDIO_PG_BOUND_DISPATCH_ORIGIN)
 const bound=broker('bound_broker');let serverModel,serverTools,serverAgent
 try{serverModel=selectWorkflowV2ModelExecution(bound.environment);serverTools=selectWorkflowV2ToolExecution(bound.environment);serverAgent=selectAutonomousAgentExecution(bound.environment)}catch{finalCompanionFail('transport_opt_in')}
 for(const id of ['workflow_v2','agent_autonomous']){
  const c=worker(id);let models,tools,agent
  try{models=selectWorkflowV2ModelExecution(c.environment);tools=selectWorkflowV2ToolExecution(c.environment);agent=selectAutonomousAgentExecution(c.environment)}catch{finalCompanionFail('transport_opt_in')}
  if(!models&&!tools)continue
  if(models&&!serverModel||tools&&!serverTools||id==='agent_autonomous'&&(!agent||!serverAgent))finalCompanionFail('transport_handler_disabled')
  add('bound_broker',id,'base',['dispatch-ca.pem',id==='agent_autonomous'?'dispatch-agent.pem':'dispatch-workflow.pem',id==='agent_autonomous'?'dispatch-agent.key':'dispatch-workflow.key'],'AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT',id==='agent_autonomous'?'AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT':'AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT','https://127.0.0.1:7453',null,null,models?workflowV2ModelRoute:workflowV2ToolRoute)
 }
 add('knowledge_broker','knowledge','base',['dispatch-ca.pem','dispatch-worker.pem','dispatch-worker.key'],'AGENT_STUDIO_PG_KNOWLEDGE_INDEX_SERVER_FINGERPRINT','AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT','https://127.0.0.1:7455')
 const assessment=worker('assessment'),review=broker('review_broker')
 if(assessment.environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED!=='true'||assessment.environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_APPROVED!==review.environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_APPROVED||review.environment.AGENT_STUDIO_PG_REVIEW_ORIGIN!==review.origin)finalCompanionFail('transport_review_design')
 add('review_broker','assessment','base',['review-ca.pem','review-worker.pem','review-worker.key'],'AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT','AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT',assessment.environment.AGENT_STUDIO_PG_REVIEW_ORIGIN,'AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT','AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT')
 const f05=broker('plan_workflow_worker'),f05Broker=broker('plan_workflow_broker')
 if(f05.environment.AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN!==f05.origin||f05Broker.environment.AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN!==f05Broker.origin)finalCompanionFail('transport_F05_origin')
 add('plan_workflow_broker','plan_workflow_worker','companion',['plan-workflow-ca.pem','plan-workflow-worker.pem','plan-workflow-worker.key'],'AGENT_STUDIO_PG_PLAN_WORKFLOW_SERVER_FINGERPRINT','AGENT_STUDIO_PG_PLAN_WORKFLOW_CLIENT_FINGERPRINT',f05.environment.AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN,'AGENT_STUDIO_PG_PLAN_WORKFLOW_SERVER_FINGERPRINT','AGENT_STUDIO_PG_PLAN_WORKFLOW_CLIENT_FINGERPRINT')
 // Bound's three peer identities are deliberately independent in its original ABI.
 const boundPeers=rows.filter(r=>r.broker_id==='bound_broker').map(r=>r.client_pin);if(new Set(boundPeers).size!==boundPeers.length)finalCompanionFail('transport_peer_alias')
 return finalCompanionFreeze(rows)
}
// Pure certificate PIN comparison. Readiness still requires the original CLI
// plus actual mTLS. Only the private supervisor reads these actual mount bytes.
export function checkFinalCompanionCertificatePins(route,serverCertificate,clientCertificate){
 let server,client;try{server=finalCompanionFingerprint(new X509Certificate(serverCertificate).fingerprint256);client=finalCompanionFingerprint(new X509Certificate(clientCertificate).fingerprint256)}catch{finalCompanionFail('transport_certificate')}
 if(!timingSafeEqual(server,finalCompanionFingerprint(route.server_pin))||!timingSafeEqual(client,finalCompanionFingerprint(route.client_pin))||route.server_self_pin!==null&&!timingSafeEqual(server,finalCompanionFingerprint(route.server_self_pin))||route.client_self_pin!==null&&!timingSafeEqual(client,finalCompanionFingerprint(route.client_self_pin))||timingSafeEqual(server,client))finalCompanionFail('transport_certificate_pin')
 return finalCompanionFreeze({server_pin:server.toString('hex'),client_pin:client.toString('hex')})
}
// Host allocation data only; canonical kernel checks read real root-owned files.
export function checkFinalCompanionHostAllocation(specs,passwd,group){
 if(!Array.isArray(specs)||specs.length!==5||specs.some((s,i)=>s.id!==finalCompanionIdentities[i].id||!finalCompanionIdentityMatches(s))||typeof passwd!=='string'||typeof group!=='string'||passwd.includes('\0')||group.includes('\0'))finalCompanionFail('host_identity_policy')
 const uids=new Set(specs.map(s=>s.uid)),gids=new Set(specs.map(s=>s.gid))
 for(const line of passwd.split(/\r?\n/).filter(l=>l&&!l.startsWith('#'))){const f=line.split(':');if(f.length!==7||!/^\d+$/.test(f[2])||!/^\d+$/.test(f[3]))finalCompanionFail('host_account_format');if(uids.has(Number(f[2]))||gids.has(Number(f[3])))finalCompanionFail('host_identity_collision')}
 for(const line of group.split(/\r?\n/).filter(l=>l&&!l.startsWith('#'))){const f=line.split(':');if(f.length!==4||!/^\d+$/.test(f[2]))finalCompanionFail('host_group_format');if(gids.has(Number(f[2])))finalCompanionFail('host_identity_collision')}
 return true
}
// Only known UID-specific jumps may precede a companion jump. Unknown broad
// accepts, ambiguous owner ranges, extra chain rules and extra ports refuse.
export function inspectFinalCompanionNetworkPolicy(text,specs,family){
 if(typeof text!=='string'||![4,6].includes(family))finalCompanionFail('network_policy')
 const sections=text.split(/\r?\n/),start=sections.indexOf('*filter'),end=sections.indexOf('COMMIT',start+1);if(start<0||end<0)finalCompanionFail('network_policy');const lines=sections.slice(start+1,end).filter(l=>l.startsWith('-A ')),outputs=lines.filter(l=>l.startsWith('-A OUTPUT '))
 for(const s of specs){
  const chain='ASFC'+s.uid,jump='-A OUTPUT -m owner --uid-owner '+s.uid+' -j '+chain,at=outputs.indexOf(jump)
  if(at<0||outputs.filter(l=>l===jump).length!==1||outputs.slice(0,at).some(l=>{const m=/^-A OUTPUT -m owner --uid-owner ([1-9][0-9]*)(?: -m comment --comment (?:"[A-Za-z0-9_-]{1,160}"|[A-Za-z0-9_-]{1,160}))? -j [A-Za-z0-9_-]+$/.exec(l);return !m||Number(m[1])===s.uid}))finalCompanionFail('network_order')
  const rules=lines.filter(l=>l.startsWith('-A '+chain+' ')),reject='-A '+chain+' -j REJECT --reject-with '+(family===4?'icmp-port-unreachable':'icmp6-port-unreachable')
  if(family===6){if(JSON.stringify(rules)!==JSON.stringify([reject]))finalCompanionFail('network_rules');continue}
  const state='-A '+chain+' -m conntrack --ctstate ',first=rules[0];if(!first?.startsWith(state)||!first.endsWith(' -j ACCEPT')||first.slice(state.length,-' -j ACCEPT'.length).split(',').sort().join(',')!=='ESTABLISHED,RELATED')finalCompanionFail('network_rules')
  const ports=[5333,...(s.id==='plan_workflow_worker'?[Number(new URL(s.origin).port)]:[])],wanted=ports.map(p=>'-A '+chain+' -d 127.0.0.1/32 -p tcp -m tcp --dport '+p+' -j ACCEPT')
  if(rules.at(-1)!==reject||JSON.stringify(rules.slice(1,-1).sort())!==JSON.stringify(wanted.sort()))finalCompanionFail('network_rules')
 }
 return true
}
