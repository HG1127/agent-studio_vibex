type Snapshot=Readonly<{epoch:number;employee:string;ready:boolean;started:boolean}>
type Verify=()=>Promise<string>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function unavailable(){return Error('original_business_identity_unavailable')}
/** Headless lifecycle. Only verifyEmployee may establish a new display epoch. */
export function createOriginalBusinessIdentity(verifyEmployee:Verify){
 let state:Snapshot=Object.freeze({epoch:0,employee:'',ready:false,started:false})
 const listeners=new Set<()=>void>(),pending=new Set<AbortController>()
 let checking:Promise<void>|null=null,opening:Promise<void>|null=null
 const publish=(next:Snapshot)=>{state=Object.freeze(next);for(const listener of [...listeners])listener()}
 function invalidate(){
  for(const request of pending)request.abort()
  pending.clear();checking=null
  publish({epoch:state.epoch+1,employee:'',ready:false,started:true})
 }
 function current(epoch:number,employee:string){return state.ready&&state.epoch===epoch&&state.employee===employee}
 function recover():Promise<void>{
  if(opening)return opening
  invalidate();const epoch=state.epoch
  const work=(async()=>{
   let employee='';try{employee=await verifyEmployee()}catch{}
   if(state.epoch!==epoch||!uuid.test(employee))throw unavailable()
   publish({epoch,employee,ready:true,started:true})
  })()
  opening=work
  void work.then(()=>{if(opening===work)opening=null},()=>{if(opening===work)opening=null})
  return work
 }
 async function check(){
  if(!state.ready)throw unavailable()
  if(checking)return checking
  const {epoch,employee}=state
  const work=(async()=>{
   let actual='';try{actual=await verifyEmployee()}catch{}
   if(!current(epoch,employee))throw unavailable()
   if(actual!==employee){invalidate();throw unavailable()}
  })()
  checking=work
  try{await work}finally{if(checking===work)checking=null}
 }
 async function request<T>(work:(employee:string,signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(!state.ready)throw unavailable()
  const {epoch,employee}=state,abort=new AbortController()
  const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true})
  if(signal?.aborted)abort.abort()
  pending.add(abort)
  const assert=()=>{if(abort.signal.aborted||!current(epoch,employee))throw unavailable()}
  try{
   assert();await check();assert()
   const value=await work(employee,abort.signal)
   assert();await check();assert();return value
  }catch(error){
   if(current(epoch,employee)&&error&&typeof error==='object'){
    const issue=error as {status?:unknown;code?:unknown}
    if(issue.status===401||issue.status===403||issue.code==='employee_session_changed')invalidate()
   }
   throw error
  }finally{pending.delete(abort);signal?.removeEventListener('abort',cancel)}
 }
 return{snapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},invalidate,recover,
  initialize:()=>state.started?Promise.resolve():recover(),check,request}
}
