// Strict runtime target policy for the existing disposable PG17 pilot and
// an EXPLICITLY opted-in BaoTa PostgreSQL 18 Agent Studio test database.
// This module never connects or reads credentials. No implicit fallback.
import type {SqlPool} from "./contracts.ts"

export type PgRuntimeKind="api"|"worker"
export type PgRuntimeTarget={
  mode:"pg17_stage"|"baota_pg18"
  host:string
  port:number
  database:string
  user:string
  expectedMajor:17|18
}
function unsafe():never {throw Error("unsafe_pg_runtime_target")}
export function selectPgRuntimeTarget(
  env:NodeJS.ProcessEnv,kind:PgRuntimeKind,
  platform=process.platform,
):PgRuntimeTarget {
  if(kind!=="api"&&kind!=="worker")unsafe()
  const role=kind==="api"?"agentstudio_stage_login":"agentstudio_stage_worker"
  if(env.AGENT_STUDIO_PG_BAOTA18_ENABLED!==undefined&&
     env.AGENT_STUDIO_PG_BAOTA18_ENABLED!=="true")unsafe()
  const baota=env.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"
  if(env.AGENT_STUDIO_PG_USER!==undefined&&kind==="worker")unsafe()
  if(env.AGENT_STUDIO_PG_WORKER_USER!==undefined&&kind==="api")unsafe()
  const user=kind==="api"?env.AGENT_STUDIO_PG_USER:env.AGENT_STUDIO_PG_WORKER_USER
  if(user!==role)unsafe()
  const host=env.AGENT_STUDIO_PG_HOST
  const database=env.AGENT_STUDIO_PG_DATABASE
  const port=env.AGENT_STUDIO_PG_PORT
  if(baota){
    if(platform!=="linux"||
       env.AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED!=="true"||
       env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
       (kind==="worker"&&env.AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED!=="true")||
       host!=="127.0.0.1"||port!=="5333"||database!=="agent_studio"||
       Object.keys(env).some(key=>key==="DATABASE_URL"||
         (/^PG[A-Z_]/.test(key)&&env[key]!==undefined)))
      unsafe()
    return {mode:"baota_pg18",host,port:5333,database,user,expectedMajor:18}
  }
  if(database!=="agentstudio_stage"||
     !["postgres","localhost","127.0.0.1"].includes(host??"")||
     (port!==undefined&&port!=="5432")||
     env.AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED!==undefined||
     env.AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED!==undefined)
    unsafe()
  return {mode:"pg17_stage",host:host!,port:5432,database,user,expectedMajor:17}
}

// Must be verified AFTER opening a connection but BEFORE enabling HTTP
// listeners or processing any work. Database name and SQL version originate
// from the SERVER, not env or a client-supplied field.
export async function verifyPgRuntimeTarget(
  pool:SqlPool,target:PgRuntimeTarget,
):Promise<void> {
  const db=await pool.connect()
  try{
    const rows=await db.query<{
      db:string;serverVersion:number|string;serverPort:number|string|null
      login:string;superuser:boolean;bypassrls:boolean;serverAddress:string|null
    }>("SELECT current_database() AS db,"+
      "current_setting('server_version_num')::integer AS \"serverVersion\","+
      "inet_server_port() AS \"serverPort\","+
      "host(inet_server_addr()) AS \"serverAddress\","+
      "session_user AS login,rolsuper AS superuser,rolbypassrls AS bypassrls "+
      "FROM pg_roles WHERE rolname=session_user")
    const r=rows.rows[0]
    const ver=Number(r?.serverVersion)
    if(!r||r.db!==target.database||r.login!==target.user||
       r.superuser!==false||r.bypassrls!==false||
       !Number.isSafeInteger(ver)||ver<target.expectedMajor*10000||
       ver>=(target.expectedMajor+1)*10000||
       Number(r.serverPort)!==target.port||
       (target.mode==="baota_pg18"&&r.serverAddress!=="127.0.0.1"))
      throw Error("pg_runtime_target_mismatch")
  }finally{db.release()}
}
