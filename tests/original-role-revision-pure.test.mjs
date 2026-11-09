import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentSpecRepository} from '../services/pg-api/src/repository.ts'
import {safeAgentSpec} from '../services/pg-api/src/contracts.ts'
import {prepareOriginalRoleUiPool} from '../services/pg-api/src/original-role-ui-policy.ts'
import {carryOriginalRoleRevisionOnClient} from '../services/pg-api/src/original-role-revision.ts'
import {originalRoleHash} from '../services/pg-api/src/original-role-execution.mjs'
import {parseOriginalRoleUiExtension} from '../shared/original-role-execution-contract.mjs'
import {frame,literalConnection,literalSupplier,startup,actor,roleEnv} from './helpers/original-role-client-frames.mjs'
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,owner=id(1),specId=id(3)
const previous=safeAgentSpec({goal:'原任务',tools:['calculate']}),next=safeAgentSpec({goal:'新任务',tools:['calculate']}),ext=parseOriginalRoleUiExtension({roles:[{id:'analyst',name:'分析',responsibility:'计算',tasks:['计算'],inputs:[],deliverables:['值'],depends_on:[],tools:['calculate'],done_criteria:['真实结果'],skill_refs:[{id:'abc123abc123abc',version:1,hash:'a'.repeat(64)}]}],capability_requirements:[{id:'sum',title:'计算',purpose:'计算',kind:'calculate',access:'read',required:true,role_ids:['analyst'],search_terms:[],suggested_tool_ids:['calculate']}]},previous.tools)
const saved=spec=>({id:specId,owner_user_id:owner,name:'分析助手',revision:'2',spec,created_at:'2026-11-03T00:00:00Z',updated_at:'2026-11-03T00:00:00Z'})
const owned=()=>frame(/current_user='agentstudio_api'/,[{ok:true}])
function priorRows(){return [{extension:structuredClone(ext),base_spec_sha256:originalRoleHash(previous),spec:previous,spec_sha256:originalRoleHash(previous)}]}
function preservationRows(spec=next){return [owned(),frame(/SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256/,priorRows()),owned(),frame(/SELECT revision,spec FROM agentstudio.agent_specs/,[{revision:2,spec}]),frame(/INSERT INTO agentstudio_roles.original_role_specs/),frame(/SELECT spec,spec_sha256/,[{spec,spec_sha256:originalRoleHash(spec)}]),frame(/INSERT INTO agentstudio_roles.original_role_extensions/,[{spec_id:specId}],values=>{assert.equal(values[2],2);assert.deepEqual(JSON.parse(values[4]),ext)}),frame(/INSERT INTO agentstudio.audit_events/,[{id:id(9)}])]}
test('real base repository update retains complete role/Skill/capability intent in the same CAS transaction',async()=>{const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(next)]),...preservationRows(),frame(/^COMMIT$/)]),pool=literalSupplier(db);await prepareOriginalRoleUiPool(pool,roleEnv);const result=await new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1);assert.equal(result.revision,2);assert.equal(db.calls.filter(c=>c.sql==='BEGIN').length,1);assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,1);db.done()})
test('actual base update cannot discard a role tool grant by silently pruning its sidecar',async()=>{const reduced=safeAgentSpec({goal:'删工具',tools:[]}),db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(reduced)]),owned(),frame(/SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256/,priorRows()),owned(),frame(/SELECT revision,spec FROM agentstudio.agent_specs/,[{revision:2,spec:reduced}]),frame(/^ROLLBACK$/)]),pool=literalSupplier(db);await prepareOriginalRoleUiPool(pool,roleEnv);await assert.rejects(()=>new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',reduced,1),/invalid_original_role_contract/);assert.equal(db.calls.some(c=>/INSERT INTO agentstudio_roles/.test(c.sql)),false);assert.equal(db.calls.some(c=>c.sql==='COMMIT'),false);db.done()})
test('ordinary specs outside the selected profile do not gain a role namespace or extra SQL',async()=>{const db=literalConnection([]);assert.equal(await carryOriginalRoleRevisionOnClient(db,owner,specId,1,2),undefined);db.done()})
test('unexpected returned base revision rejects the whole update before any role write',async()=>{const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[{...saved(next),revision:'3'}]),frame(/^ROLLBACK$/)]),pool=literalSupplier(db);await prepareOriginalRoleUiPool(pool,roleEnv);await assert.rejects(()=>new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1),/revision_transition_invalid/);assert.equal(db.calls.some(c=>/INSERT INTO agentstudio_roles/.test(c.sql)),false);db.done()})

test('selected profile keeps an ordinary role-free Agent ordinary after its actual base update',async()=>{
 const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(next)]),owned(),frame(/SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256/),frame(/SELECT 1 FROM agentstudio_roles.original_role_extensions/),frame(/^COMMIT$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv)
 const result=await new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1)
 assert.equal(result.revision,2);assert.ok(!db.calls.some(c=>/INSERT INTO agentstudio_roles/.test(c.sql)));db.done()
})
test('missing exact prior extension with other role history rolls back the original update',async()=>{
 const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(next)]),owned(),frame(/SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256/),frame(/SELECT 1 FROM agentstudio_roles.original_role_extensions/,[{}]),frame(/^ROLLBACK$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv)
 await assert.rejects(()=>new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1),/revision_metadata_missing/)
 assert.ok(!db.calls.some(c=>/INSERT INTO agentstudio_roles|^COMMIT$/.test(c.sql)));db.done()
})
for(const field of ['base_spec_sha256','spec_sha256'])test('corrupt prior '+field+' cannot be carried onto a new version',async()=>{
 const prior=priorRows();prior[0][field]='f'.repeat(64)
 const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(next)]),owned(),frame(/SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256/,prior),frame(/^ROLLBACK$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv)
 await assert.rejects(()=>new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1),/base_changed/)
 assert.ok(!db.calls.some(c=>/INSERT INTO agentstudio_roles|^COMMIT$/.test(c.sql)));db.done()
})
test('sidecar audit failure preserves its original error and rolls back base and role writes together',async()=>{
 const failure=Error('literal_audit_write_failed'),preserve=preservationRows();preserve.at(-1).error=failure
 const db=literalConnection([...startup(),...actor(owner),frame(/UPDATE agentstudio.agent_specs/,[saved(next)]),...preserve,frame(/^ROLLBACK$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv)
 await assert.rejects(()=>new AgentSpecRepository(pool).update({issuer:'urn:agentstudio:local:v1',subject:'verified'},specId,'分析助手',next,1),e=>e===failure)
 assert.equal(db.calls.filter(c=>c.sql==='ROLLBACK').length,2);assert.ok(!db.calls.some(c=>c.sql==='COMMIT'))
 assert.ok(!db.calls.some(c=>/original_skill_versions|original_skill_reviews/.test(c.sql)));db.done()
})
