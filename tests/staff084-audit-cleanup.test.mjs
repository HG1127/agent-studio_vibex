// Executes only the actual read-audit lifecycle function with terminal ports.
// This does not load pg, create a Pool, execute SQL or prove schema readiness.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {compileFunction} from 'node:vm'
import ts from 'typescript'
import {hostedStaff084Phase} from '../services/pg-api/src/hosted-profile-diagnostic.mjs'
const raw=readFileSync(new URL('../services/pg-api/src/employee-staff084-profile.mjs',import.meta.url),'utf8')
const ast=ts.createSourceFile('profile.mjs',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='verifyEmployeeStaff084Pool')
assert(fn);const view=raw.slice(fn.getStart(ast),fn.end).replace(/^export /,'')
for(const scenario of ['ok','rollbackFail','auditAndRollbackFail','beginFail','releaseFail','auditAndReleaseFail'])test('actual Staff084 read-audit cleanup: '+scenario,async()=>{
 const primary=Error('terminal_primary_audit'),commands=[],releases=[]
 const client={async query(text){commands.push(text);if(scenario==='beginFail'&&text.startsWith('BEGIN'))throw primary;if(text==='ROLLBACK'&&['rollbackFail','auditAndRollbackFail'].includes(scenario))throw Error('terminal_rollback');return{rows:[]}},release(discard){releases.push(discard);if(['releaseFail','auditAndReleaseFail'].includes(scenario))throw Error('terminal_release')}}
 const deps={hostedStaff084Phase,assertEmployeeStaff084Snapshot(){},bad(code){throw Error('staff_composite_'+code)},async audit(){if(scenario.startsWith('audit'))throw primary},async verifyEmployeeStaff084AuthClient(){return true}}
 const run=compileFunction(view+'\nreturn verifyEmployeeStaff084Pool',Object.keys(deps))(...Object.values(deps))
 let result,error;try{result=await run({connect:async()=>client},{mode:{profile:'terminal_only'}},'0'.repeat(64),{system_identifier:'1',database_oid:'1'},'api')}catch(e){error=e}
 if(scenario==='ok'){assert.equal(error,undefined);assert.equal(result.profile,'terminal_only');assert.deepEqual(releases,[false])}
 else if(scenario==='rollbackFail'){assert.equal(error?.message,'staff_composite_audit_rollback_unconfirmed');assert.deepEqual(releases,[true])}
 else if(scenario==='releaseFail')assert.equal(error?.message,'staff_composite_audit_release_unconfirmed')
 else{assert.equal(error,primary);assert.equal(commands.includes('ROLLBACK'),scenario!=='beginFail')}
})
