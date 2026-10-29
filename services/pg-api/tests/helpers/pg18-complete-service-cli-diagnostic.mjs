// Closed projection only. Never serialize stdout, stderr, arguments, target
// identifiers, operation IDs, employee profile, SQL or credential values.
const actions=new Set(['api','native-auth','first-admin','worker','identity','broker','index-worker','index-broker'])
const own=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value??{},key);return d&&'value'in d?d.value:undefined}
const code=value=>typeof value==='string'&&/^complete_service_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(value)?value:null
export function completeServiceActualCliDiagnostic(file,args,result){
 const action=Array.isArray(args)&&args[3]==='--action'&&actions.has(args[4])?args[4]:null
 const phase=file==='baota-pg18-complete-init.mjs'?'schema_install':file==='pg18-complete-service-cli.mjs'&&action?action:'unknown'
 const value=own(result,'value'),exit=own(result,'code')
 return {event:'complete069_service_actual_cli_result',phase,exit:Number.isSafeInteger(exit)&&exit>=0&&exit<=255?exit:null,refusal:code(own(result,'refusal')),reported_refusal:code(own(value,'refusal_code')),verified:own(value,'verified')===true,commit_acknowledged:own(value,'commit_acknowledged')===true,actual_login_verified:own(value,'actual_login_verified')===true,actual_api_catalog_verified:own(value,'actual_api_catalog_verified')===true,first_admin_verified:own(value,'first_admin_verified')===true,output_deliberately_discarded:own(result,'output_deliberately_discarded')===true,production_GO:false}
}
