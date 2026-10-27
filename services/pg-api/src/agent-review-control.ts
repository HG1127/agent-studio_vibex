// Pure consent contract. A control acknowledges a prior review submission;
// parsing never performs erasure, cancellation, billing or provider work.
import {HttpError,isUuid} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"

export type AgentReviewControl={action:"cancel"|"erase";request_id:string;review_id:string;expected_request_sha256:string;confirm:true;request_sha256:string}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_review_control")}
export function parseAgentReviewControl(raw:unknown):AgentReviewControl{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const keys=["action","request_id","review_id","expected_request_sha256","confirm"],v=raw as Record<string,unknown>
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value")))return invalid()
  if(v.action!=="cancel"&&v.action!=="erase"||v.confirm!==true||!isUuid(v.request_id)||!isUuid(v.review_id)||typeof v.expected_request_sha256!=="string"||!/^[a-f0-9]{64}$/.test(v.expected_request_sha256))return invalid()
  const request_id=v.request_id.toLowerCase(),review_id=v.review_id.toLowerCase()
  if(request_id===review_id)return invalid()
  const value:Omit<AgentReviewControl,"request_sha256">={action:v.action,request_id,review_id,expected_request_sha256:v.expected_request_sha256,confirm:true}
  return {...value,request_sha256:agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_control_v1",...value}))}
}
