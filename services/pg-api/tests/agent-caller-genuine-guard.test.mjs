import test from 'node:test'
import assert from 'node:assert/strict'
import {ServerResponse} from 'node:http'
import {PassThrough} from 'node:stream'
import {once} from 'node:events'
import {requireAgentCallerGenuineCi,agentCallerGenuineWorkflow,agentCallerGenuineApproval,agentCallerGenuineApiJob,agentCallerGenuineBrowserJob} from './helpers/agent-caller-genuine-guard.mjs'
import {agentCallerGenuineFixture,dropAgentCallerCommittedAck} from './helpers/agent-caller-genuine-fixture.mjs'
const env=()=>({GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123456',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:agentCallerGenuineWorkflow,GITHUB_JOB:agentCallerGenuineApiJob,RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',AGENT_STUDIO_F11_F12_GENUINE_CI:agentCallerGenuineApproval,AGENT_STUDIO_F11_F12_GENUINE_SUITE:'flow',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456'})
test('ordinary-host caller fixture refuses before fixture dependencies, filesystem, pool or sockets',async()=>{await assert.rejects(()=>agentCallerGenuineFixture({}),/refuse_non_ephemeral_agent_caller_genuine_ci/)})
test('pure caller purpose gate retains exact disposable5432 target for flow, catalog and external browser',()=>{for(const [job,suite]of[[agentCallerGenuineApiJob,'flow'],[agentCallerGenuineApiJob,'database'],[agentCallerGenuineBrowserJob,'browser']])assert.equal(requireAgentCallerGenuineCi({...env(),GITHUB_JOB:job,AGENT_STUDIO_F11_F12_GENUINE_SUITE:suite},'linux',1001).port,5432)})
test('F01/F27 purpose labels and mismatched suites are never caller authority',()=>{for(const patch of[{GITHUB_WORKFLOW:'Agent Studio F27 Exact Step Approval Delegation genuine PG18 isolated verification'},{AGENT_STUDIO_F11_F12_GENUINE_CI:'YES_DISPOSABLE_F27_ONLY'},{GITHUB_JOB:agentCallerGenuineBrowserJob},{AGENT_STUDIO_F11_F12_GENUINE_SUITE:'browser'},{AGENT_STUDIO_F11_F12_GENUINE_CI:undefined}])assert.throws(()=>requireAgentCallerGenuineCi({...env(),...patch},'linux',1001))})
test('all ambient proxy, TLS, module and database injections are refused before any effect',()=>{for(const key of['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DATABASE_URL','PGHOST','PGPORT','PGPASSWORD'])assert.throws(()=>requireAgentCallerGenuineCi({...env(),[key]:'injected'},'linux',1001))})
test('root, local, self-hosted, nonLinux and production-port contexts cannot enter caller fixtures',()=>{for(const [patch,platform,uid]of[[{},'linux',0],[{},'win32',1001],[{RUNNER_ENVIRONMENT:'self-hosted'},'linux',1001],[{GITHUB_REPOSITORY:'other/repo'},'linux',1001],[{AGENT_STUDIO_PG18_CI_PORT:'5333'},'linux',1001],[{AGENT_STUDIO_PG18_CI_HOST:'company.example'},'linux',1001],[{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'other'},'linux',1001]])assert.throws(()=>requireAgentCallerGenuineCi({...env(),...patch},platform,uid))})

// Pure Node HTTP serialization over an in-memory stream. No listener, real
// socket, SQL or browser authority is created by these response mechanics.
function memoryResponse(status){
 const stream=new PassThrough(),chunks=[],response=new ServerResponse({method:'POST'})
 stream.on('data',chunk=>chunks.push(Buffer.from(chunk)));response.assignSocket(stream)
 response.writeHead(status,{'Content-Type':'application/json'})
 return{response,stream,bytes:()=>Buffer.concat(chunks).toString('utf8')}
}
test('committed ACK loss sends real200 headers and only an actual body prefix before interrupting HTTP EOF',async()=>{
 const f=memoryResponse(200),closed=once(f.stream,'close'),body=JSON.stringify({protocol:'agent_caller_run_reply_v1',receipt:{request_id:'synthetic-original'},secret:'never-complete'})
 dropAgentCallerCommittedAck(f.response);assert.equal(f.response.end(body),f.response);await closed
 const wire=f.bytes(),boundary=wire.indexOf('\r\n\r\n');assert.match(wire,/^HTTP\/1\.1 200 /);assert.ok(boundary>0);assert.match(wire.slice(0,boundary),/Transfer-Encoding: chunked/i)
 assert.equal(wire.slice(boundary+4),'1\r\n'+body.slice(0,1)+'\r\n');assert.equal(wire.includes('0\r\n\r\n'),false);assert.equal(wire.includes('never-complete'),false);assert.equal(f.response.writableEnded,false);assert.equal(f.response.destroyed,true)
})
test('ACK loss leaves real non200 denial responses complete and unchanged',async()=>{
 const f=memoryResponse(403),finished=once(f.response,'finish'),body=JSON.stringify({error:'agent_caller_admission_disabled'})
 dropAgentCallerCommittedAck(f.response);f.response.end(body);await finished
 const wire=f.bytes(),boundary=wire.indexOf('\r\n\r\n');assert.match(wire,/^HTTP\/1\.1 403 /);assert.equal(wire.slice(boundary+4),Buffer.byteLength(body).toString(16)+'\r\n'+body+'\r\n0\r\n\r\n');assert.equal(f.response.writableEnded,true);assert.equal(f.response.destroyed,false);f.stream.destroy()
})
