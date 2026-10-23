import { useEffect, useState } from 'react'
import { localApi, type LocalJob } from '@/lib/localDevices'

// Images are loaded only on request through the authenticated owner endpoint.
export function LocalJobObservation({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false)
  const [job, setJob] = useState<LocalJob | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setJob(null); setError('')
    void localApi<LocalJob>('/api/local-jobs/' + encodeURIComponent(jobId), undefined, controller.signal)
      .then(setJob).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [open, jobId])
  return <div className="mt-2">
    <button type="button" className="text-xs text-primary underline" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? '收起本地截图' : '查看本地截图'}
    </button>
    {open && <div className="mt-2 text-sm">
      {error ? <p role="alert">{error}</p> : !job ? <p>正在读取截图…</p> : !job.images?.length ? <p>这次操作没有返回截图。</p> :
        job.images.map((image, i) => <img key={i} alt="本地操作返回的截图" className="max-h-96 max-w-full rounded-lg object-contain"
          src={'data:' + image.mimeType + ';base64,' + image.data} />)}
    </div>}
  </div>
}
