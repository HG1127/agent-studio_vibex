// Hosted dependency-load verification only. Never an installer or DB test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  requireDescriptiveOperatorRuntimeCi,descriptiveOperatorRuntimeCiCases,runDescriptiveOperatorRuntimeCiChild,
} from './helpers/agent-descriptive-patch-operator-runtime-ci-fixture.mjs'

// This gate runs before test registration, source capture, writes or pg import.
const proof=requireDescriptiveOperatorRuntimeCi()
for(const scenario of descriptiveOperatorRuntimeCiCases)test('isolated POSIX runtime: '+scenario.id,{timeout:60000,concurrency:false},async()=>{
  const result=await runDescriptiveOperatorRuntimeCiChild(proof,scenario.id)
  assert.equal(result.case,scenario.id)
  assert.equal(result.phase,scenario.phase)
  assert.equal(result.result,scenario.positive?'verified':'refused')
  assert.equal(result.actual_posix_stage,true)
  assert.equal(result.database_calls,0)
  assert.equal(result.approved_manifest_sha_unchanged,true)
  assert.equal(result.manifest_copy_unchanged,scenario.id!=='negative-manifest-hash')
  assert.equal(result.source_sha256,'daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247')
  if(!scenario.positive)assert.equal(result.rejection_code,scenario.phase==='capture'?'descriptive_patch_operator_source_refused':'descriptive_patch_operator_runtime_refused')
  console.log(JSON.stringify(result))
})
