import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes } from 'node:crypto'

function fixture() {
  const db=new DatabaseSync(':memory:'), runs=new Map([['run-a','alice'],['run-b','bob']]), grants=new Set(['source-a']),configs=new Map()
  db.exec('CREATE TABLE agent_studio_kb_documents(id TEXT,base_id TEXT); INSERT INTO agent_studio_kb_documents VALUES (\'doc-a\',\'source-a\')')
  const app={
    db:()=>({newQuery(sql){
      let params={};const statement=()=>db.prepare(sql.replace(/\{:(\w+)\}/g,':$1'))
      return {bind(p){params=p;return this},execute(){statement().run(params)},
        all(rows){rows.push(...statement().all(params))},one(row){const found=statement().get(params);if(!found)throw Error('missing');Object.assign(row,found)}}
    }}),
    findRecordById(collection,id){if(collection!=='agent_runs'||!runs.has(id))throw Error('missing');return {getString:key=>key==='rh_user_id'?runs.get(id):key==='config'?JSON.stringify(configs.get(id)||{}):'{}'}},
    runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
  }
  const context={module:{exports:{}},console,
    DynamicModel:function(shape){Object.assign(this,shape)},arrayOf:()=>[],__hooks:'hooks',
    $security:{sha256:s=>createHash('sha256').update(s).digest('hex'),randomString:n=>randomBytes(n).toString('hex').slice(0,n)},
    require:()=>({resolve(_app,_uid,id){if(!grants.has(id))throw Error('revoked');return {semantic_allowed:true}},authorize(_app,_uid,id){if(!grants.has(id))throw Error('revoked')}}),
  }
  vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/tool_results.js','utf8'),context)
  const store=context.module.exports;store.ensure(app)
  const envelope={text:'x'.repeat(10050)+'LATE_EVIDENCE',structuredContent:{claim:'fact',nested:{secret:'fixture-secret'}},
    content:[{type:'resource_link',uri:'fixture://source'}],_meta:{truncated:true}}
  const scope={request_hash:'request-1',knowledge_base_ids:['source-a'],documents:[{base_id:'source-a',document_id:'doc-a'}]}
  const sanitize=s=>s.replaceAll('fixture-secret','[REDACTED]')
  const save=()=>store.save(app,'alice','run-a',1,'fixture',envelope,scope,sanitize)
  return {db,app,store,envelope,scope,grants,runs,configs,save,sanitize}
}

test('missing local screenshot content is not a successful four-character null result',()=>{
  const f=fixture();try{
    const reference=f.store.save(f.app,'alice','run-a',1,'local_computer',{
      text:JSON.stringify({application:'Synthetic WorkBuddy',mode:'vision',actionable:true,
        observation:'0123456789abcdef0123456789abcdef',expiresInSeconds:30}),
      structuredContent:{job_id:'synthetic-job',status:'succeeded'},
      resources:[{type:'local_job',job_id:'synthetic-job'}],
    },{},s=>s)
    assert.throws(()=>f.store.read(f.app,'alice','run-a',reference.result_id,{field:'content'}),
      {code:'result_field_unavailable',httpStatus:422},
      'an absent field must not look like successfully read evidence')
    const metadata=f.store.read(f.app,'alice','run-a',reference.result_id,{field:'text'})
    assert.equal(JSON.parse(metadata.text).observation,'0123456789abcdef0123456789abcdef')
    assert.throws(()=>f.store.read(f.app,'bob','run-a',reference.result_id,{field:'content'}),{code:'result_not_found'})
  }finally{f.db.close()}
})

test('an explicitly stored null remains valid typed content',()=>{
  const f=fixture();try{
    const reference=f.store.save(f.app,'alice','run-a',1,'fixture',{text:'Explicit empty value',content:null},{},s=>s)
    const result=f.store.read(f.app,'alice','run-a',reference.result_id,{field:'content'})
    assert.equal(result.text,'null');assert.equal(result.total_length,4);assert.equal(result.encoding,'json_fragment')
  }finally{f.db.close()}
})

