// Pure error-observation state and extracted catch only. No runtime/client/Pool.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {finalBusinessLogins} from '../src/pg18-full069-final-login-contract.mjs'
const source=fs.readFileSync(new URL('../src/pg18-full069-final-runtime.mjs',import.meta.url),'utf8'),start=source.indexOf('// Closed observation only;'),end=source.indexOf('// End closed runtime-open observation.'),code=source.slice(start,end).replace('export function full069FinalRuntimeOpenFailureObservation','function full069FinalRuntimeOpenFailureObservation')
assert(start>=0&&end>start)
const fresh=()=>Function('finalBusinessLogins',code+';return{remember:rememberRuntimeOpenFailure,read:full069FinalRuntimeOpenFailureObservation}')(finalBusinessLogins)
test('runtime-open observations expose fixed phase/key only and grant no runtime or qualification',()=>{
 const f=fresh(),error=Error('PRIVATE_PATH_PASSWORD_SQL_PID');Object.defineProperty(error,'secret',{value:'PRIVATE'})
 f.remember(error,'service_auditor','api');const row=f.read(error)
 assert.deepEqual(row,{event:'full069_final14_runtime_open_observation',phase:'service_auditor',entry_key:'api',observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false});assert(Object.isFrozen(row));assert(!JSON.stringify(row).includes('PRIVATE'));assert.equal(f.read(Error('same text')),null)
})
test('the first actual service failure phase is not overwritten by the outer open catch',()=>{
 const f=fresh(),error=Error('primary');f.remember(error,'service_login','design_worker');f.remember(error,'business_audits');assert.equal(f.read(error).phase,'service_login');assert.equal(f.read(error).entry_key,'design_worker')
 const other=Error('other');f.remember(other,'telemetry_state');assert.equal(f.read(other).phase,'telemetry_state');assert.equal(f.read(other).entry_key,null)
})
test('getter/proxy error payloads are never read and unknown phases/keys or primitives have no observation',()=>{
 const f=fresh();let invoked=0;const proxy=new Proxy({},{get(){invoked++;throw Error('trap')},ownKeys(){invoked++;throw Error('trap')},getPrototypeOf(){invoked++;throw Error('trap')}})
 f.remember(proxy,'physical');assert.equal(f.read(proxy).phase,'physical');assert.equal(invoked,0)
 const getter={get message(){invoked++;throw Error('private')}};f.remember(getter,'context');assert.equal(f.read(getter).phase,'context');assert.equal(invoked,0)
 for(const [phase,key]of [['unknown',null],['physical','private_account']]){const error={};f.remember(error,phase,key);assert.equal(f.read(error),null)}
 for(const value of [null,undefined,1,'error',false]){f.remember(value,'physical');assert.equal(f.read(value),null)}
})
test('the actual open catch preserves the original thrown object and does not require a fake trust or client',async()=>{
 const ts=createRequire(import.meta.url)('typescript'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true),declaration=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openFull069FinalRuntime'),statement=declaration.body.statements.find(n=>ts.isTryStatement(n));assert(statement?.catchClause)
 const f=fresh(),run=Function('rememberRuntimeOpenFailure','return async function(primary){const phase="operator_runtime",s=undefined;try{throw primary}'+statement.catchClause.getText(tree)+'}')(f.remember)
 const primary=Error('PRIVATE_PRIMARY');await assert.rejects(run(primary),error=>error===primary);assert.equal(f.read(primary).phase,'operator_runtime')
})
test('CI emission remains inside the existing exact fixture/UID/argv/runtime gates and preserves primary refusal',()=>{
 const actor=fs.readFileSync(new URL('./helpers/pg18-full069-final-path-ci-run.mjs',import.meta.url),'utf8'),guard=actor.indexOf("if(binding.kind==='fixture'"),observation=actor.indexOf('const observation=full069FinalRuntimeOpenFailureObservation(e)'),primary=actor.indexOf('}catch{};errorCode=reason(e);throw Error(errorCode)')
 assert(guard>=0&&observation>guard&&primary>observation)
 const body=actor.slice(guard,observation);for(const condition of ["binding.run===process.env.GITHUB_RUN_ID","binding.attempt===process.env.GITHUB_RUN_ATTEMPT","process.getuid?.()===0","process.getgid?.()===0","process.argv.length===11","process.execPath===path.join(deployment,'node24')","JSON.stringify(process.argv.slice(2))===JSON.stringify(argv)","failurePhase==='runtime_open'"])assert(body.includes(condition),condition)
 assert(actor.includes('if(observation)fs.writeSync(2,JSON.stringify(observation)'))
 assert(source.includes('catch(error){rememberRuntimeOpenFailure(error,phase,a.key);throw error}'));assert(source.includes('if(rejected)throw rejected.reason'))
})

