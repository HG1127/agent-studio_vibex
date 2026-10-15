import { LogIn, Network, ShieldCheck } from "lucide-react"

type WcLoginGateProps = {
  onLoginClick: () => void
}

export function WcLoginGate({ onLoginClick }: WcLoginGateProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center shadow-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Network className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">
          登录后开始编排工作流
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          工作流与运行记录按账号隔离保存。登录账号后，即可拖拽节点、连线编排，并让流程真实跑起来。
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          画布编排 · 节点亮灯 · 运行历史，一站完成
        </p>
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
