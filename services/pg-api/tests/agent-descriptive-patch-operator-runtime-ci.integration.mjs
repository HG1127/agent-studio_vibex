// Hosted dependency-load verification only. Never an installer or DB test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  requireDescriptiveOperatorRuntimeCi,descriptiveOperatorRuntimeCiCases,runDescriptiveOperatorRuntimeCiChild,
} from './helpers/agent-descriptive-patch-operator-runtime-ci-fixture.mjs'

// This gate runs before test registration, source capture, writes or pg import.
const proof=requireDescriptiveOperatorRuntimeCi()
assert.equal(descriptiveOperatorRuntimeCiCases.length,33,'original28 plus five actual POSIX protocol modes')
for(const scenario of descriptiveOperatorRuntimeCiCases)test('isolated POSIX runtime: '+scenario.id,{timeout:60000,concurrency:false},async()=>{
  const result=await runDescriptiveOperatorRuntimeCiChild(proof,scenario.id)
  assert.equal(result.case,scenario.id)
  assert.equal(result.phase,scenario.phase)
  assert.equal(result.result,scenario.positive?'verified':'refused')
  assert.equal(result.actual_posix_stage,true)
  assert.equal(result.database_calls,0)
  assert.equal(result.approved_manifest_sha_unchanged,true)
  assert.equal(result.manifest_copy_unchanged,scenario.id!=='negative-manifest-hash')
  assert.equal(result.source_sha256,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
  if(!scenario.positive)assert.equal(result.rejection_code,scenario.phase==='capture'?'descriptive_patch_operator_source_refused':'descriptive_patch_operator_runtime_refused')
  if(scenario.id==='positive-protocol-normalization'||scenario.id.startsWith('negative-protocol-')){
    assert.equal(result.verified_before_rejection,true)
    assert.deepEqual(result.protocol.messages,['parseComplete','bindComplete','closeComplete','noData'])
    assert.deepEqual(result.protocol.initial_lengths,[5,5,5,5])
    assert.deepEqual(result.protocol.wire_hex,['3100000004','3200000004','3300000004','6e00000004'])
    assert.equal(result.protocol.normalizations,4)
    assert.equal(result.protocol.assertions_after_wire,4)
    assert.equal(result.protocol.original_singleton_callbacks,true)
    assert.equal(result.protocol.same_verified_cache,true)
    assert.equal(result.protocol.locked_protocol_hashes,true)
    assert.equal(result.protocol.getter_calls,0)
    const mutation={
      'negative-protocol-length-revert':'observed4_to5',
      'negative-protocol-length-invalid':'observed4_to6',
      'negative-protocol-singleton-clone':'same_shape_noData_clone',
      'negative-protocol-length-getter':'length_getter_returning4',
    }[scenario.id]
    assert.equal(result.protocol.mutation,mutation)
  }
  console.log(JSON.stringify(result))
})
