import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

test('the actual committed release audit proof queries only columns present in the baseline SQL schema',()=>{
 const ddl=fs.readFileSync(new URL('../db/postgres/001_stage_schema.sql',import.meta.url),'utf8')
 const definition=/CREATE TABLE agentstudio\.audit_events \(\r?\n([\s\S]*?)\r?\n\);/.exec(ddl);assert(definition)
 const columns=new Set([...definition[1].matchAll(/^\s+([a-z_][a-z0-9_]*)\s+[a-z]/gm)].map(m=>m[1]));assert(columns.has('occurred_at'))
 const file='tests/helpers/pg-original-version-release-backend-fixture.mjs',source=fs.readFileSync(new URL('./helpers/pg-original-version-release-backend-fixture.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),queries=[]
 assert.equal(tree.parseDiagnostics.length,0)
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(tree)==='f.db.query'&&ts.isStringLiteralLike(node.arguments[0])&&node.arguments[0].text.includes('FROM agentstudio.audit_events')&&node.arguments[0].text.includes('ORDER BY'))queries.push(node.arguments[0].text);ts.forEachChild(node,visit)};visit(tree)
 assert.equal(queries.length,1,'one actual audit proof query must be checked')
 for(const sql of queries){
  const selected=/^SELECT ([a-z_,]+) FROM agentstudio\.audit_events /.exec(sql);assert(selected)
  const ordered=/ ORDER BY ([a-z_, ]+) LIMIT 1$/i.exec(sql);assert(ordered)
  for(const column of [...selected[1].split(','),...ordered[1].split(',').map(term=>term.trim().split(' ')[0])])assert(columns.has(column),'actual audit SQL references absent baseline column: '+column)
 }
})