const aclSource=fs.readFileSync(new URL('./helpers/pg18-full069-final14-database-acl-ci.mjs',import.meta.url),'utf8'),aclStart=aclSource.indexOf('// Closed ACL observation only;'),aclEnd=aclSource.indexOf('// End closed ACL observation.'),aclCode=aclSource.slice(aclStart,aclEnd).replace('export function full069Final14DatabaseAclFailureObservation','function full069Final14DatabaseAclFailureObservation')
assert(aclStart>=0&&aclEnd>aclStart)
const freshAcl=()=>Function('cases',aclCode+';return{remember:rememberAclFailure,read:full069Final14DatabaseAclFailureObservation}')([['extra_template0_public_temp','GRANT STRING NEVER EXECUTED']])
test('ACL observation only admits actual fixed phases/cases and a five-character SQLSTATE',()=>{
 const f=freshAcl(),error=Object.assign(Error('PRIVATE SQL PASSWORD PATH'),{code:'42501',detail:'PRIVATE'})
 f.remember(error,'mutation','extra_template0_public_temp');const row=f.read(error)
 assert.deepEqual(row,{event:'full069_final14_database_acl_negative_observation',phase:'mutation',negative_case:'extra_template0_public_temp',sqlstate:'42501',observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false});assert(Object.isFrozen(row));assert(!JSON.stringify(row).includes('PRIVATE'))
 f.remember(error,'final_stable');assert.equal(f.read(error).phase,'mutation')
 for(const [phase,key]of [['PRIVATE',null],['mutation','PRIVATE']]){const e={};f.remember(e,phase,key);assert.equal(f.read(e),null)}
})
test('ACL diagnostic getters or descriptor traps cannot replace failure or expose private payloads',()=>{
 const f=freshAcl();let invoked=0;const getter={get code(){invoked++;throw Error('PRIVATE')},get message(){invoked++;throw Error('PRIVATE')}}
 f.remember(getter,'context');assert.equal(f.read(getter).sqlstate,null);assert.equal(invoked,0)
 const proxy=new Proxy({},{getOwnPropertyDescriptor(){throw Error('PRIVATE')},get(){assert.fail('error values must not be read')}});f.remember(proxy,'connect');assert.equal(f.read(proxy).sqlstate,null)
 for(const code of ['PRIVATE','42501 PRIVATE',12345,'enoent',null]){const e={code};f.remember(e,'connect');assert.equal(f.read(e).sqlstate,null)}
 for(const primitive of [null,undefined,1,false,'PRIVATE']){f.remember(primitive,'admission');assert.equal(f.read(primitive),null)}
})
test('actual ACL outer catch rethrows the identical error while original rollback and admission gates remain',async()=>{
 const ts=createRequire(import.meta.url)('typescript'),tree=ts.createSourceFile('acl.mjs',aclSource,ts.ScriptTarget.Latest,true),declaration=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='runActualFinal14DatabaseAclNegatives'),statement=declaration.body.statements.find(n=>ts.isTryStatement(n));assert(statement?.catchClause)
 const f=freshAcl(),run=Function('rememberAclFailure','return async function(primary){const phase="operator_runtime",negativeCase=null;try{throw primary}'+statement.catchClause.getText(tree)+'}')(f.remember),primary=Error('PRIVATE_PRIMARY')
 await assert.rejects(run(primary),error=>error===primary);assert.equal(f.read(primary).phase,'operator_runtime')
 assert(aclSource.includes('const deadline=performance.now()+8000'));assert(aclSource.includes("await db.query('ROLLBACK');begun=false"));assert(aclSource.includes('if(primary)throw primary'));assert(aclSource.includes('passed!==cases.length'));assert(aclSource.includes('inspectFinal14DatabaseAclRows(restored,databases,roles)'))
 const actor=fs.readFileSync(new URL('./helpers/pg18-full069-final-path-ci-run.mjs',import.meta.url),'utf8'),guard=actor.indexOf("if(binding.kind==='fixture'"),emission=actor.indexOf('const observation=full069Final14DatabaseAclFailureObservation(e)'),primaryThrow=actor.indexOf('}catch{};errorCode=reason(e);throw Error(errorCode)');assert(guard>=0&&emission>guard&&primaryThrow>emission)
 const body=actor.slice(guard,emission);for(const gate of ["binding.run===process.env.GITHUB_RUN_ID","process.getuid?.()===0","process.argv.length===11","process.execPath===path.join(deployment,'node24')","failurePhase==='runtime_preflight'"])assert(body.includes(gate),gate)
})
