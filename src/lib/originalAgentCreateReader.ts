import {createOriginalModelConnectionsApi} from './originalModelConnectionsApi.ts'
import {verifiedModelIdsFromConnection} from './agentCreateJourney.ts'
import {parseOriginalAgentCreateTrial,originalAgentCreateId,originalAgentCreateRevision,OriginalAgentCreateReadError,type OriginalAgentCreateRun} from '../../shared/original-agent-create-read-contract.ts'
export type OriginalAgentCreateRecentRun={id:string;spec_id:string;status:string;created:string;instruction:string;result?:string;spec_revision:number;outputs_current:boolean}
export function createOriginalAgentCreateReader(config:{employeeId:string;currentEmployee:()=>string|null;verifyEmployee:()=>Promise<string>;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}){
 const employee=originalAgentCreateId(config.employeeId),root=config.rootPath??'/__pg_native',send=config.transport??fetch,budget=config.timeoutMs??30000
 if(!['','/__pg_native'].includes(root)||!Number.isSafeInteger(budget)||budget<1||budget>30000||typeof config.currentEmployee!=='function'||typeof config.verifyEmployee!=='function')throw new OriginalAgentCreateReadError('invalid_original_agent_create_reader')
 const models=createOriginalModelConnectionsApi({employeeId:employee,transport:send,rootPath:root}),pending=new Set<AbortController>();let epoch=0
 const changed=()=>new OriginalAgentCreateReadError('original_agent_create_identity_changed')
 const check=(ticket:number,abort:AbortController)=>{if(ticket!==epoch||abort.signal.aborted||config.currentEmployee()!==employee)throw changed()}
 async function guarded<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{const ticket=epoch,abort=new AbortController();pending.add(abort);let timer:ReturnType<typeof setTimeout>|undefined
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new OriginalAgentCreateReadError('original_agent_create_read_unavailable'))},budget)})
  const perform=async()=>{check(ticket,abort);if(await config.verifyEmployee()!==employee)throw changed();check(ticket,abort);const value=await work(abort.signal);check(ticket,abort);if(await config.verifyEmployee()!==employee)throw changed();check(ticket,abort);return value}
  try{return await Promise.race([perform(),deadline])}finally{clearTimeout(timer);pending.delete(abort);abort.abort()}
 }
 async function request(route:string,signal:AbortSignal):Promise<unknown>{let reader:ReadableStreamDefaultReader<Uint8Array>|undefined
  try{const response=await send(route,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':employee}})
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))throw new OriginalAgentCreateReadError()
   const declared=response.headers.get('content-length'),limit=6291456
   if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>limit))throw new OriginalAgentCreateReadError()
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw new OriginalAgentCreateReadError();chunks.push(part.value)}
   if(declared!==null&&Number(declared)!==size)throw new OriginalAgentCreateReadError()
   const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength}
   let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new OriginalAgentCreateReadError()}
   if(!response.ok)throw new OriginalAgentCreateReadError(response.status===409?'original_create_spec_changed':'original_agent_create_read_unavailable')
   return value
  }finally{if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 return Object.freeze({
  invalidate(){epoch++;for(const abort of pending)abort.abort();pending.clear()},
  models:()=>guarded(async signal=>{const snapshot=await models.listSnapshot(signal);if(!snapshot.complete)throw new OriginalAgentCreateReadError('original_agent_create_models_incomplete');return snapshot.items.reduce((n,row)=>n+verifiedModelIdsFromConnection(row).length,0)}),
  latest:(specId:string,revision:number)=>guarded(async signal=>{const spec=originalAgentCreateId(specId),version=originalAgentCreateRevision(revision),raw=await request(root+'/api/v2/agent-autonomous-runs/latest?spec_id='+spec+'&revision='+version,signal)
   const value=parseOriginalAgentCreateTrial(raw,{owner:employee,specId:spec,revision:version}),run:OriginalAgentCreateRun|null=value.run
   return run?{id:run.id,spec_id:run.spec_id,status:run.status,created:run.created,spec_revision:run.spec_revision,outputs_current:run.outputs_current,instruction:run.outputs_current&&run.spec_revision===version?run.instruction:'',result:run.outputs_current&&run.spec_revision===version?run.result:''} satisfies OriginalAgentCreateRecentRun:null
  }),
 })
}
