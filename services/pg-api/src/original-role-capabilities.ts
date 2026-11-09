import {HttpError,type SqlClient,type AgentSpecInput} from './contracts.ts'
import {resolveAgentMcpTools} from './mcp-binding-resources.ts'
import {parseLocalDevice,type LocalBinding} from '../../../shared/native-local-device-contract.mjs'
import type {OriginalRoleExtension,OriginalRoleCapabilityBinding} from '../../../shared/original-role-execution-contract.mjs'
import {roleToolSignature} from './original-role-resource-signature.mjs'
export {roleToolSignature} from './original-role-resource-signature.mjs'
export type RoleCapabilityBinding=OriginalRoleCapabilityBinding
type Fact={tool:string;signature:string;readOnly:boolean;kinds:string[];local:LocalBinding|null}
const builtin:Record<string,string>={calculate:'calculate',summarize:'text',knowledge_search:'knowledge',web_fetch:'web_fetch',web_search:'web_search'}
function localNeeds(need:OriginalRoleExtension['capability_requirements'][number],local:LocalBinding):string[]|null{
 const names=new Set(local.catalog.map(t=>t.name)),text=need.title+' '+need.purpose,required:string[]=[]
 if(need.kind==='browser')required.push('browser.browser_navigate','browser.browser_snapshot',...(need.access==='write'?['browser.browser_click','browser.browser_type']:[]),...(/截图|screenshot|visual|vision/i.test(text)?['browser.browser_take_screenshot']:[]))
 else if(need.kind==='desktop'){
  if(/文件|目录|files?|directory|文档|表格/i.test(text))required.push('files.list','files.read',...(need.access==='write'?['files.write']:[]))
  else required.push('desktop.Screenshot',...(need.access==='write'?['desktop.Click','desktop.Type']:[]))
 }else return null
 return required.every(n=>names.has(n))?required:null
}
export function bindOriginalRoleCapabilities(extension:OriginalRoleExtension,facts:Fact[]):RoleCapabilityBinding[]{
 const bindings:RoleCapabilityBinding[]=[]
 for(const need of extension.capability_requirements){
  const roleIds=need.role_ids.length?need.role_ids:[''],targets=roleIds.map(role_id=>({role_id,tools:role_id?extension.roles.find(r=>r.id===role_id)!.tools:null}))
  for(const target of targets){
   const eligible=facts.filter(f=>(!target.tools||target.tools.includes(f.tool))&&(need.suggested_tool_ids.includes(f.tool)||!['custom','integration','document'].includes(need.kind)&&f.kinds.includes(need.kind))&&(need.access==='write'||f.readOnly||!!f.local))
   const candidates=eligible.flatMap(f=>{const local_tools=f.local?localNeeds(need,f.local):[];return local_tools===null?[]:[{capability_id:need.id,role_id:target.role_id,tool:f.tool,signature:f.signature,local_tools}]})
   if(need.required&&!candidates.length)throw new HttpError(409,'original_role_capability_missing')
   bindings.push(...candidates)
  }
 }
 return bindings
}
export async function originalRoleCapabilitiesOnClient(db:SqlClient,owner:string,spec:AgentSpecInput,extension:OriginalRoleExtension,localDeviceId?:string){
 const facts:Fact[]=spec.tools.filter(t=>builtin[t]).map(tool=>({tool,signature:roleToolSignature(tool,spec),readOnly:true,kinds:[builtin[tool]!, 'custom'],local:null}))
 for(const h of spec.http_tools??[]){
  const rows=(await db.query<{revision:number|string;enabled:boolean;status:string;method:string}>('SELECT revision,enabled,status,method FROM agentstudio.tool_connections WHERE owner_user_id=$1::uuid AND id=$2::uuid FOR SHARE',[owner,h.connection_id])).rows
  if(rows.length!==1||!rows[0]!.enabled||rows[0]!.status!=='ok'||Number(rows[0]!.revision)!==h.connection_revision)throw new HttpError(409,'tool_connection_not_ready')
  facts.push({tool:h.name,signature:roleToolSignature(h.name,spec),readOnly:rows[0]!.method==='GET',kinds:['integration','custom'],local:null})
 }
 for(const m of await resolveAgentMcpTools(db,owner,spec.mcp_tools,false))facts.push({tool:m.name,signature:roleToolSignature(m.name,spec,m),readOnly:false,kinds:['integration','custom'],local:null})
 if(spec.tools.includes('local_computer')){
  if(!localDeviceId)throw new HttpError(409,'native_local_device_binding_required')
  const raw=(await db.query<{value:unknown}>('SELECT agentstudio.native_local_list() AS value')).rows[0]?.value
  if(!Array.isArray(raw))throw new HttpError(409,'native_local_device_binding_required')
  const device=raw.map(parseLocalDevice).find(d=>d.id===localDeviceId),now=Date.now()
  if(!device||device.revoked||device.seen_ms>now||now-device.seen_ms>=45000)throw new HttpError(409,'native_local_device_binding_required')
  const local={device_id:device.id,version:device.version,catalog:device.catalog,catalog_sha256:device.catalog_sha256}
  facts.push({tool:'local_computer',signature:roleToolSignature('local_computer',spec,null,local),readOnly:false,kinds:['desktop','browser'],local})
 }
 return bindOriginalRoleCapabilities(extension,facts)
}
