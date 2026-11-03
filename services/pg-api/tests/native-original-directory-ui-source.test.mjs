import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {originalDirectoryUiSourceReadyAst as check} from './helpers/native-original-directory-ui-source.mjs'
import {originalDirectoryUiSourceReady as policy} from './helpers/native-original-directory-ui-source.mjs'
const base=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,base),'utf8'),paths={index:'index.html',page:'src/pages/ToolHub/ToolHubPage.tsx',hook:'src/pages/ToolHub/useToolHub.ts',pgHook:'src/pages/ToolHub/usePgOriginalToolHub.ts',entry:'src/pages/ToolHub/index.tsx'},valid=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(p)])),call=(v,flag='true')=>check(v.index,v.page,v.hook,v.pgHook,v.entry,flag),dispatch="export const useToolHub=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?usePgOriginalToolHub:usePocketBaseToolHub"
function changed(key,before,after){assert.equal(valid[key].split(before).length,2,key+' unique mutation');return{...valid,[key]:valid[key].replace(before,()=>after)}}
function body(file,name){const t=ts.createSourceFile(file,valid[file],ts.ScriptTarget.Latest,true,file==='page'?ts.ScriptKind.TSX:ts.ScriptKind.TS),f=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(f?.body);return f.body.getText(t)}
test('actual A-v2 main route dispatch PG entry and device page pass while the unchanged legacy PB function remains',()=>{assert(valid.hook.includes('const base = getPocketBaseUrl()'));assert.equal(call(valid),true);assert.equal(policy(valid.index,valid.page,valid.hook,valid.pgHook,valid.entry,'true'),true)})
test('main import aliases are checked by their real module/export binding',()=>{const v={...valid,hook:valid.hook.replace('import {usePgOriginalToolHub}', 'import {usePgOriginalToolHub as actualPg}').replace('?usePgOriginalToolHub:','?actualPg:')};assert.equal(call(v),true)})
test('actual route import aliases still resolve to approved exported hook and page',()=>{const v={...valid,entry:valid.entry.replace('{ useToolHub }','{ useToolHub as actualHook }').replace('= useToolHub()','= actualHook()').replace('{ ToolHubPage }','{ ToolHubPage as ActualPage }').replace('<ToolHubPage','<ActualPage')};assert.equal(call(v),true)})
test('benign comments and literal strings mentioning PB are not interpreted as PB calls',()=>{const v={...valid,hook:'const pbDocumentation="getPocketBaseUrl()";\n'+valid.hook,pgHook:'// getPocketBaseUrl() is documentation only\nconst pbDocumentation="getPocketBaseUrl()";\n'+valid.pgHook,page:'const pbDocumentation="getPocketBaseUrl()";\n'+valid.page};assert.equal(call(v),true)})
test('PG entry and page AST ignore comments/trivia without ignoring semantic literals',()=>{const v={...valid,pgHook:valid.pgHook.replace(' const [params,',' /* harmless PB text getPocketBaseUrl() */\n const [params,'),page:valid.page.replace('export function ToolHubPage','/* harmless formatting */\nexport function ToolHubPage')};assert.equal(call(v),true)})
for(const flag of[undefined,false,true,'false','TRUE','',null,{},'true '])test('build must actually carry the exact PG true flag: '+String(flag),()=>assert.equal(check(valid.index,valid.page,valid.hook,valid.pgHook,valid.entry,flag),false))
const cases=[
 ['reversed PG and PB branches',()=>changed('hook','?usePgOriginalToolHub:usePocketBaseToolHub','?usePocketBaseToolHub:usePgOriginalToolHub')],
 ['PG true branch directly legacy hook',()=>changed('hook','?usePgOriginalToolHub:usePocketBaseToolHub','?usePocketBaseToolHub:usePocketBaseToolHub')],
 ['PG import is a shim module',()=>changed('hook',"from './usePgOriginalToolHub.ts'","from './usePgOriginalToolHubShim.ts'")],
 ['PG import is type only',()=>changed('hook','import {usePgOriginalToolHub}','import {type usePgOriginalToolHub}')],
 ['PG branch invokes the hook at module evaluation',()=>changed('hook','?usePgOriginalToolHub:', '?usePgOriginalToolHub():')],
 ['PG hook replaces static env dispatch',()=>changed('hook',dispatch,'export const useToolHub=usePgOriginalToolHub')],
 ['legacy hook replaces static env dispatch',()=>changed('hook',dispatch,'export const useToolHub=usePocketBaseToolHub')],
 ['wrong PG environment key',()=>changed('hook','VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED','VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED')],
 ['loose equality cannot select the entry',()=>changed('hook',"UI_ENABLED==='true'","UI_ENABLED=='true'")],
 ['inequality reverses the meaning of the PG flag',()=>changed('hook',"UI_ENABLED==='true'","UI_ENABLED!=='true'")],
 ['false flag cannot select PG',()=>changed('hook',"UI_ENABLED==='true'","UI_ENABLED==='false'")],
 ['mutable exported hook binding',()=>changed('hook','export const useToolHub=','export let useToolHub=')],
 ['hook binding no longer exported',()=>changed('hook','export const useToolHub=','const useToolHub=')],
 ['local PG shim duplicates the imported name',()=>({...valid,hook:valid.hook+'\nfunction usePgOriginalToolHub(){return {}}'})],
 ['nested local shim shadows selected import',()=>changed('hook','export function usePocketBaseToolHub() {','export function usePocketBaseToolHub() {\n const usePgOriginalToolHub=()=>({})')],
 ['selected export is later assigned to PB',()=>({...valid,hook:valid.hook+'\nuseToolHub=usePocketBaseToolHub'})],
 ['main hook has a top-level PB call',()=>({...valid,hook:valid.hook+'\nconst unsafeBase=getPocketBaseUrl()'})],
 ['main hook has an aliased top-level PB call',()=>({...valid,hook:valid.hook+'\nconst getBase=getPocketBaseUrl;const unsafeBase=getBase()'})],
 ['main hook has a top-level PB IIFE',()=>({...valid,hook:valid.hook+'\n(()=>getPocketBaseUrl())()'})],
 ['main hook has a top-level tagged PB call',()=>({...valid,hook:valid.hook+'\ngetPocketBaseUrl``'})],
 ['main hook has a top-level accessor side effect',()=>({...valid,hook:valid.hook+'\nconst unsafe={get value(){return getPocketBaseUrl()}};const baseNow=unsafe.value'})],
 ['main hook has a side-effect shim import',()=>({...valid,hook:"import './pb-shim.ts'\n"+valid.hook})],
 ['main hook adds an unused runtime shim import',()=>({...valid,hook:"import {unused} from './pb-shim.ts'\n"+valid.hook})],
 ['legacy declaration adds a top-level PB decorator',()=>changed('hook','export function usePocketBaseToolHub()','@getPocketBaseUrl()\nexport function usePocketBaseToolHub()')],
 ['PG module has a top-level PB call',()=>({...valid,pgHook:valid.pgHook+'\nconst unsafe=getPocketBaseUrl()'})],
 ['PG module entry body is an empty shim',()=>changed('pgHook',body('pgHook','usePgOriginalToolHub'),'{return {} as State}')],
 ['PG module entry delegates to legacy hook',()=>changed('pgHook',body('pgHook','usePgOriginalToolHub'),'{return usePocketBaseToolHub()}')],
 ['PG module entry is a re-exported shim',()=>changed('pgHook','export function usePgOriginalToolHub():State', 'function unusedPg():State')],
 ['PG module changes Native identity import to a shim',()=>changed('pgHook',"'../../lib/studioAuth.ts'","'../../lib/studioAuthShim.ts'")],
 ['PG module removes the actual session verification call',()=>changed('pgHook','await verifyStudioSession()','await Promise.resolve(\'authenticated\')')],
 ['PG module type-only legacy hook becomes a runtime dependency',()=>changed('pgHook','type usePocketBaseToolHub','usePocketBaseToolHub')],
 ['PG module adds runtime PB import',()=>({...valid,pgHook:"import {getPocketBaseUrl} from '../../lib/pb.ts'\n"+valid.pgHook})],
 ['PG module parameters can replace the selected binding',()=>changed('pgHook','usePgOriginalToolHub():State','usePgOriginalToolHub(useState):State')],
 ['PG hook becomes an async shim',()=>changed('pgHook','export function usePgOriginalToolHub','export async function usePgOriginalToolHub')],
 ['page panel import is replaced by a shim',()=>changed('page','@/components/tool-hub/LocalDevicesPanel','@/components/tool-hub/LocalDevicesShim')],
 ['page body replaced with shim',()=>changed('page',body('page','ToolHubPage'),'{return null}')],
 ['page panel occurrence only in a comment',()=>changed('page','<LocalDevicesPanel/>','<div/>/* <LocalDevicesPanel/> */')],
 ['page has a top-level PB call',()=>({...valid,page:valid.page+'\ngetPocketBaseUrl()'})],
 ['page adds an unused runtime shim import',()=>({...valid,page:"import {unused} from './pb-shim.ts'\n"+valid.page})],
 ['page adds a PB default parameter',()=>changed('page','p:ReturnType<typeof useToolHub>','p:ReturnType<typeof useToolHub>=getPocketBaseUrl()')],
 ['route imports a shim hook',()=>changed('entry','"./useToolHub"','"./useToolHubShim"')],
 ['route imports a shim page',()=>changed('entry','"./ToolHubPage"','"./ToolHubPageShim"')],
 ['route calls the legacy hook',()=>changed('entry','const vm = useToolHub()','const vm = usePocketBaseToolHub()')],
 ['route parameter shadows the actual imported hook',()=>changed('entry','function ToolHubRoute()','function ToolHubRoute(useToolHub)')],
 ['route parameter shadows the actual page',()=>changed('entry','function ToolHubRoute()','function ToolHubRoute(ToolHubPage)')],
 ['route passes a replacement view model',()=>changed('entry','{...vm}','{...shim}')],
 ['route has a top-level PB call',()=>({...valid,entry:valid.entry+'\ngetPocketBaseUrl()'})],
 ['route adds an unused runtime shim import',()=>({...valid,entry:"import {unused} from './pb-shim.ts'\n"+valid.entry})],
 ['route adds an evaluated default parameter',()=>changed('entry','function ToolHubRoute()','function ToolHubRoute(unused=getPocketBaseUrl())')],
 ['HTML mounts the independent workbench',()=>changed('index','/src/main.tsx','/src/pg18-main.tsx')],
 ['HTML adds an extra module shim',()=>({...valid,index:valid.index+'\n<script type="module" src="/src/shim.ts"></script>'})],
 ['HTML adds an inline PB script',()=>({...valid,index:valid.index+'\n<script>getPocketBaseUrl()</script>'})],
 ['malformed source',()=>({...valid,hook:'export const = ;'})],
]
for(const[label,make]of cases)test('AST/binding source predicate refuses '+label,()=>assert.equal(call(make()),false))
test('missing PG hook, route, index, page or main hook fails closed',()=>{for(const key of Object.keys(paths))for(const value of[null,undefined,{},''])assert.equal(call({...valid,[key]:value}),false)})
test('preflight and fixture use the same PG sources/entry/build flag before actual fixture creation',()=>{for(const[file,token]of[['services/pg-api/tests/helpers/native-original-directory-source-preflight.mjs','originalDirectoryUiSourceReady(index,page,hook,pgHook,entry,env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED)'],['services/pg-api/tests/helpers/native-original-directory-fixture.mjs','originalDirectoryUiSourceReady(original,pageSource,hookSource,pgHookSource,entrySource,env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED)']]){const text=read(file);assert(text.includes(token));assert(text.includes("'src/pages/ToolHub/usePgOriginalToolHub.ts'"));assert(text.includes("'src/pages/ToolHub/index.tsx'"))}const fixture=read('services/pg-api/tests/helpers/native-original-directory-fixture.mjs');assert(fixture.indexOf('originalDirectoryUiSourceReady(original,')<fixture.indexOf('await nativeLocalDeviceGenuineFixture(env'));const workflow=read('.github/workflows/pg18-original-computer-directory-ci.yml');assert.equal([...workflow.matchAll(/VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED: 'true'/g)].length,2)})
test('Native child DATA policy retains its two original imports and never imports the AST library or source predicate',()=>{const file='services/pg-api/tests/helpers/native-original-directory-policy.mjs',text=read(file),t=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(t.parseDiagnostics.length,0);assert.deepEqual(t.statements.filter(ts.isImportDeclaration).map(n=>n.moduleSpecifier.text),['./native-local-device-genuine-guard.mjs','../../../../shared/native-local-device-contract.mjs']);assert(!t.statements.some(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='originalDirectoryUiSourceReady'));assert(read('services/pg-api/tests/helpers/native-original-directory-executor.mjs').includes("import {requireOriginalDirectoryCi} from './native-original-directory-policy.mjs'"))})

