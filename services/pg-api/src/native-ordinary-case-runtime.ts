import {registerOrdinaryCaseObservationPool} from './native-ordinary-case-observation-policy.ts'
import {optionalOrdinaryCaseAgentBinding} from './native-ordinary-case-binding.ts'
import {assertOrdinaryCaseRunSources} from './native-ordinary-case-source-access.ts'
import {ownId} from './own-operations-contract.ts'
import type {SqlClient,SqlPool} from './contracts.ts'
import {inspectOptionalOrdinaryCase,verifyOrdinaryCaseSchema} from './native-ordinary-case-audit.ts'
import {NativeOrdinaryCaseRunRepository} from './native-ordinary-case-run-repository.ts'
export function selectOrdinaryCaseRuntime(env:Record<string,string|undefined>){
 const enabled=env.AGENT_STUDIO_PG18_ORDINARY_CASE_RUNS_ENABLED,approved=env.AGENT_STUDIO_PG18_ORDINARY_CASE_RUNS_APPROVED,execute=env.AGENT_STUDIO_PG18_ORDINARY_CASE_EXECUTION_APPROVED
 if(enabled===undefined&&approved===undefined&&execute===undefined)return Object.freeze({enabled:false,execution:false})
 if(enabled!=='true'||approved!=='APPROVE_DISPOSABLE_PG18_ORDINARY_CASE_RUNS_ONLY'||execute!==undefined&&execute!=='APPROVE_DISPOSABLE_PG18_ORDINARY_CASE_EXECUTION_ONLY')throw Error('unsafe_ordinary_case_runtime_config')
 return Object.freeze({enabled:true,execution:execute==='APPROVE_DISPOSABLE_PG18_ORDINARY_CASE_EXECUTION_ONLY'})
}
export async function prepareOrdinaryCaseRuntime(pool:SqlPool,env:Record<string,string|undefined>){
 const selection=selectOrdinaryCaseRuntime(env)
 if(!selection.enabled)return null
 if(await inspectOptionalOrdinaryCase(pool)!=='installed')throw Error('ordinary_case_schema_required')
 registerOrdinaryCaseObservationPool(pool,async(db,runId)=>{
  const actor=(await db.query<{owner:string}>('SELECT agentstudio.actor_id()::text AS owner')).rows
  if(actor.length!==1)return false
  const owner=ownId(actor[0]?.owner),binding=await optionalOrdinaryCaseAgentBinding(db,owner,runId,true)
  if(binding)await assertOrdinaryCaseRunSources(db,owner,runId)
  return true
 })
 return Object.freeze({...selection,assertReady:(db:SqlClient)=>verifyOrdinaryCaseSchema(db),
  repository:(options:NonNullable<ConstructorParameters<typeof NativeOrdinaryCaseRunRepository>[1]>)=>new NativeOrdinaryCaseRunRepository(pool,options,{enabled:true,assertReady:verifyOrdinaryCaseSchema})})
}
