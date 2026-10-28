// Pure source/AST/argument checks. No database, credentials or runtime service.
import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync,symlinkSync,rmSync,lstatSync} from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import * as ts from 'typescript'
import {
  captureDescriptivePatchOperatorSources,assertDescriptivePatchOperatorSnapshot,
  descriptivePatchOperatorSqlBody,descriptivePatchOperatorPins,descriptivePatchOperatorSha,
  descriptivePatchOperatorPlan,parseDescriptivePatchOperatorArguments,runDescriptivePatchOperator,
} from '../src/agent-descriptive-patch-operator-source.mjs'
import {captureGeneratedOperatorSources} from '../src/agent-generated-operator-source.mjs'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const self='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'
const declaration='services/pg-api/src/agent-descriptive-patch-operator-source.d.mts'
const predecessorSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
const digest='a'.repeat(64)
let snapshot
before(async()=>{snapshot=await captureDescriptivePatchOperatorSources()})

test('only exact --plan is admitted; installation/recovery and incomplete arguments refuse before source capture',async()=>{
  assert.deepEqual(parseDescriptivePatchOperatorArguments(['--plan']),{mode:'plan'})
  assert.ok(Object.isFrozen(parseDescriptivePatchOperatorArguments(['--plan'])))
  for(const argv of [undefined,null,'--plan',[],['--apply'],['--recover'],['--preflight'],['--PLAN'],['--plan','extra'],['--apply','--confirm-database','agent_studio','--expected-source-sha256',digest]]){
    assert.throws(()=>parseDescriptivePatchOperatorArguments(argv),/^Error: descriptive_patch_operator_invalid_arguments$/)
    await assert.rejects(runDescriptivePatchOperator(argv),/^Error: descriptive_patch_operator_invalid_arguments$/)
  }
  // No API parser, credential path or connection is needed for CLI refusal.
  const child=spawnSync(process.execPath,[path.join(root,self),'--apply'],{
    encoding:'utf8',timeout:10000,env:{...process.env,DATABASE_URL:'forbidden://do-not-connect',PGHOST:'invalid.example',
      AGENT_STUDIO_DESCRIPTIVE_PATCH_060_ADMIN_PASSWORD_FILE:'/nonexistent/do-not-read',NODE_OPTIONS:'',NODE_PATH:''},
  })
  assert.equal(child.status,1,child.stderr)
  assert.equal(child.stdout,'')
  assert.equal(child.stderr,'DESCRIPTIVE_PATCH_060_REFUSED:descriptive_patch_operator_invalid_arguments\n')
})

test('real locked TypeScript5.9 AST closes full060 and the complete fixed059 predecessor, including types and shared sources',async()=>{
  assert.equal(ts.version,'5.9.3')
  assert.deepEqual(snapshot.manifest.parser,{name:'typescript',version:'5.9.3',sha256:'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'})
  const paths=new Set(snapshot.manifest.sources.map(s=>s.path)),edges=snapshot.manifest.imports
  for(const name of ['agent-descriptive-patch-audit.ts','agent-descriptive-patch-audit-core.ts','agent-generated-audit.ts','agent-generated-audit-core.ts',
    'agent-opinion-audit.ts','agent-assessment-audit.ts','agent-review-audit.ts','agent-optimization-audit.ts','agent-collaboration-audit.ts',
    'contracts.ts','agent-generated-operator-source.mjs','agent-generated-operator-source.d.mts','agent-generated-operator-core.ts','agent-generated-operator-cli.mjs']){
    assert.ok(paths.has('services/pg-api/src/'+name),name)
  }
  assert.ok(paths.has(self));assert.ok(paths.has(declaration));assert.ok(paths.has('shared/agent-role-limits.mjs'))
  assert.ok(edges.some(e=>e.from.endsWith('agent-descriptive-patch-audit.ts')&&e.to.endsWith('agent-generated-audit.ts')))
  assert.ok(edges.some(e=>e.from===declaration&&e.to.endsWith('agent-generated-operator-source.mjs')))
  assert.ok(snapshot.manifest.externals.includes('typescript'))
  assert.ok(snapshot.manifest.externals.every(x=>x.startsWith('node:')||x==='pg'||x==='typescript'))
  const predecessor=await captureGeneratedOperatorSources()
  assert.equal(predecessor.source_sha256,predecessorSha)
  assert.equal(snapshot.manifest.predecessor.source_sha256,predecessorSha)
  assert.deepEqual(snapshot.manifest.predecessor.manifest,predecessor.manifest)
  for(const source of predecessor.manifest.sources)assert.deepEqual(snapshot.manifest.sources.find(s=>s.path===source.path),source)
  assert.equal((await captureDescriptivePatchOperatorSources()).source_sha256,snapshot.source_sha256)
})

