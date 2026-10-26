import type {SqlClient,SqlPool} from "./contracts.ts"
const api="agentstudio_api"
const columns:Record<string,string[]>={
  agent_memory_entries:["owner_user_id","id","spec_id","kind","fact","content_sha256","created_at"],
  agent_memory_receipts:["owner_user_id","request_id","memory_id","spec_id","action","content_sha256","request_sha256","created_at"]
}
const refuse=():never=>{throw Error("unsafe_agent_memory_privileges")}
// Optional schema audit, including when execution is disabled.
export async function verifyAgentMemoryCredentials(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number|null}>("SELECT name,to_regclass('agentstudio.'||name)::oid AS id FROM unnest($1::text[])name",[Object.keys(columns)])).rows
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(objects.length!==2||typeof canRead!=="boolean")refuse()
  if(objects.every(o=>o.id===null)&&!canRead)return false
  if(!canRead)refuse()
  const stamped=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_049') AS ok")).rows[0]?.ok
  if(objects.length!==2||typeof stamped!=="boolean")refuse()
  if(objects.every(o=>o.id===null)&&!stamped)return false
  if(!stamped||objects.some(o=>!o.id))refuse()
  for(const object of objects){
    const entries=object.name==="agent_memory_entries"
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "NOT has_table_privilege($2,c.oid,'UPDATE,TRUNCATE,REFERENCES,TRIGGER') AND has_table_privilege($2,c.oid,'DELETE')=$3::boolean AND "+
      "(SELECT count(*)=$4::integer AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND "+
      "CASE polcmd WHEN 'r' THEN polname=$5||'_owner_read' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
      "WHEN 'a' THEN polname=$5||'_owner_insert' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' "+
      "WHEN 'd' THEN $3::boolean AND polname=$5||'_owner_delete' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL ELSE false END) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok "+
      "FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[object.id,api,entries,entries?3:2,entries?"agent_memory_entries":"agent_memory_receipts"])).rows[0]?.ok
    if(state!==true)refuse()
    const fields=(await db.query<{name:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT attname AS name,has_column_privilege($2,attrelid,attnum,'SELECT') AS read,"+
      "has_column_privilege($2,attrelid,attnum,'INSERT') AS insert,has_column_privilege($2,attrelid,attnum,'UPDATE') AS update,has_column_privilege($2,attrelid,attnum,'REFERENCES') AS reference "+
      "FROM pg_catalog.pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped",[object.id,api])).rows
    if(fields.length!==columns[object.name]?.length||fields.some(f=>!columns[object.name]?.includes(f.name)||!f.read||f.insert!==(f.name!=="created_at")||f.update||f.reference))refuse()
    const triggers=(await db.query<{name:string;ok:boolean}>("SELECT tgname AS name,tgrelid='agentstudio.agent_memory_entries'::regclass AND "+
      "tgfoid=to_regprocedure('agentstudio.agent_memory_entry_guard()') AND tgtype=15 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgconstraint=0 AND NOT tgdeferrable AND NOT tginitdeferred AND tgattr::text='' AS ok "+
      "FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal",[object.id])).rows
    if(triggers.length!==(entries?1:0)||triggers.some(t=>t.name!=="agent_memory_entry_receipt"||t.ok!==true))refuse()
    const indexes=(await db.query<{columns:string[];valid:boolean}>("SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AS valid,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[object.id])).rows
    for(const expected of entries?[["owner_user_id","id"]]:[["owner_user_id","request_id"],["owner_user_id","memory_id","action"]])
      if(!indexes.some(i=>i.valid&&JSON.stringify(i.columns)===JSON.stringify(expected)))refuse()
    const fks=(await db.query<{target:string;columns:string[];references:string[];valid:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND confdeltype='r' AND confupdtype='a' AS valid,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
      "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references "+
      "FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[object.id])).rows
    const expectedForeign=[{target:"agentstudio.agent_specs",columns:["spec_id","owner_user_id"],references:["id","owner_user_id"]},
      ...(entries?[{target:"agentstudio.agent_memory_receipts",columns:["owner_user_id","id"],references:["owner_user_id","request_id"]}]:[])]
    if(fks.length!==expectedForeign.length||expectedForeign.some(w=>!fks.some(f=>f.valid&&f.target===w.target&&JSON.stringify(f.columns)===JSON.stringify(w.columns)&&JSON.stringify(f.references)===JSON.stringify(w.references))))refuse()
  }
  const guard=(await db.query<{ok:boolean}>("SELECT NOT p.prosecdef AND p.prorettype='trigger'::regtype AND p.provolatile='v' AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner) AND "+
    "encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$1::text AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('agentstudio.agent_memory_entry_guard()')",["0fb997b6b1cd5838686064055c7af87d592040e3d70753164e47e4c2dd6f562b"])).rows[0]?.ok
  if(guard!==true)refuse()
  return true
}
export async function inspectAgentMemorySchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentMemoryCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
