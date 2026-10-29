// Pure construction and closed request checks against actual modules.
// This denied connector never returns records or fabricates SQL authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {WorkflowV2ModelDispatch} from '../src/workflow-v2-model-dispatch.ts'
import {WorkflowV2ToolDispatch} from '../src/workflow-v2-tool-dispatch.ts'
import {WorkflowV2Worker} from '../src/workflow-v2-worker.ts'
import {AgentCallerRepository} from '../src/agent-caller-repository.ts'
import {parseAgentCallerRunChoice,parseAgentCallerOwnerTest} from '../../../shared/agent-caller-contract.ts'
const deniedConnector=Object.freeze({connect:async()=>{throw Error('pure_construction_must_not_open_SQL')}}),key=Buffer.alloc(32),executor=async()=>{throw Error('pure_construction_must_not_execute')},id='00000000-0000-4000-8000-000000000001',choice=()=>({request_id:id,session_id:'00000000-0000-4000-8000-000000000002',input:'Closed caller task',fee_ack:'RUN_ONCE_WITHIN_OWNER_APPROVED_LIMITS',confirm:true})
test('caller model capability does not install the Native local vision executor or enable autonomous execution',()=>{
 const caller=new WorkflowV2ModelDispatch(deniedConnector,key,executor,deniedConnector,{allowCallerExecution:true});assert.equal(caller.allowCallers,true);assert.equal(caller.allowAutonomous,false);assert.equal(caller.localVisionExecutor,undefined)
 const local=new WorkflowV2ModelDispatch(deniedConnector,key,executor,deniedConnector,{localVisionExecutor:executor});assert.equal(local.allowCallers,false);assert.equal(local.localVisionExecutor,executor)
})
test('caller and Native local tool gates remain independent and do not enable paid knowledge adapters',()=>{
 const caller=new WorkflowV2ToolDispatch(deniedConnector,key,{},deniedConnector,{allowCallerExecution:true});assert.equal(caller.allowCallers,true);assert.equal(caller.allowLocalDevices,false);assert.equal(caller.allowAutonomous,false);assert.equal(caller.knowledgeQueries,null)
 const local=new WorkflowV2ToolDispatch(deniedConnector,key,{},deniedConnector,{allowLocalDeviceExecution:true});assert.equal(local.allowLocalDevices,true);assert.equal(local.allowCallers,false)
})
test('caller Worker approval does not grant Native local execution and caller admission never opts into local devices',()=>{
 const caller=new WorkflowV2Worker(deniedConnector,'pure_caller',{executionMode:'agent_native_v2',agentCallerExecutionApproved:true});assert.equal(caller.callerEnabled,true);assert.equal(caller.localDeviceEnabled,false);assert.equal(caller.agentEnabled,false)
 const local=new WorkflowV2Worker(deniedConnector,'pure_local',{executionMode:'agent_native_v2',localDeviceExecutionApproved:true});assert.equal(local.localDeviceEnabled,true);assert.equal(local.callerEnabled,false)
 const repository=new AgentCallerRepository(deniedConnector,{enabled:true,allowAdmission:true});assert.equal(repository.agents.allowLocalDevices,false);assert.equal(repository.agents.allowMemory,false);assert.equal(repository.agents.allowOutcomeMemory,false)
})
test('public and private Owner caller bodies cannot smuggle a local device id, binding, execution flag or employee actor',()=>{
 for(const extra of[{local_device_id:id},{local_device:{device_id:id}},{caller_binding:{credential_id:id}},{allowLocalDeviceExecution:true},{owner_user_id:id}]){assert.throws(()=>parseAgentCallerRunChoice({...choice(),...extra}));assert.throws(()=>parseAgentCallerOwnerTest({credential_id:id,generation:1,choice:choice(),...extra}))}
})
