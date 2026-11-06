// Called only by the exact-head hosted074 story after it creates real owned rows.
// No Pool, SQL, Worker or socket is created when this module is imported.
import assert from 'node:assert/strict'
import {requireNativeMonitor074Ci} from './native-monitor074-ci-guard.mjs'

export async function verifyMonitor074ActualRowLocks({pool,alice,bob,rows}){
 const permit=requireNativeMonitor074Ci()
 const [{default:pg},{withActorClient}]=await Promise.all([import('pg'),import('../../src/repository.ts')])
 const relations=[['case','monitor_live_cases'],['monitor','monitor_live_monitors'],['check','monitor_live_checks']]
 for(const [kind]of relations)assert.match(rows[kind],/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
 const adminPool=new pg.Pool({...permit.target,max:1,statement_timeout:5000,query_timeout:5000});adminPool.on('error',()=>{})
 const transaction=async(identity,work)=>{
  const db=await pool.connect();let active=false
  try{await db.query('BEGIN');active=true;return await withActorClient(db,pool,identity,work)}
  finally{try{if(active)await db.query('ROLLBACK')}finally{db.release()}}
 }
 try{
  const owner=await transaction(alice,async(_db,owner)=>owner)
  for(const [kind,table]of relations){
   const rpc='SELECT agentstudio.monitor_live_'+kind+'_read_lock($1::uuid,$2::uuid,$3::boolean) AS value',id=rows[kind]
   for(const lock of ['SHARE','UPDATE'])await assert.rejects(transaction(alice,(db)=>db.query('SELECT id FROM agentstudio.'+table+' WHERE id=$1::uuid FOR '+lock,[id])),e=>e.code==='42501')
   await assert.rejects(transaction(alice,db=>db.query('UPDATE agentstudio.'+table+' SET id=id WHERE id=$1::uuid',[id])),e=>e.code==='42501')
   await assert.rejects(transaction(bob,db=>db.query(rpc,[id,owner,false])),e=>e.code==='P0001'&&e.message==='owned_admission_context_required')
   await transaction(bob,async(db,other)=>assert.equal((await db.query(rpc,[id,other,false])).rows[0].value,null))
   await assert.rejects(transaction(alice,async(db)=>{await db.query('SET LOCAL ROLE agentstudio_worker');return db.query(rpc,[id,owner,false])}),e=>e.code==='42501')
   for(const update of [false,true])for(const boundary of ['COMMIT','ROLLBACK']){
    let held,contender,heldActive=false,contenderActive=false
    try{
     held=await pool.connect();contender=await adminPool.connect()
     await held.query('BEGIN');heldActive=true
     await withActorClient(held,pool,alice,async(db,actual)=>{assert.equal(actual,owner);const locked=await db.query(rpc,[id,owner,update]);assert.equal(locked.rows.length,1);assert.equal(locked.rows[0].value.id,id)})
     await contender.query('BEGIN');contenderActive=true
     await assert.rejects(contender.query('SELECT id FROM agentstudio.'+table+' WHERE id=$1::uuid FOR UPDATE NOWAIT',[id]),e=>e.code==='55P03')
     await contender.query('ROLLBACK');contenderActive=false
     await held.query(boundary);heldActive=false
     await contender.query('BEGIN');contenderActive=true
     const released=await contender.query('SELECT id FROM agentstudio.'+table+' WHERE id=$1::uuid FOR UPDATE NOWAIT',[id]);assert.deepEqual(released.rows,[{id}])
     await contender.query('ROLLBACK');contenderActive=false
    }finally{
     try{if(heldActive)await held.query('ROLLBACK')}finally{try{if(contenderActive)await contender.query('ROLLBACK')}finally{try{held?.release()}finally{contender?.release()}}}
    }
   }
  }
 }finally{await adminPool.end()}
 return Object.freeze({actual_API_private_locks_refused:6,actual_private_mutations_refused:3,actual_wrong_actor_and_role_refusals:6,actual_other_owner_null:3,actual_lock_modes_and_transaction_boundaries:12})
}
