import type {LocalDevice} from './localDevices'
import type {Permissions} from './workbenchPermissions'
import type {ConnectorRelease} from './connectorRelease'

export type PermissionHealth={owner:string;deviceId:string;permissions:Permissions|null;error:boolean}
type Version={core:number[];pre:string[]}
function versionParts(value:unknown):Version|null{
 if(typeof value!=='string'||value.length>60)return null
 const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value)
 if(!match)return null
 const core=match.slice(1,4).map(Number),pre=match[4]?.split('.')||[]
 if(core.some(n=>!Number.isSafeInteger(n))||pre.some(p=>/^\d+$/.test(p)&&(!Number.isSafeInteger(Number(p))||p.length>1&&p[0]==='0')))return null
 return {core,pre}
}
export function safeConnectorVersion(value:unknown):string|null{return versionParts(value)?String(value):null}
/** Numeric prerelease comparison: preview.14 is newer than preview.9. Unknown values never imply an upgrade. */
export function compareConnectorVersions(a:unknown,b:unknown):number|null{
 const x=versionParts(a),y=versionParts(b);if(!x||!y)return null
 for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]<y.core[i]?-1:1
 if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
  const l=x.pre[i],r=y.pre[i];if(l===r)continue
  if(l===undefined||r===undefined)return l===undefined?-1:1
  const ln=/^\d+$/.test(l),rn=/^\d+$/.test(r)
  if(ln&&rn)return Number(l)<Number(r)?-1:1
  if(ln!==rn)return ln?-1:1
  return l<r?-1:1
 }
 return 0
}
export function describeConnectorExperience({device,owner,health,verified,now,release}:{device:LocalDevice;owner:string;health:PermissionHealth|null;verified:boolean;now:number;release:ConnectorRelease|null}){
 const scoped=!!owner&&health?.owner===owner&&health.deviceId===device.id?health:null
 const meta=scoped?.permissions||null
 const recent=(time:number)=>Number.isFinite(time)&&time>0&&now>=time&&now-time<45000
 const online=verified&&!device.revoked&&recent(device.seen_ms)
 const fresh=online&&!!scoped&&!scoped.error&&!!meta&&meta.device_id===device.id&&recent(meta.seen_ms)
 const version=safeConnectorVersion(meta?.version)
 const applied=fresh&&meta?.available===true&&meta.state==='online'&&!!meta.revision&&meta.revision===meta.applied_revision
 const relation=release&&version?compareConnectorVersions(version,release.version):null
 const update=relation!==null&&relation<0
 const state=!verified?'unverified':device.revoked?'revoked':!online?(device.paired||device.seen_ms>0?'offline':'pairing'):scoped?.error?'unverified':!scoped||!meta?'loading':!fresh?'stale':applied?'ready':'syncing'
 const label={unverified:'状态未核实',revoked:'连接已撤销',offline:'电脑离线',pairing:'等待首次连接',loading:'正在核实运行信息',stale:'运行信息已过期',ready:'连接与授权已就绪',syncing:'正在核实授权生效'}[state]
 return {state,label,online,fresh,applied,version,update,relation,versionLabel:fresh?'当前运行版本':'最近上报版本（当前未核实）',
  next:state==='unverified'?'暂时无法核实当前连接，不代表设备已删除；先重新读取状态，不要重复配对。':
   state==='offline'?'启动原电脑上的连接器，恢复这条已有连接；不需要重新生成连接文件。':
   state==='pairing'?'请先完成本机连接确认；未收到实际心跳前不会标记在线。':
   state==='revoked'?'原连接已撤销，不能继续使用原凭据。':
   state==='syncing'?'连接器尚未确认新的授权已生效，请等待回执或到授权管理核实。':
   state==='ready'&&update?'这台电脑仍在运行旧版。下载新版、刷新网页都不会替换已经运行的进程。':
   state==='ready'?'选择文件工作区或浏览器开始操作；进入页面不会自动执行任务。':
   '正在核对这条设备的实际运行信息；旧的版本记录不能作为本次上线证明。'}
}
