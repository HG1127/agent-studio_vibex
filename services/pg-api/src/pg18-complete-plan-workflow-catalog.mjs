// Independent fixed F05 account catalog. No C/Review enum or auditor changed.
import{createHash}from'node:crypto'
import{completeServiceDefinition}from'./pg18-complete-service-plan.mjs'
import{serviceLoginKinds,serviceLogins}from'./pg18-service-login-policy.mjs'
import{verifyPg18ServiceHbaOrder}from'./native-activation-cli.mjs'
import{complete069PlanWorkflowAbi,inspectComplete069PlanWorkflowHba}from'./pg18-complete-plan-workflow-plan.mjs'
import{complete069PlanWorkflowAuxiliaryPredecessors as auxiliary}from'./pg18-complete-plan-workflow-predecessor-plan.mjs'
const fail=c=>{throw Error('complete069_plan_workflow_'+c)},sha=v=>createHash('sha256').update(v).digest('hex'),pairNames=complete069PlanWorkflowAbi.map(a=>a.login)
const original=[completeServiceDefinition('native-auth'),...serviceLoginKinds.map(k=>serviceLogins[k])].map(a=>Object.freeze({...a,connection_limit:-1}))
// All five preceding auxiliary LOGINs are required; no optional-role adoption.
const hosts=['host','hostssl','hostnossl','hostgssenc','hostnogssenc'],exact=(values,value)=>Array.isArray(values)&&values.length===1&&values[0]===value
function ipv4(v){if(typeof v!=='string')return null;const a=v.split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)?a.reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0:null}
function inspectAuxiliaryHba(rows,login){
 const no={local_reject:false,loopback_scram:false,remote_ipv4_reject:false,remote_ipv6_reject:false,safe:false}
 if(!auxiliary.some(a=>a.login===login)||!Array.isArray(rows)||rows.some(r=>!r||r.error!=null||!Number.isSafeInteger(r.rule_number)||r.rule_number<1||!['local',...hosts].includes(r.type)||!Array.isArray(r.database)||!Array.isArray(r.user_name)||!r.database.length||!r.user_name.length||[...r.database,...r.user_name].some(v=>typeof v!=='string'||!v)||typeof r.auth_method!=='string'||r.options!=null&&(!Array.isArray(r.options)||r.options.some(v=>typeof v!=='string')))||new Set(rows.map(r=>r.rule_number)).size!==rows.length)return no
 const user=r=>r.user_name.some(v=>v===login||v==='all'||/^[@+/]/.test(v)),db=r=>r.database.some(v=>['agent_studio','all','samerole','samegroup','sameuser'].includes(v)||/^[@/]/.test(v)),opts=r=>!r.options||r.options.length===0
 const loop=r=>r?.type==='host'&&exact(r.user_name,login)&&exact(r.database,'agent_studio')&&r.address==='127.0.0.1'&&['255.255.255.255','32'].includes(r.netmask)&&r.auth_method==='scram-sha-256'&&opts(r)
 const could=r=>{if(typeof r.address==='string'&&r.address.includes(':'))return false;const a=ipv4(r.address),m=ipv4(r.netmask);return a===null||m===null||((a&m)>>>0)===((2130706433&m)>>>0)}
 const ordered=[...rows].sort((a,b)=>a.rule_number-b.rule_number),local=ordered.find(r=>r.type==='local'&&user(r)),tcp=ordered.find(r=>hosts.includes(r.type)&&user(r)&&db(r)&&could(r))
 const local_reject=!!local&&exact(local.user_name,login)&&exact(local.database,'all')&&local.auth_method==='reject'&&opts(local),loopback_scram=loop(tcp)
 const remote=f=>{const relevant=ordered.filter(r=>hosts.includes(r.type)&&user(r)&&(typeof r.address!=='string'||(ipv4(r.address)!==null?f===4:r.address.includes(':')?f===6:true))),at=relevant.findIndex(r=>r.type==='host'&&exact(r.user_name,login)&&exact(r.database,'all')&&r.auth_method==='reject'&&opts(r)&&(f===4?r.address==='0.0.0.0'&&['0.0.0.0','0'].includes(r.netmask):r.address==='::'&&['::','0'].includes(r.netmask)));return at>=0&&relevant.slice(0,at).every(r=>f===4&&loop(r))}
 const remote_ipv4_reject=remote(4),remote_ipv6_reject=remote(6);return{local_reject,loopback_scram,remote_ipv4_reject,remote_ipv6_reject,safe:local_reject&&loopback_scram&&remote_ipv4_reject&&remote_ipv6_reject}
}

async function directLoginPrivileges(db,login){
 const r=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)))) AND NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable)) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname='agent_studio_telemetry' AND has_database_privilege($1,d.oid,'CONNECT')) AS ok",[login])).rows[0]
 if(r?.ok!==true)fail('direct_privileges_refused')
}

