// Pure negative/structure checks only. No Linux/POSIX permission success is
// simulated here; Root hosted CI must prove real UID/mount isolation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {writerBootProtocol,writerCredentialPath,writerPaths} from '../src/worker-heartbeat-writer-protocol.ts'
import {readWorkerHeartbeatWriterCredential,stageWriterBootCredential,assertWriterBootUidUnused,validateWriterDeliveryDescriptor} from '../src/worker-heartbeat-writer-credentials.ts'
const id='12345678-1234-4234-8234-123456789abc',hex='a'.repeat(64)
test('delivery descriptors are closed comparison data with exact fixed paths and no DB password',()=>{
 const value={boot_id:id,kind:'prepare',uid:19000,generation:id,source_file:writerPaths.store+'/'+id+'.prepare.boot.json',mounted_file:writerCredentialPath('prepare'),sha256:hex}
 assert.deepEqual(validateWriterDeliveryDescriptor(value),value)
 for(const patch of [{source_file:'/tmp/arbitrary'},{mounted_file:'/tmp/arbitrary'},{uid:0},{sha256:'bad'},{password:'secret'},{pool:{}},{clock:0}])assert.throws(()=>validateWriterDeliveryDescriptor({...value,...patch}),/writer_/)
 let gets=0;const getter={...value};Object.defineProperty(getter,'uid',{get(){gets++;return 19000}});assert.throws(()=>validateWriterDeliveryDescriptor(getter),/writer_/);assert.equal(gets,0)
})
test('non-Linux cannot produce a real credential read, live UID proof or Root staged token',()=>{
 if(process.platform==='linux')return
 assert.throws(()=>readWorkerHeartbeatWriterCredential('prepare'),/writer_not_enrolled/)
 assert.throws(()=>assertWriterBootUidUnused(19000),/writer_not_enrolled/)
 assert.throws(()=>stageWriterBootCredential(id,{protocol:writerBootProtocol,kind:'prepare',uid:19000,generation:id,secret:hex}),/writer_not_enrolled/)
})
test('source requires UID-owner0400, Root non-writable ancestors and full fresh FD/path comparison; ACL0440 is not accepted',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-writer-credentials.ts',import.meta.url),'utf8')
 for(const text of ['process.getuid','before.uid!==uid','before.gid!==0','before.nlink!==1','!==0o400','O_NOFOLLOW','O_NONBLOCK','stable(before,fs.fstatSync(fd))','stable(before,fs.lstatSync(file))','fs.realpathSync(file)!==file','CREDENTIALS_DIRECTORY!==writerCredentialDirectory(kind)','fs.fchownSync(fd,value.uid,0)','fs.fsyncSync(fd)','O_EXCL'])assert.ok(source.includes(text),text)
 assert.doesNotMatch(source,/mode===0o440|mode===0o600|spawn\(|execFile|new Pool|import\(['"]pg['"]\)/)
 assert.match(source,/statfsSync\('\/proc'\)\.type!==0x9fa0/)
 assert.match(source,/line\.slice\(1\)\.some\(v=>Number\(v\)===uid\)/)
})
test('staged source and batch descriptor explicitly stop before unit activation and are not an enrollment factory',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-writer-credentials.ts',import.meta.url),'utf8')
 assert.match(source,/requires_exclusive_uid_reservation:true/);assert.match(source,/read_only_bind_uid_0400/)
 assert.doesNotMatch(source,/systemctl|systemd-run|mount\(|setuid\(|setgid\(|registerBinding|new WorkerHeartbeatWorkerBinding/)
 assert.match(source,/readUidFile\(writerCredentialPath\(kind\),uid,writerLimits.credentialBytes\)/)
})
