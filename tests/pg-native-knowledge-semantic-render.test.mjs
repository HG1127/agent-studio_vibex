import test from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),id="11111111-1111-4111-8111-111111111111"
test("semantic forms render inactive without reads, default to free keyword mode and escape untrusted labels and citations",async()=>{
  const vite=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/knowledge-semantic-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const [{default:Embedding,KnowledgeIndexProgress},{default:Query,KnowledgeSemanticResults}]=await Promise.all([
      vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeKnowledgeEmbeddingPanel.tsx"),vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeKnowledgeQueryPanel.tsx")])
    let reads=0;const api=new Proxy({},{get(){return async()=>{reads++;return null}}}),base={id,name:"<script>foreign()</script>"},noop=()=>{}
    const embedding=renderToStaticMarkup(createElement(Embedding,{api,models:[],bases:[base],active:false,enabled:false,capabilities:{settings:true,consent:true,index:true,query:true},onChanged:noop,onExpired:noop}))
    const query=renderToStaticMarkup(createElement(Query,{api,bases:[base],active:false,enabled:false,queryAllowed:true,settingsVersion:0,onExpired:noop}))
    assert.equal(reads,0);assert.match(query,/<option value="lexical" selected="">关键词（免费）/)
    assert.match(query,/<fieldset disabled=""/);assert.match(embedding,/<fieldset disabled=""/)
    assert.match(embedding,/本人全部待索引内容及后续新增内容/)
    assert.match(query,/&lt;script&gt;foreign\(\)&lt;\/script&gt;/);assert.doesNotMatch(query,/<script>/)
    const hits=renderToStaticMarkup(createElement(KnowledgeSemanticResults,{result:{retrieval:"semantic",items:[{base_id:id,chunk_id:id,citation:"<img src=foreign>",text:"<script>foreign()</script>"}],semantic_status:"partial",semantic_indexed:1,semantic_total:2,candidate_limit_reached:true}}))
    assert.doesNotMatch(hits,/<script>|<img /);assert.match(hits,/&lt;img/);assert.match(hits,/候选范围上限/)
    const status=renderToStaticMarkup(createElement(KnowledgeIndexProgress,{value:{index_authorized:true,indexed:1,total:2,pending:1,active_attempts:0,unknown_attempts:1,dimensions:3072}}))
    assert.match(status,/不会自动重发/);assert.match(status,/可能重复产生提供商费用/)
  }finally{await vite.close()}
})
