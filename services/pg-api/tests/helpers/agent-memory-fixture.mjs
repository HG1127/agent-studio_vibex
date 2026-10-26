// Synthetic PGlite only: retain explicit048,049 and050 regression states even
// when the default full fresh initializer advances. Never used by runtime code.
import {PGlite} from '@electric-sql/pglite'
import {agentFixture} from './workflow-v2-agent-fixture.mjs'
export async function agentMemoryFixture({stage='runtime'}={}){
  if(!['absent','manual','runtime'].includes(stage))throw Error('invalid_synthetic_memory_stage')
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true})
  try{
    if(!(f.db instanceof PGlite))throw Error('synthetic_memory_database_required')
    for(const name of ['agent_memory_run_contexts','agent_memory_entries','agent_memory_receipts'])
      if((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.'+name)).rows[0].n!==0)throw Error('synthetic_memory_fixture_must_be_empty')
    // Discard the full-init receipt with the optional structures: this state
    // makes no claim to be a complete050 database or an executable downgrade.
    await f.db.exec("BEGIN; DROP TABLE agentstudio.agent_memory_run_contexts; DROP TABLE agentstudio.agent_memory_entries; DROP TABLE agentstudio.agent_memory_receipts; "+
      "DROP FUNCTION agentstudio.agent_memory_entry_guard(); DELETE FROM agentstudio.schema_migrations WHERE version IN('pg_v9_049','pg_v9_050','pg18_fresh_runtime_001'); COMMIT;")
    if(stage!=='absent')await f.db.exec(f.sql('migrations/pg_v9_049_agent_memory.sql'))
    if(stage==='runtime')await f.db.exec(f.sql('migrations/pg_v9_050_agent_memory_context.sql'))
    return f
  }catch(error){await f.close();throw error}
}
