// Ticket-authenticated, informational preparation state. Never pairs or authorizes.
var stages=['imported','choosing_folder','choosing_file','ready_to_confirm','confirming','selection_cancelled','cancelled','error']
function fail(code){throw Error(code)}
function valid(b,keys){
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(function(k){return keys.indexOf(k)<0})||
 !/^[A-Za-z0-9]{24}$/.test(b.id||'')||!/^[A-Za-z0-9]{48}$/.test(b.code||''))fail('invalid_setup_progress')
}
function identity(tx,b){
 var local=require(__hooks+'/modules/local_devices.js'),hash=$security.sha256(b.code),d
 try{
  d=local.row(tx,"SELECT id,owner FROM studio_local_devices WHERE id={:id} AND pair_hash={:hash} AND pair_until>{:now} AND revoked=0 AND token_hash IS NULL",{id:b.id,hash:hash,now:Date.now()},{id:'',owner:''})
  local.device(tx,d.id,d.owner)
 }catch(e){fail('setup_progress_unauthorized')}
 var old=null
 try{old=local.row(tx,'SELECT pair_hash,attempt_id,sequence,stage FROM studio_local_setup_progress WHERE device_id={:id}',{id:d.id},{pair_hash:'',attempt_id:'',sequence:0,stage:''})}catch(e){}
 return {id:d.id,hash:hash,old:old&&old.pair_hash===hash?old:null}
}
function context(app,b){
 valid(b,['id','code']);var out
 app.runInTransaction(function(tx){var x=identity(tx,b);out={previousAttempt:x.old?x.old.attempt_id:''}})
 return out
}
function report(app,b){
 valid(b,['id','code','attempt','previousAttempt','sequence','stage'])
 if(!/^[a-f0-9]{24}$/.test(b.attempt||'')||typeof b.previousAttempt!=='string'||b.previousAttempt!==''&&!/^[a-f0-9]{24}$/.test(b.previousAttempt)||
  !Number.isSafeInteger(b.sequence)||b.sequence<1||b.sequence>100000||stages.indexOf(b.stage)<0)fail('invalid_setup_progress')
 var out={ok:true,accepted:false}
 app.runInTransaction(function(tx){
  var x=identity(tx,b),old=x.old,current=old?old.attempt_id:''
  if(current===b.attempt){
   if(Number(old.sequence)>=b.sequence)return
   if(b.stage==='imported'&&old.stage!=='imported')fail('setup_progress_stale_attempt')
  }else if(b.stage!=='imported'||b.previousAttempt!==current)fail('setup_progress_stale_attempt')
  tx.db().newQuery('INSERT INTO studio_local_setup_progress(device_id,pair_hash,attempt_id,sequence,stage,updated_ms) VALUES({:id},{:hash},{:attempt},{:sequence},{:stage},{:now}) ON CONFLICT(device_id) DO UPDATE SET pair_hash=excluded.pair_hash,attempt_id=excluded.attempt_id,sequence=excluded.sequence,stage=excluded.stage,updated_ms=excluded.updated_ms')
   .bind({id:x.id,hash:x.hash,attempt:b.attempt,sequence:b.sequence,stage:b.stage,now:Date.now()}).execute()
  out.accepted=true
 })
 return out
}
module.exports={context:context,report:report}
