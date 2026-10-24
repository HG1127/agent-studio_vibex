import baseTest from "node:test"
import assert from "node:assert/strict"
import {agentFixture as fixture,alice,bob} from "./workflow-v2-agent-fixture.mjs"
import {verifyWorkflowEffectIdentityPrivileges} from "../../src/bound-dispatch-role-preflight.ts"
import {createWorkflowV2ModelMutualTlsClient} from "../../src/workflow-v2-model-client.ts"
const tool=expression=>JSON.stringify({action:"tool",tool:"calculate",params:{expression},note:"Calculate the requested expression"})
const answer=text=>JSON.stringify({action:"answer",answer:text})
export function registerAgentRuntimeTests(autonomous=false){
const agentFixture=()=>fixture({autonomous})
const test=(name,fn)=>baseTest((autonomous?"Autonomous: ":"Workflow: ")+name,fn)
const longNode=autonomous?"agent":"a".repeat(80)
test("thirty owner-selected rounds survive every Worker replacement over private mTLS and retain late-round fencing",async()=>{
  const f=await agentFixture();let calls=0,decisions=0,lateFence=false
  try{
    await assert.rejects(f.make({maxSteps:31}))
    const queued=await f.make({maxSteps:30})
    await f.privateTls(async(_material,prompt)=>{
      calls++;const input=JSON.parse(prompt);assert.equal(input.max_rounds,30)
      return input.round===30?answer("Thirty round result"):tool("2+2")
    },async(makeWorker,{modelIdentity})=>{
      f.setBeforeDispatch(async(request,kind)=>{
        if(kind!=="model"||!request.step_key.endsWith("_a30m"))return
        lateFence=true;assert.deepEqual(await modelIdentity.resolve(request),alice)
        await assert.rejects(modelIdentity.resolve({...request,input_sha256:"f".repeat(64)}))
      })
      const done=await f.drive(makeWorker,queued.run.id,()=>{decisions++;return "approved"},180)
      assert.equal(done.run.status,"succeeded",JSON.stringify({error:done.run.last_error_code,calls,steps:done.steps.map(s=>({key:s.step_key,status:s.status}))}));assert.equal(done.run.result_text,"Thirty round result")
      assert.equal(calls,30);assert.equal(decisions,60);assert.equal(lateFence,true)
      assert.equal(done.steps.some(step=>step.metadata.agent_round===30&&step.metadata.agent_phase==="model"),true)
      assert.equal((await makeWorker().tick()).status,"idle");assert.equal(calls,30)
      assert.equal(JSON.stringify(done).includes("ROLE_PRIVATE"),false)
    })
    const ledger=(await f.db.query("SELECT count(*)::int AS n,bool_and(status='succeeded') AS settled FROM agentstudio.external_effects WHERE run_id=$1",[queued.run.id])).rows[0]
    assert.equal(ledger.n,119);assert.equal(ledger.settled,true)
  }finally{await f.close()}
})
test("Agent resumes model/tool/model over real mTLS after every new Worker, preserves scope and bounded public history",async()=>{
  const f=await agentFixture();let calls=0,decisions=0
  try{
    const queued=await f.make({nodeId:longNode})
    await f.privateTls(async(material,prompt)=>{
      calls++;assert.equal(material.api_key,"synthetic-alice-model-key-never-network")
      const input=JSON.parse(prompt);assert.equal(input.role.goal,"ROLE_PRIVATE_alice")
      if(input.round===1)return tool("2+2")
      assert.match(input.history[0].observation,/2\+2 = 4/);return answer("Verified synthetic result 4")
    },async(makeWorker,{modelIdentity,toolIdentity,config})=>{
      let fenced=false
      f.setBeforeDispatch(async(request,kind)=>{
        if(fenced||kind!=="model")return;fenced=true
        assert.deepEqual(await modelIdentity.resolve(request),alice)
        const {parent_step_key:_,...withoutParent}=request
        await assert.rejects(modelIdentity.resolve(withoutParent))
        await assert.rejects(toolIdentity.resolve(request))
        await assert.rejects(modelIdentity.resolve({...request,input_sha256:"f".repeat(64)}))
        if(autonomous){
          const {execution_mode:_,...wrongRoot}=request
          await assert.rejects(modelIdentity.resolve(wrongRoot))
          await assert.rejects(createWorkflowV2ModelMutualTlsClient(config)(wrongRoot))
        }
      })
      const done=await f.drive(makeWorker,queued.run.id,async pending=>{
        decisions++;await assert.rejects(f.runs.decide(bob,queued.run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256}))
        return "approved"
      })
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Verified synthetic result 4");assert.equal(calls,2);assert.equal(decisions,4)
      assert.equal(await f.runs.get(bob,queued.run.id),null);assert.equal((await makeWorker().tick()).status,"idle")
      assert.equal(JSON.stringify(done).includes("agent_state"),false);assert.equal(JSON.stringify(done).includes("ROLE_PRIVATE"),false)
      assert.equal(done.steps.filter(step=>step.metadata.parent_step_key).length,3)
      assert.equal(done.steps.filter(step=>step.metadata.agent_phase==="model").length,2)
      const pages=[];let after=""
      for(let i=0;i<10;i++){const page=await f.runs.steps(alice,queued.run.id,after,2);pages.push(...page.items);if(!page.next_after)break;after=page.next_after}
      assert.equal(pages.length,6);assert.equal(new Set(pages.map(step=>step.step_key)).size,6)
      assert.equal(fenced,true);f.setBeforeDispatch(undefined)
    })
    const effects=(await f.db.query("SELECT step_key,status,result_reference FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[queued.run.id])).rows
    assert.equal(effects.length,7);assert.equal(effects.every(effect=>effect.status==="succeeded"),true)
    const archive=JSON.parse(effects.find(effect=>effect.step_key.endsWith(longNode)).result_reference)
    assert.equal(archive.agent_snapshot.spec.goal,"ROLE_PRIVATE_alice")
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events")).rows)
    for(const text of ["ROLE_PRIVATE_alice","synthetic-alice-model-key","Verified synthetic result 4"])assert.equal(audit.includes(text),false)
    for(const kind of ["api","identity","broker"])for(const effect of (autonomous?["autonomous_model","autonomous_tool"]:["agent_model","agent_tool"]))await verifyWorkflowEffectIdentityPrivileges(f.pool,kind,effect)
  }finally{await f.close()}
})
test("known Tool errors and rejection permit an explicitly approved next model; rejecting a model skips the Agent",async()=>{
  const f=await agentFixture();let calls=0
  try{
    await f.privateTls(async(_material,prompt)=>{
      calls++;const input=JSON.parse(prompt)
      if(input.round===1)return tool("1/0")
      assert.match(input.history[0].observation,/workflow_calculation_invalid|员工已拒绝/)
      return answer("Adjusted after failed or rejected Tool")
    },async makeWorker=>{
      const invalid=await f.make(),failed=await f.drive(makeWorker,invalid.run.id)
      assert.equal(failed.run.status,"succeeded");assert.match(failed.run.result_text,/Adjusted/)
      assert.equal(failed.steps.find(step=>step.metadata.agent_phase==="tool").status,"failed")
      const rejected=await f.make(),skipped=await f.drive(makeWorker,rejected.run.id,pending=>pending.agent_context?.phase==="tool"?"rejected":"approved")
      assert.equal(skipped.run.status,"succeeded");assert.equal(skipped.steps.find(step=>step.metadata.agent_phase==="tool").status,"skipped")
      const stopped=await f.make(),before=calls
      const cancelled=await f.drive(makeWorker,stopped.run.id,pending=>pending.agent_context?.phase==="model"?"rejected":"approved")
      assert.equal(cancelled.run.status,"succeeded");assert.equal(calls,before)
      assert.equal(cancelled.steps.find(step=>step.step_key==="wf2_00002_agent").status,"skipped")
    })
  }finally{await f.close()}
})
test("independent Agent activation, declared tools and current owner spec revision fence execution",async()=>{
  const f=await agentFixture();let calls=0
  try{
    await assert.rejects(f.make({spec:f.resources.bob.spec}),e=>e.status===404)
    if(!autonomous)await assert.rejects(f.make({override:f.resources.bob.binding}),e=>e.status===404)
    else await assert.rejects(f.runs.submit(alice,f.resources.alice.spec.id,{expected_revision:1,instruction:"Synthetic",max_steps:3,
      idempotency_key:"unsafe-model-override",model_binding:f.resources.bob.binding}),e=>e.status===400)
    await f.privateTls(async()=>{calls++;return answer("must not run")},async makeWorker=>{
      const queued=await f.make(),paused=await f.drive(()=>makeWorker({agentExecutionApproved:false}),queued.run.id)
      assert.equal(paused.run.status,"paused");assert.equal(calls,0)
      const stale=await f.make();await makeWorker().tick();await f.approve(stale.run.id)
      await f.db.query("UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1",[f.resources.alice.spec.id])
      assert.equal((await makeWorker().tick()).status,"failed");assert.equal(calls,0)
      await f.db.query("UPDATE agentstudio.agent_specs SET revision=revision-1 WHERE id=$1",[f.resources.alice.spec.id])
    })
    // An untrusted model cannot add a tool to the frozen role's allowlist.
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:"tool",tool:"unregistered_http",params:{url:"https://foreign.example.com"}})},async makeWorker=>{
      const queued=await f.make(),done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"failed");assert.equal(done.run.last_error_code,"workflow_agent_tool_not_allowed")
      assert.equal(done.steps.some(step=>step.metadata.agent_phase==="tool"),false)
    })
  }finally{await f.close()}
})
test("an ambiguous Agent model outcome and private Broker disabled Agent scope never cause automatic resend",async()=>{
  for(const allowAgent of [true,false]){
    const f=await agentFixture();let calls=0
    try{
      await f.privateTls(async()=>{calls++;throw Error("synthetic paid response lost")},async makeWorker=>{
        const queued=await f.make(),done=await f.drive(makeWorker,queued.run.id)
        assert.equal(done.run.status,"paused");assert.equal((await makeWorker().tick()).status,"idle");assert.equal(calls,allowAgent?1:0)
        const effects=(await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1",[queued.run.id])).rows
        assert.equal(effects.every(effect=>effect.status==="unknown"),true)
      },{allowAgent})
    }finally{await f.close()}
  }
})
test("a Worker result-commit crash pauses the expired Agent lease without sending the successful model again",async()=>{
  const f=await agentFixture();let calls=0,faulted=false
  try{
    f.setFault((sql,values)=>{if(!faulted&&sql.startsWith("UPDATE agentstudio.external_effects")&&values[3]==="succeeded"&&
      String(values[2]).startsWith("wf2_")&&!String(values[2]).startsWith("wf2_model:")&&String(values[2]).endsWith("_a01m")){
      faulted=true;throw Error("synthetic Worker result commit failed")}})
    await f.privateTls(async()=>{calls++;return answer("synthetic paid result")},async makeWorker=>{
      const queued=await f.make()
      for(let i=0;i<3;i++){await makeWorker().tick();const detail=await f.runs.get(alice,queued.run.id);if(detail.run.status==="awaiting_approval")await f.approve(queued.run.id)}
      await assert.rejects(makeWorker().tick());assert.equal(calls,1)
      f.setFault(undefined)
      await f.db.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE run_id=$1",[queued.run.id])
      assert.equal((await makeWorker().tick()).status,"paused");assert.equal((await makeWorker().tick()).status,"idle");assert.equal(calls,1)
      assert.equal((await f.runs.get(alice,queued.run.id)).run.status,"paused")
      assert.equal((await f.runs.get(alice,queued.run.id)).run.checkpoint.stage,autonomous?"agent_v2_paused":"workflow_v2_paused")
    })
  }finally{f.setFault(undefined);await f.close()}
})

test("Agent knowledge tools inherit only the frozen role's owner-private KB scope",async()=>{
  const f=await agentFixture();let calls=0
  try{
    await f.privateTls(async(_material,prompt)=>{
      calls++;const input=JSON.parse(prompt)
      if(input.round===1)return JSON.stringify({action:"tool",tool:"knowledge_search",params:{query:"synthetic",knowledge_base_ids:[f.resources.bob.kb.id]}})
      if(input.round===2){assert.match(input.history[0].observation,/workflow_tool_input_invalid/)
        return JSON.stringify({action:"tool",tool:"knowledge_search",params:{query:"synthetic"}})}
      assert.match(input.history[1].observation,/OWN_CITATION/);assert.equal(prompt.includes("FOREIGN_SECRET"),false)
      return answer("Own evidence only")
    },async makeWorker=>{
      const queued=await f.make(),done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Own evidence only");assert.equal(calls,3)
      assert.equal(JSON.stringify(done).includes("FOREIGN_SECRET"),false)
    })
  }finally{await f.close()}
})

}
