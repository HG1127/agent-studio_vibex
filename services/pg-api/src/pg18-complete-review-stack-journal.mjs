// Root's external operation record, never a schema_migrations receipt. It is
// evidence of one attempted operation, not permission to skip a live audit.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const fail=()=>{throw Error('complete069_review_stack_private_record_required')}
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
function directory(dir){
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||typeof dir!=='string'||!path.isAbsolute(dir)||path.normalize(dir)!==dir||dir.includes('\0'))fail()
 const relative=path.relative(root,dir);if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))fail()
 let at='/'
 for(const p of dir.split('/').filter(Boolean)){at=path.join(at,p);const s=fs.lstatSync(at);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==0||s.gid!==0||(s.mode&0o022)!==0)fail()}
 const s=fs.lstatSync(dir);if((s.mode&0o7777)!==0o700||fs.realpathSync(dir)!==dir)fail()
 return dir
}
function filename(dir,id,suffix){directory(dir);if(!uuid(id)||!['intent','result'].includes(suffix))fail();return path.join(dir,id+'.'+suffix+'.json')}
function read(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
 try{const a=fs.fstatSync(fd);if(!a.isFile()||a.uid!==0||a.gid!==0||a.nlink!==1||(a.mode&0o7777)!==0o600||a.size<1||a.size>16384)fail();const bytes=fs.readFileSync(fd),z=fs.fstatSync(fd);if(a.dev!==z.dev||a.ino!==z.ino||a.size!==z.size||a.mtimeMs!==z.mtimeMs||a.ctimeMs!==z.ctimeMs||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail();return JSON.parse(bytes)}finally{fs.closeSync(fd)}
}
function write(file,value){
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600)
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==0||s.gid!==0||s.nlink!==1||(s.mode&0o7777)!==0o600)fail();fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const d=fs.openSync(path.dirname(file),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(d)}finally{fs.closeSync(d)}
}
import {checkedReviewStackDigests} from './pg18-complete-review-stack-plan.mjs'
const keys='before_catalog_sha256,before_images_sha256,before_ledger_sha256,database,executor_intent_sha256,executor_operation_id,format,operation_id,operator,profile,review_intent_sha256,review_operation_id,source_sha256,started_at,target,verifier_sha256s'
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export function checkedReviewStackIntent(value,cfg){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==keys||value.format!=='complete069_review_stack_operation_v1'||value.profile!=='complete069'||value.database!=='agent_studio'||value.operator!=='postgres'||value.operation_id!==cfg.operationId||value.source_sha256!==cfg.sourceSha256||!value.target||Object.keys(value.target).sort().join(',')!=='database_oid,system_identifier'||value.target.system_identifier!==cfg.target.system_identifier||value.target.database_oid!==cfg.target.database_oid||!['before_catalog_sha256','before_images_sha256','before_ledger_sha256'].every(k=>hex(value[k]))||typeof value.started_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.started_at)||!Number.isFinite(Date.parse(value.started_at))||new Date(value.started_at).toISOString()!==value.started_at)fail()
 if(value.review_operation_id!==cfg.reviewOperationId||value.executor_operation_id!==cfg.executorOperationId||!uuid(value.review_operation_id)||!uuid(value.executor_operation_id)||new Set([value.operation_id,value.review_operation_id,value.executor_operation_id]).size!==3||!hex(value.executor_intent_sha256)||!hex(value.review_intent_sha256))fail()
 checkedReviewStackDigests(value.verifier_sha256s);return Object.freeze(value)
}
export function startReviewStackOperation(dir,cfg,digests,before){
 const value={format:'complete069_review_stack_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,verifier_sha256s:digests,before_catalog_sha256:before.baseline,before_images_sha256:before.images,before_ledger_sha256:before.ledger,...before.links,started_at:new Date().toISOString()}
 checkedReviewStackIntent(value,cfg);if(fs.existsSync(filename(dir,cfg.operationId,'result')))fail();write(filename(dir,cfg.operationId,'intent'),value);return Object.freeze(value)
}
export function readReviewStackOperation(dir,cfg){return checkedReviewStackIntent(read(filename(dir,cfg.operationId,'intent')),cfg)}
const booleans=['commit_acknowledged','role_matrix_verified','old_catalog_unchanged','migration_ledger_unchanged','all_table_images_unchanged','verifiers_match_intent','prior_logins_verified','new_logins_verified','actual_api_catalog_verified']
export function finishReviewStackOperation(dir,cfg,result){
 readReviewStackOperation(dir,cfg)
 if(!result||Object.keys(result).sort().join(',')!==[...booleans,'refusal_code'].sort().join(',')||booleans.some(k=>typeof result[k]!=='boolean')||result.refusal_code!==null&&!(typeof result.refusal_code==='string'&&/^complete069_review_stack_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(result.refusal_code)))fail()
 write(filename(dir,cfg.operationId,'result'),{format:'complete069_review_stack_result_v1',operation_id:cfg.operationId,completed_at:new Date().toISOString(),...result,automatic_retry_authorized:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false})
}
