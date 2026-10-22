// Public run-step metadata is a bounded allowlist, never arbitrary JSON.
// Worker-written metadata may evolve; unknown fields (including credentials,
// headers, raw prompts and provider response bodies) must not cross the API.
export function safeRunStepMetadata(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {}
  const value=raw as Record<string,unknown>
  const safe:Record<string,unknown>={}
  for(const key of ["stage","category","index","node_id","node_type",
    "execution_mode","knowledge_mode"]){
    const v=value[key]
    if(typeof v==="string"&&v.length<=160)safe[key]=v
  }
  for(const key of ["validation_only","external_effects_executed","checkpointed"]){
    const v=value[key]
    if(typeof v==="boolean")safe[key]=v
  }
  for(const key of ["output_chars","tool_calls"]){
    const v=value[key]
    if(Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=20000)safe[key]=v
  }
  if(value.branch==="true"||value.branch==="false")safe.branch=value.branch
  if(typeof value.parent_step_key==="string"&&/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$/.test(value.parent_step_key))safe.parent_step_key=value.parent_step_key
  if(Number.isSafeInteger(value.agent_round)&&Number(value.agent_round)>=1&&Number(value.agent_round)<=5)safe.agent_round=value.agent_round
  if(value.agent_phase==="model"||value.agent_phase==="tool")safe.agent_phase=value.agent_phase
  for(const key of ["round","total"]){
    const v=value[key]
    if(Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=20)safe[key]=v
  }
  if(Array.isArray(value.citations)){
    const citations=value.citations.filter((v):v is string=>
      typeof v==="string"&&v.length>0&&v.length<=400).slice(0,12)
    if(citations.length)safe.citations=citations
  }
  return safe
}
