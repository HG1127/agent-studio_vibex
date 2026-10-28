// Genuine hosted nonempty queue construction. Static imports are only builtins
// and the original shared capability gate. Importing performs no DB work.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'
const sha=value=>createHash('sha256').update(value).digest('hex')
const quote=value=>'"'+value.replaceAll('"','""')+'"'
export function knowledgeNonemptyBrokerPassword(runId){
 if(typeof runId!=='string'||!/^\d{1,32}$/.test(runId))throw Error('invalid_knowledge_nonempty_ci_run_id')
 return createHash('sha512').update('disposable_knowledge_nonempty_broker:'+runId).digest('hex').slice(0,80)
}
export async function knowledgeNonemptyTcpFixture(capability){
 const target=workerHeartbeatCiAdminOptions(capability,'main') // Before imports.
 const {knowledgeAssessmentTcpFixture}=await import('./knowledge-assessment-claim-admission-ci.mjs')
 const base=await knowledgeAssessmentTcpFixture(capability) // Own fresh service, never an initialized matrix DB.
 let brokerPool,brokerCreated=false
 const brokerLogin='kn_broker_ci_'+process.env.GITHUB_RUN_ID,knownBases=new Set(),knownQueries=new Set()
 try{
  const [scope,indexPolicy,queryPolicy,embeddingModule,consentModule,indexModule,queryModule,baseModule,contentModule,endpoint,consentContract,indexContract,queryContract,indexRole,queryRole,{default:pg},{makeNativeScramVerifier}]=await Promise.all([
   import('../../src/knowledge-scope-policy.ts'),import('../../src/knowledge-index-policy.ts'),import('../../src/knowledge-query-policy.ts'),
   import('../../src/knowledge-embedding-repository.ts'),import('../../src/knowledge-embedding-consent-repository.ts'),
   import('../../src/knowledge-index-repository.ts'),import('../../src/knowledge-query-repository.ts'),
   import('../../src/knowledge-repository.ts'),import('../../src/knowledge-content-repository.ts'),import('../../src/knowledge-embedding-policy.ts'),
   import('../../src/knowledge-embedding-consent-contracts.ts'),import('../../src/knowledge-index-contracts.ts'),import('../../src/knowledge-query-contracts.ts'),
   import('../../src/knowledge-index-role.ts'),import('../../src/knowledge-query-role.ts'),import('pg'),import('../../src/native-activation-cli.mjs'),
  ])
  const apiPool=queryPolicy.scopedKnowledgeQueryPool(indexPolicy.scopedKnowledgeIndexPool(scope.scopedEmbeddingConsentPool(scope.scopedEmbeddingSettingsPool(base.fixture.pool,true),true),true),true)
  assert.equal(apiPool.knowledgeSharing,true);assert.equal(apiPool.knowledgeEmbeddingSettings,true);assert.equal(apiPool.knowledgeEmbeddingConsent,true)
  assert.equal(apiPool.knowledgeIndexRuntime,true);assert.equal(apiPool.knowledgeQueryRuntime,true)
  const identity=base.fixture.identities.alice,owner=base.fixture.users.alice,model=base.fixture.resources.alice.model
  const settings=new embeddingModule.KnowledgeEmbeddingRepository(apiPool,endpoint.embeddingEndpointPolicy({}))
  const consents=new consentModule.KnowledgeEmbeddingConsentRepository(apiPool),index=new indexModule.KnowledgeIndexRepository(apiPool)
  const queries=new queryModule.KnowledgeQueryRepository(apiPool),bases=new baseModule.KnowledgeBaseRepository(apiPool),content=new contentModule.KnowledgeContentRepository(apiPool)
  await settings.change(identity,{action:'configure',request_id:randomUUID(),expected_revision:0,connection_id:model.id,connection_revision:model.revision,model_name:'synthetic',base_url:'https://api.openai.com/v1'})
  const before=await consents.get(identity)
  await consents.change(identity,{action:'grant',request_id:randomUUID(),expected_revision:before.revision,profile_id:before.profile_id,profile_revision:before.profile_revision,index_enabled:true,query_enabled:true,acknowledgement:consentContract.EMBEDDING_CHARGE_ACKNOWLEDGEMENT})
  const consent=await consents.get(identity)
  const activation=await index.authorize(identity,{request_id:randomUUID(),profile_id:consent.profile_id,profile_revision:consent.profile_revision,expected_consent_revision:consent.revision,acknowledgement:indexContract.INDEX_START_ACKNOWLEDGEMENT})
  assert.equal(activation.item.authorized,true)
  assert.match(brokerLogin,/^kn_broker_ci_[0-9]{1,32}$/)
  const brokerPassword=knowledgeNonemptyBrokerPassword(process.env.GITHUB_RUN_ID),installer=await base.admin.connect()
  try{
   await installer.query('BEGIN');await installer.query("SET LOCAL password_encryption='scram-sha-256'")
   await installer.query('CREATE ROLE '+quote(brokerLogin)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2 PASSWORD '"+makeNativeScramVerifier(brokerPassword)+"'")
   await installer.query('GRANT agentstudio_knowledge_index_broker TO '+quote(brokerLogin)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
   await installer.query('COMMIT');brokerCreated=true
  }catch(error){await installer.query('ROLLBACK').catch(()=>{});throw Error('knowledge_nonempty_broker_login_setup_failed')}
  finally{installer.release()}
  brokerPool=new pg.Pool({...target,user:brokerLogin,password:brokerPassword,max:2,application_name:'knowledge_nonempty_broker_ci'})
  const verifyBroker=async db=>{
   const row=(await db.query("SELECT session_user::text AS login,current_user::text AS role,r.rolcanlogin AS enabled,r.rolinherit AS inherit,r.rolsuper AS super,r.rolbypassrls AS bypass,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolreplication AS replication,r.rolconnlimit AS limit,r.rolconfig IS NULL AS no_config,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_roles p WHERE p.rolname<>session_user AND pg_has_role(session_user,p.oid,'MEMBER') ORDER BY p.rolname) AS reachable,(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS direct,(SELECT bool_and(NOT m.admin_option AND NOT m.inherit_option AND m.set_option) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS grant_options FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
   assert.equal(row.login,brokerLogin);assert.equal(row.role,brokerLogin);assert.equal(row.enabled,true)
   for(const key of ['inherit','super','bypass','createdb','createrole','replication'])assert.equal(row[key],false,key)
   assert.equal(row.limit,2);assert.equal(row.no_config,true);assert.equal(row.direct,1);assert.equal(row.grant_options,true);assert.deepEqual(row.reachable,['agentstudio_knowledge_index_broker'])
  }
  const brokerPoolFor=lane=>({knowledgeIndexRuntime:lane==='index',knowledgeQueryRuntime:lane==='query',knowledgeSharing:false,knowledgeToolRuntime:false,async connect(){const db=await brokerPool.connect();try{await verifyBroker(db);return db}catch(error){db.release(true);throw error}}})
  const broker=async(lane,name,claim)=>{
   assert.ok(['index','query'].includes(lane));assert.ok(['reserve','recheck','finish'].includes(name))
   const helper=lane==='index'?indexRole.withKnowledgeIndexRole:queryRole.withKnowledgeQueryRole
   return helper(brokerPoolFor(lane),'broker',async db=>{
    const row=(await db.query("SELECT session_user::text AS login,current_user::text AS role,current_setting('lock_timeout') AS lock_timeout,current_setting('statement_timeout') AS statement_timeout")).rows[0]
    assert.equal(row.login,brokerLogin);assert.equal(row.role,'agentstudio_knowledge_index_broker');assert.equal(row.lock_timeout,'3s');assert.equal(row.statement_timeout,'5s')
    const suffix=name==='finish'?',NULL::jsonb':''
    return (await db.query('SELECT agentstudio.knowledge_'+lane+'_'+name+'($1::uuid,$2::uuid,$3::text'+suffix+') AS value',[claim.attempt_id,claim.worker_id,claim.lease_token])).rows[0].value
   })
  }
  const seed=async lane=>{
   assert.ok(['index','query'].includes(lane))
   const foreign=(await base.admin.query("SELECT count(*)::integer AS n FROM agentstudio.knowledge_embedding_queue WHERE owner_user_id<>$1 OR base_id<>ALL($2::uuid[])",[owner,[...knownBases]])).rows[0]
   assert.equal(foreign.n,0,'no unexpected queue may be adopted')
   const created=await bases.create(identity,'Synthetic nonempty '+lane+' claim','Disposable owner-only CI input'),baseId=created.id
   knownBases.add(baseId)
   await content.importParsed(identity,baseId,randomUUID(),{filename:'synthetic-claim.txt',mime_type:'text/plain',text:'Synthetic owner evidence CLAIM_ONLY '+randomUUID()})
   const chunks=(await base.admin.query("SELECT c.id,c.document_id,encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AS sha256 FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id WHERE d.base_id=$1 AND c.owner_user_id=$2 AND d.status='indexed' ORDER BY c.chunk_index,c.id",[baseId,owner])).rows
   assert.equal(chunks.length,1)
   const c=await consents.get(identity)
   assert.equal(c.profile_id,consent.profile_id);assert.equal(c.profile_revision,consent.profile_revision);assert.equal(c.revision,consent.revision)
   const s={lane,owner,base:baseId,chunk:chunks[0].id,chunk_sha256:chunks[0].sha256,profile_id:c.profile_id,profile_revision:c.profile_revision,consent_revision:c.revision}
   if(lane==='index'){
    const row=(await base.admin.query('SELECT q.profile_revision::text,agentstudio.knowledge_index_current(q.owner_user_id,$3::uuid,q.profile_revision,$4::bigint) AS current FROM agentstudio.knowledge_embedding_queue q WHERE q.owner_user_id=$1 AND q.base_id=$2',[owner,baseId,c.profile_id,c.revision])).rows[0]
    assert.equal(Number(row.profile_revision),c.profile_revision);assert.equal(row.current,true)
   }else{
    // Explicit guarded-admin synthetic fixture input, never provider output.
    // No queue/receipt digest or fence is invented: original submit builds it.
    const dimensions=(await base.admin.query('UPDATE agentstudio.knowledge_embedding_profiles SET dimensions=2 WHERE owner_user_id=$1 AND configuration_id=$2 AND revision=$3 AND (dimensions IS NULL OR dimensions=2) RETURNING configuration_id,revision::text,dimensions',[owner,c.profile_id,c.profile_revision])).rows
    assert.equal(dimensions.length,1);assert.equal(dimensions[0].configuration_id,c.profile_id);assert.equal(Number(dimensions[0].revision),c.profile_revision)
    const vector=await base.admin.query("INSERT INTO agentstudio.knowledge_embedding_vectors(chunk_id,owner_user_id,profile_revision,chunk_sha256,embedding) SELECT c.id,c.owner_user_id,$3,encode(sha256(convert_to(c.text_content,'UTF8')),'hex'),'[1,0]'::public.vector FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id WHERE d.base_id=$1 AND c.owner_user_id=$2",[baseId,owner,c.profile_revision])
    assert.equal(vector.rowCount,1)
    const request=randomUUID()
    const receipt=await queries.submit(identity,{request_id:request,base_ids:[baseId],query:'Synthetic owner evidence',mode:'semantic',limit:1,profile_id:c.profile_id,profile_revision:c.profile_revision,consent_revision:c.revision,acknowledgement:queryContract.QUERY_CHARGE_ACKNOWLEDGEMENT})
    assert.equal(receipt.replayed,false);assert.equal(receipt.item.status,'prepared')
    const rows=(await base.admin.query("SELECT id,request_sha256,execution_source,encode(sha256(convert_to(jsonb_build_array(base_ids,query_text,requested_mode,requested_limit,profile_id,profile_revision,consent_revision,$3::text)::text,'UTF8')),'hex') AS recomputed FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=$1 AND request_id=$2",[owner,request,queryContract.QUERY_CHARGE_ACKNOWLEDGEMENT])).rows
    assert.equal(rows.length,1);assert.equal(rows[0].request_sha256,rows[0].recomputed);assert.equal(rows[0].execution_source,null)
    s.query=rows[0].id;s.request=request;s.request_sha256=rows[0].request_sha256;knownQueries.add(s.query)
   }
   return s
  }
  const state=async s=>{
   if(s.lane==='index')return (await base.admin.query("SELECT a.id,a.status,a.worker_id::text,a.token_sha256,a.lease_until,clock_timestamp() AS db_now,a.owner_user_id,a.profile_id,a.profile_revision::text,a.consent_revision::text,a.chunk_count,agentstudio.knowledge_index_valid(a.id) AS current,(SELECT count(*)::integer FROM agentstudio.knowledge_index_attempt_chunks x WHERE x.attempt_id=a.id AND x.chunk_id=$3 AND x.chunk_sha256=$4 AND x.profile_id=a.profile_id AND x.consent_revision=a.consent_revision AND x.reserved) AS bound_chunks FROM agentstudio.knowledge_index_attempts a WHERE a.owner_user_id=$1 AND a.base_id=$2 ORDER BY a.created_at,a.id",[owner,s.base,s.chunk,s.chunk_sha256])).rows
   return (await base.admin.query('SELECT id,status,worker_id::text,token_sha256,lease_until,clock_timestamp() AS db_now,reader_user_id,profile_id,profile_revision::text,consent_revision::text,request_sha256,scope_fence,dispatch_started_at,failure_reason FROM agentstudio.knowledge_query_jobs WHERE id=$1 AND reader_user_id=$2',[s.query,owner])).rows
  }
  const assertClaim=async(s,claim)=>{
   assert.match(claim.lease_token,/^[a-f0-9]{64}$/)
   const rows=await state(s);assert.equal(rows.length,1);const row=rows[0]
   assert.equal(row.id,claim.attempt_id);assert.equal(row.worker_id,claim.worker_id);assert.equal(row.token_sha256,sha(claim.lease_token));assert.equal(row.status,'prepared')
   assert.equal(row.profile_id,s.profile_id);assert.equal(Number(row.profile_revision),s.profile_revision);assert.equal(Number(row.consent_revision),s.consent_revision)
   const remaining=new Date(row.lease_until).getTime()-new Date(row.db_now).getTime();assert.ok(remaining>0&&remaining<=45000,'original live45s lease from actual DB clock')
   if(s.lane==='index'){assert.equal(row.owner_user_id,owner);assert.equal(row.current,true);assert.equal(row.bound_chunks,1);assert.equal(row.chunk_count,1)}
   else{assert.equal(row.reader_user_id,owner);assert.equal(row.request_sha256,s.request_sha256);assert.equal(row.scope_fence[0].owner_id,owner);assert.equal(row.scope_fence[0].base_id,s.base);assert.equal(row.scope_fence[0].role,'owner')}
   return row
  }
  const unchanged=async s=>{const rows=await state(s);if(s.lane==='index')assert.deepEqual(rows,[]);else{assert.equal(rows.length,1);assert.equal(rows[0].worker_id,null);assert.equal(rows[0].token_sha256,null);assert.equal(rows[0].lease_until,null);assert.equal(rows[0].status,'prepared')}}
  const locked=async(s,expected=true)=>{
   const db=await base.admin.connect()
   try{
    await db.query('BEGIN')
    const sql=s.lane==='index'?'SELECT owner_user_id FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=$1 FOR UPDATE NOWAIT':'SELECT id FROM agentstudio.knowledge_query_jobs WHERE id=$1 AND reader_user_id=$2 FOR UPDATE NOWAIT'
    const values=s.lane==='index'?[owner]:[s.query,owner],request=db.query(sql,values)
    if(expected)await assert.rejects(request,error=>error.code==='55P03');else assert.equal((await request).rows.length,1)
   }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  }
  const waitLeaseExpired=async(s,claim)=>{
   const until=Date.now()+55000
   while(Date.now()<until){const rows=await state(s);assert.equal(rows.length,1);const row=rows[0];assert.equal(row.token_sha256,sha(claim.lease_token));if(new Date(row.db_now).getTime()>=new Date(row.lease_until).getTime())return;await new Promise(done=>setTimeout(done,200))}
   throw Error('knowledge_nonempty_original_clock_not_expired')
  }
  const cleanup=async s=>{
   if(!s)return;assert.equal(s.owner,owner);assert.ok(knownBases.has(s.base))
   if(s.lane==='query'){
    assert.ok(knownQueries.has(s.query))
    // Disposal AFTER assertions only; no expiry/rollback/provider evidence.
    // Never change unknown/terminal outcomes, tokens, owner, fences or TTL.
    await base.admin.query("UPDATE agentstudio.knowledge_query_jobs SET status='rejected',failure_reason='synthetic_fixture_cleanup' WHERE id=$1 AND reader_user_id=$2 AND status='prepared'",[s.query,owner])
   }
   await base.admin.query('DELETE FROM agentstudio.knowledge_bases WHERE id=$1 AND owner_user_id=$2',[s.base,owner]);knownBases.delete(s.base)
   // Original attempts/query receipts and immutable audit history are retained.
  }
  const privateToOwner=async s=>assert.equal(await bases.get(base.fixture.identities.bob,s.base),null)
  const invalidateByOriginalApi=async s=>{
   if(s.lane==='index'){
    const docs=await content.documents(identity,s.base);assert.equal(docs.length,1)
    await content.delete(identity,s.base,randomUUID(),docs[0].id,docs[0].sha256)
   }else{
    const current=await bases.get(identity,s.base);assert.ok(current)
    const updated=await bases.update(identity,s.base,current.name+' changed',current.description,Number(current.revision))
    assert.ok(updated);assert.equal(Number(updated.revision),Number(current.revision)+1)
   }
  }
  await base.full()
  return {...base,seed,state,assertClaim,unchanged,locked,waitLeaseExpired,cleanup,broker,privateToOwner,invalidateByOriginalApi,verifyBroker,brokerLogin,brokerPool,consent,
   async close(){try{await brokerPool.end();if(brokerCreated)await base.admin.query('DROP ROLE '+quote(brokerLogin))}finally{await base.close()}},
  }
 }catch(error){await brokerPool?.end().catch(()=>{});if(brokerCreated)await base.admin.query('DROP ROLE '+quote(brokerLogin)).catch(()=>{});await base.close();throw error}
}
