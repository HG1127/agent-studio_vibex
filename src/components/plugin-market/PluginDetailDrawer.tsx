import { AlertTriangle, CheckCircle2, Cable, KeyRound, Loader2, MonitorDown, Package, Play, Plus, Radar, Trash2, X } from "lucide-react"
import type { ConnectionRow, HeaderRow, MarketPlugin, ProbeOutcome } from "@/pages/PluginMarket/usePluginMarket"
import { buildInstallHint } from "@/pages/PluginMarket/usePluginMarket"
import { curatedZhFor } from "@/pages/PluginMarket/curated"

// 实测需要官方钥匙的托管平台域名（匿名探测返回 401/404），命中即在详情里前置钥匙申请引导
const KEY_GATE_HOSTS = ["server.smithery.ai", "servers.smithery.ai", "mcp.figma.com", "nordicmcp.eu", "gmail.mintmcp.com", "waystation.ai"]

// 钥匙托管域 → 官网申请入口（引导卡里的直达链接）
const KEY_APPLY_URLS: Record<string, string> = {
  "server.smithery.ai": "https://smithery.ai",
  "servers.smithery.ai": "https://smithery.ai",
  "mcp.figma.com": "https://www.figma.com",
  "nordicmcp.eu": "https://nordicmcp.eu",
  "gmail.mintmcp.com": "https://www.mintmcp.com",
  "waystation.ai": "https://waystation.ai",
}

function applyUrlFor(remoteUrl: string): string {
  for (const host of Object.keys(KEY_APPLY_URLS)) {
    if (String(remoteUrl || "").indexOf(host) >= 0) return KEY_APPLY_URLS[host]
  }
  try {
    const parsed = new URL(remoteUrl)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ""
  }
}

type PluginDetailDrawerProps = {
  drawerPlugin: MarketPlugin | null
  drawerConnection: ConnectionRow | null
  isProbing: boolean
  probeOutcome: ProbeOutcome
  isConnecting: boolean
  connectError: string
  connectNotice: string
  headerRows: HeaderRow[]
  onClose: () => void
  onProbe: () => void
  onConnect: () => void
  onAddHeaderRow: () => void
  onUpdateHeaderRow: (idx: number, patch: Partial<HeaderRow>) => void
  onRemoveHeaderRow: (idx: number) => void
  onTryInvoke: (row: ConnectionRow, toolName?: string) => void
}

