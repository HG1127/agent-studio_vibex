import { LogIn, ShieldCheck, Store } from "lucide-react"

type TmLoginGateProps = {
  onLoginClick: () => void
}

export function TmLoginGate({ onLoginClick }: TmLoginGateProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Store className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">登录后逛模板市场</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          浏览公开模板、一键复制为自己的助手方案、发布你的模板，都需要登录账号后才能使用。
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          模板按账号隔离，使用与发布记录可追溯
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogIn className="h-4 w-4" />
            立即登录
          </button>
        </div>
      </div>
    </section>
  )
}
