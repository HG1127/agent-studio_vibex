// Independent controller source closure. No CI/060 authorization is reused.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {isUtf8} from 'node:buffer'
import {isBuiltin} from 'node:module'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const parserSha='3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'
const sqlPin='5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f',lockPin='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const roots=['worker-heartbeat-activation-control.ts','worker-heartbeat-activation-control-contract.ts','worker-heartbeat-activation-control-client.ts','worker-heartbeat-activation-control-service.ts','worker-heartbeat-activation-control-source.mjs','worker-heartbeat-activation-control-source.d.mts','worker-heartbeat-activation-control-runtime.mjs','worker-heartbeat-activation-control-runtime.d.mts'].map(p=>'services/pg-api/src/'+p)
const captured=new WeakSet(),sha=b=>createHash('sha256').update(b).digest('hex')
const fail=()=>{throw Error('worker_heartbeat_activation_control_source_refused')}
function freeze(v){if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v)}return v}
function relative(p){if(typeof p!=='string'||! /^(?:services\/pg-api\/src|shared)\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|js)$/.test(p)||p.split('/').some(x=>!x||x==='.'||x==='..'))fail();return p}
function read(file,sealed=false){
 const absolute=path.join(root,file);let at=root
 for(const part of file.split('/')){const d=fs.lstatSync(at);if(!d.isDirectory()||d.isSymbolicLink()||sealed&&(d.uid!==0||d.gid!==0||(d.mode&0o7777)!==0o555))fail();at=path.join(at,part)}
 const before=fs.lstatSync(absolute)
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>4*1024*1024||fs.realpathSync(absolute)!==absolute||sealed&&(before.uid!==0||before.gid!==0||(before.mode&0o7777)!==0o444))fail()
 const fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),last=fs.lstatSync(absolute);for(const k of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid','nlink'])if(before[k]!==after[k]||before[k]!==last[k])fail();if(bytes.length!==before.size||bytes.includes(0)||!isUtf8(bytes))fail();return bytes}finally{fs.closeSync(fd)}
}
export async function captureWorkerHeartbeatActivationControlSources(){
 try{
  const parser=fileURLToPath(import.meta.resolve('typescript'));if(sha(fs.readFileSync(parser))!==parserSha)fail()
  const ts=await import('typescript');if(ts.version!=='5.9.3')fail()
  const files=new Map(),imports=[],externals=new Set(),pending=[...roots]
  while(pending.length){const file=relative(pending.pop());if(files.has(file))continue;if(files.size>=400)fail()
   const raw=read(file),tree=ts.createSourceFile(file,raw.toString('utf8'),ts.ScriptTarget.Latest,true,/\.m?js$/.test(file)?ts.ScriptKind.JS:ts.ScriptKind.TS);if(tree.parseDiagnostics.length)fail();files.set(file,{path:file,sha256:sha(raw)})
   const add=node=>{if(!ts.isStringLiteralLike(node))fail();const spec=node.text;if(spec.startsWith('.')){const target=relative(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)));imports.push({from:file,to:target});pending.push(target)}else if(spec.startsWith('node:')&&isBuiltin(spec)||['pg','typescript'].includes(spec))externals.add(spec);else fail()}
   const visit=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)add(node.moduleSpecifier);if(ts.isImportTypeNode(node)){if(!ts.isLiteralTypeNode(node.argument))fail();add(node.argument.literal)}if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){if(node.arguments.length!==1)fail();add(node.arguments[0])}if(ts.isImportEqualsDeclaration(node))fail();ts.forEachChild(node,visit)};visit(tree)
  }
  for(const file of ['services/pg-api/package.json','services/pg-api/pnpm-lock.yaml','db/postgres/telemetry/001_worker_heartbeats.sql']){const raw=read(file);files.set(file,{path:file,sha256:sha(raw)})}
  if(files.get('services/pg-api/pnpm-lock.yaml').sha256!==lockPin||files.get('db/postgres/telemetry/001_worker_heartbeats.sql').sha256!==sqlPin)fail()
  const order=(a,b)=>a<b?-1:a>b?1:0,manifest={format:'worker_heartbeat_activation_control_sources_v1',parser:{name:'typescript',version:'5.9.3',sha256:parserSha},sources:[...files.values()].sort((a,b)=>order(a.path,b.path)),imports:imports.sort((a,b)=>order(a.from+'\0'+a.to,b.from+'\0'+b.to)),externals:[...externals].sort(order)}
  const snapshot=freeze({manifest,source_sha256:sha(JSON.stringify(manifest))});captured.add(snapshot);return snapshot
 }catch{fail()}
}
export function assertWorkerHeartbeatActivationControlSources(snapshot,expected){
 if(!captured.has(snapshot)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||snapshot.source_sha256!==expected||sha(JSON.stringify(snapshot.manifest))!==expected)fail()
 for(const f of snapshot.manifest.sources)if(sha(read(f.path,true))!==f.sha256)fail()
}