test('record projection preserves persisted evaluation and feedback while rejecting empty retry resets',()=>{
 const f=fixture();try{
  f.save()
  const evaluation={score:80,dimensions:[{name:'Output',score:80}],suggestions:[],mode:'rule'}
  const feedback={rating:'up',tags:[],comment:'Verified fixture'}
  const json={evaluation,feedback,checkpoint:{attempt_no:2}}
  const record={publicExport:()=>({id:'run-a',evaluation:{},feedback:{}}),getString:key=>JSON.stringify(json[key])}
  const projected=f.store.projectRecord(f.app,'alice',record)
  assert.deepEqual(JSON.parse(JSON.stringify(projected.evaluation)),evaluation)
  assert.deepEqual(JSON.parse(JSON.stringify(projected.feedback)),feedback)
  assert.equal(projected.attempt_no,2)
  json.evaluation={};json.feedback={}
  const reset=f.store.projectRecord(f.app,'alice',record)
  assert.equal(reset.evaluation,null);assert.equal(reset.feedback,null)
  json.evaluation=evaluation;json.feedback=feedback;f.grants.clear()
  const revoked=f.store.projectRecord(f.app,'alice',record)
  assert.equal(revoked.evaluation,null);assert.equal(revoked.feedback,null)
  assert.equal(revoked.source_access_revoked,true)
 }finally{f.db.close()}
})

test('invalid structured output stays in audit storage but cannot become evidence or replay as success',()=>{
  const f=fixture();try{
    f.envelope.validation={status:'invalid',error:'structured_tool_output_required'}
    f.envelope.usable_as_evidence=false
    const receipt=f.save()
    assert.match(f.store.row(f.app,'alice','run-a',receipt.result_id).payload,/LATE_EVIDENCE/)
    assert.throws(()=>f.store.read(f.app,'alice','run-a',receipt.result_id,{}),{code:'result_output_contract_invalid'})
    assert.equal(f.store.savedAttempt(f.app,'alice','run-a',1,'request-1').toolErr,'structured_tool_output_required')
  }finally{f.db.close()}
})

test('material permissions propagate into copied results and cannot be laundered through Run history',()=>{
  const f=fixture();try{
    f.grants.add('material-a')
    f.scope.materials=['material-a']
    const original=f.save()
    const inherited=f.store.inheritScope(f.app,'alice',[{run_id:'run-a',result_id:original.result_id}])
    assert.ok(inherited.materials.includes('material-a'))
    const direct=f.store.inheritScope(f.app,'alice',[{material_id:'material-a'}])
    assert.ok(direct.materials.includes('material-a'))
    f.grants.delete('material-a')
    assert.throws(()=>f.store.read(f.app,'alice','run-a',original.result_id,{}),{code:'result_source_unavailable'})
    assert.equal(f.store.list(f.app,'alice','run-a').length,0)
  }finally{f.db.close()}
})

