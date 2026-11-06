import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {staffCompositeProfiles,staffCompositeMode,staffCompositeLogins,staffCompositeTarget,staffCompositePins,staffCompositeSql,assertStaffComposite14Logins} from '../services/pg-api/src/employee-staff084-contract.mjs'
import {assertOriginalStaff084Catalog} from '../services/pg-api/src/original-staff-audit084.mjs'
import {assertStaffQuality089AuthCatalog} from '../services/pg-api/src/staff084-quality089-auth-audit.mjs'
import {originalStaffExpression as oldExpression} from '../services/pg-api/src/original-staff-expression.mjs'
import {originalStaffExpression as combinationExpression} from '../services/pg-api/src/staff084-quality089-auth-expression.mjs'
import {staff084Catalog} from './helpers/original-staff084-catalog-frame.mjs'
import {staff084QualityCatalog} from './helpers/staff084-composite-catalog-frame.mjs'
const logins=()=>staffCompositeLogins.map(d=>({name:d.login,login:true,super:false,inherit:false,bypass:false,createdb:false,createrole:false,replication:false,config:null,limit:d.connection_limit,valid_until:null,direct_privileges:false}))
const grants=()=>staffCompositeLogins.flatMap(d=>d.groups.map(group=>({member:d.login,group,admin:false,inherit:false,set:true})))
test('preserves actual original14 LOGINs, exact groups and all four limit3 roles',()=>{assert.equal(staffCompositeLogins.length,14);assert.equal(staffCompositeLogins.filter(d=>d.connection_limit===3).length,4);assertStaffComposite14Logins(logins(),grants())})
for(const key of ['super','inherit','bypass','createdb','createrole','replication','direct_privileges'])test('LOGIN rejects '+key,()=>{const r=logins();r[0][key]=true;assert.throws(()=>assertStaffComposite14Logins(r,grants()))})
for(const [name,change]of [['limit',r=>r[7].limit=-1],['config',r=>r[0].config=[]],['validuntil',r=>r[0].valid_until='infinity'],['missing',r=>r.pop()],['duplicate',r=>r[0]=r[1]]])test('LOGIN rejects '+name,()=>{const r=logins();change(r);assert.throws(()=>assertStaffComposite14Logins(r,grants()))})
for(const [name,change]of [['inherit',g=>g[0].inherit=true],['admin',g=>g[0].admin=true],['SET',g=>g[0].set=false],['unknownmember',g=>g.push({member:'other',group:g[0].group,admin:false,inherit:false,set:true})],['extragroup',g=>g.push({...g[0],group:'pg_read_all_data'})]])test('LOGIN membership rejects '+name,()=>{const g=grants();change(g);assert.throws(()=>assertStaffComposite14Logins(logins(),g))})
test('unchanged standalone084 accepts original and rejects composed metadata',()=>{assertOriginalStaff084Catalog(staff084Catalog());assert.throws(()=>assertOriginalStaff084Catalog(staff084QualityCatalog()))})
test('new named auditor accepts whole declared composed auth catalog',()=>assertStaffQuality089AuthCatalog(staff084QualityCatalog()))
const mutate=(name,change)=>test('composed catalog rejects '+name,()=>{const v=staff084QualityCatalog();change(v);assert.throws(()=>assertStaffQuality089AuthCatalog(v))})
mutate('quality schema CREATE',v=>v.namespace.acl.push({grantor:'10',grantee:'130',privilege:'CREATE',grantable:false}))
mutate('password column SELECT',v=>v.quality_column_acl.push({...v.quality_column_acl[0],name:'password_record'}))
mutate('column grant option',v=>v.quality_column_acl[0].grantable=true)
mutate('foreign actor schema',v=>v.policies.find(p=>p.name==='quality089_accounts_read').using='user_id = attacker.actor_id()')
mutate('widened actor predicate',v=>v.policies.find(p=>p.name==='quality089_accounts_read').using='user_id = agentstudio.actor_id() OR true')
mutate('unknown policy',v=>v.policies.push({...v.policies[0],name:'unknown'}))
mutate('auth mutation permission',v=>v.effective.find(e=>e.role==='130').update=true)
mutate('LOGIN confusion',v=>v.context.login='agentstudio_stage_login')
mutate('extra auth relation',v=>v.relations.push({...v.relations[0],oid:'99999',name:'extra'}))
mutate('guard function body',v=>v.functions[0].source+=' ')
test('qualified actor retains schema; old parser stays strict',()=>{assert.throws(()=>oldExpression('user_id = agentstudio.actor_id()'));const a=combinationExpression('user_id = agentstudio.actor_id()');assert.match(a,/agentstudio/);for(const x of ['user_id = public.actor_id()','user_id = agentstudio.other()'])assert.throws(()=>combinationExpression(x))})
test('profile and physical target closed descriptors',()=>{assert.equal(staffCompositeMode(staffCompositeProfiles[0]).quality,false);assert.equal(staffCompositeMode(staffCompositeProfiles[1]).quality,true);assert.throws(()=>staffCompositeMode('complete069-employee-ui078'));assert.deepEqual(staffCompositeTarget({system_identifier:'123',database_oid:'16384'}),{system_identifier:'123',database_oid:'16384'});for(const t of [{system_identifier:'0',database_oid:'16384'},{system_identifier:'123',database_oid:'0'},{system_identifier:'123',database_oid:'16384',port:5333}])assert.throws(()=>staffCompositeTarget(t))})
test('raw SQL pins exact bytes and removes only outer transaction/client directive',()=>{for(const pin of Object.values(staffCompositePins)){const raw=readFileSync(new URL('../'+pin.path,import.meta.url),'utf8'),inside=staffCompositeSql(raw,pin);assert.ok(inside.length>100);assert.equal(/^BEGIN;$/m.test(inside),false);assert.equal(/^COMMIT;$/m.test(inside),false);assert.throws(()=>staffCompositeSql(raw+'\n',pin))}})
