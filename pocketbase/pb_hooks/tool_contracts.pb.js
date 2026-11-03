// Employee-configured validation contracts never grant external execution rights.
routerAdd("GET","/api/tool-connections/{id}/contract",function(e){
  try{
    var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
    if(!user)return e.json(401,{error:"studio_login_required"})
    var row=$app.findRecordById("tool_connections",String(e.request.pathValue("id")))
    if(row.getString("rh_user_id")!==String(user.id))return e.json(404,{error:"tool_not_found"})
    return e.json(200,{contract:JSON.parse(row.getString("contract")||"null")})
  }catch(err){return e.json(err.httpStatus||404,{error:err.code||"tool_not_found"})}
})

routerAdd("PUT","/api/tool-connections/{id}/contract",function(e){
  try{
    var user=require(__hooks+"/modules/studio_auth_helpers.js").currentUser(e)
    if(!user)return e.json(401,{error:"studio_login_required"})
    var row=$app.findRecordById("tool_connections",String(e.request.pathValue("id")))
    if(row.getString("rh_user_id")!==String(user.id))return e.json(404,{error:"tool_not_found"})
    var body=(e.requestInfo()||{}).body||{},service=require(__hooks+"/modules/tool_contracts.js")
    require(__hooks+"/modules/business_schemas.js").object(body,["input_schema","output_schema","max_input_chars","max_output_chars"])
    if(body.input_schema===undefined)return e.json(400,{error:"input_schema_required"})
    var contract=service.external(body.input_schema,body.output_schema)
    if(body.max_input_chars!==undefined){if(!Number.isInteger(body.max_input_chars)||body.max_input_chars<1||body.max_input_chars>65536)return e.json(400,{error:"invalid_contract_limit"});contract.max_input_chars=body.max_input_chars}
    if(body.max_output_chars!==undefined){if(!Number.isInteger(body.max_output_chars)||body.max_output_chars<1||body.max_output_chars>4194304)return e.json(400,{error:"invalid_contract_limit"});contract.max_output_chars=body.max_output_chars}
    contract.capability_version=$security.sha256(service.canonical(contract))
    row.set("contract",contract)
    // A changed contract must be tested again and invalidates pending approvals.
    row.set("status","untested");row.set("last_checked_at","");row.set("last_error","")
    $app.save(row)
    return e.json(200,{contract:contract,retest_required:true})
  }catch(err){return e.json(err.httpStatus||400,{error:err.code||"contract_save_failed"})}
})
