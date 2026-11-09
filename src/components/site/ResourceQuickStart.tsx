import {ArrowRight,CheckCircle2,FileText,Globe2,Monitor,Plug,Sparkles,BrainCircuit} from 'lucide-react'
import {Link,useSearchParams} from 'react-router-dom'
import {RESOURCE_INTENTS,guideResourceAccess,resourceIntent,type ResourceIntent} from '@/lib/resourceAccessGuide'
import type {ExecutionCapability} from '@/lib/executionCapabilities'
import type {ResourceInventoryHealth} from '@/lib/resourceInventory'

import {continueAgentResourceSetupUrl} from '@/lib/toolSearchPrivacy'
import {ConnectComputerButton} from '@/components/tool-hub/ConnectComputerButton'
const icons={documents:FileText,web:Globe2,local:Monitor,services:Plug,method:Sparkles,model:BrainCircuit}
export function ResourceQuickStart({capabilities,onlineDevices,known,onConnected}:{capabilities:readonly ExecutionCapability[];onlineDevices:number;known:ResourceInventoryHealth;onConnected:()=>void}){
 const [params,setParams]=useSearchParams()
 const choose=(intent:ResourceIntent)=>{const next=new URLSearchParams(params);next.set('intent',intent);setParams(next)}
 const intent=resourceIntent(params.get('intent'))||(params.get('capability')==='browser'?'web':params.get('capability')==='desktop'?'local':null)
 const guide=intent?guideResourceAccess(intent,capabilities,onlineDevices,known):null
 return <section aria-label="按任务快速接入资源" className="my-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
  <h2 className="text-lg font-semibold">你希望 Agent 帮你做什么？</h2>
  <p className="mt-1 text-sm text-muted-foreground">先复用，再连接。上传资料、在线服务和方法引用不需要安装电脑组件。</p>
  <div role="group" aria-label="选择资源用途" className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{RESOURCE_INTENTS.map(item=>{const Icon=icons[item.id];return <button type="button" key={item.id} aria-pressed={intent===item.id} onClick={()=>choose(item.id)} className={'min-w-0 rounded-xl border p-3 text-left transition '+(intent===item.id?'border-primary bg-primary/5':'border-border hover:border-primary/40 hover:bg-secondary/40')}><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 shrink-0 text-primary"/>{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></button>})}</div>
  {guide&&<div role="region" aria-label="推荐接入路径" className="mt-4 rounded-xl bg-secondary/30 p-4"><p className="text-sm leading-6">{guide.reason}</p>{guide.reuseCount>0&&<p className="mt-2 flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-4 w-4"/>优先核对 {guide.reuseCount} 个已有资源；历史记录不等于本次执行授权。</p>}<div className="mt-3 flex flex-wrap gap-2">{guide.routes.map(route=><Link key={route.to+route.label} to={continueAgentResourceSetupUrl(route.to,params)} className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-primary"><span className="min-w-0 break-words">{route.label}</span><ArrowRight className="h-4 w-4 shrink-0"/></Link>)}{intent==='local'&&!known.devices&&<button type="button" onClick={onConnected} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-primary">重新核实已有设备</button>}{intent==='local'&&known.devices&&<ConnectComputerButton label={onlineDevices>0?'确需连接另一台电脑':'连接我的电脑'} mode="both" successLabel="完成，刷新连接状态" onConnected={onConnected}/>}</div>{intent==='web'&&<p className="mt-3 text-xs text-muted-foreground">远程浏览器需实际接入对应服务；没有可用远程服务时，可选择“使用自己的电脑”，不冒充已开通。</p>}</div>}
  <details className="mt-4 border-t border-border pt-3 text-xs"><summary className="cursor-pointer font-medium text-muted-foreground">技术人员：已有 API / 自建 MCP</summary><div className="mt-2 flex flex-wrap gap-3"><Link to={continueAgentResourceSetupUrl('/tool-connections',params)} className="min-h-9 text-primary">接入已有 HTTP 接口</Link><Link to={continueAgentResourceSetupUrl('/plugin-market',params)} className="min-h-9 text-primary">管理托管或自建插件</Link></div><p className="mt-1 text-muted-foreground">只要求服务本身必需的身份和地址；不默认开放权限或替用户执行测试操作。</p></details>
 </section>
}
