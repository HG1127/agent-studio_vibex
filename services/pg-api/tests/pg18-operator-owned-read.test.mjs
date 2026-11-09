// Actual extracted private functions + inert FS DATA. No runtime/Pool/SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {isUtf8} from 'node:buffer'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../src/pg18-complete-operator-runtime.mjs',import.meta.url),'utf8'),oldBound=fs.readFileSync(new URL('./fixtures/pg18-operator-read-pre-allocation.txt',import.meta.url),'utf8'),sha=b=>createHash('sha256').update(b).digest('hex'),fields=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs']
function tree(text){const t=ts.createSourceFile('runtime.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(t.parseDiagnostics.length,0);return t}
function fun(text,name){const t=tree(text),n=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);return n.getText(t)}
function variable(name){const t=tree(source),n=t.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(n=>n.name.getText(t)===name);assert.ok(n,name);return 'const '+n.getText(t)+';'}
const failure=Object.freeze({refusal:true}),ioError=Object.freeze({io:true}),closeError=Object.freeze({close:true})
function harness(legacy,options={}){
 const bytes=options.bytes??Buffer.alloc(131079,65),file='/terminal/source.js',base={dev:1,ino:2,mode:0o100444,uid:0,gid:0,nlink:1,size:bytes.length,mtimeMs:10,ctimeMs:10,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false},chain=[{path:'/terminal',dev:1,ino:3,mode:0o40555,uid:0,gid:0}],trace=[],bufferOffsets=[],counts={alloc:0,allocUnsafe:0,copies:0,concat:0},buffer=Object.create(Buffer);let data=options.current??bytes,calls={}
 const event=(name,detail)=>{calls[name]=(calls[name]??0)+1;trace.push(detail??name);if(options.io===name+':'+calls[name])throw ioError}
 buffer.alloc=n=>{counts.alloc++;if(options.allocationError)throw ioError;return Buffer.alloc(n)}
 buffer.allocUnsafe=n=>{counts.allocUnsafe++;if(options.allocationError)throw ioError;return Buffer.alloc(n,0xaa)}
 buffer.from=value=>{counts.copies++;return Buffer.from(value)}
 buffer.concat=value=>{counts.concat++;return Buffer.concat(value)}
 const deps={Buffer:buffer,Uint8Array,isUtf8,constants:{O_RDONLY:1,O_NOFOLLOW:2,O_NONBLOCK:4},fail(){throw failure},ancestors(){event('ancestors');return options.chainDrift&&calls.ancestors===2?[{...chain[0],ino:4}]:chain},lstatSync(name){assert.equal(name,file);event('lstat');return options.drift&&calls.lstat===2?{...base,[options.drift]:base[options.drift]+1}:options.metadata?{...base,...options.metadata}:base},realpathSync(name){event('realpath');return options.realpathMismatch?'/elsewhere':name},openSync(name,flags){assert.equal(name,file);assert.equal(flags,7);event('open');return 7},fstatSync(fd){assert.equal(fd,7);event('fstat');return options.drift&&calls.fstat===2?{...base,[options.drift]:base[options.drift]+1}:base},readSync(fd,target,offset,length,position){assert.equal(fd,7);bufferOffsets.push(offset);event('read',['read',position,length]);const n=Math.min(Math.max(0,data.length-position),length,options.chunk??65536);data.copy(target,offset,position,position+n);return n},closeSync(fd){assert.equal(fd,7);event('close');if(options.closeError)throw closeError},sha(value){event('hash');return sha(value)}}
 const code=['metadataValues','trustedMetadata','trustedStable','stableValues','sameChain','assertUtf8Bytes'].map(n=>fun(source,n)).join('\n')+'\n'+['metadataRecords','stampRecords','meta','stamp'].map(variable).join('\n')+'\n'+(legacy?oldBound:fun(source,'readBound'))+';return readBound'
 const read=Function(...Object.keys(deps),code)(...Object.values(deps))
 return {trace,bufferOffsets,counts,bytes,setBytes(value){data=value},run(){calls={};return read(file,options.expected??sha(bytes),'code',options.expectedBytes)}}
}
const result=h=>{try{return {ok:true,value:h.run()}}catch(error){return {ok:false,error}}}
function equivalent(options={}){const a=harness(true,options),b=harness(false,options),left=result(a),right=result(b);assert.equal(left.ok,right.ok);if(left.ok){assert.deepEqual(right.value.bytes,left.value.bytes);assert.deepEqual(right.value.stamp,left.value.stamp);assert.deepEqual(right.value.chain,left.value.chain)}else assert.equal(right.error,left.error);assert.deepEqual(b.trace,a.trace);return {a,b,left,right}}
test('original readBound fixture is pinned; allocation is the only changed source block',()=>{
 assert.equal(sha(oldBound),'415c7fc2a4dd41cf0b17bc35dbacb458f5639e957a56df69cf68d49b840102ef')
 const next=fun(source,'readBound'),from=next.indexOf('    // One owned allocation;'),end=next.indexOf('\n    if(bytes.length',from),a=oldBound.indexOf('    const chunks='),z=oldBound.indexOf('\n    if(bytes.length',a)
 assert.ok(from>0&&end>from&&a>0&&z>a);assert.equal(next.slice(0,from)+oldBound.slice(a,z)+next.slice(end),oldBound)
})
test('fresh read requests, positions and EOF probe are identical across64KiB boundaries',()=>{
 for(const size of [1,65535,65536,65537,131079]){const {a,b,right}=equivalent({bytes:Buffer.alloc(size,65)});assert.equal(right.ok,true);assert.equal(a.bufferOffsets.every(n=>n===0),true);assert.deepEqual(b.bufferOffsets,b.trace.filter(Array.isArray).map(r=>r[1]));assert.deepEqual(b.trace.filter(Array.isArray).at(-1),['read',size,1])}
})
test('partial native reads retain the same next request and exact initialized output',()=>{
 for(const chunk of [1,7,16384,32768,65536]){const {right}=equivalent({bytes:Buffer.alloc(65540,65),chunk});assert.equal(right.ok,true);assert.equal(right.value.bytes.length,65540);assert.equal(right.value.bytes.includes(0xaa),false)}
})
test('all nine fresh identity drift checks retain original refusal and close order',()=>{for(const drift of fields){const {right,b}=equivalent({drift});assert.equal(right.error,failure);assert.equal(b.trace.at(-1),'close')}})
test('same-size mutation, truncation and growth retain original failure stage',()=>{
 const bytes=Buffer.alloc(131079,65);for(const current of [Buffer.alloc(bytes.length,66),bytes.subarray(0,-1),Buffer.concat([bytes,Buffer.from('x')])]){const {right,b}=equivalent({bytes,current});assert.equal(right.error,failure);assert.equal(b.trace.at(-1),'close')}
})
test('matching-hash UTF8, NUL and BOM refusals retain all prior fresh checks',()=>{
 for(const bytes of [Buffer.from([0xc3,0x28]),Buffer.from([65,0]),Buffer.from([0xef,0xbb,0xbf,65])]){const {right,b}=equivalent({bytes});assert.equal(right.error,failure);assert.equal(b.trace.filter(n=>n==='ancestors').length,2);assert.equal(b.trace.filter(n=>n==='fstat').length,2);assert.equal(b.trace.at(-1),'close')}
})
test('owner, mode, links, size, canonical path and ancestor refusals remain unchanged',()=>{
 for(const options of [{metadata:{uid:1}},{metadata:{gid:1}},{metadata:{mode:0o100666}},{metadata:{nlink:2}},{metadata:{size:0}},{metadata:{size:16*1024*1024+1}},{expectedBytes:3},{realpathMismatch:true},{chainDrift:true}]){const {right}=equivalent(options);assert.equal(right.error,failure)}
})
test('every filesystem error and original close-error priority remain exact',()=>{
 for(const io of ['ancestors:1','lstat:1','realpath:1','open:1','fstat:1','read:1','read:2','read:3','hash:1','fstat:2','lstat:2','ancestors:2','close:1']){const {right}=equivalent({io});assert.equal(right.error,ioError)}
 for(const options of [{expected:'0'.repeat(64),closeError:true},{io:'read:2',closeError:true},{allocationError:true,closeError:true}])assert.equal(equivalent(options).right.error,closeError)
 assert.equal(equivalent({allocationError:true}).right.error,ioError)
})
test('single owned allocation removes chunk clones and concat without reusing bytes',()=>{
 const a=harness(true),b=harness(false),first=b.run(),copy=Buffer.from(first.bytes);a.run();assert.ok(a.counts.copies>2);assert.equal(a.counts.concat,1);assert.deepEqual(b.counts,{alloc:0,allocUnsafe:1,copies:0,concat:0});b.run();assert.deepEqual(first.bytes,copy);assert.equal(b.counts.allocUnsafe,2);b.setBytes(Buffer.alloc(b.bytes.length,66));assert.throws(()=>b.run(),error=>error===failure);assert.equal(b.trace.filter(n=>n==='hash').length,3);assert.deepEqual(first.bytes,copy)
})
