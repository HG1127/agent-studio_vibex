import { LogIn, ScrollText, ShieldCheck } from "lucide-react"

type RdLoginGateProps = {
  onLoginClick: () => void
}

export function RdLoginGate({ onLoginClick }: RdLoginGateProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ScrollText className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">
          登录后查看运行详情
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          运行档案按账号隔离保存，只有本人可以查看。登录账号后，即可打开任意一次运行的完整时间线、成果与配置快照。
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          概览 · 时间线 · 结果 · 配置快照，一页看全
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
