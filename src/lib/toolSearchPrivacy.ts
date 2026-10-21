/**
 * A capability search term sent to an external plugin directory must never be
 * a raw employee requirement, business entity, document title, token, or prompt.
 * Only bounded generic vocabulary is eligible for automatic outbound search.
 */
const SAFE_CATEGORY_TERMS: readonly [RegExp,string][] = [
  [/(?:pdf|附件解析|文档解析|文件解析|文件提取|解析文件|document.?parse|pdf.?extract)/i,"pdf"],
  [/(?:ocr|扫描件|图片转文字|文字识别)/i,"ocr"],
  [/(?:github|代码仓库|git.?repo)/i,"github"],
  [/(?:gitlab)/i,"gitlab"],
  [/(?:notion)/i,"notion"],
  [/(?:slack)/i,"slack"],
  [/(?:飞书|feishu|lark)/i,"lark"],
  [/(?:钉钉|dingtalk)/i,"dingtalk"],
  [/(?:gmail|邮件发送|电子邮件|邮件收发|邮箱|email)/i,"email"],
  [/(?:google.?drive|谷歌云盘|googledrive)/i,"google drive"],
  [/(?:日历|calendar|会议安排)/i,"calendar"],
  [/(?:excel|xlsx|电子表格|spreadsheet|读取表格)/i,"spreadsheet"],
  [/(?:图表生成|生成图表|绘制图表|chart)/i,"chart"],
  [/(?:数据库查询|数据库连接|sql查询|postgres|mysql)/i,"database"],
  [/(?:网页抓取|网页解析|阅读网页|网站抓取|web.?fetch)/i,"web scraping"],
  [/(?:网络搜索|网页搜索|搜索引擎|互联网搜索|联网搜索|web.?search)/i,"web search"],
  [/(?:markdown|md格式)/i,"markdown"],
  [/(?:http.?api|自定义接口|webhook)/i,"http api"],
]
/** Empty means user must type their own query in the market; do not leak unknown terms. */
export function safeMarketplaceQuery(raw: string):string {
  const value=String(raw||"").trim().slice(0,180)
  if(!value || /(sk[-_][a-zA-Z0-9_-]{8,}|bearer\s+|api.?key\s*[:=]|password\s*[:=]|token\s*[:=])/i.test(value))return ""
  for(const [regex,category] of SAFE_CATEGORY_TERMS){
    if(regex.test(value))return category
  }
  return ""
}

/** Return context is an opaque, owner-scoped record id, never a raw redirect URL. */
export function safeAgentSpecId(value:string):string {
  const id=String(value||"").trim()
  return /^[A-Za-z0-9]{15}$/.test(id)?id:""
}
export function addReturnAgentToUrl(path:string,specId:string):string {
  const id=safeAgentSpecId(specId)
  if(!id)return path
  return path+(path.includes("?")?"&":"?")+"returnSpec="+id
}

/** Only a verified catalog item chosen by a human can be linked by exact slug. */
export function safeChosenCatalogSlug(value:string):string{
  const slug=String(value||"").trim()
  return /^@?[A-Za-z0-9][A-Za-z0-9_-]{0,55}(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,55})?$/.test(slug) ? slug : ""
}
