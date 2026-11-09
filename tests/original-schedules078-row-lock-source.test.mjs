import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import ts from 'typescript'
import {originalSchedulesFunctionManifest,originalSchedulesMigrationSha256} from '../services/pg-api/src/original-schedules-audit-manifest.ts'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sql=read('db/postgres/migrations/pg_v9_078_original_schedule_contract.sql'),audit=read('services/pg-api/src/original-schedules-audit.ts'),profile=read('services/pg-api/src/pg18-employee-ui078-source.mjs'),sha=s=>createHash('sha256').update(s).digest('hex'),role='agentstudio_original_schedules'
const required=['agent_specs','workflows','model_connections','schedule_occurrences']
function functions(source){return [...source.matchAll(/CREATE FUNCTION agentstudio\.(original_schedule_[a-z_]+)\([^]*?\) RETURNS [^\n]+\nLANGUAGE \w+ (?:STABLE|IMMUTABLE|VOLATILE) SECURITY DEFINER SET search_path=pg_catalog AS \$fn\$([^]*?)\$fn\$;/g)]}
function grants(source){const m=new Map();for(const g of source.matchAll(/\bGRANT\s+UPDATE\s*\(([^)]+)\)\s+ON\s+agentstudio\.([a-z_]+)\s+TO\s+agentstudio_original_schedules\s*;/g))m.set(g[2],g[1].split(',').map(x=>x.trim()));return m}
function updateMap(source){const tree=ts.createSourceFile('audit.ts',source,ts.ScriptTarget.Latest,true);assert.equal(tree.parseDiagnostics.length,0);let result;const visit=n=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='updates'){assert(ts.isObjectLiteralExpression(n.initializer));result=Object.fromEntries(n.initializer.properties.map(p=>{assert(ts.isPropertyAssignment(p)&&ts.isArrayLiteralExpression(p.initializer));return[p.name.getText(tree).replaceAll("'",''),p.initializer.elements.map(e=>{assert(ts.isStringLiteral(e));return e.text})]}))}ts.forEachChild(n,visit)};visit(tree);assert(result);return result}
test('all real078 row-locked relations have a column UPDATE privilege; plain SELECT alone is insufficient',()=>{
 const locked=new Set();for(const f of functions(sql))for(const statement of f[2].split(';'))if(/\bFOR (?:NO KEY UPDATE|UPDATE|SHARE|KEY SHARE)\b/.test(statement))for(const ref of statement.matchAll(/\b(?:FROM|JOIN)\s+agentstudio\.([a-z_]+)/g))locked.add(ref[1])
 assert.equal(locked.size,7);const available=grants(sql),missing=[...locked].filter(t=>!available.has(t)).sort();assert.deepEqual(missing,[],'row-lock relations missing dedicated definer UPDATE')
})
test('four row-lock prerequisites grant exactly UPDATE(id), only to the isolated NOLOGIN function owner',()=>{
 const available=grants(sql);for(const table of required)assert.deepEqual(available.get(table),['id'],table)
 assert.match(sql,/CREATE ROLE agentstudio_original_schedules NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;/)
 assert(!/GRANT\s+UPDATE\s+ON\s+agentstudio\.(?:agent_specs|workflows|model_connections|schedule_occurrences)/.test(sql))
 for(const table of required){const direct=[...sql.matchAll(new RegExp('GRANT UPDATE\\([^;]+ON agentstudio\\.'+table+' TO ([a-z_]+);','g'))];assert.equal(direct.length,1);assert.equal(direct[0][1],role)}
 assert(!/GRANT agentstudio_original_schedules TO/.test(sql));assert(!/GRANT[^;]*TO agentstudio_(?:api|worker|scheduler);/.test(sql.replace(/GRANT EXECUTE[^;]+;/g,'')))
})
test('column auditor permits only id on these four tables and still rejects every other read/insert/update/reference drift',()=>{
 const map=updateMap(audit);for(const table of required){assert.deepEqual(map[table],['id']);assert.equal(map[table].includes('owner_user_id'),false);assert.equal(map[table].includes('revision'),false)}
 for(const part of ["c.read!==allowed(reads,key,c.column)","c.insert!==allowed(inserts,key,c.column)","c.update!==allowed(updates,key,c.column)","||c.reference",'has_column_privilege','for(const map of [reads,inserts,updates])'])assert(audit.includes(part))
 assert(!/GRANT|SET LOCAL ROLE agentstudio_original_schedules/.test(audit))
})
test('all20 exact definer bodies including row-lock, owner/CAS/source and receipt checks retain manifest hashes',()=>{
 const actual=functions(sql);assert.equal(actual.length,20);assert.equal(originalSchedulesFunctionManifest.length,20)
 for(const [,name,body]of actual){const f=originalSchedulesFunctionManifest.find(f=>f.name===name);assert(f);assert.equal(sha(body),f.body_sha256);assert(f.grantees.every(g=>g==='agentstudio_api'))}
 const put=actual.find(f=>f[1]==='original_schedule_put')[2],begin=actual.find(f=>f[1]==='original_schedule_begin')[2],finish=actual.find(f=>f[1]==='original_schedule_finish')[2]
 for(const text of [put,begin,finish])assert(text.includes('owner_user_id=actor'))
 assert.match(put,/agentstudio\.agent_specs[^;]*FOR SHARE/);assert.match(put,/agentstudio\.workflows[^;]*FOR SHARE/);assert.match(put,/agentstudio\.model_connections[^;]*FOR SHARE/)
 assert.match(begin,/agentstudio\.schedule_occurrences[^;]*FOR UPDATE/);assert.match(finish,/agentstudio\.schedule_occurrences[^;]*FOR UPDATE/)
 assert(put.includes('revision=o.before_revision+1'));assert(begin.includes('s.revision<>v'));assert(begin.includes('IS DISTINCT FROM src'));assert(finish.includes('original_schedule_queue_unconfirmed'))
})
test('full078 raw hash and named employee combination SQL pin agree, while044 body/grant scope is not rewritten',()=>{
 assert.equal(sha(sql),originalSchedulesMigrationSha256)
 assert(profile.includes("version:'pg_v9_078',sha256:'"+sha(sql)+"'"))
 assert(profile.includes("excluded_optional_versions:['pg_v9_074','pg_v9_076','pg_v9_077']"))
 assert(!/CREATE(?: OR REPLACE)? FUNCTION agentstudio\.schedule_|ALTER FUNCTION agentstudio\.schedule_|DROP |TRUNCATE |DELETE FROM/.test(sql))
 assert(!/GRANT EXECUTE[^;]*agentstudio\.schedule_[^;]*TO agentstudio_original_schedules/.test(sql))
})
test('hosted-only diagnostic observes actual RPC errors and rethrows the original failure without response or row spoofing',()=>{
 const fixture=read('tests/helpers/pg-original-schedules078-backend-fixture.mjs'),line=fixture.split('\n').find(s=>s.includes('const observedApi='));assert(line.includes('await db.query(sql,args)'));assert(line.includes('originalSchedules078RuntimeSqlFailure(error)'));assert(line.includes('throw error'));assert(!line.includes('error.message'));assert(!line.includes('JSON.stringify(error)'));assert(!line.includes('return {rows:'))
 assert(fixture.includes("assert.equal(response.status,200)"));assert(fixture.includes('await schedulesAudit.inspectOriginalSchedulesSchema(f.pool)'));assert(fixture.includes('actual044_credentials_auditor:true'))
})
