import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus, RotateCw, X, XCircle } from "lucide-react"
import type { KeyItem, RevealedKey } from "@/pages/Integrate/useIntegrate"

type ApiKeysCardProps = {
  hasAgent: boolean
  keyList: KeyItem[]
  isLoadingKeys: boolean
  keyName: string
  setKeyName: (v: string) => void
  isCreatingKey: boolean
  onCreateKey: () => void
  onReissueKey: (id: string) => void
  onRevokeKey: (id: string) => void
  revealedKey: RevealedKey
  onCloseRevealed: () => void
  copiedField: string
  onCopy: (field: string, text: string) => void
}

export function ApiKeysCard({
  hasAgent,
  keyList,
  isLoadingKeys,
  keyName,
  setKeyName,
  isCreatingKey,
  onCreateKey,
  onReissueKey,
  onRevokeKey,
  revealedKey,
  onCloseRevealed,
  copiedField,
  onCopy,
}: ApiKeysCardProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <KeyRound className="h-4 w-4 text-primary" />
            API 调用钥匙
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">发给外部系统调用你的助手，明文只在创建时展示一次</p>
        </div>
        {isLoadingKeys && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {!hasAgent ? (
        <p className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground">
          先在左侧选择一个已发布的助手，再为它发放调用钥匙。
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={keyName}
              onChange={(ev) => setKeyName(ev.target.value.slice(0, 30))}
              placeholder="给钥匙起个名字，例如：官网客服位"
              aria-label="钥匙名称"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <button
              type="button"
              onClick={onCreateKey}
              disabled={isCreatingKey}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              创建钥匙
            </button>
          </div>

          {keyList.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-secondary/50 p-4 text-center text-xs text-muted-foreground">
              还没有钥匙。创建一把后，外部系统即可用「接口调用」卡片里的示例代码调起该助手。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {keyList.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 shadow-sm"
                >
                  <span
                    className={
                      row.enabled
                        ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                    }
                  >
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-card-foreground">{row.name}</span>
                      <span
                        className={
                          row.enabled
                            ? "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            : "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                        }
                      >
                        {row.enabled ? "生效中" : "已吊销"}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                      rhk_****{row.token_tail} · 创建于 {String(row.created || "").slice(0, 10)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onReissueKey(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      重发
                    </button>
                    {row.enabled && (
                      <button
                        type="button"
                        onClick={() => onRevokeKey(row.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        吊销
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  钥匙「{revealedKey.name}」已就绪
                </h3>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  完整钥匙只展示这一次，关闭后无法再查看，请立即复制并妥善保存；泄露时可用「重发」作废旧钥匙。
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseRevealed}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="关闭钥匙明文"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-card-foreground">
                {revealedKey.token}
              </code>
              <button
                type="button"
                onClick={() => onCopy("revealedKey", revealedKey.token)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copiedField === "revealedKey" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === "revealedKey" ? "已复制" : "复制"}
              </button>
            </div>
            <button
              type="button"
              onClick={onCloseRevealed}
              className="mt-4 w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-primary"
            >
              我已保存，关闭
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
