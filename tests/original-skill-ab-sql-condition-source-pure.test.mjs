// Source/metadata checks only. This is neither a SQL parser nor PG acceptance.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {skillAbFunctions,skillAbInstallSQL,skillAbSchemaHash} from '../services/pg-api/src/original-skill-ab-schema.mjs'
import {assertSkillAbCatalog} from '../services/pg-api/src/original-skill-ab-catalog.mjs'
const sha=value=>createHash('sha256').update(value).digest('hex')
const SQL=readFileSync(new URL('../db/postgres/optional/original_skill_ab_v1.sql',import.meta.url))
const oldStamp='c2b784c8da63e1df41cc02b0b84c2b3433990f8de5e7042f42b1264a6c9096e1',oldSQL='8b362441cedf1095a4ecc2f516733bba68223d931e87e1746ffbc8ba69baadc5',oldSession='07d35a109694feba9f184c37a78e36b8a9fc7a807a18ab69644f169b6f422b02'
const before="current_setting('role')<>CASE $1 WHEN 'api' THEN 'agentstudio_api' ELSE 'agentstudio_skill_ab_dispatch' END THEN",after="current_setting('role')<>(CASE $1 WHEN 'api' THEN 'agentstudio_api' ELSE 'agentstudio_skill_ab_dispatch' END) THEN"
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/original-skill-ab-catalog.json',import.meta.url),'utf8'))
function bodies(raw){
 const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text),raw)
 return [...text.matchAll(/CREATE FUNCTION agentstudio_skill_ab\.([a-z_][a-z_0-9]*)\(([^)]*)\) RETURNS [^\n]*? AS \$ab\$([\s\S]*?)\$ab\$;/g)].map(m=>({name:m[1],args:m[2],body:Buffer.from(m[3],'utf8')}))
}
function exactBodies(raw){const rows=bodies(raw);assert.equal(rows.length,16);assert.equal(new Set(rows.map(r=>r.name)).size,16);for(const expected of skillAbFunctions){const row=rows.find(r=>r.name===expected.name);assert(row);assert.equal(row.args,expected.args);assert.deepEqual(row.body,Buffer.from(expected.body));assert.equal(sha(row.body),expected.sha256)}return rows}
// Narrow lexical check for the authored PL/pgSQL IF/ELSIF vocabulary. Mirrors
// PG18's THEN terminator/parenthesis boundary; does not parse or execute SQL.
function tokens(text){
 const out=[];let i=0,depth=0
 while(i<text.length){const start=i,c=text[i]
  if(/\s/.test(c)){i++;continue}
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i+2);i=end<0?text.length:end+1;continue}
  if(text.startsWith('/*',i)){let nested=1;i+=2;while(i<text.length&&nested){if(text.startsWith('/*',i)){nested++;i+=2}else if(text.startsWith('*/',i)){nested--;i+=2}else i++}assert.equal(nested,0);continue}
  if(c==="'"||c==='"'){i++;let closed=false;while(i<text.length){if(text[i]===c){if(text[i+1]===c){i+=2;continue}i++;closed=true;break}i++}assert(closed);out.push({value:'QUOTED',depth,start});continue}
  if(c==='('||c==='['){out.push({value:c,depth,start});depth++;i++;continue}
  if(c===')'||c===']'){depth--;assert(depth>=0);out.push({value:c,depth,start});i++;continue}
  const word=/^[A-Za-z_][A-Za-z_0-9]*/.exec(text.slice(i));if(word){out.push({value:word[0].toUpperCase(),depth,start});i+=word[0].length;continue}
  out.push({value:c,depth,start});i++
 }
 assert.equal(depth,0);return out
}
function assertGroupedIfCases(body){
 const list=tokens(body);let conditions=0
 for(let i=0;i<list.length;i++)if(['IF','ELSIF'].includes(list[i].value)&&list[i-1]?.value!=='END'){
  const base=list[i].depth;let ended=false;conditions++
  for(let j=i+1;j<list.length;j++){
   if(list[j].value==='CASE'&&list[j].depth===base)throw Error('ungrouped_SQL_CASE_before_IF_THEN')
   if(list[j].value==='THEN'&&list[j].depth===base){ended=true;break}
   if(list[j].value===';'&&list[j].depth===base)break
  }
  assert(ended,'authored IF lacks its outer THEN')
 }
 return conditions
}
const legacy=()=>{assert.equal(skillAbInstallSQL.split(after).length,2);return skillAbInstallSQL.replace(after,()=>before).replace(skillAbSchemaHash,()=>oldStamp)}
test('optional AB install file is exact generated LF bytes and retains the exact derived template stamp',()=>{assert.deepEqual(SQL,Buffer.from(skillAbInstallSQL));assert.equal(SQL.includes(13),false);assert.equal(skillAbInstallSQL.split(skillAbSchemaHash).length,2);assert.equal(sha(skillAbInstallSQL.replace(skillAbSchemaHash,'__SKILL_AB_SOURCE_SHA256__')),skillAbSchemaHash)})
test('all sixteen installed function bodies are extracted and hashed byte-for-byte without trimming or normalization',()=>{assert.equal(exactBodies(SQL).length,16)})
test('every authored IF and ELSIF protects an embedded SQL CASE from the outer THEN delimiter',()=>{assert(skillAbFunctions.reduce((n,f)=>n+assertGroupedIfCases(f.body),0)>30);assert.doesNotThrow(()=>assertGroupedIfCases("BEGIN IF x<>(CASE WHEN y THEN 'THEN CASE' ELSE 'IF' END) THEN NULL; END IF; END"))})
test('the exact historical SQL hash and reported character10310 reproduce the ungrouped session CASE source failure',()=>{const old=legacy();assert.equal(sha(old),oldSQL);assert.equal(old.indexOf(" THEN 'agentstudio_api'",old.indexOf(' IF expected')),10309);assert.equal(Buffer.byteLength(old.slice(0,10309)),10309);assert.equal(old.slice(0,10309).split('\n').length,102);const session=bodies(Buffer.from(old)).find(f=>f.name==='session');assert.equal(sha(session.body),oldSession);assert.throws(()=>assertGroupedIfCases(session.body.toString()),/ungrouped_SQL_CASE_before_IF_THEN/)})
test('CASE grouping changes only the session body and leaves all fifteen other function bodies byte-identical',()=>{const previous=bodies(Buffer.from(legacy())),next=exactBodies(SQL),changed=next.filter(n=>!n.body.equals(previous.find(p=>p.name===n.name).body)).map(n=>n.name);assert.deepEqual(changed,['session']);const current=next.find(n=>n.name==='session').body.toString();assert.equal(current.split(after).length,2);assert.equal(current.replace(after,()=>before),previous.find(p=>p.name==='session').body.toString())})
test('strict existing catalogue auditor accepts current metadata DATA and rejects either stale body or old stamp independently',()=>{assert.equal(assertSkillAbCatalog(fixture()).source_sha256,skillAbSchemaHash);const oldBody=fixture();oldBody.functions.find(f=>f.name==='session').source_sha256=oldSession;assert.throws(()=>assertSkillAbCatalog(oldBody),/catalog_unavailable/);const oldProfile=fixture();oldProfile.stamp[0].source_sha256=oldStamp;assert.throws(()=>assertSkillAbCatalog(oldProfile),/catalog_unavailable/)})
test('body extraction refuses a newline mutation, duplicate function or missing delimiter instead of normalizing source',()=>{assert.throws(()=>exactBodies(Buffer.from(skillAbInstallSQL.replace(after,after+'\n'))));assert.throws(()=>exactBodies(Buffer.concat([SQL,Buffer.from(skillAbInstallSQL.match(/CREATE FUNCTION agentstudio_skill_ab\.session\([\s\S]*?\$ab\$;/)[0])])));assert.throws(()=>exactBodies(Buffer.from(skillAbInstallSQL.replace('END$ab$;','END$other$;'))))})
