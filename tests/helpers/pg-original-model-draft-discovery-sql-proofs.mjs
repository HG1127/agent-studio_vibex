import assert from 'node:assert/strict'
/** Called only after the guarded host creates the actual fresh F01 fixture. */
export function createOriginalModelDraftDiscoverySqlProofs(f,models,identities){
 const snapshots=new Map();let sequence=0
 return{
  clearProofs(){snapshots.clear()},
  async metadataCheckpoint(){assert(snapshots.size<8);const rows=(await f.db.query('SELECT * FROM agentstudio.model_connections ORDER BY id')).rows,audit=(await f.db.query("SELECT * FROM agentstudio.audit_events WHERE target_kind='model_connection' ORDER BY id")).rows,token='metadata_'+(++sequence);snapshots.set(token,{models:JSON.stringify(rows),audit:JSON.stringify(audit)});return token},
  async assertMetadataUnchanged(token){const before=snapshots.get(token);assert(before,'actual metadata checkpoint required');const rows=(await f.db.query('SELECT * FROM agentstudio.model_connections ORDER BY id')).rows,audit=(await f.db.query("SELECT * FROM agentstudio.audit_events WHERE target_kind='model_connection' ORDER BY id")).rows;assert.equal(JSON.stringify(rows)===before.models,true,'all actual model columns must remain unchanged');assert.equal(JSON.stringify(audit)===before.audit,true,'all model metadata audit columns must remain unchanged');return{all_model_columns_unchanged:true,all_model_metadata_audit_unchanged:true}},
  async draftAudit(who,requestId){
   assert(['alice','bob'].includes(who)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))
   const rows=(await f.db.query("SELECT owner_user_id,actor_user_id,action,result,metadata FROM agentstudio.audit_events WHERE target_kind='model_connection_draft_probe' AND target_id=$1::text ORDER BY action",[requestId])).rows
   assert.equal(rows.length,2);const admitted=rows.find(r=>r.action==='model.connection_draft_probe_admitted'),finished=rows.find(r=>r.action==='model.connection_draft_probe_finished');assert(admitted&&finished)
   for(const row of rows){assert.equal(row.owner_user_id,f.users[who]);assert.equal(row.actor_user_id,f.users[who]);assert.equal(row.result,'succeeded');assert.equal(row.metadata.protocol,'native_model_draft_discovery_v1');assert.equal(row.metadata.credential_source,'draft');assert.equal(row.metadata.provider,'openai');assert.equal(row.metadata.connection_id,null);assert.equal(row.metadata.connection_revision,null)}
   assert.deepEqual(Object.keys(admitted.metadata).sort(),['protocol','credential_source','provider','connection_id','connection_revision'].sort());assert.deepEqual(Object.keys(finished.metadata).sort(),['protocol','credential_source','provider','connection_id','connection_revision','error_code','latency_ms','model_count','complete'].sort())
   assert.equal(finished.metadata.error_code,'');assert.equal(finished.metadata.complete,true);assert.equal(finished.metadata.model_count,2);assert(Number.isSafeInteger(finished.metadata.latency_ms)&&finished.metadata.latency_ms>=0&&finished.metadata.latency_ms<=6000)
   return{owner_and_actor_verified:true,admission_and_finish_verified:true,secret_free:true,audit_rows:2}
  },
  async proveSavedDiscovered(who,id,ids,secret){
   assert(['alice','bob'].includes(who)&&Array.isArray(ids)&&ids.length===2&&typeof secret==='string'&&secret.length>=8)
   const item=await models.get(identities[who],id),foreign=await models.get(identities[who==='alice'?'bob':'alice'],id)
   assert(item);assert.equal(foreign,null);assert.equal(item.owner_user_id,f.users[who]);assert.equal(JSON.stringify(item.models)===JSON.stringify(ids),true,'actual discovered model IDs required');assert.equal(item.status,'untested');assert.equal(item.revision,1)
   const rows=(await f.db.query('SELECT api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid',[id,f.users[who]])).rows;assert.equal(rows.length,1);assert(Buffer.from(rows[0].api_key_ciphertext).length>0);assert.equal(Buffer.from(rows[0].api_key_ciphertext).includes(Buffer.from(secret)),false);assert.equal(Buffer.from(rows[0].api_key_nonce).length,12);assert.equal(Buffer.from(rows[0].api_key_tag).length,16)
   return{actual_owner_save_verified:true,foreign_owner_denied:true,actual_discovered_IDs_persisted:true,secret_encrypted:true,saved_probe_status_untouched:true}
  },
 }
}
