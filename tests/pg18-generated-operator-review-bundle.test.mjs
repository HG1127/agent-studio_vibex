// Pure bytes/real AST/archive/offline-plan tests. No SQL engine, pg import or target.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {collectGeneratedOperatorReviewSources,buildGeneratedOperatorReview,verifyGeneratedOperatorReviewArchive,verifyGeneratedOperatorReviewDirectory,extractGeneratedOperatorReviewArchive} from '../ops/build-pg18-generated-operator-review-bundle.mjs'

const sha=b=>createHash('sha256').update(b).digest('hex')
let temporary,output,result,collected,rawTar
before(async()=>{
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'generated-operator-review-test-'))
  output=path.join(temporary,'delivery');collected=await collectGeneratedOperatorReviewSources()
  result=await buildGeneratedOperatorReview(output);rawTar=gunzipSync(fs.readFileSync(result.archive))
})
after(()=>{
  if(!temporary)return
  const resolved=path.resolve(temporary),parent=fs.realpathSync(os.tmpdir())
  assert.equal(path.dirname(resolved),parent);assert.match(path.basename(resolved),/^generated-operator-review-test-/);assert.equal(fs.lstatSync(resolved).isSymbolicLink(),false)
  fs.rmSync(resolved,{recursive:true,force:true})
})
function directory(name){const dest=path.join(temporary,name);assert.equal(path.dirname(dest),temporary);fs.mkdirSync(dest);return dest}
function records(raw){const out=[];let offset=0;while(raw.subarray(offset,offset+512).some(b=>b!==0)){const h=raw.subarray(offset,offset+512),name=h.subarray(0,100).toString('ascii').split('\0')[0],size=parseInt(h.subarray(124,136).toString('ascii').split('\0')[0],8);out.push({offset,name,size,data:offset+512});offset+=512+Math.ceil(size/512)*512}return out}
function checksum(raw,offset){raw.fill(32,offset+148,offset+156);const sum=[...raw.subarray(offset,offset+512)].reduce((a,n)=>a+n,0);raw.write(sum.toString(8).padStart(6,'0')+'\0 ',offset+148,'ascii')}
function forged(name,change){const bytes=Buffer.from(rawTar);change(bytes);const archive=path.join(output,name+'.tar.gz');fs.writeFileSync(archive,gzipSync(bytes));return archive}

