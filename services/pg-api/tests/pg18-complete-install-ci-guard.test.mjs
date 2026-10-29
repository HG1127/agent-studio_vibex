// Ordinary-machine negative boundaries only. No positive DB proof is minted.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {requireCompleteProfileProvisionCi,requireCompleteProfileFixtureCi,assertCompleteProfileCiPermit,completeProfileCiBinding} from './helpers/pg18-complete-install-ci-guard.mjs'
import {buildCompleteProfileStage} from './helpers/pg18-complete-install-ci-stage.mjs'
import {createCompleteProfileContainers,closeCompleteProfileContainers,ownedCompleteProfilePool} from './helpers/pg18-complete-install-ci-containers.mjs'
test('new complete-install purpose cannot accept a forged permit or a foreign environment object',()=>{
 for(const ref of [{},Object.freeze({}),{kind:'provision',run:'1'}]){assert.throws(()=>assertCompleteProfileCiPermit(ref),/unsealed_ci_permit/);assert.throws(()=>completeProfileCiBinding(ref),/unsealed_ci_permit/)}
 for(const fn of [requireCompleteProfileProvisionCi,requireCompleteProfileFixtureCi])for(const env of [{},{GITHUB_ACTIONS:'true',CI:'true'},{AGENT_STUDIO_DESCRIPTIVE_INSTALL_CI_PURPOSE:'DESCRIPTIVE_060_AUTHENTIC_INSTALL_RESTORE_SYNTHETIC_ONLY'}])assert.throws(()=>fn(env),/ambient_environment_required/)
})
test('actual stage and container factories reject before source capture, directories, Docker or credentials',async()=>{
 await assert.rejects(buildCompleteProfileStage({}),/unsealed_ci_permit/)
 await assert.rejects(createCompleteProfileContainers({},{}),/unsealed_ci_permit/)
 await assert.rejects(closeCompleteProfileContainers({}),/created_lease_required/)
 await assert.rejects(ownedCompleteProfilePool({}),/private_target_reference_required/)
})
test('both actual new entries refuse ordinary invocation before dynamic fixture work',()=>{
 for(const file of ['ops/pg18-complete-install-ci.mjs','services/pg-api/tests/pg18-complete-install-ci.integration.mjs']){
  const result=spawnSync(process.execPath,['--experimental-strip-types',file,'--run'],{env:{PATH:process.env.PATH,CI:'false',GITHUB_ACTIONS:'false'},encoding:'utf8',timeout:15000})
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/ECONNREFUSED|Cannot find|ERR_MODULE_NOT_FOUND/);assert.match(result.stderr,/complete_install_ci_refused:host|complete065_actual_failure/)
 }
})
