// Separate complete067 capability; the original059/060 loaders are unchanged.
// Reuses their exact locked inventory data format, not their source authority.
// Verification only: no install, signing, secret access, database or network.
// Runtime code is loaded ONLY from externally pinned immutable stage files.
import {lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync,readdirSync,constants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {createRequire,registerHooks,isBuiltin,getCompileCacheDir} from 'node:module'
import {assertCompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),prefix='services/pg-api/node_modules/'
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const protocolMessagesFile=prefix+'pg-protocol/dist/messages.js',protocolParserFile=prefix+'pg-protocol/dist/parser.js'
const protocolPins=Object.freeze({[protocolMessagesFile]:'dfd22ad639f3030b41617ff0ee201ece7cdbce4adb7e1aae7978541b1384cd31',[protocolParserFile]:'6f841aabda7240df44e1b08bbe8e202502ead969576c1ecc17311af48f57f2ef'})
const protocolMessageNames=Object.freeze(['parseComplete','bindComplete','closeComplete','noData'])
const parserPins=Object.freeze({
  'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675',
  'package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6',
  'LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
  'ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c',
})
// Offline reviewed production graph from the exact full lock above, including
// pg's optional cloudflare package and pg-pool's pg peer. Never refresh at run.
const graph={
  pg:{version:'8.23.1',entry:'lib/index.js',dependencies:['pg-cloudflare','pg-connection-string','pg-pool','pg-protocol','pg-types','pgpass']},
  'pg-cloudflare':{version:'1.4.1',entry:'dist/empty.js',dependencies:[]},
  'pg-connection-string':{version:'2.14.1',entry:'index.js',dependencies:[]},
  'pg-int8':{version:'1.0.1',entry:'index.js',dependencies:[]},
  'pg-pool':{version:'3.14.0',entry:'index.js',dependencies:['pg']},
  'pg-protocol':{version:'1.16.1',entry:'dist/index.js',dependencies:[]},
  'pg-types':{version:'2.2.0',entry:'index.js',dependencies:['pg-int8','postgres-array','postgres-bytea','postgres-date','postgres-interval']},
  pgpass:{version:'1.0.5',entry:'lib/index.js',dependencies:['split2']},
  'postgres-array':{version:'2.0.0',entry:'index.js',dependencies:[]},
  'postgres-bytea':{version:'1.0.1',entry:'index.js',dependencies:[]},
  'postgres-date':{version:'1.0.7',entry:'index.js',dependencies:[]},
  'postgres-interval':{version:'1.2.0',entry:'index.js',dependencies:['xtend']},
  split2:{version:'4.2.0',entry:'index.js',dependencies:[]},
  xtend:{version:'4.0.2',entry:'immutable.js',dependencies:[]},
}
const sort=values=>values.sort((a,b)=>a<b?-1:a>b?1:0)
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v)}return v}
export const completeProfileOperatorRuntimePolicy=freeze({format:'agent_descriptive_patch_operator_runtime_v1',lock_sha256:lockSha,pg_version:'8.23.1',packages:graph})
function fail(){throw Error('complete067_runtime_refused')}
function closed(v,keys){
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail()
  const d=Object.getOwnPropertyDescriptors(v)
  if(keys.some(k=>!d[k]||!('value'in d[k])||!d[k].enumerable))fail()
  return v
}
function utf8(raw,max){
  const b=typeof raw==='string'?Buffer.from(raw):raw instanceof Uint8Array?Buffer.from(raw):undefined
  if(!b||!b.length||b.length>max)fail()
  const t=b.toString('utf8')
  if(t.startsWith('\uFEFF')||t.includes('\0')||!Buffer.from(t).equals(b)||typeof raw==='string'&&raw!==t)fail()
  return t
}
// Independent strict JSON reader; importing CLI here would form an entry cycle.
function json(raw){
  const text=utf8(raw,2*1024*1024);let i=0,nodes=0
  const ws=()=>{while(/[ \r\n\t]/.test(text[i]??'!'))i++}
  const str=()=>{const start=i++;for(;i<text.length;i++){
    if(text[i]==='\\'){i++;continue}
    if(text[i]==='"'){let v;try{v=JSON.parse(text.slice(start,++i))}catch{fail()}if(Buffer.from(v).toString('utf8')!==v||v.includes('\0'))fail();return v}
  }fail()}
  const value=depth=>{
    if(depth>32||++nodes>32768)fail();ws();const ch=text[i]
    if(ch==='"')return str()
    if(ch==='{'){i++;ws();const v={},seen=new Set();if(text[i]==='}'){i++;return v}for(;;){ws();if(text[i]!=='"')fail();const k=str();if(seen.has(k)||['__proto__','prototype','constructor'].includes(k))fail();seen.add(k);ws();if(text[i++]!==':')fail();Object.defineProperty(v,k,{value:value(depth+1),enumerable:true});ws();if(text[i]==='}'){i++;return v}if(text[i++]!==',')fail()}}
    if(ch==='['){i++;ws();const v=[];if(text[i]===']'){i++;return v}for(;;){v.push(value(depth+1));ws();if(text[i]===']'){i++;return v}if(text[i++]!==',')fail()}}
    for(const [s,v] of [['true',true],['false',false],['null',null]])if(text.startsWith(s,i)){i+=s.length;return v}
    const m=text.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);if(!m)fail();i+=m[0].length;const v=Number(m[0]);if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v
  }
  const result=value(0);ws();if(i!==text.length)fail();return result
}
function filePath(p){
  if(typeof p!=='string'||!p.startsWith(prefix)||!/^[a-zA-Z0-9_@./+-]+$/.test(p)||p.split('/').some(s=>!s||s==='.'||s==='..')||p.slice(prefix.length).split('/').includes('node_modules'))fail()
  const name=p.slice(prefix.length).split('/')[0]
  if(!Object.hasOwn(graph,name)||p===prefix+name||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(p))fail()
  return name
}
export function parseCompleteProfileOperatorRuntimeManifest(raw,expectedManifestSha256,expectedLockSha256){
  if(!hex(expectedManifestSha256)||expectedLockSha256!==lockSha)fail()
  const text=utf8(raw,2*1024*1024)
  if(sha(Buffer.from(text))!==expectedManifestSha256)fail()
  const m=closed(json(text),['format','lock_sha256','pg_version','packages','files'])
  if(m.format!==completeProfileOperatorRuntimePolicy.format||m.lock_sha256!==lockSha||m.pg_version!=='8.23.1'||!Array.isArray(m.packages)||!Array.isArray(m.files)||m.files.length<28||m.files.length>2048)fail()
  const names=sort(Object.keys(graph))
  if(m.packages.length!==names.length)fail()
  for(const [i,p] of m.packages.entries()){
    closed(p,['name','version']);if(p.name!==names[i]||p.version!==graph[p.name].version)fail()
  }
  const seen=new Set(),folded=new Set();let total=0,previous=''
  for(const f of m.files){
    closed(f,['path','sha256','bytes']);filePath(f.path)
    if(!hex(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>8*1024*1024||seen.has(f.path)||folded.has(f.path.toLowerCase())||f.path<=previous)fail()
    seen.add(f.path);folded.add(f.path.toLowerCase());previous=f.path;total+=f.bytes
  }
  if(total>32*1024*1024||!seen.has(prefix+'pg/esm/index.mjs'))fail()
  for(const name of names)if(!seen.has(prefix+name+'/package.json')||!seen.has(prefix+name+'/'+graph[name].entry))fail()
  return freeze(m)
}
export function assertCompleteProfileOperatorRuntimeEnvironment(env,execArgv){
  if(!env||typeof env!=='object'||!Array.isArray(execArgv)||execArgv.some(a=>a!=='--experimental-strip-types'))fail()
  for(const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(env))){
    if(!('value'in d))fail()
    if((/^NODE_PG_|^PG(?:[A-Z_]|$)/.test(key)||['DATABASE_URL','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','DYLD_LIBRARY_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE'].includes(key))&&d.value!==undefined)fail()
    if(['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&d.value)fail()
  }
}
export function assertCompleteProfileOperatorRuntimeMetadata(raw,kind){
  const m=closed(raw,['type','symlink','uid','gid','mode','nlink','size'])
  if(m.symlink!==false||m.uid!==0||m.gid!==0||!Number.isSafeInteger(m.mode)||!Number.isSafeInteger(m.nlink)||m.nlink<1||!Number.isSafeInteger(m.size)||m.size<0)fail()
  const bits=m.mode&0o7777
  if(kind==='ancestor'){if(m.type!=='directory'||(bits&0o7022)!==0)fail()}
  else if(kind==='directory'){if(m.type!=='directory'||bits!==0o555)fail()}
  else if(kind==='private-directory'){if(m.type!=='directory'||bits!==0o700)fail()}
  else if(kind==='code'||kind==='manifest'){
    if(m.type!=='file'||m.nlink!==1||bits!==(kind==='code'?0o444:0o600)||m.size<1||m.size>(kind==='code'?16:2)*1024*1024)fail()
  }else fail()
}
const meta=st=>({type:st.isFile()?'file':st.isDirectory()?'directory':'other',symlink:st.isSymbolicLink(),uid:st.uid,gid:st.gid,mode:st.mode,nlink:st.nlink,size:st.size})
const stamp=st=>({dev:st.dev,ino:st.ino,mode:st.mode,uid:st.uid,gid:st.gid,nlink:st.nlink,size:st.size,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs})
export function assertCompleteProfileOperatorRuntimeStable(before,after){
  const keys=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'];closed(before,keys);closed(after,keys)
  if(keys.some(k=>!Number.isFinite(before[k])||before[k]!==after[k]))fail()
}
export function assertCompleteProfileOperatorRuntimeInventory(expected,actual){
  const list=value=>{
    if(!Array.isArray(value)||value.length>4096)fail()
    const descriptors=Object.getOwnPropertyDescriptors(value)
    if(Reflect.ownKeys(value).length!==value.length+1)fail()
    const result=Array.from({length:value.length},(_,i)=>{const d=descriptors[String(i)];if(!d||!('value'in d)||typeof d.value!=='string')fail();return d.value})
    if(new Set(result.map(p=>p.toLowerCase())).size!==result.length)fail()
    return sort(result)
  }
  const left=list(expected),right=list(actual)
  if(left.length!==right.length||left.some((p,i)=>p!==right[i]))fail()
}
function ancestors(file,privateParent=false){
  let current=path.dirname(file),first=true;const chain=[]
  for(;;){const st=lstatSync(current);assertCompleteProfileOperatorRuntimeMetadata(meta(st),first&&privateParent?'private-directory':'ancestor');chain.push({path:current,dev:st.dev,ino:st.ino,mode:st.mode,uid:st.uid,gid:st.gid});const parent=path.dirname(current);if(parent===current)break;current=parent;first=false}
  if(privateParent)for(const d of chain)for(const name of ['package.json','pnpm-workspace.yaml','.git','pyproject.toml']){try{lstatSync(path.join(d.path,name));fail()}catch(error){if(error?.code!=='ENOENT')throw error}}
  return chain
}
function sameChain(a,b){if(a.length!==b.length||a.some((v,i)=>Object.keys(v).some(k=>v[k]!==b[i][k])))fail()}
function readBound(file,expected,kind,expectedBytes){
  const chain=ancestors(file,kind==='manifest'),before=lstatSync(file)
  assertCompleteProfileOperatorRuntimeMetadata(meta(before),kind)
  if(realpathSync(file)!==file||expectedBytes!==undefined&&before.size!==expectedBytes)fail()
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try{
    assertCompleteProfileOperatorRuntimeStable(stamp(before),stamp(fstatSync(fd)))
    const chunks=[],chunk=Buffer.alloc(65536);let offset=0
    while(offset<=before.size){const n=readSync(fd,chunk,0,Math.min(chunk.length,before.size+1-offset),offset);if(!n)break;offset+=n;if(offset>before.size)fail();chunks.push(Buffer.from(chunk.subarray(0,n)))}
    const bytes=Buffer.concat(chunks)
    if(bytes.length!==before.size||sha(bytes)!==expected)fail()
    assertCompleteProfileOperatorRuntimeStable(stamp(before),stamp(fstatSync(fd)));assertCompleteProfileOperatorRuntimeStable(stamp(before),stamp(lstatSync(file)))
    sameChain(chain,ancestors(file,kind==='manifest'));utf8(bytes,kind==='manifest'?2*1024*1024:16*1024*1024)
    return {bytes,stamp:stamp(before),chain}
  }finally{closeSync(fd)}
}
function external(file){
  if(typeof file!=='string'||file.length>4096||!path.isAbsolute(file)||path.normalize(file)!==file||/[\\\x00-\x1f\x7f]/.test(file)||file===root||file.startsWith(root+path.sep)||file.split(path.sep).some(p=>['node_modules','.pnpm','.git','.codex','.agents'].includes(p.toLowerCase())))fail()
}
function host(){if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||getCompileCacheDir()!==undefined)fail();assertCompleteProfileOperatorRuntimeEnvironment(process.env,process.execArgv)}
const capabilities=new WeakMap(),claimed=new Map(),protocolStates=new WeakMap(),cjs=createRequire(import.meta.url)
function assertSource(snapshot,expected){
  assertCompleteProfileSnapshot(snapshot,expected)
  const files=new Set(snapshot.manifest.sources.map(f=>f.path)),edges=snapshot.manifest.imports
  for(const p of ['pg18-complete-operator-runtime.mjs','pg18-complete-operator-runtime.d.mts','baota-pg18-fresh-init.mjs'])if(!files.has('services/pg-api/src/'+p))fail()
  if(snapshot.manifest.profile!=='complete067'||!edges.some(e=>e.from==='services/pg-api/src/baota-pg18-complete-init.mjs'&&e.to==='services/pg-api/src/pg18-complete-operator-runtime.mjs'))fail()
}
function cachedFiles(cache){return Object.getOwnPropertyNames(cache).filter(f=>f===path.join(root,'services/pg-api/node_modules')||f.startsWith(path.join(root,'services/pg-api/node_modules')+path.sep))}
function inspectExports(value,seen=new Map()){
  if(!value||!['object','function'].includes(typeof value)||seen.has(value))return seen
  if(seen.size>20000)fail()
  const descriptors=Object.getOwnPropertyDescriptors(value);seen.set(value,descriptors)
  for(const k of Reflect.ownKeys(descriptors)){const d=descriptors[k];if('value'in d)inspectExports(d.value,seen)}
  return seen
}
function assertProtocolPins(state){
  if(!(state.files instanceof Map))fail()
  for(const [file,pin] of Object.entries(protocolPins))if(Object.getOwnPropertyDescriptor(state.files.get(file)??{},'sha256')?.value!==pin)fail()
}
// Only cacheCheck supplies a verified actual module. The per-runtime memo is
// private; neither parsed JSON nor this return value grants a runtime capability.
function protocolMessageExports(state,file,module,exports){
  if(file!==path.join(root,protocolMessagesFile))return undefined
  const memo=protocolStates.get(state);if(!memo)fail()
  const cached=Object.getOwnPropertyDescriptor(state.cacheObject,file)
  if(!cached||!('value'in cached)||cached.value!==module)fail()
  assertProtocolPins(state);assertCompleteProfileOperatorRuntimeCacheRecord(module,file,module,exports)
  if(Object.getPrototypeOf(exports)!==Object.prototype)fail()
  const descriptors=Object.getOwnPropertyDescriptors(exports)
  if(memo.binding){
    const b=memo.binding;if(b.file!==file||b.module!==module||b.exports!==exports)fail()
    for(const name of protocolMessageNames){const d=descriptors[name];if(!d||!('value'in d)||b.cells.get(d.value)?.name!==name||Object.getPrototypeOf(d.value)!==Object.prototype)fail()}
    return b.cells
  }
  const cells=new WeakMap(),objects=new Set()
  for(const name of protocolMessageNames){
    const d=descriptors[name],object=d?.value
    if(!d||!('value'in d)||!d.writable||!d.enumerable||!d.configurable||!object||Object.getPrototypeOf(object)!==Object.prototype||objects.has(object))fail()
    const fields=Object.getOwnPropertyDescriptors(object)
    if(Reflect.ownKeys(fields).length!==2||!fields.name||!fields.length)fail()
    for(const key of ['name','length']){const f=fields[key];if(!('value'in f)||!f.writable||!f.enumerable||!f.configurable||f.value!==(key==='name'?name:5))fail()}
    objects.add(object);cells.set(object,{name,normalized:false})
  }
  memo.binding={file,module,exports,cells};return cells
}
function checkExports(graph,protocolCells){
  if(protocolCells!==undefined&&!(protocolCells instanceof WeakMap))fail()
  for(const [object,before] of graph){
    const after=Object.getOwnPropertyDescriptors(object),cell=protocolCells?.get(object)
    if(Reflect.ownKeys(before).length!==Reflect.ownKeys(after).length)fail()
    for(const k of Reflect.ownKeys(before)){
      const a=before[k],b=after[k]
      if(!b||['get','set','writable','enumerable','configurable'].some(p=>a[p]!==b[p]))fail()
      if(cell&&k==='length'){
        // Locked pg-protocol 1.16.1 literals start at5; legitimate empty frames
        // have wire length4. This checks observed values, not who assigned them
        // or mutations restored between checks. Once observed4,5 is refused.
        if(a.value!==5||!('value'in b)||(b.value!==5&&b.value!==4)||cell.normalized&&b.value!==4)fail()
        if(b.value===4)cell.normalized=true
      }else if(a.value!==b.value)fail()
    }
  }
}
// Pure cache-record policy only; this function creates no verification ability.
export function assertCompleteProfileOperatorRuntimeCacheRecord(module,file,previousModule,previousExports){
  if(!module||typeof module!=='object'||typeof file!=='string')fail()
  const md=Object.getOwnPropertyDescriptors(module)
  if(md.filename?.value!==file||md.id?.value!==file||md.loaded?.value!==true||!md.exports||!('value'in md.exports)||
    previousModule!==undefined&&(module!==previousModule||md.exports.value!==previousExports))fail()
}
function cacheCheck(state){
  if(createRequire(pathToFileURL(state.entry)).cache!==state.cacheObject)fail()
  for(const file of cachedFiles(state.cacheObject)){
    // Parser/source modules may already be present; pg-owned caches may not.
    const relative=path.relative(root,file).replaceAll(path.sep,'/')
    if(!state.files.has(relative)){if(relative.startsWith(prefix+'typescript/')&&Object.hasOwn(parserPins,relative.slice((prefix+'typescript/').length)))continue;fail()}
    const d=Object.getOwnPropertyDescriptor(state.cacheObject,file)
    if(!d||!('value'in d)||!d.value||!state.loadedSources.has(relative))fail()
    const module=d.value,md=Object.getOwnPropertyDescriptors(module)
    const saved=state.cache.get(file)
    assertCompleteProfileOperatorRuntimeCacheRecord(module,file,saved?.module,saved?.exports)
    const protocolCells=protocolMessageExports(state,file,module,md.exports.value)
    if(saved){checkExports(saved.graph,protocolCells)}
    else state.cache.set(file,{module,exports:md.exports.value,graph:inspectExports(md.exports.value)})
  }
  for(const [file,saved] of state.cache){const d=Object.getOwnPropertyDescriptor(state.cacheObject,file);if(!d||!('value'in d)||d.value!==saved.module)fail()}
}
function packageInfo(state,name){
  const relative=prefix+name+'/package.json',record=state.files.get(relative),content=readBound(path.join(root,relative),record.sha256,'code',record.bytes)
  const p=json(content.bytes)
  if(p.name!==name||p.version!==graph[name].version||p.type!==undefined&&p.type!=='commonjs')fail()
  const deps={...p.dependencies,...p.optionalDependencies,...p.peerDependencies};if(name==='pg')delete deps['pg-native']
  if(sort(Object.keys(deps)).join('\0')!==sort([...graph[name].dependencies]).join('\0'))fail()
  if(name==='pg'&&(p.peerDependencies?.['pg-native']!=='>=3.0.1'||p.peerDependenciesMeta?.['pg-native']?.optional!==true||p.exports?.['.']?.require!=='./lib/index.js'||p.exports?.['.']?.import!=='./esm/index.mjs'))fail()
  return p
}
function verifyTree(state,initial=false){
  host();assertSource(state.snapshot,state.expected);assertProtocolPins(state)
  const manifest=readBound(state.manifestFile,state.manifestSha,'manifest')
  if(state.manifestStamp)assertCompleteProfileOperatorRuntimeStable(state.manifestStamp,manifest.stamp)
  if(state.manifestChain)sameChain(state.manifestChain,manifest.chain)
  const lock=readBound(path.join(root,'services/pg-api/pnpm-lock.yaml'),lockSha,'code')
  if(state.lockStamp)assertCompleteProfileOperatorRuntimeStable(state.lockStamp,lock.stamp)
  if(state.lockChain)sameChain(state.lockChain,lock.chain)
  const allowed=new Map(state.files)
  for(const [p,h] of Object.entries(parserPins))allowed.set(prefix+'typescript/'+p,{sha256:h,bytes:undefined})
  const dirs=new Set([prefix.slice(0,-1)])
  for(const p of allowed.keys()){const pieces=p.split('/');for(let i=3;i<pieces.length;i++)dirs.add(pieces.slice(0,i).join('/'))}
  const seen=new Set();let count=0
  const walk=relative=>{
    const directory=lstatSync(path.join(root,relative)),directoryStamp=stamp(directory)
    assertCompleteProfileOperatorRuntimeMetadata(meta(directory),'directory')
    const oldDirectory=state.directoryStamps.get(relative)
    if(oldDirectory)assertCompleteProfileOperatorRuntimeStable(oldDirectory,directoryStamp)
    else if(initial)state.directoryStamps.set(relative,directoryStamp);else fail()
    for(const name of readdirSync(path.join(root,relative))){
      const next=relative+'/'+name,actual=path.join(root,next),st=lstatSync(actual)
      if(++count>4096||st.isSymbolicLink())fail()
      if(st.isDirectory()){if(!dirs.has(next))fail();walk(next)}
      else{
        const record=allowed.get(next);if(!record||seen.has(next))fail()
        const bound=readBound(actual,record.sha256,'code',record.bytes),old=state.stamps.get(next)
        if(next.endsWith('/package.json')&&!next.startsWith(prefix+'typescript/')){
          const p=json(bound.bytes)
          if(p.type!==undefined&&p.type!=='commonjs'&&(p.type!=='module'||!next.includes('/esm/')))fail()
        }
        if(old)assertCompleteProfileOperatorRuntimeStable(old,bound.stamp)
        else if(initial)state.stamps.set(next,bound.stamp);else fail()
        const oldChain=state.chains.get(next)
        if(oldChain)sameChain(oldChain,bound.chain);else if(initial)state.chains.set(next,bound.chain);else fail()
        seen.add(next)
      }
    }
    assertCompleteProfileOperatorRuntimeStable(directoryStamp,stamp(lstatSync(path.join(root,relative))))
  }
  walk(prefix.slice(0,-1));assertCompleteProfileOperatorRuntimeInventory([...allowed.keys()],[...seen])
  for(const name of Object.keys(graph))packageInfo(state,name)
  if(initial){state.manifestStamp=manifest.stamp;state.lockStamp=lock.stamp;state.manifestChain=manifest.chain;state.lockChain=lock.chain}else cacheCheck(state)
}
export function verifyCompleteProfileOperatorRuntime(snapshot,expectedSourceSha256,options){
  host();assertSource(snapshot,expectedSourceSha256)
  const o=closed(options,['manifestFile','manifestSha256','lockSha256'])
  if(!hex(o.manifestSha256)||o.lockSha256!==lockSha)fail();external(o.manifestFile)
  if(claimed.has(root))fail()
  const raw=readBound(o.manifestFile,o.manifestSha256,'manifest')
  const manifest=parseCompleteProfileOperatorRuntimeManifest(raw.bytes,o.manifestSha256,o.lockSha256)
  const files=new Map(manifest.files.map(f=>[f.path,f])),cacheObject=cjs.cache
  for(const file of cachedFiles(cacheObject)){const relative=path.relative(root,file).replaceAll(path.sep,'/');if(!relative.startsWith(prefix+'typescript/')||!Object.hasOwn(parserPins,relative.slice((prefix+'typescript/').length)))fail()}
  const state={snapshot,expected:expectedSourceSha256,manifestFile:o.manifestFile,manifestSha:o.manifestSha256,manifestStamp:raw.stamp,
    files,stamps:new Map(),chains:new Map(),directoryStamps:new Map(),cacheObject,cache:new Map(),loadedSources:new Set(),entry:path.join(root,prefix+'pg/lib/index.js'),loaded:false,failed:false}
  protocolStates.set(state,{binding:undefined})
  verifyTree(state,true)
  const capability=Object.freeze({});capabilities.set(capability,state);claimed.set(root,state);return capability
}
export function assertCompleteProfileOperatorRuntime(capability){
  const state=capabilities.get(capability);if(!state||state.failed||claimed.get(root)!==state)fail()
  try{verifyTree(state)}catch(error){state.failed=true;throw error}
}
function packageName(relative){return filePath(relative)}
function executable(relative){if(/\/(?:esm|native)(?:\/|\.)/.test(relative)||/\.mjs$/.test(relative))fail();if(relative.endsWith('/package.json'))return 'json';if(!/\.(?:js|cjs)$/.test(relative))fail();return 'commonjs'}
export function resolveCompleteProfileOperatorRuntimeModule(manifest,from,specifier,conditions=[]){
  if(typeof specifier!=='string'||!Array.isArray(conditions))fail()
  if(isBuiltin(specifier))return Object.freeze({builtin:specifier.startsWith('node:')?specifier:'node:'+specifier})
  if(conditions.includes('import'))fail()
  const parent=packageName(from),files=new Set(manifest.files.map(f=>f.path));let candidate
  if(specifier.startsWith('.'))candidate=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier))
  else{
    const [name,...rest]=specifier.split('/')
    if(!Object.hasOwn(graph,name)||name!==parent&&!graph[parent].dependencies.includes(name))fail()
    candidate=prefix+name+'/'+(rest.length?rest.join('/'):graph[name].entry)
  }
  if(candidate.startsWith(prefix+parent+'/')===false&&specifier.startsWith('.'))fail()
  const choices=[candidate,candidate+'.js',candidate+'.cjs',candidate+'.json',candidate+'/index.js']
  const selected=choices.find(p=>files.has(p));if(!selected)fail();filePath(selected)
  return Object.freeze({path:selected,format:executable(selected)})
}
// Pure request classification, not a capability. Only the private loader below
// may admit this request after binding the genuine complete source snapshot.
export function isCompleteProfileInitializerDriverRequest(from,specifier,conditions){
  const allowed=['node','import','module-sync','node-addons','default']
  return from==='services/pg-api/src/baota-pg18-fresh-init.mjs'&&specifier==='pg'&&Array.isArray(conditions)&&conditions.includes('import')&&conditions.every(value=>allowed.includes(value))
}
export function loadCompleteProfileOperatorPg(capability){
  assertCompleteProfileOperatorRuntime(capability)
  const state=capabilities.get(capability)
  if(state.loaded)return state.handle
  try{
    for(const file of cachedFiles(state.cacheObject))if(state.files.has(path.relative(root,file).replaceAll(path.sep,'/')))fail()
    state.hooks=registerHooks({
      resolve(specifier,context,next){
        const parentUrl=context.parentURL&&URL.parse(context.parentURL),parentFile=parentUrl?.protocol==='file:'?fileURLToPath(parentUrl):undefined
        const from=parentFile&&path.relative(root,parentFile).replaceAll(path.sep,'/')
        const packageRequest=Object.keys(graph).some(n=>specifier===n||specifier.startsWith(n+'/'))
        if(!from||!state.files.has(from)){
          const candidate=specifier.startsWith('file:')?fileURLToPath(URL.parse(specifier)):path.isAbsolute(specifier)?specifier:undefined
          if(candidate?.startsWith(path.join(root,prefix.slice(0,-1))+path.sep)){
            if(state.loadingEntry&&candidate===state.entry)return {url:pathToFileURL(state.entry).href,format:'commonjs',shortCircuit:true}
            fail()
          }
          if(packageRequest){
            // The original frozen initializer imports pg itself. Admit exactly
            // that source-bound import to the ALREADY loaded verified CJS pg
            // entry. No ESM package wrapper, injected Pool, source replacement,
            // cache deletion or arbitrary external package import is allowed.
            if(!state.loaded||!isCompleteProfileInitializerDriverRequest(from,specifier,Array.from(context.conditions??[])))fail()
            assertSource(state.snapshot,state.expected)
            return {url:pathToFileURL(state.entry).href,format:'commonjs',shortCircuit:true}
          }
          return next(specifier,context)
        }
        if(state.failed)fail()
        let result
        if(specifier===state.entry&&from===prefix+'pg/lib/index.js')result={path:from,format:'commonjs'}
        else result=resolveCompleteProfileOperatorRuntimeModule({files:[...state.files.values()]},from,specifier,Array.from(context.conditions??[]))
        if(result.builtin)return next(result.builtin,context)
        return {url:pathToFileURL(path.join(root,result.path)).href,format:result.format,shortCircuit:true}
      },
      load(url,context,next){
        const parsed=URL.parse(url)
        if(parsed?.protocol!=='file:')return next(url,context)
        const file=fileURLToPath(parsed),relative=path.relative(root,file).replaceAll(path.sep,'/')
        if(!state.files.has(relative)){
          if(relative.startsWith(prefix)&&!(relative.startsWith(prefix+'typescript/')&&Object.hasOwn(parserPins,relative.slice((prefix+'typescript/').length))))fail()
          return next(url,context)
        }
        if(state.failed||parsed.search||parsed.hash||context.format==='module')fail()
        const record=state.files.get(relative),bound=readBound(file,record.sha256,'code',record.bytes)
        assertCompleteProfileOperatorRuntimeStable(state.stamps.get(relative),bound.stamp)
        const format=executable(relative);state.loadedSources.add(relative)
        return {format,source:bound.bytes.toString('utf8'),shortCircuit:true}
      },
    })
    state.loadingEntry=true
    const signedRequire=createRequire(pathToFileURL(state.entry)),pg=signedRequire(state.entry)
    state.loadingEntry=false
    cacheCheck(state)
    const pool=pg&&Object.getOwnPropertyDescriptor(pg,'Pool')
    if(!pool||!('value'in pool)||typeof pool.value!=='function'||pg!==state.cache.get(state.entry)?.exports)fail()
    state.handle=Object.freeze({Pool:pool.value});state.loaded=true
    assertCompleteProfileOperatorRuntime(capability)
    return state.handle
  }catch(error){state.loadingEntry=false;state.failed=true;throw error}
}
