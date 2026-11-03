import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
function fixture(){
  const db=new DatabaseSync(':memory:');let now=1000
  const config={question_id:'question-one',execution_budget:{model_calls:3,closing_model_calls:1,tool_calls:2,search_calls:1,read_calls:1,wall_ms:1000}}
  const app={db:()=>({newQuery(sql){let params={};return {bind(value){params=value;return this},execute(){db.prepare(sql.replace(/\{:(\w+)\}/g,':$1')).run(params)},all(rows){rows.push(...db.prepare(sql.replace(/\{:(\w+)\}/g,':$1')).all(params))}}}}),
    findRecordById(collection,id){if(collection!=='agent_runs'||id!=='run-one')throw Error('missing');return {getString:key=>key==='rh_user_id'?'alice':key==='status'?'running':JSON.stringify(config),getInt:()=>10}},
    runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}},
  }
  const context={module:{exports:{}},Date:class extends Date{constructor(...args){super(...(args.length?args:[now]))}},DynamicModel:function(value){Object.assign(this,value)},arrayOf:()=>[],$security:{sha256:value=>createHash('sha256').update(value).digest('hex')}}
  vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/execution_budget.js','utf8'),context)
  const budget=context.module.exports;budget.ensure(app)
  return {app,db,budget,config,advance:ms=>{now+=ms}}
}
test('work requests cannot spend the reserved closing allowance or reset after recovery',()=>{
  const f=fixture();try{
    assert.equal(f.budget.status(f.app,'alice','run-one').started_ms,null)
    f.budget.reserve(f.app,'alice','run-one','model',false);f.budget.reserve(f.app,'alice','run-one','model',false)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','model',false),{code:'execution_budget_exhausted',dimension:'models'})
    f.budget.reserve(f.app,'alice','run-one','model',true)
    assert.equal(f.budget.status(f.app,'alice','run-one').usage.model_intents,3)
    assert.equal(f.budget.status(f.app,'alice','run-one').usage.closing_intents,1)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','model',true),{code:'execution_budget_exhausted'})
    f.config.execution_budget.model_calls=4
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','model',false),{code:'execution_budget_exhausted',dimension:'configuration_changed'})
    assert.equal(f.budget.status(f.app,'alice','run-one').usage.model_intents,3)
  }finally{f.db.close()}
})
test('search/read limits also consume the total tool allowance and rejected reservations roll back',()=>{
  const f=fixture();try{
    f.budget.reserve(f.app,'alice','run-one','read',false)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','read',false),{dimension:'read'})
    f.budget.reserve(f.app,'alice','run-one','search',false)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','tool',false),{dimension:'tools'})
    assert.equal(f.budget.status(f.app,'alice','run-one').usage.tool_intents,2)
    assert.throws(()=>f.budget.status(f.app,'bob','run-one'),{code:'run_not_found'})
  }finally{f.db.close()}
})
test('wall deadline is durable, with only a bounded closing grace period',()=>{
  const f=fixture();try{
    f.budget.reserve(f.app,'alice','run-one','read',false);f.advance(1001)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','model',false),{dimension:'wall_time'})
    f.budget.reserve(f.app,'alice','run-one','model',true);f.advance(31000)
    assert.throws(()=>f.budget.reserve(f.app,'alice','run-one','model',true),{dimension:'wall_time'})
  }finally{f.db.close()}
})
test('invalid or unbounded budget input cannot become an execution allowance',()=>{
  const f=fixture();try{
    for(const input of [{model_calls:Infinity},{model_calls:-1},{wall_ms:999},{arbitrary_sql:'DROP'},{model_calls:0,closing_model_calls:1}])assert.throws(()=>f.budget.normalize(input,10))
    assert.equal(f.budget.normalize({model_calls:0,tool_calls:0},10).closing_model_calls,0)
  }finally{f.db.close()}
})
