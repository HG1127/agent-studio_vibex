import type {LocalTool} from './localDevices'
import {localRelativePath,localRootOptions} from './localDeviceActions.ts'

/** Current wire receipts are bounded. Never edit a truncated preview. */
export const WORKSPACE_EDIT_BYTES=15000
export type WorkspaceStat={root:string;path:string;size:number;sha256:string;directory:boolean}
export type WorkspaceTrash={trash_id:string;path:string;size:number;created_at:string|number}
export const WORKSPACE_ACTIONS:Record<string,string>={
 'files.list':'浏览目录','files.read':'读取文本','files.stat':'核对文件版本','files.write':'新建文本',
 'files.update':'保存修改','files.mkdir':'新建文件夹','files.copy':'复制文件','files.move':'移动或重命名',
 'files.trash':'移入可恢复回收区','files.trash_list':'查看回收记录','files.restore':'恢复文件',
 'files.open':'用电脑软件打开','files.reveal':'在电脑中定位',
}
export function workspaceAllows(tools:readonly LocalTool[],name:string,root:string){
 return localRootOptions(tools.find(t=>t.name===name)).some(r=>r.id===root)
}

export const WORKSPACE_PERMISSION_ACTIONS=[
 {tool:'files.write',label:'新建文件'},
 {tool:'files.mkdir',label:'新建文件夹'},
 {tool:'files.copy',label:'复制文件'},
 {tool:'files.update',label:'编辑并保存'},
 {tool:'files.move',label:'移动 / 重命名'},
 {tool:'files.trash',label:'可恢复删除'},
 {tool:'files.trash_list',label:'查看回收记录'},
 {tool:'files.restore',label:'恢复文件'},
 {tool:'files.open',label:'用本机软件打开'},
 {tool:'files.reveal',label:'在本机定位文件'},
] as const
export type WorkspaceActionAvailability={tool:string;label:string;available:boolean;reason:'available'|'permission'|'connector'}
/** Distinguish a current connector's deliberately closed grant from an old
 * connector that has not advertised the file-action protocol yet. */
export function workspaceActionAvailability(tools:readonly LocalTool[],root:string):WorkspaceActionAvailability[]{
 const modern=tools.some(t=>t.name==='files.stat')
 return WORKSPACE_PERMISSION_ACTIONS.map(({tool,label})=>{
  const available=workspaceAllows(tools,tool,root)
  return {tool,label,available,reason:available?'available':modern?'permission':'connector'}
 })
}
export function workspaceStat(raw:string,root:string,file:string):WorkspaceStat{
 const v=JSON.parse(raw) as Record<string,unknown>
 const p=localRelativePath(file,true)
 if(!v||v.root!==root||v.path!==p||typeof v.directory!=='boolean'||!Number.isSafeInteger(v.size)||Number(v.size)<0||typeof v.sha256!=='string'||(!v.directory&&!/^[a-f0-9]{64}$/.test(v.sha256)))throw Error('文件版本回执无法核实，禁止覆盖。')
 return {root,path:p,size:Number(v.size),sha256:v.sha256,directory:v.directory}
}
export async function workspaceTextVerified(stat:WorkspaceStat,text:string):Promise<boolean>{
 if(stat.directory)return false
 const data=new TextEncoder().encode(text)
 if(data.length!==stat.size||data.length>WORKSPACE_EDIT_BYTES||!globalThis.crypto?.subtle)return false
 const digest=await crypto.subtle.digest('SHA-256',data)
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===stat.sha256
}
export function workspaceTextPayload(text:string){
 if(new TextEncoder().encode(text).length>WORKSPACE_EDIT_BYTES)throw Error('当前工作台编辑上限为 15,000 字节，请使用本机编辑器处理更大的文件。')
 // JSON escapes also count toward the existing 24,000-character job envelope.
 if(JSON.stringify(text).length>21000)throw Error('内容包含过多转义字符，超过任务传输上限；请在本机编辑。')
 return text
}
export function workspaceTrash(raw:string):{entries:WorkspaceTrash[];truncated:boolean}{
 const v=JSON.parse(raw) as {entries?:unknown[];truncated?:boolean}
 if(!v||!Array.isArray(v.entries)||v.entries.length>200)throw Error('回收记录无法核实，请刷新；未当作空回收区。')
 return {truncated:v.truncated===true,entries:v.entries.map(row=>{
  if(!row||typeof row!=='object')throw Error('回收记录格式无效。')
  const r=row as Record<string,unknown>
  if(typeof r.trash_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(r.trash_id)||typeof r.path!=='string'||!Number.isSafeInteger(r.size)||Number(r.size)<0||!['string','number'].includes(typeof r.created_at))throw Error('回收记录格式无效。')
  return {trash_id:r.trash_id,path:localRelativePath(r.path,true),size:Number(r.size),created_at:r.created_at as string|number}
 })}
}
export function workspaceError(error:unknown):string{
 const raw=error instanceof Error?error.message:String(error)
 const messages:Record<string,string>={
  file_hash_conflict:'文件已被其他程序修改，未执行覆盖或删除。请重新读取；当前编辑草稿仍保留。',
  destination_exists:'目标名称已存在，未覆盖原文件。请使用其他名称。',
  file_source_changed:'文件在读取期间发生变化，未使用过期内容继续修改。请重新读取。',
  file_effect_uncertain:'文件操作部分结果待核实，请查看恢复区和原文件；不要直接重复执行。',
  file_conflict:'文件已被其他程序修改，未覆盖。请重新读取并核对后再保存。',
  file_version_conflict:'文件版本已变化，未执行覆盖或删除，请重新读取。',
  expected_sha256_mismatch:'文件版本已变化，未执行修改，请重新读取。',
  workspace_read_only:'这个目录是只读的。请在授权管理中明确开放所需操作。',
  capability_denied:'这项文件操作尚未授权，请在授权管理中单独开启。',
  permission_scope_changed:'授权范围已变化。草稿保留，请核对最新权限并重新读取文件。',
  EEXIST:'目标名称已存在，未覆盖原文件。请换一个名称。',
  ENOENT:'文件已移动或不存在，请刷新目录后再操作。',
  path_denied:'路径不在允许的工作目录中，未执行操作。',
  linked_path_denied:'不允许通过符号链接或硬链接访问其他文件。',
  file_not_plain_text:'这不是可直接读取的 UTF-8 文本。请用电脑软件打开。',
 }
 const key=Object.keys(messages).find(k=>raw===k||raw.includes(k))
 return key?messages[key]:raw.slice(0,500)
}
