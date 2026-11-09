// Execute actual private ancestor guards with inert terminal filesystem ports.
// No runtime module, driver, SQL, Worker or host metadata authority is loaded.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

// Node24 LStat uses its ENOENT-only native predicate with throwIfNoEntry:false.
// Stat has a different ENOENT/ENOTDIR predicate and is not an equivalent port:
// https://github.com/nodejs/node/blob/v24.0.0/src/node_file.cc#L1017-L1109
// https://github.com/nodejs/node/blob/v24.14.1/src/node_file.cc#L995-L1088
// The oracle below intentionally retains the pre-optimization catch algorithm.
function originalAncestors(file,privateParent=false){
  let current=path.dirname(file),first=true;const chain=[]
  for(;;){const st=lstatSync(current);trustedMetadata(meta(st),first&&privateParent?'private-directory':'ancestor');chain.push({path:current,dev:st.dev,ino:st.ino,mode:st.mode,uid:st.uid,gid:st.gid});const parent=path.dirname(current);if(parent===current)break;current=parent;first=false}
  if(privateParent)for(const d of chain)for(const name of ['package.json','pnpm-workspace.yaml','.git','pyproject.toml']){try{lstatSync(path.join(d.path,name));fail()}catch(error){if(error?.code!=='ENOENT')throw error}}
  return chain
}
const input='/PURE_MODEL/private/immutable/manifest.json',directories=['/PURE_MODEL/private/immutable','/PURE_MODEL/private','/PURE_MODEL','/'],names=['package.json','pnpm-workspace.yaml','.git','pyproject.toml'],forbidden=directories.flatMap(d=>names.map(n=>path.posix.join(d,n))),readOrder=[...directories,...forbidden]
const actualSources=['worker-heartbeat-activation-control-runtime.mjs','pg18-complete-operator-runtime.mjs'].map(file=>{
  const text=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  assert.equal(tree.parseDiagnostics.length,0,file)
  const declarations=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ancestors')
  assert.equal(declarations.length,1,file)
  return {file,body:declarations[0].getText(tree)}
})
const oracle={file:'retained original catch algorithm',body:originalAncestors.toString()}
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value))
function scenario(){return {entries:new Map(),readErrors:new Map(),metaErrors:new Map(),metadataErrors:new Map(),version:0}}
function ports(source,state){
  const trace=[],reads=[],refusal=Error('original runtime refusal'),stats=new Map()
  function lstatSync(file,options){
    trace.push(['lstat',file]);reads.push(file)
    if(directories.includes(file)){
      assert.equal(options,undefined,'ancestor metadata lstat must retain original throwing mode')
      if(state.readErrors.has(file))throw state.readErrors.get(file)
      const i=directories.indexOf(file),st={path:file,dev:11+state.version,ino:100+i+state.version,mode:0o40500,uid:0,gid:0,version:state.version};stats.set(st,st);return st
    }
    assert(forbidden.includes(file),'unexpected or repeated-path substitute read '+file)
    if(options!==undefined){assert.deepEqual(Object.keys(options),['throwIfNoEntry']);assert.equal(options.throwIfNoEntry,false)}
    if(state.readErrors.has(file))throw state.readErrors.get(file)
    if(state.entries.has(file))return state.entries.get(file)
    // The native option suppresses only expected ENOENT, not any other error.
    if(options?.throwIfNoEntry===false)return undefined
    throw Object.assign(Error('original expected absence'),{code:'ENOENT'})
  }
  const dependencies={path:path.posix,lstatSync,meta(st){trace.push(['meta',st.path,st.version]);assert.equal(stats.get(st),st);if(state.metaErrors.has(st.path))throw state.metaErrors.get(st.path);return {st}},trustedMetadata(record,kind){const st=record.st;trace.push(['metadata',st.path,kind,st.version]);assert.equal(stats.get(st),st);if(state.metadataErrors.has(st.path))throw state.metadataErrors.get(st.path)},fail(){trace.push(['fail']);throw refusal}}
  const run=vm.runInNewContext('('+source.body+')',dependencies,{timeout:1000})
  function observe(privateParent=true){const start=trace.length,readStart=reads.length;let result,error,threw=false;try{result=privateParent==='default'?run(input):run(input,privateParent)}catch(e){threw=true;error=e}return {result:plain(result),error:error===refusal?'original_refusal':error,threw,trace:trace.slice(start),reads:reads.slice(readStart)}}
  return {observe,trace,reads,refusal}
}
function assertSame(actual,expected,label){assert.equal(actual.threw,expected.threw,label);assert.equal(actual.error,expected.error,label+' original Error identity');assert.deepEqual(actual.result,expected.result,label);assert.deepEqual(actual.trace,expected.trace,label+' call order');assert.deepEqual(actual.reads,expected.reads,label+' fresh read order')}
function compare(source,state,privateParent=true){const old=ports(oracle,state).observe(privateParent),current=ports(source,state).observe(privateParent);assertSame(current,old,source.file);return current}
function expectedChain(version=0){return directories.map((p,i)=>({path:p,dev:11+version,ino:100+i+version,mode:0o40500,uid:0,gid:0}))}
function expectedMetadata(privateParent,version=0){return directories.map((p,i)=>['metadata',p,privateParent&&i===0?'private-directory':'ancestor',version])}
const errors=()=>[
  ...['ENOTDIR','EACCES','EPERM','EIO','ELOOP','EMFILE'].map(code=>Object.assign(Error('original '+code),{code})),
  Error('original uncoded error'),new TypeError('original type error'),new RangeError('original range error'),
]