test('immutable result keeps late evidence, typed content, provider coverage and redaction',()=>{
  const f=fixture();try{
    const receipt=f.save(), again=f.save()
    assert.equal(receipt.result_id,again.result_id)
    const row=f.store.row(f.app,'alice','run-a',receipt.result_id), stored=JSON.parse(row.payload)
    assert.equal(stored.text,f.envelope.text)
    assert.equal(stored.structuredContent.nested.secret,'[REDACTED]')
    assert.equal(stored.content[0].uri,'fixture://source');assert.equal(stored._meta.truncated,true);assert.equal(stored.redacted,true)
    const part=f.store.read(f.app,'alice','run-a',receipt.result_id,{offset:10000,limit:1000})
    assert.equal(part.run_id,'run-a');assert.equal(part.step_index,1);assert.ok(part.captured_ms>0)
    assert.match(part.text,/LATE_EVIDENCE/);assert.equal(part.has_more,false);assert.equal(part.end,f.envelope.text.length)
    assert.equal(f.store.read(f.app,'alice','run-a',receipt.result_id,{field:'structuredContent',offset:0,limit:10}).encoding,'json_fragment')
    f.envelope.text='overwrite'
    assert.throws(f.save,/result_step_conflict/)
    assert.equal(JSON.parse(f.store.row(f.app,'alice','run-a',receipt.result_id).payload).text,stored.text)
  }finally{f.db.close()}
})
test('recovery binds result to exact request and never treats an id as permission',()=>{
  const f=fixture();try{
    const saved=f.save()
    assert.equal(f.store.savedAttempt(f.app,'alice','run-a',1,'request-1').receipt.result_id,saved.result_id)
    assert.throws(()=>f.store.savedAttempt(f.app,'alice','run-a',1,'changed-request'),/result_request_conflict/)
    assert.throws(()=>f.store.read(f.app,'bob','run-a',saved.result_id),/result_not_found/)
    assert.throws(()=>f.store.read(f.app,'bob','run-b',saved.result_id),/result_not_found/)
    assert.throws(()=>f.store.read(f.app,'','run-a',saved.result_id),/studio_login_required/)
    f.runs.delete('run-a')
    assert.throws(()=>f.store.read(f.app,'alice','run-a',saved.result_id),/result_not_found/)
  }finally{f.db.close()}
})
test('JSON data keys survive without changing object prototypes or hiding structured evidence',()=>{
  const f=fixture();try{
    f.envelope.structuredContent=JSON.parse('{"__proto__":{"polluted":"never"},"constructor":"evidence","prototype":"data"}')
    const receipt=f.save(),stored=JSON.parse(f.store.row(f.app,'alice','run-a',receipt.result_id).payload)
    assert.equal(stored.structuredContent.constructor,'evidence')
    assert.equal(stored.structuredContent.prototype,'data')
    assert.equal(stored.structuredContent.__proto__.polluted,'never')
    assert.equal({}.polluted,undefined)
  }finally{f.db.close()}
})
test('revocation and document deletion invalidate all read forms and archive discovery',()=>{
  const f=fixture();try{
    const {result_id:id}=f.save()
    f.grants.clear()
    assert.throws(()=>f.store.read(f.app,'alice','run-a',id),/result_source_unavailable/)
    assert.equal(f.store.list(f.app,'alice','run-a').length,0)
    assert.throws(()=>f.store.row(f.app,'alice','run-a',id),/result_source_unavailable/)
    const projected=f.store.projectRun(f.app,'alice',{id:'run-a',result:'private fact',checkpoint:{steps:['private']},evaluation:{comment:'private'},config:{memory_hints:['private fact']}})
    assert.equal(projected.result,'');assert.equal(projected.evaluation,null);assert.equal(projected.source_access_revoked,true)
    assert.equal(projected.config,null)
    assert.equal(f.store.projectEvent(f.app,'alice',{run_id:'run-a',content:{output:'private'}}).content.source_access_revoked,true)
    f.grants.add('source-a');f.db.exec("DELETE FROM agent_studio_kb_documents")
    assert.throws(()=>f.store.read(f.app,'alice','run-a',id),/result_source_unavailable/)
  }finally{f.db.close()}
})
test('oversize and invalid ranges fail explicitly without creating truncated evidence',()=>{
  const f=fixture();try{
    const {result_id:id}=f.save()
    for(const range of [{limit:8001},{limit:0},{offset:-1},{offset:0.1},{offset:NaN},{field:'payload; DROP TABLE agent_runs'}])
      assert.throws(()=>f.store.read(f.app,'alice','run-a',id,range),/invalid_result_/)
    assert.throws(()=>f.store.save(f.app,'alice','run-a',2,'fixture',{text:'a'.repeat(f.store.MAX_SERIALIZED)},f.scope,f.sanitize),/result_size_limit/)
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM agent_studio_tool_results').get().n,1)
  }finally{f.db.close()}
})
test('revocation propagates through an injected memory and copied cross-Run results',()=>{
  const f=fixture();try{
    const source=f.save()
    f.runs.set('run-c','alice');f.configs.set('run-c',{memory_injected:[{source_run_id:'run-a'}]})
    const derived=f.store.save(f.app,'alice','run-c',1,'summarize',{text:'Derived private summary'},{},f.sanitize)
    const inherited=f.store.inheritScope(f.app,'alice',[{run_id:'run-c',result_id:derived.result_id},{run_id:'run-c',result_id:derived.result_id}])
    assert.equal(inherited.dependency_runs.length,1,'Repeated citations must not expand lineage exponentially')
    f.runs.set('run-d','alice')
    const copied=f.store.save(f.app,'alice','run-d',1,'result_read',{text:'Copied private summary'},inherited,f.sanitize)
    assert.equal(f.store.read(f.app,'alice','run-a',source.result_id).text.startsWith('x'),true)
    f.grants.clear()
    assert.throws(()=>f.store.read(f.app,'alice','run-c',derived.result_id),/result_source_unavailable/)
    assert.throws(()=>f.store.read(f.app,'alice','run-d',copied.result_id),/result_source_unavailable/)
    assert.equal(f.store.projectMemory(f.app,'alice',{run_id:'run-d',fact:'Copied private summary'}).fact,'')
  }finally{f.db.close()}
})
