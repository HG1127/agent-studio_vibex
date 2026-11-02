import test from 'node:test'
import assert from 'node:assert/strict'
import {originalSchedules078RuntimeSqlFailure as project} from './helpers/pg-original-schedules078-sql-diagnostic.mjs'
test('valid PostgreSQL SQLSTATE and known function frame project only bounded scalar metadata',()=>{
 const out=project({code:'42501',position:'123',internalPosition:'456',where:'SQL statement "SELECT SECRET_PARAMETER"\nPL/pgSQL function agentstudio.original_schedule_put(uuid,jsonb) line 6 at SQL statement\nPL/pgSQL function original_schedule_finish(uuid,uuid,uuid) line 12 at PERFORM',message:'SECRET_MESSAGE',detail:'SECRET_DETAIL',internalQuery:'SECRET_SQL',parameters:['SECRET_PARAMETERS']})
 assert.deepEqual(out,{event:'original_schedules078_runtime_sql_failure',sqlstate:'42501',position:123,internal_position:456,function_name:'original_schedule_put',function_line:6,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false});assert(Object.isFrozen(out));assert(!JSON.stringify(out).includes('SECRET'))
})
test('known unqualified and quoted frames work, unknown functions and arbitrary context text do not qualify',()=>{
 for(const frame of ['PL/pgSQL function original_schedule_put(uuid,jsonb) line 6 at SQL statement','PL/pgSQL function agentstudio."original_schedule_put"(uuid,jsonb) line 6 at SQL statement','SQL function original_schedule_put(uuid,jsonb) line 6'])assert.equal(project({where:frame}).function_name,'original_schedule_put')
 for(const frame of ['PL/pgSQL function original_schedule_attacker(uuid) line 6','PL/pgSQL function other_function(uuid) line 6','arbitrary original_schedule_put(uuid,jsonb) line 6','PL/pgSQL function original_schedule_put(uuid,jsonb) line 0', 'PL/pgSQL function original_schedule_put(uuid,jsonb) line 1000000','x'.repeat(4097)]){const out=project({where:frame});assert.equal(out.function_name,null);assert.equal(out.function_line,null)}
})
test('error getters, prototypes and raw error serialization are never evaluated',()=>{
 let accessed=0;const error=Object.create({code:'42501',where:'PL/pgSQL function original_schedule_put(uuid,jsonb) line 6'});for(const key of ['code','where','position','internalPosition','message','detail','internalQuery','parameters','toJSON'])Object.defineProperty(error,key,{get(){accessed++;throw Error('secret getter')}})
 const out=project(error);assert.equal(accessed,0);assert.equal(out.sqlstate,null);assert.equal(out.function_name,null);assert.equal(out.position,null)
 assert.doesNotThrow(()=>project(new Proxy({}, {getOwnPropertyDescriptor(){throw Error('blocked')}})))
})
test('malformed metadata cannot add payloads, arbitrary keys, numeric overflow or a runtime permit',()=>{
 for(const error of [null,undefined,'SECRET',{code:'42501 SECRET',position:'-1',internalPosition:'1.5'},{code:'x',position:'99999999999999999999',where:42},{code:42501,position:1,internalPosition:1},{where:'SECRET\nPL/pgSQL function original_schedule_put(uuid,jsonb) line 6 at SECRET',owner_user_id:'SECRET',runtime_authorization:true,qualifies_run:true}]){
  const out=project(error);assert.equal(out.runtime_authorization,false);assert.equal(out.qualifies_run,false);assert.equal(out.production_GO,false);assert(!JSON.stringify(out).includes('SECRET'));assert.deepEqual(Object.keys(out),['event','sqlstate','position','internal_position','function_name','function_line','observed_data_only','runtime_authorization','qualifies_run','production_GO'])
 }
})
