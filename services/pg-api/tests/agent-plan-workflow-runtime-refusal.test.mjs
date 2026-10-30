import test from 'node:test'
import assert from 'node:assert/strict'
import {agentPlanWorkflowRuntimeGenuineFixture} from './helpers/agent-plan-workflow-runtime-genuine-fixture.mjs'
import {startPgNativeAgentPlanWorkflowGenuineBrowserFixture} from '../../../tests/helpers/pg-native-agent-plan-workflow-genuine-fixture.mjs'
test('actual runtime fixture refuses ordinary hosts before DB/socket/credential operations',async()=>{
 await assert.rejects(agentPlanWorkflowRuntimeGenuineFixture({}),/genuine|ephemeral|refused|guard|required/i)
})
test('actual browser fixture refuses ordinary hosts before Vite, browser or fixture startup',async()=>{
 await assert.rejects(startPgNativeAgentPlanWorkflowGenuineBrowserFixture({}),/genuine|ephemeral|refused|guard|approved|requires|required/i)
})
