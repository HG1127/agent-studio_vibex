// Catalog-only checks run even when governance HTTP writes are disabled.
export async function inspectEmployeeGovernance(db){
  const refuse=()=>{throw Error('unsafe_employee_governance_privileges')}
  const objects=(await db.query("SELECT c.oid AS id,c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio_auth' AND c.relname IN('accounts','employee_governance_events')")).rows
  const account=objects.find(r=>r.name==='accounts')?.id,table=objects.find(r=>r.name==='employee_governance_events')?.id
  const fields=account?(await db.query("SELECT attname AS name,format_type(atttypid,atttypmod) AS type,attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attname IN('share_enabled','governance_revision') AND NOT a.attisdropped",[account])).rows:[]
  if(!table&&!fields.length)return false
  if(!account||!table||fields.length!==2||fields.some(f=>!f.required||f.type!==(f.name==='share_enabled'?'boolean':'bigint')||f.default_value!==(f.name==='share_enabled'?'true':'1')))refuse()
  const role='agentstudio_native_auth'
  const result=(await db.query("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid AND m.member<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_native_login')) AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]
  if(result?.ok!==true)refuse()
  const safe=(await db.query("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
    "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) "+
    "AND has_table_privilege($2,c.oid,'SELECT') AND has_table_privilege($2,c.oid,'INSERT') AND NOT has_table_privilege($2,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AND "+
    "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive AND "+
    "pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[table,role])).rows[0]
  if(safe?.ok!==true)refuse()
  const columns=(await db.query("SELECT a.attname AS name,has_column_privilege($1,a.attrelid,a.attnum,'SELECT') AS read,has_column_privilege($1,a.attrelid,a.attnum,'INSERT') AS insert,has_column_privilege($1,a.attrelid,a.attnum,'UPDATE') AS update FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.users'::regclass AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  const reads=['id','external_issuer','external_subject','status','display_name','created_at'],inserts=['id','external_issuer','external_subject','display_name','status']
  if(!reads.every(name=>columns.some(c=>c.name===name))||columns.some(c=>c.read!==reads.includes(c.name)||c.insert!==inserts.includes(c.name)||c.update!==(c.name==='status')))refuse()
  const users=(await db.query("SELECT count(*)=2 AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)]::oid[] AND "+
    "pg_get_expr(polqual,polrelid)='(external_issuer = ''urn:agentstudio:local:v1''::text)' AND "+
    "CASE polcmd WHEN 'r' THEN polname='native_auth_verified_local_users' AND polwithcheck IS NULL WHEN 'w' THEN polname='native_auth_update_local_users' AND pg_get_expr(polwithcheck,polrelid)='(external_issuer = ''urn:agentstudio:local:v1''::text)' ELSE false END) AS ok "+
    "FROM pg_catalog.pg_policy WHERE polrelid='agentstudio.users'::regclass AND polcmd IN('r','w','*') AND ((SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)=ANY(polroles) OR 0=ANY(polroles))",[role])).rows[0]
  if(users?.ok!==true)refuse()
  for(const r of ['agentstudio_api','agentstudio_worker','agentstudio_collaboration','agentstudio_releases','agentstudio_knowledge_acl']){
    const grant=(await db.query("SELECT NOT has_column_privilege($1,$2::oid,'share_enabled','SELECT,INSERT,UPDATE,REFERENCES') AND NOT has_column_privilege($1,$2::oid,'governance_revision','SELECT,INSERT,UPDATE,REFERENCES') AS ok",[r,account])).rows[0]
    if(grant?.ok!==true)refuse()
  }
  return true
}
export async function inspectEmployeeGovernanceSchema(pool){
  const db=await pool.connect()
  try{
    await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api')
    const installed=await inspectEmployeeGovernance(db)
    const stamped=(await db.query("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_047') AS ok")).rows[0]?.ok
    if(typeof stamped!=='boolean'||installed!==stamped)
      throw Error('employee_governance_runtime_incomplete')
    return installed
  }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
}
