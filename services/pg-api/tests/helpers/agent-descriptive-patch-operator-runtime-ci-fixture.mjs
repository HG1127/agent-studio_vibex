// Import-safe builtins ONLY. This test helper must never be a production import.
// Input manifests are supplied and raw-SHA pinned by the hosted workflow before
// this process starts. No manifest generator, signer, installer, SQL or backup.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createRequire,getCompileCacheDir} from 'node:module'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import net from 'node:net'
import tls from 'node:tls'
import dgram from 'node:dgram'

const here=fileURLToPath(import.meta.url),prefix='AGENT_STUDIO_DESCRIPTIVE_OPERATOR_RUNTIME_CI_'
const repository='HG1127/agent-studio_vibex',workflow='Agent Studio PG18 descriptive operator isolated verification',job='pg18-descriptive-operator-runtime'
const sourceSha='daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247'
const predecessorSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const sql060='db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql',sql059='db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql',sql050='db/postgres/migrations/pg_v9_050_agent_memory_context.sql'
const sqlPins={
  [sql060]:'b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9',
  [sql059]:'74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063',
  [sql050]:'d7889f7dc7be4cd6a8d6d00d2895a1c954c29da6d66d1b55ba02534e43275c89',
}
const modules='services/pg-api/node_modules/',parser=modules+'typescript/'
const parserPins={
  'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675',
  'package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6',
  'LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
  'ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c',
}
const packages={pg:['8.23.1','lib/index.js'],'pg-cloudflare':['1.4.1','dist/empty.js'],'pg-connection-string':['2.14.1','index.js'],'pg-int8':['1.0.1','index.js'],
  'pg-pool':['3.14.0','index.js'],'pg-protocol':['1.16.1','dist/index.js'],'pg-types':['2.2.0','index.js'],pgpass:['1.0.5','lib/index.js'],
  'postgres-array':['2.0.0','index.js'],'postgres-bytea':['1.0.1','index.js'],'postgres-date':['1.0.7','index.js'],'postgres-interval':['1.2.0','index.js'],split2:['4.2.0','index.js'],xtend:['4.0.2','immutable.js']}
const sealed=new WeakSet(),sha=value=>createHash('sha256').update(value).digest('hex')
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,31}$/.test(value)
const refuse=phase=>{throw Error('descriptive_operator_runtime_ci_refused:'+phase)}
const envKeys=['EPHEMERAL','PURPOSE','APPROVED','NONCE','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256']
const githubKeys=['GITHUB_ACTIONS','CI','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']

