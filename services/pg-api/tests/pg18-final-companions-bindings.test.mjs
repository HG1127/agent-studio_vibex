// Pure original-config, public-certificate fingerprint and kernel-data tests.
// No actual TLS, private key, socket, CLI, database, profile or trust is created.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {rootCertificates} from 'node:tls'
import {X509Certificate} from 'node:crypto'
import {companionBindingReviewData as data} from './helpers/pg18-final-companions-binding-data.mjs'
import {checkFinalCompanionSpecs as specs,finalCompanionTlsRoutes as routes,checkFinalCompanionCertificatePins as pins,finalCompanionIdentities,finalCompanionFingerprint as fingerprint,checkFinalCompanionHostAllocation as host} from '../src/pg18-full069-final-companion-contract.mjs'
import {matchFinalCompanionKernel as match} from '../src/pg18-full069-final-companion-kernel.mjs'
import {agentPlanWorkflowServiceConfig} from '../src/agent-plan-workflow-service-config.ts'
import {boundCertificateFingerprint} from '../src/bound-worker-mtls.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(root+'/'+n,'utf8'),clone=v=>structuredClone(v)
// Public roots are only convenient real X509 bytes for PIN parsing. They are
// never used to claim valid leaf certificates, a TLS connection or readiness.
const serverCertificate=Buffer.from(rootCertificates[0]),clientCertificate=Buffer.from(rootCertificates[1]),serverPin=new X509Certificate(serverCertificate).fingerprint256.replaceAll(':','').toLowerCase(),clientPin=new X509Certificate(clientCertificate).fingerprint256.replaceAll(':','').toLowerCase()
function configuredCertificateData(id){
 const f=data(),b=f.rows.find(r=>r.id===id),c=id==='plan_workflow_broker'?f.rows[3]:f.base.profile.workers.find(w=>w.id===({bound_broker:'model',knowledge_broker:'knowledge',review_broker:'assessment'}[id]))
 const prefix={bound_broker:'BOUND_DISPATCH',knowledge_broker:'KNOWLEDGE_INDEX',review_broker:'REVIEW',plan_workflow_broker:'PLAN_WORKFLOW'}[id]
 c.environment['AGENT_STUDIO_PG_'+prefix+'_SERVER_FINGERPRINT']=serverPin;b.environment['AGENT_STUDIO_PG_'+prefix+'_CLIENT_FINGERPRINT']=clientPin
 if(id==='review_broker'||id==='plan_workflow_broker'){b.environment['AGENT_STUDIO_PG_'+prefix+'_SERVER_FINGERPRINT']=serverPin;c.environment['AGENT_STUDIO_PG_'+prefix+'_CLIENT_FINGERPRINT']=clientPin}
 return {...f,b,c,prefix,route:()=>routes(f.rows,f.base).find(r=>r.broker_id===id)}
}
test('P1 actual original F05 config accepts17462 but declared17461 must refuse before launch',()=>{
 for(const index of [3,4]){const f=data(),p=f.rows[index];p.environment.AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN='https://127.0.0.1:17462'
  const selected=agentPlanWorkflowServiceConfig({...p.environment,CREDENTIALS_DIRECTORY:p.credential_directory},index===3?'worker':'broker','serve','linux',p.uid)
  assert.equal(selected.origin,'https://127.0.0.1:17462');assert.equal(p.origin,'https://127.0.0.1:17461');assert.throws(()=>specs(f.rows,f.base),/transport_F05_origin/)
 }
})
test('P1 all explicit effective client origins and Review Design pair must agree with their protected Broker',()=>{
 for(const mutate of [f=>f.base.profile.workers.find(w=>w.id==='model').environment.AGENT_STUDIO_PG_BOUND_DISPATCH_ORIGIN='https://127.0.0.1:7455',f=>f.base.profile.workers.find(w=>w.id==='assessment').environment.AGENT_STUDIO_PG_REVIEW_ORIGIN='https://127.0.0.1:17462',f=>f.rows[2].environment.AGENT_STUDIO_PG_REVIEW_ORIGIN='https://127.0.0.1:17462',f=>f.base.profile.workers.find(w=>w.id==='assessment').environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED='false']){const f=data();mutate(f);assert.throws(()=>specs(f.rows,f.base),/transport_/)}
 const f=data();assert.equal(specs(f.rows,f.base),true);assert.equal(routes(f.rows,f.base).length,4)
})
test('P1 correct mounted server certificate cannot override a wrong actual client server pin in any Broker pair',()=>{
 for(const id of ['bound_broker','knowledge_broker','review_broker','plan_workflow_broker']){const f=configuredCertificateData(id);assert.equal(pins(f.route(),serverCertificate,clientCertificate).server_pin,serverPin)
  f.c.environment['AGENT_STUDIO_PG_'+f.prefix+'_SERVER_FINGERPRINT']='0'.repeat(64)
  if(['review_broker','plan_workflow_broker'].includes(id))f.b.environment['AGENT_STUDIO_PG_'+f.prefix+'_SERVER_FINGERPRINT']='0'.repeat(64)
  assert.equal(specs(f.rows,f.base),true,'matching but wrong configured pins require the actual protected certificate check');assert.throws(()=>pins(f.route(),serverCertificate,clientCertificate),/transport_certificate_pin/)
 }
})
test('P1 reverse actual Broker client pin must match the mounted client certificate for every original pair',()=>{
 for(const id of ['bound_broker','knowledge_broker','review_broker','plan_workflow_broker']){const f=configuredCertificateData(id);assert.equal(pins(f.route(),serverCertificate,clientCertificate).client_pin,clientPin)
  f.b.environment['AGENT_STUDIO_PG_'+f.prefix+'_CLIENT_FINGERPRINT']='0'.repeat(64)
  if(['review_broker','plan_workflow_broker'].includes(id))f.c.environment['AGENT_STUDIO_PG_'+f.prefix+'_CLIENT_FINGERPRINT']='0'.repeat(64)
  assert.throws(()=>pins(f.route(),serverCertificate,clientCertificate),/transport_certificate_pin/)
 }
})
test('P1 Review and F05 original self pin fields cannot disagree across real Worker/Broker configurations',()=>{
 for(const id of ['review_broker','plan_workflow_broker'])for(const side of ['server','client']){const f=configuredCertificateData(id);(side==='server'?f.b:f.c).environment['AGENT_STUDIO_PG_'+f.prefix+'_'+side.toUpperCase()+'_FINGERPRINT']='0'.repeat(64);assert.throws(()=>specs(f.rows,f.base),/transport_cross_pin/)}
})
test('P1 active Workflow V2 and Autonomous clients bind their own pin, leaves and original GET rejection route',()=>{
 const f=data({activeBound:true});assert.equal(specs(f.rows,f.base),true);const all=routes(f.rows,f.base),bound=all.filter(r=>r.broker_id==='bound_broker');assert.deepEqual(bound.map(r=>r.client_id),['model','workflow_v2','agent_autonomous'])
 for(const id of ['workflow_v2','agent_autonomous']){const c=f.base.profile.workers.find(w=>w.id===id),peer=id==='workflow_v2'?'AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT':'AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT';c.environment.AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT=serverPin;f.rows[0].environment[peer]=clientPin;const route=routes(f.rows,f.base).find(r=>r.client_id===id)
  assert.equal(route.safe_path,'/__internal/v2/workflow-model/dispatch');assert.equal(route.origin,'https://127.0.0.1:7453');assert.equal(route.client_leaves[1],id==='workflow_v2'?'dispatch-workflow.pem':'dispatch-agent.pem');assert.equal(pins(route,serverCertificate,clientCertificate).server_pin,serverPin)
  c.environment.AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT='0'.repeat(64);assert.throws(()=>pins(routes(f.rows,f.base).find(r=>r.client_id===id),serverCertificate,clientCertificate),/transport_certificate_pin/)
  // Restore before configuring the other peer: Bound forbids aliased identities.
  c.environment.AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT='a'.repeat(64);f.rows[0].environment[peer]=(id==='workflow_v2'?'f':'1').repeat(64)
 }
 const disabled=data({activeBound:true});delete disabled.rows[0].environment.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED;delete disabled.rows[0].environment.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED;assert.throws(()=>specs(disabled.rows,disabled.base),/transport_handler_disabled/)
})
test('P1 pin normalization follows the actual original ABI and refuses malformed colon stripping',()=>{
 const colon='AB:'.repeat(31)+'AB';assert.deepEqual(fingerprint(colon),boundCertificateFingerprint(colon));assert.equal(fingerprint(colon).toString('hex'),'ab'.repeat(32))
 for(const value of ['a:'.repeat(64),':'+('ab'.repeat(32)),'ab::'+('ab'.repeat(31)),' '+('ab'.repeat(32)),null]){assert.throws(()=>boundCertificateFingerprint(value));assert.throws(()=>fingerprint(value),/transport_pin/)}
})
test('P2 every primary UID/GID is its dedicated fixed high mapping and cannot borrow gid27 or Native/Writer identities',()=>{
 assert.deepEqual(finalCompanionIdentities.map(r=>[r.id,r.uid,r.gid,r.groups]),[['bound_broker',61021,61021,[]],['knowledge_broker',61022,61022,[]],['review_broker',61023,61023,[]],['plan_workflow_worker',61024,61024,[]],['plan_workflow_broker',61025,61025,[]]])
 for(let i=0;i<5;i++)for(const patch of [{gid:27},{gid:0},{uid:0},{gid:65534},{uid:61020},{groups:[27]},{groups:[61021]}]){const f=data();Object.assign(f.rows[i],patch);assert.throws(()=>specs(f.rows,f.base),/fixed_spec/)}
 for(const mutate of [f=>f.base.profile.native.uid=61021,f=>f.base.profile.native.gid=61021,f=>f.base.profile.native.groups=[61021],f=>f.base.profile.workers[0].gid=61021,f=>f.base.profile.workers[0].groups=[61021],f=>f.base.rootProfile.writers.boot_uids[127]=61021,f=>f.base.rootProfile.writers.groups[0].gid=61021]){const f=data();mutate(f);assert.throws(()=>specs(f.rows,f.base),/fixed_spec/)}
})
test('P2 actual passwd UID, passwd primary GID and group-number collisions all refuse even with no supplementary groups',()=>{
 const f=data(),passwd='root:x:0:0:root:/root:/bin/sh\n',group='root:x:0:\nsudo:x:27:review-only\n';assert.equal(host(f.rows,passwd,group),true)
 for(const line of ['occupied:x:61021:1000:occupied:/none:/bin/false\n','occupied:x:1000:61021:occupied:/none:/bin/false\n'])assert.throws(()=>host(f.rows,passwd+line,group),/host_identity_collision/)
 assert.throws(()=>host(f.rows,passwd,group+'occupied:x:61021:\n'),/host_identity_collision/);assert.throws(()=>host(f.rows,passwd+'broken\n',group),/host_account_format/)
 const changed=clone(f.rows);changed[0].gid=27;assert.throws(()=>host(changed,passwd,group),/host_identity_policy/)
})
test('P2 matching a claimed gid27 kernel record cannot satisfy the fixed process identity',()=>{
 const c={pid:10,start_ticks:'100',outer:{pid:9},spec:{id:'bound_broker',uid:61021,gid:61021,groups:[]},parentNamespace:'mnt:[1]',outerNamespace:'mnt:[2]',entry:'/readonly/services/pg-api/src/bound-dispatch-server.ts',args:['--serve']},p={pid:10,start_ticks:'100',parent_pid:9,uids:[61021,61021,61021,61021],gids:[61021,61021,61021,61021],groups:[],capabilities_zero:true,no_new_privs:true,mount_namespace:'mnt:[2]',argv:[process.execPath,'--experimental-strip-types',c.entry,...c.args],state:'S'}
 assert.equal(match(p,c),true);assert.equal(match({...p,gids:[27,27,27,27]},{...c,spec:{...c.spec,gid:27}}),false);assert.equal(match({...p,groups:[27]},c),false)
})
test('P1/P2 private production factory reads actual bound certificate bytes and host files, then probes all effective routes',()=>{
 const parent=read('services/pg-api/src/pg18-full069-final-companions.mjs'),kernel=read('services/pg-api/src/pg18-full069-final-companion-kernel.mjs')
 assert.ok(parent.includes('assertTlsBindings(ctx);network(ctx)'));assert.ok(parent.includes('pinnedMount(broker,route.server_leaf),pinnedMount(client,route.client_leaves[1])'));assert.ok(parent.includes('const serverPin=fingerprint(route.server_pin)'));assert.ok(parent.includes('Promise.all(routes.map(route=>probeRoute(s,c,ctx,route)))'));assert.ok(parent.includes("path:route.safe_path,method:'GET'"));assert.ok(!parent.includes('fingerprint(new X509Certificate(server)'))
 for(const text of ["hostAccountFile('/etc/passwd')","hostAccountFile('/etc/group')","O_RDONLY|fs.constants.O_NOFOLLOW","field('Gid')","field('Groups')","finalCompanionIdentityMatches(c.spec)"])assert.ok(kernel.includes(text),text)
})
