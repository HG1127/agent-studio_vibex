import {requireOriginalSchedules078Ci} from '../tests/helpers/pg-original-schedules078-browser-guard.mjs'
const permit=requireOriginalSchedules078Ci() // Ordinary invocation refuses before files/PG/TLS/browser imports.
if(process.argv.length!==2)throw Error('original_schedules078_fixed_entry_required')
const {verifyOriginalSchedules078Sources}=await import('../tests/helpers/pg-original-schedules078-reviewed-check.mjs'),reviewed=await verifyOriginalSchedules078Sources()
const {spawnSync}=await import('node:child_process')
const run=spawnSync(process.execPath,['--experimental-strip-types','node_modules/@playwright/test/cli.js','test','--config=tests/pg-original-schedules078-genuine.config.mjs'],{cwd:reviewed.repo,env:process.env,stdio:'inherit',timeout:900000,windowsHide:true})
reviewed.check();if(run.error)throw run.error;if(run.status!==0)process.exitCode=run.status??1
if(permit.production_GO!==false)throw Error('original_schedules078_never_production')
