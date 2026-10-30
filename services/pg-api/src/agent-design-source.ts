// Actual Native/Owner/source checks on the caller's original transaction.
// Pure material hashes are values; they do not replace any query below.
import {HttpError, safeAgentSpec, type Identity, type SqlClient, type SqlPool} from "./contracts.ts"
import {assertOwnedAdmissionContext, verifyAgentSpecResources, withActor} from "./repository.ts"
import {agentDesignCanonicalSpec, agentDesignResourceHash, prepareAgentDesignInput, prepareAgentDesignSourceValues} from "./agent-design-input.ts"
import {agentDesignId, agentDesignSha, agentDesignVersion, parseAgentDesignChoice, parseAgentDesignModelBinding, type AgentDesignPurpose, type AgentDesignRoleReference} from "./agent-design-contract.ts"
import {agentDesignObject, parseAgentDesignEditableFields, agentDesignDescriptionKeys} from "./agent-design-value-contract.ts"
import type {AgentDesignAuditVerifier} from "./agent-design-runtime-policy.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"

const unavailable = (): never => {throw new HttpError(409, "agent_design_source_unavailable")}
export function requireAgentDesignNative(identity: Identity): void {
  if (identity?.issuer !== "urn:agentstudio:local:v1") throw new HttpError(403, "native_employee_identity_required")
}
export type AgentDesignOwnerState = {owner_user_id: string; governance_revision: number; epoch: number}
type Selection = {purpose: AgentDesignPurpose; model_binding: ReturnType<typeof parseAgentDesignModelBinding>; source: AgentDesignRoleReference | null}
type RoleRow = {id: string; owner_user_id: string; name: string; spec: unknown; revision: unknown; source_sha256: string}
type ModelRow = {owner_user_id: string; revision: unknown; models: unknown; provider: "openai" | "anthropic" | "gemini"; base_url: string; enabled: boolean; status: string}
function version(raw: unknown): number {
  if (typeof raw === "string" && /^[1-9][0-9]*$/.test(raw)) return agentDesignVersion(Number(raw))
  return agentDesignVersion(raw)
}
export class AgentDesignSourceRepository {
  readonly pool: SqlPool; readonly audit?: AgentDesignAuditVerifier
  constructor(pool: SqlPool, audit?: AgentDesignAuditVerifier) {this.pool = pool; this.audit = audit}
  async contextOnClient(identity: Identity, db: SqlClient, owner: string): Promise<AgentDesignOwnerState> {
    requireAgentDesignNative(identity)
    await assertOwnedAdmissionContext(db, owner)
    if (!this.audit || !await this.audit(db)) throw new HttpError(409, "agent_design_schema_required")
    const raw = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_owner_state() AS value")).rows[0]?.value
    const v = agentDesignObject(raw, ["owner_user_id", "governance_revision", "epoch"])
    if (v.owner_user_id !== owner) throw new HttpError(403, "native_employee_identity_required")
    const governance = version(v.governance_revision), epoch = version(v.epoch)
    if (epoch !== governance) return unavailable()
    return {owner_user_id: agentDesignId(owner), governance_revision: governance, epoch}
  }
  private async role(db: SqlClient, owner: string, id: string, mode: "share" | "update" = "share") {
    // Save begins with an exclusive row lock; it never upgrades a shared one.
    const row = (await db.query<RoleRow>("SELECT id,owner_user_id,name,spec,revision,agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS source_sha256 FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR " + (mode === "update" ? "UPDATE" : "SHARE"), [id, owner])).rows[0]
    if (!row || row.id !== id || row.owner_user_id !== owner) throw new HttpError(404, "agent_spec_not_found")
    let spec: ReturnType<typeof agentDesignCanonicalSpec>
    try {spec = agentDesignCanonicalSpec(row.spec)} catch {return unavailable()}
    await verifyAgentSpecResources(db, owner, spec)
    return {spec_id: id, owner_user_id: owner, name: row.name, spec, revision: version(row.revision), source_sha256: agentDesignSha(row.source_sha256)}
  }
  async reference(identity: Identity, rawId: unknown) {
    requireAgentDesignNative(identity); const id = agentDesignId(rawId)
    return withActor(this.pool, identity, async (db, owner) => {
      await this.contextOnClient(identity, db, owner)
      const role = await this.role(db, owner, id)
      return {protocol: "agent_design_source_v1" as const, source: {spec_id: id, revision: role.revision, source_sha256: role.source_sha256},
        fields: parseAgentDesignEditableFields({name: role.name, ...Object.fromEntries(agentDesignDescriptionKeys.map(k => [k, role.spec[k]]))}), recorded: false as const}
    })
  }
  private async material(identity: Identity, db: SqlClient, owner: string, selection: Selection, mode: "share" | "update" = "share") {
    const state = await this.contextOnClient(identity, db, owner)
    const role = selection.source ? await this.role(db, owner, selection.source.spec_id, mode) : null
    if (selection.source && (!role || role.revision !== selection.source.revision || role.source_sha256 !== selection.source.source_sha256)) return unavailable()
    const binding = selection.model_binding
    const model = (await db.query<ModelRow>("SELECT owner_user_id,revision,models,provider,base_url,enabled,status FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE", [binding.connection_id, owner])).rows[0]
    if (!model || model.owner_user_id !== owner || version(model.revision) !== binding.connection_revision || model.enabled !== true || model.status !== "ok") return unavailable()
    if (!Array.isArray(model.models) || !model.models.includes(binding.model_id)) return unavailable()
    try {exactProviderEndpoint(model)} catch {return unavailable()}
    const resourceSpec = role?.spec ?? safeAgentSpec({goal: "Resource selection validation", tools: [], knowledge_base_ids: []})
    return {owner: {user_id: owner, governance_revision: state.governance_revision, epoch: state.epoch}, role,
      model: {owner_user_id: owner, binding, models: model.models, provider: model.provider, base_url: model.base_url, enabled: model.enabled, status: model.status}, resources_sha256: agentDesignResourceHash(resourceSpec)}
  }
  async prepareOnClient(identity: Identity, db: SqlClient, owner: string, rawChoice: unknown) {
    const choice = parseAgentDesignChoice(rawChoice), material = await this.material(identity, db, owner, choice)
    const prepared = prepareAgentDesignInput(choice, material)
    return {...prepared, choice, owner_user_id: owner, owner_governance_revision: material.owner.governance_revision, owner_epoch: material.owner.epoch}
  }
  async currentOnClient(identity: Identity, db: SqlClient, owner: string, rawSelection: unknown, mode: "share" | "update" = "share") {
    const v = agentDesignObject(rawSelection, ["purpose", "model_binding", "source"])
    if (v.purpose !== "generate" && v.purpose !== "revise") return unavailable()
    let source: AgentDesignRoleReference | null = null
    if (v.source !== null) {const s = agentDesignObject(v.source, ["spec_id", "revision", "source_sha256"]); source = {spec_id: agentDesignId(s.spec_id), revision: version(s.revision), source_sha256: agentDesignSha(s.source_sha256)}}
    if ((v.purpose === "generate") !== (source === null)) return unavailable()
    const selection: Selection = {purpose: v.purpose, model_binding: parseAgentDesignModelBinding(v.model_binding), source}
    return prepareAgentDesignSourceValues(selection, await this.material(identity, db, owner, selection, mode))
  }
  async preview(identity: Identity, rawChoice: unknown) {
    requireAgentDesignNative(identity)
    return withActor(this.pool, identity, (db, owner) => this.prepareOnClient(identity, db, owner, rawChoice))
  }
}
export type AgentDesignPrepared = Awaited<ReturnType<AgentDesignSourceRepository["prepareOnClient"]>>
