// CI-only dependency browser installation. Ordinary/local invocation refuses
// before importing child_process or resolving browser packages.
import {requireNativeLocalDeviceGenuineCi} from './native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
if(!['executor','browser'].includes(process.env.AGENT_STUDIO_F20_F21_GENUINE_SUITE))throw Error('native_chain_browser_install_purpose_required')
const [{createRequire},{spawnSync}]=await Promise.all([import('node:module'),import('node:child_process')])
const cli=new Set([createRequire(import.meta.resolve('@playwright/mcp')).resolve('playwright/cli')])
if(process.env.AGENT_STUDIO_F20_F21_GENUINE_SUITE==='browser')cli.add(createRequire(import.meta.resolve('@playwright/test')).resolve('playwright/cli'))
for(const file of cli){const result=spawnSync(process.execPath,[file,'install','--with-deps','chromium'],{stdio:'inherit',shell:false,windowsHide:true,timeout:600000});if(result.error||result.status!==0)throw Error('native_chain_locked_chromium_install_failed')}
