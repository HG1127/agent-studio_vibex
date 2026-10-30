// Actual route and terminal transport functions. No server/browser/PG execution.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {originalAgentRunRoute,createOriginalAgentRunTransport} from '../src/lib/originalAgentRunTransport.ts'
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',root='/__pg_native',route=(p,m='GET')=>originalAgentRunRoute(root+p,m)
test('Native transport has seven static literal patterns and no top-level call/constructor effects',()=>{
 const ts=createRequire(import.meta.url)('typescript'),text=fs.readFileSync(new URL('../src/lib/originalAgentRunTransport.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('transport.ts',text,ts.ScriptTarget.Latest,true),effects=[],patterns=[]
 function scan(n){if(ts.isFunctionLike(n)||ts.isClassDeclaration(n))return;if(ts.isCallExpression(n)||ts.isNewExpression(n))effects.push(n.getText(tree));if(ts.isRegularExpressionLiteral(n))patterns.push(n.getText(tree));ts.forEachChild(n,scan)}for(const n of tree.statements)scan(n)
 assert.deepEqual(tree.parseDiagnostics,[]);assert.deepEqual(effects,[]);assert.equal(patterns.length,7)
})
test('all seven literal route families preserve their intended GET permissions',()=>{
 for(const p of ['/api/v2/agent-autonomous-runs/'+id,'/api/v2/agent-specs/'+id,'/api/v2/original-ui/agent-specs/'+id,'/api/v2/agent-feedback/'+id,'/api/v2/agent-memories/'+id])assert.equal(route(p),true,p)
 for(const p of ['/api/native-auth/capabilities','/api/v2/model-connections','/api/v2/tool-connections','/api/v2/mcp-connections','/api/v2/agent-autonomous-runs','/api/v2/knowledge-bases','/api/v2/shared-knowledge','/api/v2/knowledge-embedding/consent','/api/v2/original-ui/home-resources','/api/v2/original-ui/agent-specs?limit=50','/api/v2/original-ui/agent-workspace?limit=12','/api/v2/agent-memories?spec_id='+id])assert.equal(route(p),true,p)
})
test('POST permits only the existing bounded action families with no query',()=>{
 for(const action of ['decision','cancel','pause','resume','pause-confirm','resume-confirm','respond','respond-confirm']){const p='/api/v2/agent-autonomous-runs/'+id+'/'+action;assert.equal(route(p,'POST'),true,p);assert.equal(route(p),false,p);assert.equal(route(p+'?x=1','POST'),false,p)}
 for(const p of ['/api/v2/agent-specs/'+id+'/autonomous-runs','/api/v2/agent-feedback/'+id+'/change','/api/v2/agent-feedback/'+id+'/confirm','/api/v2/agent-memories/change','/api/v2/agent-memories/confirm'])assert.equal(route(p,'POST'),true,p)
 for(const p of ['/api/v2/agent-autonomous-runs/'+id,'/api/v2/agent-specs/'+id,'/api/v2/agent-feedback/'+id,'/api/v2/agent-memories/'+id])assert.equal(route(p,'POST'),false,p)
})
test('route UUID, origin-prefix, method and parameter refusals stay closed',()=>{
 const base='/api/v2/agent-autonomous-runs/'+id
 for(const value of [base+'/',base+'?limit=1',base+'#x',base.replace(id,id.toUpperCase().replace('1111','ABCD')),base.replace(id,id.slice(1)),base.replace(id,id.replace('-','_')),base+'/erase',base.replace('/agent-autonomous-runs/','/agent-autonomous-runs/%2e/'),base.replace('/agent-autonomous-runs/','/agent-autonomous-runs/%2f'),base.replace('/agent-autonomous-runs/','/agent-autonomous-runs/\\'),base+'\n'])assert.equal(route(value),false,JSON.stringify(value))
 for(const method of ['PUT','PATCH','DELETE','HEAD','OPTIONS','post','get'])assert.equal(route(base,method),false,method)
 for(const value of ['https://example.invalid'+root+base,base,'//example.invalid'+root+base])assert.equal(originalAgentRunRoute(value,'GET'),false,value)
 for(const value of ['/api/v2/agent-feedback/'+id+'/change','/api/v2/agent-feedback/'+id+'/confirm','/api/v2/agent-memories?spec_id='+id+'&x=1','/api/v2/original-ui/agent-specs?limit=51','/api/v2/original-ui/agent-workspace?limit=13'])assert.equal(route(value),false,value)
})
test('canonical existing model paging retains its cursor/limit/duplicate checks',()=>{
 const p='/api/v2/model-connections',cursor='mcpg1.'+'a'.repeat(80)
 for(const q of ['?limit=50','?paging=owner_cursor_v1&limit=50','?paging=owner_cursor_v1&limit=50&cursor='+cursor])assert.equal(route(p+q),true,q)
 for(const q of ['?limit=51','?limit=50&limit=50','?paging=owner_cursor_v1&limit=50&x=1','?paging=owner_cursor_v1&limit=50&cursor=bad','?paging=owner_cursor_v1&limit=50&cursor='+cursor+'%2F'])assert.equal(route(p+q),false,q)
})
test('actual terminal transport keeps identity checks, controlled headers and pre-send refusals',async()=>{
 let verifies=0,sends=0,employee=id;const seen=[]
 const x=createOriginalAgentRunTransport({employeeId:id,timeoutMs:1000,verifyEmployee:async()=>{verifies++;return employee},transport:async(input,init)=>{sends++;seen.push({input,init});return new Response('{"terminal":true}',{headers:{'Content-Type':'application/json'}})}})
 const result=await x.transport(root+'/api/v2/agent-autonomous-runs/'+id,{headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':id}});assert.deepEqual(await result.json(),{terminal:true});assert.equal(sends,1);assert.equal(verifies,2);assert.equal(seen[0].init.credentials,'same-origin');assert.equal(seen[0].init.headers['X-AgentStudio-Expected-Employee'],id)
 for(const request of [{route:root+'/api/v2/agent-autonomous-runs/'+id+'/erase',init:{method:'POST'}},{route:root+'/api/native-auth/capabilities',init:{headers:{Authorization:'refused'}}},{route:root+'/api/native-auth/capabilities',init:{headers:{'X-AgentStudio-Expected-Employee':other}}}])await assert.rejects(x.transport(request.route,request.init));assert.equal(sends,1);assert.equal(verifies,2)
 employee=other;await assert.rejects(x.transport(root+'/api/native-auth/capabilities'));assert.equal(sends,1);assert.equal(verifies,3);x.close();await assert.rejects(x.transport(root+'/api/native-auth/capabilities'));assert.equal(sends,1)
})
