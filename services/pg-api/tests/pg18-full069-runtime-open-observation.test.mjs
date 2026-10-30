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
