// Promise lifecycle only. No Pool, SQL, sockets, timer, credentials or receipts.
// The caller's original cleanup deadline owns drain(); this adds no budget.
export function createInternalShareRequestLifecycle(){
 const active=new Set()
 function run(operation){
  if(typeof operation!=='function')throw Error('internal_share_request_operation_required')
  const task=Promise.resolve().then(operation),settled=task.finally(()=>active.delete(settled))
  active.add(settled);void settled.catch(()=>{})
  return settled
 }
 async function drain(){while(active.size)await Promise.allSettled([...active])}
 return Object.freeze({run,drain,size:()=>active.size})
}
