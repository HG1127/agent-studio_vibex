// Pure refusal policy and actual locked protocol parsing, without SQL/network.
// No successful backup proof or runtime capability is fabricated by this suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,generateKeyPairSync,sign,verify as verifyNative} from 'node:crypto'
import vm from 'node:vm'
import {performance} from 'node:perf_hooks'
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import * as ts from 'typescript'
import {controlObject,controlFail,controlHex} from '../src/worker-heartbeat-activation-control-contract.ts'
import {
  workerHeartbeatActivationControlRuntimePolicy as policy,parseWorkerHeartbeatActivationControlRuntimeManifest,
  assertWorkerHeartbeatActivationControlRuntimeEnvironment,assertWorkerHeartbeatActivationControlRuntimeMetadata,
  assertWorkerHeartbeatActivationControlRuntimeStable,assertWorkerHeartbeatActivationControlRuntimeInventory,assertWorkerHeartbeatActivationControlRuntimeCacheRecord,
  verifyWorkerHeartbeatActivationControlRuntime,assertWorkerHeartbeatActivationControlRuntime,loadWorkerHeartbeatActivationControlPg,
  resolveWorkerHeartbeatActivationControlRuntimeModule,
} from '../src/worker-heartbeat-activation-control-runtime.mjs'
const hash=b=>createHash('sha256').update(b).digest('hex'),digest='a'.repeat(64),prefix='services/pg-api/node_modules/'
const ordered=a=>a.sort((a,b)=>a<b?-1:a>b?1:0)
function manifest(){
  const names=ordered(Object.keys(policy.packages)),paths=new Set([prefix+'pg/esm/index.mjs',prefix+'pg/lib/client.js',prefix+'pg/lib/native/index.js'])
  for(const n of names){paths.add(prefix+n+'/package.json');paths.add(prefix+n+'/'+policy.packages[n].entry)}
  return {format:'worker_heartbeat_activation_control_runtime_v1',lock_sha256:policy.lock_sha256,pg_version:'8.23.1',
    packages:names.map(name=>({name,version:policy.packages[name].version})),files:ordered([...paths]).map(path=>({path,sha256:digest,bytes:8}))}
}
const parse=m=>{const raw=JSON.stringify(m);return parseWorkerHeartbeatActivationControlRuntimeManifest(raw,hash(raw),policy.lock_sha256)}
const metadata=patch=>({type:'file',symlink:false,uid:0,gid:0,mode:0o100444,nlink:1,size:8,...patch})
test('fixed production graph independently matches complete raw API lock, fourteen versions and declared peer/optional edges',()=>{
  const lock=readFileSync(new URL('../pnpm-lock.yaml',import.meta.url))
  assert.equal(hash(lock),'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')
  assert.equal(policy.lock_sha256,hash(lock));assert.equal(Object.keys(policy.packages).length,14)
  for(const [name,pkg] of Object.entries(policy.packages))assert.ok(lock.toString().includes('  '+name+'@'+pkg.version+':'),name)
  assert.equal(policy.packages.pg.version,'8.23.1');assert.equal(policy.packages['pg-cloudflare'].version,'1.4.1')
  assert.deepEqual(policy.packages['pg-pool'].dependencies,['pg']);assert.ok(policy.packages.pg.dependencies.includes('pg-cloudflare'))
  assert.ok(Object.isFrozen(policy.packages.pg.dependencies))
})
test('manifest validates only independently pinned bytes and closed exact locked package set; parsing never yields a load capability',()=>{
  const m=manifest(),raw=JSON.stringify(m),result=parse(m)
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.files));assert.ok(Object.isFrozen(result.files[0]))
  assert.throws(()=>parseWorkerHeartbeatActivationControlRuntimeManifest(raw,digest,policy.lock_sha256),/runtime_refused/)
  assert.throws(()=>parseWorkerHeartbeatActivationControlRuntimeManifest(raw,hash(raw),digest),/runtime_refused/)
  assert.throws(()=>loadWorkerHeartbeatActivationControlPg(result),/runtime_refused/)
  for(const patch of [{extra:true},{pg_version:'8.24.0'},{lock_sha256:digest}])assert.throws(()=>parse({...m,...patch}),/runtime_refused/)
  const wrong=manifest();wrong.packages[0].version='0.0.0';assert.throws(()=>parse(wrong),/runtime_refused/)
  const missing=manifest();missing.packages.pop();assert.throws(()=>parse(missing),/runtime_refused/)
})
test('duplicate decoded JSON keys, unsafe encodings/numbers and unapproved re-signing are refused',()=>{
  const raw=JSON.stringify(manifest())
  for(const bad of [raw.replace('"format":','"format":"bad","\\u0066ormat":'),'\uFEFF'+raw,raw+'\0',raw.replace('"bytes":8','"bytes":9007199254740992'),raw.replace('"bytes":8','"bytes":-0')]){
    assert.throws(()=>parseWorkerHeartbeatActivationControlRuntimeManifest(bad,hash(bad),policy.lock_sha256),/runtime_refused/)
  }
  assert.throws(()=>parseWorkerHeartbeatActivationControlRuntimeManifest(raw+' ',hash(raw),policy.lock_sha256),/runtime_refused/)
  const invalid=Buffer.from([0xc3,0x28]);assert.throws(()=>parseWorkerHeartbeatActivationControlRuntimeManifest(invalid,hash(invalid),policy.lock_sha256),/runtime_refused/)
})
test('file records reject traversal, alternate roots, nested dependencies, native binaries, duplicate/case aliases and size drift',()=>{
  for(const changed of ['../pg/index.js',prefix+'pg/../../evil.js',prefix+'pg/node_modules/pg/index.js',prefix+'pg/native.node','/tmp/pg/index.js',prefix+'evil/index.js']){
    const m=manifest();m.files[0].path=changed;assert.throws(()=>parse(m),/runtime_refused/)
  }
  for(const value of [0,8*1024*1024+1,0.5]){const m=manifest();m.files[0].bytes=value;assert.throws(()=>parse(m),/runtime_refused/)}
  const duplicate=manifest();duplicate.files.push({...duplicate.files[0]});assert.throws(()=>parse(duplicate),/runtime_refused/)
  const missing=manifest();missing.files=missing.files.filter(f=>f.path!==prefix+'pg/package.json');assert.throws(()=>parse(missing),/runtime_refused/)
  const unsorted=manifest();unsorted.files.reverse();assert.throws(()=>parse(unsorted),/runtime_refused/)
})
test('runtime metadata requires immutable0444 files/0555 directories, root UID/GID, regular single-link files and exact stable identity',()=>{
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(metadata(),'code'))
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(metadata({type:'directory',mode:0o40555,nlink:2}),'directory'))
  for(const p of [{uid:1},{gid:1},{nlink:2},{mode:0o100644},{mode:0o100440},{symlink:true},{size:0},{type:'other'}])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(metadata(p),'code'),/runtime_refused/)
  for(const mode of [0o40755,0o40777,0o41555])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(metadata({type:'directory',mode,nlink:2}),'directory'),/runtime_refused/)
  const stamp={dev:1,ino:2,mode:0o100444,uid:0,gid:0,nlink:1,size:8,mtimeMs:2,ctimeMs:2}
  for(const key of Object.keys(stamp))assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeStable(stamp,{...stamp,[key]:stamp[key]+1}),/runtime_refused/)
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeStable(stamp,{...stamp}))
})
test('actual module-resolution policy has no ancestor lookup and refuses undeclared, native and all runtime ESM routes',()=>{
  const m=parse(manifest()),from=prefix+'pg/lib/index.js'
  assert.deepEqual(resolveWorkerHeartbeatActivationControlRuntimeModule(m,from,'pg-pool',['require']),{path:prefix+'pg-pool/index.js',format:'commonjs'})
  assert.deepEqual(resolveWorkerHeartbeatActivationControlRuntimeModule(m,from,'./client',['require']),{path:prefix+'pg/lib/client.js',format:'commonjs'})
  assert.deepEqual(resolveWorkerHeartbeatActivationControlRuntimeModule(m,from,'events',['require']),{builtin:'node:events'})
  for(const [spec,conditions] of [['pg-native',[]],['xtend',[]],['../../pg-pool/index.js',[]],['./native',[]],['pg-pool',['import']],['../esm/index.mjs',[]],['/tmp/pg/index.js',[]],['file:///tmp/pg.js',[]],['missing',[]]]){
    assert.throws(()=>resolveWorkerHeartbeatActivationControlRuntimeModule(m,from,spec,conditions),/runtime_refused/,spec)
  }
})
test('physical inventory policy requires exact files and refuses extra, missing, case-alias, duplicate or accessor records',()=>{
  const expected=['pg/a.js','pg/b.js']
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeInventory(expected,[...expected].reverse()))
  for(const actual of [expected.slice(1),[...expected,'evil.js'],['pg/A.js','pg/b.js'],[...expected,'pg/a.js']])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeInventory(expected,actual),/runtime_refused/)
  let reads=0;const accessor=[...expected];Object.defineProperty(accessor,'0',{get(){reads++;return expected[0]}})
  assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeInventory(expected,accessor),/runtime_refused/);assert.equal(reads,0)
})
test('cached module records require exact filename/id, completed evaluation and original module/exports references without getters',()=>{
  const file='/stage/pg/index.js',exports={},module={id:file,filename:file,loaded:true,exports}
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeCacheRecord(module,file,module,exports))
  for(const changed of [{...module},{...module,exports:{}},{...module,loaded:false},{...module,filename:'/ancestor/pg.js'}])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeCacheRecord(changed,file,module,exports),/runtime_refused/)
  let reads=0;const getter={...module};Object.defineProperty(getter,'exports',{get(){reads++;return exports}})
  assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeCacheRecord(getter,file),/runtime_refused/);assert.equal(reads,0)
})

