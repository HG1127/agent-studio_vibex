// Actual AST production parser functions; bounded synthetic HTML DATA only.
// No actual DNS/request/Actor/verifier/Pool/SQL/Worker/API/browser executes.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire,stripTypeScriptTypes} from 'node:module'
import {BlockList,isIP} from 'node:net'
const require=createRequire(import.meta.url),ts=require('typescript')
function file(leaf){const text=fs.readFileSync(new URL('../services/pg-api/src/'+leaf,import.meta.url),'utf8'),ast=ts.createSourceFile(leaf,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.deepEqual(ast.parseDiagnostics,[]);return ast}
const network=file('workflow-v2-tool-network.ts'),plan=file('workflow-v2-tool-plan.ts'),probe=file('model-connection-probe.ts'),failure=file('workflow-v2-effect-failure.ts')
function declarations(ast,names){return names.map(name=>{const node=ast.statements.find(n=>n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert(node,name);return node.getText(ast).replace(/^export\s+/,'')}).join('\n')}
const loops=probe.statements.filter(n=>ts.isForOfStatement(n)&&/blacklist[46]\.addSubnet/.test(n.getText(probe))).map(n=>n.getText(probe)).join('\n'),source=[declarations(failure,['workflowKnownEffectCodes','WorkflowKnownEffectFailure']),declarations(probe,['blacklist4','blacklist6']),loops,declarations(probe,['publicProviderAddress']),declarations(plan,['invalid','text','safeToolDestination']),declarations(network,['htmlToolText','parseWorkflowSearchHtml'])].join('\n')+'\n({parse:parseWorkflowSearchHtml,Known:WorkflowKnownEffectFailure})',actual=new vm.Script(stripTypeScriptTypes(source,{mode:'strip'})).runInContext(vm.createContext({URL,Buffer,BlockList,isIP}),{timeout:1000}),unknown=error=>!(error instanceof actual.Known)&&/^workflow_tool_search_/.test(error.message)
const row=(attrs,tag='a',title='')=>'<div class="result"><a class="result__a" href="https://alpha.example.com/" '+title+'>TITLE_A</a><'+tag+' class="result__snippet" '+attrs+'>FOREIGN_SNIPPET</'+tag+'></div>',read=html=>JSON.parse(actual.parse(html,10))[0]
test('Root exact double-quoted greater-than fragment is unknown, not an absent href',()=>{assert.throws(()=>actual.parse(row('title="x > y" href="https://beta.example.com/"'),10),unknown)})
test('Root exact single-quoted greater-than before unquoted foreign href is unknown',()=>{assert.throws(()=>actual.parse(row("title='x > y' href=https://beta.example.com/"),10),unknown)})
test('Root no-greater-than control still omits the foreign snippet',()=>{for(const attrs of ['title="x y" href="https://beta.example.com/"',"title='x y' href=https://beta.example.com/"])assert.equal(read(row(attrs)).snippet,'')})
test('literal greater-than in title-anchor attributes cannot alter the citation boundary',()=>{for(const title of ['title="x > y"',"title='x > y'"])assert.throws(()=>actual.parse(row('href="https://alpha.example.com/"','a',title),10),unknown)})
test('an earlier valid href cannot conceal later truncated attributes',()=>{for(const attrs of ['href="https://alpha.example.com/" title="x > y"',"href=https://beta.example.com/ title='x > y'"])assert.throws(()=>actual.parse(row(attrs),10),unknown)})
test('truncated div snippets are refused rather than treated as legacy no-href',()=>{assert.throws(()=>actual.parse(row('title="x > y" href="https://beta.example.com/"','div'),10),unknown)})
test('genuinely absent href supports both legacy a and div with complete attributes',()=>{for(const tag of ['a','div'])assert.equal(read(row('title="x y" data-note="complete"',tag)).snippet,'FOREIGN_SNIPPET')})
test('entity-escaped greater-than preserves complete attributes and foreign/matching URL checks',()=>{assert.equal(read(row('title="x &gt; y" href="https://beta.example.com/"')).snippet,'');assert.equal(read(row('title="x &gt; y" href="https://alpha.example.com/"')).snippet,'FOREIGN_SNIPPET')})
test('quoted apostrophes, equals, unquoted matching URLs and self-closing tags remain supported',()=>{assert.equal(read(row('title="it\'s x = y" href=https://alpha.example.com/')).snippet,'FOREIGN_SNIPPET');assert.equal(read('<div class="result"><br/><a class="result__a" href="https://alpha.example.com/">A</a><a class="result__snippet">OWN</a></div>').snippet,'OWN')})
test('unclosed quoted attributes and skipped malformed fragments never mean absent',()=>{for(const attrs of ['title="unclosed href=https://beta.example.com/','data-note=\'unclosed href="https://beta.example.com/"','title="x"garbage href="https://beta.example.com/"'])assert.throws(()=>actual.parse(row(attrs),10),unknown)})
test('a truncated explicit no-results marker remains uncertain, not an empty-result success',()=>{assert.throws(()=>actual.parse('<div class="no-results" title="x > y">No results</div>',10),unknown);assert.equal(actual.parse('<div class="no-results" title="x &gt; y">No results</div>',10),'（搜索服务明确未找到匹配结果）')})
test('matching URLs do not rescue an ambiguous quoted boundary',()=>{assert.throws(()=>actual.parse(row('title="x > y" href="https://alpha.example.com/"'),10),unknown)})