export function requireDescriptiveOperatorRuntimeCi(env=process.env){
  // Check host/environment FIRST. In particular, no source reads or writes on
  // an ordinary machine. Secret-looking environment entries are rejected by
  // NAME without reading their values; no production approval is consumed.
  if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||
    process.execArgv.some(value=>value!=='--experimental-strip-types')||getCompileCacheDir()!==undefined)refuse('host')
  for(const key of Object.keys(env))if(/PASSWORD|SECRET|CREDENTIAL|BACKUP|RESTORE|TOKEN|APPROVAL/.test(key)||
    key==='DATABASE_URL'||/^PG(?:[A-Z_]|$)|^NODE_PG_/.test(key)||
    ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','DYLD_LIBRARY_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key)||
    key.startsWith(prefix)&&!envKeys.includes(key.slice(prefix.length)))refuse('environment_key')
  if(env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!==repository||
    env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||!positive(env.GITHUB_RUN_ID)||!positive(env.GITHUB_RUN_ATTEMPT)||
    env[prefix+'EPHEMERAL']!=='true'||env[prefix+'PURPOSE']!=='DESCRIPTIVE_060_RUNTIME_DEPENDENCIES_ONLY'||env[prefix+'APPROVED']!=='YES_DISPOSABLE_DEPENDENCY_LOAD_ONLY'||
    !['NONCE','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256'].every(key=>hex(env[prefix+key])))refuse('environment')
  // Actual network-none container facts; no socket is opened for attestation.
  if(!fs.lstatSync('/.dockerenv').isFile()||JSON.stringify(fs.readdirSync('/sys/class/net').sort())!==JSON.stringify(['lo'])||
    fs.readFileSync('/proc/net/route','utf8').trim().split('\n').length!==1)refuse('network_none_container')
  const run=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT,nonce=env[prefix+'NONCE']
  const proof=Object.freeze({run,attempt,nonce,sourceManifestSha:env[prefix+'SOURCE_MANIFEST_SHA256'],runtimeManifestSha:env[prefix+'RUNTIME_MANIFEST_SHA256'],
    input:'/opt/agentstudio-descriptive-runtime-input/'+run+'-'+attempt+'-'+nonce,
    work:'/opt/agentstudio-descriptive-runtime-cases/'+run+'-'+attempt+'-'+nonce,
    childEnv:Object.freeze(Object.fromEntries([...githubKeys,...envKeys.map(key=>prefix+key)].map(key=>[key,env[key]]).concat([['PATH','/usr/local/bin:/usr/bin:/bin'],['HOME','/nonexistent'],['LANG','C.UTF-8']]))),
  })
  sealed.add(proof);return proof
}
const scenarios=[
  ['positive-pool-load','load',true],['positive-cjs-cycle','cycle',true],['positive-lazy-and-repeat','lazy',true],
  ['negative-extra-file','verify'],['negative-missing-file','verify'],['negative-code-mode','verify'],['negative-directory-mode','verify'],
  ['negative-symlink','verify'],['negative-hardlink','verify'],['negative-rename-after-verify','assert'],['negative-hash-after-verify','assert'],
  ['negative-source-hash','capture'],['negative-raw060','capture'],['negative-parser-hash','capture'],['negative-manifest-hash','verify'],
  ['negative-manifest-mode','verify'],['negative-lock-hash','verify'],['negative-preloaded-cache','verify'],['negative-replaced-cache','assert'],
  ['negative-replaced-exports','assert'],['negative-mutated-exports','assert'],['negative-deleted-cache','assert'],['negative-ancestor','require'],
  ['negative-force-native','load'],['negative-esm','import'],['negative-native-getter','require'],['negative-native-require','require'],['negative-second-verification','verify'],
]
export const descriptiveOperatorRuntimeCiCases=Object.freeze(scenarios.map(([id,phase,positive=false])=>Object.freeze({id,phase,positive})))
function requireProof(proof){if(!sealed.has(proof))refuse('unsealed')}
function privatePath(file,{directory=false,mode}={}){
  if(typeof file!=='string'||!file.startsWith('/opt/')||path.normalize(file)!==file||/[\x00-\x1f\\]/.test(file))refuse('path')
  let current='/'
  const rootStat=fs.lstatSync(current);if(!rootStat.isDirectory()||rootStat.uid!==0||rootStat.gid!==0||(rootStat.mode&0o7022)!==0)refuse('root_ancestor')
  for(const part of file.split('/').filter(Boolean)){current=path.join(current,part);const st=fs.lstatSync(current);if(st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7022)!==0)refuse('owner_or_ancestor')}
  const st=fs.lstatSync(file)
  if(directory?!st.isDirectory():!st.isFile()||st.nlink!==1)refuse('file_type')
  if(mode!==undefined&&(st.mode&0o7777)!==mode)refuse('file_mode')
  if(fs.realpathSync(file)!==file)refuse('realpath')
  return st
}
function read(file,expected,max=16*1024*1024,mode){
  const before=privatePath(file,{mode});if(before.size<1||before.size>max)refuse('file_size')
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),again=fs.lstatSync(file)
    for(const key of ['dev','ino','size','mode','uid','gid','nlink','mtimeMs','ctimeMs'])if(before[key]!==after[key]||before[key]!==again[key])refuse('input_changed')
    if(expected&&sha(bytes)!==expected||bytes.length!==before.size||bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes))refuse('input_hash_or_encoding')
    return bytes
  }finally{fs.closeSync(fd)}
}
const sourcePath=value=>typeof value==='string'&&/^(?:services\/pg-api\/src\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js)|shared\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js)|db\/postgres\/[a-zA-Z0-9_./-]+\.sql)$/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..')
function inputs(proof){
  requireProof(proof);privatePath(proof.input,{directory:true,mode:0o700})
  const sourceRaw=read(proof.input+'/source-manifest.json',proof.sourceManifestSha,2*1024*1024,0o600),runtimeRaw=read(proof.input+'/runtime-manifest.json',proof.runtimeManifestSha,2*1024*1024,0o600)
  const source=JSON.parse(sourceRaw),runtime=JSON.parse(runtimeRaw),files=new Map()
  if(sha(JSON.stringify(source))!==sourceSha||source.format!=='agent_descriptive_patch_operator_sources_v1'||source.latest_migration!=='pg_v9_060'||source.default_fresh_latest!=='pg_v9_050'||
    source.sources?.length!==55||source.imports?.length!==119||source.fresh_sources?.length!==34||source.predecessor?.source_sha256!==predecessorSha||
    sha(JSON.stringify(source.predecessor.manifest))!==predecessorSha||JSON.stringify(source.fresh_sources)!==JSON.stringify(source.predecessor.manifest.fresh_sources))refuse('source_manifest')
  for(const file of [...source.sources,...source.fresh_sources,source.sql,source.predecessor.manifest.sql]){
    if(!file||!sourcePath(file.path)||!hex(file.sha256)||files.has(file.path)&&files.get(file.path).sha256!==file.sha256)refuse('source_record')
    files.set(file.path,{path:file.path,sha256:file.sha256})
  }
  for(const [file,pin]of Object.entries(sqlPins))if(files.get(file)?.sha256!==pin)refuse('sql_pin')
  for(const name of ['core.ts','cli.mjs','cli.d.mts','runtime.mjs','runtime.d.mts'])if(!files.has('services/pg-api/src/agent-descriptive-patch-operator-'+name))refuse('source_root')
  const names=Object.keys(packages).sort()
  if(runtime.format!=='agent_descriptive_patch_operator_runtime_v1'||runtime.lock_sha256!==lockSha||runtime.pg_version!=='8.23.1'||
    JSON.stringify(runtime.packages)!==JSON.stringify(names.map(name=>({name,version:packages[name][0]})))||!Array.isArray(runtime.files)||runtime.files.length<28||runtime.files.length>2048)refuse('runtime_manifest')
  const runtimeFiles=new Set();let previous='',total=0
  for(const file of runtime.files){
    if(!file||Object.keys(file).sort().join(',')!=='bytes,path,sha256'||typeof file.path!=='string'||!file.path.startsWith(modules)||
      !/^[a-zA-Z0-9_@./+-]+$/.test(file.path)||file.path.split('/').some(part=>!part||part==='.'||part==='..')||file.path.slice(modules.length).split('/').includes('node_modules')||
      !Object.hasOwn(packages,file.path.slice(modules.length).split('/')[0])||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(file.path)||
      !hex(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>8*1024*1024||file.path<=previous||files.has(file.path))refuse('runtime_record')
    previous=file.path;total+=file.bytes;runtimeFiles.add(file.path);files.set(file.path,file)
  }
  if(total>32*1024*1024||!runtimeFiles.has(modules+'pg/esm/index.mjs'))refuse('runtime_bounds')
  for(const name of names)for(const suffix of ['package.json',packages[name][1]])if(!runtimeFiles.has(modules+name+'/'+suffix))refuse('runtime_entry')
  for(const [file,pin]of Object.entries(parserPins))files.set(parser+file,{path:parser+file,sha256:pin})
  files.set('services/pg-api/pnpm-lock.yaml',{path:'services/pg-api/pnpm-lock.yaml',sha256:lockSha})
  files.set('services/pg-api/package.json',{path:'services/pg-api/package.json',sha256:packageSha})
  const tree=proof.input+'/tree',seen=new Set(),directories=new Set([''])
  for(const relative of files.keys()){const parts=relative.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'))}
  const walk=relative=>{privatePath(path.join(tree,relative),{directory:true});for(const name of fs.readdirSync(path.join(tree,relative))){
    const next=relative?relative+'/'+name:name,st=fs.lstatSync(tree+'/'+next)
    if(st.isSymbolicLink())refuse('input_link')
    if(st.isDirectory()){if(!directories.has(next))refuse('input_extra_directory');walk(next)}
    else {const record=files.get(next);if(!record||seen.has(next))refuse('input_extra_file');const bytes=read(tree+'/'+next,record.sha256);if(record.bytes!==undefined&&bytes.length!==record.bytes)refuse('input_bytes');seen.add(next)}
  }}
  walk('');if(seen.size!==files.size)refuse('input_missing_file')
  return {files,sourceRaw,runtimeRaw,tree}
}
function mkdirPrivate(directory){
  try{fs.mkdirSync(directory,{mode:0o700})}catch(error){if(error.code!=='EEXIST')throw error}
  privatePath(directory,{directory:true,mode:0o700})
}
function writeNew(file,bytes,mode){
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,mode)
  try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function stage(proof,id){
  const input=inputs(proof)
  mkdirPrivate('/opt/agentstudio-descriptive-runtime-cases');mkdirPrivate(proof.work)
  const home=proof.work+'/'+id;fs.mkdirSync(home,{mode:0o700});privatePath(home,{directory:true,mode:0o700})
  const root=home+'/source',evidence=home+'/evidence';fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(evidence,{mode:0o700})
  const directories=new Set([root])
  for(const [relative,record]of input.files){
    const file=root+'/'+relative;fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700})
    let dir=path.dirname(file);while(dir.startsWith(root)){directories.add(dir);if(dir===root)break;dir=path.dirname(dir)}
    const raw=read(input.tree+'/'+relative,record.sha256);writeNew(file,raw,0o444)
    const st=privatePath(file,{mode:0o444});if(st.nlink!==1||st.ino===fs.lstatSync(input.tree+'/'+relative).ino&&st.dev===fs.lstatSync(input.tree+'/'+relative).dev)refuse('copy_is_not_independent')
  }
  for(const dir of [...directories].sort((a,b)=>b.length-a.length))fs.chmodSync(dir,0o555)
  writeNew(evidence+'/runtime-manifest.json',input.runtimeRaw,0o600)
  // Pin is the original externally approved byte SHA, never this new copy's
  // freshly calculated SHA. Mutations below NEVER rewrite it or re-sign inputs.
  assert.equal(sha(read(evidence+'/runtime-manifest.json',proof.runtimeManifestSha)),proof.runtimeManifestSha)
  return {root,evidence,options:{manifestFile:evidence+'/runtime-manifest.json',manifestSha256:proof.runtimeManifestSha,lockSha256:lockSha}}
}
function blockDatabaseIo(){
  let calls=0
  const blocked=()=>{calls++;throw Error('descriptive_runtime_ci_database_io_forbidden')}
  net.Socket.prototype.connect=blocked;net.connect=blocked;net.createConnection=blocked;tls.connect=blocked;dgram.createSocket=blocked
  return ()=>calls
}
const runtimeCode='descriptive_patch_operator_runtime_refused',sourceCode='descriptive_patch_operator_source_refused'
function expectRefusal(operation,code=runtimeCode){let caught;assert.throws(operation,error=>{caught=error;return error?.message===code});return caught.message}
async function expectAsyncRefusal(operation,code=runtimeCode){let caught;await assert.rejects(operation,error=>{caught=error;return error?.message===code});return caught.message}
function mutateBytes(file){const raw=fs.readFileSync(file);raw[raw.length-1]^=1;fs.writeFileSync(file,raw)}

