import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
import {requireAgentRunControlGenuineCi} from './agent-run-control-genuine-guard.mjs'
requireEphemeralPg18Ci();requireAgentRunControlGenuineCi(process.env,'browser')
const {agentRunControlGenuineFixture}=await import('./agent-run-control-genuine-fixture.mjs')
let fixture
try{
 fixture=await agentRunControlGenuineFixture(process.env,{browser:true})
 process.stdout.write(JSON.stringify({synthetic_only:true,actual_postgresql:true,url:fixture.browserUrl,apiPort:Number(new URL(fixture.base).port)})+'\n')
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve)})
}catch{process.stderr.write('F31_real_PG_browser_fixture_failed\n');process.exitCode=1}
finally{if(fixture)await fixture.close()}
