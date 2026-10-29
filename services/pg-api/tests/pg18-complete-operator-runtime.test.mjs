// Pure admission/metadata/cache regressions; no driver/DB/host authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {isCompleteProfileInitializerDriverRequest,assertCompleteProfileOperatorRuntimeEnvironment as environment,assertCompleteProfileOperatorRuntimeMetadata as metadata,assertCompleteProfileOperatorRuntimeInventory as inventory,assertCompleteProfileOperatorRuntimeCacheRecord as cache,assertCompleteProfileOperatorRuntime as verified,loadCompleteProfileOperatorPg as load,resolveCompleteProfileOperatorRuntimeModule as resolve} from '../src/pg18-complete-operator-runtime.mjs'
const original='services/pg-api/src/baota-pg18-fresh-init.mjs',refused=/complete065_runtime_refused/
test('only original initializer exact pg import is a driver request; classification never grants a capability',()=>{
 assert.equal(isCompleteProfileInitializerDriverRequest(original,'pg',['node','import','module-sync','node-addons']),true)
 for(const [from,specifier,conditions]of [[original,'pg',[]],[original,'pg',['require']],[original,'pg',['import','require']],[original,'pg',['import','foreign']],[original,'pg/lib/index.js',['import']],[original,'pg/esm/index.mjs',['import']],[original+'?x','pg',['import']],['services/pg-api/src/baota-pg18-complete-init.mjs','pg',['import']],['file:///'+original,'pg',['import']],[original,'pg',null]])assert.equal(isCompleteProfileInitializerDriverRequest(from,specifier,conditions),false)
 for(const fake of [{},Object.freeze({}),{Pool:class{}}]){assert.throws(()=>verified(fake),refused);assert.throws(()=>load(fake),refused)}
})
test('initializer exception cannot enable arbitrary import conditions in the locked package resolver',()=>{
 const manifest={files:[{path:'services/pg-api/node_modules/pg/lib/index.js'},{path:'services/pg-api/node_modules/pg/esm/index.mjs'}]}
 assert.deepEqual(resolve(manifest,'services/pg-api/node_modules/pg/lib/index.js','./index.js',['require']),{path:'services/pg-api/node_modules/pg/lib/index.js',format:'commonjs'})
 for(const [from,specifier,conditions]of [['services/pg-api/node_modules/pg/lib/index.js','./index.js',['import']],['services/pg-api/node_modules/pg/lib/index.js','../esm/index.mjs',['require']],['services/pg-api/node_modules/pg/lib/index.js','foreign',['require']],['services/pg-api/node_modules/pg/lib/index.js','../../private',['require']]])assert.throws(()=>resolve(manifest,from,specifier,conditions),refused)
})
test('new purpose retains original ambient configuration refusal and does not invoke accessors',()=>{
 assert.doesNotThrow(()=>environment({},['--experimental-strip-types']))
 for(const key of ['DATABASE_URL','PGHOST','NODE_PG_FORCE_NATIVE','LD_PRELOAD','NODE_COMPILE_CACHE','NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','OPENSSL_CONF'])assert.throws(()=>environment({[key]:'foreign'},[]),refused)
 assert.throws(()=>environment(Object.defineProperty({},'PGHOST',{enumerable:true,get(){throw Error('accessor must not run')}}),[]),refused)
 assert.throws(()=>environment({},['--import=foreign']),refused)
})
test('filesystem, inventory and cache binding guards stay strict for the new capability',()=>{
 const file={type:'file',symlink:false,uid:0,gid:0,mode:0o444,nlink:1,size:12}
 assert.doesNotThrow(()=>metadata(file,'code'))
 for(const patch of [{symlink:true},{uid:1},{gid:1},{mode:0o644},{nlink:2},{type:'directory'}])assert.throws(()=>metadata({...file,...patch},'code'),refused)
 assert.doesNotThrow(()=>inventory(['a','b'],['b','a']))
 for(const names of [['a'],['a','b','b'],['a','b','c']])assert.throws(()=>inventory(['a','b'],names),refused)
 const exports={},module={filename:'/actual',id:'/actual',loaded:true,exports}
 assert.doesNotThrow(()=>cache(module,'/actual',module,exports))
 assert.throws(()=>cache({...module},'/actual',module,exports),refused);assert.throws(()=>cache(module,'/actual',module,{}),refused)
})
