import test from 'node:test'
import assert from 'node:assert/strict'
import {originalStaffPageTerminal} from './helpers/original-staff-page-terminal.mjs'
import {originalStaffFingerprint} from '../services/pg-api/src/original-staff-operations.mjs'
import {parseOriginalStaffMutation,originalStaffProtocol} from '../shared/original-staff-contract.mjs'
import {parseLocalTransportJson} from '../shared/native-local-device-contract.mjs'
import {passwordInputError} from '../src/lib/accountUx.ts'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',target='33333333-3333-4333-8333-333333333333',stamp='2026-11-03T00:00:00.123456Z',password='Synthetic Staff Password 123!',self={id:owner,display_name:'PRIVATE_OWNER_A',email:'alice@example.com',role:'admin',active:true,share_enabled:true,revision:1,governance_revision:1,created:stamp,updated:stamp},json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}}),key='agentstudio:original-staff:pending:v1:'+owner
function backend(options={}){
 let receipt=null
 return async(route,init,h)=>{
  const path=new URL(route,'https://terminal.invalid').pathname.replace('/__pg_native','')
  if(path==='/api/native-auth/original-staff/me')return json({user:self})
  if(path==='/api/native-auth/original-staff/meta')return json({protocol:originalStaffProtocol,available:true,writes:true,create:true})
  if(path==='/api/native-auth/original-staff/users'&&init.method==='GET')return json({items:[self],page:1,perPage:20,totalItems:1,totalPages:1,summary:{total:1,active:1,admins:1,sharing:1}})
  if(path.startsWith('/api/native-auth/original-staff/requests/'))return receipt?json(receipt):json({error:'employee_receipt_not_found'},404)
  if(path==='/api/native-auth/original-staff/users'&&init.method==='POST'){
   const choice=parseOriginalStaffMutation('create',null,parseLocalTransportJson(init.body,8192));receipt={request_id:choice.request_id,action:'create',target_id:target,request_sha256:originalStaffFingerprint(choice),committed:true,user:{...self,...choice,id:target,active:true,revision:1,governance_revision:1},revoked_sessions:false};for(const k of ['request_id','confirm','action','target_id','password'])delete receipt.user[k]
   return options.create?options.create(receipt,h):json(receipt,201)
  }
  if(path==='/api/native-auth/capabilities')return json({mode:'native_pg18',config_writes_enabled:true,employee_governance_available:true,employee_governance_enabled:true,original_account_password_protocol:'native_account_password_owner_bound_v1',original_account_password_available:true,original_account_password_enabled:true})
  if(path==='/api/native-auth/change-password')return options.password?options.password(h):json({ok:true,reauthenticate:true})
  throw Error('unreviewed terminal request '+init.method+' '+route)
 }
}
async function fillCreate(h){await h.click('添加员工');await h.change('input',p=>p.placeholder==='填写真实姓名','Synthetic new employee');await h.change('input',p=>p.type==='email'&&p.placeholder==='name@company.com','new@example.com');await h.change('PasswordField',p=>p.label==='初始密码',password);await h.change('PasswordField',p=>p.label==='确认初始密码',password)}
function submit(h){const form=h.find('form',p=>Array.isArray(p.children)&&p.children.some(n=>n?.type==='fieldset'));return form.props.onSubmit({preventDefault(){}})}
test('accepted actual staff page creates through the real owner-bound SDK and preserves employee UI',async()=>{
 const h=await originalStaffPageTerminal({owner,transport:backend()});try{assert(h.text(h.tree).includes('员工与权限'));assert(h.text(h.tree).includes('PRIVATE_OWNER_A'));await fillCreate(h);await submit(h);await h.flush();assert(h.text(h.tree).includes('已创建「Synthetic new employee」'));assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);assert.equal(h.storage.has(key),false);assert.equal(h.pbSaves,0);assert.equal(h.pbClears,0);assert(h.calls.every(c=>c.route.startsWith('/__pg_native/')));assert(h.calls.every(c=>c.init.headers['X-AgentStudio-Expected-Owner']===owner));assert(!h.text(h.tree).includes(password))}finally{h.dispose()}
})
test('actual page closes credential editor after lost ACK and recovers by exact GET without replay',async()=>{
 const h=await originalStaffPageTerminal({owner,transport:backend({create:()=>{throw Error('Synthetic committed reply loss')}})});try{await fillCreate(h);await submit(h);await h.flush();const saved=JSON.parse(h.storage.get(key));assert.equal(Object.keys(saved).length,11);assert(!JSON.stringify(saved).includes(password));assert.equal(h.nodes(n=>n.type==='Dialog'&&n.props.open).length,0);assert.equal(h.find('button',p=>h.text(p.children)==='添加员工').props.disabled,true);const posts=h.calls.filter(c=>c.init.method==='POST').length;await h.click('核对原请求结果');assert.equal(h.calls.filter(c=>c.init.method==='POST').length,posts);assert.equal(h.storage.has(key),false);assert(h.text(h.tree).includes('操作已保存'))}finally{h.dispose()}
})
test('late A mutation after verified identity replacement cannot clear B state or redirect B',async()=>{
 let ready;const pending=new Promise(resolve=>{ready=resolve}),h=await originalStaffPageTerminal({owner,transport:backend({create:()=>pending})});try{await fillCreate(h);const write=submit(h);await h.flush();assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);h.invalidate(other);await h.flush();ready(json({unexpected:true},201));await write;await h.flush();assert(!h.text(h.tree).includes('PRIVATE_OWNER_A'));assert(!h.text(h.tree).includes('Synthetic new employee'));assert.equal(h.pbSaves,0);assert.equal(h.pbClears,0);assert.deepEqual(h.assignments,[]);assert.equal(h.nodes(n=>n.type==='Dialog'&&n.props.open).length,0)}finally{h.dispose()}
})
test('corrupt pending storage fails closed and repeated refresh never falls back to PocketBase',async()=>{
 const h=await originalStaffPageTerminal({owner,storage:{[key]:'{"format":"invalid"}'},transport:backend()});try{assert.equal(h.calls.length,0);await h.click('刷新');assert.equal(h.calls.length,0);assert(!h.text(h.tree).includes('PRIVATE_OWNER_A'))}finally{h.dispose()}
})
test('actual personal account changes password without touching PB credentials or sending logout',async()=>{
 const h=await originalStaffPageTerminal({owner,accountOnly:true,transport:backend()});try{await h.click('修改登录密码');await h.change('PasswordField',p=>p.label==='当前密码','Synthetic old password!');await h.change('PasswordField',p=>p.label==='新密码',password);await h.change('PasswordField',p=>p.label==='确认新密码',password);const form=h.find('form',p=>!Array.isArray(p.children)||!p.children.some(n=>n?.type==='fieldset'));await form.props.onSubmit({preventDefault(){}});await h.flush();assert.deepEqual(h.assignments,['/login?reason=password-changed']);assert.equal(h.pbClears,0);assert.equal(h.pbSaves,0);assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);assert(h.calls.every(c=>!c.route.endsWith('/logout')))}finally{h.dispose()}
})
test('Native password UX follows byte policy while the accepted PocketBase policy remains unchanged',()=>{
 assert.equal(passwordInputError('short'),'');assert(passwordInputError('short','native_pg'));assert.equal(passwordInputError('测'.repeat(4),'native_pg'),'');assert(passwordInputError('a'.repeat(257),'native_pg'));assert(passwordInputError('a'.repeat(12)+'\ud800','native_pg'));assert.equal(passwordInputError('😀'.repeat(4)+'a','native_pg'),'')
})
test('late personal password ACK after A is replaced cannot navigate or clear B credentials',async()=>{
 let resolve;const wait=new Promise(done=>{resolve=done}),h=await originalStaffPageTerminal({owner,accountOnly:true,transport:backend({password:()=>wait})});try{await h.click('修改登录密码');await h.change('PasswordField',p=>p.label==='当前密码','Synthetic old password!');await h.change('PasswordField',p=>p.label==='新密码',password);await h.change('PasswordField',p=>p.label==='确认新密码',password);const write=h.find('form').props.onSubmit({preventDefault(){}});await h.flush();assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);h.invalidate(other);resolve(json({ok:true,reauthenticate:true}));await write;await h.flush();assert.deepEqual(h.assignments,[]);assert.equal(h.pbClears,0);assert(!h.text(h.tree).includes('PRIVATE_OWNER_A'))}finally{h.dispose()}
})
test('unconfirmed own password change closes password fields and disables a new attempt in the same context',async()=>{
 const h=await originalStaffPageTerminal({owner,accountOnly:true,transport:backend({password:()=>{throw Error('Synthetic uncertain password reply')}})});try{await h.click('修改登录密码');await h.change('PasswordField',p=>p.label==='当前密码','Synthetic old password!');await h.change('PasswordField',p=>p.label==='新密码',password);await h.change('PasswordField',p=>p.label==='确认新密码',password);await h.find('form').props.onSubmit({preventDefault(){}});await h.flush();assert.equal(h.nodes(n=>n.type==='Dialog'&&n.props.open).length,0);assert.equal(h.find('button',p=>h.text(p.children)==='修改登录密码').props.disabled,true);assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);assert.deepEqual(h.assignments,[])}finally{h.dispose()}
})
test('default PocketBase selection retains its actual unchanged recovery page and sends no Native staff requests',async()=>{
 const bytes=readFileSync(new URL('../src/pages/Staff/PocketBaseStaffPage.tsx',import.meta.url));assert.equal(createHash('sha256').update(bytes.toString().replaceAll('\r\n','\n')).digest('hex'),'7afeb8611106db943eae9c5b3f67b07d1d36728636363396d15a0838c9124811');const h=await originalStaffPageTerminal({owner,native:false,transport:()=>{throw Error('Native path must remain unselected')}});try{assert.equal(h.tree.type,'PocketBaseStaffPage');assert.equal(h.calls.length,0)}finally{h.dispose()}
})
