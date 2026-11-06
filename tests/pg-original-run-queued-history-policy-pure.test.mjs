// Production host policy + production client route, evaluated with URL data only.
// No browser host, Native verifier, Actor, SQL, Worker or HTTP request is started.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire,stripTypeScriptTypes} from 'node:module'
import {originalRunQueuedBrowserPolicy as policy} from './helpers/pg-original-run-queued-browser-policy.mjs'
const ts=createRequire(import.meta.url)('typescript'),file='src/lib/originalAgentRunTransport.ts',source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
assert.equal(tree.parseDiagnostics.length,0)
const route=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='originalAgentRunRoute'),constants=tree.statements.filter(ts.isVariableStatement).map(n=>n.getText(tree)).join('\n')
assert(route)
const client=vm.runInNewContext(stripTypeScriptTypes('(function(){'+constants+';'+route.getText(tree).replace(/^export\s+/,'')+';return originalAgentRunRoute})()',{mode:'strip'}),{URL})
const spec='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',run='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',p='/__pg_native/api/v2/agent-autonomous-runs/history',max=Math.floor(Number.MAX_SAFE_INTEGER/25),query=page=>'?spec_id='+spec+'&anchor_run_id='+run+'&page='+page
for(const page of [1,2,max])test('exact owned-history GET is admitted for canonical safe page '+page,()=>{const raw=p+query(page);assert.equal(client(raw,'GET'),true);for(const story of ['original-agent-run-queued','original-run-detail-queued'])assert.equal(policy('GET',raw,'',story).kind,'native')})
test('history never widens method admission',()=>{for(const method of ['HEAD','POST','PATCH','DELETE','OPTIONS']){assert.equal(client(p+query(1),method),false);assert.equal(policy(method,p+query(1)).kind,'api_denied')}})
test('absent, repeated, extra or reordered query keys remain denied',()=>{for(const q of ['',query(1)+'&page=1',query(1)+'&spec_id='+spec,query(1)+'&extra=1','?anchor_run_id='+run+'&spec_id='+spec+'&page=1','?spec_id='+spec+'&page=1&anchor_run_id='+run,'?spec_id='+spec+'&anchor_run_id='+run]){assert.equal(client(p+q,'GET'),false);assert.equal(policy('GET',p+q).kind,'api_denied')}})
test('unsafe, noncanonical or overflow pages remain denied',()=>{for(const page of ['0','-1','01','1.0','1e2','+1','%31',String(max+1),String(Number.MAX_SAFE_INTEGER),'9999999999999999','NaN','Infinity','']){const raw=p+query(page);assert.equal(client(raw,'GET'),false);assert.equal(policy('GET',raw).kind,'api_denied')}})
test('UUID aliases, invalid identifiers and encoded key aliases remain denied',()=>{for(const q of [query(1).replace(spec,spec.toUpperCase()),query(1).replace(run,'other-owner-alias'),query(1).replace(spec,'%61'+spec.slice(1)),query(1).replace('spec_id','%73pec_id'),query(1).replace(run,'')]){assert.equal(client(p+q,'GET'),false);assert.equal(policy('GET',p+q).kind,'api_denied')}})
test('route siblings, encoded paths, PB and direct API aliases never enter the exact history route',()=>{for(const raw of [p+'/extra'+query(1),p+'s'+query(1),p.replace('/history','/%68istory')+query(1),'/__pb/api/v2/agent-autonomous-runs/history'+query(1),'/api/v2/agent-autonomous-runs/history'+query(1)]){assert.equal(client(raw,'GET'),false);assert.notEqual(policy('GET',raw).kind,'native')}})
