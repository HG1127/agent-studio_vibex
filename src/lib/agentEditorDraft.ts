import type { AgentSpec } from "../pages/Home/presets"
import { normalizeAgentQualityChecks, QUALITY_CHECK_LIMIT } from "./agentQualityChecks.ts"
import {normalizeNativeHomeEditingContext,normalizeOriginalHomeBuiltinSelections,type NativeHomeEditingContext} from './originalHomeAgentEditor.ts'
import {normalizeOriginalHomeBindingOptions,type OriginalHomeBindingOptions} from './originalHomeResources.ts'

/**
 * Ephemeral draft in the current tab's sessionStorage, scoped by verified
 * employee UID. No auth token, password, model key, tool credential or secret
 * headers. This is a convenience copy, not a guaranteed server backup.
 */
export const AGENT_DRAFT_TTL_MS = 12 * 60 * 60 * 1000
export const AGENT_DRAFT_MAX_BYTES = 64_000
const PREFIX = "agent-studio:agent-draft:v1:"
type DraftBackend='pocketbase'|'native_pg'

export type AgentEditorDraft = {
  version: 1
  ownerId: string
  editedAt: number
  userInput: string
  spec: AgentSpec | null
  specName: string
  sourceMode: "create" | "template"
  templateKey: string
  editingRecordId: string
  serverUpdated: string
  backend?:'native_pg'
  nativePg?:NativeHomeEditingContext
  nativeOutcomeUnknown?:true
  nativeBindings?:OriginalHomeBindingOptions
  nativeBuiltinSelections?:string[]
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : ""
const texts = (value: unknown, maxItems = 40, maxChars = 1600): string[] =>
  Array.isArray(value) ? value.slice(0, maxItems).filter(v => typeof v === "string")
    .map(v => (v as string).slice(0, maxChars)) : []

// Local recovery must never weaken a plan by removing required steps,
// acceptance criteria, access or approvals.
const fitsDraftText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max
const fitsDraftList = (value: unknown, maxItems: number, maxChars: number) =>
  value === undefined || (Array.isArray(value) && value.length <= maxItems &&
    value.every(item => fitsDraftText(item, maxChars)))

/** Intentional allowlist; unknown fields and arbitrary secrets are excluded. */
export function sanitizeAgentDraftSpec(input: unknown, nativePg = false): AgentSpec | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  if ((raw.goal !== undefined && !fitsDraftText(raw.goal, 6000)) ||
      (raw.task_scope !== undefined && !fitsDraftText(raw.task_scope, 6000)) ||
      !fitsDraftList(raw.deliverables, 40, 1600) ||
      !fitsDraftList(raw.tools, nativePg ? 40 : 32, nativePg ? 300 : 180) ||
      // PB tool IDs stay exact. Native picker text also contains original
      // descriptive requirements; preserve their padding. Actual execution
      // IDs are independently validated in nativePg/nativeBindings below.
      (Array.isArray(raw.tools) && raw.tools.some(tool => typeof tool !== "string" ||
        !tool.trim() || (!nativePg && tool !== tool.trim()) || /[\u0000-\u001f\u007f]/.test(tool))) ||
      !fitsDraftList(raw.task_plan, 40, 1600) ||
      !fitsDraftList(raw.done_criteria, 40, 1600) ||
      !fitsDraftList(raw.knowledge_base_ids, 10, 100) ||
      // Preserve exact owner ACL binding IDs in recovered drafts; never
      // restore invisible/padded aliases as if they were usable permissions.
      (Array.isArray(raw.knowledge_base_ids) && raw.knowledge_base_ids.some(id =>
        typeof id !== "string" || !id.trim() || id !== id.trim() ||
        /[\u0000-\u001f\u007f]/.test(id))) ||
      (raw.require_approval !== undefined && typeof raw.require_approval !== "boolean") ||
      (raw.require_plan_review !== undefined && typeof raw.require_plan_review !== "boolean")) {
    return null
  }
  const result: AgentSpec = {
    goal: text(raw.goal, 6000),
    task_scope: text(raw.task_scope, 6000),
    deliverables: texts(raw.deliverables),
    tools: texts(raw.tools, nativePg ? 40 : 32, nativePg ? 300 : 180),
    task_plan: texts(raw.task_plan),
    done_criteria: texts(raw.done_criteria),
    knowledge_base_ids: texts(raw.knowledge_base_ids, 10, 100),
    require_approval: raw.require_approval === true,
    require_plan_review: raw.require_plan_review === true,
  }
  if (raw.quality_checks !== undefined) {
    // Local recovery cannot silently drop/truncate a saved acceptance rule:
    // that could make a later publish appear to satisfy a weaker plan.
    if (!Array.isArray(raw.quality_checks) ||
        raw.quality_checks.length > QUALITY_CHECK_LIMIT) return null
    const checks = normalizeAgentQualityChecks(raw.quality_checks)
    if (checks.length !== raw.quality_checks.length) return null
    result.quality_checks = checks
  }
  if(raw.capability_requirements!==undefined){if(!fitsDraftList(raw.capability_requirements,30,100))return null;result.capability_requirements=[...(raw.capability_requirements as string[])]}
  if(raw._studio_authoring!==undefined){const ref=raw._studio_authoring as {request_id?:unknown};if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).length!==1||typeof ref.request_id!=='string'||!/^[A-Za-z0-9]{20}$/.test(ref.request_id))return null;result._studio_authoring={request_id:ref.request_id}}
  return result
}

