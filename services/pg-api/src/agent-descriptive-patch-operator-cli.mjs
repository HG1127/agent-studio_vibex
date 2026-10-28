#!/usr/bin/env node
// Controlled060 entry foundation. Current offline35fb snapshot intentionally
// refuses execution BEFORE any private file or pg import. Parent must seal the
// new core/CLI closure and prove the real full059 archive/restore on hosted PG18.
import {lstatSync,realpathSync,openSync,fstatSync,readSync,writeSync,fsyncSync,closeSync,constants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {captureDescriptivePatchOperatorSources,assertDescriptivePatchOperatorSnapshot,descriptivePatchOperatorPlan} from './agent-descriptive-patch-operator-source.mjs'
import {captureGeneratedOperatorSources,assertGeneratedOperatorSnapshot} from './agent-generated-operator-source.mjs'

const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'../../..')
const prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',predecessorSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
const maxJson=65536,maxArchive=8*1024**3
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
function fail(code){throw Error('descriptive_patch_operator_'+code)}
function closed(value,keys){
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)fail('invalid_evidence')
  const descriptors=Object.getOwnPropertyDescriptors(value)
  if(keys.some(k=>!descriptors[k]||!('value'in descriptors[k])||!descriptors[k].enumerable))fail('invalid_evidence')
  return value
}
function argvValues(argv){
  if(!Array.isArray(argv)||Object.getPrototypeOf(argv)!==Array.prototype||argv.length>5)fail('invalid_arguments')
  const descriptors=Object.getOwnPropertyDescriptors(argv)
  if(Reflect.ownKeys(argv).length!==argv.length+1)fail('invalid_arguments')
  return Array.from({length:argv.length},(_,i)=>{
    const d=descriptors[String(i)]
    if(!d||!('value'in d)||!d.enumerable||typeof d.value!=='string')fail('invalid_arguments')
    return d.value
  })
}
const fileKeys=['APPROVAL_FILE','PREDECESSOR_APPROVAL_FILE','BACKUP_MANIFEST_FILE','BACKUP_ARCHIVE_FILE','RESTORE_EVIDENCE_FILE','ADMIN_PASSWORD_FILE']
const allowedKeys=new Set(['ENABLED','READ_APPROVED','WRITE_APPROVED',...fileKeys,'APPROVAL_SHA256','PREDECESSOR_APPROVAL_SHA256','ADMIN_PASSWORD_SHA256','JOURNAL_FILE','JOURNAL_SHA256'])
export function parseDescriptivePatchOperatorCliArguments(argv,env=process.env,platform=process.platform,uid=process.getuid?.(),gid=process.getgid?.()){
  const args=argvValues(argv)
  if(args.length===3&&args[0]==='--plan'&&args[1]==='--expected-source-sha256'&&isSha(args[2]))return Object.freeze({mode:'plan',expected_source_sha256:args[2]})
  if(args.length!==5||!['--preflight','--apply','--recover'].includes(args[0])||args[1]!=='--confirm-database'||args[2]!=='agent_studio'||args[3]!=='--expected-source-sha256'||!isSha(args[4]))fail('invalid_arguments')
  if(platform!=='linux'||uid!==0||gid!==0)fail('disabled')
  if(!env||typeof env!=='object')fail('disabled')
  const descriptors=Object.getOwnPropertyDescriptors(env),values={}
  for(const key of Reflect.ownKeys(descriptors)){
    const d=descriptors[key]
    if(typeof key!=='string'||!('value'in d)||typeof d.value!=='string'&&d.value!==undefined)fail('disabled')
    if(key==='DATABASE_URL'||/^PG(?:[A-Z_]|$)/.test(key)||/^AGENT_STUDIO_GENERATED_059_/.test(key)||
      ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&d.value)fail('ambient_configuration_refused')
    if(key.startsWith(prefix)){
      const short=key.slice(prefix.length)
      if(!allowedKeys.has(short))fail('incomplete_configuration')
      values[short]=d.value
    }
  }
  const mode=args[0].slice(2)
  if(values.ENABLED!=='true'||values.READ_APPROVED!=='APPROVE_DESCRIPTIVE_PATCH_060_READ_ONLY')fail('disabled')
  if(mode==='apply'?values.WRITE_APPROVED!=='APPROVE_DESCRIPTIVE_PATCH_060_INSTALL_ONLY':values.WRITE_APPROVED!==undefined)fail('write_not_approved')
  for(const key of [...fileKeys,...(mode==='preflight'?[]:['JOURNAL_FILE'])])assertDescriptivePatchOperatorExternalPath(values[key],root)
  for(const key of ['APPROVAL_SHA256','PREDECESSOR_APPROVAL_SHA256','ADMIN_PASSWORD_SHA256',...(mode==='recover'?['JOURNAL_SHA256']:[])])if(!isSha(values[key]))fail('incomplete_configuration')
  if(mode==='preflight'&&(values.JOURNAL_FILE!==undefined||values.JOURNAL_SHA256!==undefined)||mode==='apply'&&values.JOURNAL_SHA256!==undefined)fail('incomplete_configuration')
  const files=[...fileKeys,...(mode==='preflight'?[]:['JOURNAL_FILE'])].map(k=>values[k])
  if(new Set(files).size!==files.length)fail('private_file_required')
  return Object.freeze({mode,expected_source_sha256:args[4],files:Object.freeze(Object.fromEntries(fileKeys.map(k=>[k,values[k]]))),
    approval_sha256:values.APPROVAL_SHA256,predecessor_approval_sha256:values.PREDECESSOR_APPROVAL_SHA256,
    admin_password_sha256:values.ADMIN_PASSWORD_SHA256,...(mode==='preflight'?{}:{journal_file:values.JOURNAL_FILE}),
    ...(mode==='recover'?{journal_sha256:values.JOURNAL_SHA256}:{})})
}
function requireRoot(){
  if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0)fail('disabled')
}
// Pure lexical policy. It grants no file access and supplies no runtime root
// override: actual IO always passes this module's fixed installation root.
export function assertDescriptivePatchOperatorExternalPath(file,projectRoot){
  if(typeof file!=='string'||file.length>4096||!path.posix.isAbsolute(file)||path.posix.normalize(file)!==file||file==='/'||file.endsWith('/')||/[\\\x00-\x1f\x7f]/.test(file))fail('private_file_required')
  if(typeof projectRoot!=='string'||file===projectRoot||file.startsWith(projectRoot.replace(/\/$/,'')+'/'))fail('private_file_required')
  if(file.split('/').some(p=>['node_modules','.pnpm','.yarn','.git','.codex','.agents'].includes(p.toLowerCase())))fail('private_file_required')
}
const metadataKeys=['type','symlink','uid','gid','mode','nlink','size']
// Pure stat policy used on actual lstat/fstat facts, never as an IO override.
export function assertDescriptivePatchOperatorFileMetadata(raw,kind,maxBytes=maxJson){
  const m=closed(raw,metadataKeys)
  if(!['directory','private-directory','private-file','journal-file','source-file'].includes(kind)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>maxArchive||
    m.symlink!==false||m.uid!==0||m.gid!==0||!Number.isSafeInteger(m.mode)||m.mode<0||!Number.isSafeInteger(m.nlink)||m.nlink<1||!Number.isSafeInteger(m.size)||m.size<0)fail('private_file_required')
  const permissions=m.mode&0o7777
  if(kind==='directory'||kind==='private-directory'){
    if(m.type!=='directory'||(permissions&0o7022)!==0||kind==='private-directory'&&permissions!==0o700)fail('private_file_required')
  }else if(m.type!=='file'||m.size<(kind==='journal-file'?0:1)||m.size>maxBytes||['private-file','journal-file'].includes(kind)&&(permissions!==0o600||m.nlink!==1)||kind==='source-file'&&(permissions&0o7022)!==0)fail('private_file_required')
}
function metadata(st){return {type:st.isFile()?'file':st.isDirectory()?'directory':'other',symlink:st.isSymbolicLink(),uid:st.uid,gid:st.gid,mode:st.mode,nlink:st.nlink,size:st.size}}
function exists(file){try{lstatSync(file);return true}catch(error){if(error?.code==='ENOENT')return false;throw error}}
function stamp(st){return {dev:st.dev,ino:st.ino,size:st.size,mode:st.mode,uid:st.uid,gid:st.gid,nlink:st.nlink,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs}}
function same(a,b){return Object.keys(a).every(k=>a[k]===b[k])}
function privatePath(file,create=false,maxBytes=maxJson,allowEmptyJournal=false){
  requireRoot();assertDescriptivePatchOperatorExternalPath(file,root)
  const parts=file.slice(1).split('/'),chain=[];let current='/'
  for(let i=0;i<parts.length;i++){
    const parent=lstatSync(current)
    assertDescriptivePatchOperatorFileMetadata(metadata(parent),i===parts.length-1?'private-directory':'directory')
    if(['package.json','pnpm-workspace.yaml','.git','pyproject.toml'].some(name=>exists(path.join(current,name))))fail('private_file_required')
    chain.push({path:current,dev:parent.dev,ino:parent.ino,mode:parent.mode,uid:parent.uid,gid:parent.gid})
    current=path.join(current,parts[i])
    if(create&&i===parts.length-1){if(exists(current))fail('journal_exists');return {file,chain}}
  }
  const st=lstatSync(current)
  assertDescriptivePatchOperatorFileMetadata(metadata(st),allowEmptyJournal?'journal-file':'private-file',maxBytes)
  if(realpathSync(current)!==file)fail('private_file_required')
  return {file,chain,stat:stamp(st)}
}
function verifyChain(saved,current){
  if(saved.chain.length!==current.chain.length||saved.chain.some((d,i)=>!same(d,current.chain[i])))fail('private_file_changed')
}
function fdBytes(fd,maxBytes,collect,allowEmptyJournal=false){
  const before=fstatSync(fd)
  assertDescriptivePatchOperatorFileMetadata(metadata(before),allowEmptyJournal?'journal-file':'private-file',maxBytes)
  const hash=createHash('sha256'),chunks=[],chunk=Buffer.alloc(65536);let offset=0
  while(offset<=before.size){
    const count=readSync(fd,chunk,0,Math.min(chunk.length,before.size+1-offset),offset)
    if(count===0)break
    offset+=count;if(offset>maxBytes||offset>before.size)fail('private_file_changed')
    hash.update(chunk.subarray(0,count));if(collect)chunks.push(Buffer.from(chunk.subarray(0,count)))
  }
  const after=stamp(fstatSync(fd))
  if(offset!==before.size||!same(stamp(before),after))fail('private_file_changed')
  return {sha256:hash.digest('hex'),raw:collect?Buffer.concat(chunks):undefined,stat:after}
}
function readPrivate(file,expected,maxBytes=maxJson,collect=true){
  if(!isSha(expected))fail('incomplete_configuration')
  const before=privatePath(file,false,maxBytes),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try{
    if(!same(before.stat,stamp(fstatSync(fd))))fail('private_file_changed')
    const result=fdBytes(fd,maxBytes,collect),after=privatePath(file,false,maxBytes)
    verifyChain(before,after)
    if(!same(result.stat,after.stat)||result.sha256!==expected)fail('evidence_changed')
    return {raw:result.raw,receipt:Object.freeze({file,expected,maxBytes,collect,chain:before.chain,stat:result.stat})}
  }finally{closeSync(fd)}
}
function verifyReceipts(receipts){
  for(const receipt of receipts){
    const current=readPrivate(receipt.file,receipt.expected,receipt.maxBytes,false).receipt
    verifyChain(receipt,current)
    if(!same(receipt.stat,current.stat))fail('private_file_changed')
  }
}
function utf8(raw,max=maxJson){
  const bytes=typeof raw==='string'?Buffer.from(raw):raw instanceof Uint8Array?Buffer.from(raw):undefined
  if(!bytes||bytes.length<1||bytes.length>max)fail('invalid_evidence')
  const text=bytes.toString('utf8')
  if(!Buffer.from(text).equals(bytes)||text.startsWith('\uFEFF')||text.includes('\0')||typeof raw==='string'&&text!==raw)fail('invalid_evidence')
  return text
}
// Bounded JSON grammar: duplicate decoded keys (including Unicode escapes),
// prototype keys, unsafe numbers, invalid UTF8 and non-JSON trailing text refuse.
export function parseDescriptivePatchOperatorJson(raw){
  const text=utf8(raw);let index=0,nodes=0
  const space=()=>{while(/[ \t\r\n]/.test(text[index]??'!'))index++}
  const string=()=>{
    const start=index++
    for(;index<text.length;index++){
      if(text[index]==='\\'){index++;continue}
      if(text[index]==='"'){
        const token=text.slice(start,++index);let value
        try{value=JSON.parse(token)}catch{fail('invalid_evidence')}
        if(typeof value!=='string'||Buffer.from(value).toString('utf8')!==value||value.includes('\0'))fail('invalid_evidence')
        return value
      }
    }
    fail('invalid_evidence')
  }
  const value=depth=>{
    if(depth>32||++nodes>4096)fail('invalid_evidence')
    space();const ch=text[index]
    if(ch==='"')return string()
    if(ch==='{'){
      index++;space();const object={},keys=new Set()
      if(text[index]==='}'){index++;return Object.freeze(object)}
      for(;;){
        space();if(text[index]!=='"')fail('invalid_evidence')
        const key=string()
        if(keys.has(key)||['__proto__','prototype','constructor'].includes(key))fail('invalid_evidence')
        keys.add(key);space();if(text[index++]!==':')fail('invalid_evidence')
        Object.defineProperty(object,key,{value:value(depth+1),enumerable:true,writable:false,configurable:false})
        space();if(text[index]==='}'){index++;return Object.freeze(object)}
        if(text[index++]!==',')fail('invalid_evidence')
      }
    }
    if(ch==='['){
      index++;space();const array=[]
      if(text[index]===']'){index++;return Object.freeze(array)}
      for(;;){array.push(value(depth+1));space();if(text[index]===']'){index++;return Object.freeze(array)}if(text[index++]!==',')fail('invalid_evidence')}
    }
    for(const [token,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,index)){index+=token.length;return result}
    const match=text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)
    if(!match)fail('invalid_evidence')
    index+=match[0].length;const number=Number(match[0])
    if(!Number.isSafeInteger(number)||Object.is(number,-0))fail('invalid_evidence')
    return number
  }
  const result=value(0);space();if(index!==text.length)fail('invalid_evidence')
  return result
}
const recordKeys=['format','source_sha256','system_identifier','database_oid','predecessor_schema_sha256','nonce','backend_pid','backend_start','phase']
function journalRecord(raw){
  const r=closed(raw,recordKeys)
  if(r.format!=='agent_descriptive_patch_operator_journal_v1'||!isSha(r.source_sha256)||!isSha(r.predecessor_schema_sha256)||
    ![r.system_identifier,r.database_oid].every(v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v))||
    typeof r.nonce!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.nonce)||!Number.isSafeInteger(r.backend_pid)||r.backend_pid<1||
    typeof r.backend_start!=='string'||!r.backend_start||r.backend_start.length>128||r.backend_start.includes('\0')||Buffer.from(r.backend_start).toString('utf8')!==r.backend_start||
    !['before_ddl','commit_pending','commit_unknown','commit_acknowledged'].includes(r.phase))fail('invalid_journal')
  return Object.freeze(Object.fromEntries(recordKeys.map(k=>[k,r[k]])))
}
export function formatDescriptivePatchOperatorJournalLine(raw,sequence,previousSha256){
  if(!Number.isSafeInteger(sequence)||sequence<0||sequence>2||!isSha(previousSha256))fail('invalid_journal')
  const record=journalRecord(raw)
  const line=JSON.stringify({format:'agent_descriptive_patch_operator_journal_entry_v1',sequence,previous_sha256:previousSha256,record})+'\n'
  return Object.freeze({line,sha256:sha(line)})
}
export function parseDescriptivePatchOperatorJournalFile(raw,bindingSha256){
  if(!isSha(bindingSha256))fail('invalid_journal')
  const text=utf8(raw),lines=text.split('\n')
  if(lines.pop()!==''||lines.length<1||lines.length>3||text.includes('\r'))fail('invalid_journal')
  let previous=bindingSha256;const records=[]
  for(const [index,line] of lines.entries()){
    const entry=closed(parseDescriptivePatchOperatorJson(line),['format','sequence','previous_sha256','record'])
    if(entry.format!=='agent_descriptive_patch_operator_journal_entry_v1'||entry.sequence!==index||entry.previous_sha256!==previous)fail('invalid_journal')
    const canonical=formatDescriptivePatchOperatorJournalLine(entry.record,index,previous)
    if(canonical.line!==line+'\n')fail('invalid_journal')
    previous=canonical.sha256;records.push(journalRecord(entry.record))
  }
  const first=records[0]
  if(first.phase!=='before_ddl'||records.some((r,i)=>['source_sha256','system_identifier','database_oid','predecessor_schema_sha256','nonce','backend_pid','backend_start'].some(k=>r[k]!==first[k])||
    i===1&&r.phase!=='commit_pending'||i===2&&!['commit_unknown','commit_acknowledged'].includes(r.phase)))fail('invalid_journal')
  return Object.freeze({records:Object.freeze(records),sha256:sha(text),last_entry_sha256:previous})
}
function assertDeployment(snapshot){
  requireRoot()
  const files=[...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql,snapshot.manifest.predecessor.manifest.sql]
  const seen=new Set()
  for(const entry of files){
    if(seen.has(entry.path))continue
    seen.add(entry.path)
    if(typeof entry.path!=='string'||path.posix.normalize(entry.path)!==entry.path||entry.path.startsWith('/')||entry.path.split('/').includes('..')||!isSha(entry.sha256))fail('deployment_refused')
    const file=path.join(root,entry.path);let current=file
    for(;;){const st=lstatSync(current);assertDescriptivePatchOperatorFileMetadata(metadata(st),current===file?'source-file':'directory',4*1024*1024);const parent=path.dirname(current);if(parent===current)break;current=parent}
    if(realpathSync(file)!==file)fail('deployment_refused')
    const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try{
      const before=fstatSync(fd);assertDescriptivePatchOperatorFileMetadata(metadata(before),'source-file',4*1024*1024)
      const bytes=Buffer.alloc(before.size),count=readSync(fd,bytes,0,bytes.length,0)
      if(count!==bytes.length||!same(stamp(before),stamp(fstatSync(fd)))||sha(bytes)!==entry.sha256)fail('deployment_refused')
    }finally{closeSync(fd)}
  }
  const parser=fileURLToPath(import.meta.resolve('typescript'));let current=parser
  for(;;){const st=lstatSync(current);assertDescriptivePatchOperatorFileMetadata(metadata(st),current===parser?'source-file':'directory',16*1024*1024);const parent=path.dirname(current);if(parent===current)break;current=parent}
  const fd=openSync(parser,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try{const before=fstatSync(fd);assertDescriptivePatchOperatorFileMetadata(metadata(before),'source-file',16*1024*1024);const bytes=Buffer.alloc(before.size);if(realpathSync(parser)!==parser||readSync(fd,bytes,0,bytes.length,0)!==bytes.length||!same(stamp(before),stamp(fstatSync(fd)))||sha(bytes)!==snapshot.manifest.parser.sha256)fail('deployment_refused')}
  finally{closeSync(fd)}
}
function assertEntrySealed(snapshot){
  const cli='services/pg-api/src/agent-descriptive-patch-operator-cli.mjs'
  const declaration='services/pg-api/src/agent-descriptive-patch-operator-cli.d.mts'
  const core='services/pg-api/src/agent-descriptive-patch-operator-core.ts'
  const source='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'
  const paths=new Set(snapshot.manifest.sources.map(s=>s.path)),edges=snapshot.manifest.imports
  if(![cli,declaration,core].every(p=>paths.has(p))||!edges.some(e=>e.from===cli&&e.to===core)||!edges.some(e=>e.from===core&&e.to===source))fail('unsealed_operator_source')
}
function createJournal(file,binding,approval,core,boundary){
  const before=privatePath(file,true),fd=openSync(file,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600)
  let directory,failed=false,closed=false,contents='',previous=binding,records=[]
  const check=()=>{
    if(failed||closed)fail('journal_changed')
    const actual=privatePath(file,false,maxJson,true),st=fstatSync(fd)
    verifyChain(before,actual)
    if(st.dev!==actual.stat.dev||st.ino!==actual.stat.ino)fail('journal_changed')
    const readback=fdBytes(fd,maxJson,true,true)
    if(readback.sha256!==sha(contents)||readback.raw.toString('utf8')!==contents)fail('journal_changed')
    return readback.sha256
  }
  try{
    const initial=fstatSync(fd)
    // Empty newly created journal is allowed only before its first record.
    if(initial.uid!==0||initial.gid!==0||(initial.mode&0o7777)!==0o600||initial.nlink!==1||!initial.isFile()||initial.size!==0)fail('private_file_required')
    directory=openSync(path.dirname(file),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW)
    const ds=fstatSync(directory),expected=before.chain.at(-1)
    if(ds.dev!==expected.dev||ds.ino!==expected.ino)fail('private_file_changed')
    fsyncSync(fd);fsyncSync(directory)
    const persist=async raw=>{
      try{
        boundary()
        check()
        const actual=lstatSync(file),held=fstatSync(fd)
        if(actual.isSymbolicLink()||actual.dev!==held.dev||actual.ino!==held.ino||held.size!==Buffer.byteLength(contents)||held.uid!==0||held.gid!==0||(held.mode&0o7777)!==0o600||held.nlink!==1)fail('journal_changed')
        const next=journalRecord(raw)
        core.parseDescriptivePatchOperatorJournalRecords([...records,next],approval)
        const formatted=formatDescriptivePatchOperatorJournalLine(next,records.length,previous),bytes=Buffer.from(formatted.line),start=Buffer.byteLength(contents)
        let offset=0
        while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset,start+offset);if(count<=0)fail('journal_write_failed');offset+=count}
        fsyncSync(fd);fsyncSync(directory)
        const expectedText=contents+formatted.line,current=privatePath(file,false),back=fdBytes(fd,maxJson,true)
        verifyChain(before,current)
        if(back.stat.dev!==current.stat.dev||back.stat.ino!==current.stat.ino||back.sha256!==sha(expectedText)||back.raw.toString('utf8')!==expectedText)fail('journal_changed')
        contents=expectedText;previous=formatted.sha256;records.push(next)
        boundary()
      }catch(error){failed=true;throw error}
    }
    return {persist,verify:check,get sha256(){return sha(contents)},get last(){return records.at(-1)},close(){if(!closed){closed=true;try{closeSync(fd)}finally{closeSync(directory)}}}}
  }catch(error){try{closeSync(fd)}finally{if(directory!==undefined)closeSync(directory)}throw error}
}
export async function runDescriptivePatchOperatorCli(argv,env=process.env){
  const cfg=parseDescriptivePatchOperatorCliArguments(argv,env),args=Object.freeze(argvValues(argv))
  if(cfg.mode!=='plan'&&env!==process.env)fail('ambient_configuration_refused')
  const snapshot=await captureDescriptivePatchOperatorSources()
  assertDescriptivePatchOperatorSnapshot(snapshot,cfg.expected_source_sha256)
  if(cfg.mode==='plan')return Object.freeze({...descriptivePatchOperatorPlan(snapshot),expected_source_sha256:cfg.expected_source_sha256,
    operator_execution_verified:false})
  requireRoot()
  if(process.execArgv.some(arg=>arg!=='--experimental-strip-types'))fail('ambient_configuration_refused')
  // Coverage and root-owned immutable source bytes precede loading new core.
  assertEntrySealed(snapshot)
  assertDeployment(snapshot)
  const core=await import('./agent-descriptive-patch-operator-core.ts')
  core.assertDescriptivePatchOperatorSealedSnapshot(snapshot,cfg.expected_source_sha256)
  assertDeployment(snapshot)
  const receipts=[]
  const json=(file,expected)=>{const result=readPrivate(file,expected);receipts.push(result.receipt);return parseDescriptivePatchOperatorJson(result.raw)}
  const approval=core.parseDescriptivePatchOperatorApproval(json(cfg.files.APPROVAL_FILE,cfg.approval_sha256),snapshot,cfg.expected_source_sha256)
  const predecessor=await captureGeneratedOperatorSources()
  assertGeneratedOperatorSnapshot(predecessor,predecessorSha)
  const original=await import('./agent-generated-operator-core.ts')
  const predecessorApproval=original.parseGeneratedOperatorApproval(json(cfg.files.PREDECESSOR_APPROVAL_FILE,cfg.predecessor_approval_sha256),predecessor)
  const backup=json(cfg.files.BACKUP_MANIFEST_FILE,approval.backup_manifest_sha256),restore=json(cfg.files.RESTORE_EVIDENCE_FILE,approval.restore_evidence_sha256)
  const archive=readPrivate(cfg.files.BACKUP_ARCHIVE_FILE,approval.backup_archive_sha256,maxArchive,false);receipts.push(archive.receipt)
  // These are the ACTUAL strict-decoded private-file objects and actual raw
  // hashes. No constructed passed/backup/restore object or058 metadata alias.
  original.verifyGeneratedOperatorBackupEvidence(predecessorApproval,backup,restore,approval.backup_manifest_sha256,approval.restore_evidence_sha256)
  const capability=core.authorizeDescriptivePatchOperator(snapshot,approval,predecessor,predecessorApproval,cfg.mode==='apply'?'install':'read')
  const binding=sha(JSON.stringify({format:'agent_descriptive_patch_operator_journal_binding_v1',source_sha256:cfg.expected_source_sha256,
    approval_sha256:cfg.approval_sha256,predecessor_approval_sha256:cfg.predecessor_approval_sha256}))
  let recovered
  if(cfg.mode==='recover'){
    const raw=readPrivate(cfg.journal_file,cfg.journal_sha256);receipts.push(raw.receipt)
    recovered=parseDescriptivePatchOperatorJournalFile(raw.raw,binding)
    core.parseDescriptivePatchOperatorJournalRecords(recovered.records,approval)
  }
  const credential=readPrivate(cfg.files.ADMIN_PASSWORD_FILE,cfg.admin_password_sha256,514);receipts.push(credential.receipt)
  const boundary=()=>{
    requireRoot()
    if(JSON.stringify(parseDescriptivePatchOperatorCliArguments(args,env))!==JSON.stringify(cfg))fail('configuration_changed')
    core.assertDescriptivePatchOperatorAuthorization(snapshot,capability)
    assertDeployment(snapshot);verifyReceipts(receipts)
    core.assertDescriptivePatchOperatorAuthorization(snapshot,capability)
  }
  let writer,pool,result,failure,state
  try{
    const password=utf8(credential.raw,514).replace(/\r?\n$/,'')
    if(!password||/[\r\n\0]/.test(password))fail('invalid_evidence')
    boundary()
    if(cfg.mode==='apply')writer=createJournal(cfg.journal_file,binding,approval,core,boundary)
    boundary()
    const {Pool}=await import('pg')
    pool=new Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user:'postgres',password,ssl:false,options:'',max:1,
      connectionTimeoutMillis:5000,statement_timeout:45000,application_name:'agent_descriptive_patch_060_operator'})
    state=cfg.mode==='apply'?await core.applyDescriptivePatchOperator(pool,snapshot,capability,writer.persist):
      cfg.mode==='recover'?await core.recoverDescriptivePatchOperator(pool,snapshot,capability,recovered.records):await core.inspectDescriptivePatchOperator(pool,snapshot,capability)
    boundary();if(writer)writer.verify()
    result=Object.freeze({mode:cfg.mode,...state,network_used:true,writes_performed:cfg.mode==='apply',
      ...(writer?{journal_sha256:writer.sha256}:recovered?{journal_sha256:recovered.sha256}:{})})
  }catch(error){failure=error}
  finally{
    credential.raw.fill(0)
    try{writer?.close()}catch(error){if(!failure)failure=error}
    try{await pool?.end()}catch(error){if(!failure)failure=error}
  }
  if(failure){
    if(state?.invocation_commit_acknowledged===true&&writer?.last)throw new core.DescriptivePatchOperatorInstalledUnverified(writer.last)
    throw failure
  }
  return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runDescriptivePatchOperatorCli(process.argv.slice(2)))+'\n')}
  catch(error){const code=error instanceof Error&&/^descriptive_patch_operator_[a-z_]+$/.test(error.message)?error.message:'descriptive_patch_operator_refused';process.stderr.write('DESCRIPTIVE_PATCH_060_REFUSED:'+code+'\n');process.exitCode=1}
}
