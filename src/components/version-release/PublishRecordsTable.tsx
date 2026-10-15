import { ScrollText } from "lucide-react"
import type {
  SpecVersionRow,
  VersionStatusKey,
} from "@/pages/VersionRelease/useVersionRelease"

type PublishRecordsTableProps = {
  publishRecords: SpecVersionRow[]
  specDisplayName: string
  versionStatusMeta: Record<VersionStatusKey, { label: string; badge: string }>
  formatVersionTime: (iso: string) => string
}

export function PublishRecordsTable({
  publishRecords,
  specDisplayName,
  versionStatusMeta,
  formatVersionTime,
}: PublishRecordsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <ScrollText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-card-foreground">发布记录</h3>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
          {publishRecords.length}
        </span>
      </div>
      {publishRecords.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">
          还没有发布记录，发布一个版本后会显示在这里。
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">助手</th>
              <th className="px-5 py-2.5 font-medium">版本号</th>
              <th className="px-5 py-2.5 font-medium">发布时间</th>
              <th className="px-5 py-2.5 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {publishRecords.map((row) => {
              const meta = versionStatusMeta[row.status] || versionStatusMeta.archived
              return (
                <tr key={row.id} className="border-b border-border transition last:border-0 hover:bg-secondary/50">
                  <td className="px-5 py-3 text-card-foreground">{specDisplayName || row.config_snapshot?.name || "—"}</td>
                  <td className="px-5 py-3 font-semibold text-primary">v{row.version_no}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatVersionTime(row.published_at)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
