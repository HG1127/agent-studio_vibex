// Pure classification only. Never load a driver or mint a capability.
import test from 'node:test'
import assert from 'node:assert/strict'
import {isCompleteProfileFirstAdminDriverRequest as classify,isCompleteProfileInitializerDriverRequest as original,loadCompleteProfileOperatorPg as load} from '../src/pg18-complete-operator-runtime.mjs'
test('original whole first-admin pg import is separately classified; original initializer policy is unchanged',()=>{
 const from='services/pg-api/src/native-first-admin-cli.mjs'
 assert.equal(classify(from,'pg',['node','import','module-sync','node-addons']),true)
 assert.equal(original(from,'pg',['import']),false)
 for(const [f,s,c]of [[from+'?x','pg',['import']],[from,'pg/lib/index.js',['import']],[from,'pg/esm/index.mjs',['import']],[from,'pg',['require']],[from,'pg',['import','require']],[from,'pg',['import','foreign']],[from,'pg',null],['services/pg-api/src/pg18-complete-service-cli.mjs','pg',['import']],['file:///'+from,'pg',['import']]])assert.equal(classify(f,s,c),false)
 for(const v of [{},Object.freeze({}),{Pool:class{}}])assert.throws(()=>load(v),/complete069_runtime_refused/)
})
