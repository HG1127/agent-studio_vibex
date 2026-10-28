// Pure data/refusal policy only. No real pg import, secret, DB, successful
// backup proof or runtime capability is fabricated by this test suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import * as ts from 'typescript'
import {
  descriptivePatchOperatorRuntimePolicy as policy,parseDescriptivePatchOperatorRuntimeManifest,
  assertDescriptivePatchOperatorRuntimeEnvironment,assertDescriptivePatchOperatorRuntimeMetadata,
  assertDescriptivePatchOperatorRuntimeStable,assertDescriptivePatchOperatorRuntimeInventory,assertDescriptivePatchOperatorRuntimeCacheRecord,
  verifyDescriptivePatchOperatorRuntime,assertDescriptivePatchOperatorRuntime,loadDescriptivePatchOperatorPg,
  resolveDescriptivePatchOperatorRuntimeModule,
} from '../src/agent-descriptive-patch-operator-runtime.mjs'
const hash=b=>createHash('sha256').update(b).digest('hex'),digest='a'.repeat(64),prefix='services/pg-api/node_modules/'
const ordered=a=>a.sort((a,b)=>a<b?-1:a>b?1:0)
function manifest(){
  const names=ordered(Object.keys(policy.packages)),paths=new Set([prefix+'pg/esm/index.mjs',prefix+'pg/lib/client.js',prefix+'pg/lib/native/index.js'])
  for(const n of names){paths.add(prefix+n+'/package.json');paths.add(prefix+n+'/'+policy.packages[n].entry)}
  return {format:'agent_descriptive_patch_operator_runtime_v1',lock_sha256:policy.lock_sha256,pg_version:'8.23.1',
    packages:names.map(name=>({name,version:policy.packages[name].version})),files:ordered([...paths]).map(path=>({path,sha256:digest,bytes:8}))}
}
const parse=m=>{const raw=JSON.stringify(m);return parseDescriptivePatchOperatorRuntimeManifest(raw,hash(raw),policy.lock_sha256)}
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
  assert.throws(()=>parseDescriptivePatchOperatorRuntimeManifest(raw,digest,policy.lock_sha256),/runtime_refused/)
  assert.throws(()=>parseDescriptivePatchOperatorRuntimeManifest(raw,hash(raw),digest),/runtime_refused/)
  assert.throws(()=>loadDescriptivePatchOperatorPg(result),/runtime_refused/)
  for(const patch of [{extra:true},{pg_version:'8.24.0'},{lock_sha256:digest}])assert.throws(()=>parse({...m,...patch}),/runtime_refused/)
  const wrong=manifest();wrong.packages[0].version='0.0.0';assert.throws(()=>parse(wrong),/runtime_refused/)
  const missing=manifest();missing.packages.pop();assert.throws(()=>parse(missing),/runtime_refused/)
})
test('duplicate decoded JSON keys, unsafe encodings/numbers and unapproved re-signing are refused',()=>{
  const raw=JSON.stringify(manifest())
  for(const bad of [raw.replace('"format":','"format":"bad","\\u0066ormat":'),'\uFEFF'+raw,raw+'\0',raw.replace('"bytes":8','"bytes":9007199254740992'),raw.replace('"bytes":8','"bytes":-0')]){
    assert.throws(()=>parseDescriptivePatchOperatorRuntimeManifest(bad,hash(bad),policy.lock_sha256),/runtime_refused/)
  }
  assert.throws(()=>parseDescriptivePatchOperatorRuntimeManifest(raw+' ',hash(raw),policy.lock_sha256),/runtime_refused/)
  const invalid=Buffer.from([0xc3,0x28]);assert.throws(()=>parseDescriptivePatchOperatorRuntimeManifest(invalid,hash(invalid),policy.lock_sha256),/runtime_refused/)
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
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeMetadata(metadata(),'code'))
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeMetadata(metadata({type:'directory',mode:0o40555,nlink:2}),'directory'))
  for(const p of [{uid:1},{gid:1},{nlink:2},{mode:0o100644},{mode:0o100440},{symlink:true},{size:0},{type:'other'}])assert.throws(()=>assertDescriptivePatchOperatorRuntimeMetadata(metadata(p),'code'),/runtime_refused/)
  for(const mode of [0o40755,0o40777,0o41555])assert.throws(()=>assertDescriptivePatchOperatorRuntimeMetadata(metadata({type:'directory',mode,nlink:2}),'directory'),/runtime_refused/)
  const stamp={dev:1,ino:2,mode:0o100444,uid:0,gid:0,nlink:1,size:8,mtimeMs:2,ctimeMs:2}
  for(const key of Object.keys(stamp))assert.throws(()=>assertDescriptivePatchOperatorRuntimeStable(stamp,{...stamp,[key]:stamp[key]+1}),/runtime_refused/)
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeStable(stamp,{...stamp}))
})
test('actual module-resolution policy has no ancestor lookup and refuses undeclared, native and all runtime ESM routes',()=>{
  const m=parse(manifest()),from=prefix+'pg/lib/index.js'
  assert.deepEqual(resolveDescriptivePatchOperatorRuntimeModule(m,from,'pg-pool',['require']),{path:prefix+'pg-pool/index.js',format:'commonjs'})
  assert.deepEqual(resolveDescriptivePatchOperatorRuntimeModule(m,from,'./client',['require']),{path:prefix+'pg/lib/client.js',format:'commonjs'})
  assert.deepEqual(resolveDescriptivePatchOperatorRuntimeModule(m,from,'events',['require']),{builtin:'node:events'})
  for(const [spec,conditions] of [['pg-native',[]],['xtend',[]],['../../pg-pool/index.js',[]],['./native',[]],['pg-pool',['import']],['../esm/index.mjs',[]],['/tmp/pg/index.js',[]],['file:///tmp/pg.js',[]],['missing',[]]]){
    assert.throws(()=>resolveDescriptivePatchOperatorRuntimeModule(m,from,spec,conditions),/runtime_refused/,spec)
  }
})
test('physical inventory policy requires exact files and refuses extra, missing, case-alias, duplicate or accessor records',()=>{
  const expected=['pg/a.js','pg/b.js']
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeInventory(expected,[...expected].reverse()))
  for(const actual of [expected.slice(1),[...expected,'evil.js'],['pg/A.js','pg/b.js'],[...expected,'pg/a.js']])assert.throws(()=>assertDescriptivePatchOperatorRuntimeInventory(expected,actual),/runtime_refused/)
  let reads=0;const accessor=[...expected];Object.defineProperty(accessor,'0',{get(){reads++;return expected[0]}})
  assert.throws(()=>assertDescriptivePatchOperatorRuntimeInventory(expected,accessor),/runtime_refused/);assert.equal(reads,0)
})
test('cached module records require exact filename/id, completed evaluation and original module/exports references without getters',()=>{
  const file='/stage/pg/index.js',exports={},module={id:file,filename:file,loaded:true,exports}
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeCacheRecord(module,file,module,exports))
  for(const changed of [{...module},{...module,exports:{}},{...module,loaded:false},{...module,filename:'/ancestor/pg.js'}])assert.throws(()=>assertDescriptivePatchOperatorRuntimeCacheRecord(changed,file,module,exports),/runtime_refused/)
  let reads=0;const getter={...module};Object.defineProperty(getter,'exports',{get(){reads++;return exports}})
  assert.throws(()=>assertDescriptivePatchOperatorRuntimeCacheRecord(getter,file),/runtime_refused/);assert.equal(reads,0)
})
test('ambient driver/native/loader flags and cloned or data-only capabilities refuse before any package load',()=>{
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorRuntimeEnvironment({},['--experimental-strip-types']))
  for(const key of ['NODE_PG_FORCE_NATIVE','NODE_PG_FORCE_JS','PGPASSWORD','DATABASE_URL','LD_PRELOAD','LD_LIBRARY_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE'])assert.throws(()=>assertDescriptivePatchOperatorRuntimeEnvironment({[key]:''},[]),/runtime_refused/)
  for(const flag of ['--import','--require','--conditions=workerd','--preserve-symlinks'])assert.throws(()=>assertDescriptivePatchOperatorRuntimeEnvironment({},[flag]),/runtime_refused/)
  for(const cap of [{},Object.freeze({}),structuredClone({}),parse(manifest())]){
    assert.throws(()=>assertDescriptivePatchOperatorRuntime(cap),/runtime_refused/)
    assert.throws(()=>loadDescriptivePatchOperatorPg(cap),/runtime_refused/)
  }
  assert.throws(()=>verifyDescriptivePatchOperatorRuntime({},digest,{manifestFile:'/must-not-read',manifestSha256:digest,lockSha256:policy.lock_sha256}),/runtime_refused|source_refused/)
})
test('real source has no installer, signer, test-helper import or bare pg import and enforces verified FD source and cache before returning Pool',()=>{
  const source=readFileSync(new URL('../src/agent-descriptive-patch-operator-runtime.mjs',import.meta.url),'utf8')
  const tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0)
  assert.doesNotMatch(source,/import\(['"]pg['"]\)|writeFile|writeSync|spawn\(|execFile|testhelper|new Pool\(/)
  for(const text of ['O_NOFOLLOW','O_NONBLOCK','shortCircuit:true','source:bound.bytes.toString','state.loadedSources.add(relative)','cacheCheck(state)',"const signedRequire=createRequire(pathToFileURL(state.entry)),pg=signedRequire(state.entry)","claimed.has(root)","state.failed=true"])assert.ok(source.includes(text),text)
  assert.ok(source.indexOf('cacheCheck(state)',source.indexOf('const signedRequire='))<source.indexOf('state.handle=Object.freeze'))
})
