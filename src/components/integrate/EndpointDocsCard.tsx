import { useState } from "react"
import { BookOpen, Check, Copy, Terminal } from "lucide-react"

type EndpointDocsCardProps = {
  apiBaseForDocs: string
  hasKey: boolean
  copiedField: string
  onCopy: (field: string, text: string) => void
}

export function EndpointDocsCard({ apiBaseForDocs, hasKey, copiedField, onCopy }: EndpointDocsCardProps) {
  const [docTab, setDocTab] = useState<"curl" | "js">("curl")

  const curlText = [
    `# 1. 创建调用（拿到 run_id）`,
    `curl -X POST "${apiBaseForDocs}/run" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"token":"你的rhk_钥匙","input":"帮我总结这段文字…"}'`,
    ``,
    `# 2. 轮询直到 status 变为 succeeded / failed`,
    `curl "${apiBaseForDocs}/poll?token=你的rhk_钥匙&run_id=上一步返回的run_id"`,
  ].join("\n")

  const jsText = [
    `const base = "${apiBaseForDocs}"`,
    `const token = "你的rhk_钥匙"`,
    ``,
    `// 1. 创建调用`,
    `const run = await fetch(base + "/run", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ token, input: "帮我总结这段文字…" }),`,
    `}).then((r) => r.json())`,
    ``,
    `// 2. 轮询到终态（每次 poll 会推进任务一步）`,
    `let res = { status: "running" }`,
    `while (res.status === "running") {`,
    `  await new Promise((r) => setTimeout(r, 2500))`,
    `  res = await fetch(\`\${base}/poll?token=\${token}&run_id=\${run.run_id}\`).then((r) => r.json())`,
    `}`,
    `console.log(res.status === "succeeded" ? res.result : res.error)`,
  ].join("\n")

  const activeText = docTab === "curl" ? curlText : jsText

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            接口调用说明
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">免登录公开接口，创建后轮询推进，返回事件与最终结果</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground sm:inline-flex">
          <Terminal className="h-3 w-3 text-primary" />
          POST run · GET poll
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDocTab("curl")}
          className={
            docTab === "curl"
              ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary"
              : "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
          }
        >
          cURL
        </button>
        <button
          type="button"
          onClick={() => setDocTab("js")}
          className={
            docTab === "js"
              ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary"
              : "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
          }
        >
          JavaScript
        </button>
        <button
          type="button"
          onClick={() => onCopy(`docs-${docTab}`, activeText)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copiedField === `docs-${docTab}` ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedField === `docs-${docTab}` ? "已复制" : "复制示例"}
        </button>
      </div>

      <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-secondary/60 p-4 font-mono text-xs leading-relaxed text-secondary-foreground">
        {activeText}
      </pre>

      <ul className="mt-3 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>· 响应字段：run 返回 <code className="rounded bg-secondary px-1 font-mono">run_id</code>；poll 返回 <code className="rounded bg-secondary px-1 font-mono">status / result / error / events / current_step / latency_ms</code></li>
        <li>· 限流：同一凭证每分钟最多 6 次、每天最多 200 次，超限返回 429 与 retry_after_s</li>
        <li>· 错误码：401 凭证无效或已吊销 · 404 运行与凭证不匹配 · 409 助手无已发布版本 · 429 触发限流</li>
        {!hasKey && <li className="text-destructive">· 当前还没有生效中的钥匙，请先在「API 调用钥匙」卡片创建</li>}
      </ul>
    </section>
  )
}
