import type {SqlClient} from "./contracts.ts"

// Standalone059 inventory/ACL/body auditor, with no predecessor import,
// migration source loading/execution or automatically refreshed pins.
const api="agentstudio_api",prefix="agent_generated_",refuse=():never=>{throw Error("unsafe_agent_generated_privileges")}
type Foreign={name:string;columns:string[];target:string;references:string[]}
type Key={name:string;columns:string[]}
type Table={fields:Record<string,string>;pk:Key;unique:Key[];checks:{name:string;expression:string}[];foreign:Foreign[]}
const tables:Record<string,Table>={
  "agent_generated_acceptances": {
    "fields": {
      "owner_user_id": "uuid",
      "request_id": "uuid",
      "review_id": "uuid",
      "spec_id": "uuid",
      "target_run_id": "uuid",
      "anchor_run_id": "uuid",
      "anchor_feedback_id": "uuid",
      "source_kind": "text",
      "source_protocol": "text",
      "review_request_sha256": "text",
      "input_sha256": "text",
      "content_sha256": "text",
      "result_sha256": "text",
      "completion_sha256": "text",
      "source_owner_epoch": "bigint",
      "acceptance_owner_epoch": "bigint",
      "before_spec_revision": "bigint",
      "after_spec_revision": "bigint",
      "before_spec_sha256": "text",
      "after_spec_sha256": "text",
      "before_revision_id": "uuid",
      "after_revision_id": "uuid",
      "candidate_sha256": "text",
      "preview_sha256": "text",
      "request_sha256": "text",
      "feedback_sources_sha256": "text",
      "changed_keys": "jsonb",
      "receipt_sha256": "text",
      "created_at": "timestamp with time zone"
    },
    "pk": {
      "name": "agent_generated_acceptances_pkey",
      "columns": [
        "owner_user_id",
        "request_id"
      ]
    },
    "unique": [
      {
        "name": "agent_generated_acceptances_review_key",
        "columns": [
          "owner_user_id",
          "review_id"
        ]
      }
    ],
    "checks": [
      {
        "name": "agent_generated_acceptances_kind_ck",
        "expression": "source_kind = 'generated_opinion'"
      },
      {
        "name": "agent_generated_acceptances_protocol_ck",
        "expression": "source_protocol = 'employee_statement_anchor_v1'"
      },
      {
        "name": "agent_generated_acceptances_hashes_ck",
        "expression": "review_request_sha256 ~ '^[a-f0-9]{64}$' AND input_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256 ~ '^[a-f0-9]{64}$' AND result_sha256 ~ '^[a-f0-9]{64}$' AND completion_sha256 ~ '^[a-f0-9]{64}$' AND before_spec_sha256 ~ '^[a-f0-9]{64}$' AND after_spec_sha256 ~ '^[a-f0-9]{64}$' AND candidate_sha256 ~ '^[a-f0-9]{64}$' AND preview_sha256 ~ '^[a-f0-9]{64}$' AND request_sha256 ~ '^[a-f0-9]{64}$' AND feedback_sources_sha256 ~ '^[a-f0-9]{64}$' AND receipt_sha256 ~ '^[a-f0-9]{64}$'"
      },
      {
        "name": "agent_generated_acceptances_epochs_ck",
        "expression": "source_owner_epoch>=1 AND source_owner_epoch<=9007199254740989 AND acceptance_owner_epoch=source_owner_epoch"
      },
      {
        "name": "agent_generated_acceptances_revisions_ck",
        "expression": "before_spec_revision>=1 AND before_spec_revision<=9007199254740989 AND after_spec_revision=before_spec_revision+1"
      },
      {
        "name": "agent_generated_acceptances_ids_ck",
        "expression": "request_id <> review_id AND request_id <> anchor_feedback_id AND before_revision_id <> after_revision_id"
      },
      {
        "name": "agent_generated_acceptances_keys_ck",
        "expression": "CASE WHEN jsonb_typeof(changed_keys)='array' THEN jsonb_array_length(changed_keys)>=1 AND jsonb_array_length(changed_keys)<=5 AND changed_keys <@ '[\"goal\",\"task_scope\",\"deliverables\",\"task_plan\",\"done_criteria\"]'::jsonb ELSE false END"
      }
    ],
    "foreign": [
      {
        "name": "agent_generated_acceptances_link_fk",
        "columns": [
          "owner_user_id",
          "request_id"
        ],
        "target": "agentstudio.agent_optimization_links",
        "references": [
          "owner_user_id",
          "request_id"
        ]
      },
      {
        "name": "agent_generated_acceptances_review_fk",
        "columns": [
          "owner_user_id",
          "review_id"
        ],
        "target": "agentstudio.agent_review_requests",
        "references": [
          "owner_user_id",
          "request_id"
        ]
      },
      {
        "name": "agent_generated_acceptances_outcome_fk",
        "columns": [
          "owner_user_id",
          "review_id"
        ],
        "target": "agentstudio.agent_assessment_outcomes",
        "references": [
          "owner_user_id",
          "request_id"
        ]
      }
    ]
  },
  "agent_generated_feedback_refs": {
    "fields": {
      "owner_user_id": "uuid",
      "request_id": "uuid",
      "source_ordinal": "integer",
      "run_id": "uuid",
      "feedback_id": "uuid",
      "feedback_sha256": "text",
      "feedback_revision": "bigint",
      "feedback_source_sha256": "text",
      "statement_sha256": "text"
    },
    "pk": {
      "name": "agent_generated_feedback_refs_pkey",
      "columns": [
        "owner_user_id",
        "request_id",
        "source_ordinal"
      ]
    },
    "unique": [
      {
        "name": "agent_generated_feedback_refs_feedback_key",
        "columns": [
          "owner_user_id",
          "request_id",
          "feedback_id"
        ]
      },
      {
        "name": "agent_generated_feedback_refs_run_key",
        "columns": [
          "owner_user_id",
          "request_id",
          "run_id"
        ]
      }
    ],
    "checks": [
      {
        "name": "agent_generated_feedback_refs_ordinal_ck",
        "expression": "source_ordinal>=1 AND source_ordinal<=8"
      },
      {
        "name": "agent_generated_feedback_refs_revision_ck",
        "expression": "feedback_revision>=1 AND feedback_revision<=9007199254740989"
      },
      {
        "name": "agent_generated_feedback_refs_hashes_ck",
        "expression": "feedback_sha256 ~ '^[a-f0-9]{64}$' AND feedback_source_sha256 ~ '^[a-f0-9]{64}$' AND statement_sha256 ~ '^[a-f0-9]{64}$'"
      }
    ],
    "foreign": [
      {
        "name": "agent_generated_feedback_refs_acceptance_fk",
        "columns": [
          "owner_user_id",
          "request_id"
        ],
        "target": "agentstudio.agent_generated_acceptances",
        "references": [
          "owner_user_id",
          "request_id"
        ]
      },
      {
        "name": "agent_generated_feedback_refs_feedback_fk",
        "columns": [
          "owner_user_id",
          "feedback_id"
        ],
        "target": "agentstudio.agent_feedback_receipts",
        "references": [
          "owner_user_id",
          "request_id"
        ]
      },
      {
        "name": "agent_generated_feedback_refs_run_fk",
        "columns": [
          "run_id",
          "owner_user_id"
        ],
        "target": "agentstudio.runs",
        "references": [
          "id",
          "owner_user_id"
        ]
      }
    ]
  }
}
const functions:Record<string,{args:string;sha:string}>={
  agent_generated_receipt:{args:"uuid, text",sha:"de102ea81efb146895200ac1f301d0b7b2912e452f032d87d66fe7b8b682adfa"},
  agent_generated_accept:{args:"jsonb",sha:"43dc3667bd9c44e72c3a682425e96632b26a859a609be8ec89852270ccd276d9"}
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)

