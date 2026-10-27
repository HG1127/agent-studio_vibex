import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentHumanResponse} from '../src/agent-human-input-contract.ts'
const choice={request_id:'33333333-3333-4333-8333-333333333333',pending_step_key:'wf2_00000_autonomous_agent_a01m_input',pending_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64),decision:'reply',answer:'  Owner clarification\nnext condition  ',confirm:true}
test('owner clarification choices retain full bounded text and bind exact pending/source/request without accepting provider results or ownership',()=>{
  assert.equal(parseAgentHumanResponse(choice).answer,'Owner clarification\nnext condition')
  assert.equal(parseAgentHumanResponse({...choice,answer:'字'.repeat(1600)}).answer.length,1600)
  assert.equal(parseAgentHumanResponse({...choice,answer:'🙂'.repeat(800)}).answer.length,1600)
  for(const change of [{answer:'字'.repeat(1601)},{answer:'🙂'.repeat(801)},{answer:'\0private'},{owner_id:choice.request_id},{question:'client question'},{output:'pretend completed'},
    {checkpoint:{}},{approve_model:true},{knowledge_query_charge:true},{confirm:false},{source_sha256:'changed'},{pending_step_key:'model'}])
    assert.throws(()=>parseAgentHumanResponse({...choice,...change}),e=>e.status===400)
})
test('plan review decisions are explicit; only approval permits an empty optional note and parsing never grants execution or plan authority',()=>{
  assert.equal(parseAgentHumanResponse({...choice,decision:'approve',answer:'  '}).answer,'')
  assert.equal(parseAgentHumanResponse({...choice,decision:'revise',answer:'Rework the acceptance conditions'}).decision,'revise')
  for(const decision of ['reply','revise'])assert.throws(()=>parseAgentHumanResponse({...choice,decision,answer:' '}),e=>e.status===400)
  for(const decision of ['approved','rejected','tool','resume'])assert.throws(()=>parseAgentHumanResponse({...choice,decision}),e=>e.status===400)
  assert.throws(()=>parseAgentHumanResponse({...choice,decision:{toString(){throw Error('must not coerce')}}}),e=>e.status===400)
  const symbol=Symbol('untrusted');assert.throws(()=>parseAgentHumanResponse({...choice,[symbol]:true}),e=>e.status===400)
})
