import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import {
  nextScheduleTime, validTimeZone, zonedDateString, zonedDateTimeToEpoch,
  type ScheduleRule,
} from "@/lib/scheduleTime.js"
import {
  defaultScheduleForm, type ScheduleForm, type ScheduleHistory,
  type ScheduleTask, type Target, type TargetKind, type ModelConnection,
} from "./types"

async function api(path: string, method = "GET", payload?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(getPocketBaseUrl() + path, {
    method, headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (response.status === 401 || response.status === 412) throw new Error("请先登录，或刷新登录状态")
  if (!response.ok || result.error) throw new Error(String(result.message || result.error || "请求失败"))
  return result
}

function buildSchedule(form: ScheduleForm): { rule: ScheduleRule; nextAt: number } {
  if (!validTimeZone(form.time_zone)) throw new Error("请输入正确的 IANA 时区")
  const anchor = zonedDateTimeToEpoch(form.start_date, form.local_time, form.time_zone)
  const now = Date.now()
  const isCalendar = form.recurrence_kind === "daily" || form.recurrence_kind === "weekly"
  if (!isCalendar && anchor < now + 2000) throw new Error("首次执行时间需要晚于当前时间")
  const rule: ScheduleRule = {
    recurrence_kind: form.recurrence_kind,
    start_at_ms: isCalendar ? Math.max(anchor, now + 5000) : anchor,
    interval_minutes: form.interval_minutes, time_zone: form.time_zone,
    local_time: form.local_time, weekday: form.weekday,
  }
  const next = nextScheduleTime(rule, now)
  if (!Number.isSafeInteger(next) || next === null) throw new Error("无法计算下一次执行时间")
  return { rule, nextAt: next }
}

export function useScheduledTasks() {
  const [form, setForm] = useState<ScheduleForm>(defaultScheduleForm)
  const [editingId, setEditingId] = useState("")
  const [items, setItems] = useState<ScheduleTask[]>([])
  const [history, setHistory] = useState<ScheduleHistory[]>([])
  const [agents, setAgents] = useState<Target[]>([])
  const [workflows, setWorkflows] = useState<Target[]>([])
  const [models, setModels] = useState<ModelConnection[]>([])
  const [workerAlive, setWorkerAlive] = useState<boolean | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all")
  const [historyFilter, setHistoryFilter] = useState("")
  const [runPreview, setRunPreview] = useState<{
    id: string; name: string; kind: string; status: string; loading: boolean;
    result: string; error: string; events: number;
  } | null>(null)

  const setField = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }
  const targetOptions = form.target_kind === "agent" ? agents : workflows
  const modelOptions = models.find(m => m.id === form.model_connection_id)?.models || []

  const preview = useMemo(() => {
    try { return { ...buildSchedule(form), error: "" } }
    catch (e) { return { rule: null, nextAt: null, error: e instanceof Error ? e.message : "时间规则无效" } }
  }, [form])

  const nextOccurrences = useMemo(() => {
    if (!preview.rule || !preview.nextAt) return [] as number[]
    const result: number[] = [preview.nextAt]
    let after = preview.nextAt + 1000
    for (let i = 1; i < 5; i++) {
      const next = nextScheduleTime(preview.rule, after)
      if (next === null || !Number.isSafeInteger(next) || next <= after) break
      result.push(next)
      after = next + 1000
    }
    return result
  }, [preview])

  const refresh = useCallback(async () => {
    try {
      const [scheduleRes, agentsRes, flowRes, modelRes, workerRes] = await Promise.all([
        api("/api/schedules"), api("/api/agent_specs?perPage=200"),
        api("/api/workflow-studio/list"), api("/api/model-connections"),
        api("/api/worker/status"),
      ])
      setItems(Array.isArray(scheduleRes.items) ? scheduleRes.items as ScheduleTask[] : [])
      setHistory(Array.isArray(scheduleRes.history) ? scheduleRes.history as ScheduleHistory[] : [])
      setAgents((Array.isArray(agentsRes.items) ? agentsRes.items : []).map(
        (x: unknown) => ({ id: String((x as Target).id), name: String((x as Target).name || "未命名助手") }),
      ))
      setWorkflows((Array.isArray(flowRes.items) ? flowRes.items : []).map(
        (x: unknown) => ({ id: String((x as Target).id), name: String((x as Target).name || "未命名工作流") }),
      ))
      setModels(Array.isArray(modelRes.items) ? modelRes.items as ModelConnection[] : [])
      setWorkerAlive(Boolean(workerRes.enabled && workerRes.alive))
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "计划加载失败")
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(id)
  }, [refresh])
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !saving && !busyId) void refresh()
    }, 20000)
    return () => window.clearInterval(interval)
  }, [refresh, saving, busyId])

  const resetForm = () => { setEditingId(""); setForm(defaultScheduleForm()); setError(""); setNotice("") }
  const edit = (task: ScheduleTask) => {
    setEditingId(task.id)
    const anchor = task.start_at_ms > Date.now() ? task.start_at_ms : Math.max(Date.now() + 86400000, task.next_at_ms)
    setForm({
      name:task.name, target_kind:task.target_kind, target_id:task.target_id, instruction:task.instruction,
      recurrence_kind:task.recurrence_kind, time_zone:task.time_zone,
      start_date:zonedDateString(anchor,task.time_zone),local_time:task.local_time,
      weekday:task.weekday,interval_minutes:task.interval_minutes,model_connection_id:task.model_connection_id,
      model_id:task.model_id,max_steps:task.max_steps,
    })
    setNotice("");setError("")
    document.getElementById("schedule-editor")?.scrollIntoView({ behavior:"smooth",block:"start" })
    window.requestAnimationFrame(()=>{
      document.getElementById("schedule-plan-name")?.focus({preventScroll:true})
    })
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setError("");setNotice("")
    if (!form.name.trim() || !form.target_id || !form.instruction.trim()) { setError("请填写计划名称、执行对象和任务指令");return }
    if (form.target_kind === "agent" && (!form.model_connection_id || !form.model_id)) {
      setError("Agent 定时任务必须选择已启用的模型连接和模型");return
    }
    let timing: ReturnType<typeof buildSchedule>
    try { timing = buildSchedule(form) }
    catch(e) { setError(e instanceof Error ? e.message : "时间规则无效");return }
    setSaving(true)
    try {
      await api("/api/schedules/manage","POST",{
        action:editingId ? "update":"create",...(editingId ? {id:editingId}:{}),
        name:form.name.trim(),target_kind:form.target_kind,target_id:form.target_id,
        instruction:form.instruction.trim(),...timing.rule,next_at_ms:timing.nextAt,
        model_connection_id:form.model_connection_id,model_id:form.model_id,max_steps:form.max_steps,
      })
      await refresh()
      setForm(defaultScheduleForm());setEditingId("")
      setNotice("计划保存成功，后台执行器将在指定时间触发。")
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败") }
    finally { setSaving(false) }
  }

  const action = async (task: ScheduleTask, kind: "toggle" | "run_now" | "delete") => {
    if (busyId) return
    if (kind === "delete" && !window.confirm(`确认删除计划「${task.name}」？历史记录将保留。`)) return
    let payload: Record<string, unknown> = {action:kind,id:task.id}
    if (kind === "toggle") {
      if (!task.enabled && task.recurrence_kind==="once" && task.next_at_ms===0) {
        setError("单次任务已完成，请新建计划或编辑时间。");return
      }
      let nextAt=0
      if (!task.enabled) {
        try { nextAt=nextScheduleTime(task,Date.now())||0; if(!nextAt)throw Error("计划时间已过期，请编辑后启用") }
        catch (e) {setError(e instanceof Error?e.message:"请先编辑时间规则");return}
      }
      payload={...payload,enabled:!task.enabled,next_at_ms:nextAt}
    }
    setBusyId(task.id);setError("");setNotice("")
    try {
      const r=await api("/api/schedules/manage","POST",payload)
      await refresh()
      setNotice(kind==="delete"?"计划已删除":kind==="toggle"?(task.enabled?"计划已暂停":"计划已启用"):`已加入运行队列：${String(r.run_id||"")}`)
    } catch(e){setError(e instanceof Error?e.message:"操作失败")}
    finally {setBusyId("")}
  }

  const retryFailedLaunch = async (row: ScheduleHistory) => {
    if (busyId) return
    if (!window.confirm("仅重试尚未创建运行实例的任务启动。请确认该任务之前没有对外部系统产生副作用。")) return
    setBusyId(row.id);setError("");setNotice("")
    try {
      await api("/api/schedules/manage","POST",{
        action:"retry_failed_start",id:row.schedule_id,occurrence_id:row.id,
      })
      await refresh()
      setNotice("启动失败的任务已重新入队；由后台 Worker 安全地重新创建运行实例。")
    } catch(e){setError(e instanceof Error?e.message:"重新入队失败")}
    finally{setBusyId("")}
  }

  // Detail URLs are owner-checked on the server; deleted schedules can still inspect past runs.
  const viewRun = async (entry: ScheduleHistory) => {
    if (!entry.run_id) return
    const task = items.find(item => item.id === entry.schedule_id)
    const kinds: TargetKind[] = task ? [task.target_kind] : ["agent", "workflow"]
    const initial = {
      id: entry.run_id, name: task?.name || "历史计划", kind: task?.target_kind || "",
      status: entry.status, loading: true, result: "", error: "", events: 0,
    }
    setRunPreview(initial)
    let lastError = "运行详情不存在，或当前用户没有查看权限"
    for (const kind of kinds) {
      try {
        const path = kind === "agent"
          ? "/api/agent-runs/" + encodeURIComponent(entry.run_id) + "/detail"
          : "/api/workflow-runs/" + encodeURIComponent(entry.run_id) + "/detail"
        const response = await api(path)
        const run = (response.run || response) as Record<string, unknown>
        const preview = {
          id: entry.run_id, name: initial.name, kind,
          status: String(run.status || entry.status), loading: false,
          result: String(run.result || ""), error: String(run.error || ""),
          events: Array.isArray(response.events) ? response.events.length : 0,
        }
        setRunPreview(current => current?.id === entry.run_id ? preview : current)
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : "查看失败"
      }
    }
    setRunPreview(current => current?.id === entry.run_id
      ? { ...current, loading: false, error: lastError }
      : current)
  }

  return {
    form,setForm,setField,editingId,items,history,agents,workflows,models,
    workerAlive,initialLoading,saving,busyId,error,notice,
    setError,setNotice,filter,setFilter,historyFilter,setHistoryFilter,
    targetOptions,modelOptions,preview,nextOccurrences,refresh,resetForm,edit,save,action,retryFailedLaunch,
    runPreview,setRunPreview,viewRun,
  }
}
