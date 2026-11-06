// Synthetic terminal DATA only. No Native authentication, SQL or provider is
// simulated as acceptance; Response values exercise the actual client parsers.
export const employee='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',createdId='44444444-4444-4444-8444-444444444444'
export const clone=value=>JSON.parse(JSON.stringify(value))
export const row=(extra={})=>({id,owner_user_id:employee,name:'Synthetic original model',provider:'openai',base_url:'https://api.openai.com/v1',api_key_tail:'0001',enabled:true,status:'ok',last_latency_ms:4,last_checked_at:'2026-10-30T00:00:00.000Z',models:['synthetic-one','synthetic-two'],last_error:'',revision:7,created_at:'2026-10-29T00:00:00.000Z',updated_at:'2026-10-30T00:00:00.000Z',...extra})
export const input=(extra={})=>({name:'Synthetic new model',provider:'openai',base_url:'https://api.openai.com/v1',models:['synthetic-new'],enabled:true,api_key:'synthetic-unit-key-0002',...extra})
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
export const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
export function terminalModelTransport(options={}){
 const records=new Map((options.rows??[row()]).map(v=>[v.id,clone(v)])),requests=[];let owner=employee,nextCreated=0
 const caps=()=>({mode:'native_pg18',config_writes_enabled:options.writes!==false,model_probe_enabled:options.probe===true,...(options.protocol===false?{}:{original_model_connections_protocol:'native_model_connections_owner_cas_v1'})})
 const transport=async(route,init)=>{
  const body=init.body===undefined?null:JSON.parse(init.body),request={route,init,body};requests.push(request)
  if(options.intercept){const chosen=await options.intercept(request,records);if(chosen!==undefined)return chosen}
  const url=new URL(route,'https://unit.invalid'),path=url.pathname.replace(/^\/__pg_native(?=\/|$)/,'')
  if(path==='/api/native-auth/capabilities')return json(caps())
  if(path==='/api/v2/model-connections'&&init.method==='GET')return json({items:[...records.values()].filter(v=>v.owner_user_id===owner)})
  const selected=path.match(/^\/api\/v2\/model-connections\/([a-f0-9-]{36})(\/probe)?$/),existing=selected&&records.get(selected[1])
  if(init.method==='GET')return existing&&existing.owner_user_id===owner?json({item:existing}):json({error:'model_connection_not_found'},404)
  if(init.headers['X-AgentStudio-Expected-Employee']!==owner)return json({error:'employee_session_changed'},409)
  let response
  if(path==='/api/v2/model-connections'&&init.method==='POST'){
   const selectedId=nextCreated++===0?createdId:'55555555-5555-4555-8555-555555555555',item=row({...body,id:selectedId,owner_user_id:owner,revision:1,status:'untested',last_latency_ms:0,last_checked_at:null,last_error:'',api_key_tail:body.api_key.slice(-4)})
   delete item.api_key;records.set(item.id,item);response=json({item},201)
  }else if(!existing||existing.owner_user_id!==owner)return json({error:'model_connection_not_found'},404)
  else if(body.expected_revision!==existing.revision)return json({error:'revision_conflict'},409)
  else if(selected[2]&&init.method==='POST'){
   const item={...existing,status:'ok',last_latency_ms:9,last_checked_at:'2026-10-30T01:00:00.000Z',revision:existing.revision+1,updated_at:'2026-10-30T01:00:00.000Z'};records.set(item.id,item);response=json({item,mode:'read_only_provider_models_probe'})
  }else if(init.method==='PATCH'){
   const {expected_revision,api_key,...fields}=body,item={...existing,...fields,api_key_tail:api_key?api_key.slice(-4):existing.api_key_tail,revision:existing.revision+1,status:'untested',last_latency_ms:0,last_checked_at:null,last_error:'',updated_at:'2026-10-30T01:00:00.000Z'};records.set(item.id,item);response=json({item})
  }else if(init.method==='DELETE'){records.delete(existing.id);response=json({ok:true,id:existing.id})}
  else return json({error:'method_not_allowed'},405)
  if(options.afterWrite)return options.afterWrite(request,response,records)
  return response
 }
 return{transport,requests,records,caps,setOwner(value){owner=value},writes:()=>requests.filter(v=>v.init.method!=='GET')}
}
