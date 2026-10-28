// Root-hosted actual PG18 only. No skipped-success fallback on ordinary hosts.
// Standalone requires its own fresh service. To reuse the UI fixture, Root
// calls runAgentDesignDatabaseSuite(t,f) before UI business flow instead.
import test from 'node:test'
import {createAgentDesignDatabaseFixture,runAgentDesignDatabaseSuite} from './helpers/agent-design-database-ci.mjs'

test('F01 genuine installed062 catalog, independent roles, SQL golden protocols and atomic save boundaries',{concurrency:false,timeout:900000},async t=>{
  const f=await createAgentDesignDatabaseFixture()
  try{await runAgentDesignDatabaseSuite(t,f)}finally{await f.close()}
})
