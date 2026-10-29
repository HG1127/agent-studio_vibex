// Independent source closure; never changes complete069 or frozen059/060 roots.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {isBuiltin} from 'node:module'
import {createHash} from 'node:crypto'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot,assertCompleteProfileDeployment} from './pg18-complete-profile-source.mjs'
import {liveEntries,liveFail,freeze,hex} from './pg18-full069-worker-live-contract.mjs'
export const liveRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
export const liveModules=Object.freeze(['contract','sources','trust','runtime','processes','child','native','runner','cli'].map(n=>'services/pg-api/src/pg18-full069-worker-live-'+n+'.mjs'))
const snapshots=new WeakSet(),sha=v=>createHash('sha256').update(v).digest('hex')
export async function captureFull069WorkerLiveSources(){
  const complete=await captureCompleteProfileSources(),ts=await import('typescript'),entries=new Map(complete.manifest.sources.map(x=>[x.path,{...x}])),pending=[...liveModules,'services/pg-api/src/native-server.ts',...liveEntries.map(x=>'services/pg-api/src/'+x.file)],seen=new Set(),edges=[]
  while(pending.length){const file=pending.pop()??liveFail('source_path');if(seen.has(file))continue;seen.add(file);if(!/^(services\/pg-api\/src|shared)\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|js)$/.test(file)||file.split('/').some(p=>p==='..'||p==='.'||!p))liveFail('source_path')
   const raw=fs.readFileSync(path.join(liveRoot,file)),text=raw.toString('utf8');if(!Buffer.from(text).equals(raw))liveFail('source_encoding');const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS),diagnostics=Object.getOwnPropertyDescriptor(tree,'parseDiagnostics')?.value;if(!Array.isArray(diagnostics)||diagnostics.length)liveFail('source_parse');entries.set(file,{path:file,sha256:sha(raw)})
  const add=node=>{if(!ts.isStringLiteralLike(node))liveFail('source_dynamic_import');const spec=node.text;if(spec.startsWith('.')){const to=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));edges.push({from:file,to});pending.push(to)}else if(!(spec.startsWith('node:')&&isBuiltin(spec))&&!['pg','typescript'].includes(spec)&&!(file==='services/pg-api/src/document-parser.ts'&&['jszip','pdfjs-dist/legacy/build/pdf.mjs','mammoth'].includes(spec)))liveFail('source_external')}
  const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)add(n.moduleSpecifier);if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')){if(n.arguments.length!==1)liveFail('source_dynamic_import');add(n.arguments[0])}if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument))add(n.argument.literal);ts.forEachChild(n,visit)};visit(tree)
 }
 const manifest=freeze({format:'pg18_full069_worker_live_sources_v1',complete_source_sha256:complete.source_sha256,entries:liveModules,workers:liveEntries.map(({id,file,args,kinds})=>({id,file,args,kinds})),sources:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),imports:edges.sort((a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en'))}),snapshot=Object.freeze({manifest,source_sha256:sha(JSON.stringify(manifest)),complete});snapshots.add(snapshot);return snapshot
}
export function assertFull069WorkerLiveSources(snapshot,expected,{deployment=false}={}){
 if(!snapshots.has(snapshot)||!hex(expected)||snapshot.source_sha256!==expected||sha(JSON.stringify(snapshot.manifest))!==expected)liveFail('source_binding')
 if(deployment)assertCompleteProfileDeployment(snapshot.complete,snapshot.complete.source_sha256);else assertCompleteProfileSnapshot(snapshot.complete,snapshot.complete.source_sha256)
 for(const entry of snapshot.manifest.sources){const file=path.join(liveRoot,entry.path),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||deployment&&(st.uid!==0||st.gid!==0||(st.mode&0o222)!==0)||sha(fs.readFileSync(file))!==entry.sha256)liveFail('source_changed')}
 return true
}
