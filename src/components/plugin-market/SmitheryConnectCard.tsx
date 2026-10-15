import { KeyRound, Link2, PlugZap, Search, Trash2 } from "lucide-react"
import type { usePluginMarket } from "@/pages/PluginMarket/usePluginMarket"

type SmitheryConnectCardProps = {
  p: ReturnType<typeof usePluginMarket>
}

export function SmitheryConnectCard({ p }: SmitheryConnectCardProps) {
  const isConnectedSlug = (slug: string) =>
    p.connectionRows.some((row) => row.enabled && row.url.includes(`server.smithery.ai/${slug}/`))

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-card-foreground">
            <PlugZap className="h-4 w-4 text-primary" />
            插件快速连接
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            填一次 Smithery API Key，即可浏览数千个插件并一键连接；也可以直连自建或内部 MCP 服务。
          </p>
        </div>
        {p.hasSmitheryKey && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            Key 已保存（••••{p.smitheryKeyTail}）
            <button
              type="button"
              onClick={() => void p.removeSmitheryKey()}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Trash2 className="h-3 w-3" />
              移除
            </button>
          </span>
        )}
      </header>

      {!p.hasSmitheryKey ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={p.smitheryKeyInput}
            onChange={(ev) => p.setSmitheryKeyInput(ev.target.value)}
            placeholder="粘贴 Smithery API Key（在 smithery.ai 创建）"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="button"
            disabled={!p.smitheryKeyInput.trim() || p.smitheryKeyBusy}
            onClick={() => void p.saveSmitheryKey()}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p.smitheryKeyBusy ? "验证中…" : "保存并启用"}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={p.smitheryQuery}
              onChange={(ev) => p.setSmitheryQuery(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") p.loadSmitheryServers(p.smitheryQuery)
              }}
              placeholder="搜索插件名或用途，回车搜索"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              disabled={p.smitheryLoading}
              onClick={() => p.loadSmitheryServers(p.smitheryQuery)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {p.smitheryLoading ? "加载中…" : "搜索"}
            </button>
          </div>
          {p.smitheryError && <p className="mt-2 text-xs text-destructive">{p.smitheryError}</p>}
          <div className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background">
            {p.smitheryLoading && <p className="px-3 py-4 text-xs text-muted-foreground">正在加载插件列表…</p>}
            {!p.smitheryLoading && p.smitheryItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                还没有结果：输入关键词搜索，或直接在下方连接自建插件。
              </p>
            )}
            {p.smitheryItems.map((item) => {
              const connected = isConnectedSlug(item.slug)
              return (
                <div key={item.slug} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {item.zh_title || item.title}
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{item.slug}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {item.zh_desc || item.desc || "暂无简介"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={connected || p.smitheryConnectBusy !== ""}
                    onClick={() => void p.connectSmithery(item)}
                    className={
                      connected
                        ? "shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                        : "shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                    }
                  >
                    {connected ? "已连接" : p.smitheryConnectBusy === item.slug ? "连接中…" : "连接"}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => p.setCustomOpen(!p.customOpen)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 transition hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" />
          {p.customOpen ? "收起自建 / 内部插件连接" : "连接自建 / 内部插件（任意 MCP 远程地址）"}
        </button>
        {p.customOpen && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <input
              value={p.customName}
              onChange={(ev) => p.setCustomName(ev.target.value)}
              placeholder="插件名称（如 内部知识库）"
              className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <input
              value={p.customUrl}
              onChange={(ev) => p.setCustomUrl(ev.target.value)}
              placeholder="MCP 服务地址 https://…"
              className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <input
              value={p.customToken}
              onChange={(ev) => p.setCustomToken(ev.target.value)}
              placeholder="Bearer 令牌（可选）"
              className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              disabled={!p.customUrl.trim() || p.customBusy}
              onClick={() => void p.connectCustomPlugin()}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p.customBusy ? "连接中…" : "连接"}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
