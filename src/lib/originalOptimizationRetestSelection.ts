import {optimizationRetestId,optimizationRetestProof,type OptimizationRetestProof} from '../../shared/agent-optimization-retest-contract.ts'
export type OriginalOptimizationRetestSelection=Omit<OptimizationRetestProof,'protocol'|'run_id'>
export function originalOptimizationRetestSelection(raw:unknown):Readonly<OriginalOptimizationRetestSelection>{
 const bad=():never=>{throw Error('invalid_original_optimization_selection')},keys=['acceptance_request_id','source_run_id','spec_id','spec_revision','source_sha256','feedback_id','feedback_sha256','after_revision_id']
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return bad()
 const descriptors=Object.getOwnPropertyDescriptors(raw),value:Record<string,unknown>={};if(Reflect.ownKeys(raw).length!==keys.length)return bad()
 for(const key of keys){const d=descriptors[key];if(!d?.enumerable||!Object.hasOwn(d,'value'))return bad();value[key]=d.value}
 if(!Number.isSafeInteger(value.spec_revision)||Number(value.spec_revision)<1||Number(value.spec_revision)>Number.MAX_SAFE_INTEGER-2||typeof value.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.source_sha256)||typeof value.feedback_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.feedback_sha256))return bad()
 const id=(key:string)=>{const v=value[key],normalized=optimizationRetestId(v);if(v!==normalized)return bad();return normalized}
 return Object.freeze({acceptance_request_id:id('acceptance_request_id'),source_run_id:id('source_run_id'),spec_id:id('spec_id'),spec_revision:Number(value.spec_revision),source_sha256:value.source_sha256,feedback_id:id('feedback_id'),feedback_sha256:value.feedback_sha256,after_revision_id:id('after_revision_id')})
}
export function originalOptimizationRetestProofMatches(raw:unknown,runId:string,selection:OriginalOptimizationRetestSelection):boolean{
 try{const expected=originalOptimizationRetestSelection(selection),proof=optimizationRetestProof(raw,{run_id:runId,spec_id:expected.spec_id,spec_revision:expected.spec_revision,acceptance_request_id:expected.acceptance_request_id});return Object.keys(expected).every(key=>proof[key as keyof OriginalOptimizationRetestSelection]===expected[key as keyof OriginalOptimizationRetestSelection])}catch{return false}
}
