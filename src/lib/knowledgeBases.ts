import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

export type KnowledgeBase = {
  id: string
  name: string
  description: string
  created_ms: number
  updated_ms: number
  document_count: number
  chunk_count: number
  access_role?: "owner" | "viewer" | "editor"
  owner_uid?: string
  owner_name?: string
  semantic_allowed?: boolean
}

export type KnowledgeDocument = {
  id: string
  filename: string
  size_chars: number
  chunk_count: number
  created_ms: number
}

export type KnowledgeHit = {
  base_id: string
  document_id: string
  chunk_id: string
  filename: string
  chunk_index: number
  citation: string
  text: string
  score: number
  semantic_score?: number
}

export type EmbeddingSettings = {
  configured: boolean
  connection_id: string
  model_name: string
  updated_ms: number
}
export type EmbeddingStatus = {
  base_id: string
  configured: boolean
  model_name: string
  total_chunks: number
  indexed_chunks: number
  pending_chunks: number
  ready: boolean
  queued: boolean
  indexing: boolean
  retries: number
  last_error: string
  retry_at_ms: number
}
export type ModelConnectionForEmbedding = {
  id: string
  name: string
  enabled: boolean
  provider: string
}
export type KnowledgeSearchResponse = {
  items: KnowledgeHit[]
  total_matches: number
  retrieval: "lexical" | "semantic" | "hybrid"
  semantic_status?: "ready" | "partial" | "provider_error" | "not_configured" | "not_indexed" | "skipped" | "shared_lexical_only"
  semantic_error?: string
  semantic_indexed?: number
  semantic_total?: number
  shared_lexical_only?: boolean
  shared_semantic_used?: boolean
  candidate_limit_reached?: boolean
  scanned_candidates?: number
}

const KNOWLEDGE_ERRORS: Record<string, string> = {
  embedding_not_configured: "尚未配置 Embedding 模型，请先在语义检索设置中保存模型连接。",
  embedding_not_indexed: "当前知识库尚未完成向量索引，请稍候或先使用自动/关键词检索。",
  embedding_endpoint_unapproved: "该 Embedding 地址未获服务器管理员授权，请配置服务域名允许清单。",
  embedding_openai_compatible_required: "语义检索需要 OpenAI 兼容格式的 Embedding 模型连接。",
  embedding_provider_unreachable: "无法连接向量化模型服务，请检查网络或模型地址。",
  embedding_provider_rejected_key: "模型服务拒绝 API Key，请检查模型连接中的凭据。",
  embedding_provider_rate_limited: "模型服务当前限流，后台会延迟重试。",
  embedding_provider_failed: "Embedding 服务返回错误，请确认模型名称和供应商状态。",
  embedding_response_invalid: "Embedding 服务返回了无效格式，请核对向量模型接口。",
  embedding_dimensions_invalid: "Embedding 模型返回了不符合要求的向量维度。",
  embedding_dimensions_mismatch: "Embedding 向量维度不一致，需更正模型并重建索引。",
  embedding_index_failed: "本批次向量索引失败，可稍后重试。",
  embedding_rebuild_failed: "重建任务未能加入队列，请稍后重试。",
  embedding_status_failed: "无法读取索引状态，请检查服务并重试。",
  embedding_connection_invalid: "向量模型连接不完整或已失效。",
  embedding_batch_invalid: "每次只能建立 1～12 个片段的向量索引。",
  embedding_index_busy: "当前知识库正在建立向量索引，请等待该批次完成后再试。",
  custom_connection_missing: "所选模型连接已删除或不属于当前账号。",
  custom_connection_disabled: "所选模型连接已停用，请到模型连接中启用。",
  base_not_found: "知识库不存在或当前账号无权访问。",
  recipient_not_found: "员工未找到、已停用或不能授权给自己。",
  invalid_recipient_email: "请输入接收员工的正确工作邮箱。",
  invalid_access_role: "仅可授权 Viewer 或 Editor。",
  knowledge_share_limit: "每个知识库最多授权50位同事。",
  shared_semantic_owner_only: "共享知识库暂仅支持关键词检索，不会使用所有者的向量模型密钥。",
  shared_semantic_not_authorized: "知识库所有者尚未允许您使用共享语义检索。",
  shared_semantic_incompatible: "请配置与知识库所有者相同的 Embedding 模型及提供商接口，使用您自己的密钥进行查询。",
  embedding_config_changed: "检索期间向量配置发生变化，请重试。",
  invalid_semantic_choice: "请选择启用或关闭共享语义权限。",
}

export async function knowledgeApi<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(getPocketBaseUrl() + path, {
    method,
    headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || result.error) {
    if (response.status === 401 || response.status === 412) throw new Error("请先登录后管理知识库")
    const code = String(result.error || "")
    throw new Error(KNOWLEDGE_ERRORS[code] || String(result.message || code || "知识库操作失败"))
  }
  return result as T
}

export async function getKnowledgeBases(): Promise<KnowledgeBase[]> {
  const data = await knowledgeApi<{ items: KnowledgeBase[] }>("/api/knowledge-bases")
  return Array.isArray(data.items) ? data.items : []
}