// Execute the exact private production function bodies in an isolated policy
// context. The test-only registrar cannot register a production runtime state.
// Parser/messages/buffer-reader are unmodified actual locked package bytes;
// placing them in the same flat layout gives real CJS filename/cache identity.
function withProtocolPolicy(run){
  const require=createRequire(import.meta.url),pgRequire=createRequire(import.meta.resolve('pg'))
  let packageRoot=path.dirname(pgRequire.resolve('pg-protocol'))
  while(!readPackage(packageRoot)){const parent=path.dirname(packageRoot);assert.notEqual(parent,packageRoot);packageRoot=parent}
  function readPackage(dir){try{return JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).name==='pg-protocol'}catch{return false}}
  assert.equal(JSON.parse(readFileSync(path.join(packageRoot,'package.json'),'utf8')).version,'1.16.1')
  const tempBase=path.resolve(tmpdir()),root=mkdtempSync(path.join(tempBase,'telemetry-control-runtime-protocol-')),dist=path.join(root,prefix,'pg-protocol/dist')
  mkdirSync(dist,{recursive:true})
  const expected={
    'messages.js':'dfd22ad639f3030b41617ff0ee201ece7cdbce4adb7e1aae7978541b1384cd31',
    'parser.js':'6f841aabda7240df44e1b08bbe8e202502ead969576c1ecc17311af48f57f2ef',
  }
  try{
    for(const name of ['messages.js','parser.js','buffer-reader.js']){const bytes=readFileSync(path.join(packageRoot,'dist',name));if(expected[name])assert.equal(hash(bytes),expected[name]);writeFileSync(path.join(dist,name),bytes)}
    writeFileSync(path.join(root,prefix,'pg-protocol/package.json'),readFileSync(path.join(packageRoot,'package.json')))
    const file=path.join(dist,'messages.js'),messages=require(file),module=require.cache[file],{Parser}=require(path.join(dist,'parser.js'))
    const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
    const declarations=tree.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations])
    const constants=['protocolMessagesFile','protocolParserFile','protocolPins','protocolMessageNames'].map(name=>{const matches=declarations.filter(n=>n.name.getText()===name);assert.equal(matches.length,1);return 'const '+matches[0].getText()+';'}).join('\n')
    const functions=['fail','assertProtocolPins','assertWorkerHeartbeatActivationControlRuntimeCacheRecord','protocolMessageExports','inspectExports','checkExports'].map(name=>{const matches=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(matches.length,1);return matches[0].getText().replace(/^export /,'')}).join('\n')
    const make=Function('path','root','prefix','cacheObject',constants+'\nconst protocolStates=new WeakMap();\n'+functions+`\nreturn {inspectExports,checkExports,bind:protocolMessageExports,newState(){const state={cacheObject,files:new Map(Object.entries(protocolPins).map(([path,sha256])=>[path,{sha256}]))};protocolStates.set(state,{binding:undefined});return state}}`)
    const policy=make(path,root,prefix,require.cache)
    return run({policy,file,module,messages,Parser,require,root,graph:()=>policy.inspectExports(messages),bind:state=>policy.bind(state,file,module,messages),parse:code=>{let result;new Parser().parse(Buffer.from([code,0,0,0,4]),message=>{assert.equal(result,undefined);result=message});assert.ok(result);return result}})
  }finally{
    const resolved=path.resolve(root);assert.ok(resolved.startsWith(tempBase+path.sep));assert.ok(path.basename(resolved).startsWith('telemetry-control-runtime-protocol-'))
    for(const file of Object.keys(require.cache))if(file.startsWith(resolved+path.sep))delete require.cache[file]
    rmSync(resolved,{recursive:true,force:true})
  }
}

