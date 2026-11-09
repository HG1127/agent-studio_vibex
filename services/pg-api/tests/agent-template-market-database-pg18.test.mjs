// A separate fresh PG18 service for the genuine F07 `database` matrix entry.
// Ordinary hosts fail; there is no skip, PGlite or second fixture initializer.
import test from 'node:test'
import {createAgentTemplateMarketDatabaseFixture,runAgentTemplateMarketDatabaseSuite} from './helpers/agent-template-market-database-ci.mjs'

test('F07 genuine063 catalog, original API authority, golden protocols and atomic market lifecycle',{concurrency:false,timeout:900000},async t=>{
  const f=await createAgentTemplateMarketDatabaseFixture()
  try{await runAgentTemplateMarketDatabaseSuite(t,f)}finally{await f.close()}
})
