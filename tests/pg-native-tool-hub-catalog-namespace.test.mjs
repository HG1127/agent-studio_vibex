// Actual Native TSX expressions and original curated helper only. This does not
// render a browser, fetch a registry, call a model or replace the genuine E2E.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {curatedZhFor} from '../src/pages/PluginMarket/curated.ts'
const ts=createRequire(import.meta.url)('typescript'),text=fs.readFileSync(new URL('../src/pages/PgNativePilot/PgNativePublicMcpCatalog.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('catalog.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=(predicate)=>{const out=[];function visit(n){if(predicate(n))out.push(n);ts.forEachChild(n,visit)}visit(tree);return out},calls=nodes(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='curatedZhFor');assert.equal(calls.length,1)
const recommend=Function('curatedZhFor','item','return '+calls[0].getText(tree)).bind(null,curatedZhFor),titles=nodes(n=>ts.isJsxExpression(n)&&n.expression?.getText(tree)==='zh?.zh_title??curated?.zh_title??item.title');assert.equal(titles.length,1);const title=Function('zh','curated','item','return '+titles[0].expression.getText(tree)),item=(name,title)=>({name,title})
test('actual prior helper reproduces GitHub namespace mislabel; actual Native expression preserves unrelated official title',()=>{
 const weather=item('io.github.synthetic/weather','Synthetic Weather');assert.equal(curatedZhFor(weather.name,weather.title).zh_title,'GitHub');assert.equal(recommend(weather),null);assert.equal(title(undefined,recommend(weather),weather),'Synthetic Weather')
})
test('publisher brand tokens cannot relabel unrelated server identifiers or official titles',()=>{
 for(const [name,label]of [['io.github.synthetic/weather','Synthetic Weather'],['io.dropbox.synthetic/calendar','Synthetic Calendar'],['io.slack.synthetic/forecast','Forecast MCP']]){const value=item(name,label);assert.equal(recommend(value),null);assert.equal(title(undefined,recommend(value),value),label)}
})
test('actual Native expression keeps existing intended GitHub and Slack server/title recommendations',()=>{
 for(const [name,label,expected]of [['io.example/github-mcp-server','Repository tools','GitHub'],['com.company/slack-tools','Team messages','Slack'],['io.example/remote-connector','GitHub','GitHub']])assert.equal(recommend(item(name,label)).zh_title,expected)
})
test('a publisher token cannot override the server own recommendation',()=>{
 const value=item('io.dropbox.synthetic/wikipedia','Reference encyclopedia');assert.equal(curatedZhFor(value.name,value.title).zh_title,'Dropbox');assert.equal(recommend(value).zh_title,'Wikipedia');assert.equal(title(undefined,recommend(value),value),'Wikipedia')
})
test('actual title expression retains owner Chinese precedence and complete registry identity remains rendered and selected',()=>{
 const value=item('io.example/github-mcp-server','Repository tools');assert.equal(title({zh_title:'本人仓库说明'},recommend(value),value),'本人仓库说明');assert.ok(text.includes('{item.name} · {item.version}'));assert.ok(text.includes("read(page.query,'',item)"));assert.equal(calls[0].arguments[0].getText(tree),"item.name.slice(item.name.indexOf('/')+1)");assert.equal(calls[0].arguments[1].getText(tree),'item.title')
})
