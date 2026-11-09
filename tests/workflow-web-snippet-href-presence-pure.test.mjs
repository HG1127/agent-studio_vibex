// Actual production parser declarations; synthetic HTML DATA only.
// No request/DNS, Actor/verifier, SQL/Pool, Worker, API or browser executes.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire,stripTypeScriptTypes} from 'node:module'
import {BlockList,isIP} from 'node:net'
const require=createRequire(import.meta.url),ts=require('typescript')
function file(leaf){const source=fs.readFileSync(new URL('../services/pg-api/src/'+leaf,import.meta.url),'utf8'),ast=ts.createSourceFile(leaf,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.deepEqual(ast.parseDiagnostics,[]);return ast}
const network=file('workflow-v2-tool-network.ts'),plan=file('workflow-v2-tool-plan.ts'),probe=file('model-connection-probe.ts'),failure=file('workflow-v2-effect-failure.ts')
function declarations(ast,names){return names.map(name=>{const node=ast.statements.find(n=>n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert(node,name);return node.getText(ast).replace(/^export\s+/,'')}).join('\n')}
const loops=probe.statements.filter(n=>ts.isForOfStatement(n)&&/blacklist[46]\.addSubnet/.test(n.getText(probe))).map(n=>n.getText(probe)).join('\n'),source=[declarations(failure,['workflowKnownEffectCodes','WorkflowKnownEffectFailure']),declarations(probe,['blacklist4','blacklist6']),loops,declarations(probe,['publicProviderAddress']),declarations(plan,['invalid','text','safeToolDestination']),declarations(network,['htmlToolText','parseWorkflowSearchHtml'])].join('\n')+'\n({parse:parseWorkflowSearchHtml,Known:WorkflowKnownEffectFailure})',actual=new vm.Script(stripTypeScriptTypes(source,{mode:'strip'})).runInContext(vm.createContext({URL,Buffer,BlockList,isIP}),{timeout:1000})
const html=(attrs,tag='a',title='href="https://alpha.example.com/"')=>'<div class="result"><a class="result__a" '+title+'>TITLE_A</a><'+tag+' class="result__snippet" '+attrs+'>SNIPPET_DATA</'+tag+'></div>',read=(attrs,tag,title)=>JSON.parse(actual.parse(html(attrs,tag,title),10))[0],unknown=error=>!(error instanceof actual.Known)&&/^workflow_tool_search_/.test(error.message)
for(const attrs of ['href=""',"href=''",'href','HREF = ""'])test('present-empty snippet href is omitted: '+attrs,()=>{const hit=read(attrs);assert.equal(hit.url,'https://alpha.example.com/');assert.equal(hit.snippet,'')})
test('unquoted foreign snippet href is omitted',()=>{assert.equal(read('href=https://beta.example.com/').snippet,'')})
test('unquoted matching href remains usable',()=>{assert.equal(read('href=https://alpha.example.com/').snippet,'SNIPPET_DATA')})
test('case-insensitive href names and HTML whitespace remain usable',()=>{assert.equal(read('HREF\t=\nhttps://alpha.example.com/').snippet,'SNIPPET_DATA')})
test('both absent-href legacy a and div snippets remain supported',()=>{for(const tag of ['a','div'])assert.equal(read('',tag).snippet,'SNIPPET_DATA')})
test('explicit empty or foreign href on div cannot supply a citation snippet',()=>{for(const attrs of ['href=""','href=https://beta.example.com/'])assert.equal(read(attrs,'div').snippet,'')})
test('a quoted value of another attribute does not create an href',()=>{assert.equal(read('data-note=\'inside href="https://beta.example.com/"\'').snippet,'SNIPPET_DATA')})
test('a data-href attribute does not become an href',()=>{assert.equal(read('data-href="https://beta.example.com/"').snippet,'SNIPPET_DATA')})
for(const attrs of ['href="https://alpha.example.com/" href=https://beta.example.com/','href=https://beta.example.com/ href="https://alpha.example.com/"','href="" href=https://alpha.example.com/','href=https://alpha.example.com/ HREF=','href href="https://alpha.example.com/"',"href='https://alpha.example.com/' href=https://alpha.example.com/"])test('mixed duplicate href is unknown: '+attrs,()=>{assert.throws(()=>actual.parse(html(attrs),10),unknown)})
test('mixed duplicate title href cannot choose a citation',()=>{assert.throws(()=>actual.parse(html('','a','href=https://alpha.example.com/ href="https://beta.example.com/"'),10),unknown)})
test('unquoted title URLs are parsed through the same destination guard',()=>{assert.equal(read('href=https://alpha.example.com/','a','href=https://alpha.example.com/').url,'https://alpha.example.com/');for(const title of ['href=https://127.0.0.1/','href=javascript:alert(1)','href'])assert.throws(()=>actual.parse(html('','a',title),10),unknown)})
test('unquoted tracking wrappers keep exactly one validated destination',()=>{const target='https://alpha.example.com/',wrapper='https://html.duckduckgo.com/l/?uddg='+encodeURIComponent(target);assert.equal(read('href='+wrapper).snippet,'SNIPPET_DATA');assert.equal(read('href='+wrapper+'&uddg='+encodeURIComponent('https://beta.example.com/')).snippet,'')})
