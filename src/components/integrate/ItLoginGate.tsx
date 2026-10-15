import { Globe, KeyRound, LogIn, Share2 } from "lucide-react"

type ItLoginGateProps = {
  onLoginClick: () => void
}

export function ItLoginGate({ onLoginClick }: ItLoginGateProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Share2 className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">
          登录后把助手发布出去
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          嵌入代码、调用钥匙与调用留档都按账号隔离保存。登录账号后，即可把已发布的助手接入你自己的网页，或发放 API 钥匙给外部系统调用。
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            <Globe className="h-3.5 w-3.5 text-primary" />
            网页嵌入 · 实时预览
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            API 钥匙 · 真实试调
          </span>
        </div>
        <div className="mt-7">
          <button
            type="button"
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:scale-105 hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogIn className="h-4 w-4" />
            立即登录
          </button>
        </div>
      </div>
    </section>
  )
}
