// Authenticated employee UI and authenticated device endpoints, separate from Agent tools.
onBootstrap(function(e){
  e.next()
  $app.db().newQuery('CREATE TABLE IF NOT EXISTS studio_local_control_state (device_id TEXT PRIMARY KEY,owner TEXT NOT NULL,info TEXT NOT NULL,seen_ms INTEGER NOT NULL)').execute()
})
routerAdd('GET','/api/local-devices/{id}/permissions',function(e){
  var user=require(__hooks+'/modules/studio_auth_helpers.js').currentUser(e)
  if(!user)return e.json(401,{error:'studio_login_required'})
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').getState($app,e.request.pathValue('id'),user.id))}catch(_){return e.json(404,{error:'device_not_found'})}
})
routerAdd('POST','/api/local-devices/{id}/controls',function(e){
  var user=require(__hooks+'/modules/studio_auth_helpers.js').currentUser(e)
  if(!user)return e.json(401,{error:'studio_login_required'})
  try{return e.json(201,require(__hooks+'/modules/workbench_controls.js').enqueue($app,user.id,e.request.pathValue('id'),e.requestInfo().body||{}))}catch(err){return e.json(409,{error:String(err.message||'invalid_control_request')})}
})
routerAdd('GET','/api/local-controls/{id}',function(e){
  var user=require(__hooks+'/modules/studio_auth_helpers.js').currentUser(e)
  if(!user)return e.json(401,{error:'studio_login_required'})
  try{var m=require(__hooks+'/modules/workbench_controls.js');m.expire($app);var r=m.row($app,e.request.pathValue('id'),user.id);require(__hooks+'/modules/local_devices.js').device($app,r.device_id,user.id);return e.json(200,m.publicRow(r))}catch(_){return e.json(404,{error:'control_not_found'})}
})
routerAdd('POST','/api/local-controls/{id}/cancel',function(e){
  var user=require(__hooks+'/modules/studio_auth_helpers.js').currentUser(e)
  if(!user)return e.json(401,{error:'studio_login_required'})
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').cancel($app,user.id,e.request.pathValue('id')))}catch(err){return e.json(409,{error:String(err.message||'control_not_found')})}
})
routerAdd('POST','/api/public/local-executor/control-poll',function(e){
  var d;try{d=require(__hooks+'/modules/local_devices.js').authenticate($app,e)}catch(_){return e.json(401,{error:'device_unauthorized'})}
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').poll($app,d,e.requestInfo().body||{}))}catch(err){return e.json(409,{error:String(err.message||'invalid_control_request')})}
})
routerAdd('POST','/api/public/local-executor/control-check',function(e){
  var d;try{d=require(__hooks+'/modules/local_devices.js').authenticate($app,e)}catch(_){return e.json(401,{error:'device_unauthorized'})}
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').check($app,d,e.requestInfo().body||{}))}catch(_){return e.json(409,{error:'control_claim_denied'})}
})
routerAdd('POST','/api/public/local-executor/control-commit',function(e){
  var d;try{d=require(__hooks+'/modules/local_devices.js').authenticate($app,e)}catch(_){return e.json(401,{error:'device_unauthorized'})}
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').commit($app,d,e.requestInfo().body||{}))}catch(err){return e.json(409,{error:String(err.message||'control_claim_denied')})}
})
routerAdd('POST','/api/public/local-executor/control-complete',function(e){
  var d;try{d=require(__hooks+'/modules/local_devices.js').authenticate($app,e)}catch(_){return e.json(401,{error:'device_unauthorized'})}
  try{return e.json(200,require(__hooks+'/modules/workbench_controls.js').complete($app,d,e.requestInfo().body||{}))}catch(_){return e.json(409,{error:'control_no_longer_active'})}
})