export function normalizeAgentDraft(
  value: unknown, ownerId: string, now = Date.now(),
): AgentEditorDraft | null {
  if (!ownerId || !value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || raw.ownerId !== ownerId) return null
  if(raw.backend!==undefined&&raw.backend!=='native_pg')return null
  const nativePg=raw.backend==='native_pg'
  const editedAt = Number(raw.editedAt)
  if (!Number.isFinite(editedAt) || editedAt > now + 60_000 ||
      editedAt < now - AGENT_DRAFT_TTL_MS) return null
  const spec = sanitizeAgentDraftSpec(raw.spec,nativePg)
  // Older stored drafts are untrusted too: do not display a corrupted saved
  // Agent as a harmless requirement-only draft with missing approval flags.
  if (raw.spec != null && !spec) return null
  // User requirements are part of the approval/acceptance intent. Never
  // silently truncate an oversized draft or erase non-text requirements.
  if (raw.userInput !== undefined && !fitsDraftText(raw.userInput, 12_000)) return null
  // Saved-record identity/version and source mode are part of the editing intent.
  // Never trim a long ID/version or erase an unexpected imported type into a
  // different record/create flow when recovering a local draft.
  if (spec && (
    (raw.specName !== undefined && !fitsDraftText(raw.specName, 120)) ||
    (raw.templateKey !== undefined && !fitsDraftText(raw.templateKey, 64)) ||
    (raw.editingRecordId !== undefined && !fitsDraftText(raw.editingRecordId, 60)) ||
    (raw.serverUpdated !== undefined && !fitsDraftText(raw.serverUpdated, 80)) ||
    (raw.sourceMode !== undefined && raw.sourceMode !== "create" && raw.sourceMode !== "template")
  )) return null
  const userInput = text(raw.userInput, 12_000)
  if (!spec && !userInput.trim()) return null
  let nativeContext:NativeHomeEditingContext|undefined
  if(raw.nativePg!==undefined){
    if(!nativePg||!spec)return null
    try{nativeContext=normalizeNativeHomeEditingContext(raw.nativePg)}catch{return null}
    if(nativeContext.id!==raw.editingRecordId)return null
  }
  if(raw.nativeOutcomeUnknown!==undefined&&(!nativePg||raw.nativeOutcomeUnknown!==true||!spec))return null
  let nativeBindings:OriginalHomeBindingOptions|undefined
  if(raw.nativeBindings!==undefined){
    if(!nativePg||!spec)return null
    try{nativeBindings=normalizeOriginalHomeBindingOptions(raw.nativeBindings)}catch{return null}
    if([...nativeBindings.http,...nativeBindings.mcp].some(v=>!spec.tools.includes(v.name)))return null
  }
  let nativeBuiltinSelections:string[]|undefined
  if(raw.nativeBuiltinSelections!==undefined){
    if(!nativePg||!spec)return null
    try{nativeBuiltinSelections=normalizeOriginalHomeBuiltinSelections(raw.nativeBuiltinSelections)}catch{return null}
    if(nativeBuiltinSelections.some(v=>!spec.tools.includes(v)))return null
  }
  return {
    version: 1,
    ownerId,
    editedAt,
    userInput,
    spec,
    // A requirement-only draft must never masquerade as a saved Agent.
    specName: spec ? text(raw.specName, 120) : "",
    sourceMode: spec && raw.sourceMode === "template" ? "template" : "create",
    templateKey: spec ? text(raw.templateKey, 64) : "",
    editingRecordId: spec ? text(raw.editingRecordId, 60) : "",
    serverUpdated: spec ? text(raw.serverUpdated, 80) : "",
    ...(nativePg?{backend:'native_pg' as const}:{}),
    ...(nativeContext?{nativePg:nativeContext}:{}),
    ...(raw.nativeOutcomeUnknown===true?{nativeOutcomeUnknown:true as const}:{}),
    ...(nativeBindings?{nativeBindings}:{}),
    ...(nativeBuiltinSelections?{nativeBuiltinSelections}:{}),
  }
}

export function agentDraftKey(ownerId: string,backend:DraftBackend='pocketbase'): string {
  // PocketBase UID, not emails or access tokens, should identify the local tab.
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(ownerId)) return ""
  return (backend==='native_pg'?'agent-studio:agent-draft:native-pg:v1:':PREFIX) + ownerId
}

export function readAgentDraft(ownerId: string, now = Date.now(),backend:DraftBackend='pocketbase'): AgentEditorDraft | null {
  const key = agentDraftKey(ownerId,backend)
  if (!key || typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw || raw.length > AGENT_DRAFT_MAX_BYTES) return null
    const value=JSON.parse(raw)
    if((value?.backend==='native_pg')!==(backend==='native_pg'))return null
    return normalizeAgentDraft(value, ownerId, now)
  } catch { return null }
}

export function saveAgentDraft(ownerId: string, draft: AgentEditorDraft,backend:DraftBackend='pocketbase'): boolean {
  const key = agentDraftKey(ownerId,backend)
  if (!key || typeof sessionStorage === "undefined") return false
  if((draft.backend==='native_pg')!==(backend==='native_pg'))return false
  const safe = normalizeAgentDraft({...draft,editedAt:Date.now()}, ownerId)
  if (!safe) return false
  // An invalid imported spec must not be persisted as a requirement-only draft
  // with its quality checks silently gone. Keep the previous draft intact.
  if (draft.spec != null && !safe.spec) return false
  try {
    const serialized = JSON.stringify(safe)
    if (serialized.length > AGENT_DRAFT_MAX_BYTES) return false
    sessionStorage.setItem(key, serialized)
    return true
  } catch { return false }
}

export function clearAgentDraft(ownerId: string,backend:DraftBackend='pocketbase'): void {
  const key = agentDraftKey(ownerId,backend)
  if (!key || typeof sessionStorage === "undefined") return
  try { sessionStorage.removeItem(key) } catch { /* storage disabled */ }
}