export function PluginDetailDrawer({
  drawerPlugin,
  drawerConnection,
  isProbing,
  probeOutcome,
  isConnecting,
  connectError,
  connectNotice,
  headerRows,
  onClose,
  onProbe,
  onConnect,
  onAddHeaderRow,
  onUpdateHeaderRow,
  onRemoveHeaderRow,
  onTryInvoke,
}: PluginDetailDrawerProps) {
  if (!drawerPlugin) return null
  const plugin = drawerPlugin
  const remotes = plugin.remotes || []
  const isRemote = remotes.length > 0
  const connected = Boolean(drawerConnection)
  const tools = drawerConnection ? drawerConnection.tools : probeOutcome?.ok ? probeOutcome.tools : []
  const firstRemoteUrl = String((remotes[0] || {}).url || "")
  const curatedInfo = curatedZhFor(plugin.name, plugin.title)
  const needsKey =
    curatedInfo?.access === "key" ||
    KEY_GATE_HOSTS.some((host) => firstRemoteUrl.indexOf(host) >= 0)
  const isRedirectOAuthHost = firstRemoteUrl.indexOf("smithery.ai") >= 0 || firstRemoteUrl.indexOf("mcp.figma.com") >= 0
  const probeFailText = probeOutcome && !probeOutcome.ok ? `${probeOutcome.error_code || ""} ${probeOutcome.message || ""}` : ""
  const probeAuthLike = Boolean(probeFailText) && (needsKey || /401|403|404|token|auth|not found|unauthorized/i.test(probeFailText))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="关闭详情" onClick={onClose} className="absolute inset-0 cursor-default bg-foreground/30 backdrop-blur-sm" />
      <aside className="animate-in slide-in-from-right relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card shadow-2xl duration-300">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold tracking-tight text-card-foreground">{plugin.zh_title || plugin.title || plugin.name}</h2>
              {plugin.version && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">v{plugin.version}</span>}
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary">
                  <Package className="h-3 w-3" />
                  已连接
                </span>
              )}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{plugin.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 p-5">
          <section>
            <h3 className="text-sm font-semibold text-card-foreground">插件介绍</h3>
            {plugin.zh_desc ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">{plugin.zh_desc}</p>
                {plugin.description && (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{plugin.description}</p>
                )}
              </>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{plugin.description || "（该插件暂无描述）"}</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-card-foreground">接入方式</h3>
            {isRemote ? (
              <ul className="mt-2 space-y-2">
                {remotes.map((remote) => (
                  <li key={remote.url} className="rounded-xl border border-border bg-background/60 px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Cable className="h-3 w-3" />
                      {remote.type || "streamable-http"}
                    </span>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{remote.url}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 rounded-xl border border-dashed border-border bg-background/60 px-4 py-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
                  <MonitorDown className="h-4 w-4 text-muted-foreground" />
                  仅本地进程类插件
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  这类插件需要在自己电脑运行，本工作台暂只支持远程地址类插件。你可以在自己的 MCP 客户端里用下面的命令安装：
                </p>
                {(plugin.packages || []).length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {(plugin.packages || []).map((pkg, idx) => (
                      <li key={`${pkg.registry}-${idx}`} className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-xs text-secondary-foreground">
                        {buildInstallHint(pkg)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">（注册表未提供安装包信息）</p>
                )}
              </div>
            )}
          </section>

          {isRemote && !connected && needsKey && (
            <section className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <KeyRound className="h-4 w-4" />
                该插件需要官方钥匙
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-card-foreground">
                {curatedInfo?.key_hint ||
                  "它托管在第三方平台，匿名访问会被拒绝。到该插件官网申请一把钥匙后，填到下方「授权头配置」（常见填法：Header 名 Authorization、值 Bearer 加空格加钥匙），再点「探测能力」或「连接该插件」即可。"}
              </p>
              {isRedirectOAuthHost && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  注意：该托管平台的知名插件多走跳转授权流程，本工作台完成不了那种授权，填钥匙也可能连不上。请改连「热门推荐」里该插件的官方直通行（如 GitHub 官方通道）。
                </p>
              )}
              {(curatedInfo?.apply_url || applyUrlFor(firstRemoteUrl)) && (
                <a
                  href={curatedInfo?.apply_url || applyUrlFor(firstRemoteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <KeyRound className="h-3 w-3" />
                  去官网申请钥匙
                </a>
              )}
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-card-foreground">工具清单</h3>
              {isRemote && !connected && (
                <button
                  type="button"
                  disabled={isProbing}
                  onClick={onProbe}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {isProbing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
                  {isProbing ? "正在真实探测…" : "探测能力"}
                </button>
              )}
            </div>
            {connected ? (
              <p className="mt-1 text-xs text-muted-foreground">来自连接时保存的工具快照（{tools.length} 个），可在「我的连接」里重探刷新</p>
            ) : null}
            {probeOutcome && !probeOutcome.ok && (
              <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">
                    探测未通过{probeOutcome.error_code ? `（${probeOutcome.error_code}）` : ""}：{probeOutcome.message}
                  </span>
                </p>
                {probeAuthLike && (
                  <ol className="mt-2 list-decimal space-y-1 pl-6 text-xs leading-relaxed text-card-foreground">
                    <li>到该插件的官网或托管平台申请一把访问钥匙</li>
                    <li>在下方「授权头配置」加一行：Header 名填 Authorization，值填 Bearer 加空格加钥匙</li>
                    <li>回到上面再点一次「探测能力」，通过后即可连接</li>
                  </ol>
                )}
              </div>
            )}
            {tools.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {tools.map((tool) => (
                  <li key={tool.name} className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-xs font-semibold text-card-foreground">{tool.name}</p>
                      {connected && drawerConnection && (
                        <button
                          type="button"
                          onClick={() => drawerConnection && onTryInvoke(drawerConnection, tool.name)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Play className="h-3 w-3" />
                          试调
                        </button>
                      )}
                    </div>
                    {tool.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>}
                    {tool.args_hint && <p className="mt-1 font-mono text-xs text-muted-foreground">参数：{tool.args_hint}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              !isProbing &&
              !probeOutcome && (
                <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {connected ? "该连接暂无工具快照" : "点右上角「探测能力」，实时拉取该插件提供的工具清单"}
                </p>
              )
            )}
          </section>

          {isRemote && !connected && (
            <section className="rounded-xl border border-border bg-background/60 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                <KeyRound className="h-4 w-4 text-primary" />
                授权头配置（可选）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                部分插件需要到其官网申请钥匙后填在这里（例如 Authorization: Bearer xxx）。钥匙会加密保存在服务端，任何列表和详情都不会再显示明文。
              </p>
              <ul className="mt-3 space-y-2">
                {headerRows.map((row, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <input
                      value={row.key}
                      onChange={(ev) => onUpdateHeaderRow(idx, { key: ev.target.value })}
                      placeholder="Header 名，如 Authorization"
                      className="h-9 w-2/5 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <input
                      value={row.value}
                      onChange={(ev) => onUpdateHeaderRow(idx, { value: ev.target.value })}
                      placeholder="Header 值"
                      type="password"
                      className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveHeaderRow(idx)}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onAddHeaderRow}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                加一行
              </button>
            </section>
          )}

          {connectError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{connectError}</span>
              </p>
            </div>
          )}
          {connectNotice && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-primary">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {connectNotice}
              </p>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-border bg-card/95 p-4 backdrop-blur">
          {connected && drawerConnection ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                已连接{drawerConnection.headers_count > 0 ? `，已配置 ${drawerConnection.headers_count} 项授权头` : ""}
              </p>
              <button
                type="button"
                onClick={() => onTryInvoke(drawerConnection as ConnectionRow)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Play className="h-4 w-4" />
                去试调
              </button>
            </div>
          ) : isRemote ? (
            <button
              type="button"
              disabled={isConnecting}
              onClick={onConnect}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.02] hover:bg-primary/90 hover:shadow-xl disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
              {isConnecting ? "正在真实探测并连接…" : "连接该插件"}
            </button>
          ) : (
            <div>
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground opacity-60"
              >
                连接（暂不支持）
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">这类插件需要在自己电脑运行，本工作台暂只支持远程地址类插件</p>
            </div>
          )}
        </footer>
      </aside>
    </div>
  )
}