test('actual pinned Parser normalizes four fixed empty messages including noData; strict graphs still reject that drift without bound policy',()=>withProtocolPolicy(f=>{
  const state=f.policy.newState(),graph=f.graph(),cells=f.bind(state)
  assert.doesNotThrow(()=>f.policy.checkExports(graph,cells))
  for(const [code,name]of [[49,'parseComplete'],[50,'bindComplete'],[51,'closeComplete'],[110,'noData']]){
    assert.equal(f.messages[name].length,5);assert.equal(f.parse(code),f.messages[name]);assert.equal(f.messages[name].length,4)
    assert.throws(()=>f.policy.checkExports(graph),/runtime_refused/)
    assert.doesNotThrow(()=>f.policy.checkExports(graph,f.bind(state)))
    assert.equal(f.parse(code),f.messages[name]);assert.doesNotThrow(()=>f.policy.checkExports(graph,cells))
  }
  // This isolated policy state is never a verified runtime capability.
  assert.throws(()=>assertWorkerHeartbeatActivationControlRuntime(state),/runtime_refused/)
  assert.throws(()=>loadWorkerHeartbeatActivationControlPg(cells),/runtime_refused/)
}))

test('normalization memory is private to each runtime state and refuses4 to5, already-normalized first binding and JSON clones',()=>withProtocolPolicy(f=>{
  const first=f.policy.newState(),second=f.policy.newState(),graph=f.graph(),one=f.bind(first),two=f.bind(second)
  for(const [code,name]of [[49,'parseComplete'],[50,'bindComplete'],[51,'closeComplete'],[110,'noData']]){
    f.parse(code);f.policy.checkExports(graph,one)
    f.messages[name].length=5
    assert.throws(()=>f.policy.checkExports(graph,one),/runtime_refused/)
    assert.doesNotThrow(()=>f.policy.checkExports(graph,two))
    f.messages[name].length=4
  }
  assert.throws(()=>f.bind(structuredClone({files:[...first.files]})),/runtime_refused/)
  assert.throws(()=>f.bind(JSON.parse(JSON.stringify({files:[...first.files]}))),/runtime_refused/)
  assert.throws(()=>f.policy.checkExports(graph,{}),/runtime_refused/)
  assert.throws(()=>f.bind(f.policy.newState()),/runtime_refused/)
}))

test('protocol allowance binds exact pinned file pair, cached original module/exports and four original objects without accessor evaluation',()=>withProtocolPolicy(f=>{
  const state=f.policy.newState(),graph=f.graph();f.bind(state)
  for(const file of [prefix+'pg-protocol/dist/messages.js',prefix+'pg-protocol/dist/parser.js']){
    const changed=f.policy.newState();changed.files.set(file,{sha256:digest});assert.throws(()=>f.bind(changed),/runtime_refused/)
    changed.files.delete(file);assert.throws(()=>f.bind(changed),/runtime_refused/)
  }
  assert.throws(()=>f.policy.bind(state,f.file,{...f.module},f.messages),/runtime_refused/)
  const cached=f.require.cache[f.file];f.require.cache[f.file]={...cached}
  try{assert.throws(()=>f.policy.bind(state,f.file,f.require.cache[f.file],f.messages),/runtime_refused/);assert.throws(()=>f.bind(state),/runtime_refused/)}finally{f.require.cache[f.file]=cached}
  const previous=f.module.exports;f.module.exports={...previous}
  try{assert.throws(()=>f.policy.bind(state,f.file,f.module,f.module.exports),/runtime_refused/)}finally{f.module.exports=previous}
  for(const name of ['parseComplete','bindComplete','closeComplete','noData']){
    const original=f.messages[name];f.messages[name]={name,length:5}
    try{assert.throws(()=>f.bind(state),/runtime_refused/)}finally{f.messages[name]=original}
    const descriptor=Object.getOwnPropertyDescriptor(f.messages,name);let reads=0
    Object.defineProperty(f.messages,name,{configurable:true,enumerable:true,get(){reads++;return original}})
    try{assert.throws(()=>f.bind(state),/runtime_refused/);assert.equal(reads,0)}finally{Object.defineProperty(f.messages,name,descriptor)}
  }
  f.parse(49)
  const unbound=f.policy.bind(state,path.join(f.root,prefix,'pg-protocol/dist/elsewhere.js'),f.module,f.messages)
  assert.equal(unbound,undefined)
  assert.throws(()=>f.policy.checkExports(graph,unbound),/runtime_refused/)
}))

