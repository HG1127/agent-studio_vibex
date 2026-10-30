// ROOT F07 FLOW JOB ONLY. Actual PG18/Native Cookie/HTTPS/source/RPC/receipt flow.
// No SQL/client/auditor/HTTP response mocks and no direct result/copy insertion.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentTemplateMarketGenuineFixture} from './helpers/agent-template-market-genuine-fixture.mjs'
const root='/api/v2/template-market'
test('F07 actual Native HTTPS template market lifecycle and original outcome boundaries',{concurrency:false,timeout:540000},async t=>{
  if(process.env.AGENT_STUDIO_F07_GENUINE_SUITE!=='flow')throw Error('agent_template_market_flow_suite_required')
  const f=await agentTemplateMarketGenuineFixture()
  const runCase=async(name,body)=>{let failed=false,completed=false,failure;await t.test(name,async()=>{try{await body();completed=true}catch(error){failed=true;failure=error;throw error}});if(failed)throw failure;if(!completed)throw Error('agent_template_market_case_did_not_complete')}
  const ok=async(who,path,body,options)=>{const response=await f.request(who,root+path,body,options);assert.equal(response.status,200,'actual F07 endpoint must succeed');return response.body}
  const pin=item=>({template_id:item.id,revision:item.revision,snapshot_sha256:item.snapshot_sha256})
  const publishPreview=async(name='F07 actual research template')=>{const source=await ok('alice','/sources/'+f.resources.alice.spec.id);return ok('alice','/preview-publish',{action:'preview_publish',source:source.source,name,description:'Synthetic public research plan',category:'research'})}
  const publishBody=preview=>({action:'publish',request_id:randomUUID(),source:preview.source,name:preview.name,description:preview.description,category:preview.category,expected_snapshot_sha256:preview.snapshot_sha256,confirm:true,acknowledgement:'PUBLISH_REVIEWED_AGENT_TEMPLATE'})
  const usePreview=async(id,who='bob',copyName='F07 actual recipient copy')=>{const detail=await ok(who,'/'+id);return ok(who,'/preview-use',{action:'preview_use',template:pin(detail.item),copy_name:copyName})}
  const useBody=preview=>({action:'use',request_id:randomUUID(),template:preview.template,copy_name:preview.name,expected_copy_sha256:preview.copy_sha256,confirm:true})
  let sourceRole,publication,publishedIntent,publishedReceipt,copiedId,secondCopyId
  try{
    await runCase('actual original API login executes real063 predecessor auditor and cannot SELECT private domain tables',async()=>{
      const db=await f.pool.connect()
      try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');assert.equal(await f.audit(db),true);await assert.rejects(db.query('SELECT * FROM agentstudio.agent_template_market_publications'),error=>error.code==='42501')}
      finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
    })
    await runCase('lightweight own options get actual selected private source pin and preserve full saved description capacity',async()=>{
      await f.withHttpSource('alice');await f.withKnowledgeSource('alice')
      const identity=await f.identityFor('alice'),before=await f.agents.get(identity,f.resources.alice.spec.id),{require_approval:_approval,...existing}=before.spec
      const fields={goal:'目'.repeat(3000),task_scope:'域'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('步'.repeat(500)),done_criteria:Array(30).fill('标'.repeat(500))}
      sourceRole=await f.agents.update(identity,before.id,'F07 full native source',{...existing,...fields,require_approval:true,require_plan_review:true},before.revision)
      assert.ok(sourceRole)
      const options=await ok('alice','/sources'),option=options.items.find(item=>item.spec_id===sourceRole.id);assert.ok(option);assert.deepEqual(Object.keys(option).sort(),['spec_id','name','revision'].sort())
      assert.equal(option.revision,sourceRole.revision);assert.equal(JSON.stringify(options).includes('source_sha256'),false)
      const selected=await ok('alice','/sources/'+sourceRole.id);assert.equal(selected.source.spec_id,sourceRole.id);assert.equal(selected.source.revision,sourceRole.revision);assert.match(selected.source.source_sha256,/^[a-f0-9]{64}$/)
      assert.deepEqual(Object.keys(selected).sort(),['name','source']);assert.equal((await f.request('bob',root+'/sources/'+sourceRole.id)).status,404)
      const preview=await publishPreview();for(const key of Object.keys(fields))assert.deepEqual(preview.snapshot.spec[key],fields[key])
      const {require_approval:_a,...spec}=sourceRole.spec;const changed=await f.agents.update(identity,sourceRole.id,sourceRole.name,{...spec,require_approval:true,goal:'新'.repeat(3000)},sourceRole.revision);assert.ok(changed);sourceRole=changed
      const stale=await f.request('alice',root+'/publish',publishBody(preview));assert.equal(stale.status,409)
      await f.assertNoModelEffects()
    })
    await runCase('actual publish self-review intent freezes safe snapshot and actual market/mine/category/search projections',async()=>{
      const preview=await publishPreview();publishedIntent=publishBody(preview);publishedReceipt=await ok('alice','/publish',publishedIntent);publication=publishedReceipt.item
      const detail=await ok('bob','/'+publication.id);assert.equal(detail.is_mine,false);assert.equal(detail.item.source_spec_id,'');assert.equal(detail.snapshot.spec.goal,sourceRole.spec.goal)
      assert.deepEqual(detail.snapshot.spec.knowledge_base_ids,[]);assert.deepEqual(detail.snapshot.spec.quality_checks,[]);assert.equal(detail.snapshot.spec.require_approval,true);assert.equal(detail.snapshot.spec.require_plan_review,true)
      for(const key of ['model_binding','http_tools','mcp_tools','knowledge_retrieval'])assert.equal(Object.hasOwn(detail.snapshot.spec,key),false)
      const publicJSON=JSON.stringify(detail);for(const privateValue of [f.resources.alice.model.id,...sourceRole.spec.knowledge_base_ids,...sourceRole.spec.http_tools.map(tool=>tool.connection_id),'F07-private-document-never-public','F07-private-header-never-public'])assert.equal(publicJSON.includes(privateValue),false,'private source resource cannot become public')
      const market=await ok('bob','/market?category=research&search=F07'),wrong=await ok('bob','/market?category=data&search=F07');assert.ok(market.items.some(item=>item.id===publication.id));assert.equal(wrong.items.some(item=>item.id===publication.id),false)
      const mine=await ok('alice','/mine');assert.ok(mine.items.some(item=>item.id===publication.id));assert.equal((await ok('bob','/mine')).items.some(item=>item.id===publication.id),false)
      await f.assertNoModelEffects()
    })
    await runCase('Bob actual Cookie copy creates one independent recipient-owned Agent and actual045 history/count/receipt',async()=>{
      const preview=await usePreview(publication.id),body=useBody(preview),before=await f.counts(),saved=await ok('bob','/'+publication.id+'/use',body);copiedId=saved.spec_id
      const after=await f.counts();assert.equal(after.agents,before.agents+1);assert.equal(after.receipts,before.receipts+1);assert.equal(after.audit,before.audit+1)
      const agent=await f.agents.get(await f.identityFor('bob'),copiedId);assert.ok(agent);assert.equal(agent.owner_user_id,f.users.bob);assert.equal(agent.revision,1);assert.equal(agent.name,preview.name)
      for(const key of ['goal','task_scope','deliverables','task_plan','done_criteria','tools','require_plan_review'])assert.deepEqual(agent.spec[key],preview.snapshot.spec[key])
      assert.deepEqual(agent.spec.knowledge_base_ids,[]);assert.equal(agent.spec.require_approval,true);for(const key of ['model_binding','http_tools','mcp_tools','knowledge_retrieval','quality_checks'])assert.equal(Object.hasOwn(agent.spec,key),false)
      const history=(await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1 AND spec_id=$2 AND kind='edited' AND spec_revision=1",[f.users.bob,copiedId])).rows[0];assert.equal(history.n,1)
      assert.equal((await f.agents.get(await f.identityFor('alice'),copiedId)),null)
      assert.deepEqual((await ok('bob','/requests/'+body.request_id)).receipt,saved);await f.assertNoModelEffects()
    })
    await runCase('actual unpublish owner-only unlisted detail and republish retain original frozen snapshot',async()=>{
      const prior=await ok('alice','/'+publication.id),snapshot=structuredClone(prior.snapshot),identity=await f.identityFor('alice'),current=await f.agents.get(identity,sourceRole.id),{require_approval:_approval,...spec}=current.spec
      await f.agents.update(identity,current.id,current.name,{...spec,require_approval:true,goal:'Changed source does not rewrite old publication'},current.revision)
      assert.equal((await f.request('bob',root+'/'+publication.id+'/unpublish',{action:'unpublish',request_id:randomUUID(),template:pin(prior.item),confirm:true})).status,404)
      const hidden=await ok('alice','/'+publication.id+'/unpublish',{action:'unpublish',request_id:randomUUID(),template:pin(prior.item),confirm:true});assert.equal(hidden.public,false)
      assert.equal((await f.request('bob',root+'/'+publication.id)).status,404)
      const own=await ok('alice','/'+publication.id);assert.equal(own.item.public,false);assert.equal(own.is_mine,true);assert.deepEqual(own.snapshot,snapshot)
      const visible=await ok('alice','/'+publication.id+'/republish',{action:'republish',request_id:randomUUID(),template:pin(own.item),confirm:true});assert.equal(visible.public,true)
      assert.deepEqual((await ok('bob','/'+publication.id)).snapshot,snapshot);assert.ok(await f.agents.get(await f.identityFor('bob'),copiedId));await f.assertNoModelEffects()
    })
    await runCase('lost actual use ACK preserves original receipt through write opt-out and full-intent conflict',async()=>{
      const preview=await usePreview(publication.id,'bob','F07 actual ACK copy'),body=useBody(preview),before=await f.counts()
      f.mutable.dropNext={method:'POST',path:root+'/'+publication.id+'/use'};await assert.rejects(f.request('bob',root+'/'+publication.id+'/use',body))
      const committed=await f.counts();assert.equal(committed.agents,before.agents+1);assert.equal(committed.receipts,before.receipts+1)
      f.mutable.writes=false
      const recovered=await ok('bob','/requests/'+body.request_id);assert.equal(recovered.status,'recorded');secondCopyId=recovered.receipt.spec_id
      assert.deepEqual(await ok('bob','/'+publication.id+'/use',body),recovered.receipt)
      const changed=await f.request('bob',root+'/'+publication.id+'/use',{...body,copy_name:'SameUUID different full intent'});assert.equal(changed.status,409);assert.equal(changed.body.error,'agent_template_market_request_conflict')
      const newRequest=await f.request('bob',root+'/'+publication.id+'/use',{...body,request_id:randomUUID()});assert.equal(newRequest.status,409);assert.equal(newRequest.body.error,'agent_template_market_writes_disabled')
      assert.deepEqual(await f.counts(),committed)
      f.mutable.writes=true
      const agent=await f.agents.get(await f.identityFor('bob'),secondCopyId),{require_approval:_approval,...spec}=agent.spec;await f.agents.update(await f.identityFor('bob'),agent.id,'Independently edited copy',{...spec,require_approval:true,goal:'Own edited copy'},agent.revision)
      assert.deepEqual((await ok('bob','/requests/'+body.request_id)).receipt,recovered.receipt);await f.assertNoModelEffects()
    })
    await runCase('permanent delete ACK outcome survives physical snapshot removal and never restores independent copies',async()=>{
      const detail=await ok('alice','/'+publication.id),body={action:'delete',request_id:randomUUID(),template:pin(detail.item),confirm:true}
      f.mutable.dropNext={method:'DELETE',path:root+'/'+publication.id};await assert.rejects(f.request('alice',root+'/'+publication.id,body,{method:'DELETE'}))
      f.mutable.writes=false;const original=await ok('alice','/requests/'+body.request_id);assert.equal(original.status,'recorded');assert.equal(original.receipt.deleted,true)
      assert.deepEqual(await ok('alice','/'+publication.id,body,{method:'DELETE'}),original.receipt);f.mutable.writes=true
      const actual=(await f.db.query('SELECT state,name,description,category,source_spec_id,source_sha256 FROM agentstudio.agent_template_market_publications WHERE id=$1',[publication.id])).rows[0];assert.equal(actual.state,'deleted');for(const key of ['name','description','category','source_spec_id','source_sha256'])assert.equal(actual[key],null)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_template_market_snapshots WHERE template_id=$1',[publication.id])).rows[0].n,0)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_template_market_tombstones WHERE template_id=$1',[publication.id])).rows[0].n,1)
      assert.equal((await f.request('bob',root+'/'+publication.id)).status,404)
      assert.equal((await f.request('alice',root+'/'+publication.id+'/republish',{action:'republish',request_id:randomUUID(),template:pin(detail.item),confirm:true})).status,404)
      assert.deepEqual((await ok('alice','/requests/'+publishedIntent.request_id)).receipt,publishedReceipt)
      for(const key of [copiedId,secondCopyId])assert.ok(await f.agents.get(await f.identityFor('bob'),key));await f.assertNoModelEffects()
    })
    await runCase('actual post-business Native disable suppresses old result and new session recovers original outcome only',async()=>{
      const p=await publishPreview('F07 post Native check'),published=await ok('alice','/publish',publishBody(p)),preview=await usePreview(published.item.id),body=useBody(preview)
      f.mutable.afterBusiness=async({operation,input})=>{if(operation==='record'&&input?.request_id===body.request_id){f.mutable.afterBusiness=null;await f.governance('bob',false)}}
      const denied=await f.request('bob',root+'/'+published.item.id+'/use',body);assert.equal(denied.status,401);assert.deepEqual(denied.body,{error:'session_required'})
      await f.governance('bob',true);await f.login('bob')
      const recovered=await ok('bob','/requests/'+body.request_id);assert.equal(recovered.status,'recorded');assert.equal(recovered.receipt.request_id,body.request_id)
      assert.ok(await f.agents.get(await f.identityFor('bob'),recovered.receipt.spec_id));await f.assertNoModelEffects()
    })
  }finally{f.mutable.afterBusiness=null;f.mutable.beforeAuthenticate=null;await f.close()}
})
