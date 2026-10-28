// Pure closed-value policy. No genuine Root/Worker binding or POSIX authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {workerHeartbeatKinds} from '../src/worker-heartbeat-contract.ts'
import {parseWorkerHeartbeatRootProfile} from '../src/worker-heartbeat-activation-control-contract.ts'
import {writerProtocol,writerBootProtocol,writerKind,writerSocketPath,writerCredentialPath,writerLimits,parseWriterSettings,parseWriterBootCredential,parseWriterReport,parseWriterRequest,parseWriterHello,parseWriterAck,parseWriterResponse,writerEncode,writerDecode,writerUtc} from '../src/worker-heartbeat-writer-protocol.ts'
const gen='12345678-1234-4234-8234-123456789abc',request='22345678-1234-4234-8234-123456789abc',hex='a'.repeat(64)
const report=patch=>({protocol:'native_worker_heartbeat_report_v1',generation:gen,sequence:1,state:'unknown',reason:'startup_checks_pending',...patch})
const settings=patch=>({enabled:true,native_uid:17000,groups:workerHeartbeatKinds.map((kind,i)=>({kind,gid:18000+i})),boot_uids:[19000,19001,19002],uid_policy:'exclusive_never_reuse',...patch})
const bad=run=>assert.throws(run,/writer_|invalid_command/)
test('eight fixed kinds choose only exact socket and existing unit credential paths',()=>{
 assert.equal(new Set(workerHeartbeatKinds.map(writerSocketPath)).size,8)
 for(const kind of workerHeartbeatKinds){assert.equal(writerKind(kind),kind);assert.match(writerSocketPath(kind),/^\/run\/agentstudio-telemetry-writers\/[a-z0-9_]+\/report\.sock$/);assert.match(writerCredentialPath(kind),/^\/run\/credentials\/agentstudio-pg18-[a-z0-9-]+\.service\/telemetry-[a-z0-9-]+\.boot\.json$/)}
 for(const value of ['../prepare','prepare/../../reader','reader','operator',null,{},0])bad(()=>writerKind(value))
 assert.equal(writerLimits.sendMs,5000);assert.equal(writerLimits.intervalMs,30000)
})
test('v2 writer settings require distinct non-native GIDs and a bounded distinct fresh-UID reservation pool',()=>{
 assert.deepEqual(parseWriterSettings({enabled:false},17001),{enabled:false});assert.equal(parseWriterSettings(settings(),17001).groups.length,8)
 for(const patch of [{native_uid:0},{boot_uids:[]},{boot_uids:[19000,19000]},{boot_uids:[17000]},{boot_uids:[NaN]},{uid_policy:'reuse_after_restart'},{extra:true}])bad(()=>parseWriterSettings(settings(patch),17001))
 for(const change of [v=>v.groups.pop(),v=>v.groups.reverse(),v=>v.groups[1].gid=v.groups[0].gid,v=>v.groups[0].gid=17001,v=>v.groups[0].gid=0,v=>v.groups[0].extra=true]){const v=settings();change(v);bad(()=>parseWriterSettings(v,17001))}
 bad(()=>parseWriterSettings({enabled:false,groups:[]},17001));bad(()=>parseWriterSettings(settings({boot_uids:Array.from({length:129},(_,i)=>20000+i)}),17001))
})
test('original signed profile v1 stays closed and v2 is optional/off without any authority or I/O',()=>{
 const v1={protocol:'worker_heartbeat_control_profile_v1',mode:'closed',source_sha256:hex,source_manifest_sha256:hex,runtime_manifest_sha256:hex,admin_password_sha256:hex,reader_password_sha256:hex,native_gid:17001,binding:{},policy:{}}
 assert.deepEqual(parseWorkerHeartbeatRootProfile(v1),v1)
 bad(()=>parseWorkerHeartbeatRootProfile({...v1,writers:{enabled:false}}))
 const v2={...v1,protocol:'worker_heartbeat_control_profile_v2'};assert.deepEqual(parseWorkerHeartbeatRootProfile(v2),v2)
 assert.deepEqual(parseWorkerHeartbeatRootProfile({...v2,writers:{enabled:false}}).writers,{enabled:false})
 assert.equal(parseWorkerHeartbeatRootProfile({...v2,writers:settings()}).writers.enabled,true)
 bad(()=>parseWorkerHeartbeatRootProfile({...v2,extra:true}));bad(()=>parseWorkerHeartbeatRootProfile({...v2,writers:settings({native_uid:0})}))
})
test('boot tokens contain no DB password and preserve canonical kind, UID and issued generation values',()=>{
 const value={protocol:writerBootProtocol,kind:'prepare',uid:19000,generation:gen,secret:hex}
 assert.deepEqual(parseWriterBootCredential(value,'prepare'),value)
 for(const patch of [{kind:'model'},{uid:0},{generation:gen.toUpperCase()},{secret:'short'},{password:'must_not_exist'}])bad(()=>parseWriterBootCredential({...value,...patch},'prepare'))
})
test('only original closed report values pass, including monotone-counter scalar boundaries and terminal pairs',()=>{
 for(const [state,reason]of [['unknown','startup_checks_pending'],['unknown','loop_unavailable'],['ready','startup_checks_complete'],['draining','new_claims_closed']])assert.equal(parseWriterReport(report({state,reason})).state,state)
 assert.equal(parseWriterReport(report({sequence:Number.MAX_SAFE_INTEGER})).sequence,Number.MAX_SAFE_INTEGER)
 for(const patch of [{protocol:'other'},{sequence:0},{sequence:-0},{sequence:1.2},{sequence:Infinity},{sequence:Number.MAX_SAFE_INTEGER+1},{generation:gen.toUpperCase()},{state:'ready',reason:'new_claims_closed'},{kind:'model'},{clock:0},{target:'anything'}])bad(()=>parseWriterReport(report(patch)))
})
test('writer hello and report frames cannot inject identity, target, role, PID or SQL',()=>{
 const hello={protocol:writerProtocol,request_id:request,op:'bind',boot_secret:hex},send={protocol:writerProtocol,request_id:request,op:'report',binding_id:hex,permit:hex,report:report()}
 assert.deepEqual(parseWriterRequest(hello),hello);assert.deepEqual(parseWriterRequest(send),send)
 for(const key of ['kind','slot_no','uid','gid','pid','role','password','target','pool','clock','sql','generation'])bad(()=>parseWriterRequest({...hello,[key]:'injected'}))
 for(const patch of [{op:'resume'},{permit:'bad'},{binding_id:'bad'},{extra:true}])bad(()=>parseWriterRequest({...send,...patch}))
})
test('closed ACKs correlate exact request, sequence and one-use permit; no local clock freshness is manufactured',()=>{
 const hello={binding_id:hex,instance_id:gen,generation:gen,next_permit:hex},ack={accepted:true,sequence:1,observed_at:'2026-10-29T01:02:03.004Z',next_permit:hex}
 assert.deepEqual(parseWriterHello(hello),hello);assert.deepEqual(parseWriterAck(ack,1),ack)
 const envelope={protocol:writerProtocol,request_id:request,ok:true,value:ack}
 assert.equal(parseWriterResponse(envelope,request,'report',1).ok,true)
 bad(()=>parseWriterResponse(envelope,gen,'report',1));bad(()=>parseWriterAck({...ack,sequence:2},1));bad(()=>parseWriterAck({...ack,next_permit:undefined},1))
 const busy={protocol:writerProtocol,request_id:request,ok:false,value:{code:'writer_busy',not_dispatched:true,settled:true,next_permit:hex}}
 assert.equal(parseWriterResponse(busy,request,'report',1).value.not_dispatched,true)
 for(const patch of [{not_dispatched:false},{code:'writer_uncertain'},{settled:false}])bad(()=>parseWriterResponse({...busy,value:{...busy.value,...patch}},request,'report',1))
 for(const value of ['0000-01-01T00:00:00.000Z','2026-02-30T00:00:00.000Z','2026-10-29T01:02:03Z','bad'])bad(()=>writerUtc(value))
})
test('strict JSON framing refuses duplicate decoded keys, malformed UTF8/BOM/NUL, oversize and accessor/extra records without getters',()=>{
 const frame=writerEncode(report());assert.equal(frame.readUInt32BE(0),frame.length-4);assert.deepEqual(writerDecode(frame.subarray(4)),report())
 for(const bytes of [Buffer.from('{"x":1,"\\u0078":2}'),Buffer.from([0xc3,0x28]),Buffer.from('\uFEFF{}'),Buffer.from('{}\0')])bad(()=>writerDecode(bytes))
 bad(()=>writerEncode({text:'x'.repeat(2048)}));let reads=0
 for(const key of Object.keys(report())){const value=report();Object.defineProperty(value,key,{get(){reads++;return 'untrusted'}});bad(()=>parseWriterReport(value))}
 const hidden=report();Object.defineProperty(hidden,'state',{enumerable:false});bad(()=>parseWriterReport(hidden));bad(()=>parseWriterReport({...report(),[Symbol('extra')]:1}));assert.equal(reads,0)
})
