// Source-only cohort predicate comparisons; no genuine Stage or runtime proof
// is minted by these tests. Fake references must fail the real private guards.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {assertCompleteProfileStageSourceProof,assertVerifiedCompleteProfileStage,completeProfileStageDescriptor,loadVerifiedCompleteProfileStage} from './helpers/pg18-complete-install-ci-stage.mjs'
import {captureFinalPathCiSourceOverlay} from './helpers/pg18-full069-final-path-ci-sources.mjs'
const ts=createRequire(import.meta.url)('typescript'),text=fs.readFileSync(new URL('./helpers/pg18-complete-install-ci-stage.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('stage.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sameCompleteProfileStageSourceClaim'),compare=Function('return ('+node.getText(ast)+')')()
function fixture(kind='provision'){const permit=Object.freeze({symbolic:'permit'}),complete=Object.freeze({symbolic:'complete'}),nonce='a'.repeat(64),profileSha='b'.repeat(64),stage=Object.freeze({input:'/root/agentstudio-complete-install-input/123-1-'+nonce,nonce,profileSha,sourceManifestSha:'c'.repeat(64),runtimeManifestSha:'d'.repeat(64)}),binding={kind,run:'123',attempt:'1',...(kind==='fixture'?{nonce,profileSha,sourceManifestSha:stage.sourceManifestSha,runtimeManifestSha:stage.runtimeManifestSha}:{})},state={permit,stage,complete,tree:stage.input+'/tree',input:stage.input,nonce,profileSha,kind,run:'123',attempt:'1'};return {permit,complete,stage,binding,state,base:state.tree,originPermit:permit}}
const matches=f=>compare(f.state,f.permit,f.base,f.complete,f.binding,f.originPermit)
test('provision binding has no nonce; exact source Stage nonce supplies its readonly tree claim',()=>{const f=fixture();assert.equal(Object.hasOwn(f.binding,'nonce'),false);assert.equal(matches(f),true);f.base='/root/agentstudio-complete-install-input/'+f.binding.run+'-'+f.binding.attempt+'-'+f.binding.nonce+'/tree';assert.equal(matches(f),false)})
test('fixture predicate retains exact original nonce/profile/source/runtime bindings',()=>{const f=fixture('fixture');assert.equal(matches(f),true);for(const key of['nonce','profileSha','sourceManifestSha','runtimeManifestSha']){const g=fixture('fixture');g.binding[key]='e'.repeat(64);assert.equal(matches(g),false,key)}})
for(const [name,edit]of[
 ['permit identity even with identical metadata',f=>f.permit=Object.freeze({symbolic:'permit'})],
 ['original Stage factory permit identity',f=>f.originPermit=Object.freeze({symbolic:'permit'})],
 ['complete snapshot identity even with identical metadata',f=>f.complete=Object.freeze({symbolic:'complete'})],
 ['different deployment tree',f=>f.base=f.base.replace('/tree','/other')],
 ['different source Stage nonce',f=>f.state.nonce='e'.repeat(64)],
 ['different source Stage input',f=>f.state.input+='/other'],
 ['different exact bound run',f=>f.binding.run='124'],
 ['different exact bound attempt',f=>f.binding.attempt='2'],
 ['different permit kind',f=>f.binding.kind='fixture'],
 ['different source Stage profile',f=>f.state.profileSha='e'.repeat(64)]
])test('source-only cohort comparison rejects '+name,()=>{const f=fixture();edit(f);assert.equal(matches(f),false)})
test('matching comparison data is not a genuine source proof or loaded Stage authority',()=>{const f=fixture();assert.equal(matches(f),true);assert.throws(()=>assertCompleteProfileStageSourceProof(f.state,f.permit,f.base,f.complete),/source_proof_reference/);assert.throws(()=>assertVerifiedCompleteProfileStage(f.state),/verified_stage_reference_required/);assert.throws(()=>completeProfileStageDescriptor(f.permit),/unsealed_ci_permit/)})
test('forged proof objects and null references cannot authorize a deployment root',()=>{const f=fixture();for(const fake of[null,undefined,{},Object.freeze(Object.create(null)),{permit:f.permit,stage:f.stage,complete:f.complete,tree:f.base}])assert.throws(()=>assertCompleteProfileStageSourceProof(fake,f.permit,f.base,f.complete),/source_proof_reference/)})
test('fake original permit cannot reach load or source capture IO even at a matching-shaped tree',async()=>{const f=fixture();await assert.rejects(loadVerifiedCompleteProfileStage(f.permit,f.stage),/unsealed_ci_permit/);await assert.rejects(captureFinalPathCiSourceOverlay(f.permit,f.base,f.complete,{}, {deployment:true,stageSourceProof:{}}),/unsealed_ci_permit/)})
test('source proof is internal; the sole public proof export only asserts',()=>{assert.equal(ts.version,'5.9.3');assert.equal(ast.parseDiagnostics.length,0);const exported=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>n.name.text);assert.equal(exported.filter(n=>/StageSourceProof/.test(n)).join(','),'assertCompleteProfileStageSourceProof');assert.ok(text.indexOf('f05Stage.verifyComplete069PlanWorkflowCiStage')<text.indexOf('stageSourceProofs.set(stageSourceProof'));assert.ok(text.indexOf('stageSourceProofs.set(stageSourceProof')<text.indexOf('companionStage.verifyCompleteCompanionCiStage'));assert.ok(!node.getText(ast).includes('loaded.assertRuntime'))})
