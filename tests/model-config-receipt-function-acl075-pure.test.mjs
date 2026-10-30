import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {verifyModelConfigReceiptSchema075} from '../services/pg-api/src/model-config-receipt-schema075.ts'
import {catalogPackets} from './helpers/model-config-receipt-catalog-data.mjs'
// Direct verifier over terminal catalog DATA only; no Pool, SQL engine or server.
function terminal(){const packets=catalogPackets(),queries=[],db={async query(sql,args=[]){queries.push({sql,args});let part;if(sql.includes('model-config-receipt075:explicit-function-acl'))part='function_acl';else if(sql.includes('model-config-receipt075:explicit-acl'))part='acl';else if(sql.includes('server_version_num'))part='state';else if(sql.includes('FROM pg_catalog.pg_attribute'))part='columns';else if(sql.includes('FROM pg_catalog.pg_policy'))part='policies';else if(sql.includes('pg_get_constraintdef'))part='constraints';else if(sql.includes('FROM pg_catalog.pg_index'))part='indexes';else if(sql.includes('p.prosrc AS source'))part='validation';else if(sql.includes('count(*)=1 AS ok'))part='surface';else throw Error('unexpected catalog DATA query');return{rows:structuredClone(packets[part])}},release(){throw Error('not_a_pooled_client')}};return{packets,queries,db}}
async function rejects(mutate){const x=terminal();mutate(x.packets);await assert.rejects(verifyModelConfigReceiptSchema075(x.db),/unsafe_model_config_receipt_schema075/)}
test('actual075 verifier accepts exact owner/API function EXECUTE edges alongside all21 table/column edges',async()=>{const x=terminal();await verifyModelConfigReceiptSchema075(x.db);assert.equal(x.packets.acl.length,21);assert.equal(x.packets.function_acl.length,2);assert.equal(x.queries.length,9);assert(x.queries.every(q=>q.sql.startsWith('SELECT ')||q.sql.startsWith('/* model-config-receipt075:')));assert(!x.queries.some(q=>/^(GRANT|REVOKE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)/.test(q.sql)))})
test('function ACL order is immaterial and actual functionOID is not a fixture constant',async()=>{const x=terminal();x.packets.validation[0].function_oid='4294967295';for(const row of x.packets.function_acl)row.function_oid='4294967295';x.packets.function_acl.reverse();await verifyModelConfigReceiptSchema075(x.db)})
for(const[label,mutate]of[
 ['function owner differs from same075 table owner',p=>p.validation[0].owner_oid='26075'],
 ['owner and matching function grantors both drift away from table owner',p=>{p.validation[0].owner_oid='26075';for(const row of p.function_acl)row.grantor='26075'}],
 ['missing function owner OID',p=>delete p.validation[0].owner_oid],
 ['missing validation row',p=>p.validation=[]],
 ['zero function OID',p=>p.validation[0].function_oid='0'],
 ['overflow function OID',p=>p.validation[0].function_oid='4294967296'],
 ['noncanonical function OID',p=>p.validation[0].function_oid='019075'],
 ['number instead of text-cast function OID',p=>p.validation[0].function_oid=19075],
 ['different function OID in an explicit edge',p=>p.function_acl[0].function_oid='19076'],
 ['owner edge grantor is a different superuser',p=>p.function_acl[0].grantor='26075'],
 ['API edge grantor is API instead of owner',p=>p.function_acl[1].grantor=String(p.state[0].api_oid)],
 ['API edge grantor is another role',p=>p.function_acl[1].grantor='26075'],
 ['PUBLIC EXECUTE',p=>p.function_acl.push({...p.function_acl[1],grantee:'0'})],
 ['additional superuser EXECUTE',p=>p.function_acl.push({...p.function_acl[1],grantee:'26075'})],
 ['additional ordinary role EXECUTE',p=>p.function_acl.push({...p.function_acl[1],grantee:'27075'})],
 ['owner explicit grant option',p=>p.function_acl[0].grantable=true],
 ['API grant option',p=>p.function_acl[1].grantable=true],
 ['missing API edge',p=>p.function_acl.pop()],
 ['missing owner edge',p=>p.function_acl.shift()],
 ['duplicate owner edge replacing API',p=>p.function_acl[1]={...p.function_acl[0]}],
 ['wrong function privilege',p=>p.function_acl[1].privilege='SELECT'],
 ['string grant flag',p=>p.function_acl[1].grantable='false'],
 ['unexpected raw ACL column',p=>p.function_acl[1].other=true],
 ['sparse function ACL packet',p=>delete p.function_acl[1]],
 ['null function ACL packet',p=>p.function_acl=null],
 ['original effective function security predicate failed',p=>p.validation[0].ok=false],
 ['original source pin drift',p=>p.validation[0].source+=' '],
])test('actual verifier rejects '+label+' terminal DATA',async()=>{await rejects(mutate)})
test('raw complete function ACL query has no role filtering, binds the exact signature and caps at3 rows for2 expected edges',async()=>{const x=terminal();await verifyModelConfigReceiptSchema075(x.db);const q=x.queries.find(q=>q.sql.includes('explicit-function-acl'));for(const part of ['p.oid::text AS function_oid','a.grantor::text','a.grantee::text','a.privilege_type','a.is_grantable',"pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner)))",'p.oid=to_regprocedure($1)','LIMIT 3'])assert(q.sql.includes(part),part);assert(!q.sql.includes('JOIN pg_catalog.pg_roles'));assert.deepEqual(q.args,['agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text)'])})
test('unchanged SQL075 revokes PUBLIC and runtime grants before API EXECUTE; Root state narrowing remains present',()=>{const sql=fs.readFileSync(new URL('../db/postgres/migrations/pg_v9_075_model_config_write_receipts.sql',import.meta.url),'utf8');assert(sql.includes('REVOKE ALL ON FUNCTION agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text) FROM PUBLIC;'));assert(sql.includes('GRANT EXECUTE ON FUNCTION agentstudio.model_config_receipt_valid075(text,bigint,bigint,text,text,text,text,text) TO agentstudio_api;'));const source=fs.readFileSync(new URL('../services/pg-api/src/model-config-receipt-schema075.ts',import.meta.url),'utf8');assert(source.includes('if(!state)return fail()\n if(state.ok'));assert(source.includes('if(!validation)return fail()'));assert(source.includes('c.relrowsecurity AND c.relforcerowsecurity AND owner.rolsuper'))})
