import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {verifyModelConfigReceiptSchema075} from '../services/pg-api/src/model-config-receipt-schema075.ts'
import {catalogPackets,fields} from './helpers/model-config-receipt-catalog-data.mjs'
// Terminal pg_catalog DATA only. The actual verifier calls this fixed packet
// port; no SQL parser/engine, Pool, connection, DDL, GRANT or server is used.
function terminal(){const packets=catalogPackets(),queries=[],db={async query(sql,args=[]){queries.push({sql,args});let part;if(sql.includes('model-config-receipt075:explicit-acl'))part='acl';else if(sql.includes('model-config-receipt075:explicit-function-acl'))part='function_acl';else if(sql.includes('server_version_num'))part='state';else if(sql.includes('FROM pg_catalog.pg_attribute'))part='columns';else if(sql.includes('FROM pg_catalog.pg_policy'))part='policies';else if(sql.includes('pg_get_constraintdef'))part='constraints';else if(sql.includes('FROM pg_catalog.pg_index'))part='indexes';else if(sql.includes('p.prosrc AS source'))part='validation';else if(sql.includes('count(*)=1 AS ok'))part='surface';else throw Error('unexpected catalog DATA query');return{rows:structuredClone(packets[part])}},release(){throw Error('no_pooled_client')}};return{packets,queries,db}}
const apiTable=p=>p.acl.find(row=>row.scope==='table'&&row.grantee===String(p.state[0].api_oid)),ownerTable=p=>p.acl.find(row=>row.scope==='table'&&row.grantee===p.state[0].owner_oid),column=p=>p.acl.find(row=>row.scope==='column'),extra=(p,patch)=>p.acl.push({...apiTable(p),...patch})
async function rejects(mutate){const x=terminal();mutate(x.packets);await assert.rejects(verifyModelConfigReceiptSchema075(x.db),/unsafe_model_config_receipt_schema075/);return x}
test('actual075 verifier accepts complete21-edge terminal ACL DATA with unchanged catalog checks, no database acceptance',async()=>{const x=terminal();assert.equal(x.packets.acl.length,21);assert.equal(x.packets.acl.filter(row=>row.scope==='table').length,9);assert.equal(x.packets.acl.filter(row=>row.scope==='column').length,12);await verifyModelConfigReceiptSchema075(x.db);assert.equal(x.queries.length,9);assert(x.queries.every(({sql})=>sql.startsWith('SELECT ')||sql.startsWith('/* model-config-receipt075:explicit-acl */ SELECT ')||sql.startsWith('/* model-config-receipt075:explicit-function-acl */ SELECT ')));assert(!x.queries.some(({sql})=>/^(GRANT|REVOKE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)/.test(sql)))})
test('ACL result order carries no authority; complete multiset still accepts reversed DATA',async()=>{const x=terminal();x.packets.acl.reverse();await verifyModelConfigReceiptSchema075(x.db)})
test('owner, API and table OIDs are actual catalog identities rather than hardcoded fixture role numbers',async()=>{const x=terminal(),oldOwner=x.packets.state[0].owner_oid,oldApi=String(x.packets.state[0].api_oid);x.packets.state[0].owner_oid='4294967295';x.packets.state[0].api_oid=4294967294;x.packets.state[0].table_oid='4294967293';for(const r of x.packets.acl){r.object_oid='4294967293';r.grantor='4294967295';r.grantee=r.grantee===oldOwner?'4294967295':r.grantee===oldApi?'4294967294':r.grantee}x.packets.policies[0].roles=[4294967294];x.packets.validation[0].owner_oid='4294967295';for(const r of x.packets.function_acl){r.grantor='4294967295';r.grantee=r.grantee===oldOwner?'4294967295':'4294967294'}await verifyModelConfigReceiptSchema075(x.db)})
for(const [label,mutate]of[
 ['API MAINTAIN table grant',p=>extra(p,{privilege:'MAINTAIN'})],
 ['API table-wide INSERT in place of SELECT',p=>apiTable(p).privilege='INSERT'],
 ['PUBLIC table SELECT',p=>extra(p,{grantee:'0'})],
 ['ordinary extra-role table SELECT',p=>extra(p,{grantee:'27075'})],
 ['extra-role MAINTAIN missed by old effective list',p=>extra(p,{grantee:'27075',privilege:'MAINTAIN'})],
 ['explicit built-in-role grant despite implicit built-in privileges',p=>extra(p,{grantee:'6181'})],
 ['explicit additional superuser grant',p=>extra(p,{grantee:'28075'})],
 ['missing API SELECT',p=>p.acl.splice(p.acl.indexOf(apiTable(p)),1)],
 ['missing owner default MAINTAIN',p=>p.acl.splice(p.acl.findIndex(r=>r.grantee===p.state[0].owner_oid&&r.privilege==='MAINTAIN'),1)],
 ['duplicated owner edge replacing a different owner edge',p=>{const a=ownerTable(p);p.acl[p.acl.findIndex(r=>r.scope==='table'&&r.grantee===p.state[0].owner_oid&&r.privilege==='MAINTAIN')]={...a}}],
 ['API SELECT with grant option',p=>apiTable(p).grantable=true],
 ['owner default edge with explicit grant option',p=>ownerTable(p).grantable=true],
 ['API SELECT recorded under API grantor',p=>apiTable(p).grantor=String(p.state[0].api_oid)],
 ['owner default edge recorded under another grantor',p=>ownerTable(p).grantor='27075'],
 ['API SELECT recorded under another superuser grantor',p=>apiTable(p).grantor='28075'],
 ['column INSERT from another grantor',p=>column(p).grantor='27075'],
 ['column INSERT with grant option',p=>column(p).grantable=true],
 ['PUBLIC column INSERT',p=>{const c=column(p);p.acl.push({...c,grantee:'0'})}],
 ['extra-role column INSERT',p=>{const c=column(p);p.acl.push({...c,grantee:'27075'})}],
 ['explicit owner column grant absent from original SQL',p=>{const c=column(p);p.acl.push({...c,grantee:p.state[0].owner_oid})}],
 ['redundant API column SELECT beyond table SELECT',p=>{const c=column(p);p.acl.push({...c,privilege:'SELECT'})}],
 ['column UPDATE instead of INSERT',p=>column(p).privilege='UPDATE'],
 ['recorded_at INSERT replacing a required data-column edge',p=>{column(p).column_name='recorded_at';column(p).column_number=13}],
 ['missing required column INSERT',p=>p.acl.splice(p.acl.indexOf(column(p)),1)],
 ['same column name with a different attnum',p=>column(p).column_number=2],
 ['same attnum with a different column name',p=>column(p).column_name='request_id'],
 ['column grant for a different relation OID',p=>column(p).object_oid='18076'],
 ['table grant for a different relation OID',p=>apiTable(p).object_oid='18076'],
 ['malformed ACL scope',p=>column(p).scope='function'],
 ['string instead of boolean grant flag',p=>apiTable(p).grantable='false'],
 ['numeric instead of text-cast grantor OID',p=>apiTable(p).grantor=16075],
 ['noncanonical grantee OID',p=>apiTable(p).grantee='017075'],
 ['unknown ACL packet property',p=>apiTable(p).extra=true],
 ['empty ACL DATA',p=>p.acl=[]],
 ['null ACL DATA',p=>p.acl=null],
 ['sparse ACL DATA',p=>{p.acl.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));delete p.acl[p.acl.length-1]}],
 ['overflow beyond bounded22-row query',p=>extra(p,{grantee:'27075',privilege:'MAINTAIN'})],
])test('actual verifier rejects '+label+' with other effective/RLS DATA left nominal',async()=>{await rejects(mutate)})
for(const [label,mutate]of[
 ['unsafe effective table/RLS/owner result',p=>p.state[0].ok=false],
 ['zero API OID',p=>p.state[0].api_oid=0],
 ['noncanonical API OID',p=>p.state[0].api_oid='017075'],
 ['owner equal to API',p=>p.state[0].owner_oid=String(p.state[0].api_oid)],
 ['missing owner OID',p=>delete p.state[0].owner_oid],
 ['noncanonical owner OID',p=>p.state[0].owner_oid='016075'],
 ['overflow owner OID',p=>p.state[0].owner_oid='4294967296'],
 ['missing relation OID',p=>delete p.state[0].table_oid],
 ['zero relation OID',p=>p.state[0].table_oid='0'],
 ['overflow relation OID',p=>p.state[0].table_oid='4294967296'],
 ['effective UPDATE column grant',p=>p.columns[0].update=true],
 ['effective recorded_at INSERT grant',p=>p.columns.at(-1).insert=true],
 ['old effective column grant-option failure',p=>p.columns[0].no_grant_option=false],
 ['owner policy expression changed',p=>p.policies[0].using_expr='true'],
])test('existing catalog guards remain mandatory: '+label,async()=>{await rejects(mutate)})
test('actual SQL query retains effective guards and audits complete explicit ACL by object/attnum/owner grantor with a22-row failure bound',async()=>{const x=terminal();await verifyModelConfigReceiptSchema075(x.db);const state=x.queries[0].sql,acl=x.queries[1];for(const part of ['c.relrowsecurity AND c.relforcerowsecurity AND owner.rolsuper',"NOT has_table_privilege($2,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')","r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data','pg_maintain')","has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')",'has_any_column_privilege','a.grantee=0','a.is_grantable'])assert(state.includes(part),part);for(const part of ['pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault(\'r\',c.relowner)))','UNION ALL','pg_catalog.aclexplode(att.attacl)','att.attrelid::text','att.attnum::integer','a.grantor::text','a.grantee::text','a.is_grantable','LIMIT 22'])assert(acl.sql.includes(part),part);assert.deepEqual(acl.args,['agentstudio.model_config_write_receipts075'])})
test('the exact expected API table/column edge shape follows unchanged original075 GRANT source',()=>{const sql=fs.readFileSync(new URL('../db/postgres/migrations/pg_v9_075_model_config_write_receipts.sql',import.meta.url),'utf8');assert(sql.includes('GRANT SELECT ON agentstudio.model_config_write_receipts075 TO agentstudio_api;'));const grant=sql.match(/GRANT INSERT\(([^)]+)\)\s+ON agentstudio\.model_config_write_receipts075 TO agentstudio_api;/);assert(grant);assert.deepEqual(grant[1].split(','),fields.filter(name=>name!=='recorded_at'));const x=terminal(),expectedColumns=x.packets.acl.filter(r=>r.scope==='column');assert.deepEqual(expectedColumns.map(r=>r.column_number),Array.from({length:12},(_,i)=>i+1));assert(expectedColumns.every(r=>r.grantor===x.packets.state[0].owner_oid&&r.grantee===String(x.packets.state[0].api_oid)&&r.privilege==='INSERT'&&r.grantable===false));assert(!sql.includes('WITH GRANT OPTION'));assert(sql.includes('FORCE ROW LEVEL SECURITY'))})
