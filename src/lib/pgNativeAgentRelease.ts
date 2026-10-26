import {parseAgentReleaseChoice,parseAgentReleaseStoredSpec,type AgentReleaseChoice} from "../../services/pg-api/src/agent-release-contract.ts"
import {safeAgentSpec,type AgentSpecInput} from "../../services/pg-api/src/contracts.ts"
export type PgNativeAgentReleaseChoice=AgentReleaseChoice
type Binding=NonNullable<AgentSpecInput["model_binding"]>
export type PgNativeAgentReleaseVersion={id:string;version_no:number;spec_revision:number;source_sha256:string;version_sha256:string;name:string;note:string;
  test_run_id:string|null;test_passed:boolean;test_current:boolean;status:"draft"|"published"|"archived";revision:number;created_at:string;published_at:string|null}
export type PgNativeAcceptanceSummary={run_id:string;spec_revision:number;source_sha256:string;max_steps:number;status:string;created_at:string}
export type PgNativeAgentReleaseWorkspace={spec_id:string;name:string;spec_revision:number;source_sha256:string;release_revision:number;next_version_no:number;active_version_id:string|null;
  versions:PgNativeAgentReleaseVersion[];acceptance_runs:PgNativeAcceptanceSummary[]}
export type PgNativeAgentReleaseDetail=PgNativeAgentReleaseVersion&{spec_id:string;spec_snapshot:Record<string,unknown>;test_model_binding:Binding|null}
export type PgNativeAcceptanceStatus=PgNativeAcceptanceSummary&{spec_id:string;instruction_sha256:string;model_binding:Binding;test_current:boolean}
export type PgNativeAgentReleaseResult={spec_id:string;request_id:string;replayed:boolean;version_id?:string;version_no?:number;version_revision?:number;version_sha256?:string;
  release_revision?:number;source_sha256?:string;spec_revision?:number;status?:string;test_passed?:boolean;already_published?:boolean;restored?:boolean;run_id?:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function invalid():never{throw Error("invalid_pg_native_agent_release_response")}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))invalid();return v as Record<string,unknown>}
