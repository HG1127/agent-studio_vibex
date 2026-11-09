import ts from 'typescript'
import {createHash} from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const createSource=readFileSync(new URL('./helpers/pg-original-agent-create-backend-fixture.mjs',import.meta.url),'utf8')
const pluginSource=readFileSync(new URL('./pg-original-plugin-market-genuine.spec.mjs',import.meta.url),'utf8')
const nativeLine=createSource.split('\n').find(line=>line.includes('const native=nativeModule.createNativeAuthHttpHandler('))
assert(nativeLine?.endsWith('}})'))
const marker='businessHandler:async(req,res)=>{'
assert.equal(nativeLine.split(marker).length,2)
const nativeBody=nativeLine.slice(nativeLine.indexOf(marker)+marker.length,-3)
const loginStart='  const login = async (who, p) => {'
const loginEnd='\n  const connectionSection ='
assert.equal(pluginSource.split(loginStart).length,2)
const loginText=pluginSource.slice(pluginSource.indexOf(loginStart),pluginSource.indexOf(loginEnd))
assert(loginText.endsWith('  };'))
const employee='10000000-0000-4000-8000-000000000001'

for(const selected of ['home','catalog','monitor'])test('original create '+selected+' uses its own verified optional handler before generic Native fallback',async()=>{
 const calls=[],path='/api/v2/original-ui/'+({home:'agent-specs',catalog:'agent-catalog',monitor:'monitor-inbox'})[selected]
 const handler=vm.runInNewContext('(async(req,res)=>{'+nativeBody+'})',{
  URL,allowedOrigin:'https://localhost:17443',capabilities:{},
  policy:{permitNativePg18BusinessUatRequest(){calls.push('generic-policy');return false}},
  home:async()=>{calls.push('home');return selected==='home'},
  catalog:async()=>{calls.push('catalog');return selected==='catalog'},
  monitor:async()=>{calls.push('monitor');return selected==='monitor'},
  business:async()=>{calls.push('business')},
 })
 await handler({url:path,method:'GET'},{writeHead(){calls.push('denied')},end(){}})
 assert.deepEqual(calls,{home:['home'],catalog:['home','catalog'],monitor:['home','catalog','monitor']}[selected])
})
for(const allowed of [false,true])test('original create unmapped request retains generic policy '+allowed,async()=>{
 const calls=[]
 const handler=vm.runInNewContext('(async(req,res)=>{'+nativeBody+'})',{
  URL,allowedOrigin:'https://localhost:17443',capabilities:{},
  policy:{permitNativePg18BusinessUatRequest(path,method){assert.equal(path,'/api/v2/agent-specs');assert.equal(method,'POST');calls.push('policy');return allowed}},
  home:async()=>{calls.push('home');return false},catalog:async()=>{calls.push('catalog');return false},monitor:async()=>{calls.push('monitor');return false},
  business:async()=>{calls.push('business')},
 })
 await handler({url:'/api/v2/agent-specs',method:'POST'},{writeHead(status){assert.equal(status,405);calls.push('denied')},end(body){assert.equal(JSON.parse(body).error,'pilot_business_writes_disabled')}})
 assert.deepEqual(calls,['home','catalog','monitor','policy',allowed?'business':'denied'])
})

function pluginLogin(profile={authenticated:true,user:{id:employee}},loginReply={authenticated:true,role:'employee'}){
 const calls=[],control={browserOrigin:'https://localhost:17443',url:'https://localhost:17443/plugin-market',credentials:{alice:{email:'synthetic@example.test',password:'synthetic-only'}},users:{alice:employee}}
 const locator={async fill(){},async click(){calls.push('click')}}
 const page={async goto(){},getByRole(){return locator},getByLabel(){return locator},locator(){return locator}}
 const expect=value=>({
  toBe(expected){assert.equal(value,expected)},
  async toHaveURL(expected){assert.equal(value,page);assert.equal(expected,control.url)},
  async toHaveCount(expected){assert.equal(value,locator);assert.equal(expected,1)},
  async toHaveText(pattern){assert.equal(pattern.test('插件市场'),true)},
  async toBeVisible(){assert.equal(value,locator)},
 })
 const login=vm.runInNewContext('(()=>{'+loginText+';return login})()',{
  f:control,expect,
  wire(p,path,method){assert.equal(p,page);calls.push(method+' '+path);return Promise.resolve(path==='/api/native-auth/login'?loginReply:profile)},
 })
 return {run:()=>login('alice',page),calls}
}
test('original PluginMarket login ACK is followed by actual Cookie profile identity',async()=>{
 const subject=pluginLogin();await subject.run()
 assert.deepEqual(subject.calls.slice(0,3),['POST /api/native-auth/login','GET /api/native-auth/me','click'])
})
test('original PluginMarket rejects a foreign Cookie profile',async()=>{
 const subject=pluginLogin({authenticated:true,user:{id:'10000000-0000-4000-8000-000000000002'}})
 await assert.rejects(subject.run())
})
test('original PluginMarket rejects a signed-out profile after login ACK',async()=>{
 const subject=pluginLogin({authenticated:false,user:null})
 await assert.rejects(subject.run())
})
test('original PluginMarket rejects a failed login ACK',async()=>{
 const subject=pluginLogin({authenticated:true,user:{id:employee}},{authenticated:false})
 await assert.rejects(subject.run())
})

const migrationRepairViewTests=["services/pg-api/tests/full069-native-realpath-source-pure.test.mjs","services/pg-api/tests/original-create-install-paths-and-legacy-bindings-source-pure.test.mjs","services/pg-api/tests/original-create-parent-sequence-source-pure.test.mjs","services/pg-api/tests/staff084-statistics-api-source-pure.test.mjs","services/pg-api/tests/original-statistics-selected-boundary-source-pure.test.mjs","tests/original-plugin-page-entry-pure.test.mjs","tests/original-create-knowledge-scope-source-pure.test.mjs","tests/original-legacy-source-views-pure.test.mjs"];
for(const file of migrationRepairViewTests)test('exact repair input view preserves old tests and refuses source drift: '+file,()=>{
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 assert.equal(ast.parseDiagnostics.length,0);
 const record=ast.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(ast)==='migrationRepairSourceRecords');
 const helper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='reviewedMigrationRepairInput');assert(record&&helper);
 const code='const '+record.getText(ast)+';'+helper.getText(ast)+';({run:reviewedMigrationRepairInput,rows:migrationRepairSourceRecords})';
 const subject=vm.runInNewContext(code,{assert,createHash},{timeout:1000}),sha=value=>createHash('sha256').update(value).digest('hex');
 for(const row of subject.rows){
  const current=readFileSync(new URL('../'+row.path,import.meta.url),'utf8'),prior=subject.run(row.path,current);
  assert.equal(sha(prior),row.parentSha256);assert.equal(subject.run(row.path,prior),prior);
  assert.throws(()=>subject.run(row.path,current+' '));assert.throws(()=>subject.run(row.path,' '+current));
 }
});
