import {PgNativeInternalShareError,type PgNativeInternalShareApi} from './pgNativeInternalShare.ts'
import {createPgNativeInternalShareSession,emptyInternalShareView,type PgNativeInternalShareSession} from './pgNativeInternalShareSession.ts'
import {internalShareId,type InternalSharePreview} from '../../shared/agent-internal-share-contract.ts'

export type OwnSpec={id:string;name:string}
export type Invite={id:string;name:string;spec_id:string;created_ms:number;expires_ms:number;used_ms:number;revoked:boolean;status?:'active'|'used'|'revoked'|'expired'|'inactive'}
export type SafeSpec={goal:string;task_scope:string;deliverables:string[];tools:string[];task_plan:string[];done_criteria:string[];knowledge_base_ids:[];require_approval:true}
export type Preview={ok:true;name:string;preview_hash:string;preview_spec:SafeSpec;warning:string}
export type Created={ok:true;share_code:string;expires_ms:number;id:string;name:string}
export type Redeemed={ok:true;spec_id:string;message:string}
export type OriginalInternalTemplatesView={ownSpecs:OwnSpec[];invites:Invite[];selectedId:string;preview:Preview|null;reviewed:boolean;created:Created|null;code:string;redeemed:Redeemed|null;
 notice:string;error:string;loading:boolean;busy:boolean;loginRequired:boolean;checkedAt:number;listReady:boolean;writeDisabled:boolean}
type Capabilities={internal_share_available?:boolean;internal_share_writes_enabled?:boolean;config_writes_enabled?:boolean}
type Ports={api:PgNativeInternalShareApi;currentEmployee:()=>string|null;verifyEmployee:()=>Promise<string>;
 capabilities:()=>Promise<Capabilities>;copyText:(value:string)=>Promise<void>;onChange:(view:OriginalInternalTemplatesView)=>void;now?:()=>number}
const scopeChanged='账号已变化，已清除原账号的共享草稿和结果。请刷新并重新核对。'
const pendingMessage='本次结果尚未确认，请点击刷新查询原操作结果，避免重复提交。'
export const emptyOriginalInternalTemplatesView=(now=Date.now()):OriginalInternalTemplatesView=>({ownSpecs:[],invites:[],selectedId:'',preview:null,reviewed:false,created:null,code:'',redeemed:null,
 notice:'',error:'',loading:true,busy:false,loginRequired:false,checkedAt:now,listReady:false,writeDisabled:true})
function previewForOriginalPage(value:InternalSharePreview):Preview{
 const removed=value.removed
 return{ok:true,name:value.name,preview_hash:value.preview_hash,preview_spec:value.snapshot.spec,
  warning:`这是服务端核对后的实际副本：${removed.model_binding?'已移除':'不含'}模型绑定；已移除 ${removed.http_tools} 个 HTTP 工具、${removed.mcp_tools} 个 MCP 工具、${removed.knowledge_bases} 个知识库关联、${removed.quality_checks} 项质量检查、${removed.unknown_tools} 项未支持工具和 ${removed.unknown_fields} 项未支持字段。接收方须重新选择自己的资源与执行授权。`}
}
/** Original-page business bridge only. The actual API retains Cookie/Origin/CSRF,
 * server identity/owner checks, closed DTOs, preview hashes and receipt matching.
 * Account observations below are UI fences, never authentication authority. */
