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
test('final read audit passes the actual policy rather than the private observation handle',async()=>{
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
    inspectRegistry:async(v,p,read)=>{audits++;assert.equal(v,s);assert.equal(p,policy);assert.notEqual(p,begin);assert.equal(read,l);return end},observedSha:()=>digest,
    empty:()=>Object.freeze(Object.create(null)),controlFail,WorkerHeartbeatControlError:Error,revoke:()=>assert.fail('valid final audit revoked'),cleanupLease:()=>assert.fail('valid final audit cleaned as failure')}
  vm.runInNewContext(code,context,{timeout:1000});const finished=await context.subject(control,peerHandle,leaseHandle)
  assert.equal(audits,1);assert.equal(l.phase,'finished');assert.equal(l.clean,true);assert.equal(finishedStates.get(finished),l)
})

