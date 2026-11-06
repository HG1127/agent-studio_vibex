import assert from 'node:assert/strict'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

// Test observation only. The original response is never replaced. Identity is
// reread using the exact Cookie of this original GET; the source owner is also
// reread independently before a denial can qualify.
export async function verifyOriginalQueuedForeignRead({cookie,runId,employee,readIdentity,readSource}){
 assert(typeof cookie==='string'&&cookie.length>0&&cookie.length<=8192&&!/[\r\n\0]/.test(cookie))
 assert(uuid.test(runId)&&uuid.test(employee)&&typeof readIdentity==='function'&&typeof readSource==='function')
 const identity=await readIdentity(cookie)
 assert.equal(identity.status,200);assert.equal(identity.body?.authenticated,true);assert.equal(identity.body?.user?.id,employee)
 const source=await readSource()
 assert.equal(source.id,runId);assert.equal(source.actual_owner_verified,true)
 return Object.freeze({actual_cookie_employee_verified:true,actual_original_source_owner_verified:true})
}

export function createOriginalQueuedOwnerTransition({known,verify}){
 assert(typeof known==='function'&&typeof verify==='function')
 let active=null,entry=null,used=false
 const tickets=new Map()
 return{
  arm(id,from,to){
   assert(!used&&!active&&!entry&&uuid.test(id)&&['alice','bob'].includes(from)&&['alice','bob'].includes(to)&&from!==to&&known(id,from))
   used=true;entry={id,from,to,path:'/api/v2/agent-autonomous-runs/'+id,claimed:false,denials:0,failed:false,finished:false};active=entry
   return{async finish(settle){
    assert(active===entry&&!entry.finished&&typeof settle==='function');active=null
    try{await settle();assert.equal(tickets.size,0,'owner transition still has original requests');assert.equal(entry.failed,false,'owner transition verification failed');entry.finished=true;return Object.freeze({actual_denials:entry.denials,maximum_denials:1,original_request_window_closed:true})}
    catch(error){entry.failed=true;throw error}
   }}
  },
  capture(method,path,cookie){
   if(!active||method!=='GET'||path!==active.path)return null
   assert(tickets.size<16,'owner transition original request bound')
   const ticket=Object.freeze({});tickets.set(ticket,{entry:active,cookie});return ticket
  },
  async consume(ticket,status,body,responseComplete){
   if(ticket===null)return null
   assert(tickets.has(ticket),'owner transition request already consumed')
   const selected=tickets.get(ticket);tickets.delete(ticket);const e=selected.entry
   if(status!==404)return null
   try{
    assert.equal(responseComplete,true);assert.equal(body?.error,'workflow_run_not_found')
    assert.equal(e.claimed,false,'second owner transition denial');e.claimed=true
    const proof=await verify(e.id,e.from,e.to,selected.cookie)
    assert.deepEqual(proof,{actual_cookie_employee_verified:true,actual_original_source_owner_verified:true});e.denials++
    return Object.freeze({path:e.path,status:404,target_id:e.id,reason:'verified_cookie_owner_transition',actual_cookie_employee_verified:true,actual_original_source_owner_verified:true})
   }catch(error){e.failed=true;throw error}
  },
  assertEmpty(){assert.equal(active,null,'owner transition is still armed');assert.equal(tickets.size,0,'owner transition requests remain');if(entry){assert.equal(entry.finished,true,'owner transition was not finished');assert.equal(entry.failed,false,'owner transition verification failed')}},
 }
}
