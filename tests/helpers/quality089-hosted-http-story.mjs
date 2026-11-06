
import {randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
export async function quality089HostedHttpStory(f){
 const base='/api/v2/original-ui/agent-quality/'+f.specId,{qualityWriteCanonical,qualityPendingFor,parseOriginalQualityReceipt,originalAgentQualityProtocol}=f.qualityContract
 const read=await f.request('alice',base);assert.equal(read.status,200);assert.equal(read.body.item.state,'missing');assert.equal(read.body.item.checks,null)
 const write=(r,checks)=>({request_id:randomUUID(),expected_spec_revision:r.spec_revision,expected_source_sha256:r.source_sha256,expected_checks_sha256:r.checks_sha256,checks})
 const save=async choice=>{const reply=await f.request('alice',base,'POST',choice);assert.equal(reply.status,200);const hash=createHash('sha256').update(qualityWriteCanonical(f.employeeId,f.specId,choice)).digest('hex'),pending=qualityPendingFor(f.employeeId,f.specId,choice,hash),receipt=parseOriginalQualityReceipt(reply.body.item,pending);await f.assertQualityReceiptAndOwnerAudit(receipt);return {receipt,pending}}
 const explicit=await save(write(read.body.item,[]));assert.equal(explicit.receipt.after.state,'configured');assert.deepEqual(explicit.receipt.after.checks,[])
 const literals=[{type:'contains',expected:' exact literal \u00a0😀 '},{type:'not_contains',expected:' forbidden literal '},{type:'json_object',expected:''}],choice=write(explicit.receipt.after,literals),saved=await save(choice);assert.deepEqual(saved.receipt.after.checks,literals)
 // Actual PG canonicalizers must agree with the exact JS protocol, including UTF-16.
 const sql=(await f.db.query('SELECT agentstudio.quality089_request_sha($1,$2,$3,$4,$5,$6,$7::jsonb) AS hash',[f.employeeId,f.specId,choice.request_id,choice.expected_spec_revision,choice.expected_source_sha256,choice.expected_checks_sha256,JSON.stringify(choice.checks)])).rows;assert.equal(sql[0].hash,saved.pending.request_sha256)
 const before=await f.counts(),replay=await f.request('alice',base,'POST',choice);assert.equal(replay.status,200);assert.deepEqual(replay.body.item,saved.receipt);assert.deepEqual(await f.counts(),before)
 const changed=await f.request('alice',base,'POST',{...choice,checks:[]});assert.equal(changed.status,409);assert.deepEqual(await f.counts(),before)
 const stale=await f.request('alice',base,'POST',{...choice,request_id:randomUUID()});assert.equal(stale.status,409);assert.deepEqual(await f.counts(),before)
 for(const [name,who,expected,headers,status]of [
  ['foreign owner','bob',f.users.bob,{},404],['expected employee','alice',f.users.bob,{},409],['arbitrary rh','alice',f.employeeId,{'X-Rh-User-Id':f.employeeId},400],
 ]){const r=await f.request(who,base,'GET',undefined,expected,headers);assert.equal(r.status,status,name);assert.deepEqual(await f.counts(),before)}
 for(const [name,body,headers,status]of [
  ['missing CSRF',write(saved.receipt.after,[]),{'X-AgentStudio-Request':''},403],
  ['duplicate key','{"request_id":"'+randomUUID()+'","request_id":"'+randomUUID()+'","expected_spec_revision":'+saved.receipt.after.spec_revision+',"expected_source_sha256":"'+saved.receipt.after.source_sha256+'","expected_checks_sha256":"'+saved.receipt.after.checks_sha256+'","checks":[]}',{},400],
  ['invalid full set',write(saved.receipt.after,[{type:'contains',expected:'ok'},{type:'unknown',expected:'bad'}]),{},400],
  ['extra owner',{...write(saved.receipt.after,[]),owner_user_id:f.employeeId},{},400]
 ]){const r=await f.request('alice',base,'POST',body,f.employeeId,headers);assert.equal(r.status,status,name);assert.deepEqual(await f.counts(),before)}
 const team=await f.proveTeamBoundary();assert.equal(team.actual_same_team_membership,true)
 const p=saved.pending,query=new URLSearchParams({request_sha256:p.request_sha256,expected_spec_revision:String(p.expected_spec_revision),expected_source_sha256:p.expected_source_sha256,expected_checks_sha256:p.expected_checks_sha256??'null'}),receiptPath=base+'/receipts/'+p.request_id+'?'+query
 const found=await f.request('alice',receiptPath);assert.equal(found.status,200);assert.deepEqual(found.body.item,saved.receipt);assert.deepEqual(await f.counts(),before)
 assert.equal((await f.request('bob',receiptPath)).status,404)
 assert.equal((await f.request('alice',base+'/receipts/'+randomUUID()+'?'+query)).status,404)
 assert.deepEqual(await f.counts(),before)
 await f.assertIndependentQuality089Profile()
 // Committed catalog tamper is visible on an independent actual API LOGIN.
 await f.db.query('ALTER ROLE agentstudio_quality089 INHERIT')
 try{await assert.rejects(()=>f.assertIndependentQuality089Profile())}finally{await f.db.query('ALTER ROLE agentstudio_quality089 NOINHERIT')}
 await f.assertIndependentQuality089Profile()
 return {actual_PG18:true,actual_original_API_LOGIN:true,actual_Cookie_CSRF_ExpectedEmployee:true,whole_catalog_and_ledger:true,exact_full_literal_rules:true,missing_distinct_from_explicit_empty:true,actual_SQL_JS_request_hash_equal:true,exact_replay_no_write:true,CAS409_no_write:true,owner_and_same_team_denied:true,duplicate_key_refused:true,GET_exact_receipt_no_write:true,catalog_tamper_refused:true,publication_or_Worker_claim:false,production_GO:false}
}
