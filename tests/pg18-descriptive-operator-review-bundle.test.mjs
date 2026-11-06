// Real source/AST, archive and extracted offline entry checks. No database.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {buildDescriptiveOperatorReview,verifyDescriptiveOperatorReviewArchive,extractDescriptiveOperatorReviewArchive,verifyDescriptiveOperatorReviewDirectory} from '../ops/build-pg18-descriptive-operator-review-bundle.mjs'

const source='bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67'
const sha=b=>createHash('sha256').update(b).digest('hex')
let temporary,result,rawTar,serial=0
before(async()=>{
 temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'descriptive-operator-review-test-'))
 result=await buildDescriptiveOperatorReview(path.join(temporary,'delivery'))
 rawTar=gunzipSync(fs.readFileSync(result.archive))
})
after(()=>{
 if(!temporary)return
 const absolute=path.resolve(temporary)
 assert.equal(path.dirname(absolute),fs.realpathSync(os.tmpdir()))
 assert.match(path.basename(absolute),/^descriptive-operator-review-test-/)
 assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false)
 fs.rmSync(absolute,{recursive:true,force:true})
})
function extracted(){
 const folder=path.join(temporary,'extract-'+(++serial));fs.mkdirSync(folder)
 extractDescriptiveOperatorReviewArchive(result.archive,folder,{expectedSha256:result.sha256})
 return folder
}
function changedArchive(raw){
 const file=path.join(temporary,'changed-'+(++serial)+'.tar.gz');fs.writeFileSync(file,gzipSync(raw))
 return file
}
function checksum(header){
 header.fill(32,148,156)
 header.write([...header.subarray(0,512)].reduce((a,n)=>a+n,0).toString(8).padStart(6,'0')+'\0 ',148,'ascii')
 return header
}
test('build independently verifies source55,119edges, original059, extracted plan and zero network/pg/secret access',()=>{
 assert.equal(result.source_sha256,source);assert.equal(result.AST_files,55);assert.equal(result.AST_edges,119)
 assert.equal(result.packed_files,102);assert.equal(result.manifest_verified,true)
 assert.equal(result.offline_plan_verified,true);assert.equal(result.no_ancestor_dependency_fallback_verified,true)
 assert.equal(result.default_and_half_marker_refusals,4)
 for(const key of ['network_attempts','pg_imports','secret_or_outside_reads'])assert.equal(result[key],0)
 for(const key of ['activation_performed','target_initialized','production_cutover_allowed','pg_runtime_installed','pg_runtime_install_verified','dependency_installation_performed'])assert.equal(result[key],false)
 const checked=verifyDescriptiveOperatorReviewArchive(result.archive,{expectedSha256:result.sha256})
 assert.equal(checked.external_digest_verified,true)
 assert.equal(checked.predecessor059_source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')
})
test('external archive digest mismatch is refused before payload use',()=>{
 assert.throws(()=>verifyDescriptiveOperatorReviewArchive(result.archive,{expectedSha256:'0'.repeat(64)}),/archive_digest/)
})
test('archive type, path traversal, duplicate path and trailing payload refuse even with a newly matching outer digest',()=>{
 for(const mutate of [
  b=>{b[156]=50;checksum(b)},
  b=>{b.fill(0,0,100);b.write('../outside',0,'ascii');checksum(b)},
  b=>Buffer.concat([b.subarray(0,b.length-1024),b.subarray(0,Math.ceil((512+parseInt(b.subarray(124,136).toString('ascii'),8))/512)*512),Buffer.alloc(1024)]),
  b=>Buffer.concat([b,Buffer.alloc(512)]),
 ]){
  const copy=Buffer.from(rawTar),next=mutate(copy)??copy,file=changedArchive(next)
  assert.throws(()=>verifyDescriptiveOperatorReviewArchive(file,{expectedSha256:sha(fs.readFileSync(file))}),/DESCRIPTIVE_OPERATOR_REVIEW_REFUSED:/)
 }
})
test('extracted source, original059 SQL and embedded parser bytes are independently hash bound',()=>{
 for(const rel of ['services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs','db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql','services/pg-api/node_modules/typescript/lib/typescript.js']){
  const dir=extracted();fs.appendFileSync(path.join(dir,rel),'\n// changed\n')
  assert.throws(()=>verifyDescriptiveOperatorReviewDirectory(dir),/source_hash|parser_bytes/)
 }
})
test('extra credentials, nested paths and missing source refuse',()=>{
 for(const change of [
  d=>fs.writeFileSync(path.join(d,'.env.local'),'SYNTHETIC_ONLY=x\n'),
  d=>{fs.mkdirSync(path.join(d,'extra'));fs.writeFileSync(path.join(d,'extra','source.mjs'),'export{}\n')},
  d=>fs.unlinkSync(path.join(d,'services/pg-api/src/agent-descriptive-patch-operator-core.ts')),
 ]){
  const dir=extracted();change(dir)
  assert.throws(()=>verifyDescriptiveOperatorReviewDirectory(dir),/DESCRIPTIVE_OPERATOR_REVIEW_REFUSED:/)
 }
})
test('package bytes are canonical reviewed Linux LF and a different package fails despite unchanged locked versions',()=>{
 const dir=extracted(),file=path.join(dir,'services/pg-api/package.json')
 assert.equal(sha(fs.readFileSync(file)),'90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58')
 const pkg=JSON.parse(fs.readFileSync(file,'utf8'));pkg.scripts.injected='echo synthetic'
 fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n')
 assert.throws(()=>verifyDescriptiveOperatorReviewDirectory(dir),/locked_dependencies/)
})
test('hard linked extracted source and nonempty extraction destinations refuse',()=>{
 const dir=extracted(),file=path.join(dir,'services/pg-api/src/agent-descriptive-patch-operator-core.ts')
 fs.linkSync(file,path.join(temporary,'hard-link-'+(++serial)))
 assert.throws(()=>verifyDescriptiveOperatorReviewDirectory(dir),/directory_bounds/)
 assert.throws(()=>extractDescriptiveOperatorReviewArchive(result.archive,dir,{expectedSha256:result.sha256}),/empty_destination_required/)
})
test('plan metadata is source bound and never grants execution, installation or migration permission',()=>{
 const dir=extracted(),file=path.join(dir,'OPERATOR_PLAN.json'),plan=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(plan.expected_source_sha256,source);assert.equal(plan.latest_migration,'pg_v9_060')
 assert.equal(plan.default_fresh_latest,'pg_v9_050')
 for(const key of ['installation_supported','recovery_supported','operator_execution_verified','production_cutover_allowed'])assert.equal(plan[key],false)
 plan.production_cutover_allowed=true;fs.writeFileSync(file,JSON.stringify(plan))
 assert.throws(()=>verifyDescriptiveOperatorReviewDirectory(dir),/metadata_binding/)
})
