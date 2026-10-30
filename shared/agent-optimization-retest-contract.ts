// Historical provenance only; these values grant no resource or run authority.
export type OptimizationRetestProof=Readonly<{
  protocol:'agent_optimization_retest_v1';run_id:string;acceptance_request_id:string
  source_run_id:string;spec_id:string;spec_revision:number;source_sha256:string
  feedback_id:string;feedback_sha256:string;after_revision_id:string
}>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash=/^[0-9a-f]{64}$/
export class OptimizationRetestValueError extends Error{
  readonly status=400;readonly code='invalid_optimization_retest'
  constructor(){super('invalid_optimization_retest');this.name='OptimizationRetestValueError'}
}
function bad():never{throw new OptimizationRetestValueError()}
export function optimizationRetestId(value:unknown):string{
  return typeof value==='string'&&uuid.test(value)?value.toLowerCase():bad()
}
export function optimizationRetestProof(raw:unknown,expected:{run_id:string;spec_id:string;spec_revision:number;acceptance_request_id?:string}):OptimizationRetestProof{
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return bad()
  const keys=['protocol','run_id','acceptance_request_id','source_run_id','spec_id','spec_revision','source_sha256','feedback_id','feedback_sha256','after_revision_id']
  const descriptors=Object.getOwnPropertyDescriptors(raw)
  if(Reflect.ownKeys(raw).length!==keys.length)return bad()
  const value:Record<string,unknown>={}
  for(const key of keys){const d=descriptors[key];if(!d?.enumerable||!('value'in d))return bad();value[key]=d.value}
  if(value.protocol!=='agent_optimization_retest_v1'||!Number.isSafeInteger(value.spec_revision)||Number(value.spec_revision)<1||Number(value.spec_revision)>Number.MAX_SAFE_INTEGER-2||
    typeof value.source_sha256!=='string'||!hash.test(value.source_sha256)||typeof value.feedback_sha256!=='string'||!hash.test(value.feedback_sha256))return bad()
  for(const key of ['run_id','acceptance_request_id','source_run_id','spec_id','feedback_id','after_revision_id'])value[key]=optimizationRetestId(value[key])
  if(value.run_id!==optimizationRetestId(expected.run_id)||value.spec_id!==optimizationRetestId(expected.spec_id)||value.spec_revision!==expected.spec_revision||value.run_id===value.source_run_id||
    expected.acceptance_request_id!==undefined&&value.acceptance_request_id!==optimizationRetestId(expected.acceptance_request_id))return bad()
  return Object.freeze(value) as OptimizationRetestProof
}
