import {requireAgentCreateJourneyGenuineCi} from './agent-create-journey-genuine-guard.mjs'
requireAgentCreateJourneyGenuineCi()
const [{createRequire},{spawnSync}]=await Promise.all([import('node:module'),import('node:child_process')])
const cli=createRequire(import.meta.resolve('@playwright/test')).resolve('playwright/cli')
const result=spawnSync(process.execPath,[cli,'install','--with-deps','chromium'],{stdio:'inherit',shell:false,windowsHide:true,timeout:600000})
if(result.error||result.status!==0)throw Error('F02_locked_chromium_install_failed')
