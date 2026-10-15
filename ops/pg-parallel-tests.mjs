#!/usr/bin/env node
// Bounded parallel stage/Core PostgreSQL SQL tests for development feedback.
// Enumerates all *local* .test.mjs files at execution time, so independent
// migration domains need NO central hardcoded test-file list.
// This intentionally excludes pg17-tcp.integration.mjs and production DBs.
import {readdirSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const tests=path.join(root,"services","pg-api","tests")
const relative=readdirSync(tests)
  .filter(name=>/^[a-z0-9-]+\.test\.mjs$/.test(name))
  .sort()
if(relative.length<10)throw Error("pg_stage_test_inventory_incomplete")
const args=[
  "--experimental-strip-types","--test","--test-concurrency=2",
  ...relative.map(name=>path.join(tests,name)),
]
process.stdout.write("PG_FASTCHECK: "+relative.length+
  " independent test files, concurrency=2, synthetic data only\n")
const child=spawnSync(process.execPath,args,{
  cwd:root,stdio:"inherit",windowsHide:true,
  env:{...process.env,
    // Prevent inherited CI execution opt-ins from reaching any test worker.
    AGENT_STUDIO_PG17_TEST_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED:"false",
  },
})
if(child.error)throw Error("pg_stage_test_process_failed")
process.exitCode=child.status===null?1:child.status
