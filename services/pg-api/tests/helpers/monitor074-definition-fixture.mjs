import {NativeMonitorBusinessData} from '../../src/native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from '../../src/native-monitor-definition-authority.ts'
import {monitorHash} from '../../src/native-monitor-source-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),person=id(3),scheduleId=id(4),specId=id(5),modelId=id(6)
const binding={connection_id:modelId,connection_revision:2,model_id:'gpt-test'}
const rawSpec=()=>({goal:'collect only the employee declared source',tools:['web_fetch','business_case_get','business_record_query','business_record_write','result_read'],knowledge_base_ids:[]})
const definition=()=>({title:'Owned monitor',schedule_id:scheduleId,adapter_id:'research.relationship-events.v1',target_entity_ids:[person],relation_types:['EMPLOYMENT'],sources:[{source_id:'roles',tool:'web_fetch',input:{url:'https://public.example.com/roles'},adapter_id:'web.text.v1',required_markers:['FACT']}],execution_budget:{model_calls:20,tool_calls:30,read_calls:30,search_calls:0,closing_model_calls:1,wall_ms:600000}})
function fixture(options={}){
 const trace=[],state={resource:'a'.repeat(64),targetVersion:1,targetStatus:'CONFIRMED',spec:rawSpec(),execution:{instruction:'declared scope only',target_revision:1,max_steps:10,anchor_at:'2026-10-30T00:00:00.000Z',expires_at:null,max_occurrences:10,max_auto_effects:20,allow_paid_knowledge:false,background_ack:'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1',knowledge_charge_ack:null,model_binding:binding},...options}
 const db={async query(sql,p=[]){
  trace.push({sql,params:p})
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:p[0]===owner}]}
  if(sql.includes(' AS api_only'))return{rows:[{epoch:'7',api_only:!state.worker}]}
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:{id:caseId,title:'Case',data_space:'LIVE',questions:[{question_id:id(9),question:'Q'}],created_ms:'1793310000000'}}]}
  if(sql.startsWith('SELECT record_id,version::text'))return{rows:[{record_id:person,version:String(state.targetVersion),schema_id:'research.entity.v1',payload:{canonical_name:'Person',entity_type:'PERSON',aliases:[],identity_status:state.targetStatus,identity_basis:'employee confirmed'},source_refs:[],relation_versions:[],run_id:null,created_ms:'1793310000000'}]}
  if(sql.startsWith('SELECT id,owner_user_id,kind,agent_spec_id'))return{rows:state.foreignSchedule?[]:[{id:scheduleId,owner_user_id:owner,kind:'agent',agent_spec_id:specId,time_zone:'Asia/Shanghai',recurrence:{config_format:'pg_schedule_execution_v3',execution_supported:true,rule:{kind:'interval',interval_minutes:60}},execution:state.execution,revision:'7'}]}
  if(sql.startsWith('SELECT id,owner_user_id,spec'))return{rows:[{id:specId,owner_user_id:owner,spec:{...state.spec,require_approval:true},revision:'1'}]}
  if(sql.startsWith('SELECT revision,enabled,status,models,provider,base_url'))return{rows:[{revision:'2',enabled:true,status:state.modelStatus??'ok',models:['gpt-test'],provider:'openai',base_url:'https://api.openai.com/v1'}]}
  if(sql.startsWith('SELECT id,provider,revision'))return{rows:[{id:modelId,provider:'openai',revision:'2',enabled:true,status:state.modelStatus??'ok'}]}
  if(sql.startsWith('SELECT agentstudio.schedule_resource_fingerprint'))return{rows:[{sha:state.resource}]}
  throw Error('unexpected source-only query '+sql)
 }}
 const data=new NativeMonitorBusinessData(async()=>{throw Error('no write permitted by this fixture')})
 return{db,state,trace,authority:new NativeMonitorDefinitionAuthority(data)}
}
export {id,owner,caseId,person,scheduleId,specId,modelId,rawSpec,definition,fixture}