test('all other message values, objects, properties, descriptors, getters and functions remain immutable',()=>withProtocolPolicy(f=>{
  const state=f.policy.newState(),graph=f.graph(),cells=f.bind(state),names=['parseComplete','bindComplete','closeComplete','noData']
  for(const messageName of names){
    const object=f.messages[messageName]
    for(const value of [0,3,6,'4',null,undefined,NaN]){object.length=value;assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/)}object.length=5
    const length=Object.getOwnPropertyDescriptor(object,'length'),name=Object.getOwnPropertyDescriptor(object,'name')
    for(const patch of [{writable:false},{enumerable:false},{get(){throw Error('getter_must_not_run')}}]){
      Object.defineProperty(object,'length','get'in patch?{configurable:true,enumerable:true,get:patch.get}:{...length,...patch})
      assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);Object.defineProperty(object,'length',length)
    }
    object.extra=true;assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);delete object.extra
    delete object.name;assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);Object.defineProperty(object,'name',name)
    object.name=messageName+'_changed';assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);Object.defineProperty(object,'name',name)
    Object.setPrototypeOf(object,null);try{assert.throws(()=>f.bind(state),/runtime_refused/)}finally{Object.setPrototypeOf(object,Object.prototype)}
    object.length=4;assert.throws(()=>f.bind(f.policy.newState()),/runtime_refused/);object.length=5
  }
  const other={length:5},otherGraph=f.policy.inspectExports(other);other.length=4;assert.throws(()=>f.policy.checkExports(otherGraph,cells),/runtime_refused/)
  for(const name of ['emptyQuery','copyDone','replicationStart']){assert.equal(f.messages[name].length,4);f.messages[name].length=5;assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);f.messages[name].length=4}
  assert.equal(f.messages.portalSuspended.length,5);f.parse(115);assert.equal(f.messages.portalSuspended.length,4);assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);f.messages.portalSuspended.length=5
  const DatabaseError=f.messages.DatabaseError;f.messages.DatabaseError=function(){};assert.throws(()=>f.policy.checkExports(graph,cells),/runtime_refused/);f.messages.DatabaseError=DatabaseError
  for(const name of names){const object=f.messages[name],onlyOriginalObject=new Map([[object,graph.get(object)]]);Object.defineProperty(object,'length',{configurable:false});assert.throws(()=>f.policy.checkExports(onlyOriginalObject,cells),/runtime_refused/)}
}))
test('ambient driver/native/loader flags and cloned or data-only capabilities refuse before any package load',()=>{
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeEnvironment({},['--experimental-strip-types']))
  for(const key of ['NODE_PG_FORCE_NATIVE','NODE_PG_FORCE_JS','PGPASSWORD','DATABASE_URL','LD_PRELOAD','LD_LIBRARY_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE'])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeEnvironment({[key]:''},[]),/runtime_refused/)
  for(const flag of ['--import','--require','--conditions=workerd','--preserve-symlinks'])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeEnvironment({},[flag]),/runtime_refused/)
  for(const cap of [{},Object.freeze({}),structuredClone({}),parse(manifest())]){
    assert.throws(()=>assertWorkerHeartbeatActivationControlRuntime(cap),/runtime_refused/)
    assert.throws(()=>loadWorkerHeartbeatActivationControlPg(cap),/runtime_refused/)
  }
  assert.throws(()=>verifyWorkerHeartbeatActivationControlRuntime({},digest,{manifestFile:'/must-not-read',manifestSha256:digest,lockSha256:policy.lock_sha256}),/runtime_refused|source_refused/)
})
test('real source has no installer, signer, test-helper import or bare pg import and enforces verified FD source and cache before returning Pool',()=>{
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8')
  const tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0)
  assert.doesNotMatch(source,/import\(['"]pg['"]\)|writeFile|writeSync|spawn\(|execFile|testhelper|new Pool\(/)
  for(const text of ['O_NOFOLLOW','O_NONBLOCK','shortCircuit:true','source:bound.bytes.toString','state.loadedSources.add(relative)','cacheCheck(state)',"const signedRequire=createRequire(pathToFileURL(state.entry)),pg=signedRequire(state.entry)","claimed.has(root)","state.failed=true"])assert.ok(source.includes(text),text)
  for(const text of ['protocolStates=new WeakMap()','protocolStates.set(state,{binding:undefined})','assertSource(state.snapshot,state.expected);assertProtocolPins(state)',
    'protocolMessageExports(state,file,module,md.exports.value)','checkExports(saved.graph,protocolCells)'])assert.ok(source.includes(text),text)
  assert.ok(source.indexOf('cacheCheck(state)',source.indexOf('const signedRequire='))<source.indexOf('state.handle=Object.freeze'))
})

test('approval verification and durable digest use one captured buffer across atomic file replacements',async()=>{
  // Execute the actual private function bodies in a pure state model. The
  // model creates no genuine controller, peer, permit, private file or SQL.
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8')
  const tree=ts.createSourceFile('control.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const names=['signedBytes','signed','expiry','authorizeWorkerHeartbeatMutation']
  const functions=names.map(name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);return n.getText(tree).replace(/^export /,'')}).join('\n')
  const code=ts.transpileModule(functions+'\nglobalThis.subject=authorizeWorkerHeartbeatMutation;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
  const id='11111111-1111-4111-8111-111111111111',before='b'.repeat(64),sourceSha='c'.repeat(64),plan='d'.repeat(64)
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'),now=Date.now()
  const envelope=actor=>{const payload={protocol:'worker_heartbeat_control_approval_v1',action_id:id,plan_sha256:plan,source_sha256:sourceSha,binding_sha256:hash('{}'),expected_epoch:'7',actor,not_before:new Date(now-1000).toISOString(),expires_at:new Date(now+30000).toISOString(),scope:'MUTATE_TELEMETRY_REGISTRY_ONLY'};return Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')}))}
  const A=envelope('actor_a'),B=envelope('actor_b')
  async function exercise(first,valid){
    const action={id,summary:{expected_epoch:'7',plan_sha256:plan,before_sha256:before}},state={epoch:7n,mutation:false,phase:'closed',actions:new Map([[id,action]]),binding:{},publicKey,profile:{source_sha256:sourceSha}}
    let reads=0,verifiedActor;const journal=[]
    const context={Buffer,JSON,Date,performance,controlObject,controlFail,controlHex,state:()=>state,peer:()=>({}),runtimeCheck:()=>{},controlUuid:v=>v===id,
      privateRead:()=>++reads===1?first:B,actionFile:()=>'/PURE_MODEL/approval.json',parseWorkerHeartbeatControlJson:bytes=>JSON.parse(bytes.toString('utf8')),
      verify:(algorithm,bytes,key,signature)=>{verifiedActor=JSON.parse(bytes.toString()).actor;return verifyNative(algorithm,bytes,key,signature)},
      serial:async(_s,job)=>job(),inspectRegistry:async()=>({PURE_MODEL:true}),observedSha:()=>before,controlSha:hash,empty:()=>Object.freeze(Object.create(null)),mutationStates:new WeakMap(),append:(_s,phase,action_id,data)=>journal.push({phase,action_id,data})}
    vm.runInNewContext(code,context,{timeout:1000})
    if(valid){await context.subject({}, {}, id);assert.equal(verifiedActor,'actor_a');assert.equal(action.approvalSha,hash(A));assert.notEqual(action.approvalSha,hash(B));assert.equal(journal[0].data.approval_sha256,hash(A))}
    else{await assert.rejects(()=>context.subject({}, {}, id),/approval_invalid/);assert.equal(journal.length,0);assert.equal(action.approvalSha,undefined)}
    assert.equal(reads,1)
  }
  await exercise(A,true)
  const invalid=JSON.parse(A.toString());invalid.payload.actor='unsigned_actor';await exercise(Buffer.from(JSON.stringify(invalid)),false)
})
test('final read audit retains the private prior observation for Registry progression checks',async()=>{
  // Pure execution of the actual function body with explicit local state
  // doubles. No genuine lease, policy authority, controller or DB is minted.
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('control.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='finalizeWorkerHeartbeatControlRead');assert.ok(node)
  const code=ts.transpileModule(node.getText(tree).replace(/^export /,'')+'\nglobalThis.subject=finalizeWorkerHeartbeatControlRead;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
  const control={},owner={},peerHandle={},leaseHandle={},begin=Object.freeze(Object.create(null)),end=Object.freeze(Object.create(null)),policy={PURE_MODEL_POLICY:true}
  const s={policy,registry:{describeWorkerHeartbeatRegistry:v=>{assert.ok(v===begin||v===end);return {checked_at_utc:v===begin?'2026-10-28T12:00:00.000Z':'2026-10-28T12:00:00.002Z'}}}}
  const l={s,peer:owner,begin,snapshot:{as_of:'2026-10-28T12:00:00.001Z'},phase:'pending',queryPending:false,transaction:false},leaseStates=new WeakMap([[leaseHandle,l]]),finishedStates=new WeakMap()
  let audits=0
  const context={Date,state:v=>{assert.equal(v,control);return s},peer:(v,p,kind)=>{assert.equal(v,s);assert.equal(p,peerHandle);assert.equal(kind,'reader');return owner},leaseStates,finishedStates,
    leaseCheck:(value,phase)=>{assert.equal(value,l);assert.equal(value.phase,phase)},serial:async(v,job)=>{assert.equal(v,s);return job()},
    inspectRegistry:async(v,p,read)=>{audits++;assert.equal(v,s);assert.equal(p,begin);assert.notEqual(p,policy);assert.equal(read,l);return end},observedSha:()=>digest,
    empty:()=>Object.freeze(Object.create(null)),controlFail,WorkerHeartbeatControlError:Error,revoke:()=>assert.fail('valid final audit revoked'),cleanupLease:()=>assert.fail('valid final audit cleaned as failure')}
  vm.runInNewContext(code,context,{timeout:1000});const finished=await context.subject(control,peerHandle,leaseHandle)
  assert.equal(audits,1);assert.equal(l.phase,'finished');assert.equal(l.clean,true);assert.equal(finishedStates.get(finished),l)
})
test('each synchronous access guard runs full verification once and preserves lease/state/write refusals',()=>{
  // Actual source bodies, with explicit pure-model state and runtime counters.
  // No real private capability, SQL query, filesystem or loader is admitted.
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('control.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const names=['assertWorkerHeartbeatControlDbAccess','leaseCheck','runtimeCheck'],text=names.map(name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n);return n.getText(tree).replace(/^export /,'')}).join('\n')
  const code=ts.transpileModule(text+'\nglobalThis.subject=assertWorkerHeartbeatControlDbAccess;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
  let scans=0;const cap={},db={},permit={},dbAccesses=new WeakMap(),s={healthy:true,phase:'serving',epoch:7n,runtimeCap:cap,runtime:{assertWorkerHeartbeatActivationControlRuntime:v=>{assert.equal(v,cap);scans++}}}
  const lease={s,peer:{open:true},phase:'preparing',epoch:7n,deadline:performance.now()+60000},a={active:true,db,s,mode:'read',lease,leasePhase:'preparing'};dbAccesses.set(permit,a)
  const context={performance,dbAccesses,controlFail,host:()=>{},revoke:v=>{assert.equal(v,lease);v.phase='revoked'}}
  vm.runInNewContext(code,context,{timeout:1000})
  const accepted=mode=>{const before=scans;context.subject(db,permit,mode);assert.equal(scans-before,1)}
  const refused=(job,pattern)=>assert.throws(job,pattern)
  accepted('read');accepted('read')
  lease.s={...s};refused(()=>context.subject(db,permit,'read'),/untrusted_reference/);lease.s=s
  lease.peer.open=false;refused(()=>context.subject(db,permit,'read'),/lease_revoked/);lease.peer.open=true
  lease.deadline=performance.now()-1;refused(()=>context.subject(db,permit,'read'),/lease_expired/);lease.deadline=performance.now()+60000;lease.phase='preparing'
  s.healthy=false;refused(()=>context.subject(db,permit,'read'),/control_closed/);s.healthy=true
  a.lease=undefined;a.leasePhase=undefined;accepted('read')
  refused(()=>context.subject(db,permit,'write'),/untrusted_reference/)
  Object.assign(a,{mode:'write',beforeChange:true,allLocked:true,epoch:7n,expires:performance.now()+60000});s.phase='applying';accepted('write')
  a.epoch=6n;refused(()=>context.subject(db,permit,'write'),/untrusted_reference/);a.epoch=7n
  a.expires=performance.now()-1;refused(()=>context.subject(db,permit,'write'),/untrusted_reference/)
  refused(()=>context.subject({},permit,'read'),/untrusted_reference/);refused(()=>context.subject(db,{},'read'),/untrusted_reference/)
})


// BEGIN additive fresh-byte performance regression section. Keep parent-owned
// approval/finalization tests when applying this section to a newer H suite.
function runtimeBytePolicy(read){
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8')
  const tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const functions=['fail','assertUtf8Bytes','utf8','readExactBoundBytes'].map(name=>{
    const matches=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(matches.length,1);return matches[0].getText()
  }).join('\n')
  const require=createRequire(import.meta.url),{isUtf8}=require('node:buffer')
  // Exact private production bodies, isolated BYTE policies only. These local
  // functions cannot register a production runtime/source/cache capability.
  return Function('readSync','isUtf8',functions+'\nreturn {assertUtf8Bytes,utf8,readExactBoundBytes}')(read,isUtf8)
}
test('native UTF8 byte validation preserves strict legacy acceptance without decoding code buffers',()=>{
  const p=runtimeBytePolicy(()=>assert.fail('UTF8 validation must not read'))
  const legacy=(raw,max)=>{const b=typeof raw==='string'?Buffer.from(raw):raw instanceof Uint8Array?Buffer.from(raw):undefined;if(!b||!b.length||b.length>max)throw Error('legacy_refused');const t=b.toString('utf8');if(t.startsWith('\uFEFF')||t.includes('\0')||!Buffer.from(t).equals(b)||typeof raw==='string'&&raw!==t)throw Error('legacy_refused');return t}
  const inputs=['ASCII code','中文🙂','\ufffd','a\ufeffb','\ufeffbad','nul\0bad','\ud800','\udfff','',
    Buffer.from([0x80]),Buffer.from([0xc0,0x80]),Buffer.from([0xc3]),Buffer.from([0xe2,0x28,0xa1]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xed,0xbf,0xbf]),Buffer.from([0xf4,0x90,0x80,0x80]),Buffer.from([0xff]),Buffer.from([0xef,0xbb,0xbf,65]),Buffer.from([0,65]),Buffer.from([65,0]),Buffer.from([65]),Buffer.from('actual UTF8 \ufffd')]
  for(const raw of inputs)for(const max of [1,4,1024]){
    let expected,refused=false;try{expected=legacy(raw,max)}catch{refused=true}
    if(refused)assert.throws(()=>p.utf8(raw,max),/runtime_refused/)
    else assert.equal(p.utf8(raw,max),expected)
  }
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const validator=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='assertUtf8Bytes').getText()
  assert.doesNotMatch(validator,/\.toString\(|Buffer\.from\(|Buffer\.concat\(/)
  assert.match(validator,/isUtf8\(bytes\)/);assert.match(validator,/bytes\.includes\(0\)/)
  assert.throws(()=>assertWorkerHeartbeatActivationControlRuntime(p),/runtime_refused/)
})
test('fresh preallocated FD reads handle short reads, EOF, growth, truncation and real file changes without stale byte reuse',()=>{
  const bytes=Buffer.from('actual code 中文'),trace=[]
  const read=(fd,target,offset,length,position)=>{assert.equal(fd,9);trace.push({offset,length,position});const n=Math.min(2,length,bytes.length-position);if(n>0)bytes.copy(target,offset,position,position+n);return n}
  const p=runtimeBytePolicy(read),first=p.readExactBoundBytes(9,bytes.length)
  assert.deepEqual(first,bytes);assert.equal(first.length,bytes.length);assert.equal(trace.at(-1).position,bytes.length);assert.equal(trace.at(-1).length,1)
  bytes[0]=98;assert.deepEqual(p.readExactBoundBytes(9,bytes.length),bytes);assert.notEqual(first[0],bytes[0])
  assert.throws(()=>p.readExactBoundBytes(9,bytes.length-1),/runtime_refused/)
  assert.throws(()=>p.readExactBoundBytes(9,bytes.length+1),/runtime_refused/)
  assert.throws(()=>runtimeBytePolicy(()=>-1).readExactBoundBytes(9,1),/runtime_refused/)
  assert.throws(()=>runtimeBytePolicy((_fd,_target,_offset,length)=>length+1).readExactBoundBytes(9,1),/runtime_refused/)
  const require=createRequire(import.meta.url),fs=require('node:fs'),base=path.resolve(tmpdir()),dir=fs.mkdtempSync(path.join(base,'telemetry-control-runtime-bytes-')),file=path.join(dir,'owned-code.js')
  try{
    fs.writeFileSync(file,Buffer.from('first content'));const actual=runtimeBytePolicy(fs.readSync),fd=fs.openSync(file,fs.constants.O_RDONLY)
    try{assert.equal(actual.readExactBoundBytes(fd,13).toString(),'first content');fs.writeFileSync(file,'other content');assert.equal(actual.readExactBoundBytes(fd,13).toString(),'other content');fs.writeFileSync(file,'longer content');assert.throws(()=>actual.readExactBoundBytes(fd,13),/runtime_refused/);fs.writeFileSync(file,'short');assert.throws(()=>actual.readExactBoundBytes(fd,13),/runtime_refused/)}finally{fs.closeSync(fd)}
  }finally{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(base+path.sep)&&path.basename(resolved).startsWith('telemetry-control-runtime-bytes-'));fs.rmSync(resolved,{recursive:true,force:true})}
})
test('byte-pipeline optimization leaves full fresh hash, FD/path/ancestor and cache checks in every assertion',()=>{
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const body=name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText()
  const reader=body('readBound'),exact=body('readExactBoundBytes'),verify=body('verifyTree')
  assert.match(exact,/Buffer\.allocUnsafe\(size\+1\)/);assert.doesNotMatch(exact,/Buffer\.from\(|Buffer\.concat\(|\.toString\(/)
  for(const text of ['ancestors(file,kind===\'manifest\')','before=lstatSync(file)','realpathSync(file)!==file','O_NOFOLLOW','O_NONBLOCK','stamp(fstatSync(fd))','stamp(lstatSync(file))','sha(bytes)!==expected','assertUtf8Bytes(bytes','closeSync(fd)'])assert.ok(reader.includes(text),text)
  assert.equal((reader.match(/ancestors\(file,/g)||[]).length,2)
  for(const text of ['host();assertSource(state.snapshot,state.expected);assertProtocolPins(state)','readBound(state.manifestFile','readBound(path.join(root,\'services/pg-api/pnpm-lock.yaml\')','readdirSync','readBound(actual,record.sha256','assertWorkerHeartbeatActivationControlRuntimeInventory','packageInfo(state,name)','cacheCheck(state)'])assert.ok(verify.includes(text),text)
  assert.ok(body('assertWorkerHeartbeatActivationControlRuntime').includes('try{verifyTree(state)}catch(error){state.failed=true;throw error}'))
})
// END additive fresh-byte performance regression section.


// BEGIN additive trusted-metadata-value performance regression section.
// Append this section to the parent's current suite; retain its other tests.
function runtimeScalarSource(){
  const source=readFileSync(new URL('../src/worker-heartbeat-activation-control-runtime.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const body=name=>{const found=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(found.length,1);return found[0].getText()}
  return {source,tree,body}
}
function runtimeScalarPolicy(io={},strictInternal=false){
  const {tree,body}=runtimeScalarSource(),names=['fail','closed','assertWorkerHeartbeatActivationControlRuntimeMetadata','metadataValues','assertWorkerHeartbeatActivationControlRuntimeStable','stableValues','trustedMetadata','trustedStable','ancestors','sameChain','readExactBoundBytes','assertUtf8Bytes','readBound']
  const declarations=tree.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations])
  const values=['metadataRecords','stampRecords','meta','stamp'].map(name=>'const '+declarations.find(n=>n.name.getText()===name).getText()+';').join('\n')
  const functions=names.map(name=>{
    let text=body(name).replace(/^export /,'')
    // Reference path differs only by routing the same fresh, locally-created
    // records through public shape checks; both paths run identical values.
    if(strictInternal&&['ancestors','readBound'].includes(name))text=text.replaceAll('trustedMetadata(','assertWorkerHeartbeatActivationControlRuntimeMetadata(').replaceAll('trustedStable(','assertWorkerHeartbeatActivationControlRuntimeStable(')
    return text
  }).join('\n')
  const {isUtf8}=createRequire(import.meta.url)('node:buffer')
  return Function('path','sha','isUtf8','lstatSync','realpathSync','openSync','fstatSync','readSync','closeSync','constants',values+'\n'+functions+'\nreturn {metadataValues,stableValues,trustedMetadata,trustedStable,meta,stamp,readBound}')(
    path.posix,hash,isUtf8,io.lstatSync,io.realpathSync,io.openSync,io.fstatSync,io.readSync,io.closeSync,{O_RDONLY:0,O_NOFOLLOW:0o400000,O_NONBLOCK:0o4000})
}

test('public metadata/stability wrappers retain closed-object rejection without invoking caller getters',()=>{
  const stamp={dev:1,ino:2,mode:0o100444,uid:0,gid:0,nlink:1,size:8,mtimeMs:2,ctimeMs:2};let reads=0
  function malformed(base){
    const key=Object.keys(base)[0],missing={...base};delete missing[key]
    const hidden={...base},getter={...base},symbol={...base},nonenumerableExtra={...base}
    Object.defineProperty(hidden,key,{enumerable:false});Object.defineProperty(getter,key,{get(){reads++;return base[key]}})
    symbol[Symbol('extra')]=true;Object.defineProperty(nonenumerableExtra,'extra',{value:true})
    return [undefined,null,[],()=>{},Object.assign(Object.create(null),base),Object.assign(Object.create({}),base),missing,{...base,extra:true},hidden,getter,symbol,nonenumerableExtra]
  }
  for(const raw of malformed(metadata()))assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(raw,'code'),/runtime_refused/)
  for(const raw of malformed(stamp)){
    assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeStable(raw,stamp),/runtime_refused/)
    assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeStable(stamp,raw),/runtime_refused/)
  }
  assert.equal(reads,0);assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(metadata(),'unknown'),/runtime_refused/)
})

test('shared scalar cores preserve all root permission, file bounds and finite identity values',()=>{
  const p=runtimeScalarPolicy(),cases=[
    ['code',metadata(),[{type:'directory'},{mode:0o100644},{mode:0o104444},{nlink:2},{size:0},{size:16*1024*1024+1}]],
    ['manifest',metadata({mode:0o100600}),[{type:'directory'},{mode:0o100444},{nlink:2},{size:0},{size:2*1024*1024+1}]],
    ['ancestor',metadata({type:'directory',mode:0o40755,nlink:2}),[{type:'file'},{mode:0o40777},{mode:0o42755},{mode:0o44755}]],
    ['directory',metadata({type:'directory',mode:0o40555,nlink:2}),[{type:'file'},{mode:0o40755},{mode:0o41555}]],
    ['private-directory',metadata({type:'directory',mode:0o40700,nlink:2}),[{type:'file'},{mode:0o40555},{mode:0o41700}]],
  ]
  for(const [kind,good,bad]of cases){
    assert.doesNotThrow(()=>p.metadataValues(good,kind));assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata(good,kind))
    const common=[{symlink:true},{uid:1},{gid:1},{mode:NaN},{mode:Infinity},{mode:1.5},{nlink:0},{nlink:Infinity},{nlink:1.5},{size:-1},{size:Infinity},{size:0.5}]
    for(const patch of [...common,...bad]){
      assert.throws(()=>p.metadataValues({...good,...patch},kind),/runtime_refused/)
      assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata({...good,...patch},kind),/runtime_refused/)
    }
  }
  for(const [kind,size]of [['code',16*1024*1024],['manifest',2*1024*1024]])assert.doesNotThrow(()=>p.metadataValues(metadata({size,mode:kind==='manifest'?0o100600:0o100444}),kind))
  const stamp={dev:1,ino:2,mode:0o100444,uid:0,gid:0,nlink:1,size:8,mtimeMs:2,ctimeMs:2}
  assert.doesNotThrow(()=>p.stableValues(stamp,{...stamp}))
  for(const key of Object.keys(stamp)){
    assert.throws(()=>p.stableValues(stamp,{...stamp,[key]:stamp[key]+1}),/runtime_refused/)
    for(const value of [NaN,Infinity,-Infinity,'1',undefined]){
      const invalid={...stamp,[key]:value};assert.throws(()=>p.stableValues(invalid,{...invalid}),/runtime_refused/)
      assert.throws(()=>assertWorkerHeartbeatActivationControlRuntimeStable(invalid,{...invalid}),/runtime_refused/)
    }
  }
  assert.throws(()=>assertWorkerHeartbeatActivationControlRuntime(p),/runtime_refused/)
})

test('trusted scalar routing preserves fresh per-file ancestor/FD/path/read/hash order and mutation refusal',()=>{
  // Explicit POSIX filesystem policy model only; these are not Linux FDs and
  // cannot register a production source/runtime/database capability.
  function model(strict,change){
    const bytes=Buffer.from('fresh contents'),trace=[],nodes=new Map();let opened=false,changed=false
    for(const [i,file]of ['/','/tree','/tree/a','/tree/a/code.js'].entries())nodes.set(file,{dev:1,ino:i+1,uid:0,gid:0,mode:i===3?0o100444:0o40755,nlink:i===3?1:2,size:i===3?bytes.length:64,mtimeMs:1,ctimeMs:1,type:i===3?'file':'directory'})
    const stats=file=>{const n=nodes.get(file);return {...n,isFile:()=>n.type==='file',isDirectory:()=>n.type==='directory',isSymbolicLink:()=>false}}
    const io={
      lstatSync(file){trace.push(['lstat',file]);return stats(file)},realpathSync(file){trace.push(['realpath',file]);return file},
      openSync(file,flags){trace.push(['open',file,flags]);assert.equal(opened,false);opened=true;return 7},
      fstatSync(fd){trace.push(['fstat',fd]);assert.equal(opened,true);return stats('/tree/a/code.js')},
      readSync(fd,out,offset,length,position){trace.push(['read',fd,offset,length,position]);if(!changed){changed=true;change?.({nodes,bytes})}const n=Math.min(length,bytes.length-position);if(n>0)bytes.copy(out,offset,position,position+n);return n},
      closeSync(fd){trace.push(['close',fd]);assert.equal(opened,true);opened=false},
    }
    const p=runtimeScalarPolicy(io,strict),expected=hash(bytes);let refused=false
    try{p.readBound('/tree/a/code.js',expected,'code',bytes.length)}catch(error){assert.match(error.message,/runtime_refused/);refused=true}
    assert.equal(opened,false)
    return {trace,refused,p,bytes,expected,io}
  }
  for(const change of [undefined,({nodes})=>nodes.get('/tree/a').mode=0o40777,({nodes})=>nodes.get('/tree/a').ino++,({nodes})=>nodes.get('/tree/a/code.js').ctimeMs++,({bytes})=>bytes[0]=88]){
    const candidate=model(false,change),reference=model(true,change)
    assert.deepEqual(candidate.trace,reference.trace);assert.equal(candidate.refused,reference.refused);assert.equal(candidate.refused,change!==undefined)
  }
  const fresh=model(false);fresh.bytes[0]=88
  assert.throws(()=>fresh.p.readBound('/tree/a/code.js',fresh.expected,'code',fresh.bytes.length),/runtime_refused/)
  assert.equal(fresh.trace.filter(([op])=>op==='open').length,2);assert.equal(fresh.trace.filter(([op])=>op==='close').length,2)
  assert.equal(fresh.trace.filter(([op,file])=>op==='lstat'&&file==='/tree/a').length,3)
})

test('private scalar cores have only trusted metadata/stamp callers and retain every non-scalar guard',()=>{
  const {source,tree,body}=runtimeScalarSource(),calls=[]
  function visit(node,owner){
    if(ts.isFunctionDeclaration(node)&&node.name)owner=node.name.text
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['metadataValues','stableValues','trustedMetadata','trustedStable'].includes(node.expression.text))calls.push({owner,name:node.expression.text,args:node.arguments.map(a=>a.getText())})
    ts.forEachChild(node,child=>visit(child,owner))
  }
  visit(tree,undefined)
  const metadataCalls=calls.filter(c=>c.name==='trustedMetadata'),stableCalls=calls.filter(c=>c.name==='trustedStable')
  assert.deepEqual(calls.filter(c=>c.name==='metadataValues').map(c=>c.owner),['assertWorkerHeartbeatActivationControlRuntimeMetadata','trustedMetadata'])
  assert.deepEqual(calls.filter(c=>c.name==='stableValues').map(c=>c.owner),['trustedStable','assertWorkerHeartbeatActivationControlRuntimeStable'])
  assert.deepEqual(metadataCalls.map(c=>c.owner),['ancestors','readBound','verifyTree'])
  assert.deepEqual(metadataCalls.map(c=>c.args[0]),['meta(st)','meta(before)','meta(directory)'])
  assert.deepEqual(stableCalls.map(c=>c.owner),['readBound','readBound','readBound','verifyTree','verifyTree','verifyTree','verifyTree','verifyTree','loadWorkerHeartbeatActivationControlPg'])
  for(const name of ['metadataValues','stableValues'])assert.doesNotMatch(body(name),/^export |closed\(|getOwnPropertyDescriptors|Reflect\.ownKeys/)
  assert.match(body('assertWorkerHeartbeatActivationControlRuntimeMetadata'),/metadataValues\(closed\(raw,/)
  assert.match(body('assertWorkerHeartbeatActivationControlRuntimeStable'),/closed\(before,keys\);closed\(after,keys\)/)
  assert.ok(body('trustedMetadata').indexOf('metadataRecords.has(record)')<body('trustedMetadata').indexOf('metadataValues(record,kind)'))
  assert.ok(body('trustedStable').indexOf('stampRecords.has(after)')<body('trustedStable').indexOf('stableValues(before,after)'))
  assert.doesNotMatch(source,/DirectoryPass|directoryPasses/)
  const reader=body('readBound')
  assert.equal((reader.match(/ancestors\(file,kind==='manifest'\)/g)||[]).length,2)
  for(const token of ['before=lstatSync(file)','realpathSync(file)!==file','O_NOFOLLOW','O_NONBLOCK','readExactBoundBytes(fd,before.size)','sha(bytes)!==expected','stamp(fstatSync(fd))','stamp(lstatSync(file))','assertUtf8Bytes(bytes','finally{closeSync(fd)}'])assert.ok(reader.includes(token),token)
  for(const name of ['json','cacheCheck','inspectExports','checkExports','assertWorkerHeartbeatActivationControlRuntimeCacheRecord','assertProtocolPins','parseWorkerHeartbeatActivationControlRuntimeManifest'])assert.doesNotMatch(body(name),/metadataValues\(|stableValues\(|trustedMetadata\(|trustedStable\(/)
})

test('private trusted wrappers require constructor provenance and reject clones, raw records and proxies before field access',()=>{
  // This exact-body isolated policy has its own WeakSets; no production factory
  // or state is exported, and none of these objects grants runtime authority.
  const p=runtimeScalarPolicy(),q=runtimeScalarPolicy(),st={dev:1,ino:2,uid:0,gid:0,mode:0o100444,nlink:1,size:8,mtimeMs:1,ctimeMs:2,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false}
  const goodMeta=p.meta(st),before=p.stamp(st),after=p.stamp(st);let reads=0
  assert.doesNotThrow(()=>p.trustedMetadata(goodMeta,'code'));assert.doesNotThrow(()=>p.trustedStable(before,after))
  const trap=()=>{reads++;throw Error('untrusted_property_must_not_be_read')}
  for(const record of [goodMeta,before,after]){
    assert.equal(Object.isFrozen(record),true)
    assert.throws(()=>{record.size++},TypeError);assert.throws(()=>{delete record.size},TypeError)
    assert.throws(()=>Object.defineProperty(record,'size',{get:trap}),TypeError)
    assert.throws(()=>Object.defineProperty(record,'extra',{value:true}),TypeError)
    assert.throws(()=>Object.setPrototypeOf(record,null),TypeError)
  }
  assert.doesNotThrow(()=>p.trustedMetadata(goodMeta,'code'));assert.doesNotThrow(()=>p.trustedStable(before,after))
  function untrusted(good,foreign){
    const getter={...good};for(const key of Object.keys(getter))Object.defineProperty(getter,key,{get:trap})
    const proxy=new Proxy(good,{get:trap,getPrototypeOf:trap,ownKeys:trap,getOwnPropertyDescriptor:trap})
    const revoked=Proxy.revocable(good,{});revoked.revoke()
    return [undefined,null,1,'raw',{},Object.assign(Object.create(good),{}),{...good},structuredClone(good),getter,proxy,revoked.proxy,foreign]
  }
  for(const record of untrusted(goodMeta,q.meta(st)))assert.throws(()=>p.trustedMetadata(record,'code'),/runtime_refused/)
  for(const record of untrusted(before,q.stamp(st))){
    assert.throws(()=>p.trustedStable(record,after),/runtime_refused/)
    assert.throws(()=>p.trustedStable(before,record),/runtime_refused/)
  }
  assert.throws(()=>p.trustedMetadata(before,'code'),/runtime_refused/);assert.throws(()=>p.trustedStable(goodMeta,after),/runtime_refused/)
  assert.equal(reads,0)
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeMetadata({...goodMeta},'code'))
  assert.doesNotThrow(()=>assertWorkerHeartbeatActivationControlRuntimeStable({...before},{...after}))
  for(const record of [goodMeta,before,after])assert.throws(()=>assertWorkerHeartbeatActivationControlRuntime(record),/runtime_refused/)
})
// END additive trusted-metadata-value performance regression section.
