import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {prepareOriginalRolePool,originalRoleProfileEnabled} from './original-role-profile.ts'
const pools=new WeakSet<SqlPool>(),clients=new WeakSet<SqlClient>()
export function selectOriginalRoleUi(env:NodeJS.ProcessEnv){
 const enabled=env.AGENT_STUDIO_ORIGINAL_ROLES_UI_ENABLED,approved=env.AGENT_STUDIO_ORIGINAL_ROLES_UI_APPROVED
 if(enabled===undefined&&approved===undefined)return false
 if(enabled!=='true'||approved!=='APPROVE_DISPOSABLE_ORIGINAL_ROLES_UI_V3_ONLY')throw Error('original_role_ui_not_approved')
 return true
}
export async function prepareOriginalRoleUiPool(pool:SqlPool,env:NodeJS.ProcessEnv){
 if(!selectOriginalRoleUi(env))return null
 const proof=await prepareOriginalRolePool(pool,env)
 if(!proof)throw Error('original_role_ui_requires_role_profile')
 pools.add(pool);return Object.freeze({...proof,ui_protocol:'original-role-ui.v3'})
}
/** Register the FINAL wrapper used by actual API/Worker/Broker transactions. */
export async function prepareOriginalRoleExecutionPool(pool:SqlPool,env:NodeJS.ProcessEnv){
 return selectOriginalRoleUi(env)?prepareOriginalRoleUiPool(pool,env):prepareOriginalRolePool(pool,env)
}
export function applyOriginalRoleUiScope(db:SqlClient,pool:SqlPool){
 clients.delete(db)
 if(pools.has(pool)){if(!originalRoleProfileEnabled(db))throw Error('original_role_ui_requires_fresh_role_audit');clients.add(db)}
}
export const originalRoleUiEnabled=(db:SqlClient)=>clients.has(db)&&originalRoleProfileEnabled(db)
export function requireOriginalRoleUi(db:SqlClient){if(!originalRoleUiEnabled(db))throw new HttpError(409,'original_role_ui_profile_required')}
