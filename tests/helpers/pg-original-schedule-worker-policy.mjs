import {originalSchedules078Policy} from './pg-original-schedules078-browser-policy.mjs'
import {originalRunDetailApiRoute} from '../../src/lib/originalRunDetailTransport.ts'
export function originalScheduleWorkerPolicy(method,raw,accept=''){
 const prior=originalSchedules078Policy(method,raw,accept)
 if(prior.kind!=='api_denied')return prior
 if(method==='GET'&&originalRunDetailApiRoute(raw,'GET')&&/^\/__pg_native\/api\/v2\/(?:workflow-v2-runs|agent-autonomous-runs)(?:\/|$)/.test(raw))return{kind:'native',pathname:raw.split('?',1)[0]}
 return prior
}
