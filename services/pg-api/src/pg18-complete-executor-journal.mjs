// Root's external operation record, never a schema_migrations receipt. It is
// evidence of one attempted operation, not permission to skip a live audit.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const fail=()=>{throw Error('complete069_executor_private_record_required')}
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
const keys='baseline_catalog_sha256,business_image_sha256,database,format,group,ledger_sha256,login,operation_id,operator,profile,review_intent_sha256,review_operation_id,source_sha256,started_at,target,verifier_sha256'
export function checkedComplete069ExecutorIntent(value,cfg){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==keys||value.format!=='complete069_executor_operation_v1'||value.profile!=='complete069'||value.database!=='agent_studio'||value.operator!=='postgres'||value.login!=='agentstudio_local_executor_login'||value.group!=='agentstudio_local_executor'||typeof value.baseline_catalog_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.baseline_catalog_sha256)||value.review_operation_id!==cfg.reviewOperationId||!uuid(value.review_operation_id)||value.review_operation_id===value.operation_id||!['review_intent_sha256','ledger_sha256','business_image_sha256'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k]))||value.operation_id!==cfg.operationId||value.source_sha256!==cfg.sourceSha256||!value.target||Object.keys(value.target).sort().join(',')!=='database_oid,system_identifier'||value.target.system_identifier!==cfg.target.system_identifier||value.target.database_oid!==cfg.target.database_oid||typeof value.verifier_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.verifier_sha256)||typeof value.started_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.started_at)||!Number.isFinite(Date.parse(value.started_at)))fail()
 if(new Date(value.started_at).toISOString()!==value.started_at)fail()
 return Object.freeze(value)
}
export function startComplete069ExecutorOperation(dir,cfg,verifierSha256,before){
 const value={format:'complete069_executor_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',login:'agentstudio_local_executor_login',group:'agentstudio_local_executor',baseline_catalog_sha256:before.baseline,ledger_sha256:before.ledger,business_image_sha256:before.image,review_operation_id:cfg.reviewOperationId,review_intent_sha256:before.reviewIntentSha256,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,verifier_sha256:verifierSha256,started_at:new Date().toISOString()}
 checkedComplete069ExecutorIntent(value,cfg)
 // EEXIST is a refusal, including a pending intent. Never open with truncation.
 if(fs.existsSync(filename(dir,cfg.operationId,'result')))fail()
 write(filename(dir,cfg.operationId,'intent'),value);return Object.freeze(value)
}
export function readComplete069ExecutorOperation(dir,cfg){return checkedComplete069ExecutorIntent(read(filename(dir,cfg.operationId,'intent')),cfg)}
export function finishComplete069ExecutorOperation(dir,cfg,result){
 readComplete069ExecutorOperation(dir,cfg)
 if(!result||Object.keys(result).sort().join(',')!=='actual_api_catalog_verified,actual_login_verified,all133_table_images_unchanged,commit_acknowledged,migration_ledger_unchanged,refusal_code'||['actual_api_catalog_verified','actual_login_verified','all133_table_images_unchanged','commit_acknowledged','migration_ledger_unchanged'].some(k=>typeof result[k]!=='boolean')||result.refusal_code!==null&&!(typeof result.refusal_code==='string'&&/^complete069_executor_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(result.refusal_code)))fail()
 write(filename(dir,cfg.operationId,'result'),{format:'complete069_executor_result_v1',operation_id:cfg.operationId,completed_at:new Date().toISOString(),...result,automatic_retry_authorized:false,services_started:false,runtime_authorization:false,production_cutover_allowed:false})
}
