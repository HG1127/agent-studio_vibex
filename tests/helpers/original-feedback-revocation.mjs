// One actual-host race. Arming never changes capabilities; the original
// selector is withdrawn only when the original browser POST is dispatched.
export function createOriginalFeedbackRevocation({known,withdraw}){
 if(typeof known!=='function'||typeof withdraw!=='function')throw Error('feedback_revocation_ports_required')
 let pending=null
 const route=id=>'/api/v2/agent-feedback/'+id+'/change'
 return Object.freeze({
  arm(id){if(pending||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)||known(id)!==true)throw Error('feedback_revocation_scope_required');pending={path:route(id),dispatched:false}},
  beforeDispatch(method,path){if(method!=='POST'||!pending||pending.path!==path||pending.dispatched)return false;withdraw();pending.dispatched=true;return true},
  consume(method,path,status,body){if(method!=='POST'||!pending?.dispatched||pending.path!==path||status!==403||body?.error!=='agent_feedback_submission_disabled')return false;pending=null;return true},
  assertEmpty(){if(pending)throw Error('unconsumed actual feedback revocation')},
 })
}
