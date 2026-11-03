import { BookOpenCheck, ExternalLink, ShieldAlert } from "lucide-react"

type EvidenceRow = {
  type: "url" | "knowledge"
  locator: string
  excerpt: string
  step: number
  status: "retrieved"
}

function readEvidence(checkpoint: Record<string, unknown> | null | undefined): EvidenceRow[] {
  const values = checkpoint?.evidence_refs
  if (!Array.isArray(values)) return []
  return values.slice(-64).filter((item): item is EvidenceRow => {
    if (!item || typeof item !== "object") return false
    const candidate = item as Partial<EvidenceRow>
    return (candidate.type === "url" || candidate.type === "knowledge") &&
      typeof candidate.locator === "string" && candidate.locator.length > 0 &&
      candidate.locator.length <= 600 && typeof candidate.excerpt === "string"
  })
}

/** Survives compacted step history. References are retrieved, not fact-checked. */
export function EvidenceLedgerPanel({ checkpoint }: {
  checkpoint: Record<string, unknown> | null | undefined
}) {
  const refs = readEvidence(checkpoint)
  if (!refs.length) return null

  return (
    <details data-testid="harness-evidence-ledger"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-card-foreground">
        <span className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-primary" />
          已保留来源线索（{refs.length}）
        </span>
        <span className="text-xs font-normal text-muted-foreground">展开查看</span>
      </summary>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        来源由工具检索获得并随运行检查点保存；仅代表已检索，不代表事实已独立核验。
        此处保存引用及短摘录，不取代原始文件或完整网页归档。
      </p>
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {refs.map((ref, index) => {
          const safeUrl = ref.type === "url" &&
            /^https?:\/\/[^\s@]+$/i.test(ref.locator) ? ref.locator : null
          return (
            <li key={`${ref.type}-${ref.locator}-${index}`}
              className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{ref.type === "knowledge" ? "知识库引用" : "网页来源"} · 第 {ref.step} 步</span>
                <span>已检索 · 待核验</span>
              </div>
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-1 flex min-w-0 items-center gap-1 break-all text-xs font-medium text-primary hover:underline">
                  {ref.locator}<ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <p className="mt-1 break-all text-xs font-medium text-card-foreground">{ref.locator}</p>
              )}
              {ref.excerpt && (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {ref.excerpt}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
