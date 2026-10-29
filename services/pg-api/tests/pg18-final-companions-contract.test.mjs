// Classifier/contract/source tests only: no forged positive runtime context,
// Linux process, TLS key, application CLI, browser, Pool or SQL is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {finalCompanionDefinitions as defs,finalCompanionBudgets as budgets,checkFinalCompanionOriginalPreflight as preflight,checkFinalCompanionSpecs as specs,inspectFinalCompanionNetworkPolicy as network} from '../src/pg18-full069-final-companion-contract.mjs'
import {matchFinalCompanionKernel as match} from '../src/pg18-full069-final-companion-kernel.mjs'
import {finalCompanions as Bspecs} from '../src/pg18-full069-final-login-contract.mjs'
import {openFull069FinalCompanions,preflightFull069FinalCompanions,startFull069FinalCompanions,observeFull069FinalCompanions,stopFull069FinalCompanions} from '../src/pg18-full069-final-companions.mjs'
import {companionBindingReviewData as data} from './helpers/pg18-final-companions-binding-data.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(root+'/'+n,'utf8'),require=createRequire(import.meta.url),ts=require('typescript'),clone=v=>structuredClone(v)
function policy(rows,family){return '*filter\n:OUTPUT ACCEPT [0:0]\n'+rows.map(s=>'-A OUTPUT -m owner --uid-owner '+s.uid+' -j ASFC'+s.uid).join('\n')+'\n'+rows.flatMap(s=>family===6?['-A ASFC'+s.uid+' -j REJECT --reject-with icmp6-port-unreachable']:['-A ASFC'+s.uid+' -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT','-A ASFC'+s.uid+' -d 127.0.0.1/32 -p tcp -m tcp --dport 5333 -j ACCEPT',...(s.id==='plan_workflow_worker'?['-A ASFC'+s.uid+' -d 127.0.0.1/32 -p tcp -m tcp --dport 17461 -j ACCEPT']:[]),'-A ASFC'+s.uid+' -j REJECT --reject-with icmp-port-unreachable']).join('\n')+'\nCOMMIT\n'}
test('C fixed five original commands/roles/order match B protected v24 definitions and keep original drain budgets',()=>{
 assert.deepEqual(defs.map(({id,entry,args,preflight_args,unit,origin,credential_keys,design_enabled})=>({id,entry,args,preflight_args,unit,origin,credential_keys,design_enabled})),Bspecs)
 assert.equal(defs.length,5);assert.equal(budgets.drain_ms,70000);assert.equal(budgets.force_ms,5000)
 assert.deepEqual(defs.map(d=>Object.keys(d.preflight).length),[8,8,13,11,11]);for(const d of defs)assert.equal(preflight(d.id,clone(d.preflight)),true)
})
test('preflight classification rejects borrowed flags, missing original fields, invented readiness and a changed Design mode',()=>{
 for(const d of defs){const raw=clone(d.preflight);assert.throws(()=>preflight(d.id,{...raw,qualifies_run:true}));const key=Object.keys(raw).find(k=>typeof raw[k]==='boolean');assert.throws(()=>preflight(d.id,{...raw,[key]:!raw[key]}));delete raw[Object.keys(raw)[0]];assert.throws(()=>preflight(d.id,raw))}
 assert.throws(()=>preflight('knowledge_broker',{...defs[1].preflight,verified_roles:2}));assert.throws(()=>preflight('review_broker',{...defs[2].preflight,design_enabled:false}))
})
test('protected profile classifier requires exact mounts/commands/design/target and exclusive UID outside entire Writer128 pool',()=>{
 const f=data();assert.equal(specs(f.rows,f.base),true)
 for(const patch of [{uid:0},{uid:2200},{gid:3000},{gid:4000},{groups:[1]},{entry:'native-server.ts'},{args:['--plan']},{origin:'https://0.0.0.0:7453'},{mounts:[]}]){const rows=clone(f.rows);Object.assign(rows[0],patch);assert.throws(()=>specs(rows,f.base))}
 const repeated=clone(f.rows);repeated[1].uid=repeated[0].uid;assert.throws(()=>specs(repeated,f.base));const missing=clone(f.rows);missing[2].mounts.pop();assert.throws(()=>specs(missing,f.base));const extra=clone(f.rows);extra[2].mounts.push({leaf:'admin.secret',source:'/synthetic/admin.secret',sha256:'a'.repeat(64)});assert.throws(()=>specs(extra,f.base))
 for(const mutate of [r=>r[2].environment.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED='false',r=>r[3].origin='https://127.0.0.1:7453',r=>r[4].origin='https://127.0.0.1:17462',r=>r[0].environment.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED='true']){const rows=clone(f.rows);mutate(rows);assert.throws(()=>specs(rows,f.base))}
})
test('actual network-policy classifier allows only own UID jumps, PG and F05worker exact broker port; both families default reject',()=>{
 const f=data(),v4=policy(f.rows,4),v6=policy(f.rows,6);assert.equal(network(v4,f.rows,4),true);assert.equal(network(v6,f.rows,6),true)
 for(const text of [v4.replace('-A OUTPUT','-A OUTPUT -j ACCEPT\n-A OUTPUT'),v4.replace('--dport 5333','--dport 443'),v4.replace('127.0.0.1/32','0.0.0.0/0'),v4.replace(' -j REJECT --reject-with icmp-port-unreachable',' -j ACCEPT'),v4.replace('COMMIT','-A ASFC61021 -j ACCEPT\nCOMMIT')])assert.throws(()=>network(text,f.rows,4))
 assert.throws(()=>network(v6.replace('REJECT --reject-with icmp6-port-unreachable','ACCEPT'),f.rows,6));assert.throws(()=>network(v4.replace('--uid-owner 61021','--uid-owner 61021-61022'),f.rows,4))
})
test('kernel identity classifier rejects PID reuse, parent/argv/namespace drift, privilege/groups drift and paused processes',()=>{
 const c={pid:10,start_ticks:'100',outer:{pid:9},spec:{id:'bound_broker',uid:61021,gid:61021,groups:[]},parentNamespace:'mnt:[1]',outerNamespace:'mnt:[2]',entry:'/readonly/services/pg-api/src/bound-dispatch-server.ts',args:['--serve']},p={pid:10,start_ticks:'100',parent_pid:9,uids:[61021,61021,61021,61021],gids:[61021,61021,61021,61021],groups:[],capabilities_zero:true,no_new_privs:true,mount_namespace:'mnt:[2]',argv:[process.execPath,'--experimental-strip-types',c.entry,...c.args],state:'S'}
 assert.equal(match(p,c),true)
 for(const patch of [{pid:11},{start_ticks:'101'},{parent_pid:8},{uids:[]},{uids:[0,61021,61021,61021]},{gids:[0,0,0,0]},{groups:[0]},{capabilities_zero:false},{no_new_privs:false},{mount_namespace:'mnt:[1]'},{mount_namespace:'mnt:[3]'},{argv:['node','--eval','fake']},{state:'T'},{state:'Z'}])assert.equal(match({...p,...patch},c),false)
})
test('no parsed JSON, fake trust, process object or caller success can be used as a runtime handle',async()=>{
 assert.throws(()=>openFull069FinalCompanions({}),/untrusted_context/)
 for(const f of [preflightFull069FinalCompanions,startFull069FinalCompanions,observeFull069FinalCompanions,stopFull069FinalCompanions])await assert.rejects(()=>f({ready:true,pid:process.pid,Pool:()=>true}),/untrusted_handle/)
})
test('source lock/provenance and source closure include the exact child; no caller Pool or injected positive auditor enters canonical factory',()=>{
 const parent=read('services/pg-api/src/pg18-full069-final-companions.mjs'),child=read('services/pg-api/src/pg18-full069-final-companion-child.mjs')
 assert.match(parent,/from '\.\/pg18-full069-final-trust\.mjs'/);assert.match(parent,/from '\.\/pg18-full069-final-companion-child\.mjs'/);assert.match(parent,/handles=new WeakMap/);assert.match(parent,/raw\.equals\(pinned\.bytes\)/);assert.match(parent,/current_readiness:options\.ready/)
 assert.match(parent,/await Promise\.all\(s\.specs\.map/);assert.match(parent,/listener\(c\.pid/);assert.match(parent,/timingSafeEqual\(serverPin/);assert.match(parent,/socket\.authorized===true/);assert.match(parent,/res\.statusCode!==404/)
 assert.match(parent,/function openFull069FinalCompanions\(finalTrust\)/);assert.doesNotMatch(parent,/new Pool|verifyCompleteProfile\(|inspectComplete069.*Operation|process\.kill\([^c]/)
 for(const text of ['openFull069FinalTrust(true)','p.parent_pid!==process.ppid','p.parent_start_ticks!==parent.start_ticks','--clear-groups','--no-new-privs','--bounding-set=-all','remount,bind,ro,nosuid,nodev,noexec'])assert.ok(child.includes(text),text)
 assert.match(child,/stdio:\['ignore','pipe','pipe'\]/);assert.doesNotMatch(child,/stdout\.write\(.*password|NODE_TLS_REJECT_UNAUTHORIZED/)
})
test('all four new canonical sources parse with the pinned actual TypeScript AST and preserve7/8/24h source contract',()=>{
 for(const n of ['companions','companion-child','companion-contract','companion-kernel']){const file='services/pg-api/src/pg18-full069-final-'+n+'.mjs',text=read(file),t=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(t.parseDiagnostics.length,0,file)}
 const original=read('services/pg-api/src/pg18-full069-worker-live-contract.mjs');assert.ok(original.includes('minimumMs:86400000'));assert.ok(original.includes("['knowledge','knowledge-index-service.ts',['knowledge_index','knowledge_query']"));assert.ok(original.includes("['assessment','agent-assessment-service.ts',['assessment']"))
})
