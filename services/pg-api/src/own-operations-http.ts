// Native-only owner reads; the production composition retains the global policy.
import type {IncomingMessage,ServerResponse} from "node:http"
import {HttpError,type Identity} from "./contracts.ts"
import {nativeSessionToken,verifyNativeOrigin} from "./native-auth-http.mjs"
import {parseOwnOperationsUrl,parseOwnOverview,parseOwnTodoPage,type OwnTodoQuery} from "./own-operations-contract.ts"
import {permitNativePg18BusinessUatRequest,type NativePg18UatCapabilities} from "./native-config-uat-policy.ts"
import {createOriginalAgentInboxHttp,originalAgentInboxPaths} from './original-agent-inbox-http.ts'
import type {OriginalAgentPendingQuery} from './original-agent-inbox-contract.ts'

export type OwnOperationsReads={overview(identity:Identity):Promise<unknown>;todos(identity:Identity,query:OwnTodoQuery):Promise<unknown>;
 originalAgentWorkspace?(identity:Identity):Promise<unknown>;originalAgentPending?(identity:Identity,query:OriginalAgentPendingQuery):Promise<unknown>}
export type OwnOperationsHttpDependencies={repository:OwnOperationsReads;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string}
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin","X-Frame-Options":"DENY"}
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{...headers,...(status===405?{Allow:"GET"}:{})});res.end(JSON.stringify(body))}
async function emptyBody(req:IncomingMessage){
 if(req.headers["transfer-encoding"]!==undefined||req.headers["content-length"]!==undefined&&req.headers["content-length"]!=="0")throw new HttpError(400,"invalid_own_todo_query")
 for await(const chunk of req)if(chunk.length)throw new HttpError(400,"invalid_own_todo_query")
}
export function createOwnOperationsHttpHandler({repository,authenticateRequest,allowedOrigin}:OwnOperationsHttpDependencies){
 if(!repository||typeof repository.overview!=="function"||typeof repository.todos!=="function"||typeof authenticateRequest!=="function")throw Error("invalid_own_operations_dependencies")
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const path=(req.url??"").split(/[?#]/,1)[0]
  if(path!=="/api/v2/own-overview"&&path!=="/api/v2/own-todos")return false
  try{
   // Native Cookie/same-origin gates precede read input errors; no Bearer,
   // forwarded employee ID or caller-supplied owner is an identity source.
   try{verifyNativeOrigin(req,allowedOrigin,false)}catch(e){if(e&&typeof e==="object"&&"status"in e&&e.status===403)throw new HttpError(403,"native_employee_identity_required");throw e}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,"session_required")
   // Unsupported methods execute no read or unsafe Native-auth operation.
   if(req.method!=="GET")throw new HttpError(405,"method_not_allowed")
   let identity:Identity
   try{identity=await authenticateRequest(req)}catch(e){if(e&&typeof e==="object"&&"status"in e&&e.status===401)throw new HttpError(401,"session_required");throw e}
   if(identity?.issuer!=="urn:agentstudio:local:v1"||typeof identity.subject!=="string"||!identity.subject)throw new HttpError(403,"native_employee_identity_required")
   await emptyBody(req)
   const route=parseOwnOperationsUrl(req.url),value=route.route==="overview"?parseOwnOverview(await repository.overview(identity)):parseOwnTodoPage(await repository.todos(identity,route.query),route.query)
   reply(res,200,value)
  }catch(error){
   const known=error instanceof HttpError&&({400:["invalid_own_todo_query","invalid_own_todo_cursor"],401:["session_required"],403:["native_employee_identity_required","admin_required"],405:["method_not_allowed"],409:["own_overview_unavailable"]} as Record<number,string[]>)[error.status]?.includes(error.code)
   const status=known?(error as HttpError).status:409,code=known?(error as HttpError).code:"own_overview_unavailable"
   reply(res,status,{error:code})
  }
  return true
 }
}
export type NativeOwnOperationsBusinessDependencies=Omit<OwnOperationsHttpDependencies,'repository'>&{
 repository?:OwnOperationsReads;available?:boolean;policy:NativePg18UatCapabilities
 businessHandler:(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>
}
/** Shared by the actual Native server and guarded real TCP acceptance entry. */
export function createNativeOwnOperationsBusinessHandler({repository,available=false,policy,businessHandler,authenticateRequest,allowedOrigin}:NativeOwnOperationsBusinessDependencies){
 if(typeof available!=="boolean"||typeof businessHandler!=="function"||available&&!repository)throw Error("invalid_native_own_operations_dependencies")
 const unavailable=async():Promise<never>=>{throw new HttpError(409,"own_overview_unavailable")}
 const own=createOwnOperationsHttpHandler({repository:available?repository!:{overview:unavailable,todos:unavailable},authenticateRequest,allowedOrigin})
 const original=createOriginalAgentInboxHttp({allowedOrigin,authenticateRequest,repository:{
  workspace:identity=>available&&repository?.originalAgentWorkspace?repository.originalAgentWorkspace(identity):unavailable(),
  pending:(identity,query)=>available&&repository?.originalAgentPending?repository.originalAgentPending(identity,query):unavailable(),
 }})
 return async(req:IncomingMessage,res:ServerResponse):Promise<void>=>{
  let pathname:string
  try{pathname=new URL(req.url||"/","http://127.0.0.1").pathname}catch{reply(res,400,{error:"invalid_path"});return}
  // Every route, including the two new GETs, crosses the existing Native
  // allowlist before Cookie verification or repository/fallback dispatch.
  if(!permitNativePg18BusinessUatRequest(pathname,req.method||"",policy)){
   if(pathname==="/api/v2/own-overview"||pathname==="/api/v2/own-todos"||originalAgentInboxPaths.includes(pathname as typeof originalAgentInboxPaths[number]))reply(res,405,{error:"method_not_allowed"})
   else{res.writeHead(405,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}))}
   return
  }
  if(await own(req,res))return
  if(await original(req,res))return
  await businessHandler(req,res)
 }
}