for(const source of actualSources){
  const label=source.file+': '
  test(label+'all four ancestor checks precede all16 fresh absence reads in original path/name order',()=>{const got=compare(source,scenario());assert.equal(got.threw,false);assert.deepEqual(got.result,expectedChain());assert.deepEqual(got.reads,readOrder);assert.deepEqual(got.trace.filter(r=>r[0]==='metadata'),expectedMetadata(true));assert.equal(got.trace.filter(r=>r[0]==='meta').length,4)})
  for(const mode of [false,'default'])test(label+'non-private '+mode+' performs only original four fresh metadata reads',()=>{const state=scenario();for(const p of forbidden)state.entries.set(p,{});const got=compare(source,state,mode);assert.equal(got.threw,false);assert.deepEqual(got.result,expectedChain());assert.deepEqual(got.reads,directories);assert.deepEqual(got.trace.filter(r=>r[0]==='metadata'),expectedMetadata(false))})
  for(const [i,file]of forbidden.entries()){
    test(label+'first existing forbidden entry '+i+' refuses immediately with no later reads',()=>{for(const kind of ['file','directory','symlink']){const state=scenario();state.entries.set(file,Object.freeze({inert_type:kind}));for(const later of forbidden.slice(i+1))state.readErrors.set(later,Error('later failure must not replace first existing '+kind));const got=compare(source,state);assert.equal(got.error,'original_refusal');assert.deepEqual(got.reads,[...directories,...forbidden.slice(0,i+1)]);assert.equal(got.trace.at(-1)[0],'fail')}})
    test(label+'ENOENT at forbidden position '+i+' continues to exactly the next original check',()=>{const state=scenario();if(i+1<forbidden.length)state.entries.set(forbidden[i+1],{});const got=compare(source,state);assert.deepEqual(got.reads,[...directories,...forbidden.slice(0,Math.min(i+2,forbidden.length))]);if(i+1<forbidden.length)assert.equal(got.error,'original_refusal');else{assert.equal(got.threw,false);assert.deepEqual(got.result,expectedChain())}})
    test(label+'non-ENOENT and original uncoded Error identities at forbidden position '+i+' retain first-error priority',()=>{for(const error of errors()){const state=scenario();state.readErrors.set(file,error);if(i+1<forbidden.length)state.entries.set(forbidden[i+1],{});const got=compare(source,state);assert.equal(got.error,error);assert.deepEqual(got.reads,[...directories,...forbidden.slice(0,i+1)]);assert.equal(got.trace.some(r=>r[0]==='fail'),false)}})
  }
  for(const [i,file]of directories.entries()){
    test(label+'ancestor lstat failure '+i+' is never converted into forbidden-entry absence',()=>{for(const privateParent of [true,false])for(const error of [Object.assign(Error('original ancestor ENOENT'),{code:'ENOENT'}),...errors()]){const state=scenario();state.readErrors.set(file,error);const got=compare(source,state,privateParent);assert.equal(got.error,error);assert.deepEqual(got.reads,directories.slice(0,i+1));assert.equal(got.trace.filter(r=>r[0]==='meta').length,i);assert.equal(got.trace.filter(r=>r[0]==='metadata').length,i)}})
    for(const phase of ['metaErrors','metadataErrors'])test(label+phase+' '+i+' keeps original Error and precedes every forbidden check',()=>{for(const privateParent of [true,false]){const error=Error('original '+phase+' '+i),state=scenario();state[phase].set(file,error);state.entries.set(forbidden[0],{});const got=compare(source,state,privateParent);assert.equal(got.error,error);assert.deepEqual(got.reads,directories.slice(0,i+1));assert.equal(got.trace.filter(r=>r[0]==='meta').length,i+1);assert.equal(got.trace.filter(r=>r[0]==='metadata').length,i+(phase==='metadataErrors'?1:0))}})
  }
  test(label+'the original catch still observes a throwing error-code accessor at every forbidden position',()=>{for(const [i,file]of forbidden.entries()){const original=Error('original code getter failure'),error={};let gets=0;Object.defineProperty(error,'code',{get(){gets++;throw original}});const state=scenario();state.readErrors.set(file,error);const got=compare(source,state);assert.equal(got.error,original);assert.equal(gets,2,'exactly once in each actual/original catch');assert.deepEqual(got.reads,[...directories,...forbidden.slice(0,i+1)])}})
  test(label+'repeated calls observe newly present absent and changed metadata with no cached lstat result',()=>{
    const state=scenario(),current=ports(source,state),old=ports(oracle,state)
    const compareNext=()=>{const a=current.observe(),b=old.observe();assertSame(a,b,label);return a}
    const first=compareNext();assert.deepEqual(first.reads,readOrder);assert.deepEqual(first.result,expectedChain())
    state.entries.set(forbidden[0],{});state.version=1;const second=compareNext();assert.equal(second.error,'original_refusal');assert.deepEqual(second.reads,[...directories,forbidden[0]])
    state.entries.delete(forbidden[0]);state.version=2;const third=compareNext();assert.equal(third.threw,false);assert.deepEqual(third.reads,readOrder);assert.deepEqual(third.result,expectedChain(2));assert.notDeepEqual(third.result,first.result)
    const error=Object.assign(Error('new last-position ENOTDIR'),{code:'ENOTDIR'});state.readErrors.set(forbidden.at(-1),error);const fourth=compareNext();assert.equal(fourth.error,error);assert.deepEqual(fourth.reads,readOrder)
    state.readErrors.clear();state.version=3;const fifth=compareNext();assert.deepEqual(fifth.reads,readOrder);assert.deepEqual(fifth.result,expectedChain(3));assert.equal(current.reads.length,85);assert.equal(old.reads.length,85)
  })
}
test('both actual runtime ancestors guards retain the same fresh observation and Error order across every forbidden position',()=>{for(let i=-1;i<forbidden.length;i++){const state=scenario();if(i>=0)state.readErrors.set(forbidden[i],Object.assign(Error('shared original EIO '+i),{code:'EIO'}));const a=ports(actualSources[0],state).observe(),b=ports(actualSources[1],state).observe();assertSame(a,b,'actual guard parity '+i)}})
