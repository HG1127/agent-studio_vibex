export const originalModelConnectionsImageNames=Object.freeze(['original-model-connections-alice-metadata.png','original-model-connections-bob-unknown.png'])
export function originalModelConnectionsObservationBytes(observation){
 const bytes=Buffer.from(JSON.stringify(observation,null,2))
 if(bytes.length>1048576||/Bearer\s+[A-Za-z0-9_-]|__Host-agentstudio_session=|-----BEGIN [A-Z ]*PRIVATE KEY-----|synthetic-original-page-key-/i.test(bytes.toString('utf8')))throw Error('original_model_connections_observation_refused')
 return bytes
}
/** Inspect values privately; callers assert these booleans, never raw DOM. */
export function originalModelConnectionsDomSafety(sample,secrets){
 if(!sample||Object.getPrototypeOf(sample)!==Object.prototype||!Array.isArray(sample.values)||sample.values.length>512||sample.values.some(v=>typeof v!=='string'||v.length>262144)||typeof sample.text!=='string'||sample.text.length>1048576||!Number.isSafeInteger(sample.passwordInputs)||sample.passwordInputs<0||!Array.isArray(secrets)||secrets.some(v=>typeof v!=='string'||v.length<8||v.length>4096))throw Error('original_model_connections_dom_inspection_invalid')
 const text=[sample.text,...sample.values].join('\n')
 return Object.freeze({bounded:text.length<=2097152,password_absent:sample.passwordInputs===0,
  secret_absent:!secrets.some(value=>text.includes(value)),
  credential_markers_absent:!/(?:Bearer\s+[A-Za-z0-9_-]|__Host-agentstudio_session=|api_key_ciphertext|-----BEGIN [A-Z ]*PRIVATE KEY-----|synthetic-(?:alice|bob)-assessment-key-never-network)/i.test(text)})
}
/** No filesystem effects. Store only a fixed small set of successful PNGs. */
export function originalModelConnectionsImageBuffer(name,bytes,safety){
 if(!originalModelConnectionsImageNames.includes(name)||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>8*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||!safety||Object.keys(safety).sort().join(',')!=='bounded,credential_markers_absent,password_absent,secret_absent'||Object.values(safety).some(v=>v!==true))throw Error('original_model_connections_image_refused')
 return Object.freeze({name,bytes:Buffer.from(bytes)})
}
