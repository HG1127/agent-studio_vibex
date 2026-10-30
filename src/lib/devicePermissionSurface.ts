import type {LocalTool} from './localDevices'
import {localRootOptions} from './localDeviceActions.ts'
export type PermissionPanel='sites'|'files'
export const PERMISSION_EDITOR_TOOL='connector.open_permissions'
/** Only authenticated device catalog facts, never an invented local URL. */
export function devicePermissionSurface(tools:readonly LocalTool[]){
 const browser=tools.find(t=>t.name==='browser.browser_navigate')
 const raw=browser?.inputSchema['x-studio-allowed-origins']
 const sites=Array.isArray(raw)?[...new Set(raw.filter((v):v is string=>{
  if(typeof v!=='string'||v.length>1000)return false
  try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&u.origin===v&&!u.username&&!u.password}catch{return false}
 }))].slice(0,12):[]
  const filesEnabled=!!tools.find(t=>t.name==='files.list'),browserEnabled=!!browser
  const writable=new Set(localRootOptions(tools.find(t=>t.name==='files.write')).map(r=>r.id))
  const roots=localRootOptions(tools.find(t=>t.name==='files.list')).map(r=>({...r,writable:writable.has(r.id)}))
  const entry=tools.find(t=>t.name===PERMISSION_EDITOR_TOOL)
  const canOpen=entry?.inputSchema['x-studio-ui-entry']==='permissions-v1'
  const version=entry?.inputSchema['x-studio-connector-version']
  const revisions=tools.filter(t=>t.name!==PERMISSION_EDITOR_TOOL).map(t=>t.inputSchema['x-studio-permission-revision']).filter((v):v is string=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v))
  return {sites,roots,canOpen,browserEnabled,filesEnabled,version:typeof version==='string'&&/^[0-9A-Za-z.-]{1,40}$/.test(version)?version:'',revision:revisions.length&&new Set(revisions).size===1?revisions[0]:''}}
export function permissionEntryInput(panel:PermissionPanel){
 if(panel!=='sites'&&panel!=='files')throw Error('授权管理分类无效')
 return {tool:PERMISSION_EDITOR_TOOL,arguments:{panel}}
}
