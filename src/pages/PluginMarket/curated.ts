// 热门推荐精选清单：term 为注册表搜索词（/api/market/lookup?name=<term> 按名取真实条目），
// zh_title/zh_desc 为内置一句话产品语中文简介（≤30 字）。未命中的 term 前端静默隐藏该行，不编数据。
// access 为实测接入方式标注（2026-10 匿名实测）：anon=连接与试调全程无需钥匙；key=真实调用需到官网/托管平台申请钥匙填授权头（其中部分可匿名拉工具清单但调用仍要钥匙）；不填=未实测不标注。
// pin=该条目的固定连接通道（跳过注册表 lookup 直接用，用于注册表条目走不通 OAuth 死胡同时的官方直连通道）；key_hint/apply_url=钥匙来源的白话说明与申请直达链接。
export type CuratedEntry = {
  term: string
  zh_title: string
  zh_desc: string
  access?: "anon" | "key"
  pin?: { name: string; title: string; url: string; desc?: string }
  key_hint?: string
  apply_url?: string
}

export const CURATED_PLUGINS: CuratedEntry[] = [
  { term: "dropbox", zh_title: "Dropbox", zh_desc: "网盘文件问答与存取操作", access: "anon" },
  {
    term: "github",
    zh_title: "GitHub",
    zh_desc: "读写仓库、Issue 与 Pull Request",
    access: "key",
    pin: {
      name: "github/github-mcp-server",
      title: "GitHub",
      url: "https://api.githubcopilot.com/mcp/",
      desc: "GitHub 官方远程通道：用你自己的 GitHub 个人访问令牌连接，助手即可读写仓库、Issue 与 Pull Request。",
    },
    key_hint:
      "钥匙是你的 GitHub 个人访问令牌：github.com → Settings → Developer settings → Personal access tokens → 生成新令牌（勾选仓库读写权限）。填法：Header 名 Authorization、值 Bearer 加空格加令牌。",
    apply_url: "https://github.com/settings/tokens",
  },
  { term: "wikipedia", zh_title: "Wikipedia", zh_desc: "检索百科条目浏览量趋势", access: "key" },
  { term: "shopify", zh_title: "Shopify", zh_desc: "查询店铺商品与集合数据", access: "key" },
  { term: "slack", zh_title: "Slack", zh_desc: "收发 Slack 消息、管理频道", access: "key" },
  { term: "gmail", zh_title: "Gmail", zh_desc: "收发和检索 Gmail 邮件", access: "key" },
  { term: "figma", zh_title: "Figma", zh_desc: "把 Figma 设计稿上下文接给助手", access: "key" },
  { term: "stripe", zh_title: "Stripe", zh_desc: "查询客户、产品与支付数据", access: "key" },
]

const CURATED_BY_TERM: Record<string, CuratedEntry> = {}
for (const entry of CURATED_PLUGINS) CURATED_BY_TERM[entry.term.toLowerCase()] = entry

// 搜索/信息流行命中同一名字（name/title 全等优先，其次分词精确命中）时也生效内置中文简介与接入方式标注
export function curatedZhFor(rawName: string, rawTitle: string): CuratedEntry | null {
  const pluginName = String(rawName || "").toLowerCase()
  const pluginTitle = String(rawTitle || "").toLowerCase()
  for (const key of Object.keys(CURATED_BY_TERM)) {
    if (pluginName === key || pluginTitle === key) return CURATED_BY_TERM[key]
  }
  const nameTokens = pluginName.split(/[/.\-_\s]+/)
  const titleTokens = pluginTitle.split(/[/.\-_\s]+/)
  for (const key of Object.keys(CURATED_BY_TERM)) {
    if (nameTokens.indexOf(key) >= 0 || titleTokens.indexOf(key) >= 0) return CURATED_BY_TERM[key]
  }
  return null
}
