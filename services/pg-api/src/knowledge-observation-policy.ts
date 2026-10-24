import type {SqlClient} from "./contracts.ts"
export async function currentKnowledgeObservations(db:SqlClient,run:string,currentStep=""):Promise<boolean>{
  const state=(await db.query<{installed:boolean}>("SELECT to_regprocedure('agentstudio.knowledge_query_execution_validate_run(uuid,text)') IS NOT NULL AS installed")).rows[0]
  if(state?.installed!==true)return true
  return (await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_query_execution_validate_run($1::uuid,$2::text) AS ok",[run,currentStep])).rows[0]?.ok===true
}
