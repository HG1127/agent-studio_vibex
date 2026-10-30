// Pure control-flow tests execute the actual strict read and diagnostic bodies.
// FS observations are synthetic terminal data. No fixture import, SQL, Worker,
// process, timer, driver, kernel identity or genuine hosted execution occurs.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
const source=fs.readFileSync(new URL('./helpers/worker-heartbeat-writer-ci-fixture.mjs',import.meta.url),'utf8')
const start=source.indexOf('function stamp(s)'),end=source.indexOf('function syncDir(',start)
assert(start>=0&&end>start)
const actual=source.slice(start,end),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const store='/fixed/private/controller',privateText='DO_NOT_PRINT_PRIVATE_CREDENTIAL_OR_FILE_BYTES',privateFile=store+'/private-'+privateText
const keys=['event','file_class','descriptor_identity_changed','path_identity_changed','descriptor_size_relation','path_size_relation',
 'read_size_relation','descriptor_mtime_changed','descriptor_ctime_changed','pinned_digest_mismatch','observed_data_only'].sort()
function model(options={}){
 const bytes=Buffer.from(options.bytes??'record\n'),output=[],operations=[]
 const before={dev:5,ino:77,uid:0,gid:0,mode:0o100600,nlink:1,size:bytes.length,mtimeMs:100,ctimeMs:100,...options.before}
 const descriptor={...before,...options.descriptor},last={...before,...options.last}
 const stat=value=>({...value,isFile:()=>!options.notFile,isSymbolicLink:()=>Boolean(options.symlink)})
 let lstatCalls=0
 const file=options.file??store+'/journal.jsonl',io={constants:{O_RDONLY:0,O_NOFOLLOW:131072,O_NONBLOCK:2048},
  lstatSync(value){assert.equal(value,file);operations.push('lstat');return stat(lstatCalls++===0?before:last)},
  realpathSync(value){assert.equal(value,file);return options.alias??file},
  openSync(value,flags){assert.equal(value,file);assert.equal(flags,131072|2048);operations.push('open');return 42},
  readFileSync(fd){assert.equal(fd,42);operations.push('read');return bytes},
  fstatSync(fd){assert.equal(fd,42);operations.push('fstat');return stat(descriptor)},
  closeSync(fd){assert.equal(fd,42);operations.push('close')},
 }
 const fail=label=>{throw Error('telemetry_control_ci_fixture_refused:'+label)}
 const process={stderr:{write(line){if(options.outputThrows)throw Error('PRIVATE_OBSERVATION_FAILURE');output.push(line)}}}
 const load=Function('fs','paths','sha','fail','process',actual+'\nreturn {read}')
 const reader=load(io,{store},sha,fail,process)
 return{read:()=>reader.read(file,options.readOptions),output,operations,bytes,observe:()=>{
  assert.equal(output.length,1);const event=JSON.parse(output[0]);assert.deepEqual(Object.keys(event).sort(),keys)
  assert.equal(event.event,'genuine_writer_ci_file_change_observation');assert.equal(event.observed_data_only,true)
  assert(['controller_journal','other_private_file'].includes(event.file_class))
  for(const key of ['descriptor_size_relation','path_size_relation','read_size_relation'])assert(['same','grew','shrank'].includes(event[key]))
  for(const key of keys.filter(key=>key.endsWith('_changed')||key.endsWith('_mismatch')))assert.equal(typeof event[key],'boolean')
  assert.equal(output.join('').includes(privateText),false);assert.equal(output.join('').includes(file),false)
  assert.equal(output.join('').includes(sha(bytes)),false);return event
 }}
}
const refuses=m=>{assert.throws(m.read,{message:'telemetry_control_ci_fixture_refused:file_changed'});assert.equal(m.operations.filter(v=>v==='close').length,1)}

