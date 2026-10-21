import type { AgentSpec, ConnectedToolOption } from "../pages/Home/presets"
import type { VerifiedMarketTool } from "./marketToolSelection"

/**
 * Safe capability resolution: this creates a plan/binding from a real user's
 * requirement and a generated AgentSpec, never a new vendor OAuth grant.
 *
 * Builtins can be added automatically. Pre-connected READ-ONLY tools may be
 * recommended for auto-binding when a concrete vendor/action match exists.
 * External writes, generic names and credentials always require user action.
 */
export type ToolRecommendation = {
  id: string
  label: string
  kind: "builtin" | "http" | "market"
  reason: string
  autoBind: boolean
  status: "connected" | "needs_confirmation"
}

export type ToolGap = {
  name: string
  searchTerm: string
  reason: string
}

export type ToolResolution = {
  resolvedTools: string[]
  recommendations: ToolRecommendation[]
  gaps: ToolGap[]
  /** IDs chosen without external authorization or side effects. */
  safeAutoBindings: string[]
}

type Connection = ConnectedToolOption & { method?: string; status?: string }
type Market = VerifiedMarketTool & { readOnly?: boolean; destructive?: boolean }

const CAPABILITIES = [
  {
    id:"knowledge_search", title:"知识库检索",
    phrases:["知识库","内部资料","公司资料","企业内部","企业知识","公司文档","内部文档","私有文档","专属资料","RAG","语义检索","知识检索"],
    request:["知识库","知识库检索","文档检索","内部搜索","内部资料检索","语义检索","knowledge_search","RAG","企业知识搜索"],
  },
  {
    id:"web_search", title:"网页搜索",
    phrases:["全网搜索","网络搜索","网页搜索","联网搜索","互联网上","互联网搜索","公开资料","公开信息","公开新闻","最新新闻","查找新闻","全网调研","上网查询"],
    request:["网页搜索","网络搜索","联网搜索","搜索引擎","web_search","全网搜索","搜索公开资料","互联网"],
  },
  {
    id:"web_fetch", title:"网页抓取",
    phrases:["网页正文","阅读网页","读取网页","抓取网页","打开网页","网页内容","网站内容","网页提取","爬取网页","网页解析","读取文章"],
    request:["网页抓取","网页提取","网页内容","web_fetch","爬虫","网页解析","读取网页"],
  },
  {
    id:"summarize", title:"文本摘要",
    phrases:["文本摘要","内容摘要","文章摘要","总结报告","总结文章","总结文档","归纳总结","摘要整理","信息归纳","提炼要点","输出摘要","生成摘要"],
    request:["文本摘要","内容摘要","文本整理","摘要","内容总结","summarize","提炼要点"],
  },
  {
    id:"calculate", title:"计算器",
    phrases:["计算金额","计算数值","数值计算","数学计算","统计计算","算术","金额计算","计算比例","公式计算","数值分析","数学运算","执行计算"],
    request:["计算器","数值计算","公式计算","calculate","算术"],
  },
] as const

const norm=(text:string)=>String(text||"").normalize("NFKC").toLocaleLowerCase().replace(/[\s_.:、—\-]+/g,"")
function containsPhrase(content:string,phrase:string):boolean {
  const raw=norm(phrase), text=norm(content)
  if(!raw || !text.includes(raw))return false
  // Do not silently grant a capability the user expressly forbade.
  const i=text.indexOf(raw)
  const preceding=text.slice(Math.max(0,i-7),i)
  if(/(?:不需要|无需|禁止|不要|不可|避免|拒绝|无须|不能)(?:使用|调用|进行|访问|连接|提供)?$/.test(preceding))return false
  return true
}

function fromGenerated(spec:AgentSpec,terms:readonly string[]):boolean {
  return (spec.tools||[]).some(item=>terms.some(term=>norm(item)===norm(term)))
}
function excerpt(text:string):string {return text.length>64?text.slice(0,64)+"…":text}
function explicitVendorMatch(name:string,input:string):boolean {
  const canonical=norm(name)
  if(!canonical)return false
  if(canonical.length>=5 && norm(input).includes(canonical))return true
  // Generic actions like 'search', 'read', 'post' are never enough.
  const vendor=String(name).split(/[_./:-]/).filter(s=>s.length>=3&&!/^(search|list|fetch|query|read|write|create|update|delete|send|post|tool|tools|api|mcp|http)$/i.test(s))
  return vendor.some(v=>v.length>=4 && containsPhrase(input,v))
}

