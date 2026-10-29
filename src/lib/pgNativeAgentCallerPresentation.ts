// Presentation of already Owner-scoped parsed values. No fetch or authority.
import type {AgentCallerCredential,parseAgentCallerHistory} from '../../shared/agent-caller-contract.ts'
export type AgentCallerHistory=ReturnType<typeof parseAgentCallerHistory>
export type AgentCallerHistorySource='api'|'embed'|'owner_test'|'unknown'
export type AgentCallerHistoryFilter='all'|AgentCallerHistorySource
export function agentCallerHistorySource(item:AgentCallerHistory['items'][number],credentials:ReadonlyMap<string,AgentCallerCredential>):AgentCallerHistorySource{
 return item.mode==='owner_test'?'owner_test':credentials.get(item.credential_id)?.kind??'unknown'
}
export function agentCallerRecentHistory(history:AgentCallerHistory,credentials:readonly AgentCallerCredential[],source:AgentCallerHistoryFilter='all',version='all',now=Date.now()){
 const byId=new Map(credentials.map(c=>[c.id,c])),today=new Date(now).toISOString().slice(0,10),summary={loaded:history.items.length,today:0,api:0,embed:0,owner_test:0,unknown:0,succeeded:0},rows=history.items.map(item=>({item,source:agentCallerHistorySource(item,byId),credential:byId.get(item.credential_id)}))
 for(const row of rows){summary[row.source]++;if(new Date(row.item.created_ms).toISOString().slice(0,10)===today)summary.today++;if(row.item.status==='succeeded')summary.succeeded++}
 const versions=[...new Set(history.items.map(i=>i.version_id))],success_rate=summary.loaded?Math.round(summary.succeeded*1000/summary.loaded)/10:0
 return{summary:{...summary,success_rate},versions,rows:rows.filter(r=>(source==='all'||r.source===source)&&(version==='all'||r.item.version_id===version))}
}
export function agentCallerElapsed(created:number,updated:number){const ms=Math.max(0,updated-created);return ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s'}
export function agentCallerApiExamples(base:string,origin:string){
 const target=new URL(base),site=new URL(origin);if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||!['/api/v2/public/agent','/__pg_native/api/v2/public/agent'].includes(target.pathname)||site.protocol!=='https:'||site.origin!==origin)throw Error('agent_caller_example_origin_required')
 const choice={request_id:'替换为本次确认的UUID',session_id:'替换为调用会话UUID',input:'调用者明确确认的任务',fee_ack:'RUN_ONCE_WITHIN_OWNER_APPROVED_LIMITS',confirm:true},curl=[
  '# 将单独保存的凭证放入 AGENT_CALLER_KEY；原始请求保存为 choice.json。',
  '# 第一次命令只提交一次。结果未知时，保留原 UUID 并使用下方确认命令。',
  'curl --request POST "'+base+'/run" \\',
  '  --header "Authorization: Bearer $AGENT_CALLER_KEY" \\',
  '  --header "Origin: '+origin+'" --header "Content-Type: application/json" \\',
  '  --data-binary @choice.json',
  '',
  '# 原请求确认：confirm.json 内容为 {"choice": choice.json的原始对象}。',
  'curl --request POST "'+base+'/confirm" \\',
  '  --header "Authorization: Bearer $AGENT_CALLER_KEY" \\',
  '  --header "Origin: '+origin+'" --header "Content-Type: application/json" \\',
  '  --data-binary @confirm.json',
  '',
  '# 使用已确认 receipt.invocation_id 查询；查询不会推进或重试执行。',
  'curl "'+base+'/poll/替换为已确认的invocation_id" \\',
  '  --header "Authorization: Bearer $AGENT_CALLER_KEY" --header "Origin: '+origin+'"'
 ].join('\n'),javascript=[
  'const base = '+JSON.stringify(base),
  'const key = "粘贴单独保存的调用凭证" // 不要提交到代码仓库或输出到日志',
  '// 网页实际 Origin 必须与 '+JSON.stringify(origin)+' 完全一致；浏览器自行发送 Origin。',
  'const choice = { request_id: crypto.randomUUID(), session_id: crypto.randomUUID(),',
  '  input: "调用者明确确认的任务", fee_ack: "RUN_ONCE_WITHIN_OWNER_APPROVED_LIMITS", confirm: true }',
  '// 此对象和 UUID 必须保留到结果确认；仅在调用者明确确认费用后提交。',
  'async function request(path, method, body) {',
  '  const response = await fetch(base + path, { method, credentials: "omit", redirect: "error", cache: "no-store",',
  '    headers: { Authorization: "Bearer " + key, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },',
  '    ...(body ? { body: JSON.stringify(body) } : {}) })',
  '  const value = await response.json() // 网络或解析异常均需确认原 UUID，勿自动重试 POST',
  '  if (!response.ok) throw new Error(value.error || "请求未确认")',
  '  return value',
  '}',
  'const submitOnce = () => request("/run", "POST", choice)',
  'const confirmOriginal = () => request("/confirm", "POST", { choice })',
  'const pollOnce = invocationId => request("/poll/" + invocationId, "GET")',
  '// 用户确认后调用 submitOnce()；未知时只调用 confirmOriginal()；已确认后才 pollOnce(receipt.invocation_id)。'
 ].join('\n')
 return{curl,javascript,choice:JSON.stringify(choice,null,2)}
}
