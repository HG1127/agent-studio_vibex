
import {isNativeError,isProxy} from 'node:util/types'
import {requireQuality089Hosted} from '../tests/helpers/quality089-hosted-guard.mjs'
export function quality089HostedRefusal(error){
 try{
  if(isProxy(error)||!isNativeError(error))return 'quality089_hosted_verification_failed'
  const fields=['code','message','reason'].map(key=>Object.getOwnPropertyDescriptor(error,key))
  if(fields.some(field=>field&&!Object.hasOwn(field,'value')))return 'quality089_hosted_verification_failed'
  const code=fields[0]?.value,message=fields[1]?.value
  switch(code){
   case 'ERR_ASSERTION':return 'quality089_hosted_assertion_failed'
   case 'ERR_MODULE_NOT_FOUND':case 'MODULE_NOT_FOUND':return 'quality089_hosted_dependency_unavailable'
   case 'ENOENT':return 'quality089_hosted_source_unavailable'
   case 'EACCES':case 'EPERM':return 'quality089_hosted_source_access_refused'
   case 'ETIMEDOUT':case 'ERR_SCRIPT_EXECUTION_TIMEOUT':return 'quality089_hosted_deadline'
  }
  if(typeof code==='string'&&code.length===5&&/^[0-9A-Z]{5}$/.test(code))return 'quality089_hosted_sqlstate_'+code
  const tagged=value=>typeof value==='string'&&/^(?:quality089|quality_composite|employee_quality089|employee_ui078|complete069|complete_service|original_quality089)_(?=[a-z_]{1,100}$)[a-z]+(?:_[a-z]+)*$/.exec(value)?.[0]===value
  if(tagged(code))return code
  if(tagged(message))return message
  if(message==='quality089_original_Node24_required')return 'quality089_hosted_node_version_refused'
  return 'quality089_hosted_verification_failed'
 }catch{return 'quality089_hosted_verification_failed'}
}
export async function runQuality089Hosted(env=process.env){
 const permit=requireQuality089Hosted(env)
 const {withQuality089HostedFixture}=await import('../tests/helpers/quality089-hosted-fixture.mjs')
 return await withQuality089HostedFixture(env,async f=>{
  const story=permit.suite==='schema-http'?(await import('../tests/helpers/quality089-hosted-http-story.mjs')).quality089HostedHttpStory:(await import('../tests/helpers/quality089-hosted-browser-story.mjs')).quality089HostedBrowserStory
  const result=await story(f);return {format:'original_quality089_hosted_observation_v1',head:permit.head,suite:permit.suite,target:'agent_studio/5333/original_LOGIN',profile:f.profileProof.profile,actual_SQL_executed:true,actual_profile_and_LOGIN_verified:true,story:result,production_GO:false}
 })
}
if(process.argv[1]&&new URL(import.meta.url).pathname===new URL('file://'+process.argv[1]).pathname){try{const result=await runQuality089Hosted();process.stdout.write(JSON.stringify(result)+'\n')}catch(error){process.stderr.write(quality089HostedRefusal(error)+'\n');process.exitCode=1}}