/** Action AND domain must be recognizable; a generic "search" label is insufficient. */
function semanticConnectorMatch(name:string,description:string,requirement:string):boolean {
  const tool=(name+" "+description).toLocaleLowerCase()
  const desired=requirement.toLocaleLowerCase()
  const pairs:[RegExp,RegExp][]=[
    [/(?:pdf|文档解析|解析文件|读取文件|解析附件)/i,/(?:pdf.?parse|parse.?pdf|pdf.?extract|document.?parse|文件解析|文档解析)/i],
    [/(?:邮箱|邮件|gmail|email)/i,/(?:gmail|email|mail)/i],
    [/(?:飞书|lark)/i,/(?:feishu|lark|飞书)/i],
    [/(?:钉钉|dingtalk)/i,/(?:dingtalk|钉钉)/i],
    [/(?:slack)/i,/(?:slack)/i],
    [/(?:notion)/i,/(?:notion)/i],
    [/(?:github|代码仓库|git仓库)/i,/(?:github|git.?repo|仓库搜索)/i],
    [/(?:excel|电子表格|xlsx)/i,/(?:spreadsheet|excel|xlsx)/i],
    [/(?:数据图表|图表生成|生成图表)/i,/(?:plot.?chart|chart.?create|create.?chart|图表生成)/i],
  ]
  return pairs.some(([need,available])=>need.test(desired)&&available.test(tool))
}

/** Choosing an executable connection replaces its unexecutable human-readable alias. */
export function chooseVerifiedAgentTool(
  current:string[],toolId:string,checked:boolean,marketTools:Market[]=[]
):string[] {
  const target=toolId.trim()
  if(!target)return [...current]
  const selected=marketTools.find(tool=>tool.id===target)
  const aliases=new Set([target])
  if(checked&&selected)aliases.add(selected.name)
  const retained=current.filter(name=>!aliases.has(String(name||"").trim()))
  return checked?[...retained,target]:retained
}

