import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentDesignBroker} from '../src/agent-design-broker.ts'
import {agentDesignExecutionApproval} from '../src/agent-design-runtime-policy.ts'
import {prepareAgentDesignInput,agentDesignResourceHash} from '../src/agent-design-input.ts'
import {safeAgentSpec} from '../src/contracts.ts'
test('design cannot inherit review credentials or a shared pool as its authority',()=>{const p={},q={},r={},key=Buffer.alloc(32,7);assert.throws(()=>new AgentDesignBroker(p,p,r,key));assert.throws(()=>new AgentDesignBroker(p,q,r,key,{executionEnabled:true,executionApproval:agentDesignExecutionApproval}));assert.throws(()=>new AgentDesignBroker(p,q,r,key,{executionEnabled:true,executionApproval:'review',audit:async()=>true}));assert.equal(key.every(b=>b===7),true)})
test('default-off broker neither acquires connections nor executes/decrypts material',async()=>{let effects=0;const pool=()=>({connect:async()=>{effects++;throw Error()}}),b=new AgentDesignBroker(pool(),pool(),pool(),Buffer.alloc(32),{executor:async()=>{effects++;throw Error()}});await assert.rejects(()=>b.dispatch({}));assert.equal(effects,0);b.close();b.close()})
test('close rejects new dispatch and zeroes only the broker-owned key copy',async()=>{const key=Buffer.alloc(32,9),b=new AgentDesignBroker({}, {}, {},key,{executionEnabled:true,executionApproval:agentDesignExecutionApproval,audit:async()=>true,executor:async()=>{throw Error()}});b.close();assert.equal(key.every(v=>v===9),true);await assert.rejects(()=>b.dispatch({}),/execution_disabled/)})
test('after reserve ACK a fresh private context and actual source guard precede credential access',async()=>{
 // Method substitutions check only state-machine order; no SQL identity/ACL positive.
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha='a'.repeat(64),choice={action:'preview',purpose:'generate',instruction:'Design',model_binding:{connection_id:id(2),connection_revision:1,model_id:'model'},output_token_limit:4096,source:null}
 const p=prepareAgentDesignInput(choice,{owner:{user_id:id(1),governance_revision:2,epoch:2},model:{owner_user_id:id(1),binding:choice.model_binding,models:['model'],provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok'},role:null,resources_sha256:agentDesignResourceHash(safeAgentSpec({goal:'empty',tools:[],knowledge_base_ids:[]}))})
 const prepared={...p,choice,owner_user_id:id(1),owner_governance_revision:2,owner_epoch:2},ctx={protocol:'agent_design_context_v1',identity:{issuer:'urn:agentstudio:local:v1',subject:'employee'},owner_user_id:id(1),owner_governance_revision:2,owner_epoch:2,request_id:id(3),request_sha256:sha,choice,prepared},calls=[]
 const b=new AgentDesignBroker({}, {}, {},Buffer.alloc(32),{executionEnabled:true,executionApproval:agentDesignExecutionApproval,audit:async()=>true,executor:async()=>{calls.push('POST');throw Error()}})
 b.call=async name=>{calls.push(name);return name==='context'?ctx:name==='reserve'?{protocol:'agent_design_reservation_v1',request_id:id(3),effect_id:id(6),state:'reserved',request_sha256:sha,input_sha256:p.input_sha256,content_sha256:p.content_sha256,source_sha256:p.source_sha256}:{protocol:'agent_design_dispatch_reply_v1',request_id:id(3),state:'failed'}}
 b.check=async()=>{calls.push('actual-source-fixture');return {}}
 b.credential=async()=>{calls.push('credential');throw Error('stop before key')}
 assert.equal((await b.dispatch({protocol:'agent_design_dispatch_v1',request_id:id(3),lease_token:id(4),lease_version:1,worker_id:id(5)})).state,'failed')
 assert.deepEqual(calls,['context','actual-source-fixture','reserve','context','actual-source-fixture','credential','finish']);b.close()
})