test('real final46-file97-edge AST closure,34 fresh assets and literal059/prosrc are the only source payload',()=>{
  const m=collected.snapshot.manifest
  assert.equal(collected.snapshot.source_sha256,'7fef4e6496faeac82aac8a320be2b60065fd380f485a07faca2900a70a407679')
  assert.equal(m.sources.length,46);assert.equal(m.imports.length,97);assert.equal(m.fresh_sources.length,34)
  assert.equal(m.default_fresh_latest,'pg_v9_050');assert.equal(m.sql.sha256,'74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063')
  assert.equal(m.sql.body_sha256,'1b035acd7e039e1b3eac252cf72779e9057228dbe7a0547b460ab1d5d90bb8ca')
  assert.deepEqual(m.prosrc,{agent_generated_receipt:'de102ea81efb146895200ac1f301d0b7b2912e452f032d87d66fe7b8b682adfa',agent_generated_accept:'43dc3667bd9c44e72c3a682425e96632b26a859a609be8ec89852270ccd276d9'})
  for(const f of [...m.sources,...m.fresh_sources,m.sql])assert.equal(sha(collected.entries.get(f.path)),f.sha256,f.path)
  assert.equal(collected.files.filter(f=>f.includes('/node_modules/')).length,4)
  assert.ok(collected.files.includes('services/pg-api/src/agent-generated-operator-source.d.mts'))
  assert.ok(collected.files.includes('shared/agent-role-limits.mjs'))
  assert.equal(collected.files.some(f=>/pb_data|\.env|\.sqlite|\.exe|node_modules\/pg\//.test(f)),false)
})
test('actual extracted offline plan passes with vendored pinned parser and no ancestor, secret, pg or network access',()=>{
  assert.equal(result.manifest_verified,true);assert.equal(result.offline_plan_verified,true);assert.equal(result.no_ancestor_dependency_fallback_verified,true)
  assert.equal(result.default_and_half_marker_refusals,4)
  for(const key of ['network_attempts','pg_imports','secret_or_outside_reads'])assert.equal(result[key],0)
  for(const key of ['target_initialized','activation_performed','dependency_installation_performed','production_cutover_allowed','pg_runtime_installed','pg_runtime_install_verified'])assert.equal(result[key],false)
  assert.equal(result.review_only,true);assert.equal(result.default_fresh_latest,'pg_v9_050')
  const verified=verifyGeneratedOperatorReviewArchive(result.archive,{expectedSha256:result.sha256})
  assert.equal(verified.files,collected.files.length);assert.equal(verified.external_digest_verified,true);assert.equal(verified.source_sha256,result.source_sha256)
  const dest=directory('clean');extractGeneratedOperatorReviewArchive(result.archive,dest,{expectedSha256:result.sha256})
  assert.equal(verifyGeneratedOperatorReviewDirectory(dest).files,collected.files.length)
  const dependency=JSON.parse(fs.readFileSync(path.join(dest,'DEPENDENCY_REVIEW.json'),'utf8'))
  assert.equal(dependency.pg.version,'8.23.1');assert.equal(dependency.pg.bundled,false);assert.equal(dependency.pg.runtime_install_verified,false)
  assert.equal(dependency.typescript.version,'5.9.3');assert.equal(dependency.typescript.bundled_files.length,4)
  assert.equal(dependency.independent_ci_runtime_install_required,true)
  assert.throws(()=>verifyGeneratedOperatorReviewArchive(result.archive,{expectedSha256:'0'.repeat(64)}),/archive_digest/)
  const environment=Object.fromEntries(['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  const listed=spawnSync('tar',['-tzf',result.archive],{encoding:'utf8',env:environment,timeout:15000,windowsHide:true})
  assert.equal(listed.status,0,listed.stderr);assert.deepEqual(listed.stdout.trim().split(/\r?\n/).sort(),collected.files)
  const standard=directory('system-tar'),extracted=spawnSync('tar',['-xzf',result.archive,'-C',standard],{encoding:'utf8',env:environment,timeout:15000,windowsHide:true})
  assert.equal(extracted.status,0,extracted.stderr);assert.equal(verifyGeneratedOperatorReviewDirectory(standard).files,collected.files.length)
})
test('archive refuses traversal/absolute/duplicate names and symlink/hardlink headers before extraction',()=>{
  for(const [i,name]of ['../escape','/absolute','C:/drive','folder\\escape'].entries()){
    const archive=forged('path-'+i,bytes=>{bytes.fill(0,0,100);bytes.write(name,0,'ascii');checksum(bytes,0)})
    assert.throws(()=>verifyGeneratedOperatorReviewArchive(archive),/GENERATED_OPERATOR_REVIEW_REFUSED/)
  }
  for(const kind of ['1','2','5','x']){const archive=forged('kind-'+kind,bytes=>{bytes.write(kind,156,'ascii');checksum(bytes,0)});assert.throws(()=>verifyGeneratedOperatorReviewArchive(archive),/tar_header/)}
  const rows=records(rawTar),duplicate=forged('duplicate',bytes=>{bytes.fill(0,rows[1].offset,rows[1].offset+100);bytes.write(rows[0].name,rows[1].offset,'ascii');checksum(bytes,rows[1].offset)})
  assert.throws(()=>verifyGeneratedOperatorReviewArchive(duplicate),/tar_entry/)
})
test('raw source/SQL/parser/lock or manifest tampering cannot be accepted as an authenticated review',()=>{
  const rows=records(rawTar)
  for(const [i,name]of ['services/pg-api/src/agent-generated-operator-cli.mjs','db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql','services/pg-api/node_modules/typescript/lib/typescript.js','services/pg-api/pnpm-lock.yaml','REVIEW_MANIFEST.json'].entries()){
    const row=rows.find(f=>f.name===name);assert.ok(row,name)
    const archive=forged('tamper-'+i,bytes=>{bytes[row.data]=bytes[row.data]===32?33:32})
    assert.throws(()=>verifyGeneratedOperatorReviewArchive(archive),/GENERATED_OPERATOR_REVIEW_REFUSED/)
  }
  const extraHeader=Buffer.from(rawTar.subarray(0,512));extraHeader.fill(0,0,100);extraHeader.write('unexpected.txt',0,'ascii');extraHeader.write('00000000001\0',124,'ascii');checksum(extraHeader,0)
  const extra=path.join(output,'extra.tar.gz');fs.writeFileSync(extra,gzipSync(Buffer.concat([rawTar.subarray(0,-1024),extraHeader,Buffer.from('x'),Buffer.alloc(511),Buffer.alloc(1024)])))
  assert.throws(()=>verifyGeneratedOperatorReviewArchive(extra),/GENERATED_OPERATOR_REVIEW_REFUSED/)
})
test('extracted exact allowlist rejects extra files/directories and filesystem links',()=>{
  const dest=directory('filesystem');extractGeneratedOperatorReviewArchive(result.archive,dest)
  const extra=path.join(dest,'unexpected.txt');fs.writeFileSync(extra,'extra');assert.throws(()=>verifyGeneratedOperatorReviewDirectory(dest),/allowlist/);fs.unlinkSync(extra)
  const dir=path.join(dest,'unexpected');fs.mkdirSync(dir);assert.throws(()=>verifyGeneratedOperatorReviewDirectory(dest),/extra_directory/);fs.rmdirSync(dir)
  const linked=path.join(dest,'linked');fs.symlinkSync(output,linked,process.platform==='win32'?'junction':'dir');assert.throws(()=>verifyGeneratedOperatorReviewDirectory(dest),/symlink/);fs.unlinkSync(linked)
  const occupied=directory('occupied');fs.writeFileSync(path.join(occupied,'keep'),'kept');assert.throws(()=>extractGeneratedOperatorReviewArchive(result.archive,occupied),/empty_destination_required/);assert.equal(fs.readFileSync(path.join(occupied,'keep'),'utf8'),'kept')
  assert.equal(verifyGeneratedOperatorReviewDirectory(dest).files,collected.files.length)
})
test('coherently rewriting a payload hash in the review manifest cannot override the final source snapshot',()=>{
  const dest=directory('coherent-tamper');extractGeneratedOperatorReviewArchive(result.archive,dest)
  const relative='services/pg-api/src/agent-generated-operator-cli.mjs',file=path.join(dest,relative),original=fs.readFileSync(file),changed=Buffer.from(original)
  changed[0]=32;fs.writeFileSync(file,changed)
  const manifestFile=path.join(dest,'REVIEW_MANIFEST.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'))
  manifest.files.find(f=>f.path===relative).sha256=sha(changed);fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n')
  assert.throws(()=>verifyGeneratedOperatorReviewDirectory(dest),/source_hash/)
})
test('output defaults and existing artifacts refuse without overwriting source or delivery files',async()=>{
  for(const dest of [undefined,'relative',path.parse(process.cwd()).root,process.cwd(),path.join(process.cwd(),'.tmp/forbidden-generated-review'),path.join(process.cwd(),'..notoutside')])await assert.rejects(buildGeneratedOperatorReview(dest),/GENERATED_OPERATOR_REVIEW_REFUSED/)
  const before=sha(fs.readFileSync(result.archive));await assert.rejects(buildGeneratedOperatorReview(output),/archive_already_exists/);assert.equal(sha(fs.readFileSync(result.archive)),before)
  const cli=spawnSync(process.execPath,['ops/build-pg18-generated-operator-review-bundle.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',windowsHide:true,timeout:15000})
  assert.notEqual(cli.status,0);assert.match(cli.stderr,/explicit_output_required/)
  assert.equal(fs.readdirSync(output).some(f=>/^generated-review-(?:source|check)-/.test(f)),false)
})
