import { AlertTriangle, ChevronDown, Languages, Loader2, Package, Plus, RefreshCw, Search, Terminal } from "lucide-react"
import type { ConnectionRow, MarketPlugin } from "@/pages/PluginMarket/usePluginMarket"
import { curatedZhFor } from "@/pages/PluginMarket/curated"

type MarketBrowserProps = {
  featuredItems: MarketPlugin[]
  isFeaturedLoading: boolean
  marketItems: MarketPlugin[]
  marketSearchText: string
  setMarketSearchText: (v: string) => void
  marketActiveQuery: string
  isMarketLoading: boolean
  isMarketLoadingMore: boolean
  marketError: string
  marketNextCursor: string
  connectionByUrl: Record<string, ConnectionRow>
  isTranslating: boolean
  onTranslate: () => void
  onSubmitSearch: () => void
  onLoadMore: () => void
  onRetry: () => void
  onOpenPlugin: (plugin: MarketPlugin) => void
}

// 首字母色块按插件名确定性取色，只用 token 类（禁 hex）
const ICON_TONES = [
  "bg-primary/15 text-primary",
  "bg-secondary text-secondary-foreground",
  "bg-destructive/10 text-destructive",
  "bg-primary text-primary-foreground",
]

function toneFor(seedText: string): string {
  const seed = String(seedText || "?")
  let sum = 0
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i)
  return ICON_TONES[sum % ICON_TONES.length]
}

function PluginRow({
  plugin,
  connection,
  onOpenPlugin,
}: {
  plugin: MarketPlugin
  connection: ConnectionRow | null
  onOpenPlugin: (plugin: MarketPlugin) => void
}) {
  const displayName = plugin.zh_title || plugin.title || plugin.name
  const descText = plugin.zh_desc || plugin.description || "（该插件暂无描述）"
  const initial = String(displayName || "?").trim().charAt(0).toUpperCase()
  const isRemote = (plugin.remotes || []).length > 0
  const access = curatedZhFor(plugin.name, plugin.title)?.access
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`查看 ${displayName} 详情`}
      onClick={() => onOpenPlugin(plugin)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault()
          onOpenPlugin(plugin)
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold shadow-sm ${toneFor(plugin.name)}`}>
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-card-foreground">{displayName}</p>
          {plugin.version && (
            <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-xs text-secondary-foreground">v{plugin.version}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{descText}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {access === "anon" ? (
          <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">匿名可试</span>
        ) : access === "key" ? (
          <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground sm:inline-flex">需官方钥匙</span>
        ) : isRemote ? (
          <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">远程可连接</span>
        ) : (
          <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">仅本地进程</span>
        )}
        {connection ? (
          <span className="rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary">已连接</span>
        ) : isRemote ? (
          <button
            type="button"
            aria-label={`连接 ${displayName}`}
            onClick={(ev) => {
              ev.stopPropagation()
              onOpenPlugin(plugin)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-primary hover:text-primary hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label="仅本地进程插件，暂不支持连接"
            className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted text-muted-foreground opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function RowGrid({
  items,
  connectionByUrl,
  onOpenPlugin,
}: {
  items: MarketPlugin[]
  connectionByUrl: Record<string, ConnectionRow>
  onOpenPlugin: (plugin: MarketPlugin) => void
}) {
  return (
    <div className="grid gap-x-8 gap-y-0.5 md:grid-cols-2">
      {items.map((plugin, idx) => (
        <PluginRow
          key={`${plugin.name}-${idx}`}
          plugin={plugin}
          connection={connectionByUrl[(plugin.remotes || [])[0]?.url || ""] || null}
          onOpenPlugin={onOpenPlugin}
        />
      ))}
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-border pb-2">
      <h3 className="text-sm font-semibold tracking-tight text-card-foreground">{title}</h3>
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

function RowSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-x-8 gap-y-0.5 md:grid-cols-2">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
          </span>
        </div>
      ))}
    </div>
  )
}

export function MarketBrowser({
  featuredItems,
  isFeaturedLoading,
  marketItems,
  marketSearchText,
  setMarketSearchText,
  marketActiveQuery,
  isMarketLoading,
  isMarketLoadingMore,
  marketError,
  marketNextCursor,
  connectionByUrl,
  isTranslating,
  onTranslate,
  onSubmitSearch,
  onLoadMore,
  onRetry,
  onOpenPlugin,
}: MarketBrowserProps) {
  const searching = Boolean(marketActiveQuery)

  const loadMoreBlock = marketNextCursor ? (
    <div className="mt-5 text-center">
      <button
        type="button"
        disabled={isMarketLoadingMore}
        onClick={onLoadMore}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-2.5 text-sm font-medium text-card-foreground shadow-sm transition hover:bg-secondary hover:shadow-md disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
      >
        {isMarketLoadingMore ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
        {isMarketLoadingMore ? "正在加载下一页…" : "加载更多"}
      </button>
    </div>
  ) : null

  const feedBlock = isMarketLoading ? (
    <RowSkeleton rows={10} />
  ) : marketItems.length === 0 && !marketError ? (
    <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
      <Package className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-card-foreground">
        {searching ? `没有找到与「${marketActiveQuery}」相关的插件` : "市场暂时没有返回条目"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">换个关键词试试，或点击重试重新拉取</p>
    </div>
  ) : (
    <RowGrid items={marketItems} connectionByUrl={connectionByUrl} onOpenPlugin={onOpenPlugin} />
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Terminal className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-card-foreground">工具市场</h2>
            <p className="text-xs text-muted-foreground">
              数据来自 MCP 官方注册表，实时代理拉取{searching ? `，当前搜索「${marketActiveQuery}」` : ""}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={marketSearchText}
              onChange={(ev) => setMarketSearchText(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") onSubmitSearch()
              }}
              placeholder="搜索插件，如 github / search / memory"
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={onSubmitSearch}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search className="h-4 w-4" />
            搜索
          </button>
          <button
            type="button"
            onClick={onTranslate}
            disabled={isTranslating}
            title="把当前列表还没有中文的简介批量翻译成中文（会先确认费用）"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium text-card-foreground shadow-sm transition hover:bg-secondary hover:shadow-md disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isTranslating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Languages className="h-4 w-4 text-primary" />}
            翻译简介
          </button>
        </div>
      </header>

      {marketError && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{marketError}</span>
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground transition hover:shadow-md"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
        </div>
      )}

      {searching ? (
        <div className="mt-4">
          <SectionHead title="搜索结果" hint={`关键词「${marketActiveQuery}」· 共 ${marketItems.length} 条`} />
          {feedBlock}
          {loadMoreBlock}
        </div>
      ) : (
        <div className="mt-4 space-y-7">
          {(isFeaturedLoading || featuredItems.length > 0) && (
            <div>
              <SectionHead title="热门推荐" hint="精选知名插件 · 匿名可试=直接连 · 需官方钥匙=先填钥匙" />
              {isFeaturedLoading ? <RowSkeleton rows={8} /> : <RowGrid items={featuredItems} connectionByUrl={connectionByUrl} onOpenPlugin={onOpenPlugin} />}
            </div>
          )}
          <div>
            <SectionHead title="更多插件" hint="注册表实时 feed" />
            {feedBlock}
            {loadMoreBlock}
          </div>
        </div>
      )}
    </section>
  )
}
