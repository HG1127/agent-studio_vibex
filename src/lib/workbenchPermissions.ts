import {localApi} from './localDevices'
import {normalizeWebsite} from './permissionEditor'
export type FileCapabilities={edit:boolean;move:boolean;delete:boolean;open:boolean}
export const fileCapabilityLabels:Record<keyof FileCapabilities,string>={edit:'编辑已有文件',move:'移动文件',delete:'可恢复删除与恢复',open:'在连接电脑打开 / 定位'}
export const emptyFileCapabilities=():FileCapabilities=>({edit:false,move:false,delete:false,open:false})
export function parseFileCapabilities(raw:unknown,readOnly=false):FileCapabilities{
 if(raw===undefined)return emptyFileCapabilities()
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==4||Object.keys(raw).some(k=>!(k in fileCapabilityLabels)))throw Error('文件权限格式不正确。')
 const v=raw as FileCapabilities
 if(Object.keys(fileCapabilityLabels).some(k=>typeof v[k as keyof FileCapabilities]!=='boolean')||readOnly&&(v.edit||v.move||v.delete))throw Error('文件权限与只读范围不一致。')
 return {edit:v.edit,move:v.move,delete:v.delete,open:v.open}
}
export function sameFileCapabilities(a:unknown,b:unknown){
 try{const x=parseFileCapabilities(a),y=parseFileCapabilities(b);return (Object.keys(fileCapabilityLabels) as (keyof FileCapabilities)[]).every(k=>x[k]===y[k])}catch{return false}
}
export function fileGrantLabel(g:{read_only:boolean;capabilities?:FileCapabilities}){
 const c=parseFileCapabilities(g.capabilities)
 return [g.read_only?'读取':'读取与新建',...(Object.keys(fileCapabilityLabels) as (keyof FileCapabilities)[]).filter(k=>c[k]).map(k=>fileCapabilityLabels[k])].join(' · ')
}
export type Grant={id:string;label:string;kind:'file'|'folder';read_only:boolean;capabilities:FileCapabilities}
export function matchesGrantEdit(grants:Grant[],payload:Record<string,unknown>){
 if(typeof payload.root_id!=='string')return false
 const grant=grants.find(g=>g.id===payload.root_id)
 return payload.remove===true?!grant:!!grant&&grant.read_only===payload.read_only&&payload.capabilities!==undefined&&sameFileCapabilities(grant.capabilities,payload.capabilities)
}
export type Permissions={available:boolean;device_id?:string;protocol?:string;version?:string;revision?:string;applied_revision?:string;sites:string[];grants:Grant[];seen_ms:number;state?:string;reason?:string}
export type PickedGrant={grant_id:string;label:string;kind:'file'|'folder';permission_revision:string;expires_at:number;covered_by_folder?:boolean}
export type Control={id:string;device_id:string;action:string;status:string;result:string;error:string;deadline_ms:number}
const rev=/^[a-f0-9]{24}$/
export function parsePermissions(raw:unknown,id:string):Permissions{
 if(!raw||typeof raw!=='object')throw Error('授权状态格式不正确，请刷新核实。')
 const v=raw as Permissions
 if(v.available===false&&!v.protocol)return {available:false,sites:[],grants:[],seen_ms:0,reason:v.reason}
 if(v.device_id!==id||v.protocol!=='permissions-v2'||!rev.test(v.revision||'')||!Array.isArray(v.sites)||!Array.isArray(v.grants)||v.grants.length>20||v.sites.length>12||typeof v.seen_ms!=='number')throw Error('授权状态无法核实，已暂停修改。')
 if(typeof v.available!=='boolean'||!Number.isFinite(v.seen_ms)||v.sites.some(s=>typeof s!=='string'||normalizeWebsite(s)!==s)||v.grants.some(g=>!g||typeof g.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(g.id)||typeof g.label!=='string'||g.label.length>180||!['file','folder'].includes(g.kind)||typeof g.read_only!=='boolean'))throw Error('授权清单格式不正确。')
 return {...v,grants:v.grants.map(g=>{
  if(Object.keys(g).some(k=>!['id','label','kind','read_only','capabilities'].includes(k))||g.kind==='file'&&!g.read_only)throw Error('授权清单格式不正确。')
  return {...g,capabilities:parseFileCapabilities(g.capabilities,g.read_only||g.kind==='file')}
 })}
}
export async function readPermissions(id:string,signal?:AbortSignal){return parsePermissions(await localApi<unknown>('/api/local-devices/'+id+'/permissions',undefined,signal),id)}
export function parsePicked(raw:string,revision:string):PickedGrant{
 const g=JSON.parse(raw) as PickedGrant
 if(!rev.test(g.grant_id||'')||!['file','folder'].includes(g.kind)||typeof g.label!=='string'||g.label.length>180||g.permission_revision!==revision||!Number.isFinite(g.expires_at)||g.expires_at<=Date.now()||'path' in g)throw Error('本机选择结果已过期或不匹配，请重新选择。')
 return g
}
export function normalizePermissionSite(value:string){return normalizeWebsite(value)}
export function isPermissionsReady(p:Permissions|null,now=Date.now()){
 return p?.available===true&&p.protocol==='permissions-v2'&&p.state==='online'&&rev.test(p.revision||'')&&p.revision===p.applied_revision&&Number.isFinite(p.seen_ms)&&p.seen_ms>0&&now>=p.seen_ms&&now-p.seen_ms<45000
}
