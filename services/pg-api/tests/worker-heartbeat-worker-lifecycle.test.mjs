import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {openWorkerHeartbeatWorkerLifecycle} from '../src/worker-heartbeat-worker-lifecycle.ts'
test('default/off lifecycle returns null before credential/socket/timer work',async()=>{
 const old=process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED
 try{delete process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED;assert.equal(await openWorkerHeartbeatWorkerLifecycle('prepare'),null);process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED='false';assert.equal(await openWorkerHeartbeatWorkerLifecycle('knowledge_query'),null);process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED='not_approval';await assert.rejects(openWorkerHeartbeatWorkerLifecycle('prepare'),/writer_not_enrolled/)}finally{if(old===undefined)delete process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED;else process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED=old}
})
test('lifecycle uses original reporter/counter and no initial state, counter, clock or fabricated ACK event',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-worker-lifecycle.ts',import.meta.url),'utf8')
 assert.ok(source.indexOf("enabled===undefined||enabled==='false'")<source.indexOf('await openWorkerHeartbeatWorkerSender(kind)'))
 for(const text of ['createWorkerHeartbeatBoundedReporter','generation:sender.generation','sendDeadlineMs:writerLimits.sendMs','send:sender.send','reporter.start()','startup_checks_complete','loop_unavailable','new_claims_closed','reporter.close();sender.close()'])assert.ok(source.includes(text),text)
 assert.doesNotMatch(source,/initialState|initialSequence|Date\.now\(|clock\s*:|process\.on\(|process\.once\(|accepted:true/)
 assert.match(source,/if\(phase!=='starting'\)return/);assert.match(source,/phase==='closed'\|\|phase==='draining'/)
})
