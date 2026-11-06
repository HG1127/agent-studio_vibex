// Durable original-request recovery only. Ports supply verified owner/epoch and
// storage. This source is not wired to a runtime or SQL migration yet.
import {localObject,localId,localCanonical,parseLocalTransportJson} from './native-local-device-contract.mjs'
import {guidedServer} from './native-guided-contract.mjs'
import {controlIntent,controlReceipt} from './native-control-contract.mjs'
export function createNativeControlIntent({storage,api,getContext}){
 let busy=false
 function frozenIntent(raw){const v=controlIntent(parseLocalTransportJson(localCanonical(controlIntent(raw)),32768));const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x)}return x};return freeze(v)}
 function context(){const v=localObject(getContext(),['owner','epoch','server']);localId(v.owner);guidedServer(v.server);if(!Number.isSafeInteger(v.epoch)||v.epoch<0)throw Error('native_control_epoch_required');return {...v}}
 const check=before=>{if(localCanonical(before)!==localCanonical(context()))throw Error('native_control_context_changed')}
 async function load(ctx){const value=await storage.load(ctx.owner,ctx.server);check(ctx);if(value===null)return null;const v=localObject(value,['protocol','owner','server','epoch','pending']);if(v.protocol!=='native_control_intent_v1'||v.owner!==ctx.owner||v.server!==ctx.server||!Number.isSafeInteger(v.epoch)||v.epoch<0)throw Error('native_control_storage_source_changed');return v.pending===null?null:frozenIntent(v.pending)}
 async function save(ctx,pending){check(ctx);await storage.save({protocol:'native_control_intent_v1',owner:ctx.owner,server:ctx.server,epoch:ctx.epoch,pending});check(ctx)}
 async function accept(ctx,pending,value){const reply=await controlReceipt(value,pending);check(ctx);await save(ctx,null);return reply}
 async function exclusive(work){if(busy)throw Error('native_control_intent_busy');busy=true;try{return await work()}finally{busy=false}}
 async function confirm(ctx,pending){check(ctx);const value=await api.confirm(pending,ctx);check(ctx);if(value?.replayed!==true)throw Error('native_control_confirm_not_read_only');return accept(ctx,pending,value)}
 return Object.freeze({
  record:raw=>exclusive(async()=>{const ctx=context(),intent=frozenIntent(raw),pending=await load(ctx);check(ctx);if(pending){if(localCanonical(pending)!==localCanonical(intent))throw Error('native_control_original_request_pending');return confirm(ctx,pending)}await save(ctx,intent);check(ctx);const value=await api.record(intent,ctx);check(ctx);return accept(ctx,intent,value)}),
  recover:()=>exclusive(async()=>{const ctx=context(),pending=await load(ctx);check(ctx);if(!pending)throw Error('native_control_no_pending_request');return confirm(ctx,pending)}),
 })
}
