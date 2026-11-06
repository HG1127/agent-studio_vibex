// Actual fixture expression and production SCRAM helpers only; no fixture import or SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import ts from 'typescript'
import {makeNativeScramVerifier} from '../src/native-activation-cli.mjs'
import {matchesServiceScram} from '../src/pg18-service-login-secrets.mjs'

test('074 fixture generates independent credentials accepted by the unchanged production SCRAM contract',()=>{
 const file=new URL('./native-monitor074-genuine-pg18.test.mjs',import.meta.url),tree=ts.createSourceFile('fixture.mjs',fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),passwords=[]
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='password')passwords.push(node.initializer.getText(tree));ts.forEachChild(node,visit)}visit(tree);assert.equal(passwords.length,1)
 // No permit/name scope: a future dependency on the fixture administrator secret refuses.
 const generate=Function('crypto','return ('+passwords[0]+')'),first=generate(crypto),second=generate(crypto)
 assert.match(first,/^[a-f0-9]{80}$/);assert.notEqual(first,second)
 const verifier=makeNativeScramVerifier(first);assert(matchesServiceScram(first,verifier));assert(!matchesServiceScram(second,verifier))
 assert.throws(()=>makeNativeScramVerifier(crypto.createHash('sha512').update('synthetic previous fixture derivation').digest('hex')),/independent_high_entropy_secret_required/)
})
