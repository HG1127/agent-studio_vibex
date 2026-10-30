// Terminal query result DATA only. This is not a SQL interpreter/database.
import {ModelConnectionRepository} from '../../services/pg-api/src/model-connection-repository.ts'
import {withActor} from '../../services/pg-api/src/repository.ts'
import {submitModelConfigOnActor,readModelConfigReceiptOnActor} from '../../services/pg-api/src/model-config-receipt-ledger.ts'
import {prepareOriginalModelConfigIntent} from '../../src/lib/originalModelConfigReceiptIntent.ts'
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',rid='44444444-4444-4444-8444-444444444444',auditId='55555555-5555-4555-8555-555555555555',identity={issuer:'terminal-native',subject:'terminal-native'},key=Buffer.alloc(32,33)
export const clone=v=>structuredClone(v)
export const input={name:'Synthetic receipt model',provider:'openai',base_url:'https://api.openai.com/v1',models:['synthetic-configured-model'],enabled:true,api_key:'synthetic-config-secret-9191'}
export const publicInput=()=>{const{api_key,...rest}=input;return rest}
export const model=(extra={})=>({id,owner_user_id:owner,...publicInput(),api_key_tail:'9191',revision:7,status:'untested',last_latency_ms:0,last_checked_at:null,last_error:'',created_at:'2026-10-31T01:00:00.000Z',updated_at:'2026-10-31T01:00:00.000Z',...extra})
export const operation=(action='create',value=input,requestId=rid)=>prepareOriginalModelConfigIntent(owner,requestId,action,action==='create'?null:id,action==='create'?null:7,action==='delete'?null:value)
export const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}})
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
export function terminalReceiptData(options={}){
 let actor=owner,committed={models:new Map(options.empty?[]:[[id,model()]]),receipts:new Map(),audits:new Map()},fail=options.fail,ackLost=false;const queries=[],counters={dml:0,audits:0,receipts:0,releases:0,broker:0},queue={tail:Promise.resolve()}
 const pool={async connect(){let state,unlock;return{async query(sql,args=[]){queries.push({sql,args:clone(args)});if(sql==='BEGIN'){const previous=queue.tail;queue.tail=new Promise(resolve=>unlock=resolve);await previous;state=clone(committed);return{rows:[]}}if(sql==='COMMIT'){committed=state;state=null;unlock?.();unlock=null;if(options.loseCommitAck&&!ackLost){ackLost=true;throw Error('synthetic_commit_ack_lost')}return{rows:[]}}if(sql==='ROLLBACK'){state=null;unlock?.();unlock=null;return{rows:[]}}
 if(sql.includes('identity_user_id'))return{rows:[{id:actor}]};if(sql.includes(' AS ok'))return{rows:[{ok:options.context!==false&&options.isolation!==false}]};
 if(sql.includes('pg_advisory_xact_lock')||sql.startsWith('SET ')||sql.startsWith('SELECT set_config'))return{rows:[]};
 if(sql.includes('SELECT')&&sql.includes('FROM agentstudio.model_config_write_receipts075'))return{rows:state.receipts.has(args[0]+':'+args[1])?[clone(state.receipts.get(args[0]+':'+args[1]))]:[]};
 if(sql.startsWith('SELECT owner_user_id,actor_user_id'))return{rows:state.audits.has(args[0])?[clone(state.audits.get(args[0]))]:[]};
 if(sql.startsWith('SELECT revision,enabled'))return{rows:state.models.has(args[0])&&args[1]===actor?[clone(state.models.get(args[0]))]:[]};
 if(sql.startsWith('INSERT INTO agentstudio.model_connections')){counters.dml++;if(fail==='model')throw Error('synthetic_model_failure');const row=model({id,owner_user_id:args[0],name:args[1],provider:args[2],base_url:args[3],api_key_tail:args[7],enabled:args[8],models:JSON.parse(args[9]),revision:1});state.models.set(id,row);return{rows:[clone(row)]}};
 if(sql.startsWith('UPDATE agentstudio.model_connections')){counters.dml++;if(fail==='model')throw Error('synthetic_model_failure');const prior=state.models.get(args[0]),secret=sql.includes('api_key_ciphertext='),offset=secret?9:5,row=model({...prior,name:args[2],provider:args[3],base_url:args[4],api_key_tail:secret?args[8]:prior.api_key_tail,enabled:args[offset],models:JSON.parse(args[offset+1]),revision:prior.revision+1});state.models.set(row.id,row);return{rows:[clone(row)]}};
 if(sql.startsWith('DELETE FROM agentstudio.model_connections')){counters.dml++;state.models.delete(args[0]);return{rows:[{id:args[0]}]}};
 if(sql.startsWith('INSERT INTO agentstudio.audit_events')){counters.audits++;if(fail==='audit')throw Error('synthetic_audit_failure');state.audits.set(auditId,{id:auditId,owner_user_id:args[0],actor_user_id:args[0],action:args[1],target_kind:'model_connection',target_id:args[2],result:'succeeded',metadata:JSON.parse(args[3])});return{rows:[{id:auditId}]}};
 if(sql.startsWith('INSERT INTO agentstudio.model_config_write_receipts075')){counters.receipts++;if(fail==='ledger')throw Error('synthetic_ledger_failure');const fields=['owner_user_id','request_id','action','target_id','expected_revision','after_revision','outcome','public_intent_sha256','key_commitment','intent_hmac','receipt_hmac','audit_event_id'],row=Object.fromEntries(fields.map((k,i)=>[k,args[i]]));row.recorded_at='2026-10-31T01:00:00.000Z';state.receipts.set(args[0]+':'+args[1],row);return{rows:[clone(row)]}};
 throw Error('unrecognized terminal query '+sql)},release(){counters.releases++;unlock?.();unlock=null}}}}
 const repo=new ModelConnectionRepository(pool,Buffer.from(key),{async connect(){counters.broker++;throw Error('unexpected Broker access')}})
 return{pool,repo,queries,counters,state:()=>committed,setActor:v=>actor=v,setFailure:v=>fail=v,submit:(op,expected=owner)=>withActor(pool,identity,(db,actual)=>submitModelConfigOnActor(db,actual,repo,op,expected)),read:(requestId=rid,expected=owner)=>withActor(pool,identity,(db,actual)=>readModelConfigReceiptOnActor(db,actual,repo,requestId,expected))}
}
