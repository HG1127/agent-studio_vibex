import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {generatedOperatorCiPlan,projectGeneratedOperatorPgRuntime,copyGeneratedOperatorPgRuntime} from '../ops/pg18-generated-operator-ci.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex')
const ordinary=()=>Object.fromEntries(['PATH','SystemRoot','TEMP','TMP','HOME'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
test('operator CI defaults to an effect-free plan and refuses an ordinary host before pnpm path, Docker, source or credentials',()=>{
 const env={...ordinary(),GITHUB_ACTIONS:'false',CI:'false'},entry=path.join(root,'ops/pg18-generated-operator-ci.mjs')
 const result=spawnSync(process.execPath,[entry,'--plan'],{env,encoding:'utf8',timeout:10000,windowsHide:true})
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),generatedOperatorCiPlan())
 assert.equal(JSON.parse(result.stdout).network_used,false);assert.equal(JSON.parse(result.stdout).containers_started,false)
 const refused=spawnSync(process.execPath,[entry,'--run','--pnpm',path.resolve(root,'nonexistent-ci-package-manager')],{env,encoding:'utf8',timeout:10000,windowsHide:true})
 assert.notEqual(refused.status,0);assert.match(refused.stderr,/generated_operator_ci_setup_refused:environment/)
 assert.doesNotMatch(refused.stderr,/ENOENT|docker|pnpm_version|ECONNREFUSED|password authentication/)
})
test('pg-only installer projection preserves the actual full locked packages and exact reviewed pg version/integrity without API extras or scripts',()=>{
 const pkg=fs.readFileSync(path.join(root,'services/pg-api/package.json')),lock=fs.readFileSync(path.join(root,'services/pg-api/pnpm-lock.yaml'))
 const result=projectGeneratedOperatorPgRuntime(pkg,lock),minimal=JSON.parse(result.packageBytes)
 assert.deepEqual(minimal.dependencies,{pg:'^8.23.1'});assert.equal(minimal.scripts,undefined);assert.equal(minimal.devDependencies,undefined)
 assert.equal(result.pgVersion,'8.23.1');assert.equal(result.originalLockSha256,sha(lock))
 assert.match(result.lockBytes.toString(),/pg:[\s\S]*specifier: \^8\.23\.1[\s\S]*version: 8\.23\.1/)
 // The complete packages/snapshots and their integrity values stay byte-value
 // identical through projection; only the importer is narrowed for installation.
 const yaml=createRequire(import.meta.url)(path.join(root,'node_modules/.pnpm/yaml@1.10.3/node_modules/yaml'))
 const original=yaml.parse(lock.toString()),projected=yaml.parse(result.lockBytes.toString())
 assert.deepEqual(projected.packages,original.packages);assert.deepEqual(projected.snapshots,original.snapshots)
 assert.deepEqual(projected.importers,{'.':{dependencies:{pg:original.importers['.'].dependencies.pg}}})
 assert.throws(()=>projectGeneratedOperatorPgRuntime(Buffer.from(JSON.stringify({...JSON.parse(pkg),dependencies:{pg:'^9.0.0'}})),lock),/locked_pg_projection/)
 assert.throws(()=>projectGeneratedOperatorPgRuntime(pkg,Buffer.from(lock.toString().replace('version: 8.23.1','version: 8.23.2'))),/original_lock/)
 assert.deepEqual(fs.readFileSync(path.join(root,'services/pg-api/pnpm-lock.yaml')),lock)
})
test('runtime staging copies only independent regular text files and refuses parser collisions, hardlinks and native binaries',()=>{
 const parent=path.join(root,'.tmp/pg-migration-completion');fs.mkdirSync(parent,{recursive:true})
 const temp=fs.mkdtempSync(path.join(parent,'generated-operator-runtime-copy-'))
 const ownedRemove=()=>{const resolved=fs.realpathSync(temp);assert.equal(path.dirname(resolved),fs.realpathSync(parent));assert.ok(!fs.lstatSync(temp).isSymbolicLink());fs.rmSync(temp,{recursive:true,force:false})}
 try{
  const make=name=>{const p=path.join(temp,name);fs.mkdirSync(p);return p}
  const source=make('installed'),dest=make('staged');fs.mkdirSync(path.join(source,'pg'));fs.writeFileSync(path.join(source,'pg/package.json'),'{}\n');fs.writeFileSync(path.join(source,'pg/index.js'),'export default {}\n')
  fs.mkdirSync(path.join(dest,'typescript'));fs.writeFileSync(path.join(dest,'typescript/package.json'),'packaged-parser-unchanged')
  const files=copyGeneratedOperatorPgRuntime(source,dest);assert.equal(files.length,2)
  for(const f of files){const relative=f.path.replace('services/pg-api/node_modules/',''),actual=fs.readFileSync(path.join(dest,relative));assert.equal(sha(actual),f.sha256);assert.equal(fs.statSync(path.join(dest,relative)).nlink,1)}
  assert.equal(fs.readFileSync(path.join(dest,'typescript/package.json'),'utf8'),'packaged-parser-unchanged')
  const collision=make('collision');fs.mkdirSync(path.join(collision,'pg'));assert.throws(()=>copyGeneratedOperatorPgRuntime(source,collision),/runtime_collision/)
  const bad=make('binary');fs.mkdirSync(path.join(bad,'pg'));fs.writeFileSync(path.join(bad,'pg/package.json'),'{}');fs.writeFileSync(path.join(bad,'pg/native.node'),'not allowed');assert.throws(()=>copyGeneratedOperatorPgRuntime(bad,make('binary-target')),/runtime_file/)
  const linked=make('linked');fs.mkdirSync(path.join(linked,'pg'));fs.writeFileSync(path.join(linked,'pg/package.json'),'{}');fs.linkSync(path.join(linked,'pg/package.json'),path.join(temp,'linked-original'));assert.throws(()=>copyGeneratedOperatorPgRuntime(linked,make('linked-target')),/runtime_file/)
 }finally{ownedRemove()}
})