function text(v:unknown,max:number):string{if(typeof v!=="string"||v.length>max||v.includes("\0"))invalid();return v}
function id(v:unknown):string{if(typeof v!=="string"||!uuid.test(v))invalid();return v.toLowerCase()}
function positive(v:unknown):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1)invalid();return v}
function hash(v:unknown):string{if(typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))invalid();return v}
function bool(v:unknown):boolean{if(typeof v!=="boolean")invalid();return v}
function date(v:unknown):string{const value=text(v,80);if(!Number.isFinite(Date.parse(value)))invalid();return value}
function array(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)invalid();return v}
function binding(v:unknown):Binding{try{return safeAgentSpec({goal:"Validate acceptance model",model_binding:v}).model_binding??invalid()}catch{invalid()}}
function version(raw:unknown):PgNativeAgentReleaseVersion{
  const v=object(raw),status=v.status
  if(status!=="draft"&&status!=="published"&&status!=="archived")invalid()
  const passed=bool(v.test_passed),current=bool(v.test_current),run=v.test_run_id===null?null:id(v.test_run_id)
  if(current&&!passed||passed&&run===null||(status==="draft")!==(v.published_at===null))invalid()
  return {id:id(v.id),version_no:positive(v.version_no),spec_revision:positive(v.spec_revision),source_sha256:hash(v.source_sha256),version_sha256:hash(v.version_sha256),
    name:text(v.name,120),note:text(v.note,500),test_run_id:run,test_passed:passed,test_current:current,status,revision:positive(v.revision),
    created_at:date(v.created_at),published_at:v.published_at===null?null:date(v.published_at)}
}
function acceptance(raw:unknown):PgNativeAcceptanceSummary{
  const v=object(raw),steps=positive(v.max_steps),status=v.status
  if(steps>30||typeof status!=="string"||!["queued","running","awaiting_approval","paused","succeeded","failed","cancelled"].includes(status))invalid()
  return {run_id:id(v.run_id),spec_revision:positive(v.spec_revision),source_sha256:hash(v.source_sha256),max_steps:steps,status,created_at:date(v.created_at)}
}
export function agentReleaseChoice(raw:unknown):AgentReleaseChoice{return parseAgentReleaseChoice(raw)}
export function agentReleaseWorkspace(raw:unknown,expected:string):PgNativeAgentReleaseWorkspace{
  const v=object(raw);if(id(v.spec_id)!==expected.toLowerCase())invalid()
  return {spec_id:id(v.spec_id),name:text(v.name,120),spec_revision:positive(v.spec_revision),source_sha256:hash(v.source_sha256),release_revision:positive(v.release_revision),
    next_version_no:positive(v.next_version_no),active_version_id:v.active_version_id===null?null:id(v.active_version_id),versions:array(v.versions,100).map(version),acceptance_runs:array(v.acceptance_runs,10).map(acceptance)}
}
export function agentReleaseDetail(raw:unknown,spec:string,expected:string):PgNativeAgentReleaseDetail{
  const v=object(raw),item=version(raw)
  if(id(v.spec_id)!==spec.toLowerCase()||item.id!==expected.toLowerCase())invalid()
  return {...item,spec_id:id(v.spec_id),spec_snapshot:parseAgentReleaseStoredSpec(v.spec_snapshot).snapshot,test_model_binding:v.test_model_binding===null?null:binding(v.test_model_binding)}
}
export function agentReleaseAcceptanceStatus(raw:unknown,spec:string,expected:string):PgNativeAcceptanceStatus{
  const v=object(raw),item=acceptance(raw)
  if(id(v.spec_id)!==spec.toLowerCase()||item.run_id!==expected.toLowerCase())invalid()
  return {...item,spec_id:id(v.spec_id),instruction_sha256:hash(v.instruction_sha256),model_binding:binding(v.model_binding),test_current:bool(v.test_current)}
}
export function agentReleaseResult(raw:unknown,spec:string,choice:AgentReleaseChoice):PgNativeAgentReleaseResult{
  const v=object(raw),out:PgNativeAgentReleaseResult={spec_id:id(v.spec_id),request_id:id(v.request_id),replayed:bool(v.replayed)}
  if(out.spec_id!==spec.toLowerCase()||out.request_id!==choice.request_id)invalid()
  if(choice.action==="acceptance"){
    if(v.status!=="queued"||hash(v.source_sha256)!==choice.source_sha256||positive(v.spec_revision)!==choice.expected_spec_revision)invalid()
    return {...out,run_id:id(v.run_id),status:"queued",source_sha256:hash(v.source_sha256),spec_revision:positive(v.spec_revision)}
  }
  out.version_id=id(v.version_id);out.version_sha256=hash(v.version_sha256)
  if(choice.action!=="snapshot"&&(out.version_id!==choice.version_id||out.version_sha256!==choice.version_sha256))invalid()
  if(choice.action==="restore"){
    if(v.restored!==true||positive(v.spec_revision)!==choice.expected_spec_revision+1)invalid()
    return {...out,restored:true,spec_revision:positive(v.spec_revision),source_sha256:hash(v.source_sha256)}
  }
  out.version_no=positive(v.version_no);out.version_revision=positive(v.version_revision);out.release_revision=positive(v.release_revision)
  const expected=choice.action==="snapshot"?"draft":choice.action==="publish"?"published":"deleted"
  if(v.status!==expected)invalid();out.status=expected
  if(choice.action==="snapshot"){
    if(out.version_revision!==1||hash(v.source_sha256)!==choice.source_sha256||bool(v.test_passed)!==(choice.test_run_id!==null))invalid()
    out.source_sha256=hash(v.source_sha256);out.test_passed=bool(v.test_passed)
  }
  if(choice.action==="publish"){
    out.already_published=bool(v.already_published)
    const increment=out.already_published?0:1
    if(out.version_revision!==choice.expected_version_revision+increment||out.release_revision!==choice.expected_release_revision+increment||hash(v.source_sha256)!==choice.source_sha256)invalid()
    out.source_sha256=hash(v.source_sha256)
  }
  if(choice.action==="delete_draft"&&out.version_revision!==choice.expected_version_revision+1)invalid()
  return out
}
