import type { AgentSpec } from "../pages/Home/presets"
import { sanitizeAgentRoles } from "./agentRoles.ts"
import { normalizeCapabilityRequirements } from "./agentCapabilityPlan.ts"

/**
 * Ephemeral draft in the current tab's sessionStorage, scoped by verified
 * employee UID. No auth token, password, model key, tool credential or secret
 * headers. This is a convenience copy, not a guaranteed server backup.
 */
export const AGENT_DRAFT_TTL_MS = 12 * 60 * 60 * 1000
export const AGENT_DRAFT_MAX_BYTES = 64_000
const PREFIX = "agent-studio:agent-draft:v1:"

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
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : ""
const texts = (value: unknown, maxItems = 40, maxChars = 1600): string[] =>
  Array.isArray(value) ? value.slice(0, maxItems).filter(v => typeof v === "string")
    .map(v => (v as string).slice(0, maxChars)) : []

/** Intentional allowlist; unknown fields and arbitrary secrets are excluded. */
export function sanitizeAgentDraftSpec(input: unknown): AgentSpec | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const result: AgentSpec = {
    goal: text(raw.goal, 6000),
    task_scope: text(raw.task_scope, 6000),
    deliverables: texts(raw.deliverables),
    tools: texts(raw.tools, 32, 180),
    task_plan: texts(raw.task_plan),
    done_criteria: texts(raw.done_criteria),
    knowledge_base_ids: texts(raw.knowledge_base_ids, 10, 100),
    require_approval: raw.require_approval === true,
    require_plan_review: raw.require_plan_review === true,
    roles: sanitizeAgentRoles(raw.roles),
    ...(Array.isArray(raw.capability_requirements)
      ? {capability_requirements: normalizeCapabilityRequirements(raw.capability_requirements)} : {}),
  }
  if (Array.isArray(raw.quality_checks)) {
    result.quality_checks = raw.quality_checks.slice(0, 12).flatMap(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const row = value as Record<string, unknown>
      if (row.type !== "contains" && row.type !== "not_contains" && row.type !== "json_object") return []
      return [{ type: row.type, expected: text(row.expected, 200) }]
    })
  }
  return result
}

export function normalizeAgentDraft(
  value: unknown, ownerId: string, now = Date.now(),
): AgentEditorDraft | null {
  if (!ownerId || !value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || raw.ownerId !== ownerId) return null
  const editedAt = Number(raw.editedAt)
  if (!Number.isFinite(editedAt) || editedAt > now + 60_000 ||
      editedAt < now - AGENT_DRAFT_TTL_MS) return null
  const spec = sanitizeAgentDraftSpec(raw.spec)
  const userInput = text(raw.userInput, 12_000)
  if (!spec && !userInput.trim()) return null
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
  }
}

export function agentDraftKey(ownerId: string): string {
  // PocketBase UID, not emails or access tokens, should identify the local tab.
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(ownerId)) return ""
  return PREFIX + ownerId
}

export function readAgentDraft(ownerId: string, now = Date.now()): AgentEditorDraft | null {
  const key = agentDraftKey(ownerId)
  if (!key || typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw || raw.length > AGENT_DRAFT_MAX_BYTES) return null
    return normalizeAgentDraft(JSON.parse(raw), ownerId, now)
  } catch { return null }
}

export function saveAgentDraft(ownerId: string, draft: AgentEditorDraft): boolean {
  const key = agentDraftKey(ownerId)
  if (!key || typeof sessionStorage === "undefined") return false
  const safe = normalizeAgentDraft({...draft,editedAt:Date.now()}, ownerId)
  if (!safe) return false
  try {
    const serialized = JSON.stringify(safe)
    if (serialized.length > AGENT_DRAFT_MAX_BYTES) return false
    sessionStorage.setItem(key, serialized)
    return true
  } catch { return false }
}

export function clearAgentDraft(ownerId: string): void {
  const key = agentDraftKey(ownerId)
  if (!key || typeof sessionStorage === "undefined") return
  try { sessionStorage.removeItem(key) } catch { /* storage disabled */ }
}
