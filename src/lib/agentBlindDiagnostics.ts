/** Human-readable descriptions of deterministic V28 structural checks. */
const LABELS: Record<string, string> = {
  invalid_json_or_schema: "模型没有输出可以识别的完整 Agent 方案",
  invalid_role_dependency_or_fields: "角色定义不完整，或角色依赖关系无效",
  role_count_out_of_expected_range: "模型安排的角色数量与任务复杂度要求不符",
  missing_core_spec_fields: "目标、任务范围、工作步骤或交付标准不完整",
  missing_write_capability: "任务需要写入能力，但方案没有声明",
  unrequested_write_capability: "只读任务中出现了未经请求的写入能力",
  model_suggested_role_grants_not_authorized: "模型试图直接授权角色使用工具，需要人工确认",
  model_omitted_required_approval: "包含写入操作，但未要求人工审批",
  invented_tool_ids_with_empty_catalog: "模型推荐了未经核实、目录中不存在的工具",
  generated_permissions_not_fail_closed: "方案准备阶段未正确清除未经授权的权限",
}
const KIND_LABELS: Record<string, string> = {
  web_search:"网页搜索",web_fetch:"网页读取",knowledge:"知识库",calculate:"计算",
  text:"文本处理",document:"文档处理",browser:"浏览器操作",desktop:"电脑操作",
  integration:"第三方系统",custom:"自定义工具",
}
export function explainBlindDiagnostic(code: string): string {
  const missing = code.match(/^missing_required_capability:([^:]+):(read|write)$/)
  if (missing) return `缺少必需能力：${KIND_LABELS[missing[1]] || "未识别工具"}（${missing[2] === "write" ? "写入" : "只读"}）`
  if (code.startsWith("invalid_capability_role_owner:"))
    return "必需工具能力未指定有效的负责角色"
  return LABELS[code] || "结构校验未通过，请检查方案及执行权限"
}