export async function complete069PlanWorkflowBaseline(db){
 const roles=(await db.query("SELECT r.rolname AS name,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig,a.rolpassword FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid ORDER BY r.rolname")).rows
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,g.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor ORDER BY c.rolname,p.rolname,g.rolname")).rows
 const databases=(await db.query("SELECT d.datname,r.rolname AS grantee,g.rolname AS grantor,a.privilege_type,a.is_grantable FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a LEFT JOIN pg_roles r ON r.oid=a.grantee JOIN pg_roles g ON g.oid=a.grantor ORDER BY d.datname,a.grantee,a.grantor,a.privilege_type")).rows
 const objects=(await db.query("SELECT 'schema' AS kind,n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl FROM pg_namespace n UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,pg_get_userbyid(c.relowner),a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped UNION ALL SELECT 'type',n.nspname||'.'||t.typname,pg_get_userbyid(t.typowner),t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace UNION ALL SELECT 'routine',p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace ORDER BY kind,name")).rows
  const defaults=(await db.query("SELECT pg_get_userbyid(d.defaclrole) AS owner,coalesce(n.nspname,'') AS schema,d.defaclobjtype AS kind,d.defaclacl::text AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY owner,schema,kind")).rows
  const policies=(await db.query("SELECT n.nspname AS schema,c.relname AS relation,p.polname AS name,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS using_expression,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY n.nspname,c.relname,p.polname")).rows
  const parameters=(await db.query('SELECT parname,paracl::text AS acl FROM pg_parameter_acl ORDER BY parname')).rows
 return sha(JSON.stringify({roles:roles.filter(r=>!pairNames.includes(r.name)),memberships:memberships.filter(r=>!pairNames.includes(r.child)&&!pairNames.includes(r.parent)),databases:databases.filter(r=>!pairNames.includes(r.grantee)&&!pairNames.includes(r.grantor)),objects,defaults,policies,parameters}))
}

export function checkComplete069PlanWorkflowRoleInventory(snapshotRoles,rows,{pairPresent=false}={}){
 const byName=new Map(rows.map(r=>[r.name,r])),logins=[...original,...auxiliary,...complete069PlanWorkflowAbi.map(a=>({...a,groups:[a.group],connection_limit:3}))],allowed=new Set([...snapshotRoles,...logins.map(a=>a.login)])
 if(byName.size!==rows.length||snapshotRoles.some(n=>!byName.has(n))||rows.some(r=>!allowed.has(r.name)||r.safe!==true||typeof r.login!=='boolean'))fail('role_catalog_refused')
 for(const row of rows){const definition=logins.find(a=>a.login===row.name),limit=definition?definition.connection_limit:-1
  if(row.connection_limit!==limit||(definition?(!row.login||typeof row.verifier!=='string'||!row.verifier.startsWith('SCRAM-SHA-256$')):row.login||row.verifier!==null))fail('role_state_refused')
 }
 if(original.some(a=>byName.get(a.login)?.login!==true))fail('original_seven_preparation_required')
 if(auxiliary.some(a=>byName.get(a.login)?.login!==true))fail('exact_auxiliary_predecessors_required')
 if(pairNames.some(n=>byName.has(n)!==pairPresent))fail('existing_or_partial_pair_refused')
 return{byName,logins}
}
export async function complete069PlanWorkflowCatalog(db,snapshot,{pairPresent=false}={}){
 const global=(await db.query("SELECT rolname AS name FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname")).rows,expectedNames=[...new Set(['postgres',...snapshot.roles,...original.map(a=>a.login),...auxiliary.map(a=>a.login),...(pairPresent?pairNames:[])])].sort()
 if(JSON.stringify(global.map(r=>r.name))!==JSON.stringify(expectedNames))fail('global_role_inventory_refused')
 const rows=(await db.query("SELECT r.rolname AS name,r.rolcanlogin AS login,r.rolconnlimit AS connection_limit,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe,a.rolpassword AS verifier FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname LIKE 'agentstudio_%' ORDER BY r.rolname")).rows
 const{byName,logins}=checkComplete069PlanWorkflowRoleInventory(snapshot.roles,rows,{pairPresent})
 const expected=[]
 for(const definition of logins)if(byName.has(definition.login)){for(const group of definition.groups)expected.push(definition.login+':'+group);await directLoginPrivileges(db,definition.login)
  const closure=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1) AND deptype='o') AND NOT EXISTS(SELECT 1 FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname=$1)) AND NOT EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname=$1)) AND EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='CONNECT' AND NOT a.is_grantable) AS ok",[definition.login])).rows[0]
  if(closure?.ok!==true)fail('role_closure_refused')
  const future=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)) AND NOT EXISTS(SELECT 1 FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS ok",[definition.login])).rows[0]
  if(future?.ok!==true)fail('future_privileges_refused')
 }
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid WHERE c.rolname LIKE 'agentstudio_%' OR p.rolname LIKE 'agentstudio_%' ORDER BY c.rolname,p.rolname")).rows
 if(memberships.some(r=>r.safe!==true)||JSON.stringify(memberships.map(r=>r.child+':'+r.parent))!==JSON.stringify(expected.sort()))fail('role_membership_refused')
 const hba=(await db.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows
 for(const definition of original){const proof=verifyPg18ServiceHbaOrder(hba,definition.login);if(!proof.local||!proof.tcp)fail('original_hba_refused')}
 for(const a of complete069PlanWorkflowAbi)if(inspectComplete069PlanWorkflowHba(hba,a.login).safe!==true)fail('hba_refused')
 for(const a of auxiliary)if(byName.has(a.login)&&inspectAuxiliaryHba(hba,a.login).safe!==true)fail('auxiliary_hba_refused')
 return byName
}
