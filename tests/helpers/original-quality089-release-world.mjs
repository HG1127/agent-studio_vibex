/** Original release source executes unchanged Native/ACL call sites against
 * terminal policy ports; no Native engine, Worker or PostgreSQL is run. */
export function quality089ReleaseWorld({fixture,hash,checksCanonical,contracts,releaseContract,qualityRepository,actor,preconditions,qualityAudit,createHash,compile,source}){return function make(options={}){
 const employee='11111111-1111-4111-8111-111111111111',spec='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333',version='77777777-7777-4777-8777-777777777777',run='55555555-5555-4555-8555-555555555555',seal='a'.repeat(64),binding={connection_id:'88888888-8888-4888-8888-888888888888',connection_revision:1,model_id:'model'},instruction='owned test',config={goal:'goal',task_scope:'scope',deliverables:[],task_plan:[],done_criteria:[],tools:[],knowledge_base_ids:[],require_approval:true,model_binding:binding},rules=[{type:'contains',expected:' exact '}],counts={publish:0,checkpoint:0,knowledge:0,qualityRun:0,requirement:0,admit:0},order=[],identity={issuer:'urn:agentstudio:local:v1',subject:'verified-external-subject'},state={execution_mode:'agent_native_v2',spec_revision:3,graph:{nodes:[{},{data:{max_steps:1,model_binding:binding}}]},machine:{effects:[]}},ver={id:version,spec_id:spec,name:'Historical Agent',spec_snapshot:config,revision:1,test_passed:true,test_run_id:run,source_sha256:seal},row={id:run,owner_user_id:employee,kind:'agent',agent_spec_id:spec,status:'succeeded',instruction,checkpoint:state}
 const pool={connect:async()=>({release(){},async query(sql,args=[]){
  const value=x=>({rows:[{value:x}]}),item=x=>({rows:[{item:x}]})
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET ')||sql.startsWith('SELECT set_config')||sql.startsWith('SELECT pg_advisory'))return{rows:[]}
  if(sql.includes('identity_user_id'))return{rows:[{id:employee}]}
  if(sql.includes('AS present'))return{rows:[{present:options.qualityPresent!==false}]}
  if(sql.includes("version='pg_v9_046'"))return{rows:[{ok:true}]}
  if(sql.startsWith('WITH qrole AS'))return value(fixture())
  if(sql.startsWith('SELECT agentstudio.agent_release_receipt'))return item(null)
  if(sql.startsWith('SELECT agentstudio.quality089_publication_requirements')){counts.requirement++;return value({requires_native_test:options.malformedRequirement?'false':true,rule_count:1,spec_revision:3,source_sha256:seal,checks_sha256:hash(checksCanonical(rules))})}
  if(sql.startsWith('SELECT agentstudio.agent_release_detail'))return item(ver)
  if(sql.startsWith('SELECT agentstudio.agent_release_acceptance_status'))return item({status:'succeeded',source_sha256:seal,spec_revision:3,max_steps:1,model_binding:binding,instruction_sha256:hash(instruction)})
  if(sql.startsWith('SELECT agentstudio.agent_release_workspace'))return item({source_sha256:options.sourceMatches===false?'f'.repeat(64):seal})
  if(sql.startsWith('SELECT owned_native_run_columns'))return{rows:[row]}
  if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM agentstudio.run_steps'))return{rows:[{ok:true}]}
  if(sql.startsWith('SELECT agentstudio.quality089_run_passes')){counts.qualityRun++;return value(options.malformedVerdict?'true':options.rulesPass!==false)}
  if(sql.startsWith('SELECT agentstudio.agent_release_publish')){counts.publish++;return item({spec_id:spec,request_id:request,replayed:false})}
  if(sql.startsWith('SELECT spec,revision FROM agentstudio.agent_specs'))return{rows:[{spec:config,revision:3}]}
  if(sql.startsWith('SELECT agentstudio.quality089_read')){order.push('qualityRead');return value({protocol:'native_original_agent_quality_v1',employee_id:employee,spec_id:spec,spec_revision:3,source_sha256:seal,state:options.missing?'missing':'configured',checks:options.missing?null:rules,checks_sha256:options.missing?null:hash(checksCanonical(rules))})}
  if(sql.startsWith('SELECT agentstudio.agent_release_acceptance('))return item({spec_id:spec,request_id:request,replayed:false,run_id:run})
  if(sql.startsWith('SELECT id FROM agentstudio.agent_specs'))return{rows:[{id:spec}]}
  if(sql.startsWith('SELECT agentstudio.agent_release_restore_prepare')){order.push('restorePrepare');return item({replayed:false,name:ver.name,spec_snapshot:config})}
  if(sql.startsWith('SELECT agentstudio.quality089_restore_stage')){order.push('restoreStage');return value(null)}
  if(sql.startsWith('UPDATE agentstudio.agent_specs SET name=')){order.push('restoreUpdate');return{rows:[]}}
  if(sql.startsWith('SELECT agentstudio.agent_release_restore_finish')){order.push('restoreFinish');return item({spec_id:spec,request_id:request,replayed:false,restored:true})}
  throw Error('unexpected_release_terminal_sql '+sql.slice(0,80))
 }})}
 const ports={...contracts,...releaseContract,...qualityRepository,withActor:actor.withActor,assertOriginalUiEmployee:preconditions.assertOriginalUiEmployee,optionalOriginalQuality089OnClient:qualityAudit.optionalOriginalQuality089OnClient,originalVersionReleaseProtocol:'native_original_version_release_v1',createHash,randomUUID:()=>run,AutonomousAgentRunRepository:class{async admitOwned(){counts.admit++;order.push('admit');return{run:{id:run}}}},verifyAgentSpecResources:async()=>{},workflowV2RunColumns:'owned_native_run_columns',checkedWorkflowV2StoredState:value=>{counts.checkpoint++;if(options.machine===false)throw new contracts.HttpError(409,'invalid_workflow_checkpoint');return value},verifyWorkflowV2Snapshot:async()=>{},inspectWorkflowV2Checkpoint:()=>({status:'succeeded'}),currentKnowledgeObservations:async()=>{counts.knowledge++;return options.knowledge!==false},workflowAgentJson:value=>JSON.stringify(value)}
 const Repo=compile(source,ports).AgentReleaseRepository,repo=new Repo(pool,{enabled:true,allowAcceptance:true}),common={request_id:request,expected_spec_revision:3,source_sha256:seal},v={version_id:version,version_sha256:'c'.repeat(64),expected_version_revision:1}
 return{repo,identity,employee,spec,counts,order,publish:{...common,...v,action:'publish',expected_release_revision:1,confirm:true,acknowledge_untested:true},acceptance:{...common,action:'acceptance',instruction,max_steps:1,model_binding:null,confirm:true},restore:{...common,...v,action:'restore',confirm:true,reason:'explicit owned restore'}}
}}
