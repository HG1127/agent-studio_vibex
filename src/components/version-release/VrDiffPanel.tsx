import { useMemo, useState } from "react"
import { GitCompareArrows } from "lucide-react"
import type { SpecVersionRow } from "@/pages/VersionRelease/useVersionRelease"

type DiffRow = {
  label: string
  aText: string
  bText: string
  changed: boolean
}

function specFieldText(value: unknown): string {
  if (value === null || value === undefined) return "（空）"
  if (Array.isArray(value)) return value.length ? value.join("、") : "（空）"
  const s = String(value).trim()
  return s || "（空）"
}

export function computeSpecDiff(
  a: SpecVersionRow["spec_snapshot"],
  b: SpecVersionRow["spec_snapshot"],
): DiffRow[] {
  const fields: { label: string; pick: (s: SpecVersionRow["spec_snapshot"]) => unknown }[] = [
    { label: "目标", pick: (s) => s?.goal },
    { label: "任务范围", pick: (s) => s?.task_scope },
    { label: "任务步骤", pick: (s) => s?.task_plan },
    { label: "交付物", pick: (s) => s?.deliverables },
    { label: "工具", pick: (s) => s?.tools },
    { label: "完成标准（停止条件）", pick: (s) => s?.done_criteria },
    { label: "知识库内容", pick: (s) => (s as unknown as Record<string, unknown> | null)?.knowledge },
  ]
  return fields.map((field) => {
    const aText = specFieldText(a ? field.pick(a) : null)
    const bText = specFieldText(b ? field.pick(b) : null)
    return { label: field.label, aText, bText, changed: aText !== bText }
  })
}

type VrDiffPanelProps = {
  versions: SpecVersionRow[]
  versionStatusMeta: Record<string, { label: string; badge: string }>
}

export function VrDiffPanel({ versions, versionStatusMeta }: VrDiffPanelProps) {
  const [diffAId, setDiffAId] = useState("")
  const [diffBId, setDiffBId] = useState("")
  const [showSameFields, setShowSameFields] = useState(false)

  const effectiveAId = diffAId || (versions[0] ? versions[0].id : "")
  const effectiveBId = diffBId || (versions[1] ? versions[1].id : "")
  const rowA = versions.find((row) => row.id === effectiveAId) || null
  const rowB = versions.find((row) => row.id === effectiveBId) || null

  const diffRows = useMemo(() => computeSpecDiff(rowA?.spec_snapshot || null, rowB?.spec_snapshot || null), [rowA, rowB])
  const changedCount = diffRows.filter((row) => row.changed).length
  const visibleRows = showSameFields ? diffRows : diffRows.filter((row) => row.changed)
  const sameCount = diffRows.length - changedCount

  if (versions.length < 2) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-card-foreground">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          版本对比
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">至少保存两个版本后，可以在这里逐字段对比配置差异。</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-card-foreground">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          版本对比
        </h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {changedCount > 0 ? `${changedCount} 处差异` : "两个版本配置完全一致"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-card-foreground">版本 A（旧基准）</span>
          <select
            value={effectiveAId}
            onChange={(ev) => setDiffAId(ev.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {versions.map((row) => (
              <option key={row.id} value={row.id}>
                v{row.version_no} · {versionStatusMeta[row.status]?.label || row.status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-card-foreground">版本 B（对比目标）</span>
          <select
            value={effectiveBId}
            onChange={(ev) => setDiffBId(ev.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {versions.map((row) => (
              <option key={row.id} value={row.id}>
                v{row.version_no} · {versionStatusMeta[row.status]?.label || row.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rowA && rowB && rowA.id === rowB.id ? (
        <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">请选择两个不同的版本进行对比。</p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[7rem_1fr_1fr] bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>字段</span>
              <span>v{rowA?.version_no}</span>
              <span>v{rowB?.version_no}</span>
            </div>
            {visibleRows.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">两个版本在这些字段上完全一致。</p>
            ) : (
              visibleRows.map((row) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[7rem_1fr_1fr] border-t border-border px-4 py-3 text-sm ${
                    row.changed ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="pr-2 font-medium text-card-foreground">{row.label}</span>
                  <span className={`break-words pr-3 ${row.changed ? "text-destructive" : "text-muted-foreground"}`}>
                    {row.aText}
                  </span>
                  <span className={`break-words ${row.changed ? "text-primary" : "text-muted-foreground"}`}>
                    {row.bText}
                  </span>
                </div>
              ))
            )}
          </div>
          {sameCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSameFields((prev) => !prev)}
              className="mt-3 text-sm font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              {showSameFields ? "收起相同字段" : `展开 ${sameCount} 个相同字段`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
