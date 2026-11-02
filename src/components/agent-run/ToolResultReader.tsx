import { useRef, useState, useEffect } from 'react'
import {originalBusinessApi as localApi} from '@/lib/originalBusinessData'

type ResultPage = {
  result_id: string; text: string; field: string; offset: number; end: number
  total_length: number; has_more: boolean; content_hash: string; redacted: boolean
  coverage: { kind?: string; stored_complete?: boolean; upstream_completeness?: string }
}

/** Authenticated reads only; never execute provider HTML or follow resource URIs. */
export function ToolResultReader({ runId, resultId }: { runId: string; resultId: string }) {
  const [page, setPage] = useState<ResultPage | null>(null)
  const [field, setField] = useState('text')
  const [offset, setOffset] = useState('0')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    setPage(null);setError('');setLoading(false);setOffset('0');setField('text')
    return () => active.current?.abort()
  }, [runId, resultId])
  async function read(start: number, selected = field) {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setLoading(true); setError(''); setPage(null)
    try {
      const params = new URLSearchParams({ field: selected, offset: String(start), limit: '4000' })
      const value = await localApi<ResultPage>(`/api/agent-runs/${encodeURIComponent(runId)}/tool-results/${encodeURIComponent(resultId)}?${params}`, undefined, controller.signal)
      if (!controller.signal.aborted) { setPage(value); setOffset(String(value.offset)) }
    } catch {
      if (!controller.signal.aborted) setError('无法读取结果：请检查当前登录、来源权限和字符范围。')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  return <div className="mt-2 rounded-lg border border-border p-3 text-xs">
    <p className="break-all text-muted-foreground">持久结果 · {resultId} · 日志仅为摘要</p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label>读取字段 <select aria-label="结果字段" className="rounded border bg-background p-1" value={field} onChange={e => {
        active.current?.abort(); setLoading(false); setField(e.target.value); setPage(null); setOffset('0'); setError('')
      }}>
        <option value="text">正文</option><option value="structuredContent">结构化结果</option>
        <option value="content">原始内容块</option><option value="resources">资源引用</option>
      </select></label>
      <label>字符起点 <input aria-label="字符起点" className="w-24 rounded border bg-background p-1" type="number" min="0" step="1" value={offset} onChange={e => setOffset(e.target.value)} /></label>
      <button type="button" disabled={loading || !/^\d+$/.test(offset)} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => void read(Number(offset))}>
        {loading ? '读取中…' : '读取保存结果'}
      </button>
      {page?.has_more && <button type="button" className="rounded border px-2 py-1" onClick={() => void read(page.end)}>下一段</button>}
      {page && <button type="button" className="rounded border px-2 py-1" onClick={() => setPage(null)}>收起内容</button>}
    </div>
    {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    {page && <div aria-live="polite" className="mt-2">
      <p className="text-muted-foreground">范围 {page.offset}–{page.end} / {page.total_length}（UTF-16 字符）；{page.field === 'text' ? '原始工具文本' : 'JSON 字段分段，片段可能无法独立解析'}{page.redacted ? '；已脱敏' : ''}</p>
      <p className="mt-1 text-muted-foreground">覆盖：{page.coverage?.kind || '未知'}；上游完整性：{page.coverage?.upstream_completeness === 'unknown' ? '未确认' : page.coverage?.upstream_completeness || '未知'}。保存完整响应不代表已核查全部来源。</p>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2">{page.text}</pre>
    </div>}
  </div>
}
