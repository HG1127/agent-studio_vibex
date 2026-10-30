// Terminal DATA for actual withActor/query/client control flow only, never SQL.
import {createHash} from 'node:crypto'
import {ModelConnectionRepository} from '../../services/pg-api/src/model-connection-repository.ts'
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',key=Buffer.alloc(32,19),identity={issuer:'terminal-native',subject:'terminal-native'}
export const uid=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0')
export function model(i,extra={}){return{id:uid(i),owner_user_id:owner,name:'Synthetic owner model '+i,provider:'openai',base_url:'https://api.openai.com/v1',api_key_tail:'7070',enabled:true,status:'untested',last_latency_ms:0,last_checked_at:null,models:['synthetic-configured-model'],last_error:'',revision:1,created_at:'2026-10-29T00:00:00.000Z',updated_at:'2026-10-30T00:00:00.000Z',...extra}}
export function terminalRepository(count=137,options={}){let actor=owner,clock=Date.parse('2026-10-30T01:00:00Z'),brokerReads=0;const rows=Array.from({length:count},(_,i)=>model(i+1)),queries=[]
 const pool={async connect(){return{async query(sql,args=[]){queries.push({sql,args});if(sql.includes('identity_user_id'))return{rows:[{id:actor}]};if(sql.includes('AS ok'))return{rows:[{ok:options.context!==false}]};if(sql.includes('FROM state LEFT JOIN selected')){
  const all=rows.filter(v=>v.owner_user_id===args[0]).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id)),fingerprint=createHash('sha256').update(JSON.stringify(all)).digest('hex'),page=all.filter(v=>args[1]===null||position(v)<args[1]||position(v)===args[1]&&v.id>args[2]).slice(0,args[3]),state={page_total:String(all.length),page_fingerprint:fingerprint}
  return{rows:page.length?page.map(v=>({...v,revision:String(v.revision),...state,page_position_time:position(v)})):[{id:null,...state}]}
 }if(sql.includes('FROM agentstudio.model_connections')&&sql.includes('LIMIT'))return{rows:rows.filter(v=>v.owner_user_id===actor).slice(0,args[1])};return{rows:[]}},release(){}}}}
 const broker={async connect(){brokerReads++;throw Error('metadata must not read Broker')}}
 const repo=new ModelConnectionRepository(pool,key,broker)
 return{repo,pool,rows,queries,brokerReads:()=>brokerReads,setActor:value=>actor=value,clock:()=>clock,advance:ms=>clock+=ms}
}
export function position(row){return row.updated_at.replace(/\.(\d{3})Z$/,'.$1000Z')}
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
