import { useCallback, useEffect, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { HARNESS_SOURCES, sourceFailure, type SourceKey, type SourceState } from "@/lib/harnessData"
import { HarnessAuthError, requestHarnessSource } from "@/lib/harnessRequest"

const keys = Object.keys(HARNESS_SOURCES) as SourceKey[]
const initial = () => Object.fromEntries(keys.map(key => [key, { loading: false }])) as Record<SourceKey, SourceState>
export function useHarness() {
  const [sources, setSources] = useState(initial)
  const [authRequired, setAuthRequired] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const blocked = useRef(false)
  const refresh = useCallback(async () => {
    if (blocked.current) return
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setSources(previous => Object.fromEntries(keys.map(key => [key, { ...previous[key], loading: true, error: undefined }])) as Record<SourceKey, SourceState>)
    const timer = window.setTimeout(() => current.abort("timeout"), 20000)
    await Promise.allSettled(keys.map(async key => {
      try {
        const data = await requestHarnessSource(key, getPocketBaseUrl(), vibexAuthHeaders(), current.signal)
        if (current.signal.aborted || controller.current !== current || blocked.current) return
        setSources(previous => ({ ...previous, [key]: { data, loadedAt: Date.now(), loading: false } }))
      } catch (error) {
        if (controller.current !== current || blocked.current) return
        if (error instanceof HarnessAuthError) {
          blocked.current = true
          current.abort()
          setAuthRequired(true)
          setSources(initial())
          return
        }
        if (current.signal.aborted && current.signal.reason !== "timeout") return
        const message = current.signal.reason === "timeout" ? "请求超时" : error instanceof Error && error.message.startsWith("HTTP") ? error.message : "请求失败或响应字段不完整"
        setSources(previous => ({ ...previous, [key]: sourceFailure(previous[key], message) }))
      }
    }))
    window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    void refresh()
    return () => { controller.current?.abort(); controller.current = null }
  }, [refresh])
  return { sources, authRequired, refresh, loading: keys.some(key => sources[key].loading) }
}
