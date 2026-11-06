// Uses actual original LOGINs and auditors. No injected pool or positive probe.
import fs from'node:fs'
import path from'node:path'
import{complete069PlanWorkflowPredecessors as predecessors}from'./pg18-complete-plan-workflow-predecessor-plan.mjs'
import{completeServiceActualLogin}from'./pg18-complete-service-core.mjs'
import{inspectAgentAssessmentOperatorPool,inspectAgentDesignOperatorPool}from'./agent-assessment-service.ts'
import{verifyAgentDesignCredentials}from'./agent-design-audit.ts'
import{inspectNativeLocalExecutorPreflight}from'./native-local-executor-service-preflight.ts'
const fail=c=>{throw Error('complete069_plan_workflow_'+c)},keys=(v,names)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...names].sort().join(',')
export function checkedComplete069PlanWorkflowPredecessorFiles(value){
 if(!keys(value,['format','files'])||value.format!=='complete069_plan_workflow_predecessor_credentials_v1'||!Array.isArray(value.files)||value.files.length!==predecessors.length||value.files.some((row,i)=>!keys(row,['login','secret_file'])||row.login!==predecessors[i].login||typeof row.secret_file!=='string'||!path.posix.isAbsolute(row.secret_file)||path.posix.normalize(row.secret_file)!==row.secret_file||row.secret_file.includes('\0')||row.secret_file.includes('\\'))||new Set(value.files.map(r=>r.secret_file)).size!==predecessors.length)fail('predecessor_files_refused')
 return Object.freeze(value.files.map(row=>Object.freeze({...row})))
}
export function readComplete069PlanWorkflowPredecessorFiles(file){
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||file.includes('\0'))fail('predecessor_files_refused')
 let at='/';for(const part of file.split('/').filter(Boolean).slice(0,-1)){at=path.join(at,part);const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o022)!==0)fail('predecessor_files_refused')}
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
 try{const a=fs.fstatSync(fd);if(!a.isFile()||a.uid!==0||a.gid!==0||a.nlink!==1||![0o400,0o600].includes(a.mode&0o7777)||a.size<1||a.size>16384||fs.realpathSync(file)!==file)fail('predecessor_files_refused');const bytes=fs.readFileSync(fd),b=fs.fstatSync(fd),current=fs.lstatSync(file);for(const k of['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid'])if(a[k]!==b[k]||a[k]!==current[k])fail('predecessor_files_refused');const value=JSON.parse(bytes.toString('utf8'));if(!bytes.equals(Buffer.from(JSON.stringify(value,null,2)+'\n')))fail('predecessor_files_refused');return Object.freeze({files:checkedComplete069PlanWorkflowPredecessorFiles(value),file,device:a.dev,inode:a.ino,bytes})}finally{fs.closeSync(fd)}
}
export async function verifyComplete069PlanWorkflowPredecessors(pools){
 if(!(pools instanceof Map)||pools.size!==predecessors.length||predecessors.some(a=>!pools.has(a.login)))fail('predecessor_pools_refused')
 for(const a of predecessors){const pool=pools.get(a.login),db=await pool.connect();try{const r=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];if(r?.login!==a.login||r.actor!==r.login)fail('predecessor_actual_login_required')}finally{db.release()}
  const target={mode:'baota_pg18',host:'127.0.0.1',port:5333,database:'agent_studio',user:a.login,expectedMajor:18}
  if(a.auditor==='original_C_actual_login')await completeServiceActualLogin(pool,a.action)
  else if(a.auditor==='assessment_worker'||a.auditor==='assessment_dispatch')await inspectAgentAssessmentOperatorPool(pool,target,a.auditor==='assessment_worker'?'worker':'dispatch')
  else if(a.auditor==='design_worker'||a.auditor==='design_dispatch')await inspectAgentDesignOperatorPool(pool,target,a.auditor==='design_worker'?'worker':'dispatch',verifyAgentDesignCredentials)
  else if(a.auditor==='executor'){const proof=await inspectNativeLocalExecutorPreflight(pool,{database:'agent_studio',port:5333});if(proof?.original_C_audit_verified!==true||proof.read_only!==true||proof.listener_started!==false||proof.effect_executed!==false)fail('executor_audit_refused')}
  else fail('predecessor_auditor_refused')
 }
 return true
}
