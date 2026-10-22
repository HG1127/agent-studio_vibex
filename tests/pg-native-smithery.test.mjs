import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
import {createPgNativeSmitherySession} from "../src/lib/pgNativeSmitherySession.ts"
import {parsePgSmitheryConnection,parsePgSmitheryKey} from "../src/lib/pgNativeSmithery.ts"
import {smitheryRemoteId} from "../services/pg-api/src/smithery-contracts.ts"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),id="11111111-1111-4111-8111-111111111111",secret="SyntheticSmitheryPrivateKeyNeverNetwork12345"
const keyRow={has_key:true,revision:1,tail:"2345",last_request_id:"22222222-2222-4222-8222-222222222222"}
const selection={namespace:"own",server:"vendor/lookup",name:"Own MCP",description:"Synthetic evidence"}
const row={id,namespace:"own",remote_connection_id:smitheryRemoteId(id),server:"vendor/lookup",name:"Own MCP",description:"Synthetic",state:"connected",revoke_requested:false,
  setup_url:"",missing:[],last_error:"",revision:2,operation_in_flight:false,mcp_revision:2,enabled:true,mcp_status:"untested"}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
function apiStub(patch={}){return {async getSmitheryKey(){return keyRow},async listSmitheryConnections(){return [row]},async readSmitheryNamespaces(){return ["own"]},
  async searchSmitheryCatalog(_query,page){return {items:[{server:"vendor/lookup",name:"Lookup",description:"Synthetic",verified:false,deployed:true}],page,next_page:0}},...patch}}

test("Smithery client uses validated same-origin Cookie routes and drops credential/URL extensions from DTOs",async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,options)=>{calls.push({url,options});return Response.json({item:url.includes("/key")?{...keyRow,api_key:secret}:{...row,binding_proof:secret}})},"")
  assert.equal((await api.saveSmitheryKey(secret,0,id)).tail,"2345")
  await api.connectSmithery(selection,id);await api.operateSmithery(id,2,"refresh")
  for(const call of calls){assert.equal(call.options.credentials,"same-origin");assert.equal(call.options.redirect,"error");assert.equal(call.options.headers["X-AgentStudio-Request"],"1");assert.equal(call.url.includes(secret),false)}
  const before=calls.length
  assert.throws(()=>api.connectSmithery({...selection,url:"https://evil.example"},id),error=>error.status===400)
  assert.throws(()=>api.saveSmitheryKey("bad\nkey",0,id),error=>error.status===400)
  assert.equal(calls.length,before)
  assert.equal(JSON.stringify(parsePgSmitheryKey({...keyRow,api_key:secret})).includes(secret),false)
  assert.equal(JSON.stringify(parsePgSmitheryConnection({...row,headers:[{key:"authorization",value:secret}]})).includes(secret),false)
  assert.throws(()=>parsePgSmitheryConnection({...row,remote_connection_id:"foreign"}))
  assert.throws(()=>parsePgSmitheryConnection({...row,setup_url:"https://evil.example/oauth"}))
})

test("uncertain Smithery key saves keep the exact original request privately, block other changes and reconcile receipts",async()=>{
  const writes=[];let current=keyRow
  const api=apiStub({async getSmitheryKey(){return current},async saveSmitheryKey(key,expected,request){writes.push({key,expected,request})
    if(writes.length===1)throw TypeError("response lost");return current={has_key:true,revision:2,tail:key.slice(-4),last_request_id:request}}})
  const session=createPgNativeSmitherySession(api,{key:()=>id});session.setActive(true);await session.load()
  await session.saveKey(secret);assert.equal(session.snapshot().pending.kind,"key_save");assert.equal(JSON.stringify(session.snapshot()).includes(secret),false)
  await session.removeKey();await session.connect(selection);assert.equal(writes.length,1)
  session.setActive(false);session.setActive(true);await session.reconcile();assert.equal(session.snapshot().canRetry,true)
  await session.retry();assert.deepEqual(writes[0],writes[1]);assert.equal(session.snapshot().pending,null);assert.equal(session.snapshot().key.revision,2)
  session.dispose();assert.equal(JSON.stringify(session.snapshot()).includes(secret),false)
})

