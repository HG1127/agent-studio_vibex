// Symbolic comparisons of actual fixture/installer source; no SQL is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {makeNativeScramVerifier} from '../src/native-activation-cli.mjs'
import {matchesServiceScram} from '../src/pg18-service-login-secrets.mjs'
const ts=createRequire(import.meta.url)('typescript'),fixture=fs.readFileSync(new URL('./helpers/tool-hub-genuine-fixture.mjs',import.meta.url),'utf8'),originalBase=fs.readFileSync(new URL('./helpers/agent-assessment-fixture.mjs',import.meta.url),'utf8'),fresh=fs.readFileSync(new URL('../src/pg18-fresh-runtime-install.ts',import.meta.url),'utf8'),parse=(file,text)=>ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true)
const source=parse('fixture.mjs',fixture),baseTree=parse('base.mjs',originalBase),freshTree=parse('fresh.ts',fresh),fixed=['agentstudio_stage_login','agentstudio_stage_worker']
const nodes=(tree,predicate)=>{const out=[];function visit(n){if(predicate(n))out.push(n);ts.forEachChild(n,visit)}visit(tree);return out}
const loops=nodes(source,n=>ts.isForOfStatement(n)&&ts.isArrayLiteralExpression(n.expression)&&n.expression.elements.every(e=>ts.isStringLiteral(e))&&JSON.stringify(n.expression.elements.map(e=>e.text))===JSON.stringify(fixed));assert.equal(loops.length,1,'actual fixed cold LOGIN provisioning loop required')
const loop=loops[0],fragment=loop.getText(source),cold=nodes(freshTree,n=>ts.isExpressionStatement(n)&&ts.isAwaitExpression(n.expression)&&ts.isCallExpression(n.expression.expression)&&ts.isStringLiteral(n.expression.expression.arguments[0])&&n.expression.expression.arguments[0].text==='ALTER ROLE agentstudio_stage_login NOLOGIN; ALTER ROLE agentstudio_stage_worker NOLOGIN');assert.equal(cold.length,1)
const memberships=nodes(freshTree,n=>ts.isArrayLiteralExpression(n)&&n.elements.every(e=>ts.isStringLiteral(e))&&n.elements.some(e=>e.text==='agentstudio_stage_login:agentstudio_api')&&n.elements.some(e=>e.text==='agentstudio_stage_worker:agentstudio_worker'));assert.equal(memberships.length,1)
const membershipValues=memberships[0].elements.map(e=>e.text),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,passwordNode=nodes(source,n=>ts.isVariableDeclaration(n)&&n.name.getText(source)==='passwordFor');assert.equal(passwordNode.length,1)
const basePasswordNode=nodes(baseTree,n=>ts.isVariableDeclaration(n)&&n.name.getText(baseTree)==='passwordFor');assert.equal(basePasswordNode.length,1)
const seed={password:'synthetic-agentstudio-pg18-ci-42'},passwordFor=Function('crypto','target','return '+passwordNode[0].initializer.getText(source))(crypto,seed),basePasswordFor=Function('createHash','target','return '+basePasswordNode[0].initializer.getText(baseTree))(crypto.createHash,seed)
function model(rejectRole){const roles=new Map([...new Set(membershipValues.map(v=>v.split(':')[0]))].map(name=>[name,{login:true,password:null,groups:membershipValues.filter(v=>v.startsWith(name+':')).map(v=>v.split(':')[1]).sort()}])),sql=[]
 const db={async query(text){sql.push(text);for(const statement of text.split(';').map(v=>v.trim()).filter(Boolean)){let m=/^ALTER ROLE (agentstudio_stage_login|agentstudio_stage_worker) NOLOGIN$/.exec(statement);if(m){roles.get(m[1]).login=false;continue}m=/^ALTER ROLE (agentstudio_stage_login|agentstudio_stage_worker) LOGIN PASSWORD '(SCRAM-SHA-256\$[^']+)'$/.exec(statement);assert.ok(m,'only the exact original cold or fixed activation statement is allowed');if(m[1]===rejectRole)throw Error('owned_ci_alter_failed');roles.get(m[1]).login=true;roles.get(m[1]).password=m[2]}}}
 return {roles,sql,cold:()=>AsyncFunction('db',cold[0].getText(freshTree))(db),activate:()=>AsyncFunction('base','activationModule','passwordFor','assert',fragment)({db},{makeNativeScramVerifier},passwordFor,assert),groups:()=>JSON.stringify([...roles].map(([name,v])=>[name,v.groups]))}
}
test('actual fresh factory deliberately disables both fixed roles and the new awaited provision runs before every real pool audit',()=>{
 assert.ok(originalBase.indexOf("await addLogin(bootstrap,'agentstudio_stage_login'")<originalBase.indexOf('await installFreshRuntime('));assert.ok(originalBase.indexOf("await addLogin(bootstrap,'agentstudio_stage_worker'")<originalBase.indexOf('await installFreshRuntime('))
 assert.ok(fixture.indexOf('await baseModule.agentAssessmentTcpFixture(env)')<loop.getStart(source));assert.ok(loop.end<fixture.indexOf("const workerPool=pool('agentstudio_stage_worker')"));assert.ok(loop.end<fixture.indexOf('await preflightModule.verifyBoundDispatchPrivileges(client,kind)'));assert.ok(fixture.includes('await preflightModule.verifyWorkflowEffectIdentityPrivileges(client,kind,effect)'))
})
test('actual cold statement reproduces NOLOGIN; actual provision enables only those roles with original distinct synthetic password derivation',async()=>{
 const m=model(),groups=m.groups();await m.cold();for(const name of fixed)assert.equal(m.roles.get(name).login,false);assert.equal(m.roles.get('agentstudio_native_login').login,true)
 await m.activate();assert.equal(m.groups(),groups);assert.equal(m.sql.length,3)
 for(const name of fixed){assert.equal(m.roles.get(name).login,true);assert.equal(passwordFor(name),basePasswordFor(name));assert.equal(matchesServiceScram(passwordFor(name),m.roles.get(name).password),true)}
 assert.notEqual(m.roles.get(fixed[0]).password,m.roles.get(fixed[1]).password);assert.deepEqual(m.roles.get(fixed[1]).groups,['agentstudio_api','agentstudio_worker'])
})
test('an actual awaited provisioning rejection propagates with no retry, no second role activation and no membership mutation',async()=>{
 const m=model(fixed[0]),groups=m.groups();await m.cold();await assert.rejects(m.activate(),/owned_ci_alter_failed/);assert.equal(m.sql.length,2);assert.equal(m.roles.get(fixed[1]).login,false);assert.equal(m.groups(),groups)
})
test('fixed activation fragment never grants memberships, changes privilege flags, inserts receipts or substitutes another LOGIN or audit',()=>{
 for(const value of ['GRANT ','REVOKE ','NOSUPERUSER','BYPASSRLS','schema_migrations','verifyCredentials:','verifySchema:','catch('])assert.equal(fragment.includes(value),false,value)
 assert.equal(nodes(loop,n=>ts.isCallExpression(n)&&n.expression.getText(source)==='base.db.query').length,1);assert.ok(fragment.includes('activationModule.makeNativeScramVerifier(passwordFor(login))'));assert.ok(fragment.includes('assert.match(verifier,'))
})
