import type {IncomingMessage,ServerResponse} from 'node:http'

/** The public Caller router owns only its closed routes. Every other request
 * must reach the original, already composed Native authentication handler. */
export function createNativeEntryHttpHandler(
 native:(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>,
 caller:((req:IncomingMessage,res:ServerResponse)=>Promise<boolean>)|null,
){
 if(typeof native!=='function'||caller!==null&&typeof caller!=='function')throw Error('native_entry_handlers_required')
 return async(req:IncomingMessage,res:ServerResponse):Promise<void>=>{
  if(caller){
   const handled=await caller(req,res)
   if(handled===true)return
   if(handled!==false)throw Error('native_public_route_outcome_unknown')
  }
  await native(req,res)
 }
}
