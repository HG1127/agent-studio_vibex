// Terminal source execution only. No pg/Pool, SQL, SDK, Worker or runtime startup.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {compileFunction} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import ts from 'typescript'
function pick(raw,filename,names){const ast=ts.createSourceFile(filename,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(ast.parseDiagnostics.length,0);return ast.statements.filter(n=>(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.name&&names.includes(n.name.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&names.includes(d.name.text))).map(n=>n.getText(ast)).join('\n').replace(/\bexport (?=(?:async )?(?:function|class|const))/g,'')}
const contracts=fs.readFileSync(new URL('../services/pg-api/src/contracts.ts',import.meta.url),'utf8'),HttpError=compileFunction(stripTypeScriptTypes(pick(contracts,'contracts.ts',['HttpError']),{mode:'strip'})+'\nreturn HttpError')()
const raw=fs.readFileSync(new URL('../services/pg-api/src/original-quality089-audit.ts',import.meta.url),'utf8'),view=pick(raw,'audit.ts',['inspectOriginalQuality089Startup'])
for(const scenario of ['ok','rollbackFail','auditFail','auditAndRollbackFail','beginFail','releaseFail','auditAndReleaseFail','auditUndefinedAndRollbackFail','rollbackAndReleaseFail'])test('actual quality089 startup cleanup: '+scenario,async()=>{
 const primary=scenario==='auditUndefinedAndRollbackFail'?undefined:Error('terminal_primary_audit'),commands=[],releases=[]
 const client={async query(text){commands.push(text);if(scenario==='beginFail'&&text.startsWith('BEGIN'))throw primary;if(text==='ROLLBACK'&&['rollbackFail','auditAndRollbackFail','auditUndefinedAndRollbackFail','rollbackAndReleaseFail'].includes(scenario))throw Error('terminal_rollback');return{rows:[]}},release(){releases.push([...arguments]);if(['releaseFail','auditAndReleaseFail','rollbackAndReleaseFail'].includes(scenario))throw Error('terminal_release')}}
 const verify=async()=>{if(scenario.startsWith('audit'))throw primary}
 const run=compileFunction(stripTypeScriptTypes(view,{mode:'strip'})+'\nreturn inspectOriginalQuality089Startup',['HttpError','verifyOriginalQuality089Schema'])(HttpError,verify)
 let value,caught=false;try{await run({connect:async()=>client})}catch(error){caught=true;value=error}
 if(scenario==='ok'){assert.equal(caught,false);assert.deepEqual(releases,[[]])}
 else if(['rollbackFail','rollbackAndReleaseFail'].includes(scenario)){assert.equal(caught,true);assert.equal(value?.status,503);assert.equal(value?.message,'original_quality_startup_rollback_unconfirmed');assert.deepEqual(releases,[[true]])}
 else if(scenario==='releaseFail'){assert.equal(value?.message,'original_quality_startup_release_unconfirmed');assert.equal(value?.status,503)}
 else{assert.equal(caught,true);assert.equal(value,primary);assert.equal(commands.includes('ROLLBACK'),scenario!=='beginFail');if(scenario==='beginFail')assert.deepEqual(releases,[[true]])}
})
const repo=fs.readFileSync(new URL('../services/pg-api/src/original-agent-quality-repository.ts',import.meta.url),'utf8'),sqlError=compileFunction(stripTypeScriptTypes(pick(repo,'repo.ts',['known','originalQualitySqlError']),{mode:'strip'})+'\nreturn originalQualitySqlError',['HttpError'])(HttpError)
for(const [message,status]of [['original_quality_employee_changed',409],['original_quality_spec_not_found',404],['invalid_original_quality_write',400]])test('actual SQL mapping keeps explicit status '+message,()=>assert.throws(()=>sqlError({code:'P0001',message}),e=>e instanceof HttpError&&e.status===status&&e.message===message))
for(const message of ['constructor','toString','__proto__','unknown_quality_error',undefined])test('unlisted SQL message cannot use inherited lookup '+String(message),()=>{const e={code:'P0001',message};assert.throws(()=>sqlError(e),actual=>actual===e)})
test('non-P0001 original exception remains unchanged',()=>{const e={code:'23505',message:'original_quality_employee_changed'};assert.throws(()=>sqlError(e),actual=>actual===e)})
