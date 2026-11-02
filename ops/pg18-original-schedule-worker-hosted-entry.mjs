import {requireOriginalScheduleWorkerCi} from '../tests/helpers/pg-original-schedule-worker-guard.mjs'
requireOriginalScheduleWorkerCi()
const {verifyOriginalScheduleWorkerSources}=await import('../tests/helpers/pg-original-schedule-worker-reviewed-check.mjs')
await verifyOriginalScheduleWorkerSources()
const [{spawnSync},{createRequire}]=await Promise.all([import('node:child_process'),import('node:module')])
const require=createRequire(import.meta.url),cli=require.resolve('@playwright/test/cli'),run=spawnSync(process.execPath,['--experimental-strip-types',cli,'test','--config=tests/pg-original-schedule-worker-genuine.config.mjs'],{stdio:'inherit',windowsHide:true})
if(run.error||run.signal||run.status!==0)process.exitCode=1
