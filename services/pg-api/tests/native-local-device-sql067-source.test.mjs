// Pure source regression only: this is NOT a PostgreSQL syntax parser or a
// database acceptance substitute. It checks PG18's documented source rule that
// IF expressions stop at K_THEN when parenthesis depth is zero.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {nativeLocalDeviceManifest as manifest} from '../src/native-local-device-audit-manifest.ts'
const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_067_native_local_devices.sql',import.meta.url),'utf8'),sha=v=>createHash('sha256').update(v).digest('hex')
function noBareCaseInIf(source){
 const tokens=[...source.matchAll(/--[^\n]*|\/\*[\s\S]*?\*\/|(?:E)?'(?:''|[^'])*'|[A-Za-z_][A-Za-z0-9_]*|[()[\];]/g)].filter(m=>!/^(?:--|\/\*|E?'|')/.test(m[0])).map(m=>m[0].toUpperCase())
 let count=0
 for(let i=0;i<tokens.length;i++)if(tokens[i]==='IF'&&tokens[i-1]!=='END'){
  count++;let depth=0,ended=false
  for(let j=i+1;j<tokens.length;j++){
   const token=tokens[j]
   if(token==='CASE'&&depth===0)throw Error('unparenthesized_case_in_if_condition')
   if(token==='THEN'&&depth===0){ended=true;break}
   if(token==='('||token==='[')depth++
   else if(token===')'||token===']')depth--
   if(depth<0||token===';'&&depth===0)throw Error('unterminated_if_condition')
  }
  if(!ended)throw Error('unterminated_if_condition')
 }
 return count
}
test('real regression fragments expose inner THEN; both corrected IF conditions and all067 IF conditions keep it nested',()=>{
 for(const value of ["IF size<>CASE WHEN action='enqueue' THEN 5 ELSE 4 END THEN RAISE EXCEPTION 'denied';END IF;","IF too_big OR CASE WHEN mime='image/png' THEN invalid_png ELSE invalid_jpeg END THEN RAISE EXCEPTION 'denied';END IF;"]){assert.throws(()=>noBareCaseInIf(value),/unparenthesized_case/);const fixed=value.replace('CASE WHEN','(CASE WHEN').replace('END THEN','END) THEN');assert.equal(noBareCaseInIf(fixed),1)}
 assert.ok(noBareCaseInIf(sql)>40)
})
test('actual reviewed source bytes match all30 literal routine body pins and the067 raw digest',()=>{
 assert.equal(sha(sql),manifest.sql_sha256);const found=new Map([...sql.matchAll(/CREATE FUNCTION agentstudio\.(native_local_[a-z_]+)\([\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>[m[1],m[2]]));assert.equal(found.size,30);assert.equal(Object.keys(manifest.routines).length,30)
 for(const [name,body]of found)assert.equal(sha(body),manifest.routines[name].sha,name)
})
test('reversing exactly the two delimiter pairs restores every original SQL byte, including all privilege/rejection constraints',()=>{
 const restored=sql.replace("<>(CASE WHEN a='enqueue' THEN 5 ELSE 4 END) THEN","<>CASE WHEN a='enqueue' THEN 5 ELSE 4 END THEN").replace("OR (CASE WHEN x->>'mimeType'='image/png' THEN substring(b FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') ELSE substring(b FROM 1 FOR 3)<>decode('ffd8ff','hex') END) THEN","OR CASE WHEN x->>'mimeType'='image/png' THEN substring(b FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') ELSE substring(b FROM 1 FOR 3)<>decode('ffd8ff','hex') END THEN")
 assert.equal(sql.length-restored.length,4);assert.equal(sha(restored),'dd57b6484448b76c7e8c90c1afaebbefa8ee12e49c758958d04c530191231e42')
})