test('stable strict read returns actual bytes, closes once and emits no observation',()=>{
 const m=model();assert.deepEqual(m.read(),m.bytes);assert.deepEqual(m.operations,['lstat','open','read','fstat','lstat','close']);assert.deepEqual(m.output,[])
})
test('concurrent journal append during read remains refused and reports growth without identity data',()=>{
 const m=model({bytes:'record\nnext\n',before:{size:7},descriptor:{size:12,mtimeMs:101,ctimeMs:101},last:{size:12}})
 refuses(m);const event=m.observe();assert.equal(event.file_class,'controller_journal')
 assert.equal(event.descriptor_identity_changed,false);assert.equal(event.path_identity_changed,false)
 assert.equal(event.descriptor_size_relation,'grew');assert.equal(event.path_size_relation,'grew');assert.equal(event.read_size_relation,'grew')
 assert.equal(event.descriptor_mtime_changed,true);assert.equal(event.descriptor_ctime_changed,true);assert.equal(event.pinned_digest_mismatch,false)
})
test('append after returned bytes remains refused even when the read length was unchanged',()=>{
 const m=model({descriptor:{size:14,mtimeMs:101,ctimeMs:101},last:{size:14}});refuses(m)
 const event=m.observe();assert.equal(event.read_size_relation,'same');assert.equal(event.descriptor_size_relation,'grew')
})
test('truncation and same-size rewrite are distinguishable, and both keep the original refusal',()=>{
 const truncated=model({descriptor:{size:2},last:{size:2}});refuses(truncated);assert.equal(truncated.observe().descriptor_size_relation,'shrank')
 const rewrite=model({descriptor:{mtimeMs:101,ctimeMs:101}});refuses(rewrite);const event=rewrite.observe()
 assert.equal(event.descriptor_size_relation,'same');assert.equal(event.descriptor_mtime_changed,true);assert.equal(event.descriptor_ctime_changed,true)
})
for(const field of ['dev','ino','uid','gid','mode'])test('changed descriptor '+field+' is still refused without logging its value',()=>{
 const m=model({descriptor:{[field]:919191}});refuses(m);assert.equal(m.observe().descriptor_identity_changed,true);assert.equal(m.output.join('').includes('919191'),false)
})
test('path replacement is separate from the open descriptor and does not authorize either',()=>{
 const m=model({last:{ino:919191}});refuses(m);const event=m.observe();assert.equal(event.descriptor_identity_changed,false);assert.equal(event.path_identity_changed,true)
})
test('pinned content mismatch stays fatal; no contents or digests appear in observations',()=>{
 const m=model({bytes:privateText,file:privateFile,readOptions:{pin:'a'.repeat(64)}});refuses(m);const event=m.observe()
 assert.equal(event.file_class,'other_private_file');assert.equal(event.pinned_digest_mismatch,true);assert.equal(m.output.join('').includes('a'.repeat(64)),false)
})
test('diagnostic output failure cannot suppress or replace the original refusal or FD cleanup',()=>{
 const m=model({descriptor:{size:14},outputThrows:true});refuses(m);assert.deepEqual(m.output,[])
})
test('original private-file checks and size bound remain before open, without retries',()=>{
 for(const option of [{before:{uid:1}},{before:{gid:1}},{before:{mode:0o100644}},{before:{nlink:2}},{before:{size:0}},
  {before:{size:4194305}},{symlink:true},{notFile:true},{alias:'/different'}]){
  const m=model(option);assert.throws(m.read,/fixture_refused:private_file/);assert.equal(m.operations.includes('open'),false);assert.deepEqual(m.output,[])
 }
})
test('journal chain and original 5s exact-owned cleanup requirements remain unchanged',()=>{
 assert(source.includes("const text=read(paths.store+'/journal.jsonl').toString('utf8');if(!text.endsWith('\\n'))fail('writer_ci_journal_incomplete')"))
 assert(source.includes("sha(JSON.stringify(body))!==record_sha256)fail('writer_ci_journal_chain')"))
 assert(source.includes("},'writer_stopped_owned_cleanup',5000)"));assert(source.includes('!await writerBackendAbsent(s,b)'))
 assert(source.includes("s.writerStoppedChildren.has(c)"));assert(source.includes("const fresh=writerObservationJournal(s)"))
 assert.doesNotMatch(actual,/until\(|delay\(|setTimeout|while\s*\(/)
})
