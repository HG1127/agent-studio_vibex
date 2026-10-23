import type {SqlClient} from "./contracts.ts"
import {verifyKnowledgeQueryCredentials} from "./knowledge-query-audit.ts"
export const knowledgeIndexRole="agentstudio_knowledge_index"
export const knowledgeIndexTables=["knowledge_index_activations","knowledge_index_activation_receipts","knowledge_index_attempts","knowledge_index_attempt_chunks"]
const helper=knowledgeIndexRole,worker=helper+"_worker",broker=helper+"_broker",tables=knowledgeIndexTables
type Permission=true|readonly string[]
const columns:Record<string,{read?:Permission;insert?:Permission;update?:Permission}>={
  users:{read:["id","external_issuer","external_subject"]},model_connections:{read:["id","owner_user_id","provider","enabled","models","revision"]},
  knowledge_bases:{read:["id","owner_user_id","visibility"]},knowledge_documents:{read:["id","owner_user_id","base_id","status"]},
  knowledge_chunks:{read:["id","owner_user_id","document_id","chunk_index","text_content"]},
  knowledge_embedding_profiles:{read:true,update:["dimensions"]},knowledge_embedding_consents:{read:true},knowledge_embedding_queue:{read:true,update:true},
  knowledge_embedding_vectors:{read:true,insert:true,update:true},knowledge_index_activations:{read:true,insert:true,update:true},
  knowledge_index_attempts:{read:true,insert:true,update:true},knowledge_index_attempt_chunks:{read:true,insert:true,update:["reserved"]},
  knowledge_index_activation_receipts:{read:true,insert:true},audit_events:{insert:["owner_user_id","actor_user_id","action","target_kind","target_id","result","metadata"]},
}
function refuse():never{throw Error("unsafe_knowledge_index_privileges")}
const allowed=(value:Permission|undefined,column:string)=>value===true||Array.isArray(value)&&value.includes(column)
export async function verifyKnowledgeIndexCredentials(db:SqlClient):Promise<void>{
  await verifyKnowledgeQueryCredentials(db)
  const roles=(await db.query<{name:string;safe:boolean;login:boolean;parent:number;members:number}>("SELECT r.rolname AS name,r.rolcanlogin AS login,"+
    "NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS parent,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid) AS members "+
    "FROM pg_catalog.pg_roles r WHERE r.rolname=ANY($1::text[])",[[helper,worker,broker]])).rows
  if(!roles.length)return
  if(roles.length!==3||roles.some(r=>!r.safe||r.login||r.parent!==0||r.name===helper&&r.members!==0))refuse()
  const members=(await db.query<{name:string;safe:boolean;memberships:number}>("SELECT DISTINCT r.rolname AS name,r.rolcanlogin AND NOT m.admin_option AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit "+
    "AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members other WHERE other.member=r.oid) AS memberships "+
    "FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_auth_members m ON m.member=r.oid JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE parent.rolname=ANY($1::text[])",[[worker,broker]])).rows
  if(members.some(r=>!r.safe||r.memberships!==1))refuse()
  for(const principal of [helper,worker,broker,...members.map(r=>r.name)]){
    const data=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,"+
      "has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
      "has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference "+
      "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid "+
      "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped",[principal])).rows
    for(const row of data){
      const permission=principal===helper&&row.schema==="agentstudio"?columns[row.table]:
        row.schema==="agentstudio"&&row.table==="schema_migrations"&&principal!==helper?{read:["version"]}:undefined
      if(row.reference||row.read&&!allowed(permission?.read,row.column)||row.insert&&!allowed(permission?.insert,row.column)||row.update&&!allowed(permission?.update,row.column))refuse()
    }
    const destructive=(await db.query<{unsafe:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND (has_table_privilege($1,c.oid,'TRUNCATE,TRIGGER') OR "+
      "(has_table_privilege($1,c.oid,'DELETE') AND NOT ($1=$2 AND n.nspname='agentstudio' AND c.relname='knowledge_embedding_queue')))) AS unsafe",[principal,helper])).rows[0]
    if(!destructive||destructive.unsafe)refuse()
  }
  const principals=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles base "+
    "WHERE base.rolname=ANY($1::text[]) AND pg_has_role(r.oid,base.oid,'MEMBER'))",[["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth",worker,broker]])).rows
  for(const {name} of principals){
    const exposed=(await db.query<{unsafe:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relname=ANY($2::text[]) AND (has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR "+
      "has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS unsafe",[name,[...tables,"knowledge_embedding_vectors"]])).rows[0]
    if(!exposed||exposed.unsafe)refuse()
  }
}