async function executeCase(proof,id){
  requireProof(proof);const scenario=descriptiveOperatorRuntimeCiCases.find(value=>value.id===id);if(!scenario)refuse('case')
  const databaseCalls=blockDatabaseIo(),s=stage(proof,id),absolute=relative=>s.root+'/'+relative,entry=absolute(modules+'pg/lib/index.js'),code=absolute(modules+'pg/lib/defaults.js')
  const from=relative=>import(pathToFileURL(absolute(relative)).href)
  const source=await from('services/pg-api/src/agent-descriptive-patch-operator-source.mjs')
  let rejection,verified=false
  if(scenario.phase==='capture'){
    const file=id==='negative-parser-hash'?absolute(parser+'lib/typescript.js'):id==='negative-raw060'?absolute(sql060):absolute('services/pg-api/src/agent-descriptive-patch-operator-cli.mjs')
    fs.appendFileSync(file,'\n')
    rejection=await expectAsyncRefusal(async()=>{const snapshot=await source.captureDescriptivePatchOperatorSources();source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)},sourceCode)
  }else{
    const snapshot=await source.captureDescriptivePatchOperatorSources();source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
    const runtime=await from('services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs'),require=createRequire(pathToFileURL(entry))
    const verify=()=>runtime.verifyDescriptivePatchOperatorRuntime(snapshot,sourceSha,s.options)
    if(id==='negative-extra-file')writeNew(absolute(modules+'pg/unapproved.js'),Buffer.from('throw Error("unapproved")\n'),0o444)
    if(id==='negative-missing-file')fs.unlinkSync(code)
    if(id==='negative-code-mode')fs.chmodSync(code,0o644)
    if(id==='negative-directory-mode')fs.chmodSync(absolute(modules+'pg/lib'),0o755)
    if(id==='negative-symlink'){fs.renameSync(code,s.evidence+'/held-code.js');fs.symlinkSync(s.evidence+'/held-code.js',code)}
    if(id==='negative-hardlink')fs.linkSync(code,s.evidence+'/linked-code.js')
    if(id==='negative-manifest-hash')fs.appendFileSync(s.options.manifestFile,'\n')
    if(id==='negative-manifest-mode')fs.chmodSync(s.options.manifestFile,0o644)
    if(id==='negative-lock-hash')fs.appendFileSync(absolute('services/pg-api/pnpm-lock.yaml'),'\n')
    if(id==='negative-preloaded-cache'){assert.equal(typeof require(entry).Pool,'function');assert.ok(require.cache[entry]?.loaded)}
    if(scenario.phase==='verify'&&id!=='negative-second-verification')rejection=expectRefusal(verify)
    else{
      const cap=verify();verified=true
      if(id==='negative-second-verification')rejection=expectRefusal(verify)
      else if(id==='negative-rename-after-verify'){fs.renameSync(code,s.evidence+'/held-code.js');writeNew(code,fs.readFileSync(s.evidence+'/held-code.js'),0o444);rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
      else if(id==='negative-hash-after-verify'){mutateBytes(code);rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
      else if(id==='negative-force-native'){process.env.NODE_PG_FORCE_NATIVE='1';rejection=expectRefusal(()=>runtime.loadDescriptivePatchOperatorPg(cap));delete process.env.NODE_PG_FORCE_NATIVE}
      else{
        const handle=runtime.loadDescriptivePatchOperatorPg(cap),pg=require.cache[entry]?.exports
        assert.equal(typeof handle.Pool,'function');assert.strictEqual(pg.Pool,handle.Pool)
        const pool=new handle.Pool({max:1,allowExitOnIdle:true});assert.equal(pool.totalCount,0);assert.equal(pool.idleCount,0);await pool.end()
        if(id==='positive-cjs-cycle'){
          const base=require.cache[absolute(modules+'pg-pool/index.js')]?.exports;assert.equal(typeof base,'function')
          // Actual pg-pool constructor lazily requires its pg peer: a real
          // pg -> pg-pool -> pg CJS back edge, without connecting a Client.
          const cycle=new base({max:1});assert.strictEqual(cycle.Client,pg.Client);await cycle.end()
        }
        if(id==='positive-lazy-and-repeat'){
          const lazy=absolute(modules+'pgpass/lib/index.js');assert.equal(require.cache[lazy],undefined)
          // Use the genuine client's declared lazy dependency route. Loading
          // pgpass does not call it or read HOME/.pgpass/credential contents.
          const pass=createRequire(pathToFileURL(absolute(modules+'pg/lib/client.js')))('pgpass')
          assert.equal(typeof pass,'function');assert.equal(require.cache[lazy]?.loaded,true)
          runtime.assertDescriptivePatchOperatorRuntime(cap);assert.strictEqual(runtime.loadDescriptivePatchOperatorPg(cap),handle)
        }
        if(id==='negative-replaced-cache'){require.cache[entry]={...require.cache[entry]};rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
        if(id==='negative-replaced-exports'){require.cache[entry].exports={};rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
        if(id==='negative-mutated-exports'){pg.unapproved=true;rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
        if(id==='negative-deleted-cache'){delete require.cache[entry];rejection=expectRefusal(()=>runtime.assertDescriptivePatchOperatorRuntime(cap))}
        if(id==='negative-ancestor'){
          const decoy=absolute('node_modules/pg-native');fs.mkdirSync(decoy,{recursive:true,mode:0o555})
          writeNew(decoy+'/package.json',Buffer.from('{"name":"pg-native","main":"index.js"}\n'),0o444)
          writeNew(decoy+'/index.js',Buffer.from('throw Error("ancestor_code_executed")\n'),0o444)
          rejection=expectRefusal(()=>require('pg-native'))
        }
        if(id==='negative-esm')rejection=await expectAsyncRefusal(()=>import(pathToFileURL(absolute(modules+'pg/esm/index.mjs')).href))
        if(id==='negative-native-getter')rejection=expectRefusal(()=>Object.getOwnPropertyDescriptor(pg,'native').get.call(pg))
        if(id==='negative-native-require')rejection=expectRefusal(()=>require('./native'))
        if(scenario.positive){runtime.assertDescriptivePatchOperatorRuntime(cap);assert.strictEqual(runtime.loadDescriptivePatchOperatorPg(cap),handle)}
      }
    }
  }
  assert.equal(databaseCalls(),0)
  if(!scenario.positive)assert.equal(rejection,scenario.phase==='capture'?sourceCode:runtimeCode)
  // A deliberately changed manifest must differ; its APPROVED pin still stays
  // identical. Every other case proves the raw copied manifest is unchanged.
  if(id!=='negative-manifest-hash')assert.equal(sha(fs.readFileSync(s.options.manifestFile)),proof.runtimeManifestSha)
  assert.equal(s.options.manifestSha256,proof.runtimeManifestSha)
  return {format:'descriptive_operator_runtime_ci_case_v1',case:id,phase:scenario.phase,result:scenario.positive?'verified':'refused',
    rejection_code:rejection,verified_before_rejection:verified,actual_posix_stage:true,approved_manifest_sha_unchanged:true,manifest_copy_unchanged:id!=='negative-manifest-hash',
    source_sha256:sourceSha,source_files:55,source_edges:119,database_calls:databaseCalls()}
}
export async function runDescriptiveOperatorRuntimeCiChild(proof,id){
  requireProof(proof);if(!descriptiveOperatorRuntimeCiCases.some(scenario=>scenario.id===id))refuse('case')
  return await new Promise((resolve,reject)=>{
    // A real script file, with exactly the only production-permitted execArgv.
    const child=spawn(process.execPath,['--experimental-strip-types',here,'--case',id],{env:proof.childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
    const out=[],err=[];let bytes=0,done=false
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result)}
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('descriptive_runtime_ci_child_timeout:'+id))},45000)
    for(const [stream,chunks]of [[child.stdout,out],[child.stderr,err]])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){child.kill('SIGKILL');finish(Error('descriptive_runtime_ci_child_output_limit:'+id))}else chunks.push(chunk)})
    child.once('error',error=>finish(error));child.once('close',code=>{
      if(code!==0)return finish(Error('descriptive_runtime_ci_child_failed:'+id+'\n'+Buffer.concat(err).toString('utf8').slice(0,12000)))
      try{const value=JSON.parse(Buffer.concat(out).toString('utf8'));if(value.format!=='descriptive_operator_runtime_ci_case_v1'||value.case!==id)refuse('child_result');finish(undefined,value)}catch(error){finish(error)}
    })
  })
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  // Even malformed arguments cannot get past the ordinary-host refusal gate.
  const proof=requireDescriptiveOperatorRuntimeCi()
  if(process.argv.length!==4||process.argv[2]!=='--case')refuse('arguments')
  try{process.stdout.write(JSON.stringify(await executeCase(proof,process.argv[3]))+'\n')}
  catch(error){process.stderr.write('DESCRIPTIVE_RUNTIME_CI_CASE_FAILED:'+process.argv[3]+'\n'+String(error?.stack??error).slice(0,12000)+'\n');process.exitCode=1}
}
