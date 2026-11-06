import {parseModelConnectionPageQuery} from '../../services/pg-api/src/model-connection-pagination.ts'
import {owner,json} from './model-pagination-terminal-data.mjs'
export function terminalPageTransport(f,options={}){const requests=[];let pageReads=0;const caps=()=>({mode:'native_pg18',config_writes_enabled:options.writes!==false,model_probe_enabled:false,...(options.ownerProtocol===false?{}:{original_model_connections_protocol:'native_model_connections_owner_cas_v1'}),...(options.protocol===false?{}:{original_model_pagination_protocol:'native_model_connections_paging_v1'}),...(options.draftOnly?{original_model_draft_probe_protocol:'native_model_draft_discovery_v1'}:{})})
 const intercept=async req=>{
  const path=new URL(req.route,'https://terminal.invalid').pathname.replace(/^\/__pg_native/,''),query=new URL(req.route,'https://terminal.invalid').search
  if(path==='/api/native-auth/capabilities')return json(caps())
  if(path==='/api/v2/model-connections'&&req.init.method==='GET'){
   if(query.includes('paging=')){pageReads++;let response;try{response=json(await f.repo.listPage({issuer:'terminal-native',subject:'terminal-native'},parseModelConnectionPageQuery(path+query),req.init.headers['X-AgentStudio-Expected-Employee']))}catch(error){response=json({error:error.code??'terminal_failed'},error.status??503)}if(options.page)return options.page(req,response,pageReads);return response}
   return json({items:f.rows.filter(v=>v.owner_user_id===owner).slice(0,50)})
  }return undefined
 }
 return{caps,requests,intercept,transport:async(route,init)=>{const req={route,init};requests.push(req);const response=await intercept(req);if(response===undefined)throw Error('unexpected terminal route');return response},pageReads:()=>pageReads}
}