// Every allowed CHECK is a conjunction of fixed atomic comparisons (or the
// one fixed CASE with conjunction-only THEN). Remove redundant parentheses
// and builtin casts, preserving quoted text/JSON values and operator order.
// OR, new operators/functions/schemas or changed literal content cannot match.
export function agentGeneratedCheckExpression(raw:string):string{
  const tokens=raw.match(/'(?:''|[^'])*'|::|[a-zA-Z_][a-zA-Z_0-9]*|[0-9]+|<=|>=|<>|<@|[().,=~+<>-]/g)
  if(!tokens||raw.replace(/'(?:''|[^'])*'|::|[a-zA-Z_][a-zA-Z_0-9]*|[0-9]+|<=|>=|<>|<@|[().,=~+<>-]|\s/g,"")!=="")return ""
  const out:string[]=[]
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i]!
    if(token==="("||token===")")continue
    if(token.toLowerCase()==="pg_catalog"&&tokens[i+1]==="."&&["jsonb_typeof","jsonb_array_length"].includes(tokens[i+2]?.toLowerCase()??"")){i++;continue}
    // Only deparser casts on constants are redundant. Never erase a cast on
    // a column/function result: it may narrow a bigint or alter CHECK logic.
    if(token==="::"&&/^(?:[0-9]+|'(?:''|[^'])*')$/.test(tokens[i-1]??"")&&["text","jsonb","bigint","integer"].includes(tokens[i+1]?.toLowerCase()??"")){i++;continue}
    if(token.startsWith("'")){
      if(tokens[i+1]==="::"&&["bigint","integer"].includes(tokens[i+2]?.toLowerCase()??"")&&/^'[0-9]+'$/.test(token)){
        out.push(BigInt(token.slice(1,-1)).toString())
      }else if(tokens[i+1]==="::"&&tokens[i+2]?.toLowerCase()==="jsonb"){
        try{out.push(JSON.stringify(JSON.parse(token.slice(1,-1).replace(/''/g,"'"))))}catch{return ""}
      }else out.push(token)
    }else out.push(token.toLowerCase())
  }
  return out.join(" ")
}
async function audit(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number;kind:string}>("SELECT c.relname AS name,c.oid::integer AS id,c.relkind AS kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,16)=$1",[prefix])).rows
  const routines=(await db.query<{name:string;args:string;sha:string;ok:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND NOT p.proisstrict AND p.prosecdef AND "+
    "NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND p.proallargtypes IS NULL AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL AND p.procost=100 AND p.prorows=0 AND "+
    "p.proowner=(SELECT proowner FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('agentstudio.agent_opinion_body(uuid,text,text)')) AND "+
    "(SELECT r.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND pg_has_role(member.oid,r.oid,'MEMBER')) FROM pg_catalog.pg_roles r WHERE r.oid=p.proowner) AND "+
    "p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))=2 AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=p.proowner)=1 AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))=1 AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS ok "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,16)=$1",[prefix,api])).rows
  const types=(await db.query<{name:string;table:string;ok:boolean}>(
    "SELECT t.typname AS name,c.relname AS table,t.typowner=c.relowner AND t.typacl IS NULL AND "+
    "(t.typtype='c' AND t.oid=c.reltype AND t.typrelid=c.oid OR t.typtype='b' AND t.typrelid=0 AND t.typelem=c.reltype AND t.oid=(SELECT typarray FROM pg_catalog.pg_type WHERE oid=c.reltype)) AS ok "+
    "FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=t.typrelid OR t.typelem<>0 AND c.reltype=t.typelem "+
    "WHERE n.nspname='agentstudio' AND (left(t.typname,16)=$1 OR left(t.typname,17)='_'||$1)",[prefix])).rows
  const clean=(await db.query<{ok:boolean}>(
    "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname<>'agentstudio' AND left(c.relname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname<>'agentstudio' AND left(p.proname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname<>'agentstudio' AND (left(t.typname,16)=$1 OR left(t.typname,17)='_'||$1)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace WHERE n.nspname<>'agentstudio' AND left(x.conname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE left(t.tgname,16)=$1 OR n.nspname='agentstudio' AND left(p.proname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,16)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=x.conrelid WHERE n.nspname='agentstudio' AND left(x.conname,16)=$1 AND (c.relname IS NULL OR c.relname<>ALL($2::text[]))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE left(polname,16)=$1) AS ok",[prefix,Object.keys(tables)])).rows[0]?.ok
  if(clean!==true)return refuse()
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(!objects.length&&!routines.length&&!types.length)return false;return refuse()}
  const stamp=(await db.query<{installed:boolean;predecessor:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_059') AS installed,EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_058') AS predecessor")).rows[0]
  if(stamp?.installed===false&&!objects.length&&!routines.length&&!types.length)return false
  if(stamp?.installed!==true||stamp.predecessor!==true||objects.length!==7||routines.length!==2||types.length!==4||new Set(routines.map(r=>r.name)).size!==2)return refuse()
  for(const row of routines){const expected=functions[row.name];if(!expected||!row.ok||row.args!==expected.args||row.sha!==expected.sha)return refuse()}
  const indexNames=Object.values(tables).flatMap(t=>[t.pk.name,...t.unique.map(u=>u.name)])
  for(const row of objects)if(row.kind==="r"?!tables[row.name]:row.kind!=="i"||!indexNames.includes(row.name))return refuse()
  for(const row of types){const name=row.name.startsWith("_")?row.name.slice(1):row.name;if(!tables[name]||row.table!==name||!row.ok)return refuse()}
  const role=(await db.query<{ok:boolean}>(
    "SELECT NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AND has_schema_privilege(r.oid,'agentstudio','USAGE') AND NOT has_schema_privilege(r.oid,'agentstudio','CREATE') AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles builtin WHERE builtin.rolname IN('pg_read_all_data','pg_write_all_data','pg_maintain') AND "+
      "(builtin.rolcanlogin OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND member.oid<>builtin.oid AND pg_has_role(member.oid,builtin.oid,'MEMBER')))) AS ok "+
    "FROM pg_catalog.pg_roles r WHERE r.rolname=$1",[api])).rows[0]?.ok
  if(role!==true)return refuse()
  const validatedForeignIds:number[]=[]
  for(const [name,expected] of Object.entries(tables)){
    const object=objects.find(o=>o.name===name&&o.kind==="r");if(!object)return refuse();const id=object.id
    const relation=(await db.query<{ok:boolean}>(
      "WITH relation AS (SELECT c.* FROM pg_catalog.pg_class c WHERE c.oid=$1::oid),"+
      "actual AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a),"+
      "expected AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r',c.relowner)) a),"+
      "difference AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) "+
      "SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND c.relreplident='d' AND c.relam=(SELECT oid FROM pg_catalog.pg_am WHERE amname='heap') AND coalesce(cardinality(c.reloptions),0)=0 AND "+
      "c.relowner=(SELECT proowner FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('agentstudio.agent_generated_accept(jsonb)')) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND NOT EXISTS(SELECT 1 FROM difference) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN('pg_read_all_data','pg_write_all_data','pg_maintain') AND "+
        "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN'))) AS ok FROM relation c",[id])).rows[0]?.ok
    if(relation!==true)return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;clean:boolean}>(
      "SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,NOT a.attisdropped AND a.atttypmod=-1 AND a.attndims=0 AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasmissing AND coalesce(cardinality(a.attacl),0)=0 AND "+
      "CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS clean FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0 ORDER BY a.attnum",[id])).rows
    if(columns.length!==Object.keys(expected.fields).length||columns.some((c,i)=>c.name!==Object.keys(expected.fields)[i]||c.type!==expected.fields[c.name]||c.required!==true||c.clean!==true))return refuse()
    const empty=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=$1::oid) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal) AS ok",[id])).rows[0]?.ok
    if(empty!==true)return refuse()
    const indexes=(await db.query<{name:string;primary:boolean;columns:string[];ok:boolean}>(
      "SELECT c.relname AS name,i.indisprimary AS primary,i.indisunique AND NOT i.indisexclusion AND NOT i.indisreplident AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts AND "+
      "c.relkind='i' AND c.relpersistence='p' AND c.relowner=t.relowner AND c.relnamespace=t.relnamespace AND coalesce(cardinality(c.reloptions),0)=0 AND am.amname='btree' AND "+
      "NOT EXISTS(SELECT 1 FROM unnest(i.indoption) o WHERE o<>0) AND NOT EXISTS(SELECT 1 FROM unnest(i.indcollation) c WHERE c<>0::oid) AND "+
      "NOT EXISTS(SELECT 1 FROM unnest(i.indclass) WITH ORDINALITY op(oid,n) JOIN pg_catalog.pg_opclass oc ON oc.oid=op.oid JOIN unnest(i.indkey) WITH ORDINALITY k(attnum,n) ON k.n=op.n JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum "+
        "WHERE oc.opcmethod<>c.relam OR NOT oc.opcdefault OR oc.opcintype<>a.atttypid OR oc.opcnamespace<>'pg_catalog'::regnamespace) AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns "+
      "FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_class t ON t.oid=i.indrelid JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE i.indrelid=$1::oid",[id])).rows
    const keys=[expected.pk,...expected.unique]
    if(indexes.length!==keys.length||keys.some((k,i)=>!indexes.some(a=>a.ok&&a.name===k.name&&a.primary===(i===0)&&same(a.columns,k.columns))))return refuse()
    const constraints=(await db.query<{id:number;name:string;kind:string;expression:string|null;columns:string[];target:string|null;references:string[];ok:boolean;ri:boolean}>(
      "SELECT x.oid::integer AS id,conname AS name,contype AS kind,CASE WHEN contype='c' THEN pg_get_expr(conbin,conrelid) END AS expression,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
      "CASE WHEN contype='f' THEN confrelid::regclass::text END AS target,"+
      "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references,"+
      "convalidated AND coalesce((to_jsonb(x)->>'conenforced')::boolean,true) AND NOT coalesce((to_jsonb(x)->>'conperiod')::boolean,false) AND NOT condeferrable AND NOT condeferred AND conislocal AND coninhcount=0 AND conparentid=0 AND contypid=0 AND CASE WHEN contype='c' THEN NOT connoinherit ELSE true END AND "+
      "CASE WHEN contype='f' THEN confmatchtype='s' AND confupdtype='a' AND confdeltype='r' WHEN contype IN('p','u') THEN conindid<>0 ELSE conindid=0 END AS ok,"+
      "CASE WHEN contype='f' THEN (SELECT count(*)=4 AND count(DISTINCT p.proname)=4 AND bool_and(t.tgisinternal AND n.nspname='pg_catalog' AND p.proargtypes::text='' AND t.tgenabled='O' AND t.tgparentid=0 AND t.tgconstrindid=x.conindid AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND "+
        "t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND "+
        "CASE p.proname WHEN 'RI_FKey_check_ins' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=5 "+
        "WHEN 'RI_FKey_check_upd' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=17 "+
        "WHEN 'RI_FKey_restrict_del' THEN t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=9 "+
        "WHEN 'RI_FKey_noaction_upd' THEN t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=17 ELSE false END) "+
        "FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgconstraint=x.oid) ELSE true END AS ri "+
      "FROM pg_catalog.pg_constraint x WHERE conrelid=$1::oid",[id])).rows
    const logical=constraints.filter(c=>c.kind!=="n")
    if(logical.length!==keys.length+expected.foreign.length+expected.checks.length||logical.some(c=>c.ok!==true||c.ri!==true))return refuse()
    if(keys.some((k,i)=>!logical.some(c=>c.kind===(i===0?"p":"u")&&c.name===k.name&&same(c.columns,k.columns))))return refuse()
    if(expected.foreign.some(f=>!logical.some(c=>c.kind==="f"&&c.name===f.name&&c.target===f.target&&same(c.columns,f.columns)&&same(c.references,f.references))))return refuse()
    if(expected.checks.some(k=>{const tokens=agentGeneratedCheckExpression(k.expression);return !tokens||!logical.some(c=>c.kind==="c"&&c.name===k.name&&typeof c.expression==="string"&&agentGeneratedCheckExpression(c.expression)===tokens)}))return refuse()
    const notNull=constraints.filter(c=>c.kind==="n"),version=(await db.query<{version:number}>("SELECT current_setting('server_version_num')::integer AS version")).rows[0]?.version
    if(!Number.isSafeInteger(version)||version!>=180000&&(notNull.length!==columns.length||columns.some(col=>notNull.filter(c=>c.ok&&same(c.columns,[col.name])).length!==1))||version!<180000&&notNull.length!==0)return refuse()
    const foreignIds=logical.filter(c=>c.kind==="f").map(c=>c.id)
    if(foreignIds.length!==expected.foreign.length)return refuse()
    validatedForeignIds.push(...foreignIds)
  }
  // Bind every allowed RI mount to actual OIDs returned only by the verified
  // new child-table manifests. Equal names in another schema are not authority.
  if(validatedForeignIds.length!==6||new Set(validatedForeignIds).size!==6||validatedForeignIds.some(id=>!Number.isSafeInteger(id)||id<1))return refuse()
  const tableIds=objects.filter(o=>o.kind==="r").map(o=>o.id)
  const extraInternal=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE (t.tgrelid=ANY($1::oid[]) OR t.tgconstrrelid=ANY($1::oid[])) AND t.tgisinternal AND NOT(t.tgconstraint=ANY($2::oid[]))) AS ok",[tableIds,validatedForeignIds])).rows[0]?.ok
  if(extraInternal!==true)return refuse()
  return true
}
export async function verifyAgentGeneratedCore(db:SqlClient):Promise<boolean>{
  try{return await audit(db)}catch{return refuse()}
}