test('exact raw LF060 and its two independently fixed prosrc bodies survive outer transaction extraction byte-for-byte',()=>{
  assert.equal(snapshot.manifest.sql.path,'db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql')
  assert.equal(snapshot.manifest.sql.sha256,'b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9')
  assert.equal(descriptivePatchOperatorSqlBody(snapshot.sql),snapshot.body)
  assert.equal(descriptivePatchOperatorSha(snapshot.body),snapshot.manifest.sql.body_sha256)
  assert.doesNotMatch(snapshot.body,/^BEGIN;|^COMMIT;/m)
  const pins={}
  for(const match of snapshot.body.matchAll(/CREATE FUNCTION agentstudio\.(agent_descriptive_patch_[a-z_]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g))pins[match[1]]=descriptivePatchOperatorSha(match[2])
  assert.deepEqual(pins,{
    agent_descriptive_patch_receipt:'598e628e351ab88a863f6204780515894508d1d6a0ea7aef3ebdf9256b96aa68',
    agent_descriptive_patch_accept:'7d52ca4a0fb3b8a9580503dc8f3c1389bebaf8d56ab8a361caead942b5412091',
  })
  assert.deepEqual(pins,descriptivePatchOperatorPins)
  for(const raw of [undefined,Buffer.from(snapshot.sql),'\uFEFF'+snapshot.sql,snapshot.sql.replaceAll('\n','\r\n'),snapshot.sql+'\n',
    snapshot.sql.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),snapshot.sql+'COMMIT;\n',snapshot.sql.replace('BEGIN;\n','')]){
    assert.throws(()=>descriptivePatchOperatorSqlBody(raw),/descriptive_patch_operator_source_refused/)
  }
})

test('all nested snapshot/plan values are frozen and WeakSet provenance rejects clones, prototypes, proxies and incorrect digests',()=>{
  const check=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))check(child)}}
  check(snapshot)
  for(const change of [()=>{snapshot.body+='SELECT 1'},()=>{snapshot.manifest.sources[0].sha256=digest},
    ()=>{snapshot.manifest.prosrc.agent_descriptive_patch_accept=digest},()=>{snapshot.manifest.predecessor.manifest.sources.push({path:'foreign',sha256:digest})}])assert.throws(change,TypeError)
  assertDescriptivePatchOperatorSnapshot(snapshot,snapshot.source_sha256)
  for(const clone of [structuredClone(snapshot),{...snapshot},Object.create(snapshot),new Proxy(snapshot,{})]){
    assert.throws(()=>assertDescriptivePatchOperatorSnapshot(clone,snapshot.source_sha256),/source_refused/)
    assert.throws(()=>descriptivePatchOperatorPlan(clone),/source_refused/)
  }
  assert.throws(()=>assertDescriptivePatchOperatorSnapshot(snapshot,digest),/source_refused/)
  assert.throws(()=>assertDescriptivePatchOperatorSnapshot(snapshot,{toString(){throw Error('must not coerce')}}),/source_refused/)
  const plan=descriptivePatchOperatorPlan(snapshot);check(plan)
  assert.throws(()=>{plan.predecessor.source_sha256=digest},TypeError)
})

test('source-only plan keeps default-fresh050 unchanged and makes no installation, recovery or production claim',async()=>{
  const before=await captureGeneratedOperatorSources(),plan=await runDescriptivePatchOperator(['--plan'])
  assert.equal(plan.mode,'plan');assert.equal(plan.latest_migration,'pg_v9_060');assert.equal(plan.default_fresh_latest,'pg_v9_050')
  assert.equal(plan.read_only,true)
  for(const field of ['network_used','secret_read','initializes_database','services_started','writes_performed','installation_supported','recovery_supported','production_cutover_allowed'])assert.equal(plan[field],false,field)
  assert.equal(plan.source_sha256,snapshot.source_sha256)
  assert.equal(plan.default_fresh_source_sha256,before.manifest.default_fresh_source_sha256)
  assert.equal(plan.fresh_sources.length,34)
  assert.deepEqual(plan.fresh_sources,before.manifest.fresh_sources)
  assert.equal(Object.hasOwn(plan,'body'),false);assert.equal(Object.hasOwn(plan,'approval'),false)
  assert.equal((await captureGeneratedOperatorSources()).source_sha256,predecessorSha)
  const fresh=readFileSync(new URL('../src/pg18-fresh-runtime-source.mjs',import.meta.url),'utf8')
  assert.match(fresh,/latest_migration:"pg_v9_050"/);assert.doesNotMatch(fresh,/060_agent_descriptive_patch/)
  const source=readFileSync(path.join(root,self),'utf8'),tree=ts.createSourceFile(self,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const runtimeImports=[],dynamicImports=[]
  const scan=node=>{
    if(ts.isImportDeclaration(node))runtimeImports.push(node.moduleSpecifier.text)
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)dynamicImports.push(node.arguments[0].text)
    if(ts.isPropertyAccessExpression(node)&&node.expression.getText(tree)==='process')assert.notEqual(node.name.text,'env')
    ts.forEachChild(node,scan)
  }
  scan(tree)
  assert.ok(runtimeImports.every(s=>s.startsWith('node:')||s==='./agent-generated-operator-source.mjs'))
  assert.deepEqual(dynamicImports,['typescript'])
})

