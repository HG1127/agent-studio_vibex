
import {isNativeError,isProxy} from 'node:util/types'
import {requireStaff084Hosted} from '../tests/helpers/staff084-hosted-guard.mjs'
export function staff084HostedRefusal(error){
 try{if(!isNativeError(error)||isProxy(error))return 'staff084_hosted_verification_failed'
 const code=Object.getOwnPropertyDescriptor(error,'code')?.value,message=Object.getOwnPropertyDescriptor(error,'message')?.value
 if(typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code))return 'staff084_hosted_sqlstate_'+code
 if(typeof message==='string'&&/^(?:staff084|staff_composite|employee_ui078|complete069|complete_service|original_staff084)_[a-z_]{1,100}$/.test(message))return message
 return 'staff084_hosted_verification_failed'
 }catch{return 'staff084_hosted_verification_failed'}
}
export async function runStaff084Hosted(env=process.env){
 const permit=requireStaff084Hosted(env)
 const {withStaff084HostedFixture}=await import('../tests/helpers/staff084-hosted-fixture.mjs')
 return await withStaff084HostedFixture(env,async fixture=>{
  const browser=permit.suite.endsWith('-browser')
  const story=browser?(await import('../tests/helpers/staff084-hosted-browser-story.mjs')).staff084HostedBrowserStory:(await import('../tests/helpers/staff084-hosted-http-story.mjs')).staff084HostedHttpStory
  const proof=await story(fixture)
  return {format:'staff084_hosted_observation_v1',head:permit.head,suite:permit.suite,profile:permit.profile,target:'agent_studio:5333/original14_LOGINs',actual_SQL_executed:true,actual_API_and_Auth_LOGIN_profile_verified:true,actual_14_TCP_LOGINs:fixture.actualLoginProofs,Native_original_credential_vault_process_verified:false,long_running_Worker_verified:false,story:proof,production_GO:false}
 })
}
if(process.argv[1]&&new URL(import.meta.url).pathname===new URL('file://'+process.argv[1]).pathname){
 try{process.stdout.write(JSON.stringify(await runStaff084Hosted())+'\n')}
 catch(error){process.stderr.write(staff084HostedRefusal(error)+'\n');process.exitCode=1}
}
