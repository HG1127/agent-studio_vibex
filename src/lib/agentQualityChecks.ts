/**
 * Deterministic, inspectable pass/fail assertions for completed Agent runs.
 * This is intentionally NOT an AI-generated correctness score: checking that
 * text includes a phrase cannot prove the underlying claim is factually true.
 */
export type AgentQualityCheck = {
  type: "contains" | "not_contains" | "json_object"
  expected: string
}
export type AgentQualityResult = {
  check: AgentQualityCheck
  passed: boolean
  note: string
}
export const QUALITY_CHECK_LIMIT = 12

export function normalizeAgentQualityChecks(input: unknown): AgentQualityCheck[] {
  if(!Array.isArray(input))return []
  return input.flatMap(raw=>{
    if(!raw || typeof raw!=="object")return []
    const check=raw as {type?:unknown;expected?:unknown}
    const type=String(check.type||"")
    if(type!=="contains" && type!=="not_contains" && type!=="json_object")return []
    const expected=String(check.expected||"").trim().slice(0,200)
    if(type!=="json_object" && !expected)return []
    return [{type,expected}] as AgentQualityCheck[]
  }).slice(0,QUALITY_CHECK_LIMIT)
}
export function evaluateAgentQualityChecks(output:string,items:readonly AgentQualityCheck[]):AgentQualityResult[] {
  return items.map(check=>{
    if(check.type==="contains"){
      const passed=Boolean(check.expected)&&output.includes(check.expected)
      return {check,passed,note:passed?"包含指定文本":"结果中未找到指定文本"}
    }
    if(check.type==="not_contains"){
      const passed=Boolean(check.expected)&&!output.includes(check.expected)
      return {check,passed,note:passed?"未出现禁止文本":"结果中发现禁止文本"}
    }
    try {
      const obj:unknown=JSON.parse(output)
      const passed=!!obj && typeof obj==="object" && !Array.isArray(obj)
      return {check,passed,note:passed?"是有效 JSON 对象":"输出不是 JSON 对象"}
    }catch{
      return {check,passed:false,note:"无法解析为有效 JSON"}
    }
  })
}
