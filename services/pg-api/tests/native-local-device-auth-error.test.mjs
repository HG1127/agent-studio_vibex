import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeLocalAuthenticationError as normalize} from '../src/native-local-device-auth-error.ts'
import {HttpError} from '../src/contracts.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {createNativeLocalDeviceHttp} from '../src/native-local-device-http.ts'
import {localDeviceRoute} from '../../../shared/native-local-device-contract.mjs'
test('only original own 401 session refusal is normalized; catalog/driver/foreign failures remain closed',()=>{
 const e=Object.assign(Error('session_required'),{status:401}),n=normalize(e);assert.ok(n instanceof HttpError);assert.equal(n.status,401);assert.equal(n.code,'session_required')
 for(const e of [Error('session_required'),Object.assign(Error('SQL or secret'),{status:401}),Object.assign(Error('session_required'),{status:403}),Object.assign(Error('unsafe_native_local_device_schema'),{status:503}),Object.create({status:401,message:'session_required'}),Object.defineProperty(Error('session_required'),'status',{get(){throw Error('must not read accessor')}}),null])assert.equal(normalize(e),e)
})
test('real original Native authenticator negative session result reaches device HTTP as 401, with no repository call',async()=>{
 let verified=0,called=0,response
 const unexpected=async()=>{throw Error('unused_auth_branch')}
 const auth={login:unexpected,getSessionProfile:unexpected,revokeSession:unexpected,provisionEmployee:unexpected,async verifySession(){verified++;return null}}
 const native=createNativeAuthHttpHandler({auth,allowedOrigin:'https://isolated.invalid',businessHandler:unexpected})
 const route=createNativeLocalDeviceHttp({repository:{async list(){called++;throw Error('must_not_read_private_data')}},executor:{},authenticateRequest:native.authenticateRequest,allowedOrigin:'https://isolated.invalid',allowWrites:true})
 const req={url:localDeviceRoute,method:'GET',headers:{origin:'https://isolated.invalid',cookie:'__Host-agentstudio_session='+'A'.repeat(43)},async *[Symbol.asyncIterator](){}}
 const res={writeHead(status,headers){response={status,headers}},end(body){response.body=JSON.parse(body)}}
 assert.equal(await route(req,res),true);assert.equal(verified,1);assert.equal(called,0);assert.equal(response.status,401);assert.deepEqual(response.body,{error:'session_required'})
})
