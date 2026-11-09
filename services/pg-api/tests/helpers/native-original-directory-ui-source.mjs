// Source DATA only. Parse declarations; never import/evaluate employee modules.
// Fresh source/head/hash gates and actual Native Cookie/owner checks remain
// mandatory. This predicate proves the reviewed build dispatch, not authority.
import ts from 'typescript'
import {createHash} from 'node:crypto'
const entryBodySha='b1e4eacdf32afc977a3b18304962394b1f5ed0bacdc79feefa29cf230b107cdf'
const pageBodySha='64696f06a8235d92c3e8c9f925a5fdb79b8a0fa7d62f3808957503bfceadcafe'
const hookImportsSha='e4ce175404aec8355f2ff495708d939598f3c14447404db228e8d0562754ff92',pageImportsSha='db82c9456aba58cef14d5dd6f61226c24659643b8c791193513a89db0319b004'
const pgImports={
 'react':['useEffect','useRef','useState'],
 'react-router-dom':['useSearchParams'],
 '../../lib/toolHubView.ts':['resolveToolHubView'],
 '../../lib/invocationViewKey.ts':['invocationViewKey','isInvocationViewCurrent'],
 '../../lib/studioAuth.ts':['getStudioAccountInfo','verifyStudioSession','redirectToRhLogin'],
 '../../lib/pgNativePilotApi.ts':['createPgNativePilotApi'],
 '../../lib/originalToolConnectionsApi.ts':['createOriginalToolConnectionsApi'],
 '../../lib/originalModelConnectionsApi.ts':['createOriginalModelConnectionsApi'],
 '../../lib/originalHomeAgentApi.ts':['createOriginalHomeAgentApi'],
 '../../lib/originalToolHubActivityApi.ts':['createOriginalToolHubActivityApi'],
 '../../lib/originalToolHubTransport.ts':['createOriginalToolHubTransport'],
 '../../lib/originalToolHubSession.ts':['createOriginalToolHubSession','emptyOriginalToolHubFields'],
 '../../lib/unsavedNavigation.ts':['registerUnsavedWorkCheck'],
 '../../lib/studioSessionPrivacy.ts':['subscribeStudioSessionPrivacy'],
 './useToolHub.ts':['BUILTIN_TOOLS','SOURCE_META','INV_STATUS_META'],
}
const fail=()=>{throw Error('original_directory_source_shape')},requireValue=ok=>{if(!ok)fail()},unwrap=n=>{while(ts.isParenthesizedExpression(n))n=n.expression;return n},exported=n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword),named=n=>ts.isIdentifier(n)?[n.text]:ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n)?n.elements.flatMap(e=>ts.isOmittedExpression(e)?[]:named(e.name)):fail()
function parse(file,text,kind){const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,kind);requireValue(tree.parseDiagnostics.length===0);return tree}
function bindings(tree){
 const result=new Map(),add=(name,value)=>{requireValue(!result.has(name));result.set(name,value)}
 for(const n of tree.statements){
  if(ts.isImportDeclaration(n)){
   requireValue(ts.isStringLiteral(n.moduleSpecifier)&&n.importClause)
   const c=n.importClause;if(c.isTypeOnly)continue
   if(c.name)add(c.name.text,{kind:'import',module:n.moduleSpecifier.text,imported:'default',node:n})
   if(c.namedBindings){requireValue(ts.isNamedImports(c.namedBindings));for(const e of c.namedBindings.elements)if(!e.isTypeOnly)add(e.name.text,{kind:'import',module:n.moduleSpecifier.text,imported:e.propertyName?.text??e.name.text,node:n})}
  }else if(ts.isVariableStatement(n)){for(const d of n.declarationList.declarations)for(const name of named(d.name))add(name,{kind:'variable',node:d,statement:n})}
  else if(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n)||ts.isEnumDeclaration(n)){requireValue(n.name);add(n.name.text,{kind:ts.isFunctionDeclaration(n)?'function':'other',node:n})}
  else requireValue(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isEmptyStatement(n))
 }
 return result
}
function imported(map,local,module,name){const value=map.get(local);return value?.kind==='import'&&value.module===module&&value.imported===name}
function importDigest(map){return createHash('sha256').update(JSON.stringify([...map.values()].filter(v=>v.kind==='import').map(v=>v.module+'\0'+v.imported).sort())).digest('hex')}
function plainFunction(n,defaultExport=false){requireValue(!n.asteriskToken&&n.modifiers?.length===(defaultExport?2:1)&&n.modifiers.every(m=>m.kind===ts.SyntaxKind.ExportKeyword||defaultExport&&m.kind===ts.SyntaxKind.DefaultKeyword))}
function noTopEffects(tree){
 function walk(n){
  requireValue(!ts.isGetAccessorDeclaration(n)&&!ts.isSetAccessorDeclaration(n)&&!ts.isComputedPropertyName(n)&&!ts.isClassStaticBlockDeclaration(n)&&!n.modifiers?.some(ts.isDecorator))
  if(ts.isFunctionLike(n))return
  requireValue(!ts.isCallExpression(n)&&!ts.isNewExpression(n)&&!ts.isTaggedTemplateExpression(n)&&!ts.isAwaitExpression(n)&&!ts.isSpreadAssignment(n)&&!ts.isSpreadElement(n))
  if(ts.isBinaryExpression(n))requireValue(n.operatorToken.kind<ts.SyntaxKind.FirstAssignment||n.operatorToken.kind>ts.SyntaxKind.LastAssignment)
  if(ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))requireValue(n.operator!==ts.SyntaxKind.PlusPlusToken&&n.operator!==ts.SyntaxKind.MinusMinusToken)
  ts.forEachChild(n,c=>{walk(c)})
 }
 for(const n of tree.statements)if(!ts.isImportDeclaration(n)&&!ts.isTypeAliasDeclaration(n)&&!ts.isInterfaceDeclaration(n))walk(n)
}
function noShadowOrWrite(tree,critical){
 function checkName(n){for(const name of named(n))requireValue(!critical.has(name))}
 function walk(n,top=false){
  if(!top){if(ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isBindingElement(n))checkName(n.name);else if((ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isClassDeclaration(n))&&n.name)checkName(n.name)}
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){const left=unwrap(n.left);if(ts.isIdentifier(left))requireValue(!critical.has(left.text))}
  ts.forEachChild(n,c=>{walk(c,false)})
 }
 // Top declarations were checked for uniqueness already. Their nested value
 // declarations cannot shadow the selected import, export or PB binding.
 for(const n of tree.statements){if(ts.isImportDeclaration(n)||ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))continue;if(ts.isVariableStatement(n)){for(const d of n.declarationList.declarations)if(d.initializer)walk(d.initializer,true)}else walk(n,true)}
}
function digest(node){const hash=createHash('sha256');function visit(n){hash.update(String(n.kind)+'[');if(typeof n.text==='string')hash.update(JSON.stringify(n.text));ts.forEachChild(n,c=>{visit(c)});hash.update(']')}visit(node);return hash.digest('hex')}
function pgFlag(n){n=unwrap(n);if(!ts.isPropertyAccessExpression(n)||n.name.text!=='VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED')return false;const env=n.expression;if(!ts.isPropertyAccessExpression(env)||env.name.text!=='env')return false;const meta=env.expression;return ts.isMetaProperty(meta)&&meta.keywordToken===ts.SyntaxKind.ImportKeyword&&meta.name.text==='meta'}
function checkHook(tree,map){
 requireValue(importDigest(map)===hookImportsSha)
 const selected=map.get('useToolHub');requireValue(selected?.kind==='variable'&&exported(selected.statement)&&(selected.statement.declarationList.flags&ts.NodeFlags.Const)!==0)
 const c=unwrap(selected.node.initializer);requireValue(ts.isConditionalExpression(c));const condition=unwrap(c.condition)
 requireValue(ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&pgFlag(condition.left)&&ts.isStringLiteral(unwrap(condition.right))&&unwrap(condition.right).text==='true')
 const yes=unwrap(c.whenTrue),no=unwrap(c.whenFalse);requireValue(ts.isIdentifier(yes)&&ts.isIdentifier(no)&&imported(map,yes.text,'./usePgOriginalToolHub.ts','usePgOriginalToolHub'))
 const legacy=map.get(no.text);requireValue(no.text==='usePocketBaseToolHub'&&legacy?.kind==='function'&&exported(legacy.node)&&legacy.node.body&&legacy.node.parameters.length===0)
 plainFunction(legacy.node)
 requireValue(imported(map,'getPocketBaseUrl','@/lib/pb','getPocketBaseUrl'))
 noShadowOrWrite(tree,new Set(['useToolHub',yes.text,no.text,'getPocketBaseUrl']))
}
function checkPg(tree,map){
 const entry=map.get('usePgOriginalToolHub');requireValue(entry?.kind==='function'&&exported(entry.node)&&entry.node.body&&entry.node.parameters.length===0&&!entry.node.asteriskToken)
 plainFunction(entry.node)
 const expected=Object.entries(pgImports).flatMap(([module,names])=>names.map(name=>module+'\0'+name+'\0'+name)).sort(),actual=[...map].filter(([,v])=>v.kind==='import').map(([local,v])=>v.module+'\0'+v.imported+'\0'+local).sort()
 requireValue(actual.length===expected.length&&actual.every((v,i)=>v===expected[i]))
 noShadowOrWrite(tree,new Set([...map].filter(([,v])=>v.kind==='import').map(([name])=>name)))
 // Closed reviewed A-v2 ENTRY BODY AST, including every semantic literal and
 // call/operator. Comments/trivia are irrelevant; replacing the PG body with
 // a shim or changing its verified Native/session bindings is not accepted.
 requireValue(digest(entry.node.body)===entryBodySha)
}
function checkRoute(tree,map){
 const entry=[...map.values()].filter(v=>v.kind==='function'&&v.node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword));requireValue(entry.length===1)
 plainFunction(entry[0].node,true);requireValue(entry[0].node.parameters.length===0&&[...map.values()].filter(v=>v.kind==='import').length===2)
 const body=entry[0].node.body;requireValue(body&&body.statements.length===2&&ts.isVariableStatement(body.statements[0])&&ts.isReturnStatement(body.statements[1]))
 const vars=body.statements[0].declarationList;requireValue((vars.flags&ts.NodeFlags.Const)!==0&&vars.declarations.length===1);const d=vars.declarations[0],call=unwrap(d.initializer)
 requireValue(ts.isIdentifier(d.name)&&ts.isCallExpression(call)&&call.arguments.length===0&&ts.isIdentifier(call.expression)&&imported(map,call.expression.text,'./useToolHub','useToolHub'))
 const jsx=unwrap(body.statements[1].expression);requireValue(ts.isJsxSelfClosingElement(jsx)&&ts.isIdentifier(jsx.tagName)&&imported(map,jsx.tagName.text,'./ToolHubPage','ToolHubPage'))
 const props=jsx.attributes.properties;requireValue(props.length===1&&ts.isJsxSpreadAttribute(props[0])&&ts.isIdentifier(props[0].expression)&&props[0].expression.text===d.name.text)
 noShadowOrWrite(tree,new Set([call.expression.text,jsx.tagName.text]))
}
function checkPage(tree,map){
 requireValue(importDigest(map)===pageImportsSha)
 requireValue(imported(map,'LocalDevicesPanel','@/components/tool-hub/LocalDevicesPanel','LocalDevicesPanel'));noShadowOrWrite(tree,new Set(['LocalDevicesPanel']))
 const page=map.get('ToolHubPage');requireValue(page?.kind==='function'&&exported(page.node)&&page.node.body&&digest(page.node.body)===pageBodySha)
 plainFunction(page.node);requireValue(page.node.parameters.length===1&&ts.isIdentifier(page.node.parameters[0].name)&&page.node.parameters[0].name.text==='p'&&!page.node.parameters[0].initializer&&!page.node.parameters[0].dotDotDotToken)
 let panels=0;function walk(n){if(ts.isJsxSelfClosingElement(n)&&ts.isIdentifier(n.tagName)&&n.tagName.text==='LocalDevicesPanel'){requireValue(n.attributes.properties.length===0);panels++}ts.forEachChild(n,c=>{walk(c)})}walk(page.node.body);requireValue(panels===1)
}
export function originalDirectoryUiSourceReadyAst(index,page,hook,pgHook,entry,pgBuildFlag){
 try{
  requireValue(ts.version==='5.9.3'&&pgBuildFlag==='true'&&[index,page,hook,pgHook,entry].every(v=>typeof v==='string'&&v.length>0&&v.length<=2*1024*1024))
  const scripts=[...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/g)];requireValue(scripts.length===1&&/\btype\s*=\s*(["'])module\1/.test(scripts[0][1])&&/\bsrc\s*=\s*(["'])\/src\/main\.tsx\1/.test(scripts[0][1])&&scripts[0][2].trim()==='')
  const h=parse('useToolHub.ts',hook,ts.ScriptKind.TS),pg=parse('usePgOriginalToolHub.ts',pgHook,ts.ScriptKind.TS),route=parse('index.tsx',entry,ts.ScriptKind.TSX),p=parse('ToolHubPage.tsx',page,ts.ScriptKind.TSX)
  for(const tree of[h,pg,route,p])noTopEffects(tree)
  checkHook(h,bindings(h));checkPg(pg,bindings(pg));checkRoute(route,bindings(route));checkPage(p,bindings(p));return true
 }catch{return false}
}

export {originalDirectoryUiSourceReadyAst as originalDirectoryUiSourceReady}
