// Root-hosted actual PG18 only. No skipped-success fallback on ordinary hosts.
// Standalone requires its own fresh service. To reuse the UI fixture, Root
// calls runAgentDesignDatabaseSuite(t,f) before UI business flow instead.
import test from 'node:test'
import {createAgentDesignDatabaseFixture,runAgentDesignDatabaseSuite} from './helpers/agent-design-database-ci.mjs'
import {diagnoseAgentDesignFixture} from './helpers/agent-design-catalog-diagnostics.mjs'

test('F01 genuine installed062 catalog, independent roles, SQL golden protocols and atomic save boundaries',{concurrency:false,timeout:900000},async t=>{
  const f=await createAgentDesignDatabaseFixture()
  try{
    // Test-only observations never replace the original first audit or authorize SQL.
    console.log(JSON.stringify(await diagnoseAgentDesignFixture(f)))
    await runAgentDesignDatabaseSuite(t,f)
  }finally{await f.close()}
})
