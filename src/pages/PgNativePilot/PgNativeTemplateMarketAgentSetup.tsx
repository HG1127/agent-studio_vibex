import type {createPgNativePilotApi,PgNativeAgent,PgNativeKnowledge,PgNativeModelConnection,PgNativeToolConnection} from "@/lib/pgNativePilotApi"
import PgNativeAgentModelBindingPanel from "./PgNativeAgentModelBindingPanel"
import PgNativeAgentHttpToolsPanel from "./PgNativeAgentHttpToolsPanel"
import PgNativeAgentMcpToolsPanel from "./PgNativeAgentMcpToolsPanel"
import PgNativeAgentKnowledgePanel from "./PgNativeAgentKnowledgePanel"

// The parent first fetches this exact Agent through the current Native session.
// A template receipt or public source snapshot cannot supply its configuration.
export default function PgNativeTemplateMarketAgentSetup({api,agent,active,enabled,connections,tools,bases,onSaved,onExpired,onClose}:{
  api:ReturnType<typeof createPgNativePilotApi>;agent:PgNativeAgent;active:boolean;enabled:boolean;
  connections:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];
  onSaved:()=>Promise<void>;onExpired:()=>void;onClose:()=>void
}){
  if(!active)return null
  const agents=[agent]
  return <section id="template-market-agent-setup" aria-label="模板副本资源配置" className="min-w-0 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4">
    <h2 className="text-lg font-semibold">配置我的助手：{agent.name}</h2>
    <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={onClose}>返回全部助手配置</button>
    <p className="text-sm">已重新读取你保存的独立副本。请选择自己的模型、工具和知识库；模板来源的资源权限不会转移。配置完成后可自行决定是否运行。</p>
    {!enabled&&<p role="status" className="text-sm">正在核对配置权限，当前不能保存资源配置。</p>}
    <fieldset disabled={!enabled} className="min-w-0 space-y-4 border-0 p-0">
      <legend className="sr-only">本人副本资源</legend>
      <PgNativeAgentModelBindingPanel api={api} agents={agents} initialAgentId={agent.id} connections={connections} onUpdated={onSaved}/>
      <PgNativeAgentHttpToolsPanel api={api} agents={agents} initialAgentId={agent.id} connections={tools} enabled={enabled} onSaved={onSaved} onExpired={onExpired}/>
      <PgNativeAgentMcpToolsPanel api={api} agents={agents} initialAgentId={agent.id} active={active} enabled={enabled} onSaved={onSaved} onExpired={onExpired}/>
      <PgNativeAgentKnowledgePanel api={api} agents={agents} initialAgentId={agent.id} bases={bases} active={active} enabled={enabled} onSaved={onSaved} onExpired={onExpired}/>
    </fieldset>
  </section>
}