export function createOriginalInternalTemplatesController(ports:Ports){
 const now=ports.now??Date.now
 let epoch=0,owner='',disposed=false,checking=false,operation=false,suspended=false,session:PgNativeInternalShareSession|null=null
 let native=emptyInternalShareView(),view=emptyOriginalInternalTemplatesView(now()),localError='',localNotice='',loginRequired=false,previewHidden=false,redeemedHidden=false
 function publish(){
  if(disposed)return
  if(suspended){view={...emptyOriginalInternalTemplatesView(now()),loading:checking,busy:checking||operation,
   error:'暂时无法验证员工身份或共享服务，原操作结果仍未确认。请刷新核对原结果。'};ports.onChange(view);return}
  const list=native.list,listReady=native.listStatus==='ready'&&list!==null,receipt=native.receipt
  const selected=list?.specs.some(item=>item.id===native.selected)?native.selected:list?.specs[0]?.id??''
  view={ownSpecs:list?.specs??[],invites:list?.invites??[],selectedId:selected,
   preview:native.preview&&!previewHidden?previewForOriginalPage(native.preview):null,reviewed:native.confirmed,
   created:receipt?.action==='create'&&native.code?{ok:true,share_code:native.code,expires_ms:receipt.expires_ms,id:receipt.id,name:receipt.name}:null,
   code:native.redeemInput,redeemed:receipt?.action==='redeem'&&!redeemedHidden?{ok:true,spec_id:receipt.spec_id,message:'Agent 已复制到你的工作台，请使用自己的模型与知识库连接并试运行。'}:null,
   notice:localNotice||native.notice,error:localError||(native.pending?pendingMessage:native.listStatus==='error'?'共享列表读取失败。'+native.error:native.active&&!native.writes?'当前共享修改未开放；仅显示服务端实际读取到的记录。':native.error),
   loading:checking||native.active&&native.available&&['idle','loading'].includes(native.listStatus),busy:checking||operation||native.busy,
   loginRequired,checkedAt:now(),listReady,writeDisabled:checking||operation||native.busy||!native.active||!native.available||!native.writes||!listReady||native.pending!==null}
  ports.onChange(view)
 }
 function invalidate(message=scopeChanged,expired=false){
  epoch++;session?.dispose();session=null;owner='';native=emptyInternalShareView();checking=false;operation=false
  localError=message;localNotice='';loginRequired=expired;suspended=false;previewHidden=false;redeemedHidden=false;publish()
 }
 const owned=(stamp:number,employee:string)=>!disposed&&stamp===epoch&&owner===employee
 const current=(stamp:number,employee:string)=>!disposed&&stamp===epoch&&owner===employee&&ports.currentEmployee()===employee
 function suspendUnknown(){if(native.pending){const changed=!suspended||checking||operation;suspended=true;checking=false;operation=false;if(changed)publish();return true}return false}
 async function verified(stamp:number,employee:string){
  let actual:string
  try{actual=internalShareId(await ports.verifyEmployee())}catch(error){
   if(owned(stamp,employee)){
    if(error instanceof PgNativeInternalShareError&&(error.status===401||error.status===403))invalidate('员工身份已失效，请重新登录后核对共享操作。',true)
    else if(!suspendUnknown())invalidate('暂时无法验证员工身份，请刷新重试。')
   }
   throw error
  }
  if(!current(stamp,employee)||actual!==employee){
   if(owned(stamp,employee)&&actual===employee&&ports.currentEmployee()===null&&suspendUnknown())throw new PgNativeInternalShareError(503,'original_internal_share_identity_unavailable')
   if(!disposed&&stamp===epoch)invalidate();throw new PgNativeInternalShareError(401,'original_internal_share_employee_changed',true)
  }
  suspended=false
 }
 function scopedApi(stamp:number,employee:string):PgNativeInternalShareApi{
  async function call<T>(work:()=>Promise<T>):Promise<T>{
   await verified(stamp,employee)
   let value:T
   try{value=await work()}catch(error){if(owned(stamp,employee)&&error instanceof PgNativeInternalShareError&&error.status===409&&error.code==='agent_internal_share_employee_changed')invalidate();throw error}
   // Even a valid late reply may not release another account's list, preview,
   // receipt or once-visible code. Unknown writes are never auto-replayed.
   await verified(stamp,employee)
   return value
  }
  return{list:signal=>call(()=>ports.api.list(signal)),preview:(id,signal)=>call(()=>ports.api.preview(id,signal)),
   record:(intent,signal)=>call(()=>ports.api.record(intent,signal,employee)),confirm:(intent,signal)=>call(()=>ports.api.confirm(intent,signal,employee))}
 }
 async function start(){
  if(disposed||checking||operation||native.busy)return
  // Clear a known changed account before any asynchronous request can settle.
  if(owner&&ports.currentEmployee()!==owner){if(ports.currentEmployee()!==null||!suspendUnknown())invalidate()}
  checking=true;localError='';localNotice='';publish();const stamp=epoch
  try{
   const employee=internalShareId(await ports.verifyEmployee()),cap=await ports.capabilities()
   if(disposed||stamp!==epoch)return
   if(ports.currentEmployee()!==employee){invalidate();return}
   if(owner&&owner!==employee){invalidate();return}
   if(cap.internal_share_available!==true){if(!suspendUnknown())invalidate('PG 团队共享服务尚未通过可用性检查，无法读取或修改共享记录。');return}
   const writes=cap.internal_share_writes_enabled===true&&cap.config_writes_enabled===true
   owner=employee;loginRequired=false;checking=false;suspended=false
   if(!session){const generation=epoch,api=scopedApi(generation,employee)
    session=createPgNativeInternalShareSession({api,employeeId:employee,scopeKey:'original-internal-templates:'+generation,
     onChange(value){if(!current(generation,employee)){
      if(owned(generation,employee)&&ports.currentEmployee()===null&&value.pending){native=value;suspendUnknown();return}
      if(!disposed&&generation===epoch)invalidate();return
     }native=value;previewHidden=false;localError='';localNotice='';publish()},
     onExpired(){if(!disposed&&generation===epoch)invalidate('员工身份或共享权限已失效，请重新登录后核对。',true)}})
   }
   if(!writes)localError='当前共享修改未开放；仅显示服务端实际读取到的记录。'
   const wasActive=native.active
   session.activate(true,true,writes)
   if(wasActive){if(native.pending)await session.confirmOriginal();if(!native.pending)await session.refresh()}
  }catch(error){if(!disposed&&stamp===epoch){
   const auth=error instanceof PgNativeInternalShareError&&(error.status===401||error.status===403)
   if(auth||!suspendUnknown())invalidate(auth?'员工身份已失效，请重新登录。':'暂时无法验证员工身份或共享能力，请刷新重试。',auth)
  }}finally{if(!disposed&&stamp===epoch){checking=false;publish()}}
 }
 function localWriteAllowed(){
  if(disposed)return false
  if(!owner||ports.currentEmployee()!==owner){if(ports.currentEmployee()!==null||!suspendUnknown())invalidate();return false}
  if(suspended){localError=pendingMessage;publish();return false}
  if(native.pending){localError=pendingMessage;publish();return false}
  if(checking||operation||native.busy){localError='共享操作仍在进行，请等待原请求结果。';publish();return false}
  if(!session||!native.active||!native.available||!native.writes||native.listStatus!=='ready'){
   localError='当前共享修改不可用，请先刷新并核对服务端权限。';publish();return false
  }
  return true
 }
 async function command(work:(active:PgNativeInternalShareSession)=>Promise<void>){
  if(!localWriteAllowed()||!session)return
  const active=session,stamp=epoch,employee=owner;operation=true;localError='';localNotice='';publish()
  try{
   await verified(stamp,employee);if(!current(stamp,employee))return
   const previous=native.receipt?.request_id
   await work(active)
   if(current(stamp,employee)&&native.receipt&&native.receipt.request_id!==previous&&!native.pending)await active.refresh()
  }catch{if(current(stamp,employee)){localError=native.pending?pendingMessage:'无法完成此共享操作，请刷新后重新核对。';publish()}}
  finally{if(owned(stamp,employee)){operation=false;publish()}}
 }
 return{
  getView:()=>view,start,
  reconcile(){if(owner&&ports.currentEmployee()!==owner){if(ports.currentEmployee()!==null||!suspendUnknown())invalidate()}},
  handleRefresh:async()=>{
   if(disposed||checking||operation||native.busy)return
   if(!native.pending){await start();return}
   if(!session||!owner){await start();return}
   const stamp=epoch,employee=owner;checking=true;localError='';localNotice='';publish()
   try{await verified(stamp,employee);if(!current(stamp,employee))return
    if(native.pending)await session.confirmOriginal()
    if(current(stamp,employee)&&!native.pending)await session.refresh()
   }catch{if(current(stamp,employee)){localError=native.pending?pendingMessage:'共享列表读取失败，请刷新重试。';publish()}}
   finally{if(owned(stamp,employee)){checking=false;publish()}}
  },
  setSelectedId(id:string){if(!localWriteAllowed()||!session)return;try{const selected=internalShareId(id);if(!native.list?.specs.some(v=>v.id===selected))throw Error();session.select(selected);redeemedHidden=false}catch{localError='所选 Agent 不在服务端返回的本人列表中。';publish()}},
  setPreview(value:null){if(value!==null){localError='未映射的共享预览修改已拒绝。';publish();return}previewHidden=true;publish()},
  setReviewed(value:boolean){if(!localWriteAllowed()||!session)return;if(typeof value!=='boolean'){localError='无效的共享内容确认。';publish();return}session.confirmReview(value)},
  setCreated(value:null){if(value!==null){localError='未映射的共享码修改已拒绝。';publish();return}session?.hideCode()},
  setError(value:string){if(value===''){localError='';publish()}else{localError='未映射的共享状态修改已拒绝。';publish()}},
  setCode(value:string){if(!localWriteAllowed()||!session)return;if(typeof value!=='string'){localError='无效的共享码输入。';publish();return}redeemedHidden=true;session.setRedeemInput(value.trim())},
  setRedeemed(value:null){if(value!==null){localError='未映射的领取结果修改已拒绝。';publish();return}redeemedHidden=true;publish()},
  handlePreview:()=>command(async active=>{const selected=view.selectedId;if(!selected){localError='请先选择本人 Agent。';publish();return}active.select(selected);await active.preview()}),
  handleCreate:()=>command(async active=>{if(!native.preview||!native.confirmed||previewHidden){localError='请先预览并确认实际分享内容。';publish();return}await active.create()}),
  handleRedeem:()=>command(async active=>{redeemedHidden=false;await active.redeem()}),
  handleRevoke:(id:string)=>command(async active=>{if(!native.list?.invites.some(v=>v.id===id&&v.status==='active'&&!v.revoked&&!v.used_ms&&v.expires_ms>now())){localError='该共享记录当前不可撤销，请刷新核对。';publish();return}active.chooseRevoke(id);await active.revoke()}),
  handleCopy:async()=>{if(disposed||!view.created||checking||operation)return;const stamp=epoch,employee=owner,code=view.created.share_code
   try{await verified(stamp,employee);if(!current(stamp,employee)||view.created?.share_code!==code)return;await ports.copyText(code);if(current(stamp,employee)){localNotice='分享码已复制。请通过公司的授权沟通渠道发送，不要发到公开群组。';publish()}}
   catch{if(current(stamp,employee)){localError='剪贴板复制失败，请手动复制当前仍显示的分享码。';publish()}}},
  dispose(){if(disposed)return;disposed=true;epoch++;session?.dispose();session=null;owner='';native=emptyInternalShareView();view=emptyOriginalInternalTemplatesView(now())},
 }
}
export type OriginalInternalTemplatesController=ReturnType<typeof createOriginalInternalTemplatesController>