export function resolveAgentToolRequirements(
  requirement:string,
  spec:AgentSpec,
  connectedHttp:Connection[]=[],
  marketTools:Market[]=[],
  explicitlySelected:string[]=[],
): ToolResolution {
  const unique = new Set<string>()
  const generated=(spec.tools||[]).map(tool=>String(tool||"").trim()).filter(Boolean)
  const context=[
    requirement,spec.goal,spec.task_scope,...(spec.task_plan||[]),
    ...(spec.deliverables||[]),
  ].filter(Boolean).join("；")
  const recommend:ToolRecommendation[]=[]
  const gaps:ToolGap[]=[]
  const resolvedTools:string[]=[]
  const safeAutoBindings:string[]=[]
  const add=(id:string,auto:boolean)=>{
    if(unique.has(id))return
    unique.add(id)
    if(auto)safeAutoBindings.push(id)
    resolvedTools.push(id)
  }
  // User-specified negative constraints take priority over a model's proposed tool list.
  const deniedByUser=(id:string)=>{
    if(id==="web_search"||id==="web_fetch")
      return /(?:不需要|无需|禁止|不要|不能|不使用|无须|不允许)(?:再|去|使用|调用|访问)?(?:联网|互联网|网页|外网|网络|浏览器)/i.test(requirement)
    if(id==="knowledge_search")
      return /(?:不需要|无需|禁止|不要|不能|不使用|无须|不允许)(?:使用|调用|访问)?(?:知识库|内部资料|企业文档)/i.test(requirement)
    return false
  }
  for(const capability of CAPABILITIES){
    if(deniedByUser(capability.id))continue
    const matched=fromGenerated(spec,capability.request) ||
      capability.phrases.some(term=>containsPhrase(context,term))
    if(!matched)continue
    const negative=capability.phrases.some(term=>{
      const lower=norm(requirement)
      const phrase=norm(term)
      const i=lower.indexOf(phrase)
      if(i<0)return false
      return /(?:不需要|无需|禁止|不要|不能|避免|无须)(?:进行|使用|调用|连接)?$/.test(lower.slice(Math.max(0,i-7),i))
    })
    if(negative)continue
    add(capability.id,true)
    recommend.push({
      id:capability.id,label:capability.title,kind:"builtin",
      reason:"需求命中可直接执行的内置能力，无需连接第三方账号",
      autoBind:true,status:"connected",
    })
  }
  for(const tool of marketTools){
    if(!tool.id || !tool.name)continue
    const matched=generated.some(term=>norm(term)===norm(tool.id)||norm(term)===norm(tool.name)) ||
      (explicitVendorMatch(tool.name,context) || semanticConnectorMatch(tool.name,tool.description,context))
    if(!matched)continue
    const safe=tool.readOnly===true && tool.destructive!==true
    recommend.push({
      id:tool.id,label:tool.label,kind:"market",
      reason:safe?"当前账号已验证该只读插件能力；调用前仍要经过执行审批":"该插件可能涉及写入或没有确认只读属性，需要用户明确选择并批准实际调用",
      autoBind:safe,status:safe?"connected":"needs_confirmation",
    })
    if(safe || explicitlySelected.includes(tool.id))add(tool.id,safe)
  }
  for(const tool of connectedHttp){
    if(!tool.name)continue
    const matched=generated.some(item=>norm(item)===norm(tool.name)) ||
      (explicitVendorMatch(tool.name,context) || semanticConnectorMatch(tool.name,tool.description,context))
    if(!matched)continue
    const safe=(tool.method||"").toUpperCase()==="GET" &&
      ["ok","success","connected"].includes((tool.status||"").toLowerCase())
    recommend.push({
      id:tool.name,label:tool.name,kind:"http",
      reason:safe?"已连接且经过测试的 GET 工具，可在此 Agent 中使用":"连接存在，但非只读或未验证成功；需要人工确认才能加入",
      autoBind:safe,status:safe?"connected":"needs_confirmation",
    })
    if(safe || explicitlySelected.includes(tool.name))add(tool.name,safe)
  }
  // A general description such as 文档解析 does NOT imply we have a parser.
  const matchedIds=new Set(recommend.map(item=>norm(item.id)))
  for(const item of generated){
    if(matchedIds.has(norm(item)))continue
    const builtin=CAPABILITIES.find(cap=>cap.request.some(term=>norm(term)===norm(item)))
    if(builtin)continue
    const described=CAPABILITIES.some(cap=>cap.phrases.some(term=>norm(term)===norm(item)))
    if(described)continue
    const coveredByConnected = recommend.some(row=>row.autoBind &&
      (marketTools.some(tool=>tool.id===row.id &&
          semanticConnectorMatch(tool.name,tool.description,item)) ||
        connectedHttp.some(tool=>tool.name===row.id &&
          semanticConnectorMatch(tool.name,tool.description,item))))
    if(coveredByConnected)continue
    if(/^mkt__/.test(item)){
      // Keep a disconnected binding visibly pending, never mark as connected.
      gaps.push({name:item,searchTerm:item.split("__").at(-1)||item,
        reason:"此前绑定的市场工具已不可用，请重新连接并核验权限"})
      continue
    }
    const connectedMarketName=marketTools.find(tool=>norm(tool.name)===norm(item))
    if(connectedMarketName &&
      (resolvedTools.includes(connectedMarketName.id) || explicitlySelected.includes(connectedMarketName.id)))continue
    const connectedHttpName=connectedHttp.find(tool=>norm(tool.name)===norm(item))
    if(connectedHttpName &&
      (resolvedTools.includes(connectedHttpName.name) || explicitlySelected.includes(connectedHttpName.name)))continue
    if(!gaps.some(g=>norm(g.name)===norm(item)))gaps.push({
      name:item,searchTerm:excerpt(item),reason:"尚未匹配到可执行的已验证工具，需在插件市场连接或配置接口",
    })
  }
  // Preserve previously explicit, exact and still verified real bindings; do
  // not silently erase a human's tool choice during AI edits.
  for(const tool of explicitlySelected){
    if(CAPABILITIES.some(cap=>cap.id===tool) ||
        connectedHttp.some(c=>c.name===tool) ||
        marketTools.some(c=>c.id===tool))add(tool,false)
  }
  return {resolvedTools,recommendations:recommend,gaps,safeAutoBindings}
}