// Dedicated directory first-run trigger; no GitHub-owned environment override.
const directoryTriggerRef='refs/heads/codex/pg18-worker-heartbeat-20261028',directoryWorkflow=read('.github/workflows/pg18-original-computer-directory-ci.yml')
function inspectDirectoryTrigger(raw){assert(raw.startsWith('name: Agent Studio original Computer directory isolated browser verification\n'));assert(raw.includes('  pg18-original-directory-browser:'));assert.deepEqual([...raw.matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]),['codex/pg18-worker-heartbeat-20261028']);assert(raw.includes('  push:\n    branches:\n'));assert(raw.includes('default: false'));assert(raw.includes('cancel-in-progress: false'));assert.equal([...raw.matchAll(/^    services:$/gm)].length,1);assert.equal([...raw.matchAll(/^      postgres:$/gm)].length,1);assert(!raw.includes('matrix:'));for(const token of['AGENT_STUDIO_F20_F21_GENUINE_SUITE: original-directory','AGENT_STUDIO_ORIGINAL_DIRECTORY_APPROVED: YES_DISPOSABLE_ORIGINAL_DIRECTORY_ONLY','native-original-directory-source-preflight.mjs --check','--config tests/pg-native-browser/original-computer-directory.config.mjs',"VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED: 'true'"])assert(raw.includes(token));assert(!/^\s*GITHUB_[A-Z_]+:/m.test(raw));const rows=[...raw.matchAll(/^    if: (.+)$/gm)];assert.equal(rows.length,1);return rows[0][1]}
function evaluateDirectoryTrigger(raw,event,selected,ref){const text=inspectDirectoryTrigger(raw),t=ts.createSourceFile('directory-if.mjs','const selected=('+text+');',ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(t.parseDiagnostics.length,0);const context={github:{event_name:event,ref},inputs:{run_directory_browser:selected}};function value(n){if(ts.isParenthesizedExpression(n))return value(n.expression);if(ts.isStringLiteral(n))return n.text;if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(ts.isIdentifier(n)){assert(Object.hasOwn(context,n.text));return context[n.text]}if(ts.isPropertyAccessExpression(n))return value(n.expression)[n.name.text];assert(ts.isBinaryExpression(n));if(n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)return Boolean(value(n.left))&&Boolean(value(n.right));if(n.operatorToken.kind===ts.SyntaxKind.BarBarToken)return Boolean(value(n.left))||Boolean(value(n.right));assert.equal(n.operatorToken.kind,ts.SyntaxKind.EqualsEqualsToken);return value(n.left)===value(n.right)}return Boolean(value(t.statements[0].declarationList.declarations[0].initializer))}
test('directory workflow keeps its single fresh service purpose and original story while enabling the exact first-run branch',()=>{assert(inspectDirectoryTrigger(directoryWorkflow));assert.equal([...directoryWorkflow.matchAll(/VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED: 'true'/g)].length,2)})
for(const[event,selected,ref,expected]of[['push',undefined,directoryTriggerRef,true],['push',true,'refs/heads/main',false],['push',false,'refs/heads/codex/other',false],['workflow_dispatch',true,directoryTriggerRef,true],['workflow_dispatch',false,directoryTriggerRef,false],['workflow_dispatch',undefined,directoryTriggerRef,false],['pull_request',true,directoryTriggerRef,false],['schedule',true,directoryTriggerRef,false]])test('directory actual trigger '+event+'/'+String(selected)+'/'+ref,()=>assert.equal(evaluateDirectoryTrigger(directoryWorkflow,event,selected,ref),expected))
for(const[label,before,after]of[['widened branch',"- 'codex/pg18-worker-heartbeat-20261028'","- 'codex/*'"],['cancel running evidence','cancel-in-progress: false','cancel-in-progress: true'],['different actual job','  pg18-original-directory-browser:','  other-directory:'],['wrong purpose','YES_DISPOSABLE_ORIGINAL_DIRECTORY_ONLY','YES'],['GitHub override','permissions:\n','GITHUB_WORKFLOW: old\npermissions:\n']])test('directory trigger source refuses '+label,()=>{assert.equal(directoryWorkflow.split(before).length,2);assert.throws(()=>inspectDirectoryTrigger(directoryWorkflow.replace(before,()=>after)))})
