import {smitheryName,smitheryServer,smitheryRemoteId,safeSmitherySetupUrl} from "../../services/pg-api/src/smithery-contracts.ts"
export type PgNativeSmitheryKey={has_key:boolean;revision:number;tail:string;last_request_id:string|null}
export type PgNativeSmitheryConnection={id:string;namespace:string;remote_connection_id:string;server:string;name:string;description:string;state:string;
  revoke_requested:boolean;setup_url:string;missing:string[];last_error:string;revision:number;operation_in_flight:boolean;mcp_revision:number;enabled:boolean;mcp_status:"untested"|"ok"|"error"}
export type PgNativeSmitheryCatalog={items:{server:string;name:string;description:string;verified:boolean;deployed:boolean}[];page:number;next_page:number}
const uuid=(raw:unknown):raw is string=>typeof raw==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw)
const plain=(raw:unknown,max:number):raw is string=>typeof raw==="string"&&raw.length<=max&&!/[\u0000-\u001f\u007f]/.test(raw)
const object=(raw:unknown):Record<string,unknown>=>{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_smithery_dto");return raw as Record<string,unknown>}
export function parsePgSmitheryKey(raw:unknown):PgNativeSmitheryKey{
  const value=object(raw)
  if(typeof value.has_key!=="boolean"||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!plain(value.tail,4)||
    value.has_key&&(value.tail.length!==4||Number(value.revision)<1)||!value.has_key&&value.tail!==""||
    value.last_request_id!==null&&!uuid(value.last_request_id)||Number(value.revision)===0&&value.last_request_id!==null)throw Error("invalid_smithery_key_dto")
  return {has_key:value.has_key,revision:Number(value.revision),tail:value.tail,last_request_id:value.last_request_id as string|null}
}
export function parsePgSmitheryConnection(raw:unknown):PgNativeSmitheryConnection{
  const value=object(raw),states=["pending","unknown","paused","connected","disconnected","auth_required","input_required","error","revoking","revoke_unknown","revoked","needs_key","needs_refresh"]
  if(!uuid(value.id)||!smitheryName(value.namespace)||value.remote_connection_id!==smitheryRemoteId(value.id)||!smitheryServer(value.server)||
    !plain(value.name,100)||!value.name.trim()||!plain(value.description,500)||!plain(value.state,30)||!states.includes(value.state)||
    !Number.isSafeInteger(value.revision)||Number(value.revision)<1||!Number.isSafeInteger(value.mcp_revision)||Number(value.mcp_revision)<1||
    typeof value.revoke_requested!=="boolean"||typeof value.operation_in_flight!=="boolean"||typeof value.enabled!=="boolean"||
    !["untested","ok","error"].includes(String(value.mcp_status))||!plain(value.last_error,80)||!plain(value.setup_url,2048)||
    value.setup_url!==""&&safeSmitherySetupUrl(value.setup_url)!==value.setup_url||!Array.isArray(value.missing)||value.missing.length>10||value.missing.some(item=>!plain(item,70))||
    value.enabled&&(value.state!=="connected"||value.revoke_requested))throw Error("invalid_smithery_connection_dto")
  return {id:value.id,namespace:value.namespace,remote_connection_id:value.remote_connection_id as string,server:value.server,name:value.name,description:value.description,
    state:value.state,revoke_requested:value.revoke_requested,setup_url:value.setup_url,missing:value.missing as string[],last_error:value.last_error,
    revision:Number(value.revision),operation_in_flight:value.operation_in_flight,mcp_revision:Number(value.mcp_revision),enabled:value.enabled,mcp_status:value.mcp_status as PgNativeSmitheryConnection["mcp_status"]}
}
export function parsePgSmitheryCatalog(raw:unknown):PgNativeSmitheryCatalog{
  const value=object(raw)
  if(!Array.isArray(value.items)||value.items.length>24||!Number.isSafeInteger(value.page)||Number(value.page)<1||Number(value.page)>100||
    value.next_page!==0&&value.next_page!==Number(value.page)+1||Number(value.next_page)>100)throw Error("invalid_smithery_catalog_dto")
  const seen=new Set<string>(),items=value.items.map(raw=>{const item=object(raw)
    if(!smitheryServer(item.server)||seen.has(item.server)||!plain(item.name,100)||!plain(item.description,500)||typeof item.verified!=="boolean"||typeof item.deployed!=="boolean")throw Error("invalid_smithery_catalog_dto")
    seen.add(item.server);return {server:item.server,name:item.name,description:item.description,verified:item.verified,deployed:item.deployed}
  })
  return {items,page:Number(value.page),next_page:Number(value.next_page)}
}
