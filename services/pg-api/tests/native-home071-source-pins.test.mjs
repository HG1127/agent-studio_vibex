// Source bytes only. No schema install, credentials, Pool, Worker or listener.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import ts from 'typescript'

test('the strict071 nested reviewed inventory matches every actual committed LF source, including optional business parsers',()=>{
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),file='ops/pg18-original-home071-review-plan.mjs',text=fs.readFileSync(path.join(repo,file),'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 assert.equal(tree.parseDiagnostics.length,0)
 const declaration=tree.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(tree)==='reviewed')
 assert(declaration&&ts.isArrayLiteralExpression(declaration.initializer))
 const pins=declaration.initializer.elements.map(n=>{assert(ts.isObjectLiteralExpression(n));return Object.fromEntries(n.properties.map(p=>{assert(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer));return[p.name.getText(tree),p.initializer.text]}))})
 assert.equal(pins.length,9);assert.equal(new Set(pins.map(p=>p.path)).size,9)
 for(const pin of pins){assert.match(pin.path,/^(?:services\/pg-api\/src|services\/pg-api\/tests\/helpers|shared)\/[A-Za-z0-9._/-]+$/);assert(!pin.path.includes('..'));assert.match(pin.sha256,/^[a-f0-9]{64}$/);const bytes=execFileSync('git',['show','HEAD:'+pin.path],{cwd:repo,maxBuffer:16*1024*1024});assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,pin.path)}
 assert(text.includes('sha(fs.readFileSync(at))!==pin.sha256'))
 assert(text.includes('for(const pin of [sql,...reviewed])checked(pin)'))
})
