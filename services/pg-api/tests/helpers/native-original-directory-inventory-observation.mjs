// Bounded diagnostic DATA only. Never stores identity, URL, query, body or Error.
const routes=new Map([['/api/native-auth/me','me'],['/api/v2/local-devices','devices'],['/api/v2/local-device-pairings','pairings']])
const phases=new Set(['admitted','headers','queued','wire_error','body_error'])
export function createOriginalDirectoryInventoryObservation(){
 const rows=[];let truncated=false
 return Object.freeze({
  observe(method,route,phase,status=null){
   try{
    if(method!=='GET'||typeof route!=='string'||typeof phase!=='string'||!phases.has(phase))return
    const key=routes.get(route);if(!key)return
    if(rows.length>=24){truncated=true;return}
    rows.push(Object.freeze({phase,route:key,status:Number.isSafeInteger(status)&&status>=100&&status<=599?status:null}))
   }catch{}
  },
  snapshot(){return Object.freeze({event:'original_directory_inventory_wire_observation',observations:Object.freeze(rows.slice()),truncated,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})}
 })
}