test("lost Smithery create responses reconcile by the same local UUID and never create a second remote connection",async()=>{
  let writes=0,reads=0
  const session=createPgNativeSmitherySession(apiStub({async connectSmithery(){writes++;throw TypeError("response lost")},async getSmitheryConnection(value){reads++;assert.equal(value,id);return row}}),{key:()=>id})
  session.setActive(true);await session.load();await session.namespaces();await session.connect(selection)
  assert.equal(session.snapshot().pending.kind,"connect");await session.connect({...selection,name:"Changed"});assert.equal(writes,1)
  await session.reconcile();assert.equal(reads,1);assert.equal(session.snapshot().pending,null);assert.equal(writes,1)
  session.dispose()
})

test("a stuck Smithery mutation can only recover with an explicit remote refresh, and hidden/disposed reads cannot refill a session",async()=>{
  const actions=[],session=createPgNativeSmitherySession(apiStub({async operateSmithery(_id,_revision,action){actions.push(action);if(actions.length===1)throw TypeError("response lost")
    return {...row,state:"revoked",revoke_requested:true,enabled:false,revision:4}},async getSmitheryConnection(){return {...row,state:"revoking",enabled:false,revoke_requested:true,revision:3,operation_in_flight:true}}}))
  session.setActive(true);await session.load();await session.operate(id,"revoke");await session.reconcile()
  assert.equal(session.snapshot().canRecoverRemote,true);await session.recoverRemote();assert.deepEqual(actions,["revoke","refresh"]);assert.equal(session.snapshot().connections[0].state,"revoked")
  const gate=deferred(),late=createPgNativeSmitherySession(apiStub({getSmitheryKey:()=>gate.promise}))
  late.setActive(true);const read=late.load();late.setActive(false);late.setActive(true);gate.resolve(keyRow);await read;assert.equal(late.snapshot().key,null)
  late.dispose();session.dispose()
  let expired=0;const rejected=createPgNativeSmitherySession(apiStub({async getSmitheryKey(){throw new PgNativePilotError(401,"session_required")}}),{onExpired:()=>expired++})
  rejected.setActive(true);await rejected.load();assert.equal(expired,1);assert.equal(rejected.snapshot().key,null);rejected.dispose()
})

test("Smithery UI escapes vendor text, gates setup links and starts with no automatic reads or consent",async()=>{
  const vite=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/smithery-ssr-cache"),
    resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const {default:Panel,SmitheryConnectionCard}=await vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeSmitheryPanel.tsx"),noop=()=>{},untrusted={...row,name:"<script>untrusted</script>",state:"auth_required",enabled:false,setup_url:"https://auth.smithery.ai/setup?state=opaque"}
    const card=renderToStaticMarkup(createElement(SmitheryConnectionCard,{row:untrusted,enabled:true,onAction:noop}))
    assert.match(card,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert.equal(card.includes("<script>"),false);assert.match(card,/rel="noopener noreferrer"/);assert.match(card,/referrerPolicy="no-referrer"/i)
    const disabled=renderToStaticMarkup(createElement(SmitheryConnectionCard,{row:untrusted,enabled:false,onAction:noop}));assert.equal(disabled.includes("href="),false)
    const malicious=renderToStaticMarkup(createElement(SmitheryConnectionCard,{row:{...untrusted,setup_url:"https://evil.example/oauth"},enabled:true,onAction:noop}));assert.equal(malicious.includes("evil.example"),false)
    const panel=renderToStaticMarkup(createElement(Panel,{api:{},active:true,enabled:false,onExpired:noop}))
    assert.match(panel,/当前环境未开放 Smithery 管理/);assert.match(panel,/<button[^>]*disabled=""[^>]*>读取本人 Smithery 配置<\/button>/)
  }finally{await vite.close()}
})
