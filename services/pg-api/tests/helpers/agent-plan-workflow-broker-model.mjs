// Query-response model for exercising actual Broker/Ledger/Source code only.
// The model is not installed SQL, a schema auditor, an ACL or durable fee proof.
import {EventEmitter} from 'node:events'
import {safeAgentSpec,HttpError} from '../../src/contracts.ts'
import {encryptModelSecret} from '../../src/model-connection-crypto.ts'
import {agentPlanWorkflowHash as hash} from '../../src/agent-plan-workflow-source.ts'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowFeeAcknowledgement as fee,canonicalAgentPlanWorkflowValue as canonical} from '../../src/agent-plan-workflow-contract.ts'
import {prepareAgentPlanWorkflowInput,agentPlanWorkflowResultValue} from '../../src/agent-plan-workflow-result.ts'
import {AgentPlanWorkflowBroker} from '../../src/agent-plan-workflow-broker.ts'
import {agentPlanWorkflowExecutionApproval as approval} from '../../src/agent-plan-workflow-runtime-policy.ts'
import {id} from '../../../../tests/helpers/agent-plan-workflow-browser-values.mjs'
export function brokerModel(settings={}){
  const calls=[],wire=[],inTransaction=new Set(),key=Buffer.alloc(32,7),identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-employee'},owner=id(1),ownerState={owner_user_id:owner,governance_revision:5,epoch:5}
  const spec=safeAgentSpec({goal:'整理资料',tools:[],knowledge_base_ids:[]}),agent={spec_id:id(7),owner_user_id:owner,name:'Synthetic F05 source',spec,revision:2},generation_model={connection_id:id(9),connection_revision:3,model_id:'generation-only'}
  const metadata={owner_user_id:owner,revision:3,provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok',models:['generation-only']},encrypted=encryptModelSecret('synthetic_test_key_only',key)
  const secret={...metadata,api_key_ciphertext:encrypted.ciphertext,api_key_nonce:encrypted.nonce,api_key_tag:encrypted.tag}
  const envelope=hash({protocol:'agent_plan_workflow_encrypted_envelope_v1',owner_user_id:owner,connection_id:generation_model.connection_id,connection_revision:3,ciphertext_hex:encrypted.ciphertext.toString('hex'),nonce_hex:encrypted.nonce.toString('hex'),tag_hex:encrypted.tag.toString('hex')})
  const snapshot=[{connection_id:generation_model.connection_id,connection_revision:3,metadata_sha256:hash({protocol:'agent_plan_workflow_model_metadata_v1',connection_id:generation_model.connection_id,owner_user_id:owner,connection_revision:3,models:metadata.models,provider:metadata.provider,base_url:metadata.base_url,enabled:true,status:'ok'}),encrypted_envelope_sha256:envelope}]
  const resources=Object.fromEntries(['tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval','require_plan_review'].filter(k=>Object.hasOwn(spec,k)).map(k=>[k,spec[k]]))
  const source={spec_id:agent.spec_id,spec_revision:2,source_sha256:hash({protocol:'agent_plan_workflow_source_binding_v1',owner:ownerState,agent}),resources_sha256:hash({protocol:'agent_plan_workflow_resource_values_v1',resources}),resource_versions_sha256:hash({protocol:'agent_plan_workflow_resource_versions_v1',owner:ownerState,resource_snapshot:[],model_snapshot:snapshot})}
  const source_values={source,name:agent.name,spec},choice={action:'preview',purpose,source,instruction:'生成有界草图',generation_model,output_token_limit:8192},p=prepareAgentPlanWorkflowInput(choice,source_values)
  const prepared={protocol:'agent_plan_workflow_prepared_v1',purpose,choice,source_values,messages:p.messages,input_sha256:hash(p.input_value),content_sha256:hash(p.content_value),model_versions_sha256:hash({protocol:'agent_plan_workflow_model_versions_v1',owner:ownerState,model_snapshot:snapshot}),owner_user_id:owner,owner_governance_revision:5,owner_epoch:5,byte_length:Buffer.byteLength(canonical(p.input_value)),authority:false}
  const {action:_a,...fields}=choice,intent={...fields,action:'submit',request_id:id(100),expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:fee},request_sha256=hash(agentPlanWorkflowPaidIntentValue(intent))
  const context={protocol:'agent_plan_workflow_context_v1',purpose,identity,owner_user_id:owner,owner_governance_revision:5,owner_epoch:5,request_id:id(100),request_sha256,choice,prepared},proof={protocol:'agent_plan_workflow_dispatch_v1',purpose,request_id:id(100),lease_token:id(101),lease_version:1,worker_id:id(102)}
  const material={protocol:'agent_plan_workflow_source_material_v1',owner:ownerState,source_values,resource_snapshot:[],model_snapshot:snapshot}
  const graph={version:2,nodes:[{id:'s',type:'start',position:{x:0,y:0},data:{title:'s'}},{id:'m',type:'model',position:{x:1,y:1},data:{title:'m',prompt:'分析 {{input}}'}},{id:'e',type:'end',position:{x:2,y:2},data:{title:'e'}}],edges:[{id:'a',source:'s',target:'m'},{id:'b',source:'m',target:'e'}]},output={protocol:'agent_plan_workflow_model_output_v1',name:'Synthetic model graph',graph},modelJson=JSON.stringify(output)
  let reservations=0,finishes=0,completion=null,result=null,state='reserved',contexts=0,drift=false,finishCommitLost=false
  const safe={login:false,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}
  const clients={}
  for(const kind of ['business','dispatch','secret']){
    const role=kind==='dispatch'?'agentstudio_plan_workflow_dispatch':kind==='secret'?'agentstudio_model_broker':'agentstudio_api'
    clients[kind]={kind,query:async(sql,args)=>{
      calls.push({kind,sql,args});let rows=[],value
      if(sql==='BEGIN')inTransaction.add(kind)
      if(sql.includes('WHERE rolname=session_user'))rows=[{...safe,login:true,initial_role:true,superuser:kind==='secret'&&settings.unsafeSecret===true}]
      else if(sql.startsWith('SELECT rolcanlogin')&&(sql.includes('WHERE rolname=$1')||sql.includes("WHERE rolname='agentstudio_model_broker'")))rows=[safe]
      else if(sql.includes('pg_has_role')&&sql.includes('AS name'))rows=[{name:role}]
      else if(sql.includes('pg_auth_members')&&sql.includes('admin_option'))rows=[{name:role,admin:false,inherit:false,set:true}]
      else if(sql==='SELECT current_user AS role')rows=[{role}]
      else if(sql.includes("AS role,has_column_privilege(current_user,'agentstudio.schema_migrations'"))rows=[{role,ok:true}]
      else if(sql.includes('SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='))rows=[{ok:false}]
      else if(sql.endsWith(' AS installed'))rows=[{installed:false}]
      else if(sql==='SELECT to_regclass($1)::oid AS id')rows=[{id:null}]
      else if(sql.includes('identity_user_id'))rows=[{id:kind==='secret'&&settings.wrongSecretOwner?id(2):owner}]
      else if(sql.includes("current_user='agentstudio_api'"))rows=[{ok:true}]
      else if(sql.includes('agent_plan_workflow_context')){contexts++;value=structuredClone(context)}
      else if(sql.includes('agent_plan_workflow_reserve')){if(reservations)throw new HttpError(409,'agent_plan_workflow_spent');reservations++;if(settings.reserveAckLost)throw Error('synthetic_reserve_ack_lost');value={protocol:'agent_plan_workflow_reservation_v1',purpose,request_id:id(100),effect_id:id(200),state:'reserved',request_sha256,input_sha256:prepared.input_sha256,content_sha256:prepared.content_sha256,source_sha256:source.source_sha256}}
      else if(sql.includes('agent_plan_workflow_finish')){finishes++;completion=JSON.parse(args[4]);state=completion.status;result=state==='succeeded'?agentPlanWorkflowResultValue({request_id:id(100),purpose,source,input_sha256:prepared.input_sha256,generation_model},completion.result):null;value={protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:id(100),state,result_sha256:result?hash(result):null,completion_sha256:hash({protocol:'agent_plan_workflow_completion_v1',purpose,request_id:id(100),completion})};finishCommitLost=settings.finishAckLost===true}
      else if(sql.includes('agent_plan_workflow_owner_state'))value=ownerState
      else if(sql.includes('agent_plan_workflow_source'))value=material
      else if(sql.includes('agent_plan_workflow_receipt'))value={protocol:'agent_plan_workflow_receipt_v1',purpose,request_id:id(100),generation_model,output_token_limit:8192,source,request_sha256,input_sha256:prepared.input_sha256,content_sha256:prepared.content_sha256,model_versions_sha256:prepared.model_versions_sha256,owner_governance_revision:5,owner_epoch:5,created_at:'2026-10-29T00:00:00.000Z',state,body_erased:false,recorded:true,replayed:true}
      else if(sql.includes('agent_plan_workflow_read_result'))value=result?{protocol:'agent_plan_workflow_result_data_v1',request_id:id(100),result_sha256:hash(result),value:result}:null
      else if(sql.includes('FROM agentstudio.agent_specs'))rows=[{id:agent.spec_id,owner_user_id:owner,name:agent.name,spec,revision:drift?3:2}]
      else if(sql.includes('FROM agentstudio.model_connections'))rows=kind==='secret'?[secret]:[metadata]
      if(sql==='COMMIT'&&kind==='dispatch'&&finishCommitLost){finishCommitLost=false;throw Error('synthetic_finish_ack_lost')}
      if(sql==='COMMIT'||sql==='ROLLBACK')inTransaction.delete(kind)
      return {rows:value===undefined?rows:[{value}]}
    },release(){calls.push({kind,sql:'RELEASE'})}}
  }
  const pools=Object.fromEntries(Object.entries(clients).map(([kind,db])=>[kind,{connect:async()=>db}]))
  const audit=async db=>{if(!Object.values(clients).includes(db)||db.kind==='secret')throw Error('wrong_original_or_F05_audit_role');calls.push({kind:db.kind,sql:'MODEL_AUDIT_OBSERVED'});return settings.auditFalse!==true}
  const requester=(options,ready)=>{
    const req=new EventEmitter();req.destroy=()=>{req.destroyed=true};options.signal.addEventListener('abort',()=>{if(!req.destroyed&&!req.complete){req.destroyed=true;req.emit('error',Error('synthetic_aborted'))}},{once:true})
    req.end=body=>{calls.push({kind:'provider',sql:'MODEL_HTTPS_POST'});wire.push({options:{...options,headers:{...options.headers}},body:Buffer.from(body),openTransactions:[...inTransaction]});if(settings.wireHang)return
      queueMicrotask(()=>{if(settings.wireError){req.destroyed=true;req.emit('error',Error('synthetic_lost_provider_ack'));return}if(settings.driftAfterWire)drift=true
        const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json'};res.destroy=()=>{};ready(res);res.emit('data',Buffer.from(JSON.stringify({choices:[{finish_reason:'stop',message:{content:modelJson}}]})));req.complete=true;res.emit('end')})
    };return req
  }
  const broker=new AgentPlanWorkflowBroker(pools.business,pools.dispatch,pools.secret,key,settings.disabled?{}:{executionEnabled:true,executionApproval:approval,audit,resolver:{resolve4:async()=>['93.184.216.34'],resolve6:async()=>[]},request:requester})
  return {broker,proof,context,secret,envelope,key,calls,wire,hash,modelJson,output,reservations:()=>reservations,finishes:()=>finishes,contexts:()=>contexts,state:()=>state,alterEnvelope(){secret.api_key_tag=Buffer.from(secret.api_key_tag);secret.api_key_tag[0]^=1}}
}
