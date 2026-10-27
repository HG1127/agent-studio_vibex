// Fixed service accounts. Authentication's initial login has its own CLI.
const definitions={
  api:{login:"agentstudio_stage_login",groups:["agentstudio_api"]},
  worker:{login:"agentstudio_stage_worker",groups:["agentstudio_api","agentstudio_worker"]},
  identity:{login:"agentstudio_bound_dispatch_login",groups:["agentstudio_bound_dispatch"]},
  broker:{login:"agentstudio_model_broker_login",groups:["agentstudio_model_broker"]},
  "index-worker":{login:"agentstudio_knowledge_index_worker_login",groups:["agentstudio_knowledge_index_worker"]},
  "index-broker":{login:"agentstudio_knowledge_index_broker_login",groups:["agentstudio_knowledge_index_broker"]},
}
export const serviceLoginKinds=Object.freeze(Object.keys(definitions))
export const serviceLogins=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([kind,value])=>[kind,Object.freeze({kind,...value,groups:Object.freeze(value.groups)})])))
export function serviceLoginDefinition(kind){if(!Object.hasOwn(serviceLogins,kind))throw Error("invalid_service_login_kind");return serviceLogins[kind]}
export function serviceLoginReceiptVersion(kind){serviceLoginDefinition(kind);return "pg18_service_login_"+kind.replaceAll("-","_")+"_001"}
export function checkedServiceLoginReceipt(version,description,sourceSha){
  const kind=serviceLoginKinds.find(k=>serviceLoginReceiptVersion(k)===version)
  if(!kind)throw Error("invalid_service_login_receipt")
  let body;try{body=JSON.parse(description)}catch{throw Error("invalid_service_login_receipt")}
  const expected=serviceLogins[kind],keys=["format","kind","login","groups","source_sha256","operator","activated_at"]
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==keys.length||keys.some(k=>!Object.hasOwn(body,k))||
    body.format!=="pg18_service_login_activation_v1"||body.kind!==kind||body.login!==expected.login||JSON.stringify(body.groups)!==JSON.stringify(expected.groups)||
    body.source_sha256!==sourceSha||body.operator!=="postgres"||typeof body.activated_at!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.activated_at)||
    !Number.isFinite(Date.parse(body.activated_at))||new Date(body.activated_at).toISOString()!==body.activated_at)throw Error("invalid_service_login_receipt")
  return Object.freeze(body)
}
export const serviceLoginTargetGuardSql=`DO $service_target$ BEGIN
  IF current_database() <> 'agent_studio' OR current_setting('port')::integer <> 5333 OR session_user <> 'postgres' OR
    host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR
    current_user <> session_user OR current_setting('server_version_num')::int < 180000 OR current_setting('server_version_num')::int >= 190000 OR
    pg_is_in_recovery() OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) OR
    (SELECT extversion FROM pg_extension WHERE extname='vector') IS DISTINCT FROM '0.8.7' THEN
    RAISE EXCEPTION 'service_login_target_not_approved';
  END IF;
END $service_target$;`
