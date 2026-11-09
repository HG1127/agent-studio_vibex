import {agentReleaseChoice,agentReleaseWorkspace,agentReleaseDetail,agentReleaseAcceptanceStatus,agentReleaseResult,type PgNativeAgentReleaseChoice,type PgNativeAgentReleaseWorkspace,type PgNativeAgentReleaseDetail,type PgNativeAgentReleaseResult} from './pgNativeAgentRelease.ts'
import {originalVersionReleaseProtocol,releaseObject,releaseId,releaseHash,releaseRevision,releaseFail,parseOriginalReleaseIntent,type OriginalReleaseIntent} from '../../shared/original-version-release-contract.ts'
export type {OriginalReleaseIntent,PgNativeAgentReleaseChoice,PgNativeAgentReleaseWorkspace,PgNativeAgentReleaseDetail,PgNativeAgentReleaseResult}
export const releaseStorageKey=(employee:string)=>'agent-studio:original-version-release:v1:'+releaseId(employee)
export function releaseEnvelope(raw:unknown,employee:string){const v=releaseObject(raw,['protocol','owner_user_id','item']);if(v.protocol!==originalVersionReleaseProtocol||v.owner_user_id!==releaseId(employee))return releaseFail();return v.item}
export function parseReleaseWorkspace(raw:unknown,employee:string,spec:string){
 const v=releaseObject(releaseEnvelope(raw,employee),['workspace','history_complete','history_limit','acceptance_limit']);if(v.history_complete!==false||v.history_limit!==100||v.acceptance_limit!==10)return releaseFail()
 const out=agentReleaseWorkspace(v.workspace,spec),ids=new Set<string>(),numbers=new Set<number>();let previous=Infinity,published=0
 for(const row of out.versions){if(ids.has(row.id)||numbers.has(row.version_no)||row.version_no>=previous||row.version_no>=out.next_version_no)return releaseFail();ids.add(row.id);numbers.add(row.version_no);previous=row.version_no;if(row.status==='published'){published++;if(row.id!==out.active_version_id)return releaseFail()}}
 if(published>1||out.active_version_id===null&&published)return releaseFail();if(new Set(out.acceptance_runs.map(r=>r.run_id)).size!==out.acceptance_runs.length)return releaseFail()
 return out
}
export function parseReleaseDetail(raw:unknown,employee:string,spec:string,version:string){return agentReleaseDetail(releaseEnvelope(raw,employee),spec,version)}
export function parseReleaseAcceptance(raw:unknown,employee:string,spec:string,run:string){return agentReleaseAcceptanceStatus(releaseEnvelope(raw,employee),spec,run)}
export function parseReleaseAcknowledgement(raw:unknown,employee:string,spec:string,choice:PgNativeAgentReleaseChoice){return agentReleaseResult(releaseEnvelope(raw,employee),spec,choice)}
/** Same property order as AgentReleaseRepository.change's fingerprint. */
export async function prepareReleaseIntent(employee:string,spec:string,choice:PgNativeAgentReleaseChoice,now=Date.now(),digest=(bytes:Uint8Array)=>crypto.subtle.digest('SHA-256',bytes as BufferSource)){
 choice=agentReleaseChoice(choice)
 const bytes=new TextEncoder().encode(JSON.stringify({spec_id:releaseId(spec),...choice})),hash=Array.from(new Uint8Array(await digest(bytes)),v=>v.toString(16).padStart(2,'0')).join('')
 return parseOriginalReleaseIntent({format:originalVersionReleaseProtocol,employee_id:employee,spec_id:spec,action:choice.action,request_id:choice.request_id,request_sha256:hash,created_at:now,
 expected_spec_revision:'expected_spec_revision'in choice?choice.expected_spec_revision:null,source_sha256:'source_sha256'in choice?choice.source_sha256:null,version_id:'version_id'in choice?choice.version_id:null,
 version_sha256:'version_sha256'in choice?choice.version_sha256:null,expected_version_revision:'expected_version_revision'in choice?choice.expected_version_revision:null,expected_release_revision:'expected_release_revision'in choice?choice.expected_release_revision:null,test_linked:choice.action==='snapshot'&&choice.test_run_id!==null},employee,now)
}
export function parseReleaseReceipt(raw:unknown,employee:string,intent:OriginalReleaseIntent):PgNativeAgentReleaseResult{
 const data=releaseObject(releaseEnvelope(raw,employee),['mode','request_sha256','result']);if(data.mode!=='read_only_exact_agent_release_receipt'||releaseHash(data.request_sha256)!==intent.request_sha256)return releaseFail()
 const r=releaseObject(data.result);if(releaseId(r.spec_id)!==intent.spec_id||releaseId(r.request_id)!==intent.request_id||typeof r.replayed!=='boolean')return releaseFail()
 if(intent.action==='acceptance'){if(r.status!=='queued'||releaseRevision(r.spec_revision)!==intent.expected_spec_revision||releaseHash(r.source_sha256)!==intent.source_sha256)return releaseFail();releaseId(r.run_id)}
 else{
  releaseId(r.version_id);releaseHash(r.version_sha256);if(intent.action!=='snapshot'&&(r.version_id!==intent.version_id||r.version_sha256!==intent.version_sha256))return releaseFail()
  if(intent.action==='restore'){if(r.restored!==true||releaseRevision(r.spec_revision)!==intent.expected_spec_revision!+1)return releaseFail();releaseHash(r.source_sha256)}
  else{releaseRevision(r.version_no);releaseRevision(r.version_revision);releaseRevision(r.release_revision);if(r.status!==(intent.action==='snapshot'?'draft':intent.action==='publish'?'published':'deleted'))return releaseFail()
   if(intent.action==='snapshot'&&(r.version_revision!==1||r.source_sha256!==intent.source_sha256||r.test_passed!==intent.test_linked))return releaseFail()
   if(intent.action==='publish'){if(typeof r.already_published!=='boolean'||r.source_sha256!==intent.source_sha256)return releaseFail();const d=r.already_published?0:1;if(r.version_revision!==intent.expected_version_revision!+d||r.release_revision!==intent.expected_release_revision!+d)return releaseFail()}
   if(intent.action==='delete_draft'&&r.version_revision!==intent.expected_version_revision!+1)return releaseFail()
  }
 }
 return structuredClone(r) as PgNativeAgentReleaseResult
}
export const releaseHistoryNotice='当前显示最近100个版本和10条验收记录，历史为部分列表；当前发布版本已按服务端标识另行核对。'
const labels:Record<string,string>={name:'助手名称',test_model_binding:'验收模型绑定',goal:'目标',task_scope:'任务范围',deliverables:'交付物',task_plan:'任务步骤',done_criteria:'完成标准',tools:'工具',model_binding:'模型绑定',http_tools:'HTTP 工具绑定',mcp_tools:'MCP 工具绑定',knowledge_base_ids:'知识库绑定',knowledge_retrieval:'知识检索配置',require_plan_review:'计划确认',require_approval:'逐步审批'}
function canonical(raw:unknown):unknown{if(Array.isArray(raw))return raw.map(canonical);if(raw&&typeof raw==='object')return Object.fromEntries(Object.entries(releaseObject(raw)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return raw}
export function compareReleaseSnapshots(a:Record<string,unknown>,b:Record<string,unknown>){return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().map(key=>{const show=(v:Record<string,unknown>)=>Object.hasOwn(v,key)?JSON.stringify(canonical(v[key]),null,2):'（未设置）',aText=show(a),bText=show(b);return{label:labels[key]??key,aText,bText,changed:aText!==bText}})}
