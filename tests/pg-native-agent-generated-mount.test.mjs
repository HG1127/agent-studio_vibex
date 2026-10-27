import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse} from '@babel/parser'
import {retainPgNativeAgentGeneratedSelection} from '../src/lib/pgNativeAgentGeneratedAcceptanceSession.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const api={},scope={api,ownerId:'alice',specId:id(2),runId:id(10),purpose:'optimize'}
const request={request_id:id(1),spec_id:id(2),run_id:id(10),purpose:'optimize'}
const target={review_id:id(1),spec_id:id(2),target_run_id:id(10)}

test('selected immutable metadata survives unavailable058 body, hidden snapshot and closed scopes',()=>{
 const selected=retainPgNativeAgentGeneratedSelection(null,{...scope,reviewId:request.request_id,request})
 assert.deepEqual(selected.target,target)
 for(const snapshot of [{},{reviewId:null},{reviewId:request.request_id,request:null},{specId:null,runId:null},{available:false,acceptance:false,body_erased:true}])assert.equal(retainPgNativeAgentGeneratedSelection(selected,{...scope,...snapshot}),selected)
 assert.equal(Object.hasOwn(selected.target,'request_sha256'),false)
})
test('owner/API/explicit target changes clear selection and a different opinion cannot inherit its predecessor',()=>{
 const selected=retainPgNativeAgentGeneratedSelection(null,{...scope,reviewId:request.request_id,request})
 for(const changed of [{ownerId:'bob'},{ownerId:'bob',specId:null,runId:null},{api:{}},{runId:id(11)},{specId:id(3)},{purpose:'evaluate'}])assert.equal(retainPgNativeAgentGeneratedSelection(selected,{...scope,...changed}).target,null)
 assert.equal(retainPgNativeAgentGeneratedSelection(selected,{...scope,reviewId:id(77)}).target,null)
 for(const patch of [{request_id:id(77)},{purpose:'evaluate'},{spec_id:id(3)},{run_id:id(11)},{request_id:'ABCDEF00-0000-4000-8000-000000000001'}])assert.equal(retainPgNativeAgentGeneratedSelection(null,{...scope,reviewId:request.request_id,request:{...request,...patch}}).target,null)
 const next={...request,request_id:id(77)};assert.deepEqual(retainPgNativeAgentGeneratedSelection(selected,{...scope,reviewId:id(77),request:next}).target,{...target,review_id:id(77)})
})

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
const ast=file=>parse(source(file),{sourceType:'module',plugins:['typescript','jsx']})
function nodes(node,predicate,out=[]){if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);for(const [key,value]of Object.entries(node)){if(['loc','start','end','comments','tokens'].includes(key))continue;if(Array.isArray(value))for(const item of value)nodes(item,predicate,out);else if(value&&typeof value==='object')nodes(value,predicate,out)}return out}
const element=name=>node=>node.type==='JSXElement'&&node.openingElement.name.name===name
const attr=(node,name)=>node.openingElement.attributes.find(a=>a.type==='JSXAttribute'&&a.name.name===name)?.value

