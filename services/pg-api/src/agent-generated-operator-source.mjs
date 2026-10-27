import {readFileSync,lstatSync,realpathSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {captureFreshRuntimeSources} from './pg18-fresh-runtime-source.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const sqlPath='db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql'
const sqlSha='74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063'
const auditCore='services/pg-api/src/agent-generated-audit-core.ts'
const coreSha='0907c803fb132c56bbe6c71bf5cf865404e35743e0fd6d5f4a36fb164803cf87'
const fullAudit='services/pg-api/src/agent-generated-audit.ts'
const fullSha='f6797d9e1302c6278feaaa20617f8b834e0c279dcad45993198dada268c9f3b4'
const parserSha='3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'
export const generatedOperatorPins=Object.freeze({
  agent_generated_receipt:'de102ea81efb146895200ac1f301d0b7b2912e452f032d87d66fe7b8b682adfa',
  agent_generated_accept:'43dc3667bd9c44e72c3a682425e96632b26a859a609be8ec89852270ccd276d9',
})
const captured=new WeakSet()
export const generatedOperatorSha=value=>createHash('sha256').update(value).digest('hex')
function refuse(){throw Error('generated_operator_source_refused')}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
function sourceFile(relative){
  if(!/^(?:services\/pg-api\/src\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js)|shared\/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js))$/.test(relative)||relative.split('/').includes('..'))refuse()
  return relative
}
function read(relative){
  let current=root
  if(lstatSync(current).isSymbolicLink())refuse()
  for(const part of relative.split('/')){current=path.join(current,part);if(lstatSync(current).isSymbolicLink())refuse()}
  const stat=lstatSync(current)
  if(!stat.isFile()||stat.size>4*1024*1024||realpathSync(current)!==current)refuse()
  return readFileSync(current)
}
function utf8(raw){const value=raw.toString('utf8');if(!Buffer.from(value,'utf8').equals(raw)||value.startsWith('\uFEFF')||value.includes('\0'))refuse();return value}
// The raw059 digest fixes the exact reviewed grammar. Strip only its two
// known outer marker lines, preserving every other byte, including prosrc LF.
export function generatedOperatorSqlBody(raw){
  if(typeof raw!=='string'||raw.includes('\r')||generatedOperatorSha(raw)!==sqlSha)refuse()
  const begins=[...raw.matchAll(/^BEGIN;\n/gm)],commits=[...raw.matchAll(/^COMMIT;(?:\n|$)/gm)]
  if(begins.length!==1||commits.length!==1||begins[0].index>=commits[0].index||commits[0].index+commits[0][0].length!==raw.length)refuse()
  const body=raw.slice(0,begins[0].index)+raw.slice(begins[0].index+begins[0][0].length,commits[0].index)
  const found={}
  for(const m of raw.matchAll(/CREATE FUNCTION agentstudio\.(agent_generated_[a-z_]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)){
    if(Object.hasOwn(found,m[1]))refuse();found[m[1]]=generatedOperatorSha(m[2])
  }
  if(JSON.stringify(found)!==JSON.stringify(generatedOperatorPins))refuse()
  return body
}
export async function captureGeneratedOperatorSources(){
  // A genuine parser is required. Never fall back to regex import discovery.
  const parserFile=fileURLToPath(import.meta.resolve('typescript'))
  if(!lstatSync(parserFile).isFile()||lstatSync(parserFile).size>16*1024*1024||generatedOperatorSha(readFileSync(parserFile))!==parserSha)refuse()
  const ts=await import('typescript')
  if(ts.version!=='5.9.3')refuse()
  const entries=new Map(),edges=[],externals=new Set(),pending=[fullAudit,
    'services/pg-api/src/agent-generated-operator-source.mjs','services/pg-api/src/agent-generated-operator-source.d.mts',
    'services/pg-api/src/agent-generated-operator-core.ts','services/pg-api/src/agent-generated-operator-cli.mjs']
  while(pending.length){
    const relative=sourceFile(pending.pop());if(entries.has(relative))continue
    const raw=read(relative),text=utf8(raw),tree=ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true,relative.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS)
    if(tree.parseDiagnostics.length)refuse()
    entries.set(relative,{path:relative,sha256:generatedOperatorSha(raw)})
    const add=value=>{
      if(!ts.isStringLiteralLike(value))refuse()
      const spec=value.text
      if(spec.startsWith('.')){
        const next=sourceFile(path.posix.normalize(path.posix.join(path.posix.dirname(relative),spec)))
        edges.push({from:relative,to:next});pending.push(next)
      }else if(spec.startsWith('node:')||['pg','typescript'].includes(spec))externals.add(spec)
      else refuse()
    }
    const visit=node=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)add(node.moduleSpecifier)
      if(ts.isImportTypeNode(node)){if(!ts.isLiteralTypeNode(node.argument))refuse();add(node.argument.literal)}
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
        if(node.arguments.length!==1)refuse();add(node.arguments[0])
      }
      if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'){
        if(node.arguments?.length!==2||node.arguments[1].getText(tree)!=='import.meta.url')refuse();add(node.arguments[0])
      }
      ts.forEachChild(node,visit)
    }
    visit(tree)
    if(relative===auditCore){
      const pins={}
      const scan=node=>{
        if(ts.isPropertyAssignment(node)&&Object.hasOwn(generatedOperatorPins,node.name.getText(tree))&&ts.isObjectLiteralExpression(node.initializer)){
          const sha=node.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='sha')
          if(!sha||!ts.isStringLiteral(sha.initializer))refuse();pins[node.name.getText(tree)]=sha.initializer.text
        }
        ts.forEachChild(node,scan)
      }
      scan(tree)
      if(JSON.stringify(pins)!==JSON.stringify(generatedOperatorPins)||generatedOperatorSha(raw)!==coreSha)refuse()
    }
  }
  if(entries.get(fullAudit)?.sha256!==fullSha||!entries.has(auditCore))refuse()
  const raw=read(sqlPath),sql=utf8(raw),body=generatedOperatorSqlBody(sql)
  const fresh=captureFreshRuntimeSources()
  if(fresh.sources.length!==34)refuse()
  for(const source of fresh.sources){
    if(!/^(?:db\/postgres\/(?:001_stage_schema|010_pg18_native_auth_proposed)\.sql|db\/postgres\/migrations\/pg_v9_0(?:19|[2-4][0-9]|50)_[a-z_]+\.sql)$/.test(source.path)||generatedOperatorSha(read(source.path))!==source.sha256)refuse()
  }
  const manifest={format:'agent_generated_operator_sources_v1',latest_migration:'pg_v9_059',default_fresh_latest:'pg_v9_050',
    default_fresh_source_sha256:fresh.source_sha256,fresh_sources:fresh.sources,
    parser:{name:'typescript',version:ts.version,sha256:parserSha},sql:{path:sqlPath,sha256:generatedOperatorSha(raw),body_sha256:generatedOperatorSha(body)},
    prosrc:generatedOperatorPins,sources:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),
    imports:edges.sort((a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en')),externals:[...externals].sort()}
  const snapshot=freeze({manifest,source_sha256:generatedOperatorSha(JSON.stringify(manifest)),sql,body})
  captured.add(snapshot);return snapshot
}
export function assertGeneratedOperatorSnapshot(snapshot,expected){
  if(!captured.has(snapshot)||!/^[a-f0-9]{64}$/.test(expected)||snapshot.source_sha256!==expected||
    generatedOperatorSha(JSON.stringify(snapshot.manifest))!==expected||generatedOperatorSqlBody(snapshot.sql)!==snapshot.body)refuse()
}
export function assertGeneratedOperatorDeployment(snapshot){
  assertGeneratedOperatorSnapshot(snapshot,snapshot.source_sha256)
  if(process.platform!=='linux'||process.getuid?.()!==0)refuse()
  for(const relative of [...snapshot.manifest.sources.map(s=>s.path),...snapshot.manifest.fresh_sources.map(s=>s.path),sqlPath]){
    let current=path.join(root,relative)
    for(;;){const st=lstatSync(current);if(st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0)refuse();const parent=path.dirname(current);if(parent===current)break;current=parent}
    const actual=generatedOperatorSha(read(relative)),expected=relative===sqlPath?sqlSha:[...snapshot.manifest.sources,...snapshot.manifest.fresh_sources].find(s=>s.path===relative)?.sha256
    if(actual!==expected)refuse()
  }
  let parserFile=fileURLToPath(import.meta.resolve('typescript'))
  if(generatedOperatorSha(readFileSync(parserFile))!==parserSha)refuse()
  for(;;){const st=lstatSync(parserFile);if(st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0)refuse();const parent=path.dirname(parserFile);if(parent===parserFile)break;parserFile=parent}
}
export function generatedOperatorPlan(snapshot){
  assertGeneratedOperatorSnapshot(snapshot,snapshot.source_sha256)
  return {mode:'plan',...snapshot.manifest,source_sha256:snapshot.source_sha256,database:'agent_studio',host:'127.0.0.1',port:5333,
    postgres_major:18,read_only:true,network_used:false,secret_read:false,initializes_database:false,services_started:false,
    runtime_login_verification:'independent real runtime pools required after install',production_cutover_allowed:false}
}
