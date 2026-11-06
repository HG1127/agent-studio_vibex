import type {IncomingMessage} from 'node:http'
import type {Identity} from './contracts.ts'
import {HttpError} from './contracts.ts'
import {verifyNativeOrigin,nativeSessionToken} from './native-auth-http.mjs'
import {optionalExpectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
export const originalPluginMarketProtocol='native_original_plugin_market_v1' as const
/** Called only after actual authentication and global business policy. Binding
 * supplies an owner precondition; it never replaces identity or authorizes a write. */
export function originalPluginRepositoryForRequest<T extends {forOriginalEmployee(expected:string):T}>(repo:T,req:IncomingMessage,identity:Identity,origin:string,nativeAuthenticator:boolean):T{
 const marker=req.headers['x-agentstudio-original-plugins'];if(marker===undefined)return repo
 const raw=req.rawHeaders??[];if(marker!==originalPluginMarketProtocol||!Array.isArray(raw)||raw.length%2!==0||raw.filter((name,i)=>i%2===0&&typeof name==='string'&&name.toLowerCase()==='x-agentstudio-original-plugins').length!==1)throw new HttpError(400,'original_plugin_protocol_header_refused')
 if(!nativeAuthenticator||identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
 verifyNativeOrigin(req,origin,req.method!=='GET')
 if(!nativeSessionToken(req)||['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(key=>req.headers[key]!==undefined))throw new HttpError(401,'session_required')
 const expected=optionalExpectedOriginalUiEmployee(req);if(expected===undefined)throw new HttpError(400,'invalid_original_ui_employee_precondition')
 return repo.forOriginalEmployee(expected)
}
