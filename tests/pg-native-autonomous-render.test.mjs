// Vite SSR is a static component check, not a browser or visual E2E claim.
import test from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {emptyAutonomousView} from "../src/lib/pgNativeAutonomousAgentSession.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const agent="11111111-1111-4111-8111-111111111111",connection="22222222-2222-4222-8222-222222222222",run="33333333-3333-4333-8333-333333333333"
test("static employee UI keeps new grants disabled, scopes approval consent and renders untrusted tool text safely",async()=>{
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],
    cacheDir:path.join(root,".tmp/pg-migration-completion/autonomous-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},
    server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const [{default:Panel},{default:Detail},{default:Human}]=await Promise.all([
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAgentHumanInputPanel.tsx"),
    ])
    const role={id:agent,revision:2,name:"Synthetic role",spec:{goal:"Own goal",task_scope:"Own scope",tools:["calculate"],
      model_binding:{connection_id:connection,connection_revision:3,model_id:"synthetic"}}}
    const model={id:connection,revision:3,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
    const props={agents:[role],connections:[model],onDecision:()=>{},onRetry:()=>{},onCancel:()=>{}}
    const blocked=renderToStaticMarkup(createElement(Panel,{...props,api:{},enabled:false,active:true,onExpired:()=>{}}))
    assert.match(blocked,/当前环境未开放多轮任务提交和审批/);assert.match(blocked,/<fieldset disabled=""/)
    assert.match(blocked,/<select[^>]*aria-label="最多规划轮数"/);assert.match(blocked,/aria-label="多轮任务要求"/)
    const renderOutcome=(allowed)=>renderToStaticMarkup(createElement(Panel,{...props,api:{},enabled:true,active:true,outcomeAvailable:true,outcomeEnabled:allowed,onExpired:()=>{}}))
    const outcome=renderOutcome(true),checkbox=outcome.match(/<input[^>]*aria-label="任务结束后保存本次经验或教训"[^>]*>/)?.[0]
    assert.ok(checkbox);assert.doesNotMatch(checkbox,/checked/);assert.match(outcome,/不额外调用模型/)
    assert.match(renderOutcome(false),/<input[^>]*aria-label="任务结束后保存本次经验或教训"[^>]*disabled=""/)
    const pending={step_key:"wf2_00002_agent_a01m",input_sha256:"a".repeat(64),kind:"model",input:JSON.stringify({task:"Review own task",think:"PRIVATE_REASONING"}),
      configuration:{model_binding:role.spec.model_binding},missing:[],agent_context:{round:1,phase:"model",parent_step_key:"wf2_00002_agent"}}
    const detail={run:{id:run,kind:"agent",workflow_id:null,agent_spec_id:agent,status:"awaiting_approval",instruction:"Own task",checkpoint:{spec_revision:2,max_steps:3},result_text:""},
      pending_effect:pending,approvals:[],steps:[],execution_mode:"agent_native_v2",replayed:false}
    const render=(value,enabled=true,changes={})=>renderToStaticMarkup(createElement(Detail,{...props,enabled,view:{...emptyAutonomousView,detail:value,...changes}}))
    const review=render(detail)
    assert.match(review,/第 1 轮 · <!-- -->模型调用|第 1 轮 · 模型调用/)
    assert.match(review,/Review own task/);assert.equal(review.includes("PRIVATE_REASONING"),false)
    assert.match(review,/<button[^>]*disabled=""[^>]*>批准当前步骤<\/button>/)
    assert.match(review,/我已核对本次模型调用，确认可能产生费用/)
    const revoked=render(detail,false);assert.match(revoked,/当前环境未开放任务审批/)
    assert.match(revoked,/<input[^>]*disabled=""/)
    const tool={...detail,pending_effect:{...pending,kind:"tool",agent_context:{...pending.agent_context,phase:"tool"},configuration:{tool:"calculate"},
      input:JSON.stringify({expression:'<script>alert("untrusted")</script>'})}}
    const toolHtml=render(tool)
    assert.equal(toolHtml.includes("<script>"),false);assert.match(toolHtml,/&lt;script&gt;/)
    const recovery=render(detail,true,{pendingMutation:{kind:"decision",id:run,decision:"approved",step:pending.step_key,hash:pending.input_sha256}})
    assert.match(recovery,/确认上次批准/);assert.equal(recovery.includes("批准当前步骤"),false)
    const input={pending_step_key:'wf2_00002_agent_a01m_input',pending_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64),kind:'plan_review',question:'Review <script>unsafe</script>',draft:'A complete owner draft',round:1}
    const humanDetail={...detail,pending_effect:null,run:{...detail.run,status:'awaiting_input'},human_input_current:true,human_input:input}
    const humanProps={detail:humanDetail,pendingResponse:null,active:true,enabled:true,locked:false,onRespond:()=>{},onConfirm:()=>{}}
    const human=renderToStaticMarkup(createElement(Human,humanProps))
    assert.match(human,/A complete owner draft/);assert.match(human,/&lt;script&gt;unsafe&lt;\/script&gt;/);assert.equal(human.includes('<script>'),false)
    assert.match(human,/<button[^>]*disabled=""[^>]*>批准此方案<\/button>/);assert.match(human,/<button[^>]*disabled=""[^>]*>提交修改意见<\/button>/)
    assert.match(human,/maxLength="1600"|maxlength="1600"/)
    const inputOff=renderToStaticMarkup(createElement(Human,{...humanProps,enabled:false}))
    assert.match(inputOff,/当前环境未开放人工回复/);assert.match(inputOff,/<textarea[^>]*disabled=""/)
    const pendingResponse={runId:run,choice:{request_id:agent,pending_step_key:input.pending_step_key,pending_sha256:input.pending_sha256,source_sha256:input.source_sha256,decision:'revise',answer:'Original private owner revision',confirm:true}}
    const recovering=renderToStaticMarkup(createElement(Human,{...humanProps,detail:null,enabled:false,pendingResponse}))
    assert.match(recovering,/核对上次人工回复/);assert.match(recovering,/Original private owner revision/);assert.equal(recovering.includes('提交修改意见'),false)
  }finally{await server.close()}
})