test('isolated source copies prove AST-only discovery and fail closed on computed imports, malformed syntax and fixed-source drift',async()=>{
  const parent=path.resolve(tmpdir()),fixture=mkdtempSync(path.join(parent,'own-operations-backend-s1-controlled060-'))
  try{
    const files=new Set([...snapshot.manifest.sources.map(s=>s.path),...snapshot.manifest.fresh_sources.map(s=>s.path),
      snapshot.manifest.sql.path,snapshot.manifest.predecessor.manifest.sql.path])
    for(const relative of files){const to=path.join(fixture,relative);mkdirSync(path.dirname(to),{recursive:true});copyFileSync(path.join(root,relative),to)}
    mkdirSync(path.join(fixture,'services/pg-api/node_modules'),{recursive:true})
    writeFileSync(path.join(fixture,'services/pg-api/package.json'),'{"type":"module"}\n')
    const parserRoot=path.dirname(path.dirname(fileURLToPath(import.meta.resolve('typescript'))))
    symlinkSync(parserRoot,path.join(fixture,'services/pg-api/node_modules/typescript'),'junction')
    const isolated=await import(pathToFileURL(path.join(fixture,self)).href)
    assert.equal((await isolated.captureDescriptivePatchOperatorSources()).source_sha256,snapshot.source_sha256)
    const mutate=async(relative,changed,accept=false)=>{
      const file=path.join(fixture,relative),original=readFileSync(file)
      try{
        writeFileSync(file,changed(original.toString('utf8')))
        if(accept)return await isolated.captureDescriptivePatchOperatorSources()
        await assert.rejects(isolated.captureDescriptivePatchOperatorSources(),/^Error: descriptive_patch_operator_source_refused$/)
      }finally{writeFileSync(file,original)}
    }
    const commented=await mutate(declaration,s=>s+"\n// import './not-a-module.ts'\nexport type StringOnly = \"import('./also-not-a-module.ts')\"\n",true)
    assert.notEqual(commented.source_sha256,snapshot.source_sha256)
    assert.equal(commented.manifest.imports.some(e=>e.to.includes('not-a-module')),false)
    const typed=await mutate(declaration,s=>s+"\nexport type SourceClient = import('./contracts.ts').SqlClient\n",true)
    assert.ok(typed.manifest.imports.some(e=>e.from===declaration&&e.to.endsWith('/contracts.ts')))
    for(const suffix of ["\nfunction unreviewedLoader(name){return import(name)}\n","\nfunction unreviewedUrl(name){return new URL(name,import.meta.url)}\n","\nexport const =\n"]){
      await mutate(self,s=>s+suffix)
    }
    for(const suffix of ["\nexport type Absent = import('./missing-source.ts').Absent\n","\nexport * from 'unreviewed-external'\n"]){await mutate(declaration,s=>s+suffix)}
    await mutate('services/pg-api/src/agent-generated-operator-source.d.mts',s=>s+'\n// changed complete059 predecessor\n')
    await mutate('services/pg-api/src/agent-descriptive-patch-audit.ts',s=>s+'\n// changed full060 wrapper\n')
    await mutate('services/pg-api/src/agent-descriptive-patch-audit-core.ts',s=>s.replace('598e628e','00000000'))
    await mutate(snapshot.manifest.fresh_sources[0].path,s=>s+'\n-- changed default fresh baseline\n')
    await mutate(snapshot.manifest.sql.path,s=>s.replaceAll('\n','\r\n'))
    assert.equal((await isolated.captureDescriptivePatchOperatorSources()).source_sha256,snapshot.source_sha256)
  }finally{
    // Delete only this test's verified, newly created temporary directory.
    const resolved=path.resolve(fixture)
    assert.ok(resolved.startsWith(parent+path.sep)&&path.basename(resolved).startsWith('own-operations-backend-s1-controlled060-'))
    assert.equal(lstatSync(resolved).isSymbolicLink(),false)
    rmSync(resolved,{recursive:true,force:true})
  }
})
