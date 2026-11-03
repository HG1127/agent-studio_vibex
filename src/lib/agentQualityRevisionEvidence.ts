import {parseOriginalQualityRevision,qualityChecksCanonical,type OriginalQualityRevision} from '../../shared/original-agent-quality-contract.ts'
import {isCurrentAgentQualityRun} from './agentQualityChecks.ts'
type Spec={id:string;rh_user_id:string;updated:string;spec:{quality_checks?:unknown};native_quality_revision?:OriginalQualityRevision}
type Run={spec_id:string;rh_user_id:string;status:string;created:string;checkpoint:Record<string,unknown>|null;native_projection?:unknown}
function revision(spec:Spec){try{const q=spec.native_quality_revision?parseOriginalQualityRevision(spec.native_quality_revision,spec.rh_user_id,spec.id):null;if(q?.state==='configured'&&qualityChecksCanonical(q.checks)!==qualityChecksCanonical(spec.spec.quality_checks))return null;return q}catch{return null}}
/** Presentation evidence only; server publication independently checks its own
 * immutable revision, actual run, checkpoint, output and existing ACL predicate. */
export function agentQualityRevisionKey(spec:Spec){const q=revision(spec);return q?'native:'+q.spec_revision+':'+q.source_sha256:spec.updated}
export function agentQualityNativeMissing(spec:Spec){return revision(spec)?.state==='missing'}
export function agentQualityRunIsCurrent(spec:Spec,run:Run|null,now=Date.now()){
 if(!run||run.status!=='succeeded'||run.spec_id!==spec.id||run.rh_user_id!==spec.rh_user_id)return false
 if(run.native_projection!==undefined||spec.native_quality_revision!==undefined){if(run.native_projection===undefined)return false;const q=revision(spec);return Boolean(q&&q.state==='configured'&&q.spec_id===run.spec_id&&q.employee_id===run.rh_user_id&&run.checkpoint?.spec_revision===q.spec_revision)}
 return isCurrentAgentQualityRun(spec.updated,run.created,now)
}
