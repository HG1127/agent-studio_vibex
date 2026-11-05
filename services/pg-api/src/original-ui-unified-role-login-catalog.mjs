// Independent unified-profile component; the original Role auditor stays exact.
import {types} from 'node:util';
import {finalBusinessLogins} from './pg18-full069-final-login-contract.mjs';
const fail=()=>{throw Error('original_ui_unified_role_login_catalog_refused')};
function row(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const d=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();
 return value;
}
function rows(value){
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>10000)fail();
 const d=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(d).length!==value.length+1||Array.from({length:value.length},(_,i)=>d[i]).some(v=>!v?.enumerable||!Object.hasOwn(v,'value')))fail();
 return value;
}
export function assertUnifiedOriginalRoleLoginCatalog(rawRoles,rawMembers){
 const roles=rows(rawRoles),members=rows(rawMembers);
 if(finalBusinessLogins.length!==14||new Set(finalBusinessLogins.map(d=>d.login)).size!==14)fail();
 const names=new Set();
 for(const raw of roles){
  const r=row(raw,['name','login','super','bypass','inherit','createdb','createrole','replication','config','limit','valid_until']);
  if(typeof r.name!=='string'||!r.name.length||r.name.length>63||names.has(r.name)||!['login','super','bypass','inherit','createdb','createrole','replication'].every(k=>typeof r[k]==='boolean')||!Number.isSafeInteger(r.limit))fail();names.add(r.name);
  if(r.super&&r.name!=='postgres')fail();
  if(r.name.startsWith('agentstudio_')){
   const expected=finalBusinessLogins.find(d=>d.login===r.name);
   if(r.super||r.bypass||r.inherit||r.createdb||r.createrole||r.replication||r.config!==null||r.valid_until!==null||r.login!==!!expected||r.limit!==(expected?.connection_limit??-1))fail();
  }
 }
 for(const d of finalBusinessLogins){if(!names.has(d.login)||d.groups.some(name=>!names.has(name)))fail()}
 const expected=finalBusinessLogins.flatMap(d=>d.groups.map(group=>({role:group,member:d.login,grantor:'postgres',admin:false,inherit:false,set:true})));
 if(new Set(expected.map(r=>r.role+'\0'+r.member)).size!==expected.length||members.length!==expected.length)fail();
 const found=new Set();
 for(const raw of members){
  const r=row(raw,['role','member','grantor','admin','inherit','set']);
  if(typeof r.role!=='string'||typeof r.member!=='string'||r.grantor!=='postgres'||r.admin!==false||r.inherit!==false||r.set!==true)fail();
  const key=r.role+'\0'+r.member;
  if(found.has(key)||!expected.some(e=>e.role===r.role&&e.member===r.member))fail();found.add(key);
 }
 return Object.freeze({original_14_LOGIN_metadata_verified:true,whole_final_profile_verified:false,actual_LOGIN_connections_verified:false,authorizes_install:false,production_GO:false});
}
