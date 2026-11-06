/** Closed same-process source loader. Only TS stripping/createSourceFile, no
 * createProgram, package install, SDK import, SQL driver or child process. */
export function quality089SourceLoader({files,support,external,typescript:ts,vm,stripTypeScriptTypes,path,native,globals={}}){
 const cache=new Map();const load=(target)=>{
  if(cache.has(target))return cache.get(target)
  if(external.has(target))return external.get(target)
  let raw=files.get(target)??support.get(target);if(typeof raw!=='string')throw Error('quality089_pure_module_missing '+target)
  const ast=ts.createSourceFile(target,raw,ts.ScriptTarget.Latest,true,target.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS),deps={...globals},symbols=[],ranges=[]
  const resolve=specifier=>{if(specifier.startsWith('node:')){if(!native.has(specifier))throw Error('unapproved_native_pure_import '+specifier);return native.get(specifier)}if(!specifier.startsWith('.'))throw Error('SDK_import_forbidden '+specifier);return load(path.posix.normalize(path.posix.join(path.posix.dirname(target),specifier)))}
  for(const st of ast.statements){
   if(ts.isImportDeclaration(st)){ranges.push([st.getFullStart(),st.end]);if(st.importClause?.isTypeOnly)continue;const ns=resolve(st.moduleSpecifier.text),binding=st.importClause?.namedBindings;if(binding&&ts.isNamedImports(binding))for(const e of binding.elements)if(!e.isTypeOnly)deps[e.name.text]=ns[e.propertyName?.text??e.name.text];continue}
   if(ts.isExportDeclaration(st)){ranges.push([st.getFullStart(),st.end]);if(st.moduleSpecifier){const ns=resolve(st.moduleSpecifier.text);if(st.exportClause&&ts.isNamedExports(st.exportClause))for(const e of st.exportClause.elements){deps[e.name.text]=ns[e.propertyName?.text??e.name.text];symbols.push(e.name.text)}}continue}
   if(!st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue
   for(const modifier of st.modifiers)if(modifier.kind===ts.SyntaxKind.ExportKeyword)ranges.push([modifier.getStart(ast),modifier.end])
   if((ts.isFunctionDeclaration(st)||ts.isClassDeclaration(st))&&st.name)symbols.push(st.name.text)
   if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations)if(ts.isIdentifier(d.name))symbols.push(d.name.text)
  }
  for(const [start,end]of ranges.reverse())raw=raw.slice(0,start)+'\n'+raw.slice(end)
  const code=target.endsWith('.mjs')?raw:stripTypeScriptTypes(raw,{mode:'strip'})
  const value=vm.compileFunction(code+'\nreturn {'+[...new Set(symbols)].join(',')+'}',Object.keys(deps))(...Object.values(deps));cache.set(target,value);return value
 }
 return load
}
