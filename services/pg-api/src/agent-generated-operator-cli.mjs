#!/usr/bin/env node
import {readFileSync,lstatSync,realpathSync,existsSync,openSync,writeSync,fsyncSync,closeSync,constants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {captureGeneratedOperatorSources,assertGeneratedOperatorSnapshot,assertGeneratedOperatorDeployment,generatedOperatorPlan,generatedOperatorSha} from './agent-generated-operator-source.mjs'

const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'../../..'),prefix='AGENT_STUDIO_GENERATED_059_'
function fail(code){throw Error('generated_operator_'+code)}
export function parseGeneratedOperatorArguments(argv,env=process.env,platform=process.platform,uid=process.getuid?.()){
  if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
  if(argv.length!==5||!['--preflight','--apply','--recover'].includes(argv[0])||argv[1]!=='--confirm-database'||argv[2]!=='agent_studio'||argv[3]!=='--expected-source-sha256'||!/^[a-f0-9]{64}$/.test(argv[4]))fail('invalid_arguments')
  const mode=argv[0].slice(2),write=mode==='apply'
  if(platform!=='linux'||uid!==0||env[prefix+'ENABLED']!=='true'||env[prefix+'READ_APPROVED']!=='APPROVE_GENERATED_059_READ_ONLY'||
    Object.keys(env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]/.test(k)||['NODE_OPTIONS','NODE_PATH'].includes(k)&&env[k]))fail('disabled')
  if(write?env[prefix+'WRITE_APPROVED']!=='APPROVE_GENERATED_059_INSTALL_ONLY':env[prefix+'WRITE_APPROVED']!==undefined)fail('write_not_approved')
  for(const key of ['APPROVAL_FILE','BACKUP_MANIFEST_FILE','RESTORE_EVIDENCE_FILE','ADMIN_PASSWORD_FILE',...(mode==='preflight'?[]:['JOURNAL_FILE'])]){
    const file=env[prefix+key];if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))fail('incomplete_configuration')
  }
  if(mode==='preflight'&&env[prefix+'JOURNAL_FILE']!==undefined||!/^[a-f0-9]{64}$/.test(env[prefix+'APPROVAL_SHA256']??''))fail('incomplete_configuration')
  return Object.freeze({mode,expected_source_sha256:argv[4]})
}
function privatePath(file,create=false){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||file.includes('\0'))fail('private_file_required')
  const relative=path.relative(root,file)
  if(relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))fail('private_file_required')
  let current=path.parse(file).root
  const parts=file.slice(current.length).split(path.sep).filter(Boolean)
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);if(create&&i===parts.length-1){if(existsSync(current))fail('journal_exists');break}
    const st=lstatSync(current)
    if(st.isSymbolicLink()||st.uid!==0||(st.mode&(i===parts.length-1?0o077:0o022))!==0||i<parts.length-1&&!st.isDirectory())fail('private_file_required')
    if(i===parts.length-1&&(!st.isFile()||st.size<1||st.size>65536||realpathSync(current)!==file))fail('private_file_required')
  }
  return file
}
function privateBytes(file){privatePath(file);const bytes=readFileSync(file),value=bytes.toString('utf8');if(!Buffer.from(value,'utf8').equals(bytes)||value.startsWith('\uFEFF')||value.includes('\0'))fail('invalid_evidence');return {bytes,value}}
function jsonFile(file,expected){const raw=privateBytes(file);if(generatedOperatorSha(raw.bytes)!==expected)fail('evidence_changed');try{return JSON.parse(raw.value)}catch{fail('invalid_evidence')}}
export async function runGeneratedOperator(argv,env=process.env){
  // Parsing/half-configuration refusal precedes source reads, secret access,
  // pg import and TCP. --plan only reads the reviewed source/AST manifest.
  const cfg=parseGeneratedOperatorArguments(argv,env),snapshot=await captureGeneratedOperatorSources()
  if(cfg.mode==='plan')return generatedOperatorPlan(snapshot)
  assertGeneratedOperatorSnapshot(snapshot,cfg.expected_source_sha256)
  assertGeneratedOperatorDeployment(snapshot)
  const core=await import('./agent-generated-operator-core.ts')
  const approval=core.parseGeneratedOperatorApproval(jsonFile(env[prefix+'APPROVAL_FILE'],env[prefix+'APPROVAL_SHA256']),snapshot)
  core.verifyGeneratedOperatorBackupEvidence(approval,jsonFile(env[prefix+'BACKUP_MANIFEST_FILE'],approval.backup_manifest_sha256),
    jsonFile(env[prefix+'RESTORE_EVIDENCE_FILE'],approval.restore_evidence_sha256),approval.backup_manifest_sha256,approval.restore_evidence_sha256)
  let journal,journalFd
  if(cfg.mode==='recover'){
    const lines=privateBytes(env[prefix+'JOURNAL_FILE']).value.trimEnd().split('\n')
    if(!lines.length)fail('invalid_journal')
    const records=lines.map(line=>{try{return core.parseGeneratedOperatorJournal(JSON.parse(line),approval)}catch{fail('invalid_journal')}})
    if(records.some(r=>r.nonce!==records[0].nonce||r.backend_pid!==records[0].backend_pid||r.backend_start!==records[0].backend_start))fail('invalid_journal')
    journal=records.at(-1)
  }else if(cfg.mode==='apply')privatePath(env[prefix+'JOURNAL_FILE'],true)
  // Reuse the established external root-owned credential validator. No fresh
  // initializer, credential rotation or runtime-login impersonation is called.
  privatePath(env[prefix+'ADMIN_PASSWORD_FILE'])
  const {readPg18OperatorSecret}=await import('./native-activation-cli.mjs')
  const secret=readPg18OperatorSecret(env[prefix+'ADMIN_PASSWORD_FILE'])
  const {Pool}=await import('pg'),pool=new Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user:'postgres',password:secret.password,
    ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:45000,application_name:'agent_generated_059_operator'})
  try{
    if(cfg.mode!=='apply')return {mode:cfg.mode,...await core.inspectGeneratedOperator(pool,snapshot,approval,journal),network_used:true,writes_performed:false}
    journalFd=openSync(env[prefix+'JOURNAL_FILE'],constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600)
    fsyncSync(journalFd)
    const directory=openSync(path.dirname(env[prefix+'JOURNAL_FILE']),constants.O_RDONLY|constants.O_DIRECTORY)
    try{fsyncSync(directory)}finally{closeSync(directory)}
    const persist=async record=>{const raw=Buffer.from(JSON.stringify(record)+'\n');let offset=0;while(offset<raw.length){const count=writeSync(journalFd,raw,offset,raw.length-offset);if(count<=0)fail('journal_write_failed');offset+=count}fsyncSync(journalFd)}
    return {mode:cfg.mode,...await core.applyGeneratedOperator(pool,snapshot,approval,persist),network_used:true}
  }finally{if(journalFd!==undefined)closeSync(journalFd);await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runGeneratedOperator(process.argv.slice(2)))+'\n')}
  catch(error){const code=error instanceof Error&&/^generated_operator_[a-z_]+$/.test(error.message)?error.message:'generated_operator_refused';process.stderr.write('GENERATED_059_REFUSED:'+code+'\n');process.exitCode=1}
}
