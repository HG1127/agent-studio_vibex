import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseOriginalAgentInboxUrl,parseOriginalAgentPendingPage,parseOriginalAgentWorkspace,type OriginalAgentPendingQuery} from './original-agent-inbox-contract.ts'

export const originalAgentInboxPaths=['/api/v2/original-ui/agent-workspace','/api/v2/original-ui/agent-pending'] as const
type Reads={workspace(identity:Identity):Promise<unknown>;pending(identity:Identity,query:OriginalAgentPendingQuery):Promise<unknown>}
export function createOriginalAgentInboxHttp(input:{repository:Reads;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 const reply=(res:ServerResponse,status:number,value:unknown)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',...(status===405?{Allow:'GET'}:{})})
  res.end(JSON.stringify(value))
 }
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const path=(req.url??'').split(/[?#]/,1)[0]
  if(!originalAgentInboxPaths.includes(path as typeof originalAgentInboxPaths[number]))return false
  try{
   try{verifyNativeOrigin(req,input.allowedOrigin,false)}catch(error){if((error as {status?:number})?.status===403)throw new HttpError(403,'native_employee_identity_required');throw error}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(req.method!=='GET')throw new HttpError(405,'method_not_allowed')
   let identity:Identity
   try{identity=await input.authenticateRequest(req)}catch(error){if((error as {status?:number})?.status===401)throw new HttpError(401,'session_required');throw error}
   if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')throw new HttpError(400,'invalid_original_agent_inbox_query')
   for await(const chunk of req)if(chunk.length)throw new HttpError(400,'invalid_original_agent_inbox_query')
   const route=parseOriginalAgentInboxUrl(req.url)
   const result=route.route==='workspace'?parseOriginalAgentWorkspace(await input.repository.workspace(identity)):
    parseOriginalAgentPendingPage(await input.repository.pending(identity,route.query),route.query)
   reply(res,200,result)
  }catch(error){
   const allowed:Record<number,string[]>={400:['invalid_original_agent_inbox_query'],401:['session_required'],403:['native_employee_identity_required'],405:['method_not_allowed'],409:['own_overview_unavailable','original_agent_inbox_unavailable']}
   const known=error instanceof HttpError&&allowed[error.status]?.includes(error.code)
   reply(res,known?error.status:409,{error:known?error.code:'original_agent_inbox_unavailable'})
  }
  return true
 }
}
