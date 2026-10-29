import {PgNativePilotError} from './pgNativePilotApi.ts'
import {freezeToolHubIntent} from './pgNativeToolHub.ts'
import type {PgNativeToolHubApi,ToolHubIntent,ToolTrialReceipt} from './pgNativeToolHub.ts'
type Prepared=Awaited<ReturnType<PgNativeToolHubApi['preview']>>
type View={prepared:Prepared|null;pending:Prepared|null;receipt:ToolTrialReceipt|null;busy:boolean;loading:boolean;uncertain:boolean;absent:boolean;error:string;notice:string}
const empty=():View=>({prepared:null,pending:null,receipt:null,busy:false,loading:false,uncertain:false,absent:false,error:'',notice:''})
const definite=new Set([400,401,403,404,405,409,413,415,422,429])
export function createPgNativeToolHubSession(api:PgNativeToolHubApi,options:{canWrite():boolean;onExpired():void}){
 let view=empty(),closed=false,active=false,ticket=0,flight:Promise<void>|null=null
 const listeners=new Set<()=>void>(),update=(patch:Partial<View>)=>{if(!closed){view={...view,...patch};for(const fn of listeners)fn()}}
 const failure=(error:unknown)=>{if(error instanceof PgNativePilotError&&error.status===401){controller.dispose();options.onExpired();return}update({error:error instanceof PgNativePilotError?'请求未成功（'+error.code+'）。':'回复尚未通过核对，请读取原请求回执。'})}
 function perform(work:()=>Promise<void>){if(closed||!active)return Promise.resolve();if(flight)return flight;++ticket;update({busy:true,loading:false,error:'',notice:''});flight=Promise.resolve().then(work).finally(()=>{flight=null;update({busy:false})});return flight}
 async function send(original:Prepared){
  const wasUncertain=view.uncertain;update({pending:original,prepared:null,absent:false})
  try{const result=await api.submit(original.body,original.graph_sha256);if(closed)return;update({pending:null,receipt:result.receipt,uncertain:false,notice:result.replayed?'已确认原提交，未创建重复任务。':'试调任务已提交，请打开原任务逐步审批。'})}
  catch(error){if(closed)return;if(!wasUncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pending:null,uncertain:false});else update({uncertain:true});failure(error)}
 }
 const controller={
  snapshot:()=>view,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  navigationBlocked:()=>!closed&&Boolean(flight||view.busy||view.pending),
  dispose(){closed=true;active=false;++ticket;view=empty();listeners.clear()},
  setActive(value:boolean){if(closed)return;active=value;if(!value){++ticket;update({prepared:null})}},
  invalidatePreview(){if(!view.pending){++ticket;update({prepared:null,receipt:null,notice:''})}},
  preview(raw:ToolHubIntent){if(view.pending||!options.canWrite())return Promise.resolve();let frozen:Readonly<ToolHubIntent>;try{frozen=freezeToolHubIntent(raw)}catch{update({prepared:null,error:'请核对工具、参数 JSON 及本人资源版本。'});return Promise.resolve()}return perform(async()=>{const read=++ticket;update({prepared:null,receipt:null});try{const prepared=await api.preview(frozen);if(!closed&&active&&read===ticket)update({prepared,notice:'请核对目标和参数后提交这一次试调。'})}catch(error){if(!closed&&active&&read===ticket)failure(error)}})},
  submit(){const original=view.prepared;if(!original||view.pending||!options.canWrite())return Promise.resolve();return perform(()=>send(original))},
  confirm(){const original=view.pending;if(!original)return Promise.resolve();return perform(async()=>{try{const result=await api.confirm(original.body.request_id,original.request_sha256);if(closed)return;if(result.confirmed&&result.receipt)update({pending:null,receipt:result.receipt,uncertain:false,absent:false,notice:'已只读确认原提交。'});else update({absent:true,notice:'尚未查到这一次提交。可继续读取回执，或明确重发同一个请求；不会更换操作编号。'})}catch(error){if(!closed)failure(error)}})},
  retryOriginal(){const original=view.pending;if(!original||!view.absent||!options.canWrite())return Promise.resolve();return perform(()=>send(original))},
 }
 return controller
}
export type PgNativeToolHubSession=ReturnType<typeof createPgNativeToolHubSession>
