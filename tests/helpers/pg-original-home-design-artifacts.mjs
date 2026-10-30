export const originalHomeDesignImageNames=Object.freeze(['original-home-design-generated.png','original-home-design-revised-saved.png'])
/** Inspect values privately; callers assert these booleans, never raw DOM. */
export function originalHomeDesignDomSafety(sample,secrets){
 if(!sample||Object.getPrototypeOf(sample)!==Object.prototype||!Array.isArray(sample.values)||sample.values.length>512||sample.values.some(v=>typeof v!=='string'||v.length>262144)||typeof sample.text!=='string'||sample.text.length>1048576||!Number.isSafeInteger(sample.passwordInputs)||sample.passwordInputs<0||!Array.isArray(secrets)||secrets.some(v=>typeof v!=='string'||v.length<8||v.length>4096))throw Error('original_home_design_dom_inspection_invalid')
 const text=[sample.text,...sample.values].join('\n')
 return Object.freeze({bounded:text.length<=2097152,password_absent:sample.passwordInputs===0,
  secret_absent:!secrets.some(value=>text.includes(value)),
  credential_markers_absent:!/(?:Bearer\s+[A-Za-z0-9_-]|__Host-agentstudio_session=|api_key_ciphertext|-----BEGIN [A-Z ]*PRIVATE KEY-----|synthetic-(?:alice|bob)-assessment-key-never-network)/i.test(text)})
}
/** No filesystem effects. Store only a fixed small set of successful PNGs. */
export function originalHomeDesignImageBuffer(name,bytes,safety){
 if(!originalHomeDesignImageNames.includes(name)||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>8*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||!safety||Object.keys(safety).sort().join(',')!=='bounded,credential_markers_absent,password_absent,secret_absent'||Object.values(safety).some(v=>v!==true))throw Error('original_home_design_image_refused')
 return Object.freeze({name,bytes:Buffer.from(bytes)})
}
/** Bound serialized diagnostic bytes before any artifact filesystem write. */
export function originalHomeDesignObservationBytes(observation){
 const bytes=Buffer.from(JSON.stringify(observation,null,2),'utf8')
 if(bytes.length>1048576)throw Error('original_home_design_observation_oversize')
 return bytes
}
/** Creation has a070 audit;045 history records the before/after of an update. */
export function originalHomeDesignManualAuditProof(audit,operation){
 if(!['create','update'].includes(operation)||!audit||!audit.actual||!Number.isSafeInteger(audit.actual.revision)||audit.actual.revision<1||!Array.isArray(audit.events)||!Array.isArray(audit.history))throw Error('original_home_design_audit_shape')
 const actual=audit.actual
 return Object.freeze({configuration_audit_recorded:audit.events.some(row=>row.action==='agent.original_home.'+operation&&row.result==='succeeded'&&row.owner_user_id===actual.owner_user_id&&row.actor_user_id===actual.owner_user_id&&row.target_kind==='agent_spec'&&row.target_id===actual.id&&row.metadata?.format==='agentstudio.home-authoring.v1'&&row.metadata.spec_revision===actual.revision),
  edit_history_contract_valid:operation==='create'?audit.history.length===0:audit.history.some(row=>row.spec_revision===String(actual.revision)&&row.safe_spec?.goal===actual.spec.goal)})
}
