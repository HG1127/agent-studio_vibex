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
/** Strict calendar-aware timestamp for saved Agent and provider evidence.
 * Date.parse normalizes impossible dates (e.g. February 30) on some JS
 * engines; a fabricated timestamp must not unlock a model or publish gate.
 * PocketBase's space-separated UTC format remains supported.
 */
export function hasExplicitCalendarTimestamp(value:unknown):value is string {
  if(typeof value!=="string")return false
  const match=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i.exec(value)
  if(!match)return false
  const year=Number(match[1]), month=Number(match[2]), day=Number(match[3])
  const hour=Number(match[4]), minute=Number(match[5]), second=Number(match[6]??0)
  const leap=year%4===0&&(year%100!==0||year%400===0)
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31]
  return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&
    hour<=23&&minute<=59&&second<=59
}


export function normalizeAgentQualityChecks(input: unknown): AgentQualityCheck[] {
  // An oversized imported rule set is invalid in its entirety. Scanning it
  // before slicing can freeze the editor, while silently retaining a subset
  // could discard a mandatory acceptance condition before publishing.
  if(!Array.isArray(input) || input.length>QUALITY_CHECK_LIMIT)return []
  return input.flatMap(raw=>{
    if(!raw || typeof raw!=="object")return []
    const check=raw as {type?:unknown;expected?:unknown}
    // Persisted/imported rules bypass TypeScript. Coercing an object or number
    // to text (or silently truncating a long assertion) can make a different,
    // weaker condition appear to pass. Reject it so publishing stays blocked.
    if(typeof check.type!=="string" ||
        (check.expected!==undefined && typeof check.expected!=="string"))return []
    const type=check.type
    if(type!=="contains" && type!=="not_contains" && type!=="json_object")return []
    // Preserve exact literal substrings. Trimming an imported contains-rule
    // could make a stricter condition appear satisfied by unrelated output.
    const expected=typeof check.expected==="string" ? check.expected : ""
    // Hidden controls in a rule are invisible in the editor and can make a
    // negative-only assertion appear satisfied without testing its intended text.
    if(expected.length>200 || /[\u0000-\u001f\u007f]/.test(expected) ||
       (type!=="json_object" && !expected.trim()))return []
    // json_object only verifies parseability and top-level shape. An imported
    // non-empty expected value must not be silently discarded and represented
    // as an already-satisfied semantic/content requirement.
    if(type==="json_object" && expected)return []
    return [{type,expected}] as AgentQualityCheck[]
  }).slice(0,QUALITY_CHECK_LIMIT)
}
/** Saving imported rules must never silently drop one requirement. The
 * normalizer can filter invalid rows for display, but it is not a write gate.
 */
export function isCompleteAgentQualityCheckSet(input: unknown): input is AgentQualityCheck[] {
  return Array.isArray(input) && input.length<=QUALITY_CHECK_LIMIT &&
    normalizeAgentQualityChecks(input).length===input.length
}
// Run-detail status is not proof of a current execution when its timestamps
// are missing, precede the saved revision, or come from the future. Keep the
// visible result gate consistent with the publish gate's five-minute skew.
export function isCurrentAgentQualityRun(savedAt: unknown, runAt: unknown,
  now: number = Date.now()): boolean {
  // Date.parse accepts date-only or timezone-free strings interpreted using
  // the viewer's local clock. They cannot prove the run followed this save;
  // mirror the publish gate's explicit timestamp+timezone requirement.
  if(!hasExplicitCalendarTimestamp(savedAt) || !hasExplicitCalendarTimestamp(runAt))return false
  const saved=Date.parse(savedAt), ran=Date.parse(runAt)
  return Number.isFinite(now) && Number.isFinite(saved) && Number.isFinite(ran) &&
    saved>0 && ran>=saved && saved<=now+5*60_000 && ran<=now+5*60_000
}

export function evaluateAgentQualityChecks(output:string,items:readonly AgentQualityCheck[]):AgentQualityResult[] {
  return items.map(check=>{
    // This evaluator is also used by the run-detail UI. Do not assume every
    // caller first normalized imported or stale assertions: an unknown type
    // must never fall through to the easier JSON-shape check and pass.
    if(!check || typeof check!=="object" ||
        (check.type!=="contains" && check.type!=="not_contains" && check.type!=="json_object") ||
        typeof check.expected!=="string" || check.expected.length>200 ||
        /[\u0000-\u001f\u007f]/.test(check.expected) ||
        (check.type==="json_object" ? check.expected!=="" : !check.expected.trim())){
      return {check,passed:false,note:"质量断言无效，请修正规则后重新试跑"}
    }
    // Run-detail views may receive corrupted or very large imported outputs,
    // bypassing the creation wizard's publish-size guard. Do not freeze the
    // editor on huge JSON or crash when the backend payload is not text.
    if(typeof output!=="string" || output.length>1_000_000){
      return {check,passed:false,
        note:"运行输出无效或过长，请在运行中心检查完整结果并重新试跑"}
    }
    // A negative-only assertion is vacuously true on an empty result. A
    // successful run with no substantive output is not evidence of quality.
    if(!output.trim()){
      return {check,passed:false,note:"运行输出为空，无法验证质量要求，请重新试跑"}
    }
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
