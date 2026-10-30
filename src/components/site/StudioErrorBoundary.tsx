import { Component, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Contain lazy-import and render failures inside the active workspace.
 * Never surface raw stack traces, API credentials or internal exceptions to
 * employees. A pathname-keyed instance is created in App, so navigation
 * recovers naturally without discarding the entire authenticated session.
 */
export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      // Development-only diagnostic. No user-visible stack in the error UI.
      console.error("[Agent Studio] Page render failed", error)
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main role="alert" className="flex min-h-[65svh] w-full items-center justify-center bg-background p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6"/>
        </span>
        <h1 className="mt-4 text-lg font-semibold text-foreground">当前页面暂时无法显示</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          页面加载或渲染出现异常。你可以先尝试重试；如果正在编辑 Agent，未保存的临时草稿可能仍可在当前标签页恢复。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => this.setState({ failed: false })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <RotateCcw className="h-4 w-4"/>重试当前页面
          </button>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary">
            <Home className="h-4 w-4"/>返回工作台
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          如果多次重试仍失败，请记录发生时间和操作步骤反馈给管理员。
        </p>
      </div>
    </main>
  }
}
