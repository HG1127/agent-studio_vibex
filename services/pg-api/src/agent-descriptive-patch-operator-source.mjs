// Offline source/plan foundation only. This module cannot install or recover060.
import {readFileSync,lstatSync,realpathSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {isBuiltin} from 'node:module'
import {captureGeneratedOperatorSources,assertGeneratedOperatorSnapshot} from './agent-generated-operator-source.mjs'

const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'../../..')
const self='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'
const declaration='services/pg-api/src/agent-descriptive-patch-operator-source.d.mts'
// Production060 entry roots only. Every byte and import edge is discovered by
// the same real AST traversal below; test files are not runtime dependencies.
const operatorCore='services/pg-api/src/agent-descriptive-patch-operator-core.ts'
const operatorCli='services/pg-api/src/agent-descriptive-patch-operator-cli.mjs'
const operatorCliDeclaration='services/pg-api/src/agent-descriptive-patch-operator-cli.d.mts'
const operatorRuntime='services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs'
const operatorRuntimeDeclaration='services/pg-api/src/agent-descriptive-patch-operator-runtime.d.mts'
const operatorRoots=[operatorCore,operatorCli,operatorCliDeclaration,operatorRuntime,operatorRuntimeDeclaration]
const requiredOperatorEdges=[
  [operatorCli,self],[operatorCli,operatorCore],[operatorCli,operatorRuntime],
  [operatorCliDeclaration,operatorCore],[operatorRuntime,self],
  [operatorRuntimeDeclaration,self],[operatorCore,self],
]
const sqlPath='db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql'
const sqlSha='b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9'
const auditCore='services/pg-api/src/agent-descriptive-patch-audit-core.ts'
const coreSha='9c6ff4ab6247b40877b17c33fc87e90d007963a118101879eec6a4f58b067d6f'
const fullAudit='services/pg-api/src/agent-descriptive-patch-audit.ts'
const fullSha='0b5e935ceae27502d2a1d567c265ad86ed3185b72896263bfb1910ea380fde79'
const parserSha='3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'
const predecessorSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
export const descriptivePatchOperatorPins=Object.freeze({
  agent_descriptive_patch_receipt:'598e628e351ab88a863f6204780515894508d1d6a0ea7aef3ebdf9256b96aa68',
  agent_descriptive_patch_accept:'7d52ca4a0fb3b8a9580503dc8f3c1389bebaf8d56ab8a361caead942b5412091',
})
const captured=new WeakSet()
export const descriptivePatchOperatorSha=value=>createHash('sha256').update(value).digest('hex')
function refuse(){throw Error('descriptive_patch_operator_source_refused')}
function freeze(value){
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freeze(child)
    Object.freeze(value)
  }
  return value
}
function sourceFile(relative){
  if(!/^(?:services\/pg-api\/src\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js)|shared\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js))$/.test(relative)||relative.split('/').includes('..'))refuse()
  return relative
}
function read(relative){
  let current=root
  if(lstatSync(current).isSymbolicLink())refuse()
  for(const part of relative.split('/')){
    current=path.join(current,part)
    if(lstatSync(current).isSymbolicLink())refuse()
  }
  const stat=lstatSync(current)
  if(!stat.isFile()||stat.size>4*1024*1024||realpathSync(current)!==current)refuse()
  return readFileSync(current)
}
function utf8(raw){
  const value=raw.toString('utf8')
  if(!Buffer.from(value,'utf8').equals(raw)||value.startsWith('\uFEFF')||value.includes('\0'))refuse()
  return value
}
// Exact reviewed raw060 fixes this grammar. Only the two outer transaction
// marker lines are removed; every function-body byte, including LF, survives.
export function descriptivePatchOperatorSqlBody(raw){
  if(typeof raw!=='string'||raw.includes('\r')||descriptivePatchOperatorSha(raw)!==sqlSha)refuse()
  const begins=[...raw.matchAll(/^BEGIN;\n/gm)],commits=[...raw.matchAll(/^COMMIT;(?:\n|$)/gm)]
  if(begins.length!==1||commits.length!==1||begins[0].index>=commits[0].index||commits[0].index+commits[0][0].length!==raw.length)refuse()
  const body=raw.slice(0,begins[0].index)+raw.slice(begins[0].index+begins[0][0].length,commits[0].index)
  const found={}
  for(const match of raw.matchAll(/CREATE FUNCTION agentstudio\.(agent_descriptive_patch_[a-z_]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)){
    if(Object.hasOwn(found,match[1]))refuse()
    found[match[1]]=descriptivePatchOperatorSha(match[2])
  }
  if(JSON.stringify(found)!==JSON.stringify(descriptivePatchOperatorPins))refuse()
  return body
}
function checkCorePins(ts,tree){
  const declarations=tree.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations)
  const inventories=declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text==='functions')
  if(inventories.length!==1||!ts.isObjectLiteralExpression(inventories[0].initializer))refuse()
  const pins={}
  for(const property of inventories[0].initializer.properties){
    if(!ts.isPropertyAssignment(property)||!ts.isIdentifier(property.name)||!ts.isObjectLiteralExpression(property.initializer))refuse()
    const name=property.name.text
    if(!Object.hasOwn(descriptivePatchOperatorPins,name)||Object.hasOwn(pins,name))refuse()
    const hashes=property.initializer.properties.filter(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='sha')
    if(hashes.length!==1||!ts.isStringLiteral(hashes[0].initializer))refuse()
    pins[name]=hashes[0].initializer.text
  }
  if(JSON.stringify(pins)!==JSON.stringify(descriptivePatchOperatorPins))refuse()
}
export async function captureDescriptivePatchOperatorSources(){
  try{
    // Use the actual locked API parser. No regex import discovery or substitute
    // parser, and no configurable source root, file loader or pin refresher.
    const parserFile=fileURLToPath(import.meta.resolve('typescript'))
    if(!lstatSync(parserFile).isFile()||lstatSync(parserFile).size>16*1024*1024||descriptivePatchOperatorSha(readFileSync(parserFile))!==parserSha)refuse()
    const ts=await import('typescript')
    if(ts.version!=='5.9.3')refuse()
    const predecessor=await captureGeneratedOperatorSources()
    assertGeneratedOperatorSnapshot(predecessor,predecessorSha)
    if(predecessor.manifest.latest_migration!=='pg_v9_059'||predecessor.manifest.default_fresh_latest!=='pg_v9_050'||predecessor.manifest.fresh_sources.length!==34)refuse()
    const entries=new Map(),edges=[],externals=new Set()
    const pending=[self,declaration,fullAudit,...operatorRoots,...predecessor.manifest.sources.map(s=>s.path)]
    while(pending.length){
      const relative=sourceFile(pending.pop())
      if(entries.has(relative))continue
      const raw=read(relative),text=utf8(raw)
      const tree=ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true,relative.endsWith('.mjs')||relative.endsWith('.js')?ts.ScriptKind.JS:ts.ScriptKind.TS)
      if(tree.parseDiagnostics.length)refuse()
      entries.set(relative,{path:relative,sha256:descriptivePatchOperatorSha(raw)})
      const add=value=>{
        if(!ts.isStringLiteralLike(value))refuse()
        const spec=value.text
        if(spec.startsWith('.')){
          const next=sourceFile(path.posix.normalize(path.posix.join(path.posix.dirname(relative),spec)))
          edges.push({from:relative,to:next})
          pending.push(next)
        }else if(spec.startsWith('node:')&&isBuiltin(spec)||['pg','typescript'].includes(spec))externals.add(spec)
        else refuse()
      }
      const visit=node=>{
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)add(node.moduleSpecifier)
        if(ts.isImportEqualsDeclaration(node)){
          if(!ts.isExternalModuleReference(node.moduleReference)||!node.moduleReference.expression)refuse()
          add(node.moduleReference.expression)
        }
        if(ts.isImportTypeNode(node)){
          if(!ts.isLiteralTypeNode(node.argument))refuse()
          add(node.argument.literal)
        }
        if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
          if(node.arguments.length!==1)refuse()
          add(node.arguments[0])
        }
        if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'){
          if(node.arguments?.length!==2||node.arguments[1].getText(tree)!=='import.meta.url')refuse()
          add(node.arguments[0])
        }
        ts.forEachChild(node,visit)
      }
      visit(tree)
      if(relative===auditCore){
        if(descriptivePatchOperatorSha(raw)!==coreSha)refuse()
        checkCorePins(ts,tree)
      }
    }
    if(entries.get(fullAudit)?.sha256!==fullSha||!entries.has(auditCore))refuse()
    // Roots alone cannot substitute for the actual entry's imports: removing
    // a required literal import must refuse, even when its target is a root.
    if(operatorRoots.some(p=>!entries.has(p))||requiredOperatorEdges.some(([from,to])=>!edges.some(e=>e.from===from&&e.to===to)))refuse()
    for(const source of predecessor.manifest.sources)if(entries.get(source.path)?.sha256!==source.sha256)refuse()
    for(const source of predecessor.manifest.fresh_sources)if(descriptivePatchOperatorSha(read(source.path))!==source.sha256)refuse()
    const raw=read(sqlPath),sql=utf8(raw),body=descriptivePatchOperatorSqlBody(sql)
    const manifest={format:'agent_descriptive_patch_operator_sources_v1',latest_migration:'pg_v9_060',default_fresh_latest:'pg_v9_050',
      default_fresh_source_sha256:predecessor.manifest.default_fresh_source_sha256,fresh_sources:predecessor.manifest.fresh_sources,
      predecessor:{latest_migration:'pg_v9_059',source_sha256:predecessorSha,manifest:predecessor.manifest},
      parser:{name:'typescript',version:ts.version,sha256:parserSha},
      sql:{path:sqlPath,sha256:descriptivePatchOperatorSha(raw),body_sha256:descriptivePatchOperatorSha(body)},
      prosrc:descriptivePatchOperatorPins,sources:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),
      imports:edges.sort((a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en')),externals:[...externals].sort()}
    const snapshot=freeze({manifest,source_sha256:descriptivePatchOperatorSha(JSON.stringify(manifest)),sql,body})
    captured.add(snapshot)
    return snapshot
  }catch{refuse()}
}
export function assertDescriptivePatchOperatorSnapshot(snapshot,expected){
  if(!captured.has(snapshot)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||snapshot.source_sha256!==expected||
    descriptivePatchOperatorSha(JSON.stringify(snapshot.manifest))!==expected||descriptivePatchOperatorSqlBody(snapshot.sql)!==snapshot.body)refuse()
}
export function descriptivePatchOperatorPlan(snapshot){
  if(!captured.has(snapshot))refuse()
  assertDescriptivePatchOperatorSnapshot(snapshot,snapshot.source_sha256)
  return freeze({mode:'plan',...snapshot.manifest,source_sha256:snapshot.source_sha256,
    database:'agent_studio',postgres_major:18,read_only:true,network_used:false,secret_read:false,
    initializes_database:false,services_started:false,writes_performed:false,installation_supported:false,
    recovery_supported:false,production_cutover_allowed:false})
}
export function parseDescriptivePatchOperatorArguments(argv){
  if(!Array.isArray(argv)||argv.length!==1||argv[0]!=='--plan')throw Error('descriptive_patch_operator_invalid_arguments')
  return Object.freeze({mode:'plan'})
}
export async function runDescriptivePatchOperator(argv){
  parseDescriptivePatchOperatorArguments(argv)
  return descriptivePatchOperatorPlan(await captureDescriptivePatchOperatorSources())
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runDescriptivePatchOperator(process.argv.slice(2)))+'\n')}
  catch(error){
    const code=error instanceof Error&&/^descriptive_patch_operator_[a-z_]+$/.test(error.message)?error.message:'descriptive_patch_operator_source_refused'
    process.stderr.write('DESCRIPTIVE_PATCH_060_REFUSED:'+code+'\n')
    process.exitCode=1
  }
}
