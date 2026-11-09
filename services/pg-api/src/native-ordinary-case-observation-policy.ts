import type {SqlClient,SqlPool} from './contracts.ts'
type Verifier=(db:SqlClient,runId:string)=>Promise<boolean>
const pools=new WeakMap<SqlPool,Verifier>(),clients=new WeakMap<SqlClient,Verifier>(),active=new WeakMap<SqlClient,Set<string>>()
/** Called only after the real077 catalog audit, for this exact pool identity. */
export function registerOrdinaryCaseObservationPool(pool:SqlPool,verify:Verifier){if(typeof verify!=='function')throw Error('ordinary_case_observation_verifier_required');pools.set(pool,verify)}
export function applyOrdinaryCaseObservationScope(db:SqlClient,pool:SqlPool){const verify=pools.get(pool);if(verify)clients.set(db,verify)}
// An already audited DB client remains constrained through nested pool wrappers.
/** Root human receipt validation may re-enter the same observation. It still
 * checks its own Root receipts; this guard prevents repeating the case walk. */
export async function ordinaryCaseObservationsCurrent(db:SqlClient,runId:string):Promise<boolean>{
 const verify=clients.get(db);if(!verify)return true
 const seen=active.get(db)??new Set<string>();if(seen.has(runId))return true;if(seen.size>=8)return false
 active.set(db,seen);seen.add(runId)
 try{return await verify(db,runId)===true}catch{return false}finally{seen.delete(runId);if(!seen.size)active.delete(db)}
}
