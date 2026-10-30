// ROOT-HOSTED ONLY. Actual PG18/Cookie/HTTP/mTLS/key/provider/save positive.
// No fakeSqlClient, forged identity, metadata override or direct result insert.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentDesignGenuineFixture} from './helpers/agent-design-genuine-fixture.mjs'

const refused=response=>assert.ok(response.status>=400,'request must be refused')
const noPrivate=value=>assert.doesNotMatch(JSON.stringify(value),/api_key|ciphertext|lease_token|owner_user_id|"messages"|"choice"|"result"/)
test('F01 real PG18 vertical design, independent save, source authority and one-use failure boundaries',{concurrency:false,timeout:540000},async t=>{
  const f=await agentDesignGenuineFixture()
  let generated
  // node:test records a child failure without rejecting t.test(). Stop the
  // dependent flow here so absent earlier results cannot create false cascades.
  const runCase=async(name,body)=>{
    let completed=false,failure
    await t.test(name,async()=>{try{await body();completed=true}catch(error){failure=error;throw error}})
    if(!completed)throw failure??Error('agent_design_genuine_child_did_not_complete:'+name)
  }
  const actualCount=async p=>f.record(p.owner,p.request_id)
  const finish=async(p)=>{await f.submit(p);const start=f.providerRequests.length,reply=await f.tick();assert.equal(reply.request_id,p.request_id);assert.equal(reply.state,'succeeded');assert.equal(f.providerRequests.length,start+1);const result=await f.request(p.who,'/api/v2/agent-design/requests/'+p.request_id);assert.equal(result.status,200);assert.equal(result.body.result_status,'available');return result.body}
  const clearOld=async p=>{await f.wireControl(p.who,p.request_id,'cancel')}
  try{
    await runCase('actual dedicated Worker/dispatch sessions and strict062 auditor authorize only their fixed RPCs',async()=>{
      for(const [pool,role,login] of [[f.workerPool,'agentstudio_design_worker','synthetic_design_worker'],[f.dispatchPool,'agentstudio_design_dispatch','synthetic_design_dispatch']]){
        const db=await pool.connect();try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE '+role);assert.equal(await f.audit(db),true);const row=(await db.query('SELECT current_user AS role,session_user AS login')).rows[0];assert.deepEqual(row,{role,login});await assert.rejects(()=>db.query('SELECT * FROM agentstudio.agent_design_inputs'),e=>e.code==='42501')}finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
      }
      const db=await f.workerPool.connect();try{await db.query('BEGIN');await db.query('SET LOCAL ROLE agentstudio_design_worker');await assert.rejects(()=>db.query('SELECT agentstudio.agent_design_reserve($1::uuid,$2::uuid,1,$3::uuid)',[randomUUID(),randomUUID(),randomUUID()]),e=>e.code==='42501')}finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
    })
    await runCase('actual CookieBob plus original-Home expectedAlice refuses six write and confirmation paths before any ledger change',async()=>{
      const p=await f.createDesign('bob','generate'),before=await f.counts(),posts=f.providerRequests.length,reads=f.credentialReads()
      const hash='a'.repeat(64),control={action:'cancel',request_id:randomUUID(),design_request_id:p.request_id,confirm:true}
      const intent={action:'save',request_id:randomUUID(),design_request_id:p.request_id,expected_preview_sha256:hash,expected_result_sha256:hash,expected_source_sha256:hash,expected_candidate_sha256:hash,confirm:true,save_acknowledgement:'APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1'}
      const preview={action:'preview_save',design_request_id:p.request_id,expected_result_sha256:hash,fields:{name:'Negative case only',goal:'Never written',task_scope:'No mutation',deliverables:[],task_plan:[],done_criteria:[]}}
      for(const [route,body]of [['submit',p.body],['confirm',p.body],['control',control],['confirm-control',control],['save',{intent,preview}],['confirm-save',intent]]){
        const response=await f.request('bob','/api/v2/agent-design/'+route,body,{headers:{'X-AgentStudio-Expected-Employee':f.users.alice}})
        assert.equal(response.status,409);assert.equal(response.body.error,'agent_design_employee_changed')
        assert.deepEqual(await f.counts(),before);assert.equal(f.providerRequests.length,posts);assert.equal(f.credentialReads(),reads)
      }
    })
    await runCase('real Native Cookie preview -> explicit fee -> metadata claim -> mTLS reserve -> actual key -> one TLS POST -> full result -> editable atomic save',async()=>{
      const before=await f.counts(),p=await f.createDesign('alice','generate');assert.equal((await f.counts()).requests,before.requests);assert.equal(f.providerRequests.length,0)
      generated=p;await f.submit(p);const repeat=await f.request('alice','/api/v2/agent-design/submit',p.body);assert.equal(repeat.status,200);assert.equal(repeat.body.replayed,true)
      assert.equal(f.providerRequests.length,0);const reply=await f.tick();assert.equal(reply.state,'succeeded');assert.equal(f.providerRequests.length,1);assert.equal(f.credentialReads(),1)
      assert.deepEqual(Object.keys(f.proofs.at(-1)).sort(),['lease_token','lease_version','protocol','request_id','worker_id']);noPrivate(reply)
      const s=await f.savePreview(p,{name:'F01 explicitly edited name',goal:'Explicit edited goal',task_scope:'Explicit edited scope',deliverables:['Edited full deliverable'],task_plan:['Edited full plan'],done_criteria:['Edited full criterion']})
      assert.deepEqual(s.preview.candidate.spec.tools,[]);assert.deepEqual(s.preview.candidate.spec.knowledge_base_ids,[]);assert.equal(Object.hasOwn(s.preview.candidate.spec,'model_binding'),false)
      assert.equal((await f.counts()).saves,before.saves);const body=f.saveBody(p,s),save=await f.request('alice','/api/v2/agent-design/save',body);assert.equal(save.status,200)
      const saved=await f.agents.get(await f.identityFor('alice'),save.body.spec_id);assert.equal(saved.name,s.preview.fields.name);assert.deepEqual(saved.spec,s.preview.candidate.spec);assert.equal(saved.revision,1)
      const history=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1 AND spec_id=$2 AND spec_revision=1',[p.owner,saved.id])).rows[0].n;assert.ok(history>=1)
      const after=await f.counts();assert.equal(after.saves,before.saves+1);assert.equal(after.agents,before.agents+1);assert.equal(after.runs,before.runs);assert.equal(after.old_effects,before.old_effects)
      f.mutable.saves=false;f.mutable.submissions=false
      const confirmation=await f.request('alice','/api/v2/agent-design/confirm-save',body.intent);assert.equal(confirmation.status,200);assert.equal(confirmation.body.replayed,true)
      const repeated=await f.request('alice','/api/v2/agent-design/save',body);assert.equal(repeated.status,200);assert.equal(repeated.body.replayed,true);assert.deepEqual(await f.counts(),after);assert.equal(f.providerRequests.length,1)
      f.mutable.saves=true;f.mutable.submissions=true
    })
    await runCase('cross-Owner Cookie, model/source refs and private-table grants cannot read/admit the other employee',async()=>{
      refused(await f.request('bob','/api/v2/agent-design/requests/'+generated.request_id))
      refused(await f.request('bob','/api/v2/agent-design/sources/'+f.resources.alice.spec.id))
      const p=await f.createDesign('bob','generate'),before=await f.counts()
      const forged={...p.body,model_binding:f.resources.alice.binding};refused(await f.request('bob','/api/v2/agent-design/submit',forged));assert.deepEqual(await f.counts(),before)
      const cookieHeader=await f.request('bob','/api/v2/agent-design/requests/'+generated.request_id,undefined,{headers:{'X-Rh-User-Id':f.users.alice}});assert.equal(cookieHeader.status,403)
    })
    await runCase('same request UUID belongs to separate actual Owners and actual lease/credential/result scopes',async()=>{
      const requestId=randomUUID(),a=await f.createDesign('alice','generate',{requestId}),b=await f.createDesign('bob','generate',{requestId}),posts=f.providerRequests.length
      await f.submit(a);await f.submit(b);await f.tick();await f.tick();assert.equal(f.providerRequests.length,posts+2)
      const alice=await f.request('alice','/api/v2/agent-design/requests/'+requestId),bob=await f.request('bob','/api/v2/agent-design/requests/'+requestId)
      assert.equal(alice.body.result.result.name,f.output('alice').name);assert.equal(bob.body.result.result.name,f.output('bob').name);assert.notEqual(alice.body.result.result_sha256,bob.body.result.result_sha256)
      const leases=(await f.db.query('SELECT owner_user_id,lease_token FROM agentstudio.agent_design_jobs WHERE request_id=$1',[requestId])).rows;assert.equal(leases.length,2);assert.equal(new Set(leases.map(r=>r.lease_token)).size,2);assert.equal((await actualCount(a)).outputs,1);assert.equal((await actualCount(b)).outputs,1)
    })
    await runCase('real transitive role pollution is refused before a claim and restored without another effect',async()=>{
      const before=await f.counts(),posts=f.providerRequests.length
      await f.db.exec('GRANT agentstudio_review_worker TO synthetic_design_worker WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
      try{await assert.rejects(()=>f.tick());assert.deepEqual(await f.counts(),before);assert.equal(f.providerRequests.length,posts)}finally{await f.db.exec('REVOKE agentstudio_review_worker FROM synthetic_design_worker')}
    })
    await runCase('submit response loss preserves exact original receipt before submission opt-out, with one paid effect',async()=>{
      const p=await f.createDesign('alice','generate'),before=await f.counts(),posts=f.providerRequests.length;f.mutable.dropSubmit=true
      await assert.rejects(()=>f.request('alice','/api/v2/agent-design/submit',p.body));assert.equal((await actualCount(p)).request_id,p.request_id)
      f.mutable.submissions=false;const recovered=await f.request('alice','/api/v2/agent-design/confirm',p.body);assert.equal(recovered.status,200);assert.equal(recovered.body.replayed,true)
      const old=await f.request('alice','/api/v2/agent-design/submit',p.body);assert.equal(old.status,200);assert.equal(old.body.replayed,true);f.mutable.submissions=true
      assert.equal((await f.counts()).requests,before.requests+1);assert.equal((await f.tick()).state,'succeeded');assert.equal(f.providerRequests.length,posts+1)
    })
    await runCase('actual revise result changes only edited six fields and preserves resource/model/approval bindings',async()=>{
      const resource=await f.withResource('alice'),before=await f.agents.get(await f.identityFor('alice'),resource.role.id),p=await f.createDesign('alice','revise',{specId:resource.role.id});await finish(p)
      const s=await f.savePreview(p,{name:'F01 revised name',goal:'F01 revised goal'}),saved=await f.request('alice','/api/v2/agent-design/save',f.saveBody(p,s));assert.equal(saved.status,200)
      const after=await f.agents.get(await f.identityFor('alice'),resource.role.id);assert.equal(after.revision,before.revision+1)
      for(const key of ['tools','http_tools','knowledge_base_ids','model_binding','require_approval','require_plan_review'])assert.deepEqual(after.spec[key],before.spec[key])
      const h=(await f.db.query('SELECT kind,spec_revision FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1 AND spec_id=$2 AND spec_revision IN($3,$4)',[p.owner,before.id,before.revision,after.revision])).rows
      assert.ok(h.some(r=>r.kind==='before_edit'&&Number(r.spec_revision)===before.revision));assert.ok(h.some(r=>r.kind==='edited'&&Number(r.spec_revision)===after.revision))
    })
    await runCase('save response loss recovers independent immutable receipt after source erase and save opt-out',async()=>{
      const p=await f.createDesign('alice','generate');await finish(p);const s=await f.savePreview(p),body=f.saveBody(p,s),before=await f.counts();f.mutable.dropSave=true
      await assert.rejects(()=>f.request('alice','/api/v2/agent-design/save',body));const after=await f.counts();assert.equal(after.saves,before.saves+1);assert.equal(after.agents,before.agents+1)
      await f.wireControl('alice',p.request_id,'erase');f.mutable.saves=false
      const recovered=await f.request('alice','/api/v2/agent-design/confirm-save',body.intent);assert.equal(recovered.status,200);assert.equal(recovered.body.replayed,true)
      const repeated=await f.request('alice','/api/v2/agent-design/save',body);assert.equal(repeated.status,200);assert.equal(repeated.body.replayed,true)
      assert.equal((await f.counts()).agents,after.agents);assert.equal((await f.counts()).saves,after.saves);f.mutable.saves=true
    })
    await runCase('cancel/erase before actual reserve and after real provider POST suppress output and never resend',async()=>{
      for(const phase of ['before','after'])for(const action of ['cancel','erase']){
        const p=await f.createDesign('alice','generate');await f.submit(p);const posts=f.providerRequests.length
        if(phase==='before')f.mutable.beforeDispatch=async()=>{await f.wireControl('alice',p.request_id,action)}
        else f.mutable.afterPost=async()=>{await f.wireControl('alice',p.request_id,action)}
        try{await f.tick()}finally{f.mutable.beforeDispatch=null;f.mutable.afterPost=null}
        const row=await actualCount(p);assert.equal(row.outputs,0);assert.equal(row.tombstones,1);assert.equal(row.reservations,phase==='before'?0:1);assert.equal(f.providerRequests.length,posts+(phase==='after'?1:0))
        const view=await f.request('alice','/api/v2/agent-design/requests/'+p.request_id);assert.equal(view.status,200);assert.notEqual(view.body.result_status,'available');await f.tick();assert.equal(f.providerRequests.length,posts+(phase==='after'?1:0))
      }
    })
    await runCase('actual Native disable and governance ABA invalidate old jobs, including after a real POST',async()=>{
      for(const afterPost of [false,true]){
        const p=await f.createDesign('bob','generate');await f.submit(p);const posts=f.providerRequests.length
        const change=async()=>{await f.governance('bob',false);await f.governance('bob',true);await f.login('bob')}
        if(afterPost)f.mutable.afterPost=change;else await change()
        try{await f.tick()}finally{f.mutable.afterPost=null}
        const row=await actualCount(p);assert.equal(row.outputs,0);assert.equal(f.providerRequests.length,posts+(afterPost?1:0));await clearOld(p)
      }
    })
    await runCase('actual model/source revision or encrypted-envelope ABA change blocks old reservation/result',async()=>{
      for(const kind of ['model_revision','model_envelope','source_revision']){
        const p=await f.createDesign('alice',kind==='source_revision'?'revise':'generate');await f.submit(p);const posts=f.providerRequests.length
        if(kind==='model_revision'){const id=f.resources.alice.binding.connection_id;await f.db.query('UPDATE agentstudio.model_connections SET revision=revision+1 WHERE id=$1',[id]);await f.tick();await f.db.query('UPDATE agentstudio.model_connections SET revision=revision-1 WHERE id=$1',[id])}
        else if(kind==='model_envelope'){const id=f.resources.alice.binding.connection_id;for(let i=0;i<2;i++)await f.db.query('UPDATE agentstudio.model_connections SET api_key_tag=set_byte(api_key_tag,0,get_byte(api_key_tag,0)#1) WHERE id=$1',[id]);await f.tick()}
        else{const identity=await f.identityFor('alice'),role=await f.agents.get(identity,p.choice.source.spec_id),{require_approval:_a,...spec}=role.spec;await f.agents.update(identity,role.id,role.name,{...spec,require_approval:true,goal:role.spec.goal+' source revision changed'},role.revision);await f.tick()}
        assert.equal((await actualCount(p)).outputs,0);assert.equal(f.providerRequests.length,posts);await clearOld(p)
      }
    })
    await runCase('live HTTP resource disable and shared KB ACL revoke after real POST block publication',async()=>{
      for(const kind of ['http','kb_acl']){
        const r=kind==='http'?await f.withResource('alice'):await f.sharedKnowledge(),who=kind==='http'?'alice':'bob',p=await f.createDesign(who,'revise',{specId:r.role.id});await f.submit(p);const posts=f.providerRequests.length
        f.mutable.afterPost=async()=>{if(kind==='http')await f.db.query('UPDATE agentstudio.tool_connections SET enabled=false WHERE id=$1',[r.tool.id]);else await r.revoke()}
        try{await f.tick()}finally{f.mutable.afterPost=null}
        assert.equal(f.providerRequests.length,posts+1);assert.equal((await actualCount(p)).outputs,0)
        if(kind==='http')await f.db.query('UPDATE agentstudio.tool_connections SET enabled=true WHERE id=$1',[r.tool.id]);await clearOld(p)
      }
    })
    await runCase('real TLS disconnect, truncation and incomplete JSON never retry or publish a partial success',async()=>{
      for(const mode of ['disconnect','truncated','partial']){
        const p=await f.createDesign('alice','generate');await f.submit(p);const posts=f.providerRequests.length;f.mutable.providerMode=mode
        try{await f.tick();await f.tick()}finally{f.mutable.providerMode='success'}
        assert.equal(f.providerRequests.length,posts+1);const row=await actualCount(p);assert.equal(row.reservations,1);assert.equal(row.outputs,0)
      }
    })
    await runCase('lost private finish acknowledgement recovers only stored metadata, with no second provider POST',async()=>{
      const p=await f.createDesign('alice','generate');await f.submit(p);const posts=f.providerRequests.length;f.mutable.dropPrivate=true;await f.tick();await f.tick();assert.equal(f.providerRequests.length,posts+1)
      const row=await actualCount(p);assert.equal(row.reservations,1);assert.equal(row.outputs,1);const view=await f.request('alice','/api/v2/agent-design/requests/'+p.request_id);assert.equal(view.body.result_status,'available')
    })
    await runCase('actual original-client save transaction rollback removes Agent/history/receipt together',async()=>{
      const p=await f.createDesign('alice','generate');await finish(p);const s=await f.savePreview(p),body=f.saveBody(p,s),before=await f.counts()
      const {withActorClient,recordAgentDesignSaveOnClient}=await import('../src/repository.ts'),db=await f.pool.connect(),identity=await f.identityFor('alice')
      try{await db.query('BEGIN');await withActorClient(db,f.pool,identity,async(client,owner)=>{const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;const id=await recordAgentDesignSaveOnClient(client,owner,body.intent,s.preview);assert.equal(id,body.intent.request_id);assert.equal((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);assert.ok((await client.query('SELECT agentstudio.agent_design_save_receipt($1::uuid) AS value',[id])).rows[0].value)});await db.query('ROLLBACK')}finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
      assert.deepEqual(await f.counts(),before);refused(await f.request('alice','/api/v2/agent-design/confirm-save',body.intent))
    })
    await runCase('two real saves on the same source serialize UPDATE locks and commit one revision/history/receipt',async()=>{
      const a=await f.createDesign('alice','revise'),b=await f.createDesign('alice','revise');await finish(a);await finish(b)
      const sa=await f.savePreview(a),sb=await f.savePreview(b),ba=f.saveBody(a,sa),bb=f.saveBody(b,sb),before=await f.agents.get(await f.identityFor('alice'),a.choice.source.spec_id),counts=await f.counts(),hold=await f.adminPool.connect()
      let one,two,observed=[]
      try{
        await hold.query('BEGIN');await hold.query('SELECT id FROM agentstudio.agent_specs WHERE id=$1 FOR UPDATE',[before.id])
        one=f.request('alice','/api/v2/agent-design/save',ba);two=f.request('alice','/api/v2/agent-design/save',bb)
        for(let i=0;i<100;i++){
          observed=(await f.db.query(`WITH keys AS(SELECT family,id,seed,hashtextextended($1::text||':'||family||':'||id,seed) AS h FROM jsonb_to_recordset($2::jsonb) AS x(family text,id text,seed bigint))
            SELECT k.family,k.id,l.pid,l.granted,l.mode FROM keys k JOIN pg_catalog.pg_locks l ON l.locktype='advisory' AND l.classid::bigint=((k.h>>32)&4294967295) AND l.objid::bigint=(k.h&4294967295) AND l.objsubid=1`,[a.owner,JSON.stringify([{family:'save',id:ba.intent.request_id,seed:621},{family:'save',id:bb.intent.request_id,seed:621},{family:'design',id:a.request_id,seed:620},{family:'design',id:b.request_id,seed:620}])])).rows
          if(observed.filter(r=>r.granted).length===4)break
          await new Promise(resolve=>setTimeout(resolve,50))
        }
        assert.equal(observed.filter(r=>r.family==='save'&&r.granted).length,2);assert.equal(observed.filter(r=>r.family==='design'&&r.granted).length,2)
        await hold.query('COMMIT')
      }finally{await hold.query('ROLLBACK').catch(()=>{});hold.release()}
      const responses=await Promise.all([one,two]);assert.equal(responses.filter(r=>r.status===200).length,1)
      const after=await f.agents.get(await f.identityFor('alice'),before.id);assert.equal(after.revision,before.revision+1);assert.equal((await f.counts()).saves,counts.saves+1)
      const history=(await f.db.query("SELECT kind,count(*)::integer AS n FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1 AND spec_id=$2 AND ((kind='before_edit' AND spec_revision=$3) OR (kind='edited' AND spec_revision=$4)) GROUP BY kind",[a.owner,before.id,before.revision,after.revision])).rows
      assert.equal(history.find(r=>r.kind==='before_edit')?.n,1);assert.equal(history.find(r=>r.kind==='edited')?.n,1)
    })
    f.assertNoProviderErrors()
  }finally{await f.close()}
})
