import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {DatabaseSync} from 'node:sqlite'
import {createHash,randomBytes} from 'node:crypto'

function fixture(){
  const db=new DatabaseSync(':memory:'),connectionId='abcdefghijklmno',tool=`mkt__${connectionId}__search_repositories`
  const connection={rh_user_id:'alice',enabled:true,last_probe_status:'ok',tool_count:1,url:'https://api.githubcopilot.com/mcp/readonly',headers_sec:'[]',tools:JSON.stringify([{name:'search_repositories',input_schema:{type:'object',required:['query'],properties:{query:{type:'string'}},additionalProperties:false},read_only:true}])}
  const record={id:connectionId,get:key=>connection[key],getString:key=>String(connection[key]??''),getBool:key=>connection[key]===true,getInt:key=>Number(connection[key]||0)}
  let now=1000000
  const clock={now:()=>now,advance:ms=>{now+=ms}}
  const app={db:()=>({newQuery(sql){let params={};return {bind(p){params=p;return this},execute(){const result=db.prepare(sql.replace(/\{:(\w+)\}/g,':$1')).run(params);return {rowsAffected:()=>result.changes}},all(rows){rows.push(...db.prepare(sql.replace(/\{:(\w+)\}/g,':$1')).all(params))}}}}),
    findRecordById(collection,id){if(collection==='market_connections'&&id===connectionId)return record;if(collection==='agent_runs'&&id==='run-a')return {getString:key=>key==='rh_user_id'?'alice':key==='status'?'running':JSON.stringify({market_tool_ids:[tool]})};throw Error('not found')},
    runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}},
  }
  const modules={}
  function load(name){
    if(modules[name])return modules[name]
    const context={module:{exports:{}},__hooks:'hooks',Date:class extends Date{constructor(...args){super(...(args.length?args:[clock.now()]))}},
      DynamicModel:function(shape){Object.assign(this,shape)},arrayOf:()=>[],
      $os:{getenv:()=>''},$security:{sha256:value=>createHash('sha256').update(value).digest('hex'),randomString:n=>randomBytes(n).toString('hex').slice(0,n)},
      require:path=>path.endsWith('tool_results.js')?{assertRunAccessible(){}}:load(path.split('/').at(-1))}
    vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/'+name,'utf8'),context);return modules[name]=context.module.exports
  }
  const grants=load('tool_grants.js');grants.ensure(app)
  const input={tool,config_hash:grants.descriptor(app,'alice','run-a',tool).config_hash,allowed_inputs:[{query:'repo_a'},{query:'repo_b'}],max_calls:2,expires_in_minutes:1,amount_limit_minor:0,idempotency_key:'review-one'}
  return {db,app,grants,connection,tool,input,clock}
}

test('reviewed exact requests have atomic call limits and restart-safe step reservation identity',()=>{
  const f=fixture();try{
    const created=f.grants.create(f.app,'alice','run-a',f.input)
    assert.equal(f.grants.create(f.app,'alice','run-a',f.input).grant_id,created.grant_id)
    assert.throws(()=>f.grants.create(f.app,'alice','run-a',{...f.input,max_calls:3}),{code:'grant_idempotency_conflict'})
    const first=f.grants.consume(f.app,'alice','run-a',1,f.tool,{query:'repo_a'})
    assert.equal(f.grants.consume(f.app,'alice','run-a',1,f.tool,{query:'repo_a'}).grant_id,first.grant_id)
    assert.equal(f.grants.list(f.app,'alice','run-a').items[0].reserved_calls,1)
    assert.equal(f.grants.consume(f.app,'alice','run-a',2,f.tool,{query:'outside'}),null)
    assert.ok(f.grants.consume(f.app,'alice','run-a',2,f.tool,{query:'repo_b'}))
    assert.equal(f.grants.consume(f.app,'alice','run-a',3,f.tool,{query:'repo_a'}),null)
    assert.equal(f.grants.list(f.app,'alice','run-a').items[0].reserved_calls,2)
  }finally{f.db.close()}
})

test('expiry, revoke and configuration changes invalidate authorization without trusting readOnlyHint',()=>{
  for(const mode of ['expire','revoke','configuration']){
    const f=fixture();try{
      const grant=f.grants.create(f.app,'alice','run-a',f.input),permit=f.grants.consume(f.app,'alice','run-a',1,f.tool,{query:'repo_a'})
      assert.equal(f.grants.valid(f.app,'alice',permit),true)
      if(mode==='expire')f.clock.advance(61000)
      if(mode==='revoke')f.grants.revoke(f.app,'alice','run-a',grant.grant_id)
      if(mode==='configuration')f.connection.headers_sec='[{"k":"Authorization","v":"changed encrypted config"}]'
      assert.equal(f.grants.consume(f.app,'alice','run-a',2,f.tool,{query:'repo_a'}),null)
      if(mode!=='configuration')assert.equal(f.grants.valid(f.app,'alice',permit),false)
    }finally{f.db.close()}
  }
  const f=fixture();try{
    f.connection.url='https://untrusted.example/mcp/readonly'
    assert.equal(f.grants.descriptor(f.app,'alice','run-a',f.tool),null)
    assert.throws(()=>f.grants.create(f.app,'alice','run-a',f.input),{code:'grant_adapter_not_trusted'})
  }finally{f.db.close()}
})

test('employee ownership and zero monetary-effect authorization cannot be expanded by a caller',()=>{
  const f=fixture();try{
    assert.throws(()=>f.grants.create(f.app,'bob','run-a',f.input),{code:'run_not_found'})
    assert.throws(()=>f.grants.create(f.app,'alice','run-a',{...f.input,amount_limit_minor:1}),{code:'invalid_grant_budget'})
    assert.throws(()=>f.grants.create(f.app,'alice','run-a',{...f.input,allowed_inputs:[{query:3}]}),{code:'tool_schema_validation_failed'})
  }finally{f.db.close()}
})
