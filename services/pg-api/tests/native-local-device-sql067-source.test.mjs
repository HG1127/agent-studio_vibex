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
test('actual reviewed source bytes match all31 literal routine body pins and the067 raw digest',()=>{
 assert.equal(sha(sql),manifest.sql_sha256);const found=new Map([...sql.matchAll(/CREATE FUNCTION agentstudio\.(native_local_[a-z_]+)\([\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>[m[1],m[2]]));assert.equal(found.size,31);assert.equal(Object.keys(manifest.routines).length,31)
 for(const [name,body]of found)assert.equal(sha(body),manifest.routines[name].sha,name)
})
test('restoring only the old expiry alias yields the exact marker067 bytes; original marker and delimiter regressions remain pinned',()=>{
 const marker067=sql.replace("FROM agentstudio.native_local_devices live_device WHERE live_device.id=j.device_id AND live_device.version=j.device_version AND NOT live_device.revoked","FROM agentstudio.native_local_devices d WHERE d.id=j.device_id AND d.version=j.device_version AND NOT d.revoked")
 assert.equal(sha(marker067),'cf392bcaecf1cc2510fe374906aa69c0f8257d7c1d4630e4bd12ffa5f6bc7397')
 const previous067=marker067.replace("CREATE FUNCTION agentstudio.native_local_executor_installed() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$\nBEGIN\n PERFORM agentstudio.native_local_session('agentstudio_local_executor');\n RETURN EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_067');\nEND $fn$;\n",'').replace("IF f.proname IN('native_local_pair','native_local_poll','native_local_check','native_local_complete','native_local_executor_installed')","IF f.proname IN('native_local_pair','native_local_poll','native_local_check','native_local_complete')")
 assert.equal(sha(previous067),'003e2e5ffbe7893fe6290b65232c89d0156142ae88c2f6d98078daf6bbcddeb2')
 const restored=previous067.replace("<>(CASE WHEN a='enqueue' THEN 5 ELSE 4 END) THEN","<>CASE WHEN a='enqueue' THEN 5 ELSE 4 END THEN").replace("OR (CASE WHEN x->>'mimeType'='image/png' THEN substring(b FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') ELSE substring(b FROM 1 FOR 3)<>decode('ffd8ff','hex') END) THEN","OR CASE WHEN x->>'mimeType'='image/png' THEN substring(b FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') ELSE substring(b FROM 1 FOR 3)<>decode('ffd8ff','hex') END THEN")
 assert.equal(previous067.length-restored.length,4);assert.equal(sha(restored),'dd57b6484448b76c7e8c90c1afaebbefa8ee12e49c758958d04c530191231e42')
})
