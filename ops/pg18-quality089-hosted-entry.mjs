
import {requireQuality089Hosted} from '../tests/helpers/quality089-hosted-guard.mjs'
export async function runQuality089Hosted(env=process.env){
 const permit=requireQuality089Hosted(env)
 const {withQuality089HostedFixture}=await import('../tests/helpers/quality089-hosted-fixture.mjs')
 return await withQuality089HostedFixture(env,async f=>{
  const story=permit.suite==='schema-http'?(await import('../tests/helpers/quality089-hosted-http-story.mjs')).quality089HostedHttpStory:(await import('../tests/helpers/quality089-hosted-browser-story.mjs')).quality089HostedBrowserStory
  const result=await story(f);return {format:'original_quality089_hosted_observation_v1',head:permit.head,suite:permit.suite,target:'agent_studio/5333/original_LOGIN',profile:f.profileProof.profile,actual_SQL_executed:true,actual_profile_and_LOGIN_verified:true,story:result,production_GO:false}
 })
}
if(process.argv[1]&&new URL(import.meta.url).pathname===new URL('file://'+process.argv[1]).pathname){try{const result=await runQuality089Hosted();process.stdout.write(JSON.stringify(result)+'\n')}catch{process.stderr.write('quality089_hosted_verification_failed\n');process.exitCode=1}}
