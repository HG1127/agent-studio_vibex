#!/usr/bin/env node
// DBA-only, one-shot archive wrapper. Plan is offline; no migration application.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {prepareExecutionFenceImport,importLegacyExecutionFenceToStage} from './stage-execution-fence-import.ts'
import type {SqlPool,SqlClient} from './contracts.ts'

const here=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(here),'../../..')
class Refusal extends Error {}
function deny(code:string):never {throw new Refusal(code)}
function parse(argv:string[]){
  const flags=new Map<string,string|true>()
  const modes=['--plan','--execute']
  const inputs=['--snapshot','--manifest','--mapping','--review','--review-sha256']
  for(let i=0;i<argv.length;i++){
    const key=argv[i]!
    if(![...modes,...inputs,'--confirm-stage'].includes(key)||flags.has(key))deny('invalid_arguments')
    if(modes.includes(key)){flags.set(key,true);continue}
    const value=argv[++i]
    if(!value||value.startsWith('--'))deny('invalid_arguments')
    flags.set(key,value)
  }
  if(flags.has('--plan')===flags.has('--execute')||inputs.some(k=>typeof flags.get(k)!=='string'))deny('invalid_arguments')
  const execute=flags.has('--execute')
  if(execute&&flags.get('--confirm-stage')!=='agentstudio_stage')deny('stage_confirmation_required')
  if(!execute&&flags.has('--confirm-stage'))deny('invalid_arguments')
  const value=(k:string)=>String(flags.get(k))
  if(!/^[a-fA-F0-9]{64}$/.test(value('--review-sha256')))deny('trusted_review_sha_required')
  return {execute,snapshot:value('--snapshot'),manifest:value('--manifest'),mapping:value('--mapping'),
    review:value('--review'),reviewSha:value('--review-sha256').toLowerCase()}
}
function localFile(input:string){
  // Reject network/device paths and URIs, including Windows UNC on other OSes.
  if(/^[\\/]{2}|^[a-z][a-z0-9+.-]*:\/\//i.test(input)||/^[a-z]:[^\\/]/i.test(input))deny('local_frozen_files_required')
  const absolute=path.resolve(input)
  if(/^[\\/]{2}/.test(absolute))deny('local_frozen_files_required')
  // Refuse symlink/junction components before realpath can follow them to a
  // network share or live database. Mounted/mapped drives need OS isolation.
  let component=path.parse(absolute).root
  for(const part of absolute.slice(component.length).split(path.sep)){
    component=path.join(component,part)
    if(fs.lstatSync(component).isSymbolicLink())deny('local_frozen_files_required')
  }
  const real=fs.realpathSync(absolute)
  if(/^[\\/]{2}/.test(real)||real.split(/[\\/]/).some(p=>p.toLowerCase()==='pb_data')||!fs.statSync(real).isFile())deny('local_frozen_files_required')
  return real
}
function stageTarget(){
  if(process.env.AGENT_STUDIO_PG_STAGE_FENCE_IMPORT_ENABLED!=='true')deny('stage_import_disabled')
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!['127.0.0.1','postgres'].includes(String(host))||
    process.env.AGENT_STUDIO_PG_DATABASE!=='agentstudio_stage'||
    process.env.AGENT_STUDIO_PG_IMPORT_USER!=='agentstudio_admin')deny('unsafe_postgres_target')
  // No libpq environment overrides, inline credentials, services, or URL input.
  if(Object.keys(process.env).some(k=>/^PG/i.test(k)&&process.env[k]!==undefined)||
    process.env.DATABASE_URL||process.env.AGENT_STUDIO_PG_PASSWORD||process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD)deny('ambient_pg_configuration_forbidden')
  return String(host)
}
function passwordFile(inputs:string[]){
  const name=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!name)deny('external_password_file_required')
  const real=localFile(name),relative=path.relative(root,real),st=fs.statSync(real)
  if((!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))||inputs.some(p=>{
    const s=fs.statSync(p);return s.dev===st.dev&&s.ino===st.ino
  }))deny('external_password_file_required')
  if(st.size<32||st.size>4096||(process.platform!=='win32'&&(st.mode&0o077)!==0))deny('private_password_file_required')
  const bytes=fs.readFileSync(real),password=bytes.toString('utf8').replace(/\r?\n$/,'')
  if(!Buffer.from(bytes.toString('utf8')).equals(bytes)||password.length<32||password.length>2048||/[\r\n\0]/.test(password)||/^(.)\1+$/.test(password))deny('invalid_password_file')
  return password
}
export async function runCli(argv:string[]){
  try{
    const args=parse(argv)
    // No real business input is permitted in GitHub Actions, even for plan.
    if(process.env.GITHUB_ACTIONS==='true')deny('github_actions_forbidden')
    const host=args.execute?stageTarget():undefined
    const files=[args.snapshot,args.manifest,args.mapping,args.review].map(localFile)
    const plan=prepareExecutionFenceImport(files[0]!,files[1]!,files[2]!,files[3]!,args.reviewSha)
    const report={source_sha256:plan.source_snapshot_sha256,
      counts:{parents:plan.parents.length,leases:plan.rows.filter(r=>r.source_table==='agent_studio_run_leases').length,
        side_effect_records:plan.rows.filter(r=>r.source_table==='agent_studio_side_effects').length},
      source_read_only:true,executable:false,execution_enabled:false,runtime_jobs_created:0,
      runtime_runs_created:0,side_effects_created:0,production_cutover_allowed:false}
    if(!args.execute)return report
    const password=passwordFile(files)
    // This import and Pool construction are unreachable from --plan.
    const {Pool}=await import('pg')
    const pool=new Pool({host:host!,port:5432,database:'agentstudio_stage',user:'agentstudio_admin',password,
      ssl:false,options:'',application_name:'execution_fence_archive',max:1,
      connectionTimeoutMillis:5000,statement_timeout:35000,idleTimeoutMillis:1000})
    pool.on('error',()=>{/* Never emit driver diagnostics. Query failures still refuse. */})
    const adapter:SqlPool={async connect():Promise<SqlClient>{
      const client=await pool.connect()
      return {async query<T>(sql:string,values:unknown[]=[]){
        const result=await client.query(sql,values);return {rows:result.rows as T[]}
      },release(){client.release()}}
    }}
    try{
      const result=await importLegacyExecutionFenceToStage(adapter,plan)
      // Explicit allowlist: never serialize the plan or a driver/result object.
      return {...report,counts:{...report.counts,imported:result.imported,replayed:result.replayed,reconciled:result.reconciled}}
    }finally{await pool.end()}
  }catch(error){
    // FS, SQLite, SQL, and importer errors may carry private content. Only our
    // internally constructed refusals may leave this boundary, including imports.
    throw new Error(error instanceof Refusal?error.message:'execution_fence_import_refused')
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  runCli(process.argv.slice(2)).then(report=>console.log(JSON.stringify(report))).catch(error=>{
    console.error(error.message);process.exitCode=1
  })
}
