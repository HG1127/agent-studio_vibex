import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
import {createKnowledgeMutationSession} from "../src/lib/pgNativeKnowledgeSharing.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),base=randomUUID(),request=randomUUID(),document=randomUUID(),hash="a".repeat(64)
const receipt={request_id:request,action:"import",document_id:document,filename:"notes.txt",sha256:hash,chunk_count:1}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}}
test("sharing client sends same-origin Cookie operations and query text only in POST bodies; malformed IDs cannot become routes",async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,options)=>{calls.push({url,options});return Response.json({items:[],item:receipt})},"")
  await api.listSharedKnowledge();await api.searchSharedKnowledge(base,"private cedar")
  await api.importSharedKnowledge(base,{request_id:request,filename:"notes.txt",text:"private content"})
  await api.getKnowledgeContentReceipt(base,request)
  for(const call of calls){assert.equal(call.options.credentials,"same-origin");assert.equal(call.options.redirect,"error");assert.equal(new Headers(call.options.headers).has("Authorization"),false);assert.equal(call.url.includes("private cedar"),false)}
  await assert.rejects(api.getSharedKnowledge("https://foreign.example/"),error=>error.status===400)
  await assert.rejects(api.getKnowledgeContentReceipt(base,"../../escape"),error=>error.status===400)
  const bad=createPgNativePilotApi(async()=>Response.json({mode:"native_pg18",config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false,knowledge_sharing_enabled:true}),"")
  await assert.rejects(bad.getConfigCapabilities(),error=>error.status===503)
})
test("lost content response freezes original payload; wrong or missing receipts cannot confirm and explicit retry uses exactly the original request",async()=>{
  const writes=[],state={response:null},api={
    async importSharedKnowledge(id,input){writes.push(structuredClone(input));if(writes.length===1)throw new PgNativePilotError(0,"network_error");return {item:receipt,replayed:true}},
    async getKnowledgeContentReceipt(){return state.response},
  },session=createKnowledgeMutationSession(api),input={request_id:request,filename:"notes.txt",text:"PRIVATE_TEXT_DO_NOT_SNAPSHOT"}
  await assert.rejects(session.start("import",base,input))
  input.text="changed after submission"
  assert.equal(JSON.stringify(session.snapshot()).includes("PRIVATE_TEXT"),false)
  assert.equal((await session.recover()).confirmed,false);assert.ok(session.snapshot().pending)
  state.response={...receipt,request_id:randomUUID()};await assert.rejects(session.recover(),/invalid_knowledge_mutation_receipt/)
  assert.ok(session.snapshot().pending)
  assert.equal((await session.retry()).confirmed,true)
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].text,"PRIVATE_TEXT_DO_NOT_SNAPSHOT")
  assert.equal(session.snapshot().pending,null)
})
test("late mutation responses and owner logout cannot repopulate a new session; stale access receipts do not authorize another recipient",async()=>{
  const gate=deferred(),session=createKnowledgeMutationSession({importSharedKnowledge:async()=>gate.promise})
  const pending=session.start("import",base,{request_id:request,filename:"notes.txt",text:"private"});session.reset();gate.resolve({item:receipt,replayed:false})
  assert.equal((await pending).stale,true);assert.equal(session.snapshot().pending,null)
  const target=randomUUID(),r={request_id:request,base_id:base,recipient_id:randomUUID(),role:"viewer",semantic_allowed:false,revoked:false,revision:2}
  const access=createKnowledgeMutationSession({async changeKnowledgeAccess(){throw new PgNativePilotError(503,"unknown")},async getKnowledgeAccessReceipt(){return r}})
  await assert.rejects(access.start("access",base,{request_id:request,action:"grant_existing",recipient_id:target,role:"viewer",semantic_allowed:false,expected_revision:1}))
  await assert.rejects(access.recover(),/invalid_knowledge_mutation_receipt/);assert.ok(access.snapshot().pending)
})
test("sharing panel SSR escapes employee-supplied names, performs no reads while hidden, and exposes accessible controls",async()=>{
  const vite=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/knowledge-sharing-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const {default:Panel,SharedKnowledgeSearchHits}=await vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeKnowledgeSharingPanel.tsx")
    let reads=0
    const html=renderToStaticMarkup(createElement(Panel,{api:{async listSharedKnowledge(){reads++;return []}},bases:[{id:base,name:"<script>foreign()</script>"}],enabled:false,active:false,onExpired(){}}))
    assert.equal(reads,0);assert.equal(html.includes("<script>foreign()"),false);assert.ok(html.includes("&lt;script&gt;"));assert.ok(html.includes("选择知识库"));assert.ok(html.includes("disabled"));assert.ok(html.includes("共享语义检索和 Agent 绑定"))
    const hits=renderToStaticMarkup(createElement(SharedKnowledgeSearchHits,{hits:[{document_id:document,chunk_index:0,citation:"<img src=foreign>",snippet:"<script>foreign()</script>"}]}))
    assert.equal(hits.includes("<img"),false);assert.equal(hits.includes("<script"),false);assert.ok(hits.includes("&lt;script&gt;"))
  }finally{await vite.close()}
})
