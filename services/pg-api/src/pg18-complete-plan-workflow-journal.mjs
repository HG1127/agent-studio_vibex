// Root's external operation record, never a schema_migrations receipt. It is
// evidence of one attempted operation, not permission to skip a live audit.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const fail=()=>{throw Error('complete069_plan_workflow_private_record_required')}
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
import{complete069PlanWorkflowAbi}from'./pg18-complete-plan-workflow-plan.mjs'

const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,keys=(v,k)=>plain(v)&&Object.keys(v).sort().join(',')===[...k].sort().join(',')
const immutable=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))immutable(x);Object.freeze(v)}return v}
const fields=['format','profile','database','operator','pair','baseline_catalog_sha256','ledger_sha256','business_image_sha256','operation_id','source_sha256','plan_workflow_source_sha256','target','started_at']
export function checkedComplete069PlanWorkflowIntent(value,cfg){
 if(!keys(value,fields)||value.format!=='complete069_plan_workflow_operation_v1'||value.profile!=='complete069'||value.database!=='agent_studio'||value.operator!=='postgres'||!hex(value.baseline_catalog_sha256)||!hex(value.ledger_sha256)||!hex(value.business_image_sha256)||value.operation_id!==cfg.operationId||value.source_sha256!==cfg.sourceSha256||value.plan_workflow_source_sha256!==cfg.planWorkflowSourceSha256||!keys(value.target,['system_identifier','database_oid'])||value.target.system_identifier!==cfg.target.system_identifier||value.target.database_oid!==cfg.target.database_oid||!Array.isArray(value.pair)||value.pair.length!==2||value.pair.some((row,i)=>!keys(row,['kind','login','group','verifier_sha256'])||row.kind!==complete069PlanWorkflowAbi[i].kind||row.login!==complete069PlanWorkflowAbi[i].login||row.group!==complete069PlanWorkflowAbi[i].group||!hex(row.verifier_sha256))||value.pair[0].verifier_sha256===value.pair[1].verifier_sha256||typeof value.started_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.started_at)||!Number.isFinite(Date.parse(value.started_at))||new Date(value.started_at).toISOString()!==value.started_at)fail()
 return immutable(value)
}
export function startComplete069PlanWorkflowOperation(dir,cfg,verifierHashes,baseline,ledger,image){
 const value={format:'complete069_plan_workflow_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',pair:complete069PlanWorkflowAbi.map((a,i)=>({kind:a.kind,login:a.login,group:a.group,verifier_sha256:verifierHashes[i]})),baseline_catalog_sha256:baseline,ledger_sha256:ledger,business_image_sha256:image,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,plan_workflow_source_sha256:cfg.planWorkflowSourceSha256,target:cfg.target,started_at:new Date().toISOString()}
 checkedComplete069PlanWorkflowIntent(value,cfg);if(fs.existsSync(filename(dir,cfg.operationId,'result')))fail();write(filename(dir,cfg.operationId,'intent'),value);return value
}
export function readComplete069PlanWorkflowOperation(dir,cfg){return checkedComplete069PlanWorkflowIntent(read(filename(dir,cfg.operationId,'intent')),cfg)}
export function finishComplete069PlanWorkflowOperation(dir,cfg,result){
 readComplete069PlanWorkflowOperation(dir,cfg)
 const booleans=['commit_acknowledged','predecessor_logins_verified','worker_login_verified','dispatch_login_verified','actual_api_catalog_verified','migration_ledger_unchanged','all133_table_images_unchanged']
 if(!keys(result,[...booleans,'refusal_code'])||booleans.some(k=>typeof result[k]!=='boolean')||result.refusal_code!==null&&!(typeof result.refusal_code==='string'&&/^complete069_plan_workflow_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(result.refusal_code)))fail()
 write(filename(dir,cfg.operationId,'result'),{format:'complete069_plan_workflow_result_v1',operation_id:cfg.operationId,completed_at:new Date().toISOString(),...result,automatic_retry_authorized:false,services_started:false,runtime_authorization:false,production_cutover_allowed:false})
}
