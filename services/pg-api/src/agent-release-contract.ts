// Owner-only full configuration versions are separate from safe description
// collaboration. This contract alone installs no schema or execution route.
import {HttpError,isUuid,safeAgentSpec,type AgentSpecInput} from "./contracts.ts"

type Request={request_id:string}
type Current={expected_spec_revision:number;source_sha256:string}
type Version={version_id:string;version_sha256:string;expected_version_revision:number}
export type AgentReleaseChoice=Request&(
  Current&{action:"snapshot";note:string;test_run_id:string|null}|
  Current&{action:"acceptance";instruction:string;max_steps:number;model_binding:NonNullable<AgentSpecInput["model_binding"]>|null;confirm:true}|
  Current&Version&{action:"publish";expected_release_revision:number;confirm:true;acknowledge_untested:boolean}|
  Current&Version&{action:"restore";confirm:true;reason:string}|
  Version&{action:"delete_draft";confirm:true})
function invalid():never{throw new HttpError(400,"invalid_agent_release_choice")}
function uuid(raw:unknown):string{if(!isUuid(raw))invalid();return raw.toLowerCase()}
function sha(raw:unknown):string{if(typeof raw!=="string"||!/^[a-f0-9]{64}$/.test(raw))invalid();return raw}
function revision(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<1||Number(raw)>=Number.MAX_SAFE_INTEGER)invalid();return Number(raw)}
function text(raw:unknown,min:number,max:number):string{
  if(typeof raw!=="string"||raw.includes("\0")||raw.length>max||raw.trim().length<min)invalid()
  return raw.trim()
}
export function parseAgentReleaseStoredSpec(raw:unknown):{snapshot:Record<string,unknown>;validated:AgentSpecInput}{
  const refuse=():never=>{throw new HttpError(400,"invalid_agent_release_snapshot")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))refuse()
  const value=raw as Record<string,unknown>
  if(value.require_approval!==true)refuse()
  const {require_approval:_,...input}=value
  try{
    const validated=safeAgentSpec(input)
    if(new TextEncoder().encode(JSON.stringify(value)).length>262144)refuse()
    // Validate the native execution shape while retaining the exact stored
    // snapshot. Normalization must not rewrite whitespace or null bindings in
    // an immutable historical version; mutation requests never carry either.
    return {snapshot:structuredClone(value),validated}
  }catch{return refuse()}
}
export function parseAgentReleaseChoice(raw:unknown):AgentReleaseChoice{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const p=raw as Record<string,unknown>,common=["action","request_id"],current=["expected_spec_revision","source_sha256"],version=["version_id","version_sha256","expected_version_revision"]
  const fields:Record<string,string[]>={snapshot:[...current,"note","test_run_id"],acceptance:[...current,"instruction","max_steps","model_binding","confirm"],publish:[...current,...version,"expected_release_revision","confirm","acknowledge_untested"],restore:[...current,...version,"confirm","reason"],delete_draft:[...version,"confirm"]}
  if(typeof p.action!=="string"||!Object.hasOwn(fields,p.action))invalid()
  const keys=[...common,...fields[p.action]!]
  if(Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)))invalid()
  const request_id=uuid(p.request_id)
  const source=()=>({expected_spec_revision:revision(p.expected_spec_revision),source_sha256:sha(p.source_sha256)})
  if(p.action==="snapshot")return {action:"snapshot",request_id,...source(),note:text(p.note,0,500),test_run_id:p.test_run_id===null?null:uuid(p.test_run_id)}
  if(p.confirm!==true)invalid()
  if(p.action==="acceptance"){
    if(!Number.isSafeInteger(p.max_steps)||Number(p.max_steps)<1||Number(p.max_steps)>30)invalid()
    let model_binding:NonNullable<AgentSpecInput["model_binding"]>|null=null
    if(p.model_binding!==null){try{model_binding=safeAgentSpec({goal:"Validate owned acceptance model",model_binding:p.model_binding}).model_binding??invalid()}catch{invalid()}}
    return {action:"acceptance",request_id,...source(),instruction:text(p.instruction,1,2000),max_steps:Number(p.max_steps),model_binding,confirm:true}
  }
  const selected={version_id:uuid(p.version_id),version_sha256:sha(p.version_sha256),expected_version_revision:revision(p.expected_version_revision)}
  if(p.action==="delete_draft")return {action:"delete_draft",request_id,...selected,confirm:true}
  if(p.action==="restore")return {action:"restore",request_id,...source(),...selected,confirm:true,reason:text(p.reason,8,500)}
  if(typeof p.acknowledge_untested!=="boolean")invalid()
  return {action:"publish",request_id,...source(),...selected,expected_release_revision:revision(p.expected_release_revision),confirm:true,acknowledge_untested:p.acknowledge_untested}
}
