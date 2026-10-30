// Separate F05 delivery closure; original complete335/live383 roots unchanged.
import fs from'node:fs'
import path from'node:path'
import{fileURLToPath}from'node:url'
import{isBuiltin}from'node:module'
import{createHash}from'node:crypto'
import{captureCompleteProfileSources,assertCompleteProfileSnapshot,assertCompleteProfileDeployment}from'./pg18-complete-profile-source.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),captured=new WeakSet(),sha=b=>createHash('sha256').update(b).digest('hex'),fail=()=>{throw Error('complete069_plan_workflow_source_refused')}
export const complete069PlanWorkflowModules=Object.freeze(['plan','sources','predecessor-plan','predecessors','catalog','journal','core','cli'].map(n=>'services/pg-api/src/pg18-complete-plan-workflow-'+n+'.mjs'))
export const complete069PlanWorkflowAssets=Object.freeze(['docs/PG18_COMPLETE_069_PLAN_WORKFLOW_PREPARATION.md','ops/templates/agentstudio-pg18-plan-workflow-predecessor-credentials.json.example',...['worker.service','broker.service','worker.conf','broker.conf','hba.conf'].map(n=>'ops/templates/agentstudio-pg18-plan-workflow-'+n+'.example')])
function sourceBytes(name,deployment=false){
 if(typeof name!=='string'||! /^(?:services\/pg-api\/src|shared|docs|ops\/templates)\/[A-Za-z0-9_./-]+$/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail()
 let at=root;for(const part of name.split('/')){const parent=fs.lstatSync(at);if(parent.isSymbolicLink()||!parent.isDirectory()||deployment&&(parent.uid!==0||parent.gid!==0||(parent.mode&0o022)!==0))fail();at=path.join(at,part)}
 const s=fs.lstatSync(at);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<1||s.size>16*1024*1024||fs.realpathSync(at)!==at||deployment&&(s.uid!==0||s.gid!==0||(s.mode&0o222)!==0))fail()
 const b=fs.readFileSync(at),t=fs.lstatSync(at);for(const k of['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid'])if(s[k]!==t[k])fail();if(b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b))fail();return b
}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v}
export async function captureComplete069PlanWorkflowSources(){
 const complete=await captureCompleteProfileSources(),ts=await import('typescript'),entries=new Map(complete.manifest.sources.map(e=>[e.path,{...e}])),pending=[...complete069PlanWorkflowModules,'services/pg-api/src/agent-plan-workflow-service.ts'],seen=new Set(),imports=[]
 while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);if(!/^(services\/pg-api\/src|shared)\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|js)$/.test(name))fail();const bytes=sourceBytes(name),tree=ts.createSourceFile(name,bytes.toString('utf8'),ts.ScriptTarget.Latest,true,name.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS);if(!Array.isArray(tree.parseDiagnostics)||tree.parseDiagnostics.length)fail();entries.set(name,{path:name,sha256:sha(bytes)})
  const add=n=>{if(!ts.isStringLiteralLike(n))fail();const spec=n.text;if(spec.startsWith('.')){const to=path.posix.normalize(path.posix.join(path.posix.dirname(name),spec));imports.push({from:name,to});pending.push(to)}else if(!(spec.startsWith('node:')&&isBuiltin(spec))&&!['pg','typescript'].includes(spec)&&!(name==='services/pg-api/src/document-parser.ts'&&['jszip','mammoth','pdfjs-dist/legacy/build/pdf.mjs'].includes(spec)))fail()}
  const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)add(n.moduleSpecifier);if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')){if(n.arguments.length!==1)fail();add(n.arguments[0])}if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument))add(n.argument.literal);ts.forEachChild(n,visit)};visit(tree)
 }
 for(const name of complete069PlanWorkflowAssets)entries.set(name,{path:name,sha256:sha(sourceBytes(name))})
 const manifest=freeze({format:'complete069_plan_workflow_source_manifest_v1',complete_source_sha256:complete.source_sha256,entries:complete069PlanWorkflowModules,original_service:'services/pg-api/src/agent-plan-workflow-service.ts',assets:complete069PlanWorkflowAssets,sources:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),imports:imports.sort((a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en'))}),snapshot=Object.freeze({manifest,complete,source_sha256:sha(JSON.stringify(manifest))});captured.add(snapshot);return snapshot
}
export function assertComplete069PlanWorkflowSources(snapshot,expected,{deployment=false}={}){
 if(!captured.has(snapshot)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||snapshot.source_sha256!==expected||sha(JSON.stringify(snapshot.manifest))!==expected)fail()
 if(deployment)assertCompleteProfileDeployment(snapshot.complete,snapshot.complete.source_sha256);else assertCompleteProfileSnapshot(snapshot.complete,snapshot.complete.source_sha256)
 for(const entry of snapshot.manifest.sources)if(sha(sourceBytes(entry.path,deployment))!==entry.sha256)fail()
 return true
}
