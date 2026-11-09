// Closed AST/VM ports. No HTTP listener, repository, database or browser imports.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const ts=createRequire(new URL('../services/pg-api/package.json',import.meta.url))('typescript')
assert.equal(ts.version,'5.9.3')
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
function ast(file,source=read(file)){const a=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.deepEqual(a.parseDiagnostics,[]);return a}
function nodes(a,predicate){const result=[];function visit(n){if(predicate(n))result.push(n);ts.forEachChild(n,visit)}visit(a);return result}
function declaration(a,name){const n=a.statements.find(n=>(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.name?.text===name);assert(n,name);return n.getText(a).replace(/^export /,'')}
function initializer(a,name){const found=nodes(a,n=>ts.isVariableDeclaration(n)&&n.name.getText(a)===name);assert.equal(found.length,1,name);return found[0].initializer.getText(a)}
function compiled(code,ports={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...ports,require(){throw Error('runtime_import_forbidden')}},{timeout:2000});return exports}
const http=ast('services/pg-api/src/http.ts'),contracts=ast('services/pg-api/src/contracts.ts'),story=ast('tests/pg-original-plugin-market-genuine.spec.mjs')
const roots=nodes(http,n=>ts.isIfStatement(n)&&n.expression.getText(http)==='mcpRoute');assert.equal(roots.length,1)
const branches=nodes(roots[0],n=>ts.isIfStatement(n)&&n.expression.getText(http).replace(/\s/g,'')==='method==="POST"&&!connection');assert.equal(branches.length,1)
const route=compiled(declaration(contracts,'HttpError')+'\n'+declaration(contracts,'isUuid')+'\n'+declaration(http,'allowBodyFields')+'\nexports.route=async(body,repo,identity)=>{const method="POST",connection=undefined,res={};'+branches[0].getText(http)+';throw Error("not_handled")}',{send:(_res,status,body)=>({status,body})}).route
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
const seed=()=>({name:'Original owned MCP',description:'Synthetic owned seed',url:'https://tools.example.com/seed/test',headers:[],enabled:true})
test('the actual HTTP branch rejects the former missing request ID before repository access',async()=>{let writes=0;await assert.rejects(route(seed(),{create(){writes++}},{subject:alice}),e=>e.status===400&&e.code==='invalid_mcp_request_id');assert.equal(writes,0)})
for(const id of [undefined,null,'',1,'not-a-uuid','../../outside','a'.repeat(36)])test('actual MCP creation keeps invalid request ID refusal '+String(id),async()=>{let writes=0;await assert.rejects(route({...seed(),request_id:id},{create(){writes++}},{subject:alice}),e=>e.status===400&&e.code==='invalid_mcp_request_id');assert.equal(writes,0)})
test('the current real fixture seed supplies one fresh UUID per actual request with the verified original employee headers',async()=>{
 const calls=[],writes=[];let ordinal=0
 const f={users:{alice,bob},request:async(who,path,body,options)=>{calls.push({who,path,body,options});assert.equal(path,'/api/v2/mcp-connections');return route(body,{create:async(identity,input,request)=>{writes.push({identity,input,request});return{id:request,...input}}},{subject:f.users[who]})}}
 const seedFn=compiled('const headers='+initializer(story,'headers')+';exports.seed='+initializer(story,'createSeed'),{f,crypto:{randomUUID(){assert(ordinal<ids.length);return ids[ordinal++]}},expect:actual=>({toBe:expected=>assert.equal(actual,expected)})}).seed
 const first=await seedFn('alice','Alice owned MCP','alice'),second=await seedFn('bob','Bob owned MCP','bob')
 assert.equal(ordinal,2);assert.equal(first.id,ids[0]);assert.equal(second.id,ids[1]);assert.notEqual(first.id,second.id)
 assert.equal(calls.length,2);assert.equal(writes.length,2)
 for(let i=0;i<calls.length;i++){assert.deepEqual(JSON.parse(JSON.stringify(calls[i].options.headers)),{'X-AgentStudio-Expected-Employee':i===0?alice:bob,'X-AgentStudio-Original-Plugins':'native_original_plugin_market_v1'});assert.equal(writes[i].identity.subject,i===0?alice:bob);assert.equal(writes[i].request,ids[i]);assert.equal(Object.hasOwn(writes[i].input,'request_id'),false);assert.equal(writes[i].input.enabled,true);assert.deepEqual(JSON.parse(JSON.stringify(writes[i].input.headers)),[])}
})
test('the real creation contract still rejects owner or extra body fields',async()=>{for(const extra of [{owner_user_id:bob},{unexpected:true}]){let writes=0;await assert.rejects(route({...seed(),request_id:ids[0],...extra},{create(){writes++}},{subject:alice}),e=>e.status===400&&e.code==='unknown_request_field');assert.equal(writes,0)}})
test('the fixture asserts the exact existing employee page heading, with both original title words',()=>{
 const page=ast('src/pages/PluginMarket/PluginMarketPage.tsx'),headings=nodes(page,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(page)==='h1');assert.equal(headings.length,1)
 function label(n){if(ts.isJsxText(n))return n.text.replace(/\s+/g,'');if(ts.isJsxElement(n))return n.children.map(label).join('');throw Error('unexpected_dynamic_heading')}
 assert.equal(label(headings[0]),'插件市场')
 const login=initializer(story,'login');assert(login.includes('main[data-studio-fluid-page="plugins"] h1'));assert(login.includes("toHaveText(/^\\s*插件\\s*市场\\s*$/)"));assert(login.includes("getByRole('heading', { name: '探索插件', exact: true })"));assert(login.includes('await expect(p).toHaveURL(f.url)'));assert(login.includes("wire(p, '/api/native-auth/login', 'POST')"));assert(login.includes('expect(authenticated.user.id).toBe(f.users[who])'))
})
test('every original terminal privacy and outcome assertion stays in the current story',()=>{const s=read('tests/pg-original-plugin-market-genuine.spec.mjs');for(const text of["expect(reply.status).toBe(201)","expect(reply.status).toBe(200)","expect(errors).toEqual([])","expect(consoleErrors).toEqual([])","expect(failed).toEqual([])","expect(bad).toEqual([])","expect(outside).toEqual([])","foreign.status).toBe(404)","expect((await f.counts()).trials).toBe(before.trials + 2)","expect(f.network.model).toBe(1)"])assert(s.includes(text),text)})
