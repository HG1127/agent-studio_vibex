import test from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),id="11111111-1111-4111-8111-111111111111"
test("knowledge Tool controls are inert on render, escape evidence and show a separate unchecked fee confirmation in both task views",async()=>{
  const vite=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/knowledge-tool-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const [{default:Mode},{default:Agent},{default:Workflow},{AgentKnowledgeForm}]=await Promise.all([
      vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeKnowledgeToolMode.tsx"),vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx"),
      vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowRunDetail.tsx"),vite.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAgentKnowledgePanel.tsx")])
    const binding={mode:"hybrid",profile_id:id,profile_revision:2,consent_revision:3},noop=()=>{}
    let reads=0;const api=new Proxy({},{get(){return async()=>{reads++;throw Error("render_must_not_read")}}})
    const mode=renderToStaticMarkup(createElement(Mode,{context:null,hasBases:true,disabled:true,onChange:noop}))
    assert.match(mode,/<option value="keyword" selected="">/);assert.match(mode,/<option value="semantic" disabled="">/)
    const form=renderToStaticMarkup(createElement(AgentKnowledgeForm,{api,agent:{id,revision:2,spec:{knowledge_base_ids:[id],knowledge_retrieval:binding}},bases:[{id,name:"<script>foreign()</script>"}],active:false,enabled:false,onSaved:noop,onExpired:noop,onBusy:noop}))
    assert.match(form,/已保存的语义配置待核对/);assert.doesNotMatch(form,/<script>/)
    const pending={kind:"tool",node_id:"search",step_key:"wf2_00002_search",input_sha256:"a".repeat(64),input:'{"query":"<script>foreign()</script>"}',configuration:{title:"Search",tool:"knowledge_search",knowledge_base_ids:[id],knowledge_retrieval:binding},missing:[]}
    const detail={execution_mode:"workflow_native_v2",run:{id,workflow_id:id,agent_spec_id:id,status:"awaiting_approval",instruction:"Own task",checkpoint:{max_steps:3},step_count:0,result_text:""},steps:[],approvals:[],pending_effect:pending}
    const view={detail,busy:false,loading:false,pendingMutation:null,pendingSubmit:null,runs:[]}
    for(const [Component,props] of [[Workflow,{api,active:true,onExpired:noop}],[Agent,{agents:[],connections:[]}]]){
      const html=renderToStaticMarkup(createElement(Component,{view,enabled:true,onDecision:noop,onRetry:noop,onCancel:noop,...props}))
      assert.match(html,/我确认本次语义查询可能产生费用/);assert.match(html,/我自己的检索配置，仅批准当前步骤/)
      assert.equal((html.match(/type="checkbox"/g)??[]).length,2);assert.doesNotMatch(html,/checked=""|<script>|本次模型调用/)
      assert.match(html,/&lt;script&gt;foreign/)
    }
    assert.equal(reads,0)
  }finally{await vite.close()}
})