test('actual review return always mounts one generated sibling outside paid availability/opened/result branches',()=>{
 const tree=ast('src/pages/PgNativePilot/PgNativeAgentReviewPanel.tsx')
 const component=tree.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration
 const returned=component.body.body.findLast(n=>n.type==='ReturnStatement').argument
 assert.equal(returned.type,'JSXFragment')
 const children=returned.children.filter(element('PgNativeAgentGeneratedAcceptancePanel'))
 assert.equal(children.length,1);assert.equal(nodes(tree,element('PgNativeAgentGeneratedAcceptancePanel')).length,1)
 assert.equal(attr(children[0],'key'),undefined)
 assert.equal(attr(children[0],'active').expression.operator,'&&')
 assert.equal(attr(children[0],'active').expression.left.name,'active');assert.equal(attr(children[0],'active').expression.right.name,'opened')
 assert.equal(attr(children[0],'available').expression.name,'generatedAvailable');assert.equal(attr(children[0],'acceptanceEnabled').expression.left.left.name,'generatedEnabled')
 assert.equal(attr(children[0],'target').expression.object.name,'generatedSelection')
})
test('Page keeps employee-and-API-keyed autonomous mount and acceptance notification uses the one existing refresh callback',()=>{
 const page=ast('src/pages/PgNativePilot/PgNativePilotPage.tsx')
 const component=page.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration
 const declarations=component.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations)
 const mounts=nodes(component,element('PgNativeAutonomousAgentPanel'));assert.equal(mounts.length,1)
 const auto=mounts[0],key=attr(auto,'key').expression;assert.equal(key.type,'Identifier')
 const keyDeclarations=declarations.filter(n=>n.id.type==='Identifier'&&n.id.name===key.name);assert.equal(keyDeclarations.length,1)
 const keyValue=keyDeclarations[0].init
 assert.equal(keyValue.type,'BinaryExpression');assert.equal(keyValue.operator,'+')
 assert.equal(keyValue.left.type,'BinaryExpression');assert.equal(keyValue.left.operator,'+')
 assert.equal(keyValue.left.right.type,'StringLiteral');assert.equal(keyValue.left.right.value,':')
 const employee=keyValue.left.left
 assert.equal(employee.type,'LogicalExpression');assert.equal(employee.operator,'??')
 assert.equal(employee.left.type,'OptionalMemberExpression');assert.equal(employee.left.object.name,'profile');assert.equal(employee.left.property.name,'id')
 assert.equal(employee.right.type,'StringLiteral');assert.equal(employee.right.value,'signedout')
 const apiScope=keyValue.right;assert.equal(apiScope.type,'CallExpression');assert.equal(apiScope.callee.type,'Identifier')
 const imports=page.program.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value==='@/lib/pgNativeOwnTaskNavigation').flatMap(n=>n.specifiers)
 assert.equal(imports.filter(n=>n.type==='ImportSpecifier'&&n.imported.name==='pgNativeOriginalTaskScopeKey'&&n.local.name===apiScope.callee.name).length,1)
 assert.equal(apiScope.arguments.length,1);assert.equal(apiScope.arguments[0].type,'Identifier');assert.equal(apiScope.arguments[0].name,'api')
 assert.equal(attr(auto,'ownerId').expression.object.name,'profile');assert.equal(attr(auto,'ownerId').expression.property.name,'id')
 const refresh=attr(auto,'onRoleChanged').expression;assert.equal(refresh.type,'Identifier');assert.equal(refresh.name,'refresh')
 const refreshDeclarations=declarations.filter(n=>n.id.type==='Identifier'&&n.id.name===refresh.name);assert.equal(refreshDeclarations.length,1)
 assert.equal(refreshDeclarations[0].init.type,'CallExpression');assert.equal(refreshDeclarations[0].init.callee.name,'useCallback')
 assert.equal(attr(auto,'generatedAvailable').expression.object.name,'generatedAcceptance')
 const own=nodes(ast('src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx'),element('PgNativeAgentReviewPanel'))
 assert.equal(own.length,1);assert.equal(attr(own[0],'key'),undefined);assert.equal(attr(own[0],'onAccepted').expression.name,'onRoleChanged')
})
test('latest onAccepted callback does not rebuild generated controller and consent resets when visibility/scope changes',()=>{
 const tree=ast('src/pages/PgNativePilot/PgNativeAgentGeneratedAcceptancePanel.tsx')
 const effects=nodes(tree,n=>n.type==='CallExpression'&&n.callee.name==='useEffect')
 const controllerEffect=effects.find(n=>nodes(n.arguments[0],x=>x.type==='CallExpression'&&x.callee.name==='createPgNativeAgentGeneratedAcceptanceSession').length)
 assert.deepEqual(controllerEffect.arguments[1].elements.map(n=>n.name),['api','ownerId','onExpired'])
 const callbackEffect=effects.find(n=>nodes(n.arguments[0],x=>x.type==='AssignmentExpression'&&x.left.object?.name==='acceptedCallback').length)
 assert.deepEqual(callbackEffect.arguments[1].elements.map(n=>n.name),['onAccepted'])
 const code=source('src/pages/PgNativePilot/PgNativeAgentGeneratedAcceptancePanel.tsx')
 assert.match(code,/context=\[active,available,acceptanceEnabled,targetKey\]/)
 assert.match(code,/consent\.context!==context\)setConsent/)
  // The already-verified receipt names its original opinion even if the
  // opinion browser now displays an evaluation rather than an optimize target.
  assert.match(code,/if\(!target&&view\.receipt\)return/)
  const receipt=nodes(tree,n=>n.type==='VariableDeclarator'&&n.id.name==='receipt')[0]
  assert.equal(receipt.init.type,'MemberExpression');assert.equal(receipt.init.object.name,'view');assert.equal(receipt.init.property.name,'receipt')
 assert.doesNotMatch(code,/localStorage|sessionStorage|dangerouslySetInnerHTML/)
})
