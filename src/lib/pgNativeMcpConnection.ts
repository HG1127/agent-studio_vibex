import {parseMcpCatalog,type McpCatalog} from "../../services/pg-api/src/mcp-catalog.ts"
export type PgNativeMcpInput={name:string;description:string;url:string;headers:{key:string;value:string}[];enabled:boolean}
export type PgNativeMcpConnection=Omit<PgNativeMcpInput,"headers">&{id:string;revision:number;status:"untested"|"ok"|"error";
  catalog:McpCatalog|null;headers:{key:string;value:string}[];last_error:string;last_checked_at:string|null}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parsePgMcpConnection(raw:unknown):PgNativeMcpConnection{
  const invalid=():never=>{throw Error("invalid_pg_mcp_connection")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const value=raw as PgNativeMcpConnection
  if(!uuid.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1||
    typeof value.name!=="string"||!value.name.trim()||value.name.length>100||typeof value.description!=="string"||value.description.length>500||
    typeof value.url!=="string"||value.url.length>1000||typeof value.enabled!=="boolean"||!["untested","ok","error"].includes(value.status)||
    typeof value.last_error!=="string"||value.last_error.length>80||value.last_checked_at!==null&&typeof value.last_checked_at!=="string"||
    !Array.isArray(value.headers)||value.headers.length>20||value.headers.some(header=>!header||typeof header.key!=="string"||
      !/^[-!#$%&'*+.^_`|~0-9a-z]{1,80}$/.test(header.key)||header.value!=="••••"))invalid()
  let url:URL;try{url=new URL(value.url)}catch{invalid()}
  if(url!.protocol!=="https:"||url!.username||url!.password||url!.hash)invalid()
  const catalog=value.status==="ok"?parseMcpCatalog(value.catalog):null
  if(value.status!=="ok"&&value.catalog!==null)invalid()
  return {id:value.id,revision:value.revision,name:value.name,description:value.description,url:value.url,enabled:value.enabled,
    status:value.status,catalog,headers:value.headers.map(header=>({key:header.key,value:"••••"})),last_error:value.last_error,last_checked_at:value.last_checked_at}
}
